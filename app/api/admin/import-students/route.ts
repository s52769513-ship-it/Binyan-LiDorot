import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const fields: string[] = []
    let inQuote = false
    let cur = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = !inQuote
      } else if (ch === ',' && !inQuote) {
        fields.push(cur.trim()); cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur.trim())
    rows.push(fields)
  }
  return rows
}

function calcTransportCost(parts: string[]): number {
  if (!parts.some(p => p.includes('הלוך'))) return 0
  const hasReturn = parts.some(p => p.includes('חזור'))
  return hasReturn ? 130 : 65
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    const rows = parseCSV(text)
    if (rows.length < 2) return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 })

    // ── Detect columns from header row ──────────────────────────────────────
    const header = rows[0].map(h => h.trim())
    const col = (names: string[]) => {
      for (const n of names) {
        const i = header.findIndex(h => h.includes(n))
        if (i >= 0) return i
      }
      return -1
    }

    const COL_LAST     = col(['שם משפחה'])
    const COL_FIRST    = col(['שם פרטי'])
    const COL_ID       = col(['ת.ז', "ת\"ז", 'תעודת זהות', 'מספר זהות'])
    const COL_PARENT   = col(['הורה'])
    const COL_TRANSPORT= col(['הסעות'])
    const COL_CLASS    = col(['כיתה1 + קישור', 'כיתה + ', 'כיתה1', 'כיתה'])   // prefer full "כיתה1 + קישור לאגף"
    const COL_FRAMEWORK= col(['קישור לאגף', 'אגף'])
    const COL_STATUS   = col(['סטטוס', 'status'])
    const COL_BIRTH    = col(['תאריך לידה'])

    // ── Load all students from DB ────────────────────────────────────────────
    const { data: allStudents, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, name, id_number, parent_ids')
    if (fetchErr) throw fetchErr

    // Build lookup maps
    const idMap   = new Map<string, string>()   // ת"ז → student DB id
    const nameMap = new Map<string, string>()   // "שם פרטי שם משפחה" → student DB id
    for (const s of allStudents ?? []) {
      if (s.id_number?.trim()) idMap.set(s.id_number.trim(), s.id)
      if (s.name?.trim())      nameMap.set(s.name.trim(), s.id)
    }

    // ── Load all parents for parent-name lookup ──────────────────────────────
    const { data: allParents } = await supabaseAdmin
      .from('parents')
      .select('id, name')
    const parentNameMap = new Map<string, string>()  // parent name → parent id
    for (const p of allParents ?? []) {
      if (p.name?.trim()) parentNameMap.set(p.name.trim(), p.id)
    }

    // ── Process classes (upsert) ─────────────────────────────────────────────
    const classMap = new Map<string, string>()  // class_name → framework
    for (const row of rows.slice(1)) {
      const className = COL_CLASS >= 0 ? row[COL_CLASS]?.trim() : undefined
      const framework = COL_FRAMEWORK >= 0 ? row[COL_FRAMEWORK]?.trim() : undefined
      if (className) classMap.set(className, framework || '')
    }
    if (classMap.size > 0) {
      await supabaseAdmin
        .from('classes')
        .upsert(
          Array.from(classMap.entries()).map(([class_name, framework]) => ({ class_name, framework })),
          { onConflict: 'class_name', ignoreDuplicates: false }
        )
    }

    // ── Update students ──────────────────────────────────────────────────────
    let updated = 0
    const notFound: string[] = []
    const errors: string[]   = []
    const updatedNames: string[] = []

    for (const row of rows.slice(1)) {
      const lastName  = COL_LAST  >= 0 ? row[COL_LAST]?.trim()  : ''
      const firstName = COL_FIRST >= 0 ? row[COL_FIRST]?.trim() : ''
      const idNumber  = COL_ID    >= 0 ? row[COL_ID]?.trim()    : ''
      const fullName  = [firstName, lastName].filter(Boolean).join(' ')

      // Match: ת"ז first, then full name
      const dbId = (idNumber && idMap.get(idNumber))
                ?? (fullName && nameMap.get(fullName))
                ?? null

      if (!dbId) {
        if (fullName) notFound.push(fullName)
        continue
      }

      const update: Record<string, unknown> = {}

      // Transportation
      if (COL_TRANSPORT >= 0) {
        const raw = row[COL_TRANSPORT]?.trim()
        if (raw !== undefined) {
          const parts = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
          update.transportation      = parts
          update.transportation_cost = calcTransportCost(parts)
        }
      }

      // Class
      if (COL_CLASS >= 0) {
        const cn = row[COL_CLASS]?.trim()
        if (cn) update.class_name = cn
      }

      // Status (V / ריק / טקסט)
      if (COL_STATUS >= 0) {
        const s = row[COL_STATUS]?.trim()
        if (s === 'V' || s === 'v') update.status = 'פעיל'
        else if (s)                 update.status = s
      }

      // Birth date
      if (COL_BIRTH >= 0) {
        const b = row[COL_BIRTH]?.trim()
        if (b) update.birth_date_gregorian = b
      }

      // ת"ז — store if found in file but not yet in DB
      if (idNumber && !idMap.has(idNumber)) {
        update.id_number = idNumber
      }

      // Link parent by parent name column
      if (COL_PARENT >= 0) {
        const parentNameRaw = row[COL_PARENT]?.trim()
        if (parentNameRaw) {
          const parentDbId = parentNameMap.get(parentNameRaw)
          if (parentDbId) {
            // Fetch current parent_ids to avoid overwriting
            const { data: cur } = await supabaseAdmin
              .from('students').select('parent_ids').eq('id', dbId).single()
            const existing = (cur?.parent_ids ?? []) as string[]
            if (!existing.includes(parentDbId)) {
              update.parent_ids = [...existing, parentDbId]
            }
          }
        }
      }

      if (Object.keys(update).length === 0) continue

      const { error: upErr } = await supabaseAdmin
        .from('students')
        .update(update)
        .eq('id', dbId)

      if (upErr) { errors.push(`${fullName}: ${upErr.message}`); continue }
      updated++
      updatedNames.push(fullName)
    }

    return NextResponse.json({
      updated,
      classes: classMap.size,
      notFound,
      errors,
      matchedByIDCol: COL_ID >= 0,
    })
  } catch (err) {
    console.error('import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
