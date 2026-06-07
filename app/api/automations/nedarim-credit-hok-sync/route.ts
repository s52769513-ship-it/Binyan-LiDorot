import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

// Format expiry: "1225" → "12/25"
function fmtExpiry(raw: string): string {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 4) return `${s.slice(0, 2)}/${s.slice(2)}`
  return s
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
        // API returns {data:[...],TotalMonth,...} with no Result field on success
        if (json.Result != null && json.Result !== 0) throw new Error(`Nedarim: ${json.Message ?? json.ErrorMessage ?? json.Result}`)
        if (!Array.isArray(json.data)) throw new Error(`Nedarim: unexpected response — ${JSON.stringify(json).slice(0, 200)}`)

        const records: Record<string, string>[] = json.data ?? []
        send({ type: 'log', message: `קיבלנו ${records.length} הו"ק אשראי מנדרים` })
        send({ type: 'log', message: `סה"כ חודשי: ₪${json.TotalMonth ?? 0} | צפי שנתי: ₪${json.TotalYear ?? 0}` })

        let updated = 0, skipped = 0

        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          const externalId   = String(r.DT_RowId ?? '').trim()
          if (!externalId) { skipped++; continue }

          const chargeAmount  = Number(String(r['4'] ?? '').replace(/[^\d.]/g, '')) || null
          const projectName   = String(r['5'] ?? '').trim() || null
          const notes         = String(r['6'] ?? '').trim()
          const creditBalance = Number(String(r['7'] ?? '').replace(/[^\d.]/g, '')) || null
          const cardLast4     = String(r['11'] ?? '').trim() || null
          const cardExpiry    = fmtExpiry(r['12'] ?? '')
          const clientName    = String(r['2'] ?? '').trim()

          // Find existing standing_order by external_id
          const { data: existing } = await supabaseAdmin
            .from('standing_orders')
            .select('id')
            .eq('external_id', externalId)
            .limit(1)

          if (existing && existing.length > 0) {
            if (!dryRun) {
              await supabaseAdmin.from('standing_orders').update({
                standing_order_type: 'אשראי',
                charge_amount:       chargeAmount,
                credit_balance:      creditBalance,
                project_name:        projectName,
                card_last4:          cardLast4,
                card_expiry:         cardExpiry || null,
                notes:               notes || undefined,
              }).eq('id', existing[0].id)
            }
            updated++
            send({ type: 'log', message: `עודכן הו"ק אשראי ${externalId} (${clientName})${dryRun ? ' [dry]' : ''}` })
          } else {
            skipped++
            send({ type: 'log', message: `הו"ק אשראי ${externalId} (${clientName}) לא נמצא — דלג` })
          }

          send({ type: 'progress', current: i + 1, total: records.length })
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id:         crypto.randomUUID(),
            automation: 'nedarim-credit-hok-sync',
            ran_at:     new Date().toISOString(),
            details:    { updated, skipped, total: records.length },
          })
        }

        send({ type: 'done', updated, skipped, total: records.length, dryRun })
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
