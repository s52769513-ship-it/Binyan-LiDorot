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
      nonPastDebtPPsRes,
      salaryDebtRes,
      overdueRes,
      ppCreditRes,
      employeesCountRes,
      salaryPaidThisMonthRes,
      pastDueTuitionRes,
      pastDueDonationRes,
    ] = await Promise.all([
      // Tuition only — salary PPs are expenses, not expected income
      supabase.from('planned_payments').select('amount').eq('month_year', currentMonthYear)
        .or('pp_type.eq.tuition,pp_type.is.null'),

      supabase.from('transactions').select('amount, type, project_names').eq('month_year', currentMonthYear).gt('amount', 0),

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

      supabase.from('planned_payments').select('month_year, amount').in('month_year', months)
        .or('pp_type.eq.tuition,pp_type.is.null'),

      supabase.from('transactions').select('month_year, amount, type, project_names').in('month_year', months).gt('amount', 0),

      supabase
        .from('sync_log')
        .select('synced_at, status')
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),

      supabase.from('students').select('parent_ids, class_name, status'),
      supabase.from('classes').select('class_name, framework'),
      supabase.from('planned_payments').select('parent_ids, amount').eq('month_year', currentMonthYear)
        .or('pp_type.eq.tuition,pp_type.is.null'),
      supabase.from('transactions').select('parent_ids, amount, type, project_names').eq('month_year', currentMonthYear).gt('amount', 0),

      // Debt: overdue tuition PPs from 04/2026+ (date < today and >= 2026-04-01)
      supabase.from('planned_payments')
        .select('parent_ids, balance')
        .eq('pp_type', 'tuition')
        .gt('balance', 0)
        .lt('date', todayStr)
        .gte('date', '2026-04-01'),

      // New: salary debt — all open salary PPs (unlimited: the sum/count must be
      // authoritative and match the חוב משכורות drill-down modal)
      supabase
        .from('planned_payments')
        .select('amount, balance, parent_ids, month_year')
        .eq('pp_type', 'salary')
        .gt('balance', 0)
        .order('date', { ascending: false }),

      // New: overdue tuition — all past-due open PPs (unlimited: authoritative
      // sum/count matching the בפיגור drill-down modal)
      supabase
        .from('planned_payments')
        .select('id, amount, balance, date, month_year, parent_ids')
        .eq('pp_type', 'tuition')
        .gt('balance', 0)
        .lt('date', todayStr)
        .order('date', { ascending: true }),

      // New: parents with credit (either legacy pp_credit or merged credit_balance)
      supabase
        .from('parents')
        .select('id, name, pp_credit, credit_balance')
        .or('pp_credit.gt.0,credit_balance.gt.0')
        .limit(30),

      // Employees count (parents with salary)
      supabase
        .from('parents')
        .select('*', { count: 'exact', head: true })
        .gt('salary_gross', 0),

      // Salary paid this month (salary PPs: amount - balance)
      supabase
        .from('planned_payments')
        .select('amount, balance')
        .eq('pp_type', 'salary')
        .eq('month_year', currentMonthYear),

      // חוב שכ"ל = יתרות שכ"ל פתוחות שתאריך היעד שלהן כבר עבר (לא כולל חודשים
      // עתידיים שעדיין לא הגיע מועדם). כולל PP שמקורם ב-Airtable (pp_type ריק).
      supabase
        .from('planned_payments')
        .select('balance')
        .or('pp_type.eq.tuition,pp_type.is.null')
        .gt('balance', 0)
        .lte('date', todayStr),

      // חוב מגבית = יתרות מגבית פתוחות שמועדן עבר (מקביל לחוב שכ"ל, לבריכת המגבית)
      supabase
        .from('planned_payments')
        .select('balance, parent_ids')
        .eq('pp_type', 'donation')
        .gt('balance', 0)
        .lte('date', todayStr),
    ])

    // Salary-side / expense transactions must not count as tuition income:
    // ניכוי שכ"ל duplicates the offset already counted on the tuition side,
    // and salary payments (project 'משכורת') are expenses.
    const SALARY_SIDE_TYPES = new Set(['ניכוי שכ"ל', 'קיזוז משכר לימוד'])
    const isTuitionIncome = (t: { type?: string | null; project_names?: unknown }) =>
      !SALARY_SIDE_TYPES.has(String(t.type ?? '')) &&
      !((t.project_names as string[] | null) ?? []).includes('משכורת')

    // Build department breakdown (parent → ALL frameworks via students → classes)
    const classFrameworkMap: Record<string, string> = {}
    for (const c of classesRes.data ?? []) {
      if (c.framework) classFrameworkMap[c.class_name as string] = c.framework as string
    }
    // parentFrameworksMap: parentId → Set of all frameworks their children attend
    const parentFrameworksMap: Record<string, Set<string>> = {}
    for (const s of studentsRes.data ?? []) {
      const fw = classFrameworkMap[(s.class_name as string) ?? ''] ?? ''
      for (const pid of (s.parent_ids as string[]) ?? []) {
        if (pid && fw) {
          if (!parentFrameworksMap[pid]) parentFrameworksMap[pid] = new Set()
          parentFrameworksMap[pid].add(fw)
        }
      }
    }

    const DEPT_KEYS = ['תלמוד תורה', 'בית חינוך לבנות'] as const
    type DeptKey = typeof DEPT_KEYS[number] | 'אחר'
    const deptAcc: Record<DeptKey, { planned: number; actual: number; debt: number; parentsInDebt: Set<string> }> = {
      'תלמוד תורה':       { planned: 0, actual: 0, debt: 0, parentsInDebt: new Set() },
      'בית חינוך לבנות': { planned: 0, actual: 0, debt: 0, parentsInDebt: new Set() },
      'אחר':              { planned: 0, actual: 0, debt: 0, parentsInDebt: new Set() },
    }

    // For planned/actual: first framework of parent (as before) — no need to split
    const getFirstFramework = (pids: string[]) => {
      for (const pid of pids) {
        const fws = parentFrameworksMap[pid]
        if (fws && fws.size > 0) return [...fws][0]
      }
      return 'אחר'
    }
    for (const pp of ppDeptRes.data ?? []) {
      const fw = getFirstFramework((pp.parent_ids as string[]) ?? [])
      ;(deptAcc[fw as DeptKey] ?? deptAcc['אחר']).planned += Number(pp.amount) || 0
    }
    for (const tx of (txDeptRes.data ?? []).filter(isTuitionIncome)) {
      const fw = getFirstFramework((tx.parent_ids as string[]) ?? [])
      ;(deptAcc[fw as DeptKey] ?? deptAcc['אחר']).actual += Number(tx.amount) || 0
    }

    // Debt: from non-past open tuition PPs only, split across all frameworks of each parent
    for (const pp of nonPastDebtPPsRes.data ?? []) {
      const pids = (pp.parent_ids as string[]) ?? []
      for (const pid of pids) {
        const fws = [...(parentFrameworksMap[pid] ?? new Set<string>(['אחר']))]
        const share = (Number(pp.balance) || 0) / fws.length
        for (const fw of fws) {
          const b = deptAcc[fw as DeptKey] ?? deptAcc['אחר']
          b.debt += share
          b.parentsInDebt.add(pid)
        }
      }
    }
    const departmentStats = (Object.entries(deptAcc) as [DeptKey, typeof deptAcc['אחר']][])
      .filter(([, v]) => v.planned > 0 || v.actual > 0 || v.debt > 0)
      .map(([name, v]) => ({
        name,
        planned:       Math.round(v.planned),
        actual:        Math.round(v.actual),
        debt:          Math.round(v.debt),
        parentsInDebt: v.parentsInDebt.size,
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
    for (const r of (txByMonthRes.data ?? []).filter(isTuitionIncome)) {
      if (r.month_year && r.month_year in actualByMonth)
        actualByMonth[r.month_year] += Number(r.amount) || 0
    }
    const monthlyData = months.map(m => ({
      month: m,
      planned: Math.round(plannedByMonth[m]),
      actual: Math.round(actualByMonth[m]),
    }))

    const plannedThisMonth = (plannedThisMonthRes.data ?? []).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const actualThisMonth  = (actualThisMonthRes.data ?? []).filter(isTuitionIncome).reduce((s, r) => s + (Number(r.amount) || 0), 0)
    const debtAlerts = (debtParentsRes.data ?? []).map(p => ({
      id: p.id,
      name: p.name as string,
      balance: Number(p.tuition_balance) || 0,
      childrenCount: Number(p.children_count) || 0,
    }))
    // חוב שכ"ל = יתרות שכ"ל פתוחות שמועדן עבר (past-due), לא כל החוב הכולל —
    // חודשים עתידיים שעדיין לא הגיע מועדם אינם חוב. תואם את מודל הפירוט.
    const totalDebt = (pastDueTuitionRes.data ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
    const parentsInDebt   = debtParentsCountRes.count ?? debtAlerts.length

    // חוב מגבית past-due (מחליף את כרטיס "בפיגור" שהיה כפילות של חוב שכ"ל)
    const donationDebt = (pastDueDonationRes.data ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
    const donationDebtFamilies = new Set(
      (pastDueDonationRes.data ?? []).flatMap(r => (r.parent_ids as string[]) ?? [])
    ).size

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
    const totalPlannedPayments = (await supabase.from('planned_payments').select('balance')
      .or('pp_type.eq.tuition,pp_type.is.null')).data?.reduce((s, r) => {
      const b = Number(r.balance) || 0; return s + (b > 0 ? b : 0)
    }, 0) ?? 0

    // Quick counts + this-month salary spending
    const activeStudentRows = (studentsRes.data ?? []).filter(s => s.status === 'פעיל')
    const activeStudents    = activeStudentRows.length
    const activeFamilies    = new Set(activeStudentRows.flatMap(s => (s.parent_ids as string[]) ?? [])).size
    const employeesCount    = employeesCountRes.count ?? 0
    const salaryPaidThisMonth = (salaryPaidThisMonthRes.data ?? [])
      .reduce((s, r) => s + Math.max(0, (Number(r.amount) || 0) - (Number(r.balance) || 0)), 0)

    // Compute new financial alert fields
    const salaryDebt = (salaryDebtRes.data ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
    const salaryDebtCount = (salaryDebtRes.data ?? []).length

    const overdueAmount = (overdueRes.data ?? []).reduce((s, r) => s + (Number(r.balance) || 0), 0)
    const overdueCount = (overdueRes.data ?? []).length

    // Combine legacy pp_credit + merged credit_balance into one number per parent
    const ppCreditList = (ppCreditRes.data ?? [])
      .map(p => ({
        id: p.id as string,
        name: p.name as string,
        ppCredit: (Number(p.pp_credit) || 0) + (Number((p as { credit_balance?: number }).credit_balance) || 0),
      }))
      .filter(p => p.ppCredit > 0)
      .sort((a, b) => b.ppCredit - a.ppCredit)
    const ppCreditTotal = ppCreditList.reduce((s, p) => s + p.ppCredit, 0)

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
      donationDebt:         Math.round(donationDebt),
      donationDebtFamilies,
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
      // Quick stats
      activeStudents,
      activeFamilies,
      employeesCount,
      salaryPaidThisMonth: Math.round(salaryPaidThisMonth),
      netThisMonth:        Math.round(actualThisMonth - salaryPaidThisMonth),
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
