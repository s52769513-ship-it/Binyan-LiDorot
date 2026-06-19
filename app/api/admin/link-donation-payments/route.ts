import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * POST /api/admin/link-donation-payments
 *
 * קישור רטרואקטיבי של תנועות דמי מגבית ל-PPs מסוג donation.
 * עבור כל PP מגבית: מאתר תנועות "דמי מגבית" של אותו הורה ואותו חודש,
 * מקשר אותן ל-PP ומחשב מחדש את היתרה (סכום פחות סך התשלומים).
 *
 * בטוח להרצה חוזרת — היתרה מחושבת מחדש מאפס בכל הרצה.
 */
export async function POST() {
  try {
    // 1. כל ה-PPs מסוג מגבית
    const { data: pps, error: e1 } = await supabaseAdmin
      .from('planned_payments')
      .select('id, amount, parent_ids, month_year')
      .eq('pp_type', 'donation')
    if (e1) throw e1

    // 2. כל תנועות המגבית
    const { data: txs, error: e2 } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, parent_ids, month_year, planned_payment_id')
      .contains('project_names', ['דמי מגבית'])
    if (e2) throw e2

    let linked = 0
    let ppsUpdated = 0

    for (const pp of pps ?? []) {
      const ppParents = (pp.parent_ids as string[]) ?? []
      const matches = (txs ?? []).filter(t => {
        if (String(t.month_year || '') !== String(pp.month_year || '')) return false
        const tParents = (t.parent_ids as string[]) ?? []
        return tParents.some(id => ppParents.includes(id))
      })
      if (matches.length === 0) continue

      // קשר תנועות שעדיין אינן מקושרות ל-PP זה
      for (const t of matches) {
        if (t.planned_payment_id !== pp.id) {
          const { error } = await supabaseAdmin
            .from('transactions')
            .update({ planned_payment_id: pp.id })
            .eq('id', t.id)
          if (error) throw error
          linked++
        }
      }

      // חישוב יתרה מחדש: סכום ה-PP פחות סך התשלומים (חיוביים)
      const paid = matches.reduce((s, t) => s + Math.max(0, Number(t.amount) || 0), 0)
      const newBalance = Math.max(0, (Number(pp.amount) || 0) - paid)
      const { error: balErr } = await supabaseAdmin
        .from('planned_payments')
        .update({ balance: newBalance })
        .eq('id', pp.id)
      if (balErr) throw balErr
      ppsUpdated++
    }

    return NextResponse.json({ success: true, linked, ppsUpdated })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('link-donation-payments error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
