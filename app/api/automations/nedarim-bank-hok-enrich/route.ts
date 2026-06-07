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
        // Load all bank standing orders from DB
        const { data: soList, error } = await supabaseAdmin
          .from('standing_orders')
          .select('id, external_id, parent_id')
          .neq('external_id', '')
          .or('standing_order_type.eq.בנקאי,standing_order_type.is.null')

        if (error) throw error
        const bankSOs = (soList ?? []).filter(s => s.external_id)
        send({ type: 'log', message: `נמצאו ${bankSOs.length} הו"ק בנקאי לעדכון` })

        let updated = 0, skipped = 0, deleted = 0

        for (let i = 0; i < bankSOs.length; i++) {
          const so = bankSOs[i]
          send({ type: 'progress', current: i + 1, total: bankSOs.length })

          try {
            const url = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavId&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MasavId=${encodeURIComponent(so.external_id)}`
            const resp = await fetch(url)
            if (!resp.ok) { skipped++; continue }
            const json = await resp.json()
            if (json.Result !== 0) { skipped++; continue }

            const isDeleted = String(json.Deleted) === '1'
            const chargeAmount = Number(String(json.Amount ?? '').replace(/[^\d.]/g, '')) || null
            const projectName  = String(json.Groupe   ?? '').trim() || null
            const bankName     = String(json.Bank     ?? '').trim() || null
            const bankBranch   = String(json.Agency   ?? '').trim() || null
            const bankAccount  = String(json.Account  ?? '').trim() || null
            const soStatus     = isDeleted ? 'מבוטל' : String(json.StatusText ?? '').trim() || 'פעיל'
            const clientZeout  = String(json.ClientZeout ?? '').trim()
            const notes        = String(json.Comments   ?? '').trim()

            send({
              type: 'log',
              message: `${so.external_id}: ${json.ClientName ?? ''} — ${soStatus}${isDeleted ? ' 🗑' : ''}${dryRun ? ' [dry]' : ''}`,
            })

            if (!dryRun) {
              const updatePayload: Record<string, unknown> = {
                standing_order_type: 'בנקאי',
                charge_amount:  chargeAmount,
                project_name:   projectName,
                bank_name:      bankName,
                bank_branch:    bankBranch,
                bank_account:   bankAccount,
                so_status:      soStatus,
              }
              if (notes) updatePayload.notes = notes
              await supabaseAdmin.from('standing_orders').update(updatePayload).eq('id', so.id)

              // If ת"ז found and parent not yet known, try to match
              if (clientZeout && so.parent_id) {
                // Already has parent — optionally update id_number on parent
                await supabaseAdmin.from('parents')
                  .update({ id_number: clientZeout })
                  .eq('id', so.parent_id)
                  .is('id_number', null)
              }
            }

            isDeleted ? deleted++ : updated++
          } catch {
            skipped++
          }
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id:         crypto.randomUUID(),
            automation: 'nedarim-bank-hok-enrich',
            ran_at:     new Date().toISOString(),
            details:    { updated, deleted, skipped, total: bankSOs.length },
          })
        }

        send({ type: 'done', updated, deleted, skipped, total: bankSOs.length, dryRun })
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
