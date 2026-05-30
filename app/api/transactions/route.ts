import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const plannedPaymentId = searchParams.get('plannedPaymentId') ?? ''

    // Simple path: fetch transactions linked to a specific planned payment
    if (plannedPaymentId) {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, type, date, month_year, notes, parent_ids, project_names')
        .eq('planned_payment_id', plannedPaymentId)
        .order('date', { ascending: false })
      if (error) throw error
      return NextResponse.json((data ?? []).map(t => ({
        id:           t.id as string,
        amount:       Number(t.amount) || 0,
        type:         String(t.type || ''),
        date:         String(t.date || ''),
        monthYear:    String(t.month_year || ''),
        notes:        String(t.notes || ''),
        parentIds:    (t.parent_ids as string[]) ?? [],
        projectNames: (t.project_names as string[]) ?? [],
        isCredit:     String(t.notes || '').startsWith('זיכוי'),
      })))
    }

    const page    = Math.max(0, parseInt(searchParams.get('page') ?? '0'))
    const search  = searchParams.get('search') ?? ''   // parent name search
    const month   = searchParams.get('month') ?? ''
    const type    = searchParams.get('type') ?? ''
    const project = searchParams.get('project') ?? ''
    const dir     = searchParams.get('dir') ?? 'desc'

    // If searching by parent name, first find matching parent IDs
    let parentIdFilter: string[] | null = null
    if (search.trim()) {
      const { data: found } = await supabaseAdmin
        .from('parents')
        .select('id')
        .or(`name.ilike.%${search.trim()}%,first_name.ilike.%${search.trim()}%,last_name.ilike.%${search.trim()}%`)
        .limit(50)
      parentIdFilter = (found ?? []).map(p => p.id)
    }

    let query = supabaseAdmin
      .from('transactions')
      .select('id, amount, type, date, month_year, notes, parent_ids, project_names', { count: 'exact' })
      .order('date', { ascending: dir !== 'desc' })
      .order('synced_at', { ascending: false })

    if (parentIdFilter !== null) {
      if (parentIdFilter.length === 0) {
        return NextResponse.json({ data: [], total: 0, months: [], types: [], projects: [] })
      }
      query = query.overlaps('parent_ids', parentIdFilter)
    }

    if (month)   query = query.eq('month_year', month)
    if (type)    query = query.eq('type', type)
    if (project) query = query.contains('project_names', [project])
    // Exclude internal credit rows from the general list
    query = query.not('notes', 'like', 'זיכוי%')

    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const { data, error, count } = await query
    if (error) throw error

    // Fetch parent names for these transactions
    const allParentIds = [...new Set((data ?? []).flatMap(t => (t.parent_ids as string[]) ?? []))]
    let parentMap: Record<string, string> = {}
    if (allParentIds.length > 0) {
      const { data: pData } = await supabaseAdmin.from('parents').select('id, name').in('id', allParentIds)
      parentMap = Object.fromEntries((pData ?? []).map(p => [p.id, p.name as string]))
    }

    // Fetch distinct months, types, projects for filter dropdowns
    const [{ data: allMonths }, { data: allTypes }, { data: allProjects }] = await Promise.all([
      supabaseAdmin.from('transactions').select('month_year').not('month_year', 'is', null).not('month_year', 'eq', ''),
      supabaseAdmin.from('transactions').select('type').not('type', 'is', null).not('type', 'eq', ''),
      supabaseAdmin.from('transactions').select('project_names').not('project_names', 'is', null),
    ])

    const months = [...new Set((allMonths ?? []).map(r => r.month_year).filter(Boolean))].sort((a: string, b: string) => {
      const [am, ay] = a.split('/').map(Number)
      const [bm, by] = b.split('/').map(Number)
      return by !== ay ? by - ay : bm - am
    })
    const types = [...new Set((allTypes ?? []).map(r => r.type).filter(Boolean))].sort()
    const projectSet = new Set<string>()
    for (const row of allProjects ?? []) {
      for (const name of (row.project_names as string[]) ?? []) {
        if (name) projectSet.add(name)
      }
    }
    const projects = [...projectSet].sort((a, b) => {
      if (a === 'בנין לדורות') return -1
      if (b === 'בנין לדורות') return 1
      return a.localeCompare(b, 'he')
    })

    const rows = (data ?? []).map(t => ({
      id:           t.id as string,
      amount:       Number(t.amount) || 0,
      type:         String(t.type || ''),
      date:         String(t.date || ''),
      monthYear:    String(t.month_year || ''),
      notes:        String(t.notes || ''),
      parentIds:    (t.parent_ids as string[]) ?? [],
      parentName:   ((t.parent_ids as string[])?.[0]) ? (parentMap[(t.parent_ids as string[])[0]] ?? '') : '',
      projectNames: (t.project_names as string[]) ?? [],
    }))

    return NextResponse.json({ data: rows, total: count ?? 0, months, types, projects })
  } catch (err) {
    console.error('transactions GET error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת תנועות' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { amount, type, date, monthYear, notes, parentIds, projectNames, plannedPaymentId } = body

    if (!amount || isNaN(Number(amount))) {
      return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    // Use far-future synced_at so prune_stale_rows (Airtable sync) never deletes local records
    const syncedAt = '2099-12-31T23:59:59.999Z'

    const row = {
      id,
      amount: Number(amount),
      type: type || '',
      date: date || null,
      month_year: monthYear || '',
      notes: notes || '',
      parent_ids: Array.isArray(parentIds) ? parentIds : [],
      project_ids: [],
      project_names: (Array.isArray(projectNames) ? projectNames : []).map((n: string) => n === 'משכורות' ? 'משכורת' : n),
      planned_payment_id: plannedPaymentId || null,
      synced_at: syncedAt,
    }
    const { error } = await supabaseAdmin.from('transactions').insert(row)
    if (error) throw error

    // Update planned payment balance if linked; store surplus as credit on parent
    if (plannedPaymentId) {
      try {
        const { data: pp } = await supabaseAdmin
          .from('planned_payments')
          .select('balance')
          .eq('id', plannedPaymentId)
          .single()
        if (pp) {
          const paid    = Math.abs(Number(amount))
          const oldBal  = pp.balance || 0
          const surplus = Math.max(0, paid - oldBal)
          await supabaseAdmin
            .from('planned_payments')
            .update({ balance: Math.max(0, oldBal - paid) })
            .eq('id', plannedPaymentId)

          if (surplus > 0 && Array.isArray(parentIds) && parentIds.length > 0) {
            const pid   = parentIds[0]
            const today = new Date().toISOString().split('T')[0]

            // Find ONE target PP: most overdue first, then closest to today
            const { data: openPPs } = await supabaseAdmin
              .from('planned_payments')
              .select('id, balance, date')
              .contains('parent_ids', [pid])
              .gt('balance', 0)
              .neq('id', plannedPaymentId)
              .order('date', { ascending: true })

            const overdue  = (openPPs ?? []).filter(pp => pp.date && pp.date < today)
            const upcoming = (openPPs ?? []).filter(pp => !pp.date || pp.date >= today)
            const targetPP = overdue[0] ?? upcoming[0] ?? null

            let remaining = surplus
            if (targetPP) {
              const applied = Math.min(remaining, targetPP.balance)
              await supabaseAdmin
                .from('planned_payments')
                .update({ balance: targetPP.balance - applied })
                .eq('id', targetPP.id)

              // Create a linked transaction so the target PP shows the payment
              await supabaseAdmin.from('transactions').insert({
                id:                 crypto.randomUUID(),
                amount:             applied,
                planned_payment_id: targetPP.id,
                parent_ids:         Array.isArray(parentIds) ? parentIds : [],
                project_names:      Array.isArray(projectNames) ? projectNames : [],
                date:               date || null,
                month_year:         monthYear || '',
                notes:              `זיכוי מעודף תשלום מ-${monthYear || ''}`,
                type:               type || '',
                synced_at:          '2099-12-31T23:59:59.999Z',
              })
              remaining -= applied
            }

            // Store any leftover as pp_credit for future payments
            if (remaining > 0) {
              const { data: par } = await supabaseAdmin.from('parents').select('pp_credit').eq('id', pid).single()
              await supabaseAdmin.from('parents').update({ pp_credit: (par?.pp_credit || 0) + remaining }).eq('id', pid)
            }
          }
        }
      } catch (ppErr) {
        console.error('planned payment balance update error:', ppErr)
        // Do not fail the transaction — it was already saved
      }
    }

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const message = (err as { message?: string })?.message ?? String(err)
    console.error('transaction POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
