import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcTuitionForParent } from '@/lib/recalcTuition'
import { MISSING_COLUMN_CODES } from '@/lib/ppPayments'
import { schoolYearHebrew } from '@/lib/hebrewYear'

export const maxDuration = 300

interface Move {
  studentId: string
  /** כיתת היעד. אם חסר/ריק — הכיתה לא משתנה (למשל רק שינוי סטטוס). */
  className?: string
  /** סטטוס חדש (למשל "סיים לימודים" לכיתה המסיימת). */
  status?: string
}

/**
 * POST /api/students/promote
 * Body: { moves: Move[] }
 *
 * מבצע העלאת כיתה: מעדכן לכל תלמיד את כיתת היעד ו/או הסטטוס שנבחרו לו.
 * הלקוח שולח רשימה מפורשת (כולל חריגים שנשארו/הועברו ידנית), כך שהשרת רק מיישם
 * בדיוק את מה שהוצג למשתמש. תלמידים שסטטוסם השתנה גוררים חישוב שכ"ל מחדש
 * להורים שלהם — בדיוק כמו עריכת סטטוס בכרטיס התלמיד.
 */
export async function POST(req: NextRequest) {
  try {
    const { moves } = await req.json() as { moves?: Move[] }
    if (!Array.isArray(moves) || moves.length === 0) {
      return NextResponse.json({ error: 'לא נבחרו תלמידים' }, { status: 400 })
    }

    // מקבצים לפי (כיתה, סטטוס) כדי לעדכן בקבוצות במקום שורה-שורה.
    const byUpdate = new Map<string, { className?: string; status?: string; ids: string[] }>()
    for (const mv of moves) {
      if (!mv?.studentId) continue
      const className = typeof mv.className === 'string' && mv.className.trim() ? mv.className.trim() : undefined
      const status    = typeof mv.status    === 'string' && mv.status.trim()    ? mv.status.trim()    : undefined
      if (!className && !status) continue          // אין מה לשנות
      const key = `${className ?? ''}|${status ?? ''}`
      if (!byUpdate.has(key)) byUpdate.set(key, { className, status, ids: [] })
      byUpdate.get(key)!.ids.push(mv.studentId)
    }
    if (byUpdate.size === 0) return NextResponse.json({ updated: 0, parents: 0 })

    // הורים של תלמידים שהסטטוס שלהם משתנה — לחישוב שכ"ל מחדש בסוף.
    const statusChangedIds = [...byUpdate.values()].filter(u => u.status).flatMap(u => u.ids)
    const affectedParents = new Set<string>()
    if (statusChangedIds.length > 0) {
      const CH = 500
      for (let i = 0; i < statusChangedIds.length; i += CH) {
        const { data } = await supabaseAdmin
          .from('students').select('parent_ids').in('id', statusChangedIds.slice(i, i + CH))
        for (const s of data ?? []) {
          for (const pid of (s.parent_ids as string[]) ?? []) affectedParents.add(pid)
        }
      }
    }

    let updated = 0
    for (const { className, status, ids } of byUpdate.values()) {
      const payload: Record<string, unknown> = {}
      if (className) payload.class_name = className
      if (status)    payload.status     = status
      // רישום שנתון הסיום, כדי שהבוגרים יקובצו לפי מחזור בלשונית "בוגרים".
      if (status === 'סיים לימודים') payload.graduation_year = schoolYearHebrew()
      const CH = 500
      for (let i = 0; i < ids.length; i += CH) {
        const slice = ids.slice(i, i + CH)
        let { error } = await supabaseAdmin.from('students').update(payload).in('id', slice)
        // graduation_year עשויה לא להתקיים עדיין (ALUMNI_MIGRATION.sql לא הורץ) —
        // ההעלאה עצמה חשובה מהשנתון, ולכן חוזרים בלעדיו במקום להיכשל.
        if (error && MISSING_COLUMN_CODES.has(error.code) && 'graduation_year' in payload) {
          const { graduation_year: _omit, ...rest } = payload
          void _omit
          ;({ error } = await supabaseAdmin.from('students').update(rest).in('id', slice))
        }
        if (error) throw error
        updated += slice.length
      }
    }

    for (const pid of affectedParents) {
      try { await recalcTuitionForParent(pid) } catch (e) { console.error('recalcTuition (promote):', pid, e) }
    }

    return NextResponse.json({ success: true, updated, parents: affectedParents.size })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
