import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function detectFramework(className: string): string {
  if (className.includes('תלמוד תורה')) return 'תלמוד תורה'
  if (className.includes('בית חינוך'))  return 'בית חינוך לבנות'
  return ''
}

export async function GET(req: NextRequest) {
  const linkedOnly = req.nextUrl.searchParams.get('linked') === 'true'

  const [classesRes, studentsRes] = await Promise.all([
    supabaseAdmin.from('classes').select('class_name, framework').order('class_name', { ascending: true }),
    supabaseAdmin.from('students').select('class_name').not('class_name', 'is', null).neq('class_name', ''),
  ])

  const defined = new Map<string, string>(
    (classesRes.data ?? []).map(c => [c.class_name, c.framework ?? ''])
  )

  // Add class names from students that aren't in the classes table yet,
  // auto-detecting framework from the class name
  for (const s of studentsRes.data ?? []) {
    if (s.class_name && !defined.has(s.class_name)) {
      defined.set(s.class_name, detectFramework(s.class_name))
    }
  }

  const result = Array.from(defined.entries())
    .map(([class_name, framework]) => ({ class_name, framework }))
    .filter(c => !linkedOnly || !!c.framework)   // ?linked=true → only classes with a framework
    .sort((a, b) => a.class_name.localeCompare(b.class_name, 'he'))

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  try {
    const { className, framework } = await req.json()
    if (!className) return NextResponse.json({ error: 'className required' }, { status: 400 })
    const fw = framework ?? detectFramework(className)
    const { error } = await supabaseAdmin
      .from('classes')
      .upsert({ class_name: className, framework: fw }, { onConflict: 'class_name' })
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const all = req.nextUrl.searchParams.get('all') === 'true'
    if (all) {
      const { error } = await supabaseAdmin.from('classes').delete().neq('class_name', '')
      if (error) throw error
      return NextResponse.json({ success: true, deleted: 'all' })
    }
    const { className } = await req.json()
    if (!className) return NextResponse.json({ error: 'className required' }, { status: 400 })
    const { error } = await supabaseAdmin
      .from('classes')
      .delete()
      .eq('class_name', className)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

