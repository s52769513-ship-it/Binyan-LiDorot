import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/** Replace mergeId with keepId in a postgres array column, skipping excluded row IDs */
async function repoint(table: string, col: string, mergeId: string, keepId: string, excludeIds: Set<string> = new Set()) {
  const { data } = await supabaseAdmin
    .from(table)
    .select(`id, ${col}`)
    .contains(col, [mergeId])

  for (const row of data ?? []) {
    const r = row as unknown as Record<string, unknown>
    const rowId = r['id'] as string
    if (excludeIds.has(rowId)) continue
    const arr: string[] = (r[col] as string[]) ?? []
    const updated = Array.from(new Set(arr.map((id: string) => id === mergeId ? keepId : id)))
    await supabaseAdmin.from(table).update({ [col]: updated }).eq('id', rowId)
  }
  return (data ?? []).length
}

async function countAffected(table: string, col: string, mergeId: string) {
  const { count } = await supabaseAdmin
    .from(table)
    .select('id', { count: 'exact', head: true })
    .contains(col, [mergeId])
  return count ?? 0
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const {
    keepId, mergeId,
    overrides = {},
    dryRun = false,
    excludeTxIds = [],
    excludePpIds = [],
  } = body as {
    keepId: string
    mergeId: string
    overrides: Record<string, unknown>
    dryRun?: boolean
    excludeTxIds?: string[]
    excludePpIds?: string[]
  }

  if (!keepId || !mergeId || keepId === mergeId) {
    return NextResponse.json({ error: 'נדרש keepId ו-mergeId שונים' }, { status: 400 })
  }

  try {
    const txCount   = await countAffected('transactions',     'parent_ids', mergeId)
    const ppCount   = await countAffected('planned_payments', 'parent_ids', mergeId)
    const stuCount  = await countAffected('students',         'parent_ids', mergeId)
    const womCount  = await countAffected('women',            'parent_ids', mergeId)

    const { count: soCount1 } = await supabaseAdmin.from('standing_orders').select('id', { count: 'exact', head: true }).eq('parent_id', mergeId)
    const { count: soCount2 } = await supabaseAdmin.from('standing_orders').select('id', { count: 'exact', head: true }).eq('linked_parent_id', mergeId)
    const soCount = (soCount1 ?? 0) + (soCount2 ?? 0)

    const summary = { transactions: txCount, plannedPayments: ppCount, students: stuCount, women: womCount, standingOrders: soCount }

    if (dryRun) return NextResponse.json({ dryRun: true, summary })

    const excludeTx = new Set<string>(excludeTxIds)
    const excludePp = new Set<string>(excludePpIds)

    await repoint('transactions',     'parent_ids', mergeId, keepId, excludeTx)
    await repoint('planned_payments', 'parent_ids', mergeId, keepId, excludePp)
    await repoint('students',         'parent_ids', mergeId, keepId)
    await repoint('women',            'parent_ids', mergeId, keepId)

    await supabaseAdmin.from('standing_orders').update({ parent_id: keepId }).eq('parent_id', mergeId)
    await supabaseAdmin.from('standing_orders').update({ linked_parent_id: keepId }).eq('linked_parent_id', mergeId)

    if (Object.keys(overrides).length > 0) {
      await supabaseAdmin.from('parents').update(overrides).eq('id', keepId)
    }

    await supabaseAdmin.from('parents').delete().eq('id', mergeId)

    return NextResponse.json({ success: true, summary })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
