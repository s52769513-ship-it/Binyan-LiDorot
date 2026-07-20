import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { applyPaymentToParentPPs, findPaymentTarget, ppTypeForProject } from '@/lib/ppPayments'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

const AUTOMATION_ID = 'nedarim-bank-hok-pull'

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

// The Masav (bank) API's history shape is not officially documented the way
// the credit GetKevaId/HistoryData one is, so we extract defensively: look for
// the first array-of-objects field under any of several likely names, and read
// each transaction's id/status/amount/date from any of several likely keys.
// In dry-run we also surface the raw response shape so it can be calibrated
// against a real account before any writes happen.
function findHistoryArray(json: Record<string, unknown>): { key: string; rows: Record<string, unknown>[] } | null {
  const candidates = ['HistoryData', 'History', 'Transactions', 'Movements', 'Rows', 'data', 'Data']
  for (const k of candidates) {
    const v = json[k]
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      return { key: k, rows: v as Record<string, unknown>[] }
    }
  }
  // Fallback: any array-of-objects field
  for (const [k, v] of Object.entries(json)) {
    if (Array.isArray(v) && v.length && typeof v[0] === 'object') {
      return { key: k, rows: v as Record<string, unknown>[] }
    }
  }
  return null
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v != null && String(v).trim() !== '') return String(v).trim()
  }
  return ''
}

// Map a status string/code to charged | refused | other.
// Masav returns text like "שולם"/"חזר"/"נדחה" and/or numeric codes; the credit
// system uses 1=success, 2=refused, 3=cancelled.
function classifyStatus(raw: string): 'charged' | 'refused' | 'other' {
  const s = raw.trim()
  if (s === '1') return 'charged'
  if (s === '2' || s === '3') return 'refused'
  if (/שול[םמ]|בוצע|חוי[יב]ב|נגב[ה]|הצלח/.test(s)) return 'charged'
  if (/חזר|נדח|סירוב|בוטל|נכשל|החזר/.test(s)) return 'refused'
  return 'other'
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('run_at, details')
    .eq('automation_id', AUTOMATION_ID)
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
        // 1. Load all previously imported TransactionIds for dedup
        const { data: logs } = await supabaseAdmin
          .from('automation_logs')
          .select('details')
          .eq('automation_id', AUTOMATION_ID)
        const seenTxIds = new Set<string>(
          (logs ?? []).flatMap(l => (l.details?.txIds as string[]) ?? [])
        )

        // 2. Load bank standing orders (optionally filtered by parent)
        let soQuery = supabaseAdmin
          .from('standing_orders')
          .select('id, external_id, parent_id, linked_parent_id, project_name')
          .eq('standing_order_type', 'בנקאי')
          .neq('external_id', '')
        if (parentId) {
          soQuery = soQuery.or(`parent_id.eq.${parentId},linked_parent_id.eq.${parentId}`)
        }
        const { data: soList, error } = await soQuery
        if (error) throw error
        const bankSOs = (soList ?? []).filter(s => s.external_id)
        send({ type: 'log', message: `נמצאו ${bankSOs.length} הו"ק בנקאי לעיבוד` })

        let totalImported = 0, totalSkipped = 0, totalRefused = 0
        let totalAmount = 0
        let shapeReported = false
        const newTxIds: string[] = []

        for (let i = 0; i < bankSOs.length; i++) {
          const so = bankSOs[i]
          send({ type: 'progress', current: i + 1, total: bankSOs.length })

          try {
            const url = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavId&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MasavId=${encodeURIComponent(so.external_id)}`
            const resp = await fetch(url)
            if (!resp.ok) { send({ type: 'log', message: `הו"ק ${so.external_id}: שגיאת רשת` }); totalSkipped++; continue }
            const json = await resp.json()
            const isError = json.Result != null && json.Result !== 0
            if (isError) { send({ type: 'log', message: `הו"ק ${so.external_id}: ${json.Message ?? 'שגיאה'}` }); totalSkipped++; continue }

            const clientName = pick(json, ['ClientName', 'KevaName', 'Name'])

            const found = findHistoryArray(json)

            // Surface the raw response shape once, so an unverified Masav format
            // can be calibrated from the dry-run output before any real import.
            if (!shapeReported) {
              shapeReported = true
              const topKeys = Object.keys(json)
              const sampleKeys = found?.rows?.[0] ? Object.keys(found.rows[0]) : []
              send({
                type: 'log',
                message: `🔍 מבנה תשובת Masav (${so.external_id}): שדות=[${topKeys.join(', ')}]${found ? ` · היסטוריה תחת "${found.key}" (${found.rows.length}) · שדות-תנועה=[${sampleKeys.join(', ')}]` : ' · לא נמצא מערך היסטוריה'}`,
              })
            }

            if (!found) {
              // No history array in this response — nothing to import for this SO.
              totalSkipped++
              continue
            }

            const payerParentId   = so.parent_id
            const billingParentId = so.linked_parent_id ?? null
            const projectName     = so.project_name || pick(json, ['KevaGroupe', 'Groupe', 'Project']) || 'בנין לדורות'

            for (const tx of found.rows) {
              const txId      = pick(tx, ['TransactionId', 'MasavId', 'Id', 'ID', 'RowId'])
              const statusRaw = pick(tx, ['StatusText', 'Status', 'ID', 'StatusCode'])
              const amount    = Number(pick(tx, ['Amount', 'Sum', 'ChargeAmount']).replace(/[^\d.]/g, '')) || 0
              const dateStr   = parseDate(pick(tx, ['Date', 'ChargeDate', 'NextDate', 'PayDate']))
              const monthYear = toMonthYear(dateStr)
              const cls       = classifyStatus(statusRaw)

              // Dedup on TransactionId across previous runs
              if (txId && seenTxIds.has(txId)) { totalSkipped++; continue }

              if (cls === 'refused') {
                send({ type: 'log', message: `הו"ק ${so.external_id} (${clientName}): חזר/נדחה ${dateStr || statusRaw} — דלג` })
                totalRefused++
                if (txId) { newTxIds.push(txId); seenTxIds.add(txId) }
                continue
              }
              if (cls !== 'charged' || !amount || !dateStr) { totalSkipped++; continue }

              // Apply to open PPs of the matching debt type (project דמי מגבית →
              // donation PP, otherwise tuition PP), same cascade as credit pull.
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
                  notes:              `בנקאי הו"ק ${so.external_id} · ${clientName}`,
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
            automation_id: AUTOMATION_ID,
            run_at:        new Date().toISOString(),
            dry_run:       false,
            actions_count: totalImported,
            status:        'success',
            summary:       `הו"ק בנקאי: יובאו ${totalImported} · חזרות/סירובים ${totalRefused} · דולגו ${totalSkipped} · ₪${totalAmount.toLocaleString('he-IL')}`,
            details:       { txIds: newTxIds, imported: totalImported, refused: totalRefused, skipped: totalSkipped, totalAmount },
          })
        }

        send({ type: 'done', imported: totalImported, refused: totalRefused, returned: totalRefused, skipped: totalSkipped, totalAmount, dryRun })
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
