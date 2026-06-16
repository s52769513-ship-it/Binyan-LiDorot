/**
 * עזרי חודשים בפורמט "MM/YYYY".
 *
 * מודל הקיזוז שכ"ל↔משכורת:
 *   PP שכ"ל של חודש T מתקזז מול PP משכורת של אותו חודש T.
 *
 *   תנועת "ניכוי שכ"ל" (צד המשכורת) מתויגת בחודש T.
 *   תנועת "קיזוז שכ"ל" (צד השכ"ל)   מתויגת בחודש T.
 */

/** מחזיר חודש מוזז ב-delta חודשים, בפורמט "MM/YYYY". */
export function shiftMonth(my: string, delta: number): string {
  const [m, y] = (my ?? '').split('/').map(Number)
  if (!m || !y) return my
  const d = new Date(y, m - 1 + delta, 1)
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/** חודש המשכורת המתאים לשכ"ל של חודש T — אותו חודש. */
export const tuitionMonthForSalary = (salaryMY: string) => shiftMonth(salaryMY, 0)

/** חודש השכ"ל המתאים למשכורת של חודש T — אותו חודש. */
export const salaryMonthForTuition = (tuitionMY: string) => shiftMonth(tuitionMY, 0)
