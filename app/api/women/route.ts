import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get('search') ?? ''

  let query = supabaseAdmin
    .from('women')
    .select('id, name, parent_ids, base_hourly_rate, monthly_hours_decimal, fixed_bonus, exceptional_expenses, salary_gross, is_fixed_salary, status, role, notes')
    .order('name', { ascending: true })

  if (search) query = query.ilike('name', `%${search}%`)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const allParentIds = [...new Set((data ?? []).flatMap(w => (w.parent_ids as string[]) ?? []))]
  const parentsRes = allParentIds.length > 0
    ? await supabaseAdmin.from('parents').select('id, name').in('id', allParentIds)
    : { data: [] as Array<{ id: string; name: string }> }
  const parentNameMap: Record<string, string> = {}
  for (const p of parentsRes.data ?? []) parentNameMap[p.id as string] = p.name as string

  return NextResponse.json(
    (data ?? []).map(w => ({
      id: w.id,
      name: w.name,
      parentIds: (w.parent_ids as string[]) ?? [],
      parentName: ((w.parent_ids as string[]) ?? []).map((pid: string) => parentNameMap[pid]).filter(Boolean).join(', '),
      baseHourlyRate:      Number(w.base_hourly_rate) || 0,
      monthlyHoursDecimal: Number(w.monthly_hours_decimal) || 0,
      fixedBonus:          Number(w.fixed_bonus) || 0,
      exceptionalExpenses: Number(w.exceptional_expenses) || 0,
      salaryGross:         Number(w.salary_gross) || 0,
      isFixedSalary:       Boolean(w.is_fixed_salary),
      status:              w.status ?? '',
      role:                (w.role as string[]) ?? [],
      notes:               w.notes ?? '',
    }))
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { name, parentId, salaryGross = 0, baseHourlyRate = 0, monthlyHoursDecimal = 0, fixedBonus = 0, exceptionalExpenses = 0 } = body
    if (!name?.trim()) return NextResponse.json({ error: 'חסר שם' }, { status: 400 })
    if (!parentId)     return NextResponse.json({ error: 'חסר הורה' }, { status: 400 })

    const id = crypto.randomUUID()
    const { error } = await supabaseAdmin.from('women').insert({
      id,
      name: name.trim(),
      parent_ids: [parentId],
      salary_gross: Number(salaryGross) || 0,
      base_hourly_rate: Number(baseHourlyRate) || 0,
      monthly_hours_decimal: Number(monthlyHoursDecimal) || 0,
      fixed_bonus: Number(fixedBonus) || 0,
      exceptional_expenses: Number(exceptionalExpenses) || 0,
      synced_at: '2099-12-31T23:59:59.999Z',
    })
    if (error) throw error
    return NextResponse.json({ success: true, id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
