import { NextRequest, NextResponse } from 'next/server'
import { fetchAirtableRecords, TABLES, P, T, PROJ } from '@/lib/airtable'
import { supabaseAdmin } from '@/lib/supabase'
import { normName } from '@/lib/nameUtils'

const AUTOMATION_ID = 'airtable-transactions-pull'
const EXCLUDED_PAYMENT_METHODS = ['הו"ק', "הו'ק", 'אשראי']
// Only transactions NOT categorized under this project are relevant here —
// "בנין לדורות" (the building fund) has its own dedicated flows.
const EXCLUDED_CATEGORY = 'בנין לדורות'

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
  // Projects live only in Airtable (no Supabase table) — need names up front
  // to filter by category before building candidates.
  const rawProjects = await fetchAirtableRecords(TABLES.PROJECTS, { fields: [PROJ.NAME] })
  const projectNameMap = new Map(rawProjects.map(r => [r.id, String(r.fields[PROJ.NAME] || '')]))

  const rawTx = await fetchAirtableRecords(TABLES.TRANSACTIONS, {
    fields: [T.AMOUNT, T.TYPE, T.DATE, T.MONTH_YEAR, T.NOTES, T.PARENT, T.PROJECT, T.BANK_CLASSIFICATION, T.PAYMENT_METHOD],
  })

  const total = rawTx.length
  let excludedPaymentMethod = 0
  let excludedCategory = 0

  const filtered = rawTx.filter(r => {
    const method = selectName(r.fields[T.PAYMENT_METHOD])
    if (EXCLUDED_PAYMENT_METHODS.some(m => method.includes(m))) { excludedPaymentMethod++; return false }

    const projectIds = (r.fields[T.PROJECT] as string[]) || []
    const projectNames = projectIds.map(pid => projectNameMap.get(pid)).filter(Boolean) as string[]
    if (projectNames.some(n => normName(n) === normName(EXCLUDED_CATEGORY))) { excludedCategory++; return false }

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

  return { candidates, total, excludedPaymentMethod, excludedCategory }
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
    }: { dryRun?: boolean; parentMappings?: Record<string, string> } = await req.json()

    const { candidates, total, excludedPaymentMethod, excludedCategory } = await loadCandidates()
    const toProcess = candidates.filter(c => c.status !== 'already-linked')

    // Load Supabase parents for direct-ID matching + name resolution
    const { data: parents, error: pErr } = await supabaseAdmin
      .from('parents')
      .select('id, name, first_name, last_name')
      .limit(10000)
    if (pErr) throw pErr
    const parentIdSet = new Set((parents ?? []).map(p => p.id))
    const parentNameMap = new Map((parents ?? []).map(p => [p.id, p.name ?? `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim()]))

    // Resolve parent for each candidate
    const unmatchedAirtableIds = new Set<string>()
    const resolveParent = (c: Candidate): { id: string; name: string } | null => {
      if (!c.airtableParentId) return null
      if (parentMappings[c.airtableParentId]) {
        const mappedId = parentMappings[c.airtableParentId]
        const name = parentNameMap.get(mappedId)
        if (name != null) return { id: mappedId, name }
      }
      if (parentIdSet.has(c.airtableParentId)) {
        return { id: c.airtableParentId, name: parentNameMap.get(c.airtableParentId) ?? '' }
      }
      unmatchedAirtableIds.add(c.airtableParentId)
      return null
    }

    const resolved = toProcess.map(c => ({ c, parent: resolveParent(c) }))

    // Resolve display names for unmatched Airtable parent IDs (fetch from Airtable Parents table)
    let unmatchedNames = new Map<string, string>()
    if (unmatchedAirtableIds.size > 0) {
      const rawParents = await fetchAirtableRecords(TABLES.PARENTS, { fields: [P.NAME] })
      unmatchedNames = new Map(
        rawParents.filter(r => unmatchedAirtableIds.has(r.id)).map(r => [r.id, String(r.fields[P.NAME] || r.id)])
      )
    }

    if (dryRun) {
      const preview = resolved.map(({ c, parent }) => ({
        airtableId:       c.airtableId,
        airtableParentId: c.airtableParentId,
        donorName:        parent?.name ?? (c.airtableParentId ? unmatchedNames.get(c.airtableParentId) ?? c.airtableParentId : '—'),
        matchedParent:    parent?.name ?? null,
        matchedId:        parent?.id ?? null,
        amount:           c.amount,
        date:             c.date,
        monthYear:        c.monthYear,
        paymentMethod:    c.paymentMethod,
        category:         c.projectNames.join(', '),
        notes:            c.notes,
        status:           c.status,
      }))

      const matched = preview.filter(p => p.matchedParent).length
      const alreadyLinked = candidates.length - toProcess.length
      const newCount = toProcess.filter(c => c.status === 'new').length
      const linkCount = toProcess.filter(c => c.status === 'link').length
      const totalAmount = toProcess.reduce((s, c) => s + c.amount, 0)

      const actions = [
        newCount > 0 ? `תיצור ${newCount} תנועות חדשות בטבלת transactions` : null,
        linkCount > 0 ? `תעדכן ${linkCount} תנועות קיימות שטרם קושרו לתשלום מתוכנן` : null,
        `תקשר כל תנועה לתשלום מתוכנן (PP) פתוח של אותו הורה לפי חודש`,
        `תעדכן יתרת ה-PP בהתאם לסכום`,
        `תרשום לוג ב-automation_logs`,
      ].filter(Boolean) as string[]

      return NextResponse.json({
        dryRun: true,
        total,
        excludedPaymentMethod,
        excludedCategory,
        excluded: excludedPaymentMethod + excludedCategory,
        alreadyLinked,
        toProcess: toProcess.length,
        matched,
        unmatched: [...new Set(preview.filter(p => !p.matchedParent).map(p => p.donorName))],
        preview,
        totalAmount,
        actions,
      })
    }

    // ── REAL IMPORT ──
    const errors: string[] = []
    let created = 0
    let linked = 0
    let skipped = 0
    let totalAmount = 0

    // Load open PPs indexed by parent
    const { data: openPPs } = await supabaseAdmin
      .from('planned_payments')
      .select('id, parent_ids, balance, month_year')
      .or('pp_type.eq.tuition,pp_type.is.null')
      .gt('balance', 0)
    const ppByParent = new Map<string, Array<{ id: string; balance: number; month_year: string }>>()
    for (const pp of openPPs ?? []) {
      for (const pid of (pp.parent_ids as string[]) ?? []) {
        if (!ppByParent.has(pid)) ppByParent.set(pid, [])
        ppByParent.get(pid)!.push({ id: pp.id, balance: Number(pp.balance), month_year: pp.month_year ?? '' })
      }
    }

    const balanceUpdates = new Map<string, number>()
    const newRows: object[] = []
    const linkUpdates: Array<{ id: string; planned_payment_id: string }> = []

    for (const { c, parent } of resolved) {
      if (!parent) {
        skipped++
        const label = c.airtableParentId ? unmatchedNames.get(c.airtableParentId) ?? c.airtableParentId : '(ללא הורה)'
        errors.push(`לא זוהה הורה: "${label}"`)
        continue
      }

      const parentPPs = (ppByParent.get(parent.id) ?? []).filter(p => p.balance > 0)
      const target = parentPPs.find(p => p.month_year === c.monthYear) ?? parentPPs[0] ?? null

      if (target) {
        const currentBal = balanceUpdates.has(target.id) ? balanceUpdates.get(target.id)! : target.balance
        const newBal = Math.max(0, currentBal - Math.abs(c.amount))
        balanceUpdates.set(target.id, newBal)
        target.balance = newBal
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
      } else if (c.status === 'link') {
        linkUpdates.push({ id: c.airtableId, planned_payment_id: target?.id ?? '' })
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

    try {
      await supabaseAdmin.from('automation_logs').insert({
        id:            crypto.randomUUID(),
        automation_id: AUTOMATION_ID,
        run_at:        new Date().toISOString(),
        dry_run:       false,
        status:        'success',
        summary:       `תנועות Airtable: נוצרו ${created} · קושרו ${linked} · דולגו ${skipped} · ₪${totalAmount.toLocaleString('he-IL')}`,
        details:       { created, linked, skipped, totalAmount },
      })
    } catch { /* best-effort */ }

    return NextResponse.json({
      created, linked, skipped, errors, totalAmount,
      excluded: excludedPaymentMethod + excludedCategory,
      excludedPaymentMethod, excludedCategory,
    })
  } catch (err) {
    return NextResponse.json({ error: String((err as { message?: string })?.message ?? err) }, { status: 500 })
  }
}
