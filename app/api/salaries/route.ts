import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  // Fetch women first to find parents linked to women with salary
  const womenRes = await supabaseAdmin
    .from('women')
    .select('id, name, parent_ids, salary_gross, base_hourly_rate, monthly_hours_decimal, fixed_bonus, status, role, is_fixed_salary')
    .order('name', { ascending: true })

  const allWomen = womenRes.data ?? []

  // Collect parent IDs of women who have a salary — so we show those parents too
  const parentIdsFromWifeSalary = [...new Set(
    allWomen
      .filter(w => (w.salary_gross || 0) > 0)
      .flatMap(w => w.parent_ids ?? [])
  )]

  let parentsQuery = supabaseAdmin
    .from('parents')
    .select(`
      id, name, first_name, last_name,
      base_hourly_rate, seniority_bonus_hourly, monthly_hours_decimal,
      fixed_bonus, exceptional_expenses, transport_reimbursement,
      deduct_tuition, show_spouse_salary, calculate_wife_tuition,
      salary_gross, salary_after_tuition,
      tuition_balance, tuition_total
    `)
    .order('last_name', { ascending: true })

  if (parentIdsFromWifeSalary.length > 0) {
    parentsQuery = parentsQuery.or(
      `salary_gross.gt.0,base_hourly_rate.gt.0,id.in.(${parentIdsFromWifeSalary.join(',')})`
    )
  } else {
    parentsQuery = parentsQuery.or('salary_gross.gt.0,base_hourly_rate.gt.0')
  }

  const parentsRes = await parentsQuery

  if (parentsRes.error) return NextResponse.json({ error: parentsRes.error.message }, { status: 500 })

  // Build woman-by-parent lookup
  const womanByParent: Record<string, Array<{
    id: string; name: string; salary_gross: number
    status: string; role: string[]
  }>> = {}
  for (const w of allWomen) {
    for (const pid of (w.parent_ids ?? [])) {
      if (!womanByParent[pid]) womanByParent[pid] = []
      womanByParent[pid].push(w)
    }
  }

  const employees = (parentsRes.data ?? []).map(p => {
    const wives = womanByParent[p.id] ?? []
    const wifeSalary = wives.reduce((s, w) => s + (w.salary_gross || 0), 0)
    const familySalary = p.show_spouse_salary ? (p.salary_gross || 0) + wifeSalary : (p.salary_gross || 0)
    const tuitionBalance    = Math.max(0, p.tuition_balance || 0)
    const tuitionDeduction  = p.deduct_tuition ? tuitionBalance : 0
    const effectiveOffset   = Math.min(familySalary, tuitionBalance)
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
      tuitionBalance,
      tuitionDeduction,
      effectiveOffset,
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
