import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const { deleteTransactions, deletePlannedPayments } = await req.json()

    const results: Record<string, number> = {}

    if (deleteTransactions) {
      const { count, error } = await supabaseAdmin
        .from('transactions')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000') // delete all
      if (error) throw new Error(error.message)
      results.transactions = count ?? 0
    }

    if (deletePlannedPayments) {
      const { count, error } = await supabaseAdmin
        .from('planned_payments')
        .delete({ count: 'exact' })
        .neq('id', '00000000-0000-0000-0000-000000000000')
      if (error) throw new Error(error.message)
      results.plannedPayments = count ?? 0
    }

    return NextResponse.json({ success: true, results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

// GET: return counts so user can see what will be deleted
export async function GET() {
  try {
    const [{ count: txCount }, { count: ppCount }] = await Promise.all([
      supabaseAdmin.from('transactions').select('*', { count: 'exact', head: true }),
      supabaseAdmin.from('planned_payments').select('*', { count: 'exact', head: true }),
    ])
    return NextResponse.json({ transactions: txCount ?? 0, plannedPayments: ppCount ?? 0 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
