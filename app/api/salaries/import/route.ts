import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { tuitionMonthForSalary } from '@/lib/months'
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

      // ── Step 1: Detect salary change ──
      let salaryChanged = false
      let oldSalary: number | null = null

      if (pp && actualSalary > 0 && actualSalary !== Number(pp.amount)) {
        salaryChanged = true
        oldSalary = Number(pp.amount)
        const salaryDelta = actualSalary - Number(pp.amount)
        currentPPBalance  = currentPPBalance + salaryDelta
        if (!dryRun) {
          await supabaseAdmin.from('planned_payments')
            .update({ amount: actualSalary, balance: currentPPBalance })
            .eq('id', pp.id)
        }
      }

      // ── Step 2: Detect & sync offset ──
      // מודל: משכורת של חודש S (monthYear) מקוזזת מול שכ"ל של אותו חודש.
      let offsetAction: 'none' | 'updated' | 'created' = 'none'
      let oldOffset = 0
      let newOffset = 0

      if (pp && actualSalary > 0) {
        const tuitionMY = tuitionMonthForSalary(monthYear)
        const [{ data: tuitionOffsetTxs }, { data: salaryOffsetTxs }, { data: tuitionPPs }] = await Promise.all([
          // Tuition-side offset בחודש השכ"ל — authoritative source of old offset
          supabaseAdmin.from('transactions')
            .select('id, amount')
            .contains('parent_ids', [parentId])
            .eq('month_year', tuitionMY)
            .in('type', ['קיזוז ממשכורת', 'קיזוז שכ"ל']),
          // Salary-side deduction
          supabaseAdmin.from('transactions')
            .select('id, amount')
            .contains('parent_ids', [parentId])
            .eq('month_year', monthYear)
            .in('type', ['קיזוז משכר לימוד', 'ניכוי שכ"ל']),
          supabaseAdmin.from('planned_payments')
            .select('id, amount, balance')
            .contains('parent_ids', [parentId])
            .eq('month_year', tuitionMY)
            .eq('pp_type', 'tuition')
            .limit(1),
        ])

        const tuitionPP = tuitionPPs?.[0]
        oldOffset = (tuitionOffsetTxs ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)

        if (tuitionPP && oldOffset > 0) {
          const effectiveTuition = Number(tuitionPP.balance) + oldOffset
          newOffset = Math.min(actualSalary, effectiveTuition)
          const offsetDelta = newOffset - oldOffset

          if (offsetDelta !== 0) {
            offsetAction = 'updated'
            if (!dryRun) {
              await supabaseAdmin.from('transactions')
                .update({ amount: newOffset })
                .eq('id', tuitionOffsetTxs![0].id)

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

            // Salary side
            const salaryDeductTx = (salaryOffsetTxs ?? [])[0]
            if (salaryDeductTx) {
              if (!dryRun) {
                await supabaseAdmin.from('transactions')
                  .update({ amount: newOffset })
                  .eq('id', salaryDeductTx.id)
                currentPPBalance -= offsetDelta
                await supabaseAdmin.from('planned_payments')
                  .update({ balance: currentPPBalance })
                  .eq('id', pp.id)
              }
            }
          } else {
            newOffset = oldOffset // no change
          }

          // ניכוי שכ"ל was never created on salary side
          const salaryDeductTx = (salaryOffsetTxs ?? [])[0]
          if (!salaryDeductTx && newOffset > 0) {
            offsetAction = 'created'
            if (!dryRun) {
              await supabaseAdmin.from('transactions').insert({
                id:                 crypto.randomUUID(),
                amount:             newOffset,
                planned_payment_id: pp.id,
                parent_ids:         [parentId],
                date:               today,
                month_year:         monthYear,
                notes:              `ניכוי שכ"ל ₪${newOffset}`,
                type:               'ניכוי שכ"ל',
                project_ids:        [],
                project_names:      [],
                synced_at:          '2099-12-31T23:59:59.999Z',
              })
              currentPPBalance -= newOffset
              await supabaseAdmin.from('planned_payments')
                .update({ balance: currentPPBalance })
                .eq('id', pp.id)
            }
          }
        }
      }

      // ── Step 3: Payment transactions ──
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
        ppId:          pp?.id ?? null,
        ppFound:       !!pp,
        ppBalance:     pp ? Math.max(0, currentPPBalance - totalPaid) : null,
        txIds,
        // Change indicators (populated even in dry-run)
        salaryChanged,
        oldSalary,
        offsetAction,
        oldOffset:     oldOffset > 0 ? oldOffset : null,
        newOffset:     newOffset > 0 ? newOffset : null,
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
