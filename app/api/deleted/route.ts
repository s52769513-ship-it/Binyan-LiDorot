import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {

    const url = new URL(req.url)
    const type = url.searchParams.get('type') || null
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    let query = supabaseAdmin
      .from('deleted_records')
      .select('*', { count: 'exact' })
      .order('deleted_at', { ascending: false })

    if (type) {
      query = query.eq('record_type', type)
    }

    const { data, count, error } = await query.range(offset, offset + limit - 1)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({
      data: data || [],
      total: count || 0,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
