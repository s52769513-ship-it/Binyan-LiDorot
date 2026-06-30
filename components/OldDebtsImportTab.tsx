'use client'

import { useRef, useState, useEffect } from 'react'
import * as XLSX from 'xlsx'

/* Logical fields we need to map the file's columns onto. */
const FIELDS = [
  { key: 'parentName', label: 'שם הורה', required: true,  guess: /הורה|שם מלא|אב|משפח|שם/ },
  { key: 'type',       label: 'סוג (התחייב/תשלום)', required: true, guess: /סוג|פעולה|תיאור פעולה|status/i },
  { key: 'amount',     label: 'סכום', required: true,  guess: /סכום|חוב|זכות|amount|₪/i },
  { key: 'paymentMethod', label: 'אמצעי תשלום', required: false, guess: /אמצעי|אופן תשלום|שיטת תשלום|method/i },
  { key: 'date',       label: 'תאריך', required: false, guess: /תאריך|date/i },
  { key: 'monthYear',  label: 'חודש/שנה (MM/YYYY)', required: false, guess: /חודש|month|MM|mm|YYYY|YY|\d{1,2}[/-]\d{2,4}/i },
  { key: 'notes',      label: 'הערות', required: false, guess: /הער|תיאור|פירוט|notes/i },
] as const

type FieldKey = (typeof FIELDS)[number]['key']

interface PreviewRow { parentName: string; matchedParent: string | null; kind: string; amount: number; monthYear: string }
interface DryRunResult {
  dryRun: true; total: number; charges: number; payments: number; unknown: number
  matched: number; unmatched: string[]; preview: PreviewRow[]
}
interface ImportResult { createdPPs?: number; createdPayments?: number; skipped?: number; errors?: string[]; error?: string }

function pad(n: number) { return String(n).padStart(2, '0') }
function fmtISO(y: number, m: number, d: number) { return `${y}-${pad(m)}-${pad(d)}` }

// Normalize any cell value (Date object, Excel serial, or string) to YYYY-MM-DD.
function toISODate(v: unknown): string {
  if (v == null || v === '') return ''
  if (v instanceof Date && !isNaN(v.getTime())) return fmtISO(v.getFullYear(), v.getMonth() + 1, v.getDate())
  if (typeof v === 'number') {
    const ms = Date.UTC(1899, 11, 30) + Math.round(v) * 86400000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? '' : fmtISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate())
  }
  const s = String(v).trim()
  let m: RegExpExecArray | null
  if ((m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s))) return fmtISO(+m[1], +m[2], +m[3])
  if ((m = /^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})/.exec(s))) {   // assume DD/MM/YYYY
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]
    return fmtISO(y, +m[2], +m[1])
  }
  return ''
}

interface ParentOption { id: string; name: string }

