import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

// Normalize a payment method into one of the KPI buckets.
function methodBucket(method: string): 'credit' | 'hok' | 'transfer' | 'cash' | 'other' {
  const m = (method || '').trim()
  if (m === 'אשראי') return 'credit'
  if (m === 'הו"ק' || m === 'הוק') return 'hok'
  if (m === 'העברה' || m === 'העברה בנקאית') return 'transfer'
  if (m === 'מזומן') return 'cash'
  return 'other'
}

function mapRun(r: Record<string, unknown>) {
  return {
    id:                 String(r.id),
    recurringPaymentId: r.recurring_payment_id ?? null,
    parentId:           (r.parent_id as string) ?? null,
    supplierName:       String(r.supplier_name ?? ''),
    monthYear:          String(r.month_year ?? ''),
    dueDate:            String(r.due_date ?? ''),
    amountDue:          Number(r.amount_due) || 0,
    amountPaid:         Number(r.amount_paid) || 0,
    paymentMethod:      String(r.payment_method ?? ''),
    bank:               String(r.bank ?? ''),
    status:             String(r.status ?? 'open'),
    transactionId:      (r.transaction_id as string) ?? null,
  }
}

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month') || currentMY()
    const { data, error } = await supabaseAdmin
      .from('recurring_payment_runs')
      .select('*')
      .eq('month_year', month)
      .order('due_date', { ascending: true })
    if (error) throw error
    const runs = (data ?? []).map(mapRun)

    // KPI summary by payment method (based on amount_due of the month's runs)
    const summary = {
      total:    0,
      credit:   0,
      hok:      0,
      transfer: 0,
      cash:     0,
      other:    0,
      month,
    }
    for (const r of runs) {
      const bucket = methodBucket(r.paymentMethod)
      summary.total += r.amountDue
      summary[bucket] += r.amountDue
    }

    // Card task for this month (+ live credit total = done credit runs)
    const { data: task } = await supabaseAdmin
      .from('card_payment_tasks')
      .select('*')
      .eq('month_year', month)
      .maybeSingle()

    let cardOwnerName = ''
    if (task?.card_owner_parent_id) {
      const { data: owner } = await supabaseAdmin
        .from('parents').select('name').eq('id', task.card_owner_parent_id).maybeSingle()
      cardOwnerName = (owner?.name as string) ?? ''
    }
    const creditDoneTotal = runs
      .filter(r => methodBucket(r.paymentMethod) === 'credit' && r.status === 'done')
      .reduce((s, r) => s + r.amountPaid, 0)

    const cardTask = task ? {
      id:                 task.id,
      monthYear:          task.month_year,
      cardOwnerParentId:  task.card_owner_parent_id ?? null,
      cardOwnerName,
      status:             task.status ?? 'open',
      transactionId:      task.transaction_id ?? null,
      creditDoneTotal,
    } : null

    return NextResponse.json({ runs, summary, cardTask })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
