import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/projects
 * Returns the distinct list of project names that appear in any transaction.
 * Used to populate project dropdowns throughout the UI.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from('transactions')
      .select('project_names')
      .not('project_names', 'is', null)

    if (error) throw error

    const all = new Set<string>()
    for (const row of data ?? []) {
      for (const raw of (row.project_names as string[]) ?? []) {
        const name = raw === 'משכורות' ? 'משכורת' : raw
        if (name) all.add(name)
      }
    }

    // Sort: בנין לדורות first, then alphabetically
    const sorted = [...all].sort((a, b) => {
      if (a === 'בנין לדורות') return -1
      if (b === 'בנין לדורות') return 1
      return a.localeCompare(b, 'he')
    })

    return NextResponse.json(sorted)
  } catch (err) {
    console.error('projects GET error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
