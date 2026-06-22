import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const now = new Date()
    const defaultMonth = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
    const month = searchParams.get('month') || defaultMonth

    const [ppRes, studentsRes, allMonthsRes] = await Promise.all([
      supabaseAdmin
        .from('planned_payments')
        .select('id, parent_ids, amount, balance, month_year')
        .eq('month_year', month)
        .eq('pp_type', 'tuition'),

      supabaseAdmin
        .from('students')
        .select('id, parent_ids, name, class_name, gender, status'),

      supabaseAdmin
        .from('planned_payments')
        .select('month_year')
        .eq('pp_type', 'tuition'),
    ])

    if (ppRes.error) throw ppRes.error
    if (studentsRes.error) throw studentsRes.error

    const ppData = ppRes.data ?? []
    const allStudents = studentsRes.data ?? []

    // Active students grouped by parent
    const kidsByParent: Record<string, typeof allStudents> = {}
    for (const s of allStudents) {
      for (const pid of (s.parent_ids as string[]) ?? []) {
        if (!kidsByParent[pid]) kidsByParent[pid] = []
        kidsByParent[pid].push(s)
      }
    }

    // Parent IDs from planned payments
    const parentIds = [...new Set(ppData.flatMap(p => (p.parent_ids as string[]) ?? []))]
    const { data: parentsData } = await supabaseAdmin
      .from('parents')
      .select('id, name')
      .in('id', parentIds)
    const parentMap: Record<string, string> = {}
    for (const p of parentsData ?? []) parentMap[p.id] = p.name as string

    // Build per-kid rows
    const rows: Array<{
      id: string; studentId: string; studentName: string; className: string
      gender: string; status: string; parentId: string; parentName: string
      expected: number; paid: number; balance: number; numSiblings: number
      paymentStatus: 'שולם' | 'חלקי' | 'ממתין'
    }> = []

    for (const pp of ppData) {
      const ppParentIds = (pp.parent_ids as string[]) ?? []
      for (const parentId of ppParentIds) {
        const activeKids = (kidsByParent[parentId] ?? []).filter(s => s.status === 'פעיל')
        if (activeKids.length === 0) continue

        const amount  = Number(pp.amount)  || 0
        const balance = Number(pp.balance) || 0
        const paid    = Math.max(0, amount - balance)
        const n       = activeKids.length

        activeKids.forEach((s, i) => {
          // Last kid absorbs rounding
          const perAmt = i === n - 1
            ? amount  - Math.floor(amount  / n) * (n - 1)
            : Math.floor(amount  / n)
          const perBal = i === n - 1
            ? balance - Math.floor(balance / n) * (n - 1)
            : Math.floor(balance / n)
          const perPaid = Math.max(0, perAmt - perBal)
          const paymentStatus: 'שולם' | 'חלקי' | 'ממתין' =
            perBal <= 0 ? 'שולם' : perPaid > 0 ? 'חלקי' : 'ממתין'

          rows.push({
            id:            `${pp.id}-${s.id}`,
            studentId:     s.id,
            studentName:   s.name as string,
            className:     (s.class_name as string) || 'ללא כיתה',
            gender:        s.gender as string,
            status:        s.status as string,
            parentId,
            parentName:    parentMap[parentId] ?? '',
            expected:      perAmt,
            paid:          perPaid,
            balance:       perBal,
            numSiblings:   n,
            paymentStatus,
          })
        })
      }
    }

    // Distinct months for filter
    const months = Array.from(
      new Set((allMonthsRes.data ?? []).map(p => p.month_year).filter(Boolean))
    ).sort((a: string, b: string) => {
      const [am, ay] = a.split('/').map(Number)
      const [bm, by] = b.split('/').map(Number)
      return by !== ay ? by - ay : bm - am
    })

    const totalExpected = rows.reduce((s, r) => s + r.expected, 0)
    const totalPaid     = rows.reduce((s, r) => s + r.paid,     0)
    const totalBalance  = rows.reduce((s, r) => s + Math.max(0, r.balance), 0)

    return NextResponse.json({
      rows,
      month,
      months,
      summary: {
        totalExpected: Math.round(totalExpected),
        totalPaid:     Math.round(totalPaid),
        totalBalance:  Math.round(totalBalance),
        totalKids:     rows.length,
      },
    })
  } catch (err) {
    console.error('tuition/kids error:', err)
    return NextResponse.json({ error: 'שגיאה בטעינת נתוני ילדים' }, { status: 500 })
  }
}
