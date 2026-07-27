import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcTuitionForParent } from '@/lib/recalcTuition'

export const maxDuration = 300

/**
 * POST /api/students/bulk-status
 * Body: { studentIds: string[], status: string }
 *
 * Sets the same status on many students at once (e.g. marking a whole class
 * "סיים לימודים" at year-end), then recalculates tuition for every affected
 * parent — same downstream effect as editing each student's status one by one.
 */
export async function POST(req: NextRequest) {
  try {
    const { studentIds, status } = await req.json() as { studentIds?: string[]; status?: string }
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ error: 'לא נבחרו תלמידים' }, { status: 400 })
    }
    if (typeof status !== 'string' || !status.trim()) {
      return NextResponse.json({ error: 'סטטוס חסר' }, { status: 400 })
    }

    // Collect affected parents BEFORE the update (parent_ids don't change here).
    const { data: students } = await supabaseAdmin
      .from('students')
      .select('parent_ids')
      .in('id', studentIds)
    const affectedParents = new Set<string>()
    for (const s of students ?? []) {
      for (const pid of (s.parent_ids as string[]) ?? []) affectedParents.add(pid)
    }

    const { error } = await supabaseAdmin
      .from('students')
      .update({ status })
      .in('id', studentIds)
    if (error) throw error

    // Status affects tuition — recompute each affected parent.
    for (const pid of affectedParents) {
      try { await recalcTuitionForParent(pid) } catch (e) { console.error('recalcTuition (bulk-status):', pid, e) }
    }

    return NextResponse.json({ success: true, updated: studentIds.length, parents: affectedParents.size })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
