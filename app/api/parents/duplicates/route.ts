import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const by     = searchParams.get('by') ?? 'tz'     // 'tz' | 'phone' | 'name'
  const query  = searchParams.get('q') ?? ''

  try {
    if (by === 'name' && query.trim()) {
      // Free-text search: return all parents whose name contains any word from query
      const { data } = await supabaseAdmin
        .from('parents')
        .select('id, name, father_phone, mother_phone, id_number, city, status')
        .ilike('name', `%${query.trim()}%`)
        .order('name')
        .limit(50)
      return NextResponse.json({ groups: data && data.length > 1 ? [data] : data ?? [] })
    }

    // For tz / phone: find values that appear more than once
    const field = by === 'tz' ? 'id_number' : 'father_phone'
    const { data: all } = await supabaseAdmin
      .from('parents')
      .select('id, name, father_phone, mother_phone, id_number, city, status')
      .not(field, 'is', null)
      .neq(field, '')
      .order('name')

    if (!all) return NextResponse.json({ groups: [] })

    // Group by field value, keep groups with 2+
    const grouped = new Map<string, typeof all>()
    for (const p of all) {
      const key = String((p as Record<string,unknown>)[field] ?? '').trim()
      if (!key) continue
      if (!grouped.has(key)) grouped.set(key, [])
      grouped.get(key)!.push(p)
    }
    const groups = Array.from(grouped.values()).filter(g => g.length >= 2)
    return NextResponse.json({ groups })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
