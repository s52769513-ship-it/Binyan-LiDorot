'use client'

import { useRef, useState } from 'react'

interface ClassSuggestion {
  key: string; csvClass: string; csvInstitution: string
  framework: string; suggestedDbName: string; dbExists: boolean
}

interface ParsedRow {
  csvIndex: number; lastName: string; firstName: string; name: string
  idNumber: string; birthHeb: string; birthGreg: string
  institution: string; classLetter: string; classKey: string
  transport: string[]; transportCost: number; status: string; gender: string
  fatherPhone: string; motherPhone: string; parentHint: string
  parentId: string | null; parentName: string | null; parentScore: number
  parentCandidates: { id: string; name: string; score: number }[]
}

interface PreviewResult {
  rows: ParsedRow[]
  classSuggestions: ClassSuggestion[]
  stats: { total: number; confident: number; uncertain: number; noMatch: number }
}

type Step = 'upload' | 'mapping' | 'review' | 'confirm' | 'done'

function pct(n: number) { return Math.round(n) + '%' }

export default function StudentImportWizard() {
  const [step, setStep]     = useState<Step>('upload')
  const [file, setFile]     = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [preview, setPreview] = useState<PreviewResult | null>(null)
  const [error, setError]   = useState('')
  const [classMap, setClassMap]   = useState<Record<string, string>>({})
  const [parentOvr, setParentOvr] = useState<Record<string, string | null>>({})
  const [deleteAll, setDeleteAll] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ inserted: number; errors: string[] } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  /* ── Parse / preview ───────────────────────────────────── */
  const handleParse = async () => {
    if (!file) return
    setParsing(true); setError('')
    try {
      const text = await file.text()
      const res  = await fetch('/api/admin/import-students-csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'preview', csvText: text }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `שגיאה ${res.status}`)
      setPreview(data)
      const map: Record<string, string> = {}
      for (const s of data.classSuggestions) map[s.key] = s.suggestedDbName
      setClassMap(map)
      setParentOvr({})
      setStep('mapping')
    } catch (e) { setError(String(e)) }
    finally { setParsing(false) }
  }

  /* ── Import ─────────────────────────────────────────────── */
  const handleImport = async () => {
    if (!preview) return
    const msg = deleteAll
      ? `⚠️ פעולה זו תמחק את כל התלמידים הקיימים ותייבא ${preview.stats.total} חדשים. להמשיך?`
      : `ייבא ${preview.stats.total} תלמידים?`
    if (!confirm(msg)) return
    setImporting(true); setError('')
    try {
      const res = await fetch('/api/admin/import-students-csv', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', rows: preview.rows, classMap, deleteAll, parentOverrides: parentOvr }),
      })
      const data = await res.json()
      if (!res.ok || data.error) throw new Error(data.error ?? `שגיאה ${res.status}`)
      setResult(data); setStep('done')
    } catch (e) { setError(String(e)) }
    finally { setImporting(false) }
  }

  /* ── Review rows: those without auto-matched parent ────── */
  const reviewRows = preview?.rows.filter(r => {
    const ovr = parentOvr[String(r.csvIndex)]
    return r.parentId === null && ovr === undefined
  }) ?? []

  /* ── Shared error banner ────────────────────────────────── */
  const ErrBanner = () => error
    ? <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{error}</div>
    : null

  /* ── Step indicator ─────────────────────────────────────── */
  const STEPS: { id: Step; label: string }[] = [
    { id: 'upload',  label: 'העלאה'   },
    { id: 'mapping', label: 'כיתות'   },
    { id: 'review',  label: 'הורים'   },
    { id: 'confirm', label: 'אישור'   },
  ]
  const stepIdx = STEPS.findIndex(s => s.id === step)

  return (
    <div className="space-y-5" dir="rtl">
      <div>
        <h3 className="font-bold text-gray-800 text-lg mb-1">ייבוא תלמידים — CSV חדש</h3>
        <p className="text-xs text-gray-400">מתאים לפורמט: משפחה, שם תלמיד, שם אב, שם אם, ת"ז, לידה עברי, לידה לועזי, מוסד, כיתה...</p>
      </div>

      {/* Step bar */}
      {step !== 'done' && (
        <div className="flex items-center gap-0">
          {STEPS.map((s, idx) => (
            <div key={s.id} className="flex items-center">
              <div className={`px-3 py-1 text-xs font-semibold rounded-full ${idx <= stepIdx ? 'bg-[#1a3a7a] text-white' : 'bg-gray-100 text-gray-400'}`}>
                {idx + 1}. {s.label}
              </div>
              {idx < STEPS.length - 1 && <div className="w-6 h-px bg-gray-200 mx-1" />}
            </div>
          ))}
        </div>
      )}

      <ErrBanner />

      {/* ── STEP 1: Upload ───────────────────────────────────── */}
      {step === 'upload' && (
        <>
          <div
            className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-[#1a3a7a]/40 transition-colors"
            onClick={() => fileRef.current?.click()}>
            <div className="text-4xl mb-2">📂</div>
            <div className="text-sm font-medium text-gray-700">
              {file ? file.name : 'לחץ לבחירת קובץ CSV'}
            </div>
            {file && <div className="text-xs text-gray-400 mt-1">{(file.size / 1024).toFixed(1)} KB</div>}
            <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setError('') }} />
          </div>
          <button onClick={handleParse} disabled={!file || parsing}
            className="w-full py-3 rounded-xl font-bold text-sm disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
            {parsing ? '⏳ מנתח...' : '🔍 נתח קובץ'}
          </button>
        </>
      )}

      {/* ── STEP 2: Class mapping ────────────────────────────── */}
      {step === 'mapping' && preview && (
        <>
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-sm text-blue-800">
            <b>{preview.stats.total}</b> תלמידים · <b>{preview.classSuggestions.length}</b> כיתות
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">מיפוי כיתות</div>
            <div className="divide-y divide-gray-100">
              {preview.classSuggestions.map(s => (
                <div key={s.key} className="flex items-center gap-3 px-4 py-2.5">
                  {/* CSV side */}
                  <div className="flex-1 text-right">
                    <span className="text-sm font-medium text-gray-700">{s.csvClass}</span>
                    <span className={`mr-2 text-xs px-2 py-0.5 rounded-full ${s.csvInstitution === 'בית חינוך' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>{s.csvInstitution}</span>
                  </div>
                  <span className="text-gray-300 text-sm">→</span>
                  {/* DB side */}
                  <div className="flex-1">
                    <input
                      value={classMap[s.key] ?? ''}
                      onChange={e => setClassMap(prev => ({ ...prev, [s.key]: e.target.value }))}
                      className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 text-right"
                      placeholder="שם כיתה ב-DB"
                    />
                    {!s.dbExists && (
                      <div className="text-[10px] text-amber-600 mt-0.5">תיווצר כיתה חדשה</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('upload')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">← חזור</button>
            <button onClick={() => setStep('review')}
              className="flex-2 px-6 py-2.5 rounded-xl font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
              הבא: הורים ({preview.stats.uncertain + preview.stats.noMatch} לבדיקה) →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 3: Parent review ────────────────────────────── */}
      {step === 'review' && preview && (
        <>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-2">
              <div className="font-bold text-emerald-700 text-lg">{preview.stats.confident}</div>
              <div className="text-gray-500">שויכו אוטומטית</div>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-2">
              <div className="font-bold text-amber-700 text-lg">{reviewRows.length}</div>
              <div className="text-gray-500">ממתינים לבחירה</div>
            </div>
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-2">
              <div className="font-bold text-gray-600 text-lg">
                {Object.values(parentOvr).filter(v => v !== null).length + preview.stats.confident}
              </div>
              <div className="text-gray-500">סה"כ שויכו</div>
            </div>
          </div>

          {reviewRows.length === 0 ? (
            <div className="text-center py-8 text-emerald-600 font-medium">✓ כל התלמידים שויכו להורה</div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase">
                תלמידים ללא שיוך ודאי — בחר הורה או השאר ריק
              </div>
              <div className="divide-y divide-gray-100 max-h-[400px] overflow-y-auto">
                {reviewRows.map(row => (
                  <div key={row.csvIndex} className="px-4 py-3">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${row.institution === 'בית חינוך' ? 'bg-pink-100 text-pink-700' : 'bg-blue-100 text-blue-700'}`}>
                        {row.classLetter}
                      </span>
                      <div className="text-right">
                        <span className="text-sm font-semibold text-gray-800">{row.name}</span>
                        {row.parentHint && (
                          <span className="text-xs text-gray-400 mr-2">({row.parentHint})</span>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {row.parentCandidates.map(c => (
                        <button
                          key={c.id}
                          onClick={() => setParentOvr(prev => ({ ...prev, [String(row.csvIndex)]: c.id }))}
                          className="px-3 py-1 text-xs rounded-full border transition-colors border-gray-200 bg-white text-gray-700 hover:border-[#1a3a7a] hover:text-[#1a3a7a]">
                          {c.name}
                          <span className="mr-1 text-gray-400">{pct(c.score * 100)}</span>
                        </button>
                      ))}
                      <button
                        onClick={() => setParentOvr(prev => ({ ...prev, [String(row.csvIndex)]: null }))}
                        className="px-3 py-1 text-xs rounded-full border border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500">
                        ללא הורה
                      </button>
                      {row.parentCandidates.length === 0 && (
                        <span className="text-xs text-gray-400 py-1">אין הצעות</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button onClick={() => setStep('mapping')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">← חזור</button>
            <button onClick={() => setStep('confirm')}
              className="flex-2 px-6 py-2.5 rounded-xl font-semibold text-sm"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
              הבא: אישור →
            </button>
          </div>
        </>
      )}

      {/* ── STEP 4: Confirm ──────────────────────────────────── */}
      {step === 'confirm' && preview && (
        <>
          <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
            <div className="font-bold text-gray-800 mb-3">סיכום לפני ייבוא</div>
            <Row label="סה״כ תלמידים לייבוא" value={String(preview.stats.total)} />
            <Row label="שויכו להורה" value={
              String(preview.stats.confident + Object.values(parentOvr).filter(v => v !== null && v !== undefined).length)
            } />
            <Row label="ללא שיוך" value={
              String(preview.rows.filter(r => {
                const ovr = parentOvr[String(r.csvIndex)]
                return ovr === null || (r.parentId === null && ovr === undefined)
              }).length)
            } />
            <Row label="כיתות" value={String(preview.classSuggestions.length)} />
          </div>

          <div className="bg-red-50 border border-red-200 rounded-xl p-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <input type="checkbox" checked={deleteAll} onChange={e => setDeleteAll(e.target.checked)}
                className="w-4 h-4 accent-red-600" />
              <span className="text-sm text-red-700 font-semibold">מחק את כל התלמידים הקיימים לפני הייבוא</span>
            </label>
            {deleteAll && (
              <p className="text-xs text-red-500 mt-1 mr-7">כל נתוני התלמידים הנוכחיים יימחקו לצמיתות</p>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={() => setStep('review')} className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">← חזור</button>
            <button onClick={handleImport} disabled={importing}
              className="flex-2 px-6 py-2.5 rounded-xl font-bold text-sm disabled:opacity-50"
              style={{ background: deleteAll ? '#dc2626' : 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#fff' }}>
              {importing ? '⏳ מייבא...' : deleteAll ? '🗑 מחק והייבא' : '📥 ייבא תלמידים'}
            </button>
          </div>
        </>
      )}

      {/* ── DONE ─────────────────────────────────────────────── */}
      {step === 'done' && result && (
        <div className="space-y-4">
          <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl text-center">
            <div className="text-4xl mb-2">✅</div>
            <div className="font-bold text-emerald-800 text-lg">ייבוא הסתיים!</div>
            <div className="text-emerald-700 mt-1">יובאו בהצלחה <b>{result.inserted}</b> תלמידים</div>
          </div>
          {result.errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              <b>שגיאות ({result.errors.length}):</b><br />
              {result.errors.slice(0, 10).map((e, i) => <div key={i}>{e}</div>)}
              {result.errors.length > 10 && <div>+ עוד {result.errors.length - 10}</div>}
            </div>
          )}
          <button
            onClick={() => { setStep('upload'); setFile(null); setPreview(null); setResult(null); setDeleteAll(false) }}
            className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
            ייבוא נוסף
          </button>
        </div>
      )}
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-sm">
      <span className="font-semibold text-gray-700">{value}</span>
      <span className="text-gray-500">{label}</span>
    </div>
  )
}
