import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { normName, nameSimilarity } from '@/lib/nameUtils'

/* ─── CSV parse ─────────────────────────────────────── */
function parseCsvRow(line: string): string[] {
  const cells: string[] = []
  let cur = '', inQ = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
      else inQ = !inQ
    } else if (ch === ',' && !inQ) {
      cells.push(cur.trim()); cur = ''
    } else {
      cur += ch
    }
  }
  cells.push(cur.trim())
  return cells
}

function stripShekel(s: string): number {
  return parseFloat((s ?? '').replace(/[₪,\s]/g, '')) || 0
}

function detectPaymentCategory(method: string): 'hok' | 'salary' | 'manual' {
  const m = (method ?? '').trim()
  if (m.includes('הו"ק') || m.includes('הוק') || m.includes('הו``ק')) return 'hok'
  if (m.includes('ניכוי') || m.includes('משכרות') || m.includes('משכורת')) return 'salary'
  return 'manual'
}

/* ─── Row parse from CSV ───────────────────────────── */
interface CsvRow {
  status:        string  // *, @, #, ?
  title:         string  // כינוי
  firstName:     string  // שם
  lastName:      string  // משפחה
  address:       string
  fatherPhone:   string
  motherPhone:   string
  email:         string
  host:          string  // מארח
  amount:        number  // סכום
  paymentMethod: string  // אופן התשלום
  notes:         string  // הערות
  rawLine:       string
}

function parseRow(cells: string[]): CsvRow | null {
  // Skip header / totals / empty rows
  const rowNum = cells[1]?.trim()
  if (!rowNum || isNaN(Number(rowNum))) return null

  const lastName = cells[4]?.trim()
  const firstName = cells[3]?.trim()
  if (!lastName && !firstName) return null

  return {
    status:        cells[0]?.trim() ?? '',
    title:         cells[2]?.trim() ?? '',
    firstName,
    lastName,
    address:       cells[5]?.trim() ?? '',
    fatherPhone:   cells[8]?.trim() ?? '',
    motherPhone:   cells[9]?.trim() ?? '',
    email:         cells[11]?.trim() ?? '',
    host:          cells[12]?.trim() ?? '',
    amount:        stripShekel(cells[18]),
    paymentMethod: cells[21]?.trim() ?? '',
    notes:         cells[23]?.trim() ?? '',
    rawLine:       cells.join(','),
  }
}

/* ─── Main handler ───────────────────────────────────── */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { phase, csvText, mapping, dryRun = false } = body

    if (phase === 'parse') return handleParse(csvText)
    if (phase === 'analyze') return handleAnalyze(csvText, mapping)
    if (phase === 'execute') return handleExecute(csvText, mapping, dryRun)

    return NextResponse.json({ error: 'phase must be parse | analyze | execute' }, { status: 400 })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

/* ─── Phase 1: parse ─────────────────────────────────── */
async function handleParse(csvText: string) {
  const lines = csvText.split('\n').filter(l => l.trim())
  const rows: CsvRow[] = []
  for (const line of lines) {
    const cells = parseCsvRow(line)
    const r = parseRow(cells)
    if (r) rows.push(r)
  }

  const sample = rows.slice(0, 5).map(r => ({
    name: `${r.firstName} ${r.lastName}`.trim(),
    amount: r.amount,
    paymentMethod: r.paymentMethod,
    host: r.host,
  }))

  return NextResponse.json({
    totalRows: rows.length,
    sample,
    headers: ['שם', 'משפחה', 'סכום', 'אופן תשלום', 'מארח'],
  })
}

/* ─── Phase 2: analyze ───────────────────────────────── */
async function handleAnalyze(csvText: string, _mapping: unknown) {
  const rows = parseCsvRows(csvText)

  // Load all parents for matching
  const { data: parents } = await supabaseAdmin
    .from('parents')
    .select('id, name, first_name, last_name, father_phone, mother_phone')
    .order('last_name')

  const parentArr = parents ?? []

  // Load existing donation standing orders
  const { data: soRows } = await supabaseAdmin
    .from('standing_orders')
    .select('id, parent_id, project_name, charge_amount')
    .eq('project_name', 'דמי מגבית')

  const soParentIds = new Set((soRows ?? []).map((s: { parent_id: string }) => s.parent_id))

  const actions: AnalyzeAction[] = []

  for (const row of rows) {
    const fullName = `${row.firstName} ${row.lastName}`.trim()
    const category = detectPaymentCategory(row.paymentMethod)

    // Try to match by phone first, then by name
    let matchedParent = findByPhone(parentArr, row.fatherPhone, row.motherPhone)
    if (!matchedParent) {
      matchedParent = findByName(parentArr, fullName, row.lastName)
    }

    if (!matchedParent) {
      actions.push({
        rowName:       fullName,
        amount:        row.amount,
        paymentMethod: row.paymentMethod,
        category,
        action:        'no_match',
        reason:        'לא נמצא הורה תואם',
        host:          row.host,
      })
      continue
    }

    const action: AnalyzeAction = {
      rowName:       fullName,
      matchedName:   matchedParent.name,
      parentId:      matchedParent.id,
      amount:        row.amount,
      paymentMethod: row.paymentMethod,
      category,
      host:          row.host,
      action:        'skip',
    }

    if (category === 'hok') {
      if (soParentIds.has(matchedParent.id)) {
        action.action = 'update_so'
        action.reason = 'יעדכן הו"ק קיים'
      } else {
        action.action = 'pending_so'
        action.reason = 'יסומן לסנכרון נדרים הבא'
      }
    } else if (category === 'salary') {
      action.action = 'update_monthly_donation'
      action.reason = 'יעדכן ניכוי חודשי'
    } else {
      action.action = 'info_only'
      action.reason = 'מזומן/לברר — ידני'
    }

    actions.push(action)
  }

  const counts = {
    update_so:               actions.filter(a => a.action === 'update_so').length,
    pending_so:              actions.filter(a => a.action === 'pending_so').length,
    update_monthly_donation: actions.filter(a => a.action === 'update_monthly_donation').length,
    info_only:               actions.filter(a => a.action === 'info_only').length,
    no_match:                actions.filter(a => a.action === 'no_match').length,
  }

  return NextResponse.json({ actions, counts })
}

