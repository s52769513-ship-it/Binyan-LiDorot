import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildPaymentLink } from '@/lib/nedarimActions'
import { ppBeforeStart } from '@/lib/cutoffs'
import { round2 } from '@/lib/money'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nedarim/payment-link?parentId=...
 *
 * מחזיר קישור לדף התשלום של נדרים *לכל פרויקט* שיש לו חוב פתוח, ובנוסף קישור
 * כללי בלי סכום. פרטי ההורה ממולאים, הסכום נעול על החוב של אותו פרויקט,
 * והקטגוריה (Groupe) נבחרת ונעולה מראש — כדי שהתשלום ייכנס לפרויקט הנכון
 * בנדרים ולא יידרש שיוך ידני אחר כך.
 *
 * אינו פונה לנדרים ואינו מחייב דבר — רק בונה כתובות.
 */

/** סוג החוב אצלנו → שם הקטגוריה בנדרים */
const PROJECT_OF: Record<string, string> = {
  tuition:  'בנין לדורות',
  donation: 'דמי מגבית',
  fee:      'עמלות',
}

const LABEL_OF: Record<string, string> = {
  tuition:  'שכר לימוד',
  donation: 'מגבית',
  fee:      'עמלות',
}

export async function GET(req: NextRequest) {
  try {
    const parentId = req.nextUrl.searchParams.get('parentId') ?? ''
    if (!parentId) return NextResponse.json({ error: 'חסר מזהה הורה' }, { status: 400 })

    const { data: parent, error } = await supabaseAdmin
      .from('parents')
      .select('id, name, father_phone, mother_phone, email, city, address, id_number')
      .eq('id', parentId)
      .single()
    if (error || !parent) return NextResponse.json({ error: 'הורה לא נמצא' }, { status: 404 })

    const { data: pps } = await supabaseAdmin
      .from('planned_payments')
      .select('balance, pp_type, date, month_year, is_legacy')
      .contains('parent_ids', [parentId])
      .gt('balance', 0)
      .neq('pp_type', 'salary')

    // חוב פתוח לפי סוג — רק מה שתשלום אוטומטי באמת יכול להקטין
    const byType = new Map<string, number>()
    for (const pp of (pps ?? []) as unknown as Record<string, unknown>[]) {
      if (pp.is_legacy === true) continue
      const t = (pp.pp_type as string) ?? 'tuition'
      if (ppBeforeStart(t, { date: pp.date as string | null, month_year: pp.month_year as string | null })) continue
      byType.set(t, round2((byType.get(t) ?? 0) + (Number(pp.balance) || 0)))
    }

    const donor = {
      clientName: String(parent.name ?? ''),
      phone: String(parent.father_phone || parent.mother_phone || ''),
      email: String(parent.email ?? ''),
      zeout: String(parent.id_number ?? ''),
      city: String(parent.city ?? ''),
      street: String(parent.address ?? ''),
    }

    const links = [...byType.entries()]
      .filter(([, amt]) => amt > 0)
      .sort((a, b) => b[1] - a[1])
      .map(([type, amount]) => ({
        key: type,
        label: LABEL_OF[type] ?? type,
        project: PROJECT_OF[type] ?? '',
        amount,
        url: buildPaymentLink({
          ...donor,
          amount,
          lockAmount: true,
          groupe: PROJECT_OF[type],
          lockGroupe: true,
        }),
      }))

    // קישור פתוח — בלי סכום ובלי קטגוריה נעולה, לתשלום חופשי
    links.push({
      key: 'open',
      label: 'תשלום חופשי',
      project: '',
      amount: 0,
      url: buildPaymentLink(donor),
    })

    return NextResponse.json({
      parentName: String(parent.name ?? ''),
      totalPayable: round2([...byType.values()].reduce((a, b) => a + b, 0)),
      links,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
