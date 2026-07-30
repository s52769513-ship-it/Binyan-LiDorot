import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { reverseReturnedHokCharge, REVERSED_NOTE } from '@/lib/hokReturn'
import { round2 } from '@/lib/money'

export const maxDuration = 300

/** סימון על תנועת ההחזרה עצמה — כדי שהתיקון לא יטפל בה פעמיים. */
const HANDLED_NOTE = 'חוב הוחזר'

/**
 * POST /api/automations/fix-past-hok-returns
 * תיקון חד-פעמי להחזרות הו"ק שנרשמו לפני התיקון: אצלן החיוב המקורי נשאר
 * מקושר ולכן החוב לא חזר. סורק את תנועות ההחזרה הקיימות, מבטל לכל אחת את
 * החיוב המקורי ומחייב את עמלת ההחזרה.
 *
 * body: { dryRun?: boolean }  — dryRun מציג מה יקרה בלי לשנות דבר.
 */
export async function POST(req: NextRequest) {
  let dryRun = true
  try {
    const body = await req.json().catch(() => ({}))
    dryRun = body?.dryRun !== false
  } catch { /* ברירת מחדל: בדיקה בלבד */ }

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (o: object) => controller.enqueue(encoder.encode(JSON.stringify(o) + '\n'))
      try {
        // כל תנועות ההחזרה שנרשמו (שליליות, מסוג "החזרת הו"ק")
        const { data: returns, error } = await supabaseAdmin
          .from('transactions')
          .select('id, amount, date, month_year, notes, parent_ids, standing_order_id')
          .eq('type', 'החזרת הו"ק')
          .order('date', { ascending: true })
        if (error) throw error

        const pending = (returns ?? []).filter(r => !String(r.notes ?? '').includes(HANDLED_NOTE))
        send({ type: 'log', message: `נמצאו ${(returns ?? []).length} החזרות · ${pending.length} טרם טופלו${dryRun ? ' [בדיקה בלבד]' : ''}` })

        let fixed = 0, skipped = 0, feesAdded = 0
        let totalRestored = 0

        for (let i = 0; i < pending.length; i++) {
          const r = pending[i]
          const parentId = ((r.parent_ids as string[]) ?? [])[0]
          const amount   = Math.abs(Number(r.amount) || 0)
          const soId     = (r.standing_order_id as string) ?? null
          const label    = `${String(r.notes ?? '').slice(0, 40)} · ₪${amount}`

          if (!parentId || !soId || amount <= 0) {
            skipped++
            send({ type: 'progress', current: i + 1, total: pending.length, label, skipped: true, reason: 'חסר הורה/הו"ק' })
            continue
          }

          if (dryRun) {
            // בבדיקה בלבד: רק מאתרים אם קיים חיוב מקורי שניתן לבטל
            const { data: charges } = await supabaseAdmin
              .from('transactions')
              .select('id, amount, notes')
              .eq('standing_order_id', soId)
              .gt('amount', 0)
              .lte('date', String(r.date ?? ''))
              .order('date', { ascending: false })
              .limit(20)
            const found = (charges ?? []).find(c =>
              round2(Number(c.amount)) === round2(amount) &&
              !String(c.notes ?? '').includes(REVERSED_NOTE))
            if (found) { fixed++; totalRestored = round2(totalRestored + amount); feesAdded++ }
            else skipped++
            send({
              type: 'progress', current: i + 1, total: pending.length, label,
              skipped: !found, reason: found ? undefined : 'לא נמצא החיוב המקורי',
            })
            continue
          }

          try {
            const rev = await reverseReturnedHokCharge({
              standingOrderDbId: soId,
              parentId,
              amount,
              monthYear: String(r.month_year ?? ''),
              date: String(r.date ?? ''),
              donorName: '',
              chargeBefore: String(r.date ?? '') || null,
            })
            if (rev.reversedTxId) {
              fixed++
              totalRestored = round2(totalRestored + rev.restoredAmount)
            } else {
              skipped++
            }
            if (rev.feePPId) feesAdded++

            // מסמנים את ההחזרה כמטופלת — כדי שהרצה חוזרת לא תבטל חיוב נוסף
            await supabaseAdmin.from('transactions')
              .update({ notes: `${String(r.notes ?? '')} · ${HANDLED_NOTE}`.trim() })
              .eq('id', r.id as string)

            send({
              type: 'progress', current: i + 1, total: pending.length, label,
              skipped: !rev.reversedTxId,
              reason: rev.reversedTxId ? undefined : 'לא נמצא החיוב המקורי',
            })
          } catch (e) {
            skipped++
            send({ type: 'progress', current: i + 1, total: pending.length, label, skipped: true, reason: String(e) })
          }
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id: crypto.randomUUID(),
            automation_id: 'fix-past-hok-returns',
            run_at: new Date().toISOString(),
            dry_run: false,
            actions_count: fixed,
            status: skipped > 0 ? 'partial' : 'success',
            summary: `תיקון החזרות הו"ק קודמות: ${fixed} תוקנו · ${skipped} דולגו · חוב שהוחזר ₪${totalRestored.toLocaleString('he-IL')} · ${feesAdded} חיובי עמלה`,
          }).select().single().then(() => {}, () => {})
        }

        send({ type: 'complete', applied: fixed, skipped, totalRestored, feesAdded, dryRun })
      } catch (err) {
        send({ type: 'error', message: err instanceof Error ? err.message : String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  })
}
