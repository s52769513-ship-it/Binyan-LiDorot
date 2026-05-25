import { NextResponse } from 'next/server'
import { fetchAirtableRecords, TABLES, T, D, PP } from '@/lib/airtable'

export async function GET() {
  try {
    const [debts, plannedPayments, transactions] = await Promise.all([
      fetchAirtableRecords(TABLES.DEBTS, { fields: [D.AMOUNT] }),

      fetchAirtableRecords(TABLES.PLANNED_PAYMENTS, {
        fields: [PP.AMOUNT, PP.BALANCE, PP.DATE, PP.MONTH_YEAR],
      }),

      fetchAirtableRecords(TABLES.TRANSACTIONS, {
        fields: [T.AMOUNT, T.DATE, T.MONTH_YEAR, T.TYPE],
        filterByFormula: `IS_AFTER({${T.DATE}}, DATEADD(TODAY(), -365, 'days'))`,
      }),
    ])

    const totalDebts = debts.reduce(
      (sum, r) => sum + (Number(r.fields[D.AMOUNT]) || 0),
      0
    )

    const totalPlannedPayments = plannedPayments.reduce((sum, r) => {
      const balance = Number(r.fields[PP.BALANCE]) || 0
      return sum + (balance > 0 ? balance : 0)
    }, 0)

    const now = new Date()
    const currentMonthYear = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    const currentMonthTransactions = transactions
      .filter(r => r.fields[T.MONTH_YEAR] === currentMonthYear)
      .reduce((sum, r) => sum + (Number(r.fields[T.AMOUNT]) || 0), 0)

    // Build last-6-month map
    const monthlyMap = new Map<string, number>()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      monthlyMap.set(key, 0)
    }

    transactions.forEach(r => {
      const my = r.fields[T.MONTH_YEAR] as string
      if (my && monthlyMap.has(my)) {
        monthlyMap.set(my, (monthlyMap.get(my) || 0) + (Number(r.fields[T.AMOUNT]) || 0))
      }
    })

    const monthlyData = Array.from(monthlyMap.entries()).map(([month, amount]) => ({
      month,
      amount: Math.round(amount),
    }))

    return NextResponse.json({
      totalDebts: Math.round(totalDebts),
      totalPlannedPayments: Math.round(totalPlannedPayments),
      currentMonthTransactions: Math.round(currentMonthTransactions),
      monthlyData,
    })
  } catch (err) {
    console.error('summary error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת סיכום' }, { status: 500 })
  }
}
