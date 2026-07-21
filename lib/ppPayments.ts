import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'
import { isTxBeforeStart } from '@/lib/cutoffs'

/**
 * לוגיקה אחודה להחלת תשלום על תשלומים מתוכננים של הורה.
 *
 * עד עכשיו היו במערכת שתי התנהגויות שונות: הקישור הידני (link-pp) עשה cascade
 * מלא (גלישה ל-PP הבא, עודף → יתרת זכות, עדכון tuition_balance), בעוד
 * שהאוטומציות (וובהוק נדרים, משיכות הו"ק, משיכת Airtable) הורידו יתרה מ-PP
 * אחד בלבד וזרקו עודף בשקט — מה שגרם לסחיפה בין הדשבורדים לאמת של ה-PP.
 * הקובץ הזה הוא המסלול היחיד: כל יצירת תשלום אוטומטית עוברת דרכו.
 *
 * בחירת יעד: PP של החודש המבוקש קודם, אחרת הפתוח הוותיק ביותר (כרונולוגית,
 * לא אלפביתית).
 *
 * שני סוגי חוב נפרדים: תשלום שכ"ל יורד רק מ-PP שכ"ל (pp_type='tuition'),
 * ותשלום מגבית רק מ-PP מגבית (pp_type='donation') — לעולם לא מערבבים.
 * הסוג נקבע לפי הפרויקט של התשלום (ppTypeForProject) — רק פרויקט "בנין
 * לדורות" הולך לשכ"ל, רק "מגבית" הולך למגבית; כל קטגוריה אחרת (משכורות,
 * הוצאות חודשי וכו') מחזירה null ולא מקושרת לשום PP — היא לא חוב שניתן
 * לקזז. PP של משכורת (pp_type='salary') לעולם לא יעד לתשלום, ו-PP שמקורם
 * ב-Airtable (pp_type ריק) מנוהלים ע"י הסנכרון שדורס להם balance — אסור
 * לגעת בהם.
 */

export type PayablePPType = 'tuition' | 'donation'

/**
 * שורות "גלישה" — כשתשלום גדול מיתרת ה-PP המקושר, העודף יורד מ-PPs אחרים.
 * כדי שזה יהיה גלוי בכרטיס של ה-PP שקיבל את העודף, נרשמת שם שורת זיכוי
 * אמיתית עם הפניה לתנועת המקור (source_transaction_id).
 */
export const SPILLOVER_NOTES_PREFIX = 'זיכוי מעודף תשלום'
const FAR_FUTURE = '2099-12-31T23:59:59.999Z'

/**
 * חיוב הו"ק שחזר (החזרת הוראת קבע): החיוב המקורי מסומן בקידומת הזו ומנותק
 * מה-PP, כך שכל חישוב מחדש (relink / recalc-pp) לא סופר אותו כתשלום, והחוב
 * של אותו חודש נפתח מחדש. התנועה עצמה נשארת גלויה בתזרים (הסכום עדיין חיובי),
 * וגם שורת ההחזרה השלילית + עמלת ההחזרה נשמרות — כך שהכסף מתאזן והחוב מתוקן.
 */
export const RETURNED_CHARGE_NOTES_PREFIX = 'חיוב שהוחזר'
// 42703 = SQL undefined column (select/filter); PGRST204 = PostgREST schema
// cache miss on insert/update payload keys — both mean the column is missing
export const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])

/**
 * מעדכן זיכוי שכ"ל וזיכוי מגבית בעמודות הנפרדות. אם עמודת המגבית עדיין לא
 * נמצאת ב-schema cache של PostgREST (מיגרציה שרק הורצה) — לא מפיל את כל
 * העדכון אלא כותב לפחות את זיכוי השכ"ל, כדי ששכ"ל לא יישבר בגלל המגבית.
 */
