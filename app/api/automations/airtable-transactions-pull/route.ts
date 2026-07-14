import { NextRequest, NextResponse } from 'next/server'
import { fetchAirtableRecords, TABLES, P, T, PROJ } from '@/lib/airtable'
import { supabaseAdmin } from '@/lib/supabase'
import { sortByMonth } from '@/lib/months'
import { normName } from '@/lib/nameUtils'
import { fetchAllRows } from '@/lib/fetchAllRows'
import { recalcParentTuitionBalance, ppTypeForProject } from '@/lib/ppPayments'

export const maxDuration = 300 // batch import + balance recalc can take a while

const AUTOMATION_ID = 'airtable-transactions-pull'
// הו"ק/אשראי rows are also pulled from Airtable now, but they're cross-checked
// against transactions already imported by nedarim-credit-hok-pull (which
// pulls the same standing-order history directly from Nedarim Plus) so the
// same real-world payment never becomes two transaction rows. See
// nedarimDupeKey() below for how a match is identified.
const NEDARIM_MANAGED_METHODS = ['הו"ק', "הו'ק", 'אשראי']
function isNedarimManagedMethod(method: string): boolean {
  return NEDARIM_MANAGED_METHODS.some(m => method.includes(m))
}
// Cutoff applied ONLY to "בנין לדורות" transactions (same 04/2026 cutover used
// across the app) — earlier בנין לדורות rows come from the old-debts import.
const CUTOFF_DATE = '2026-04-01'

// Airtable single-select comes back as {id, name, color} or a plain string
function selectName(v: unknown): string {
  if (v && typeof v === 'object' && 'name' in (v as object)) return String((v as { name: string }).name)
  return String(v || '')
}

interface Candidate {
  airtableId:       string
  airtableParentId: string | null
  amount:           number
  type:             string
  date:             string | null
  monthYear:        string
  notes:            string
  paymentMethod:    string
  projectIds:       string[]
  projectNames:     string[]
  bankClassification: string
  status:           'new' | 'link' | 'already-linked'
  existingPPId:     string | null // planned_payment_id already set on the existing row, if any
}

async function loadCandidates() {
  // Projects live only in Airtable (no Supabase table) — resolved up front so
  // the category can be checked in the filter and shown in the preview.
  // Filter rules: every category (including הו"ק/אשראי, deduped separately
  // against nedarim-credit-hok-pull's imports — see isNedarimManagedMethod)
  // is pulled with NO date limit, except "בנין לדורות" which is pulled only
  // from 04/2026 (inclusive) — earlier periods are handled by the old-debts import.
  const rawProjects = await fetchAirtableRecords(TABLES.PROJECTS, { fields: [PROJ.NAME] })
  const projectNameMap = new Map(rawProjects.map(r => [r.id, String(r.fields[PROJ.NAME] || '')]))

  const rawTx = await fetchAirtableRecords(TABLES.TRANSACTIONS, {
    fields: [T.AMOUNT, T.TYPE, T.DATE, T.MONTH_YEAR, T.NOTES, T.PARENT, T.PROJECT, T.BANK_CLASSIFICATION, T.PAYMENT_METHOD],
  })

  const total = rawTx.length
  let excludedOldBinyan = 0

  const filtered = rawTx.filter(r => {
    // The date cutoff applies ONLY to בנין לדורות — other categories have no date limit
    const projectIds = (r.fields[T.PROJECT] as string[]) || []
    const isBinyan = projectIds.some(pid =>
      normName(projectNameMap.get(pid) ?? '').includes('בנין לדורות'))
    if (isBinyan) {
      const date = String(r.fields[T.DATE] || '').slice(0, 10) // YYYY-MM-DD prefix
      if (!date || date < CUTOFF_DATE) { excludedOldBinyan++; return false }
    }

    return true
  })

  // Check which of these already exist in Supabase (regular /api/sync may have inserted them)
  const ids = filtered.map(r => r.id)
  const existingMap = new Map<string, { planned_payment_id: string | null }>()
  const CHUNK = 300
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data } = await supabaseAdmin
      .from('transactions')
      .select('id, planned_payment_id')
      .in('id', ids.slice(i, i + CHUNK))
    for (const row of data ?? []) existingMap.set(row.id as string, { planned_payment_id: row.planned_payment_id as string | null })
  }

  const candidates: Candidate[] = filtered.map(r => {
    const projectIds = (r.fields[T.PROJECT] as string[]) || []
    const typeName = selectName(r.fields[T.TYPE])
    const rawAmount = Number(r.fields[T.AMOUNT]) || 0
    const amount = typeName.includes('הוצאה') ? -Math.abs(rawAmount) : rawAmount
    const parentIds = (r.fields[T.PARENT] as string[]) || []
    const existing = existingMap.get(r.id)

    return {
      airtableId:       r.id,
      airtableParentId: parentIds[0] ?? null,
      amount,
      type:             typeName,
      date:             (r.fields[T.DATE] as string) || null,
      monthYear:        String(r.fields[T.MONTH_YEAR] || ''),
      notes:            String(r.fields[T.NOTES] || ''),
      paymentMethod:    selectName(r.fields[T.PAYMENT_METHOD]),
      projectIds,
      projectNames:     projectIds.map(pid => projectNameMap.get(pid)).filter(Boolean) as string[],
      bankClassification: selectName(r.fields[T.BANK_CLASSIFICATION]),
      status:           !existing ? 'new' : existing.planned_payment_id ? 'already-linked' : 'link',
      existingPPId:     existing?.planned_payment_id ?? null,
    }
  })

  return { candidates, total, excludedOldBinyan }
}

