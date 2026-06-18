import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const [{ data: students }, { data: parents }] = await Promise.all([
    supabaseAdmin.from('students').select('id, name, parent_ids'),
    supabaseAdmin.from('parents').select('id, name, first_name'),
  ])
  const parentMap = new Map((parents ?? []).map(p => [p.id, p]))
  const result = (students ?? []).map(s => {
    const parentId = s.parent_ids?.[0] ?? null
    const parent = parentId ? parentMap.get(parentId) : null
    return {
      studentId: s.id,
      studentName: s.name ?? '',
      parentId: parentId ?? '',
      parentName: parent?.name ?? '',
      parentFirstName: parent?.first_name ?? '',
    }
  })
  return NextResponse.json(result)
}
