import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'
import {
  insertSpilloverRows,
  recalcParentTuitionBalance,
  updateParentCredits,
  ppTypeForProject,
  MISSING_COLUMN_CODES,
  SPILLOVER_NOTES_PREFIX,
  type PayablePPType,
  type SpilloverRowInput,
} from '@/lib/ppPayments'
import { isTxBeforeStart, ppBeforeStart } from '@/lib/cutoffs'

const UNDEFINED_COLUMN = '42703'
const round2 = (n: number) => Math.round(n * 100) / 100

export interface RelinkStats {
  ppsReset: number
  txsProcessed: number
  newlyLinked: number
  spilloverCreated: number
  spilloverTotal: number
  /** סכום זיכוי כולל (שכ"ל + מגבית) — לתאימות לאחור */
  credit: number
  creditTuition: number
  creditDonation: number
}

interface PoolPP {
  id: string
  amount: number
  balance: number
  month_year: string
  pp_type: PayablePPType | null
}

/**
 * ריענון הורה — הרצה מחדש של כל התנועות המשויכות לחוב (מקושרות וגם כאלה
 * שמעולם לא קושרו):
 * 1. מוחק שורות "זיכוי מעודף תשלום" שנוצרו בעבר (משוחזרות מחדש בהרצה)
 * 2. מאפס יתרות של כל ה-PP שאינם משכורת ואת יתרות הזכות (שכ"ל + מגבית בנפרד)
 * 3. מריץ כל תנועה (מקושרת או חופשית) בסדר כרונולוגי: קודם PP של אותו חודש
 *    (אם פתוח), אחרת ה-PP שהייתה מקושרת אליו כבר (אם עדיין פתוח), אחרת
 *    הפתוח הוותיק ביותר — גלישה נשארת בתוך אותו סוג חוב (שכ"ל↔שכ"ל,
 *    מגבית↔מגבית — לא מערבבים), וכל גלישה נרשמת כשורת "זיכוי מעודף תשלום"
 *    גלויה על ה-PP שקיבל אותה
 * 4. עודף סופי → יתרת זכות מתאימה (credit_balance / donation_credit_balance)
 */
// נעילה נגד ריצות חופפות לאותו הורה — ריצה שנייה מקבלת את ה-Promise של
// הראשונה. מחיקה-ואז-הכנסה של שורות הזיכוי בשתי ריצות משולבות משאירה שורות
// כפולות שעלולות להתפרש כתשלומים (ראה recalc-donation-pp).
const inFlightRelink = new Map<string, Promise<RelinkStats>>()

export function relinkParent(parentId: string): Promise<RelinkStats> {
  const existing = inFlightRelink.get(parentId)
  if (existing) return existing
  const p = doRelinkParent(parentId).finally(() => inFlightRelink.delete(parentId))
  inFlightRelink.set(parentId, p)
  return p
}

