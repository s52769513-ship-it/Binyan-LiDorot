// ── חיתוך תאריך ל-PP ותנועות ────────────────────────────────────────────────
//
// המערכת החלה באמצע: שכ"ל (בנין לדורות) מתחיל ב-04/2026, מגבית ב-06/2026.
// כל מה שלפני מטופל בייבוא חובות ישנים — ואסור שיקושר ל-PP, ייחשב כזיכוי, או
// יופיע ברשימות ה-PP בתצוגה. משכורת (salary) — ללא חיתוך, תמיד רלוונטית.

export const TUITION_START_DATE  = '2026-04-01'
export const DONATION_START_DATE = '2026-06-01'

/** תאריך ההתחלה של סוג החוב (מגבית → 06/2026, אחרת → 04/2026). */
export function ppStartDate(ppType: string | null | undefined): string {
  return ppType === 'donation' ? DONATION_START_DATE : TUITION_START_DATE
}

/**
 * האם תנועה מסוג חוב זה, בתאריך זה, קודמת לחיתוך (ולכן אין לקשר/לזקוף אותה).
 * ppType ריק → false (לא חוב שכ"ל/מגבית, לא נחסם כאן ממילא).
 * תאריך ריק → false — תשלום real-time בלי תאריך לא נחסם (הוא עדכני).
 */
export function isTxBeforeStart(ppType: string | null | undefined, date: string | null | undefined): boolean {
  if (!ppType || ppType === 'salary') return false
  const d = (date ?? '').slice(0, 10)
  return d !== '' && d < ppStartDate(ppType)
}

/** תאריך אפקטיבי של PP לתצוגה — לפי date, ואם ריק לפי month_year ("MM/YYYY"). */
function ppEffectiveDate(pp: { date?: string | null; month_year?: string | null }): string {
  if (pp.date) return pp.date.slice(0, 10)
  const my = pp.month_year ?? ''
  const m = my.split('/')
  if (m.length === 2 && m[0] && m[1]) return `${m[1]}-${m[0].padStart(2, '0')}-01`
  return ''
}

/**
 * האם PP קודם לחיתוך של סוגו (ולכן יש להסתירו מהתצוגה).
 * salary → false (תמיד מוצג). PP בלי תאריך/חודש כלל → false (לא מסתירים בעיוור).
 */
export function ppBeforeStart(
  ppType: string | null | undefined,
  pp: { date?: string | null; month_year?: string | null },
): boolean {
  if (ppType === 'salary') return false
  const d = ppEffectiveDate(pp)
  return d !== '' && d < ppStartDate(ppType)
}
