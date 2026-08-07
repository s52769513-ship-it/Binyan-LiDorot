import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { buildPaymentLink } from '@/lib/nedarimActions'
import { ppBeforeStart } from '@/lib/cutoffs'
import { round2 } from '@/lib/money'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nedarim/payment-link?parentId=...&amount=...
 *
 * בונה קישור לדף התשלום של נדרים עם פרטי ההורה והסכום ממולאים מראש. אינו פונה
 * לנדרים ואינו מחייב דבר — רק מייצר כתובת להעתקה ושליחה.
 *
 * כשלא נמסר סכום, מוצע החוב שתשלום *באמת* יכול להקטין: בלי משכורות, בלי חוב
 * ישן ובלי מה שלפני החיתוך — אותו כלל שנאכף בקליטת התשלום ובריענון. אחרת
 * היינו שולחים להורה לשלם סכום שלא יסגור לו את החוב.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const parentId = searchParams.get('parentId') ?? ''
    const amountParam = searchParams.get('amount')
    if (!parentId) return NextResponse.json({ error: 'חסר מזהה הורה' }, { status: 400 })

    const { data: parent, error } = await supabaseAdmin
      .from('parents')
      .select('id, name, father_phone, mother_phone, email, city, address, id_number')
      .eq('id', parentId)
      .single()
    if (error || !parent) return NextResponse.json({ error: 'הורה לא נמצא' }, { status: 404 })

    // החוב הניתן לגבייה
    const { data: pps } = await supabaseAdmin
      .from('planned_payments')
      .select('balance, pp_type, date, month_year, is_legacy')
      .contains('parent_ids', [parentId])
      .gt('balance', 0)
      .neq('pp_type', 'salary')

    let payable = 0
    for (const pp of (pps ?? []) as unknown as Record<string, unknown>[]) {
      if (pp.is_legacy === true) continue
      const t = (pp.pp_type as string) ?? 'tuition'
      if (ppBeforeStart(t, { date: pp.date as string | null, month_year: pp.month_year as string | null })) continue
      payable = round2(payable + (Number(pp.balance) || 0))
    }

    const amount = amountParam != null && amountParam !== ''
      ? round2(Number(amountParam) || 0)
      : payable

    const url = buildPaymentLink({
      amount: amount > 0 ? amount : undefined,
      lockAmount: amount > 0,
      clientName: String(parent.name ?? ''),
      phone: String(parent.father_phone || parent.mother_phone || ''),
      email: String(parent.email ?? ''),
      zeout: String(parent.id_number ?? ''),
      city: String(parent.city ?? ''),
      street: String(parent.address ?? ''),
    })

    return NextResponse.json({ url, amount, payableDebt: payable, parentName: String(parent.name ?? '') })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
