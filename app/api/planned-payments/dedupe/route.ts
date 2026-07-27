import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDelete } from '@/lib/trash'
import { relinkParent } from '@/lib/relink'
import { recalcParentTuitionBalance } from '@/lib/ppPayments'

export const maxDuration = 300

type PPRow = {
  id: string
  parent_ids: string[] | null
  month_year: string | null
  pp_type: string | null
  amount: number
  balance: number
  name: string | null
}

// One-time cleanup for duplicate planned payments created when the year-generator
// ran several times (a double-click racing past its "already exists" check).
// A duplicate = same parents + month + pp_type + AMOUNT (amount is included so a
// legitimately different-sized PP for the same month, e.g. a corrected שכ"ל, is
// NEVER merged). For each group we keep one PP (the most-paid), MOVE every linked
// transaction from the extras onto the kept PP (nothing is orphaned), soft-delete
// the extras (recoverable from 🗑️ אשפה), then relink each affected parent so
// balances/credits recompute from the truth.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun = body.dryRun === true
  const deletedBy = req.headers.get('x-auth-email') || 'system'

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        // Fetch ALL planned payments (paginated — PostgREST caps a page ~1000).
        const all: PPRow[] = []
        const PAGE = 1000
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabaseAdmin
            .from('planned_payments')
            .select('id, parent_ids, month_year, pp_type, amount, balance, name')
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) throw error
          const rows = (data ?? []) as unknown as PPRow[]
          all.push(...rows)
          if (rows.length < PAGE) break
        }

        // Group duplicates: same parents + month + type. Deliberately NOT keyed
        // on the amount — a partially-paid duplicate shows a smaller amount/
        // balance (e.g. 306 and 2,700 for the same month are the SAME debt, one
        // partly paid), and keying on amount let those escape. Two PPs for the
        // same person, month and type are one debt; the payments are merged onto
        // the keeper and relink recomputes the balance from the transactions.
        const groups = new Map<string, PPRow[]>()
        for (const pp of all) {
          const parents = [...((pp.parent_ids as string[]) ?? [])].sort().join(',')
          if (!parents || !pp.month_year) continue
          const key = `${parents}|${pp.month_year}|${pp.pp_type ?? ''}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(pp)
        }

        // For each dup group choose the keeper (most paid = lowest balance).
        // Carry the in-memory PPRow for each dropped PP so soft-delete needs no
        // extra query. A dropped PP that is fully unpaid (balance == amount)
        // can't have linked payments, so removing it needs only a cheap
        // tuition-balance recompute — NOT a full relink (the slow part that made
        // this time out when everyone had duplicates).
        const removals: { keepId: string; drop: PPRow }[] = []
        const affectedParents = new Set<string>()
        for (const rows of groups.values()) {
          if (rows.length <= 1) continue
          // Keep the PP holding the FULL total amount (what's actually owed for
          // that month), not the one with the least left to pay — a partially
          // paid twin carries a reduced amount and must not become the keeper.
          rows.sort((a, b) => (Number(b.amount) - Number(a.amount)) || String(a.id).localeCompare(String(b.id)))
          const keep = rows[0]
          for (const drop of rows.slice(1)) removals.push({ keepId: keep.id, drop })
          for (const pid of (keep.parent_ids as string[]) ?? []) affectedParents.add(pid)
        }

        send({ type: 'log', message: `נמצאו ${removals.length} תשלומים מתוכננים כפולים · ${affectedParents.size} אנשים מושפעים${dryRun ? ' (בדיקה בלבד)' : ''}` })

        if (!dryRun) {
          const relinkParents = new Set<string>()   // parents where txs actually moved
          const balanceParents = new Set<string>()  // parents needing only a balance refresh
          let done = 0
          for (const { keepId, drop } of removals) {
            const dropParents = (drop.parent_ids as string[]) ?? []
            // Only a possibly-paid duplicate can have linked transactions to move.
            if (Number(drop.balance) < Number(drop.amount)) {
              const { data: moved } = await supabaseAdmin
                .from('transactions')
                .update({ planned_payment_id: keepId })
                .eq('planned_payment_id', drop.id)
                .select('id')
              if (moved && moved.length > 0) dropParents.forEach(p => relinkParents.add(p))
            }
            dropParents.forEach(p => balanceParents.add(p))
            await softDelete(supabaseAdmin, 'planned_payment', drop.id, drop, deletedBy)
            done++
            if (done % 25 === 0) send({ type: 'progress', current: done, total: removals.length })
          }
          // Full relink only where payments moved; everyone else just needs the
          // tuition_balance re-summed (one quick query) — keeps us under the limit.
          for (const pid of relinkParents) {
            try { await relinkParent(pid) } catch { /* keep going */ }
          }
          for (const pid of balanceParents) {
            if (relinkParents.has(pid)) continue
            try { await recalcParentTuitionBalance(pid) } catch { /* keep going */ }
          }
        }

        send({ type: 'done', duplicates: removals.length, parents: affectedParents.size, dryRun })
      } catch (err) {
        send({ type: 'error', message: String((err as { message?: string })?.message ?? err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  })
}
