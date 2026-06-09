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
    const hasChildren = searchParams.get('hasChildren') === 'true'
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

    const validSort = ['last_name', 'city', 'children_count', 'tuition_total', 'tuition_balance']
    const safeSort = validSort.includes(sort) ? sort : 'last_name'
    query = query.order(safeSort, { ascending: dir !== 'desc' })
    query = query.range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1)

    const [{ data, error, count }, { data: allStatuses }] = await Promise.all([
      query,
      supabaseAdmin.from('parents').select('status'),
    ])
    if (error) throw error

    const statusSet = new Set<string>()
    for (const row of allStatuses ?? []) {
      for (const s of Array.isArray(row.status) ? row.status : []) {
        if (s) statusSet.add(s)
      }
    }
    const statusOptions = [...statusSet].sort((a, b) => a.localeCompare(b, 'he'))

    const mapped = (data ?? []).map(p => ({
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
