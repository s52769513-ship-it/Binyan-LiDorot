import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

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
        // Try MosadId first (same as other bank endpoints), fall back to MosadNumber
        const listUrl = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavKevaNew&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}`
        const listResp = await fetch(listUrl)
        if (!listResp.ok) throw new Error(`Nedarim returned ${listResp.status}`)
        const listJson = await listResp.json()
        // API returns {data:[...]} with no Result field on success
        if (listJson.Result != null && listJson.Result !== 0) throw new Error(`Nedarim: ${listJson.Message ?? listJson.ErrorMessage ?? listJson.Result}`)
        if (!Array.isArray(listJson.data)) throw new Error(`Nedarim: unexpected response — ${JSON.stringify(listJson).slice(0, 200)}`)

        const nedarimIds: string[] = (listJson.data ?? [])
          .map((r: Record<string, string>) => String(r.DT_RowId ?? '').trim())
          .filter(Boolean)

        send({ type: 'log', message: `קיבלנו ${nedarimIds.length} הו"ק בנקאי מנדרים` })

        // Step 2: Load existing standing_orders from DB (all, filter in JS)
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

        let updated = 0, created = 0, skipped = 0, deleted = 0

        for (let i = 0; i < nedarimIds.length; i++) {
          const externalId = nedarimIds[i]
          send({ type: 'progress', current: i + 1, total: nedarimIds.length })

          try {
            const url = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavId&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MasavId=${encodeURIComponent(externalId)}`
            const resp = await fetch(url)
            if (!resp.ok) { skipped++; continue }
            const json = await resp.json()
            if (json.Result !== 0) { skipped++; continue }

            const isDeleted    = String(json.Deleted) === '1'
            const chargeAmount = Number(String(json.Amount ?? '').replace(/[^\d.]/g, '')) || null
            const projectName  = String(json.Groupe      ?? '').trim() || null
            const bankName     = String(json.Bank        ?? '').trim() || null
            const bankBranch   = String(json.Agency      ?? '').trim() || null
            const bankAccount  = String(json.Account     ?? '').trim() || null
            const soStatus     = isDeleted ? 'מבוטל' : String(json.StatusText ?? '').trim() || 'פעיל'
            const clientZeout  = String(json.ClientZeout ?? '').trim()
            const clientName   = String(json.ClientName  ?? '').trim()
            const notes        = String(json.Comments    ?? '').trim()

            send({
              type: 'log',
              message: `${externalId}: ${clientName} — ${soStatus}${isDeleted ? ' 🗑' : ''}${dryRun ? ' [dry]' : ''}`,
            })

            const existing = existingByExtId.get(externalId)

            if (!dryRun) {
              const payload: Record<string, unknown> = {
                external_id:          externalId,
                standing_order_type:  'בנקאי',
                charge_amount:        chargeAmount,
                project_name:         projectName,
                bank_name:            bankName,
                bank_branch:          bankBranch,
                bank_account:         bankAccount,
                so_status:            soStatus,
              }
              if (notes) payload.notes = notes

              if (existing) {
                // Update existing record
                await supabaseAdmin.from('standing_orders').update(payload).eq('id', existing.id)

                // Update parent ת"ז if found and missing
                if (clientZeout && existing.parent_id) {
                  await supabaseAdmin.from('parents')
                    .update({ id_number: clientZeout })
                    .eq('id', existing.parent_id)
                    .is('id_number', null)
                }
              } else {
                // Try to find parent by ת"ז
                let parentId: string | null = null
                if (clientZeout) {
                  const { data: matched } = await supabaseAdmin
                    .from('parents')
                    .select('id')
                    .eq('id_number', clientZeout)
                    .limit(1)
                  if (matched && matched.length > 0) parentId = matched[0].id
                }

                // Create new standing order
                await supabaseAdmin.from('standing_orders').insert({
                  id:         crypto.randomUUID(),
                  parent_id:  parentId,
                  ...payload,
                })
                created++
                send({ type: 'log', message: `  → נוצר חדש${parentId ? ' (קושר להורה)' : ' (ללא הורה)'}` })
              }
            }

            if (existing) {
              isDeleted ? deleted++ : updated++
            } else if (dryRun) {
              created++
            }
          } catch {
            skipped++
          }
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id:         crypto.randomUUID(),
            automation: 'nedarim-bank-hok-enrich',
            ran_at:     new Date().toISOString(),
            details:    { updated, created, deleted, skipped, total: nedarimIds.length },
          })
        }

        send({ type: 'done', updated, created, deleted, skipped, total: nedarimIds.length, dryRun })
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