/* ─── Phase 3: execute ───────────────────────────────── */
async function handleExecute(csvText: string, _mapping: unknown, dryRun: boolean) {
  const rows = parseCsvRows(csvText)

  const { data: parents } = await supabaseAdmin
    .from('parents')
    .select('id, name, first_name, last_name, father_phone, mother_phone')
    .order('last_name')

  const parentArr = parents ?? []

  const { data: soRows } = await supabaseAdmin
    .from('standing_orders')
    .select('id, parent_id, project_name, charge_amount')
    .eq('project_name', 'דמי מגבית')

  const soByParent: Record<string, string> = {}
  for (const s of soRows ?? []) soByParent[s.parent_id] = s.id

  let updatedSo = 0, updatedSalary = 0, skipped = 0

  for (const row of rows) {
    if (!row.amount) { skipped++; continue }

    const fullName = `${row.firstName} ${row.lastName}`.trim()
    const category = detectPaymentCategory(row.paymentMethod)

    let matched = findByPhone(parentArr, row.fatherPhone, row.motherPhone)
    if (!matched) matched = findByName(parentArr, fullName, row.lastName)
    if (!matched) { skipped++; continue }

    if (!dryRun) {
      if (category === 'hok') {
        const soId = soByParent[matched.id]
        if (soId) {
          await supabaseAdmin.from('standing_orders')
            .update({ charge_amount: row.amount, project_name: 'דמי מגבית', ...(row.notes ? { notes: row.notes } : {}) })
            .eq('id', soId)
          updatedSo++
        } else {
          skipped++
        }
      } else if (category === 'salary') {
        await supabaseAdmin.from('parents')
          .update({ monthly_donation: row.amount })
          .eq('id', matched.id)
        updatedSalary++
      } else {
        skipped++
      }
    } else {
      if (category === 'hok' && soByParent[matched.id]) updatedSo++
      else if (category === 'salary') updatedSalary++
      else skipped++
    }
  }

  return NextResponse.json({
    updatedSo,
    updatedSalary,
    skipped,
    dryRun,
    total: rows.length,
  })
}

/* ─── helpers ────────────────────────────────────────── */
function parseCsvRows(csvText: string): CsvRow[] {
  return csvText.split('\n')
    .filter(l => l.trim())
    .map(l => parseRow(parseCsvRow(l)))
    .filter((r): r is CsvRow => r !== null)
}

type ParentRow = { id: string; name: string; first_name: string; last_name: string; father_phone: string; mother_phone: string }

function findByPhone(parents: ParentRow[], phone1: string, phone2: string): ParentRow | null {
  if (!phone1 && !phone2) return null
  const norm = (p: string) => (p ?? '').replace(/[-\s]/g, '')
  const p1 = norm(phone1), p2 = norm(phone2)
  return parents.find(p => {
    const fp = norm(p.father_phone ?? ''), mp = norm(p.mother_phone ?? '')
    return (p1 && (fp === p1 || mp === p1)) || (p2 && (fp === p2 || mp === p2))
  }) ?? null
}

function findByName(parents: ParentRow[], fullName: string, lastName: string): ParentRow | null {
  const normFull = normName(fullName)
  const normLast = normName(lastName)

  // Exact last name candidates
  const candidates = parents.filter(p =>
    normName(p.last_name ?? '') === normLast ||
    normName(p.name ?? '').includes(normLast)
  )

  if (candidates.length === 0) return null

  let best = candidates[0], bestScore = 0
  for (const p of candidates) {
    const score = nameSimilarity(normFull, normName(p.name ?? ''))
    if (score > bestScore) { bestScore = score; best = p }
  }

  return bestScore >= 0.5 ? best : null
}

interface AnalyzeAction {
  rowName:        string
  matchedName?:   string
  parentId?:      string
  amount:         number
  paymentMethod:  string
  category:       'hok' | 'salary' | 'manual'
  action:         'update_so' | 'pending_so' | 'update_monthly_donation' | 'info_only' | 'no_match' | 'skip'
  reason?:        string
  host?:          string
}
