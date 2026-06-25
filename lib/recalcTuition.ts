import { supabaseAdmin } from '@/lib/supabase'

export async function recalcTuitionForParent(parentId: string): Promise<void> {
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('status, transportation_cost')
    .contains('parent_ids', [parentId])

  const active = (students ?? []).filter(s => s.status === 'פעיל')
  const activeCount = active.length
  const transportTotal = active.reduce((sum, s) => sum + (Number(s.transportation_cost) || 0), 0)
  const baseTuition = activeCount === 0 ? 0 : activeCount > 3 ? activeCount * 450 : activeCount * 500
  const newTuition = baseTuition + transportTotal

  // Update open future PPs first (date >= today, pp_type = tuition)
  const today = new Date()
  const currentMonthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

  const { data: openPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, balance')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'tuition')
    .gt('balance', 0)
    .gte('date', currentMonthDate)

  for (const pp of openPPs ?? []) {
    const alreadyPaid = Math.max(0, Number(pp.amount) - Number(pp.balance))
    const newBalance  = Math.max(0, newTuition - alreadyPaid)
    await supabaseAdmin.from('planned_payments').update({
      amount:  newTuition,
      balance: newBalance,
    }).eq('id', pp.id)
  }

  // If parent has no children, delete all tuition planned payments
  if (activeCount === 0) {
    const { data: emptyPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('id')
      .contains('parent_ids', [parentId])
      .eq('pp_type', 'tuition')

    for (const pp of emptyPPs ?? []) {
      await supabaseAdmin.from('transactions').delete().eq('planned_payment_id', pp.id)
      await supabaseAdmin.from('planned_payments').delete().eq('id', pp.id)
    }
  }

  // Recompute tuition_balance = overdue debt minus ppCredit (matches "חוב באיחור" in detail card)
  const { data: allPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('balance, pp_type, date')
    .contains('parent_ids', [parentId])

  const { data: parentData } = await supabaseAdmin
    .from('parents')
    .select('pp_credit')
    .eq('id', parentId)
    .single()

  const ppCredit = Number(parentData?.pp_credit ?? 0)

  // Calculate overdue balance (what shows as "חוב באיחור" in detail)
  const overduePPs = (allPPs ?? []).filter(p =>
    p.pp_type !== 'salary' &&
    Number(p.balance ?? 0) > 0 &&
    p.date &&
    new Date(p.date) < today
  )
  const overdueTotal = overduePPs.reduce((s, pp) => s + Number(pp.balance ?? 0), 0)
  const tuitionBalance = Math.max(0, overdueTotal - ppCredit)

  await supabaseAdmin.from('parents').update({
    tuition_total:   newTuition,
    tuition_balance: tuitionBalance,
    children_count:  activeCount,
  }).eq('id', parentId)
}
