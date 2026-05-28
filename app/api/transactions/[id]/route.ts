import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { data, error } = await supabaseAdmin
    .from('transactions').select('*').eq('id', id).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 404 })
  return NextResponse.json(data)
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const allowed = ['amount', 'type', 'date', 'month_year', 'notes']
    const update: Record<string, unknown> = {}
    for (const key of allowed) {
      if (key in body) update[key] = body[key]
    }

    // If amount is changing, adjust the linked planned payment's balance
    if ('amount' in body) {
      const { data: oldTx } = await supabaseAdmin
        .from('transactions')
        .select('amount, planned_payment_id')
        .eq('id', id)
        .single()
      if (oldTx?.planned_payment_id) {
        const oldAmt = Math.abs(Number(oldTx.amount))
        const newAmt = Math.abs(Number(body.amount))
        const diff   = newAmt - oldAmt   // positive = paid more → balance drops more
        const { data: pp } = await supabaseAdmin
          .from('planned_payments')
          .select('balance, amount')
          .eq('id', oldTx.planned_payment_id)
          .single()
        if (pp) {
          const newBal = Math.min(pp.amount, Math.max(0, (pp.balance ?? 0) - diff))
          await supabaseAdmin
            .from('planned_payments')
            .update({ balance: newBal })
            .eq('id', oldTx.planned_payment_id)
        }
      }
    }

    const { error } = await supabaseAdmin.from('transactions').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Restore planned payment balance before deleting
    const { data: tx } = await supabaseAdmin
      .from('transactions')
      .select('amount, planned_payment_id')
      .eq('id', id)
      .single()

    if (tx?.planned_payment_id) {
      const { data: pp } = await supabaseAdmin
        .from('planned_payments')
        .select('balance, amount')
        .eq('id', tx.planned_payment_id)
        .single()
      if (pp) {
        const restored = Math.min(pp.amount, (pp.balance ?? 0) + Math.abs(Number(tx.amount)))
        await supabaseAdmin
          .from('planned_payments')
          .update({ balance: restored })
          .eq('id', tx.planned_payment_id)
      }
    }

    const { error } = await supabaseAdmin.from('transactions').delete().eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: (err as { message?: string })?.message ?? String(err) }, { status: 500 })
  }
}
