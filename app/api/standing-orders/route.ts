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
    // credit card fields
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

export async function GET(req: NextRequest) {
  try {
    const parentId = req.nextUrl.searchParams.get('parentId') ?? ''
    if (!parentId) return NextResponse.json({ error: 'parentId required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('standing_orders')
      .select('*, linked_parent:linked_parent_id(id, name)')
      .eq('parent_id', parentId)
      .order('created_at', { ascending: true })

    if (error) throw error

    return NextResponse.json(
      (data ?? []).map(so => mapSo(so, (so.linked_parent as { name?: string } | null)))
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      parentId, externalId, standingOrderType, projectName, bankName, bankBranch, bankAccount,
      chargeDay, chargeAmount, soStatus,
      cardLast4, cardExpiry, cardType, cardHolderName, creditBalance,
      linkedParentId, notes,
    } = body

    if (!parentId) return NextResponse.json({ error: 'parentId required' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('standing_orders')
      .insert({
        id:                  crypto.randomUUID(),
        parent_id:           parentId,
        external_id:         String(externalId ?? ''),
        standing_order_type: String(standingOrderType ?? ''),
        bank_name:           String(bankName ?? ''),
        bank_branch:         String(bankBranch ?? ''),
        bank_account:        String(bankAccount ?? ''),
        charge_day:          chargeDay  ? Number(chargeDay)  : null,
        charge_amount:       chargeAmount ? Number(chargeAmount) : null,
        so_status:           soStatus || 'פעיל',
        card_last4:          cardLast4      ? String(cardLast4)      : null,
        card_expiry:         cardExpiry     ? String(cardExpiry)     : null,
        card_type:           cardType       ? String(cardType)       : null,
        card_holder_name:    cardHolderName ? String(cardHolderName) : null,
        credit_balance:      creditBalance  ? Number(creditBalance)  : null,
        linked_parent_id:    linkedParentId || null,
        project_name:        projectName ? String(projectName) : null,
        notes:               String(notes ?? ''),
      })
      .select('*, linked_parent:linked_parent_id(id, name)')
      .single()

    if (error) throw error

    return NextResponse.json(mapSo(data, (data.linked_parent as { name?: string } | null)))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
