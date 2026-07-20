import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDelete } from '@/lib/trash'
import { recalcParentTuitionBalance } from '@/lib/ppPayments'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
    }

    const deletedBy = req.headers.get('x-auth-email') || 'unknown'

    // שלוף את הרשומה המלאה לפני המחיקה כדי שנוכל לשחזר אותה מהאשפה
    const { data: pp } = await supabaseAdmin
      .from('planned_payments')
      .select('*')
      .eq('id', id)
      .single()

    if (!pp) {
      return NextResponse.json({ error: 'תשלום מתוכנן לא נמצא' }, { status: 404 })
    }

    await softDelete(supabaseAdmin, 'planned_payment', id, pp, deletedBy)

    for (const pid of ((pp.parent_ids as string[]) ?? [])) {
      try { await recalcParentTuitionBalance(pid) } catch { /* best-effort */ }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = (err as { message?: string })?.message ?? String(err)
    console.error('planned payment DELETE error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
