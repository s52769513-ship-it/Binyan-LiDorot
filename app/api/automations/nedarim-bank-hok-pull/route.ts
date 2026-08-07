import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { applyPaymentToParentPPs, findPaymentTarget, ppTypeForProject } from '@/lib/ppPayments'

import { MOSAD_ID, API_PASS } from '@/lib/nedarim'
import { reverseReturnedHokCharge, RETURN_FEE } from '@/lib/hokReturn'
import { recalcParentTuitionBalance } from '@/lib/ppPayments'

const AUTOMATION_ID = 'nedarim-bank-hok-pull'
// Dedup reads from this id AND the legacy 'nedarim-pull' id, so rows already
// imported under the old automation are never brought in a second time.
const DEDUP_IDS = [AUTOMATION_ID, 'nedarim-pull']

function parseNedarimDate(dateStr: string): { date: string; monthYear: string } {
  const [datePart] = String(dateStr || '').split(' ')
  const parts = datePart.split('/')
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts
    return { date: `${yyyy}-${mm}-${dd}`, monthYear: `${mm}/${yyyy}` }
  }
  const today = new Date().toISOString().split('T')[0]
  const [y, m] = today.split('-')
  return { date: today, monthYear: `${m}/${y}` }
}

// "DD/MM/YYYY" for a date N days before today (default range for scheduled runs).
function isoAgo(days: number): string {
  const d = new Date(Date.now() - days * 86_400_000)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function todayDMY(): string {
  const d = new Date()
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// GET — last run info
export async function GET() {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('run_at, summary, details')
    .eq('automation_id', AUTOMATION_ID)
    .order('run_at', { ascending: false })
    .limit(1)
  return NextResponse.json(data?.[0] ?? null)
}

// POST — pull bank charge/return history from Nedarim (Masav GetMasavHistoryNew)
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun: boolean = body.dryRun === true
  const parentId: string | null = body.parentId ?? null
  // Scheduled/daily runs may omit the range → default to a rolling 45-day window
  // (back-dated returns/updates are caught; the DT_RowId dedup prevents repeats).
  const from: string = body.from || isoAgo(45)
  const to: string   = body.to   || todayDMY()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      let totalImported = 0, totalReturned = 0, totalSkipped = 0, totalAmount = 0
      const actions: object[] = []

      try {
        // Optional parent filter — restrict to that parent's bank הו"ק numbers
        let parentHokNumbers: Set<string> | null = null
        if (parentId) {
          const { data: parentSos } = await supabaseAdmin
            .from('standing_orders')
            .select('external_id')
            .or(`parent_id.eq.${parentId},linked_parent_id.eq.${parentId}`)
            .eq('standing_order_type', 'בנקאי')
          parentHokNumbers = new Set((parentSos ?? []).map(s => String(s.external_id)).filter(Boolean))
          send({ type: 'log', message: `סינון להורה: ${parentHokNumbers.size} הו"ק בנקאי` })
        }

        // 1. Pull the charge/return history for the date range
        send({ type: 'log', message: `מושך תנועות הו"ק בנקאי מנדרים (${from} – ${to})...` })
        const url = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavHistoryNew&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}`
        const res = await fetch(url)
        if (!res.ok) throw new Error(`Nedarim API: ${res.status}`)
        const raw = await res.text()
        let parsed: { data?: Record<string, unknown>[] } = {}
        try { parsed = JSON.parse(raw) } catch { throw new Error('תגובה לא תקינה מנדרים') }
        const records = (parsed?.data ?? []) as Record<string, unknown>[]
        send({ type: 'log', message: `נמצאו ${records.length} רשומות` })

        // 2. Load already-imported DT_RowIds (this id + legacy) for dedup
        const { data: prevLogs } = await supabaseAdmin
          .from('automation_logs')
          .select('details')
          .in('automation_id', DEDUP_IDS)
          .eq('dry_run', false)
          .limit(300)
        const importedRowIds = new Set<string>()
        for (const log of prevLogs ?? []) {
          const ids = (log.details as Record<string, unknown> | null)?.rowIds
          if (Array.isArray(ids)) ids.forEach((id: unknown) => importedRowIds.add(String(id)))
        }

        // 3. Process each record
        const today = new Date().toISOString().split('T')[0]
        const newRowIds: string[] = []

        for (let i = 0; i < records.length; i++) {
          const rec       = records[i]
          const hokNumber = String(rec['2'] ?? '').trim()   // מספר הו"ק
          const donorName = String(rec['3'] ?? '').trim()   // שם
          const dateRaw   = String(rec['4'] ?? '').trim()   // תאריך
          // נדרים עשויים לדווח את סכום ההחזרה כשלילי. עד כה עשינו -amount על
          // הערך הגולמי, וכך החזרה שהגיעה שלילית נשמרה *חיובית* — ואז הריענון
          // ספר אותה כתשלום והקטין את החוב במקום להגדיל אותו. עובדים תמיד עם
          // הערך המוחלט, וקובעים את הסימן לפי סוג האירוע.
          const amount    = Math.abs(Number(rec['5'] ?? 0))  // סכום (תמיד חיובי)
          const status    = String(rec['6'] ?? '').trim()   // סטטוס
          const category  = String(rec['8'] ?? '').trim()   // קטגוריה
          const rowId     = String(rec['DT_RowId'] ?? '').trim()

          send({ type: 'progress', current: i + 1, total: records.length })

          if (parentHokNumbers !== null && !parentHokNumbers.has(hokNumber)) { totalSkipped++; continue }
          // רשומה שמופיעה ביומן ריצה קודם *אינה* הוכחה שהתנועה קיימת: היומן
          // נרשם גם כשההכנסה נכשלה, והתנועה גם עשויה להימחק אחר כך. קודם לכן
          // דילגנו כאן מיד, ולכן שורה כזו סומנה "יובא כבר" לנצח ולא נכנסה
          // לעולם. עכשיו היומן הוא רמז בלבד, ובדיקת הכפילות מול מסד הנתונים
          // (למטה) היא זו שמכריעה.
          const seenInLog = !!rowId && importedRowIds.has(rowId)

          const isReturned = status === 'החזרת הוראת קבע' || status.includes('חזרה')

          // Find parent via standing order external_id
          const { data: soRows } = await supabaseAdmin
            .from('standing_orders')
            .select('id, parent_id, linked_parent_id')
            .eq('external_id', hokNumber)
            .limit(1)
          const so = soRows?.[0] ?? null
          const standingOrderDbId = so?.id ?? null
          const payerParentId     = so?.parent_id ?? null
          const billingParentId   = so?.linked_parent_id ?? payerParentId

          if (!payerParentId) {
            totalSkipped++
            actions.push({ hokNumber, donorName, amount, status, skipped: true, reason: 'הו"ק לא נמצא במערכת' })
            send({ type: 'log', message: `הו"ק ${hokNumber} (${donorName}): לא נמצא במערכת — דלג` })
            continue
          }

          const { date, monthYear } = parseNedarimDate(dateRaw)
          const projectName = category || 'בנין לדורות'
          const notes = ['נדרים', rowId ? `DT:${rowId}` : null, status || null].filter(Boolean).join(' · ')

          // Bulletproof dedup independent of DT_RowId: a bank standing order is
          // charged at most once per date for a given amount. If Nedarim omits/
          // rotates DT_RowId, or this pull runs more than once (daily cron + a
          // manual run, or a transferred הו"ק), the RowId set alone would let the
          // same charge import again — so also skip when a matching transaction
          // already exists in the DB. This is what prevents the duplicate 1,800
          // rows (and the phantom overpayment credit they created).
          if (standingOrderDbId) {
            const wantAmount = isReturned ? -Math.abs(amount) : Math.abs(amount)
            // Match on standing order + amount + charge-key, NOT on the type
            // label: the same charge may already exist from the real-time
            // webhook (which labels it 'נדרים', not 'הו"ק'), and a standing
            // order is charged at most once per (date, amount) — so this catches
            // both a repeated pull AND a webhook↔pull cross-source duplicate.
            let dupeQ = supabaseAdmin
              .from('transactions')
              .select('id')
              .eq('standing_order_id', standingOrderDbId)
              .eq('amount', wantAmount)
              .limit(1)
            // Successful charge: match on the charge date. Return: date is stored
            // as "today", so match on the charge month instead (stable across days).
            dupeQ = isReturned ? dupeQ.eq('month_year', monthYear) : dupeQ.eq('date', date)
            const { data: dupe } = await dupeQ
            if (dupe && dupe.length > 0) {
              totalSkipped++
              if (rowId) { newRowIds.push(rowId); importedRowIds.add(rowId) }
              actions.push({ hokNumber, donorName, amount, status, skipped: true, reason: seenInLog ? 'יובא כבר' : 'תנועה זהה כבר קיימת' })
              continue
            }
            if (seenInLog) {
              // ביומן אבל לא במסד — התנועה נמחקה או שההכנסה נכשלה בריצה קודמת
              send({ type: 'log', message: `הו"ק ${hokNumber} (${donorName}): סומן כיובא אך לא נמצא במערכת — מייבא מחדש` })
            }
          }

          if (isReturned) {
            // Returned charge → negative transaction + 25₪ return fee
            if (!dryRun) {
              await supabaseAdmin.from('transactions').insert({
                id: crypto.randomUUID(), amount: -Math.abs(amount), type: 'החזרת הו"ק',
                date: today, month_year: monthYear, notes: `${notes} · ${donorName}`,
                parent_ids: Array.from(new Set([payerParentId, ...(billingParentId && billingParentId !== payerParentId ? [billingParentId] : [])])),
                project_ids: [], project_names: [projectName],
                planned_payment_id: null, standing_order_id: standingOrderDbId,
                synced_at: '2099-12-31T23:59:59.999Z', source: 'nedarim-hok',
              })
              await supabaseAdmin.from('transactions').insert({
                id: crypto.randomUUID(), amount: -25, type: 'עמלת החזרת הו"ק',
                date: today, month_year: monthYear, notes: `עמלת החזרת הו"ק · ${donorName}`,
                parent_ids: [payerParentId], project_ids: [], project_names: ['עמלות'],
                planned_payment_id: null, standing_order_id: standingOrderDbId,
                synced_at: '2099-12-31T23:59:59.999Z', source: 'nedarim-hok',
              })
              // ביטול החיוב המקורי → החוב חוזר, ועמלת ההחזרה נזקפת לחובת ההורה
              try {
                const rev = await reverseReturnedHokCharge({
                  standingOrderDbId, parentId: payerParentId,
                  amount, monthYear, date: today, donorName,
                })
                if (rev.restoredAmount > 0) {
                  send({ type: 'log', message: `  ↩ החוב הוחזר: ₪${rev.restoredAmount}` })
                }
                if (rev.feePPId) {
                  send({ type: 'log', message: `  ↩ נוצר חיוב עמלת החזרה ₪${RETURN_FEE}` })
                }
                if (!rev.reversedTxId) {
                  send({ type: 'log', message: `  ⚠ לא נמצא החיוב המקורי — החוב לא הוחזר אוטומטית` })
                }
                // רק חישוב מחדש של יתרת החוב הכוללת — בלי לגעת בסכומי ה-PP עצמם
                await recalcParentTuitionBalance(payerParentId).catch(() => {})
              } catch (e) {
                send({ type: 'log', message: `  ⚠ ביטול החיוב נכשל: ${String(e)}` })
              }
            }
            if (rowId) { newRowIds.push(rowId); importedRowIds.add(rowId) }
            totalReturned++
            actions.push({ hokNumber, donorName, amount: -Math.abs(amount), status, monthYear, isReturned: true, skipped: false })
            send({ type: 'log', message: `הו"ק ${hokNumber} (${donorName}): החזרה ₪${amount} · ${date}${dryRun ? ' [dry]' : ''}` })
            continue
          }

          // Successful charge → import + link to the matching PP
          const ppParentId = billingParentId ?? payerParentId
          const targetPPType = ppTypeForProject(projectName)
          const newTxId = crypto.randomUUID()
          let linkedPPId: string | null = null

          if (dryRun) {
            if (ppParentId) linkedPPId = (await findPaymentTarget(ppParentId, monthYear, targetPPType)).ppId
          } else {
            if (ppParentId) {
              linkedPPId = (await applyPaymentToParentPPs({
                parentId: ppParentId, amount, preferredMonthYear: monthYear, ppType: targetPPType,
                source: { txId: newTxId, label: monthYear, date },
              })).ppId
            }
            await supabaseAdmin.from('transactions').insert({
              id: newTxId, amount, type: 'הו"ק',
              date, month_year: monthYear, notes: `${notes} · ${donorName}`,
              parent_ids: Array.from(new Set([payerParentId, ...(billingParentId && billingParentId !== payerParentId ? [billingParentId] : [])])),
              project_ids: [], project_names: [projectName],
              planned_payment_id: linkedPPId, standing_order_id: standingOrderDbId,
              synced_at: '2099-12-31T23:59:59.999Z', source: 'nedarim-hok',
            })
          }

          if (rowId) { newRowIds.push(rowId); importedRowIds.add(rowId) }
          totalImported++
          totalAmount += amount
          actions.push({ hokNumber, donorName, amount, status, monthYear, ppLinked: !!linkedPPId, skipped: false })
          send({ type: 'log', message: `הו"ק ${hokNumber} (${donorName}): ₪${amount} · ${date}${linkedPPId ? ' → PP' : ''}${dryRun ? ' [dry]' : ''}` })
        }

        // 4. Log the run
        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id: crypto.randomUUID(), automation_id: AUTOMATION_ID,
            run_at: new Date().toISOString(), dry_run: false,
            actions_count: totalImported, status: 'success',
            summary: `הו"ק בנקאי: יובאו ${totalImported} · החזרות ${totalReturned} · דולגו ${totalSkipped} · ₪${totalAmount.toLocaleString('he-IL')} (${from}–${to})`,
            details: { from, to, rowIds: newRowIds, imported: totalImported, returned: totalReturned, skipped: totalSkipped, totalAmount },
          })
        }

        send({ type: 'done', imported: totalImported, returned: totalReturned, refused: totalReturned, skipped: totalSkipped, totalAmount, dryRun, actions })
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
