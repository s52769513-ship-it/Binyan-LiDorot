// ── פעולות כותבות מול נדרים פלוס ─────────────────────────────────────────────
//
// עד היום הקשר עם נדרים היה חד-סטרי: רק משכנו נתונים. כאן מתחילות פעולות
// שמשנות משהו אצלם — חיוב כסף, שינוי הוראת קבע, הפקת קבלה.
//
// שני עקרונות שחלים על כל פעולה כאן:
// 1. **הגנת כפילות** — נדרים בנו מנגנון לפניות קריטיות: שולחים חותמת זמן
//    באלפיות שנייה בפרמטר AjaxId, והם מזהים פנייה שכבר הגיעה. חיוב כפול הוא
//    כסף אמיתי שיצא פעמיים, ולכן כל פעולת חיוב שולחת אותו.
// 2. **תשובה מפורשת** — נדרים מחזירים Result=OK/Error עם Message. אנחנו
//    מתרגמים לתוצאה אחידה במקום להניח שהצלחה = HTTP 200.

import { MOSAD_ID, API_PASS } from '@/lib/nedarim'

const MASAV_URL  = 'https://matara.pro/nedarimplus/Reports/Masav3.aspx'
const MANAGE_URL = 'https://matara.pro/nedarimplus/Reports/Manage3.aspx'
const TAMAL_URL  = 'https://matara.pro/nedarimplus/Reports/Tamal3.aspx'
const PAY_PAGE   = 'https://www.matara.pro/nedarimplus/online/'

export interface NedarimResult {
  ok: boolean
  message: string
  raw?: string
}

/** חותמת זמן באלפיות שנייה — מנגנון ההגנה מכפילות של נדרים. */
const ajaxId = () => String(Date.now())

