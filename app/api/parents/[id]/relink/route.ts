import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/parents/[id]/relink
 * Resets all non-salary PP balances to their original amounts, then
 * re-applies each linked transaction's cascade in chronological order.
 * Leftover surplus goes to credit_balance.
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: parentId } = await params

  try {
    // 1. Load all non-salary PPs for this parent
    const { data: pps, error: ppsErr } = await supabaseAdmin
      .from('planned_payments')
      .select('id, amount, pp_type, month_year')
      .contains('parent_ids', [parentId])
      .neq('pp_type', 'salary')
      .order('month_year', { ascending: true })
    if (ppsErr) throw ppsErr

    // 2. Reset every PP balance to its original amount
    for (const pp of pps ?? []) {
      await supabaseAdmin
        .from('planned_payments')
        .update({ balance: Number(pp.amount) })
        .eq('id', pp.id)
    }

    // 3. Clear parent credit_balance
    await supabaseAdmin
      .from('parents')
      .update({ credit_balance: 0 })
      .eq('id', parentId)

    // 4. Fetch all linked positive transactions, oldest first
    const { data: txs, error: txsErr } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, planned_payment_id')
      .contains('parent_ids', [parentId])
      .not('planned_payment_id', 'is', null)
      .gt('amount', 0)
      .order('date', { ascending: true })
    if (txsErr) throw txsErr

    // 5. Re-apply each transaction's cascade
    let processed = 0
    for (const tx of txs ?? []) {
      if (!tx.planned_payment_id) continue

      // Snapshot of current open PPs (after previous iterations), oldest first
      const { data: openPPs } = await supabaseAdmin
        .from('planned_payments')
        .select('id, balance, month_year')
        .contains('parent_ids', [parentId])
        .gt('balance', 0)
        .order('month_year', { ascending: true })

      const target = (openPPs ?? []).find(p => p.id === tx.planned_payment_id)
      // Build cascade order: target first, then remaining oldest-first
      const cascade = target
        ? [target, ...(openPPs ?? []).filter(p => p.id !== tx.planned_payment_id)]
        : (openPPs ?? [])

      let remaining = Math.abs(Number(tx.amount))
      for (const pp of cascade) {
        if (remaining <= 0) break
        const cur   = Number(pp.balance)
        const apply = Math.min(remaining, cur)
        remaining   = Math.round((remaining - apply) * 100) / 100
        await supabaseAdmin
          .from('planned_payments')
          .update({ balance: Math.round((cur - apply) * 100) / 100 })
          .eq('id', pp.id)
      }

      // Leftover → credit_balance
      if (remaining > 0) {
        const { data: par } = await supabaseAdmin
          .from('parents')
          .select('credit_balance')
          .eq('id', parentId)
          .single()
        await supabaseAdmin
          .from('parents')
          .update({ credit_balance: Math.round((Number(par?.credit_balance ?? 0) + remaining) * 100) / 100 })
          .eq('id', parentId)
      }

      processed++
    }

    // 6. Recalculate parent tuition_balance from final PP state
    const { data: finalPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('balance, pp_type')
      .contains('parent_ids', [parentId])
    const tuitionBalance = (finalPPs ?? [])
      .filter(p => p.pp_type !== 'salary')
      .reduce((s, p) => s + Math.max(0, Number(p.balance ?? 0)), 0)
    await supabaseAdmin
      .from('parents')
      .update({ tuition_balance: Math.round(tuitionBalance) })
      .eq('id', parentId)

    return NextResponse.json({
      success: true,
      ppsReset: (pps ?? []).length,
      txsProcessed: processed,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
