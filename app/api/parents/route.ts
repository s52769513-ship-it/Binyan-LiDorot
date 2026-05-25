import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET() {
  try {
    const { data, error } = await supabase
      .from('parents')
      .select(
        'id, name, first_name, last_name, father_phone, mother_phone, email, city, status, children_count, tuition_total, tuition_balance'
      )
      .order('last_name', { ascending: true })

    if (error) throw error

    return NextResponse.json(data ?? [])
  } catch (err) {
    console.error('parents error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת הורים' }, { status: 500 })
  }
}
