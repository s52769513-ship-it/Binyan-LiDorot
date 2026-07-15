import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcDonationPPs } from '@/app/api/parents/[id]/recalc-donation-pp/route'

function emit(ctrl: ReadableStreamDefaultController, enc: TextEncoder, ev: object) {
  ctrl.enqueue(enc.encode(JSON.stringify(ev) + '\n'))
}

function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export async function GET() {
  // Return list of active donation donors for parent picker
  try {
    const { data: soParents } = await supabaseAdmin
      .from('standing_orders')
      .select('parent_id, parent:parent_id(id, name)')
      .eq('project_name', 'דמי מגבית')
      .eq('so_status', 'פעיל')

    const { data: salaryParents } = await supabaseAdmin
      .from('parents')
      .select('id, name')
      .gt('monthly_donation', 0)
      .order('name')

    const seen = new Set<string>()
    const result: { id: string; name: string; salary_gross: number }[] = []

    for (const row of soParents ?? []) {
      const p = (row.parent as unknown) as { id: string; name: string } | null
      if (p && !seen.has(p.id)) { seen.add(p.id); result.push({ id: p.id, name: p.name, salary_gross: 0 }) }
    }
    for (const p of salaryParents ?? []) {
      if (!seen.has(p.id)) { seen.add(p.id); result.push({ id: p.id, name: p.name, salary_gross: 0 }) }
    }

    return Response.json(result.sort((a, b) => a.name.localeCompare(b.name, 'he')))
  } catch (err) {
    return Response.json({ error: String(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { dryRun = false, monthYear, parentId } = body
  const targetMY = monthYear || currentMY()

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)

      try {
        e({ type: 'step', step: 1, msg: 'מחפש תורמים פעילים...' })

        // 1. SO donors
        let soQ = supabaseAdmin
          .from('standing_orders')
          .select('id, parent_id, charge_amount, standing_order_type, parent:parent_id(id, name)')
          .eq('project_name', 'דמי מגבית')
          .eq('so_status', 'פעיל')
        if (parentId) soQ = soQ.eq('parent_id', parentId)
        const { data: soRows } = await soQ

        // 2. Salary deduction donors
        let salQ = supabaseAdmin
          .from('parents')
          .select('id, name, monthly_donation')
          .gt('monthly_donation', 0)
        if (parentId) salQ = salQ.eq('id', parentId)
        const { data: salParents } = await salQ

        // Merge unique donors
        const donorMap = new Map<string, { id: string; name: string; amount: number }>()
        for (const so of soRows ?? []) {
          const p = (so.parent as unknown) as { id: string; name: string } | null
          if (!p) continue
          const existing = donorMap.get(p.id)
          const amt = Number(so.charge_amount) || 0
          donorMap.set(p.id, { id: p.id, name: p.name, amount: (existing?.amount ?? 0) + amt })
        }
        for (const p of salParents ?? []) {
          if (!donorMap.has(p.id)) {
            donorMap.set(p.id, { id: p.id, name: p.name, amount: Number(p.monthly_donation) || 0 })
          }
        }

        const donors = [...donorMap.values()]
        e({ type: 'step', step: 2, msg: `נמצאו ${donors.length} תורמים — בודק PPs קיימים...` })

        // 3. Check existing donation PPs for this month
        const donorIds = donors.map(d => d.id)
        const { data: existingPPs } = donorIds.length > 0
          ? await supabaseAdmin
              .from('planned_payments')
              .select('id, parent_ids, name, amount')
              .eq('pp_type', 'donation')
              .eq('month_year', targetMY)
              .overlaps('parent_ids', donorIds)
          : { data: [] }

        const existingSet = new Set<string>()
        for (const pp of existingPPs ?? []) {
          for (const pid of (pp.parent_ids as string[]) ?? []) existingSet.add(pid)
        }

        e({ type: 'step', step: 3, msg: 'יוצר תשלומים מתוכננים...' })

        let created = 0, skipped = 0
        const actions: object[] = []

        for (const donor of donors) {
          if (existingSet.has(donor.id)) {
            e({ type: 'progress', parentName: donor.name, skipped: true, reason: 'PP קיים' })
            actions.push({ parentName: donor.name, skipped: true, reason: 'PP קיים' })
            skipped++
            continue
          }

          if (!dryRun) {
            const ppId = crypto.randomUUID()
            const [m, y] = targetMY.split('/')
            const ppDate  = `${y}-${m}-01`
            await supabaseAdmin.from('planned_payments').insert({
              id:         ppId,
              parent_ids: [donor.id],
              name:       `דמי מגבית ${targetMY}`,
              amount:     donor.amount,
              balance:    donor.amount,
              date:       ppDate,
              month_year: targetMY,
              pp_type:    'donation',
              // Locally-created row — future synced_at protects it from the
              // Airtable sync's prune step (which deletes stale rows).
              synced_at:  '2099-12-31T23:59:59.999Z',
            })
            // חוב מגבית חדש בודק אם יש זיכוי מגבית שמור ולוקח אותו לעצמו
            void recalcDonationPPs(donor.id).catch(() => {})
          }

          e({ type: 'progress', parentName: donor.name, ppCreated: true, amount: donor.amount })
          actions.push({ parentName: donor.name, ppCreated: true, amount: donor.amount })
          created++
        }

        if (!dryRun) {
          try {
            await supabaseAdmin.from('automation_logs').insert({
              id:            crypto.randomUUID(),
              automation_id: 'donation-pp',
              run_at:        new Date().toISOString(),
              dry_run:       false,
              actions_count: created,
              status:        'success',
              summary:       `PP מגבית: נוצרו ${created} · דולגו ${skipped} (${targetMY})`,
              details:       { monthYear: targetMY, created, skipped },
            })
          } catch { /* best-effort */ }
        }

        e({ type: 'complete', applied: created, skipped, totalCreated: created, totalOffset: 0, dryRun, monthYear: targetMY, actions })
        controller.close()
      } catch (err) {
        e({ type: 'error', error: String(err) })
        controller.close()
      }
    },
  })

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
}
