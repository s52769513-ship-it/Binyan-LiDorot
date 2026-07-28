// ── נרשמים ────────────────────────────────────────────────────────────────────
// מקור אמת יחיד להגדרה "מי נחשב נרשם שטרם נכנס", כדי שהשרת והלקוח לא יתפצלו.

export const PENDING_STATUS = 'ממתין'

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
