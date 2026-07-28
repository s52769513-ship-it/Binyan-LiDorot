// ── פרטי התחברות לנדרים פלוס ─────────────────────────────────────────────────
// מקור אמת יחיד. עד עכשיו מספר המוסד והסיסמה היו משוכפלים בכל אחד מ-6 הנתיבים
// שפונים לנדרים (עם ערך ברירת מחדל קשיח בקוד), כך שמעבר לאימות חדש חייב לגעת
// בכולם — וכל פספוס שובר אינטגרציה. מרכזים כאן כדי שהמעבר יהיה במקום אחד.

declare const process: { env: Record<string, string | undefined> }

export const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'

/**
 * סוד האימות שנשלח לנדרים בפרמטר `ApiPassword`.
 *
 * נדרים מודיעים שאימות ה-ApiPassword הישן ייחסם ב-20/08/2026 ויש לעבור למפתח
 * API אישי. מבנה הקריאה עצמו לא משתנה — רק ערך הסוד — ולכן מעדיפים את
 * NEDARIM_API_KEY כשהוא מוגדר, ונופלים אחורה לסיסמה הישנה עד שהמעבר יושלם.
 */
export const API_PASS =
  process.env.NEDARIM_API_KEY ||
  process.env.NEDARIM_API_PASSWORD ||
  'nu247'

/** האם אנחנו כבר עובדים מול המפתח החדש (לתצוגה/אבחון). */
export const USING_API_KEY = !!process.env.NEDARIM_API_KEY
