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
  const p = (n: number) => String(n).padStart(2, '0')
  // 'YYYY-MM-DD' מתורגם ישירות: new Date() היה מפרש אותו כחצות UTC, ובאזור זמן
  // שמאחורי UTC התאריך היה נסוג ביום — קבלה על יום שאינו יום התשלום.
  if (typeof d === 'string') {
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/)
    if (m) return `${m[3]}/${m[2]}/${m[1]}`
  }
  const date = typeof d === 'string' ? new Date(d) : d
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

// ── שינוי סטטוס הוראת קבע בנקאית ─────────────────────────────────────────────
// כל הפעולות עוברות ב-Action=SetMasavStatus ונבדלות ב-StatusNumber:
//   1 הפעלה · 7 הקפאה · 8 הקפצה לחודש קודם · 9 דחייה לחודש הבא
// הפעלה דורשת Comments="אני מאשר" — נדרים מחייבים אישור מפורש, ולא במקרה:
// הפעלת הו"ק שהבנק לא אישר גוררת עמלות חזרה מיותרות.

export type MasavStatusAction = 'activate' | 'freeze' | 'prevMonth' | 'nextMonth'

const STATUS_NUMBER: Record<MasavStatusAction, string> = {
  activate: '1',
  freeze: '7',
  prevMonth: '8',
  nextMonth: '9',
}

export const MASAV_ACTION_LABEL: Record<MasavStatusAction, string> = {
  activate: 'הפעלת הוראת קבע',
  freeze: 'הקפאת הוראת קבע',
  prevMonth: 'הקפצה לחודש קודם',
  nextMonth: 'דחיית הגבייה לחודש הבא',
}

export function setBankStandingOrderStatus(opts: {
  masavId: string
  action: MasavStatusAction
}): Promise<NedarimResult> {
  const params: Record<string, string> = {
    Action: 'SetMasavStatus',
    MasavId: opts.masavId,
    StatusNumber: STATUS_NUMBER[opts.action],
  }
  // נדרשת מילולית בהפעלה בלבד, לפי התיעוד
  if (opts.action === 'activate') params.Comments = 'אני מאשר'
  return post(MASAV_URL, params)
}

// ── הכנסה חיצונית ────────────────────────────────────────────────────────────
// תשלום שנכנס אצלנו במזומן / צ'ק / העברה אינו קיים אצל נדרים כלל, ולכן אי אפשר
// להפיק עליו קבלה. Action=SaveAchnasot יוצר אצלם רשומת הכנסה ומחזיר מזהה —
// והמזהה הזה הוא מה שמפיקים עליו קבלה. שים לב: זו *כתיבה של רשומה חדשה* אצל
// נדרים, לא סנכרון של משהו קיים.

export const EXTERNAL_INCOME_TYPE = {
  cash:     '1',
  check:    '2',
  transfer: '3',
  credit:   '4',
  masav:    '5',
  other:    '6',
} as const

export type ExternalIncomeKind = keyof typeof EXTERNAL_INCOME_TYPE

export const EXTERNAL_INCOME_LABEL: Record<ExternalIncomeKind, string> = {
  cash:     'מזומן',
  check:    'צ\'ק',
  transfer: 'העברה בנקאית',
  credit:   'אשראי חיצוני',
  masav:    'מס"ב חיצוני',
  other:    'אחר',
}

export interface ExternalIncomeResult extends NedarimResult {
  /** המזהה שנדרים החזירו — הקלט של הפקת הקבלה */
  incomeId?: string
  kabalaId?: string
  invoiceId?: string
}

const pick = (o: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const k of keys) {
    const v = o?.[k]
    if (v != null && String(v).trim() && String(v).trim() !== '0') return String(v).trim()
  }
  return undefined
}

export async function saveExternalIncome(opts: {
  kind: ExternalIncomeKind
  /** מזהה התורם אצל נדרים (ת.ז. / מספר מזהה) — שדה חובה */
  zeout: string
  amount: number
  date?: Date | string
  /** קטגוריה בנדרים */
  groupe?: string
  /** "עבור" — הטקסט שיופיע בקבלה */
  avour?: string
  /** אסמכתא (מספר צ'ק, מספר העברה) */
  asmahta?: string
  specialName?: string
  specialAddress?: string
}): Promise<ExternalIncomeResult> {
  const params: Record<string, string> = {
    Action:   'SaveAchnasot',
    Type:     EXTERNAL_INCOME_TYPE[opts.kind],
    Zeout:    opts.zeout,
    Amount:   String(Math.round(Math.abs(opts.amount) * 100) / 100),
    Date:     toNedarimDate(opts.date ?? new Date()),
    Currency: '1',                                   // שקל
    AjaxId:   ajaxId(),
  }
  if (opts.groupe)         params.Groupe         = opts.groupe
  if (opts.avour)          params.Avour          = opts.avour
  if (opts.asmahta)        params.Asmahta        = opts.asmahta
  if (opts.specialName)    params.SpecialName    = opts.specialName
  if (opts.specialAddress) params.SpecialAdresse = opts.specialAddress

  const res = await post(MANAGE_URL, params)
  const ids = idsFromRaw(res.raw)

  // הכנסה שנוצרה בלי מזהה מוחזר: הרשומה *כן* נכתבה אצל נדרים. לא מסמנים כישלון
  // — סימון כזה יזמין ניסיון חוזר שייצור הכנסה כפולה. מדווחים שהקבלה לבדה
  // נותרה לביצוע ידני.
  return { ...res, ...ids }
}

function idsFromRaw(raw?: string): { incomeId?: string; kabalaId?: string; invoiceId?: string } {
  try {
    const j = JSON.parse(String(raw ?? '')) as Record<string, unknown>
    return {
      incomeId:  pick(j, 'ID', 'Id', 'AchnasotId'),
      kabalaId:  pick(j, 'KabalaId', 'KabalaID'),
      invoiceId: pick(j, 'InvoiceId', 'InvoiceID'),
    }
  } catch {
    return {}
  }
}

// ── קבלות ────────────────────────────────────────────────────────────────────

/**
 * הפקת קבלה. דורש מזהה עסקה *קיים בנדרים* — לתשלום שנרשם רק אצלנו (מזומן,
 * צ'ק, העברה) יש ליצור קודם הכנסה חיצונית בנדרים ולקבל ממנה מזהה.
 * TamalType: 405 קבלת תרומה · 400 קבלה רגילה · 320 חשבונית מס קבלה.
 */
export async function createReceipt(opts: {
  transactionId: string
  type?: 'Achnasot' | 'Ashray'
  tamalType?: '400' | '405' | '320'
}): Promise<ExternalIncomeResult> {
  const res = await post(TAMAL_URL, {
    Action: 'CreateInvoice',
    ID: opts.transactionId,
    Type: opts.type ?? 'Achnasot',
    TamalType: opts.tamalType ?? '405',
  })
  return { ...res, ...idsFromRaw(res.raw) }
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
