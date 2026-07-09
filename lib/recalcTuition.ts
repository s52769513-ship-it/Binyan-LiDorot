import { supabaseAdmin } from '@/lib/supabase'
import { calcTransportCost } from '@/lib/transport'

export async function recalcTuitionForParent(parentId: string): Promise<void> {
  const { data: students } = await supabaseAdmin
    .from('students')
    .select('status, transportation')
    .contains('parent_ids', [parentId])

  const active = (students ?? []).filter(s => s.status === 'פעיל')
  const activeCount = active.length
  // Derive transport cost from the legs so recalc is correct even when the
  // stored transportation_cost predates the transport backfill (lib/transport).
  const transportTotal = active.reduce((sum, s) => sum + calcTransportCost(s.transportation), 0)
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
