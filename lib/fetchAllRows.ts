import { SupabaseClient } from '@supabase/supabase-js'

// PostgREST silently truncates any plain row-returning SELECT to the
// project's "Max Rows" setting (~1000), no matter how large a LIMIT the
// client asks for. Anything that needs the WHOLE table (parent lists for
// import matching, the manual link selector, etc.) must page through with
// .range() until a short page arrives — otherwise rows that sort past the
// cap (e.g. parents whose names start with late Hebrew letters) silently
// vanish, which is exactly the class of bug this repo keeps hitting.
export async function fetchAllRows<T = Record<string, unknown>>(
  client: SupabaseClient,
  table: string,
  select: string,
  orderColumn = 'id',
): Promise<T[]> {
  const PAGE = 1000
  const all: T[] = []
  for (let from = 0; ; from += PAGE) {
    let query = client
      .from(table)
      .select(select)
      .order(orderColumn, { ascending: true })
    // Secondary tiebreaker keeps paging stable when orderColumn has duplicates
    // (two identical names straddling a page boundary would otherwise be able
    // to swap places between requests, skipping or double-counting a row).
    if (orderColumn !== 'id') query = query.order('id', { ascending: true })
    const { data, error } = await query.range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as T[]
    all.push(...rows)
    if (rows.length < PAGE) break
  }
  return all
}
