import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function mapEntry(e: Record<string, unknown>) {
  return {
    id:                   e.id as string,
    amount:               Number(e.amount) || 0,
    date:                 String(e.date || ''),
    notes:                String(e.notes || ''),
    sourceTransactionId:  (e.source_transaction_id as string) || null,
    createdAt:            String(e.created_at || ''),
  }
}

export async function GET(req: NextRequest) {
  try {
    const sourceTransactionId = req.nextUrl.searchParams.get('sourceTransactionId') ?? ''

    // Used by TxDetailModal to check whether a transaction was already
    // duplicated into the cash fund, so it can show "already duplicated"
    // instead of the action button.
    if (sourceTransactionId) {
      const { data, error } = await supabaseAdmin
        .from('cash_fund_entries')
        .select('*')
        .eq('source_transaction_id', sourceTransactionId)
        .maybeSingle()
      if (error) throw error
      return NextResponse.json(data ? mapEntry(data) : null)
    }

    const [{ data, error }, { data: balanceData, error: balanceError }] = await Promise.all([
      supabaseAdmin.from('cash_fund_entries').select('*').order('date', { ascending: false }).limit(500),
      supabaseAdmin.rpc('cash_fund_balance'),
    ])
    if (error) throw error
    if (balanceError) throw balanceError

    return NextResponse.json({
      data: (data ?? []).map(mapEntry),
      balance: Number(balanceData ?? 0),
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const amount = Number(body.amount)
    if (!amount) return NextResponse.json({ error: 'סכום שגוי' }, { status: 400 })

    const { data, error } = await supabaseAdmin
      .from('cash_fund_entries')
      .insert({
        amount,
        date: body.date || new Date().toISOString().split('T')[0],
        notes: body.notes || '',
      })
      .select('*')
      .single()
    if (error) throw error

    return NextResponse.json(mapEntry(data))
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
