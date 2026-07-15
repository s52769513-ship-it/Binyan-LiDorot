import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ppBeforeStart } from '@/lib/cutoffs'

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month') ?? currentMY()

    // Only parents with monthly_donation > 0 (manually set)
    const { data: donorParents, error: e1 } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name, monthly_donation, notes')
      .gt('monthly_donation', 0)
      .order('last_name')

    if (e1) throw e1

    const parentIdArr = (donorParents ?? []).map(p => p.id)

    // Donation PPs for this month
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
      // מגבית לפני 06/2026 היסטורית — לא מוצגת
      if (ppBeforeStart('donation', { month_year: pp.month_year as string | null })) continue
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        ppMap[pid] = { id: pp.id, amount: Number(pp.amount), balance: Number(pp.balance) }
      }
    }

    const donors: DonorRow[] = (donorParents ?? []).map(p => ({
      id:              p.id,
      name:            p.name,
      firstName:       p.first_name ?? '',
      lastName:        p.last_name ?? '',
      monthlyDonation: Number(p.monthly_donation) || 0,
      paymentMethod:   'ניכוי משכורת',
      soStatus:        'פעיל',
      ppThisMonth:     ppMap[p.id] ?? null,
    }))

    donors.sort((a, b) => (a.lastName ?? '').localeCompare(b.lastName ?? '', 'he'))

    const totalMonthly = donors.reduce((s, d) => s + d.monthlyDonation, 0)
    const totalPaid    = donors.filter(d => d.ppThisMonth && d.ppThisMonth.balance <= 0).length
    const totalPartial = donors.filter(d => d.ppThisMonth && d.ppThisMonth.balance > 0 && d.ppThisMonth.balance < d.monthlyDonation).length
    const totalUnpaid  = donors.filter(d => !d.ppThisMonth || d.ppThisMonth.balance >= d.monthlyDonation).length

    return NextResponse.json({
      donors,
      summary: { total: donors.length, totalMonthly, totalPaid, totalPartial, totalUnpaid, month },
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
