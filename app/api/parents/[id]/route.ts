import { NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const [parentRes, studentsRes, debtsRes, plannedRes, transactionsRes] =
      await Promise.all([
        supabase.from('parents').select('*').eq('id', id).single(),

        supabase.from('students').select('*').contains('parent_ids', [id]),

        supabase.from('debts').select('*').contains('parent_ids', [id]),

        supabase
          .from('planned_payments')
          .select('*')
          .contains('parent_ids', [id])
          .order('date', { ascending: false }),

        supabase
          .from('transactions')
          .select('*')
          .contains('parent_ids', [id])
          .order('date', { ascending: false })
          .limit(30),
      ])

    if (parentRes.error) throw parentRes.error

    const p = parentRes.data

    return NextResponse.json({
      id: p.id,
      name: p.name,
      firstName: p.first_name,
      lastName: p.last_name,
      motherName: p.mother_name,
      fatherPhone: p.father_phone,
      motherPhone: p.mother_phone,
      email: p.email,
      address: p.address,
      building: p.building,
      city: p.city,
      status: p.status ?? [],
      childrenCount: p.children_count,
      tuitionTotal: p.tuition_total,
      tuitionBalance: p.tuition_balance,
      notes: p.notes,

      students: (studentsRes.data ?? []).map(s => ({
        id: s.id,
        name: s.name,
        gender: s.gender,
        age: s.age,
        className: s.class_name,
        status: s.status,
        transportation: s.transportation ?? [],
        transportationCost: s.transportation_cost,
      })),

      debts: (debtsRes.data ?? []).map(d => ({
        id: d.id,
        amount: d.amount,
        createdTime: d.created_time,
      })),

      plannedPayments: (plannedRes.data ?? []).map(pp => ({
        id: pp.id,
        name: pp.name,
        amount: pp.amount,
        date: pp.date,
        monthYear: pp.month_year,
        balance: pp.balance,
      })),

      transactions: (transactionsRes.data ?? []).map(tx => ({
        id: tx.id,
        amount: tx.amount,
        type: tx.type,
        date: tx.date,
        notes: tx.notes,
      })),
    })
  } catch (err) {
    console.error('parent detail error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת פרטי הורה' }, { status: 500 })
  }
}