export default function OldDebtsImportTab() {
  const fileRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [dataRows, setDataRows] = useState<unknown[][]>([])
  const [map, setMap] = useState<Record<FieldKey, number>>({ parentName: -1, type: -1, amount: -1, paymentMethod: -1, date: -1, monthYear: -1, notes: -1 })
  const [preview, setPreview] = useState<DryRunResult | null>(null)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [allParents, setAllParents] = useState<ParentOption[]>([])
  const [manualMappings, setManualMappings] = useState<Record<string, string>>({})
  const [parentSelectorOpen, setParentSelectorOpen] = useState<string | null>(null)

  useEffect(() => {
    const fetchParents = async () => {
      try {
        const res = await fetch('/api/parents-simple')
        if (res.ok) {
          const parents = await res.json()
          setAllParents(Array.isArray(parents) ? parents : [])
        }
      } catch (e) {
        console.error('Failed to fetch parents:', e)
      }
    }
    fetchParents()
  }, [])

  const onFile = async (file: File) => {
    setFileName(file.name); setPreview(null); setResult(null)
    const buf = await file.arrayBuffer()
    const wb = XLSX.read(buf, { type: 'array', cellDates: true })
    const ws = wb.Sheets[wb.SheetNames[0]]
    const grid = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' })
    if (grid.length === 0) { setHeaders([]); setDataRows([]); return }
    const hdrs = (grid[0] as unknown[]).map(h => String(h ?? '').trim())
    const rows = grid.slice(1).filter(r => (r as unknown[]).some(c => c !== '' && c != null))
    setHeaders(hdrs)
    setDataRows(rows)

    // Auto-guess column mapping by header name.
    const guessed: Record<FieldKey, number> = { parentName: -1, type: -1, amount: -1, paymentMethod: -1, date: -1, monthYear: -1, notes: -1 }
    const used = new Set<number>()
    for (const f of FIELDS) {
      const idx = hdrs.findIndex((h, i) => !used.has(i) && f.guess.test(h))
      if (idx >= 0) { guessed[f.key] = idx; used.add(idx) }
    }
    setMap(guessed)
  }

  const buildRows = () =>
    dataRows.map(r => ({
      parentName: map.parentName >= 0 ? String(r[map.parentName] ?? '').trim() : '',
      type:       map.type       >= 0 ? String(r[map.type] ?? '').trim() : '',
      amount:     map.amount     >= 0 ? (r[map.amount] as number | string) : 0,
      paymentMethod: map.paymentMethod >= 0 ? String(r[map.paymentMethod] ?? '').trim() : '',
      date:       map.date       >= 0 ? toISODate(r[map.date]) : '',
      monthYear:  map.monthYear  >= 0 ? String(r[map.monthYear] ?? '').trim() : '',
      notes:      map.notes      >= 0 ? String(r[map.notes] ?? '').trim() : '',
    })).filter(x => x.parentName || x.type || x.amount)

  const missingRequired = FIELDS.filter(f => f.required && map[f.key] < 0).map(f => f.label)

  const send = async (dryRun: boolean) => {
    if (missingRequired.length > 0) return
    setBusy(true); setResult(null)
    try {
      const res = await fetch('/api/import/old-debts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: buildRows(),
          dryRun,
          parentMappings: Object.keys(manualMappings).length > 0 ? manualMappings : undefined
        }),
      })
      const data = await res.json()
      if (dryRun) { setPreview(data); setResult(null) }
      else { setResult(data); setPreview(null) }
    } catch (e) {
      setResult({ error: String(e) })
    } finally { setBusy(false) }
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">ייבוא חובות ישנים</h3>
          <p className="text-xs text-gray-400 mt-0.5">
            טען קובץ Excel/CSV. שורה שסוגה <b>התחייב</b> תיצור PP שכ&quot;ל (חוב ישן), ושורה שסוגה <b>תשלום</b> תיצור תשלום מקושר לאותו חוב.
            ההורה מזוהה לפי שם. מומלץ להריץ תצוגה מקדימה לפני ייבוא.
          </p>
        </div>

        <div className="flex gap-3 items-center">
          <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f) }} />
          <button onClick={() => fileRef.current?.click()}
            className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-gray-300 hover:text-gray-800 bg-white">
            {fileName || 'בחר קובץ…'}
          </button>
        </div>

        {headers.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-500">מיפוי עמודות ({dataRows.length} שורות)</p>
            <div className="grid grid-cols-2 gap-3">
              {FIELDS.map(f => (
                <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-gray-600">{f.label}{f.required && <span className="text-red-500"> *</span>}</span>
                  <select value={map[f.key]} onChange={e => setMap(m => ({ ...m, [f.key]: Number(e.target.value) }))}
                    className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white min-w-[140px]">
                    <option value={-1}>— ללא —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h || `עמודה ${i + 1}`}</option>)}
                  </select>
                </label>
              ))}
            </div>

            {missingRequired.length > 0 && (
              <p className="text-xs text-red-500">חסר מיפוי לשדות חובה: {missingRequired.join(', ')}</p>
            )}

            <div className="flex gap-3 pt-1">
              <button onClick={() => send(true)} disabled={busy || missingRequired.length > 0}
                className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                {busy ? 'מעבד…' : 'תצוגה מקדימה'}
              </button>
              <button onClick={() => send(false)} disabled={busy || missingRequired.length > 0 || !preview}
                className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
                {busy ? 'מייבא…' : 'ייבא'}
              </button>
            </div>
          </div>
        )}
      </div>

      {preview && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">תצוגה מקדימה</h3>
          <div className="grid grid-cols-4 gap-2 text-center text-sm">
            <Stat label="סה״כ שורות" value={preview.total} />
            <Stat label="חיובים (PP)" value={preview.charges} />
            <Stat label="תשלומים" value={preview.payments} />
            <Stat label="הורים זוהו" value={`${preview.matched}/${preview.total}`} />
          </div>
          {preview.unknown > 0 && <p className="text-xs text-amber-600">{preview.unknown} שורות עם סוג לא מזוהה (לא ייובאו)</p>}
          {preview.unmatched.length > 0 && (
            <div className="text-xs text-red-600">
              <p className="font-semibold">הורים שלא זוהו ({preview.unmatched.length}):</p>
              <div className="flex flex-wrap gap-1 mt-1">
                {preview.unmatched.slice(0, 30).map((name) => (
                  <button key={name} onClick={() => setParentSelectorOpen(name)}
                    className="px-2 py-1 bg-red-100 rounded hover:bg-red-200 text-red-700 transition">
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-400 text-right">
                <tr><th className="px-2 py-1">שם בקובץ</th><th className="px-2 py-1">זוהה</th><th className="px-2 py-1">סוג</th><th className="px-2 py-1 text-left">סכום</th><th className="px-2 py-1">חודש</th></tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {preview.preview.map((r, i) => {
                  const matched = r.matchedParent || manualMappings[r.parentName]
                  return (
                    <tr key={i} className={matched ? '' : 'bg-red-50'}>
                      <td className="px-2 py-1">{r.parentName}</td>
                      <td className="px-2 py-1">
                        {matched ? matched : <button onClick={() => setParentSelectorOpen(r.parentName)} className="text-red-500 hover:underline">—</button>}
                      </td>
                      <td className="px-2 py-1">{r.kind === 'charge' ? 'התחייב' : r.kind === 'payment' ? 'תשלום' : '?'}</td>
                      <td className="px-2 py-1 text-left tabular-nums">{r.amount.toLocaleString('he-IL')}</td>
                      <td className="px-2 py-1">{r.monthYear}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-gray-400">מוצגות עד 50 שורות ראשונות. לחיצה על &quot;ייבא&quot; תשמור הכל.</p>

          <ImportSummary
            preview={preview}
            allRows={buildRows()}
            manualMappings={manualMappings}
          />

          <div className="flex gap-3 pt-2">
            <button onClick={() => send(true)} disabled={busy}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy ? 'מעבד…' : 'רענן תצוגה'}
            </button>
            <button onClick={() => send(false)} disabled={busy}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
              {busy ? 'מייבא…' : 'ייבא עכשיו'}
            </button>
          </div>
        </div>
      )}

      {parentSelectorOpen && (
        <ParentSelector
          unmatchedName={parentSelectorOpen}
          allParents={allParents}
          onSelect={(parentId, parentName) => {
            setManualMappings(m => ({ ...m, [parentSelectorOpen]: parentName }))
            setParentSelectorOpen(null)
          }}
          onClose={() => setParentSelectorOpen(null)}
        />
      )}

      {result && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-2">
          {result.error ? (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{result.error}</div>
          ) : (
            <>
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-emerald-800">
                ✓ נוצרו {result.createdPPs} חובות (PP) ו-{result.createdPayments} תשלומים
                {result.skipped ? <span className="text-emerald-600 mr-2">· {result.skipped} דולגו</span> : null}
              </div>
              {result.errors && result.errors.length > 0 && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 max-h-40 overflow-y-auto">
                  <p className="font-semibold mb-1">הערות ({result.errors.length}):</p>
                  {result.errors.slice(0, 50).map((e, i) => <p key={i}>{e}</p>)}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-gray-50 rounded-lg py-2">
      <div className="text-lg font-bold text-gray-800">{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}

function ImportSummary({ preview, allRows, manualMappings }: {
  preview: DryRunResult
  allRows: Array<{ parentName: string; type: string; amount: number | string; [key: string]: any }>
  manualMappings: Record<string, string>
}) {
  // Calculate from ALL rows, not just preview
  const chargeRows = allRows.filter(r => {
    const matched = preview.preview.some(p => p.parentName === r.parentName && (p.matchedParent || manualMappings[p.parentName]))
    return r.type?.toLowerCase().includes('התחייב') && (r.parentName ? matched : false)
  })
  const paymentRows = allRows.filter(r => {
    const matched = preview.preview.some(p => p.parentName === r.parentName && (p.matchedParent || manualMappings[p.parentName]))
    return r.type?.toLowerCase().includes('תשלום') && (r.parentName ? matched : false)
  })

  const toNumber = (v: number | string | undefined): number => {
    if (typeof v === 'number') return v
    if (!v) return 0
    const n = Number(String(v).replace(/[₪,\s]/g, ''))
    return isNaN(n) ? 0 : n
  }

  const chargeTotal = chargeRows.reduce((sum, r) => sum + toNumber(r.amount), 0)
  const paymentTotal = paymentRows.reduce((sum, r) => sum + toNumber(r.amount), 0)

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2 text-sm">
      <p className="font-semibold text-blue-900">סיכום היצירה (לפני ייבוא) - כולל את כל השורות:</p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div className="bg-white rounded p-2">
          <div className="text-blue-600 font-medium">{chargeRows.length} שורות PP</div>
          <div className="text-gray-600">סה"כ סכום: {chargeTotal.toLocaleString('he-IL')}</div>
        </div>
        <div className="bg-white rounded p-2">
          <div className="text-green-600 font-medium">{paymentRows.length} שורות תשלום</div>
          <div className="text-gray-600">סה"כ סכום: {paymentTotal.toLocaleString('he-IL')}</div>
        </div>
      </div>
    </div>
  )
}

function ParentSelector({ unmatchedName, allParents, onSelect, onClose }:
  { unmatchedName: string; allParents: ParentOption[]; onSelect: (id: string, name: string) => void; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const filtered = allParents.filter(p => p.name.includes(search))

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-96 flex flex-col">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold text-gray-700 mb-3">בחר הורה עבור: <span className="text-blue-600">{unmatchedName}</span></p>
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
              className="w-full text-right px-4 py-2 hover:bg-blue-50 border-b text-sm text-gray-800 transition"
            >
              {p.name}
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="p-4 text-center text-xs text-gray-500">
              לא נמצאו הורים התואמים
            </div>
          )}
        </div>
        <div className="p-3 border-t">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 bg-gray-200 text-gray-700 rounded-lg text-sm hover:bg-gray-300 transition"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
