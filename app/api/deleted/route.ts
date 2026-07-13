import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Pulls whatever parent id(s) a deleted row's stored data references, so the
// trash UI can show a name instead of a bare id — different tables key it
// differently (array on transactions/students, singular on standing_orders).
function parentIdsOf(recordType: string, data: Record<string, unknown>): string[] {
  // A deleted parent's own name is already in data.name — no lookup needed
  // (and the parents-table lookup would find nothing, since that row is gone).
  if (recordType === 'parent') return []
  if (recordType === 'standing_order') return [data.parent_id as string].filter(Boolean)
  const raw = data.parent_ids
  return Array.isArray(raw) ? (raw as string[]).filter(Boolean) : []
}

export async function GET(req: NextRequest) {
  try {

    const url = new URL(req.url)
    const type = url.searchParams.get('type') || null
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('deleted_records')
      .select('*', { count: 'exact' })
      .order('deleted_at', { ascending: false })

    if (type) {
      query = query.eq('record_type', type)
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const rows = data || []

    // Resolve parent names for every record that references one, in a single query
    const allParentIds = [...new Set(
      rows.flatMap(r => parentIdsOf(r.record_type as string, (r.data as Record<string, unknown>) ?? {}))
    )]
    let parentMap: Record<string, string> = {}
    if (allParentIds.length > 0) {
      const { data: pData } = await supabaseAdmin.from('parents').select('id, name').in('id', allParentIds)
      parentMap = Object.fromEntries((pData ?? []).map(p => [p.id as string, (p.name as string) ?? '']))
    }

    const enriched = rows.map(r => ({
      ...r,
      parentNames: parentIdsOf(r.record_type as string, (r.data as Record<string, unknown>) ?? {})
        .map(id => parentMap[id])
        .filter(Boolean),
    }))

    return NextResponse.json({
      data: enriched,
      total: count || 0,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
