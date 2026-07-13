import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET /api/projects
 * Returns the distinct list of project names that appear in any transaction.
 * Used to populate project dropdowns throughout the UI.
 *
 * Computed via the transactions_filter_options() DB function (see
 * TRANSACTIONS_FILTER_OPTIONS_RPC.sql) rather than a plain SELECT: PostgREST
 * silently caps a plain row-returning SELECT at the project's row limit
 * (~1000), so a category whose transactions all fell outside that sample
 * (e.g. "מזומנים") would silently disappear from this dropdown. Falls back
 * to the old capped query if the RPC hasn't been migrated yet.
 */
export async function GET() {
  try {
    const normalize = (raw: string) => {
      if (raw === 'משכורות') return 'משכורת'
      if (raw === 'בנין לדורות') return 'בניין לדורות'
      return raw
    }

    const all = new Set<string>()

    const { data: optData, error: optError } = await supabaseAdmin.rpc('transactions_filter_options')
    if (!optError && optData) {
      const opt = Array.isArray(optData) ? optData[0] : optData
      for (const raw of (opt?.projects as string[]) ?? []) {
        const name = normalize(raw)
        if (name) all.add(name)
      }
    } else {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('project_names')
        .not('project_names', 'is', null)

      if (error) throw error

      for (const row of data ?? []) {
        for (const raw of (row.project_names as string[]) ?? []) {
          const name = normalize(raw)
          if (name) all.add(name)
        }
      }
    }

    // Sort: בניין לדורות first, then alphabetically
    const sorted = [...all].sort((a, b) => {
      if (a === 'בניין לדורות') return -1
      if (b === 'בניין לדורות') return 1
      return a.localeCompare(b, 'he')
    })

    return NextResponse.json(sorted)
  } catch (err) {
    console.error('projects GET error:', err)
    return NextResponse.json([], { status: 500 })
  }
}
