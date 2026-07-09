import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { ids } = await req.json()

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 })
    }

    // Delete in chunks to avoid URL length limits
    const CHUNK = 100
    let deleted = 0
    for (let i = 0; i < ids.length; i += CHUNK) {
      const { error, count } = await supabaseAdmin
        .from('transactions')
        .delete()
        .in('id', ids.slice(i, i + CHUNK))
      if (error) throw error
      deleted += count ?? 0
    }

    return NextResponse.json({ success: true, deleted })
  } catch (err) {
    const message = (err as { message?: string })?.message ?? String(err)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
