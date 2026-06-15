import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function mapSo(so: Record<string, unknown>, linked: { name?: string } | null = null) {
  return {
    id:                so.id,
    externalId:        so.external_id ?? '',
    standingOrderType: so.standing_order_type ?? '',
    bankName:          so.bank_name ?? '',
    bankBranch:        so.bank_branch ?? '',
    bankAccount:       so.bank_account ?? '',
    chargeDay:         so.charge_day ?? null,
    chargeAmount:      so.charge_amount ?? null,
    soStatus:          so.so_status ?? 'פעיל',
    cardLast4:         so.card_last4 ?? '',
    cardExpiry:        so.card_expiry ?? '',
    cardType:          so.card_type ?? '',
    cardHolderName:    so.card_holder_name ?? '',
    creditBalance:     so.credit_balance ?? null,
    linkedParentId:    so.linked_parent_id ?? null,
    linkedParentName:  linked?.name ?? null,
    projectName:       so.project_name ?? '',
    notes:             so.notes ?? '',
    createdAt:         so.created_at ?? '',
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    const update: Record<string, unknown> = {}
    if ('externalId'        in body) update.external_id       = String(body.externalId ?? '')
    if ('standingOrderType' in body) update.standing_order_type = String(body.standingOrderType ?? '')
    if ('bankName'          in body) update.bank_name         = String(body.bankName ?? '')
    if ('bankBranch'        in body) update.bank_branch       = String(body.bankBranch ?? '')
    if ('bankAccount'       in body) update.bank_account      = String(body.bankAccount ?? '')
    if ('chargeDay'         in body) update.charge_day        = body.chargeDay  ? Number(body.chargeDay)  : null
    if ('chargeAmount'      in body) update.charge_amount     = body.chargeAmount ? Number(body.chargeAmount) : null
    if ('soStatus'          in body) update.so_status         = body.soStatus || 'פעיל'
    if ('cardLast4'         in body) update.card_last4        = body.cardLast4      ? String(body.cardLast4)      : null
    if ('cardExpiry'        in body) update.card_expiry       = body.cardExpiry     ? String(body.cardExpiry)     : null
    if ('cardType'          in body) update.card_type         = body.cardType       ? String(body.cardType)       : null
    if ('cardHolderName'    in body) update.card_holder_name  = body.cardHolderName ? String(body.cardHolderName) : null
    if ('creditBalance'     in body) update.credit_balance    = body.creditBalance  !== '' ? Number(body.creditBalance) : null
    if ('linkedParentId'    in body) update.linked_parent_id  = body.linkedParentId || null
    if ('projectName'       in body) update.project_name      = body.projectName ? String(body.projectName) : null
    if ('notes'             in body) update.notes             = String(body.notes ?? '')

    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('standing_orders')
      .update(update)
      .eq('id', id)
      .select('*, linked_parent:linked_parent_id(id, name)')
      .single()

    if (error) throw error

    return NextResponse.json(mapSo(data, (data.linked_parent as { name?: string } | null)))
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
