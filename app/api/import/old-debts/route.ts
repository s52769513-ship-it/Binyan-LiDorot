import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { nameSimilarity } from '@/lib/nameUtils'

/**
 * Import "old debts" from the legacy work center.
 *
 * Each row carries a "type" (סוג):
 *   - "התחייב"  (obligation)  → creates a legacy tuition planned payment (PP שכ"ל)
 *   - "תשלום"   (payment)     → creates a payment transaction linked to the matching legacy PP
 *
 * Parents are matched by name. Rows are processed obligations-first so payments
 * can attach to the PP they pay. Use dryRun to preview matching before writing.
 */

interface RawRow {
  parentName: string
  type: string             // classification source (התחייב / תשלום)
  amount: number | string
  date?: string            // YYYY-MM-DD
  monthYear?: string       // MM/YYYY
  notes?: string
  paymentMethod?: string   // actual payment method for payment rows (העברה/מזומן/הו"ק/אשראי...)
}

const UNDEFINED_COLUMN = '42703'
const FAR_FUTURE = '2099-12-31T23:59:59.999Z'
const MATCH_THRESHOLD = 0.6

// Classify the row's "type" value into obligation vs payment.
function classify(type: string): 'charge' | 'payment' | 'unknown' {
  const t = (type ?? '').trim()
  if (/התחייב|חיוב|התחיב/.test(t)) return 'charge'
  if (/תשלום|שולם|תקבול|הפקד/.test(t)) return 'payment'
  return 'unknown'
}

function toNumber(v: number | string | undefined): number {
  if (typeof v === 'number') return v
  if (!v) return 0
  const n = Number(String(v).replace(/[₪,\s]/g, ''))
  return isNaN(n) ? 0 : n
}

// Derive MM/YYYY from date field or row.monthYear.
// Also handles short-year format: "03/26" → "03/2026"
function monthYearOf(row: RawRow): string {
  const my = (row.monthYear ?? '').trim()
  // "MM/YY" short year → "MM/YYYY"
  const short = /^(\d{1,2})\/(\d{2})$/.exec(my)
  if (short) return `${short[1].padStart(2, '0')}/${2000 + Number(short[2])}`
  if (/^\d{1,2}\/\d{4}$/.test(my)) return my
  const m = /^(\d{4})-(\d{1,2})/.exec((row.date ?? '').trim())
  if (m) return `${m[2].padStart(2, '0')}/${m[1]}`
  return ''
}

// Convert MM/YYYY → first day of that month as YYYY-MM-DD
function firstOfMonth(monthYear: string): string {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(monthYear.trim())
  if (!m) return ''
  return `${m[2]}-${m[1].padStart(2, '0')}-01`
}

