// ── העלאת כיתה ────────────────────────────────────────────────────────────────
// שמות כיתות הם טקסט חופשי ("א'1", "א בית חינוך", "יא'2"). כדי להציע העלאה
// אוטומטית מזהים את אות הכיתה בתחילת השם ומחליפים אותה באות הבאה, תוך שמירה על
// שאר השם (מקבילה / מסגרת).

export const GRADES = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ז', 'ח', 'ט', 'י', 'יא', 'יב'] as const

// בודקים קודם את הארוכות ("יא"/"יב") כדי ש-"יא" לא יזוהה בטעות כ-"י".
const GRADES_BY_LEN = [...GRADES].sort((a, b) => b.length - a.length)

const HEB_LETTER = /[א-ת]/

/**
 * הכיתה הבאה אחרי `className`, או null אם אין הצעה:
 *   - השם לא מתחיל באות כיתה מוכרת
 *   - האות ממשיכה למילה אחרת (למשל "גן" — לא כיתה ג')
 *   - זו הכיתה האחרונה (יב) — סיום לימודים, לא העלאה
 * דוגמאות: "א'1" → "ב'1" · "א בית חינוך" → "ב בית חינוך" · "יא'2" → "יב'2"
 */
export function nextClassName(className: string): string | null {
  const name = String(className ?? '').trim()
  if (!name) return null
  for (const g of GRADES_BY_LEN) {
    if (!name.startsWith(g)) continue
    const rest = name.slice(g.length)
    // האות חייבת להסתיים כאן (סוף / גרש / ספרה / רווח) ולא להימשך למילה
    if (rest && HEB_LETTER.test(rest[0])) continue
    const idx = GRADES.indexOf(g as typeof GRADES[number])
    if (idx < 0 || idx === GRADES.length - 1) return null   // יב → מסיימים
    return `${GRADES[idx + 1]}${rest}`
  }
  return null
}

/** אות הכיתה שבתחילת השם ("ט'1" → "ט"), או null אם אין. */
export function gradeOf(className: string): string | null {
  const name = String(className ?? '').trim()
  for (const g of GRADES_BY_LEN) {
    if (!name.startsWith(g)) continue
    const rest = name.slice(g.length)
    if (rest && HEB_LETTER.test(rest[0])) continue
    return g
  }
  return null
}

/** האם זו הכיתה האחרונה (תלמידיה מסיימים לימודים ולא עולים כיתה). */
export function isFinalGrade(className: string): boolean {
  const name = String(className ?? '').trim()
  for (const g of GRADES_BY_LEN) {
    if (!name.startsWith(g)) continue
    const rest = name.slice(g.length)
    if (rest && HEB_LETTER.test(rest[0])) continue
    return g === GRADES[GRADES.length - 1]
  }
  return false
}
