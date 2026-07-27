import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { softDelete } from '@/lib/trash'
import { relinkParent } from '@/lib/relink'

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

        // Group exact duplicates: same parents + month + type + amount.
        const groups = new Map<string, PPRow[]>()
        for (const pp of all) {
          const parents = [...((pp.parent_ids as string[]) ?? [])].sort().join(',')
          if (!parents || !pp.month_year) continue
          const key = `${parents}|${pp.month_year}|${pp.pp_type ?? ''}|${pp.amount}`
          if (!groups.has(key)) groups.set(key, [])
          groups.get(key)!.push(pp)
        }

        // For each dup group choose the keeper (most paid = lowest balance),
        // the rest are removed after their transactions move to the keeper.
        const removals: { keepId: string; dropId: string }[] = []
        const affectedParents = new Set<string>()
        for (const rows of groups.values()) {
          if (rows.length <= 1) continue
          rows.sort((a, b) => (a.balance - b.balance) || String(a.id).localeCompare(String(b.id)))
          const keep = rows[0]
          for (const drop of rows.slice(1)) removals.push({ keepId: keep.id, dropId: drop.id })
          for (const pid of (keep.parent_ids as string[]) ?? []) affectedParents.add(pid)
        }

        send({ type: 'log', message: `נמצאו ${removals.length} תשלומים מתוכננים כפולים · ${affectedParents.size} אנשים מושפעים${dryRun ? ' (בדיקה בלבד)' : ''}` })

        if (!dryRun) {
          let done = 0
          for (const { keepId, dropId } of removals) {
            // Move ALL transactions linked to the duplicate PP onto the keeper —
            // this is the "handle everything linked" requirement; no orphans.
            await supabaseAdmin
              .from('transactions')
              .update({ planned_payment_id: keepId })
              .eq('planned_payment_id', dropId)
            // Load + soft-delete the now-empty duplicate PP (recoverable).
            const { data: ppRow } = await supabaseAdmin
              .from('planned_payments').select('*').eq('id', dropId).single()
            if (ppRow) await softDelete(supabaseAdmin, 'planned_payment', dropId, ppRow, deletedBy)
            done++
            if (done % 20 === 0) send({ type: 'progress', current: done, total: removals.length })
          }
          // Recompute balances + credits from the consolidated PPs.
          let relinked = 0
          for (const pid of affectedParents) {
            try { await relinkParent(pid) } catch { /* keep going */ }
            relinked++
            if (relinked % 10 === 0) send({ type: 'progress', current: relinked, total: affectedParents.size })
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
