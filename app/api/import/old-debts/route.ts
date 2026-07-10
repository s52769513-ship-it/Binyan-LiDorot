import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { nameSimilarity } from '@/lib/nameUtils'
import { sortByMonth } from '@/lib/months'
import { insertSpilloverRows, recalcParentTuitionBalance, type SpilloverRowInput } from '@/lib/ppPayments'

export const maxDuration = 60 // extend Vercel function timeout to 60s

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

const round2 = (n: number) => Math.round(n * 100) / 100

// A charge/payment has no stable id in the source file, so we fingerprint it
// from its natural key. Re-uploading the same file then matches these against
// the already-imported legacy rows and skips them. Counts are kept as a multiset
// so genuinely repeated identical rows still import the right number of times.
function chargeName(notes: string | undefined, monthYear: string): string {
  return notes?.trim() || (monthYear ? `שכ"ל ${monthYear}` : 'שכ"ל — חוב ישן')
}
function chargeFingerprint(parentId: string, amount: number, monthYear: string, name: string): string {
  return `c|${parentId}|${round2(Math.abs(amount))}|${monthYear}|${name}`
}
function paymentType(pm: string | undefined): string {
  return pm?.trim() || 'תשלום'
}
function paymentFingerprint(parentId: string, amount: number, type: string, monthYear: string, notes: string): string {
  return `p|${parentId}|${round2(Math.abs(amount))}|${type}|${monthYear}|${notes ?? ''}`
}

