import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/admin/link-donation-payments
 *
 * קישור תנועות דמי מגבית ל-PPs מסוג donation, בדיוק כמו בשכ"ל:
 * תשלום פורע קודם את החוב הישן ביותר (oldest-first), והעודף ממשיך לחודש הבא.
 *
 * בטוח להרצה חוזרת — היתרות והקישורים מחושבים מחדש מאפס בכל הרצה.
 */

// "MM/YYYY" → מספר למיון כרונולוגי
function parseMY(my: string): number {
  const [m, y] = (my || '').split('/').map(Number)
  return (y || 0) * 100 + (m || 0)
}

export async function recalcDonationPPs(parentId: string): Promise<number> {
  // PPs מגבית מהישן לחדש
  const { data: ppsRaw } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, month_year')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'donation')
  const pps = (ppsRaw ?? [])
    .map(p => ({ id: p.id as string, amount: Number(p.amount) || 0, month_year: String(p.month_year || '') }))
    .sort((a, b) => parseMY(a.month_year) - parseMY(b.month_year))
  if (pps.length === 0) return 0

  // תשלומי מגבית אמיתיים (חיוביים), מהישן לחדש
  const { data: txsRaw } = await supabaseAdmin
    .from('transactions')
    .select('id, amount, date')
    .contains('parent_ids', [parentId])
    .contains('project_names', ['דמי מגבית'])
    .gt('amount', 0)
    .order('date', { ascending: true })
  const txs = (txsRaw ?? []).map(t => ({ id: t.id as string, amount: Number(t.amount) || 0 }))

  // תקרה מצטברת של סכומי ה-PPs (לקביעת לאיזה PP שייך כל תשלום)
  const cumCap: number[] = []
  let run = 0
  for (const pp of pps) { run += pp.amount; cumCap.push(run) }

  // קישור כל תשלום ל-PP שאליו "נופל" כספו (החוב הישן ביותר קודם)
  let cum = 0
  let idx = 0
  let linked = 0
  for (const tx of txs) {
    while (idx < pps.length - 1 && cum >= cumCap[idx]) idx++
    const { error } = await supabaseAdmin
      .from('transactions')
      .update({ planned_payment_id: pps[idx].id })
      .eq('id', tx.id)
    if (error) throw error
    linked++
    cum += tx.amount
  }

  // חישוב יתרות מחדש — oldest-first
  const totalPaid = txs.reduce((s, t) => s + t.amount, 0)
  let remaining = totalPaid
  for (const pp of pps) {
    const alloc = Math.min(remaining, pp.amount)
    remaining -= alloc
    const balance = Math.max(0, pp.amount - alloc)
    const { error } = await supabaseAdmin
      .from('planned_payments')
      .update({ balance })
      .eq('id', pp.id)
    if (error) throw error
  }

  return linked
}

// קישור כל תשלומי המגבית עבור כל ההורים שיש להם PP מגבית
export async function linkAllDonationPayments(): Promise<{ linked: number; parents: number }> {
  const { data: pps, error } = await supabaseAdmin
    .from('planned_payments')
    .select('parent_ids')
    .eq('pp_type', 'donation')
  if (error) throw error

  const parentIds = [...new Set((pps ?? []).flatMap(p => (p.parent_ids as string[]) ?? []))]

  let linked = 0
  for (const pid of parentIds) {
    linked += await recalcDonationPPs(pid)
  }
  return { linked, parents: parentIds.length }
}

export async function POST() {
  try {
    const { linked, parents } = await linkAllDonationPayments()
    return NextResponse.json({ success: true, linked, parents })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('link-donation-payments error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
