import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date()
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      .toISOString()
      .split('T')[0]

    const currentMonthYear = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    const [debtsRes, plannedRes, transactionsRes, lastSyncRes] = await Promise.all([
      supabase.from('debts').select('amount'),

      supabase.from('planned_payments').select('balance'),

      supabase
        .from('transactions')
        .select('amount, month_year')
        .gte('date', sixMonthsAgo),

      supabase
        .from('sync_log')
        .select('synced_at, status')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    if (debtsRes.error) throw debtsRes.error
    if (plannedRes.error) throw plannedRes.error
    if (transactionsRes.error) throw transactionsRes.error

    const totalDebts = (debtsRes.data ?? []).reduce(
      (s, r) => s + (Number(r.amount) || 0), 0
    )

    const totalPlannedPayments = (plannedRes.data ?? []).reduce((s, r) => {
      const b = Number(r.balance) || 0
      return s + (b > 0 ? b : 0)
    }, 0)

    const allTx = transactionsRes.data ?? []

    const currentMonthTransactions = allTx
      .filter(r => r.month_year === currentMonthYear)
      .reduce((s, r) => s + (Number(r.amount) || 0), 0)

    // Build chart data for last 6 months
    const monthlyMap = new Map<string, number>()
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const key = `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
      monthlyMap.set(key, 0)
    }
    allTx.forEach(r => {
      if (r.month_year && monthlyMap.has(r.month_year)) {
        monthlyMap.set(r.month_year, (monthlyMap.get(r.month_year) || 0) + (Number(r.amount) || 0))
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
      lastSync: lastSyncRes.data?.synced_at ?? null,
    })
  } catch (err) {
    console.error('summary error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת סיכום' }, { status: 500 })
  }
}
