import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// Must match export column order
const PAYMENT_METHODS = ['העברה', 'מזומן', 'הו"ק', 'אשראי', "צ'ק"]
const COL = {
  id:          0,
  name:        1,
  husbandSalary: 2,  // C — actual salary this month
  // 3 wife, 4 family total, 5 offset, 6 toPay
  payStart:    7,    // H
}

export async function POST(req: NextRequest) {
  try {
    const formData  = await req.formData()
    const file      = formData.get('file') as File | null
    const monthYear = (formData.get('monthYear') as string | null)?.trim()
    const dryRun    = formData.get('dryRun') === 'true'

    if (!file)      return NextResponse.json({ error: 'חסר קובץ' }, { status: 400 })
    if (!monthYear) return NextResponse.json({ error: 'חסר חודש' }, { status: 400 })

    const buf  = Buffer.from(await file.arrayBuffer())
    const wb   = XLSX.read(buf, { type: 'buffer' })
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null })

    const today   = new Date().toISOString().split('T')[0]
    const results: object[] = []
    let totalCreated = 0

    // Start from row index 1 (skip header)
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i]
      if (!row || row.length === 0) continue

      const parentId        = String(row[COL.id]   || '').trim()
      const parentName      = String(row[COL.name]  || '').trim()
      const colC            = Number(row[2] || 0)   // husband salary
      const colD            = Number(row[3] || 0)   // wife salary
      const colE            = Number(row[4] || 0)   // family total (formula C+D, cached by Excel)
      // Prefer E (formula result after Excel recalc), fall back to C+D
      const actualSalary    = colE > 0 ? colE : colC + colD
      if (!parentId || !parentName) continue

      // Collect payment method amounts (columns H–L)
      const payments: { method: string; amount: number }[] = []
      for (let j = 0; j < PAYMENT_METHODS.length; j++) {
        const val = Number(row[COL.payStart + j] || 0)
        if (val > 0) payments.push({ method: PAYMENT_METHODS[j], amount: val })
      }

      // Skip rows with no salary and no payments
      if (actualSalary === 0 && payments.length === 0) continue

      // Find salary PP for this parent + month
      const { data: pps } = await supabaseAdmin
        .from('planned_payments')
        .select('id, amount, balance, pp_type, parent_ids, month_year')
        .contains('parent_ids', [parentId])
        .eq('month_year', monthYear)
        .eq('pp_type', 'salary')
        .limit(1)

      const pp = pps?.[0] ?? null

      // Track current PP balance (may be updated if salary changed)
      let currentPPBalance = Number(pp?.balance ?? 0)

      // If Excel salary total differs from PP amount → update PP + recalculate offset
      if (!dryRun && pp && actualSalary > 0 && actualSalary !== Number(pp.amount)) {
        const salaryDelta  = actualSalary - Number(pp.amount)
        currentPPBalance   = currentPPBalance + salaryDelta
        await supabaseAdmin.from('planned_payments')
          .update({ amount: actualSalary, balance: currentPPBalance })
          .eq('id', pp.id)

        // Fetch existing offset txs and tuition PP in parallel
        const [{ data: salaryOffsetTxs }, { data: tuitionPPs }] = await Promise.all([
          supabaseAdmin.from('transactions')
            .select('id, amount')
            .eq('planned_payment_id', pp.id)
            .in('type', ['קיזוז משכר לימוד', 'ניכוי שכ"ל']),
          supabaseAdmin.from('planned_payments')
            .select('id, amount, balance')
            .contains('parent_ids', [parentId])
            .eq('month_year', monthYear)
            .eq('pp_type', 'tuition')
            .limit(1),
        ])

        const tuitionPP = tuitionPPs?.[0]
        const oldOffset = (salaryOffsetTxs ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)

        if (tuitionPP && oldOffset > 0) {
          // Undo old offset to get the real outstanding tuition, then recalculate
          const effectiveTuition = Number(tuitionPP.balance) + oldOffset
          const newOffset        = Math.min(actualSalary, effectiveTuition)
          const offsetDelta      = newOffset - oldOffset  // positive = more offset, negative = less

          if (offsetDelta !== 0) {
            // Update ניכוי שכ"ל tx (linked to salary PP)
            await supabaseAdmin.from('transactions')
              .update({ amount: newOffset })
              .eq('id', (salaryOffsetTxs ?? [])[0].id)

            // Update קיזוז שכ"ל tx (linked to tuition PP)
            const { data: tuitionOffsetTxs } = await supabaseAdmin
              .from('transactions')
              .select('id, amount')
              .contains('parent_ids', [parentId])
              .eq('month_year', monthYear)
              .in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל'])
            if ((tuitionOffsetTxs ?? []).length > 0) {
              await supabaseAdmin.from('transactions')
                .update({ amount: newOffset })
                .eq('id', tuitionOffsetTxs![0].id)
            }

            // More offset → tuition balance decreases; less offset → balance increases
            await supabaseAdmin.from('planned_payments')
              .update({ balance: Number(tuitionPP.balance) - offsetDelta })
              .eq('id', tuitionPP.id)

            const { data: par } = await supabaseAdmin.from('parents')
              .select('tuition_balance').eq('id', parentId).single()
            if (par) {
              await supabaseAdmin.from('parents')
                .update({ tuition_balance: Number(par.tuition_balance) - offsetDelta })
                .eq('id', parentId)
            }
          }
        }
      }

      const txIds: string[] = []

      if (payments.length > 0) {
        for (const { method, amount } of payments) {
          const txId = crypto.randomUUID()
          if (!dryRun) {
            await supabaseAdmin.from('transactions').insert({
              id:                 txId,
              amount,
              type:               method,
              date:               today,
              month_year:         monthYear,
              notes:              `משכורת ${monthYear}`,
              parent_ids:         [parentId],
              project_ids:        [],
              project_names:      ['משכורת'],
              planned_payment_id: pp?.id ?? null,
              synced_at:          '2099-12-31T23:59:59.999Z',
            })
          }
          txIds.push(txId)
          totalCreated++
        }

        // Update PP balance once after all payment methods are processed
        if (!dryRun && pp) {
          const allAmounts = payments.reduce((s, p) => s + p.amount, 0)
          await supabaseAdmin
            .from('planned_payments')
            .update({ balance: currentPPBalance - allAmounts })
            .eq('id', pp.id)
        }
      }

      const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
      results.push({
        parentId,
        parentName,
        actualSalary: actualSalary || null,
        payments,
        totalPaid,
        ppId:       pp?.id ?? null,
        ppFound:    !!pp,
        ppBalance:  pp ? Math.max(0, currentPPBalance - totalPaid) : null,
        txIds,
      })
    }

    if (!dryRun) {
      const totalPaidAll = (results as { totalPaid: number }[]).reduce((s, r) => s + r.totalPaid, 0)
      try {
        await supabaseAdmin.from('automation_logs').insert({
          id:            crypto.randomUUID(),
          automation_id: 'salary-excel-import',
          run_at:        new Date().toISOString(),
          dry_run:       false,
          parent_id:     null,
          parent_name:   null,
          actions_count: totalCreated,
          status:        'success',
          summary:       `ייבוא אקסל: ${totalCreated} תנועות עבור ${results.length} עובדים · ₪${totalPaidAll} (${monthYear})`,
          details:       results,
        })
      } catch { /* table may not exist */ }
    }

    return NextResponse.json({ success: true, dryRun, totalCreated, monthYear, results })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
