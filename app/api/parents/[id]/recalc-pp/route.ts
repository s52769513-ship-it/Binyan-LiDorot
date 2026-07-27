import { NextRequest, NextResponse } from 'next/server'
import { relinkParent } from '@/lib/relink'

/**
 * POST /api/parents/[id]/recalc-pp
 * ריענון מלא של תשלומי ההורה. מאוחד עכשיו למנגנון אחד — relinkParent —
 * שהוא מקור האמת היחיד: מוחק שורות זיכוי/גלישה שנוצרו אוטומטית, מריץ מחדש את
 * כל התנועות (מכבד קישורים ידניים), מחשב יתרות, וזוקף עודף ל-credit_balance.
 *
 * עד עכשיו הפונקציה הזו יצרה שורות "זיכוי שמור" (type='זיכוי') בכל ריצה בלי
 * למחוק את הישנות — מה שהצטבר לשורות זיכוי כפולות וניפח את הזיכוי המוצג.
 * relinkParent מטפל בזה נכון (זיכוי בעמודה אחת, בלי שורות כפולות).
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: parentId } = await params
  try {
    const result = await recalcPPs(parentId)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/**
 * שם היסטורי שנשמר לתאימות עם כל הקוראים (planned-payments, generate-year,
 * merge וכו') — מאציל ל-relinkParent ומחזיר צורה תואמת.
 */
export async function recalcPPs(parentId: string) {
  const stats = await relinkParent(parentId)
  return {
    unlinkedMatched: stats.newlyLinked,
    unlinkedWrong: 0,
    leftoverCredit: stats.creditTuition,
    tuitionBalance: 0,        // relinkParent already persisted the real balance
    salaryOffsetMonths: [] as string[],
  }
}
