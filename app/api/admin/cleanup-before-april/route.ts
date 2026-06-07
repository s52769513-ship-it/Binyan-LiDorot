import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * TEMPORARY — delete after use
 * POST /api/admin/cleanup-before-april
 * Body: { confirm: "DELETE_BEFORE_APRIL_2025" }
 * Deletes all planned_payments and transactions with date/month_year < 04/2025
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  if (body.confirm !== 'DELETE_BEFORE_APRIL_2025') {
    return NextResponse.json({ error: 'missing confirm' }, { status: 400 })
  }

  // Month-year strings that are before 04/2025
  // Format is MM/YYYY  e.g. "03/2025", "12/2024", ...
  // We'll delete where month_year is not null and (year < 2025 OR (year == 2025 AND month < 4))
  // Supabase doesn't support computed filters on MM/YYYY strings easily,
  // so we enumerate the cutoff using a list approach via lt on a normalized form.
  // Instead, we use: month_year is not null AND (
  //   month_year like '%/2024' OR month_year like '%/2023' OR ... OR
  //   month_year in ('01/2025','02/2025','03/2025')
  // )
  // Simpler: delete where date < '2025-04-01' for transactions,
  // and for PPs we derive from month_year.

  // Count first
  const [{ count: ppCount }, { count: txCount }] = await Promise.all([
    supabaseAdmin.from('planned_payments').select('id', { count: 'exact', head: true })
      .or('month_year.in.(01/2025,02/2025,03/2025,12/2024,11/2024,10/2024,09/2024,08/2024,07/2024,06/2024,05/2024,04/2024,03/2024,02/2024,01/2024,12/2023,11/2023,10/2023,09/2023,08/2023,07/2023,06/2023,05/2023,04/2023,03/2023,02/2023,01/2023)'),
    supabaseAdmin.from('transactions').select('id', { count: 'exact', head: true })
      .lt('date', '2025-04-01'),
  ])

  if (body.dryRun) {
    return NextResponse.json({ ppCount, txCount, dryRun: true })
  }

  // Delete transactions before April 2025
  const { error: txErr } = await supabaseAdmin
    .from('transactions')
    .delete()
    .lt('date', '2025-04-01')

  // Delete planned_payments with month_year before 04/2025
  const oldMonths = [
    '01/2025','02/2025','03/2025',
    '12/2024','11/2024','10/2024','09/2024','08/2024','07/2024','06/2024','05/2024','04/2024','03/2024','02/2024','01/2024',
    '12/2023','11/2023','10/2023','09/2023','08/2023','07/2023','06/2023','05/2023','04/2023','03/2023','02/2023','01/2023',
    '12/2022','11/2022','10/2022','09/2022','08/2022','07/2022','06/2022','05/2022','04/2022','03/2022','02/2022','01/2022',
  ]
  const { error: ppErr } = await supabaseAdmin
    .from('planned_payments')
    .delete()
    .in('month_year', oldMonths)

  if (txErr || ppErr) {
    return NextResponse.json({ error: txErr?.message ?? ppErr?.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, deletedPPs: ppCount, deletedTxs: txCount })
}
