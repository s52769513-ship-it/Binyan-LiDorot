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
        fields.push(cur); cur = ''
      } else {
        cur += ch
      }
    }
    fields.push(cur)
    rows.push(fields)
  }
  return rows
}

function calcTransportCost(transport: string[]): number {
  if (!transport.includes('הלוך')) return 0
  const hasReturn = transport.includes('חזור שעה 1') || transport.includes('חזור שעה 4')
  return hasReturn ? 130 : 65
}

export async function POST(req: NextRequest) {
  try {
    const text = await req.text()
    const rows = parseCSV(text)
    if (rows.length < 2) return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 })

    // Row 0 is header — skip it
    const dataRows = rows.slice(1)

    // Fetch students + parents — matching via col A (last name) + col C (father's first name)
    const [{ data: allStudents, error: fetchErr }, { data: allParents }] = await Promise.all([
      supabaseAdmin.from('students').select('id, name, parent_ids'),
      supabaseAdmin.from('parents').select('id, first_name, last_name, name'),
    ])
    if (fetchErr) throw fetchErr

    const studentNameMap   = new Map<string, string>()   // student full name → student id
    const parentNameMap    = new Map<string, string>()   // "lastName|firstName" → parent id
    const parentStudentMap = new Map<string, string[]>() // parent id → [student ids]

    for (const s of allStudents ?? []) {
      if (s.name?.trim()) studentNameMap.set(s.name.trim(), s.id)
      for (const pid of (s.parent_ids ?? [])) {
        if (!parentStudentMap.has(pid)) parentStudentMap.set(pid, [])
        parentStudentMap.get(pid)!.push(s.id)
      }
    }
    for (const p of allParents ?? []) {
      const ln = p.last_name?.trim() ?? ''
      const fn = p.first_name?.trim() ?? ''
      if (ln && fn) parentNameMap.set(`${ln}|${fn}`, p.id)
      // Fallback: parse name field when first_name/last_name are empty
      if (ln && !fn && p.name?.trim()) parentNameMap.set(`${ln}|${p.name.trim()}`, p.id)
    }

    // ── Upsert classes from CSV (col 17: class, col 23: framework) ──────────
    const classMap = new Map<string, string>() // class_name → framework
    for (const row of dataRows) {
      const cn  = row[17]?.trim()
      const fw  = row[23]?.trim()
      if (cn) classMap.set(cn, fw || '')
    }
    if (classMap.size > 0) {
      const classRows = Array.from(classMap.entries()).map(([class_name, framework]) => ({
        class_name, framework,
      }))
      await supabaseAdmin
        .from('classes')
        .upsert(classRows, { onConflict: 'class_name', ignoreDuplicates: false })
    }

    // ── Update students ───────────────────────────────────────────────────────
    let updated = 0
    const notFound: string[] = []
    const errors: string[]   = []

    for (const row of dataRows) {
      const lastName   = row[0]?.trim()  // col A: שם משפחה
      const studentFN  = row[1]?.trim()  // col B: שם פרטי של תלמיד
      const fatherName = row[2]?.trim()  // col C: שם האב

      // Match parent by last name + father name, then find linked student
      let id: string | undefined
      if (lastName && fatherName) {
        const parentId = parentNameMap.get(`${lastName}|${fatherName}`)
        if (parentId) {
          const linked = parentStudentMap.get(parentId) ?? []
          if (linked.length === 1) {
            id = linked[0]
          } else if (linked.length > 1) {
            // Try to identify the exact student by first name or full name
            const fullName = studentFN ? `${studentFN} ${lastName}` : ''
            id = allStudents?.find(s =>
              linked.includes(s.id) && (
                (fullName && s.name?.trim() === fullName) ||
                (studentFN && s.name?.trim().startsWith(studentFN))
              )
            )?.id ?? linked[0]
          }
        }
      }
      // Fallback: match by student full name directly
      if (!id && studentFN && lastName) id = studentNameMap.get(`${studentFN} ${lastName}`)
      if (!id && studentFN) id = studentNameMap.get(studentFN)
      const label = [studentFN, lastName].filter(Boolean).join(' ') || lastName || ''
      if (!id) { if (label) notFound.push(label); continue }

      // Col 4: gender — "בן"→זכר, "בת"→נקבה
      const genderRaw = row[4]?.trim()
      const gender = genderRaw === 'בן' ? 'זכר' : genderRaw === 'בת' ? 'נקבה' : undefined

      // Col 6: תאריך לידה לועזי (DD/MM/YYYY)
      const birthGreg = row[6]?.trim() || null

      // Col 7: תאריך לידה עברי
      const birthHebrew = row[7]?.trim() || null

      // Col 17: כיתה
      const className = row[17]?.trim() || undefined

      // Col 18: סטטוס — "V"→פעיל, "סיים לימודים"→סיים לימודים, ""→skip
      const statusRaw = row[18]?.trim()
      const status = statusRaw === 'V' ? 'פעיל' : statusRaw || undefined

      // Col 21: הסעות — comma-separated inside the field
      const transportRaw = row[21]?.trim()
      const transportation = transportRaw
        ? transportRaw.split(',').map(s => s.trim()).filter(Boolean)
        : undefined
      const transportationCost = transportation ? calcTransportCost(transportation) : undefined

      // Col 27: קופת חולים
      const healthFund = row[27]?.trim() || null

      // Col 28: מקום לימודים קודם
      const previousSchool = row[28]?.trim() || null

      const update: Record<string, unknown> = {}
      if (gender !== undefined)               update.gender               = gender
      if (birthGreg !== undefined)            update.birth_date_gregorian = birthGreg
      if (birthHebrew !== undefined)          update.birth_date_hebrew    = birthHebrew
      if (className !== undefined)            update.class_name           = className
      if (status !== undefined)               update.status               = status
      if (transportation !== undefined)       update.transportation       = transportation
      if (transportationCost !== undefined)   update.transportation_cost  = transportationCost
      if (healthFund !== undefined)           update.health_fund          = healthFund
      if (previousSchool !== undefined)       update.previous_school      = previousSchool

      if (Object.keys(update).length === 0) continue

      const { error: upErr } = await supabaseAdmin
        .from('students')
        .update(update)
        .eq('id', id)

      if (upErr) { errors.push(`${label || id}: ${upErr.message}`); continue }
      updated++
    }

    return NextResponse.json({ updated, classes: classMap.size, notFound, errors })
  } catch (err) {
    console.error('import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
