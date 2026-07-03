/**
 * ייחוס תנועות מקושרות לתשלום מתוכנן — לתצוגה בלבד.
 *
 * תנועה מקושרת תמיד ל-PP אחד (planned_payment_id), אבל בפועל תשלום גדול
 * יכול "לגלוש": חלקו נספג ב-PP המקושר והשאר ירד מחובות אחרים או נזקף
 * לזיכוי (ה-cascade ב-ppPayments/relink). לכן סכום התנועות המקושרות יכול
 * לעלות על סכום ה-PP — מה שנראה בכרטיס כמו כפילות.
 *
 * הפונקציה משחזרת את החלוקה: ממלאת את קיבולת ה-PP לפי סדר התאריכים
 * (כמו סדר ההרצה של ריענון/relink) ומחזירה לכל תנועה כמה ממנה נזקף
 * ל-PP הזה, וכמה בסך הכול גלש הלאה.
 */

export interface AttributableTx {
  id: string
  amount: number
  date?: string | null
}

export interface PPAttribution {
  /** txId → החלק מהתנועה שנזקף ל-PP הזה */
  appliedById: Map<string, number>
  /** סה"כ סכום התנועות המקושרות */
  totalLinked: number
  /** כמה מעבר לסכום ה-PP — גלש לחובות אחרים / זיכוי */
  overflow: number
}

export function attributeTxsToPP(txs: AttributableTx[], ppAmount: number): PPAttribution {
  const round2 = (n: number) => Math.round(n * 100) / 100
  // מהוותיקה לחדשה; תאריך חסר — אחרון (מיון יציב שומר סדר מקורי בשוויון)
  const chrono = [...txs].sort((a, b) => (a.date || '9999-99-99').localeCompare(b.date || '9999-99-99'))

  const appliedById = new Map<string, number>()
  let capacity = Math.max(0, ppAmount)
  let totalLinked = 0

  for (const tx of chrono) {
    const amt = Math.abs(Number(tx.amount)) || 0
    totalLinked = round2(totalLinked + amt)
    const applied = Math.min(amt, capacity)
    capacity = round2(capacity - applied)
    appliedById.set(tx.id, round2(applied))
  }

  return { appliedById, totalLinked, overflow: round2(Math.max(0, totalLinked - ppAmount)) }
}
