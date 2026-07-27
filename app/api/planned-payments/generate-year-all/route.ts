import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Guard against a double-click racing two generations past the "already exists"
// check (which is what created the duplicate PPs). Time-based so it can NEVER
// stick permanently: if a run is killed mid-way (e.g. a timeout) and the
// `finally` never runs, the lock auto-expires and generation works again.
let generateLockUntil = 0
const GENERATE_LOCK_MS = 120_000

/**
 * Load every existing PP in the given months, PAGINATED.
 * PostgREST caps a single response at ~1000 rows, so an unpaginated select
 * silently truncated the "already exists" set — parents whose PPs fell outside
 * the first page looked like they had none, and generation created DUPLICATES
 * for them. Paginating is what makes the existence check trustworthy.
 */
async function loadExistingKeys(monthYears: string[]): Promise<Set<string>> {
  const keys = new Set<string>()
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('planned_payments')
      .select('parent_ids, month_year, pp_type')
      .in('month_year', monthYears)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = data ?? []
    for (const pp of rows) {
      // Only a TUITION PP means "this month is covered". Counting every type
      // made a parent who merely had a מגבית/משכורת PP that month look covered,
      // so their missing שכ"ל was skipped and nothing got created for them.
      // Empty pp_type = legacy Airtable rows, which are tuition.
      const t = (pp.pp_type as string | null) ?? ''
      if (t !== '' && t !== 'tuition') continue
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        keys.add(`${pid}|${pp.month_year}`)
      }
    }
    if (rows.length < PAGE) break
  }
  return keys
}

/** All parents that owe tuition, paginated (same ~1000-row cap applies). */
async function loadTuitionParents(): Promise<{ id: string; name?: string; tuition_total: number }[]> {
  const out: { id: string; name?: string; tuition_total: number }[] = []
  const PAGE = 1000
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseAdmin
      .from('parents')
      .select('id, name, tuition_total')
      .gt('tuition_total', 0)
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1)
    if (error) throw error
    const rows = (data ?? []) as { id: string; name?: string; tuition_total: number }[]
    out.push(...rows)
    if (rows.length < PAGE) break
  }
  return out
}

function getFullHebrewYearMonths(): { monthYear: string; date: string }[] {
  const today    = new Date()
  const curMonth = today.getMonth() + 1
  const curYear  = today.getFullYear()

  const startYear = curMonth >= 9 ? curYear : curYear - 1
  const endYear   = startYear + 1

  const months: { monthYear: string; date: string }[] = []
  let m = 9, y = startYear
  while (true) {
    const mm = String(m).padStart(2, '0')
    months.push({ monthYear: `${mm}/${y}`, date: `${y}-${mm}-01` })
    if (m === 8 && y === endYear) break
    if (++m > 12) { m = 1; y++ }
  }
  return months
}

/** Returns current-month and all future months from the Hebrew year */
function getFutureHebrewYearMonths(): { monthYear: string; date: string }[] {
  const today = new Date()
  const year = today.getFullYear()
  const month = String(today.getMonth() + 1).padStart(2, '0')
  const day = String(today.getDate()).padStart(2, '0')
  // Use today's actual date for cutoff, not just month 1st
  const currentDateStr = `${year}-${month}-${day}`

  // Include current month and all future months (compare with actual date)
  const allMonths = getFullHebrewYearMonths()
  return allMonths.filter(m => {
    // m.date is "YYYY-MM-01", so we need to check if the month is current or future
    // If month > current month, include it
    // If month == current month, include it (current month)
    // If month < current month, exclude it (past month)
    const monthOnly = m.date.substring(0, 7)  // "YYYY-MM"
    const currentMonthOnly = currentDateStr.substring(0, 7)  // "YYYY-MM"
    return monthOnly >= currentMonthOnly
  })
}

