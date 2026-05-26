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

    // Fetch all students from DB, build name → id map
    const { data: allStudents, error: fetchErr } = await supabaseAdmin
      .from('students')
      .select('id, name')
    if (fetchErr) throw fetchErr

    const nameMap = new Map<string, string>()
    for (const s of allStudents ?? []) {
      if (s.name) nameMap.set(s.name.trim(), s.id)
    }

    let updated = 0
    const notFound: string[] = []
    const errors: string[]   = []

    for (const row of dataRows) {
      const name = row[0]?.trim()
      if (!name) continue

      const id = nameMap.get(name)
      if (!id) { notFound.push(name); continue }

      // Col 4: gender — "בן"→זכר, "בת"→נקבה
      const genderRaw = row[4]?.trim()
      const gender = genderRaw === 'בן' ? 'זכר' : genderRaw === 'בת' ? 'נקבה' : undefined

      // Col 5: ת"ז
      const idNumber = row[5]?.trim() || null

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
      if (gender !== undefined)           update.gender               = gender
      if (idNumber !== undefined)         update.id_number            = idNumber
      if (birthGreg !== undefined)        update.birth_date_gregorian = birthGreg
      if (birthHebrew !== undefined)      update.birth_date_hebrew    = birthHebrew
      if (className !== undefined)        update.class_name           = className
      if (status !== undefined)           update.status               = status
      if (transportation !== undefined)   update.transportation       = transportation
      if (transportationCost !== undefined) update.transportation_cost = transportationCost
      if (healthFund !== undefined)       update.health_fund          = healthFund
      if (previousSchool !== undefined)   update.previous_school      = previousSchool

      if (Object.keys(update).length === 0) continue

      const { error: upErr } = await supabaseAdmin
        .from('students')
        .update(update)
        .eq('id', id)

      if (upErr) { errors.push(`${name}: ${upErr.message}`); continue }
      updated++
    }

    return NextResponse.json({ updated, notFound, errors })
  } catch (err) {
    console.error('import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
