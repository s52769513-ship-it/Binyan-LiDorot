import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { ppTypeForProject, MISSING_COLUMN_CODES } from '@/lib/ppPayments'
import { ppBeforeStart } from '@/lib/cutoffs'
import { round2 } from '@/lib/money'

export const maxDuration = 120
export const dynamic = 'force-dynamic'

/**
 * GET /api/dashboard/attention
 *
 * מרכז "מה דורש טיפול": מאתר מצבים שעד היום התגלו רק במקרה — החזרות הו"ק שלא
 * טופלו, תשלומים שלא שויכו לחוב, תנועות בסכום אפס, שורות זיכוי יתומות והו"ק
 * ללא הורה — יחד עם דוח גילאי חוב.
 *
 * כל בדיקה עטופה בנפרד: בדיקה שנכשלת מסומנת כ"לא נבדק" ואינה מפילה את המסך.
 */

/** סימון שהתיקון החד-פעמי מוסיף להחזרה שטופלה (app/api/automations/fix-past-hok-returns) */
const HANDLED_NOTE = 'חוב הוחזר'

export interface DetailRow {
  id: string
  parentId: string | null
  parentName: string
  amount: number
  date: string
  label: string
  sub: string
}

export interface Finding {
  key: string
  title: string
  /** null = הבדיקה נכשלה ולא ידוע */
  count: number | null
  amount?: number
  hint: string
  error?: string
}

const DAY_MS = 86_400_000

async function safe<T>(fn: () => Promise<T>, fallback: T): Promise<{ value: T; error?: string }> {
  try {
    return { value: await fn() }
  } catch (err) {
    return { value: fallback, error: err instanceof Error ? err.message : String(err) }
  }
}

