import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const update: Record<string, unknown> = {}
    if ('amount' in body) update.amount = Number(body.amount)
    if ('date'   in body) update.date   = body.date
    if ('notes'  in body) update.notes  = String(body.notes ?? '')

    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })

    const { error } = await supabaseAdmin.from('cash_fund_entries').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    // Deleting a duplicated entry intentionally "un-duplicates" it, freeing
    // the source transaction to be duplicated again later.
    const { error } = await supabaseAdmin.from('cash_fund_entries').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
