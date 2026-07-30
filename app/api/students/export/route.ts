import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { MISSING_COLUMN_CODES } from '@/lib/ppPayments'
import { isPendingRegistrant, isAlumnus } from '@/lib/registration'

/**
 * GET /api/students/export
 * מחזיר את הנתונים לייצוא אקסל של תלמידים/נרשמים. הקובץ עצמו נבנה בדפדפן
 * (lib/exportUtils), כאן רק נאספים השדות — כולל פרטי ההורים, שדורשים שליפה
 * נוספת מטבלת ההורים.
 *
 * scope=students | registrants | alumni   (ברירת מחדל: students)
 * framework=all | tt | bs
 * details=names | full
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const scope     = searchParams.get('scope') ?? 'students'
    const framework = searchParams.get('framework') ?? 'all'
    const details   = searchParams.get('details') ?? 'names'

    const BASE = 'id, name, class_name, status, gender, id_number, birth_date_gregorian, birth_date_hebrew, parent_ids'
    const build = (cols: string) =>
      supabaseAdmin.from('students').select(cols)
        .order('class_name', { ascending: true })
        .order('name', { ascending: true })

    let res = await build(`${BASE}, committee_approved, graduation_year`)
    if (res.error && MISSING_COLUMN_CODES.has(res.error.code)) res = await build(BASE)
    if (res.error) throw res.error
    const rows = (res.data ?? []) as unknown as Record<string, unknown>[]

    const { data: classRows } = await supabaseAdmin.from('classes').select('class_name, framework')
    const frameOf = Object.fromEntries((classRows ?? []).map(c => [c.class_name, c.framework]))
    const detectFramework = (cn: string) =>
      cn.includes('תלמוד תורה') ? 'תלמוד תורה' : cn.includes('בית חינוך') ? 'בית חינוך לבנות' : ''

    // סינון לפי היקף ואגף
    const wanted = rows.filter(s => {
      const st = { status: s.status as string, committeeApproved: s.committee_approved as boolean }
      if (scope === 'registrants') { if (!isPendingRegistrant(st) || isAlumnus(st)) return false }
      else if (scope === 'alumni')  { if (!isAlumnus(st)) return false }
      else if (isPendingRegistrant(st) || isAlumnus(st)) return false   // students = היומיום בלבד

      const cn = String(s.class_name ?? '')
      const fw = frameOf[cn] || detectFramework(cn)
      if (framework === 'tt' && fw !== 'תלמוד תורה') return false
      if (framework === 'bs' && fw !== 'בית חינוך לבנות') return false
      return true
    })

    // פרטי הורים נדרשים רק בייצוא המלא
    let parentMap: Record<string, Record<string, unknown>> = {}
    if (details === 'full') {
      const ids = [...new Set(wanted.flatMap(s => (s.parent_ids as string[]) ?? []))]
      if (ids.length > 0) {
        const CH = 300
        for (let i = 0; i < ids.length; i += CH) {
          const { data } = await supabaseAdmin
            .from('parents')
            .select('id, name, mother_name, father_phone, mother_phone, address, building, city')
            .in('id', ids.slice(i, i + CH))
          for (const p of data ?? []) parentMap[p.id as string] = p
        }
      }
    }

    const out = wanted.map(s => {
      const cn = String(s.class_name ?? '')
      const fw = frameOf[cn] || detectFramework(cn)
      const base: Record<string, string> = {
        'שם': String(s.name ?? ''),
        'כיתה': cn,
        'אגף': fw,
      }
      if (scope === 'alumni') base['שנתון'] = String(s.graduation_year ?? '')
      if (details !== 'full') return base

      const parent = ((s.parent_ids as string[]) ?? []).map(id => parentMap[id]).find(Boolean)
      const addr = [parent?.address, parent?.building].filter(Boolean).join(' ')
      return {
        ...base,
        'סטטוס': String(s.status ?? ''),
        'מ.ז.': String(s.id_number ?? ''),
        'תאריך לידה': String(s.birth_date_gregorian ?? ''),
        'תאריך לידה עברי': String(s.birth_date_hebrew ?? ''),
        'שם האב': String(parent?.name ?? ''),
        'שם האם': String(parent?.mother_name ?? ''),
        'טלפון האב': String(parent?.father_phone ?? ''),
        'טלפון האם': String(parent?.mother_phone ?? ''),
        'כתובת': addr,
        'עיר': String(parent?.city ?? ''),
      }
    })

    return NextResponse.json({ data: out, total: out.length })
  } catch (err) {
    console.error('students export error:', err)
    return NextResponse.json({ error: 'שגיאה בהכנת הייצוא' }, { status: 500 })
  }
}
