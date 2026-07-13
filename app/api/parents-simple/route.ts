import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'

export async function GET(_req: NextRequest) {
  try {
    // Paged fetch — a plain SELECT gets capped by PostgREST at ~1000 rows,
    // which made parents sorting past the cap (late-alphabet names like
    // שטיינמעטץ) invisible to the manual link selector.
    const data = await fetchAllRows(supabaseAdmin, 'parents', 'id, name, city', 'name')
    return NextResponse.json(data)
  } catch (err) {
    console.error('Error fetching parents:', err)
    return NextResponse.json({ error: 'Failed to fetch parents' }, { status: 500 })
  }
}
