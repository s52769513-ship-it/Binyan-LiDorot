import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { actorFromRequest, logActivity } from '@/lib/activityLog'

const fmtILS = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.abs(n))

// POST /api/planned-payments/[id]/reassign — changes who a planned payment is
// linked to. Refused when the PP already has linked transactions: moving the
// person would leave those payments pointing at someone else's debt record.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const { newParentId } = await req.json()
    if (!newParentId) return NextResponse.json({ error: 'יש לבחור בן אדם' }, { status: 400 })

    const { data: pp } = await supabaseAdmin
      .from('planned_payments').select('parent_ids, name, amount, month_year, pp_type').eq('id', id).single()
    if (!pp) return NextResponse.json({ error: 'תשלום מתוכנן לא נמצא' }, { status: 404 })

    const { count: linkedCount } = await supabaseAdmin
      .from('transactions').select('id', { count: 'exact', head: true }).eq('planned_payment_id', id)
    if ((linkedCount ?? 0) > 0) {
      return NextResponse.json(
        { error: 'לא ניתן לשנות שיוך לתשלום מתוכנן שיש לו תנועות מקושרות — יש לנתק אותן קודם' },
        { status: 400 }
      )
    }

    const oldParentId = (pp.parent_ids as string[])?.[0] ?? null
    const [{ data: oldParent }, { data: newParent }] = await Promise.all([
      oldParentId ? supabaseAdmin.from('parents').select('name').eq('id', oldParentId).maybeSingle() : Promise.resolve({ data: null }),
      supabaseAdmin.from('parents').select('name').eq('id', newParentId).maybeSingle(),
    ])
    if (!newParent) return NextResponse.json({ error: 'בן אדם לא נמצא' }, { status: 404 })

    const { error } = await supabaseAdmin.from('planned_payments').update({ parent_ids: [newParentId] }).eq('id', id)
    if (error) throw error

    const actor = actorFromRequest(req)
    const label = `${pp.name || pp.pp_type || 'תשלום מתוכנן'} · ${fmtILS(Number(pp.amount) || 0)} (${pp.month_year ?? ''})`
    if (oldParentId) {
      void logActivity({
        parentId: oldParentId, actor, action: 'update',
        summary: `שיוך תשלום מתוכנן הועבר ל${newParent.name}: ${label}`,
      })
    }
    void logActivity({
      parentId: newParentId, actor, action: 'update',
      summary: `שויך תשלום מתוכנן${oldParent ? ` מ${oldParent.name}` : ''}: ${label}`,
    })

    return NextResponse.json({ success: true, parentId: newParentId, parentName: newParent.name })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
