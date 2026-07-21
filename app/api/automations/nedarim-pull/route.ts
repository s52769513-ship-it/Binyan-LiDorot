import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { applyPaymentToParentPPs, findPaymentTarget, ppTypeForProject } from '@/lib/ppPayments'
import { relinkParent } from '@/lib/relink'

declare const process: { env: Record<string, string | undefined> }

function emit(controller: ReadableStreamDefaultController, encoder: TextEncoder, event: object) {
  controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
}

function parseNedarimDate(dateStr: string): { date: string; monthYear: string } {
  const [datePart] = String(dateStr || '').split(' ')
  const parts = datePart.split('/')
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts
    return { date: `${yyyy}-${mm}-${dd}`, monthYear: `${mm}/${yyyy}` }
  }
  const today = new Date().toISOString().split('T')[0]
  const [y, m] = today.split('-')
  return { date: today, monthYear: `${m}/${y}` }
}

// GET — last pull info
export async function GET() {
  try {
    const { data: logs } = await supabaseAdmin
      .from('automation_logs')
      .select('run_at, summary, details')
      .eq('automation_id', 'nedarim-pull')
      .eq('status', 'success')
      .eq('dry_run', false)
      .order('run_at', { ascending: false })
      .limit(1)

    const last = logs?.[0] ?? null
    return NextResponse.json({
      lastRun: last?.run_at ?? null,
      lastSummary: last?.summary ?? null,
      lastTo: (last?.details as Record<string, unknown> | null)?.to ?? null,
    })
  } catch {
    return NextResponse.json({ lastRun: null, lastSummary: null, lastTo: null })
  }
}

