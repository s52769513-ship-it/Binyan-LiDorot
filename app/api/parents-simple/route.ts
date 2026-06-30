import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(_req: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin
      .from('parents')
      .select('id, name')
      .order('name', { ascending: true })

    if (error) throw error
    return NextResponse.json(data || [])
  } catch (err) {
    console.error('Error fetching parents:', err)
    return NextResponse.json({ error: 'Failed to fetch parents' }, { status: 500 })
  }
}