/** שורות הפירוט לכל ממצא — לרשימת הטיפול המהיר שנפתחת בלחיצה על קובייה. */
async function detailRows(key: string): Promise<DetailRow[]> {
  const withParents = async (rows: {
    id: string; parentIds: string[]; amount?: number; date?: string; label: string; sub?: string
  }[]): Promise<DetailRow[]> => {
    const ids = [...new Set(rows.flatMap(r => r.parentIds))]
    const names = new Map<string, string>()
    const CH = 300
    for (let i = 0; i < ids.length; i += CH) {
      const { data } = await supabaseAdmin
        .from('parents').select('id, name').in('id', ids.slice(i, i + CH))
      for (const p of data ?? []) names.set(p.id as string, (p.name as string) ?? '')
    }
    return rows.map(r => ({
      id: r.id,
      parentId: r.parentIds[0] ?? null,
      parentName: r.parentIds[0] ? (names.get(r.parentIds[0]) ?? '—') : '—',
      amount: r.amount ?? 0,
      date: r.date ?? '',
      label: r.label,
      sub: r.sub ?? '',
    }))
  }

  if (key === 'returns') {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, date, notes, parent_ids')
      .eq('type', 'החזרת הו"ק')
      .order('date', { ascending: false })
    const pending = (data ?? []).filter(t => !String(t.notes ?? '').includes(HANDLED_NOTE))
    return withParents(pending.map(t => ({
      id: t.id as string,
      parentIds: (t.parent_ids as string[]) ?? [],
      amount: Math.abs(Number(t.amount) || 0),
      date: String(t.date ?? ''),
      label: 'החזרת הו"ק',
      sub: String(t.notes ?? '').slice(0, 60),
    })))
  }

  if (key === 'positive-returns') {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, date, notes, parent_ids')
      .eq('type', 'החזרת הו"ק')
      .gt('amount', 0)
      .order('date', { ascending: false })
    return withParents((data ?? []).map(t => ({
      id: t.id as string,
      parentIds: (t.parent_ids as string[]) ?? [],
      amount: Number(t.amount) || 0,
      date: String(t.date ?? ''),
      label: 'החזרה בסכום חיובי',
      sub: String(t.notes ?? '').slice(0, 60),
    })))
  }

  if (key === 'unlinked') {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('id, amount, date, type, notes, project_names, parent_ids')
      .is('planned_payment_id', null)
      .gt('amount', 0)
      .order('date', { ascending: false })
      .limit(500)
    const rows = (data ?? []).filter(t => {
      const ppType = ppTypeForProject((t.project_names as string[] | null)?.join(' '))
      if (!ppType) return false
      if (String(t.notes ?? '').startsWith('זיכוי')) return false
      return !ppBeforeStart(ppType, { date: t.date as string | null, month_year: null })
    })
    return withParents(rows.map(t => ({
      id: t.id as string,
      parentIds: (t.parent_ids as string[]) ?? [],
      amount: Number(t.amount) || 0,
      date: String(t.date ?? ''),
      label: String(t.type ?? 'תנועה'),
      sub: ((t.project_names as string[]) ?? []).join(', '),
    })))
  }

  if (key === 'zero') {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('id, date, type, notes, project_names, parent_ids')
      .eq('amount', 0)
      .order('date', { ascending: false })
      .limit(500)
    return withParents((data ?? []).map(t => ({
      id: t.id as string,
      parentIds: (t.parent_ids as string[]) ?? [],
      amount: 0,
      date: String(t.date ?? ''),
      label: String(t.type ?? 'תנועה'),
      sub: [((t.project_names as string[]) ?? []).join(', '), String(t.notes ?? '')].filter(Boolean).join(' · ').slice(0, 60),
    })))
  }

  if (key === 'orphan-credit') {
    const q = await supabaseAdmin
      .from('transactions')
      .select('id, amount, date, notes, parent_ids, source_transaction_id')
      .eq('type', 'זיכוי')
      .not('source_transaction_id', 'is', null)
      .limit(1000)
    if (q.error) return []
    const srcIds = [...new Set((q.data ?? []).map(t => t.source_transaction_id as string))]
    const alive = new Set<string>()
    const CH = 300
    for (let i = 0; i < srcIds.length; i += CH) {
      const { data } = await supabaseAdmin
        .from('transactions').select('id').in('id', srcIds.slice(i, i + CH))
      for (const t of data ?? []) alive.add(t.id as string)
    }
    const orphans = (q.data ?? []).filter(t => !alive.has(t.source_transaction_id as string))
    return withParents(orphans.map(t => ({
      id: t.id as string,
      parentIds: (t.parent_ids as string[]) ?? [],
      amount: Math.abs(Number(t.amount) || 0),
      date: String(t.date ?? ''),
      label: 'זיכוי יתום',
      sub: String(t.notes ?? '').slice(0, 60),
    })))
  }

  if (key === 'so-no-parent') {
    const { data } = await supabaseAdmin
      .from('standing_orders')
      .select('id, external_id, amount, bank_name, standing_order_type')
      .is('parent_id', null)
      .limit(500)
    return (data ?? []).map(so => ({
      id: so.id as string,
      parentId: null,
      parentName: '— ללא הורה —',
      amount: Number(so.amount) || 0,
      date: '',
      label: `הו"ק ${so.external_id ?? ''}`,
      sub: [so.standing_order_type, so.bank_name].filter(Boolean).join(' · '),
    }))
  }

  return []
}

