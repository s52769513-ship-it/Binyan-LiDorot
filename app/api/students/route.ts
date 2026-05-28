import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { recalcTuitionForParent } from '@/lib/recalcTuition'

async function classFrameworkMap(): Promise<Record<string, string>> {
  const { data } = await supabaseAdmin.from('classes').select('class_name, framework')
  return Object.fromEntries((data ?? []).map(c => [c.class_name, c.framework]))
}

function detectFramework(className: string): string {
  if (className.includes('תלמוד תורה')) return 'תלמוד תורה'
  if (className.includes('בית חינוך'))  return 'בית חינוך לבנות'
  return ''
}

export function calcAge(dateStr: string): string {
  if (!dateStr) return ''
  const parts = dateStr.split('/')
  if (parts.length !== 3) return ''
  const [d, m, y] = parts
  const birth = new Date(parseInt(y), parseInt(m) - 1, parseInt(d))
  if (isNaN(birth.getTime())) return ''
  const today = new Date()
  let years = today.getFullYear() - birth.getFullYear()
  let months = today.getMonth() - birth.getMonth()
  if (today.getDate() < birth.getDate()) months--
  if (months < 0) { years--; months += 12 }
  return `${years}.${months}`
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const search = searchParams.get('search') ?? ''

    let query = supabaseAdmin
      .from('students')
      .select('id, name, gender, age, class_name, status, transportation, transportation_cost, parent_ids, birth_date_gregorian, birth_date_hebrew, id_number, health_fund, previous_school')
      .order('class_name', { ascending: true })
      .order('name', { ascending: true })

    if (search.trim()) {
      query = query.ilike('name', `%${search.trim()}%`)
    }

    const [{ data, error }, frameMap] = await Promise.all([query, classFrameworkMap()])
    if (error) throw error

    const students = (data ?? []).map(s => {
      const cn = s.class_name ?? ''
      const framework = frameMap[cn] || detectFramework(cn)
      const birthGreg = s.birth_date_gregorian ?? ''
      return {
        id: s.id,
        name: s.name ?? '',
        gender: s.gender ?? '',
        age: s.age ?? calcAge(birthGreg),
        className: cn,
        framework,
        status: s.status ?? '',
        transportation: Array.isArray(s.transportation) ? s.transportation : [],
        transportationCost: s.transportation_cost ?? 0,
        parentIds: Array.isArray(s.parent_ids) ? s.parent_ids : [],
        birthDateGregorian: birthGreg,
        birthDateHebrew: s.birth_date_hebrew ?? '',
        idNumber: s.id_number ?? '',
        healthFund: s.health_fund ?? '',
        previousSchool: s.previous_school ?? '',
      }
    })

    return NextResponse.json({ data: students, total: students.length })
  } catch (err) {
    console.error('students error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת תלמידים' }, { status: 500 })
  }
}

function calcTransportCost(transport: string[]): number {
  if (!transport.includes('הלוך')) return 0
  const hasReturn = transport.includes('חזור שעה 1') || transport.includes('חזור שעה 4')
  return hasReturn ? 130 : 65
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      firstName, lastName, gender, className, status,
      age: ageFromBody,
      birthDateGregorian, birthDateHebrew, idNumber,
      transportation, parentIds,
      healthFund, previousSchool, transportationCost,
    } = body

    if (!firstName || !lastName) {
      return NextResponse.json({ error: 'שם פרטי ושם משפחה הם שדות חובה' }, { status: 400 })
    }

    const id = crypto.randomUUID()
    // Use far-future synced_at so prune_stale_rows (Airtable sync) never deletes local records
    const syncedAt = '2099-12-31T23:59:59.999Z'

    // Use birth date for age calc if available, otherwise use age sent from form
    const calcedAge = birthDateGregorian
      ? calcAge(birthDateGregorian)
      : (ageFromBody ? String(ageFromBody) : '')
    const tc = transportationCost ?? calcTransportCost(Array.isArray(transportation) ? transportation : [])

    const row: Record<string, unknown> = {
      id,
      name: `${firstName} ${lastName}`.trim(),
      gender: gender ?? '',
      age: calcedAge,
      class_name: className ?? '',
      status: status ?? 'ממתין',
      transportation: Array.isArray(transportation) ? transportation : [],
      transportation_cost: tc,
      parent_ids: Array.isArray(parentIds) ? parentIds : [],
      synced_at: syncedAt,
    }

    // Only add optional columns if they have values (avoids errors if columns don't exist yet)
    if (birthDateGregorian) row.birth_date_gregorian = birthDateGregorian
    if (birthDateHebrew)    row.birth_date_hebrew    = birthDateHebrew
    if (idNumber)           row.id_number            = idNumber
    if (healthFund)         row.health_fund          = healthFund
    if (previousSchool)     row.previous_school      = previousSchool

    const { error } = await supabaseAdmin.from('students').insert(row)
    if (error) throw error

    // Recalculate tuition for each linked parent
    try {
      for (const pid of (Array.isArray(parentIds) ? parentIds : [])) {
        await recalcTuitionForParent(pid)
      }
    } catch (rcErr) {
      console.error('recalcTuition error after student POST:', rcErr)
    }

    return NextResponse.json({ success: true, id })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('student insert error:', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
