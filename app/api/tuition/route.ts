import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const month = searchParams.get('month') ?? ''

    // Fetch planned payments with their parent info
    let ppQuery = supabaseAdmin
      .from('planned_payments')
      .select('id, parent_ids, name, amount, date, month_year, balance')
      .order('date', { ascending: false })

    if (month) {
      ppQuery = ppQuery.eq('month_year', month)
    }

    const { data: ppRaw, error: ppError } = await ppQuery
    if (ppError) throw ppError
    // Chronological order, newest first (text sort of "MM/YYYY" breaks across years)
    const ppData = sortByMonth(ppRaw ?? [], false)

    // Gather unique parent IDs to fetch names
    const allParentIds = Array.from(
      new Set((ppData ?? []).flatMap(p => Array.isArray(p.parent_ids) ? p.parent_ids : []))
    )

    let parentMap: Record<string, string> = {}
    if (allParentIds.length > 0) {
      const { data: parentsData } = await supabaseAdmin
        .from('parents')
        .select('id, name')
        .in('id', allParentIds)
      ;(parentsData ?? []).forEach(p => { parentMap[p.id] = p.name ?? '' })
    }

    const rows = (ppData ?? []).map(p => {
      const parentNames = (Array.isArray(p.parent_ids) ? p.parent_ids : [])
        .map((id: string) => parentMap[id] ?? '')
        .filter(Boolean)
        .join(', ')
      const amount   = Number(p.amount)  || 0
      const balance  = Number(p.balance) || 0
      const paid     = amount - balance
      const status   = balance <= 0 ? 'שולם' : paid > 0 ? 'חלקי' : 'ממתין'
      const parentIds = Array.isArray(p.parent_ids) ? p.parent_ids : []
      return {
        id: p.id,
        parentId: parentIds[0] ?? '',
        parentName: parentNames || p.name || '—',
        paymentName: p.name ?? '',
        amount,
        paid: Math.max(0, paid),
        balance,
        monthYear: p.month_year ?? '',
        date: p.date ?? '',
        status,
      }
    })

    // Summary totals (across all months, or filtered)
    const totalAmount    = rows.reduce((s, r) => s + r.amount,  0)
    const totalPaid      = rows.reduce((s, r) => s + r.paid,    0)
    const totalRemaining = rows.reduce((s, r) => s + Math.max(0, r.balance), 0)

    // Distinct months for filter dropdown
    const { data: allPP } = await supabaseAdmin
      .from('planned_payments')
      .select('month_year')
    const months = Array.from(
      new Set((allPP ?? []).map(p => p.month_year).filter(Boolean))
    ).sort((a, b) => {
      // Sort MM/YYYY descending
      const [am, ay] = a.split('/').map(Number)
      const [bm, by] = b.split('/').map(Number)
      return by !== ay ? by - ay : bm - am
    })

    return NextResponse.json({
      rows,
      summary: {
        totalAmount:    Math.round(totalAmount),
        totalPaid:      Math.round(totalPaid),
        totalRemaining: Math.round(totalRemaining),
      },
      months,
    })
  } catch (err) {
    console.error('tuition error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת שכר לימוד' }, { status: 500 })
  }
}
