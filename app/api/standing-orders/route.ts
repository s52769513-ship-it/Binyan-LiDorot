import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

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
      (data ?? []).map(so => ({
        id:                so.id,
        externalId:        so.external_id ?? '',
        standingOrderType: so.standing_order_type ?? '',
        bankName:          so.bank_name ?? '',
        bankBranch:        so.bank_branch ?? '',
        bankAccount:       so.bank_account ?? '',
        chargeDay:         so.charge_day ?? null,
        linkedParentId:    so.linked_parent_id ?? null,
        linkedParentName:  (so.linked_parent as { name?: string } | null)?.name ?? null,
        notes:             so.notes ?? '',
        createdAt:         so.created_at ?? '',
      }))
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { parentId, externalId, standingOrderType, bankName, bankBranch, bankAccount, chargeDay, linkedParentId, notes } = body

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
        charge_day:          chargeDay ? Number(chargeDay) : null,
        linked_parent_id:    linkedParentId || null,
        notes:               String(notes ?? ''),
      })
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
