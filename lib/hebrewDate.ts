// ── המרת תאריך עברי ↔ לועזי ───────────────────────────────────────────────────
// לוח השנה העברי מגיע מ-Intl (ca-hebrew) — בלי תלות חיצונית. את האותיות העבריות
// אנחנו מייצרים בעצמנו ולא נשענים על nu-hebr, כי לא כל סביבת ICU תומכת בו
// (ב-Node כאן הוא נופל חזרה לספרות רגילות). ההשוואה נעשית על מספרים ושם חודש,
// ולכן היא עמידה גם לווריאציות כתיב של המשתמש.

import { gematria, parseGematria, formatHebrewYear } from './hebrewYear'

const HEB_PARTS = new Intl.DateTimeFormat('he-u-ca-hebrew', {
  day: 'numeric', month: 'long', year: 'numeric',
})

export interface HebrewParts { day: number; month: string; year: number }

/** מנקה גרשיים, "ב" מוקדמת של שם חודש ורווחים כפולים. */
export function normalizeHebrewDate(s: string): string {
  return String(s ?? '')
    .replace(/[״"׳']/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const normMonth = (m: string) => normalizeHebrewDate(m).replace(/^ב/, '')

/** חלקי התאריך העברי של תאריך לועזי נתון. */
export function hebrewPartsOf(date: Date): HebrewParts {
  const parts = HEB_PARTS.formatToParts(date)
  const get = (t: string) => parts.find(p => p.type === t)?.value ?? ''
  return {
    day:   parseInt(get('day'), 10),
    month: normMonth(get('month')),
    year:  parseInt(get('year'), 10),
  }
}

/** תאריך לועזי → מחרוזת עברית, למשל "כ״ב באדר תשפ״ה". */
export function gregorianToHebrew(date: Date): string {
  const { day, month, year } = hebrewPartsOf(date)
  const d = gematria(day)
  const dayStr = d.length > 1 ? `${d.slice(0, -1)}״${d.slice(-1)}` : `${d}׳`
  return `${dayStr} ב${month} ${formatHebrewYear(year)}`
}

/** "15/03/2020" → Date, או null אם אינו תקין. */
export function parseGregorian(s: string): Date | null {
  const m = String(s ?? '').trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/)
  if (!m) return null
  const [, d, mo, y] = m
  const date = new Date(Number(y), Number(mo) - 1, Number(d))
  if (isNaN(date.getTime())) return null
  // דוחה תאריך שאינו קיים (31/02 היה "גולש" לחודש הבא)
  if (date.getDate() !== Number(d) || date.getMonth() !== Number(mo) - 1) return null
  return date
}

export function formatGregorian(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`
}

/** מפרק קלט עברי חופשי לחלקיו. מחזיר null אם חסר יום/חודש/שנה. */
export function parseHebrewInput(input: string): HebrewParts | null {
  const words = normalizeHebrewDate(input).split(' ').filter(Boolean)
  if (words.length < 3) return null
  // המילה שאינה גימטריה תקינה היא שם החודש; לפניה היום ואחריה השנה
  const monthIdx = words.findIndex((w, i) => i > 0 && /^ב?[א-ת]+$/.test(w) && parseGematria(w.replace(/^ב/, '')) === 0)
  // שם חודש עשוי להיות גם גימטריה תקינה (למשל "אב") — ניפול חזרה לאמצע
  const mi = monthIdx > 0 ? monthIdx : 1
  const day  = parseGematria(words[0])
  const year = parseGematria(words[words.length - 1])
  const month = normMonth(words.slice(mi, words.length - 1).join(' '))
  if (!day || !year || !month) return null
  return { day, month, year: year < 1000 ? 5000 + year : year }
}

/**
 * מחרוזת תאריך עברי → Date לועזי, או null אם לא זוהה.
 * סורק את חלון השנה העברית ומשווה חלקים — כך שגם "אדר" בשנה מעוברת נתפס
 * (מותאם ל-אדר ב׳, כנהוג לציון יום הולדת).
 */
export function hebrewToGregorian(input: string): Date | null {
  const want = parseHebrewInput(input)
  if (!want) return null

  // שנה עברית מתחילה בסתיו של השנה הלועזית (year - 3761)
  const cursor = new Date(want.year - 3761, 7, 1)   // 1 באוגוסט
  let loose: Date | null = null
  for (let i = 0; i < 430; i++) {
    const p = hebrewPartsOf(cursor)
    if (p.year === want.year && p.day === want.day) {
      if (p.month === want.month) return new Date(cursor)
      // "אדר" מול "אדר א׳/ב׳" — שומרים כהתאמה רופפת, מעדיפים אדר ב׳
      if (p.month.startsWith(want.month) || want.month.startsWith(p.month)) {
        if (!loose || p.month.includes('ב')) loose = new Date(cursor)
      }
    }
    cursor.setDate(cursor.getDate() + 1)
  }
  return loose
}
