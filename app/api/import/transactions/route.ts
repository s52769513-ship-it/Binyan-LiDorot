import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { applyPaymentToParentPPs, findPaymentTarget } from '@/lib/ppPayments'

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

        // Auto-link to tuition PP for בנין לדורות income (shared cascade logic)
        const shouldLink = amount > 0 && !!parentId && project === 'בנין לדורות'

        if (dryRun) {
          const target = shouldLink ? await findPaymentTarget(parentId, monthYear) : null
          preview.push({ parentName, amount, txType, date, monthYear, project, plannedPaymentId: target?.ppId ?? null })
          imported++
          continue
        }

        let plannedPaymentId: string | null = null
        if (shouldLink) {
          plannedPaymentId = (await applyPaymentToParentPPs({
            parentId, amount, preferredMonthYear: monthYear,
          })).ppId
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