export async function POST(req: NextRequest) {
  try {
    const { rows, dryRun = false, parentMappings = {} }: { rows: RawRow[]; dryRun?: boolean; parentMappings?: Record<string, string> } = await req.json()
    if (!Array.isArray(rows)) return NextResponse.json({ error: 'rows required' }, { status: 400 })

    const { data: parents, error: pErr } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name')
      .limit(10000)
    if (pErr) throw pErr
    const parentList = (parents ?? []) as { id: string; name: string | null; first_name: string | null; last_name: string | null }[]

    // Cache results so each unique name is matched only once
    const matchCache = new Map<string, { id: string; name: string } | null>()
    const matchParent = (rawName: string): { id: string; name: string } | null => {
      if (!rawName?.trim()) return null
      if (matchCache.has(rawName)) return matchCache.get(rawName)!
      let result: { id: string; name: string } | null = null
      if (parentMappings[rawName]) {
        // parentMappings values are parent IDs (not names) — look up by ID
        const mapped = parentList.find(p => p.id === parentMappings[rawName])
        if (mapped) result = { id: mapped.id, name: mapped.name ?? `${mapped.first_name ?? ''} ${mapped.last_name ?? ''}`.trim() }
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

    // Fingerprint every legacy row already in the DB (charges → planned_payments,
    // payments → transactions) so a re-uploaded file can skip what's there.
    const existingChargeCounts = new Map<string, number>()
    const existingPaymentCounts = new Map<string, number>()
    try {
      const { data: ec } = await supabaseAdmin
        .from('planned_payments')
        .select('parent_ids, amount, month_year, name')
        .eq('pp_type', 'tuition').eq('is_legacy', true)
      for (const pp of ec ?? []) {
        const pid = ((pp.parent_ids as string[]) ?? [])[0]
        if (!pid) continue
        const fp = chargeFingerprint(pid, Number(pp.amount), pp.month_year ?? '', pp.name ?? '')
        existingChargeCounts.set(fp, (existingChargeCounts.get(fp) ?? 0) + 1)
      }
      const { data: ep } = await supabaseAdmin
        .from('transactions')
        .select('parent_ids, amount, type, month_year, notes')
        .eq('is_legacy', true)
      for (const tx of ep ?? []) {
        const pid = ((tx.parent_ids as string[]) ?? [])[0]
        if (!pid) continue
        const fp = paymentFingerprint(pid, Number(tx.amount), tx.type ?? 'תשלום', tx.month_year ?? '', tx.notes ?? '')
        existingPaymentCounts.set(fp, (existingPaymentCounts.get(fp) ?? 0) + 1)
      }
    } catch { /* is_legacy column may not exist yet — dedup simply finds nothing */ }

    // ── DRY RUN ──
    if (dryRun) {
      let charges = 0, payments = 0, matched = 0, duplicates = 0
      let matchedCharges = 0, matchedPayments = 0, chargeAmount = 0, paymentAmount = 0
      const unmatched: string[] = []
      const preview: object[] = []
      // Work on clones so counting doesn't consume the real maps
      const chargeSeen = new Map(existingChargeCounts)
      const paymentSeen = new Map(existingPaymentCounts)
      for (const row of rows) {
        const kind = classify(row.type)
        const amount = toNumber(row.amount)
        if (kind === 'charge') charges++
        else if (kind === 'payment') payments++
        const parent = matchParent(row.parentName)
        const monthYear = monthYearOf(row)
        let duplicate = false
        if (parent) {
          if (kind === 'charge') {
            const fp = chargeFingerprint(parent.id, amount, monthYear, chargeName(row.notes, monthYear))
            const c = chargeSeen.get(fp) ?? 0
            if (c > 0) { duplicate = true; chargeSeen.set(fp, c - 1) }
          } else if (kind === 'payment') {
            const fp = paymentFingerprint(parent.id, amount, paymentType(row.paymentMethod), monthYear, row.notes || '')
            const c = paymentSeen.get(fp) ?? 0
            if (c > 0) { duplicate = true; paymentSeen.set(fp, c - 1) }
          }
        }
        if (duplicate) duplicates++
        if (parent) {
          matched++
          if (kind === 'charge') { matchedCharges++; chargeAmount += Math.abs(amount) }
          else if (kind === 'payment') { matchedPayments++; paymentAmount += Math.abs(amount) }
        } else if (row.parentName?.trim()) unmatched.push(row.parentName.trim())
        preview.push({ parentName: row.parentName, matchedParent: parent?.name ?? null, kind, amount, monthYear, duplicate })
      }
      return NextResponse.json({
        dryRun: true, total: rows.length, charges, payments,
        unknown: rows.length - charges - payments, matched, duplicates,
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
    const skippedRows: object[] = [] // rows that were skipped with reason
    const affectedParents = new Set<string>() // parents whose PPs/credit changed → recalc balances

    // ── Phase 1: Batch insert all charges ──
    const chargeRecords: object[] = []
    const skippedCharges = { count: 0 }
    let duplicateCharges = 0
    for (const row of rows) {
      if (classify(row.type) !== 'charge') continue
      const amount = toNumber(row.amount)
      if (!amount) {
        skippedCharges.count++
        skippedRows.push({ ...row, סיבה: 'סכום ריק / אפס' })
        continue
      }
      const parent = matchParent(row.parentName)
      if (!parent) {
        skippedCharges.count++
        errors.push(`לא זוהה הורה: "${row.parentName}"`)
        skippedRows.push({ ...row, סיבה: `הורה לא זוהה: "${row.parentName}"` })
        continue
      }
      const monthYear = monthYearOf(row)
      const name = chargeName(row.notes, monthYear)
      const fp = chargeFingerprint(parent.id, amount, monthYear, name)
      const seen = existingChargeCounts.get(fp) ?? 0
      if (seen > 0) {
        existingChargeCounts.set(fp, seen - 1)
        duplicateCharges++
        skippedRows.push({ ...row, סיבה: 'כפילות — חוב זהה כבר קיים' })
        continue
      }
      affectedParents.add(parent.id)
      chargeRecords.push({
        id: crypto.randomUUID(),
        parent_ids: [parent.id],
        name,
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

    // Index PPs by parent id, oldest month first (chronological, not text order)
    const ppByParent = new Map<string, Array<{ id: string; balance: number; month_year: string }>>()
    for (const pp of allLegacyPPs ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        if (!ppByParent.has(pid)) ppByParent.set(pid, [])
        ppByParent.get(pid)!.push({ id: pp.id, balance: Number(pp.balance), month_year: pp.month_year ?? '' })
      }
    }
    for (const [pid, list] of ppByParent) ppByParent.set(pid, sortByMonth(list, true))

    // ── Phase 3: Batch insert all payments ──
    const paymentRecords: object[] = []
    const balanceUpdates = new Map<string, number>() // ppId → new balance
    const creditUpdates = new Map<string, number>()  // parentId → surplus → credit_balance
    const spilloverRows: SpilloverRowInput[] = []    // visible rows on PPs that received overflow
    let skippedPayments = 0
    let duplicatePayments = 0

    for (const row of rows) {
      if (classify(row.type) !== 'payment') continue
      const amount = toNumber(row.amount)
      if (!amount) {
        skippedPayments++
        skippedRows.push({ ...row, סיבה: 'סכום ריק / אפס' })
        continue
      }
      const parent = matchParent(row.parentName)
      if (!parent) {
        skippedPayments++
        errors.push(`לא זוהה הורה: "${row.parentName}"`)
        skippedRows.push({ ...row, סיבה: `הורה לא זוהה: "${row.parentName}"` })
        continue
      }
      const monthYear = monthYearOf(row)

      const payFp = paymentFingerprint(parent.id, amount, paymentType(row.paymentMethod), monthYear, row.notes || '')
      const seenPay = existingPaymentCounts.get(payFp) ?? 0
      if (seenPay > 0) {
        existingPaymentCounts.set(payFp, seenPay - 1)
        duplicatePayments++
        skippedRows.push({ ...row, סיבה: 'כפילות — תשלום זהה כבר קיים' })
        continue
      }

      // Same cascade as the rest of the system (ppPayments): month-matched PP
      // first, then oldest open; overflow rolls to the next debts (recorded as
      // visible spillover rows) and any leftover becomes parent credit —
      // never silently swallowed.
      const parentPPs = (ppByParent.get(parent.id) ?? []).filter(p => p.balance > 0)
      const monthMatch = parentPPs.find(p => p.month_year === monthYear)
      const ordered = monthMatch ? [monthMatch, ...parentPPs.filter(p => p !== monthMatch)] : parentPPs
      const target = ordered[0] ?? null

      const txId = crypto.randomUUID()
      const txDate = row.date || (monthYear ? firstOfMonth(monthYear) : null) || null
      paymentRecords.push({
        id: txId,
        parent_ids: [parent.id],
        amount: Math.abs(amount),
        type: paymentType(row.paymentMethod),
        date: txDate,
        month_year: monthYear,
        notes: row.notes || '',
        project_names: ['בנין לדורות'],
        planned_payment_id: target?.id ?? null,
        is_legacy: true,
        synced_at: FAR_FUTURE,
      })

      let remaining = Math.abs(amount)
      for (const pp of ordered) {
        if (remaining <= 0) break
        const apply = Math.min(remaining, pp.balance)
        pp.balance = round2(pp.balance - apply) // in-memory so the next payment sees updated balances
        remaining = round2(remaining - apply)
        balanceUpdates.set(pp.id, pp.balance)
        if (apply > 0 && pp !== target) {
          spilloverRows.push({
            parentId: parent.id,
            ppId: pp.id,
            ppMonthYear: pp.month_year,
            ppType: 'tuition',
            amount: apply,
            sourceTxId: txId,
            sourceLabel: monthYear || txDate || null,
            date: txDate,
          })
        }
      }
      if (remaining > 0) {
        creditUpdates.set(parent.id, round2((creditUpdates.get(parent.id) ?? 0) + remaining))
      }
      affectedParents.add(parent.id)
    }

    for (let i = 0; i < paymentRecords.length; i += CHUNK) {
      const { error } = await supabaseAdmin.from('transactions').insert(paymentRecords.slice(i, i + CHUNK))
      if (error) throw error
    }
    await insertSpilloverRows(spilloverRows)
    const createdPayments = paymentRecords.length

    // ── Phase 4: Batch update PP balances in groups of 50 ──
    const balanceEntries = [...balanceUpdates.entries()]
    for (let i = 0; i < balanceEntries.length; i += 50) {
      await Promise.all(balanceEntries.slice(i, i + 50).map(([id, balance]) =>
        supabaseAdmin.from('planned_payments').update({ balance }).eq('id', id)
      ))
    }

    // ── Phase 5: Payment surplus → parents.credit_balance ──
    for (const [pid, extra] of creditUpdates) {
      const { data: par } = await supabaseAdmin
        .from('parents').select('credit_balance').eq('id', pid).single()
      await supabaseAdmin.from('parents')
        .update({ credit_balance: round2(Number(par?.credit_balance ?? 0) + extra) })
        .eq('id', pid)
    }

    // ── Phase 6: Refresh parents.tuition_balance from actual PP balances ──
    const affected = [...affectedParents]
    for (let i = 0; i < affected.length; i += 25) {
      await Promise.all(affected.slice(i, i + 25).map(pid => recalcParentTuitionBalance(pid)))
    }

    const creditTotal = round2([...creditUpdates.values()].reduce((s, v) => s + v, 0))
    const skipped = skippedCharges.count + skippedPayments
    const duplicates = duplicateCharges + duplicatePayments
    return NextResponse.json({ createdPPs, createdPayments, skipped, duplicates, creditTotal, errors, skippedRows })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
