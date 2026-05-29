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
      .order('name')
    return Response.json(data ?? [])
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { dryRun = false, parentId, monthYear } = await req.json()

  // Default: previous month
  const today = new Date()
  const prev = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  const targetMY: string =
    monthYear ||
    `${String(prev.getMonth() + 1).padStart(2, '0')}/${prev.getFullYear()}`
  const [tm, ty] = targetMY.split('/')
  const targetDate = `${ty}-${tm.padStart(2, '0')}-01`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)
      const actions: object[] = []
      let totalCreated = 0
      let totalOffset = 0

      try {
        // Step 1 — query parents
        e({ type: 'step', step: 1, msg: `מחפש הורים עם משכורת לחודש ${targetMY}...` })
        let q = supabaseAdmin
          .from('parents')
          .select('id, name, salary_gross')
          .gt('salary_gross', 0)
        if (parentId) q = q.eq('id', parentId)
        const { data: parents } = await q
        e({ type: 'step', step: 1, msg: `נמצאו ${(parents ?? []).length} הורים` })

        // Step 2 — check existing salary PPs
        e({ type: 'step', step: 2, msg: 'בודק תשלומים מתוכננים קיימים...' })

        for (const parent of parents ?? []) {
          const salary = Number(parent.salary_gross) || 0

          // Check if salary PP already exists for this month
          const { data: existingPPs } = await supabaseAdmin
            .from('planned_payments')
            .select('id, amount, balance')
            .contains('parent_ids', [parent.id])
            .eq('month_year', targetMY)
            .eq('name', 'משכורת')
            .limit(1)

          const existingPP = existingPPs?.[0]
          let ppId = existingPP?.id ?? null
          let ppCreated = false

          if (existingPP) {
            e({ type: 'progress', parentName: parent.name, salary, ppExists: true, skipped: false,
              msg: `PP משכורת קיים (₪${existingPP.amount})` })
          } else {
            // Step 3 — create salary PP
            e({ type: 'step', step: 3, msg: `יוצר PP משכורת עבור ${parent.name}...` })

            if (!dryRun) {
              ppId = crypto.randomUUID()
              const { error } = await supabaseAdmin.from('planned_payments').insert({
                id:         ppId,
                name:       'משכורת',
                amount:     salary,
                balance:    salary,
                date:       targetDate,
                month_year: targetMY,
                parent_ids: [parent.id],
                synced_at:  '2099-12-31T23:59:59.999Z',
              })
              if (error) { ppId = null; ppCreated = false }
              else { ppCreated = true; totalCreated++ }
            } else {
              ppCreated = true; totalCreated++
            }
          }

          // Step 4 — find tuition-offset transactions for this month
          e({ type: 'step', step: 4, msg: `מחפש קיזוזי שכ"ל של ${parent.name} לחודש ${targetMY}...` })
          const { data: offsetTxs } = await supabaseAdmin
            .from('transactions')
            .select('id, amount')
            .contains('parent_ids', [parent.id])
            .eq('month_year', targetMY)
            .eq('type', 'קיזוז ממשכורת')

          const offsetTotal = (offsetTxs ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)

          if (offsetTotal > 0 && ppId && !dryRun) {
            // Create salary-side offset transaction
            const salaryTxId = crypto.randomUUID()
            await supabaseAdmin.from('transactions').insert({
              id:                 salaryTxId,
              amount:             offsetTotal,
              planned_payment_id: ppId,
              parent_ids:         [parent.id],
              date:               today.toISOString().split('T')[0],
              month_year:         targetMY,
              notes:              'קיזוז משכר לימוד',
              type:               'קיזוז משכר לימוד',
              project_ids:        [],
              project_names:      [],
              synced_at:          '2099-12-31T23:59:59.999Z',
            })
            // Reduce salary PP balance
            const currentBalance = existingPP ? Number(existingPP.balance) : salary
            await supabaseAdmin.from('planned_payments')
              .update({ balance: Math.max(0, currentBalance - offsetTotal) })
              .eq('id', ppId)

            // Save to salary_offsets history table (silently ignore if missing)
            try {
              await supabaseAdmin.from('salary_offsets').insert({
                id:           crypto.randomUUID(),
                parent_id:    parent.id,
                parent_name:  parent.name,
                month_year:   targetMY,
                salary_gross: salary,
                offset_amount: offsetTotal,
                salary_pp_id: ppId,
                tuition_tx_ids: (offsetTxs ?? []).map((t: { id: string }) => t.id),
              })
            } catch { /* table may not exist yet */ }

            totalOffset += offsetTotal
          }

          e({
            type: 'progress',
            parentName: parent.name,
            salary,
            offsetFound: offsetTotal,
            ppCreated,
            ppExists: !!existingPP,
            skipped: false,
          })

          actions.push({
            parentId: parent.id,
            parentName: parent.name,
            salary,
            ppCreated,
            ppExists: !!existingPP,
            offsetFound: offsetTotal,
            skipped: false,
          })
        }

        if (!dryRun) {
          try {
            await supabaseAdmin.from('automation_logs').insert({
              id:            crypto.randomUUID(),
              automation_id: 'salary-pp',
              run_at:        new Date().toISOString(),
              dry_run:       false,
              parent_id:     parentId ?? null,
              parent_name:   parentId ? ((parents ?? []).find((p: { id: string; name: string }) => p.id === parentId)?.name ?? null) : null,
              actions_count: totalCreated,
              status:        'success',
              summary:       `נוצרו ${totalCreated} PP משכורת, קוזז ₪${totalOffset} (${targetMY})`,
              details:       actions,
            })
          } catch { /* table may not exist yet */ }
        }

        e({ type: 'complete', applied: totalCreated, skipped: (parents ?? []).length - actions.filter((a: { ppCreated?: boolean }) => a.ppCreated).length, totalOffset, totalCreated, dryRun, monthYear: targetMY, actions })
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
