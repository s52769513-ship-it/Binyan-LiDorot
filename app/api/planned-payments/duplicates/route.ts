import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Read-only audit: finds every (parent, month) that has more than one tuition
// planned payment. Deliberately does NOT delete or judge anything — it returns
// the full facts (amount, paid, linked-transaction count, legacy flag, created
// date) so a human can decide. Different amounts are common and may be
// legitimate, so nothing is auto-classified as "the duplicate".
export async function GET(req: NextRequest) {
  try {
    const ppType = req.nextUrl.searchParams.get('ppType') || 'tuition'

    // Page through all PPs of this type (PostgREST caps a single select).
    type Row = { id: string; parent_ids: string[]; month_year: string; amount: number; balance: number; is_legacy: boolean; created_at: string; name: string }
    const all: Row[] = []
    const PAGE = 1000
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabaseAdmin
        .from('planned_payments')
        .select('id, parent_ids, month_year, amount, balance, is_legacy, created_at, name')
        .eq('pp_type', ppType)
        .range(from, from + PAGE - 1)
      if (error) throw error
      const rows = (data ?? []) as unknown as Row[]
      all.push(...rows)
      if (rows.length < PAGE) break
    }

    // Group by exact parent set + month_year
    const groups = new Map<string, Row[]>()
    for (const r of all) {
      const ids = [...((r.parent_ids as string[]) ?? [])].sort()
      if (ids.length === 0 || !r.month_year) continue
      const key = `${ids.join('|')}||${r.month_year}`
      const arr = groups.get(key) ?? []
      arr.push(r)
      groups.set(key, arr)
    }

    const dupGroups = [...groups.values()].filter(g => g.length > 1)

    // Count linked transactions per PP (only for PPs inside duplicate groups)
    const dupPpIds = dupGroups.flatMap(g => g.map(p => p.id))
    const linkedCount: Record<string, number> = {}
    if (dupPpIds.length > 0) {
      for (let i = 0; i < dupPpIds.length; i += 200) {
        const chunk = dupPpIds.slice(i, i + 200)
        const { data: txs } = await supabaseAdmin
          .from('transactions').select('planned_payment_id').in('planned_payment_id', chunk)
        for (const t of txs ?? []) {
          const pid = t.planned_payment_id as string
          if (pid) linkedCount[pid] = (linkedCount[pid] ?? 0) + 1
        }
      }
    }

    // Parent names
    const parentIds = [...new Set(dupGroups.flatMap(g => (g[0].parent_ids as string[]) ?? []))]
    const nameMap: Record<string, string> = {}
    if (parentIds.length > 0) {
      const { data: parents } = await supabaseAdmin.from('parents').select('id, name').in('id', parentIds)
      for (const p of parents ?? []) nameMap[p.id as string] = (p.name as string) ?? ''
    }

    const result = dupGroups.map(g => {
      const ids = (g[0].parent_ids as string[]) ?? []
      return {
        parentIds:  ids,
        parentName: ids.map(id => nameMap[id]).filter(Boolean).join(', ') || '(ללא שם)',
        monthYear:  g[0].month_year,
        pps: g
          .map(p => {
            const amount = Number(p.amount) || 0
            const balance = Number(p.balance) || 0
            const linked = linkedCount[p.id] ?? 0
            return {
              id: p.id,
              name: p.name ?? '',
              amount,
              balance,
              paid: Math.round((amount - balance) * 100) / 100,
              linkedTxCount: linked,
              isLegacy: !!p.is_legacy,
              createdAt: p.created_at ?? '',
              // Safe to delete from this tool ONLY if nothing was ever paid and
              // no transaction points at it — a pure phantom debt.
              safeToDelete: linked === 0 && Math.abs(amount - balance) < 0.01,
            }
          })
          .sort((a, b) => b.amount - a.amount),
      }
    }).sort((a, b) => b.pps.length - a.pps.length || a.parentName.localeCompare(b.parentName, 'he'))

    return NextResponse.json({
      groupCount: result.length,
      groups: result,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
