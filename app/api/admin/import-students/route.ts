import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { calcTransportCost } from '@/lib/transport'
import { fetchAllRows } from '@/lib/fetchAllRows'

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

export async function POST(req: NextRequest) {
  try {
    const ct = req.headers.get('content-type') ?? ''

    // ── Manual link action: link an imported student to a chosen parent ──────
    if (ct.includes('application/json')) {
      const { studentId, parentId } = await req.json() as { studentId?: string; parentId?: string }
      if (!studentId || !parentId) {
        return NextResponse.json({ error: 'חסר studentId או parentId' }, { status: 400 })
      }
      const { data: student } = await supabaseAdmin
        .from('students').select('parent_ids').eq('id', studentId).single()
      const current: string[] = student?.parent_ids ?? []
      if (!current.includes(parentId)) current.push(parentId)
      const { error: linkErr } = await supabaseAdmin
        .from('students').update({ parent_ids: current }).eq('id', studentId)
      if (linkErr) return NextResponse.json({ error: linkErr.message }, { status: 500 })
      return NextResponse.json({ success: true })
    }

    // ── Full import: create students from CSV ────────────────────────────────
    const text = await req.text()
    const rows = parseCSV(text)
    if (rows.length < 2) return NextResponse.json({ error: 'קובץ ריק' }, { status: 400 })

    // Row 0 is header — skip it
    const dataRows = rows.slice(1)

    // Column mapping (0-based):
    // A(0)=משפחה  B(1)=שם תלמיד  C(2)=שם האב  D(3)=שם האם  E(4)=ת"ז  F(5)=לידה עברי
    // G(6)=לידה לועזי  H(7)=כיתה  L(11)=הלוך  M(12)=חזור1  N(13)=חזור2
    // S(18)=סטטוס  T(19)=שם מלא האב (לזיהוי ההורה)  AB(27)=קופ"ח  AC(28)=לימודים קודם

    // Paged fetch — a plain SELECT is capped by PostgREST at ~1000 rows,
    // silently hiding parents sorting past the cap from name matching.
    const allParents = await fetchAllRows<{ id: string; first_name: string | null; last_name: string | null; name: string | null }>(
      supabaseAdmin, 'parents', 'id, first_name, last_name, name')

    const parentNameMap = new Map<string, string>()  // "lastName|firstName" → parent id
    const parentFullMap = new Map<string, string>()  // full name variants → parent id
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

    // ── Create students ──────────────────────────────────────────────────────
    let created = 0
    const errors: string[] = []
    // Students whose father wasn't auto-detected — for manual linking in the UI
    const needsParent: { studentId: string; name: string; family: string; fatherName: string }[] = []

    for (const row of dataRows) {
      const lastName   = row[0]?.trim()         // A: שם משפחה
      const studentFN  = row[1]?.trim()         // B: שם פרטי תלמיד
      const fatherFN   = row[2]?.trim()         // C: שם האב
      const motherName = row[3]?.trim() || null // D: שם האם
      const idNumber   = row[4]?.trim() || null // E: ת"ז תלמיד
      const fatherRaw  = row[19]?.trim() ?? ''  // T: שם מלא האב

      const studentName = [lastName, studentFN].filter(Boolean).join(' ').trim()
      if (!studentName) continue  // skip empty rows

      // Clean col T: strip non-Hebrew leading chars (e.g. "V ")
      const fatherClean = fatherRaw.replace(/^[^א-ת]+/, '').trim()
      // Extract first name: remove last name from start, strip trailing honorifics
      let fatherFirst = fatherClean
      if (lastName && fatherClean.startsWith(lastName + ' ')) {
        fatherFirst = fatherClean.slice(lastName.length + 1).trim()
          .replace(/\s+\S*["׳]\S*["׳]?\S*$/, '').trim() // strip בר"י, שליט"א etc.
      }

      // Identify father (parent) via C (father name) + A (family), then T as fallback
      const parentId =
            (lastName && fatherFN    ? parentNameMap.get(`${lastName}|${fatherFN}`)    : undefined)
        ??  (lastName && fatherFirst ? parentNameMap.get(`${lastName}|${fatherFirst}`) : undefined)
        ??  (fatherClean             ? parentFullMap.get(fatherClean)                   : undefined)
        ??  (fatherFirst && lastName ? parentFullMap.get(`${fatherFirst} ${lastName}`)  : undefined)

      // Col F(5): תאריך לידה עברי · G(6): לועזי · H(7): כיתה
      const birthHebrew = row[5]?.trim() || null
      const birthGreg   = row[6]?.trim() || null
      const className   = row[7]?.trim() || null

      // Col S(18): סטטוס — "V"→פעיל
      const statusRaw = row[18]?.trim()
      const status = statusRaw === 'V' ? 'פעיל' : statusRaw || null

      // Cols L(11), M(12), N(13): הסעות — 3 separate columns, each holding a
      // marker ("1"/"V") when that leg applies. Push the canonical leg LABEL
      // (not the cell value) so the checkboxes and cost calc line up.
      const transport: string[] = []
      const lVal = row[11]?.trim(); const mVal = row[12]?.trim(); const nVal = row[13]?.trim()
      if (lVal && lVal !== '0') transport.push('הלוך')
      if (mVal && mVal !== '0') transport.push('חזור שעה 1')
      if (nVal && nVal !== '0') transport.push('חזור שעה 4')
      const transportationCost = transport.length > 0 ? calcTransportCost(transport) : 0

      // Col AB(27): קופ"ח · AC(28): לימודים קודם
      const healthFund     = row[27]?.trim() || null
      const previousSchool = row[28]?.trim() || null

      const studentId = crypto.randomUUID()
      const record: Record<string, unknown> = {
        id:                  studentId,
        name:                studentName,
        parent_ids:          parentId ? [parentId] : [],
        id_number:           idNumber,
        mother_name:         motherName,
        birth_date_hebrew:   birthHebrew,
        birth_date_gregorian:birthGreg,
        class_name:          className,
        status,
        transportation:      transport,
        transportation_cost: transportationCost,
        health_fund:         healthFund,
        previous_school:     previousSchool,
      }

      const { error: insErr } = await supabaseAdmin.from('students').insert(record)
      if (insErr) { errors.push(`${studentName}: ${insErr.message}`); continue }
      created++

      if (!parentId) {
        needsParent.push({
          studentId,
          name:       studentName,
          family:     lastName ?? '',
          fatherName: fatherFN || fatherClean || '',
        })
      }
    }

    return NextResponse.json({ created, classes: classMap.size, needsParent, errors })
  } catch (err) {
    console.error('import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
