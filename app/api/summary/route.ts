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
      studentsRes,
      classesRes,
      allParentsRes,
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

      supabase.from('students').select('id, class_name, parent_ids, status').eq('status', 'פעיל'),

      supabase.from('classes').select('class_name, framework'),

      supabase.from('parents').select('id, tuition_total, tuition_balance, children_count'),
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

    // Framework split (תלמוד תורה vs בית חינוך)
    const fwMap = new Map<string, string>(
      (classesRes.data ?? []).map(c => [c.class_name, c.framework ?? ''])
    )
    type ParentTuition = { id: string; tuition_total: number | null; tuition_balance: number | null; children_count: number | null }
    const parentMap = new Map<string, ParentTuition>(
      (allParentsRes.data ?? []).map(p => [p.id as string, p as ParentTuition])
    )
    // For each parent: count active children per framework
    const parentFwKids: Record<string, Record<string, number>> = {}
    for (const s of studentsRes.data ?? []) {
      const fw = fwMap.get(s.class_name ?? '') || ''
      if (!fw) continue
      for (const pid of (s.parent_ids as string[] ?? [])) {
        if (!parentFwKids[pid]) parentFwKids[pid] = {}
        parentFwKids[pid][fw] = (parentFwKids[pid][fw] || 0) + 1
      }
    }
    type FwStats = { tuitionTotal: number; tuitionBalance: number; studentCount: number; parentCount: number }
    const fwStats: Record<string, FwStats> = {}
    const countedParents = new Set<string>()
    for (const [pid, fwKids] of Object.entries(parentFwKids)) {
      const parent = parentMap.get(pid)
      const totalKids = Object.values(fwKids).reduce((s, c) => s + c, 0)
      for (const [fw, count] of Object.entries(fwKids)) {
        if (!fwStats[fw]) fwStats[fw] = { tuitionTotal: 0, tuitionBalance: 0, studentCount: 0, parentCount: 0 }
        fwStats[fw].studentCount += count
        if (parent) {
          const frac = count / totalKids
          fwStats[fw].tuitionTotal   += (Number(parent.tuition_total)   || 0) * frac
          fwStats[fw].tuitionBalance += (Number(parent.tuition_balance) || 0) * frac
        }
        // Count parent once for their primary framework (most kids)
        const primaryFw = Object.entries(fwKids).sort((a, b) => b[1] - a[1])[0][0]
        if (!countedParents.has(pid) && fw === primaryFw) {
          fwStats[fw].parentCount++
          countedParents.add(pid)
        }
      }
    }
    const frameworkSplit = Object.entries(fwStats).map(([framework, s]) => ({
      framework,
      studentCount: s.studentCount,
      tuitionTotal: Math.round(s.tuitionTotal),
      tuitionBalance: Math.round(s.tuitionBalance),
      tuitionCollected: Math.round(s.tuitionTotal - Math.max(0, s.tuitionBalance)),
      parentCount: s.parentCount,
    })).sort((a, b) => b.studentCount - a.studentCount)

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
      frameworkSplit,
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
