import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { rows } = await req.json() as { rows: Array<{ studentId: string; updates: Record<string, unknown> }> }
  let updated = 0
  const errors: string[] = []

  // Collect unique class names and upsert them
  const classNames = new Set<string>()
  for (const row of rows) {
    if (row.updates.class_name) classNames.add(String(row.updates.class_name))
  }
  if (classNames.size > 0) {
    const detectFramework = (cn: string): string => {
      if (cn.includes('בית חינוך')) return 'בית חינוך לבנות'
      if (cn.includes('תלמוד תורה') || cn.includes('ת"ת')) return 'תלמוד תורה'
      return ''
    }
    await supabaseAdmin.from('classes').upsert(
      Array.from(classNames).map(cn => ({ class_name: cn, framework: detectFramework(cn) })),
      { onConflict: 'class_name', ignoreDuplicates: false }
    )
  }

  for (const row of rows) {
    if (!row.studentId || Object.keys(row.updates).length === 0) continue
    const { error } = await supabaseAdmin.from('students').update(row.updates).eq('id', row.studentId)
    if (error) errors.push(error.message)
    else updated++
  }

  return NextResponse.json({ updated, errors })
}
