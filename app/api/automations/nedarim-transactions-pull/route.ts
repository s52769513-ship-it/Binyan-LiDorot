import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { nameSimilarity } from '@/lib/nameUtils'

const MOSAD_ID = process.env.NEDARIM_MOSAD_ID ?? '7015093'
const API_PASS  = process.env.NEDARIM_API_PASSWORD ?? 'nu247'
const MATCH_THRESHOLD = 0.6
const FAR_FUTURE = '2099-12-31T23:59:59.999Z'

// Payment methods to exclude (any field value containing these)
const EXCLUDED_PAYMENT_METHODS = ['הו"ק', "הו'ק", 'אשראי']

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseNedarimDate(s: string): { date: string; monthYear: string } {
  const [datePart] = String(s || '').split(' ')
  const parts = datePart.split('/')
  if (parts.length === 3) {
    const [dd, mm, yyyy] = parts
    const y = yyyy.length === 2 ? `20${yyyy}` : yyyy
    return {
      date:      `${y}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`,
      monthYear: `${mm.padStart(2, '0')}/${y}`,
    }
  }
  const today = new Date().toISOString().split('T')[0]
  const [y, m] = today.split('-')
  return { date: today, monthYear: `${m}/${y}` }
}

// ── Nedarim API fetch ─────────────────────────────────────────────────────────

export interface NedarimTx {
  rowId:         string
  donorName:     string
  date:          string
  monthYear:     string
  amount:        number
  paymentMethod: string
  notes:         string
}

interface FetchResult {
  txs:        NedarimTx[]
  excluded:   number
  total:      number
  endpoint:   string
  error?:     string
}

function extractField(rec: Record<string, unknown>, ...keys: string[]): string {
  for (const k of keys) if (rec[k] != null && rec[k] !== '') return String(rec[k]).trim()
  return ''
}

function isExcluded(paymentMethod: string): boolean {
  return EXCLUDED_PAYMENT_METHODS.some(m => paymentMethod.includes(m))
}

async function fetchFromNedarim(dateFrom: string, dateTo: string): Promise<FetchResult> {
  const variants = [
    // GetHistory — general payment history
    `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetHistory&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(dateFrom)}&To=${encodeURIComponent(dateTo)}`,
    `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetHistory&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(dateFrom)}&To=${encodeURIComponent(dateTo)}`,
    `https://matara.pro/nedarimplus/Reports/Manage.aspx?Action=GetHistory&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(dateFrom)}&To=${encodeURIComponent(dateTo)}`,
    // GetDonations
    `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetDonations&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(dateFrom)}&To=${encodeURIComponent(dateTo)}`,
    `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetDonations&MosadNumber=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(dateFrom)}&To=${encodeURIComponent(dateTo)}`,
    // GetTransactions
    `https://matara.pro/nedarimplus/Reports/Manage3.aspx?Action=GetTransactions&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(dateFrom)}&To=${encodeURIComponent(dateTo)}`,
    `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetTransactions&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}&From=${encodeURIComponent(dateFrom)}&To=${encodeURIComponent(dateTo)}`,
  ]

  let lastError = 'כל נקודות הקצה של Nedarim נכשלו'

  for (const url of variants) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
      if (!res.ok) { lastError = `HTTP ${res.status} מ-${url}`; continue }
      const text = await res.text()
      if (!text?.trim()) { lastError = 'תגובה ריקה'; continue }
      let json: unknown
      try { json = JSON.parse(text) } catch { lastError = 'JSON לא תקין'; continue }
      if (!json || typeof json !== 'object') { lastError = 'פורמט לא מוכר'; continue }

      const obj = json as Record<string, unknown>
      const data = obj['data'] ?? obj['records'] ?? obj['Data'] ?? (Array.isArray(json) ? json : null)
      if (!Array.isArray(data)) { lastError = 'אין מערך data בתגובה'; continue }

      const records = data as Record<string, unknown>[]
      const txs: NedarimTx[] = []
      let excluded = 0

      for (const rec of records) {
        // Payment method: try known named fields first, then numbered fields
        const paymentMethod = extractField(rec,
          'AmalatTashlum', 'Emtzai', 'PaymentMethod', 'payment_method',
          'Sikum', 'Savra', '7', '9', '10'
        )

        if (isExcluded(paymentMethod)) { excluded++; continue }

        // If no named payment method field found, scan all string fields for exclusion keywords
        if (!paymentMethod) {
          const hasExcluded = Object.values(rec).some(v =>
            typeof v === 'string' && EXCLUDED_PAYMENT_METHODS.some(m => v.includes(m))
          )
          if (hasExcluded) { excluded++; continue }
        }

        const donorName = extractField(rec, 'Shem', 'Name', 'DonorName', 'shem', 'name', '3')
        const dateRaw   = extractField(rec, 'Taarich', 'Date', 'date', 'Tarih', '4')
        const amountRaw = rec['Sachar'] ?? rec['Amount'] ?? rec['amount'] ?? rec['5'] ?? 0
        const rowId     = extractField(rec, 'DT_RowId', 'Id', 'id', 'RowId', 'rowId')
        const notes     = extractField(rec, 'Remarks', 'Notes', 'notes', 'Hearot', '8')
        const amount    = Number(String(amountRaw).replace(/[,\s₪]/g, '')) || 0

        if (!amount) continue

        const { date, monthYear } = parseNedarimDate(dateRaw)
        txs.push({ rowId, donorName, date, monthYear, amount, paymentMethod, notes })
      }

      return { txs, excluded, total: records.length, endpoint: url }
    } catch (e) {
      lastError = String((e as { message?: string })?.message ?? e)
    }
  }

  return { txs: [], excluded: 0, total: 0, endpoint: '', error: lastError }
}

