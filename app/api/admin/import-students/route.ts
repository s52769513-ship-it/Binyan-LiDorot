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

    // Column mapping (0-based):
    // A(0)=משפחה  B(1)=שם תלמיד  C(2)=שם האם  E(4)=ת"ז  F(5)=לידה עברי
    // G(6)=לידה לועזי  H(7)=כיתה  L(11)=הלוך  M(12)=חזור1  N(13)=חזור2
    // T(19)=שם מלא האב (לזיהוי ההורה)

    const [{ data: allStudents, error: fetchErr }, { data: allParents }] = await Promise.all([
      supabaseAdmin.from('students').select('id, name, id_number, parent_ids'),
      supabaseAdmin.from('parents').select('id, first_name, last_name, name'),
    ])
    if (fetchErr) throw fetchErr

    const studentNameMap   = new Map<string, string>()   // student name → student id
    const studentIdNumMap  = new Map<string, string>()   // student id_number → student id
    const parentNameMap    = new Map<string, string>()   // "lastName|firstName" → parent id
    const parentFullMap    = new Map<string, string>()   // full name variants → parent id
    const parentStudentMap = new Map<string, string[]>() // parent id → [student ids]

    for (const s of allStudents ?? []) {
      if (s.name?.trim())      studentNameMap.set(s.name.trim(), s.id)
      if (s.id_number?.trim()) studentIdNumMap.set(s.id_number.trim(), s.id)
      for (const pid of (s.parent_ids ?? [])) {
        if (!parentStudentMap.has(pid)) parentStudentMap.set(pid, [])
        parentStudentMap.get(pid)!.push(s.id)
      }
    }
    for (const p of allParents ?? []) {
      const ln = p.last_name?.trim() ?? ''
      const fn = p.first_name?.trim() ?? ''
      if (ln && fn) {
        parentNameMap.set(`${ln}|${fn}`, p.id)
        parentFullMap.set(`${ln} ${fn}`, p.id)
        parentFullMap.set(`${fn} ${ln}`, p.id)
      }
      if (p.name?.trim()) parentFullMap.set(p.name.trim(), p.id)
    }

    // ── Upsert classes from CSV (col H=7: class, col 23: framework) ──────────
    const classMap = new Map<string, string>()
    for (const row of dataRows) {
      const cn = row[7]?.trim()
      const fw = row[23]?.trim()
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
      const lastName   = row[0]?.trim()         // A: שם משפחה
      const studentFN  = row[1]?.trim()         // B: שם פרטי תלמיד
      const motherName = row[2]?.trim() || null // C: שם האם
      const idNumber   = row[4]?.trim() || null // E: ת"ז תלמיד
      const fatherRaw  = row[19]?.trim() ?? ''  // T: שם מלא האב

      // Clean col T: strip non-Hebrew leading chars (e.g. "V ")
      const fatherClean = fatherRaw.replace(/^[^א-ת]+/, '').trim()
      // Extract first name: remove last name from start, strip trailing honorifics
      let fatherFirst = fatherClean
      if (lastName && fatherClean.startsWith(lastName + ' ')) {
        fatherFirst = fatherClean.slice(lastName.length + 1).trim()
          .replace(/\s+\S*["׳]\S*["׳]?\S*$/, '').trim() // strip בר"י, שליט"א etc.
      }

      // 1) Primary: identify parent via T (full father name) → linked student
      let id: string | undefined
      let foundParentId: string | undefined
      if (lastName || fatherFirst) {
        foundParentId = (lastName && fatherFirst ? parentNameMap.get(`${lastName}|${fatherFirst}`) : undefined)
                     ?? (fatherClean ? parentFullMap.get(fatherClean) : undefined)
                     ?? (fatherFirst && lastName ? parentFullMap.get(`${fatherFirst} ${lastName}`) : undefined)
      }
      if (foundParentId) {
        const linked = parentStudentMap.get(foundParentId) ?? []
        if (linked.length === 1) {
          id = linked[0]
        } else if (linked.length > 1) {
          const candidates = [
            studentFN && lastName ? `${studentFN} ${lastName}` : '',
            studentFN && lastName ? `${lastName} ${studentFN}` : '',
          ].filter(Boolean)
          id = allStudents?.find(s =>
            linked.includes(s.id) && (
              candidates.includes(s.name?.trim() ?? '') ||
              (!!studentFN && (s.name?.trim()?.startsWith(studentFN) ?? false))
            )
          )?.id ?? linked[0]
        }
      }

      // 2) Fallback: student ת"ז
      if (!id && idNumber) id = studentIdNumMap.get(idNumber)

      // 3) Fallback: student name
      if (!id && studentFN && lastName) {
        id = studentNameMap.get(`${studentFN} ${lastName}`)
            ?? studentNameMap.get(`${lastName} ${studentFN}`)
      }
      if (!id && studentFN)  id = studentNameMap.get(studentFN)
      if (!id && lastName)   id = studentNameMap.get(lastName)

      const label = [studentFN, lastName].filter(Boolean).join(' ') || lastName || ''
      if (!id) { if (label) notFound.push(label); continue }

      // Col E(4): ת"ז — already read above as idNumber
      // Col F(5): תאריך לידה עברי
      const birthHebrew = row[5]?.trim() || null
      // Col G(6): תאריך לידה לועזי
      const birthGreg   = row[6]?.trim() || null
      // Col H(7): כיתה
      const className   = row[7]?.trim() || undefined

      // Col S(18): סטטוס — "V"→פעיל
      const statusRaw = row[18]?.trim()
      const status = statusRaw === 'V' ? 'פעיל' : statusRaw || undefined

      // Cols L(11), M(12), N(13): הסעות — 3 separate columns
      const transport: string[] = []
      const lVal = row[11]?.trim(); const mVal = row[12]?.trim(); const nVal = row[13]?.trim()
      if (lVal && lVal !== '0') transport.push(lVal)
      if (mVal && mVal !== '0') transport.push(mVal)
      if (nVal && nVal !== '0') transport.push(nVal)
      const transportation     = transport.length > 0 ? transport : undefined
      const transportationCost = transportation ? calcTransportCost(transportation) : undefined

      // Col AB(27): קופת חולים
      const healthFund     = row[27]?.trim() || null
      // Col AC(28): מקום לימודים קודם
      const previousSchool = row[28]?.trim() || null

      const update: Record<string, unknown> = {}
      if (idNumber)                           update.id_number            = idNumber
      if (motherName !== null)                update.mother_name          = motherName
      if (birthHebrew !== null)               update.birth_date_hebrew    = birthHebrew
      if (birthGreg !== null)                 update.birth_date_gregorian = birthGreg
      if (className !== undefined)            update.class_name           = className
      if (status !== undefined)               update.status               = status
      if (transportation !== undefined)       update.transportation       = transportation
      if (transportationCost !== undefined)   update.transportation_cost  = transportationCost
      if (healthFund !== null)                update.health_fund          = healthFund
      if (previousSchool !== null)            update.previous_school      = previousSchool

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
