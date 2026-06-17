import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function parseCSV(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const rows: string[][] = []
  for (const line of t.split(/\r?\n/)) {
    if (!line.trim()) continue
    const fields: string[] = []
    let inQ = false, cur = ''
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) { fields.push(cur); cur = '' }
      else cur += ch
    }
    fields.push(cur)
    rows.push(fields)
  }
  return rows
}

// Score how well hint matches a DB parent name
// CSV col 24 = "FAMILY FATHER_FIRST_NAME" e.g. "אייזנר אברהם יצחק"
// DB parent name might be "אברהם יצחק אייזנר" or "אייזנר אברהם יצחק"
function scoreName(hint: string, dbName: string): number {
  if (!hint || !dbName) return 0
  const clean = (s: string) => s.replace(/['"״]/g, '').trim().toLowerCase()
  const wa = clean(hint).split(/\s+/).filter(w => w.length > 1)
  const wb = clean(dbName).split(/\s+/).filter(w => w.length > 1)
  if (!wa.length || !wb.length) return 0
  let matches = 0
  for (const a of wa) {
    if (wb.some(b => b.startsWith(a) || a.startsWith(b))) matches++
  }
  return matches / Math.max(wa.length, wb.length)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action } = body

    /* ── PREVIEW ─────────────────────────────────────────────── */
    if (action === 'preview') {
      const csvText: string = body.csvText
      const allRows = parseCSV(csvText)
      // Row 0 = merged header row (הסעות), Row 1 = column names, data from row 2
      const dataRows = allRows.slice(2).filter(r => r[0]?.trim() || r[1]?.trim())

      const [parentsRes, classesRes] = await Promise.all([
        supabaseAdmin.from('parents').select('id, name, first_name, last_name'),
        supabaseAdmin.from('classes').select('class_name, framework'),
      ])
      const parents = (parentsRes.data ?? []).filter(p => p.name?.trim())
      const dbClasses = classesRes.data ?? []

      const rows = dataRows.map((r, i) => {
        const lastName  = r[0]?.trim() ?? ''
        const firstName = r[1]?.trim() ?? ''
        if (!firstName && !lastName) return null

        // Student name: שם פרטי + משפחה
        const name        = `${firstName} ${lastName}`.trim()
        const idNumber    = r[4]?.trim() ?? ''
        const birthHeb    = r[5]?.trim() ?? ''
        const birthGreg   = r[6]?.trim() ?? ''
        const classAndFw  = r[7]?.trim() ?? ''
        // col H = "א תלמוד תורה" or "גן בית חינוך לבנות" — class + framework combined
        const institution = classAndFw.includes('בית חינוך') ? 'בית חינוך' : 'תלמוד תורה'
        const classLetter = classAndFw.replace(/בית חינוך לבנות|בית חינוך|תלמוד תורה/, '').trim() || classAndFw
        const fatherPhone = r[13]?.trim() ?? ''
        const motherPhone = r[14]?.trim() ?? ''
        // col 15 = זמן (חורף/קיץ) - we store as note but don't map to transport fields
        const haloch   = r[16]?.trim() ?? ''
        const chazor1  = r[17]?.trim() ?? ''
        const chazor2  = r[18]?.trim() ?? ''
        const statusRaw = r[23]?.trim() ?? ''
        // col 24 = "FAMILY FATHER_NAME" e.g. "אייזנר אברהם יצחק"
        const parentHint = r[24]?.trim() ?? ''
        // If col 24 empty, build from col 2 (שם אב) + col 0 (משפחה)
        const fatherName = r[2]?.trim() ?? ''
        const effectiveHint = parentHint || (fatherName ? `${lastName} ${fatherName}` : '')

        const transport: string[] = []
        if (haloch  === '1') transport.push('הלוך')
        if (chazor1 === '1') transport.push('חזור שעה 1')
        if (chazor2 === '1') transport.push('חזור שעה 4')
        const transportCost = transport.includes('הלוך')
          ? (transport.length > 1 ? 130 : 65) : 0

        const status  = (statusRaw === 'V' || statusRaw === 'v') ? 'פעיל' : 'ממתין'
        const gender  = institution === 'בית חינוך' ? 'נקבה' : 'זכר'
        const classKey = `${classLetter}|${institution}`

        // Match parent by name score
        const candidates = parents
          .map(p => ({ id: p.id, name: p.name!, score: scoreName(effectiveHint, p.name!) }))
          .filter(c => c.score > 0.15)
          .sort((a, b) => b.score - a.score)
          .slice(0, 6)

        const best = candidates[0]
        const confident = !!best && best.score >= 0.6

        return {
          csvIndex: i,
          lastName, firstName, name,
          idNumber, birthHeb, birthGreg,
          institution, classLetter, classKey,
          transport, transportCost, status, gender,
          fatherPhone, motherPhone,
          parentHint: effectiveHint,
          parentId:   confident ? best.id   : null,
          parentName: confident ? best.name : null,
          parentScore: best?.score ?? 0,
          parentCandidates: candidates,
        }
      }).filter(Boolean)

      // Build class mapping suggestions
      const classKeys = [...new Set(rows.map(r => r!.classKey))]
      const classSuggestions = classKeys.map(key => {
        const [letter, inst] = key.split('|')
        const fw = inst === 'בית חינוך' ? 'בית חינוך לבנות' : 'תלמוד תורה'
        // Col H = "א תלמוד תורה" → builtName matches DB class_name directly
        const builtName = `${letter} ${fw}`
        const exact   = dbClasses.find(c => c.class_name === builtName)
        const fallback = exact ? undefined : dbClasses.find(c => c.framework === fw && c.class_name.includes(letter))
        const match   = exact ?? fallback
        return { key, csvClass: letter, csvInstitution: inst, framework: fw, suggestedDbName: match?.class_name ?? builtName, dbExists: !!exact }
      }).sort((a, b) => a.csvInstitution.localeCompare(b.csvInstitution) || a.csvClass.localeCompare(b.csvClass, 'he'))

      const confident = rows.filter(r => r!.parentId !== null).length
      const uncertain = rows.filter(r => !r!.parentId && r!.parentCandidates.length > 0).length
      const noMatch   = rows.filter(r => !r!.parentId && r!.parentCandidates.length === 0).length

      return NextResponse.json({ rows, classSuggestions, stats: { total: rows.length, confident, uncertain, noMatch } })
    }

    /* ── IMPORT ──────────────────────────────────────────────── */
    if (action === 'import') {
      const { rows, classMap, deleteAll, parentOverrides } = body as {
        rows: Array<{
          name: string; firstName: string; lastName: string; idNumber: string
          birthHeb: string; birthGreg: string; classKey: string; classLetter: string
          transport: string[]; transportCost: number; status: string; gender: string
          parentId: string | null; csvIndex: number
        }>
        classMap: Record<string, string>
        deleteAll: boolean
        parentOverrides: Record<string, string | null>
      }

      if (deleteAll) {
        // Fetch all student IDs and delete in batches
        const { data: allSt } = await supabaseAdmin.from('students').select('id')
        const ids = (allSt ?? []).map(s => s.id)
        for (let i = 0; i < ids.length; i += 500) {
          await supabaseAdmin.from('students').delete().in('id', ids.slice(i, i + 500))
        }
      }

      // Ensure class names exist in classes table
      for (const [key, dbName] of Object.entries(classMap)) {
        if (!dbName) continue
        const [, inst] = key.split('|')
        const fw = inst === 'בית חינוך' ? 'בית חינוך לבנות' : 'תלמוד תורה'
        await supabaseAdmin.from('classes').upsert({ class_name: dbName, framework: fw }, { onConflict: 'class_name', ignoreDuplicates: true })
      }

      let inserted = 0
      const errors: string[] = []

      for (const row of rows) {
        const parentId  = parentOverrides[String(row.csvIndex)] !== undefined
          ? parentOverrides[String(row.csvIndex)]
          : row.parentId
        const className = classMap[row.classKey] ?? row.classLetter

        const { error } = await supabaseAdmin.from('students').insert({
          id:                  crypto.randomUUID(),
          name:                row.name,
          first_name:          row.firstName,
          last_name:           row.lastName,
          id_number:           row.idNumber || null,
          birth_date_hebrew:   row.birthHeb  || null,
          birth_date_gregorian: row.birthGreg || null,
          class_name:          className,
          gender:              row.gender,
          status:              row.status,
          transportation:      row.transport,
          transportation_cost: row.transportCost,
          parent_ids:          parentId ? [parentId] : [],
          synced_at:           '2099-12-31T23:59:59.999Z',
        })
        if (error) errors.push(`${row.name}: ${error.message}`)
        else inserted++
      }

      return NextResponse.json({ inserted, errors })
    }

    return NextResponse.json({ error: 'action לא ידוע' }, { status: 400 })
  } catch (err) {
    console.error('csv-import error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
