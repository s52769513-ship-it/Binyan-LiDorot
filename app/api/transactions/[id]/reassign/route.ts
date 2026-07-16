import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { actorFromRequest, logActivity } from '@/lib/activityLog'

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.abs(n))

// POST /api/transactions/[id]/reassign — changes who a transaction is linked
// to. Refused when the transaction is already linked to a planned payment
// (planned_payment_id set): moving the person would leave that PP's balance
// tracking a different person's money. Unlink from the PP first.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { newParentId } = await req.json()
    if (!newParentId) return NextResponse.json({ error: 'יש לבחור בן אדם' }, { status: 400 })

    const { data: tx } = await supabaseAdmin
      .from('transactions').select('parent_ids, planned_payment_id, type, amount, notes').eq('id', id).single()
    if (!tx) return NextResponse.json({ error: 'תנועה לא נמצאה' }, { status: 404 })

    if (tx.planned_payment_id) {
      return NextResponse.json(
        { error: 'לא ניתן לשנות שיוך לתנועה המקושרת לתשלום מתוכנן — יש לנתק אותה קודם' },
        { status: 400 }
      )
    }

    const oldParentId = (tx.parent_ids as string[])?.[0] ?? null
    const [{ data: oldParent }, { data: newParent }] = await Promise.all([
      oldParentId ? supabaseAdmin.from('parents').select('name').eq('id', oldParentId).maybeSingle() : Promise.resolve({ data: null }),
      supabaseAdmin.from('parents').select('name').eq('id', newParentId).maybeSingle(),
    ])
    if (!newParent) return NextResponse.json({ error: 'בן אדם לא נמצא' }, { status: 404 })

    const { error } = await supabaseAdmin.from('transactions').update({ parent_ids: [newParentId] }).eq('id', id)
    if (error) throw error

    const actor = actorFromRequest(req)
    const label = `${tx.type || 'ללא סוג'} · ${fmtILS(Number(tx.amount) || 0)}${tx.notes ? ` · ${tx.notes}` : ''}`
    if (oldParentId) {
      void logActivity({
        parentId: oldParentId, actor, action: 'update',
        summary: `שיוך תנועה הועבר ל${newParent.name}: ${label}`,
      })
    }
    void logActivity({
      parentId: newParentId, actor, action: 'update',
      summary: `שויכה תנועה${oldParent ? ` מ${oldParent.name}` : ''}: ${label}`,
    })

    return NextResponse.json({ success: true, parentId: newParentId, parentName: newParent.name })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
