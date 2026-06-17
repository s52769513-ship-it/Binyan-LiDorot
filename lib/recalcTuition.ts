import { supabaseAdmin } from '@/lib/supabase'

export async function recalcTuitionForParent(parentId: string): Promise<void> {
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('status, transportation_cost, discount_pct')
    .contains('parent_ids', [parentId])

  const active = (students ?? []).filter(s => s.status === 'פעיל')
  const activeCount = active.length
  const baseRate = activeCount > 3 ? 450 : 500
  // Sum per-student tuition after individual discount
  const baseTuition = active.reduce((sum, s) => {
    const disc = Math.min(100, Math.max(0, Number(s.discount_pct) || 0))
    return sum + baseRate * (1 - disc / 100)
  }, 0)
  const transportTotal = active.reduce((sum, s) => sum + (Number(s.transportation_cost) || 0), 0)
  const newTuition = Math.round(baseTuition + transportTotal)

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

  // Recompute tuition_balance from ALL PP balances (ground truth, not delta)
  const { data: allPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('balance, pp_type')
    .contains('parent_ids', [parentId])

  const tuitionBalance = (allPPs ?? [])
    .filter(p => p.pp_type !== 'salary')
    .reduce((s, p) => s + Math.max(0, Number(p.balance ?? 0)), 0)

  await supabaseAdmin.from('parents').update({
    tuition_total:   newTuition,
    tuition_balance: tuitionBalance,
    children_count:  activeCount,
  }).eq('id', parentId)
}
