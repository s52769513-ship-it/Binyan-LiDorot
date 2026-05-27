import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const FIELD_MAP: Record<string, string> = {
  name:                 'name',
  salaryGross:          'salary_gross',
  salaryTotal:          'salary_total',
  baseHourlyRate:       'base_hourly_rate',
  fixedBonus:           'fixed_bonus',
  monthlyHoursDecimal:  'monthly_hours_decimal',
  exceptionalExpenses:  'exceptional_expenses',
  isFixedSalary:        'is_fixed_salary',
  status:               'status',
  role:                 'role',
  notes:                'notes',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const update: Record<string, unknown> = {}
    for (const [key, dbKey] of Object.entries(FIELD_MAP)) {
      if (key in body) update[dbKey] = body[key]
    }
    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })
    const { error } = await supabaseAdmin.from('women').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
