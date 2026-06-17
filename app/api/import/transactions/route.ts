import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

interface ImportRow {
  parentId: string
  parentName: string
  amount: number          // signed (negative = expense)
  txType: string
  date: string            // YYYY-MM-DD
  monthYear: string       // MM/YYYY
  project: string
  notes: string
}

export async function POST(req: NextRequest) {
  try {
    const { rows, dryRun = false }: { rows: ImportRow[], dryRun: boolean } = await req.json()
    if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows required' }, { status: 400 })

    let imported = 0, skipped = 0
    const errors: string[] = []
    const preview: object[] = []

    for (const row of rows) {
      try {
        const { parentId, parentName, amount, txType, date, monthYear, project, notes } = row
        if (!amount || !date) { skipped++; continue }

        // Auto-link to tuition PP for בנין לדורות income
        let plannedPaymentId: string | null = null
        let ppType: 'tuition' | 'donation' | null = null

        if (amount > 0 && parentId) {
          const isTuition  = project === 'בנין לדורות'
          const isDonation = project === 'דמי מגבית'

          if (isTuition || isDonation) {
            ppType = isTuition ? 'tuition' : 'donation'
            const { data: pps } = await supabaseAdmin
              .from('planned_payments')
              .select('id, balance, month_year')
              .contains('parent_ids', [parentId])
              .eq('pp_type', ppType)
              .gt('balance', 0)
              .order('month_year', { ascending: true })

            if (pps && pps.length > 0) {
              const same = pps.find(p => p.month_year === monthYear)
              plannedPaymentId = (same ?? pps[0]).id
            }
          }
        }

        if (dryRun) {
          preview.push({ parentName, amount, txType, date, monthYear, project, plannedPaymentId })
          imported++
          continue
        }

        const id = crypto.randomUUID()
        const { error } = await supabaseAdmin.from('transactions').insert({
          id,
          amount,
          type:               txType,
          date,
          month_year:         monthYear,
          notes:              notes || '',
          parent_ids:         parentId ? [parentId] : [],
          project_ids:        [],
          project_names:      project ? [project] : [],
          planned_payment_id: plannedPaymentId,
          synced_at:          '2099-12-31T23:59:59.999Z',
        })
        if (error) throw error

        // Update linked PP balance
        if (plannedPaymentId && amount > 0) {
          const { data: pp } = await supabaseAdmin
            .from('planned_payments').select('balance, parent_ids')
            .eq('id', plannedPaymentId).single()
          if (pp) {
            const paid   = Math.abs(amount)
            const oldBal = Number(pp.balance) || 0
            const surplus = Math.max(0, paid - oldBal)
            await supabaseAdmin.from('planned_payments')
              .update({ balance: Math.max(0, oldBal - paid) })
              .eq('id', plannedPaymentId)

            // Carry surplus to next open PP
            if (surplus > 0 && pp.parent_ids?.length) {
              const pid = pp.parent_ids[0]
              const { data: nextPPs } = await supabaseAdmin
                .from('planned_payments')
                .select('id, balance')
                .contains('parent_ids', [pid])
                .gt('balance', 0)
                .neq('id', plannedPaymentId)
                .order('month_year', { ascending: true })
                .limit(1)
              if (nextPPs?.[0]) {
                await supabaseAdmin.from('planned_payments')
                  .update({ balance: Math.max(0, Number(nextPPs[0].balance) - surplus) })
                  .eq('id', nextPPs[0].id)
              }
            }
          }
        }

        // Update tuition_balance on parent for tuition income not linked to PP
        if (parentId && amount > 0 && ppType === 'tuition' && !plannedPaymentId) {
          const { data: parent } = await supabaseAdmin
            .from('parents').select('tuition_balance').eq('id', parentId).single()
          if (parent) {
            await supabaseAdmin.from('parents')
              .update({ tuition_balance: Math.max(0, (Number(parent.tuition_balance) || 0) - amount) })
              .eq('id', parentId)
          }
        }

        imported++
      } catch (e) {
        errors.push(String(e))
        skipped++
      }
    }

    return NextResponse.json({ imported, skipped, errors, preview: dryRun ? preview : undefined })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
