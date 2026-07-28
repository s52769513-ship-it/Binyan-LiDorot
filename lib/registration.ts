// ── נרשמים ────────────────────────────────────────────────────────────────────
// מקור אמת יחיד להגדרה "מי נחשב נרשם שטרם נכנס", כדי שהשרת והלקוח לא יתפצלו.

export const PENDING_STATUS = 'ממתין'

/** סטטוסים של תלמיד שאינו לומד עוד — עובר לאזור "בוגרים" ויוצא מהיומיום. */
export const ALUMNI_STATUSES = ['סיים לימודים', 'עזב'] as const

/** תלמיד שסיים/עזב — נשמר במערכת אבל לא מוצג ברשימות השוטפות. */
export function isAlumnus(s: { status?: string | null }): boolean {
  return (ALUMNI_STATUSES as readonly string[]).includes(String(s?.status ?? '').trim())
}

/** קבוצת השנתון להצגה — בוגרים ישנים ללא שנתון מקובצים יחד. */
export const NO_COHORT_LABEL = 'ללא שנתון'

/**
 * תלמיד נחשב "נרשם" (ומופיע בלשונית נרשמים) כל עוד הוא ממתין או שהוועד עדיין לא
 * אישר אותו. הוא יוצא מהרשימה — ומופיע בכיתה שלו עם שאר התלמידים — רק כאשר
 * *גם* אושר ע"י הוועד *וגם* הסטטוס שלו אינו "ממתין".
 */
export function isPendingRegistrant(s: {
  status?: string | null
  committeeApproved?: boolean | null
}): boolean {
  const status = String(s?.status ?? '').trim()
  return status === PENDING_STATUS || !s?.committeeApproved
}
