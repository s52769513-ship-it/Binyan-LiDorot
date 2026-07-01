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
