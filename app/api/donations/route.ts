import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month') ?? currentMY()

    // 1. Parents with monthly_donation > 0 (salary deduction donors)
    const { data: donorParents, error: e1 } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name, monthly_donation, notes')
      .gt('monthly_donation', 0)
      .order('last_name')

    if (e1) throw e1

    // 2. Standing orders with project_name = 'דמי מגבית'
    const { data: soRows, error: e2 } = await supabaseAdmin
      .from('standing_orders')
      .select('id, parent_id, standing_order_type, charge_amount, so_status, notes, parent:parent_id(id, name, first_name, last_name)')
      .eq('project_name', 'דמי מגבית')

    if (e2) throw e2

    // Collect all relevant parent IDs
    const allParentIds = new Set<string>()
    for (const p of donorParents ?? []) allParentIds.add(p.id)
    for (const so of soRows ?? []) {
      const pid = (so.parent as { id: string } | null)?.id
      if (pid) allParentIds.add(pid)
    }

    const parentIdArr = [...allParentIds]

    // 3. Donation PPs for this month (to show payment status)
    const { data: pps } = parentIdArr.length > 0
      ? await supabaseAdmin
          .from('planned_payments')
          .select('id, parent_ids, name, amount, balance, month_year')
          .eq('pp_type', 'donation')
          .eq('month_year', month)
          .overlaps('parent_ids', parentIdArr)
      : { data: [] }

    const ppMap: Record<string, { id: string; amount: number; balance: number }> = {}
    for (const pp of pps ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        ppMap[pid] = { id: pp.id, amount: Number(pp.amount), balance: Number(pp.balance) }
      }
    }

    // Build SO map per parent
    const soMap: Record<string, { type: string; amount: number; status: string }[]> = {}
    for (const so of soRows ?? []) {
      const pid = (so.parent as { id: string } | null)?.id
      if (!pid) continue
      if (!soMap[pid]) soMap[pid] = []
      soMap[pid].push({
        type:   so.standing_order_type ?? '',
        amount: Number(so.charge_amount) || 0,
        status: so.so_status ?? 'פעיל',
      })
    }

    // Merge into unified donor list
    const seen = new Set<string>()
    const donors: DonorRow[] = []

    // SO donors
    for (const so of soRows ?? []) {
      const p = so.parent as { id: string; name: string; first_name: string; last_name: string } | null
      if (!p || seen.has(p.id)) continue
      seen.add(p.id)
      const monthlyAmount = soMap[p.id]?.reduce((s, x) => s + x.amount, 0) ?? 0
      donors.push({
        id:             p.id,
        name:           p.name,
        firstName:      p.first_name ?? '',
        lastName:       p.last_name ?? '',
        monthlyDonation:monthlyAmount,
        paymentMethod:  so.standing_order_type?.includes('אשראי') ? 'הו"ק אשראי' : 'הו"ק בנקאי',
        soStatus:       so.so_status ?? 'פעיל',
        ppThisMonth:    ppMap[p.id] ?? null,
      })
    }

    // Salary-deduction donors (not already listed from SO)
    for (const p of donorParents ?? []) {
      if (seen.has(p.id)) continue
      seen.add(p.id)
      donors.push({
        id:              p.id,
        name:            p.name,
        firstName:       p.first_name ?? '',
        lastName:        p.last_name ?? '',
        monthlyDonation: Number(p.monthly_donation) || 0,
        paymentMethod:   'ניכוי משכרות',
        soStatus:        'פעיל',
        ppThisMonth:     ppMap[p.id] ?? null,
      })
    }

    donors.sort((a, b) => (a.lastName ?? '').localeCompare(b.lastName ?? '', 'he'))

    // Summary
    const totalMonthly  = donors.reduce((s, d) => s + d.monthlyDonation, 0)
    const totalPaid     = donors.filter(d => d.ppThisMonth && d.ppThisMonth.balance <= 0).length
    const totalPartial  = donors.filter(d => d.ppThisMonth && d.ppThisMonth.balance > 0 && d.ppThisMonth.balance < d.monthlyDonation).length
    const totalUnpaid   = donors.filter(d => !d.ppThisMonth || d.ppThisMonth.balance >= d.monthlyDonation).length

    return NextResponse.json({
      donors,
      summary: {
        total:        donors.length,
        totalMonthly,
        totalPaid,
        totalPartial,
        totalUnpaid,
        month,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}

function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

interface DonorRow {
  id:              string
  name:            string
  firstName:       string
  lastName:        string
  monthlyDonation: number
  paymentMethod:   string
  soStatus:        string
  ppThisMonth:     { id: string; amount: number; balance: number } | null
}
