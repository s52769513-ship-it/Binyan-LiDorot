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

    const todayStr = now.toISOString().slice(0, 10)

    const [
      plannedThisMonthRes,
      actualThisMonthRes,
      debtParentsRes,
      debtParentsCountRes,
      recentTxRes,
      plannedByMonthRes,
      txByMonthRes,
      lastSyncRes,
      studentsRes,
      classesRes,
      ppDeptRes,
      txDeptRes,
      allParentsDebtRes,
      salaryDebtRes,
      overdueRes,
      ppCreditRes,
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

      supabase.from('students').select('parent_ids, class_name'),
      supabase.from('classes').select('class_name, framework'),
      supabase.from('planned_payments').select('parent_ids, amount').eq('month_year', currentMonthYear),
      supabase.from('transactions').select('parent_ids, amount').eq('month_year', currentMonthYear).gt('amount', 0),
      supabase.from('parents').select('id, tuition_balance').gt('tuition_balance', 0),

      // New: salary debt
      supabase
        .from('planned_payments')
        .select('amount, balance, parent_ids, month_year')
        .eq('pp_type', 'salary')
        .gt('balance', 0)
        .order('month_year', { ascending: false })
        .limit(50),

      // New: overdue tuition
      supabase
        .from('planned_payments')
        .select('id, amount, balance, date, month_year, parent_ids')
        .eq('pp_type', 'tuition')
        .gt('balance', 0)
        .lt('date', todayStr)
        .order('date', { ascending: true })
        .limit(50),

      // New: parents with credit
      supabase
        .from('parents')
        .select('id, name, pp_credit')
        .gt('pp_credit', 0)
        .order('pp_credit', { ascending: false })
        .limit(20),
    ])

    // Build department breakdown (parent → framework via students → classes)
    const classFrameworkMap: Record<string, string> = {}
    for (const c of classesRes.data ?? []) {
      if (c.framework) classFrameworkMap[c.class_name as string] = c.framework as string
    }
    const parentFrameworkMap: Record<string, string> = {}
    for (const s of studentsRes.data ?? []) {
      const fw = classFrameworkMap[(s.class_name as string) ?? ''] ?? ''
      for (const pid of (s.parent_ids as string[]) ?? []) {
        if (pid && fw && !parentFrameworkMap[pid]) parentFrameworkMap[pid] = fw
      }
    }

    const DEPT_KEYS = ['תלמוד תורה', 'בית חינוך לבנות'] as const
    type DeptKey = typeof DEPT_KEYS[number] | 'אחר'
    const deptAcc: Record<DeptKey, { planned: number; actual: number; debt: number; parentsInDebt: number }> = {
      'תלמוד תורה':       { planned: 0, actual: 0, debt: 0, parentsInDebt: 0 },
      'בית חינוך לבנות': { planned: 0, actual: 0, debt: 0, parentsInDebt: 0 },
      'אחר':              { planned: 0, actual: 0, debt: 0, parentsInDebt: 0 },
    }
    const getBucket = (pids: string[]) => {
      const fw = pids.length > 0 ? (parentFrameworkMap[pids[0]] ?? 'אחר') : 'אחר'
      return (deptAcc[fw as DeptKey] ?? deptAcc['אחר'])
    }
    for (const pp of ppDeptRes.data ?? [])
      getBucket((pp.parent_ids as string[]) ?? []).planned += Number(pp.amount) || 0
    for (const tx of txDeptRes.data ?? [])
      getBucket((tx.parent_ids as string[]) ?? []).actual += Number(tx.amount) || 0
    for (const p of allParentsDebtRes.data ?? []) {
      const fw = parentFrameworkMap[p.id as string] ?? 'אחר'
      const b = deptAcc[fw as DeptKey] ?? deptAcc['אחר']
      b.debt += Number(p.tuition_balance) || 0
      b.parentsInDebt += 1
    }
    const departmentStats = (Object.entries(deptAcc) as [DeptKey, typeof deptAcc['אחר']][])
      .filter(([, v]) => v.planned > 0 || v.actual > 0 || v.debt > 0)
      .map(([name, v]) => ({
        name,
        planned:       Math.round(v.planned),
        actual:        Math.round(v.actual),
        debt:          Math.round(v.debt),
        parentsInDebt: v.parentsInDebt,
        collectionPct: v.planned > 0 ? Math.round((v.actual / v.planned) * 100) : 0,
      }))

    // Fetch parent names for recent transactions + overdue + salary alerts
    const txParentIds = [...new Set((recentTxRes.data ?? []).flatMap(t => (t.parent_ids as string[]) ?? []))]
    const overdueParentIds = [...new Set((overdueRes.data ?? []).flatMap(r => (r.parent_ids as string[]) ?? []))]
    const salaryParentIds = [...new Set((salaryDebtRes.data ?? []).flatMap(r => (r.parent_ids as string[]) ?? []))]
    const allAlertParentIds = [...new Set([...txParentIds, ...overdueParentIds, ...salaryParentIds])]

    const parentNamesRes = allAlertParentIds.length > 0
      ? await supabase.from('parents').select('id, name').in('id', allAlertParentIds)
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

    // Compute new financial alert fields
    const salaryDebt = (salaryDebtRes.data ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
    const salaryDebtCount = (salaryDebtRes.data ?? []).length

    const overdueAmount = (overdueRes.data ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
    const overdueCount = (overdueRes.data ?? []).length

    const ppCreditTotal = (ppCreditRes.data ?? []).reduce((s, r) => s + (Number(r.pp_credit) || 0), 0)
    const ppCreditList = (ppCreditRes.data ?? []).map(p => ({
      id: p.id as string,
      name: p.name as string,
      ppCredit: Number(p.pp_credit) || 0,
    }))

    const overdueAlerts = (overdueRes.data ?? []).slice(0, 10).map(r => {
      const pids = (r.parent_ids as string[]) ?? []
      const parentId = pids[0] ?? ''
      return {
        id: r.id as string,
        parentId,
        parentName: parentNameMap[parentId] ?? '',
        balance: Number(r.balance) || 0,
        date: String(r.date || ''),
        monthYear: String(r.month_year || ''),
      }
    })

    const salaryAlerts = (salaryDebtRes.data ?? []).slice(0, 10).map(r => {
      const pids = (r.parent_ids as string[]) ?? []
      const parentId = pids[0] ?? ''
      return {
        parentId,
        parentName: parentNameMap[parentId] ?? '',
        balance: Number(r.balance) || 0,
        monthYear: String(r.month_year || ''),
      }
    })

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
      departmentStats,
      // New financial alert fields
      salaryDebt:       Math.round(salaryDebt),
      salaryDebtCount,
      overdueAmount:    Math.round(overdueAmount),
      overdueCount,
      ppCreditTotal:    Math.round(ppCreditTotal),
      ppCreditList,
      overdueAlerts,
      salaryAlerts,
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
