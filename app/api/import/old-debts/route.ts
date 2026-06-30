import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { nameSimilarity } from '@/lib/nameUtils'

interface RawRow {
  parentName: string
  type: string
  amount: number | string
  date?: string
  monthYear?: string
  notes?: string
  paymentMethod?: string
}

const UNDEFINED_COLUMN = '42703'
const FAR_FUTURE = '2099-12-31T23:59:59.999Z'
const MATCH_THRESHOLD = 0.6

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

function monthYearOf(row: RawRow): string {
  const my = (row.monthYear ?? '').trim()
  const short = /^(\d{1,2})\/(\d{2})$/.exec(my)
  if (short) return `${short[1].padStart(2, '0')}/${2000 + Number(short[2])}`
  if (/^\d{1,2}\/\d{4}$/.test(my)) return my
  const m = /^(\d{4})-(\d{1,2})/.exec((row.date ?? '').trim())
  if (m) return `${m[2].padStart(2, '0')}/${m[1]}`
  return ''
}

function firstOfMonth(monthYear: string): string {
  const m = /^(\d{1,2})\/(\d{4})$/.exec(monthYear.trim())
  if (!m) return ''
  return `${m[2]}-${m[1].padStart(2, '0')}-01`
}

export async function POST(req: NextRequest) {
  try {
    const { rows, dryRun = false, parentMappings = {} }: { rows: RawRow[]; dryRun?: boolean; parentMappings?: Record<string, string> } = await req.json()
    if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows required' }, { status: 400 })

    const { data: parents, error: pErr } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name')
    if (pErr) throw pErr
    const parentList = (parents ?? []) as { id: string; name: string | null; first_name: string | null; last_name: string | null }[]

    // Cache results so each unique name is matched only once
    const matchCache = new Map<string, { id: string; name: string } | null>()
    const matchParent = (rawName: string): { id: string; name: string } | null => {
      if (!rawName?.trim()) return null
      if (matchCache.has(rawName)) return matchCache.get(rawName)!
      let result: { id: string; name: string } | null = null
      if (parentMappings[rawName]) {
        const mapped = parentList.find(p => p.name === parentMappings[rawName])
        if (mapped) result = { id: mapped.id, name: mapped.name ?? '' }
      }
      if (!result) {
        let best: { id: string; name: string } | null = null
        let bestScore = 0
        for (const p of parentList) {
          const candidates = [p.name, `${p.last_name ?? ''} ${p.first_name ?? ''}`, `${p.first_name ?? ''} ${p.last_name ?? ''}`]
          let score = 0
          for (const c of candidates) score = Math.max(score, nameSimilarity(rawName, c ?? ''))
          if (score > bestScore) { bestScore = score; best = { id: p.id, name: p.name ?? '' } }
        }
        result = bestScore >= MATCH_THRESHOLD ? best : null
      }
      matchCache.set(rawName, result)
      return result
    }

    // ── DRY RUN ──
    if (dryRun) {
      let charges = 0, payments = 0, matched = 0
      let matchedCharges = 0, matchedPayments = 0, chargeAmount = 0, paymentAmount = 0
      const unmatched: string[] = []
      const preview: object[] = []
      for (const row of rows) {
        const kind = classify(row.type)
        const amount = toNumber(row.amount)
        if (kind === 'charge') charges++
        else if (kind === 'payment') payments++
        const parent = matchParent(row.parentName)
        if (parent) {
          matched++
          if (kind === 'charge') { matchedCharges++; chargeAmount += Math.abs(amount) }
          else if (kind === 'payment') { matchedPayments++; paymentAmount += Math.abs(amount) }
        } else if (row.parentName?.trim()) unmatched.push(row.parentName.trim())
        preview.push({ parentName: row.parentName, matchedParent: parent?.name ?? null, kind, amount, monthYear: monthYearOf(row) })
      }
      return NextResponse.json({
        dryRun: true, total: rows.length, charges, payments,
        unknown: rows.length - charges - payments, matched,
        unmatched: [...new Set(unmatched)],
        preview: preview.slice(0, 50),
        summary: { matchedCharges, matchedPayments, chargeAmount, paymentAmount },
      })
    }

    // ── REAL IMPORT ──
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

    const errors: string[] = []

    // ── Phase 1: Batch insert all charges ──
    const chargeRecords: object[] = []
    const skippedCharges = { count: 0 }
    for (const row of rows) {
      if (classify(row.type) !== 'charge') continue
      const amount = toNumber(row.amount)
      if (!amount) { skippedCharges.count++; continue }
      const parent = matchParent(row.parentName)
      if (!parent) { skippedCharges.count++; errors.push(`לא זוהה הורה: "${row.parentName}"`); continue }
      const monthYear = monthYearOf(row)
      chargeRecords.push({
        id: crypto.randomUUID(),
        parent_ids: [parent.id],
        name: row.notes?.trim() || (monthYear ? `שכ"ל ${monthYear}` : 'שכ"ל — חוב ישן'),
        amount: Math.abs(amount),
        balance: Math.abs(amount),
        date: row.date || (monthYear ? firstOfMonth(monthYear) : null) || null,
        month_year: monthYear,
        pp_type: 'tuition',
        is_legacy: true,
        synced_at: FAR_FUTURE,
      })
    }

    // Insert in chunks of 500 to avoid payload limits
    const CHUNK = 500
    for (let i = 0; i < chargeRecords.length; i += CHUNK) {
      const { error } = await supabaseAdmin.from('planned_payments').insert(chargeRecords.slice(i, i + CHUNK))
      if (error) throw error
    }
    const createdPPs = chargeRecords.length

    // ── Phase 2: Load all legacy PPs for payment matching (in memory) ──
    const { data: allLegacyPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('id, parent_ids, balance, month_year')
      .eq('pp_type', 'tuition')
      .eq('is_legacy', true)

    // Index PPs by parent id
    const ppByParent = new Map<string, Array<{ id: string; balance: number; month_year: string }>>()
    for (const pp of allLegacyPPs ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        if (!ppByParent.has(pid)) ppByParent.set(pid, [])
        ppByParent.get(pid)!.push({ id: pp.id, balance: Number(pp.balance), month_year: pp.month_year ?? '' })
      }
    }

    // ── Phase 3: Batch insert all payments ──
    const paymentRecords: object[] = []
    const balanceUpdates = new Map<string, number>() // ppId → new balance
    let skippedPayments = 0

    for (const row of rows) {
      if (classify(row.type) !== 'payment') continue
      const amount = toNumber(row.amount)
      if (!amount) { skippedPayments++; continue }
      const parent = matchParent(row.parentName)
      if (!parent) { skippedPayments++; errors.push(`לא זוהה הורה: "${row.parentName}"`); continue }
      const monthYear = monthYearOf(row)

      const parentPPs = (ppByParent.get(parent.id) ?? []).filter(p => p.balance > 0)
      const target = parentPPs.find(p => p.month_year === monthYear) ?? parentPPs[0] ?? null

      paymentRecords.push({
        id: crypto.randomUUID(),
        parent_ids: [parent.id],
        amount: Math.abs(amount),
        type: row.paymentMethod?.trim() || 'תשלום',
        date: row.date || (monthYear ? firstOfMonth(monthYear) : null) || null,
        month_year: monthYear,
        notes: row.notes || '',
        project_names: ['בנין לדורות'],
        planned_payment_id: target?.id ?? null,
        is_legacy: true,
        synced_at: FAR_FUTURE,
      })

      if (target) {
        const currentBal = balanceUpdates.has(target.id) ? balanceUpdates.get(target.id)! : target.balance
        const newBal = Math.max(0, currentBal - Math.abs(amount))
        balanceUpdates.set(target.id, newBal)
        target.balance = newBal // update in-memory so next payment to same PP sees updated balance
      }
    }

    for (let i = 0; i < paymentRecords.length; i += CHUNK) {
      const { error } = await supabaseAdmin.from('transactions').insert(paymentRecords.slice(i, i + CHUNK))
      if (error) throw error
    }
    const createdPayments = paymentRecords.length

    // ── Phase 4: Batch update PP balances in parallel ──
    await Promise.all([...balanceUpdates.entries()].map(([id, balance]) =>
      supabaseAdmin.from('planned_payments').update({ balance }).eq('id', id)
    ))

    const skipped = skippedCharges.count + skippedPayments
    return NextResponse.json({ createdPPs, createdPayments, skipped, errors })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
