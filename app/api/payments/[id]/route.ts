import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const { data, error } = await supabaseAdmin
      .from('planned_payments').select('*').eq('id', id).single()
    if (error) throw error
    const p = data

    const toArray = (v: unknown): string[] =>
      Array.isArray(v) ? v : (v ? [String(v)] : [])

    const parentIds = toArray(p.parent_ids)
    let parents: { id: string; name: string; fatherPhone: string; motherPhone: string }[] = []
    if (parentIds.length > 0) {
      const { data: pd } = await supabaseAdmin
        .from('parents').select('id, name, father_phone, mother_phone').in('id', parentIds)
      parents = (pd ?? []).map(x => ({
        id: x.id, name: x.name ?? '',
        fatherPhone: x.father_phone ?? '', motherPhone: x.mother_phone ?? '',
      }))
    }

    // Fetch matching transactions for this payment's month/parent
    let transactions: unknown[] = []
    if (parentIds.length > 0 && p.month_year) {
      const { data: txData } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, type, date, notes')
        .contains('parent_ids', parentIds)
        .eq('month_year', p.month_year)
        .order('date', { ascending: false })
      transactions = txData ?? []
    }

    const amount  = Number(p.amount)  || 0
    const balance = Number(p.balance) || 0
    const paid    = Math.max(0, amount - balance)

    return NextResponse.json({
      id: p.id,
      name: p.name ?? '',
      amount,
      paid,
      balance,
      monthYear: p.month_year ?? '',
      date: p.date ?? '',
      notes: p.notes ?? '',
      parentIds,
      parents,
      transactions,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['amount', 'balance', 'date', 'month_year', 'notes', 'name']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }
    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })
    const { error } = await supabaseAdmin.from('planned_payments').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