// Builds the matching key used to spot a candidate that's really the same
// real-world payment as a transaction nedarim-credit-hok-pull already
// created directly from Nedarim Plus (that automation sets standing_order_id,
// which Airtable-sourced rows never have). Rounds the amount and truncates
// the date to the day, since that's all both sources reliably agree on.
function nedarimDupeKey(parentId: string, amount: number, date: string | null): string {
  const day = (date ?? '').slice(0, 10)
  return `${parentId}|${Math.round(Math.abs(amount) * 100)}|${day}`
}

// ── GET — last run info ──────────────────────────────────────────────────────

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('automation_logs')
      .select('run_at, summary')
      .eq('automation_id', AUTOMATION_ID)
      .eq('dry_run', false)
      .eq('status', 'success')
      .order('run_at', { ascending: false })
      .limit(1)
    const last = data?.[0] ?? null
    return NextResponse.json({ lastRun: last?.run_at ?? null, lastSummary: last?.summary ?? null })
  } catch {
    return NextResponse.json({ lastRun: null, lastSummary: null })
  }
}

// ── POST — preview or import ─────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const {
      dryRun = false,
      parentMappings = {},
      transactionMappings = {},
    }: {
      dryRun?: boolean
      // Airtable parent-record id → Supabase parent id (applies to every
      // transaction of that donor)
      parentMappings?: Record<string, string>
      // Airtable transaction id → Supabase parent id — for transactions that
      // have NO parent link in Airtable at all, which can only be linked
      // per-transaction
      transactionMappings?: Record<string, string>
    } = await req.json()

    const { candidates, total, excludedOldBinyan } = await loadCandidates()
    const toProcess = candidates.filter(c => c.status !== 'already-linked')

    // Load Supabase parents for direct-ID matching + id-number/name resolution.
    // Paged fetch (fetchAllRows) — a plain SELECT is capped by PostgREST at
    // ~1000 rows, which silently dropped parents sorting past the cap and made
    // the auto-match miss people who definitely exist (e.g. late-alphabet
    // names like שטיינמעטץ).
    const parents = await fetchAllRows<{
      id: string; name: string | null; first_name: string | null; last_name: string | null; id_number: string | null
    }>(supabaseAdmin, 'parents', 'id, name, first_name, last_name, id_number')
    const parentIdSet = new Set((parents ?? []).map(p => p.id))
    const parentNameMap = new Map((parents ?? []).map(p => [p.id, p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]))

    // ── Resolve parent for each candidate ──
    // Step 1 — direct id: per-transaction manual mapping first (the only way
    // to link a transaction that has no Airtable parent at all), then the
    // per-donor manual mapping, then a same-id match against the synced
    // Supabase parents.
    const resolveById = (c: Candidate): { id: string; name: string } | null => {
      const txMappedId = transactionMappings[c.airtableId]
      if (txMappedId && parentIdSet.has(txMappedId)) {
        return { id: txMappedId, name: parentNameMap.get(txMappedId) ?? '' }
      }
      if (!c.airtableParentId) return null
      if (parentMappings[c.airtableParentId]) {
        const mappedId = parentMappings[c.airtableParentId]
        const name = parentNameMap.get(mappedId)
        if (name != null) return { id: mappedId, name }
      }
      if (parentIdSet.has(c.airtableParentId)) {
        return { id: c.airtableParentId, name: parentNameMap.get(c.airtableParentId) ?? '' }
      }
      return null
    }

    // Airtable parent ids that didn't resolve by id — we need their Airtable
    // id-number + display name to attempt the fallback matches below, and to
    // show a name if they stay unmatched.
    const unresolvedAirtableIds = new Set<string>()
    const directResolved = toProcess.map(c => {
      const parent = resolveById(c)
      if (!parent && c.airtableParentId) unresolvedAirtableIds.add(c.airtableParentId)
      return { c, parent }
    })

    const airtableParentNames = new Map<string, string>()
    const airtableParentIdNumbers = new Map<string, string>()
    const airtableParentCities = new Map<string, string>()
    if (unresolvedAirtableIds.size > 0) {
      const rawParents = await fetchAirtableRecords(TABLES.PARENTS, { fields: [P.NAME, P.ID_NUMBER, P.CITY] })
      for (const r of rawParents) {
        if (!unresolvedAirtableIds.has(r.id)) continue
        airtableParentNames.set(r.id, String(r.fields[P.NAME] || ''))
        const city = String(r.fields[P.CITY] || '').trim()
        if (city) airtableParentCities.set(r.id, city)
        const idNum = String(r.fields[P.ID_NUMBER] || '').trim()
        if (idNum) airtableParentIdNumbers.set(r.id, idNum)
      }
    }

    // Step 2 — ת"ז match: the Airtable parent record linked on the transaction
    // can carry a different id than the synced Supabase parent (re-created /
    // re-keyed), so an exact-id match misses even when it's really the same
    // person. ID-number is a stronger signal than name (unique per person,
    // immune to spelling/nickname variants), so it's tried first — only
    // auto-accepted when it resolves to exactly ONE Supabase parent.
    const supByIdNumber = new Map<string, string[]>()
    for (const p of parents ?? []) {
      const idNum = String(p.id_number || '').trim()
      if (!idNum) continue
      if (!supByIdNumber.has(idNum)) supByIdNumber.set(idNum, [])
      supByIdNumber.get(idNum)!.push(p.id)
    }
    const resolveByIdNumber = (idNumber: string | undefined): { id: string; name: string } | null => {
      if (!idNumber) return null
      const ids = supByIdNumber.get(idNumber)
      if (ids && ids.length === 1) return { id: ids[0], name: parentNameMap.get(ids[0]) ?? '' }
      return null
    }

    // Step 3 — name match: same idea, for the (rarer) case ת"ז isn't set on
    // either side. Match on normalized name, only auto-accepting when it
    // resolves to exactly ONE Supabase parent (ambiguous names are left for
    // manual linking, to avoid guessing).
    const supByNormName = new Map<string, string[]>()
    for (const p of parents ?? []) {
      const key = normName(p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`)
      if (!key) continue
      if (!supByNormName.has(key)) supByNormName.set(key, [])
      supByNormName.get(key)!.push(p.id)
    }
    const resolveByName = (airtableName: string): { id: string; name: string } | null => {
      const key = normName(airtableName)
      if (!key) return null
      const ids = supByNormName.get(key)
      if (ids && ids.length === 1) return { id: ids[0], name: parentNameMap.get(ids[0]) ?? airtableName }
      return null
    }

    // Whatever's STILL unmatched after all passes — for display + dedup skip.
    const unmatchedAirtableIds = new Set<string>()
    const resolvedBase = directResolved.map(({ c, parent }) => {
      if (parent) return { c, parent }
      if (c.airtableParentId) {
        const byIdNumber = resolveByIdNumber(airtableParentIdNumbers.get(c.airtableParentId))
        if (byIdNumber) return { c, parent: byIdNumber }
        const byName = resolveByName(airtableParentNames.get(c.airtableParentId) ?? '')
        if (byName) return { c, parent: byName }
        unmatchedAirtableIds.add(c.airtableParentId)
      }
      return { c, parent: null as { id: string; name: string } | null }
    })

    // Cross-check הו"ק/אשראי candidates against transactions already imported
    // by nedarim-credit-hok-pull (identified by standing_order_id being set —
    // an Airtable-sourced row never has one) so the same real-world payment
    // doesn't become two rows. Only "new" candidates matter here: a row that
    // already exists under its Airtable id ('link'/'already-linked') is a
    // re-sync of a row this same importer created before, not a fresh dupe.
    const nedarimCandidateParentIds = [...new Set(
      resolvedBase
        .filter(({ c, parent }) => parent && c.status === 'new' && isNedarimManagedMethod(c.paymentMethod))
        .map(({ parent }) => parent!.id)
    )]
    const nedarimDupeKeys = new Set<string>()
    if (nedarimCandidateParentIds.length > 0) {
      const { data: nedarimRows } = await supabaseAdmin
        .from('transactions')
        .select('parent_ids, amount, date')
        .not('standing_order_id', 'is', null)
        .overlaps('parent_ids', nedarimCandidateParentIds)
      for (const row of nedarimRows ?? []) {
        for (const pid of (row.parent_ids as string[]) ?? []) {
          nedarimDupeKeys.add(nedarimDupeKey(pid, Number(row.amount) || 0, row.date as string | null))
        }
      }
    }
    const resolved = resolvedBase.map(({ c, parent }) => ({
      c, parent,
      isNedarimDuplicate: !!parent && c.status === 'new' && isNedarimManagedMethod(c.paymentMethod) &&
        nedarimDupeKeys.has(nedarimDupeKey(parent.id, c.amount, c.date)),
    }))
    const skippedNedarimDuplicate = resolved.filter(r => r.isNedarimDuplicate).length

    // Display names for the parents that remain unmatched (Airtable name we
    // already fetched above, falling back to the raw id).
    const unmatchedNames = new Map<string, string>()
    for (const id of unmatchedAirtableIds) {
      unmatchedNames.set(id, airtableParentNames.get(id) || id)
    }

    if (dryRun) {
      const preview = resolved.map(({ c, parent, isNedarimDuplicate }) => ({
        airtableId:       c.airtableId,
        airtableParentId: c.airtableParentId,
        donorName:        parent?.name ?? (c.airtableParentId ? unmatchedNames.get(c.airtableParentId) ?? c.airtableParentId : '—'),
        // Only meaningful (and only fetched) for the unmatched case — helps
        // tell apart several Supabase parents that share the same name.
        donorCity:        !parent && c.airtableParentId ? airtableParentCities.get(c.airtableParentId) ?? null : null,
        matchedParent:    parent?.name ?? null,
        matchedId:        parent?.id ?? null,
        amount:           c.amount,
        date:             c.date,
        monthYear:        c.monthYear,
        paymentMethod:    c.paymentMethod,
        category:         c.projectNames.join(', '),
        ppType:           ppTypeForProject(c.projectNames.join(' ')),
        notes:            c.notes,
        status:           isNedarimDuplicate ? 'nedarim-duplicate' : c.status,
      }))

      // Matched = rows that will actually be imported/linked — a resolved
      // parent alone isn't enough, nedarim-duplicates are skipped anyway.
      const matched = preview.filter(p => p.matchedParent && p.status !== 'nedarim-duplicate').length
      const alreadyLinked = candidates.length - toProcess.length

      // Already-linked rows, so the "כבר מקושרות" stat can show its actual
      // rows on click (they're excluded from processing but not from view).
      const previewLinked = candidates.filter(c => c.status === 'already-linked').map(c => ({
        airtableId:       c.airtableId,
        airtableParentId: c.airtableParentId,
        donorName:        (c.airtableParentId ? parentNameMap.get(c.airtableParentId) : null) ?? '—',
        donorCity:        null as string | null,
        matchedParent:    (c.airtableParentId ? parentNameMap.get(c.airtableParentId) : null) ?? null,
        matchedId:        c.airtableParentId && parentIdSet.has(c.airtableParentId) ? c.airtableParentId : null,
        amount:           c.amount,
        date:             c.date,
        monthYear:        c.monthYear,
        paymentMethod:    c.paymentMethod,
        category:         c.projectNames.join(', '),
        ppType:           ppTypeForProject(c.projectNames.join(' ')),
        notes:            c.notes,
        status:           'already-linked' as const,
      }))
      const newCount = resolved.filter(r => r.c.status === 'new' && !r.isNedarimDuplicate).length
      // Only rows whose category actually maps to a debt type (שכ"ל/מגבית)
      // will really be linked — others (משכורות, הוצאות וכו') stay unlinked.
      const linkCount = toProcess.filter(c => c.status === 'link' && ppTypeForProject(c.projectNames.join(' '))).length
      const noPPCount = toProcess.filter(c => !ppTypeForProject(c.projectNames.join(' '))).length
      const totalAmount = resolved.filter(r => !r.isNedarimDuplicate).reduce((s, r) => s + r.c.amount, 0)

      const actions = [
        newCount > 0 ? `תיצור ${newCount} תנועות חדשות בטבלת transactions` : null,
        linkCount > 0 ? `תעדכן ${linkCount} תנועות קיימות שטרם קושרו לתשלום מתוכנן` : null,
        `תנועות בקטגוריית "בנין לדורות" יקושרו ל-PP שכ"ל, ותנועות "מגבית" ל-PP מגבית — לפי חודש`,
        `תעדכן יתרת ה-PP בהתאם לסכום`,
        noPPCount > 0 ? `${noPPCount} תנועות בקטגוריות אחרות (משכורות / הוצאות וכו') יירשמו ללא קישור ל-PP` : null,
        skippedNedarimDuplicate > 0 ? `${skippedNedarimDuplicate} תנועות הו"ק/אשראי ידולגו — כבר יובאו דרך Nedarim Plus (nedarim-credit-hok-pull)` : null,
        `תרשום לוג ב-automation_logs`,
      ].filter(Boolean) as string[]

      return NextResponse.json({
        dryRun: true,
        total,
        excludedOldBinyan,
        excluded: excludedOldBinyan,
        skippedNedarimDuplicate,
        alreadyLinked,
        toProcess: toProcess.length,
        matched,
        noPPCount,
        unmatched: [...new Set(preview.filter(p => !p.matchedParent).map(p => p.donorName))],
        preview,
        previewLinked,
        totalAmount,
        actions,
      })
    }

    // ── REAL IMPORT ──
    const errors: string[] = []
    let created = 0
    let linked = 0
    let skipped = 0
    let skippedDuplicate = 0
    let totalAmount = 0

    // Load open PPs indexed by parent+debt-type.
    // Two separate debt pools: tuition payments only reduce tuition PPs,
    // מגבית payments only reduce donation PPs — never mixed. PP שמקורם
    // ב-Airtable (pp_type ריק) מנוהלים ע"י הסנכרון שדורס להם balance בכל
    // ריצה, ולכן עדכון יתרה שלהם היה מתבטל — לא נוגעים בהם.
    const { data: openPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('id, parent_ids, balance, month_year, pp_type')
      .in('pp_type', ['tuition', 'donation'])
      .gt('balance', 0)
    const ppByParent = new Map<string, Array<{ id: string; balance: number; month_year: string }>>()
    for (const pp of openPPs ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        const key = `${pid}|${pp.pp_type}`
        if (!ppByParent.has(key)) ppByParent.set(key, [])
        ppByParent.get(key)!.push({ id: pp.id, balance: Number(pp.balance), month_year: pp.month_year ?? '' })
      }
    }
    // Chronological order (not text order) — oldest debt gets paid first
    for (const [key, list] of ppByParent) ppByParent.set(key, sortByMonth(list, true))

    const balanceUpdates = new Map<string, number>()
    const creditUpdates = new Map<string, number>()  // parentId → extra credit
    const affectedParents = new Set<string>()
    const newRows: object[] = []
    const linkUpdates: Array<{ id: string; planned_payment_id: string }> = []
    const round2 = (n: number) => Math.round(n * 100) / 100

    for (const { c, parent, isNedarimDuplicate } of resolved) {
      if (!parent) {
        skipped++
        const label = c.airtableParentId ? unmatchedNames.get(c.airtableParentId) ?? c.airtableParentId : '(ללא הורה)'
        errors.push(`לא זוהה הורה: "${label}"`)
        continue
      }

      // Already imported by nedarim-credit-hok-pull directly from Nedarim
      // Plus — skip entirely (no row, no PP-balance change) to avoid
      // double-counting the same real-world payment.
      if (isNedarimDuplicate) { skippedDuplicate++; continue }

      // Same selection as the shared cascade: preferred month first, then oldest.
      // Debt type follows the transaction's project (דמי מגבית → donation PP).
      // Only income applies to PPs — expenses are recorded but not linked.
      const rowPPType = ppTypeForProject(c.projectNames.join(' '))
      const parentPPs = (ppByParent.get(`${parent.id}|${rowPPType}`) ?? []).filter(p => p.balance > 0)
      const monthMatch = parentPPs.find(p => p.month_year === c.monthYear)
      const ordered = monthMatch ? [monthMatch, ...parentPPs.filter(p => p !== monthMatch)] : parentPPs
      const target = c.amount > 0 ? (ordered[0] ?? null) : null

      if (target) {
        let remaining = c.amount
        for (const pp of ordered) {
          if (remaining <= 0) break
          const apply = Math.min(remaining, pp.balance)
          pp.balance = round2(pp.balance - apply)
          remaining = round2(remaining - apply)
          balanceUpdates.set(pp.id, pp.balance)
        }
        if (remaining > 0) {
          creditUpdates.set(parent.id, round2((creditUpdates.get(parent.id) ?? 0) + remaining))
        }
        affectedParents.add(parent.id)
      }

      if (c.status === 'new') {
        newRows.push({
          id:                   c.airtableId,
          parent_ids:           [parent.id],
          amount:               c.amount,
          type:                 c.type,
          date:                 c.date,
          month_year:           c.monthYear,
          notes:                c.notes,
          project_ids:          c.projectIds,
          project_names:        c.projectNames,
          bank_classification:  c.bankClassification,
          payment_method:       c.paymentMethod,
          planned_payment_id:   target?.id ?? null,
          synced_at:            new Date().toISOString(),
        })
        created++
      } else if (c.status === 'link' && target) {
        linkUpdates.push({ id: c.airtableId, planned_payment_id: target.id })
        linked++
      }
      totalAmount += c.amount
    }

    const CHUNK = 500
    for (let i = 0; i < newRows.length; i += CHUNK) {
      const { error } = await supabaseAdmin.from('transactions').insert(newRows.slice(i, i + CHUNK))
      if (error) throw error
    }
    for (const u of linkUpdates) {
      if (!u.planned_payment_id) continue
      await supabaseAdmin.from('transactions').update({ planned_payment_id: u.planned_payment_id }).eq('id', u.id)
    }

    const balEntries = [...balanceUpdates.entries()]
    for (let i = 0; i < balEntries.length; i += 50) {
      await Promise.all(balEntries.slice(i, i + 50).map(([id, balance]) =>
        supabaseAdmin.from('planned_payments').update({ balance }).eq('id', id)
      ))
    }

    // Overpayment leftovers → parents.credit_balance
    for (const [pid, extra] of creditUpdates) {
      const { data: par } = await supabaseAdmin
        .from('parents').select('credit_balance').eq('id', pid).single()
      await supabaseAdmin.from('parents')
        .update({ credit_balance: round2(Number(par?.credit_balance ?? 0) + extra) })
        .eq('id', pid)
    }

    // Refresh parents.tuition_balance from actual PP balances (batched)
    const affected = [...affectedParents]
    for (let i = 0; i < affected.length; i += 25) {
      await Promise.all(affected.slice(i, i + 25).map(pid => recalcParentTuitionBalance(pid)))
    }

    try {
      await supabaseAdmin.from('automation_logs').insert({
        id:            crypto.randomUUID(),
        automation_id: AUTOMATION_ID,
        run_at:        new Date().toISOString(),
        dry_run:       false,
        status:        'success',
        summary:       `תנועות Airtable: נוצרו ${created} · קושרו ${linked} · דולגו ${skipped} · כפילויות Nedarim ${skippedDuplicate} · ₪${totalAmount.toLocaleString('he-IL')}`,
        details:       { created, linked, skipped, skippedDuplicate, totalAmount },
      })
    } catch { /* best-effort */ }

    return NextResponse.json({
      created, linked, skipped, skippedDuplicate, errors, totalAmount,
      excluded: excludedOldBinyan,
      excludedOldBinyan,
    })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
