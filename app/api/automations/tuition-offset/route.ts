import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: object) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
}

export async function GET(_req: NextRequest) {
  try {
    const { data } = await supabaseAdmin
      .from('parents')
      .select('id, name, salary_gross')
      .gt('salary_gross', 0)
      .eq('deduct_tuition', true)
      .order('name')
    return Response.json(data ?? [])
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { dryRun = false, parentId, monthYear } = await req.json()

  const today = new Date()
  const targetMY: string =
    monthYear ||
    `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  const [tm, ty] = targetMY.split('/')

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)
      const actions: object[] = []
      let totalOffset = 0

      try {
        // Step 1 — query
        e({ type: 'step', step: 1, msg: 'מחפש הורים עם שכ"ל פתוח...' })
        let q = supabaseAdmin
          .from('parents')
          .select('id, name, salary_gross, tuition_balance')
          .gt('salary_gross', 0)
          .eq('deduct_tuition', true)
        if (parentId) q = q.eq('id', parentId)
        const { data: parents } = await q

        // Fetch wife salaries for all parents
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

        e({ type: 'step', step: 1, msg: `נמצאו ${(parents ?? []).length} הורים עם משכורת` })

        // Step 2 — calculate
        e({ type: 'step', step: 2, msg: 'מחשב קיזוזים...' })

        for (const parent of parents ?? []) {
          const salary = (Number(parent.salary_gross) || 0) + (wifeSalaryMap[parent.id] || 0)

          const { data: pps } = await supabaseAdmin
            .from('planned_payments')
            .select('id, amount, balance')
            .contains('parent_ids', [parent.id])
            .eq('month_year', targetMY)
            .eq('pp_type', 'tuition')
            .gt('balance', 0)
            .limit(1)

          const pp = pps?.[0]

          if (!pp) {
            e({ type: 'progress', parentName: parent.name, skipped: true, reason: 'אין תשלום מתוכנן פתוח' })
            actions.push({ parentId: parent.id, parentName: parent.name, skipped: true, reason: 'אין תשלום מתוכנן פתוח' })
            continue
          }

          // Idempotency: skip if an offset tx already exists for this parent+month
          const { data: existingOffsets } = await supabaseAdmin
            .from('transactions')
            .select('id')
            .contains('parent_ids', [parent.id])
            .eq('month_year', targetMY)
            .in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל'])
            .limit(1)
          if ((existingOffsets ?? []).length > 0) {
            e({ type: 'progress', parentName: parent.name, skipped: true, reason: 'קיזוז כבר קיים לחודש זה' })
            actions.push({ parentId: parent.id, parentName: parent.name, skipped: true, reason: 'קיזוז כבר קיים לחודש זה' })
            continue
          }

          const tuitionBalance = Number(pp.balance)
          const offset = Math.min(salary, tuitionBalance)

          if (offset <= 0) {
            e({ type: 'progress', parentName: parent.name, skipped: true, reason: 'סכום קיזוז 0' })
            actions.push({ parentId: parent.id, parentName: parent.name, salary, tuitionBalance, offset: 0, skipped: true, reason: 'סכום קיזוז 0' })
            continue
          }

          e({ type: 'progress', parentName: parent.name, salary, tuitionBalance, offset, skipped: false })

          // Step 3 — action
          if (!dryRun) {
            e({ type: 'step', step: 3, msg: `יוצר תנועת קיזוז עבור ${parent.name}...` })
            await supabaseAdmin.from('transactions').insert({
              id:                 crypto.randomUUID(),
              amount:             offset,
              planned_payment_id: pp.id,
              parent_ids:         [parent.id],
              date:               today.toISOString().split('T')[0],
              month_year:         targetMY,
              notes:              'שולם שכ"ל מקיזוז משכורת',
              type:               'קיזוז שכ"ל',
              project_ids:        [],
              project_names:      [],
              synced_at:          '2099-12-31T23:59:59.999Z',
            })
            await supabaseAdmin.from('planned_payments')
              .update({ balance: tuitionBalance - offset })
              .eq('id', pp.id)
            await supabaseAdmin.from('parents')
              .update({ tuition_balance: (Number(parent.tuition_balance) || 0) - offset })
              .eq('id', parent.id)

            // Mirror on salary side: if a salary PP exists for this month,
            // record the ניכוי שכ"ל tx and reduce its balance (same single payment, two sides)
            const { data: salaryPPs } = await supabaseAdmin
              .from('planned_payments')
              .select('id, balance')
              .contains('parent_ids', [parent.id])
              .eq('month_year', targetMY)
              .eq('pp_type', 'salary')
              .limit(1)
            const salaryPP = salaryPPs?.[0]
            if (salaryPP) {
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
                  amount:             offset,
                  planned_payment_id: salaryPP.id,
                  parent_ids:         [parent.id],
                  date:               today.toISOString().split('T')[0],
                  month_year:         targetMY,
                  notes:              `ניכוי שכ"ל ₪${offset}`,
                  type:               'ניכוי שכ"ל',
                  project_ids:        [],
                  project_names:      [],
                  synced_at:          '2099-12-31T23:59:59.999Z',
                })
                await supabaseAdmin.from('planned_payments')
                  .update({ balance: Number(salaryPP.balance) - offset })
                  .eq('id', salaryPP.id)
              }
            }
          }

          totalOffset += offset
          actions.push({ parentId: parent.id, parentName: parent.name, ppId: pp.id, salary, tuitionBalance, offset, skipped: false })
        }

        const applied = (actions as { skipped: boolean }[]).filter(a => !a.skipped)

        if (!dryRun) {
          try {
            await supabaseAdmin.from('automation_logs').insert({
              id:            crypto.randomUUID(),
              automation_id: 'tuition-offset',
              run_at:        new Date().toISOString(),
              dry_run:       false,
              parent_id:     parentId ?? null,
              parent_name:   parentId ? ((parents ?? []).find((p: { id: string; name: string }) => p.id === parentId)?.name ?? null) : null,
              actions_count: applied.length,
              status:        'success',
              summary:       `קוזז ₪${totalOffset} עבור ${applied.length} הורים (${targetMY})`,
              details:       actions,
            })
          } catch { /* table may not exist yet */ }
        }

        e({ type: 'complete', applied: applied.length, skipped: actions.length - applied.length, totalOffset, dryRun, monthYear: targetMY, actions })
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