export async function updateParentCredits(
  parentId: string,
  opts: { tuition?: number; donation?: number },
): Promise<void> {
  const payload: Record<string, number> = {}
  if (opts.tuition != null) payload.credit_balance = opts.tuition
  if (opts.donation != null) payload.donation_credit_balance = opts.donation
  if (Object.keys(payload).length === 0) return

  const { error } = await supabaseAdmin.from('parents').update(payload).eq('id', parentId)
  if (!error) return

  // אם העדכון נכשל וכלל את עמודת המגבית — לא מפילים את כל הריענון בגלל עמודה
  // שאולי עוד לא ב-schema cache. מנסים שוב בלי המגבית (משאירים לפחות שכ"ל).
  // חשוב: לא בודקים קוד שגיאה ספציפי — צורת השגיאה של PostgREST משתנה, וכל
  // כישלון שקשור למגבית חייב להתנוון בחן ולא לזרוק.
  if ('donation_credit_balance' in payload && 'credit_balance' in payload) {
    const { error: e2 } = await supabaseAdmin
      .from('parents')
      .update({ credit_balance: payload.credit_balance })
      .eq('id', parentId)
    if (e2) throw e2
    return
  }
  // רק שכ"ל, או רק מגבית — אם נכשל, זורקים (אין למה להתנוון)
  if ('donation_credit_balance' in payload && !('credit_balance' in payload)) {
    // עדכון מגבית-בלבד נכשל (עמודה חסרה) — מתעלמים בשקט עד שהמיגרציה תיקלט
    return
  }
  throw error
}

export interface SpilloverRowInput {
  parentId: string
  ppId: string
  ppMonthYear?: string | null
  ppType?: string | null
  amount: number
  sourceTxId: string
  /** תיאור מקור לתצוגה — בדרך כלל חודש/תאריך של תנועת המקור */
  sourceLabel?: string | null
  date?: string | null
}

export async function insertSpilloverRows(rows: SpilloverRowInput[]): Promise<void> {
  if (rows.length === 0) return
  const today = new Date().toISOString().split('T')[0]
  const build = (r: SpilloverRowInput, withSource: boolean) => ({
    id:                 crypto.randomUUID(),
    amount:             r.amount,
    type:               'זיכוי',
    date:               r.date || today,
    month_year:         r.ppMonthYear ?? '',
    notes:              r.sourceLabel ? `${SPILLOVER_NOTES_PREFIX} מ-${r.sourceLabel}` : SPILLOVER_NOTES_PREFIX,
    parent_ids:         [r.parentId],
    project_ids:        [],
    // recalc-pp מנתק תנועות על PP שכ"ל שאינן מפרויקט "בנין לדורות" — הפרויקט
    // כאן חייב להתאים לסוג ה-PP כדי שהשורה תשרוד חישוב מחדש
    project_names:      [r.ppType === 'donation' ? 'דמי מגבית' : 'בנין לדורות'],
    planned_payment_id: r.ppId,
    synced_at:          FAR_FUTURE,
    ...(withSource ? { source_transaction_id: r.sourceTxId } : {}),
  })
  const CHUNK = 500
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK)
    const { error } = await supabaseAdmin.from('transactions').insert(chunk.map(r => build(r, true)))
    if (error && MISSING_COLUMN_CODES.has(error.code)) {
      // source_transaction_id טרם הוסף (SPILLOVER_MIGRATION.sql) — רושמים בלי ההפניה
      const { error: e2 } = await supabaseAdmin.from('transactions').insert(chunk.map(r => build(r, false)))
      if (e2) throw e2
    } else if (error) {
      throw error
    }
  }
}

/** קובע לאיזה סוג חוב תשלום שייך, לפי שם הפרויקט/קטגוריה שלו — null אם הקטגוריה אינה חוב שכ"ל/מגבית. */
export function ppTypeForProject(projectName: string | null | undefined): PayablePPType | null {
  const name = projectName ?? ''
  if (name.includes('מגבית')) return 'donation'
  if (name.includes('בנין לדורות')) return 'tuition'
  return null
}

interface OpenPP { id: string; balance: number; month_year: string | null }

export interface PaymentTarget {
  /** ה-PP שהתשלום יקושר אליו (planned_payment_id), או null אם אין פתוח */
  ppId: string | null
  ppMonthYear: string | null
  ppBalance: number | null
}

