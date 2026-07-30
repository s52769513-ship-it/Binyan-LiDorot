// ── החזרת הו"ק ────────────────────────────────────────────────────────────────
// כשהו"ק חוזרת, לא מספיק לרשום תנועה שלילית: החיוב המקורי נשאר מקושר לתשלום
// המתוכנן וממשיך להיחשב כתשלום, ולכן ההורה נראה כמי ששילם והחוב שלו נמוך
// מהאמת. כאן מבטלים את החיוב המקורי ומחזירים את החוב, ובנוסף מחייבים את ההורה
// בעמלת ההחזרה — שהיא חוב שלו ולא הוצאה של המוסד.

import { supabaseAdmin } from '@/lib/supabase'
import { round2 } from '@/lib/money'
import { relinkParent } from '@/lib/relink'

export const RETURN_FEE = 25
export const REVERSED_NOTE = 'הוחזר — ההו"ק חזרה'

export interface HokReturnResult {
  reversedTxId: string | null
  restoredPPId: string | null
  restoredAmount: number
  feePPId: string | null
}

/**
 * מבטל את החיוב המקורי של הו"ק שחזרה ומחזיר את יתרת החוב, ויוצר PP עמלה
 * שההורה חייב בו.
 *
 * ביטול החיוב נעשה ע"י ניתוקו מה-PP וסימונו כקישור ידני: הריענון מדלג על
 * תנועות שנותקו ידנית, ולכן החיוב לא ייזקף שוב בשום ריצה עתידית — בלי למחוק
 * היסטוריה ובלי עמודה חדשה.
 */
export async function reverseReturnedHokCharge(opts: {
  standingOrderDbId: string | null
  parentId: string
  amount: number
  monthYear: string
  date: string
  donorName: string
  /** לא לבטל חיוב שנוצר אחרי ההחזרה — רלוונטי לתיקון החזרות היסטוריות */
  chargeBefore?: string | null
}): Promise<HokReturnResult> {
  const { standingOrderDbId, parentId, amount, monthYear, date, donorName, chargeBefore } = opts
  const out: HokReturnResult = { reversedTxId: null, restoredPPId: null, restoredAmount: 0, feePPId: null }
  if (!standingOrderDbId) return out

  // נמדד לפני כל שינוי, כדי שההפרש בסוף ישקף את מה שבאמת נוסף לחוב
  const before = await parentDebt(parentId)

  // ── החיוב המקורי: התנועה החיובית האחרונה של אותה הו"ק בסכום הזהה שטרם בוטלה
  let chargeQ = supabaseAdmin
    .from('transactions')
    .select('id, amount, date, planned_payment_id, notes, manual_link')
    .eq('standing_order_id', standingOrderDbId)
    .gt('amount', 0)
    .order('date', { ascending: false })
    .limit(20)
  // חיוב שנוצר אחרי ההחזרה הוא חיוב חדש ותקין — אין לבטלו
  if (chargeBefore) chargeQ = chargeQ.lte('date', chargeBefore)
  const { data: charges } = await chargeQ

  const original = (charges ?? []).find(t =>
    round2(Number(t.amount)) === round2(amount) &&
    !String(t.notes ?? '').includes(REVERSED_NOTE),
  )

  if (original) {
    const ppId = (original.planned_payment_id as string) ?? null
    await supabaseAdmin.from('transactions').update({
      planned_payment_id: null,
      manual_link: true,                       // כדי שהריענון ידלג עליה לתמיד
      notes: `${String(original.notes ?? '')} · ${REVERSED_NOTE}`.trim(),
    }).eq('id', original.id as string)
    out.reversedTxId = original.id as string
    out.restoredPPId = ppId
  }

  // ── עמלת ההחזרה כחוב של ההורה — PP נפרד מסוג 'fee', כדי שלא יתערבב בשכ"ל
  const { data: existingFee } = await supabaseAdmin
    .from('planned_payments')
    .select('id')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'fee')
    .eq('month_year', monthYear)
    .eq('amount', RETURN_FEE)
    .limit(1)

  if (!existingFee || existingFee.length === 0) {
    const feeId = crypto.randomUUID()
    const { error } = await supabaseAdmin.from('planned_payments').insert({
      id: feeId,
      name: 'עמלת החזרת הו"ק',
      pp_type: 'fee',
      amount: RETURN_FEE,
      balance: RETURN_FEE,
      date,
      month_year: monthYear,
      parent_ids: [parentId],
      notes: `עמלת החזרת הו"ק · ${donorName}`,
      synced_at: '2099-12-31T23:59:59.999Z',
    })
    if (!error) out.feePPId = feeId
  }

  // ── חישוב מחדש מלא של יתרות ההורה ──
  // לא מתקנים יתרה של PP בודד: חיוב שנפרס על כמה תשלומים מתוכננים (גלישה) היה
  // מוחזר רק לראשון ושאר ה-PP היו נשארים "שולמו" בטעות. relinkParent מאפס
  // ומריץ מחדש את כל השיוך, ומדלג על החיוב שסומן כמנותק ידנית — ולכן החוב
  // חוזר נכון גם כשהיו גלישות.
  await relinkParent(parentId)
  const after = await parentDebt(parentId)
  // ההפרש כולל גם את העמלה שנוספה — מפרידים כדי שהדיווח לא יטעה
  out.restoredAmount = round2(after - before - (out.feePPId ? RETURN_FEE : 0))

  return out
}

/** סכום יתרות החוב הפתוחות של ההורה (ללא משכורות) — למדידת ההחזרה. */
async function parentDebt(parentId: string): Promise<number> {
  const { data } = await supabaseAdmin
    .from('planned_payments').select('balance, pp_type').contains('parent_ids', [parentId])
  return round2((data ?? [])
    .filter(p => p.pp_type !== 'salary')
    .reduce((s, p) => s + Math.max(0, Number(p.balance ?? 0)), 0))
}
