import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Lightweight list of all parents for the manual-link picker (import students)
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name')
      .order('last_name', { ascending: true })
    if (error) throw error
    const parents = (data ?? []).map(p => ({
      id: p.id,
      name: p.name?.trim() || [p.last_name, p.first_name].filter(Boolean).join(' ').trim() || p.id,
    }))
    return NextResponse.json({ parents })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