export interface ApplyResult extends PaymentTarget {
  /** כמה מהסכום נספג ב-PPs */
  applied: number
  /** עודף שנזקף ליתרת זכות של ההורה */
  leftover: number
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * מתאים כל שורת "החזרת הו"ק" לחיוב ההו"ק המקורי שלה (לפי אותו הו"ק ואותו סכום)
 * ומסמן את החיוב שחזר: מנתק אותו מה-PP ומוסיף לו את קידומת
 * RETURNED_CHARGE_NOTES_PREFIX. כל חישוב מחדש (relink / recalc-pp) מדלג על
 * חיובים מסומנים — כך שהחוב של אותו חודש נפתח מחדש, בעוד שהתנועה נשארת גלויה
 * בתזרים (הכסף מתאזן מול שורת ההחזרה השלילית).
 *
 * אידמפוטנטי: חיוב שכבר סומן "צורך" את ההחזרה התואמת לו ולא גורם לסימון כפול,
 * וכל החזרה מבטלת חיוב אחד בלבד (החדש ביותר קודם). מחזיר כמה חיובים סומנו כעת.
 */
export async function markReturnedCharges(parentId: string): Promise<number> {
  const { data: returns } = await supabaseAdmin
    .from('transactions')
    .select('standing_order_id, amount')
    .contains('parent_ids', [parentId])
    .eq('type', 'החזרת הו"ק')
  if (!returns || returns.length === 0) return 0

  // כמה החזרות יש לכל (הו"ק, סכום) — כל אחת מבטלת חיוב תואם אחד
  const need = new Map<string, number>()
  for (const r of returns) {
    const soId = (r.standing_order_id as string | null) ?? ''
    if (!soId) continue
    const key = `${soId}|${round2(Math.abs(Number(r.amount) || 0))}`
    need.set(key, (need.get(key) ?? 0) + 1)
  }
  if (need.size === 0) return 0

  // חיובי הו"ק חיוביים של ההורה, מהחדש לישן — מבטלים קודם את החיוב האחרון
  const { data: charges } = await supabaseAdmin
    .from('transactions')
    .select('id, standing_order_id, amount, notes')
    .contains('parent_ids', [parentId])
    .eq('type', 'הו"ק')
    .gt('amount', 0)
    .order('date', { ascending: false })

  let marked = 0
  for (const c of charges ?? []) {
    const soId = (c.standing_order_id as string | null) ?? ''
    if (!soId) continue
    const key = `${soId}|${round2(Math.abs(Number(c.amount) || 0))}`
    const remaining = need.get(key) ?? 0
    if (remaining <= 0) continue
    const notes = String(c.notes ?? '')
    // חיוב שכבר סומן — צורך החזרה קיימת כדי שלא נסמן חיוב נוסף באותה החזרה
    if (notes.startsWith(RETURNED_CHARGE_NOTES_PREFIX)) { need.set(key, remaining - 1); continue }
    need.set(key, remaining - 1)
    await supabaseAdmin.from('transactions').update({
      planned_payment_id: null,
      notes: `${RETURNED_CHARGE_NOTES_PREFIX} · ${notes}`,
    }).eq('id', c.id as string)
    marked++
  }
  return marked
}

async function fetchOpenPPs(parentId: string, ppType: PayablePPType): Promise<OpenPP[]> {
  const { data } = await supabaseAdmin
    .from('planned_payments')
    .select('id, balance, month_year')
    .contains('parent_ids', [parentId])
    .eq('pp_type', ppType)
    .gt('balance', 0)
  return (data ?? []).map(p => ({
    id: p.id as string,
    balance: Number(p.balance),
    month_year: (p.month_year as string) ?? null,
  }))
}

/** מסדר: PP של החודש המבוקש ראשון, אחריו השאר מהוותיק לחדש. */
function orderTargets(pps: OpenPP[], preferredMonthYear?: string | null): OpenPP[] {
  const chrono = sortByMonth(pps, true)
  if (!preferredMonthYear) return chrono
  const idx = chrono.findIndex(p => p.month_year === preferredMonthYear)
  if (idx <= 0) return chrono
  return [chrono[idx], ...chrono.slice(0, idx), ...chrono.slice(idx + 1)]
}

/**
 * תצוגה מקדימה בלבד — מוצא לאיזה PP תשלום יקושר, בלי לכתוב כלום.
 * חייב להשתמש באותה לוגיקת בחירה כמו applyPaymentToParentPPs, אחרת
 * ה-dry-run מציג יעד שונה ממה שקורה בפועל.
 */
export async function findPaymentTarget(
  parentId: string,
  preferredMonthYear?: string | null,
  ppType: PayablePPType | null = 'tuition',
): Promise<PaymentTarget> {
  if (!ppType) return { ppId: null, ppMonthYear: null, ppBalance: null }
  const targets = orderTargets(await fetchOpenPPs(parentId, ppType), preferredMonthYear)
  const first = targets[0] ?? null
  return {
    ppId: first?.id ?? null,
    ppMonthYear: first?.month_year ?? null,
    ppBalance: first?.balance ?? null,
  }
}

/**
 * מחיל תשלום על ה-PPs הפתוחים של ההורה עם cascade מלא:
 * מוריד מה-PP היעד, גולש לבאים בתור, עודף → parents.credit_balance,
 * ולבסוף מחשב מחדש את parents.tuition_balance מסכום היתרות בפועל.
 *
 * ppType=null (קטגוריה שאינה שכ"ל/מגבית, כמו משכורות/הוצאות) — לא מקושר
 * לשום PP ולא נזקף ליתרת זכות; התנועה רק נרשמת בלי קישור.
 */
export async function applyPaymentToParentPPs(opts: {
  parentId: string
  amount: number
  preferredMonthYear?: string | null
  /** סוג החוב שהתשלום יורד ממנו — נקבע לפי הפרויקט של התשלום */
  ppType?: PayablePPType | null
  /**
   * תנועת המקור שהתשלום יירשם בה (ה-id נוצר אצל הקורא לפני ההכנסה).
   * כשמועבר — כל גלישה ל-PP שאינו הראשון נרשמת כשורת "זיכוי מעודף תשלום"
   * גלויה על ה-PP שקיבל אותה, במקום הפחתת יתרה שקטה.
   */
  source?: { txId: string; label?: string | null; date?: string | null }
}): Promise<ApplyResult> {
  const amount = Math.abs(Number(opts.amount)) || 0
  const ppType = opts.ppType === undefined ? 'tuition' : opts.ppType
  if (!ppType) return { ppId: null, ppMonthYear: null, ppBalance: null, applied: 0, leftover: amount }

  // תשלום שכ"ל בתאריך לפני 04/2026 / מגבית לפני 06/2026 — היסטורי, לא מקושר
  // ולא נזקף כזיכוי (התנועה עצמה עדיין נרשמת אצל הקורא, בלי planned_payment_id).
  if (isTxBeforeStart(ppType, opts.source?.date)) {
    return { ppId: null, ppMonthYear: null, ppBalance: null, applied: 0, leftover: 0 }
  }

  const targets = orderTargets(await fetchOpenPPs(opts.parentId, ppType), opts.preferredMonthYear)
  const first = targets[0] ?? null

  const spillovers: SpilloverRowInput[] = []
  let remaining = amount
  for (const pp of targets) {
    if (remaining <= 0) break
    const apply = Math.min(remaining, pp.balance)
    const newBal = round2(pp.balance - apply)
    remaining = round2(remaining - apply)
    await supabaseAdmin.from('planned_payments').update({ balance: newBal }).eq('id', pp.id)
    if (opts.source && apply > 0 && pp !== first) {
      spillovers.push({
        parentId: opts.parentId,
        ppId: pp.id,
        ppMonthYear: pp.month_year,
        ppType,
        amount: apply,
        sourceTxId: opts.source.txId,
        sourceLabel: opts.source.label ?? opts.preferredMonthYear ?? null,
        date: opts.source.date ?? null,
      })
    }
  }
  await insertSpilloverRows(spillovers)

  // זיכוי שכ"ל וזיכוי מגבית נשמרים בעמודות נפרדות — עודף מתשלום שכ"ל לעולם
  // לא יחול על חוב מגבית, ולהפך
  if (remaining > 0) {
    const creditColumn = ppType === 'donation' ? 'donation_credit_balance' : 'credit_balance'
    const { data: parent } = await supabaseAdmin
      .from('parents').select(creditColumn).eq('id', opts.parentId).single()
    const newCredit = round2(Number((parent as Record<string, unknown> | null)?.[creditColumn] ?? 0) + remaining)
    await updateParentCredits(opts.parentId,
      ppType === 'donation' ? { donation: newCredit } : { tuition: newCredit })
  }

  await recalcParentTuitionBalance(opts.parentId)

  return {
    ppId: first?.id ?? null,
    ppMonthYear: first?.month_year ?? null,
    ppBalance: first?.balance ?? null,
    applied: round2(amount - remaining),
    leftover: remaining,
  }
}

/**
 * parents.tuition_balance = סכום יתרות ה-PP של שכ"ל בלבד (אמת מה-PPs).
 * מחריגים גם salary וגם donation — חוב מגבית הוא חוב נפרד ואסור שינפח את
 * "יתרת שכ"ל". pp_type ריק (PP ישן מ-Airtable) נספר — אלה שכ"ל.
 */
export async function recalcParentTuitionBalance(parentId: string): Promise<void> {
  const { data: allPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('balance, pp_type')
    .contains('parent_ids', [parentId])
  const tuitionBalance = (allPPs ?? [])
    .filter(p => p.pp_type !== 'salary' && p.pp_type !== 'donation')
    .reduce((s, p) => s + Math.max(0, Number(p.balance ?? 0)), 0)
  await supabaseAdmin.from('parents')
    .update({ tuition_balance: round2(tuitionBalance) })
    .eq('id', parentId)
}
