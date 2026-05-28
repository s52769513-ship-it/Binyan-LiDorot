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

  const { data: par } = await supabaseAdmin
    .from('parents')
    .select('tuition_total, tuition_balance')
    .eq('id', parentId)
    .single()

  const oldTuition = Number(par?.tuition_total) || 0
  const delta = newTuition - oldTuition
  const newBalance = (Number(par?.tuition_balance) || 0) + delta

  await supabaseAdmin.from('parents').update({
    tuition_total:   newTuition,
    tuition_balance: newBalance,
    children_count:  activeCount,
  }).eq('id', parentId)

  if (delta !== 0) {
    // Only update current month and future open planned payments
    const today = new Date()
    const currentMonthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

    const { data: openPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('id, amount, balance')
      .contains('parent_ids', [parentId])
      .gt('balance', 0)
      .gte('date', currentMonthDate)

    for (const pp of openPPs ?? []) {
      // alreadyPaid = what was paid toward this PP so far
      const alreadyPaid = Math.max(0, Number(pp.amount) - Number(pp.balance))
      const newBalance  = Math.max(0, newTuition - alreadyPaid)
      await supabaseAdmin.from('planned_payments').update({
        amount:  newTuition,
        balance: newBalance,
      }).eq('id', pp.id)
    }
  }
}
