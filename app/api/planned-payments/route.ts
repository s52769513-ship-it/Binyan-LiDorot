import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const nameFilter   = req.nextUrl.searchParams.get('name') ?? ''
    const parentId     = req.nextUrl.searchParams.get('parentId') ?? ''
    const openOnly     = req.nextUrl.searchParams.get('open') === 'true'
    let query = supabaseAdmin
      .from('planned_payments')
      .select('id, name, amount, balance, date, month_year, parent_ids')
      .order('date', { ascending: false })
      .limit(200)

    if (nameFilter) query = query.ilike('name', `%${nameFilter}%`)
    if (parentId)   query = query.contains('parent_ids', [parentId])
    if (openOnly)   query = query.gt('balance', 0)

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

export async function PATCH(req: NextRequest) {
  try {
    const { id, amount } = await req.json()
    if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0) {
      return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })
    }

    const { data: existing, error: fetchErr } = await supabaseAdmin
      .from('planned_payments')
      .select('amount, balance')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) throw fetchErr ?? new Error('לא נמצא')

    const newAmount = Number(amount)
    const delta = newAmount - (existing.amount ?? 0)
    const newBalance = Math.max(0, (existing.balance ?? 0) + delta)

    const { error } = await supabaseAdmin
      .from('planned_payments')
      .update({ amount: newAmount, balance: newBalance })
      .eq('id', id)
    if (error) throw error

    return NextResponse.json({ success: true, amount: newAmount, balance: newBalance })
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

    // Apply any existing credit from parent
    const parentIdsList = Array.isArray(parentIds) ? parentIds : []
    for (const parentId of parentIdsList) {
      const { data: par } = await supabaseAdmin
        .from('parents')
        .select('pp_credit')
        .eq('id', parentId)
        .single()
      const credit = par?.pp_credit || 0
      if (credit > 0) {
        const applied    = Math.min(credit, Number(amount))
        const newBalance = Number(amount) - applied
        const newCredit  = credit - applied
        await Promise.all([
          supabaseAdmin.from('planned_payments').update({ balance: newBalance }).eq('id', id),
          supabaseAdmin.from('parents').update({ pp_credit: newCredit }).eq('id', parentId),
        ])
        break
      }
    }

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('planned-payments POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
