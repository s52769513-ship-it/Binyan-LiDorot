import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const now = new Date()
    const currentMonthYear = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`

    const months: string[] = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`)
    }

    const [
      plannedThisMonthRes,
      actualThisMonthRes,
      debtParentsRes,
      debtParentsCountRes,
      recentTxRes,
      plannedByMonthRes,
      txByMonthRes,
      lastSyncRes,
    ] = await Promise.all([
      supabase.from('planned_payments').select('amount').eq('month_year', currentMonthYear),

      supabase.from('transactions').select('amount').eq('month_year', currentMonthYear).gt('amount', 0),

      supabase
        .from('parents')
        .select('id, name, tuition_balance, children_count')
        .gt('tuition_balance', 0)
        .order('tuition_balance', { ascending: false })
        .limit(6),

      supabase
        .from('parents')
        .select('*', { count: 'exact', head: true })
        .gt('tuition_balance', 0),

      supabase
        .from('transactions')
        .select('id, amount, type, date, month_year, notes, parent_ids')
        .order('date', { ascending: false })
        .limit(10),

      supabase.from('planned_payments').select('month_year, amount').in('month_year', months),

      supabase.from('transactions').select('month_year, amount').in('month_year', months).gt('amount', 0),

      supabase
        .from('sync_log')
        .select('synced_at, status')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])

    // Fetch parent names for recent transactions
    const txParentIds = [...new Set((recentTxRes.data ?? []).flatMap(t => (t.parent_ids as string[]) ?? []))]
    const parentNamesRes = txParentIds.length > 0
      ? await supabase.from('parents').select('id, name').in('id', txParentIds)
      : { data: [] as Array<{ id: string; name: string }> }

    const parentNameMap: Record<string, string> = {}
    for (const p of parentNamesRes.data ?? []) parentNameMap[p.id] = p.name

    // Monthly chart data
    const plannedByMonth: Record<string, number> = {}
    const actualByMonth: Record<string, number> = {}
    for (const m of months) { plannedByMonth[m] = 0; actualByMonth[m] = 0 }
    for (const r of plannedByMonthRes.data ?? []) {
      if (r.month_year && r.month_year in plannedByMonth)
        plannedByMonth[r.month_year] += Number(r.amount) || 0
    }
    for (const r of txByMonthRes.data ?? []) {
      if (r.month_year && r.month_year in actualByMonth)
        actualByMonth[r.month_year] += Number(r.amount) || 0
    }
    const monthlyData = months.map(m => ({
      month: m,
      planned: Math.round(plannedByMonth[m]),
      actual: Math.round(actualByMonth[m]),
    }))

    const plannedThisMonth = (plannedThisMonthRes.data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const actualThisMonth  = (actualThisMonthRes.data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const debtAlerts = (debtParentsRes.data ?? []).map(p => ({
      id: p.id,
      name: p.name as string,
      balance: Number(p.tuition_balance) || 0,
      childrenCount: Number(p.children_count) || 0,
    }))
    const totalDebt       = debtAlerts.reduce((s, p) => s + p.balance, 0)
    const parentsInDebt   = debtParentsCountRes.count ?? debtAlerts.length

    const recentTransactions = (recentTxRes.data ?? []).map(t => ({
      id: t.id as string,
      amount: Number(t.amount) || 0,
      type: String(t.type || ''),
      date: String(t.date || ''),
      monthYear: String(t.month_year || ''),
      notes: String(t.notes || ''),
      parentName: (t.parent_ids as string[])?.[0] ? (parentNameMap[(t.parent_ids as string[])[0]] ?? '') : '',
    }))

    // Legacy fields for backward compat
    const totalDebts = (await supabase.from('debts').select('amount')).data?.reduce(
      (s, r) => s + (Number(r.amount) || 0), 0
    ) ?? 0
    const totalPlannedPayments = (await supabase.from('planned_payments').select('balance')).data?.reduce((s, r) => {
      const b = Number(r.balance) || 0; return s + (b > 0 ? b : 0)
    }, 0) ?? 0

    return NextResponse.json({
      // New rich fields
      plannedThisMonth: Math.round(plannedThisMonth),
      actualThisMonth:  Math.round(actualThisMonth),
      totalDebt:        Math.round(totalDebt),
      parentsInDebt,
      debtAlerts,
      recentTransactions,
      monthlyData,
      lastSync: lastSyncRes.data?.synced_at ?? null,
      // Legacy fields
      totalDebts:              Math.round(totalDebts),
      totalPlannedPayments:    Math.round(totalPlannedPayments),
      currentMonthTransactions: Math.round(actualThisMonth),
    })
  } catch (err) {
    console.error('summary error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת סיכום' }, { status: 500 })
  }
}
