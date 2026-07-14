import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'

// Iterating every parent + re-linking all transactions can take a while;
// without this the Vercel gateway times out mid-run ("שגיאת רשת").
export const maxDuration = 300

export async function POST() {
  try {
    const today = new Date()
    const currentMonthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`

    // 1. Delete all open future donation PPs (balance = amount — untouched)
    const { data: toDelete } = await supabaseAdmin
      .from('planned_payments')
      .select('id, amount, balance')
      .eq('pp_type', 'donation')
      .gte('date', currentMonthDate)

    const deleteIds = (toDelete ?? [])
      .filter(pp => Number(pp.balance) === Number(pp.amount))  // fully unpaid only
      .map(pp => pp.id)

    let deleted = 0
    if (deleteIds.length > 0) {
      const { error } = await supabaseAdmin
        .from('planned_payments')
        .delete()
        .in('id', deleteIds)
      if (error) throw error
      deleted = deleteIds.length
    }

    // 2. Get all parents with open donation PPs
    const { data: parentsWithDonations } = await supabaseAdmin
      .from('planned_payments')
      .select('parent_ids')
      .eq('pp_type', 'donation')

    const parentSet = new Set<string>()
    for (const pp of parentsWithDonations ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        parentSet.add(pid)
      }
    }

    // 3. For each parent, re-link free donation transactions to open donation PPs
    let relinked = 0
    for (const parentId of Array.from(parentSet)) {
      // Load open donation PPs ordered by month (oldest first)
      const { data: openPPs } = await supabaseAdmin
        .from('planned_payments')
        .select('id, amount, balance, month_year')
        .contains('parent_ids', [parentId])
        .eq('pp_type', 'donation')
        .gt('balance', 0)

      const ppList = sortByMonth(openPPs ?? [], true).map(p => ({
        ...p,
        balance: Number(p.balance),
        amount: Number(p.amount),
      }))

      if (ppList.length === 0) continue

      // Load free donation transactions (דמי מגבית only)
      const { data: freeTxs } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, month_year')
        .contains('parent_ids', [parentId])
        .contains('project_names', ['דמי מגבית'])
        .is('planned_payment_id', null)
        .gt('amount', 0)
        .order('date', { ascending: true })

      // Link transactions to PPs with cascade
      for (const tx of freeTxs ?? []) {
        let remaining = Number(tx.amount)
        const monthMatch = ppList.findIndex(p => p.month_year === tx.month_year && p.balance > 0)
        const firstOpen = ppList.findIndex(p => p.balance > 0)
        const ppIdx = monthMatch >= 0 ? monthMatch : firstOpen

        if (ppIdx < 0) continue // No open PP to link to

        const pp = ppList[ppIdx]
        const apply = Math.min(remaining, pp.balance)
        pp.balance = Math.round((pp.balance - apply) * 100) / 100
        remaining = Math.round((remaining - apply) * 100) / 100

        // Link transaction to this PP
        await supabaseAdmin.from('transactions').update({ planned_payment_id: pp.id }).eq('id', tx.id)
        relinked++
      }

      // Update all PP balances
      for (const pp of ppList) {
        await supabaseAdmin
          .from('planned_payments')
          .update({ balance: pp.balance })
          .eq('id', pp.id)
      }
    }

    return NextResponse.json({ deleted, relinked, parents: parentSet.size })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
