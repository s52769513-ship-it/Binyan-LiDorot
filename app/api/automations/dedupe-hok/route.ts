import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDelete } from '@/lib/trash'
import { relinkParent } from '@/lib/relink'

export const maxDuration = 300

// One-time cleanup for duplicate bank/credit הו"ק transactions that a repeated
// pull created before the DB-level dedup was added. A standing order is charged
// at most once per (date, amount), so any group of transactions sharing
// standing_order_id + type + amount + charge-key beyond the first is a
// duplicate. We soft-delete the extras (recoverable from 🗑️ אשפה) and relink
// every affected parent so PP balances and credits recompute from the truth.
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
        const { data: txs, error } = await supabaseAdmin
          .from('transactions')
          .select('id, standing_order_id, type, amount, date, month_year, parent_ids, created_at')
          .in('type', ['הו"ק', 'החזרת הו"ק'])
          .not('standing_order_id', 'is', null)
        if (error) throw error

        // Group by the natural key of a single real charge/return.
        const groups = new Map<string, typeof txs>()
        for (const tx of txs ?? []) {
          const chargeKey = tx.type === 'החזרת הו"ק' ? (tx.month_year ?? '') : (tx.date ?? '')
          const key = `${tx.standing_order_id}|${tx.type}|${tx.amount}|${chargeKey}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(tx)
        }

        const toDelete: typeof txs = []
        for (const rows of groups.values()) {
          if (rows.length <= 1) continue
          // Keep the earliest (created_at, then id as a stable tiebreaker); the rest are dupes.
          rows.sort((a, b) => String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || String(a.id).localeCompare(String(b.id)))
          toDelete.push(...rows.slice(1))
        }

        const affectedParents = new Set<string>()
        for (const tx of toDelete) for (const pid of (tx.parent_ids as string[]) ?? []) affectedParents.add(pid)

        send({ type: 'log', message: `נמצאו ${toDelete.length} תנועות הו"ק כפולות · ${affectedParents.size} אנשים מושפעים${dryRun ? ' (בדיקה בלבד)' : ''}` })

        if (!dryRun) {
          let del = 0
          for (const tx of toDelete) {
            await softDelete(supabaseAdmin, 'transaction', tx.id as string, tx, deletedBy)
            del++
            if (del % 20 === 0) send({ type: 'progress', current: del, total: toDelete.length })
          }
          // Relink each affected parent so PP balances + credits recompute
          // from the remaining (real) transactions — clears phantom overpayment.
          let relinked = 0
          for (const pid of affectedParents) {
            try { await relinkParent(pid) } catch { /* keep going */ }
            relinked++
            if (relinked % 10 === 0) send({ type: 'progress', current: relinked, total: affectedParents.size })
          }
          try {
            await supabaseAdmin.from('automation_logs').insert({
              id: crypto.randomUUID(), automation_id: 'dedupe-hok',
              run_at: new Date().toISOString(), dry_run: false,
              actions_count: del, status: 'success',
              summary: `ניקוי כפילויות הו"ק: נמחקו ${del} תנועות · קושרו מחדש ${affectedParents.size} אנשים`,
            })
          } catch { /* best-effort */ }
        }

        send({ type: 'done', duplicates: toDelete.length, parents: affectedParents.size, dryRun })
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
