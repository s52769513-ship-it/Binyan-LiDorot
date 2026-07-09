import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { calcAge } from '../route'
import { recalcTuitionForParent } from '@/lib/recalcTuition'
import { calcTransportCost, normalizeTransport } from '@/lib/transport'

function detectFramework(className: string): string {
  if (className.includes('תלמוד תורה')) return 'תלמוד תורה'
  if (className.includes('בית חינוך'))  return 'בית חינוך לבנות'
  return ''
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [studentRes, classesRes] = await Promise.all([
      supabaseAdmin.from('students').select('*').eq('id', id).single(),
      supabaseAdmin.from('classes').select('class_name, framework'),
    ])

    if (studentRes.error) throw studentRes.error
    const s = studentRes.data

    const frameMap = Object.fromEntries(
      (classesRes.data ?? []).map(c => [c.class_name, c.framework])
    )
    const toArray = (v: unknown): string[] =>
      Array.isArray(v) ? v : (v ? [String(v)] : [])

    const parentIds = toArray(s.parent_ids)
    let parents: { id: string; name: string }[] = []
    if (parentIds.length > 0) {
      const { data } = await supabaseAdmin
        .from('parents').select('id, name').in('id', parentIds)
      parents = (data ?? []).map(p => ({ id: p.id, name: p.name ?? '' }))
    }

    const cn = s.class_name ?? ''
    const framework = frameMap[cn] || detectFramework(cn)
    const birthGreg = s.birth_date_gregorian ?? ''

    return NextResponse.json({
      id: s.id,
      name: s.name ?? '',
      gender: s.gender ?? '',
      age: calcAge(birthGreg) || String(s.age ?? ''),
      className: cn,
      framework,
      status: s.status ?? '',
      transportation: normalizeTransport(s.transportation),
      transportationCost: calcTransportCost(s.transportation),
      notes: s.notes ?? '',
      parentIds,
      parents,
      birthDateGregorian: birthGreg,
      birthDateHebrew: s.birth_date_hebrew ?? '',
      idNumber: s.id_number ?? '',
      healthFund: s.health_fund ?? '',
      previousSchool: s.previous_school ?? '',
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

const ALLOWED_FIELDS: Record<string, string> = {
  name:               'name',
  gender:             'gender',
  class_name:         'class_name',
  className:          'class_name',
  parentIds:          'parent_ids',
  status:             'status',
  transportation:     'transportation',
  transportationCost: 'transportation_cost',
  notes:              'notes',
  birthDateGregorian: 'birth_date_gregorian',
  birthDateHebrew:    'birth_date_hebrew',
  idNumber:           'id_number',
  healthFund:         'health_fund',
  previousSchool:     'previous_school',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()

    // Get old parent_ids if parentIds are being changed
    let oldParentIds: string[] = []
    if ('parentIds' in body) {
      const { data: st } = await supabaseAdmin
        .from('students').select('parent_ids').eq('id', id).single()
      oldParentIds = (st?.parent_ids as string[]) ?? []
    }

    const update: Record<string, unknown> = {}
    for (const [clientKey, dbKey] of Object.entries(ALLOWED_FIELDS)) {
      if (clientKey in body) update[dbKey] = body[clientKey]
    }
    // Whenever transport legs are edited, store the canonical labels and keep the
    // cost in lockstep so tuition (which reads transportation_cost) stays correct.
    if ('transportation' in update) {
      update.transportation = normalizeTransport(update.transportation)
      update.transportation_cost = calcTransportCost(update.transportation)
    }
    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })
    const { error } = await supabaseAdmin.from('students').update(update).eq('id', id)
    if (error) throw error

    // If status or transportation changed, recalculate parent tuition + open planned payments
    const TUITION_FIELDS = new Set(['status', 'transportation_cost', 'parent_ids'])
    if (Object.keys(update).some(k => TUITION_FIELDS.has(k))) {
      try {
        const { data: st } = await supabaseAdmin
          .from('students').select('parent_ids').eq('id', id).single()
        const newParentIds = (st?.parent_ids as string[]) ?? []

        // Recalculate for all affected parents (old and new)
        const allParentIds = new Set([...oldParentIds, ...newParentIds])
        for (const pid of allParentIds) {
          await recalcTuitionForParent(pid)
        }
      } catch (rcErr) {
        console.error('recalcTuition error after student PATCH:', rcErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Get parent_ids before deletion
    const { data: student } = await supabaseAdmin
      .from('students').select('parent_ids').eq('id', id).single()
    const parentIds = (student?.parent_ids as string[]) ?? []

    // Delete the student
    const { error } = await supabaseAdmin.from('students').delete().eq('id', id)
    if (error) throw error

    // Recalculate tuition for each parent
    for (const pid of parentIds) {
      try {
        await recalcTuitionForParent(pid)
      } catch (rcErr) {
        console.error(`recalcTuition error for parent ${pid}:`, rcErr)
      }
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
