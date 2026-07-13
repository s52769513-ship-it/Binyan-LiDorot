import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDeleteMany } from '@/lib/trash'

// Deletes many transactions in a handful of round trips instead of one
// DELETE request per row (which is what the multi-select "מחק נבחרים" button
// used to do — 50 selected rows meant 50 sequential request pairs).
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const ids = Array.isArray(body?.ids) ? (body.ids as string[]).filter(Boolean) : []
    if (ids.length === 0) return NextResponse.json({ error: 'לא נבחרו תנועות' }, { status: 400 })

    const deletedBy = req.headers.get('x-auth-email') || 'unknown'

    const { data: txs, error: fetchError } = await supabaseAdmin
      .from('transactions')
      .select('*')
      .in('id', ids)
    if (fetchError) throw fetchError
    if (!txs || txs.length === 0) return NextResponse.json({ success: true, deleted: 0 })

    // Restore planned-payment balances for any linked transactions being
    // removed, batched per planned_payment_id (one read + one write each,
    // not one per transaction).
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