/** dd/mm/yyyy — הפורמט היחיד שנדרים מקבלים. */
export function toNedarimDate(d: Date | string): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(date.getDate())}/${p(date.getMonth() + 1)}/${date.getFullYear()}`
}

/** מפרש את תשובת נדרים. הם עונים גם JSON וגם טקסט, תלוי בנתיב. */
function parseResult(raw: string): NedarimResult {
  const text = String(raw ?? '').trim()
  try {
    const j = JSON.parse(text)
    const res = String(j.Result ?? '').toUpperCase()
    return {
      ok: res === 'OK',
      message: String(j.Message ?? (res === 'OK' ? 'בוצע' : text)).trim(),
      raw: text,
    }
  } catch {
    const ok = /(^|[^A-Za-z])OK([^A-Za-z]|$)/i.test(text) && !/error/i.test(text)
    return { ok, message: ok ? 'בוצע' : (text || 'תשובה ריקה מנדרים'), raw: text }
  }
}

async function post(url: string, params: Record<string, string>): Promise<NedarimResult> {
  const body = new URLSearchParams({
    MosadNumber: MOSAD_ID,
    ApiPassword: API_PASS,
    ...params,
  })
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      cache: 'no-store',
    })
    const raw = await res.text()
    const parsed = parseResult(raw)
    if (!res.ok && parsed.ok) {
      return { ok: false, message: `נדרים החזירו סטטוס ${res.status}`, raw }
    }
    return parsed
  } catch (err) {
    return { ok: false, message: `שגיאת רשת מול נדרים: ${err instanceof Error ? err.message : String(err)}` }
  }
}

// ── חיוב בודד מהוראת קבע קיימת ───────────────────────────────────────────────
// לפי התיעוד: העסקה נרשמת בהיסטוריית ההו"ק, ואינה משנה יתרת תשלומים או את
// תאריך החיוב הבא — כלומר בדיוק "חיוב חוזר" אחרי הו"ק שחזרה.

/** הו"ק בנקאית (מס"ב) — Action=MasavBoded */
export function chargeBankStandingOrder(opts: {
  masavId: string
  amount: number
  date?: Date | string
}): Promise<NedarimResult> {
  return post(MASAV_URL, {
    Action: 'MasavBoded',
    MasavId: opts.masavId,
    Amount: String(Math.abs(opts.amount)),
    Date: toNedarimDate(opts.date ?? new Date()),
    AjaxId: ajaxId(),
  })
}

/** הו"ק אשראי — Action=TashlumBodedNew */
export function chargeCreditStandingOrder(opts: {
  kevaId: string
  amount: number
  payments?: number
}): Promise<NedarimResult> {
  return post(MANAGE_URL, {
    Action: 'TashlumBodedNew',
    KevaId: opts.kevaId,
    Amount: String(Math.abs(opts.amount)),
    Currency: '1',                                   // שקל
    Tashloumim: String(opts.payments ?? 1),
    AjaxId: ajaxId(),
  })
}

// ── קבלות ────────────────────────────────────────────────────────────────────

/**
 * הפקת קבלה. דורש מזהה עסקה *קיים בנדרים* — לתשלום שנרשם רק אצלנו (מזומן,
 * צ'ק, העברה) יש ליצור קודם הכנסה חיצונית בנדרים ולקבל ממנה מזהה.
 * TamalType: 405 קבלת תרומה · 400 קבלה רגילה · 320 חשבונית מס קבלה.
 */
export function createReceipt(opts: {
  transactionId: string
  type?: 'Achnasot' | 'Ashray'
  tamalType?: '400' | '405' | '320'
}): Promise<NedarimResult> {
  return post(TAMAL_URL, {
    Action: 'CreateInvoice',
    ID: opts.transactionId,
    Type: opts.type ?? 'Achnasot',
    TamalType: opts.tamalType ?? '405',
  })
}

/**
 * מזהי עסקאות שטרם הופקה להן קבלה, לתקופה (MM/YYYY או YYYY).
 * מאפשר לדעת על מי "חייבים" קבלה בלי לעבור עסקה-עסקה.
 */
export async function unissuedReceipts(tkufa: string): Promise<{
  ok: boolean; message: string
  ragil: string[]; keva: string[]; masav: string[]; achnasot: string[]
}> {
  const body = new URLSearchParams({
    Action: 'CheckInvoiceTkufa',
    MosadId: MOSAD_ID,          // כאן נדרים מצפים ל-MosadId ולא MosadNumber
    ApiPassword: API_PASS,
    Tkufa: tkufa,
  })
  const empty = { ragil: [], keva: [], masav: [], achnasot: [] }
  try {
    const res = await fetch(TAMAL_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body, cache: 'no-store',
    })
    const raw = await res.text()
    const j = JSON.parse(raw)
    const arr = (v: unknown): string[] =>
      Array.isArray(v) ? v.map(String) : typeof v === 'string' && v ? v.split(',').map(s => s.trim()).filter(Boolean) : []
    return {
      ok: String(j.Result ?? '').toUpperCase() === 'OK',
      message: String(j.Message ?? ''),
      ragil: arr(j.Ragil), keva: arr(j.Keva), masav: arr(j.Masav), achnasot: arr(j.Achnasot),
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err), ...empty }
  }
}

// ── קישור תשלום אישי ─────────────────────────────────────────────────────────
// בונה כתובת בלבד — לא פונה לנדרים ולא מחייב כלום. שדה שנשלח ממולא מראש
// *וננעל לעריכה*, ולכן שולחים רק מה שבאמת רוצים לנעול.

export interface PaymentLinkOpts {
  amount?: number
  /** נועל את הסכום לעריכה — לגבייה של חוב מדויק */
  lockAmount?: boolean
  clientName?: string
  phone?: string
  email?: string
  zeout?: string
  city?: string
  street?: string
  /** קטגוריית התרומה (Groupe) — כדי שהתשלום ייכנס לפרויקט הנכון */
  groupe?: string
  /** נועל את בחירת הקטגוריה */
  lockGroupe?: boolean
  /** הגבלת אמצעי התשלום */
  only?: 'normal' | 'keva' | 'masav' | 'bit'
  comment?: string
}

export function buildPaymentLink(o: PaymentLinkOpts): string {
  const parts: [string, string][] = [['mosad', MOSAD_ID]]
  const add = (k: string, v?: string | null) => { if (v) parts.push([k, String(v)]) }

  if (o.amount != null && o.amount > 0) {
    parts.push(['Amount', String(Math.round(Math.abs(o.amount) * 100) / 100)])
    if (o.lockAmount) parts.push(['AmountLock', '1'])
  }
  add('ClientName', o.clientName)
  add('Phone', o.phone)
  add('Email', o.email)
  add('Zeout', o.zeout)
  add('City', o.city)
  add('Street', o.street)
  add('Avour', o.comment)
  if (o.groupe) {
    parts.push(['Groupe', o.groupe])
    if (o.lockGroupe) parts.push(['GroupeLock', '1'])
  }
  if (o.only === 'normal') parts.push(['OnlyNormal', '1'])
  if (o.only === 'keva')   parts.push(['OnlyKeva', '1'])
  if (o.only === 'masav')  parts.push(['OnlyMasav', '1'])
  if (o.only === 'bit')    parts.push(['OnlyBit', '1'])

  // encodeURIComponent ולא URLSearchParams: האחרון מקודד רווח כ-"+", ודף
  // התשלום של נדרים אינו מפענח אותו — השם הופיע כ"אייזנער+דוד". התיעוד שלהם
  // עצמו מדגים קידוד אחוזים (%D7%91...), ולכן רווח חייב להיות %20.
  const qs = parts
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  return `${PAY_PAGE}?${qs}`
}