export async function POST(req: NextRequest) {
  try {
    const { rows, dryRun = false, parentMappings = {} }: { rows: RawRow[]; dryRun?: boolean; parentMappings?: Record<string, string> } = await req.json()
    if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows required' }, { status: 400 })

    // Load all parents once for name matching.
    const { data: parents, error: pErr } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name')
    if (pErr) throw pErr
    const parentList = (parents ?? []) as { id: string; name: string | null; first_name: string | null; last_name: string | null }[]

    const matchParent = (rawName: string): { id: string; name: string } | null => {
      if (!rawName?.trim()) return null
      // Check manual mapping first
      if (parentMappings[rawName]) {
        const mapped = parentList.find(p => p.name === parentMappings[rawName])
        if (mapped) return { id: mapped.id, name: mapped.name ?? '' }
      }
      // Fall back to similarity matching
      let best: { id: string; name: string } | null = null
      let bestScore = 0
      for (const p of parentList) {
        const candidates = [p.name, `${p.last_name ?? ''} ${p.first_name ?? ''}`, `${p.first_name ?? ''} ${p.last_name ?? ''}`]
        let score = 0
        for (const c of candidates) score = Math.max(score, nameSimilarity(rawName, c ?? ''))
        if (score > bestScore) { bestScore = score; best = { id: p.id, name: p.name ?? '' } }
      }
      return bestScore >= MATCH_THRESHOLD ? best : null
    }

    // ── DRY RUN: preview matching & classification, write nothing ──
    if (dryRun) {
      let charges = 0, payments = 0, matched = 0
      const unmatched: string[] = []
      const preview: object[] = []
      for (const row of rows) {
        const kind = classify(row.type)
        if (kind === 'charge') charges++
        else if (kind === 'payment') payments++
        const parent = matchParent(row.parentName)
        if (parent) matched++
        else if (row.parentName?.trim()) unmatched.push(row.parentName.trim())
        preview.push({
          parentName: row.parentName,
          matchedParent: parent?.name ?? null,
          kind,
          amount: toNumber(row.amount),
          monthYear: monthYearOf(row),
        })
      }
      return NextResponse.json({
        dryRun: true,
        total: rows.length,
        charges,
        payments,
        unknown: rows.length - charges - payments,
        matched,
        unmatched: [...new Set(unmatched)],
        preview: preview.slice(0, 50),
      })
    }

    // ── REAL IMPORT: requires the is_legacy column on both tables ──
    for (const table of ['planned_payments', 'transactions']) {
      const probe = await supabaseAdmin.from(table).select('is_legacy').limit(1)
      if (probe.error && probe.error.code === UNDEFINED_COLUMN) {
        return NextResponse.json({
          error: 'חסרה עמודת is_legacy. הרץ פעם אחת ב-Supabase SQL: ' +
            'ALTER TABLE planned_payments ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false; ' +
            'ALTER TABLE transactions ADD COLUMN IF NOT EXISTS is_legacy BOOLEAN DEFAULT false;',
        }, { status: 400 })
      }
    }

    let createdPPs = 0, createdPayments = 0, skipped = 0
    const errors: string[] = []

    // Obligations first so payments can attach to the PP they pay.
    const ordered = [...rows].sort((a, b) => {
      const order = (r: RawRow) => (classify(r.type) === 'charge' ? 0 : 1)
      return order(a) - order(b)
    })

    for (const row of ordered) {
      try {
        const kind = classify(row.type)
        const amount = toNumber(row.amount)
        if (!amount || kind === 'unknown') { skipped++; continue }
        const parent = matchParent(row.parentName)
        if (!parent) { skipped++; errors.push(`לא זוהה הורה: "${row.parentName}"`); continue }
        const monthYear = monthYearOf(row)

        if (kind === 'charge') {
          const id = crypto.randomUUID()
          // Derive date: explicit date > first day of monthYear > null
          const derivedDate = row.date || (monthYear ? firstOfMonth(monthYear) : null)
          const { error } = await supabaseAdmin.from('planned_payments').insert({
            id,
            parent_ids: [parent.id],
            name: row.notes?.trim() || (monthYear ? `שכ"ל ${monthYear}` : 'שכ"ל — חוב ישן'),
            amount: Math.abs(amount),
            balance: Math.abs(amount),
            date: derivedDate || null,
            month_year: monthYear,
            pp_type: 'tuition',
            is_legacy: true,
            synced_at: FAR_FUTURE,
          })
          if (error) throw error
          createdPPs++
        } else {
          // payment → find the legacy tuition PP it pays (same month, else oldest open)
          const { data: pps } = await supabaseAdmin
            .from('planned_payments')
            .select('id, balance, month_year')
            .contains('parent_ids', [parent.id])
            .eq('pp_type', 'tuition')
            .eq('is_legacy', true)
            .order('month_year', { ascending: true })
          const open = (pps ?? []).filter(p => Number(p.balance) > 0)
          const target = open.find(p => p.month_year === monthYear) ?? open[0] ?? null

          const derivedPaymentDate = row.date || (monthYear ? firstOfMonth(monthYear) : null)
          const { error } = await supabaseAdmin.from('transactions').insert({
            id: crypto.randomUUID(),
            parent_ids: [parent.id],
            amount: Math.abs(amount),
            type: row.paymentMethod?.trim() || 'תשלום',
            date: derivedPaymentDate || null,
            month_year: monthYear,
            notes: row.notes || '',
            project_names: ['בנין לדורות'],
            planned_payment_id: target?.id ?? null,
            is_legacy: true,
            synced_at: FAR_FUTURE,
          })
          if (error) throw error
          createdPayments++

          // Reduce the matched PP's balance by the payment.
          if (target) {
            const newBal = Math.max(0, Number(target.balance) - Math.abs(amount))
            await supabaseAdmin.from('planned_payments').update({ balance: newBal }).eq('id', target.id)
          }
        }
      } catch (e) {
        skipped++
        errors.push(String((e as { message?: string })?.message ?? e))
      }
    }

    return NextResponse.json({ createdPPs, createdPayments, skipped, errors })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