// POST — pull data
export async function POST(req: NextRequest) {
  const body = await req.json()
  const { from, to, dryRun = false, parentId } = body as { from: string; to: string; dryRun: boolean; parentId?: string }

  if (!from || !to) {
    return NextResponse.json({ error: 'חסרים from/to' }, { status: 400 })
  }

  const mosadId   = process.env.NEDARIM_MOSAD_ID    ?? '7015093'
  const apiPass   = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

  const encoder = new TextEncoder()
  const stream  = new ReadableStream({
    async start(controller) {
      const e = (ev: object) => emit(controller, encoder, ev)

      let totalImported = 0
      let totalReturned = 0
      let totalSkipped  = 0
      let totalAmount   = 0

      // If parentId provided — build a set of allowed hokNumbers for this parent
      let parentHokNumbers: Set<string> | null = null
      if (parentId) {
        const { data: parentSos } = await supabaseAdmin
          .from('standing_orders')
          .select('external_id')
          .or(`parent_id.eq.${parentId},linked_parent_id.eq.${parentId}`)
          .eq('standing_order_type', 'בנקאי')
        parentHokNumbers = new Set((parentSos ?? []).map(s => String(s.external_id)).filter(Boolean))
        e({ type: 'step', step: 1, msg: `סינון להורה: ${parentHokNumbers.size} הו"ק בנקאי` })
      }
      const actions: object[] = []

      try {
        // Step 1 — fetch from Nedarim Masav API
        e({ type: 'step', step: 1, msg: `מושך נתונים מנדרים (${from} – ${to})...` })

        const url = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavHistoryNew&MosadId=${mosadId}&ApiPassword=${apiPass}&From=${encodeURIComponent(from)}&To=${encodeURIComponent(to)}`
        const res = await fetch(url)
        if (!res.ok) {
          e({ type: 'error', error: `שגיאת Nedarim API: ${res.status}` })
          controller.close(); return
        }
        const raw = await res.text()

        let parsed: { data?: Record<string, unknown>[] } = {}
        try { parsed = JSON.parse(raw) } catch {
          e({ type: 'error', error: 'תגובה לא תקינה מנדרים' }); controller.close(); return
        }

        const records = (parsed?.data ?? []) as Record<string, unknown>[]
        e({ type: 'step', step: 1, msg: `נמצאו ${records.length} רשומות` })

        if (records.length === 0) {
          e({ type: 'complete', imported: 0, returned: 0, skipped: 0, totalAmount: 0, dryRun, actions })
          controller.close(); return
        }

        // Step 2 — load already-imported DT_RowIds
        e({ type: 'step', step: 2, msg: 'בודק רשומות שכבר יובאו...' })
        const { data: prevLogs } = await supabaseAdmin
          .from('automation_logs')
          .select('details')
          .eq('automation_id', 'nedarim-pull')
          .eq('dry_run', false)
          .eq('status', 'success')
          .limit(200)

        const importedRowIds = new Set<string>()
        for (const log of prevLogs ?? []) {
          const ids = (log.details as Record<string, unknown> | null)?.rowIds
          if (Array.isArray(ids)) ids.forEach((id: unknown) => importedRowIds.add(String(id)))
        }

        // Step 3 — process each record
        e({ type: 'step', step: 3, msg: 'מעבד רשומות...' })

        const today   = new Date().toISOString().split('T')[0]
        const newRowIds: string[] = []

        for (let i = 0; i < records.length; i++) {
          const rec       = records[i]
          const hokNumber = String(rec['2'] ?? '').trim()       // מספר הו"ק
          const donorName = String(rec['3'] ?? '').trim()       // שם תורם
          const dateRaw   = String(rec['4'] ?? '').trim()       // תאריך
          const amount    = Number(rec['5'] ?? 0)               // סכום
          const status    = String(rec['6'] ?? '').trim()       // סטטוס
          const category  = String(rec['8'] ?? '').trim()       // קטגוריה
          const rowId     = String(rec['DT_RowId'] ?? '').trim()

          // Skip if not in parent's standing orders (when filtering by parent)
          if (parentHokNumbers !== null && !parentHokNumbers.has(hokNumber)) {
            totalSkipped++
            continue
          }

          // Skip already imported
          if (rowId && importedRowIds.has(rowId)) {
            totalSkipped++
            e({ type: 'progress', current: i + 1, total: records.length, hokNumber, donorName, amount, status, skipped: true, reason: 'יובא כבר' })
            actions.push({ hokNumber, donorName, skipped: true, reason: 'יובא כבר' })
            continue
          }

          e({ type: 'progress', current: i + 1, total: records.length, hokNumber, donorName, amount, status })

          const isReturned = status === 'החזרת הוראת קבע' || status.includes('חזרה')

          // Find parent via standing order external_id
          const { data: soRows } = await supabaseAdmin
            .from('standing_orders')
            .select('id, parent_id, linked_parent_id')
            .eq('external_id', hokNumber)
            .limit(1)

          const so = soRows?.[0] ?? null
          const standingOrderDbId = so?.id ?? null
          const payerParentId     = so?.parent_id ?? null
          const billingParentId   = so?.linked_parent_id ?? payerParentId

          if (!payerParentId) {
            totalSkipped++
            e({ type: 'progress', current: i + 1, total: records.length, hokNumber, donorName, amount, status, skipped: true, reason: 'הו"ק לא נמצא במערכת' })
            actions.push({ hokNumber, donorName, amount, status, skipped: true, reason: 'הו"ק לא נמצא במערכת' })
            continue
          }

          const { date, monthYear } = parseNedarimDate(dateRaw)
          const projectName = category || 'בנין לדורות'
          const notes = [`נדרים`, rowId ? `DT:${rowId}` : null, status || null].filter(Boolean).join(' · ')

          if (isReturned) {
            // Create a negative transaction for the returned amount + fee
            if (!dryRun) {
              // Return transaction (negative amount)
              await supabaseAdmin.from('transactions').insert({
                id:                 crypto.randomUUID(),
                amount:             -amount,
                type:               'החזרת הו"ק',
                date:               today,
                month_year:         monthYear,
                notes:              `${notes} · ${donorName}`,
                parent_ids:         Array.from(new Set([payerParentId, ...(billingParentId && billingParentId !== payerParentId ? [billingParentId] : [])])),
                project_ids:        [],
                project_names:      [projectName],
                planned_payment_id: null,
                standing_order_id:  standingOrderDbId,
                synced_at:          '2099-12-31T23:59:59.999Z',
              })
              // Return fee (25 NIS)
              await supabaseAdmin.from('transactions').insert({
                id:                 crypto.randomUUID(),
                amount:             -25,
                type:               'עמלת החזרת הו"ק',
                date:               today,
                month_year:         monthYear,
                notes:              `עמלת החזרת הו"ק · ${donorName}`,
                parent_ids:         [payerParentId],
                project_ids:        [],
                project_names:      ['עמלות'],
                planned_payment_id: null,
                standing_order_id:  standingOrderDbId,
                synced_at:          '2099-12-31T23:59:59.999Z',
              })
              // שחזור החוב: ריענון ההורה מסמן את החיוב שחזר ומנתק אותו מה-PP,
              // כך שהחוב של אותו חודש נפתח מחדש.
              const debtParentId = billingParentId ?? payerParentId
              if (debtParentId) {
                try { await relinkParent(debtParentId) }
                catch (err) { e({ type: 'log', message: `ריענון לאחר החזרה נכשל — ${String(err)}` }) }
              }
            }
            if (rowId) newRowIds.push(rowId)
            totalReturned++
            actions.push({ hokNumber, donorName, amount: -amount, status, monthYear, isReturned: true, skipped: false })
            continue
          }

          // Successful payment — apply to open PPs of the matching debt type
          // (project דמי מגבית → donation PP, otherwise tuition PP)
          let linkedPPId: string | null = null
          const ppParentId = billingParentId ?? payerParentId
          const targetPPType = ppTypeForProject(projectName)

          if (dryRun) {
            if (ppParentId) linkedPPId = (await findPaymentTarget(ppParentId, monthYear, targetPPType)).ppId
          } else {
            const newTxId = crypto.randomUUID()
            if (ppParentId) {
              linkedPPId = (await applyPaymentToParentPPs({
                parentId: ppParentId, amount, preferredMonthYear: monthYear, ppType: targetPPType,
                source: { txId: newTxId, label: monthYear, date },
              })).ppId
            }

            const txParentIds = Array.from(new Set([
              payerParentId,
              ...(billingParentId && billingParentId !== payerParentId ? [billingParentId] : []),
            ]))

            await supabaseAdmin.from('transactions').insert({
              id:                 newTxId,
              amount,
              type:               'הו"ק',
              date,
              month_year:         monthYear,
              notes:              `${notes} · ${donorName}`,
              parent_ids:         txParentIds,
              project_ids:        [],
              project_names:      [projectName],
              planned_payment_id: linkedPPId,
              standing_order_id:  standingOrderDbId,
              synced_at:          '2099-12-31T23:59:59.999Z',
            })
          }

          if (rowId) newRowIds.push(rowId)
          totalImported++
          totalAmount += amount
          actions.push({ hokNumber, donorName, amount, status, monthYear, ppLinked: !!linkedPPId, skipped: false })
        }

        // Step 4 — log
        if (!dryRun) {
          try {
            await supabaseAdmin.from('automation_logs').insert({
              id:            crypto.randomUUID(),
              automation_id: 'nedarim-pull',
              run_at:        new Date().toISOString(),
              dry_run:       false,
              parent_id:     null,
              parent_name:   null,
              actions_count: totalImported,
              status:        'success',
              summary:       `נדרים הו"ק: יובאו ${totalImported} · החזרות ${totalReturned} · דולגו ${totalSkipped} · ₪${totalAmount} (${from}–${to})`,
              details:       { from, to, rowIds: newRowIds, actions },
            })
          } catch { /* best effort */ }
        }

        e({ type: 'complete', imported: totalImported, returned: totalReturned, skipped: totalSkipped, totalAmount, dryRun, actions })
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
