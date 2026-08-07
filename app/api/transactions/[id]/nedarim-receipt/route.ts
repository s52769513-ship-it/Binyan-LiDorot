import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { MISSING_COLUMN_CODES } from '@/lib/ppPayments'
import { logActivity, actorFromRequest } from '@/lib/activityLog'
import { round2 } from '@/lib/money'
import {
  saveExternalIncome,
  createReceipt,
  EXTERNAL_INCOME_LABEL,
  type ExternalIncomeKind,
} from '@/lib/nedarimActions'

export const maxDuration = 60
export const dynamic = 'force-dynamic'

/**
 * קבלה בנדרים על תנועה שנרשמה אצלנו.
 *
 * GET  — מצב בלבד: האם התנועה מתאימה, מה יקרה, והאם כבר הופקה קבלה.
 *        אינו פונה לנדרים ואינו משנה דבר.
 * POST { confirm: true } — מבצע.
 *
 * הפעולה היא **שרשרת של שתי כתיבות אצל נדרים**, ולא סנכרון:
 *   1. יצירת הכנסה חיצונית (SaveAchnasot) — רשומה שלא הייתה שם קודם.
 *   2. הפקת קבלה על המזהה שחזר (CreateInvoice).
 * לכן ההרצה דורשת אישור מפורש, ו-GET מחזיר בדיוק מה עומד להיכתב.
 */

/** אמצעי התשלום אצלנו → סוג ההכנסה החיצונית בנדרים */
const KIND_OF_TYPE: Record<string, ExternalIncomeKind> = {
  'מזומן':          'cash',
  'שיק':            'check',
  "צ'ק":            'check',
  'העברה בנקאית':   'transfer',
  'אחר':            'other',
}

/** אמצעי תשלום שכבר קיימים אצל נדרים — יצירת הכנסה עליהם תכפיל את הכסף אצלם */
const ALREADY_AT_NEDARIM = new Set(['הו"ק', 'נדרים'])
/** קיזוזים פנימיים — לא נכנס כסף בפועל, אין על מה להפיק קבלה */
const INTERNAL = new Set(['זיכוי', 'קיזוז משכר לימוד', 'קיזוז ממשכורת'])

const FULL_COLS = 'id, amount, type, date, notes, project_names, parent_ids, nedarim_income_id, nedarim_receipt_id, nedarim_receipt_at'
const BASE_COLS = 'id, amount, type, date, notes, project_names, parent_ids'

interface Loaded {
  tx: Record<string, unknown>
  /** המיגרציה טרם הורצה — אי אפשר לשמור את המזהה שנדרים יחזירו */
  columnsMissing: boolean
}

async function loadTx(id: string): Promise<Loaded | null> {
  let res = await supabaseAdmin.from('transactions').select(FULL_COLS).eq('id', id).single()
  let columnsMissing = false
  if (res.error && MISSING_COLUMN_CODES.has(res.error.code)) {
    columnsMissing = true
    res = await supabaseAdmin.from('transactions').select(BASE_COLS).eq('id', id).single()
  }
  if (res.error || !res.data) return null
  return { tx: res.data as unknown as Record<string, unknown>, columnsMissing }
}

interface Plan {
  ok: boolean
  reason?: string
  kind?: ExternalIncomeKind
  zeout?: string
  parentId?: string | null
  parentName?: string
  amount: number
  date: string
  groupe?: string
}

