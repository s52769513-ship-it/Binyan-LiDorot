import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcTuitionForParent } from '@/lib/recalcTuition'

function getFullHebrewYearMonths(): { monthYear: string; date: string }[] {
  const today    = new Date()
  const curMonth = today.getMonth() + 1
  const curYear  = today.getFullYear()
  const startYear = curMonth >= 9 ? curYear : curYear - 1
  const endYear   = startYear + 1
  const months: { monthYear: string; date: string }[] = []
  let m = 9, y = startYear
  while (true) {
    const mm = String(m).padStart(2, '0')
    months.push({ monthYear: `${mm}/${y}`, date: `${y}-${mm}-01` })
    if (m === 8 && y === endYear) break
    if (++m > 12) { m = 1; y++ }
  }
  return months
}

export async function POST() {
  try {
    const today = new Date()
    const currentMonthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

    // 1. Delete all open future tuition PPs (balance = amount — untouched)
    const { data: toDelete } = await supabaseAdmin
      .from('planned_payments')
      .select('id, amount, balance')
      .eq('pp_type', 'tuition')
      .gte('date', currentMonthDate)

    const deleteIds = (toDelete ?? [])
      .filter(pp => Number(pp.balance) === Number(pp.amount))  // fully unpaid only
      .map(pp => pp.id)

    let deleted = 0
    if (deleteIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('planned_payments')
        .delete()
        .in('id', deleteIds)
      if (error) throw error
      deleted = deleteIds.length
    }

    // 2. Recalculate tuition for all parents with active students
    const { data: parents } = await supabaseAdmin
      .from('parents')
      .select('id')

    const parentIds = (parents ?? []).map(p => p.id)
    for (const pid of parentIds) {
      await recalcTuitionForParent(pid)
    }

    // 3. Recreate PPs for the full Hebrew year (only parents with tuition > 0)
    const months     = getFullHebrewYearMonths()
    const monthYears = months.map(m => m.monthYear)

    const { data: activeParents } = await supabaseAdmin
      .from('parents')
      .select('id, tuition_total')
      .gt('tuition_total', 0)

    // Find what already exists (partially paid PPs we kept)
    const { data: existing } = await supabaseAdmin
      .from('planned_payments')
      .select('parent_ids, month_year')
      .eq('pp_type', 'tuition')
      .in('month_year', monthYears)

    const existingSet = new Set<string>()
    for (const pp of existing ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        existingSet.add(`${pid}|${pp.month_year}`)
      }
    }

    let created = 0
    for (const parent of activeParents ?? []) {
      const amount = Number(parent.tuition_total) || 0
      if (!amount) continue
      for (const { monthYear, date } of months) {
        if (existingSet.has(`${parent.id}|${monthYear}`)) continue
        const { error } = await supabaseAdmin.from('planned_payments').insert({
          id:         crypto.randomUUID(),
          name:       'שכ"ל',
          pp_type:    'tuition',
          amount,
          balance:    amount,
          date,
          month_year: monthYear,
          parent_ids: [parent.id],
          synced_at:  '2099-12-31T23:59:59.999Z',
        })
        if (!error) created++
      }
    }

    return NextResponse.json({ deleted, created, parents: parentIds.length })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
