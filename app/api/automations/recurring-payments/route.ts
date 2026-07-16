import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function emit(ctrl: ReadableStreamDefaultController, enc: TextEncoder, ev: object) {
  ctrl.enqueue(enc.encode(JSON.stringify(ev) + '\n'))
}

function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** clamp charge_day to the month length; null → 1st. Returns "YYYY-MM-DD". */
function dueDateFor(monthYear: string, chargeDay: number | null): string {
  const [m, y] = monthYear.split('/').map(Number)
  const lastDay = new Date(y, m, 0).getDate()
  const day = chargeDay ? Math.min(Math.max(1, chargeDay), lastDay) : 1
  return `${y}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { dryRun = false, monthYear } = body
  const targetMY = monthYear || currentMY()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)
      try {
        e({ type: 'step', step: 1, msg: 'מחפש תשלומים קבועים פעילים...' })

        const { data: defs } = await supabaseAdmin
          .from('recurring_payments')
          .select('*')
          .eq('active', true)

        const defList = defs ?? []
        e({ type: 'step', step: 2, msg: `נמצאו ${defList.length} הגדרות — בודק הרצות קיימות...` })

        // Existing runs for this month → idempotency
        const { data: existingRuns } = await supabaseAdmin
          .from('recurring_payment_runs')
          .select('recurring_payment_id')
          .eq('month_year', targetMY)
        const existingSet = new Set((existingRuns ?? []).map(r => r.recurring_payment_id as string))

        let created = 0, skipped = 0
        const actions: object[] = []

        for (const def of defList) {
          const name = String(def.supplier_name ?? '')
          if (existingSet.has(def.id as string)) {
            e({ type: 'progress', supplierName: name, skipped: true, reason: 'הרצה קיימת' })
            actions.push({ supplierName: name, skipped: true })
            skipped++
            continue
          }
          if (!dryRun) {
            await supabaseAdmin.from('recurring_payment_runs').insert({
              id:                   crypto.randomUUID(),
              recurring_payment_id: def.id,
              parent_id:            def.parent_id,
              supplier_name:        name,
              month_year:           targetMY,
              due_date:             dueDateFor(targetMY, def.charge_day as number | null),
              amount_due:           Number(def.amount) || 0,
              amount_paid:          0,
              payment_method:       def.payment_method,
              bank:                 def.bank,
              status:               'open',
            })
          }
          e({ type: 'progress', supplierName: name, created: true, amount: Number(def.amount) || 0 })
          actions.push({ supplierName: name, created: true, amount: Number(def.amount) || 0 })
          created++
        }

        // Ensure a card-payment task exists (open) for this month
        if (!dryRun) {
          const { data: existingTask } = await supabaseAdmin
            .from('card_payment_tasks')
            .select('id')
            .eq('month_year', targetMY)
            .maybeSingle()
          if (!existingTask) {
            // default card owner from settings, if configured
            const { data: settings } = await supabaseAdmin
              .from('institution_settings').select('card_owner_parent_id').limit(1).maybeSingle()
            await supabaseAdmin.from('card_payment_tasks').insert({
              id:                   crypto.randomUUID(),
              month_year:           targetMY,
              card_owner_parent_id: settings?.card_owner_parent_id ?? null,
              status:               'open',
            })
          }

          try {
            await supabaseAdmin.from('automation_logs').insert({
              id:            crypto.randomUUID(),
              automation_id: 'recurring-payments',
              run_at:        new Date().toISOString(),
              dry_run:       false,
              actions_count: created,
              status:        'success',
              summary:       `תשלומים קבועים: נוצרו ${created} · דולגו ${skipped} (${targetMY})`,
              details:       { monthYear: targetMY, created, skipped },
            })
          } catch { /* best-effort */ }
        }

        e({ type: 'complete', applied: created, created, skipped, dryRun, monthYear: targetMY, actions })
        controller.close()
      } catch (err) {
        e({ type: 'error', error: String(err) })
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
