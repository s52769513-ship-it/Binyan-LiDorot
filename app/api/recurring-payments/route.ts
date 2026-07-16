import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function mapRp(rp: Record<string, unknown>) {
  return {
    id:            rp.id,
    parentId:      rp.parent_id ?? null,
    supplierName:  rp.supplier_name ?? '',
    amount:        Number(rp.amount) || 0,
    chargeDay:     rp.charge_day ?? null,
    paymentMethod: rp.payment_method ?? '',
    bank:          rp.bank ?? '',
    active:        rp.active !== false,
    notes:         rp.notes ?? '',
    createdAt:     rp.created_at ?? '',
  }
}

export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('recurring_payments')
      .select('*')
      .order('created_at', { ascending: true })
    if (error) throw error
    return NextResponse.json((data ?? []).map(mapRp))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { parentId, supplierName, amount, chargeDay, paymentMethod, bank, active, notes } = body

    if (!parentId) return NextResponse.json({ error: 'יש לבחור ספק' }, { status: 400 })
    if (amount == null || isNaN(Number(amount))) return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('recurring_payments')
      .insert({
        id:             crypto.randomUUID(),
        parent_id:      parentId,
        supplier_name:  String(supplierName ?? ''),
        amount:         Number(amount) || 0,
        charge_day:     chargeDay ? Number(chargeDay) : null,
        payment_method: String(paymentMethod ?? ''),
        bank:           String(bank ?? ''),
        active:         active !== false,
        notes:          String(notes ?? ''),
      })
      .select('*')
      .single()
    if (error) throw error
    return NextResponse.json(mapRp(data))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
