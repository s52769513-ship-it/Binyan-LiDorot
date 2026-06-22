import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date()
    const currentMonthYear = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    // Build 9-month window: 3 past + current + 5 future
    const months: string[] = []
    for (let i = -3; i <= 5; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() + i, 1)
      months.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`)
    }

    // Fetch planned_payments for tuition, salary and donation across all 9 months
    const [tuitionRes, salaryRes, donationRes, studentsRes, classesRes] = await Promise.all([
      supabaseAdmin
        .from('planned_payments')
        .select('month_year, amount, balance, parent_ids')
        .eq('pp_type', 'tuition')
        .in('month_year', months),

      supabaseAdmin
        .from('planned_payments')
        .select('month_year, amount, balance, parent_ids')
        .eq('pp_type', 'salary')
        .in('month_year', months),

      supabaseAdmin
        .from('planned_payments')
        .select('month_year, amount, balance')
        .eq('pp_type', 'donation')
        .in('month_year', months),

      supabaseAdmin.from('students').select('parent_ids, class_name, status'),
      supabaseAdmin.from('classes').select('class_name, framework'),
    ])

    // Build parent→framework map (by child count per framework)
    const classFrameworkMap: Record<string, string> = {}
    for (const c of classesRes.data ?? []) {
      if (c.framework) classFrameworkMap[c.class_name as string] = c.framework as string
    }
    const detectFramework = (cn: string) => {
      if (cn.includes('תלמוד תורה')) return 'תלמוד תורה'
      if (cn.includes('בית חינוך'))  return 'בית חינוך לבנות'
      return ''
    }
    const parentFwCounts: Record<string, Record<string, number>> = {}
    for (const s of studentsRes.data ?? []) {
      if (s.status !== 'פעיל') continue
      const cn = (s.class_name as string) ?? ''
      const fw = classFrameworkMap[cn] || detectFramework(cn)
      if (!fw) continue
      for (const pid of (s.parent_ids as string[]) ?? []) {
        if (!pid) continue
        if (!parentFwCounts[pid]) parentFwCounts[pid] = {}
        parentFwCounts[pid][fw] = (parentFwCounts[pid][fw] ?? 0) + 1
      }
    }

    // Aggregate by month
    type DeptBreakdown = Record<string, { planned: number; collected: number; remaining: number }>

    interface TuitionAcc {
      planned: number
      collected: number
      remaining: number
      byDept: DeptBreakdown
    }
    interface SalaryAcc {
      planned: number
      paid: number
      remaining: number
    }
    interface DonationAcc {
      planned: number
      collected: number
      remaining: number
    }

    const tuitionByMonth: Record<string, TuitionAcc> = {}
    const salaryByMonth: Record<string, SalaryAcc> = {}
    const donationByMonth: Record<string, DonationAcc> = {}

    for (const m of months) {
      tuitionByMonth[m] = { planned: 0, collected: 0, remaining: 0, byDept: {} }
      salaryByMonth[m] = { planned: 0, paid: 0, remaining: 0 }
      donationByMonth[m] = { planned: 0, collected: 0, remaining: 0 }
    }

    for (const row of tuitionRes.data ?? []) {
      const m = row.month_year as string
      if (!tuitionByMonth[m]) continue
      const amount = Number(row.amount) || 0
      const balance = Number(row.balance) || 0
      const collected = amount - balance

      tuitionByMonth[m].planned += amount
      tuitionByMonth[m].collected += collected
      tuitionByMonth[m].remaining += balance

      // dept breakdown — split proportionally by children per framework
      const pids = (row.parent_ids as string[]) ?? []
      const pid = pids[0] ?? ''
      const fwCounts = pid ? (parentFwCounts[pid] ?? {}) : {}
      const totalKids = Object.values(fwCounts).reduce((s, n) => s + n, 0)
      const fwEntries: Array<[string, number]> = totalKids > 0
        ? Object.entries(fwCounts).map(([fw, n]) => [fw, n / totalKids])
        : [['אחר', 1]]
      for (const [fw, weight] of fwEntries) {
        if (!tuitionByMonth[m].byDept[fw]) {
          tuitionByMonth[m].byDept[fw] = { planned: 0, collected: 0, remaining: 0 }
        }
        tuitionByMonth[m].byDept[fw].planned += amount * weight
        tuitionByMonth[m].byDept[fw].collected += collected * weight
        tuitionByMonth[m].byDept[fw].remaining += balance * weight
      }
    }

    for (const row of salaryRes.data ?? []) {
      const m = row.month_year as string
      if (!salaryByMonth[m]) continue
      const amount = Number(row.amount) || 0
      const balance = Number(row.balance) || 0
      const paid = amount - balance

      salaryByMonth[m].planned += amount
      salaryByMonth[m].paid += paid
      salaryByMonth[m].remaining += balance
    }

    for (const row of donationRes.data ?? []) {
      const m = row.month_year as string
      if (!donationByMonth[m]) continue
      const amount = Number(row.amount) || 0
      const balance = Number(row.balance) || 0
      donationByMonth[m].planned += amount
      donationByMonth[m].collected += amount - balance
      donationByMonth[m].remaining += balance
    }

    const result = months.map(m => {
      const t = tuitionByMonth[m]
      const s = salaryByMonth[m]
      const don = donationByMonth[m]
      const isPast = m !== currentMonthYear && months.indexOf(m) < months.indexOf(currentMonthYear)
      const isCurrent = m === currentMonthYear

      return {
        monthYear: m,
        isPast,
        isCurrent,
        tuition: {
          planned: Math.round(t.planned),
          collected: Math.round(t.collected),
          remaining: Math.round(t.remaining),
          collectionPct: t.planned > 0 ? Math.round((t.collected / t.planned) * 100) : 0,
          byDept: Object.fromEntries(
            Object.entries(t.byDept).map(([k, v]) => [
              k,
              {
                planned: Math.round(v.planned),
                collected: Math.round(v.collected),
                remaining: Math.round(v.remaining),
              },
            ])
          ),
        },
        salary: {
          planned: Math.round(s.planned),
          paid: Math.round(s.paid),
          remaining: Math.round(s.remaining),
        },
        donation: {
          planned: Math.round(don.planned),
          collected: Math.round(don.collected),
          remaining: Math.round(don.remaining),
        },
        net: Math.round(t.planned + don.planned - s.planned),
        netActual: Math.round(t.collected + don.collected - s.paid),
      }
    })

    return NextResponse.json(result)
  } catch (err) {
    console.error('cashflow error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת תזרים' }, { status: 500 })
  }
}
