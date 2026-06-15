import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/transactions/[id]/link-pp
 * Body: { ppId: string }
 *
 * Links a transaction to a PP with cascade:
 * - Unlinks from old PP (restores its balance) if any
 * - Applies tx amount to target PP
 * - If amount > PP balance → closes PP, cascades to next open PP of same type/parent (oldest first)
 * - Leftover → parent credit_balance
 * - Recalculates parent tuition_balance
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: txId } = await params
  const { ppId } = await req.json()
  if (!ppId) return NextResponse.json({ error: 'ppId required' }, { status: 400 })

  try {
    // Load transaction
    const { data: tx } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, planned_payment_id, parent_ids')
      .eq('id', txId)
      .single()
    if (!tx) return NextResponse.json({ error: 'transaction not found' }, { status: 404 })

    // Load target PP
    const { data: targetPP } = await supabaseAdmin
      .from('planned_payments')
      .select('id, amount, balance, pp_type, parent_ids')
      .eq('id', ppId)
      .single()
    if (!targetPP) return NextResponse.json({ error: 'PP not found' }, { status: 404 })

    // Unlink from old PP — restore its balance
    if (tx.planned_payment_id && tx.planned_payment_id !== ppId) {
      const { data: oldPP } = await supabaseAdmin
        .from('planned_payments')
        .select('balance, amount')
        .eq('id', tx.planned_payment_id)
        .single()
      if (oldPP) {
        const restored = Math.min(Number(oldPP.amount), Number(oldPP.balance) + Number(tx.amount))
        await supabaseAdmin.from('planned_payments').update({ balance: restored }).eq('id', tx.planned_payment_id)
      }
    }

    // Link transaction to target PP
    await supabaseAdmin.from('transactions').update({ planned_payment_id: ppId }).eq('id', txId)

    // Load all open PPs of same type for this parent, sorted oldest first
    const parentId = (tx.parent_ids as string[])?.[0]
    const ppType   = targetPP.pp_type

    const { data: openPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('id, amount, balance, month_year')
      .contains('parent_ids', [parentId])
      .eq('pp_type', ppType)
      .gt('balance', 0)
      .order('month_year', { ascending: true })

    // Apply amount with cascade starting from target PP
    let remaining = Math.abs(Number(tx.amount))
    const ppsToProcess = [
      targetPP,
      ...(openPPs ?? []).filter(p => p.id !== ppId),
    ]

    for (const pp of ppsToProcess) {
      if (remaining <= 0) break
      const cur    = Number(pp.id === ppId ? targetPP.balance : pp.balance)
      const apply  = Math.min(remaining, cur)
      const newBal = Math.round((cur - apply) * 100) / 100
      remaining    = Math.round((remaining - apply) * 100) / 100
      await supabaseAdmin.from('planned_payments').update({ balance: newBal }).eq('id', pp.id)
    }

    // Leftover → credit_balance
    if (remaining > 0 && parentId) {
      const { data: parent } = await supabaseAdmin.from('parents').select('credit_balance').eq('id', parentId).single()
      const newCredit = Math.round((Number(parent?.credit_balance ?? 0) + remaining) * 100) / 100
      await supabaseAdmin.from('parents').update({ credit_balance: newCredit }).eq('id', parentId)
    }

    // Recalculate parent tuition_balance
    if (parentId) {
      const { data: allPPs } = await supabaseAdmin
        .from('planned_payments')
        .select('balance, pp_type')
        .contains('parent_ids', [parentId])
      const tuitionBalance = (allPPs ?? [])
        .filter(p => p.pp_type !== 'salary')
        .reduce((s, p) => s + Number(p.balance ?? 0), 0)
      await supabaseAdmin.from('parents').update({ tuition_balance: tuitionBalance }).eq('id', parentId)
    }

    return NextResponse.json({ success: true, leftover: remaining })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
