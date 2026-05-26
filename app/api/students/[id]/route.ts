import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [studentRes, classesRes] = await Promise.all([
      supabaseAdmin.from('students').select('*').eq('id', id).single(),
      supabaseAdmin.from('classes').select('class_name, framework'),
    ])

    if (studentRes.error) throw studentRes.error
    const s = studentRes.data

    const frameMap = Object.fromEntries(
      (classesRes.data ?? []).map(c => [c.class_name, c.framework])
    )
    const toArray = (v: unknown): string[] =>
      Array.isArray(v) ? v : (v ? [String(v)] : [])

    // Fetch parent names if any
    const parentIds = toArray(s.parent_ids)
    let parents: { id: string; name: string }[] = []
    if (parentIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('parents').select('id, name').in('id', parentIds)
      parents = (data ?? []).map(p => ({ id: p.id, name: p.name ?? '' }))
    }

    return NextResponse.json({
      id: s.id,
      name: s.name ?? '',
      gender: s.gender ?? '',
      age: s.age ?? '',
      className: s.class_name ?? '',
      framework: frameMap[s.class_name ?? ''] ?? '',
      status: s.status ?? '',
      transportation: toArray(s.transportation),
      transportationCost: s.transportation_cost ?? 0,
      notes: s.notes ?? '',
      parentIds,
      parents,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

const ALLOWED = ['name', 'gender', 'age', 'class_name', 'status',
  'transportation', 'transportation_cost', 'notes']

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const update: Record<string, unknown> = {}
    for (const key of ALLOWED) {
      const clientKey = key === 'class_name' ? 'className'
        : key === 'transportation_cost' ? 'transportationCost' : key
      if (clientKey in body) update[key] = body[clientKey]
      else if (key in body) update[key] = body[key]
    }
    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })
    const { error } = await supabaseAdmin.from('students').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
