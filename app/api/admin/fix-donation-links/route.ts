import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/**
 * GET  → dry-run preview: which transactions would be fixed
 * POST → { dryRun?: boolean } — fix donation transactions wrongly linked to tuition PPs
 *
 * A "bad link" = transaction where project_names contains 'דמי מגבית' (or type = 'קיזוז דמי מגבית')
 * but planned_payment_id points to a PP with pp_type = 'tuition'.
 *
 * Fix per transaction:
 *   1. Restore balance on the wrongly-linked tuition PP
 *   2. Find the donation PP for the same parent + month_year
 *   3. If found  → link tx to donation PP and deduct from its balance
 *   4. If not found → unlink tx (planned_payment_id = null)
 */

export async function GET() {
  return handler(true)
}

export async function POST(req: NextRequest) {
  const { dryRun = false } = await req.json().catch(() => ({}))
  return handler(dryRun)
}

async function handler(dryRun: boolean) {
  try {
    // 1. Find candidate transactions
    const { data: txs, error: txErr } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, planned_payment_id, parent_ids, month_year, type, project_names')
      .not('planned_payment_id', 'is', null)
      .or('type.eq.קיזוז דמי מגבית,project_names.cs.{"דמי מגבית"}')

    if (txErr) throw txErr

    const results: object[] = []

    for (const tx of txs ?? []) {
      // 2. Check if the linked PP is a tuition PP (the bad case)
      const { data: pp } = await supabaseAdmin
        .from('planned_payments')
        .select('id, pp_type, balance, amount')
        .eq('id', tx.planned_payment_id)
        .single()

      if (!pp || pp.pp_type !== 'tuition') continue  // already correct or missing

      const parentId   = (tx.parent_ids as string[])?.[0]
      const txAmount   = Math.abs(Number(tx.amount))

      // 3. Find the correct donation PP for same parent + month
      const { data: donPPs } = await supabaseAdmin
        .from('planned_payments')
        .select('id, balance')
        .contains('parent_ids', [parentId])
        .eq('month_year', tx.month_year)
        .eq('pp_type', 'donation')
        .limit(1)

      const donPP = donPPs?.[0] ?? null

      results.push({
        txId:          tx.id,
        txType:        tx.type,
        txAmount,
        monthYear:     tx.month_year,
        parentId,
        wrongPpId:     pp.id,
        donationPpId:  donPP?.id ?? null,
        action:        donPP ? 're-link to donation PP' : 'unlink (no donation PP found)',
      })

      if (!dryRun) {
        // Restore tuition PP balance (add back the amount, cap at original amount)
        const restoredBal = Math.min(Number(pp.amount), Number(pp.balance) + txAmount)
        await supabaseAdmin
          .from('planned_payments')
          .update({ balance: Math.round(restoredBal * 100) / 100 })
          .eq('id', pp.id)

        if (donPP) {
          // Link to donation PP and reduce its balance
          await supabaseAdmin
            .from('transactions')
            .update({ planned_payment_id: donPP.id })
            .eq('id', tx.id)

          const newDonBal = Math.max(0, Number(donPP.balance) - txAmount)
          await supabaseAdmin
            .from('planned_payments')
            .update({ balance: Math.round(newDonBal * 100) / 100 })
            .eq('id', donPP.id)
        } else {
          // No donation PP → just unlink
          await supabaseAdmin
            .from('transactions')
            .update({ planned_payment_id: null })
            .eq('id', tx.id)
        }
      }
    }

    return NextResponse.json({
      dryRun,
      found:  results.length,
      fixed:  dryRun ? 0 : results.length,
      items:  results,
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
