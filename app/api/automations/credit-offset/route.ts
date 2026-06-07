import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: object) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
}

export async function POST(req: NextRequest) {
  const { dryRun = false, resetOnly = false, monthYear } = await req.json().catch(() => ({}))

  const today = new Date()
  const targetMY: string =
    monthYear || `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)
      const actions: object[] = []
      let totalOffset = 0

      try {
        if (resetOnly) {
          // Reset mode: zero out all credit balances without creating transactions
          e({ type: 'step', step: 1, msg: 'מאפס יתרות זיכוי...' })
          const { data: soRows } = await supabaseAdmin
            .from('standing_orders')
            .select('id, external_id, parent_id, credit_balance')
            .eq('standing_order_type', 'אשראי')
            .gt('credit_balance', 0)

          e({ type: 'step', step: 1, msg: `נמצאו ${(soRows ?? []).length} הו"ק עם יתרת זיכוי` })

          for (const so of soRows ?? []) {
            const balance = Number(so.credit_balance) || 0
            e({ type: 'progress', parentName: so.external_id, creditBalance: balance, action: 'אופס', skipped: false })
            if (!dryRun) {
              await supabaseAdmin.from('standing_orders').update({ credit_balance: 0 }).eq('id', so.id)
            }
            actions.push({ soId: so.id, externalId: so.external_id, creditBalance: balance, action: 'אופס', skipped: false })
          }

          e({ type: 'complete', applied: (soRows ?? []).length, skipped: 0, totalOffset: 0, dryRun, resetOnly: true, monthYear: targetMY, actions })
          return
        }

        // Normal mode: apply credit_balance to open tuition PP
        e({ type: 'step', step: 1, msg: 'מחפש הו"ק אשראי עם יתרת זיכוי...' })
        const { data: soRows } = await supabaseAdmin
          .from('standing_orders')
          .select('id, external_id, parent_id, linked_parent_id, credit_balance')
          .eq('standing_order_type', 'אשראי')
          .gt('credit_balance', 0)

        e({ type: 'step', step: 1, msg: `נמצאו ${(soRows ?? []).length} הו"ק עם יתרת זיכוי לחודש ${targetMY}` })

        for (const so of soRows ?? []) {
          const creditBalance = Number(so.credit_balance) || 0
          const billingParentId = so.linked_parent_id ?? so.parent_id

          if (!billingParentId) {
            e({ type: 'progress', parentName: so.external_id, skipped: true, reason: 'אין הורה משויך' })
            actions.push({ externalId: so.external_id, creditBalance, skipped: true, reason: 'אין הורה משויך' })
            continue
          }

          // Find open tuition PP for this parent in target month
          const { data: pps } = await supabaseAdmin
            .from('planned_payments')
            .select('id, amount, balance, month_year')
            .contains('parent_ids', [billingParentId])
            .eq('pp_type', 'tuition')
            .gt('balance', 0)
            .order('month_year', { ascending: true })

          const currentMonthPP = (pps ?? []).find(p => p.month_year === targetMY)
          const pp = currentMonthPP ?? pps?.[0] ?? null

          if (!pp) {
            e({ type: 'progress', parentName: so.external_id, skipped: true, reason: 'אין תשלום מתוכנן פתוח' })
            actions.push({ externalId: so.external_id, creditBalance, skipped: true, reason: 'אין תשלום מתוכנן פתוח' })
            continue
          }

          const ppBalance = Number(pp.balance)
          const offset = Math.min(creditBalance, ppBalance)

          if (offset <= 0) {
            e({ type: 'progress', parentName: so.external_id, skipped: true, reason: 'סכום קיזוז 0' })
            actions.push({ externalId: so.external_id, creditBalance, ppBalance, offset: 0, skipped: true, reason: 'סכום קיזוז 0' })
            continue
          }

          const payerParentIds: string[] = Array.from(new Set([
            so.parent_id,
            ...(so.linked_parent_id && so.linked_parent_id !== so.parent_id ? [so.linked_parent_id] : []),
          ].filter(Boolean) as string[]))

          e({ type: 'progress', parentName: so.external_id, creditBalance, ppBalance, offset, skipped: false })

          if (!dryRun) {
            await supabaseAdmin.from('transactions').insert({
              id:                 crypto.randomUUID(),
              amount:             offset,
              planned_payment_id: pp.id,
              parent_ids:         payerParentIds,
              date:               today.toISOString().split('T')[0],
              month_year:         pp.month_year,
              notes:              `קיזוז זיכוי אשראי הו"ק ${so.external_id}`,
              type:               'זיכוי שכ"ל',
              project_ids:        [],
              project_names:      [],
              synced_at:          '2099-12-31T23:59:59.999Z',
            })
            await supabaseAdmin.from('planned_payments')
              .update({ balance: Math.max(0, ppBalance - offset) })
              .eq('id', pp.id)
            // Reduce credit_balance by the applied amount
            await supabaseAdmin.from('standing_orders')
              .update({ credit_balance: Math.max(0, creditBalance - offset) })
              .eq('id', so.id)
          }

          totalOffset += offset
          actions.push({ externalId: so.external_id, soId: so.id, ppId: pp.id, creditBalance, ppBalance, offset, monthYear: pp.month_year, skipped: false })
        }

        const applied = (actions as { skipped: boolean }[]).filter(a => !a.skipped).length

        if (!dryRun && applied > 0) {
          await supabaseAdmin.from('automation_logs').insert({
            id:            crypto.randomUUID(),
            automation_id: 'credit-offset',
            run_at:        new Date().toISOString(),
            dry_run:       false,
            parent_id:     null,
            parent_name:   null,
            actions_count: applied,
            status:        'success',
            summary:       `קוזז ₪${totalOffset} זיכויי אשראי עבור ${applied} הו"ק (${targetMY})`,
            details:       actions,
          }).catch(() => {})
        }

        e({ type: 'complete', applied, skipped: actions.length - applied, totalOffset, dryRun, resetOnly: false, monthYear: targetMY, actions })
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
