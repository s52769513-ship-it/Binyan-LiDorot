import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

function parseBankField(raw: string): { bankName: string; bankBranch: string; bankAccount: string } {
  const s = String(raw ?? '').replace(/^\*/, '').trim()
  const parts = s.split('-')
  if (parts.length >= 3) return { bankName: parts[0], bankBranch: parts[1], bankAccount: parts.slice(2).join('-') }
  return { bankName: s, bankBranch: '', bankAccount: '' }
}

function parseStatus(raw: string): string {
  const s = String(raw ?? '').trim()
  if (!s) return 'פעיל'
  if (s.includes('מוקפא'))     return 'מוקפא'
  if (s.includes('נדחה'))      return 'נדחה'
  if (s.includes('בוטל'))      return 'מבוטל'
  if (s.includes('לא פעיל'))   return 'לא פעיל'
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
        // 1. Pull list from Nedarim
        send({ type: 'log', message: 'משך רשימת הו"ק בנקאי מנדרים...' })
        const listUrl = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavKevaNew&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}`
        const listResp = await fetch(listUrl)
        if (!listResp.ok) throw new Error(`Nedarim returned ${listResp.status}`)
        const listJson = await listResp.json()
        if (listJson.Result != null && listJson.Result !== 0) throw new Error(`Nedarim: ${listJson.Message ?? listJson.Result}`)
        if (!Array.isArray(listJson.data)) throw new Error('Nedarim: unexpected response format')

        const records: Record<string, string>[] = listJson.data
        send({ type: 'log', message: `קיבלנו ${records.length} הו"ק בנקאי` })

        // 2. Load parents index by id_number (ת"ז) for matching
        send({ type: 'log', message: 'טוען הורים...' })
        const { data: allParents } = await supabaseAdmin.from('parents').select('id, name, id_number')
        const parentByTz = new Map<string, { id: string; name: string }>()
        for (const p of allParents ?? []) {
          if (p.id_number) parentByTz.set(String(p.id_number).trim(), { id: p.id, name: p.name ?? '' })
        }

        // 3. Load existing standing orders by external_id
        const { data: soList } = await supabaseAdmin.from('standing_orders').select('id, external_id, standing_order_type')
        type SoRow = { id: string; external_id: string; standing_order_type: string | null }
        const existingByExtId = new Map<string, SoRow>(
          (soList ?? [])
            .filter((s): s is SoRow => !!(s.external_id && s.standing_order_type !== 'אשראי'))
            .map(s => [s.external_id, s])
        )
        send({ type: 'log', message: `${existingByExtId.size} הו"ק בנקאי קיימים בDB · ${parentByTz.size} הורים עם ת"ז` })

        type LogRow = { externalId: string; name: string; tz: string; action: string; parentAction: string; bankInfo: string; amount: string; status: string }
        const logRows: LogRow[] = []
        let updated = 0, created = 0, parentCreated = 0, skipped = 0

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

          // 4a. Try GetMasavId for ת"ז
          let tz = ''
          try {
            const idUrl = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavId&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MasavId=${encodeURIComponent(externalId)}`
            const idResp = await fetch(idUrl)
            if (idResp.ok) {
              const idJson = await idResp.json()
              // Accept response if no explicit error (Result may be absent)
              const isError = idJson.Result != null && idJson.Result !== 0
              if (!isError && idJson.ClientZeout) tz = String(idJson.ClientZeout).trim()
            }
          } catch { /* ת"ז not critical */ }

          // 4b. Find or create parent
          let parentId: string | null = null
          let parentAction = 'לא קושר'

          if (tz && parentByTz.has(tz)) {
            const p = parentByTz.get(tz)!
            parentId = p.id
            parentAction = `קושר → ${p.name}`
          } else if (!dryRun) {
            // Create new parent
            const newParentId = crypto.randomUUID()
            const { error: pErr } = await supabaseAdmin.from('parents').insert({
              id:         newParentId,
              name:       clientName || `הו"ק ${externalId}`,
              id_number:  tz || null,
            })
            if (!pErr) {
              parentId = newParentId
              parentAction = `נוצר חדש`
              parentCreated++
              if (tz) parentByTz.set(tz, { id: newParentId, name: clientName })
            }
          } else {
            parentAction = tz ? 'ת"ז לא נמצא — ייווצר' : 'אין ת"ז — ייווצר'
          }

          // 4c. Upsert standing order
          const payload: Record<string, unknown> = {
            external_id:         externalId,
            standing_order_type: 'בנקאי',
            parent_id:           parentId,
            charge_amount:       chargeAmount,
            project_name:        projectName,
            bank_name:           bankName || null,
            bank_branch:         bankBranch || null,
            bank_account:        bankAccount || null,
            so_status:           soStatus,
          }
          if (notes) payload.notes = notes

          let action = ''
          const existing = existingByExtId.get(externalId)
          if (!dryRun) {
            if (existing) {
              await supabaseAdmin.from('standing_orders').update(payload).eq('id', existing.id)
              action = 'עודכן'; updated++
            } else {
              await supabaseAdmin.from('standing_orders').insert({ id: crypto.randomUUID(), ...payload })
              action = 'נוצר'; created++
            }
          } else {
            action = existing ? 'יעודכן' : 'ייווצר'
            existing ? updated++ : created++
          }

          const logRow: LogRow = {
            externalId, name: clientName, tz,
            action, parentAction,
            bankInfo: bankRaw, amount: String(chargeAmount ?? ''), status: soStatus,
          }
          logRows.push(logRow)
          send({ type: 'log', message: `${externalId} · ${clientName} · ${action} · ${parentAction}` })
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id: crypto.randomUUID(), automation: 'nedarim-bank-hok-enrich',
            ran_at: new Date().toISOString(),
            details: { updated, created, parentCreated, skipped, total: records.length, rows: logRows },
          })
        }

        send({ type: 'done', updated, created, parentCreated, skipped, total: records.length, dryRun, logRows })
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
