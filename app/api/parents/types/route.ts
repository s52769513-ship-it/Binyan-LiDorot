import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// ברירות מחדל שתמיד מופיעות בתפריט, גם כשאין עדיין הורים מהסוג הזה
const DEFAULT_TYPES = ['אנ"ש', 'ספק']

/**
 * GET /api/parents/types
 * מחזיר את רשימת סוגי בן אדם לתפריט הנפתח: ברירות המחדל + כל ערך מותאם
 * שכבר נשמר על הורה כלשהו (כך שסוג חדש שנוצר מופיע בפעמים הבאות).
 */
export async function GET() {
  try {
    const { data } = await supabaseAdmin.from('parents').select('person_type')
    const set = new Set<string>(DEFAULT_TYPES)
    for (const row of data ?? []) {
      for (const t of Array.isArray(row.person_type) ? row.person_type : []) {
        if (t) set.add(t as string)
      }
    }
    const types = [...set].sort((a, b) => a.localeCompare(b, 'he'))
    return NextResponse.json({ types })
  } catch {
    return NextResponse.json({ types: DEFAULT_TYPES })
  }
}
