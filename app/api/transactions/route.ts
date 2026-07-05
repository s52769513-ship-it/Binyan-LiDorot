import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { insertSpilloverRows } from '@/lib/ppPayments'

const PAGE_SIZE = 50

// supabase-js's .contains() builds the Postgres array literal as a naive
// `{${value.join(',')}}` with no escaping — a category/project name
// containing a `"` (common in Hebrew acronyms like תשב"ר) breaks the array
// literal syntax and the query fails server-side. Build it correctly here
// and pass it through .filter() (which uses the value as-is) instead.
function pgTextArrayLiteral(values: string[]): string {
  const escape = (v: string) => `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`
  return `{${values.map(escape).join(',')}}`
}

function sumAmounts(rows: { amount: number | string | null }[]): { totalIncome: number; totalExpense: number } {
  let totalIncome = 0, totalExpense = 0
  for (const r of rows) {
    const amt = Number(r.amount) || 0
    if (amt > 0) totalIncome += amt
    else totalExpense += amt
  }
  return { totalIncome, totalExpense }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const plannedPaymentId    = searchParams.get('plannedPaymentId') ?? ''
    const standingOrderId     = searchParams.get('standingOrderId')  ?? ''
    const sourceTransactionId = searchParams.get('sourceTransactionId') ?? ''

    // Spillover rows created from a specific source transaction — used by the
    // transaction detail view to show exactly what the payment covered
    if (sourceTransactionId) {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, date, month_year, notes, planned_payment_id')
        .eq('source_transaction_id', sourceTransactionId)
        .order('date', { ascending: true })
      if (error) return NextResponse.json([]) // column may not be migrated yet
      const ppIds = [...new Set((data ?? []).map(t => t.planned_payment_id).filter(Boolean))] as string[]
      let ppMap: Record<string, string> = {}
      if (ppIds.length > 0) {
        const { data: ppData } = await supabaseAdmin
          .from('planned_payments').select('id, name').in('id', ppIds)
        ppMap = Object.fromEntries((ppData ?? []).map(p => [p.id as string, (p.name as string) ?? '']))
      }
      return NextResponse.json((data ?? []).map(t => ({
        id:        t.id as string,
        amount:    Number(t.amount) || 0,
        date:      String(t.date || ''),
        monthYear: String(t.month_year || ''),
        notes:     String(t.notes || ''),
        ppId:      (t.planned_payment_id as string) ?? null,
        ppName:    t.planned_payment_id ? (ppMap[t.planned_payment_id as string] ?? '') : '',
      })))
    }

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

    // Fetch transactions linked to a specific standing order
    if (standingOrderId) {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, type, date, month_year, notes, parent_ids, project_names, planned_payment_id')
        .eq('standing_order_id', standingOrderId)
        .order('date', { ascending: false })
      if (error) throw error
      return NextResponse.json((data ?? []).map(t => ({
        id:               t.id as string,
        amount:           Number(t.amount) || 0,
        type:             String(t.type || ''),
        date:             String(t.date || ''),
        monthYear:        String(t.month_year || ''),
        notes:            String(t.notes || ''),
        parentIds:        (t.parent_ids as string[]) ?? [],
        projectNames:     (t.project_names as string[]) ?? [],
        plannedPaymentId: t.planned_payment_id ?? null,
        isCredit:         String(t.notes || '').startsWith('זיכוי'),
      })))
    }

    const page      = Math.max(0, parseInt(searchParams.get('page') ?? '0'))
    const search    = searchParams.get('search') ?? ''   // parent name search
    const parentId  = searchParams.get('parentId') ?? ''
    const month     = searchParams.get('month') ?? ''
    const type      = searchParams.get('type') ?? ''
    const project   = searchParams.get('project') ?? ''
    const dir       = searchParams.get('dir') ?? 'desc'

    // Direct parentId filter takes priority
    if (parentId) {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, type, date, month_year, notes, parent_ids, project_names')
        .contains('parent_ids', [parentId])
        .order('date', { ascending: false })
        .limit(500)
      if (error) throw error
      const { totalIncome, totalExpense } = sumAmounts(data ?? [])
      return NextResponse.json({
        data: (data ?? []).map(t => ({
          id: t.id, amount: t.amount, type: t.type, date: t.date,
          monthYear: t.month_year, notes: t.notes ?? '',
          parentIds: t.parent_ids ?? [], projectNames: t.project_names ?? [],
        })),
        total: (data ?? []).length, months: [], types: [], projects: [], totalIncome, totalExpense,
      })
    }

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
      .select('id, amount, type, date, month_year, notes, parent_ids, project_names, planned_payment_id', { count: 'exact' })
      .order('date', { ascending: dir !== 'desc' })
      .order('synced_at', { ascending: false })

    // Lightweight parallel query (amount only, no pagination) so the summary
    // totals reflect every matching row, not just the current page.
    let sumQuery = supabaseAdmin.from('transactions').select('amount')

    if (parentIdFilter !== null) {
      if (parentIdFilter.length === 0) {
        return NextResponse.json({ data: [], total: 0, months: [], types: [], projects: [], totalIncome: 0, totalExpense: 0 })
      }
      query    = query.overlaps('parent_ids', parentIdFilter)
      sumQuery = sumQuery.overlaps('parent_ids', parentIdFilter)
    }

    if (month)   { query = query.eq('month_year', month);                    sumQuery = sumQuery.eq('month_year', month) }
    if (type)    { query = query.eq('type', type);                           sumQuery = sumQuery.eq('type', type) }
    if (project) {
      const lit = pgTextArrayLiteral([project])
      query    = query.filter('project_names', 'cs', lit)
      sumQuery = sumQuery.filter('project_names', 'cs', lit)
    }
    // Exclude internal credit rows from the general list
    query    = query.not('notes', 'like', 'זיכוי%')
    sumQuery = sumQuery.not('notes', 'like', 'זיכוי%')

    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const [{ data, error, count }, { data: sumData, error: sumError }] = await Promise.all([query, sumQuery])
    if (error) throw error
    if (sumError) throw sumError
    const { totalIncome, totalExpense } = sumAmounts(sumData ?? [])

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
      plannedPaymentId: t.planned_payment_id ?? null,
    }))

    return NextResponse.json({ data: rows, total: count ?? 0, months, types, projects, totalIncome, totalExpense })
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
              .select('id, balance, date, month_year, pp_type')
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

              // Visible spillover row on the target PP, pointing back at the
              // source transaction so its detail view can show the breakdown
              await insertSpilloverRows([{
                parentId:    pid,
                ppId:        targetPP.id,
                ppMonthYear: targetPP.month_year ?? '',
                ppType:      targetPP.pp_type ?? null,
                amount:      applied,
                sourceTxId:  id,
                sourceLabel: monthYear || date || null,
                date:        date || null,
              }])
              remaining -= applied
            }

            // Store any leftover as credit_balance for future payments
            if (remaining > 0) {
              const { data: par } = await supabaseAdmin.from('parents').select('credit_balance').eq('id', pid).single()
              await supabaseAdmin.from('parents').update({ credit_balance: (Number(par?.credit_balance) || 0) + remaining }).eq('id', pid)
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
