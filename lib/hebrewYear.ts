// ── שנה עברית ─────────────────────────────────────────────────────────────────
// משמש לשנתון הסיום של בוגרים ("תשפ״ו"). זו המרה לצורכי תצוגה/קיבוץ בלבד ולא
// לוח שנה מלא — שנת הלימודים נחשבת כמתחילה בספטמבר.

const HUNDREDS = [[400, 'ת'], [300, 'ש'], [200, 'ר'], [100, 'ק']] as const
const TENS     = [[90, 'צ'], [80, 'פ'], [70, 'ע'], [60, 'ס'], [50, 'נ'], [40, 'מ'], [30, 'ל'], [20, 'כ'], [10, 'י']] as const
const ONES     = [[9, 'ט'], [8, 'ח'], [7, 'ז'], [6, 'ו'], [5, 'ה'], [4, 'ד'], [3, 'ג'], [2, 'ב'], [1, 'א']] as const

/** מספר לגימטריה, למשל 786 → "תשפו" (בלי גרשיים). */
export function gematria(n: number): string {
  let rest = n
  let out = ''
  for (const [val, letter] of HUNDREDS) {
    while (rest >= val) { out += letter; rest -= val }
  }
  // 15 ו-16 נכתבים טו/טז ולא יה/יו (שמות קודש)
  if (rest === 15) return out + 'טו'
  if (rest === 16) return out + 'טז'
  for (const [val, letter] of TENS) {
    if (rest >= val) { out += letter; rest -= val; break }
  }
  for (const [val, letter] of ONES) {
    if (rest >= val) { out += letter; rest -= val; break }
  }
  return out
}

const LETTER_VALUE: Record<string, number> = {
  א:1, ב:2, ג:3, ד:4, ה:5, ו:6, ז:7, ח:8, ט:9,
  י:10, כ:20, ל:30, מ:40, נ:50, ס:60, ע:70, פ:80, צ:90,
  ק:100, ר:200, ש:300, ת:400, ך:20, ם:40, ן:50, ף:80, ץ:90,
}

/** גימטריה → מספר. "תשפו" → 786, "כב" → 22. מחזיר 0 אם יש תו שאינו אות. */
export function parseGematria(s: string): number {
  const letters = String(s ?? '').replace(/[״"׳']/g, '').trim()
  if (!letters) return 0
  let sum = 0
  for (const ch of letters) {
    const v = LETTER_VALUE[ch]
    if (!v) return 0
    sum += v
  }
  return sum
}

/** שנה עברית מספרית (5786) → "תשפ״ו". */
export function formatHebrewYear(hebrewYear: number): string {
  const letters = gematria(hebrewYear % 1000)
  if (letters.length < 2) return letters
  return `${letters.slice(0, -1)}״${letters.slice(-1)}`
}

/**
 * שנת הלימודים העברית של תאריך נתון. שנת לימודים נחשבת כמתחילה בספטמבר,
 * כך שספטמבר 2025 עד אוגוסט 2026 → תשפ״ו.
 */
export function schoolYearHebrew(date: Date = new Date()): string {
  const gy = date.getFullYear()
  const offset = date.getMonth() >= 8 ? 3761 : 3760   // getMonth: 8 = ספטמבר
  return formatHebrewYear(gy + offset)
}
