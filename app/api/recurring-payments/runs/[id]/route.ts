import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const FAR_FUTURE = '2099-12-31T23:59:59.999Z'

function isCredit(method: string): boolean {
  return (method || '').trim() === 'אשראי'
}

// PATCH — mark a run paid (fully or partially).
// Body: { amountPaid?: number, unpay?: boolean }
// Non-credit runs create/remove a real expense transaction; credit runs never
// create a transaction here (they roll up into the monthly card-payment task).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))

    const { data: run } = await supabaseAdmin
      .from('recurring_payment_runs').select('*').eq('id', id).single()
    if (!run) return NextResponse.json({ error: 'הרצה לא נמצאה' }, { status: 404 })

    // Undo a payment: delete any linked transaction, reset to open.
    if (body.unpay) {
      if (run.transaction_id) {
        await supabaseAdmin.from('transactions').delete().eq('id', run.transaction_id)
      }
      await supabaseAdmin.from('recurring_payment_runs')
        .update({ amount_paid: 0, status: 'open', transaction_id: null })
        .eq('id', id)
      return NextResponse.json({ success: true })
    }

    const amountDue  = Number(run.amount_due) || 0
    const amountPaid = body.amountPaid != null ? Number(body.amountPaid) : amountDue
    const status     = amountPaid >= amountDue && amountPaid > 0 ? 'done' : 'open'
    const credit     = isCredit(String(run.payment_method ?? ''))

    let transactionId: string | null = (run.transaction_id as string) ?? null

    // Non-credit: create the real expense transaction (once). Amount is
    // negative (an expense). Credit runs skip this — the aggregate card payment
    // records the cash-out instead.
    if (!credit && amountPaid > 0 && !transactionId) {
      const txId = crypto.randomUUID()
      const [m, y] = String(run.month_year ?? '').split('/')
      const date   = (run.due_date as string) || (m && y ? `${y}-${m}-01` : new Date().toISOString().slice(0, 10))
      const { error: txErr } = await supabaseAdmin.from('transactions').insert({
        id:            txId,
        amount:        -Math.abs(amountPaid),
        type:          String(run.payment_method ?? '') || 'אחר',
        date,
        month_year:    run.month_year ?? '',
        notes:         `תשלום קבוע: ${run.supplier_name ?? ''}${run.bank ? ` · ${run.bank}` : ''}`,
        parent_ids:    run.parent_id ? [run.parent_id] : [],
        project_ids:   [],
        project_names: ['הוצאה'],
        framework:     '',
        synced_at:     FAR_FUTURE,
      })
      if (txErr) throw txErr
      transactionId = txId
    }

    await supabaseAdmin.from('recurring_payment_runs')
      .update({ amount_paid: amountPaid, status, transaction_id: transactionId })
      .eq('id', id)

    return NextResponse.json({ success: true, transactionId })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
