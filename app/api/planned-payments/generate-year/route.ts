import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcPPs } from '@/app/api/parents/[id]/recalc-pp/route'

/** Returns all months of the current Hebrew year (Tishrei–Elul ≈ Sep–Aug) */
function getFullHebrewYearMonths(): { monthYear: string; date: string }[] {
  const today    = new Date()
  const curMonth = today.getMonth() + 1  // 1-12
  const curYear  = today.getFullYear()

  // Hebrew year starts in September (9).
  // If current month >= 9, the Hebrew year started this September.
  // If current month < 9, the Hebrew year started last September.
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

export async function POST(req: NextRequest) {
  try {
    const { parentId, amount, name } = await req.json()
    if (!parentId) return NextResponse.json({ error: 'חסר parentId' }, { status: 400 })
    if (!amount || isNaN(Number(amount)) || Number(amount) <= 0)
      return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })

    const months       = getFullHebrewYearMonths()
    const monthYears   = months.map(m => m.monthYear)

    // Find which months already have a planned payment for this parent
    const { data: existing } = await supabaseAdmin
      .from('planned_payments')
      .select('month_year')
      .contains('parent_ids', [parentId])
      .in('month_year', monthYears)

    const existingSet = new Set((existing ?? []).map(p => p.month_year as string))

    const created: string[] = []
    const skipped: string[] = []

    for (const { monthYear, date } of months) {
      if (existingSet.has(monthYear)) {
        skipped.push(monthYear)
        continue
      }

      const { error } = await supabaseAdmin.from('planned_payments').insert({
        id:         crypto.randomUUID(),
        name:       name || 'שכ"ל',
        amount:     Number(amount),
        balance:    Number(amount),
        date,
        month_year: monthYear,
        parent_ids: [parentId],
        synced_at:  '2099-12-31T23:59:59.999Z',
      })

      if (error) {
        console.error('generate-year insert error:', monthYear, error.message)
      } else {
        created.push(monthYear)
      }
    }

    if (created.length > 0) {
      void recalcPPs(parentId).catch(() => {})
    }

    return NextResponse.json({ created, skipped })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}
