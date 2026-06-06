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

      const parentId      = String(row[COL.id]   || '').trim()
      const parentName    = String(row[COL.name]  || '').trim()
      const actualSalary  = Number(row[COL.husbandSalary] || 0)
      if (!parentId || !parentName) continue

      // Collect payment method amounts (columns H–L)
      const payments: { method: string; amount: number }[] = []
      for (let j = 0; j < PAYMENT_METHODS.length; j++) {
        const val = Number(row[COL.payStart + j] || 0)
        if (val > 0) payments.push({ method: PAYMENT_METHODS[j], amount: val })
      }
      if (payments.length === 0) continue

      // Find salary PP for this parent + month
      const { data: pps } = await supabaseAdmin
        .from('planned_payments')
        .select('id, balance')
        .contains('parent_ids', [parentId])
        .eq('month_year', monthYear)
        .eq('pp_type', 'salary')
        .limit(1)

      const pp = pps?.[0] ?? null

      // If Excel salary differs from PP amount → update PP and recalculate offset
      if (!dryRun && pp && actualSalary > 0 && actualSalary !== Number(pp.balance)) {
        // Fetch full PP to get current amount
        const { data: fullPP } = await supabaseAdmin
          .from('planned_payments')
          .select('id, amount, balance, pp_type, parent_ids, month_year')
          .eq('id', pp.id)
          .single()

        if (fullPP && actualSalary !== Number(fullPP.amount)) {
          const oldAmount  = Number(fullPP.amount)
          const newAmount  = actualSalary
          const delta      = newAmount - oldAmount
          const newBalance = Math.max(0, Number(fullPP.balance) + delta)

          await supabaseAdmin.from('planned_payments')
            .update({ amount: newAmount, balance: newBalance })
            .eq('id', pp.id)

          // If salary decreased — reduce existing offset accordingly
          if (delta < 0) {
            const { data: salaryOffsetTxs } = await supabaseAdmin
              .from('transactions')
              .select('id, amount')
              .eq('planned_payment_id', pp.id)
              .eq('type', 'קיזוז משכר לימוד')

            if ((salaryOffsetTxs ?? []).length > 0) {
              const oldOffset = (salaryOffsetTxs ?? []).reduce((s: number, t: { amount: number }) => s + Number(t.amount), 0)

              const { data: tuitionPPs } = await supabaseAdmin
                .from('planned_payments')
                .select('id, amount, balance')
                .contains('parent_ids', [parentId])
                .eq('month_year', monthYear)
                .eq('pp_type', 'tuition')
                .limit(1)

              const tuitionPP  = tuitionPPs?.[0]
              const tuitionAmt = tuitionPP ? Number(tuitionPP.amount) : oldOffset
              const newOffset  = Math.min(newAmount, tuitionAmt)
              const offsetDelta = newOffset - oldOffset

              if (offsetDelta < 0 && tuitionPP) {
                const mainTx = (salaryOffsetTxs ?? [])[0]
                await supabaseAdmin.from('transactions')
                  .update({ amount: Math.max(0, Number(mainTx.amount) + offsetDelta) })
                  .eq('id', mainTx.id)

                const { data: tuitionOffsetTxs } = await supabaseAdmin
                  .from('transactions')
                  .select('id, amount')
                  .contains('parent_ids', [parentId])
                  .eq('month_year', monthYear)
                  .eq('type', 'קיזוז ממשכורת')

                if ((tuitionOffsetTxs ?? []).length > 0) {
                  await supabaseAdmin.from('transactions')
                    .update({ amount: Math.max(0, Number((tuitionOffsetTxs ?? [])[0].amount) + offsetDelta) })
                    .eq('id', (tuitionOffsetTxs ?? [])[0].id)
                }

                await supabaseAdmin.from('planned_payments')
                  .update({ balance: Math.min(tuitionAmt, Number(tuitionPP.balance) - offsetDelta) })
                  .eq('id', tuitionPP.id)

                const { data: par } = await supabaseAdmin.from('parents').select('tuition_balance').eq('id', parentId).single()
                if (par) {
                  await supabaseAdmin.from('parents')
                    .update({ tuition_balance: Math.max(0, Number(par.tuition_balance) - offsetDelta) })
                    .eq('id', parentId)
                }
              }
            }
          }
        }
      }

      const txIds: string[] = []

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
          .update({ balance: Math.max(0, Number(pp.balance) - allAmounts) })
          .eq('id', pp.id)
      }

      const totalPaid = payments.reduce((s, p) => s + p.amount, 0)
      results.push({
        parentId,
        parentName,
        payments,
        totalPaid,
        ppId:       pp?.id ?? null,
        ppFound:    !!pp,
        ppBalance:  pp ? Math.max(0, Number(pp.balance) - totalPaid) : null,
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
