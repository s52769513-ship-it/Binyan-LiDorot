import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcPPs } from '@/app/api/parents/[id]/recalc-pp/route'
import { recalcDonationPPs } from '@/app/api/parents/[id]/recalc-donation-pp/route'
import { tuitionMonthForSalary } from '@/lib/months'
import { softDelete } from '@/lib/trash'

export async function GET(req: NextRequest) {
  try {
    const nameFilter      = req.nextUrl.searchParams.get('name') ?? ''
    const ppTypeFilter    = req.nextUrl.searchParams.get('ppType') ?? ''
    const monthYearFilter = req.nextUrl.searchParams.get('monthYear') ?? ''
    const parentId        = req.nextUrl.searchParams.get('parentId') ?? ''
    const idFilter        = req.nextUrl.searchParams.get('id') ?? ''
    const openOnly        = req.nextUrl.searchParams.get('open') === 'true'
    const withParentNames = req.nextUrl.searchParams.get('withParentNames') === 'true'
    const limitParam      = parseInt(req.nextUrl.searchParams.get('limit') ?? '200')

    let query = supabaseAdmin
      .from('planned_payments')
      .select('id, name, pp_type, amount, balance, date, month_year, parent_ids')
      .order('date', { ascending: false })
      .limit(limitParam)

    if (idFilter)        query = query.eq('id', idFilter)
    if (nameFilter)      query = query.ilike('name', `%${nameFilter}%`)
    if (ppTypeFilter)    query = query.eq('pp_type', ppTypeFilter)
    if (monthYearFilter) query = query.eq('month_year', monthYearFilter)
    if (parentId)        query = query.contains('parent_ids', [parentId])
    if (openOnly)        query = query.gt('balance', 0)

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
          ppType: (p.pp_type ?? (p.name === 'משכורת' ? 'salary' : 'tuition')) as string,
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
      .select('amount, balance, pp_type, parent_ids, month_year')
      .eq('id', id)
      .single()
    if (fetchErr || !existing) throw fetchErr ?? new Error('לא נמצא')

    const newAmount = Number(amount)
    const oldAmount = Number(existing.amount) || 0
    const delta = newAmount - oldAmount
    const newBalance = Math.max(0, (existing.balance ?? 0) + delta)

    const { error } = await supabaseAdmin
      .from('planned_payments')
      .update({ amount: newAmount, balance: newBalance })
      .eq('id', id)
    if (error) throw error

    // If this is a salary PP and the amount decreased, recalculate offsets
    if (existing.pp_type === 'salary' && delta < 0) {
      try {
        const parentId = (existing.parent_ids as string[])?.[0]
        const monthYear = existing.month_year as string
        // משכורת חודש S מקוזזת מול שכ"ל חודש T = S+1
        const tuitionMY = tuitionMonthForSalary(monthYear)

        // Find existing salary-side offset transactions linked to this PP
        const { data: salaryOffsetTxs } = await supabaseAdmin
          .from('transactions')
          .select('id, amount')
          .eq('planned_payment_id', id)
          .in('type', ['קיזוז משכר לימוד', 'ניכוי שכ"ל'])

        if ((salaryOffsetTxs ?? []).length > 0 && parentId) {
          const oldOffset = (salaryOffsetTxs ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)

          // Find tuition PP for this parent/month to know tuition amount (בחודש השכ"ל T)
          const { data: tuitionPPs } = await supabaseAdmin
            .from('planned_payments')
            .select('id, amount, balance')
            .contains('parent_ids', [parentId])
            .eq('month_year', tuitionMY)
            .eq('pp_type', 'tuition')
            .limit(1)

          const tuitionPP = tuitionPPs?.[0]
          const tuitionAmount = tuitionPP ? Number(tuitionPP.amount) : oldOffset

          const newOffset = Math.min(newAmount, tuitionAmount)
          const offsetDelta = newOffset - oldOffset  // negative = we owe back to tuition

          if (offsetDelta < 0 && tuitionPP) {
            // Update salary-side offset transaction (take the first one, adjust)
            const mainTx = (salaryOffsetTxs ?? [])[0]
            await supabaseAdmin.from('transactions')
              .update({ amount: Math.max(0, Number(mainTx.amount) + offsetDelta) })
              .eq('id', mainTx.id)

            // Update tuition-side offset transactions (בחודש השכ"ל T)
            const { data: tuitionOffsetTxs } = await supabaseAdmin
              .from('transactions')
              .select('id, amount')
              .contains('parent_ids', [parentId])
              .eq('month_year', tuitionMY)
              .in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל'])
            if ((tuitionOffsetTxs ?? []).length > 0) {
              const mainTuitionTx = (tuitionOffsetTxs ?? [])[0]
              await supabaseAdmin.from('transactions')
                .update({ amount: Math.max(0, Number(mainTuitionTx.amount) + offsetDelta) })
                .eq('id', mainTuitionTx.id)
            }

            // Return difference to tuition PP balance
            await supabaseAdmin.from('planned_payments')
              .update({ balance: Math.min(tuitionAmount, Number(tuitionPP.balance) - offsetDelta) })
              .eq('id', tuitionPP.id)

            // Return difference to parent tuition_balance
            const { data: par } = await supabaseAdmin.from('parents').select('tuition_balance').eq('id', parentId).single()
            if (par) {
              await supabaseAdmin.from('parents')
                .update({ tuition_balance: Math.max(0, Number(par.tuition_balance) - offsetDelta) })
                .eq('id', parentId)
            }
          }
        }
      } catch { /* offset recalc is best-effort */ }
    }

    // Recalc credits for affected parents when a payable PP changes
    if (existing.pp_type !== 'salary') {
      const pids = (existing.parent_ids as string[]) ?? []
      const recalc = existing.pp_type === 'donation' ? recalcDonationPPs : recalcPPs
      for (const pid of pids) {
        void recalc(pid).catch(() => {})
      }
    }

    return NextResponse.json({ success: true, amount: newAmount, balance: newBalance })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { amount, name, date, monthYear, parentIds, ppType } = body

    if (!amount || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    // Use far-future synced_at so prune_stale_rows (Airtable sync) never deletes local records
    const syncedAt = '2099-12-31T23:59:59.999Z'

    const resolvedPPType = ppType ?? (name === 'משכורת' ? 'salary' : 'tuition')
    const row = {
      id,
      amount: Number(amount),
      name: name || '',
      pp_type: resolvedPPType,
      date: date || null,
      month_year: monthYear || '',
      balance: Number(amount),   // new planned payment → full amount is balance
      parent_ids: Array.isArray(parentIds) ? parentIds : [],
      synced_at: syncedAt,
    }
    const { error } = await supabaseAdmin.from('planned_payments').insert(row)
    if (error) throw error

    // Apply existing stored credit (of the matching debt type) to the new PP.
    // Awaited (not fire-and-forget) so the caller's reload reflects a PP that
    // has already consumed any stored credit — otherwise a new PP shows its
    // full balance until something else triggers a recalc.
    const parentIdsList = Array.isArray(parentIds) ? parentIds : []
    if (resolvedPPType !== 'salary') {
      const recalc = resolvedPPType === 'donation' ? recalcDonationPPs : recalcPPs
      for (const pid of parentIdsList) {
        try { await recalc(pid) } catch { /* best-effort */ }
      }
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
    const deletedBy = req.headers.get('x-auth-email') || 'unknown'

    // תנועות מקושרות ל-PP הזה עוברות גם הן לאשפה (ניתן לשחזר כל אחת בנפרד)
    const { data: linkedTxs } = await supabaseAdmin
      .from('transactions').select('*').eq('planned_payment_id', id)
    for (const tx of linkedTxs ?? []) {
      await softDelete(supabaseAdmin, 'transaction', tx.id as string, tx, deletedBy)
    }

    const { data: pp } = await supabaseAdmin.from('planned_payments').select('*').eq('id', id).single()
    if (!pp) return NextResponse.json({ error: 'תשלום מתוכנן לא נמצא' }, { status: 404 })
    await softDelete(supabaseAdmin, 'planned_payment', id, pp, deletedBy)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}
