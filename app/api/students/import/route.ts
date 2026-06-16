import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import * as XLSX from 'xlsx'

// ── Normalize Hebrew name for fuzzy matching ──────────────────────────────────
function normName(s: string): string {
  return (s ?? '')
    .replace(/["""''`]/g, '')
    .replace(/ברב['']י|ברמ['']מ|בר[''][א-ת]+/g, '')  // strip honorifics
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
}

function nameSimilarity(a: string, b: string): number {
  const na = normName(a), nb = normName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.85
  // word-level: check how many words overlap
  const wa = new Set(na.split(' '))
  const wb = nb.split(' ')
  const overlap = wb.filter(w => wa.has(w)).length
  return overlap >= 2 ? 0.7 : overlap === 1 ? 0.4 : 0
}

function parseTransportation(raw: string): string[] {
  if (!raw?.trim()) return []
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

// ── Calculate transportation cost (mirrors student API) ───────────────────────
function calcTransCost(t: string[]): number {
  if (!t || t.length === 0) return 0
  return t.includes('הלוך') ? (t.length > 1 ? 130 : 65) : 0
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const action   = (formData.get('action') as string) ?? 'analyze' // 'parse' | 'analyze' | 'execute'
    const file     = formData.get('file') as File | null
    const mappingRaw    = formData.get('fieldMapping')    as string | null
    const overridesRaw  = formData.get('parentOverrides') as string | null

    if (!file) return NextResponse.json({ error: 'חסר קובץ' }, { status: 400 })

    // ── Parse file ──────────────────────────────────────────────────────────
    const buf = Buffer.from(await file.arrayBuffer())
    // For xlsx/xls: the library reads the embedded codepage automatically.
    // For CSV: XLSX.read with codepage option doesn't reliably decode Hebrew,
    // so we use TextDecoder (supports 'windows-1255') to decode first, then
    // pass the decoded string to XLSX.read with type:'string'.
    let wb: ReturnType<typeof XLSX.read>
    const isCSV = file.name.toLowerCase().endsWith('.csv')
    if (isCSV) {
      const hasBOM = buf[0] === 0xEF && buf[1] === 0xBB && buf[2] === 0xBF
      const encoding = hasBOM ? 'utf-8' : 'windows-1255'
      const text = new TextDecoder(encoding).decode(buf)
      wb = XLSX.read(text, { type: 'string' })
    } else {
      wb = XLSX.read(buf, { type: 'buffer' })
    }
    const ws   = wb.Sheets[wb.SheetNames[0]]
    const rawRows = XLSX.utils.sheet_to_json<(string | number | null)[]>(ws, { header: 1, defval: null })

    if (rawRows.length === 0) return NextResponse.json({ error: 'הקובץ ריק' }, { status: 400 })

    const headers   = (rawRows[0] ?? []).map(h => String(h ?? ''))
    const dataRows  = rawRows.slice(1).filter(r => r && r.some(c => c !== null && c !== ''))

    // ── Phase: parse only ──────────────────────────────────────────────────
    if (action === 'parse') {
      return NextResponse.json({
        headers,
        sampleRows: dataRows.slice(0, 5).map(r => r.map(c => String(c ?? ''))),
        totalRows: dataRows.length,
      })
    }

    // ── Parse field mapping ────────────────────────────────────────────────
    // fieldMapping: { [colIndex]: fieldName }
    // fieldName: 'firstName' | 'lastName' | 'parentName' | 'transportation' | 'className' | 'status' | 'birthDate' | 'idNumber' | 'ignore'
    const mapping: Record<number, string> = mappingRaw ? JSON.parse(mappingRaw) : {}
    const parentOverrides: Record<string, string | null> = overridesRaw ? JSON.parse(overridesRaw) : {}

    function getField(row: (string|number|null)[], field: string): string {
      const idx = Object.entries(mapping).find(([, v]) => v === field)?.[0]
      if (idx == null) return ''
      return String(row[Number(idx)] ?? '').trim()
    }

    // ── Load DB data ───────────────────────────────────────────────────────
    const [{ data: existingStudents }, { data: allParents }] = await Promise.all([
      supabaseAdmin.from('students').select('id, name, status, transportation, class_name, id_number, parent_ids'),
      supabaseAdmin.from('parents').select('id, name, first_name, last_name'),
    ])

    const studentsByIdNum: Record<string, typeof existingStudents extends (infer T)[] | null ? T : never> = {}
    const studentsByName:  Record<string, typeof existingStudents extends (infer T)[] | null ? T : never> = {}
    for (const s of existingStudents ?? []) {
      if (s.id_number) studentsByIdNum[s.id_number] = s
      studentsByName[normName(s.name)] = s
    }

    // ── Analyze each row ───────────────────────────────────────────────────
    type RowResult = {
      rowIndex: number
      firstName: string; lastName: string; fullName: string
      parentNameCsv: string
      transportation: string[]; className: string; status: string
      birthDate: string; idNumber: string
      action: 'create' | 'update' | 'skip' | 'needs_parent'
      existingId?: string
      changes?: { field: string; from: string; to: string }[]
      parentMatch?: { id: string; name: string; score: number }
      issues: string[]
    }

    const results: RowResult[] = []

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i]
      const firstName    = getField(row, 'firstName')
      const lastName     = getField(row, 'lastName')
      const parentNameCsv = getField(row, 'parentName')
      const transRaw     = getField(row, 'transportation')
      const className    = getField(row, 'className')
      const status       = getField(row, 'status') || 'פעיל'
      const birthDate    = getField(row, 'birthDate')
      const idNumber     = getField(row, 'idNumber')

      if (!firstName && !lastName) continue

      const fullName     = [firstName, lastName].filter(Boolean).join(' ')
      const transportation = parseTransportation(transRaw)
      const issues: string[] = []

      // ── Find existing student ──────────────────────────────────────────
      let existing = idNumber ? studentsByIdNum[idNumber] : null
      if (!existing) {
        // try name match both orders: "firstName lastName" and "lastName firstName"
        const n1 = normName(fullName)
        const n2 = normName([lastName, firstName].filter(Boolean).join(' '))
        existing = studentsByName[n1] ?? studentsByName[n2] ?? null
        if (!existing) {
          // fuzzy: find best match among all students
          let bestScore = 0, bestStudent = null
          for (const s of existingStudents ?? []) {
            const score = Math.max(nameSimilarity(fullName, s.name), nameSimilarity([lastName, firstName].join(' '), s.name))
            if (score > bestScore) { bestScore = score; bestStudent = s }
          }
          if (bestScore >= 0.85) existing = bestStudent
        }
      }

      // ── Find parent match ──────────────────────────────────────────────
      let parentMatch: RowResult['parentMatch'] | undefined
      const overriddenParentId = parentNameCsv ? (parentOverrides[parentNameCsv] ?? parentOverrides[normName(parentNameCsv)]) : undefined
      if (overriddenParentId !== undefined) {
        if (overriddenParentId) {
          const p = allParents?.find(p => p.id === overriddenParentId)
          if (p) parentMatch = { id: p.id, name: p.name || `${p.first_name} ${p.last_name}`, score: 1 }
        }
        // if null → explicitly no parent
      } else if (parentNameCsv) {
        let best = 0, bestP = null
        for (const p of allParents ?? []) {
          const pName = p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`
          const score = nameSimilarity(parentNameCsv, pName)
          if (score > best) { best = score; bestP = p }
        }
        if (best >= 0.7 && bestP) {
          parentMatch = { id: bestP.id, name: bestP.name || `${bestP.first_name} ${bestP.last_name}`, score: best }
        } else {
          issues.push(`לא זוהה הורה: "${parentNameCsv}"`)
        }
      }

      // ── Determine action ───────────────────────────────────────────────
      if (existing) {
        const changes: RowResult['changes'] = []
        const existTrans = (existing.transportation ?? []) as string[]
        const transChanged = JSON.stringify([...transportation].sort()) !== JSON.stringify([...existTrans].sort())
        if (transChanged) changes.push({ field: 'הסעות', from: existTrans.join(', ') || '—', to: transportation.join(', ') || '—' })
        if (status && existing.status !== status) changes.push({ field: 'סטטוס', from: existing.status ?? '—', to: status })
        if (className && existing.class_name !== className) changes.push({ field: 'כיתה', from: existing.class_name ?? '—', to: className })

        results.push({
          rowIndex: i, firstName, lastName, fullName,
          parentNameCsv, transportation, className, status, birthDate, idNumber,
          action: changes.length > 0 ? 'update' : 'skip',
          existingId: existing.id,
          changes,
          parentMatch,
          issues,
        })
      } else {
        // New student — if parent unresolved, flag
        const finalAction = (!parentNameCsv || parentMatch || overriddenParentId !== undefined) ? 'create' : 'needs_parent'
        results.push({
          rowIndex: i, firstName, lastName, fullName,
          parentNameCsv, transportation, className, status, birthDate, idNumber,
          action: finalAction,
          parentMatch,
          issues,
        })
      }
    }

    // ── Phase: analyze only ────────────────────────────────────────────────
    if (action === 'analyze') {
      const summary = {
        create:       results.filter(r => r.action === 'create').length,
        update:       results.filter(r => r.action === 'update').length,
        skip:         results.filter(r => r.action === 'skip').length,
        needsParent:  results.filter(r => r.action === 'needs_parent').length,
      }
      return NextResponse.json({ results, summary })
    }

    // ── Phase: execute ─────────────────────────────────────────────────────
    const today = new Date().toISOString().split('T')[0]
    let created = 0, updated = 0, skipped = 0

    for (const r of results) {
      if (r.action === 'skip') { skipped++; continue }
      if (r.action === 'needs_parent') { skipped++; continue } // unresolved → skip

      const parentIds: string[] = r.parentMatch ? [r.parentMatch.id] : []

      if (r.action === 'update' && r.existingId) {
        const patch: Record<string, unknown> = {}
        if (r.changes?.find(c => c.field === 'הסעות')) {
          patch.transportation     = r.transportation
          patch.transportation_cost = calcTransCost(r.transportation)
        }
        if (r.changes?.find(c => c.field === 'סטטוס'))  patch.status     = r.status
        if (r.changes?.find(c => c.field === 'כיתה'))    patch.class_name = r.className
        if (Object.keys(patch).length > 0) {
          await supabaseAdmin.from('students').update(patch).eq('id', r.existingId)
          updated++
        } else {
          skipped++
        }
      } else if (r.action === 'create') {
        const fullName = [r.firstName, r.lastName].filter(Boolean).join(' ')
        const transportation_cost = calcTransCost(r.transportation)
        const newStudent: Record<string, unknown> = {
          id:                   crypto.randomUUID(),
          name:                 fullName,
          status:               r.status || 'פעיל',
          transportation:       r.transportation,
          transportation_cost,
          class_name:           r.className || null,
          parent_ids:           parentIds,
          synced_at:            '2099-12-31T23:59:59.999Z',
        }
        if (r.idNumber)  newStudent.id_number            = r.idNumber
        if (r.birthDate) newStudent.birth_date_gregorian = r.birthDate
        await supabaseAdmin.from('students').insert(newStudent)
        created++
      }
    }

    return NextResponse.json({ success: true, created, updated, skipped })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
