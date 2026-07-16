import { NextRequest, NextResponse } from 'next/server'
import { relinkParent } from '@/lib/relink'
import { actorFromRequest, logActivity } from '@/lib/activityLog'

/**
 * POST /api/parents/[id]/relink
 * ריענון הורה: איפוס יתרות PP (ללא משכורת), הרצה מחדש של כל התנועות
 * המקושרות בסדר כרונולוגי עם cascade, רישום גלישות כשורות "זיכוי מעודף
 * תשלום" על ה-PP שקיבל אותן, ועודף סופי → יתרת זכות.
 * הלוגיקה המלאה ב-lib/relink.ts (משותפת עם ריענון כל ההורים).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: parentId } = await params
  try {
    const stats = await relinkParent(parentId)
    void logActivity({
      parentId, actor: actorFromRequest(req), action: 'automation',
      summary: `ריענון ידני: ${stats.txsProcessed} תנועות עובדו · ${stats.spilloverCreated} גלישות · זיכוי ₪${Math.round(stats.credit)}`,
    })
    return NextResponse.json({ success: true, ...stats })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
