import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST() {
  try {
    // Find all parents with no active children
    const { data: parents } = await supabaseAdmin
      .from('parents')
      .select('id')
      .eq('children_count', 0)

    if (!parents || parents.length === 0) {
      return NextResponse.json({ cleaned: 0, message: 'No parents with zero children' })
    }

    let deletedCount = 0

    // For each parent with no children, delete all their tuition PPs
    for (const parent of parents) {
      const { data: pps } = await supabaseAdmin
        .from('planned_payments')
        .select('id')
        .contains('parent_ids', [parent.id])
        .eq('pp_type', 'tuition')

      for (const pp of pps ?? []) {
        // Delete linked transactions first
        await supabaseAdmin
          .from('transactions')
          .delete()
          .eq('planned_payment_id', pp.id)

        // Delete the PP
        await supabaseAdmin
          .from('planned_payments')
          .delete()
          .eq('id', pp.id)

        deletedCount++
      }
    }

    return NextResponse.json({ cleaned: deletedCount, message: `Cleaned ${deletedCount} PPs` })
  } catch (err) {
    console.error('cleanup error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
