'use client'

import { useState, useCallback } from 'react'

type FieldName = 'lastName' | 'firstName' | 'parentName' | 'transportation' | 'className' | 'status' | 'birthDate' | 'idNumber' | 'ignore'

const FIELD_OPTIONS: { value: FieldName | ''; label: string }[] = [
  { value: '',            label: '— בחר שדה —' },
  { value: 'lastName',   label: 'שם משפחה' },
  { value: 'firstName',  label: 'שם פרטי' },
  { value: 'parentName', label: 'שם הורה' },
  { value: 'transportation', label: 'הסעות' },
  { value: 'className',  label: 'כיתה' },
  { value: 'status',     label: 'סטטוס' },
  { value: 'birthDate',  label: 'תאריך לידה' },
  { value: 'idNumber',   label: 'ת"ז' },
  { value: 'ignore',     label: 'התעלם' },
]

// Auto-detect column → field mapping from header name
function autoDetect(header: string): FieldName | '' {
  const h = header.trim()
  if (/שם משפחה/i.test(h)) return 'lastName'
  if (/שם פרטי/i.test(h)) return 'firstName'
  if (/הורה/i.test(h)) return 'parentName'
  if (/הסעות/i.test(h)) return 'transportation'
  if (/כיתה1$|^כיתה$/.test(h)) return 'className'
  if (/סטטוס/i.test(h)) return 'status'
  if (/תאריך לידה/i.test(h)) return 'birthDate'
  if (/ת[""]?ז|id.?num/i.test(h)) return 'idNumber'
  return 'ignore'
}

type ParsedData = {
  headers: string[]
  sampleRows: string[][]
  totalRows: number
}

type RowResult = {
  rowIndex: number
  firstName: string; lastName: string; fullName: string
  parentNameCsv: string
  transportation: string[]; className: string; status: string
  action: 'create' | 'update' | 'skip' | 'needs_parent'
  existingId?: string
  changes?: { field: string; from: string; to: string }[]
  parentMatch?: { id: string; name: string; score: number }
  issues: string[]
}

type AnalysisResult = {
  results: RowResult[]
  summary: { create: number; update: number; skip: number; needsParent: number }
}

type Step = 'upload' | 'mapping' | 'review' | 'done'

const ACTION_LABEL: Record<string, string> = {
  create:       '+ חדש',
  update:       '✏ עדכון',
  skip:         '— ללא שינוי',
  needs_parent: '⚠ חסר הורה',
}
const ACTION_COLOR: Record<string, string> = {
  create:       'bg-emerald-50 text-emerald-700',
  update:       'bg-blue-50 text-blue-700',
  skip:         'bg-gray-50 text-gray-400',
  needs_parent: 'bg-amber-50 text-amber-700',
}

