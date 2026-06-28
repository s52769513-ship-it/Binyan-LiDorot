import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

interface PPRow {
  id: string
  name: string | null
  pp_type: string | null
  amount: number | null
  balance: number | null
  date: string | null
  month_year: string | null
  is_legacy?: boolean | null
}

interface TxRow {
  id: string
  amount: number | null
  type: string | null
  date: string | null
  month_year: string | null
  notes: string | null
  is_legacy?: boolean | null
}

// Postgres "undefined column" error code — column doesn't exist yet
const UNDEFINED_COLUMN = '42703'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: parentId } = await params

    // Fetch planned payments. The is_legacy column may not exist yet (added by the
    // import migration); if so, fall back to a query without it and treat all rows as new.
    let ppsData: PPRow[] = []
    {
      const withLegacy = await supabaseAdmin
        .from('planned_payments')
        .select('id, name, pp_type, amount, balance, date, month_year, is_legacy')
        .contains('parent_ids', [parentId])
        .order('month_year', { ascending: false })

      if (withLegacy.error && withLegacy.error.code === UNDEFINED_COLUMN) {
        const fallback = await supabaseAdmin
          .from('planned_payments')
          .select('id, name, pp_type, amount, balance, date, month_year')
          .contains('parent_ids', [parentId])
          .order('month_year', { ascending: false })
        if (fallback.error) throw fallback.error
        ppsData = (fallback.data ?? []) as PPRow[]
      } else if (withLegacy.error) {
        throw withLegacy.error
      } else {
        ppsData = (withLegacy.data ?? []) as PPRow[]
      }
    }

    // Fetch transactions, same graceful is_legacy handling.
    let txsData: TxRow[] = []
    {
      const withLegacy = await supabaseAdmin
        .from('transactions')
        .select('id, amount, type, date, month_year, notes, is_legacy')
        .contains('parent_ids', [parentId])
        .order('month_year', { ascending: false })

      if (withLegacy.error && withLegacy.error.code === UNDEFINED_COLUMN) {
        const fallback = await supabaseAdmin
          .from('transactions')
          .select('id, amount, type, date, month_year, notes')
          .contains('parent_ids', [parentId])
          .order('month_year', { ascending: false })
        if (fallback.error) throw fallback.error
        txsData = (fallback.data ?? []) as TxRow[]
      } else if (withLegacy.error) {
        throw withLegacy.error
      } else {
        txsData = (withLegacy.data ?? []) as TxRow[]
      }
    }

    // Aggregate by type
    const tuitionNew    = { total: 0, balance: 0, items: [] as object[] }
    const tuitionLegacy = { total: 0, balance: 0, items: [] as object[] }
    const collection    = { total: 0, balance: 0, items: [] as object[] }
    const legacyDebts   = { total: 0, items: [] as object[] }

    // Process planned payments
    for (const pp of ppsData) {
      const item = {
        id: pp.id,
        name: pp.name,
        amount: Number(pp.amount) || 0,
        balance: Number(pp.balance) || 0,
        monthYear: pp.month_year,
        date: pp.date,
      }

      if (pp.pp_type === 'tuition') {
        const bucket = pp.is_legacy ? tuitionLegacy : tuitionNew
        bucket.total += item.amount
        bucket.balance += item.balance
        bucket.items.push(item)
      } else if (pp.pp_type === 'donation') {
        collection.total += item.amount
        collection.balance += item.balance
        collection.items.push(item)
      }
    }

    // Process legacy transactions (imported from the old work center) as historical debts.
    // Skip internal credit rows (notes starting with "זיכוי").
    for (const tx of txsData) {
      if (tx.is_legacy && !(tx.notes ?? '').startsWith('זיכוי')) {
        const amount = Math.abs(Number(tx.amount) || 0)
        legacyDebts.total += amount
        legacyDebts.items.push({
          id: tx.id,
          type: tx.type,
          amount,
          monthYear: tx.month_year,
          date: tx.date,
          notes: tx.notes,
        })
      }
    }

    const grandTotal = tuitionNew.total + tuitionLegacy.total + collection.total + legacyDebts.total
    const grandBalance = tuitionNew.balance + tuitionLegacy.balance + collection.balance

    return NextResponse.json({
      tuitionNew,
      tuitionLegacy,
      collection,
      legacyDebts,
      grandTotal,
      grandBalance,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}
