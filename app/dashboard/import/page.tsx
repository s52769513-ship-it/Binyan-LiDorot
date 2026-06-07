'use client'

import { useCallback, useRef, useState } from 'react'

// ── CSV parser (RFC 4180) ────────────────────────────────────────────────────
function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuote = false
  let i = 0
  while (i < text.length) {
    const c = text[i]
    if (inQuote) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i += 2; continue }
      if (c === '"') { inQuote = false; i++; continue }
      field += c; i++
    } else {
      if (c === '"') { inQuote = true; i++; continue }
      if (c === ',') { row.push(field); field = ''; i++; continue }
      if (c === '\n' || c === '\r') {
        row.push(field); field = ''
        if (row.some(f => f !== '')) rows.push(row)
        row = []
        if (c === '\r' && text[i + 1] === '\n') i++
        i++; continue
      }
      field += c; i++
    }
  }
  if (field || row.length) { row.push(field); if (row.some(f => f !== '')) rows.push(row) }
  return rows
}

// ── Amount parser: "₪2,810.00" | "-₪2,810.00" | "₪0.00" → number ────────────
function parseAmount(s: string): number {
  const clean = s.replace(/[₪,\s]/g, '').replace(/^-/, m => m)
  return parseFloat(clean) || 0
}

// ── Date parser: D/M/YYYY → YYYY-MM-DD ──────────────────────────────────────
function parseDate(s: string): string {
  const p = s.trim().split('/')
  if (p.length !== 3) return ''
  return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`
}

// ── Map Airtable type emoji → our type ──────────────────────────────────────
function mapType(typeEmoji: string, project: string, method: string): string {
  const isIncome = typeEmoji.includes('הכנסה') || typeEmoji.includes('💰')
  if (!isIncome) return 'הוצאה'
  if (method && method !== 'מזומן') return method
  return 'הכנסה'
}

// ── Column indices (0-based) in the Airtable CSV export ─────────────────────
const COL = {
  parentName:  1,   // אנ"ש
  hokId:       2,   // מזהה הו"ק
  parentId:    3,   // ID (from אנ"ש)
  amount:      7,   // סכום
  direction:   8,   // כיוון תנועה (signed)
  typeEmoji:   9,   // סוג תנועה
  date:        10,  // תאריך
  monthYear:   12,  // חודש ושנה
  project:     15,  // קשור לפרוייקט
  notes:       18,  // הערות
  method:      19,  // אמצעי תשלום
}

interface ParsedRow {
  parentId: string
  parentName: string
  amount: number
  txType: string
  date: string
  monthYear: string
  project: string
  notes: string
  _raw: string
}

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 0 }).format(n)
}

export default function ImportPage() {
  const [rows, setRows]           = useState<ParsedRow[]>([])
  const [fileName, setFileName]   = useState('')
  const [dragging, setDragging]   = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<{ imported: number; skipped: number; errors: string[] } | null>(null)
  const [page, setPage]           = useState(0)
  const [resetOpen, setResetOpen] = useState(false)
  const [resetTables, setResetTables] = useState<Record<string, boolean>>({
    transactions: true, planned_payments: true, debts: true, standing_orders: false, automation_logs: false,
  })
  const [resetting, setResetting]   = useState(false)
  const [resetResult, setResetResult] = useState<Record<string, string> | null>(null)
  const [confirmText, setConfirmText] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const PAGE_SIZE = 30

  const processFile = useCallback((file: File) => {
    setFileName(file.name)
    setResult(null)
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      const matrix = parseCSV(text)
      if (matrix.length < 2) return
      // Skip header row
      const parsed: ParsedRow[] = []
      for (let i = 1; i < matrix.length; i++) {
        const r = matrix[i]
        const directionStr = r[COL.direction] ?? ''
        const isNeg = directionStr.startsWith('-')
        const amount = parseAmount(directionStr)
        const date   = parseDate(r[COL.date] ?? '')
        const project = r[COL.project] ?? ''
        const method  = r[COL.method] ?? ''
        const typeEmoji = r[COL.typeEmoji] ?? ''
        if (!date && !amount) continue
        parsed.push({
          parentId:   r[COL.parentId] ?? '',
          parentName: r[COL.parentName] ?? '',
          amount:     isNeg ? -Math.abs(amount) : Math.abs(amount),
          txType:     mapType(typeEmoji, project, method),
          date,
          monthYear:  r[COL.monthYear] ?? '',
          project,
          notes:      r[COL.notes] ?? '',
          _raw:       r.join(','),
        })
      }
      setRows(parsed)
      setPage(0)
    }
    reader.readAsText(file, 'UTF-8')
  }, [])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) processFile(file)
  }, [processFile])

  const doImport = async (dryRun: boolean) => {
    setImporting(true); setResult(null)
    try {
      const res = await fetch('/api/import/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows, dryRun }),
      })
      const data = await res.json()
      setResult(data)
    } finally {
      setImporting(false)
    }
  }

  const doReset = async () => {
    setResetting(true); setResetResult(null)
    const tables = Object.entries(resetTables).filter(([, v]) => v).map(([k]) => k)
    try {
      const res = await fetch('/api/admin/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tables, confirm: 'DELETE_ALL' }),
      })
      const data = await res.json()
      setResetResult(data.results)
      setConfirmText('')
    } finally {
      setResetting(false) }
  }

  const pageRows = rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const totalIncome = rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0)
  const totalExpense = rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0)
  const noParent = rows.filter(r => !r.parentId).length

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-800">ייבוא תנועות מקובץ CSV</h1>
        <button
          onClick={() => setResetOpen(o => !o)}
          className="px-3 py-1.5 text-xs rounded-lg bg-red-50 text-red-700 border border-red-200 hover:bg-red-100 font-medium"
        >⚠ איפוס נתונים כספיים</button>
      </div>

      {/* ── Reset panel ──────────────────────────────────────────────────────── */}
      {resetOpen && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-4">
          <h2 className="font-bold text-red-800 text-sm">איפוס נתונים — פעולה בלתי הפיכה!</h2>
          <p className="text-xs text-red-600">בחר את הטבלאות שברצונך למחוק. ההורים והתלמידים לא ייגעו.</p>
          <div className="grid grid-cols-2 gap-2">
            {Object.keys(resetTables).map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer text-sm text-red-700">
                <input type="checkbox" checked={resetTables[t]}
                  onChange={e => setResetTables(prev => ({ ...prev, [t]: e.target.checked }))} />
                {t}
              </label>
            ))}
          </div>
          <div className="space-y-2">
            <p className="text-xs text-red-600">הקלד <strong>DELETE_ALL</strong> לאישור:</p>
            <input
              type="text" value={confirmText}
              onChange={e => setConfirmText(e.target.value)}
              className="w-full border border-red-300 rounded-lg px-3 py-2 text-sm focus:outline-none"
              placeholder="DELETE_ALL"
            />
            <button
              onClick={doReset}
              disabled={resetting || confirmText !== 'DELETE_ALL'}
              className="w-full py-2 rounded-lg bg-red-600 text-white font-bold text-sm disabled:opacity-40 hover:bg-red-700"
            >{resetting ? 'מוחק...' : 'מחק נתונים'}</button>
          </div>
          {resetResult && (
            <div className="space-y-1">
              {Object.entries(resetResult).map(([t, s]) => (
                <p key={t} className="text-xs"><span className="font-mono text-red-700">{t}</span>: {s}</p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Drop zone ────────────────────────────────────────────────────────── */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${dragging ? 'border-[#1a3a7a] bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}`}
      >
        <input ref={inputRef} type="file" accept=".csv" className="hidden"
          onChange={e => { if (e.target.files?.[0]) processFile(e.target.files[0]) }} />
        <p className="text-gray-500 text-sm">גרור קובץ CSV מאיירטייבל לכאן, או לחץ לבחירה</p>
        {fileName && <p className="text-xs text-[#1a3a7a] mt-2 font-medium">{fileName}</p>}
      </div>

      {/* ── Summary ──────────────────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-3">
            {[
              { label: 'סה"כ שורות', value: rows.length, color: 'text-gray-700' },
              { label: 'הכנסות', value: fmt(totalIncome), color: 'text-emerald-600' },
              { label: 'הוצאות', value: fmt(Math.abs(totalExpense)), color: 'text-red-500' },
              { label: 'ללא הורה', value: noParent, color: noParent > 0 ? 'text-orange-500' : 'text-gray-400' },
            ].map(c => (
              <div key={c.label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
                <p className={`text-lg font-bold ${c.color}`}>{c.value}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{c.label}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => doImport(true)}
              disabled={importing}
              className="px-4 py-2 rounded-lg border border-[#1a3a7a] text-[#1a3a7a] text-sm hover:bg-blue-50 disabled:opacity-40"
            >{importing ? '...' : 'בדוק (Dry Run)'}</button>
            <button
              onClick={() => doImport(false)}
              disabled={importing}
              className="px-4 py-2 rounded-lg bg-[#1a3a7a] text-white text-sm hover:bg-[#0d1f52] disabled:opacity-40 font-medium"
            >{importing ? 'מייבא...' : `ייבא ${rows.length} תנועות`}</button>
          </div>

          {result && (
            <div className={`rounded-xl p-4 text-sm ${result.errors?.length ? 'bg-orange-50 border border-orange-200' : 'bg-emerald-50 border border-emerald-200'}`}>
              <p className="font-semibold text-gray-700">
                יובאו {result.imported} · דולגו {result.skipped}
                {result.errors?.length ? ` · ${result.errors.length} שגיאות` : ''}
              </p>
              {result.errors?.slice(0, 5).map((e, i) => (
                <p key={i} className="text-xs text-red-600 mt-1">{e}</p>
              ))}
            </div>
          )}

          {/* Preview table */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
              <p className="text-sm font-semibold text-gray-700">תצוגה מקדימה</p>
              <div className="flex items-center gap-2">
                <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 disabled:opacity-40">הקודם</button>
                <span className="text-xs text-gray-500">{page + 1} / {Math.ceil(rows.length / PAGE_SIZE)}</span>
                <button disabled={(page + 1) * PAGE_SIZE >= rows.length} onClick={() => setPage(p => p + 1)}
                  className="text-xs px-2 py-1 rounded border border-gray-200 disabled:opacity-40">הבא</button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-right">
                    {['הורה', 'סכום', 'סוג', 'תאריך', 'חודש', 'קטגוריה', 'הערות'].map(h => (
                      <th key={h} className="px-3 py-2 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.map((r, i) => (
                    <tr key={i} className={`hover:bg-gray-50 ${!r.parentId ? 'bg-orange-50' : ''}`}>
                      <td className="px-3 py-1.5 text-right">
                        <span className="font-medium text-gray-800">{r.parentName || '—'}</span>
                        {!r.parentId && <span className="text-[10px] text-orange-500 mr-1">ללא ID</span>}
                      </td>
                      <td className={`px-3 py-1.5 text-left font-bold tabular-nums ${r.amount >= 0 ? 'text-emerald-600' : 'text-red-500'}`} dir="ltr">
                        {fmt(r.amount)}
                      </td>
                      <td className="px-3 py-1.5">{r.txType}</td>
                      <td className="px-3 py-1.5 tabular-nums" dir="ltr">{r.date}</td>
                      <td className="px-3 py-1.5">{r.monthYear}</td>
                      <td className="px-3 py-1.5">
                        {r.project && <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 text-[10px]">{r.project}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-gray-400 max-w-[160px] truncate">{r.notes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
