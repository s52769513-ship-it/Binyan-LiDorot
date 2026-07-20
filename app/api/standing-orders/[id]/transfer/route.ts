import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { relinkParent } from '@/lib/relink'
import { actorFromRequest, logActivity } from '@/lib/activityLog'

// POST /api/standing-orders/[id]/transfer  { newParentId }
// Moves a standing order AND all of its transactions to another person, then
// re-runs the PP-linking logic (relink) on BOTH the old and the new person so
// balances/credits are correct on each side.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { newParentId } = await req.json()
    if (!newParentId) return NextResponse.json({ error: 'יש לבחור בן אדם' }, { status: 400 })

    const { data: so } = await supabaseAdmin
      .from('standing_orders').select('*').eq('id', id).single()
    if (!so) return NextResponse.json({ error: 'הוראת קבע לא נמצאה' }, { status: 404 })

    const oldParentId = so.parent_id as string | null
    if (oldParentId === newParentId) return NextResponse.json({ success: true, unchanged: true })

    const [{ data: oldParent }, { data: newParent }] = await Promise.all([
      oldParentId ? supabaseAdmin.from('parents').select('name').eq('id', oldParentId).maybeSingle() : Promise.resolve({ data: null }),
      supabaseAdmin.from('parents').select('name').eq('id', newParentId).maybeSingle(),
    ])
    if (!newParent) return NextResponse.json({ error: 'בן אדם לא נמצא' }, { status: 404 })

    // 1. Move the standing order itself
    await supabaseAdmin.from('standing_orders').update({ parent_id: newParentId }).eq('id', id)

    // 2. Move every transaction of this SO: swap old→new in parent_ids, and
    //    unlink from the old person's PP so relink can re-link it to the new one.
    const { data: txs } = await supabaseAdmin
      .from('transactions').select('id, parent_ids').eq('standing_order_id', id)
    let movedTxs = 0
    for (const tx of txs ?? []) {
      const ids = new Set(((tx.parent_ids as string[]) ?? []))
      if (oldParentId) ids.delete(oldParentId)
      ids.add(newParentId)
      await supabaseAdmin.from('transactions')
        .update({ parent_ids: [...ids], planned_payment_id: null })
        .eq('id', tx.id)
      movedTxs++
    }

    // 3. Re-run PP linking on both sides (relink replays all txs, resets PP
    //    balances, re-links, and recomputes credits — tuition + donation).
    if (oldParentId) { try { await relinkParent(oldParentId) } catch { /* best-effort */ } }
    try { await relinkParent(newParentId) } catch { /* best-effort */ }

    const actor = actorFromRequest(req)
    const label = `${so.standing_order_type || ''}${so.external_id ? ` #${so.external_id}` : ''} (${movedTxs} תנועות)`
    if (oldParentId) {
      void logActivity({ parentId: oldParentId, actor, action: 'update', summary: `הוראת קבע הועברה ל${newParent.name}: ${label}` })
    }
    void logActivity({ parentId: newParentId, actor, action: 'update', summary: `התקבלה הוראת קבע${oldParent ? ` מ${oldParent.name}` : ''}: ${label}` })

    return NextResponse.json({ success: true, movedTxs, newParentId, newParentName: newParent.name })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
