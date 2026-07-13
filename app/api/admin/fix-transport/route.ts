import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcTuitionForParent } from '@/lib/recalcTuition'
import { calcTransportCost, normalizeTransport } from '@/lib/transport'

export const maxDuration = 300

// One-off backfill: earlier data stored transport legs as bare "1" tokens, so
// transportation_cost was left at 0 and never reached the monthly tuition amount.
// This recomputes transportation + transportation_cost for every student and
// re-runs tuition for the affected parents.
//
// POST /api/admin/fix-transport            → dry run (reports what would change)
// POST /api/admin/fix-transport {"apply":true} → applies the fixes
export async function POST(req: NextRequest) {
  try {
    const { apply = false } = await req.json().catch(() => ({}))

    const { data: students, error } = await supabaseAdmin
      .from('students')
      .select('id, name, status, transportation, transportation_cost, parent_ids')
      .limit(10000)
    if (error) throw error

    const changes: Array<{
      id: string; name: string
      before: unknown; beforeCost: number
      after: string[]; afterCost: number
    }> = []
    const affectedParents = new Set<string>()

    for (const s of students ?? []) {
      const after     = normalizeTransport(s.transportation)
      const afterCost  = calcTransportCost(s.transportation)
      const beforeCost = Number(s.transportation_cost) || 0

      const sameLegs = JSON.stringify(s.transportation ?? []) === JSON.stringify(after)
      if (sameLegs && beforeCost === afterCost) continue

      changes.push({
        id: s.id, name: s.name ?? '',
        before: s.transportation, beforeCost,
        after, afterCost,
      })
      for (const pid of (s.parent_ids as string[]) ?? []) affectedParents.add(pid)

      if (apply) {
        await supabaseAdmin.from('students')
          .update({ transportation: after, transportation_cost: afterCost })
          .eq('id', s.id)
      }
    }

    let recalced = 0
    if (apply) {
      for (const pid of affectedParents) {
        try { await recalcTuitionForParent(pid); recalced++ } catch { /* keep going */ }
      }
    }

    return NextResponse.json({
      apply,
      totalStudents: students?.length ?? 0,
      changed: changes.length,
      affectedParents: affectedParents.size,
      recalced,
      // Cap the sample so the response stays small
      sample: changes.slice(0, 50),
    })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