// ── Parent matching ───────────────────────────────────────────────────────────

function buildMatchFn(
  parentList: { id: string; name: string | null; first_name: string | null; last_name: string | null }[],
  parentMappings: Record<string, string>,
) {
  const cache = new Map<string, { id: string; name: string } | null>()

  return (rawName: string): { id: string; name: string } | null => {
    if (!rawName?.trim()) return null
    if (cache.has(rawName)) return cache.get(rawName)!

    // Manual mapping (rawName → parentId)
    if (parentMappings[rawName]) {
      const p = parentList.find(x => x.id === parentMappings[rawName])
      if (p) {
        const result = { id: p.id, name: p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() }
        cache.set(rawName, result)
        return result
      }
    }

    // Fuzzy name match
    let best: { id: string; name: string } | null = null
    let bestScore = 0
    for (const p of parentList) {
      const candidates = [
        p.name,
        `${p.last_name ?? ''} ${p.first_name ?? ''}`,
        `${p.first_name ?? ''} ${p.last_name ?? ''}`,
      ]
      for (const c of candidates) {
        const score = nameSimilarity(rawName, c ?? '')
        if (score > bestScore) { bestScore = score; best = { id: p.id, name: p.name ?? '' } }
      }
    }
    const result = bestScore >= MATCH_THRESHOLD ? best : null
    cache.set(rawName, result)
    return result
  }
}

// ── GET — last run info ────────────────────────────────────────────────────────

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('automation_logs')
      .select('run_at, summary, details')
      .eq('automation_id', 'nedarim-transactions-pull')
      .eq('dry_run', false)
      .eq('status', 'success')
      .order('run_at', { ascending: false })
      .limit(1)
    const last = data?.[0] ?? null
    return NextResponse.json({
      lastRun:     last?.run_at ?? null,
      lastSummary: last?.summary ?? null,
      lastFrom:    (last?.details as Record<string, unknown> | null)?.dateFrom ?? null,
      lastTo:      (last?.details as Record<string, unknown> | null)?.dateTo ?? null,
    })
  } catch {
    return NextResponse.json({ lastRun: null, lastSummary: null, lastFrom: null, lastTo: null })
  }
}

