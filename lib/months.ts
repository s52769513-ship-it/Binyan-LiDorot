/**
 * עזרי חודשים בפורמט "MM/YYYY".
 *
 * מודל הקיזוז שכ"ל↔משכורת:
 *   המשכורת נוצרת עבור החודש שעבר (S), ומקוזזת מול שכר הלימוד של החודש הנוכחי (T).
 *   לכן: חודש שכ"ל  T = חודש משכורת S + 1
 *        חודש משכורת S = חודש שכ"ל  T − 1
 *
 *   תנועת "ניכוי שכ"ל" (צד המשכורת) מתויגת בחודש המשכורת  S.
 *   תנועת "קיזוז שכ"ל" (צד השכ"ל)   מתויגת בחודש השכ"ל   T.
 */

/**
 * מפתח מיון כרונולוגי לחודש "MM/YYYY" (YYYY*100+MM).
 * חובה להשתמש בזה במקום מיון טקסטואלי — "01/2027" קטן אלפביתית מ-"12/2026"
 * ולכן order('month_year') בדאטהבייס שובר כרונולוגיה במעבר שנה.
 * חודש ריק/לא-תקין ממוין אחרון.
 */
export function monthKey(my: string | null | undefined): number {
  const m = /^(\d{1,2})\/(\d{4})$/.exec((my ?? '').trim())
  if (!m) return Number.MAX_SAFE_INTEGER
  return Number(m[2]) * 100 + Number(m[1])
}

/** ממיין מערך עם שדה month_year בסדר כרונולוגי (ברירת מחדל: עולה). */
export function sortByMonth<T extends { month_year?: string | null }>(
  rows: T[],
  ascending = true,
): T[] {
  return [...rows].sort((a, b) =>
    ascending
      ? monthKey(a.month_year) - monthKey(b.month_year)
      : monthKey(b.month_year) - monthKey(a.month_year)
  )
}

/** מחזיר חודש מוזז ב-delta חודשים, בפורמט "MM/YYYY". */
export function shiftMonth(my: string, delta: number): string {
  const [m, y] = (my ?? '').split('/').map(Number)
  if (!m || !y) return my
  const d = new Date(y, m - 1 + delta, 1)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** חודש השכ"ל המתאים למשכורת של חודש S (S + 1). */
export const tuitionMonthForSalary = (salaryMY: string) => shiftMonth(salaryMY, +1)

/** חודש המשכורת המתאים לשכ"ל של חודש T (T − 1). */
export const salaryMonthForTuition = (tuitionMY: string) => shiftMonth(tuitionMY, -1)
