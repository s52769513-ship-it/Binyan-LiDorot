import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { applyPaymentToParentPPs, findPaymentTarget, ppTypeForProject } from '@/lib/ppPayments'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

// Format expiry: "1225" → "12/25"
function fmtExpiry(raw: string): string {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 4) return `${s.slice(0, 2)}/${s.slice(2)}`
  return raw
}

// Parse date from Nedarim (DD/MM/YYYY or YYYY-MM-DD) → YYYY-MM-DD
function parseDate(raw: string): string {
  if (!raw) return ''
  const s = String(raw).split('T')[0]
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const p = s.split('/')
  if (p.length === 3) {
    const [d, m, y] = p
    return `${y.length === 2 ? '20' + y : y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
  }
  return s
}

// month_year from date: YYYY-MM-DD → MM/YYYY
function toMonthYear(dateStr: string): string {
  if (!dateStr) return ''
  const p = dateStr.split('-')
  if (p.length >= 2) return `${p[1]}/${p[0]}`
  return ''
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('run_at, details')
    .eq('automation_id', 'nedarim-credit-hok-pull')
    .order('run_at', { ascending: false })
    .limit(1)
  return NextResponse.json(data?.[0] ?? null)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun   = body.dryRun === true
  const parentId: string | null = body.parentId ?? null

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        // 1. Load all previous imported TransactionIds for dedup
        const { data: logs } = await supabaseAdmin
          .from('automation_logs')
          .select('details')
          .eq('automation_id', 'nedarim-credit-hok-pull')
        const seenTxIds = new Set<string>(
          (logs ?? []).flatMap(l => (l.details?.txIds as string[]) ?? [])
        )

        // 2. Load credit standing orders (optionally filtered by parent)
        let soQuery = supabaseAdmin
          .from('standing_orders')
          .select('id, external_id, parent_id, linked_parent_id, project_name')
          .eq('standing_order_type', 'אשראי')
          .neq('external_id', '')
        if (parentId) {
          soQuery = soQuery.or(`parent_id.eq.${parentId},linked_parent_id.eq.${parentId}`)
        }
        const { data: soList, error } = await soQuery

        if (error) throw error
        const creditSOs = (soList ?? []).filter(s => s.external_id)
        send({ type: 'log', message: `נמצאו ${creditSOs.length} הו"ק אשראי לעיבוד` })

        let totalImported = 0, totalSkipped = 0, totalRefused = 0
        let totalAmount = 0
        const newTxIds: string[] = []

        for (let i = 0; i < creditSOs.length; i++) {
          const so = creditSOs[i]
          send({ type: 'progress', current: i + 1, total: creditSOs.length })

          try {
            const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetKevald&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&Kevald=${encodeURIComponent(so.external_id)}`
            const resp = await fetch(url)
            if (!resp.ok) { send({ type: 'log', message: `הו"ק ${so.external_id}: שגיאת רשת` }); totalSkipped++; continue }
            const json = await resp.json()
            if (json.Result !== 0) { send({ type: 'log', message: `הו"ק ${so.external_id}: ${json.Message ?? 'שגיאה'}` }); totalSkipped++; continue }

            const clientName = String(json.KevaName ?? '').trim()

            // Update standing_order details
            if (!dryRun) {
              await supabaseAdmin.from('standing_orders').update({
                standing_order_type: 'אשראי',
                charge_amount:       Number(String(json.KevaAmount ?? '').replace(/[^\d.]/g, '')) || null,
                project_name:        String(json.KevaGroupe ?? '').trim() || null,
                credit_balance:      Number(String(json.KevaTashlumim ?? '').replace(/[^\d.]/g, '')) || null,
                card_last4:          String(json.KevaLastNum ?? '').trim() || null,
                card_expiry:         fmtExpiry(json.KevaTokef ?? '') || null,
                so_status:           json.KevaStatus === '3' ? 'מבוטל' : json.KevaStatus === '2' ? 'מושהה' : 'פעיל',
              }).eq('id', so.id)
            }

            // Process transaction history
            const history: Record<string, string>[] = json.HistoryData ?? []
            const payerParentId   = so.parent_id
            const billingParentId = so.linked_parent_id ?? null
            const projectName     = so.project_name || String(json.KevaGroupe ?? '').trim() || 'בנין לדורות'

            for (const tx of history) {
              const txId     = String(tx.TransactionId ?? '').trim()
              const status   = String(tx.ID ?? '').trim()  // 1=success, 2=refused, 3=cancelled
              const amount   = Number(String(tx.Amount ?? '').replace(/[^\d.]/g, '')) || 0
              const dateStr  = parseDate(String(tx.Date ?? ''))
              const monthYear = toMonthYear(dateStr)

              // Dedup
              if (txId && seenTxIds.has(txId)) { totalSkipped++; continue }

              if (status === '2') {
                // Refused — log but don't import (could add a refused transaction if needed)
                send({ type: 'log', message: `הו"ק ${so.external_id} (${clientName}): סירוב ${dateStr} — דלג` })
                totalRefused++
                continue
              }
              if (status === '3') {
                // Cancelled — skip
                totalSkipped++
                continue
              }
              if (status !== '1' || !amount || !dateStr) { totalSkipped++; continue }

              // Apply to open PPs of the matching debt type (shared cascade
              // logic; project דמי מגבית → donation PP, otherwise tuition PP)
              const ppParentId = billingParentId ?? payerParentId
              const targetPPType = ppTypeForProject(projectName)
              const newTxId = crypto.randomUUID()
              let linkedPPId: string | null = null

              if (dryRun) {
                if (ppParentId) linkedPPId = (await findPaymentTarget(ppParentId, monthYear, targetPPType)).ppId
              } else if (ppParentId) {
                linkedPPId = (await applyPaymentToParentPPs({
                  parentId: ppParentId, amount, preferredMonthYear: monthYear, ppType: targetPPType,
                  source: { txId: newTxId, label: monthYear, date: dateStr },
                })).ppId
              }

              send({
                type: 'log',
                message: `הו"ק ${so.external_id} (${clientName}): ₪${amount} · ${dateStr}${linkedPPId ? ' → PP' : ''}${dryRun ? ' [dry]' : ''}`,
              })

              if (!dryRun) {
                const txParentIds = Array.from(new Set([
                  ...(payerParentId ? [payerParentId] : []),
                  ...(billingParentId && billingParentId !== payerParentId ? [billingParentId] : []),
                ]))

                await supabaseAdmin.from('transactions').insert({
                  id:                 newTxId,
                  amount,
                  type:               'הו"ק',
                  date:               dateStr,
                  month_year:         monthYear,
                  notes:              `אשראי הו"ק ${so.external_id} · ${clientName}`,
                  parent_ids:         txParentIds,
                  project_ids:        [],
                  project_names:      [projectName],
                  planned_payment_id: linkedPPId,
                  standing_order_id:  so.id,
                  synced_at:          '2099-12-31T23:59:59.999Z',
                })
              }

              if (txId) { newTxIds.push(txId); seenTxIds.add(txId) }
              totalImported++
              totalAmount += amount
            }
          } catch (err) {
            send({ type: 'log', message: `הו"ק ${so.external_id}: שגיאה — ${String(err)}` })
            totalSkipped++
          }
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id:            crypto.randomUUID(),
            automation_id: 'nedarim-credit-hok-pull',
            run_at:        new Date().toISOString(),
            dry_run:       false,
            actions_count: totalImported,
            status:        'success',
            summary:       `הו"ק אשראי: יובאו ${totalImported} · סירובים ${totalRefused} · דולגו ${totalSkipped} · ₪${totalAmount.toLocaleString('he-IL')}`,
            details:       { txIds: newTxIds, imported: totalImported, refused: totalRefused, skipped: totalSkipped, totalAmount },
          })
        }

        send({ type: 'done', imported: totalImported, refused: totalRefused, skipped: totalSkipped, totalAmount, dryRun })
      } catch (err) {
        send({ type: 'error', message: String(err) })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: { 'Content-Type': 'application/x-ndjson', 'Cache-Control': 'no-cache' },
  })
}
