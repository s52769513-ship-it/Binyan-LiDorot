import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const nameFilter = req.nextUrl.searchParams.get('name') ?? ''
    let query = supabaseAdmin
      .from('planned_payments')
      .select('id, name, amount, balance, date, month_year, parent_ids')
      .order('date', { ascending: false })
      .limit(200)

    if (nameFilter) query = query.ilike('name', `%${nameFilter}%`)

    const { data, error } = await query
    if (error) throw error

    return NextResponse.json(
      (data ?? []).map(p => ({
        id: p.id,
        name: p.name ?? '',
        amount: p.amount ?? 0,
        balance: p.balance ?? 0,
        date: p.date ?? '',
        monthYear: p.month_year ?? '',
        parentIds: p.parent_ids ?? [],
      }))
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { amount, name, date, monthYear, parentIds } = body

    if (!amount || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    // Use far-future synced_at so prune_stale_rows (Airtable sync) never deletes local records
    const syncedAt = '2099-12-31T23:59:59.999Z'

    const row = {
      id,
      amount: Number(amount),
      name: name || '',
      date: date || null,
      month_year: monthYear || '',
      balance: Number(amount),   // new planned payment → full amount is balance
      parent_ids: Array.isArray(parentIds) ? parentIds : [],
      synced_at: syncedAt,
    }
    const { error } = await supabaseAdmin.from('planned_payments').insert(row)
    if (error) throw error

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('planned-payments POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
