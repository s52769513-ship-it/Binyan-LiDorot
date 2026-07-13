import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDeleteMany } from '@/lib/trash'

// Deletes many transactions in a handful of round trips (not one request per
// row) and routes them through the trash so they can be restored for 30 days,
// restoring any linked planned-payment balances first.
export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json()
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 })
    }
    const deletedBy = req.headers.get('x-auth-email') || 'unknown'

    const { data: txs, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .in('id', ids)
    if (fetchError) throw fetchError
    if (!txs || txs.length === 0) return NextResponse.json({ success: true, deleted: 0 })

    // Restore planned-payment balances for linked transactions, batched per PP.
    const byPP = new Map<string, number>()
    for (const tx of txs) {
      const ppId = tx.planned_payment_id as string | null
      if (!ppId) continue
      byPP.set(ppId, (byPP.get(ppId) ?? 0) + Math.abs(Number(tx.amount ?? 0)))
    }
    if (byPP.size > 0) {
      const { data: pps } = await supabaseAdmin
        .from('planned_payments')
        .select('id, balance, amount')
        .in('id', [...byPP.keys()])
      for (const pp of pps ?? []) {
        const restored = Math.min(Number(pp.amount), Number(pp.balance) + (byPP.get(pp.id as string) ?? 0))
        await supabaseAdmin.from('planned_payments').update({ balance: restored }).eq('id', pp.id)
      }
    }

    await softDeleteMany(
      supabaseAdmin,
      'transaction',
      txs.map(tx => ({ id: tx.id as string, data: tx })),
      deletedBy
    )

    return NextResponse.json({ success: true, deleted: txs.length })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
