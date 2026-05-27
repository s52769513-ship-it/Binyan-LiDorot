import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin as supabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const framework = req.nextUrl.searchParams.get('framework') ?? ''

  try {
    const [studentsRes, classesRes, parentsRes] = await Promise.all([
      supabase.from('students').select('parent_ids, class_name'),
      supabase.from('classes').select('class_name, framework'),
      supabase.from('parents')
        .select('id, name, tuition_balance, children_count')
        .gt('tuition_balance', 0)
        .order('tuition_balance', { ascending: false }),
    ])

    const classFrameworkMap: Record<string, string> = {}
    for (const c of classesRes.data ?? []) {
      if (c.framework) classFrameworkMap[c.class_name as string] = c.framework as string
    }

    const parentFrameworkMap: Record<string, string> = {}
    for (const s of studentsRes.data ?? []) {
      const fw = classFrameworkMap[(s.class_name as string) ?? ''] ?? ''
      for (const pid of (s.parent_ids as string[]) ?? []) {
        if (pid && fw && !parentFrameworkMap[pid]) parentFrameworkMap[pid] = fw
      }
    }

    const parents = (parentsRes.data ?? []).filter(p => {
      const fw = parentFrameworkMap[p.id as string] ?? 'אחר'
      return framework === 'אחר' ? fw === 'אחר' : fw === framework
    })

    const parentIds = parents.map(p => p.id as string)

    // Get open planned payments for these parents
    const ppRes = parentIds.length > 0
      ? await supabase
          .from('planned_payments')
          .select('id, parent_ids, name, amount, balance, month_year')
          .gt('balance', 0)
      : { data: [] as Array<{ id: string; parent_ids: string[]; name: string; amount: number; balance: number; month_year: string }> }

    const ppByParent: Record<string, { id: string; name: string; amount: number; balance: number; monthYear: string }[]> = {}
    for (const pp of ppRes.data ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        if (parentIds.includes(pid)) {
          if (!ppByParent[pid]) ppByParent[pid] = []
          ppByParent[pid].push({
            id: pp.id as string,
            name: pp.name as string,
            amount: Number(pp.amount) || 0,
            balance: Number(pp.balance) || 0,
            monthYear: pp.month_year as string,
          })
        }
      }
    }

    return NextResponse.json({
      parents: parents.map(p => ({
        id: p.id as string,
        name: p.name as string,
        balance: Number(p.tuition_balance) || 0,
        childrenCount: Number(p.children_count) || 0,
        openPayments: ppByParent[p.id as string] ?? [],
      })),
    })
  } catch (err) {
    console.error('dept-debt error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
