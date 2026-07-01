import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const framework = req.nextUrl.searchParams.get('framework') ?? ''

  try {
    // Build parent→framework map
    const [studentsRes, classesRes] = await Promise.all([
      supabase.from('students').select('parent_ids, class_name'),
      supabase.from('classes').select('class_name, framework'),
    ])

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

    // All parent IDs for this framework (for income tab)
    const allFwParentIds = Object.entries(parentFrameworkMap)
      .filter(([, fw]) => framework === 'אחר' ? fw === 'אחר' : fw === framework)
      .map(([id]) => id)

    // Fetch all parents in this framework (for names + income tab)
    const allParentsRes = allFwParentIds.length > 0
      ? await supabase.from('parents').select('id, name, children_count').in('id', allFwParentIds)
      : { data: [] as Array<{ id: string; name: string; children_count: number }> }

    // Fetch open PPs (04/2026+) for all parents in this framework
    const todayStr = new Date().toISOString().split('T')[0]
    const ppRes = allFwParentIds.length > 0
      ? await supabase
          .from('planned_payments')
          .select('id, parent_ids, name, amount, balance, month_year, date')
          .gt('balance', 0)
          .lt('date', todayStr)
          .gte('date', '2026-04-01')
          .overlaps('parent_ids', allFwParentIds)
      : { data: [] as Array<{ id: string; parent_ids: string[]; name: string; amount: number; balance: number; month_year: string; date: string }> }

    // Build per-parent PP list and balance sum
    const ppByParent: Record<string, { id: string; name: string; amount: number; balance: number; monthYear: string }[]> = {}
    const balanceByParent: Record<string, number> = {}
    for (const pp of ppRes.data ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        if (!allFwParentIds.includes(pid)) continue
        if (!ppByParent[pid]) ppByParent[pid] = []
        ppByParent[pid].push({
          id: pp.id as string,
          name: pp.name as string,
          amount: Number(pp.amount) || 0,
          balance: Number(pp.balance) || 0,
          monthYear: pp.month_year as string,
        })
        balanceByParent[pid] = (balanceByParent[pid] ?? 0) + (Number(pp.balance) || 0)
      }
    }

    // Only parents who have actual open PPs (from 04/2026+)
    const allParentsMap = Object.fromEntries(
      (allParentsRes.data ?? []).map(p => [p.id, p])
    )
    const debtParentIds = Object.keys(balanceByParent).filter(pid => balanceByParent[pid] > 0)
    const debtParents = debtParentIds
      .map(pid => allParentsMap[pid])
      .filter(Boolean)
      .sort((a, b) => (balanceByParent[b.id] ?? 0) - (balanceByParent[a.id] ?? 0))

    // Recent income transactions for all parents in this framework (last 3 months)
    const now = new Date()
    const months: string[] = []
    for (let i = 2; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      months.push(`${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`)
    }

    const txRes = allFwParentIds.length > 0
      ? await supabase
          .from('transactions')
          .select('id, amount, date, month_year, notes, type, parent_ids')
          .in('month_year', months)
          .gt('amount', 0)
          .order('date', { ascending: false })
          .limit(200)
      : { data: [] as Array<{ id: string; amount: number; date: string; month_year: string; notes: string; type: string; parent_ids: string[] }> }

    // Build parent name map
    const parentNameMap: Record<string, string> = {}
    for (const p of allParentsRes.data ?? []) parentNameMap[p.id] = p.name

    const transactions = (txRes.data ?? [])
      .filter(tx => ((tx.parent_ids as string[]) ?? []).some(pid => allFwParentIds.includes(pid)))
      .map(tx => {
        const pids = (tx.parent_ids as string[]) ?? []
        const parentId = pids.find(pid => allFwParentIds.includes(pid)) ?? pids[0] ?? ''
        return {
          id: tx.id as string,
          amount: Number(tx.amount) || 0,
          date: String(tx.date || ''),
          monthYear: String(tx.month_year || ''),
          notes: String(tx.notes || ''),
          type: String(tx.type || ''),
          parentId,
          parentName: parentNameMap[parentId] ?? '',
        }
      })

    // Month summaries for income tab
    const monthTotals: Record<string, number> = {}
    for (const m of months) monthTotals[m] = 0
    for (const tx of transactions) {
      if (tx.monthYear in monthTotals) monthTotals[tx.monthYear] += tx.amount
    }

    return NextResponse.json({
      parents: debtParents.map(p => ({
        id: p.id as string,
        name: p.name as string,
        balance: Math.round(balanceByParent[p.id] ?? 0),
        childrenCount: Number(p.children_count) || 0,
        openPayments: ppByParent[p.id as string] ?? [],
      })),
      transactions,
      monthTotals,
      months,
    })
  } catch (err) {
    console.error('dept-debt error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
