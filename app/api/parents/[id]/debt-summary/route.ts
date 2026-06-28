import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: parentId } = await params

    // Fetch all planned payments for this parent
    // Note: is_legacy column may not exist yet, gracefully handle it
    let ppsData: any[] = []
    const { data: ppsRaw, error: ppsError } = await supabaseAdmin
      .from('planned_payments')
      .select('id, name, pp_type, amount, balance, date, month_year')
      .contains('parent_ids', [parentId])
      .order('month_year', { ascending: false })

    if (ppsError) throw ppsError
    ppsData = (ppsRaw ?? []).map(pp => ({ ...pp, is_legacy: false }))

    // Fetch all transactions for this parent
    let txsData: any[] = []
    const { data: txsRaw, error: txsError } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, type, date, month_year, notes')
      .contains('parent_ids', [parentId])
      .order('month_year', { ascending: false })

    if (txsError) throw txsError
    txsData = (txsRaw ?? []).map(tx => ({ ...tx, is_legacy: false }))

    // Aggregate by type
    const tuitionNew: { total: number; balance: number; items: object[] } = {
      total: 0,
      balance: 0,
      items: [],
    }
    const tuitionLegacy: { total: number; balance: number; items: object[] } = {
      total: 0,
      balance: 0,
      items: [],
    }
    const collection: { total: number; balance: number; items: object[] } = {
      total: 0,
      balance: 0,
      items: [],
    }
    const legacyDebts: { total: number; items: object[] } = {
      total: 0,
      items: [],
    }

    // Process planned payments
    for (const pp of ppsData) {
      const item = {
        id: pp.id,
        name: pp.name,
        amount: pp.amount,
        balance: pp.balance,
        monthYear: pp.month_year,
        date: pp.date,
      }

      if (pp.pp_type === 'tuition') {
        if (pp.is_legacy) {
          tuitionLegacy.total += Number(pp.amount) || 0
          tuitionLegacy.balance += Number(pp.balance) || 0
          tuitionLegacy.items.push(item)
        } else {
          tuitionNew.total += Number(pp.amount) || 0
          tuitionNew.balance += Number(pp.balance) || 0
          tuitionNew.items.push(item)
        }
      } else if (pp.pp_type === 'collection') {
        collection.total += Number(pp.amount) || 0
        collection.balance += Number(pp.balance) || 0
        collection.items.push(item)
      }
    }

    // Process legacy transactions (not linked to PP) as historical debts
    const linkedPPIds = new Set(ppsData.map(pp => pp.id))
    for (const tx of txsData) {
      if (tx.is_legacy && (!tx.notes || !tx.notes.startsWith('זיכוי'))) {
        // This is a legacy transaction — treat as historical debt
        legacyDebts.total += Math.abs(Number(tx.amount) || 0)
        legacyDebts.items.push({
          id: tx.id,
          type: tx.type,
          amount: Math.abs(Number(tx.amount) || 0),
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
