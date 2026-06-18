'use client'

import { useRef, useState } from 'react'

type Phase = 'upload' | 'preview' | 'analyze' | 'confirm' | 'done'

interface AnalyzeAction {
  rowName:        string
  matchedName?:   string
  parentId?:      string
  amount:         number
  paymentMethod:  string
  category:       'hok' | 'salary' | 'manual'
  action:         'update_so' | 'create_so' | 'update_monthly_donation' | 'info_only' | 'no_match' | 'skip'
  reason?:        string
  host?:          string
}
interface Counts {
  update_so:               number
  create_so:               number
  update_monthly_donation: number
  info_only:               number
  no_match:                number
}
interface ParseResult {
  totalRows: number
  sample:    { name: string; amount: number; paymentMethod: string; host: string }[]
}
interface ExecResult {
  updatedSo:     number
  updatedSalary: number
  skipped:       number
  total:         number
  dryRun:        boolean
}

const ACTION_LABELS: Record<string, string> = {
  update_so:               'עדכון הו"ק',
  create_so:               'יצירת הו"ק חדש',
  update_monthly_donation: 'ניכוי משכרות',
  info_only:               'ידני',
  no_match:                'לא נמצא',
  skip:                    'דולג',
}
const ACTION_COLOR: Record<string, string> = {
  update_so:               'bg-blue-50 text-blue-700',
  create_so:               'bg-green-50 text-green-700',
  update_monthly_donation: 'bg-emerald-50 text-emerald-700',
  info_only:               'bg-amber-50 text-amber-700',
  no_match:                'bg-red-50 text-red-600',
  skip:                    'bg-gray-100 text-gray-500',
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

export default function DonationImportModal({ onClose, onSuccess }: {
  onClose:   () => void
  onSuccess: () => void
}) {
  const [phase, setPhase]           = useState<Phase>('upload')
  const [csvText, setCsvText]       = useState('')
  const [parseResult, setParseResult] = useState<ParseResult | null>(null)
  const [actions, setActions]       = useState<AnalyzeAction[]>([])
  const [counts, setCounts]         = useState<Counts | null>(null)
  const [execResult, setExecResult] = useState<ExecResult | null>(null)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [dryRun, setDryRun]         = useState(false)
  const [actionFilter, setActionFilter] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const readFile = (file: File) => {
    const reader = new FileReader()
    reader.onload = e => {
      const text = e.target?.result as string
      setCsvText(text)
    }
    reader.readAsText(file, 'utf-8')
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) readFile(file)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) readFile(file)
  }

  const handleParse = async () => {
    if (!csvText) { setError('אנא בחר קובץ CSV'); return }
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/donations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'parse', csvText }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setParseResult(d)
      setPhase('preview')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleAnalyze = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/donations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'analyze', csvText }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setActions(d.actions ?? [])
      setCounts(d.counts ?? null)
      setPhase('analyze')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const handleExecute = async () => {
    setLoading(true); setError('')
    try {
      const r = await fetch('/api/donations/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phase: 'execute', csvText, dryRun }),
      })
      const d = await r.json()
      if (!r.ok) throw new Error(d.error)
      setExecResult(d)
      setPhase('done')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  const filteredActions = actionFilter ? actions.filter(a => a.paymentMethod === actionFilter) : actions
  const paymentMethods = [...new Set(actions.map(a => a.paymentMethod).filter(Boolean))]

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-6 py-4 border-b flex items-center justify-between flex-shrink-0"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg">✕</button>
          <h2 className="font-bold text-white">ייבוא דמי מגבית מ-CSV</h2>
        </div>

        {/* Step indicator */}
        <div className="px-6 py-3 border-b bg-gray-50 flex items-center gap-2 text-xs flex-shrink-0">
          {(['upload','preview','analyze','confirm','done'] as Phase[]).map((p, i) => {
            const labels = { upload:'העלאה', preview:'תצוגה מקדימה', analyze:'ניתוח', confirm:'אישור', done:'סיום' }
            const idx = (['upload','preview','analyze','confirm','done'] as Phase[]).indexOf(phase)
            const done = i < idx
            const active = p === phase
            return (
              <span key={p} className={`flex items-center gap-1 ${active ? 'text-[#1a3a7a] font-semibold' : done ? 'text-emerald-600' : 'text-gray-400'}`}>
                {i > 0 && <span className="text-gray-300 mx-1">›</span>}
                {done ? '✓ ' : ''}{labels[p]}
              </span>
            )
          })}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-600">{error}</div>}

          {/* ── Upload ── */}
          {phase === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                בחר קובץ CSV של דמי מגבית עם העמודות: מספר, כינוי, שם, משפחה, נייד, סכום, אופן תשלום
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={e => e.preventDefault()}
                onClick={() => fileRef.current?.click()}
                className={`border-2 border-dashed rounded-2xl p-10 text-center cursor-pointer transition-colors ${
                  csvText ? 'border-emerald-400 bg-emerald-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'
                }`}
              >
                <input ref={fileRef} type="file" accept=".csv,.txt" className="hidden" onChange={handleFileChange} />
                {csvText ? (
                  <div>
                    <p className="text-4xl mb-2">✅</p>
                    <p className="text-sm font-medium text-emerald-700">הקובץ נטען בהצלחה</p>
                    <p className="text-xs text-gray-400 mt-1">{csvText.split('\n').filter(l=>l.trim()).length} שורות</p>
                    <button
                      onClick={e => { e.stopPropagation(); setCsvText('') }}
                      className="mt-2 text-xs text-red-400 hover:text-red-600"
                    >הסר קובץ</button>
                  </div>
                ) : (
                  <div>
                    <p className="text-4xl mb-2">📂</p>
                    <p className="text-sm font-medium text-gray-700">גרור קובץ CSV לכאן</p>
                    <p className="text-xs text-gray-400 mt-1">או לחץ לבחירת קובץ</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ── Preview ── */}
          {phase === 'preview' && parseResult && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="text-3xl">📊</div>
                <div>
                  <p className="font-semibold text-blue-900">{parseResult.totalRows} רשומות</p>
                  <p className="text-xs text-blue-600">נמצאו בקובץ</p>
                </div>
              </div>
              <div>
                <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">תצוגה מקדימה (5 שורות ראשונות)</p>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b">
                      <tr className="text-right text-gray-400">
                        <th className="px-3 py-2">שם</th>
                        <th className="px-3 py-2 text-left">סכום</th>
                        <th className="px-3 py-2">אופן תשלום</th>
                        <th className="px-3 py-2">מארח</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {parseResult.sample.map((r, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2 font-medium">{r.name}</td>
                          <td className="px-3 py-2 text-left tabular-nums text-emerald-700">{r.amount ? fmt(r.amount) : '—'}</td>
                          <td className="px-3 py-2 text-gray-600">{r.paymentMethod || '—'}</td>
                          <td className="px-3 py-2 text-gray-400">{r.host || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* ── Analyze ── */}
          {phase === 'analyze' && counts && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-center">
                  <p className="text-2xl font-bold text-blue-700">{counts.update_so}</p>
                  <p className="text-xs text-blue-600">עדכון הו"ק</p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
                  <p className="text-2xl font-bold text-emerald-700">{counts.update_monthly_donation}</p>
                  <p className="text-xs text-emerald-600">ניכוי משכרות</p>
                </div>
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-center">
                  <p className="text-2xl font-bold text-amber-700">{counts.info_only}</p>
                  <p className="text-xs text-amber-600">ידני / מזומן</p>
                </div>
                <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-center">
                  <p className="text-2xl font-bold text-red-700">{counts.no_match}</p>
                  <p className="text-xs text-red-600">לא נמצא</p>
                </div>
              </div>

              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">פירוט פעולות</p>
                  <select
                    value={actionFilter}
                    onChange={e => setActionFilter(e.target.value)}
                    className="text-xs px-2 py-1 border border-gray-200 rounded-lg bg-white"
                  >
                    <option value="">הכל ({actions.length})</option>
                    {paymentMethods.map(m => (
                      <option key={m} value={m}>{m} ({actions.filter(a => a.paymentMethod === m).length})</option>
                    ))}
                  </select>
                </div>
                <div className="rounded-xl border border-gray-200 overflow-hidden max-h-60 overflow-y-auto">
                  <table className="w-full text-xs">
                    <thead className="bg-gray-50 border-b sticky top-0">
                      <tr className="text-right text-gray-400">
                        <th className="px-3 py-2">שם (CSV)</th>
                        <th className="px-3 py-2">שם (מערכת)</th>
                        <th className="px-3 py-2 text-left">סכום</th>
                        <th className="px-3 py-2">אמצעי תשלום</th>
                        <th className="px-3 py-2 text-center">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredActions.map((a, i) => (
                        <tr key={i}>
                          <td className="px-3 py-2">{a.rowName}</td>
                          <td className="px-3 py-2 text-gray-500">{a.matchedName || '—'}</td>
                          <td className="px-3 py-2 text-left tabular-nums">{a.amount ? fmt(a.amount) : '—'}</td>
                          <td className="px-3 py-2 text-gray-700">{a.paymentMethod || '—'}</td>
                          <td className="px-3 py-2 text-center">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${ACTION_COLOR[a.action] ?? 'bg-gray-100'}`}>
                              {ACTION_LABELS[a.action] ?? a.action}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}
                    className="w-4 h-4 rounded accent-amber-600" />
                  <span className="text-sm font-medium text-amber-800">בדיקה בלבד (Dry Run)</span>
                </label>
                <span className="text-xs text-amber-600">שום דבר לא יישמר</span>
              </div>
            </div>
          )}

          {/* ── Confirm ── */}
          {phase === 'confirm' && counts && (
            <div className="space-y-4 text-center">
              <div className="text-5xl">⚡</div>
              <p className="font-semibold text-gray-800">
                {dryRun ? 'בדיקה בלבד — ביצוע dry run' : 'לאשר ביצוע ייבוא?'}
              </p>
              <div className="text-sm text-gray-600 space-y-1">
                <p>עדכון הו"ק: <strong>{counts.update_so}</strong></p>
                <p>עדכון ניכוי משכרות: <strong>{counts.update_monthly_donation}</strong></p>
                <p>פעולות ידניות: <strong>{counts.info_only}</strong></p>
                <p>לא נמצאו: <strong>{counts.no_match}</strong></p>
              </div>
              {dryRun && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                  ⚠️ מצב בדיקה — לא יעשה שינויים בפועל
                </div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {phase === 'done' && execResult && (
            <div className="space-y-4 text-center">
              <div className="text-5xl">{execResult.dryRun ? '🧪' : '✅'}</div>
              <p className="font-bold text-gray-800 text-lg">
                {execResult.dryRun ? 'בדיקה הושלמה' : 'הייבוא הושלם בהצלחה'}
              </p>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl">
                  <p className="text-2xl font-bold text-blue-700">{execResult.updatedSo}</p>
                  <p className="text-xs text-blue-600">הו"קים עודכנו</p>
                </div>
                <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                  <p className="text-2xl font-bold text-emerald-700">{execResult.updatedSalary}</p>
                  <p className="text-xs text-emerald-600">ניכויים עודכנו</p>
                </div>
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl">
                  <p className="text-2xl font-bold text-gray-600">{execResult.skipped}</p>
                  <p className="text-xs text-gray-500">דולגו</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t flex items-center gap-3 flex-shrink-0 bg-gray-50">
          <button onClick={onClose}
            className="px-4 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-100">
            {phase === 'done' ? 'סגור' : 'ביטול'}
          </button>
          <div className="flex-1" />

          {phase === 'upload' && (
            <button
              onClick={handleParse}
              disabled={!csvText || loading}
              className="px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
            >
              {loading ? 'טוען...' : 'המשך →'}
            </button>
          )}

          {phase === 'preview' && (
            <button
              onClick={handleAnalyze}
              disabled={loading}
              className="px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
            >
              {loading ? 'מנתח...' : 'נתח →'}
            </button>
          )}

          {phase === 'analyze' && (
            <button
              onClick={() => setPhase('confirm')}
              disabled={!counts || (counts.update_so === 0 && counts.update_monthly_donation === 0)}
              className="px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-colors"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
            >
              לאישור →
            </button>
          )}

          {phase === 'confirm' && (
            <button
              onClick={handleExecute}
              disabled={loading}
              className={`px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-40 transition-colors ${
                dryRun ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              {loading ? 'מבצע...' : dryRun ? '🧪 הרץ בדיקה' : '✅ בצע ייבוא'}
            </button>
          )}

          {phase === 'done' && !execResult?.dryRun && (
            <button
              onClick={onSuccess}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-emerald-600 text-white hover:bg-emerald-700"
            >
              סיום
            </button>
          )}
          {phase === 'done' && execResult?.dryRun && (
            <button
              onClick={() => { setDryRun(false); setPhase('confirm') }}
              className="px-5 py-2 rounded-xl text-sm font-bold bg-[#1a3a7a] text-[#d4a921]"
            >
              בצע בפועל
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