export async function GET(req: NextRequest) {
  // מצב פירוט: מחזיר את השורות עצמן לרשימת הטיפול המהיר
  const detailKey = req.nextUrl.searchParams.get('detail')
  if (detailKey) {
    try {
      return NextResponse.json({ rows: await detailRows(detailKey) })
    } catch (err) {
      return NextResponse.json(
        { rows: [], error: err instanceof Error ? err.message : String(err) },
        { status: 500 },
      )
    }
  }

  const findings: Finding[] = []

  // ── החזרות הו"ק שטרם טופלו ────────────────────────────────────────────────
  {
    const r = await safe(async () => {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, notes')
        .eq('type', 'החזרת הו"ק')
      if (error) throw error
      const pending = (data ?? []).filter(t => !String(t.notes ?? '').includes(HANDLED_NOTE))
      return {
        count: pending.length,
        amount: round2(pending.reduce((s, t) => s + Math.abs(Number(t.amount) || 0), 0)),
      }
    }, { count: 0, amount: 0 })
    findings.push({
      key: 'returns',
      title: 'החזרות הו"ק שלא טופלו',
      count: r.error ? null : r.value.count,
      amount: r.value.amount,
      hint: 'החיוב המקורי עדיין נחשב כתשלום — החוב של ההורה נמוך מהאמת. הרץ "תיקון החזרות הו״ק קודמות" באוטומציות.',
      error: r.error,
    })
  }

  // ── החזרות הו"ק שנרשמו בסכום חיובי ────────────────────────────────────────
  {
    const r = await safe(async () => {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, amount')
        .eq('type', 'החזרת הו"ק')
        .gt('amount', 0)
      if (error) throw error
      return {
        count: (data ?? []).length,
        amount: round2((data ?? []).reduce((s, t) => s + (Number(t.amount) || 0), 0)),
      }
    }, { count: 0, amount: 0 })
    findings.push({
      key: 'positive-returns',
      title: 'החזרות הו"ק בסכום חיובי',
      count: r.error ? null : r.value.count,
      amount: r.value.amount,
      hint: 'החזרה חייבת להיות שלילית. בסכום חיובי היא נספרת כתשלום ומקטינה את החוב במקום להגדיל אותו — טעות כפולה. פתח את הרשימה ותקן.',
      error: r.error,
    })
  }

  // ── תשלומים שלא שויכו לשום חוב ────────────────────────────────────────────
  {
    const r = await safe(async () => {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id, amount, date, project_names, notes')
        .is('planned_payment_id', null)
        .gt('amount', 0)
        .order('date', { ascending: false })
        .limit(500)
      if (error) throw error
      const rows = (data ?? []).filter(t => {
        // רק תנועות שהקטגוריה שלהן היא חוב (שכ"ל/מגבית/עמלה) — שאר הקטגוריות
        // אינן אמורות להיות מקושרות בכלל
        const type = ppTypeForProject((t.project_names as string[] | null)?.join(' '))
        if (!type) return false
        // שורות זיכוי/גלישה שהמערכת יצרה אינן תשלומים
        if (String(t.notes ?? '').startsWith('זיכוי')) return false
        // תנועה שלפני החיתוך אינה אמורה להתקשר — לא ממצא
        return !ppBeforeStart(type, { date: t.date as string | null, month_year: null })
      })
      return {
        count: rows.length,
        amount: round2(rows.reduce((s, t) => s + (Number(t.amount) || 0), 0)),
      }
    }, { count: 0, amount: 0 })
    findings.push({
      key: 'unlinked',
      title: 'תשלומים שלא שויכו לחוב',
      count: r.error ? null : r.value.count,
      amount: r.value.amount,
      hint: 'כסף שנכנס אך אינו מקטין שום חוב. פתח את התנועה וקשר לתשלום מתוכנן, או הרץ ריענון.',
      error: r.error,
    })
  }

  // ── תנועות בסכום אפס ──────────────────────────────────────────────────────
  {
    const r = await safe(async () => {
      const { data, error } = await supabaseAdmin
        .from('transactions')
        .select('id')
        .eq('amount', 0)
      if (error) throw error
      return { count: (data ?? []).length }
    }, { count: 0 })
    findings.push({
      key: 'zero',
      title: 'תנועות בסכום ₪0',
      count: r.error ? null : r.value.count,
      hint: 'תנועה ללא סכום היא כמעט תמיד תקלה בקליטה. כדאי לפתוח, לבדוק את המקור ולמחוק אם אינה נחוצה.',
      error: r.error,
    })
  }

  // ── שורות זיכוי יתומות (המקור שלהן נמחק) ──────────────────────────────────
  {
    const r = await safe(async () => {
      const q = await supabaseAdmin
        .from('transactions')
        .select('id, source_transaction_id')
        .eq('type', 'זיכוי')
        .not('source_transaction_id', 'is', null)
        .limit(1000)
      // העמודה עשויה לא להתקיים (SPILLOVER_MIGRATION לא הורץ) — אז אין מה לבדוק
      if (q.error) {
        if (MISSING_COLUMN_CODES.has(q.error.code)) return { count: 0 }
        throw q.error
      }
      const srcIds = [...new Set((q.data ?? []).map(t => t.source_transaction_id as string))]
      if (srcIds.length === 0) return { count: 0 }
      const alive = new Set<string>()
      const CH = 300
      for (let i = 0; i < srcIds.length; i += CH) {
        const { data } = await supabaseAdmin
          .from('transactions').select('id').in('id', srcIds.slice(i, i + CH))
        for (const t of data ?? []) alive.add(t.id as string)
      }
      const orphans = (q.data ?? []).filter(t => !alive.has(t.source_transaction_id as string))
      return { count: orphans.length }
    }, { count: 0 })
    findings.push({
      key: 'orphan-credit',
      title: 'שורות זיכוי יתומות',
      count: r.error ? null : r.value.count,
      hint: 'שורת "זיכוי מעודף תשלום" שהתנועה שיצרה אותה נמחקה. ריענון ההורה ינקה אותן.',
      error: r.error,
    })
  }

  // ── הו"ק ללא שיוך להורה ───────────────────────────────────────────────────
  {
    const r = await safe(async () => {
      const { data, error } = await supabaseAdmin
        .from('standing_orders')
        .select('id')
        .is('parent_id', null)
      if (error) throw error
      return { count: (data ?? []).length }
    }, { count: 0 })
    findings.push({
      key: 'so-no-parent',
      title: 'הו"ק ללא שיוך להורה',
      count: r.error ? null : r.value.count,
      hint: 'חיוב שייכנס על הו"ק כזו לא יידע לאיזה הורה לזקוף אותו.',
      error: r.error,
    })
  }

  // ── דוח גילאי חוב ─────────────────────────────────────────────────────────
  const agingRes = await safe(async () => {
    const q = (cols: string) => supabaseAdmin
      .from('planned_payments')
      .select(cols)
      .gt('balance', 0)
      .neq('pp_type', 'salary')
    let res = await q('id, parent_ids, balance, date, month_year, pp_type, is_legacy')
    if (res.error && MISSING_COLUMN_CODES.has(res.error.code)) {
      res = await q('id, parent_ids, balance, date, month_year, pp_type')
    }
    if (res.error) throw res.error
    const rows = (res.data ?? []) as unknown as Record<string, unknown>[]

    const today = Date.now()
    type Bucket = { d30: number; d60: number; d90: number; d90plus: number; legacy: number; total: number; oldest: number }
    const byParent = new Map<string, Bucket>()

    for (const pp of rows) {
      const ids = (pp.parent_ids as string[]) ?? []
      const pid = ids[0]
      if (!pid) continue
      const bal = round2(Number(pp.balance) || 0)
      if (bal <= 0) continue
      const type = (pp.pp_type as string) ?? 'tuition'

      const b = byParent.get(pid) ?? { d30: 0, d60: 0, d90: 0, d90plus: 0, legacy: 0, total: 0, oldest: 0 }

      // חוב ישן ולפני-חיתוך נספרים בנפרד: תשלום אוטומטי אינו יורד מהם, ולכן
      // ערבובם בחוב הפעיל מציג מספר שאי אפשר להקטין (מקרה גרומן).
      const isLegacy = pp.is_legacy === true ||
        ppBeforeStart(type, { date: pp.date as string | null, month_year: pp.month_year as string | null })
      if (isLegacy) {
        b.legacy = round2(b.legacy + bal)
        byParent.set(pid, b)
        continue
      }

      const dateStr = (pp.date as string | null) ?? null
      const due = dateStr ? new Date(dateStr).getTime() : NaN
      const days = isNaN(due) ? 0 : Math.floor((today - due) / DAY_MS)
      if (days <= 0) { byParent.set(pid, b); continue }   // טרם הגיע מועד — לא באיחור

      if (days <= 30)      b.d30     = round2(b.d30 + bal)
      else if (days <= 60) b.d60     = round2(b.d60 + bal)
      else if (days <= 90) b.d90     = round2(b.d90 + bal)
      else                 b.d90plus = round2(b.d90plus + bal)
      b.total  = round2(b.total + bal)
      b.oldest = Math.max(b.oldest, days)
      byParent.set(pid, b)
    }

    const withDebt = [...byParent.entries()].filter(([, b]) => b.total > 0 || b.legacy > 0)
    const ids = withDebt.map(([pid]) => pid)
    const nameMap = new Map<string, string>()
    const CH = 300
    for (let i = 0; i < ids.length; i += CH) {
      const { data } = await supabaseAdmin
        .from('parents').select('id, name').in('id', ids.slice(i, i + CH))
      for (const p of data ?? []) nameMap.set(p.id as string, (p.name as string) ?? '')
    }

    return withDebt
      .map(([pid, b]) => ({
        parentId: pid,
        parentName: nameMap.get(pid) || '—',
        d30: b.d30, d60: b.d60, d90: b.d90, d90plus: b.d90plus,
        legacy: b.legacy,
        total: b.total,
        oldestDays: b.oldest,
      }))
      .sort((a, b) => b.total - a.total)
  }, [] as {
    parentId: string; parentName: string
    d30: number; d60: number; d90: number; d90plus: number
    legacy: number; total: number; oldestDays: number
  }[])

  return NextResponse.json({
    findings,
    aging: agingRes.value,
    agingError: agingRes.error ?? null,
  })
}
