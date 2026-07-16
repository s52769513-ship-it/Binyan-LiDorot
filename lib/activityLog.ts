import { NextRequest } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const SYSTEM_ACTOR = 'מערכת (אוטומציה)'

/** Extracts the acting user's email from the same header authHeaders() sends. */
export function actorFromRequest(req: NextRequest): string {
  return req.headers.get('x-auth-email') || 'משתמש לא מזוהה'
}

/**
 * רושם שורת יומן פעולות עבור הורה. Best-effort — לעולם לא זורק, כדי שכשל
 * ברישום לא יפיל פעולה אמיתית (עדכון/יצירה/מחיקה) שכבר הצליחה.
 */
export async function logActivity(opts: {
  parentId: string | null | undefined
  actor: string
  action: 'create' | 'update' | 'delete' | 'automation'
  summary: string
  details?: unknown
}): Promise<void> {
  if (!opts.parentId) return
  try {
    await supabaseAdmin.from('activity_log').insert({
      id:         crypto.randomUUID(),
      parent_id:  opts.parentId,
      actor:      opts.actor || SYSTEM_ACTOR,
      action:     opts.action,
      summary:    opts.summary,
      details:    opts.details ?? null,
    })
  } catch { /* best-effort — never break the calling action */ }
}

/** רושם יומן לכמה הורים בבת אחת (למשל תנועה עם כמה parent_ids). */
export async function logActivityForParents(
  parentIds: (string | null | undefined)[],
  opts: { actor: string; action: 'create' | 'update' | 'delete' | 'automation'; summary: string; details?: unknown },
): Promise<void> {
  const ids = [...new Set(parentIds.filter((id): id is string => !!id))]
  await Promise.all(ids.map(id => logActivity({ parentId: id, ...opts })))
}

// Human-readable labels for the fields editable via PATCH /api/parents/[id],
// used to render "עודכן <שדה>" instead of raw camelCase keys.
export const FIELD_LABELS: Record<string, string> = {
  firstName: 'שם פרטי', lastName: 'שם משפחה', motherName: 'שם האם',
  fatherPhone: 'טלפון אב', motherPhone: 'טלפון אם', email: 'אימייל',
  address: 'כתובת', building: 'בניין', city: 'עיר', notes: 'הערות',
  status: 'סטטוס', personType: 'סוג', tuitionTotal: 'סה"כ שכ"ל',
  tuitionBalance: 'יתרת שכ"ל', birthDate: 'תאריך לידה',
  idNumber: 'ת"ז', nickname: 'כינוי', titleAfter: 'תואר', benReb: 'בן/בר',
  beneficiaryName: 'שם מוטב', homePhone: 'טלפון בית', synagogue: 'בית כנסת',
  extraPhone: 'טלפון נוסף', bankName: 'בנק', bankBranch: 'סניף',
  bankAccount: 'חשבון בנק', chargeDay: 'יום חיוב', standingOrderType: 'סוג הו"ק',
  standingOrderId: 'הו"ק', baseHourlyRate: 'תעריף שעתי', seniorityBonusHourly: 'תוספת ותק',
  monthlyHoursDecimal: 'שעות חודשיות', fixedBonus: 'תוספת קבועה',
  exceptionalExpenses: 'הוצאות חריגות', transportReimbursement: 'החזר נסיעות',
  deductTuition: 'קיזוז שכ"ל', monthlyDonation: 'מגבית חודשית',
  deductDonation: 'קיזוז מגבית', showSpouseSalary: 'הצגת שכר בן/בת זוג',
  calculateWifeTuition: 'חישוב שכ"ל אישה', salaryGross: 'שכר ברוטו',
  salaryAfterTuition: 'שכר אחרי שכ"ל', creditBalance: 'זיכוי שכ"ל',
  ppCredit: 'זיכוי שמור', donationCreditBalance: 'זיכוי מגבית',
}

function fmtVal(v: unknown): string {
  if (v == null || v === '') return '—'
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—'
  if (typeof v === 'boolean') return v ? 'כן' : 'לא'
  return String(v)
}

/** בונה תקציר "עודכן X מ-Y ל-Z" לכמה שדות שהשתנו באותה קריאת PATCH. */
export function summarizeFieldChanges(
  changes: { key: string; oldValue: unknown; newValue: unknown }[],
): string {
  const parts = changes.map(c => {
    const label = FIELD_LABELS[c.key] || c.key
    return `${label}: ${fmtVal(c.oldValue)} ← ${fmtVal(c.newValue)}`
  })
  return `עודכנו פרטים: ${parts.join(' · ')}`
}
