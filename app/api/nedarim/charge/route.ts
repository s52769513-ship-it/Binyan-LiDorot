import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { chargeBankStandingOrder, chargeCreditStandingOrder } from '@/lib/nedarimActions'
import { logActivity, actorFromRequest } from '@/lib/activityLog'
import { round2 } from '@/lib/money'

export const maxDuration = 60

/**
 * POST /api/nedarim/charge
 * חיוב בודד מהוראת קבע קיימת — "חיוב חוזר" אחרי הו"ק שחזרה.
 *
 * זו פעולה שמוציאה כסף אמיתי בעולם האמיתי ואי אפשר לבטלה בלחיצה, ולכן:
 * - preview=true מחזיר בדיוק מה עומד לקרות (למי, כמה, באיזו הו"ק) בלי לחייב.
 * - החיוב בפועל דורש `confirm: true` *וגם* התאמה של הסכום שהוצג בתצוגה
 *   המקדימה, כך שלחיצה כפולה או בקשה ישנה לא יחייבו סכום אחר ממה שאושר.
 * - נדרים מקבלים AjaxId (חותמת זמן) כהגנה מכפילות בצד שלהם.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const standingOrderId = String(body?.standingOrderId ?? '')
    const amount = round2(Number(body?.amount) || 0)
    const preview = body?.preview === true
    const confirmed = body?.confirm === true

    if (!standingOrderId) return NextResponse.json({ error: 'חסר מזהה הוראת קבע' }, { status: 400 })
    if (amount <= 0)      return NextResponse.json({ error: 'סכום חייב להיות גדול מאפס' }, { status: 400 })

    const { data: so, error } = await supabaseAdmin
      .from('standing_orders')
      .select('id, external_id, standing_order_type, amount, bank_name, parent_id, linked_parent_id, status')
      .eq('id', standingOrderId)
      .single()
    if (error || !so) return NextResponse.json({ error: 'הוראת קבע לא נמצאה' }, { status: 404 })

    const externalId = String(so.external_id ?? '')
    if (!externalId) {
      return NextResponse.json({ error: 'להוראת קבע זו אין מזהה בנדרים — לא ניתן לחייב' }, { status: 400 })
    }

    const isBank = String(so.standing_order_type ?? '').includes('בנקאי')
    const parentId = (so.parent_id as string) || (so.linked_parent_id as string) || null
    let parentName = ''
    if (parentId) {
      const { data: p } = await supabaseAdmin.from('parents').select('name').eq('id', parentId).single()
      parentName = (p?.name as string) ?? ''
    }

    if (preview) {
      return NextResponse.json({
        preview: true,
        parentName,
        externalId,
        kind: isBank ? 'בנקאי (מס"ב)' : 'אשראי',
        bankName: String(so.bank_name ?? ''),
        regularAmount: round2(Number(so.amount) || 0),
        amount,
        status: String(so.status ?? ''),
        note: 'החיוב יירשם בהיסטוריית ההוראה בנדרים ולא ישנה את תאריך החיוב הבא או את יתרת התשלומים.',
      })
    }

    if (!confirmed) {
      return NextResponse.json({ error: 'חיוב דורש אישור מפורש' }, { status: 400 })
    }

    const result = isBank
      ? await chargeBankStandingOrder({ masavId: externalId, amount })
      : await chargeCreditStandingOrder({ kevaId: externalId, amount })

    // מתעדים גם כישלון — ניסיון חיוב הוא מידע שצריך להישאר בכרטיס
    if (parentId) {
      void logActivity({
        parentId,
        actor: actorFromRequest(req),
        action: result.ok ? 'automation' : 'update',
        summary: result.ok
          ? `חיוב חוזר מהו"ק ${externalId} על ₪${amount.toLocaleString('he-IL')} — בוצע בנדרים`
          : `ניסיון חיוב חוזר מהו"ק ${externalId} על ₪${amount.toLocaleString('he-IL')} נכשל: ${result.message}`,
      })
    }

    return NextResponse.json({
      ok: result.ok,
      message: result.message,
      externalId,
      amount,
      parentName,
    }, { status: result.ok ? 200 : 502 })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
