import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

/** GET — returns parents eligible for the offset (salary_gross > 0) */
export async function GET(_req: NextRequest) {
  try {
    const { data } = await supabaseAdmin
      .from('parents')
      .select('id, name, salary_gross')
      .gt('salary_gross', 0)
      .order('name')
    return NextResponse.json(data ?? [])
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/** POST — run the tuition-offset automation */
export async function POST(req: NextRequest) {
  try {
    const { dryRun = false, parentId, monthYear } = await req.json()

    const today = new Date()
    const targetMY: string =
      monthYear ||
      `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
    const [tm, ty] = targetMY.split('/')

    // Load parents (single or all with salary)
    let q = supabaseAdmin
      .from('parents')
      .select('id, name, salary_gross, tuition_balance')
      .gt('salary_gross', 0)
    if (parentId) q = q.eq('id', parentId)
    const { data: parents } = await q

    const actions: {
      parentId: string; parentName: string; ppId?: string
      salary?: number; tuitionBalance?: number; offset?: number
      skipped: boolean; reason?: string
    }[] = []

    let totalOffset = 0

    for (const parent of parents ?? []) {
      const salary = Number(parent.salary_gross) || 0

      // Find open PP for target month
      const { data: pps } = await supabaseAdmin
        .from('planned_payments')
        .select('id, amount, balance')
        .contains('parent_ids', [parent.id])
        .eq('month_year', targetMY)
        .gt('balance', 0)
        .limit(1)

      const pp = pps?.[0]

      if (!pp) {
        actions.push({ parentId: parent.id, parentName: parent.name ?? '', skipped: true, reason: 'אין תשלום מתוכנן פתוח לחודש זה' })
        continue
      }

      const tuitionBalance = Number(pp.balance)
      const offset = Math.min(salary, tuitionBalance)

      if (offset <= 0) {
        actions.push({ parentId: parent.id, parentName: parent.name ?? '', ppId: pp.id, salary, tuitionBalance, offset: 0, skipped: true, reason: 'סכום הקיזוז הוא 0' })
        continue
      }

      if (!dryRun) {
        await supabaseAdmin.from('transactions').insert({
          id:                 crypto.randomUUID(),
          amount:             offset,
          planned_payment_id: pp.id,
          parent_ids:         [parent.id],
          date:               today.toISOString().split('T')[0],
          month_year:         targetMY,
          notes:              'קיזוז שכ"ל ממשכורת',
          type:               'קיזוז ממשכורת',
          project_ids:        [],
          project_names:      [],
          synced_at:          '2099-12-31T23:59:59.999Z',
        })
        await supabaseAdmin
          .from('planned_payments')
          .update({ balance: Math.max(0, tuitionBalance - offset) })
          .eq('id', pp.id)
        await supabaseAdmin
          .from('parents')
          .update({ tuition_balance: Math.max(0, (Number(parent.tuition_balance) || 0) - offset) })
          .eq('id', parent.id)
      }

      totalOffset += offset
      actions.push({ parentId: parent.id, parentName: parent.name ?? '', ppId: pp.id, salary, tuitionBalance, offset, skipped: false })
    }

    const applied = actions.filter(a => !a.skipped)
    const skipped = actions.filter(a => a.skipped)

    // Save log (silently ignore if table doesn't exist yet)
    if (!dryRun) {
      try {
        await supabaseAdmin.from('automation_logs').insert({
          id:            crypto.randomUUID(),
          automation_id: 'tuition-offset',
          run_at:        new Date().toISOString(),
          dry_run:       false,
          parent_id:     parentId ?? null,
          parent_name:   parentId ? ((parents ?? []).find((p: { id: string; name: string }) => p.id === parentId)?.name ?? null) : null,
          actions_count: applied.length,
          status:        'success',
          summary:       `קוזז ₪${totalOffset} עבור ${applied.length} הורים (${targetMY})`,
          details:       actions,
        })
      } catch { /* automation_logs table may not exist yet */ }
    }

    return NextResponse.json({
      actions,
      applied: applied.length,
      skipped: skipped.length,
      totalOffset,
      dryRun,
      monthYear: targetMY,
    })
  } catch (err) {
    return NextResponse.json(
      { error: (err as { message?: string })?.message ?? String(err) },
      { status: 500 }
    )
  }
}
