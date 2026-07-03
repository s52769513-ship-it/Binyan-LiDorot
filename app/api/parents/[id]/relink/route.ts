import { NextRequest, NextResponse } from 'next/server'
import { relinkParent } from '@/lib/relink'

/**
 * POST /api/parents/[id]/relink
 * ריענון הורה: איפוס יתרות PP (ללא משכורת), הרצה מחדש של כל התנועות
 * המקושרות בסדר כרונולוגי עם cascade, רישום גלישות כשורות "זיכוי מעודף
 * תשלום" על ה-PP שקיבל אותן, ועודף סופי → יתרת זכות.
 * הלוגיקה המלאה ב-lib/relink.ts (משותפת עם ריענון כל ההורים).
 */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: parentId } = await params
  try {
    const stats = await relinkParent(parentId)
    return NextResponse.json({ success: true, ...stats })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