export default function StudentImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [step, setStep]             = useState<Step>('upload')
  const [file, setFile]             = useState<File | null>(null)
  const [parsed, setParsed]         = useState<ParsedData | null>(null)
  const [mapping, setMapping]       = useState<Record<number, FieldName | ''>>({})
  const [analysis, setAnalysis]     = useState<AnalysisResult | null>(null)
  // parentOverrides: csvParentName → parentId (or null = no parent)
  const [parentOverrides, setParentOverrides] = useState<Record<string, string | null>>({})
  const [parentSearch, setParentSearch]       = useState<Record<string, string>>({})
  const [parentOptions, setParentOptions]     = useState<{ id: string; name: string }[]>([])
  const [loadingParents, setLoadingParents]   = useState(false)
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')
  const [doneResult, setDoneResult] = useState<{ created: number; updated: number; skipped: number } | null>(null)

  const postFormData = useCallback(async (action: string, extra?: Record<string, string>) => {
    if (!file) return null
    const fd = new FormData()
    fd.append('file', file)
    fd.append('action', action)
    if (mapping && Object.keys(mapping).length > 0)
      fd.append('fieldMapping', JSON.stringify(mapping))
    if (Object.keys(parentOverrides).length > 0)
      fd.append('parentOverrides', JSON.stringify(parentOverrides))
    for (const [k, v] of Object.entries(extra ?? {})) fd.append(k, v)
    const res = await fetch('/api/students/import', { method: 'POST', body: fd })
    return res.json()
  }, [file, mapping, parentOverrides])

  // Step 1: Parse file to get headers
  const handleFileParse = async (f: File) => {
    setFile(f); setError(''); setLoading(true)
    try {
      const fd = new FormData(); fd.append('file', f); fd.append('action', 'parse')
      const res = await fetch('/api/students/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setParsed(data)
      // Auto-detect mapping
      const autoMap: Record<number, FieldName | ''> = {}
      data.headers.forEach((h: string, i: number) => { autoMap[i] = autoDetect(h) })
      setMapping(autoMap)
      setStep('mapping')
    } catch { setError('שגיאה בקריאת הקובץ') }
    finally { setLoading(false) }
  }

  // Step 2: Analyze
  const handleAnalyze = async () => {
    setError(''); setLoading(true)
    try {
      const data = await postFormData('analyze')
      if (data?.error) { setError(data.error); return }
      setAnalysis(data)
      // Load parents for manual selection
      if (data.summary.needsParent > 0) {
        setLoadingParents(true)
        fetch('/api/parents?limit=1000').then(r => r.json()).then(d => {
          setParentOptions((d.data ?? d ?? []).map((p: { id: string; name?: string; first_name?: string; last_name?: string }) => ({
            id: p.id,
            name: p.name || `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
          })))
        }).finally(() => setLoadingParents(false))
      }
      setStep('review')
    } catch { setError('שגיאה בניתוח') }
    finally { setLoading(false) }
  }

  // Step 3: Execute
  const handleExecute = async () => {
    setError(''); setLoading(true)
    try {
      const data = await postFormData('execute')
      if (data?.error) { setError(data.error); return }
      setDoneResult(data)
      setStep('done')
    } catch { setError('שגיאה בביצוע') }
    finally { setLoading(false) }
  }

  const needsParentRows = analysis?.results.filter(r => r.action === 'needs_parent') ?? []
  const allParentResolved = needsParentRows.every(r => parentOverrides[r.parentNameCsv] !== undefined)

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-3 max-h-[90vh] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0" style={{ background: 'linear-gradient(135deg,#0d1f52,#1a3a7a)' }}>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg">✕</button>
          <span className="text-sm font-bold" style={{ color: '#d4a921' }}>ייבוא תלמידים מאקסל</span>
        </div>

        {/* Step indicator */}
        <div className="flex px-5 pt-3 pb-2 gap-2 shrink-0">
          {(['upload','mapping','review','done'] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-1.5 flex-1">
              <div className={`w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center
                ${step === s ? 'bg-[#1a3a7a] text-white' : i < ['upload','mapping','review','done'].indexOf(step) ? 'bg-emerald-500 text-white' : 'bg-gray-100 text-gray-400'}`}>
                {i + 1}
              </div>
              <span className={`text-xs hidden sm:block ${step === s ? 'text-[#1a3a7a] font-semibold' : 'text-gray-400'}`}>
                {['העלאה','מיפוי','סקירה','סיום'][i]}
              </span>
              {i < 3 && <div className="h-px bg-gray-200 flex-1" />}
            </div>
          ))}
        </div>

        {error && <div className="mx-5 mb-2 px-3 py-2 bg-red-50 border border-red-200 text-red-700 text-xs rounded-lg shrink-0">{error}</div>}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5" dir="rtl">

          {/* ── Step 1: Upload ─────────────────────────────────────────── */}
          {step === 'upload' && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600">העלה קובץ Excel או CSV עם רשימת תלמידים.</p>
              <div
                className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-[#1a3a7a] transition-colors cursor-pointer"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileParse(f) }}
                onClick={() => document.getElementById('student-import-file')?.click()}
              >
                <p className="text-4xl mb-2">📂</p>
                <p className="text-sm font-medium text-gray-700">גרור קובץ לכאן או לחץ לבחירה</p>
                <p className="text-xs text-gray-400 mt-1">.xlsx · .xls · .csv</p>
              </div>
              <input id="student-import-file" type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFileParse(f) }} />
              {loading && <p className="text-xs text-gray-400 text-center">קורא קובץ...</p>}
            </div>
          )}

          {/* ── Step 2: Field Mapping ──────────────────────────────────── */}
          {step === 'mapping' && parsed && (
            <div className="space-y-3">
              <p className="text-xs text-gray-500">{parsed.totalRows} שורות · {parsed.headers.length} עמודות</p>
              <div className="border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">עמודה באקסל</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-600">מיפוי לשדה</th>
                      <th className="px-3 py-2 text-right font-semibold text-gray-500">דוגמאות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsed.headers.map((h, i) => (
                      <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{h || `עמודה ${i+1}`}</td>
                        <td className="px-3 py-2">
                          <select
                            value={mapping[i] ?? ''}
                            onChange={e => setMapping(prev => ({ ...prev, [i]: e.target.value as FieldName | '' }))}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-full bg-white focus:outline-none focus:ring-1 focus:ring-[#1a3a7a]"
                          >
                            {FIELD_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-gray-400 truncate max-w-[140px]">
                          {parsed.sampleRows.slice(0, 3).map(r => r[i]).filter(Boolean).join(' · ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={handleAnalyze}
                disabled={loading || !Object.values(mapping).includes('firstName')}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#1a3a7a] text-white disabled:opacity-40 hover:bg-[#0d1f52] transition-colors"
              >
                {loading ? 'מנתח...' : 'נתח ובדוק →'}
              </button>
            </div>
          )}

          {/* ── Step 3: Review ────────────────────────────────────────── */}
          {step === 'review' && analysis && (
            <div className="space-y-4">
              {/* Summary chips */}
              <div className="flex gap-2 flex-wrap">
                {[
                  { label: `${analysis.summary.create} חדשים`, color: 'bg-emerald-50 text-emerald-700', show: analysis.summary.create > 0 },
                  { label: `${analysis.summary.update} עדכונים`, color: 'bg-blue-50 text-blue-700', show: analysis.summary.update > 0 },
                  { label: `${analysis.summary.skip} ללא שינוי`, color: 'bg-gray-100 text-gray-500', show: analysis.summary.skip > 0 },
                  { label: `${analysis.summary.needsParent} ⚠ חסר הורה`, color: 'bg-amber-50 text-amber-700', show: analysis.summary.needsParent > 0 },
                ].filter(c => c.show).map((c, i) => (
                  <span key={i} className={`text-xs font-semibold px-2.5 py-1 rounded-full ${c.color}`}>{c.label}</span>
                ))}
              </div>

              {/* Needs parent resolution */}
              {needsParentRows.length > 0 && (
                <div className="border border-amber-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-xs font-semibold text-amber-800">
                    ⚠ {needsParentRows.length} תלמידים שלא זוהה להם הורה — יש לקשר ידנית
                    {loadingParents && ' (טוען הורים...)'}
                  </div>
                  <div className="divide-y divide-amber-50 max-h-48 overflow-y-auto">
                    {needsParentRows.map((r, i) => (
                      <div key={i} className="px-4 py-2.5 flex items-center gap-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-800">{r.fullName}</p>
                          <p className="text-xs text-gray-500">הורה באקסל: {r.parentNameCsv}</p>
                        </div>
                        {parentOverrides[r.parentNameCsv] !== undefined ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-emerald-700 font-medium">
                              {parentOverrides[r.parentNameCsv]
                                ? parentOptions.find(p => p.id === parentOverrides[r.parentNameCsv])?.name ?? '✓'
                                : 'ללא הורה'}
                            </span>
                            <button onClick={() => setParentOverrides(prev => { const n = {...prev}; delete n[r.parentNameCsv]; return n })}
                              className="text-[10px] text-red-400 hover:text-red-600">✕</button>
                          </div>
                        ) : (
                          <div className="flex gap-1.5 flex-col items-end">
                            <input
                              type="text" placeholder="חפש הורה..."
                              value={parentSearch[r.parentNameCsv] ?? ''}
                              onChange={e => setParentSearch(prev => ({ ...prev, [r.parentNameCsv]: e.target.value }))}
                              className="text-xs border border-gray-200 rounded-lg px-2 py-1 w-36 focus:outline-none focus:ring-1 focus:ring-amber-400 text-right"
                              dir="rtl"
                            />
                            {parentSearch[r.parentNameCsv] && (
                              <div className="bg-white border border-gray-200 rounded-lg shadow-sm max-h-32 overflow-y-auto w-36 text-right">
                                {parentOptions
                                  .filter(p => p.name.includes(parentSearch[r.parentNameCsv]))
                                  .slice(0, 8)
                                  .map(p => (
                                    <button key={p.id} dir="rtl"
                                      onClick={() => { setParentOverrides(prev => ({ ...prev, [r.parentNameCsv]: p.id })); setParentSearch(prev => ({ ...prev, [r.parentNameCsv]: '' })) }}
                                      className="w-full text-right text-xs px-2.5 py-1.5 hover:bg-indigo-50 truncate block">
                                      {p.name}
                                    </button>
                                  ))}
                                <button
                                  onClick={() => { setParentOverrides(prev => ({ ...prev, [r.parentNameCsv]: null })); setParentSearch(prev => ({ ...prev, [r.parentNameCsv]: '' })) }}
                                  className="w-full text-right text-xs px-2.5 py-1.5 text-gray-400 hover:bg-gray-50 border-t border-gray-100">
                                  יצור ללא הורה
                                </button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Results table (create + update rows) */}
              {analysis.results.filter(r => r.action !== 'skip').length > 0 && (
                <div className="border border-gray-200 rounded-xl overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                        <tr>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600">שם</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600">פעולה</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600">שינויים / פרטים</th>
                          <th className="px-3 py-2 text-right font-semibold text-gray-600">הורה</th>
                        </tr>
                      </thead>
                      <tbody>
                        {analysis.results.filter(r => r.action !== 'skip').map((r, i) => (
                          <tr key={i} className="border-b border-gray-50 hover:bg-gray-50">
                            <td className="px-3 py-2 font-medium text-gray-800">{r.fullName}</td>
                            <td className="px-3 py-2">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${ACTION_COLOR[r.action]}`}>
                                {ACTION_LABEL[r.action]}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-gray-500">
                              {r.changes?.map((c, j) => (
                                <span key={j} className="block">{c.field}: {c.from} → {c.to}</span>
                              ))}
                              {r.action === 'create' && r.className && <span className="text-gray-400">{r.className}</span>}
                              {r.issues.map((issue, j) => <span key={j} className="block text-amber-600">{issue}</span>)}
                            </td>
                            <td className="px-3 py-2 text-gray-500 truncate max-w-[100px]">
                              {r.parentMatch ? (
                                <span className={r.parentMatch.score >= 0.9 ? 'text-emerald-600' : 'text-amber-600'}>
                                  {r.parentMatch.name}
                                  {r.parentMatch.score < 1 && ` (${Math.round(r.parentMatch.score*100)}%)`}
                                </span>
                              ) : r.parentNameCsv ? (
                                <span className="text-gray-300">{r.parentNameCsv}</span>
                              ) : '—'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button onClick={() => setStep('mapping')} className="flex-1 py-2 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors">
                  ← חזור
                </button>
                <button
                  onClick={handleExecute}
                  disabled={loading || (needsParentRows.length > 0 && !allParentResolved)}
                  className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#1a3a7a] text-white disabled:opacity-40 hover:bg-[#0d1f52] transition-colors"
                >
                  {loading ? 'מבצע...' : needsParentRows.length > 0 && !allParentResolved
                    ? `השלם ${needsParentRows.length - Object.keys(parentOverrides).length} הורים חסרים`
                    : 'בצע ייבוא ✓'}
                </button>
              </div>
            </div>
          )}

          {/* ── Step 4: Done ──────────────────────────────────────────── */}
          {step === 'done' && doneResult && (
            <div className="text-center space-y-4 py-4">
              <p className="text-5xl">✅</p>
              <p className="text-lg font-bold text-gray-800">הייבוא הושלם</p>
              <div className="flex justify-center gap-4">
                <div className="bg-emerald-50 rounded-xl px-5 py-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{doneResult.created}</p>
                  <p className="text-xs text-gray-500">נוצרו</p>
                </div>
                <div className="bg-blue-50 rounded-xl px-5 py-3 text-center">
                  <p className="text-2xl font-bold text-blue-700">{doneResult.updated}</p>
                  <p className="text-xs text-gray-500">עודכנו</p>
                </div>
                <div className="bg-gray-50 rounded-xl px-5 py-3 text-center">
                  <p className="text-2xl font-bold text-gray-500">{doneResult.skipped}</p>
                  <p className="text-xs text-gray-500">דולגו</p>
                </div>
              </div>
              <button
                onClick={() => { onDone(); onClose() }}
                className="w-full py-2.5 rounded-xl text-sm font-bold bg-[#1a3a7a] text-white hover:bg-[#0d1f52] transition-colors"
              >
                סגור וחזור לרשימה
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
