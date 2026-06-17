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

export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    const rows = parseCSV(text)
    if (rows.length < 2) return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 })

    // ── Detect columns from header row ──────────────────────────────────────
    const header = rows[0].map(h => h.trim())
    const col = (...names: string[]) => {
      for (const n of names) {
        const i = header.findIndex(h => h.includes(n))
        if (i >= 0) return i
      }
      return -1
    }

    const C_FULLNAME   = col('שם')            // col 0: שם (full name as-is)
    const C_LAST       = col('שם משפחה')
    const C_FIRST      = col('שם פרטי')
    const C_ID         = col('ת"ז', 'ת.ז', 'תעודת זהות', 'מספר זהות')
    const C_PARENT     = col('הורה')
    const C_TRANSPORT  = col('הסעות')
    const C_COST       = col('סה"כ הסעות', 'סהכ הסעות', 'עלות הסעה')
    // prefer "כיתה1 + קישור לאגף" (full name) over plain "כיתה"
    const C_CLASS      = (() => {
      const full = header.findIndex(h => h.includes('כיתה') && h.includes('קישור'))
      return full >= 0 ? full : col('כיתה')
    })()
    const C_FRAMEWORK  = col('קישור לאגף', 'אגף')
    const C_STATUS     = col('סטטוס')
    const C_BIRTH      = col('תאריך לידה')
    const C_HEALTH     = col('קופת חולים')
    const C_PREV_SCH   = col('מקום לימודים קודם')
    const C_GENDER     = col('מגדר')

    // ── Load all students from DB ────────────────────────────────────────────
    const { data: allStudents, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, name, id_number')
    if (fetchErr) throw fetchErr

    const idMap    = new Map<string, string>()   // ת"ז  → DB id
    const nameMap  = new Map<string, string>()   // name → DB id
    for (const s of allStudents ?? []) {
      const idNum = s.id_number?.trim()
      if (idNum) idMap.set(idNum, s.id)
      const nm = s.name?.trim()
      if (nm)  nameMap.set(nm, s.id)
    }

    // ── Load parents for linking ─────────────────────────────────────────────
    const { data: allParents } = await supabaseAdmin.from('parents').select('id, name')
    const parentNameMap = new Map<string, string>()
    for (const p of allParents ?? []) {
      if (p.name?.trim()) parentNameMap.set(p.name.trim(), p.id)
    }

    // ── Upsert classes ───────────────────────────────────────────────────────
    const classMap = new Map<string, string>()
    for (const row of rows.slice(1)) {
      const cn = C_CLASS     >= 0 ? row[C_CLASS]?.trim()     : undefined
      const fw = C_FRAMEWORK >= 0 ? row[C_FRAMEWORK]?.trim() : undefined
      if (cn) classMap.set(cn, fw || '')
    }
    if (classMap.size > 0) {
      await supabaseAdmin.from('classes').upsert(
        Array.from(classMap.entries()).map(([class_name, framework]) => ({ class_name, framework })),
        { onConflict: 'class_name', ignoreDuplicates: false }
      )
    }

    // ── Process each row ─────────────────────────────────────────────────────
    let updated = 0
    const notFound: string[] = []
    const errors: string[]   = []

    for (const row of rows.slice(1)) {
      const lastName  = C_LAST  >= 0 ? row[C_LAST]?.trim()  : ''
      const firstName = C_FIRST >= 0 ? row[C_FIRST]?.trim() : ''
      const idNumber  = C_ID    >= 0 ? row[C_ID]?.trim()    : ''
      const fullName  = C_FULLNAME >= 0 ? row[C_FULLNAME]?.trim() : ''

      // Possible name formats to try
      const nameA = [firstName, lastName].filter(Boolean).join(' ')   // שם פרטי + משפחה
      const nameB = [lastName,  firstName].filter(Boolean).join(' ')  // משפחה + שם פרטי

      const dbId =
        (idNumber && idMap.get(idNumber))    ??
        (nameA    && nameMap.get(nameA))     ??
        (nameB    && nameMap.get(nameB))     ??
        (fullName && nameMap.get(fullName))  ??
        null

      if (!dbId) {
        const label = fullName || nameA || nameB
        if (label) notFound.push(label)
        continue
      }

      const update: Record<string, unknown> = {}

      // Transportation list
      if (C_TRANSPORT >= 0) {
        const raw   = row[C_TRANSPORT]?.trim() ?? ''
        const parts = raw ? raw.split(',').map(s => s.trim()).filter(Boolean) : []
        update.transportation = parts

        // Cost: take directly from file if available, else derive
        if (C_COST >= 0) {
          const costRaw = row[C_COST]?.replace(/[₪,\s]/g, '').trim()
          const costNum = costRaw ? parseFloat(costRaw) : 0
          update.transportation_cost = isNaN(costNum) ? 0 : costNum
        } else {
          const hasGo     = parts.some(p => p.includes('הלוך'))
          const hasReturn = parts.some(p => p.includes('חזור'))
          update.transportation_cost = hasGo ? (hasReturn ? 130 : 65) : 0
        }
      }

      // Class
      if (C_CLASS >= 0) {
        const cn = row[C_CLASS]?.trim()
        if (cn) update.class_name = cn
      }

      // Status: V / v = פעיל; other text stored as-is; empty = skip
      if (C_STATUS >= 0) {
        const s = row[C_STATUS]?.trim()
        if (s === 'V' || s === 'v') update.status = 'פעיל'
        else if (s)                 update.status = s
      }

      // Gender
      if (C_GENDER >= 0) {
        const g = row[C_GENDER]?.trim()
        if (g === 'בן') update.gender = 'זכר'
        else if (g === 'בת') update.gender = 'נקבה'
        else if (g) update.gender = g
      }

      // Birth date (Gregorian)
      if (C_BIRTH >= 0) {
        const b = row[C_BIRTH]?.trim()
        if (b) update.birth_date_gregorian = b
      }

      // Health fund
      if (C_HEALTH >= 0) {
        const h = row[C_HEALTH]?.trim()
        if (h) update.health_fund = h
      }

      // Previous school
      if (C_PREV_SCH >= 0) {
        const ps = row[C_PREV_SCH]?.trim()
        if (ps) update.previous_school = ps
      }

      // Store ת"ז if missing in DB
      if (idNumber && !idMap.has(idNumber)) update.id_number = idNumber

      // Link parent
      if (C_PARENT >= 0) {
        const parentNameRaw = row[C_PARENT]?.trim()
        if (parentNameRaw) {
          const parentDbId = parentNameMap.get(parentNameRaw)
          if (parentDbId) {
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
        .from('students').update(update).eq('id', dbId)

      if (upErr) { errors.push(`${fullName || nameA}: ${upErr.message}`); continue }
      updated++
    }

    return NextResponse.json({
      updated,
      classes: classMap.size,
      notFound,
      errors,
      matchedByIDCol: C_ID >= 0,
      detectedCols: {
        id: C_ID >= 0 ? header[C_ID] : null,
        name: C_FULLNAME >= 0 ? header[C_FULLNAME] : null,
        class: C_CLASS >= 0 ? header[C_CLASS] : null,
        transport: C_TRANSPORT >= 0 ? header[C_TRANSPORT] : null,
        status: C_STATUS >= 0 ? header[C_STATUS] : null,
      },
    })
  } catch (err) {
    console.error('import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
