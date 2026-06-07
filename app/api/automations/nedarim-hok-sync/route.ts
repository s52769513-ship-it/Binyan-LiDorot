import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

export async function GET() {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('ran_at, details')
    .eq('automation', 'nedarim-hok-sync')
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
        // 1. Fetch הו"ק list from Nedarim
        send({ type: 'log', message: 'מושך רשימת הו"ק מנדרים...' })
        const url = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavKevaNew&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}`
        const resp = await fetch(url)
        if (!resp.ok) throw new Error(`Nedarim returned ${resp.status}`)
        const json = await resp.json()
        if (json.Result !== 0) throw new Error(json.Message ?? 'Nedarim error')

        const records: Record<string, string>[] = json.data ?? []
        send({ type: 'log', message: `קיבלנו ${records.length} הו"ק מנדרים` })

        let updated = 0, created = 0, skipped = 0

        for (let i = 0; i < records.length; i++) {
          const r = records[i]
          const externalId = String(r.DT_RowId ?? '').trim()
          if (!externalId) { skipped++; continue }

          const chargeAmount   = Number(String(r['6'] ?? '').replace(/[^\d.]/g, '')) || null
          const creditBalance  = Number(String(r['5'] ?? '').replace(/[^\d.]/g, '')) || null
          const projectName    = String(r['7'] ?? '').trim() || null
          const bankRaw        = String(r['3'] ?? '').trim()
          const clientName     = String(r['2'] ?? '').trim()

          // Parse bank info — format varies, usually "bankName sniph account"
          const bankParts = bankRaw.split(/\s+/)
          const bankName  = bankParts[0] ?? ''
          const bankBranch = bankParts[1] ?? ''
          const bankAccount = bankParts[2] ?? ''

          // Find existing standing_orders by external_id
          const { data: existing } = await supabaseAdmin
            .from('standing_orders')
            .select('id, parent_id')
            .eq('external_id', externalId)
            .limit(1)

          if (existing && existing.length > 0) {
            if (!dryRun) {
              await supabaseAdmin.from('standing_orders').update({
                charge_amount:  chargeAmount,
                credit_balance: creditBalance,
                project_name:   projectName,
                bank_name:      bankName || undefined,
                bank_branch:    bankBranch || undefined,
                bank_account:   bankAccount || undefined,
              }).eq('id', existing[0].id)
            }
            updated++
            send({ type: 'log', message: `עודכן הו"ק ${externalId} (${clientName})${dryRun ? ' [dry]' : ''}` })
          } else {
            skipped++
            send({ type: 'log', message: `הו"ק ${externalId} (${clientName}) לא נמצא במערכת — דלג` })
          }

          send({ type: 'progress', current: i + 1, total: records.length })
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id:         crypto.randomUUID(),
            automation: 'nedarim-hok-sync',
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
