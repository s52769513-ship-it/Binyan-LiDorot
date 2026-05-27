import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const [parentsRes, womenRes] = await Promise.all([
    supabaseAdmin
      .from('parents')
      .select(`
        id, name, first_name, last_name,
        base_hourly_rate, seniority_bonus_hourly, monthly_hours_decimal,
        fixed_bonus, exceptional_expenses, transport_reimbursement,
        deduct_tuition, show_spouse_salary, calculate_wife_tuition,
        salary_gross, salary_after_tuition,
        tuition_balance, tuition_total
      `)
      .or('salary_gross.gt.0,base_hourly_rate.gt.0')
      .order('last_name', { ascending: true }),

    supabaseAdmin
      .from('women')
      .select('id, name, parent_ids, salary_gross, base_hourly_rate, monthly_hours_decimal, fixed_bonus, status, role, is_fixed_salary')
      .order('name', { ascending: true }),
  ])

  if (parentsRes.error) return NextResponse.json({ error: parentsRes.error.message }, { status: 500 })

  // Build woman-by-parent lookup
  const womanByParent: Record<string, Array<{
    id: string; name: string; salary_gross: number
    status: string; role: string[]
  }>> = {}
  for (const w of (womenRes.data ?? [])) {
    for (const pid of (w.parent_ids ?? [])) {
      if (!womanByParent[pid]) womanByParent[pid] = []
      womanByParent[pid].push(w)
    }
  }

  const employees = (parentsRes.data ?? []).map(p => {
    const wives = womanByParent[p.id] ?? []
    const wifeSalary = wives.reduce((s, w) => s + (w.salary_gross || 0), 0)
    const familySalary = p.show_spouse_salary ? (p.salary_gross || 0) + wifeSalary : (p.salary_gross || 0)
    const tuitionDeduction = p.deduct_tuition ? Math.max(0, p.tuition_balance || 0) : 0
    return {
      id: p.id,
      name: p.name,
      firstName: p.first_name,
      lastName: p.last_name,
      baseHourlyRate:        p.base_hourly_rate || 0,
      seniorityBonusHourly:  p.seniority_bonus_hourly || 0,
      monthlyHoursDecimal:   p.monthly_hours_decimal || 0,
      fixedBonus:            p.fixed_bonus || 0,
      transportReimbursement: p.transport_reimbursement || 0,
      exceptionalExpenses:   p.exceptional_expenses || 0,
      deductTuition:         p.deduct_tuition || false,
      showSpouseSalary:      p.show_spouse_salary || false,
      salaryGross:           p.salary_gross || 0,
      salaryNet:             p.salary_after_tuition || 0,
      familySalary,
      tuitionDeduction,
      netAfterTuition:       familySalary - tuitionDeduction,
      wifeSalary,
      women: wives.map(w => ({
        id: w.id,
        name: w.name,
        salaryGross: w.salary_gross || 0,
        status: w.status || '',
        role: w.role || [],
      })),
    }
  })

  return NextResponse.json(employees)
}
