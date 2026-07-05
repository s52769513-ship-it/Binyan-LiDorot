import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isCashFundTransaction } from '@/lib/cashFund'

export async function GET(req: NextRequest) {
  try {
    const period = req.nextUrl.searchParams.get('period') ?? '6'

    // Build months list
    const now = new Date()
    let months: string[] = []

    if (period === 'all') {
      const { data: monthRows } = await supabaseAdmin
        .from('transactions')
        .select('month_year')
        .not('month_year', 'is', null)
        .not('month_year', 'eq', '')
      const unique = [...new Set((monthRows ?? []).map((r: { month_year: string }) => r.month_year))]
      months = (unique as string[])
        .filter((m: string) => /^\d{2}\/\d{4}$/.test(m))
        .sort((a: string, b: string) => {
          const [am, ay] = a.split('/').map(Number)
          const [bm, by] = b.split('/').map(Number)
          return ay !== by ? ay - by : am - bm
        })
    } else {
      const count = parseInt(period) || 6
      for (let i = count - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        months.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`)
      }
    }

    if (months.length === 0) {
      return NextResponse.json({
        monthlyData: [], typeBreakdown: [], bankClassBreakdown: [], paymentMethodBreakdown: [],
        totalIncome: 0, totalExpenses: 0, totalBalance: 0, periodMonths: 0,
      })
    }

    const { data: allTxs } = await supabaseAdmin
      .from('transactions')
      .select('month_year, type, amount, project_names, bank_classification, payment_method')
      .in('month_year', months)
    const allTxRes = { data: allTxs }

    // Salary payments are stored as positive amounts (project 'משכורת') —
    // they are expenses, not income. ניכוי שכ"ל mirrors the tuition-side offset
    // and belongs on the expense side (double-entry: offset = tuition income + salary expense).
    const SALARY_SIDE_TYPES = new Set(['ניכוי שכ"ל', 'קיזוז משכר לימוד'])
    const isSalaryExpense = (r: { type?: string | null; project_names?: unknown }) =>
      SALARY_SIDE_TYPES.has(String(r.type ?? '')) ||
      ((r.project_names as string[] | null) ?? []).includes('משכורת')

    // Monthly income / expenses
    const incByMonth: Record<string, number> = {}
    const expByMonth: Record<string, number> = {}
    for (const m of months) { incByMonth[m] = 0; expByMonth[m] = 0 }

    for (const r of allTxs ?? []) {
      if (!(r.month_year in incByMonth)) continue
      // קופת מזומנים: העברה שמוחזרת במזומן - שינוי צורה, לא הכנסה/הוצאה אמיתית
      if (isCashFundTransaction(r.project_names as string[] | null)) continue
      const amount = Number(r.amount) || 0
      if (amount < 0) expByMonth[r.month_year] += Math.abs(amount)
      else if (isSalaryExpense(r)) expByMonth[r.month_year] += amount
      else incByMonth[r.month_year] += amount
    }

    const monthlyData = months.map(m => ({
      month: m,
      income: Math.round(incByMonth[m]),
      expenses: Math.round(expByMonth[m]),
      balance: Math.round(incByMonth[m] - expByMonth[m]),
    }))

    // Type breakdown (income only)
    const typeMap: Record<string, number> = {}
    // Bank classification (income only)
    const bankMap: Record<string, number> = {}
    // Payment method (income only)
    const methodMap: Record<string, number> = {}

    for (const r of allTxRes.data ?? []) {
      const amount = Number(r.amount) || 0
      if (amount <= 0 || isSalaryExpense(r)) continue // only income for breakdowns

      const type = String(r.type || 'אחר') || 'אחר'
      const bank = String(r.bank_classification || '') || 'לא מסווג'
      const method = String(r.payment_method || '') || 'לא מוגדר'

      typeMap[type] = (typeMap[type] ?? 0) + amount
      bankMap[bank] = (bankMap[bank] ?? 0) + amount
      methodMap[method] = (methodMap[method] ?? 0) + amount
    }

    const typeBreakdown = Object.entries(typeMap)
      .map(([type, amount]) => ({ type, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)

    const bankClassBreakdown = Object.entries(bankMap)
      .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)

    const paymentMethodBreakdown = Object.entries(methodMap)
      .map(([name, amount]) => ({ name, amount: Math.round(amount) }))
      .sort((a, b) => b.amount - a.amount)

    const totalIncome = Math.round(monthlyData.reduce((s, m) => s + m.income, 0))
    const totalExpenses = Math.round(monthlyData.reduce((s, m) => s + m.expenses, 0))

    return NextResponse.json({
      monthlyData,
      typeBreakdown,
      bankClassBreakdown,
      paymentMethodBreakdown,
      totalIncome,
      totalExpenses,
      totalBalance: totalIncome - totalExpenses,
      periodMonths: months.length,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
