import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

// Parse "bank-branch-account" or "*bank-branch-account" from Nedarim field '3'
function parseBankField(raw: string): { bankName: string; bankBranch: string; bankAccount: string } {
  const s = String(raw ?? '').replace(/^\*/, '').trim()
  const parts = s.split('-')
  if (parts.length >= 3) {
    return { bankName: parts[0], bankBranch: parts[1], bankAccount: parts.slice(2).join('-') }
  }
  return { bankName: s, bankBranch: '', bankAccount: '' }
}

// Derive status from field '4' (next charge date or status text)
function parseStatus(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return 'פעיל'
  if (s.includes('מוקפא'))  return 'מוקפא'
  if (s.includes('נדחה'))   return 'נדחה'
  if (s.includes('בוטל'))   return 'מבוטל'
  if (s.includes('לא פעיל')) return 'לא פעיל'
  if (s.includes('הטופס נשלח')) return 'ממתין לבנק'
  return 'פעיל'
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('ran_at, details')
    .eq('automation', 'nedarim-bank-hok-enrich')
    .order('ran_at', { ascending: false })
    .limit(1)
  return NextResponse.json(data?.[0] ?? null)
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const dryRun = body.dryRun === true

  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'))

      try {
        // Step 1: Pull full list from Nedarim GetMasavKevaNew
        send({ type: 'log', message: 'משך רשימת הו"ק בנקאי מנדרים...' })
        const listUrl = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavKevaNew&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}`
        const listResp = await fetch(listUrl)
        if (!listResp.ok) throw new Error(`Nedarim returned ${listResp.status}`)
        const listJson = await listResp.json()
        if (listJson.Result != null && listJson.Result !== 0)
          throw new Error(`Nedarim: ${listJson.Message ?? listJson.Result}`)
        if (!Array.isArray(listJson.data))
          throw new Error(`Nedarim: unexpected response — ${JSON.stringify(listJson).slice(0, 200)}`)

        const records: Record<string, string>[] = listJson.data
        send({ type: 'log', message: `קיבלנו ${records.length} הו"ק בנקאי מנדרים` })

        // Step 2: Load existing standing_orders from DB (filter in JS — no Hebrew in PostgREST)
        const { data: soList, error } = await supabaseAdmin
          .from('standing_orders')
          .select('id, external_id, parent_id, standing_order_type')
        if (error) throw error

        type SoRow = { id: string; external_id: string; parent_id: string | null; standing_order_type: string | null }
        const existingByExtId = new Map<string, SoRow>(
          (soList ?? [])
            .filter((s): s is SoRow => !!(s.external_id && s.standing_order_type !== 'אשראי'))
            .map(s => [s.external_id, s])
        )
        send({ type: 'log', message: `${existingByExtId.size} הו"ק בנקאי קיימים בDB` })

        let updated = 0, created = 0, skipped = 0

        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          const externalId = String(r.DT_RowId ?? '').trim()
          if (!externalId) { skipped++; continue }

          send({ type: 'progress', current: i + 1, total: records.length })

          const clientName   = String(r['2'] ?? '').trim()
          const bankRaw      = String(r['3'] ?? '').trim()
          const statusRaw    = String(r['4'] ?? '').trim()
          const chargeAmount = Number(String(r['6'] ?? '').replace(/[^\d.]/g, '')) || null
          const projectName  = String(r['7'] ?? '').trim() || null
          const notes        = String(r['8'] ?? '').trim()
          const soStatus     = parseStatus(statusRaw)
          const { bankName, bankBranch, bankAccount } = parseBankField(bankRaw)

          send({
            type: 'log',
            message: `${externalId}: ${clientName} — ${soStatus}${dryRun ? ' [dry]' : ''}`,
          })

          if (!dryRun) {
            const payload: Record<string, unknown> = {
              external_id:         externalId,
              standing_order_type: 'בנקאי',
              charge_amount:       chargeAmount,
              project_name:        projectName,
              bank_name:           bankName || null,
              bank_branch:         bankBranch || null,
              bank_account:        bankAccount || null,
              so_status:           soStatus,
            }
            if (notes) payload.notes = notes

            const existing = existingByExtId.get(externalId)
            if (existing) {
              await supabaseAdmin.from('standing_orders').update(payload).eq('id', existing.id)
              updated++
            } else {
              await supabaseAdmin.from('standing_orders').insert({
                id: crypto.randomUUID(),
                parent_id: null,
                ...payload,
              })
              created++
              send({ type: 'log', message: `  → נוצר חדש` })
            }
          } else {
            existingByExtId.has(externalId) ? updated++ : created++
          }
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id:         crypto.randomUUID(),
            automation: 'nedarim-bank-hok-enrich',
            ran_at:     new Date().toISOString(),
            details:    { updated, created, skipped, total: records.length },
          })
        }

        send({ type: 'done', updated, created, skipped, total: records.length, dryRun })
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
