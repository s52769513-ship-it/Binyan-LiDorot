import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

// Global "open tasks" aggregator for the nav bell.
// Open = recurring payment runs not fully paid + card-payment tasks not done.
// Each item carries the full data needed to open its edit card in place.
export async function GET() {
  try {
    const { data: runs } = await supabaseAdmin
      .from('recurring_payment_runs')
      .select('id, supplier_name, month_year, due_date, amount_due, amount_paid, payment_method, bank, status')
      .neq('status', 'done')
      .order('due_date', { ascending: true })

    const { data: cardTasks } = await supabaseAdmin
      .from('card_payment_tasks')
      .select('id, month_year, card_owner_parent_id, status')
      .neq('status', 'done')
      .order('month_year', { ascending: true })

    const runTasks = (runs ?? []).map(r => ({
      kind:      'run' as const,
      id:        String(r.id),
      title:     `תשלום קבוע: ${r.supplier_name ?? ''}`,
      subtitle:  `${r.month_year ?? ''} · ${Number(r.amount_due) || 0} ₪`,
      monthYear: String(r.month_year ?? ''),
      run: {
        id:            String(r.id),
        supplierName:  String(r.supplier_name ?? ''),
        monthYear:     String(r.month_year ?? ''),
        amountDue:     Number(r.amount_due) || 0,
        amountPaid:    Number(r.amount_paid) || 0,
        paymentMethod: String(r.payment_method ?? ''),
        status:        String(r.status ?? 'open'),
      },
    }))

    // Only surface card tasks that actually have done credit runs to pay.
    const cardTaskItems: {
      kind: 'card'; id: string; title: string; subtitle: string; monthYear: string
      card: { id: string; monthYear: string; cardOwnerParentId: string | null; cardOwnerName: string; status: string; creditDoneTotal: number }
    }[] = []
    for (const t of cardTasks ?? []) {
      const { data: creditRuns } = await supabaseAdmin
        .from('recurring_payment_runs')
        .select('amount_paid')
        .eq('month_year', t.month_year)
        .eq('status', 'done')
        .eq('payment_method', 'אשראי')
      const total = (creditRuns ?? []).reduce((s, r) => s + (Number(r.amount_paid) || 0), 0)
      if (total > 0) {
        let cardOwnerName = ''
        if (t.card_owner_parent_id) {
          const { data: owner } = await supabaseAdmin
            .from('parents').select('name').eq('id', t.card_owner_parent_id).maybeSingle()
          cardOwnerName = (owner?.name as string) ?? ''
        }
        cardTaskItems.push({
          kind:      'card',
          id:        String(t.id),
          title:     `לשלם לבעל הכרטיס`,
          subtitle:  `${t.month_year ?? ''} · ${total} ₪`,
          monthYear: String(t.month_year ?? ''),
          card: {
            id:                String(t.id),
            monthYear:         String(t.month_year ?? ''),
            cardOwnerParentId: (t.card_owner_parent_id as string) ?? null,
            cardOwnerName,
            status:            String(t.status ?? 'open'),
            creditDoneTotal:   total,
          },
        })
      }
    }

    const tasks = [...runTasks, ...cardTaskItems]
    return NextResponse.json({ openCount: tasks.length, tasks })
  } catch (err) {
    return NextResponse.json({ openCount: 0, tasks: [], error: String(err) }, { status: 200 })
  }
}
