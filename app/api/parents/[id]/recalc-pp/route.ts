import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/parents/[id]/recalc-pp
 * חישוב מלא של כל התשלומים המתוכננים עבור הורה:
 *   0. ניתוק תנועות שקושרו בטעות לתשלומים מתוכננים (לא מפרויקט בנין לדורות)
 *   1. קישור תנועות חופשיות לתשלומים מתוכננים לפי חודש (הישן ביותר קודם)
 *      אם תנועה > יתרת תשלום → סגור תשלום, המשך לבא
 *      עודף לאחר כל התשלומים → זיכוי
 *   2. יישום זיכוי קיים על תשלומים פתוחים (הישן ביותר קודם)
 *   3. חישוב מחדש של יתרה בכל תשלום מקושר לפי תנועות בנין לדורות בלבד
 *   4. עדכון יתרת שכ"ל וזיכוי הורה
 *   5. בדיקת קיזוז ממשכורת
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: parentId } = await params
  try {
    const result = await recalcPPs(parentId)
    return NextResponse.json({ success: true, ...result })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function recalcPPs(parentId: string) {
  // ── שלב 0: ניתוק תנועות שגויות ─────────────────────────────────────────
  // תנועות שמקושרות לתשלומי שכ"ל אך אינן מפרויקט בנין לדורות
  const { data: tuitionPPIds } = await supabaseAdmin
    .from('planned_payments')
    .select('id')
    .contains('parent_ids', [parentId])
    .or('pp_type.eq.tuition,pp_type.is.null')

  const ppIdList = (tuitionPPIds ?? []).map(p => p.id as string)
  let unlinkedWrong = 0

  if (ppIdList.length > 0) {
    const { data: wrongTxs } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, planned_payment_id')
      .in('planned_payment_id', ppIdList)
      .not('project_names', 'cs', '{"בנין לדורות"}')
      .gt('amount', 0)

    for (const tx of wrongTxs ?? []) {
      // שחזר יתרת התשלום המתוכנן
      const { data: pp } = await supabaseAdmin
        .from('planned_payments').select('balance, amount').eq('id', tx.planned_payment_id).single()
      if (pp) {
        const restored = Math.min(Number(pp.amount), Number(pp.balance) + Number(tx.amount))
        await supabaseAdmin.from('planned_payments').update({ balance: restored }).eq('id', tx.planned_payment_id)
      }
      // נתק תנועה
      await supabaseAdmin.from('transactions').update({ planned_payment_id: null }).eq('id', tx.id)
      unlinkedWrong++
    }
  }

  // ── טעינת תשלומים פתוחים לפי סדר חודש ──────────────────────────────────
  const { data: rawPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, balance, month_year, pp_type')
    .contains('parent_ids', [parentId])
    .or('pp_type.eq.tuition,pp_type.is.null')
    .gt('balance', 0)
    .order('month_year', { ascending: true })

  const openPPs = (rawPPs ?? []).map(p => ({ ...p, balance: Number(p.balance), amount: Number(p.amount) }))

  // ── טעינת תנועות חופשיות של בנין לדורות ────────────────────────────────
  const { data: rawTxs } = await supabaseAdmin
    .from('transactions')
    .select('id, amount, month_year, date')
    .contains('parent_ids', [parentId])
    .contains('project_names', ['בנין לדורות'])
    .is('planned_payment_id', null)
    .gt('amount', 0)
    .order('date', { ascending: true })

  let leftover = 0

  // ── שלב 1: קישור תנועות לתשלומים לפי חודש עם מעבר לבא ─────────────────
  for (const tx of rawTxs ?? []) {
    let remaining = Number(tx.amount)

    const monthMatch = openPPs.findIndex(p => p.month_year === tx.month_year && p.balance > 0)
    const firstOpen  = openPPs.findIndex(p => p.balance > 0)
    let ppIdx = monthMatch >= 0 ? monthMatch : firstOpen
    if (ppIdx < 0) { leftover += remaining; continue }

    let firstLinked = true
    while (remaining > 0 && ppIdx >= 0) {
      const pp = openPPs[ppIdx]
      const apply = Math.min(remaining, pp.balance)
      pp.balance = Math.round((pp.balance - apply) * 100) / 100
      remaining  = Math.round((remaining - apply) * 100) / 100

      await supabaseAdmin.from('planned_payments').update({ balance: pp.balance }).eq('id', pp.id)
      if (firstLinked) {
        await supabaseAdmin.from('transactions').update({ planned_payment_id: pp.id }).eq('id', tx.id)
        firstLinked = false
      }

      if (remaining > 0) {
        ppIdx = openPPs.findIndex((p, i) => i > ppIdx && p.balance > 0)
        if (ppIdx < 0) ppIdx = openPPs.findIndex(p => p.balance > 0)
      }
    }
    leftover += remaining
  }

  // ── שלב 2: עודף תנועות → הוספה לזיכוי ─────────────────────────────────
  const { data: parentRow } = await supabaseAdmin
    .from('parents')
    .select('credit_balance')
    .eq('id', parentId)
    .single()

  let credit = Number(parentRow?.credit_balance ?? 0) + leftover

  // ── שלב 3: יישום זיכוי על תשלומים פתוחים ───────────────────────────────
  if (credit > 0) {
    for (const pp of openPPs) {
      if (pp.balance <= 0 || credit <= 0) continue
      const apply = Math.min(credit, pp.balance)
      pp.balance = Math.round((pp.balance - apply) * 100) / 100
      credit     = Math.round((credit - apply) * 100) / 100
      await supabaseAdmin.from('planned_payments').update({ balance: pp.balance }).eq('id', pp.id)
    }
  }

  // ── שלב 4: חישוב מחדש של יתרה לפי תנועות מקושרות ───────────────────────
  const { data: allTuitionPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, pp_type')
    .contains('parent_ids', [parentId])
    .or('pp_type.eq.tuition,pp_type.is.null')

  for (const pp of allTuitionPPs ?? []) {
    // Count ALL linked positive transactions (incl. offset types like קיזוז שכ"ל)
    const { data: txs } = await supabaseAdmin
      .from('transactions')
      .select('amount')
      .eq('planned_payment_id', pp.id)
      .gt('amount', 0)
    const paid    = (txs ?? []).reduce((s, t) => s + Number(t.amount), 0)
    const balance = Math.max(0, Number(pp.amount) - paid)
    await supabaseAdmin.from('planned_payments').update({ balance }).eq('id', pp.id)
  }

  // ── שלב 5: עדכון יתרת שכ"ל וזיכוי הורה ────────────────────────────────
  const { data: finalPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('balance, pp_type')
    .contains('parent_ids', [parentId])

  const tuitionBalance = (finalPPs ?? [])
    .filter(p => p.pp_type !== 'משכורת')
    .reduce((s, p) => s + Number(p.balance ?? 0), 0)

  await supabaseAdmin.from('parents').update({
    tuition_balance: tuitionBalance,
    credit_balance:  Math.max(0, credit),
  }).eq('id', parentId)

  // ── שלב 6: בדיקת קיזוז ממשכורת ─────────────────────────────────────────
  // בדיקה אם יש תשלומי משכורת פתוחים שאמורים לכלול ניכוי שכ"ל
  const { data: salaryPPs } = await supabaseAdmin
    .from('planned_payments')
    .select('id, amount, balance, month_year')
    .contains('parent_ids', [parentId])
    .eq('pp_type', 'salary')
    .gt('balance', 0)
    .order('month_year', { ascending: false })
    .limit(3)

  const salaryOffsetMonths: string[] = []
  for (const sp of salaryPPs ?? []) {
    const { data: offsetTxs } = await supabaseAdmin
      .from('transactions')
      .select('id')
      .contains('parent_ids', [parentId])
      .eq('month_year', sp.month_year)
      .in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל', 'ניכוי שכ"ל'])
      .limit(1)
    if (!offsetTxs || offsetTxs.length === 0) {
      salaryOffsetMonths.push(sp.month_year as string)
    }
  }

  return {
    unlinkedMatched: (rawTxs ?? []).length,
    unlinkedWrong,
    leftoverCredit: Math.max(0, credit),
    tuitionBalance,
    salaryOffsetMonths, // חודשים שיש בהם משכורת פתוחה ללא קיזוז שכ"ל
  }
}
