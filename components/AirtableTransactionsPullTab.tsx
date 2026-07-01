'use client'

import { useEffect, useState } from 'react'

// ── Types ─────────────────────────────────────────────────────────────────────

interface ParentOption { id: string; name: string }

interface PreviewRow {
  airtableId:       string
  airtableParentId: string | null
  donorName:        string
  matchedParent:    string | null
  matchedId:        string | null
  amount:           number
  date:             string | null
  monthYear:        string
  paymentMethod:    string
  category:         string
  notes:            string
  status:           'new' | 'link' | 'already-linked'
}

interface DryRunResult {
  dryRun:      true
  total:       number
  excluded:    number
  excludedPaymentMethod: number
  excludedCategory: number
  alreadyLinked: number
  toProcess:   number
  matched:     number
  unmatched:   string[]
  preview:     PreviewRow[]
  totalAmount: number
  actions:     string[]
}

interface ImportResult {
  created?:     number
  linked?:      number
  skipped?:     number
  excluded?:    number
  excludedPaymentMethod?: number
  excludedCategory?: number
  totalAmount?: number
  errors?:      string[]
  error?:       string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_LABEL: Record<PreviewRow['status'], string> = {
  new:  'תיווצר',
  link: 'תקושר',
  'already-linked': 'כבר מקושרת',
}

// ── ParentSelector modal ──────────────────────────────────────────────────────

function ParentSelector({ unmatchedLabel, allParents, onSelect, onClose }: {
  unmatchedLabel: string
  allParents:     ParentOption[]
  onSelect:       (id: string, name: string) => void
  onClose:        () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = allParents.filter(p => p.name.includes(search)).slice(0, 50)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[28rem] flex flex-col">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            בחר הורה עבור: <span className="text-blue-600">{unmatchedLabel}</span>
          </p>
          <input
            type="text"
            placeholder="חפש הורה…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(p => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id, p.name)}
              className="w-full text-right px-4 py-2.5 hover:bg-blue-50 border-b text-sm text-gray-800 transition"
            >
              {p.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-400">לא נמצאו הורים תואמים</p>
          )}
        </div>
        <div className="p-3 border-t">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Stat chip ─────────────────────────────────────────────────────────────────

function Stat({ label, value, color = 'gray' }: { label: string; value: string | number; color?: string }) {
  const colors: Record<string, string> = {
    gray:  'bg-gray-50',
    green: 'bg-emerald-50',
    amber: 'bg-amber-50',
    red:   'bg-red-50',
    blue:  'bg-blue-50',
  }
  return (
    <div className={`${colors[color] ?? colors.gray} rounded-lg py-2 text-center`}>
      <div className="text-lg font-bold text-gray-800">{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
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
  const [selectorOpen, setSelectorOpen] = useState<{ key: string; label: string } | null>(null)
  const [lastRun, setLastRun]           = useState<{ lastRun: string | null; lastSummary: string | null }>({ lastRun: null, lastSummary: null })

  // Manual mappings: airtableParentId → { id, name } (Supabase parent)
  const [manualMappings, setManualMappings] = useState<Record<string, { id: string; name: string }>>(() => {
    try { return JSON.parse(localStorage.getItem('airtableTxManualMappings') ?? 'null') ?? {} } catch { return {} }
  })

  useEffect(() => {
    try { localStorage.setItem('airtableTxManualMappings', JSON.stringify(manualMappings)) } catch {}
  }, [manualMappings])

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

  const runPreview = async () => {
    setBusy(true); setPreview(null); setResult(null)
    try {
      const res = await fetch('/api/automations/airtable-transactions-pull', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dryRun: true, parentMappings: buildParentMappings() }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setResult({ error: data?.error ?? `שגיאה ${res.status}` }); return }
      setPreview(data)
    } catch (e) { setResult({ error: String(e) }) }
    finally { setBusy(false) }
  }

  const runImport = async () => {
    if (!preview) return
    if (!confirm(`מאשר יצירה/קישור של ${preview.matched} תנועות?`)) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/automations/airtable-transactions-pull', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ dryRun: false, parentMappings: buildParentMappings() }),
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
    const key = r.airtableParentId ? manualMappings[r.airtableParentId]?.name : ''
    const hay = `${r.donorName} ${r.matchedParent ?? ''} ${key ?? ''}`.toLowerCase()
    return hay.includes(nameFilter.toLowerCase())
  }) ?? []

  const stillUnmatched = preview?.preview.filter(r => !r.matchedParent && r.airtableParentId && !manualMappings[r.airtableParentId]) ?? []
  // De-dupe by airtableParentId for the chip list
  const unmatchedByParentId = new Map<string, string>()
  for (const r of stillUnmatched) if (r.airtableParentId) unmatchedByParentId.set(r.airtableParentId, r.donorName)

  return (
    <div className="space-y-6" dir="rtl">

      {/* ── Header card ── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-5">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">משיכת תנועות כספיות מ-Airtable</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            מושך תנועות מטבלת התנועות ב-Airtable — לא הו&quot;ק ולא אשראי (אלה מטופלים באוטומציות ייעודיות) ולא תנועות בקטגוריית &quot;בנין לדורות&quot; (יש להן זרימה נפרדת) — ומקשר אותן לתשלום מתוכנן פתוח של ההורה המתאים.
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

          {/* Stats */}
          <div className="grid grid-cols-4 sm:grid-cols-7 gap-2">
            <Stat label="סה״כ ב-Airtable" value={preview.total}          />
            <Stat label="סונן (הו״ק/אשראי)" value={preview.excludedPaymentMethod} color="amber" />
            <Stat label="סונן (בנין לדורות)" value={preview.excludedCategory}     color="amber" />
            <Stat label="כבר מקושרות" value={preview.alreadyLinked}     color="gray"  />
            <Stat label="לטיפול"      value={preview.toProcess}         color="blue"  />
            <Stat label="זוהו הורים"  value={preview.matched}           color="green" />
            <Stat label="לא זוהו"     value={unmatchedByParentId.size}  color={unmatchedByParentId.size > 0 ? 'red' : 'gray'} />
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
                {[...unmatchedByParentId.entries()].map(([airtableParentId, name]) => (
                  <button
                    key={airtableParentId}
                    onClick={() => setSelectorOpen({ key: airtableParentId, label: name })}
                    className="px-2.5 py-1 bg-white border border-red-300 rounded-lg text-xs text-red-700 hover:bg-red-100 transition"
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual mappings */}
          {Object.keys(manualMappings).length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 space-y-2">
              <p className="text-xs font-semibold text-emerald-700">קישורים ידניים ({Object.keys(manualMappings).length}):</p>
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
                  <th className="px-3 py-2">סטטוס</th>
                  <th className="px-3 py-2">הערות</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredPreview.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-4 text-center text-gray-400">אין תוצאות</td></tr>
                )}
                {filteredPreview.map((r, i) => {
                  const manual   = r.airtableParentId ? manualMappings[r.airtableParentId] : undefined
                  const resolved = r.matchedParent ?? manual?.name ?? null
                  return (
                    <tr key={i} className={resolved ? 'hover:bg-gray-50' : 'bg-red-50'}>
                      <td className="px-3 py-1.5">
                        {resolved
                          ? <span className="text-emerald-700 font-medium">{resolved}</span>
                          : (
                            <button
                              onClick={() => setSelectorOpen({ key: r.airtableParentId ?? '', label: r.donorName })}
                              className="text-red-500 hover:underline"
                            >
                              {r.donorName} — לחץ לקישור
                            </button>
                          )
                        }
                      </td>
                      <td className="px-3 py-1.5 tabular-nums text-gray-500">{r.date}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.monthYear}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums font-medium">₪{r.amount.toLocaleString('he-IL')}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.paymentMethod || '—'}</td>
                      <td className="px-3 py-1.5 text-gray-500">{r.category || '—'}</td>
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
              disabled={busy || preview.matched === 0}
              className="px-6 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 transition-all"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
            >
              {busy ? 'מייבא…' : `ייבא ${preview.matched} תנועות`}
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
        <ParentSelector
          unmatchedLabel={selectorOpen.label}
          allParents={allParents}
          onSelect={(id, name) => {
            setManualMappings(m => ({ ...m, [selectorOpen.key]: { id, name } }))
            setSelectorOpen(null)
          }}
          onClose={() => setSelectorOpen(null)}
        />
      )}
    </div>
  )
}
