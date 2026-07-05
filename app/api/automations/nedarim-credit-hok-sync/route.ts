import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

function fmtExpiry(raw: string): string {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 4) return `${s.slice(0, 2)}/${s.slice(2)}`
  return s
}

// "5" | "05/08/2026" | anything containing a day-of-month → 1-31, else null
function parseChargeDay(raw: string): number | null {
  const m = String(raw ?? '').match(/\d{1,2}/)
  if (!m) return null
  const n = Number(m[0])
  return n >= 1 && n <= 31 ? n : null
}

// Words like בר"א / ברא"צ / בריא"ז are patronymic-title acronyms, not real
// name content — drop them as WHOLE words (any word containing a geresh/
// gershayim character). A partial regex strip here previously left stray
// one-letter fragments (e.g. "ברא"צ" → residual '"צ') that coincidentally
// matched between unrelated people sharing that suffix style + a first name,
// producing false-positive matches (reported: אייזנער דוד ברא"צ ≠ גורמן דוד ברא"צ).
function significantWords(n: string): string[] {
  return String(n ?? '')
    .split(/\s+/)
    .filter(Boolean)
    .filter(w => !/["'׳״]/.test(w))
    .filter(w => !['הרב', 'רב'].includes(w))
    .map(w => w.toLowerCase())
}

function namesMatch(a: string, b: string): boolean {
  const wa = significantWords(a)
  const wb = significantWords(b)
  if (!wa.length || !wb.length) return false
  if (wa.join(' ') === wb.join(' ')) return true
  if (wa.length >= 2 && wb.length >= 2) {
    return wa.filter(w => wb.includes(w)).length >= 2
  }
  return false
}

export async function GET() {
  const { data } = await supabaseAdmin
    .from('automation_logs')
    .select('run_at, details')
    .eq('automation_id', 'nedarim-credit-hok-sync')
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
        // 1. Pull the list via the documented GetKevaNew action (numbered
        // fields only — no ת"ז/card details here, no pagination; the API
        // itself caps this action at 20 requests/hour so we call it once).
        send({ type: 'log', message: 'מושך רשימת הו"ק אשראי מנדרים...' })

        type KevaRecord = Record<string, unknown>
        const listUrl = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetKevaNew&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}`
        const listResp = await fetch(listUrl)
        if (!listResp.ok) throw new Error(`Nedarim returned ${listResp.status}`)
        const listJson = await listResp.json()
        if (listJson.Result != null && listJson.Result !== 0) throw new Error(`Nedarim: ${listJson.Message ?? listJson.Result}`)
        if (!Array.isArray(listJson.data)) throw new Error('Nedarim: unexpected response format')

        const allRecords: KevaRecord[] = listJson.data
        send({ type: 'log', message: `נמצאו ${allRecords.length} הו"ק אשראי` })

        // Filter to single parent if requested — keep records already linked
        // to this parent (by external_id) AND not-yet-linked ones anywhere in
        // Nedarim's full list whose client name matches the parent, so the
        // sync can discover a הו"ק for a parent who doesn't have one locally
        // yet (not just re-sync parents that already do).
        let targetParentName = ''
        let filteredRecords = allRecords
        if (parentId) {
          const { data: targetParent } = await supabaseAdmin
            .from('parents').select('name').eq('id', parentId).single()
          targetParentName = String(targetParent?.name ?? '').trim()

          const { data: parentSos } = await supabaseAdmin
            .from('standing_orders')
            .select('external_id')
            .or(`parent_id.eq.${parentId},linked_parent_id.eq.${parentId}`)
            .eq('standing_order_type', 'אשראי')
          const parentExtIds = new Set((parentSos ?? []).map(s => String(s.external_id)).filter(Boolean))

          filteredRecords = allRecords.filter(r => {
            const eid = String(r['DT_RowId'] ?? '').trim()
            if (parentExtIds.has(eid)) return true
            return namesMatch(targetParentName, String(r['2'] ?? '').trim())
          })
        }

        send({ type: 'log', message: `סה"כ: ${filteredRecords.length} הו"ק אשראי${parentId ? ' (מסונן להורה)' : ` מתוך ${allRecords.length}`}` })

        // 2. Load parents
        send({ type: 'log', message: 'טוען הורים...' })
        const { data: allParents } = await supabaseAdmin.from('parents').select('id, name, id_number')
        const parentList = (allParents ?? []).map(p => ({
          id: p.id, name: String(p.name ?? ''), tz: String(p.id_number ?? '').trim()
        }))
        const parentByTz = new Map(parentList.filter(p => p.tz).map(p => [p.tz, p]))

        // 3. Load existing standing orders
        const { data: soList } = await supabaseAdmin.from('standing_orders').select('id, external_id, standing_order_type')
        type SoRow = { id: string; external_id: string; standing_order_type: string | null }
        const existingByExtId = new Map<string, SoRow>(
          (soList ?? []).filter((s): s is SoRow => !!s.external_id).map(s => [s.external_id, s])
        )
        send({ type: 'log', message: `${existingByExtId.size} הו"ק קיימים בDB · ${parentList.length} הורים (${parentByTz.size} עם ת"ז)` })

        type LogRow = { externalId: string; name: string; tz: string; action: string; parentAction: string; amount: string; category: string; status: string }
        const logRows: LogRow[] = []
        let updated = 0, created = 0, parentCreated = 0, skipped = 0

        for (let i = 0; i < filteredRecords.length; i++) {
          const r = filteredRecords[i] as Record<string, unknown>
          const externalId = String(r['DT_RowId'] ?? '').trim()
          if (!externalId) { skipped++; continue }

          send({ type: 'progress', current: i + 1, total: filteredRecords.length })

          // GetKevaNew numbered fields per the documented API:
          // 2 name · 3 address+phone · 4 amount · 5 category · 6 notes ·
          // 7 remaining charges · 8 times performed · 9 next charge date ·
          // 10 error text · 11 last4 · 12 expiry (MMYY)
          const clientName    = String(r['2'] ?? '').trim()
          const chargeAmount  = Number(String(r['4'] ?? '').replace(/[^\d.]/g, '')) || null
          const projectName   = String(r['5'] ?? '').trim() || null
          const notes         = String(r['6'] ?? '').trim()
          const creditBalance = Number(String(r['7'] ?? '').replace(/[^\d.]/g, '')) || null
          const errorText     = String(r['10'] ?? '').trim()
          const cardLast4     = String(r['11'] ?? '').trim() || null
          const cardExpiry    = fmtExpiry(String(r['12'] ?? '')) || null
          let   chargeDay     = parseChargeDay(String(r['9'] ?? ''))

          // GetKevaId — the only place ת"ז and canonical status live for
          // credit הו"ק (the list endpoint above doesn't expose them).
          let tz = ''
          let soStatus = errorText ? 'סירוב' : 'פעיל'
          try {
            const idUrl = `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetKevaId&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&KevaId=${encodeURIComponent(externalId)}`
            const idResp = await fetch(idUrl)
            if (idResp.ok) {
              const idJson = await idResp.json()
              const isError = idJson.Result != null && idJson.Result !== 0
              if (!isError) {
                if (idJson.KevaZeout) tz = String(idJson.KevaZeout).trim()
                if (idJson.KevaStatus === '2' || idJson.KevaStatus === 2) soStatus = 'מושהה'
                else if (idJson.KevaStatus === '3' || idJson.KevaStatus === 3) soStatus = 'מבוטל'
                else if (idJson.KevaStatus === '1' || idJson.KevaStatus === 1) soStatus = 'פעיל'
                const nd = parseChargeDay(String(idJson.KevaNextDate ?? ''))
                if (nd != null) chargeDay = nd
              }
            }
          } catch { /* לא קריטי */ }

          // Match parent: ת"ז first, then name against the whole parent
          // list; if a specific parent was requested, this record already
          // survived the parent filter above (linked or name-matched), so
          // attach it to that parent instead of creating a duplicate.
          let matchedParentId: string | null = null
          let parentAction = 'לא קושר'

          const byTz   = tz ? parentByTz.get(tz) : undefined
          const byName = !byTz && clientName ? parentList.find(p => namesMatch(p.name, clientName)) : undefined
          const matched = byTz ?? byName

          if (matched) {
            matchedParentId = matched.id
            parentAction = `קושר → ${matched.name}${byTz ? ' (ת"ז)' : ' (שם)'}`
          } else if (parentId) {
            matchedParentId = parentId
            parentAction = `קושר → ${targetParentName || clientName} (הורה שנבחר)`
          } else if (!dryRun) {
            const newId = crypto.randomUUID()
            const { error: pErr } = await supabaseAdmin.from('parents').insert({
              id: newId, name: clientName || `הו"ק ${externalId}`, id_number: tz || null,
            })
            if (!pErr) {
              matchedParentId = newId; parentAction = 'נוצר חדש'; parentCreated++
              parentList.push({ id: newId, name: clientName, tz })
              if (tz) parentByTz.set(tz, { id: newId, name: clientName, tz })
            }
          } else {
            parentAction = tz ? 'ת"ז לא נמצא — ייווצר' : 'שם לא נמצא — ייווצר'
          }

          const payload: Record<string, unknown> = {
            external_id: externalId, standing_order_type: 'אשראי',
            parent_id: matchedParentId, charge_amount: chargeAmount,
            charge_day: chargeDay,
            credit_balance: creditBalance, project_name: projectName,
            card_last4: cardLast4, card_expiry: cardExpiry,
            so_status: soStatus,
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

          logRows.push({ externalId, name: clientName, tz, action, parentAction, amount: String(chargeAmount ?? ''), category: projectName ?? '', status: soStatus })
          send({ type: 'log', message: `${externalId} · ${clientName}${tz ? ` · ת"ז ${tz}` : ''} · ${action} · ${parentAction}` })
        }

        if (!dryRun) {
          await supabaseAdmin.from('automation_logs').insert({
            id:            crypto.randomUUID(),
            automation_id: 'nedarim-credit-hok-sync',
            run_at:        new Date().toISOString(),
            dry_run:       false,
            actions_count: updated + created,
            status:        'success',
            summary:       `סינק הו"ק אשראי: עודכנו ${updated} · נוצרו ${created} · הורים חדשים ${parentCreated} · דולגו ${skipped}`,
            details:       { updated, created, parentCreated, skipped, total: filteredRecords.length, rows: logRows },
          })
        }

        send({ type: 'done', updated, created, parentCreated, skipped, total: filteredRecords.length, dryRun, logRows })
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
