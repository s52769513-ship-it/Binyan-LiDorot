import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcTuitionForParent } from '@/lib/recalcTuition'

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

/** Returns only current-month and future months from the Hebrew year */
function getFutureHebrewYearMonths(): { monthYear: string; date: string }[] {
  const today = new Date()
  const currentMonthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  return getFullHebrewYearMonths().filter(m => m.date >= currentMonthDate)
}

/** GET — preview: returns what would be created without committing */
export async function GET(req: NextRequest) {
  try {
    const futureOnly = req.nextUrl.searchParams.get('futureOnly') === '1'
    const months    = futureOnly ? getFutureHebrewYearMonths() : getFullHebrewYearMonths()
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

    // Fetch all existing PPs in those months for any of these parents
    const { data: existing } = await supabaseAdmin
      .from('planned_payments')
      .select('parent_ids, month_year')
      .in('month_year', monthYears)

    // Build set of "parentId|monthYear" that already exist
    const existingSet = new Set<string>()
    for (const pp of existing ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        existingSet.add(`${pid}|${pp.month_year}`)
      }
    }

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
  try {
    const body = await req.json().catch(() => ({}))
    const futureOnly = body?.futureOnly === true
    const months     = futureOnly ? getFutureHebrewYearMonths() : getFullHebrewYearMonths()
    const monthYears = months.map(m => m.monthYear)

    const { data: parents } = await supabaseAdmin
      .from('parents')
      .select('id, tuition_total')
      .gt('tuition_total', 0)

    if (!parents || parents.length === 0) {
      return NextResponse.json({ created: 0, skipped: 0 })
    }

    const { data: existing } = await supabaseAdmin
      .from('planned_payments')
      .select('parent_ids, month_year')
      .in('month_year', monthYears)

    const existingSet = new Set<string>()
    for (const pp of existing ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        existingSet.add(`${pid}|${pp.month_year}`)
      }
    }

    let created = 0
    let skipped = 0

    const parentsWithNewPPs: string[] = []

    for (const parent of parents) {
      const amount = Number(parent.tuition_total) || 0
      if (!amount) continue

      let parentCreated = 0
      for (const { monthYear, date } of months) {
        if (existingSet.has(`${parent.id}|${monthYear}`)) {
          skipped++
          continue
        }
        const { error } = await supabaseAdmin.from('planned_payments').insert({
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
        if (error) {
          console.error('generate-year-all insert error:', parent.id, monthYear, error.message)
        } else {
          created++
          parentCreated++
        }
      }
      if (parentCreated > 0) parentsWithNewPPs.push(parent.id)
    }

    for (const pid of parentsWithNewPPs) {
      await recalcTuitionForParent(pid)
    }

    return NextResponse.json({ created, skipped })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}
