import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: object) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
}

/**
 * קיזוז דמי מגבית ממשכורת — רץ אחרי קיזוז שכ"ל.
 *
 * סדר עדיפויות (לפי החלטת המשתמש):
 *   1. שכ"ל מקוזז קודם (ע"י tuition-offset / salaries-import).
 *   2. המגבית מקוזזת רק מ"השארית": משכורת − ניכוי שכ"ל שכבר בוצע באותו חודש.
 *
 * כך שסך (ניכוי שכ"ל + ניכוי מגבית) באותו חודש לעולם לא עולה על המשכורת.
 *
 * רק הורים עם deduct_donation = true (לחצן "V") נכללים.
 */

export async function GET(_req: NextRequest) {
  try {
    const { data } = await supabaseAdmin
      .from('parents')
      .select('id, name, salary_gross')
      .gt('salary_gross', 0)
      .eq('deduct_donation', true)
      .order('name')
    return Response.json(data ?? [])
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const { dryRun = false, parentId, monthYear } = await req.json()

  const today = new Date()
  const targetMY: string =
    monthYear || `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)
      const actions: object[] = []
      let totalOffset = 0

      try {
        // ── Step 1: donors who opted in to salary deduction ──
        e({ type: 'step', step: 1, msg: 'מחפש עובדים עם קיזוז מגבית פעיל...' })
        let q = supabaseAdmin
          .from('parents')
          .select('id, name, salary_gross')
          .gt('salary_gross', 0)
          .eq('deduct_donation', true)
        if (parentId) q = q.eq('id', parentId)
        const { data: parents } = await q

        // Wife salaries → family salary pool
        const parentIds = (parents ?? []).map((p: { id: string }) => p.id)
        const { data: womenRows } = parentIds.length > 0
          ? await supabaseAdmin.from('women').select('parent_ids, salary_gross').overlaps('parent_ids', parentIds)
          : { data: [] }
        const wifeSalaryMap: Record<string, number> = {}
        for (const w of womenRows ?? []) {
          const gross = Number(w.salary_gross) || 0
          for (const pid of (w.parent_ids as string[]) ?? []) {
            wifeSalaryMap[pid] = (wifeSalaryMap[pid] || 0) + gross
          }
        }

        e({ type: 'step', step: 1, msg: `נמצאו ${(parents ?? []).length} עובדים` })
        e({ type: 'step', step: 2, msg: 'מחשב שארית משכורת אחרי שכ"ל...' })

        for (const parent of parents ?? []) {
          const salary = (Number(parent.salary_gross) || 0) + (wifeSalaryMap[parent.id] || 0)

          // Open donation PP for this month
          const { data: donPPs } = await supabaseAdmin
            .from('planned_payments')
            .select('id, amount, balance')
            .contains('parent_ids', [parent.id])
            .eq('month_year', targetMY)
            .eq('pp_type', 'donation')
            .gt('balance', 0)
            .limit(1)
          const donPP = donPPs?.[0]

          if (!donPP) {
            e({ type: 'progress', parentName: parent.name, skipped: true, reason: 'אין PP מגבית פתוח לחודש זה' })
            actions.push({ parentId: parent.id, parentName: parent.name, skipped: true, reason: 'אין PP מגבית פתוח' })
            continue
          }

          // Idempotency: skip if donation offset already exists this month
          const { data: existingDon } = await supabaseAdmin
            .from('transactions')
            .select('id')
            .contains('parent_ids', [parent.id])
            .eq('month_year', targetMY)
            .eq('type', 'קיזוז דמי מגבית')
            .limit(1)
          if ((existingDon ?? []).length > 0) {
            e({ type: 'progress', parentName: parent.name, skipped: true, reason: 'קיזוז מגבית כבר קיים לחודש זה' })
            actions.push({ parentId: parent.id, parentName: parent.name, skipped: true, reason: 'קיזוז מגבית כבר קיים' })
            continue
          }

          // ── Tuition already deducted from THIS salary month ──
          const { data: tuitionDeductTxs } = await supabaseAdmin
            .from('transactions')
            .select('amount')
            .contains('parent_ids', [parent.id])
            .eq('month_year', targetMY)
            .in('type', ['קיזוז משכר לימוד', 'ניכוי שכ"ל'])
          const tuitionDeducted = (tuitionDeductTxs ?? [])
            .reduce((s: number, t: { amount: number }) => s + Math.abs(Number(t.amount)), 0)

          // Remaining salary AFTER tuition → donation gets only this
          const remainingSalary = Math.max(0, salary - tuitionDeducted)
          const donationBalance = Number(donPP.balance)
          const offset = Math.min(remainingSalary, donationBalance)

          if (offset <= 0) {
            const reason = remainingSalary <= 0 ? 'המשכורת נוצלה כולה לשכ"ל' : 'סכום קיזוז 0'
            e({ type: 'progress', parentName: parent.name, salary, tuitionBalance: tuitionDeducted, offset: 0, skipped: true, reason })
            actions.push({ parentId: parent.id, parentName: parent.name, salary, tuitionDeducted, remainingSalary, donationBalance, offset: 0, skipped: true, reason })
            continue
          }

          e({ type: 'progress', parentName: parent.name, salary, tuitionBalance: tuitionDeducted, offset, skipped: false })

          // ── Step 3: create offset tx + reduce donation PP balance ──
          if (!dryRun) {
            e({ type: 'step', step: 3, msg: `יוצר קיזוז מגבית עבור ${parent.name}...` })
            await supabaseAdmin.from('transactions').insert({
              id:                 crypto.randomUUID(),
              amount:             offset,
              planned_payment_id: donPP.id,
              parent_ids:         [parent.id],
              date:               today.toISOString().split('T')[0],
              month_year:         targetMY,
              notes:              `קיזוז דמי מגבית ₪${offset} (שארית משכורת אחרי שכ"ל)`,
              type:               'קיזוז דמי מגבית',
              project_ids:        [],
              project_names:      ['דמי מגבית'],
              synced_at:          '2099-12-31T23:59:59.999Z',
            })
            await supabaseAdmin.from('planned_payments')
              .update({ balance: Math.max(0, donationBalance - offset) })
              .eq('id', donPP.id)
          }

          totalOffset += offset
          actions.push({ parentId: parent.id, parentName: parent.name, ppId: donPP.id, salary, tuitionDeducted, remainingSalary, donationBalance, offset, skipped: false })
        }

        const applied = (actions as { skipped: boolean }[]).filter(a => !a.skipped)

        if (!dryRun) {
          try {
            await supabaseAdmin.from('automation_logs').insert({
              id:            crypto.randomUUID(),
              automation_id: 'donation-offset',
              run_at:        new Date().toISOString(),
              dry_run:       false,
              parent_id:     parentId ?? null,
              parent_name:   parentId ? ((parents ?? []).find((p: { id: string; name: string }) => p.id === parentId)?.name ?? null) : null,
              actions_count: applied.length,
              status:        'success',
              summary:       `קוזז מגבית ₪${totalOffset} עבור ${applied.length} עובדים (${targetMY})`,
              details:       actions,
            })
          } catch { /* table may not exist yet */ }
        }

        e({ type: 'complete', applied: applied.length, skipped: actions.length - applied.length, totalOffset, dryRun, monthYear: targetMY, actions })
      } catch (err) {
        e({ type: 'error', error: (err as { message?: string })?.message ?? String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' },
  })
}
