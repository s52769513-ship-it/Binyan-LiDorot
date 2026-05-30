import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const nameFilter      = req.nextUrl.searchParams.get('name') ?? ''
    const parentId        = req.nextUrl.searchParams.get('parentId') ?? ''
    const idFilter        = req.nextUrl.searchParams.get('id') ?? ''
    const openOnly        = req.nextUrl.searchParams.get('open') === 'true'
    const withParentNames = req.nextUrl.searchParams.get('withParentNames') === 'true'
    const limitParam      = parseInt(req.nextUrl.searchParams.get('limit') ?? '200')

    let query = supabaseAdmin
      .from('planned_payments')
      .select('id, name, amount, balance, date, month_year, parent_ids')
      .order('date', { ascending: false })
      .limit(limitParam)

    if (idFilter)   query = query.eq('id', idFilter)
    if (nameFilter) query = query.ilike('name', `%${nameFilter}%`)
    if (parentId)   query = query.contains('parent_ids', [parentId])
    if (openOnly)   query = query.gt('balance', 0)

    const { data, error } = await query
    if (error) throw error

    // Optionally join parent names
    let parentMap: Record<string, string> = {}
    if (withParentNames) {
      const allParentIds = [...new Set((data ?? []).flatMap(p => (p.parent_ids as string[]) ?? []))]
      if (allParentIds.length > 0) {
        const { data: pData } = await supabaseAdmin.from('parents').select('id, name').in('id', allParentIds)
        parentMap = Object.fromEntries((pData ?? []).map(p => [p.id, p.name as string]))
      }
    }

    return NextResponse.json(
      (data ?? []).map(p => {
        const ids = (p.parent_ids as string[]) ?? []
        const parentName = withParentNames ? (ids.map(id => parentMap[id]).filter(Boolean).join(', ') || '') : undefined
        return {
          id: p.id,
          name: p.name ?? '',
          amount: p.amount ?? 0,
          balance: p.balance ?? 0,
          date: p.date ?? '',
          monthYear: p.month_year ?? '',
          parentIds: ids,
          ...(withParentNames ? { parentName } : {}),
        }
      })
    )
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })

    // Direct balance override (e.g. recomputed from linked transactions)
    if ('balance' in body && !('amount' in body)) {
      const { data: existing } = await supabaseAdmin
        .from('planned_payments').select('amount').eq('id', id).single()
      const cap = existing?.amount != null ? Number(existing.amount) : Infinity
      const newBalance = Math.min(cap, Math.max(0, Number(body.balance)))
      const { error } = await supabaseAdmin
        .from('planned_payments')
        .update({ balance: newBalance })
        .eq('id', id)
      if (error) throw error
      return NextResponse.json({ success: true, balance: newBalance })
    }

    // Amount change — adjust balance proportionally
    const { amount } = body
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
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
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
    try {
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
            // Create a visible credit transaction so the balance reduction is explained
            supabaseAdmin.from('transactions').insert({
              id:                 crypto.randomUUID(),
              amount:             applied,
              planned_payment_id: id,
              parent_ids:         [parentId],
              date:               new Date().toISOString().split('T')[0],
              month_year:         monthYear || '',
              notes:              'זיכוי עודף שמור',
              type:               '',
              project_ids:        [],
              project_names:      [],
              synced_at:          '2099-12-31T23:59:59.999Z',
            }),
          ])
          break
        }
      }
    } catch (creditErr) {
      console.error('pp credit apply error:', creditErr)
      // Do not fail the creation — payment was already saved
    }

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const message = (err as { message?: string })?.message ?? String(err)
    console.error('planned-payments POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'חסר מזהה' }, { status: 400 })
    // Delete linked transactions first, then the PP
    await supabaseAdmin.from('transactions').delete().eq('planned_payment_id', id)
    const { error } = await supabaseAdmin.from('planned_payments').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}
