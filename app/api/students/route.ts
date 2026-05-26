import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

async function classFrameworkMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('classes').select('class_name, framework')
  return Object.fromEntries((data ?? []).map(c => [c.class_name, c.framework]))
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search') ?? ''

    let query = supabaseAdmin
      .from('students')
      .select('id, name, gender, age, class_name, status, transportation, transportation_cost, parent_ids')
      .order('class_name', { ascending: true })
      .order('name', { ascending: true })

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`)
    }

    const [{ data, error }, frameMap] = await Promise.all([query, classFrameworkMap()])
    if (error) throw error

    const students = (data ?? []).map(s => ({
      id: s.id,
      name: s.name ?? '',
      gender: s.gender ?? '',
      age: s.age ?? '',
      className: s.class_name ?? '',
      framework: frameMap[s.class_name ?? ''] ?? '',
      status: s.status ?? '',
      transportation: Array.isArray(s.transportation) ? s.transportation : [],
      transportationCost: s.transportation_cost ?? 0,
      parentIds: Array.isArray(s.parent_ids) ? s.parent_ids : [],
    }))

    return NextResponse.json({ data: students, total: students.length })
  } catch (err) {
    console.error('students error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת תלמידים' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const {
      firstName, lastName, gender, className,
      birthDateHebrew, birthDateGregorian,
      address, city, transportation, parentIds, notes,
    } = body

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'שם פרטי ושם משפחה הם שדות חובה' }, { status: 400 })
    }

    const insertData = {
      name: `${firstName} ${lastName}`.trim(),
      gender: gender ?? '',
      class_name: className ?? '',
      transportation: Array.isArray(transportation) ? transportation : [],
      transportation_cost: 0,
      parent_ids: Array.isArray(parentIds) ? parentIds : [],
      notes: [
        notes,
        birthDateHebrew ? `תאריך לידה עברי: ${birthDateHebrew}` : null,
        birthDateGregorian ? `תאריך לידה: ${birthDateGregorian}` : null,
        address ? `כתובת: ${address}` : null,
        city ? `עיר: ${city}` : null,
      ].filter(Boolean).join(' | ') || null,
      synced_at: new Date().toISOString(),
    }

    const { data, error } = await supabaseAdmin
      .from('students')
      .insert(insertData)
      .select('id')
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, id: data.id })
  } catch (err) {
    console.error('student insert error:', err)
    return NextResponse.json({ error: 'שגיאה בשמירת הרישום' }, { status: 500 })
  }
}
