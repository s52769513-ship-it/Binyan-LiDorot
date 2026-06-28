import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { beforeMonth, execute } = body

    if (!beforeMonth) {
      return NextResponse.json({ error: 'חסר חודש' }, { status: 400 })
    }

    // Parse beforeMonth as MM/YYYY
    const [beforeM, beforeY] = beforeMonth.split('/').map(Number)
    if (!beforeM || !beforeY) {
      return NextResponse.json({ error: 'פורמט חודש שגוי' }, { status: 400 })
    }
    const beforeMonthNum = beforeY * 100 + beforeM

    // Fetch all tuition PPs
    const { data: allPPs, error: fetchError } = await supabaseAdmin
      .from('planned_payments')
      .select('id, name, pp_type, amount, balance, date, month_year, parent_ids')
      .eq('pp_type', 'tuition')
      .limit(1000)

    if (fetchError) {
      return NextResponse.json({ error: 'שגיאה בטעינת נתונים' }, { status: 500 })
    }

    // Filter PPs before the specified month
    const toDelete = (allPPs ?? []).filter(pp => {
      if (!pp.month_year) return false
      const [m, y] = pp.month_year.split('/').map(Number)
      const monthNum = y * 100 + m
      return monthNum < beforeMonthNum
    })

    if (toDelete.length === 0) {
      return NextResponse.json({ toDelete: [], deleted: 0, failed: 0 })
    }

    // If not executing, just return preview
    if (!execute) {
      return NextResponse.json({
        toDelete: toDelete.map(pp => ({
          name: pp.name,
          parentIds: pp.parent_ids,
          monthYear: pp.month_year,
          amount: pp.amount,
        })),
        deleted: 0,
        failed: 0,
      })
    }

    // Delete transactions and PPs
    let deleted = 0
    let failed = 0

    for (const pp of toDelete) {
      try {
        // Delete linked transactions first
        await supabaseAdmin
          .from('transactions')
          .delete()
          .eq('planned_payment_id', pp.id)

        // Delete the PP
        const { error: deleteError } = await supabaseAdmin
          .from('planned_payments')
          .delete()
          .eq('id', pp.id)

        if (deleteError) {
          console.error(`Failed to delete ${pp.id}:`, deleteError.message)
          failed++
        } else {
          deleted++
        }
      } catch (err) {
        console.error(`Error deleting ${pp.id}:`, err)
        failed++
      }
    }

    return NextResponse.json({
      toDelete: [],
      deleted,
      failed,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}
