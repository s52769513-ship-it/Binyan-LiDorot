import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { fetchAllRows } from '@/lib/fetchAllRows'

// Lightweight list of all parents for the manual-link picker (import students)
export async function GET() {
  try {
    // Paged fetch — a plain SELECT is capped by PostgREST at ~1000 rows,
    // silently hiding parents sorting past the cap from the picker.
    const data = await fetchAllRows<{ id: string; name: string | null; first_name: string | null; last_name: string | null }>(
      supabaseAdmin, 'parents', 'id, name, first_name, last_name', 'last_name')
    const parents = data.map(p => ({
      id: p.id,
      name: p.name?.trim() || [p.last_name, p.first_name].filter(Boolean).join(' ').trim() || p.id,
    }))
    return NextResponse.json({ parents })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
