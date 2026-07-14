'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import { ParentSelectorModal, StatChip as Stat, type ParentOption } from '@/components/ParentSelectorModal'

// Loaded lazily and rendered as a fixed overlay so opening a parent's card
// sits on top of the import view without unmounting it (the preview, mappings
// and scroll position all stay put behind it).
const EmployeeCard = dynamic(() => import('@/components/EmployeeCard'), { ssr: false })

// ── Types ─────────────────────────────────────────────────────────────────────

interface PreviewRow {
  airtableId:       string
  airtableParentId: string | null
  donorName:        string
  donorCity:        string | null
  matchedParent:    string | null
  matchedId:        string | null
  amount:           number
  date:             string | null
  monthYear:        string
  paymentMethod:    string
  category:         string
  ppType:           'tuition' | 'donation' | null
  notes:            string
  status:           'new' | 'link' | 'already-linked' | 'nedarim-duplicate'
}

const PP_TYPE_LABEL: Record<'tuition' | 'donation', string> = {
  tuition:  'שכ"ל',
  donation: 'מגבית',
}

interface DryRunResult {
  dryRun:      true
  total:       number
  excluded:    number
  excludedOldBinyan: number
  skippedNedarimDuplicate: number
  alreadyLinked: number
  toProcess:   number
  matched:     number
  noPPCount:   number
  unmatched:   string[]
  preview:     PreviewRow[]
  /** Already-linked rows — excluded from processing but viewable via the stat chip */
  previewLinked?: PreviewRow[]
  totalAmount: number
  actions:     string[]
}

