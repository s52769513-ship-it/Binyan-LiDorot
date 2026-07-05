import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { isCashFundTransaction } from '@/lib/cashFund'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const sourceTransactionId = String(body.sourceTransactionId || '')
    if (!sourceTransactionId)
      return NextResponse.json({ error: 'sourceTransactionId required' }, { status: 400 })

    const { data: tx, error: txError } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, date, notes, project_names')
      .eq('id', sourceTransactionId)
      .single()
    if (txError || !tx)
      return NextResponse.json({ error: 'התנועה לא נמצאה' }, { status: 404 })

    if (!isCashFundTransaction(tx.project_names as string[] | null))
      return NextResponse.json({ error: 'תנועה זו אינה מסומנת בקטגוריית מזומנים' }, { status: 400 })

    // Idempotency: don't create a second entry for the same source transaction
    // (the DB also enforces this via a unique partial index, as a second layer).
    const { data: existing } = await supabaseAdmin
      .from('cash_fund_entries')
      .select('id')
      .eq('source_transaction_id', sourceTransactionId)
      .maybeSingle()
    if (existing)
      return NextResponse.json({ success: false, alreadyDuplicated: true, entryId: existing.id })

    const { data: created, error: insertError } = await supabaseAdmin
      .from('cash_fund_entries')
      .insert({
        amount: Math.abs(Number(tx.amount) || 0),
        date: tx.date,
        notes: `שוכפל מתנועה: ${tx.notes || tx.date}`,
        source_transaction_id: tx.id,
      })
      .select('id')
      .single()
    if (insertError) throw insertError

    return NextResponse.json({ success: true, id: created.id })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
