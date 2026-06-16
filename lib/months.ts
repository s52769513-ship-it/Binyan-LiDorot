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
