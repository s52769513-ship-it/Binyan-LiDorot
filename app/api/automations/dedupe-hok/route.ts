import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDelete } from '@/lib/trash'
import { relinkParent } from '@/lib/relink'

export const maxDuration = 300

type TxRow = {
  id: string; standing_order_id: string | null; type: string | null
  amount: number; date: string | null; month_year: string | null
  parent_ids: string[] | null; planned_payment_id: string | null; notes: string | null
}

// Extract Nedarim's TransactionId, stored by the webhook as a "#<id>" segment
// in the ' · '-separated notes. This is the exact identity of a single charge —
// webhook retries all carry the same one — so it's the safest dedup key.
function externalTxToken(notes: string | null): string | null {
  for (const seg of String(notes ?? '').split(' · ')) {
    const s = seg.trim()
    if (s.length > 1 && s.startsWith('#')) return s
  }
  return null
}

// One-time cleanup for duplicate charge transactions. Two independent causes:
//   1. Webhook retries → several rows sharing the same Nedarim TransactionId
//      (#<id> in notes), regardless of type/standing order.
//   2. A repeated pull before DB-dedup → rows sharing standing_order_id + amount
//      + charge-key. A standing order is charged at most once per (date, amount).
// Either way we keep one row (preferring a PP-linked one), soft-delete the rest
// (recoverable from 🗑️ אשפה) and relink affected parents so balances/credits
// recompute from the truth.
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
        // Fetch ALL transactions (paginated — PostgREST caps a page at ~1000),
        // so we catch duplicates whatever their type or standing-order state.
        const all: TxRow[] = []
        const PAGE = 1000
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabaseAdmin
            .from('transactions')
            .select('id, standing_order_id, type, amount, date, month_year, parent_ids, planned_payment_id, notes')
            .order('id', { ascending: true })
            .range(from, from + PAGE - 1)
          if (error) throw error
          const rows = (data ?? []) as unknown as TxRow[]
          all.push(...rows)
          send({ type: 'progress', current: all.length, total: all.length })
          if (rows.length < PAGE) break
        }

        // Group by dedup key: TransactionId token first (exact), else the
        // standing-order charge key. Rows with neither can't be safely deduped.
        const groups = new Map<string, TxRow[]>()
        for (const tx of all) {
          const token = externalTxToken(tx.notes)
          let key: string | null = null
          if (token) {
            key = `TID:${token}`
          } else if (tx.standing_order_id) {
            const chargeKey = Number(tx.amount) < 0 ? (tx.month_year ?? '') : (tx.date ?? '')
            key = `SO:${tx.standing_order_id}|${tx.amount}|${chargeKey}`
          }
          if (!key) continue
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(tx)
        }

        const toDelete: TxRow[] = []
        for (const rows of groups.values()) {
          if (rows.length <= 1) continue
          // Keep one, delete the rest. Prefer keeping a row that is linked to a
          // PP (so the kept transaction still counts toward the debt); id is a
          // stable tiebreaker (transactions has no created_at column).
          rows.sort((a, b) => {
            const al = a.planned_payment_id ? 0 : 1
            const bl = b.planned_payment_id ? 0 : 1
            return al - bl || String(a.id).localeCompare(String(b.id))
          })
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