async function buildPlan(tx: Record<string, unknown>): Promise<Plan> {
  const amount = round2(Number(tx.amount) || 0)
  const date = String(tx.date ?? '')
  const txType = String(tx.type ?? '').trim()
  const base: Plan = { ok: false, amount, date }

  if (amount <= 0) {
    return { ...base, reason: 'קבלה מופקת על הכנסה בלבד — לתנועה זו סכום שאינו חיובי.' }
  }
  if (ALREADY_AT_NEDARIM.has(txType)) {
    return { ...base, reason: `תנועת ${txType} כבר קיימת אצל נדרים. יצירת הכנסה נוספת תרשום את הכסף פעמיים — הפק את הקבלה מתוך נדרים.` }
  }
  if (INTERNAL.has(txType)) {
    return { ...base, reason: `${txType} הוא קיזוז פנימי — לא נכנס כסף בפועל ואין על מה להפיק קבלה.` }
  }
  const kind = KIND_OF_TYPE[txType] ?? 'other'

  const parentId = ((tx.parent_ids as string[]) ?? [])[0] ?? null
  if (!parentId) {
    return { ...base, kind, reason: 'התנועה אינה משויכת לאדם — נדרים דורשים מזהה תורם.' }
  }
  const { data: parent } = await supabaseAdmin
    .from('parents').select('id, name, id_number').eq('id', parentId).single()
  const zeout = String(parent?.id_number ?? '').trim()
  const parentName = String(parent?.name ?? '')
  if (!zeout) {
    return {
      ...base, kind, parentId, parentName,
      reason: `אין מספר זהות ל${parentName || 'אדם המשויך'} — נדרים דורשים מזהה תורם. השלם מ.ז. בכרטיס ונסה שוב.`,
    }
  }

  const groupe = ((tx.project_names as string[]) ?? [])[0] ?? undefined
  return { ok: true, kind, zeout, parentId, parentName, amount, date, groupe }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const loaded = await loadTx(id)
    if (!loaded) return NextResponse.json({ error: 'תנועה לא נמצאה' }, { status: 404 })
    const { tx, columnsMissing } = loaded

    const incomeId  = (tx.nedarim_income_id as string) || null
    const receiptId = (tx.nedarim_receipt_id as string) || null
    const plan = await buildPlan(tx)
    // בלי העמודות אין איפה לשמור את מזהה ההכנסה, ולכן לא מציעים את הפעולה כלל
    // במקום להציע כפתור שייחסם בביצוע.
    const migrationHint = columnsMissing
      ? 'יש להריץ את NEDARIM_RECEIPT_MIGRATION.sql — בלי העמודות אי אפשר לשמור את מזהה ההכנסה, וניסיון חוזר היה יוצר הכנסה כפולה בנדרים.'
      : null

    return NextResponse.json({
      eligible: plan.ok && !columnsMissing,
      reason: migrationHint ?? plan.reason ?? null,
      incomeId,
      receiptId,
      receiptAt: (tx.nedarim_receipt_at as string) || null,
      columnsMissing,
      migrationHint,
      kind: plan.kind ?? null,
      kindLabel: plan.kind ? EXTERNAL_INCOME_LABEL[plan.kind] : null,
      parentName: plan.parentName ?? '',
      zeout: plan.zeout ?? '',
      amount: plan.amount,
      date: plan.date,
      groupe: plan.groupe ?? '',
      // מה בדיוק ייכתב אצל נדרים — כדי שהאישור לא יהיה "בסדר" עיוור
      steps: incomeId
        ? ['הפקת קבלה על ההכנסה הקיימת בנדרים (מזהה ' + incomeId + ')']
        : [
            `יצירת רשומת הכנסה חדשה בנדרים — ${plan.kind ? EXTERNAL_INCOME_LABEL[plan.kind] : ''}, ${plan.amount.toFixed(2)} ₪`,
            'הפקת קבלה על המזהה שיתקבל',
          ],
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const body = await req.json().catch(() => ({}))
    if (body?.confirm !== true) {
      return NextResponse.json({ error: 'הפעולה דורשת אישור מפורש' }, { status: 400 })
    }
    const tamalType = ['400', '405', '320'].includes(String(body?.tamalType))
      ? (String(body.tamalType) as '400' | '405' | '320')
      : '405'

    const loaded = await loadTx(id)
    if (!loaded) return NextResponse.json({ error: 'תנועה לא נמצאה' }, { status: 404 })
    const { tx, columnsMissing } = loaded

    // בלי מקום לשמור את מזהה ההכנסה, כל ניסיון חוזר ייצור הכנסה נוספת בנדרים.
    if (columnsMissing) {
      return NextResponse.json(
        { error: 'יש להריץ קודם את NEDARIM_RECEIPT_MIGRATION.sql — אחרת מזהה ההכנסה לא יישמר וניתן יהיה ליצור הכנסה כפולה בנדרים.' },
        { status: 400 },
      )
    }

    if (tx.nedarim_receipt_id) {
      return NextResponse.json(
        { error: `כבר הופקה קבלה לתנועה זו (${tx.nedarim_receipt_id}).` },
        { status: 409 },
      )
    }

    const plan = await buildPlan(tx)
    if (!plan.ok) return NextResponse.json({ error: plan.reason }, { status: 400 })

    const parentId = plan.parentId ?? null
    const log = (summary: string) => {
      if (parentId) void logActivity({ parentId, actor: actorFromRequest(req), action: 'update', summary })
    }

    // ── שלב 1: הכנסה חיצונית ─────────────────────────────────────────────────
    let incomeId = (tx.nedarim_income_id as string) || ''
    if (!incomeId) {
      const income = await saveExternalIncome({
        kind: plan.kind!,
        zeout: plan.zeout!,
        amount: plan.amount,
        date: plan.date || new Date(),
        groupe: plan.groupe,
        avour: String(body?.avour ?? '').trim() || plan.groupe,
        asmahta: String(body?.asmahta ?? '').trim() || undefined,
      })
      if (!income.ok) {
        log(`יצירת הכנסה בנדרים נכשלה: ${income.message}`)
        return NextResponse.json({ ok: false, stage: 'income', message: income.message }, { status: 502 })
      }
      incomeId = income.incomeId ?? ''

      // נשמר מיד — עוד לפני הקבלה. אם הפקת הקבלה תיכשל, ניסיון חוזר יפיק קבלה
      // על ההכנסה הזו במקום ליצור אחת נוספת.
      if (incomeId) {
        await supabaseAdmin.from('transactions').update({ nedarim_income_id: incomeId }).eq('id', id)
      }
      log(`נוצרה הכנסה בנדרים · ${EXTERNAL_INCOME_LABEL[plan.kind!]} ${plan.amount.toFixed(2)} ₪${incomeId ? ` · מזהה ${incomeId}` : ''}`)

      if (!incomeId) {
        // ההכנסה נרשמה אצלם אך בלי מזהה מוחזר — לא ננסה שוב, זו הכנסה כפולה.
        return NextResponse.json({
          ok: false,
          stage: 'income',
          message: 'ההכנסה נוצרה בנדרים אך לא הוחזר מזהה, ולכן הקבלה לא הופקה. הפק אותה ידנית בנדרים — אל תריץ שוב, זה ייצור הכנסה כפולה.',
        }, { status: 502 })
      }
    }

    // ── שלב 2: קבלה ──────────────────────────────────────────────────────────
    const receipt = await createReceipt({ transactionId: incomeId, type: 'Achnasot', tamalType })
    if (!receipt.ok) {
      log(`הפקת קבלה בנדרים נכשלה (הכנסה ${incomeId}): ${receipt.message}`)
      return NextResponse.json({
        ok: false, stage: 'receipt', incomeId,
        message: `ההכנסה נוצרה בנדרים (מזהה ${incomeId}) אך הקבלה נכשלה: ${receipt.message}. ניסיון חוזר יפיק קבלה על אותה הכנסה ולא ייצור אותה שוב.`,
      }, { status: 502 })
    }

    const receiptId = receipt.kabalaId ?? receipt.invoiceId ?? receipt.incomeId ?? incomeId
    await supabaseAdmin.from('transactions').update({
      nedarim_receipt_id: receiptId,
      nedarim_receipt_at: new Date().toISOString(),
    }).eq('id', id)
    log(`הופקה קבלה בנדרים · ${receiptId}`)

    return NextResponse.json({ ok: true, incomeId, receiptId, message: receipt.message || 'הקבלה הופקה' })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    )
  }
}