/** GET — preview: returns what would be created without committing */
export async function GET(req: NextRequest) {
  try {
    const futureOnly = req.nextUrl.searchParams.get('futureOnly') === '1'
    const singleMonth = req.nextUrl.searchParams.get('month')

    let months: { monthYear: string; date: string }[]
    if (singleMonth) {
      const [m, y] = singleMonth.split('/').map(Number)
      const mm = String(m).padStart(2, '0')
      months = [{ monthYear: `${mm}/${y}`, date: `${y}-${mm}-01` }]
    } else {
      months = futureOnly ? getFutureHebrewYearMonths() : getFullHebrewYearMonths()
    }
    const monthYears = months.map(m => m.monthYear)

    // Get all parents that have tuition (i.e. active children)
    const { data: parents } = await supabaseAdmin
      .from('parents')
      .select('id, name, tuition_total')
      .gt('tuition_total', 0)

    if (!parents || parents.length === 0) {
      return NextResponse.json({ parents: [], totalToCreate: 0, months: monthYears })
    }

    // For each parent find which months already have a PP
    const parentIds = parents.map(p => p.id)

    // Set of "parentId|monthYear" that already exist (paginated — see helper)
    const existingSet = await loadExistingKeys(monthYears)

    const preview = parents
      .map(p => {
        const toCreate = monthYears.filter(my => !existingSet.has(`${p.id}|${my}`))
        const toSkip   = monthYears.filter(my =>  existingSet.has(`${p.id}|${my}`))
        return {
          id:       p.id,
          name:     p.name ?? '',
          amount:   Number(p.tuition_total) || 0,
          toCreate,
          toSkip,
        }
      })
      .filter(p => p.toCreate.length > 0)  // only parents that need work

    const totalToCreate = preview.reduce((s, p) => s + p.toCreate.length, 0)

    return NextResponse.json({ parents: preview, totalToCreate, months: monthYears })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}

/** POST — execute: create all missing planned payments */
export async function POST(req: NextRequest) {
  if (Date.now() < generateLockUntil) {
    return NextResponse.json({ error: 'יצירת תשלומים כבר רצה — נסה שוב בעוד רגע' }, { status: 429 })
  }
  generateLockUntil = Date.now() + GENERATE_LOCK_MS
  try {
    const body = await req.json().catch(() => ({}))
    const futureOnly = body?.futureOnly === true
    // Single-month mode: create ONLY the chosen month (was previously ignored,
    // so choosing "06/2026" wrongly generated the whole future year).
    const singleMonth = typeof body?.month === 'string' && body.month.trim() ? body.month.trim() : null
    let months: { monthYear: string; date: string }[]
    if (singleMonth) {
      const [m, y] = singleMonth.split('/').map(Number)
      const mm = String(m).padStart(2, '0')
      months = [{ monthYear: `${mm}/${y}`, date: `${y}-${mm}-01` }]
    } else {
      months = futureOnly ? getFutureHebrewYearMonths() : getFullHebrewYearMonths()
    }
    const monthYears = months.map(m => m.monthYear)

    const parents = await loadTuitionParents()

    if (!parents || parents.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0 })
    }

    const existingSet = await loadExistingKeys(monthYears)

    let created = 0
    let skipped = 0

    // Collect every missing row, then BULK-insert in chunks — one round-trip per
    // ~500 rows instead of per row. Inserting one at a time for all parents ×
    // months was slow enough to hit the function timeout on a full-year run.
    const toInsert: Record<string, unknown>[] = []
    for (const parent of parents) {
      const amount = Number(parent.tuition_total) || 0
      if (!amount) continue
      for (const { monthYear, date } of months) {
        if (existingSet.has(`${parent.id}|${monthYear}`)) { skipped++; continue }
        // Guard against the same (parent, month) appearing twice within this run.
        existingSet.add(`${parent.id}|${monthYear}`)
        toInsert.push({
          id:         crypto.randomUUID(),
          name:       'שכ"ל',
          pp_type:    'tuition',
          amount,
          balance:    amount,
          date,
          month_year: monthYear,
          parent_ids: [parent.id],
          synced_at:  '2099-12-31T23:59:59.999Z',
        })
      }
    }

    const CHUNK = 500
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK)
      const { error } = await supabaseAdmin.from('planned_payments').insert(chunk)
      if (error) {
        // Salvage the chunk row-by-row so one bad row doesn't drop the rest.
        for (const row of chunk) {
          const { error: e } = await supabaseAdmin.from('planned_payments').insert(row)
          if (!e) created++
          else console.error('generate-year-all insert error:', row.parent_ids, row.month_year, e.message)
        }
      } else {
        created += chunk.length
      }
    }

    return NextResponse.json({ created, skipped })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  } finally {
    generateLockUntil = 0
  }
}
