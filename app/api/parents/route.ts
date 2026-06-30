import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const PAGE_SIZE = 50

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const page   = Math.max(0, parseInt(searchParams.get('page') ?? '0'))
    const search = searchParams.get('search') ?? ''
    const status      = searchParams.get('status') ?? ''
    const debt        = searchParams.get('debt') ?? 'all'
    const city        = searchParams.get('city') ?? ''
    const hasChildren   = searchParams.get('hasChildren') === 'true'
    const deductTuition = searchParams.get('deductTuition') === 'true'
    const hasGaps       = searchParams.get('hasGaps') === 'true'
    const sort   = searchParams.get('sort') ?? 'last_name'
    const dir    = searchParams.get('dir') ?? 'asc'

    let query = supabaseAdmin
      .from('parents')
      .select(
        'id, name, first_name, last_name, father_phone, mother_phone, email, city, status, children_count, tuition_total, tuition_balance, id_number',
        { count: 'exact' }
      )

    if (search.trim()) {
      const q = search.trim()
      query = query.or(
        `name.ilike.%${q}%,city.ilike.%${q}%,father_phone.ilike.%${q}%,mother_phone.ilike.%${q}%,id_number.ilike.%${q}%`
      )
    }

    if (status) {
      query = query.contains('status', [status])
    }

    if (debt === 'debt') {
      query = query.gt('tuition_balance', 0)
    } else if (debt === 'credit') {
      query = query.lt('tuition_balance', 0)
    }

    if (city) {
      query = query.ilike('city', `%${city}%`)
    }

    if (hasChildren) {
      query = query.gt('children_count', 0)
    }

    if (deductTuition) {
      query = query.eq('deduct_tuition', true)
    }

    const validSort = ['last_name', 'city', 'children_count', 'tuition_total', 'tuition_balance']
    const safeSort = validSort.includes(sort) ? sort : 'last_name'
    query = query.order(safeSort, { ascending: dir !== 'desc' })
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const todayStr = new Date().toISOString().slice(0, 10)

    const [{ data, error, count }, { data: allStatuses }] = await Promise.all([
      query,
      supabaseAdmin.from('parents').select('status'),
    ])
    if (error) throw error

    // Compute overdue balance (past-date PPs only) per parent
    const parentIds = (data ?? []).map(p => p.id as string)
    const overdueByParent: Record<string, number> = {}
    const parentGaps: Record<string, boolean> = {}
    if (parentIds.length > 0) {
      const { data: overduePPs } = await supabaseAdmin
        .from('planned_payments')
        .select('parent_ids, balance')
        .eq('pp_type', 'tuition')
        .gt('balance', 0)
        .lt('date', todayStr)
        .gte('date', '2026-04-01')
        .overlaps('parent_ids', parentIds)
      const parentIdSet = new Set(parentIds)
      for (const pp of overduePPs ?? []) {
        for (const pid of (pp.parent_ids as string[]) ?? []) {
          if (parentIdSet.has(pid)) {
            overdueByParent[pid] = (overdueByParent[pid] ?? 0) + Number(pp.balance)
          }
        }
      }

      // Detect gaps for each parent
      const { data: allPPs } = await supabaseAdmin
        .from('planned_payments')
        .select('parent_ids, month_year')
        .eq('pp_type', 'tuition')
        .overlaps('parent_ids', parentIds)

      for (const parentId of parentIds) {
        const parentPPs = (allPPs ?? [])
          .filter(pp => (pp.parent_ids as string[])?.includes(parentId))
          .map(pp => pp.month_year as string)
          .filter(Boolean)

        if (parentPPs.length < 2) {
          parentGaps[parentId] = false
          continue
        }

        const months = parentPPs.map(my => {
          const [m, y] = my.split('/').map(Number)
          return y * 12 + m
        }).sort((a, b) => a - b)

        let hasGap = false
        for (let i = 0; i < months.length - 1; i++) {
          if (months[i + 1] - months[i] > 1) {
            hasGap = true
            break
          }
        }
        parentGaps[parentId] = hasGap
      }
    }

    // Filter by gaps if needed
    let filteredData = data ?? []
    if (hasGaps) {
      filteredData = filteredData.filter(p => parentGaps[p.id as string] === true)
    }

    const statusSet = new Set<string>()
    for (const row of allStatuses ?? []) {
      for (const s of Array.isArray(row.status) ? row.status : []) {
        if (s) statusSet.add(s)
      }
    }
    const statusOptions = [...statusSet].sort((a, b) => a.localeCompare(b, 'he'))

    const mapped = filteredData.map(p => ({
      id: p.id,
      name: p.name ?? '',
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      fatherPhone: p.father_phone ?? '',
      motherPhone: p.mother_phone ?? '',
      email: p.email ?? '',
      city: p.city ?? '',
      status: Array.isArray(p.status) ? p.status : [],
      childrenCount: p.children_count ?? 0,
      tuitionTotal: p.tuition_total ?? 0,
      tuitionBalance: p.tuition_balance ?? 0,
      overdueBalance: Math.round(overdueByParent[p.id as string] ?? 0),
    }))

    return NextResponse.json({ data: mapped, total: count ?? 0, statusOptions })
  } catch (err) {
    console.error('parents error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת הורים' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { firstName, lastName, motherName, fatherPhone, motherPhone, email, address, building, city, status, notes } = body

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'שם פרטי ושם משפחה הם שדות חובה' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    // Use far-future synced_at so prune_stale_rows (Airtable sync) never deletes local records
    const syncedAt = '2099-12-31T23:59:59.999Z'

    const row = {
      id,
      name: [firstName, lastName].filter(Boolean).join(' '),
      first_name: firstName || '',
      last_name:  lastName  || '',
      mother_name: motherName  || '',
      father_phone: fatherPhone || '',
      mother_phone: motherPhone || '',
      email:       email   || '',
      address:     address || '',
      building:    building || '',
      city:        city    || '',
      status:      Array.isArray(status) ? status : (status ? [status] : ['פעיל']),
      notes:       notes   || '',
      children_count: 0,
      tuition_total:  0,
      tuition_balance: 0,
      synced_at: syncedAt,
    }
    const { error } = await supabaseAdmin.from('parents').insert(row)
    if (error) throw error

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('parent POST error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
