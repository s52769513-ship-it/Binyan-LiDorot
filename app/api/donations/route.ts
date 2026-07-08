import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  try {
    const month = req.nextUrl.searchParams.get('month') ?? currentMY()

    // Parents explicitly set as monthly donors (monthly_donation > 0)
    const { data: donorParents, error: e1 } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name, monthly_donation, notes')
      .gt('monthly_donation', 0)
      .order('last_name')

    if (e1) throw e1

    // Donation PPs for this month — for ANY parent, so debts added manually
    // ("הוספת חוב") to someone who isn't a fixed monthly donor still show up.
    const { data: pps } = await supabaseAdmin
      .from('planned_payments')
      .select('id, parent_ids, name, amount, balance, month_year')
      .eq('pp_type', 'donation')
      .eq('month_year', month)

    // Aggregate PPs per parent (a parent may have more than one this month)
    const ppMap: Record<string, { id: string; amount: number; balance: number }> = {}
    for (const pp of pps ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        const prev = ppMap[pid]
        ppMap[pid] = prev
          ? { id: prev.id, amount: prev.amount + Number(pp.amount), balance: prev.balance + Number(pp.balance) }
          : { id: pp.id, amount: Number(pp.amount), balance: Number(pp.balance) }
      }
    }

    // Include parents who have a donation PP this month but aren't fixed donors
    const donorIdSet = new Set((donorParents ?? []).map(p => p.id))
    const extraIds = Object.keys(ppMap).filter(id => !donorIdSet.has(id))
    let extraParents: NonNullable<typeof donorParents> = []
    if (extraIds.length > 0) {
      const { data: ep } = await supabaseAdmin
        .from('parents')
        .select('id, name, first_name, last_name, monthly_donation, notes')
        .in('id', extraIds)
      extraParents = ep ?? []
    }

    const allParents = [...(donorParents ?? []), ...extraParents]

    const donors: DonorRow[] = allParents.map(p => {
      const pp = ppMap[p.id] ?? null
      const monthly = Number(p.monthly_donation) || 0
      return {
        id:              p.id,
        name:            p.name,
        firstName:       p.first_name ?? '',
        lastName:        p.last_name ?? '',
        // For ad-hoc donors (no fixed monthly amount) fall back to the debt amount
        monthlyDonation: monthly > 0 ? monthly : (pp ? pp.amount : 0),
        paymentMethod:   monthly > 0 ? 'ניכוי משכורת' : 'חד פעמי',
        soStatus:        'פעיל',
        ppThisMonth:     pp,
      }
    })

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
