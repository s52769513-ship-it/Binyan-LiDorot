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
    if ('externalId'        in body) update.external_id          = String(body.externalId ?? '')
    if ('standingOrderType' in body) update.standing_order_type  = String(body.standingOrderType ?? '')
    if ('bankName'          in body) update.bank_name            = String(body.bankName ?? '')
    if ('bankBranch'        in body) update.bank_branch          = String(body.bankBranch ?? '')
    if ('bankAccount'       in body) update.bank_account         = String(body.bankAccount ?? '')
    if ('chargeDay'         in body) update.charge_day           = body.chargeDay ? Number(body.chargeDay) : null
    if ('linkedParentId'    in body) update.linked_parent_id     = body.linkedParentId || null
    if ('notes'             in body) update.notes                = String(body.notes ?? '')

    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('standing_orders')
      .update(update)
      .eq('id', id)
      .select('*, linked_parent:linked_parent_id(id, name)')
      .single()

    if (error) throw error

    return NextResponse.json({
      id:                data.id,
      externalId:        data.external_id ?? '',
      standingOrderType: data.standing_order_type ?? '',
      bankName:          data.bank_name ?? '',
      bankBranch:        data.bank_branch ?? '',
      bankAccount:       data.bank_account ?? '',
      chargeDay:         data.charge_day ?? null,
      linkedParentId:    data.linked_parent_id ?? null,
      linkedParentName:  (data.linked_parent as { name?: string } | null)?.name ?? null,
      notes:             data.notes ?? '',
      createdAt:         data.created_at ?? '',
    })
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
    const { error } = await supabaseAdmin.from('standing_orders').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
