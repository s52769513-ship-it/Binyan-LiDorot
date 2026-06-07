import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

function fmtExpiry(raw: string): string {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 4) return `${s.slice(0, 2)}/${s.slice(2)}`
  return s
}

// Normalize Hebrew name for fuzzy matching: remove titles, extra spaces
function normalizeName(n: string): string {
  return n
    .replace(/\b(הרב|ר'|ר"|רב|בר"?[א-ת]|בריא"ז|ברי"ט|ברי"מ|ברא"צ|ברא"ז|בר"ל|בר"מ|בר"צ|בר"א|בר"ב|בר"ש|בר"ד)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeName(a).toLowerCase()
  const nb = normalizeName(b).toLowerCase()
  if (na === nb) return true
  // check if one contains all words of the other
  const wa = na.split(' ').filter(Boolean)
  const wb = nb.split(' ').filter(Boolean)
  if (wa.length >= 2 && wb.length >= 2) {
    // at least 2 words in common
    const common = wa.filter(w => wb.includes(w))
    if (common.length >= 2) return true
  }
  return false
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('ran_at, details')
    .eq('automation', 'nedarim-credit-hok-sync')
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
        send({ type: 'log', message: 'מושך רשימת הו"ק אשראי מנדרים...' })

        const url = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetKevaNew&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}`
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`Nedarim returned ${resp.status}`)
        const json = await resp.json()
        if (json.Result != null && json.Result !== 0) throw new Error(`Nedarim: ${json.Message ?? json.Result}`)
        if (!Array.isArray(json.data)) throw new Error('Nedarim: unexpected response format')

        const records: Record<string, string>[] = json.data
        send({ type: 'log', message: `קיבלנו ${records.length} הו"ק אשראי` })
        send({ type: 'log', message: `סה"כ חודשי: ₪${json.TotalMonth ?? 0} | צפי שנתי: ₪${json.TotalYear ?? 0}` })

        // Load all parents for name matching
        send({ type: 'log', message: 'טוען הורים...' })
        const { data: allParents } = await supabaseAdmin.from('parents').select('id, name, id_number')
        const parentList = (allParents ?? []).map(p => ({ id: p.id, name: String(p.name ?? ''), tz: String(p.id_number ?? '') }))

        // Load existing standing orders
        const { data: soList } = await supabaseAdmin.from('standing_orders').select('id, external_id, standing_order_type')
        type SoRow = { id: string; external_id: string; standing_order_type: string | null }
        const existingByExtId = new Map<string, SoRow>(
          (soList ?? [])
            .filter((s): s is SoRow => !!s.external_id)
            .map(s => [s.external_id, s])
        )
        send({ type: 'log', message: `${existingByExtId.size} הו"ק קיימים בDB · ${parentList.length} הורים` })

        type LogRow = { externalId: string; name: string; action: string; parentAction: string; amount: string; category: string; status: string }
        const logRows: LogRow[] = []
        let updated = 0, created = 0, parentCreated = 0, skipped = 0

        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          const externalId    = String(r.DT_RowId ?? '').trim()
          if (!externalId) { skipped++; continue }

          send({ type: 'progress', current: i + 1, total: records.length })

          const clientName    = String(r['2'] ?? '').trim()
          const chargeAmount  = Number(String(r['4'] ?? '').replace(/[^\d.]/g, '')) || null
          const projectName   = String(r['5'] ?? '').trim() || null
          const notes         = String(r['6'] ?? '').trim()
          const creditBalance = Number(String(r['7'] ?? '').replace(/[^\d.]/g, '')) || null
          const statusRaw     = String(r['10'] ?? '').trim()
          const cardLast4     = String(r['11'] ?? '').trim() || null
          const cardExpiry    = fmtExpiry(r['12'] ?? '')

          // Derive status from field 10
          let soStatus = 'פעיל'
          if (statusRaw.includes('מוקפא'))    soStatus = 'מוקפא'
          else if (statusRaw.includes('לא פעיל')) soStatus = 'לא פעיל'
          else if (statusRaw.includes('בוטל'))  soStatus = 'מבוטל'
          else if (statusRaw.includes('סירוב')) soStatus = 'סירוב'

          // Find parent by name match
          let parentId: string | null = null
          let parentAction = 'לא קושר'
          const matched = parentList.find(p => clientName && namesMatch(p.name, clientName))

          if (matched) {
            parentId = matched.id
            parentAction = `קושר → ${matched.name}`
          } else if (!dryRun) {
            const newParentId = crypto.randomUUID()
            const { error: pErr } = await supabaseAdmin.from('parents').insert({
              id:   newParentId,
              name: clientName || `הו"ק אשראי ${externalId}`,
            })
            if (!pErr) {
              parentId = newParentId
              parentAction = 'נוצר חדש'
              parentCreated++
              parentList.push({ id: newParentId, name: clientName, tz: '' })
            }
          } else {
            parentAction = 'שם לא נמצא — ייווצר'
          }

          const payload: Record<string, unknown> = {
            external_id:         externalId,
            standing_order_type: 'אשראי',
            parent_id:           parentId,
            charge_amount:       chargeAmount,
            credit_balance:      creditBalance,
            project_name:        projectName,
            card_last4:          cardLast4,
            card_expiry:         cardExpiry || null,
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

          const logRow: LogRow = { externalId, name: clientName, action, parentAction, amount: String(chargeAmount ?? ''), category: projectName ?? '', status: soStatus }
          logRows.push(logRow)
          send({ type: 'log', message: `${externalId} · ${clientName} · ${action} · ${parentAction}` })
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id: crypto.randomUUID(), automation: 'nedarim-credit-hok-sync',
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
