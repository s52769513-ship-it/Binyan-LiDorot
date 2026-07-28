// ── מקור התנועה ───────────────────────────────────────────────────────────────
// "איך התנועה נכנסה למערכת" — אוטומציה / קליטת קובץ / ידני / חישוב פנימי.
//
// מכאן והלאה כל מסלול כתיבה שומר את המקור בעמודה `source`. לתנועות היסטוריות
// (שנוצרו לפני העמודה) המקור נגזר מסימנים קיימים — הערות, שיוך להו"ק ו-synced_at.
// הגזירה היא השערה מושכלת ולא ודאות, ולכן ב-UI היא מסומנת כ"משוער".

export type TxSource =
  | 'nedarim-hok'      // משיכת הו"ק מנדרים
  | 'nedarim-credit'   // אשראי/הו"ק אשראי מנדרים
  | 'nedarim-webhook'  // תרומה שהגיעה בזמן אמת מנדרים
  | 'airtable'         // סנכרון מ-Airtable
  | 'import'           // קליטת קובץ (אקסל/CSV)
  | 'system'           // נוצר ע"י המערכת (גלישה, זיכוי, קיזוז, ניכוי משכורת)
  | 'manual'           // הוזן ידנית במסך
  | 'unknown'

export interface TxSourceInfo {
  source: TxSource
  label: string
  icon: string
  /** true = נגזר מסימנים ולא נשמר במפורש בעת היצירה */
  inferred: boolean
}

const META: Record<TxSource, { label: string; icon: string }> = {
  'nedarim-hok':     { label: 'אוטומציה · הו"ק נדרים',    icon: '🤖' },
  'nedarim-credit':  { label: 'אוטומציה · אשראי נדרים',   icon: '🤖' },
  'nedarim-webhook': { label: 'נדרים · תרומה בזמן אמת',   icon: '⚡' },
  'airtable':        { label: 'סנכרון מ-Airtable',        icon: '🔄' },
  'import':          { label: 'קליטת קובץ',               icon: '📥' },
  'system':          { label: 'חישוב מערכת',              icon: '⚙️' },
  'manual':          { label: 'הוזן ידנית',               icon: '✍️' },
  'unknown':         { label: 'לא ידוע',                  icon: '❓' },
}

const isSource = (v: unknown): v is TxSource => typeof v === 'string' && v in META

/** סימני היכר בהערות לתנועות שהמערכת מייצרת בעצמה. */
const SYSTEM_NOTE_MARKERS = [
  'גלישה מ', 'זיכוי שמור', 'קיזוז זיכוי', 'קיזוז דמי מגבית',
  'ניכוי שכ', 'ניכוי מגבית', 'שולם שכ',
]

/**
 * מחזיר את מקור התנועה. אם נשמר מקור מפורש — הוא הקובע; אחרת נגזר מסימנים.
 */
export function deriveTxSource(tx: {
  source?: string | null
  notes?: string | null
  standingOrderId?: string | null
  syncedAt?: string | null
}): TxSourceInfo {
  if (isSource(tx.source)) {
    return { source: tx.source, ...META[tx.source], inferred: false }
  }

  const notes = String(tx.notes ?? '')
  const infer = (s: TxSource): TxSourceInfo => ({ source: s, ...META[s], inferred: true })

  if (SYSTEM_NOTE_MARKERS.some(m => notes.includes(m))) return infer('system')
  if (notes.includes('אשראי הו')) return infer('nedarim-credit')
  // תנועות נדרים נושאות את שם המקור בהערה ("נדרים · ...")
  if (notes.includes('נדרים')) {
    return infer(tx.standingOrderId ? 'nedarim-hok' : 'nedarim-webhook')
  }
  if (tx.standingOrderId) return infer('nedarim-hok')
  // synced_at אמיתי = הגיע מסנכרון Airtable; הסנטינל 2099 מסמן "לא לסנכרן בחזרה"
  // ומשמש גם קליטת קובץ וגם אוטומציות — ולכן אינו מבדיל ביניהן.
  const synced = String(tx.syncedAt ?? '')
  if (synced && !synced.startsWith('2099')) return infer('airtable')

  return infer('unknown')
}

export function txSourceMeta(source: TxSource) { return META[source] }
