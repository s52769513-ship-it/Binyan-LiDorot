import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  setBankStandingOrderStatus,
  MASAV_ACTION_LABEL,
  type MasavStatusAction,
} from '@/lib/nedarimActions'
import { logActivity, actorFromRequest } from '@/lib/activityLog'

export const maxDuration = 60

const ACTIONS: MasavStatusAction[] = ['activate', 'freeze', 'prevMonth', 'nextMonth']

/**
 * POST /api/standing-orders/[id]/nedarim-status
 * הפעלה / הקפאה / הקפצת חודש של הוראת קבע בנקאית — ישירות בנדרים.
 *
 * body: { action, preview?: true, confirm?: true }
 *
 * הפעולות משנות מצב אצל נדרים ומשפיעות על גבייה בפועל, ולכן:
 * - preview מחזיר מה עומד לקרות ולמי, בלי לבצע.
 * - ביצוע דורש confirm מפורש.
 * - התוצאה נרשמת ביומן ההורה, גם כשהיא נכשלת.
 *
 * זמין להוראות קבע בנקאיות בלבד — לאשראי יש נתיבים אחרים בנדרים.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    const action = String(body?.action ?? '') as MasavStatusAction
    const preview = body?.preview === true
    const confirmed = body?.confirm === true

    if (!ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'פעולה לא מוכרת' }, { status: 400 })
    }

    const { data: so, error } = await supabaseAdmin
      .from('standing_orders')
      .select('id, external_id, standing_order_type, amount, status, charge_day, parent_id, linked_parent_id')
      .eq('id', id)
      .single()
    if (error || !so) return NextResponse.json({ error: 'הוראת קבע לא נמצאה' }, { status: 404 })

    const externalId = String(so.external_id ?? '')
    if (!externalId) {
      return NextResponse.json({ error: 'להוראת קבע זו אין מזהה בנדרים' }, { status: 400 })
    }
    if (!String(so.standing_order_type ?? '').includes('בנקאי')) {
      return NextResponse.json(
        { error: 'הפעולה זמינה להוראת קבע בנקאית בלבד' },
        { status: 400 },
      )
    }

    const parentId = (so.parent_id as string) || (so.linked_parent_id as string) || null
    let parentName = ''
    if (parentId) {
      const { data: p } = await supabaseAdmin.from('parents').select('name').eq('id', parentId).single()
      parentName = (p?.name as string) ?? ''
    }

    if (preview) {
      return NextResponse.json({
        preview: true,
        action,
        actionLabel: MASAV_ACTION_LABEL[action],
        parentName,
        externalId,
        amount: Number(so.amount) || 0,
        currentStatus: String(so.status ?? ''),
        chargeDay: so.charge_day ?? null,
        warning: action === 'activate'
          ? 'הפעלת הוראת קבע שהבנק טרם אישר עלולה לגרור עמלות חזרה מיותרות.'
          : null,
      })
    }

    if (!confirmed) {
      return NextResponse.json({ error: 'הפעולה דורשת אישור מפורש' }, { status: 400 })
    }

    const result = await setBankStandingOrderStatus({ masavId: externalId, action })

    if (parentId) {
      void logActivity({
        parentId,
        actor: actorFromRequest(req),
        action: 'update',
        summary: result.ok
          ? `${MASAV_ACTION_LABEL[action]} · הו"ק ${externalId} — בוצע בנדרים`
          : `${MASAV_ACTION_LABEL[action]} · הו"ק ${externalId} נכשל: ${result.message}`,
      })
    }

    return NextResponse.json(
      { ok: result.ok, message: result.message, action, actionLabel: MASAV_ACTION_LABEL[action] },
      { status: result.ok ? 200 : 502 },
    )
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
