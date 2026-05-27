import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('women')
    .select('id, name, parent_ids, base_hourly_rate, monthly_hours_decimal, fixed_bonus, exceptional_expenses, salary_gross, is_fixed_salary, status, role, notes')
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch parent names for display
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