// ── POST — preview or import ───────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
      dateFrom,
      dateTo,
      dryRun = false,
      parentMappings = {},
    }: {
      dateFrom: string
      dateTo: string
      dryRun?: boolean
      parentMappings?: Record<string, string>
    } = await req.json()

    if (!dateFrom || !dateTo) return NextResponse.json({ error: 'חסרים dateFrom / dateTo' }, { status: 400 })

    // Load parents
    const { data: parents, error: pErr } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name')
      .limit(10000)
    if (pErr) throw pErr
    const parentList = (parents ?? []) as { id: string; name: string | null; first_name: string | null; last_name: string | null }[]

    const matchParent = buildMatchFn(parentList, parentMappings)

    // Fetch from Nedarim
    const { txs, excluded, total, endpoint, error: fetchError } = await fetchFromNedarim(dateFrom, dateTo)
    if (fetchError) return NextResponse.json({ error: fetchError }, { status: 502 })

    if (dryRun) {
      // ── DRY RUN ──
      const unmatched = new Set<string>()
      const previewRows = txs.map(tx => {
        const parent = matchParent(tx.donorName)
        if (!parent && tx.donorName) unmatched.add(tx.donorName)
        return {
          rowId:          tx.rowId,
          donorName:      tx.donorName,
          matchedParent:  parent?.name ?? null,
          matchedId:      parent?.id ?? null,
          date:           tx.date,
          monthYear:      tx.monthYear,
          amount:         tx.amount,
          paymentMethod:  tx.paymentMethod,
          notes:          tx.notes,
        }
      })

      const matchedCount  = previewRows.filter(r => r.matchedParent).length
      const totalAmount   = txs.reduce((s, t) => s + t.amount, 0)
      const actions = [
        `תיצור ${matchedCount} עסקאות בטבלת transactions`,
        `תקשר כל עסקה לתשלום מתוכנן (PP) פתוח של אותו הורה לפי חודש`,
        `תעדכן יתרת ה-PP בהתאם לסכום`,
        `תרשום לוג ב-automation_logs`,
      ]

      return NextResponse.json({
        dryRun:   true,
        total,
        excluded,
        txCount:  txs.length,
        matched:  matchedCount,
        unmatched: [...unmatched],
        preview:  previewRows,
        totalAmount,
        actions,
        endpoint,
      })
    }

    // ── REAL IMPORT ──
    const errors: string[] = []
    const txRecords: object[] = []
    const balanceUpdates = new Map<string, number>()

    // Load all open PPs indexed by parent
    const { data: openPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('id, parent_ids, balance, month_year')
      .eq('pp_type', 'tuition')
      .gt('balance', 0)

    const ppByParent = new Map<string, Array<{ id: string; balance: number; month_year: string }>>()
    for (const pp of openPPs ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        if (!ppByParent.has(pid)) ppByParent.set(pid, [])
        ppByParent.get(pid)!.push({ id: pp.id, balance: Number(pp.balance), month_year: pp.month_year ?? '' })
      }
    }

    let created = 0
    let skipped = 0
    let totalAmount = 0

    for (const tx of txs) {
      const parent = matchParent(tx.donorName)
      if (!parent) {
        skipped++
        if (tx.donorName) errors.push(`לא זוהה הורה: "${tx.donorName}"`)
        continue
      }

      const parentPPs = (ppByParent.get(parent.id) ?? []).filter(p => p.balance > 0)
      const target = parentPPs.find(p => p.month_year === tx.monthYear) ?? parentPPs[0] ?? null

      txRecords.push({
        id:                 crypto.randomUUID(),
        parent_ids:         [parent.id],
        amount:             tx.amount,
        type:               tx.paymentMethod || 'תשלום',
        date:               tx.date,
        month_year:         tx.monthYear,
        notes:              [tx.notes, tx.rowId ? `DT:${tx.rowId}` : null].filter(Boolean).join(' · '),
        project_names:      ['בנין לדורות'],
        planned_payment_id: target?.id ?? null,
        is_legacy:          false,
        synced_at:          FAR_FUTURE,
      })

      if (target) {
        const currentBal = balanceUpdates.has(target.id) ? balanceUpdates.get(target.id)! : target.balance
        const newBal = Math.max(0, currentBal - tx.amount)
        balanceUpdates.set(target.id, newBal)
        target.balance = newBal
      }

      created++
      totalAmount += tx.amount
    }

    // Insert transactions in chunks
    const CHUNK = 500
    for (let i = 0; i < txRecords.length; i += CHUNK) {
      const { error } = await supabaseAdmin.from('transactions').insert(txRecords.slice(i, i + CHUNK))
      if (error) throw error
    }

    // Update PP balances in batches
    const balEntries = [...balanceUpdates.entries()]
    for (let i = 0; i < balEntries.length; i += 50) {
      await Promise.all(balEntries.slice(i, i + 50).map(([id, balance]) =>
        supabaseAdmin.from('planned_payments').update({ balance }).eq('id', id)
      ))
    }

    // Log run
    try {
      await supabaseAdmin.from('automation_logs').insert({
        id:            crypto.randomUUID(),
        automation_id: 'nedarim-transactions-pull',
        run_at:        new Date().toISOString(),
        dry_run:       false,
        status:        'success',
        summary:       `נדרים תנועות: נוצרו ${created} עסקאות · ₪${totalAmount.toLocaleString('he-IL')} · דולגו ${skipped} (${dateFrom}–${dateTo})`,
        details:       { dateFrom, dateTo, created, skipped, totalAmount },
      })
    } catch { /* best-effort */ }

    return NextResponse.json({ created, skipped, excluded, errors, totalAmount })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
