import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'

/**
 * POST /api/parents/[id]/recalc-donation-pp
 * גרסה מקבילה ל-recalc-pp אך לחוב מגבית בלבד — שני סוגי החוב לעולם לא
 * מתערבבים (זיכוי מגבית לא יחול על שכ"ל, ולהפך). ראה recalc-pp/route.ts
 * להשוואה מלאה של הצעדים.
 *   0. ניתוק תנועות שקושרו בטעות לתשלומי מגבית (לא מפרויקט "דמי מגבית")
 *   1. קישור תנועות מגבית חופשיות לתשלומים מתוכננים לפי חודש (הישן ביותר קודם)
 *   2. יישום זיכוי מגבית קיים על תשלומים פתוחים (הישן ביותר קודם)
 *   3. חישוב מחדש של יתרה בכל תשלום מגבית מקושר
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: parentId } = await params
  try {
    const result = await recalcDonationPPs(parentId)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function recalcDonationPPs(parentId: string) {
  // ── שלב 0: ניתוק תנועות שגויות ─────────────────────────────────────────
  const { data: donationPPIds } = await supabaseAdmin
    .from('planned_payments')
    .select('id')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'donation')

  const ppIdList = (donationPPIds ?? []).map(p => p.id as string)
  let unlinkedWrong = 0

  if (ppIdList.length > 0) {
    const { data: wrongTxs } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, planned_payment_id')
      .in('planned_payment_id', ppIdList)
      .not('project_names', 'cs', '{"דמי מגבית"}')
      .gt('amount', 0)

    for (const tx of wrongTxs ?? []) {
      const { data: pp } = await supabaseAdmin
        .from('planned_payments').select('balance, amount').eq('id', tx.planned_payment_id).single()
      if (pp) {
        const restored = Math.min(Number(pp.amount), Number(pp.balance) + Number(tx.amount))
        await supabaseAdmin.from('planned_payments').update({ balance: restored }).eq('id', tx.planned_payment_id)
      }
      await supabaseAdmin.from('transactions').update({ planned_payment_id: null }).eq('id', tx.id)
      unlinkedWrong++
    }
  }

  // ── טעינת תשלומים פתוחים לפי סדר חודש ──────────────────────────────────
  const { data: rawPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, balance, month_year, pp_type')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'donation')
    .gt('balance', 0)

  const openPPs = sortByMonth(rawPPs ?? [], true).map(p => ({ ...p, balance: Number(p.balance), amount: Number(p.amount) }))

  // ── טעינת תנועות מגבית חופשיות ─────────────────────────────────────────
  const { data: rawTxs } = await supabaseAdmin
    .from('transactions')
    .select('id, amount, month_year, date')
    .contains('parent_ids', [parentId])
    .contains('project_names', ['דמי מגבית'])
    .is('planned_payment_id', null)
    .gt('amount', 0)
    .order('date', { ascending: true })

  let leftover = 0

  // ── שלב 1: קישור תנועות לתשלום המתאים לפי חודש ─────────────────────────
  for (const tx of rawTxs ?? []) {
    let remaining = Number(tx.amount)

    const monthMatch = openPPs.findIndex(p => p.month_year === tx.month_year && p.balance > 0)
    const firstOpen  = openPPs.findIndex(p => p.balance > 0)
    const ppIdx = monthMatch >= 0 ? monthMatch : firstOpen
    if (ppIdx < 0) { leftover += remaining; continue }

    const pp    = openPPs[ppIdx]
    const apply = Math.min(remaining, pp.balance)
    pp.balance  = Math.round((pp.balance - apply) * 100) / 100
    remaining   = Math.round((remaining - apply) * 100) / 100

    await supabaseAdmin.from('transactions').update({ planned_payment_id: pp.id }).eq('id', tx.id)
    leftover += remaining
  }

  // ── שלב 2: עודף תנועות → הוספה לזיכוי מגבית ────────────────────────────
  const { data: parentRow } = await supabaseAdmin
    .from('parents')
    .select('donation_credit_balance')
    .eq('id', parentId)
    .single()

  let credit = Number(parentRow?.donation_credit_balance ?? 0) + leftover

  // ── שלב 3: יישום זיכוי על תשלומים פתוחים (יוצר תנועת זיכוי אמיתית) ────
  const today = new Date().toISOString().split('T')[0]
  if (credit > 0) {
    for (const pp of openPPs) {
      if (pp.balance <= 0 || credit <= 0) continue
      const apply = Math.min(credit, pp.balance)
      pp.balance = Math.round((pp.balance - apply) * 100) / 100
      credit     = Math.round((credit - apply) * 100) / 100
      await supabaseAdmin.from('transactions').insert({
        id:                 crypto.randomUUID(),
        amount:             apply,
        planned_payment_id: pp.id,
        parent_ids:         [parentId],
        date:               today,
        month_year:         pp.month_year ?? '',
        notes:              'זיכוי שמור',
        type:               'זיכוי',
        project_ids:        [],
        project_names:      ['דמי מגבית'],
        synced_at:          '2099-12-31T23:59:59.999Z',
      })
    }
  }

  // ── שלב 4: חישוב מחדש של יתרה לפי תנועות מקושרות ───────────────────────
  const { data: allDonationPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'donation')

  for (const pp of allDonationPPs ?? []) {
    const { data: txs } = await supabaseAdmin
      .from('transactions')
      .select('amount')
      .eq('planned_payment_id', pp.id)
      .gt('amount', 0)
    const paid    = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0)
    const balance = Math.max(0, Number(pp.amount) - paid)
    await supabaseAdmin.from('planned_payments').update({ balance }).eq('id', pp.id)
  }

  // ── שלב 5: עדכון זיכוי מגבית של ההורה ──────────────────────────────────
  await supabaseAdmin.from('parents').update({
    donation_credit_balance: Math.max(0, credit),
  }).eq('id', parentId)

  return {
    unlinkedMatched: (rawTxs ?? []).length,
    unlinkedWrong,
    leftoverCredit: Math.max(0, credit),
  }
}
