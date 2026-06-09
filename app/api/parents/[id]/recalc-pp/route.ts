import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/parents/[id]/recalc-pp
 * Full PP reconciliation for a parent:
 *   1. Match unlinked positive transactions to open tuition PPs by month_year (oldest first)
 *      with cascade: if tx > PP balance → close PP, carry remainder to next
 *      leftover after all PPs → credit_balance
 *   2. Apply existing credit_balance to remaining open PPs (oldest first)
 *   3. Recalculate balance on every explicitly linked PP
 *   4. Update parent.tuition_balance
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: parentId } = await params
  try {
    const result = await recalcPPs(parentId)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function recalcPPs(parentId: string) {
  // ── Load open tuition PPs sorted oldest first ────────────────────────────
  // Include pp_type = 'tuition' OR null (old records from generate-year before fix)
  const { data: rawPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, balance, month_year, pp_type')
    .contains('parent_ids', [parentId])
    .or('pp_type.eq.tuition,pp_type.is.null')
    .gt('balance', 0)
    .order('month_year', { ascending: true })

  const openPPs = (rawPPs ?? []).map(p => ({ ...p, balance: Number(p.balance), amount: Number(p.amount) }))

  // ── Load unlinked positive transactions sorted oldest first ──────────────
  const { data: rawTxs } = await supabaseAdmin
    .from('transactions')
    .select('id, amount, month_year, date')
    .contains('parent_ids', [parentId])
    .contains('project_names', ['בנין לדורות'])
    .is('planned_payment_id', null)
    .gt('amount', 0)
    .order('date', { ascending: true })

  let leftover = 0 // carries over between transactions

  // ── Step 1: match each unlinked tx to PPs with cascade ──────────────────
  for (const tx of rawTxs ?? []) {
    let remaining = Number(tx.amount)

    // Try matching month first, then oldest
    const monthMatch = openPPs.findIndex(p => p.month_year === tx.month_year && p.balance > 0)
    const firstOpen  = openPPs.findIndex(p => p.balance > 0)
    let ppIdx = monthMatch >= 0 ? monthMatch : firstOpen
    if (ppIdx < 0) { leftover += remaining; continue }

    // Link to first PP and cascade
    let firstLinked = true
    while (remaining > 0 && ppIdx >= 0) {
      const pp = openPPs[ppIdx]
      const apply = Math.min(remaining, pp.balance)
      pp.balance = Math.round((pp.balance - apply) * 100) / 100
      remaining  = Math.round((remaining - apply) * 100) / 100

      await supabaseAdmin.from('planned_payments').update({ balance: pp.balance }).eq('id', pp.id)
      if (firstLinked) {
        await supabaseAdmin.from('transactions').update({ planned_payment_id: pp.id }).eq('id', tx.id)
        firstLinked = false
      }

      if (remaining > 0) {
        ppIdx = openPPs.findIndex((p, i) => i > ppIdx && p.balance > 0)
        if (ppIdx < 0) ppIdx = openPPs.findIndex(p => p.balance > 0)
      }
    }
    leftover += remaining
  }

  // ── Step 2: leftover from unlinked txs → add to credit_balance ──────────
  const { data: parentRow } = await supabaseAdmin
    .from('parents')
    .select('credit_balance')
    .eq('id', parentId)
    .single()

  let credit = Number(parentRow?.credit_balance ?? 0) + leftover

  // ── Step 3: apply credit_balance to remaining open PPs ──────────────────
  if (credit > 0) {
    for (const pp of openPPs) {
      if (pp.balance <= 0 || credit <= 0) continue
      const apply = Math.min(credit, pp.balance)
      pp.balance = Math.round((pp.balance - apply) * 100) / 100
      credit     = Math.round((credit - apply) * 100) / 100
      await supabaseAdmin.from('planned_payments').update({ balance: pp.balance }).eq('id', pp.id)
    }
  }

  // ── Step 4: recalc all linked tuition PPs ───────────────────────────────
  const { data: allPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, pp_type')
    .contains('parent_ids', [parentId])
    .or('pp_type.eq.tuition,pp_type.is.null')

  for (const pp of allPPs ?? []) {
    const { data: txs } = await supabaseAdmin
      .from('transactions')
      .select('amount')
      .eq('planned_payment_id', pp.id)
      .contains('project_names', ['בנין לדורות'])
      .gt('amount', 0)
    const paid    = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0)
    const balance = Math.max(0, Number(pp.amount) - paid)
    await supabaseAdmin.from('planned_payments').update({ balance }).eq('id', pp.id)
  }

  // ── Step 5: update parent credit_balance + tuition_balance ──────────────
  const { data: finalPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('balance, pp_type')
    .contains('parent_ids', [parentId])

  const tuitionBalance = (finalPPs ?? [])
    .filter(p => p.pp_type !== 'משכורת')
    .reduce((s, p) => s + Number(p.balance ?? 0), 0)

  await supabaseAdmin.from('parents').update({
    tuition_balance: tuitionBalance,
    credit_balance:  Math.max(0, credit),
  }).eq('id', parentId)

  return {
    unlinkedMatched: (rawTxs ?? []).length,
    leftoverCredit: Math.max(0, credit),
    tuitionBalance,
  }
}
