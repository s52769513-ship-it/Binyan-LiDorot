import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'
import {
  insertSpilloverRows,
  recalcParentTuitionBalance,
  updateParentCredits,
  ppTypeForProject,
  markReturnedCharges,
  SPILLOVER_NOTES_PREFIX,
  RETURNED_CHARGE_NOTES_PREFIX,
  type PayablePPType,
  type SpilloverRowInput,
} from '@/lib/ppPayments'
import { isTxBeforeStart } from '@/lib/cutoffs'

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
  // 0. Reconcile bank-הו"ק returns: mark each returned charge (unlink it + tag
  //    its notes) so the replay below never counts a bounced charge as a
  //    payment — the debt for that month re-opens automatically.
  await markReturnedCharges(parentId)

  // 1. Delete previously generated spillover rows — the replay recreates them.
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
  const { data: txs, error: txErr } = await supabaseAdmin
    .from('transactions')
    .select('id, amount, date, month_year, planned_payment_id, project_names, notes')
    .contains('parent_ids', [parentId])
    .gt('amount', 0)
    .order('date', { ascending: true })
  if (txErr) throw txErr

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
    if (
      txNotes.startsWith(SPILLOVER_NOTES_PREFIX) ||
      txNotes === 'זיכוי שמור' ||
      txNotes.startsWith(RETURNED_CHARGE_NOTES_PREFIX)  // חיוב הו"ק שחזר — אינו תשלום
    ) continue
    const wasLinked = tx.planned_payment_id != null
    const linked = wasLinked ? pps.find(p => p.id === tx.planned_payment_id) : undefined
    // תנועה שכבר הייתה מקושרת: סוג החוב נקבע לפי ה-PP עצמו (מקור אמת).
    // תנועה חופשית: סוג החוב נקבע לפי הפרויקט שלה — קטגוריה שאינה
    // שכ"ל/מגבית (משכורות, הוצאות וכו') נשארת בלי קישור, כמו בכל שאר הקוד.
    const poolType: PayablePPType | null = wasLinked
      ? (linked?.pp_type ?? 'tuition')
      : ppTypeForProject((tx.project_names as string[] | null)?.join(' '))
    if (!poolType) continue

    // תנועה שכ"ל לפני 04/2026 / מגבית לפני 06/2026 — היסטורית, לא מקושרת ולא
    // נזקפת כזיכוי. אם הייתה מקושרת בעבר — מנתקים.
    if (isTxBeforeStart(poolType, tx.date as string | null)) {
      if (tx.planned_payment_id != null) linkUpdates.push({ id: tx.id as string, planned_payment_id: null })
      continue
    }
    processed++

    const open = pps.filter(p => p.balance > 0 && p.pp_type === poolType)
    const monthMatch = open.find(p => p.month_year === tx.month_year)
    const stickyLink = linked && linked.balance > 0 ? linked : undefined
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
