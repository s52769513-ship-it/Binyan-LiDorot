import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET() {
  const [classesRes, studentsRes] = await Promise.all([
    supabaseAdmin.from('classes').select('class_name, framework').order('class_name', { ascending: true }),
    supabaseAdmin.from('students').select('class_name').not('class_name', 'is', null).neq('class_name', ''),
  ])

  const defined = new Map<string, string>(
    (classesRes.data ?? []).map(c => [c.class_name, c.framework ?? ''])
  )

  // Add class names from students that aren't in the classes table yet
  for (const s of studentsRes.data ?? []) {
    if (s.class_name && !defined.has(s.class_name)) {
      defined.set(s.class_name, '')
    }
  }

  const result = Array.from(defined.entries())
    .map(([class_name, framework]) => ({ class_name, framework }))
    .sort((a, b) => a.class_name.localeCompare(b.class_name, 'he'))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const { className, framework } = await req.json()
    if (!className) return NextResponse.json({ error: 'className required' }, { status: 400 })
    const { error } = await supabaseAdmin
      .from('classes')
      .upsert({ class_name: className, framework: framework ?? '' }, { onConflict: 'class_name' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
