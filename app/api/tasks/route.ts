import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Global "open tasks" aggregator for the nav bell.
// Open = recurring payment runs not fully paid + card-payment tasks not done.
export async function GET() {
  try {
    const { data: runs } = await supabaseAdmin
      .from('recurring_payment_runs')
      .select('id, supplier_name, month_year, due_date, amount_due, amount_paid, payment_method, status')
      .neq('status', 'done')
      .order('due_date', { ascending: true })

    const { data: cardTasks } = await supabaseAdmin
      .from('card_payment_tasks')
      .select('id, month_year, status')
      .neq('status', 'done')
      .order('month_year', { ascending: true })

    const runTasks = (runs ?? []).map(r => ({
      kind:      'run' as const,
      id:        r.id,
      title:     `תשלום קבוע: ${r.supplier_name ?? ''}`,
      subtitle:  `${r.month_year ?? ''} · ${Number(r.amount_due) || 0} ₪`,
      monthYear: r.month_year ?? '',
    }))

    // Only surface card tasks that actually have done credit runs to pay.
    const cardTaskItems: { kind: 'card'; id: string; title: string; subtitle: string; monthYear: string }[] = []
    for (const t of cardTasks ?? []) {
      const { data: creditRuns } = await supabaseAdmin
        .from('recurring_payment_runs')
        .select('amount_paid')
        .eq('month_year', t.month_year)
        .eq('status', 'done')
        .eq('payment_method', 'אשראי')
      const total = (creditRuns ?? []).reduce((s, r) => s + (Number(r.amount_paid) || 0), 0)
      if (total > 0) {
        cardTaskItems.push({
          kind:      'card',
          id:        t.id,
          title:     `לשלם לבעל הכרטיס`,
          subtitle:  `${t.month_year ?? ''} · ${total} ₪`,
          monthYear: t.month_year ?? '',
        })
      }
    }

    const tasks = [...runTasks, ...cardTaskItems]
    return NextResponse.json({ openCount: tasks.length, tasks })
  } catch (err) {
    return NextResponse.json({ openCount: 0, tasks: [], error: String(err) }, { status: 200 })
  }
}
