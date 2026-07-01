import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS = process.env.NEDARIM_API_PASSWORD ?? 'nu247'

function fmtExpiry(raw: string): string {
  const s = String(raw ?? '').replace(/\D/g, '')
  if (s.length === 4) return `${s.slice(0, 2)}/${s.slice(2)}`
  return s
}

function namesMatch(a: string, b: string): boolean {
  const norm = (n: string) => n
    .replace(/\b(הרב|ר'|ר"|רב|בר"?[א-ת]|בריא"ז|ברי"ט|ברי"מ|ברא"צ|ברא"ז|בר"ל|בר"מ|בר"צ|בר"א|בר"ב|בר"ש|בר"ד)\b/g, '')
    .replace(/\s+/g, ' ').trim().toLowerCase()
  const na = norm(a), nb = norm(b)
  if (na === nb) return true
  const wa = na.split(' ').filter(Boolean)
  const wb = nb.split(' ').filter(Boolean)
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
        // 1. Pull full list via GetKeva.Json with pagination (LastId)
        send({ type: 'log', message: 'מושך רשימת הו"ק אשראי מנדרים...' })

        type KevaRecord = Record<string, unknown>
        const allRecords: KevaRecord[] = []
        let lastId = ''

        // Paginate: keep calling until we get fewer than 2000 records
        // Try multiple action/param/endpoint variants — Nedarim API is inconsistent
        type ActionCandidate = { base: string; params: string }
        const actionsToTry: ActionCandidate[] = [
          // GetKeva.Json — has named fields with Zeout/LastNum/Tokef
          { base: 'Manage3.aspx',  params: `Action=GetKeva.Json&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
          { base: 'Manage3.aspx',  params: `Action=GetKeva.Json&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
          { base: 'Manage.aspx',   params: `Action=GetKeva.Json&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
          { base: 'Manage.aspx',   params: `Action=GetKeva.Json&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
          // GetKeva (without .Json)
          { base: 'Manage3.aspx',  params: `Action=GetKeva&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
          { base: 'Manage3.aspx',  params: `Action=GetKeva&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
          // GetKevaNew fallback — numbered fields only
          { base: 'Manage3.aspx',  params: `Action=GetKevaNew&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
          { base: 'Manage3.aspx',  params: `Action=GetKevaNew&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&MaxId=2000` },
        ]
        let workingAction = ''
        let workingBase   = ''
        let hasNamedFields = false
        for (const candidate of actionsToTry) {
          const testUrl = `https://matara.pro/nedarimplus/Reports/${candidate.base}?${candidate.params}`
          const testResp = await fetch(testUrl)
          if (!testResp.ok) continue
          const testJson = await testResp.json().catch(() => null)
          if (!testJson) continue
          const isError = testJson.Result != null && testJson.Result !== 0
          if (isError) continue
          const page = Array.isArray(testJson) ? testJson : (testJson.data ?? testJson.Data ?? [])
          const firstRecord = page[0] as Record<string, unknown> | undefined
          const named = !!(firstRecord && ('Kevald' in firstRecord || 'Zeout' in firstRecord))
          workingAction = candidate.params
          workingBase   = candidate.base
          hasNamedFields = named
          if (named) break  // found preferred named-field variant — stop searching
        }
        if (!workingAction) throw new Error('כל שמות הפעולה של GetKeva נדחו על ידי נדרים')
        send({ type: 'log', message: `פעולה: ${workingAction.split('&')[0]} (${workingBase}) · שדות: ${hasNamedFields ? 'named ✓' : 'numbered (ללא פרטי כרטיס)'}` })
        send({ type: 'log', message: `פעולה פעילה: ${workingAction.split('&')[0]}` })

        while (true) {
          let url = `https://matara.pro/nedarimplus/Reports/${workingBase}?${workingAction}`
          if (lastId) url += `&LastId=${encodeURIComponent(lastId)}`

          const resp = await fetch(url)
          if (!resp.ok) throw new Error(`Nedarim returned ${resp.status}`)
          const json = await resp.json()
          if (json.Result != null && json.Result !== 0) throw new Error(`Nedarim: ${json.Message ?? json.Result}`)

          const page: KevaRecord[] = Array.isArray(json) ? json : (json.data ?? json.Data ?? [])
          if (!page.length) break

          // Debug: log first record keys on first page to verify field names
          if (allRecords.length === 0 && page.length > 0) {
            send({ type: 'log', message: `DEBUG שדות: ${Object.keys(page[0]).join(', ')}` })
          }

          allRecords.push(...page)
          send({ type: 'log', message: `  משכנו ${allRecords.length} הו"ק עד כה...` })

          if (page.length < 2000) break  // last page
          // Set LastId to the last record's Kevald for next page
          lastId = String((page[page.length - 1] as Record<string, unknown>).Kevald ?? (page[page.length - 1] as Record<string, unknown>)['DT_RowId'] ?? '').trim()
          if (!lastId) break
        }

        // Filter to single parent if requested
        let filteredRecords = allRecords
        if (parentId) {
          const { data: parentSos } = await supabaseAdmin
            .from('standing_orders')
            .select('external_id')
            .or(`parent_id.eq.${parentId},linked_parent_id.eq.${parentId}`)
            .eq('standing_order_type', 'אשראי')
          const parentExtIds = new Set((parentSos ?? []).map(s => String(s.external_id)).filter(Boolean))
          filteredRecords = allRecords.filter(r => {
            const eid = String(r.Kevald ?? r['DT_RowId'] ?? '').trim()
            return parentExtIds.has(eid)
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

        // Log first raw record to debug field names
        if (allRecords.length > 0) {
          send({ type: 'log', message: `DEBUG רשומה ראשונה: ${JSON.stringify(allRecords[0]).slice(0, 300)}` })
        }

        for (let i = 0; i < filteredRecords.length; i++) {
          const r = filteredRecords[i] as Record<string, unknown>
          // Support both named fields (GetKeva.Json) and numbered (GetKevaNew)
          const externalId = String(r.Kevald ?? r['DT_RowId'] ?? r['1'] ?? '').trim()
          if (!externalId) { skipped++; continue }

          send({ type: 'progress', current: i + 1, total: filteredRecords.length })

          // Named fields: from GetKeva.Json (preferred — has ת"ז and card details)
          // Numbered fallbacks: from GetKevaNew (no card details, only basic info)
          const clientName    = String(r.ClientName ?? r['2'] ?? '').trim()
          const tz            = String(r.Zeout ?? '').trim()                          // only GetKeva.Json has this
          const chargeAmount  = Number(String(r.Amount ?? r['6'] ?? r['5'] ?? '').replace(/[^\d.]/g, '')) || null
          const projectName   = String(r.Groupe ?? r['7'] ?? '').trim() || null
          const notes         = String(r.Comments ?? r['8'] ?? '').trim()
          const cardLast4     = String(r.LastNum ?? '').trim() || null                // only GetKeva.Json
          const cardExpiry    = fmtExpiry(String(r.Tokef ?? ''))                      // only GetKeva.Json
          const creditBalance = Number(String(r.Itra ?? '').replace(/[^\d.]/g, '')) || null
          const isActive      = String(r.Enabled ?? '1') !== '0'
          const errorText     = String(r.ErrorText ?? '').trim()
          const soStatus      = !isActive ? 'לא פעיל' : errorText ? 'סירוב' : 'פעיל'

          // Match parent: ת"ז first, then name
          let parentId: string | null = null
          let parentAction = 'לא קושר'

          const byTz   = tz ? parentByTz.get(tz) : undefined
          const byName = !byTz && clientName ? parentList.find(p => namesMatch(p.name, clientName)) : undefined
          const matched = byTz ?? byName

          if (matched) {
            parentId = matched.id
            parentAction = `קושר → ${matched.name}${byTz ? ' (ת"ז)' : ' (שם)'}`
          } else if (!dryRun) {
            const newId = crypto.randomUUID()
            const { error: pErr } = await supabaseAdmin.from('parents').insert({
              id: newId, name: clientName || `הו"ק ${externalId}`, id_number: tz || null,
            })
            if (!pErr) {
              parentId = newId; parentAction = 'נוצר חדש'; parentCreated++
              parentList.push({ id: newId, name: clientName, tz })
              if (tz) parentByTz.set(tz, { id: newId, name: clientName, tz })
            }
          } else {
            parentAction = tz ? 'ת"ז לא נמצא — ייווצר' : 'שם לא נמצא — ייווצר'
          }

          const payload: Record<string, unknown> = {
            external_id: externalId, standing_order_type: 'אשראי',
            parent_id: parentId, charge_amount: chargeAmount,
            credit_balance: creditBalance, project_name: projectName,
            card_last4: cardLast4, card_expiry: cardExpiry || null,
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
