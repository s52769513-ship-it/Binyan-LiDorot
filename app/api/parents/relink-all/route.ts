import { supabaseAdmin } from '@/lib/supabase'
import { relinkParent } from '@/lib/relink'

export const maxDuration = 300 // ריצה על כל ההורים יכולה לקחת דקות

/** שגיאות Supabase הן אובייקטים ללא toString — String(err) נותן "[object Object]".
 *  מחלץ הודעה קריאה (message/details/code) כדי שהלוג יהיה שימושי. */
function errText(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as { message?: string; details?: string; hint?: string; code?: string }
    return e.message || e.details || e.hint || e.code || JSON.stringify(err)
  }
  return String(err)
}

/**
 * POST /api/parents/relink-all
 * מריץ ריענון (relinkParent) על כל הורה שיש לו תשלומים מתוכננים שאינם
 * משכורת, ומזרים התקדמות כ-ndjson: log / progress / complete / error.
 */
export async function POST() {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        // כל ההורים שיש להם PP שאינו משכורת
        const { data: pps, error: ppErr } = await supabaseAdmin
          .from('planned_payments')
          .select('parent_ids')
          .neq('pp_type', 'salary')
        if (ppErr) throw ppErr
        const parentIds = [...new Set((pps ?? []).flatMap(p => (p.parent_ids as string[]) ?? []))]

        let nameMap = new Map<string, string>()
        if (parentIds.length > 0) {
          const { data: parents } = await supabaseAdmin
            .from('parents').select('id, name').in('id', parentIds)
          nameMap = new Map((parents ?? []).map(p => [p.id as string, (p.name as string) ?? '']))
        }

        send({ type: 'log', message: `נמצאו ${parentIds.length} הורים עם תשלומים מתוכננים` })

        let done = 0, failed = 0
        let totalSpill = 0, totalCredit = 0

        for (let i = 0; i < parentIds.length; i++) {
          const pid = parentIds[i]
          const name = nameMap.get(pid) || pid
          try {
            const stats = await relinkParent(pid)
            done++
            totalSpill += stats.spilloverTotal
            totalCredit += stats.credit
            send({
              type: 'progress', current: i + 1, total: parentIds.length,
              parentName: name,
              txs: stats.txsProcessed,
              spillover: stats.spilloverTotal,
              credit: stats.credit,
            })
          } catch (err) {
            failed++
            send({ type: 'progress', current: i + 1, total: parentIds.length, parentName: name, skipped: true, reason: errText(err) })
          }
        }

        try {
          await supabaseAdmin.from('automation_logs').insert({
            id:            crypto.randomUUID(),
            automation_id: 'relink-all',
            run_at:        new Date().toISOString(),
            dry_run:       false,
            actions_count: done,
            status:        failed > 0 ? 'partial' : 'success',
            summary:       `ריענון כל ההורים: ${done} הצליחו · ${failed} נכשלו · גלישות ₪${Math.round(totalSpill).toLocaleString('he-IL')} · זיכויים ₪${Math.round(totalCredit).toLocaleString('he-IL')}`,
          })
        } catch { /* best-effort */ }

        send({ type: 'complete', applied: done, skipped: failed, totalSpill, totalCredit })
      } catch (err) {
        send({ type: 'error', message: errText(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  })
}
