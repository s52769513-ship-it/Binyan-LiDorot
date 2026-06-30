import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!id) {
      return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
    }

    // Get PP details before deletion to clean up related transactions
    const { data: pp, error: fetchErr } = await supabaseAdmin
      .from('planned_payments')
      .select('id, parent_ids, planned_payment_id')
      .eq('id', id)
      .single()

    if (fetchErr || !pp) {
      return NextResponse.json({ error: 'לא נמצא תשלום מתוכנן' }, { status: 404 })
    }

    // Delete all transactions linked to this PP
    const { error: txErr } = await supabaseAdmin
      .from('transactions')
      .delete()
      .eq('planned_payment_id', id)

    if (txErr) throw txErr

    // Delete the PP itself
    const { error } = await supabaseAdmin
      .from('planned_payments')
      .delete()
      .eq('id', id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (err) {
    const message = (err as { message?: string })?.message ?? String(err)
    console.error('planned payment DELETE error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
