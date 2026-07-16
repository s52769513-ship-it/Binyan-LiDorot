import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDelete } from '@/lib/trash'

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const map: Record<string, string> = {
      supplierName:  'supplier_name',
      amount:        'amount',
      chargeDay:     'charge_day',
      paymentMethod: 'payment_method',
      bank:          'bank',
      active:        'active',
      notes:         'notes',
      parentId:      'parent_id',
    }
    const update: Record<string, unknown> = {}
    for (const [k, col] of Object.entries(map)) {
      if (k in body) {
        if (k === 'amount') update[col] = Number(body[k]) || 0
        else if (k === 'chargeDay') update[col] = body[k] ? Number(body[k]) : null
        else update[col] = body[k]
      }
    }
    const { error } = await supabaseAdmin.from('recurring_payments').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const deletedBy = req.headers.get('x-auth-email') || 'unknown'
    const { data: rp } = await supabaseAdmin.from('recurring_payments').select('*').eq('id', id).single()
    if (!rp) return NextResponse.json({ error: 'לא נמצא' }, { status: 404 })
    await softDelete(supabaseAdmin, 'recurring_payment', id, rp, deletedBy)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
