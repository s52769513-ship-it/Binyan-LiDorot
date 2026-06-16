import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { tuitionMonthForSalary } from '@/lib/months'

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: object) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
}

export async function GET(_req: NextRequest) {
  try {
    const { data } = await supabaseAdmin
      .from('parents')
      .select('id, name, salary_gross')
      .gt('salary_gross', 0)
      .order('name')
    return Response.json(data ?? [])
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

// Generate array of MM/YYYY strings from fromMY to toMY inclusive
function monthRange(fromMY: string, toMY: string): string[] {
  const parse = (my: string) => { const [m, y] = my.split('/'); return { m: Number(m), y: Number(y) } }
  const { m: fm, y: fy } = parse(fromMY)
  const { m: tm, y: ty } = parse(toMY)
  const months: string[] = []
  let m = fm, y = fy
  while (y < ty || (y === ty && m <= tm)) {
    months.push(`${String(m).padStart(2, '0')}/${y}`)
    m++; if (m > 12) { m = 1; y++ }
    if (months.length > 60) break // safety
  }
  return months
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { dryRun = false, parentId } = body

  // Support: single monthYear OR fromMonth+toMonth range OR monthYears array
  const today = new Date()
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const defaultMY = `${String(prev.getMonth() + 1).padStart(2, '0')}/${prev.getFullYear()}`

  let targetMonths: string[]
  if (Array.isArray(body.monthYears) && body.monthYears.length > 0) {
    targetMonths = body.monthYears
  } else if (body.fromMonth && body.toMonth) {
    targetMonths = monthRange(body.fromMonth, body.toMonth)
  } else {
    targetMonths = [body.monthYear || defaultMY]
  }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)
      const actions: object[] = []
      let totalCreated = 0
      let totalOffset = 0

      try {
        // Load parents once
        e({ type: 'step', step: 1, msg: `מחפש הורים עם משכורת...` })
        let q = supabaseAdmin.from('parents').select('id, name, salary_gross').gt('salary_gross', 0)
        if (parentId) q = q.eq('id', parentId)
        const { data: parents } = await q

        const parentIds = (parents ?? []).map((p: { id: string }) => p.id)
        const { data: womenRows } = parentIds.length > 0
          ? await supabaseAdmin.from('women').select('parent_ids, salary_gross').overlaps('parent_ids', parentIds)
          : { data: [] }

        const wifeSalaryMap: Record<string, number> = {}
        for (const w of womenRows ?? []) {
          const gross = Number(w.salary_gross) || 0
          for (const pid of (w.parent_ids as string[]) ?? []) {
            wifeSalaryMap[pid] = (wifeSalaryMap[pid] || 0) + gross
          }
        }
        e({ type: 'step', step: 1, msg: `נמצאו ${(parents ?? []).length} הורים — ${targetMonths.length} חודשים` })

        const totalSteps = (parents ?? []).length * targetMonths.length
        let stepIdx = 0

        for (const targetMY of targetMonths) {
          const [tm, ty] = targetMY.split('/')
          const targetDate = `${ty}-${tm.padStart(2, '0')}-01`

          e({ type: 'log', message: `--- חודש ${targetMY} ---` })

          for (const parent of parents ?? []) {
            stepIdx++
            e({ type: 'progress', current: stepIdx, total: totalSteps })

            const salary = (Number(parent.salary_gross) || 0) + (wifeSalaryMap[parent.id] || 0)

            const { data: existingPPs } = await supabaseAdmin
              .from('planned_payments')
              .select('id, amount, balance')
              .contains('parent_ids', [parent.id])
              .eq('month_year', targetMY)
              .eq('pp_type', 'salary')
              .limit(1)

            const existingPP = existingPPs?.[0]
            let ppId = existingPP?.id ?? null
            let ppCreated = false

            if (existingPP) {
              e({ type: 'log', message: `${parent.name} / ${targetMY}: PP קיים — דלג` })
            } else {
              if (!dryRun) {
                ppId = crypto.randomUUID()
                const { error } = await supabaseAdmin.from('planned_payments').insert({
                  id:         ppId,
                  name:       'משכורת',
                  pp_type:    'salary',
                  amount:     salary,
                  balance:    salary,
                  date:       targetDate,
                  month_year: targetMY,
                  parent_ids: [parent.id],
                  synced_at:  '2099-12-31T23:59:59.999Z',
                })
                if (error) { ppId = null }
                else { ppCreated = true; totalCreated++ }
              } else {
                ppCreated = true; totalCreated++
              }
              e({ type: 'log', message: `${parent.name} / ${targetMY}: נוצר PP ₪${salary}${dryRun ? ' [dry]' : ''}` })
            }

            // Offset search — שכ"ל מקוזז הוא של חודש T = S+1 (החודש הנוכחי מול משכורת חודש שעבר)
            const tuitionMY = tuitionMonthForSalary(targetMY)
            const { data: offsetTxs } = await supabaseAdmin
              .from('transactions')
              .select('id, amount')
              .contains('parent_ids', [parent.id])
              .eq('month_year', tuitionMY)
              .in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל'])

            const offsetTotal = (offsetTxs ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)

            if (offsetTotal > 0 && ppId && !dryRun) {
              // Idempotency: skip if a ניכוי שכ"ל tx already exists for this parent+month (חודש המשכורת S)
              const { data: existingDeduct } = await supabaseAdmin
                .from('transactions')
                .select('id')
                .contains('parent_ids', [parent.id])
                .eq('month_year', targetMY)
                .in('type', ['קיזוז משכר לימוד', 'ניכוי שכ"ל'])
                .limit(1)
              if ((existingDeduct ?? []).length === 0) {
                await supabaseAdmin.from('transactions').insert({
                  id:                 crypto.randomUUID(),
                  amount:             offsetTotal,
                  planned_payment_id: ppId,
                  parent_ids:         [parent.id],
                  date:               today.toISOString().split('T')[0],
                  month_year:         targetMY,
                  notes:              `ניכוי שכ"ל ₪${offsetTotal} (שכ"ל ${tuitionMY})`,
                  type:               'ניכוי שכ"ל',
                  project_ids:        [],
                  project_names:      [],
                  synced_at:          '2099-12-31T23:59:59.999Z',
                })
                const currentBalance = existingPP ? Number(existingPP.balance) : salary
                await supabaseAdmin.from('planned_payments')
                  .update({ balance: Math.max(0, currentBalance - offsetTotal) })
                  .eq('id', ppId)
                totalOffset += offsetTotal
              }
            }

            actions.push({ parentId: parent.id, parentName: parent.name, monthYear: targetMY, salary, ppCreated, ppExists: !!existingPP, offsetFound: offsetTotal, skipped: false })
          }
        }

        if (!dryRun) {
          try {
            await supabaseAdmin.from('automation_logs').insert({
              id: crypto.randomUUID(), automation_id: 'salary-pp',
              run_at: new Date().toISOString(), dry_run: false,
              actions_count: totalCreated, status: 'success',
              summary: `נוצרו ${totalCreated} PP משכורת ב-${targetMonths.length} חודשים, קוזז ₪${totalOffset}`,
              details: actions,
            })
          } catch { /* table may not exist yet */ }
        }

        const targetMY = targetMonths[targetMonths.length - 1]
        e({ type: 'complete', applied: totalCreated, skipped: actions.filter((a: { ppExists?: boolean }) => a.ppExists).length, totalOffset, totalCreated, dryRun, monthYear: targetMY, actions })
      } catch (err) {
        e({ type: 'error', error: (err as { message?: string })?.message ?? String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
