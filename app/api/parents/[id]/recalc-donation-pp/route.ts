import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'
import {
  insertSpilloverRows,
  updateParentCredits,
  SPILLOVER_NOTES_PREFIX,
  type SpilloverRowInput,
} from '@/lib/ppPayments'
import { isTxBeforeStart } from '@/lib/cutoffs'
import { logActivity, SYSTEM_ACTOR } from '@/lib/activityLog'

const UNDEFINED_COLUMN = '42703'
const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * POST /api/parents/[id]/recalc-donation-pp
 * ריענון חוב מגבית בלבד — גרסה מקבילה ל-relinkParent אך ממוקדת מגבית, כדי
 * לא לגעת בשכ"ל. שני סוגי החוב לעולם לא מתערבבים.
 *
 * מבצע איפוס-והרצה-מחדש מלא (לא רק קישור תנועות חופשיות): כך גם עודף מתנועה
 * שכבר הייתה מקושרת (למשל שני תשלומי 520 על PP של 1000 = 40 עודף) נתפס
 * כזיכוי, בדיוק כמו בכפתור "ריענון". הפעולה אידמפוטנטית — מוחקת קודם את שורות
 * הזיכוי/הגלישה שהיא עצמה יצרה, ולכן בטוחה להרצה חוזרת ואוטומטית.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: parentId } = await params
  try {
    const result = await recalcDonationPPs(parentId)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// נעילה נגד ריצות מקבילות לאותו הורה: הטאב בכרטיס מפעיל recalc אוטומטית, ומעבר
// מהיר בין טאבים יכול להזניק שתי ריצות חופפות. שילוב מחיקה-ואז-הכנסה של שורות
// הזיכוי בשתי ריצות שמשתלבות זו בזו משאיר שורות זיכוי כפולות — שבריצה הבאה
// נספרו (בטעות) כתשלומים אמיתיים וניפחו את הזיכוי בכל מעבר טאב. ריצה חופפת
// מקבלת את ה-Promise של הריצה שכבר בדרך במקום להתחיל חדשה.
const inFlightRecalc = new Map<string, Promise<RecalcResult>>()

interface RecalcResult {
  ppsReset: number
  txsProcessed: number
  newlyLinked: number
  unlinkedWrong: number
  spilloverCreated: number
  leftoverCredit: number
}

export function recalcDonationPPs(parentId: string): Promise<RecalcResult> {
  const existing = inFlightRecalc.get(parentId)
  if (existing) return existing
  const p = doRecalcDonationPPs(parentId).finally(() => inFlightRecalc.delete(parentId))
  inFlightRecalc.set(parentId, p)
  return p
}

async function doRecalcDonationPPs(parentId: string): Promise<RecalcResult> {
  // ── שלב 0: מחיקת שורות זיכוי/גלישה מגבית שנוצרו בעבר (משוחזרות בהרצה) ──
  //    כל שורות המגבית האוטומטיות מזוהות ע"י project 'דמי מגבית' + סימון:
  //    source_transaction_id (גלישה), notes בתחילית הגלישה, או 'זיכוי שמור' ישן.
  const delBySource = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .contains('project_names', ['דמי מגבית'])
    .not('source_transaction_id', 'is', null)
  if (delBySource.error && delBySource.error.code !== UNDEFINED_COLUMN) throw delBySource.error

  const delByNotes = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .contains('project_names', ['דמי מגבית'])
    .like('notes', `${SPILLOVER_NOTES_PREFIX}%`)
  if (delByNotes.error) throw delByNotes.error

  const delLegacyCredit = await supabaseAdmin
    .from('transactions')
    .delete()
    .contains('parent_ids', [parentId])
    .contains('project_names', ['דמי מגבית'])
    .eq('notes', 'זיכוי שמור')
  if (delLegacyCredit.error) throw delLegacyCredit.error

  // ── שלב 1: ניתוק תנועות שקושרו בטעות ל-PP מגבית (לא מפרויקט "דמי מגבית") ──
  const { data: donationPPIds } = await supabaseAdmin
    .from('planned_payments')
    .select('id')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'donation')
  const ppIdList = (donationPPIds ?? []).map(p => p.id as string)
  let unlinkedWrong = 0

  if (ppIdList.length > 0) {
    const { data: wrongTxs } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .in('planned_payment_id', ppIdList)
      .not('project_names', 'cs', '{"דמי מגבית"}')
    for (const tx of wrongTxs ?? []) {
      await supabaseAdmin.from('transactions').update({ planned_payment_id: null }).eq('id', tx.id)
      unlinkedWrong++
    }
  }

  // ── שלב 2: טעינת כל ה-PP מגבית, איפוס יתרה לסכום המלא (בזיכרון) ─────────
  const { data: ppsRaw } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, month_year')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'donation')
  const pps = sortByMonth(ppsRaw ?? [], true).map(p => ({
    id: p.id as string,
    amount: Number(p.amount) || 0,
    balance: Number(p.amount) || 0,
    month_year: (p.month_year as string) ?? '',
  }))

  // ── שלב 3: כל תנועות המגבית החיוביות (מקושרות או חופשיות), הישן ביותר קודם ─
  const { data: txs } = await supabaseAdmin
    .from('transactions')
    .select('id, amount, date, month_year, planned_payment_id, notes')
    .contains('parent_ids', [parentId])
    .contains('project_names', ['דמי מגבית'])
    .gt('amount', 0)
    .order('date', { ascending: true })

  const spillovers: SpilloverRowInput[] = []
  const linkUpdates: { id: string; planned_payment_id: string | null }[] = []
  let credit = 0
  let newlyLinked = 0

  for (const tx of txs ?? []) {
    // שורות זיכוי/גלישה שהמערכת עצמה יצרה אינן תשלומים — גם אם שלב 0 לא הספיק
    // למחוק אותן (ריצה חופפת). ספירתן כתשלום היא שניפחה את הזיכוי בכל ריצה.
    const txNotes = String(tx.notes ?? '')
    if (txNotes.startsWith(SPILLOVER_NOTES_PREFIX) || txNotes === 'זיכוי שמור') continue
    const wasLinked = tx.planned_payment_id != null
    // תנועת מגבית לפני 06/2026 — היסטורית, לא מקושרת ולא נזקפת. מנתקים אם מקושרת.
    if (isTxBeforeStart('donation', tx.date as string | null)) {
      if (wasLinked) linkUpdates.push({ id: tx.id as string, planned_payment_id: null })
      continue
    }
    const linked = wasLinked ? pps.find(p => p.id === tx.planned_payment_id) : undefined
    const open = pps.filter(p => p.balance > 0)
    // קודם PP של אותו חודש; אחרת ה-PP שהיה מקושר (אם עדיין פתוח); אחרת הוותיק
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
          ppType: 'donation',
          amount: apply,
          sourceTxId: tx.id as string,
          sourceLabel: (tx.month_year as string) || (tx.date as string) || null,
          date: (tx.date as string) || null,
        })
      }
    }
    credit = round2(credit + remaining)
  }

  // ── שלב 4: שמירה — קישורים, יתרות, שורות גלישה, זיכוי מגבית ─────────────
  for (const u of linkUpdates) {
    await supabaseAdmin.from('transactions').update({ planned_payment_id: u.planned_payment_id }).eq('id', u.id)
  }
  for (let i = 0; i < pps.length; i += 50) {
    await Promise.all(pps.slice(i, i + 50).map(pp =>
      supabaseAdmin.from('planned_payments').update({ balance: pp.balance }).eq('id', pp.id)
    ))
  }
  await insertSpilloverRows(spillovers)
  await updateParentCredits(parentId, { donation: Math.max(0, credit) })

  if (newlyLinked > 0 || unlinkedWrong > 0 || spillovers.length > 0) {
    void logActivity({
      parentId, actor: SYSTEM_ACTOR, action: 'automation',
      summary: `ריענון מגבית אוטומטי: ${newlyLinked} תנועות קושרו${unlinkedWrong ? ` · ${unlinkedWrong} נותקו` : ''}${spillovers.length ? ` · ${spillovers.length} גלישות` : ''}${credit > 0 ? ` · זיכוי מגבית ₪${Math.round(credit)}` : ''}`,
    })
  }

  return {
    ppsReset: pps.length,
    txsProcessed: (txs ?? []).length,
    newlyLinked,
    unlinkedWrong,
    spilloverCreated: spillovers.length,
    leftoverCredit: Math.max(0, credit),
  }
}
