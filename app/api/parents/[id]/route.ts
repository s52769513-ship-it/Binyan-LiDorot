import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const FIELD_MAP: Record<string, string> = {
  firstName: 'first_name', lastName: 'last_name',
  motherName: 'mother_name', fatherPhone: 'father_phone',
  motherPhone: 'mother_phone', email: 'email',
  address: 'address', building: 'building', city: 'city',
  notes: 'notes', status: 'status',
  tuitionTotal: 'tuition_total', tuitionBalance: 'tuition_balance',
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await req.json()
    const update: Record<string, unknown> = {}
    for (const [key, dbKey] of Object.entries(FIELD_MAP)) {
      if (key in body) update[dbKey] = body[key]
    }
    if (Object.keys(update).length === 0)
      return NextResponse.json({ error: 'no fields' }, { status: 400 })
    const { error } = await supabaseAdmin.from('parents').update(update).eq('id', id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [parentRes, studentsRes, debtsRes, plannedRes, transactionsRes, classesRes] =
      await Promise.all([
        supabaseAdmin.from('parents').select('*').eq('id', id).single(),
        supabaseAdmin.from('students').select('*').contains('parent_ids', [id]),
        supabaseAdmin.from('debts').select('*').contains('parent_ids', [id]),
        supabaseAdmin
          .from('planned_payments')
          .select('*')
          .contains('parent_ids', [id])
          .order('date', { ascending: false }),
        supabaseAdmin
          .from('transactions')
          .select('*')
          .contains('parent_ids', [id])
          .order('date', { ascending: false })
          .limit(30),
        supabaseAdmin.from('classes').select('class_name, framework'),
      ])

    if (parentRes.error) throw parentRes.error

    const p = parentRes.data

    const toArray = (v: unknown): string[] =>
      Array.isArray(v) ? v : (v ? [String(v)] : [])

    const frameMap = Object.fromEntries(
      (classesRes.data ?? []).map(c => [c.class_name, c.framework])
    )

    // ── Calculate tuition dynamically from active students ──────────────────
    // Formula: IF(activeCount > 3, activeCount * 450, activeCount * 500) + transportTotal
    const activeStudents = (studentsRes.data ?? []).filter(s => s.status === 'פעיל')
    const activeCount    = activeStudents.length
    const transportTotal = activeStudents.reduce((sum, s) => sum + (Number(s.transportation_cost) || 0), 0)
    const baseTuition    = activeCount === 0 ? 0 : activeCount > 3 ? activeCount * 450 : activeCount * 500
    const computedTuitionTotal = baseTuition + transportTotal

    // For the balance: if this parent has no stored balance yet (new local record),
    // start with full computed total as balance. Otherwise keep Airtable's value.
    const storedBalance = Number(p.tuition_balance) || 0
    const storedTotal   = Number(p.tuition_total)   || 0
    // If stored total equals stored balance (never had a payment recorded),
    // recalculate balance proportionally. Otherwise keep the stored delta.
    const computedBalance = storedTotal === 0
      ? computedTuitionTotal          // brand-new record: owes full amount
      : storedBalance + (computedTuitionTotal - storedTotal)  // adjust for tuition change

    // Persist updated values back to DB (fire-and-forget, non-blocking)
    if (computedTuitionTotal !== storedTotal || activeCount !== (p.children_count ?? 0)) {
      void supabaseAdmin.from('parents').update({
        tuition_total:   computedTuitionTotal,
        tuition_balance: computedBalance,
        children_count:  activeCount,
      }).eq('id', id)
    }
    // ────────────────────────────────────────────────────────────────────────

    return NextResponse.json({
      id: p.id,
      name: p.name ?? '',
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      motherName: p.mother_name ?? '',
      fatherPhone: p.father_phone ?? '',
      motherPhone: p.mother_phone ?? '',
      email: p.email ?? '',
      address: p.address ?? '',
      building: p.building ?? '',
      city: p.city ?? '',
      status: toArray(p.status),
      childrenCount: activeCount,
      tuitionTotal: computedTuitionTotal,
      tuitionBalance: computedBalance,
      notes: p.notes ?? '',

      students: (studentsRes.data ?? []).map(s => ({
        id: s.id,
        name: s.name ?? '',
        gender: s.gender ?? '',
        age: s.age ?? '',
        className: s.class_name ?? '',
        framework: frameMap[s.class_name ?? ''] ?? '',
        status: s.status ?? '',
        transportation: toArray(s.transportation),
        transportationCost: s.transportation_cost ?? 0,
      })),

      debts: (debtsRes.data ?? []).map(d => ({
        id: d.id,
        amount: d.amount ?? 0,
        createdTime: d.created_time ?? '',
      })),

      plannedPayments: (plannedRes.data ?? []).map(pp => ({
        id: pp.id,
        name: pp.name ?? '',
        amount: pp.amount ?? 0,
        date: pp.date ?? '',
        monthYear: pp.month_year ?? '',
        balance: pp.balance ?? 0,
      })),

      transactions: (transactionsRes.data ?? []).map(tx => ({
        id: tx.id,
        amount: tx.amount ?? 0,
        type: tx.type ?? '',
        date: tx.date ?? '',
        monthYear: tx.month_year ?? '',
        notes: tx.notes ?? '',
        projectNames: (tx.project_names as string[]) ?? [],
      })),
    })
  } catch (err) {
    console.error('parent detail error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת פרטי הורה' }, { status: 500 })
  }
}