interface ImportResult {
  created?:     number
  linked?:      number
  skipped?:     number
  skippedDuplicate?: number
  excluded?:    number
  excludedOldBinyan?: number
  totalAmount?: number
  errors?:      string[]
  error?:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PreviewRow['status'], string> = {
  new:  'תיווצר',
  link: 'תקושר',
  'already-linked': 'כבר מקושרת',
  'nedarim-duplicate': 'ידולג — כבר יובא מ-Nedarim',
}

// Read-only rows view for the clickable stat chips — same fields as the main
// preview table, just for inspection (no link buttons).
function RowsModal({ title, rows, note, onClose }: {
  title: string
  rows: PreviewRow[]
  note?: string
  onClose: () => void
}) {
  const MAX = 500
  const shown = rows.slice(0, MAX)
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" dir="rtl"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-xl shadow-lg max-w-5xl w-full max-h-[85vh] flex flex-col">
        <div className="p-4 border-b flex items-center justify-between">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
          <p className="text-sm font-semibold text-gray-700">{title} ({rows.length})</p>
        </div>
        {note && <p className="px-4 pt-3 text-xs text-gray-400">{note}</p>}
        <div className="flex-1 overflow-auto p-4">
          {rows.length === 0 ? (
            <p className="py-10 text-center text-sm text-gray-400">אין שורות</p>
          ) : (
            <table className="w-full text-xs min-w-[760px]">
              <thead>
                <tr className="text-right text-gray-400 border-b">
                  <th className="px-3 py-2">הורה / תורם</th>
                  <th className="px-3 py-2">תאריך</th>
                  <th className="px-3 py-2">חודש</th>
                  <th className="px-3 py-2 text-left">סכום</th>
                  <th className="px-3 py-2">אמצעי</th>
                  <th className="px-3 py-2">קטגוריה</th>
                  <th className="px-3 py-2">סטטוס</th>
                  <th className="px-3 py-2">הערות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {shown.map((r, i) => (
                  <tr key={`${r.airtableId}-${i}`} className={r.matchedParent ? '' : 'bg-red-50'}>
                    <td className="px-3 py-1.5">
                      {r.matchedParent
                        ? <span className="text-emerald-700 font-medium">{r.matchedParent}</span>
                        : <span className="text-red-600">{r.donorName}{r.donorCity && <span className="text-red-400"> · {r.donorCity}</span>}</span>}
                    </td>
                    <td className="px-3 py-1.5 tabular-nums text-gray-500">{r.date}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.monthYear}</td>
                    <td className="px-3 py-1.5 text-left tabular-nums font-medium">₪{r.amount.toLocaleString('he-IL')}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.paymentMethod || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.category || '—'}</td>
                    <td className="px-3 py-1.5 text-gray-500">{STATUS_LABEL[r.status]}</td>
                    <td className="px-3 py-1.5 text-gray-400 truncate max-w-[12rem]" title={r.notes}>{r.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {rows.length > MAX && (
            <p className="pt-3 text-center text-xs text-gray-400">מוצגות {MAX} מתוך {rows.length} שורות</p>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Main tab ──────────────────────────────────────────────────────────────────

export default function AirtableTransactionsPullTab() {
  const [busy, setBusy]                 = useState(false)
  const [preview, setPreview]           = useState<DryRunResult | null>(null)
  const [result, setResult]             = useState<ImportResult | null>(null)
  const [nameFilter, setNameFilter]     = useState('')
  const [allParents, setAllParents]     = useState<ParentOption[]>([])
  // kind 'parent' links every transaction of that Airtable donor; kind 'tx'
  // links one specific transaction (used when Airtable has no parent at all)
  const [selectorOpen, setSelectorOpen] = useState<{ kind: 'parent' | 'tx'; key: string; label: string } | null>(null)
  const [openParentId, setOpenParentId] = useState<string | null>(null)
  const [rowsModal, setRowsModal]       = useState<{ title: string; rows: PreviewRow[]; note?: string } | null>(null)
  const [lastRun, setLastRun]           = useState<{ lastRun: string | null; lastSummary: string | null }>({ lastRun: null, lastSummary: null })

  // Manual mappings: airtableParentId → { id, name } (Supabase parent)
  const [manualMappings, setManualMappings] = useState<Record<string, { id: string; name: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('airtableTxManualMappings') ?? 'null') ?? {} } catch { return {} }
  })
  // Per-transaction mappings: airtable transaction id → { id, name } — the
  // only way to link a transaction whose Airtable record has no parent link
  const [manualTxMappings, setManualTxMappings] = useState<Record<string, { id: string; name: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('airtableTxManualTxMappings') ?? 'null') ?? {} } catch { return {} }
  })

  useEffect(() => {
    try { localStorage.setItem('airtableTxManualMappings', JSON.stringify(manualMappings)) } catch {}
  }, [manualMappings])
  useEffect(() => {
    try { localStorage.setItem('airtableTxManualTxMappings', JSON.stringify(manualTxMappings)) } catch {}
  }, [manualTxMappings])

  useEffect(() => {
    fetch('/api/parents-simple')
      .then(r => r.json())
      .then(d => setAllParents(Array.isArray(d) ? d : []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/automations/airtable-transactions-pull')
      .then(r => r.json())
      .then(d => setLastRun(d ?? {}))
      .catch(() => {})
  }, [])

  const buildParentMappings = () =>
    Object.fromEntries(Object.entries(manualMappings).map(([k, v]) => [k, v.id]))
  const buildTransactionMappings = () =>
    Object.fromEntries(Object.entries(manualTxMappings).map(([k, v]) => [k, v.id]))

  const runPreview = async () => {
    setBusy(true); setPreview(null); setResult(null)
    try {
      const res = await fetch('/api/automations/airtable-transactions-pull', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dryRun: true, parentMappings: buildParentMappings(), transactionMappings: buildTransactionMappings() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setResult({ error: data?.error ?? `שגיאה ${res.status}` }); return }
      setPreview(data)
    } catch (e) { setResult({ error: String(e) }) }
    finally { setBusy(false) }
  }

  // The server's `matched` reflects only what it knew at preview time —
  // manual links made since then (per-donor or per-transaction) count too,
  // so the import button and confirm show the real number without needing a
  // full re-preview after every link.
  const manualLinkOf = (r: PreviewRow) =>
    manualTxMappings[r.airtableId] ?? (r.airtableParentId ? manualMappings[r.airtableParentId] : undefined)
  const manuallyLinkedCount = preview
    ? preview.preview.filter(r => !r.matchedParent && r.status !== 'nedarim-duplicate' && manualLinkOf(r)).length
    : 0
  const effectiveMatched = (preview?.matched ?? 0) + manuallyLinkedCount

  const runImport = async () => {
    if (!preview) return
    if (!confirm(`מאשר יצירה/קישור של ${effectiveMatched} תנועות?`)) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/automations/airtable-transactions-pull', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dryRun: false, parentMappings: buildParentMappings(), transactionMappings: buildTransactionMappings() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setResult({ error: data?.error ?? `שגיאה ${res.status}` }); return }
      setResult(data); setPreview(null)
      fetch('/api/automations/airtable-transactions-pull').then(r => r.json()).then(d => setLastRun(d ?? {})).catch(() => {})
    } catch (e) { setResult({ error: String(e) }) }
    finally { setBusy(false) }
  }

  const filteredPreview = preview?.preview.filter(r => {
    if (!nameFilter) return true
    const manualName = manualLinkOf(r)?.name ?? ''
    const hay = `${r.donorName} ${r.matchedParent ?? ''} ${manualName}`.toLowerCase()
    return hay.includes(nameFilter.toLowerCase())
  }) ?? []

  const stillUnmatched = preview?.preview.filter(r => !r.matchedParent && !manualLinkOf(r)) ?? []
  // De-dupe by airtableParentId for the chip list. City is included so two
  // Supabase parents sharing a name (the ambiguous case the name-match pass
  // deliberately refuses to guess) can be told apart at a glance.
  const unmatchedByParentId = new Map<string, { name: string; city: string | null }>()
  for (const r of stillUnmatched) if (r.airtableParentId) unmatchedByParentId.set(r.airtableParentId, { name: r.donorName, city: r.donorCity })
  // Transactions with no Airtable parent at all — linkable only one-by-one
  const noParentRows = stillUnmatched.filter(r => !r.airtableParentId)

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── Header card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">משיכת תנועות כספיות מ-Airtable</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            מושך את כל התנועות מטבלת התנועות ב-Airtable, כולל הו&quot;ק ואשראי — אלה מוצלבות מול תנועות שכבר יובאו ישירות מ-Nedarim Plus (אוטומציית nedarim-credit-hok-pull) לפי הורה+סכום+תאריך, כדי שאותו תשלום לא יירשם פעמיים. תנועות בקטגוריית &quot;בנין לדורות&quot; נמשכות רק מ-04/2026 ואילך — מה שלפני מטופל בייבוא חובות ישנים. <b>רק</b> תנועות בקטגוריית &quot;בנין לדורות&quot; מקושרות ל-PP שכ&quot;ל, ורק תנועות &quot;מגבית&quot; מקושרות ל-PP מגבית — כל קטגוריה אחרת (משכורות, הוצאות וכו&apos;) נכנסת בלי קישור לשום תשלום מתוכנן.
          </p>
          {lastRun.lastRun && (
            <p className="text-xs text-gray-400 mt-1">
              ריצה אחרונה: {new Date(lastRun.lastRun).toLocaleString('he-IL')}
              {lastRun.lastSummary && <span className="mr-1 text-gray-500">— {lastRun.lastSummary}</span>}
            </p>
          )}
        </div>

        <button
          onClick={runPreview}
          disabled={busy}
          className="px-5 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {busy ? 'טוען…' : 'תצוגה מקדימה'}
        </button>
      </div>

      {/* ── Error ── */}
      {result?.error && (
        <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-4">
          <p className="text-sm text-red-700">{result.error}</p>
        </div>
      )}

      {/* ── Preview card ── */}
      {preview && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">תצוגה מקדימה</h3>

          {/* Stats — clicking a chip opens the actual rows behind the number */}
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
            <Stat label="סה״כ ב-Airtable" value={preview.total}
              onClick={() => setRowsModal({
                title: 'כל התנועות ב-Airtable',
                rows: [...preview.preview, ...(preview.previewLinked ?? [])],
                note: preview.excludedOldBinyan > 0 ? `לא כולל ${preview.excludedOldBinyan} תנועות "בנין לדורות" מלפני 04/2026 (מטופלות בייבוא חובות ישנים)` : undefined,
              })} />
            <Stat label="כפילות Nedarim (הו״ק/אשראי)" value={preview.skippedNedarimDuplicate} color="amber"
              onClick={() => setRowsModal({
                title: 'כפילויות Nedarim — ידולגו',
                rows: preview.preview.filter(r => r.status === 'nedarim-duplicate'),
                note: 'תנועות שכבר יובאו ישירות מ-Nedarim Plus (זוהו לפי הורה + סכום + תאריך) — לא ייובאו שוב',
              })} />
            <Stat label="סונן (בנין לדורות לפני 04/2026)" value={preview.excludedOldBinyan} color="amber" />
            <Stat label="כבר מקושרות" value={preview.alreadyLinked} color="gray"
              onClick={() => setRowsModal({
                title: 'תנועות שכבר קיימות ומקושרות במערכת',
                rows: preview.previewLinked ?? [],
              })} />
            <Stat label="לטיפול" value={preview.toProcess} color="blue"
              onClick={() => setRowsModal({ title: 'תנועות לטיפול', rows: preview.preview })} />
            <Stat label="ללא PP (לא שכ״ל/מגבית)" value={preview.noPPCount} color="gray"
              onClick={() => setRowsModal({
                title: 'תנועות שיירשמו בלי קישור לתשלום מתוכנן',
                rows: preview.preview.filter(r => !r.ppType),
                note: 'קטגוריות שאינן שכ"ל/מגבית (משכורות, הוצאות וכו\') — נכנסות כתנועות רגילות בלבד',
              })} />
            <Stat label="זוהו הורים" value={effectiveMatched} color="green"
              onClick={() => setRowsModal({
                title: 'תנועות עם הורה מזוהה',
                rows: preview.preview.filter(r => r.status !== 'nedarim-duplicate' && (r.matchedParent || manualLinkOf(r))),
              })} />
            <Stat label="לא זוהו" value={stillUnmatched.length} color={stillUnmatched.length > 0 ? 'red' : 'gray'}
              onClick={() => setRowsModal({
                title: 'תנועות ללא הורה מזוהה',
                rows: stillUnmatched,
                note: 'קשרו אותן דרך הצ\'יפים האדומים או ישירות מהטבלה למטה',
              })} />
          </div>

          <p className="text-sm text-gray-600">
            סה&quot;כ סכום לטיפול: <strong className="text-gray-900">₪{preview.totalAmount.toLocaleString('he-IL')}</strong>
          </p>

          {/* Actions that will run */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-1.5">
            <p className="text-xs font-semibold text-blue-800">פעולות שיתבצעו בלחיצה על &quot;ייבא&quot;:</p>
            <ul className="space-y-1">
              {preview.actions.map((a, i) => (
                <li key={i} className="text-xs text-blue-700 flex gap-1.5 items-start">
                  <span className="mt-0.5 text-blue-400">✓</span> {a}
                </li>
              ))}
            </ul>
          </div>

          {/* Unmatched parents */}
          {unmatchedByParentId.size > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-red-700">
                הורים שלא זוהו ({unmatchedByParentId.size}) — לחץ לקישור ידני:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {[...unmatchedByParentId.entries()].map(([airtableParentId, { name, city }]) => (
                  <button
                    key={airtableParentId}
                    onClick={() => setSelectorOpen({ kind: 'parent', key: airtableParentId, label: city ? `${name} (${city})` : name })}
                    className="px-2.5 py-1 bg-white border border-red-300 rounded-lg text-xs text-red-700 hover:bg-red-100 transition"
                  >
                    {name}
                    {city && <span className="text-red-400"> · {city}</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Transactions with no parent in Airtable at all — linkable one-by-one */}
          {noParentRows.length > 0 && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-orange-700">
                תנועות ללא הורה ב-Airtable ({noParentRows.length}) — לחץ לקישור ידני לכל תנועה:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {noParentRows.map(r => (
                  <button
                    key={r.airtableId}
                    onClick={() => setSelectorOpen({
                      kind: 'tx',
                      key: r.airtableId,
                      label: `₪${r.amount.toLocaleString('he-IL')} · ${r.date ?? r.monthYear}${r.notes ? ` · ${r.notes.slice(0, 30)}` : ''}`,
                    })}
                    className="px-2.5 py-1 bg-white border border-orange-300 rounded-lg text-xs text-orange-700 hover:bg-orange-100 transition"
                  >
                    ₪{r.amount.toLocaleString('he-IL')} · {r.date ?? r.monthYear}{r.notes ? ` · ${r.notes.slice(0, 25)}` : ''}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual mappings */}
          {(Object.keys(manualMappings).length > 0 || Object.keys(manualTxMappings).length > 0) && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-700">
                קישורים ידניים ({Object.keys(manualMappings).length + Object.keys(manualTxMappings).length}):
              </p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(manualMappings).map(([from, to]) => (
                  <span key={from} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs">
                    <span className="text-gray-400">→</span>
                    <span className="text-emerald-700 font-medium">{to.name}</span>
                    <button
                      onClick={() => setManualMappings(m => { const n = { ...m }; delete n[from]; return n })}
                      className="mr-1 text-gray-300 hover:text-red-500 font-bold leading-none text-sm"
                    >×</button>
                  </span>
                ))}
                {Object.entries(manualTxMappings).map(([txId, to]) => (
                  <span key={txId} className="flex items-center gap-1 px-2.5 py-1 bg-white border border-emerald-300 rounded-lg text-xs">
                    <span className="text-gray-400">תנועה →</span>
                    <span className="text-emerald-700 font-medium">{to.name}</span>
                    <button
                      onClick={() => setManualTxMappings(m => { const n = { ...m }; delete n[txId]; return n })}
                      className="mr-1 text-gray-300 hover:text-red-500 font-bold leading-none text-sm"
                    >×</button>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Name filter */}
          <div>
            <input
              type="text"
              placeholder="סנן לפי שם הורה…"
              value={nameFilter}
              onChange={e => setNameFilter(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
            />
          </div>

          {/* Transaction table */}
          <div className="overflow-x-auto max-h-80 overflow-y-auto border border-gray-100 rounded-xl">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 sticky top-0 text-gray-400 text-right">
                <tr>
                  <th className="px-3 py-2">הורה</th>
                  <th className="px-3 py-2">תאריך</th>
                  <th className="px-3 py-2">חודש</th>
                  <th className="px-3 py-2 text-left">סכום</th>
                  <th className="px-3 py-2">אמצעי</th>
                  <th className="px-3 py-2">קטגוריה</th>
                  <th className="px-3 py-2">חוב יעד</th>
                  <th className="px-3 py-2">סטטוס</th>
                  <th className="px-3 py-2">הערות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredPreview.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-4 text-center text-gray-400">אין תוצאות</td></tr>
                )}
                {filteredPreview.map((r, i) => {
                  const manual     = manualLinkOf(r)
                  const resolved   = r.matchedParent ?? manual?.name ?? null
                  const resolvedId = r.matchedId ?? manual?.id ?? null
                  return (
                    <tr key={i} className={resolved ? 'hover:bg-gray-50' : 'bg-red-50'}>
                      <td className="px-3 py-1.5">
                        {resolved
                          ? (
                            <button
                              onClick={() => resolvedId && setOpenParentId(resolvedId)}
                              disabled={!resolvedId}
                              title="פתח כרטיס הורה"
                              className="text-emerald-700 font-medium hover:underline disabled:no-underline disabled:cursor-default"
                            >
                              {resolved}
                            </button>
                          )
                          : (
                            // Donor with an Airtable parent → link once for all
                            // their rows; no parent in Airtable → link this
                            // specific transaction (keyed by its airtableId)
                            <button
                              onClick={() => setSelectorOpen(r.airtableParentId
                                ? {
                                    kind: 'parent',
                                    key: r.airtableParentId,
                                    label: r.donorCity ? `${r.donorName} (${r.donorCity})` : r.donorName,
                                  }
                                : {
                                    kind: 'tx',
                                    key: r.airtableId,
                                    label: `₪${r.amount.toLocaleString('he-IL')} · ${r.date ?? r.monthYear}${r.notes ? ` · ${r.notes.slice(0, 30)}` : ''}`,
                                  })}
                              className="text-red-500 hover:underline"
                            >
                              {r.airtableParentId
                                ? <>{r.donorName}{r.donorCity && <span className="text-red-400"> · {r.donorCity}</span>} — לחץ לקישור</>
                                : <>(ללא הורה ב-Airtable) — לחץ לקישור</>}
                            </button>
                          )
                        }
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-gray-500">{r.date}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.monthYear}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums font-medium">₪{r.amount.toLocaleString('he-IL')}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.paymentMethod || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.category || '—'}</td>
                      <td className="px-3 py-1.5">
                        {r.ppType ? (
                          <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${
                            r.ppType === 'donation' ? 'bg-emerald-50 text-emerald-700' : 'bg-blue-50 text-blue-700'
                          }`}>
                            {PP_TYPE_LABEL[r.ppType]}
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[11px] font-medium bg-gray-100 text-gray-500">
                            ללא קישור
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-1.5 text-gray-500">{STATUS_LABEL[r.status]}</td>
                      <td className="px-3 py-1.5 text-gray-400 truncate max-w-[10rem]" title={r.notes}>{r.notes || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">
            מוצגות {filteredPreview.length} מתוך {preview.toProcess} שורות לטיפול.
            {nameFilter && ' (לאחר סינון)'}
          </p>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2 border-t border-gray-100">
            <button
              onClick={runPreview}
              disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              {busy ? 'טוען…' : 'רענן תצוגה'}
            </button>
            <button
              onClick={runImport}
              disabled={busy || effectiveMatched === 0}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
            >
              {busy ? 'מייבא…' : `ייבא ${effectiveMatched} תנועות`}
            </button>
          </div>
        </div>
      )}

      {/* ── Import result ── */}
      {result && !result.error && (
        <div className="bg-white rounded-2xl border border-emerald-200 shadow-sm p-6 space-y-3">
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-800">
            ✓ נוצרו <strong>{result.created}</strong> תנועות חדשות · קושרו <strong>{result.linked}</strong> תנועות קיימות
            {result.totalAmount ? <span> · ₪{result.totalAmount.toLocaleString('he-IL')}</span> : null}
            {result.skipped ? <span className="text-emerald-600"> · {result.skipped} דולגו</span> : null}
            {result.skippedDuplicate ? <span className="text-amber-600"> · {result.skippedDuplicate} כפילויות Nedarim דולגו</span> : null}
          </div>
          {result.errors && result.errors.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 max-h-40 overflow-y-auto">
              <p className="font-semibold mb-1">הורים שלא זוהו ({result.errors.length}):</p>
              {result.errors.slice(0, 30).map((e, i) => <p key={i}>{e}</p>)}
            </div>
          )}
          <button
            onClick={runPreview}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50 transition-colors"
          >
            משוך שוב / תצוגה מקדימה
          </button>
        </div>
      )}

      {/* ── ParentSelector modal ── */}
      {selectorOpen && (
        <ParentSelectorModal
          label={selectorOpen.label}
          allParents={allParents}
          onSelect={(id, name) => {
            if (selectorOpen.kind === 'tx') {
              setManualTxMappings(m => ({ ...m, [selectorOpen.key]: { id, name } }))
            } else {
              setManualMappings(m => ({ ...m, [selectorOpen.key]: { id, name } }))
            }
            setSelectorOpen(null)
          }}
          onClose={() => setSelectorOpen(null)}
        />
      )}

      {/* Rows-behind-a-number modal (opened from the stat chips) */}
      {rowsModal && (
        <RowsModal
          title={rowsModal.title}
          rows={rowsModal.rows}
          note={rowsModal.note}
          onClose={() => setRowsModal(null)}
        />
      )}

      {/* Parent card — opens as an overlay on top of the import view without
          closing it, so the preview and any pending mappings stay put behind. */}
      {openParentId && (
        <EmployeeCard parentId={openParentId} onClose={() => setOpenParentId(null)} />
      )}
    </div>
  )
}