async function doRelinkParent(parentId: string): Promise<RelinkStats> {
  // 1. Delete ALL system-generated credit rows — the replay recreates the ones
  //    it needs. Covers: spillover rows (source_transaction_id / 'זיכוי מעודף
  //    תשלום' notes) AND the legacy 'זיכוי שמור' rows the older recalc created,
  //    which all use type='זיכוי'. Without deleting these, they linger linked to
  //    PPs and (in the old recalc) stacked another credit row every run — the
  //    duplicate "זיכוי 1,800" rows. Credit now lives only in credit_balance.
  const delBySource = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .not('source_transaction_id', 'is', null)
  if (delBySource.error && delBySource.error.code !== UNDEFINED_COLUMN) throw delBySource.error
  const delByNotes = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .like('notes', `${SPILLOVER_NOTES_PREFIX}%`)
  if (delByNotes.error) throw delByNotes.error
  const delByType = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .eq('type', 'זיכוי')
  if (delByType.error) throw delByType.error

  // 2. Non-salary PPs, reset in memory to the full amount
  const { data: ppsRaw, error: ppErr } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, month_year, pp_type')
    .contains('parent_ids', [parentId])
    .neq('pp_type', 'salary')
  if (ppErr) throw ppErr
  const pps: PoolPP[] = sortByMonth(ppsRaw ?? [], true).map(p => ({
    id: p.id as string,
    amount: Number(p.amount) || 0,
    balance: Number(p.amount) || 0,
    month_year: (p.month_year as string) ?? '',
    pp_type: (p.pp_type as PayablePPType | null) ?? null,
  }))

  // 3. All positive transactions (linked or not), oldest first — a
  //    transaction never linked before (e.g. a donation payment that
  //    arrived before its PP existed) gets picked up and linked here too.
  //    manual_link: a transaction the user linked/unlinked by hand — the
  //    replay must NOT re-choose its target (see loop below). Read it
  //    resiliently so the code keeps working before the migration is run.
  type RelinkTx = {
    id: string; amount: number; date: string | null; month_year: string | null
    planned_payment_id: string | null; project_names: string[] | null
    notes: string | null; manual_link?: boolean
  }
  const fetchTxs = (cols: string) => supabaseAdmin
    .from('transactions')
    .select(cols)
    .contains('parent_ids', [parentId])
    .gt('amount', 0)
    .order('date', { ascending: true })
  const withManual = 'id, amount, date, month_year, planned_payment_id, project_names, notes, manual_link'
  const noManual   = 'id, amount, date, month_year, planned_payment_id, project_names, notes'
  let txsResult = await fetchTxs(withManual)
  if (txsResult.error && MISSING_COLUMN_CODES.has(txsResult.error.code)) {
    txsResult = await fetchTxs(noManual)
  }
  if (txsResult.error) throw txsResult.error
  const txs = (txsResult.data ?? []) as unknown as RelinkTx[]

  const spillovers: SpilloverRowInput[] = []
  const linkUpdates: { id: string; planned_payment_id: string | null }[] = []
  let creditTuition = 0
  let creditDonation = 0
  let newlyLinked = 0
  let processed = 0

  for (const tx of txs ?? []) {
    // שורות זיכוי/גלישה שהמערכת יצרה אינן תשלומים — מדלגים גם אם שלב 1 לא
    // מחק אותן (ריצה חופפת), אחרת הן מנפחות את הזיכוי בכל ריצה.
    const txNotes = String(tx.notes ?? '')
    if (txNotes.startsWith(SPILLOVER_NOTES_PREFIX) || txNotes === 'זיכוי שמור') continue

    const manual = (tx as { manual_link?: boolean }).manual_link === true
    const wasLinked = tx.planned_payment_id != null
    const linked = wasLinked ? pps.find(p => p.id === tx.planned_payment_id) : undefined

    // ── קישור ידני ── המשתמש קבע את השיוך בעצמו — הריענון לא נוגע בו.
    if (manual) {
      // ניתוק ידני (planned_payment_id=null): התנועה נשארת צפה — לא יורדת
      // מ-PP ולא נזקפת כזיכוי. פשוט מדלגים עליה.
      if (!wasLinked) continue
      // קישור ידני ל-PP קיים: מורידים את הסכום מאותו PP בדיוק (גם אם לפני
      // החיתוך — ידני גובר), עודף → יתרת זכות של סוג החוב. לא בוחרים יעד
      // מחדש ולא כותבים linkUpdates (השיוך נשמר כמו שהוא).
      if (linked) {
        processed++
        const applyType = linked.pp_type ?? 'tuition'
        let rem = Math.abs(Number(tx.amount))
        const apply = Math.min(rem, linked.balance)
        linked.balance = round2(linked.balance - apply)
        rem = round2(rem - apply)
        if (applyType === 'donation') creditDonation = round2(creditDonation + rem)
        else creditTuition = round2(creditTuition + rem)
      } else {
        // מקושר ל-PP שכבר לא קיים (נמחק) — מנתקים לצפה.
        linkUpdates.push({ id: tx.id as string, planned_payment_id: null })
      }
      continue
    }

    // תנועה שכבר הייתה מקושרת: סוג החוב נקבע לפי ה-PP עצמו (מקור אמת).
    // תנועה חופשית: סוג החוב נקבע לפי הפרויקט שלה — קטגוריה שאינה
    // שכ"ל/מגבית (משכורות, הוצאות וכו') נשארת בלי קישור, כמו בכל שאר הקוד.
    // סוג החוב נקבע קודם כל לפי הפרויקט של התנועה עצמה — הוא מקור האמת.
    // קודם לכן, תנועה שכבר הייתה מקושרת ירשה את הסוג מה-PP שאליו קושרה, כך
    // שתנועה שקושרה בטעות ל-PP מגבית (או שכ"ל) נותרה שם לנצח וכל ריענון קיבע
    // אותה מחדש — ומגבית "קיבלה" תשלומים שאינם מגבית. עכשיו הפרויקט מנצח ומחזיר
    // אותה לסוג הנכון. כשהפרויקט אינו חד-משמעי (למשל שורות ישנות בלי קטגוריה)
    // נשארת הנפילה-לאחור לסוג ה-PP המקושר, כדי לא לנתק תשלומים אמיתיים.
    const projectType = ppTypeForProject((tx.project_names as string[] | null)?.join(' '))
    const poolType: PayablePPType | null = projectType
      ?? (wasLinked ? (linked?.pp_type ?? 'tuition') : null)
    if (!poolType) continue

    // תנועה שכ"ל לפני 04/2026 / מגבית לפני 06/2026 — היסטורית, לא מקושרת ולא
    // נזקפת כזיכוי. אם הייתה מקושרת בעבר — מנתקים.
    if (isTxBeforeStart(poolType, tx.date as string | null)) {
      if (tx.planned_payment_id != null) linkUpdates.push({ id: tx.id as string, planned_payment_id: null })
      continue
    }
    processed++

    // אוטומטי לעולם לא יורד מ-PP שלפני החיתוך — אלה משויכים רק ידנית.
    const open = pps.filter(p =>
      p.balance > 0 && p.pp_type === poolType &&
      !ppBeforeStart(p.pp_type, { month_year: p.month_year })
    )
    const monthMatch = open.find(p => p.month_year === tx.month_year)
    const stickyLink = linked && linked.balance > 0 && !ppBeforeStart(linked.pp_type, { month_year: linked.month_year }) ? linked : undefined
    const preferred = monthMatch ?? stickyLink
    const cascade = preferred ? [preferred, ...open.filter(p => p.id !== preferred.id)] : open

    const primaryId = cascade[0]?.id ?? null
    if ((tx.planned_payment_id ?? null) !== primaryId) {
      linkUpdates.push({ id: tx.id as string, planned_payment_id: primaryId })
      if (!wasLinked && primaryId) newlyLinked++
    }

    let remaining = Math.abs(Number(tx.amount))
    for (const pp of cascade) {
      if (remaining <= 0) break
      const apply = Math.min(remaining, pp.balance)
      pp.balance = round2(pp.balance - apply)
      remaining = round2(remaining - apply)
      if (apply > 0 && pp.id !== primaryId) {
        spillovers.push({
          parentId,
          ppId: pp.id,
          ppMonthYear: pp.month_year,
          ppType: pp.pp_type,
          amount: apply,
          sourceTxId: tx.id as string,
          sourceLabel: (tx.month_year as string) || (tx.date as string) || null,
          date: (tx.date as string) || null,
        })
      }
    }

    if (poolType === 'donation') creditDonation = round2(creditDonation + remaining)
    else creditTuition = round2(creditTuition + remaining)
  }

  // 4. Persist: link corrections, PP balances (batched), spillover rows, credits
  for (const u of linkUpdates) {
    await supabaseAdmin.from('transactions').update({ planned_payment_id: u.planned_payment_id }).eq('id', u.id)
  }
  for (let i = 0; i < pps.length; i += 50) {
    await Promise.all(pps.slice(i, i + 50).map(pp =>
      supabaseAdmin.from('planned_payments').update({ balance: pp.balance }).eq('id', pp.id)
    ))
  }
  await insertSpilloverRows(spillovers)
  await updateParentCredits(parentId, { tuition: creditTuition, donation: creditDonation })
  // Zero the legacy pp_credit column: credit now lives solely in credit_balance,
  // and the parent API sums BOTH — a stale pp_credit would double the displayed
  // credit. Best-effort; ignore if the column isn't present.
  const { error: ppcErr } = await supabaseAdmin.from('parents').update({ pp_credit: 0 }).eq('id', parentId)
  if (ppcErr && !MISSING_COLUMN_CODES.has(ppcErr.code)) { /* non-fatal */ }
  await recalcParentTuitionBalance(parentId)

  return {
    ppsReset: pps.length,
    txsProcessed: processed,
    newlyLinked,
    spilloverCreated: spillovers.length,
    spilloverTotal: round2(spillovers.reduce((s, r) => s + r.amount, 0)),
    credit: round2(creditTuition + creditDonation),
    creditTuition,
    creditDonation,
  }
}
