import { supabaseAdmin } from '@/lib/supabase'
import { NextResponse } from 'next/server'

export async function GET() {
  const [{ data: students }, { data: parents }] = await Promise.all([
    supabaseAdmin.from('students').select('id, name, parent_ids'),
    supabaseAdmin.from('parents').select('id, name, first_name'),
  ])
  type ParentRow = { id: string; name: string | null; first_name: string | null }
  type StudentRow = { id: string; name: string | null; parent_ids: string[] | null }
  const parentMap = new Map<string, ParentRow>(((parents ?? []) as ParentRow[]).map(p => [p.id, p]))
  const result = ((students ?? []) as StudentRow[]).map(s => {
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
