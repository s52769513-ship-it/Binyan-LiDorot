import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/** Replace every occurrence of mergeId with keepId in a postgres array column */
async function repoint(table: string, col: string, mergeId: string, keepId: string) {
  // Load all rows that contain mergeId
  const { data } = await supabaseAdmin
    .from(table)
    .select(`id, ${col}`)
    .contains(col, [mergeId])

  for (const row of data ?? []) {
    const arr: string[] = row[col] ?? []
    const updated = Array.from(new Set(arr.map((id: string) => id === mergeId ? keepId : id)))
    await supabaseAdmin.from(table).update({ [col]: updated }).eq('id', row.id)
  }
  return (data ?? []).length
}

/** Dry run: just count affected rows */
async function countAffected(table: string, col: string, mergeId: string) {
  const { count } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .contains(col, [mergeId])
  return count ?? 0
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { keepId, mergeId, overrides = {}, dryRun = false } = body as {
    keepId: string
    mergeId: string
    overrides: Record<string, unknown>
    dryRun?: boolean
  }

  if (!keepId || !mergeId || keepId === mergeId) {
    return NextResponse.json({ error: 'נדרש keepId ו-mergeId שונים' }, { status: 400 })
  }

  try {
    // Count affected records for preview
    const txCount   = await countAffected('transactions',     'parent_ids', mergeId)
    const ppCount   = await countAffected('planned_payments', 'parent_ids', mergeId)
    const stuCount  = await countAffected('students',         'parent_ids', mergeId)
    const womCount  = await countAffected('women',            'parent_ids', mergeId)

    // Standing orders (single column)
    const { count: soCount1 } = await supabaseAdmin.from('standing_orders').select('id', { count: 'exact', head: true }).eq('parent_id', mergeId)
    const { count: soCount2 } = await supabaseAdmin.from('standing_orders').select('id', { count: 'exact', head: true }).eq('linked_parent_id', mergeId)
    const soCount = (soCount1 ?? 0) + (soCount2 ?? 0)

    const summary = {
      transactions: txCount,
      plannedPayments: ppCount,
      students: stuCount,
      women: womCount,
      standingOrders: soCount,
      overrideFields: Object.keys(overrides),
    }

    if (dryRun) return NextResponse.json({ dryRun: true, summary })

    // ── Execute merge ──────────────────────────────────────────────────

    // 1. Re-point array relations
    await repoint('transactions',     'parent_ids', mergeId, keepId)
    await repoint('planned_payments', 'parent_ids', mergeId, keepId)
    await repoint('students',         'parent_ids', mergeId, keepId)
    await repoint('women',            'parent_ids', mergeId, keepId)

    // 2. Re-point standing orders (single column)
    await supabaseAdmin.from('standing_orders').update({ parent_id: keepId }).eq('parent_id', mergeId)
    await supabaseAdmin.from('standing_orders').update({ linked_parent_id: keepId }).eq('linked_parent_id', mergeId)

    // 3. Apply field overrides to winner
    if (Object.keys(overrides).length > 0) {
      await supabaseAdmin.from('parents').update(overrides).eq('id', keepId)
    }

    // 4. Delete the loser
    await supabaseAdmin.from('parents').delete().eq('id', mergeId)

    return NextResponse.json({ success: true, summary })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
