import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const FAR_FUTURE = '2099-12-31T23:59:59.999Z'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

function isCredit(method: string): boolean {
  return (method || '').trim() === 'אשראי'
}

// PATCH — the monthly "pay the card owner" task.
//  - { cardOwnerParentId } sets/updates the owner (without completing).
//  - { done: true, cardOwnerParentId? } completes it: creates ONE aggregate
//    expense transaction to the card owner for the sum of this month's DONE
//    credit runs, with a table breakdown in the notes. Links each contributing
//    credit run to that transaction.
//  - { unpay: true } reverts completion (deletes the aggregate transaction).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const { data: task } = await supabaseAdmin
      .from('card_payment_tasks').select('*').eq('id', id).single()
    if (!task) return NextResponse.json({ error: 'משימה לא נמצאה' }, { status: 404 })

    if (body.unpay) {
      if (task.transaction_id) {
        await supabaseAdmin.from('transactions').delete().eq('id', task.transaction_id)
      }
      await supabaseAdmin.from('card_payment_tasks')
        .update({ status: 'open', transaction_id: null }).eq('id', id)
      return NextResponse.json({ success: true })
    }

    const ownerId = body.cardOwnerParentId ?? task.card_owner_parent_id ?? null

    // Just updating the owner, not completing
    if (!body.done) {
      await supabaseAdmin.from('card_payment_tasks')
        .update({ card_owner_parent_id: ownerId }).eq('id', id)
      return NextResponse.json({ success: true })
    }

    if (!ownerId) return NextResponse.json({ error: 'יש לבחור בעל כרטיס' }, { status: 400 })
    if (task.transaction_id) return NextResponse.json({ success: true, alreadyDone: true })

    // Gather this month's DONE credit runs
    const { data: runs } = await supabaseAdmin
      .from('recurring_payment_runs')
      .select('*')
      .eq('month_year', task.month_year)
      .eq('status', 'done')
    const creditRuns = (runs ?? []).filter(r => isCredit(String(r.payment_method ?? '')))
    const total = creditRuns.reduce((s, r) => s + (Number(r.amount_paid) || 0), 0)

    if (total <= 0) return NextResponse.json({ error: 'אין תשלומי אשראי שסומנו כבוצעו החודש' }, { status: 400 })

    // Table breakdown for the transaction notes
    const rows = creditRuns.map(r => `${r.supplier_name ?? ''} · ${fmt(Number(r.amount_paid) || 0)}`)
    const notes = [
      `תשלום לבעל כרטיס אשראי · ${task.month_year}`,
      `סה"כ ${fmt(total)} (${creditRuns.length} ספקים)`,
      '── פירוט ──',
      ...rows,
    ].join('\n')

    const [m, y] = String(task.month_year ?? '').split('/')
    const lastDay = m && y ? new Date(Number(y), Number(m), 0).getDate() : 1
    const date = m && y ? `${y}-${m}-${String(lastDay).padStart(2, '0')}` : new Date().toISOString().slice(0, 10)

    const txId = crypto.randomUUID()
    const { error: txErr } = await supabaseAdmin.from('transactions').insert({
      id:            txId,
      amount:        -Math.abs(total),
      type:          'אשראי',
      date,
      month_year:    task.month_year ?? '',
      notes,
      parent_ids:    [ownerId],
      project_ids:   [],
      project_names: ['הוצאה'],
      framework:     '',
      synced_at:     FAR_FUTURE,
    })
    if (txErr) throw txErr

    // Link contributing credit runs to the aggregate transaction (audit trail)
    await supabaseAdmin.from('recurring_payment_runs')
      .update({ transaction_id: txId })
      .in('id', creditRuns.map(r => r.id))

    await supabaseAdmin.from('card_payment_tasks')
      .update({ status: 'done', transaction_id: txId, card_owner_parent_id: ownerId })
      .eq('id', id)

    return NextResponse.json({ success: true, transactionId: txId, total })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
