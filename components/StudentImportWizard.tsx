'use client'

import { useState, useCallback, useRef, DragEvent } from 'react'

type FieldKey = 'name' | 'father_first_name' | 'id_number' | 'gender' |
  'birth_date_hebrew' | 'birth_date_gregorian' | 'class' | 'status' |
  'transportation' | 'health_fund' | 'previous_school' | 'skip'

const FIELD_LABELS: Record<FieldKey, string> = {
  name: 'שם תלמיד',
  father_first_name: 'שם האב (לזיהוי)',
  id_number: 'ת"ז',
  gender: 'מגדר',
  birth_date_hebrew: 'תאריך לידה עברי',
  birth_date_gregorian: 'תאריך לידה לועזי',
  class: 'כיתה',
  status: 'סטטוס',
  transportation: 'הסעות',
  health_fund: 'קופת חולים',
  previous_school: 'מוסד קודם',
  skip: '— דלג —',
}

const DEFAULT_MAPPING: Record<number, FieldKey> = {
  0: 'name', 2: 'father_first_name', 4: 'gender',
  5: 'birth_date_hebrew', 6: 'birth_date_gregorian', 7: 'class',
  18: 'status', 21: 'transportation', 27: 'health_fund', 28: 'previous_school',
}

type MatchStatus = 'matched' | 'warning' | 'not_found'

interface StudentLookup {
  studentId: string
  studentName: string
  parentId: string
  parentName: string
  parentFirstName: string
}

interface RowResult {
  rowIdx: number
  studentName: string
  fatherFirstName: string
  updates: Record<string, unknown>
  status: MatchStatus
  studentId?: string
  parentName?: string
  manualStudentId?: string
  skipped?: boolean
}

type Step = 'upload' | 'mapping' | 'match' | 'result'

function colLetter(idx: number): string {
  let s = ''
  let n = idx
  while (n >= 0) {
    s = String.fromCharCode(65 + (n % 26)) + s
    n = Math.floor(n / 26) - 1
  }
  return s
}

function parseCSV(text: string): string[][] {
  const rows: string[][] = []
  const lines = text.split(/\r?\n/)
  for (const line of lines) {
    if (!line.trim()) continue
    const cells: string[] = []
    let cur = ''
    let inQ = false
    for (let i = 0; i < line.length; i++) {
      const ch = line[i]
      if (ch === '"') {
        if (inQ && line[i + 1] === '"') { cur += '"'; i++ }
        else inQ = !inQ
      } else if (ch === ',' && !inQ) {
        cells.push(cur)
        cur = ''
      } else {
        cur += ch
      }
    }
    cells.push(cur)
    rows.push(cells)
  }
  return rows
}

function calcTransportCost(transport: string[]): number {
  if (!transport.includes('הלוך')) return 0
  const hasReturn = transport.includes('חזור שעה 1') || transport.includes('חזור שעה 4')
  return hasReturn ? 130 : 65
}

export default function StudentImportWizard() {
  const [step, setStep] = useState<Step>('upload')
  const [isDragging, setIsDragging] = useState(false)
  const [csvData, setCsvData] = useState<string[][]>([])
  const [headerRow, setHeaderRow] = useState<string[]>([])
  const [mapping, setMapping] = useState<Record<number, FieldKey>>({})
  const [rows, setRows] = useState<RowResult[]>([])
  const [allStudents, setAllStudents] = useState<StudentLookup[]>([])
  const [loadingMatch, setLoadingMatch] = useState(false)
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({})
  const [importResult, setImportResult] = useState<{ updated: number; errors: string[] } | null>(null)
  const [importing, setImporting] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = e.target?.result as string
      // Try different encodings
      const decoded = text
      const parsed = parseCSV(decoded)
      if (parsed.length === 0) return
      const header = parsed[0]
      const data = parsed.slice(1).filter(r => r.some(c => c.trim()))
      setHeaderRow(header)
      setCsvData(data)
      // Apply default mapping
      const m: Record<number, FieldKey> = {}
      for (let i = 0; i < header.length; i++) {
        m[i] = DEFAULT_MAPPING[i] ?? 'skip'
      }
      setMapping(m)
      setStep('mapping')
    }
    reader.readAsText(file, 'windows-1255')
  }, [])

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }, [handleFile])

  const onDragOver = (e: DragEvent<HTMLDivElement>) => { e.preventDefault(); setIsDragging(true) }
  const onDragLeave = () => setIsDragging(false)

  // Step 3: run matching
  const runMatching = useCallback(async () => {
    setLoadingMatch(true)
    try {
      const res = await fetch('/api/admin/students-for-matching')
      const students: StudentLookup[] = await res.json()
      setAllStudents(students)

      // Find which col indices are mapped to which field
      const nameCol = Object.entries(mapping).find(([, v]) => v === 'name')?.[0]
      const fatherCol = Object.entries(mapping).find(([, v]) => v === 'father_first_name')?.[0]

      const nameColIdx = nameCol !== undefined ? parseInt(nameCol) : -1
      const fatherColIdx = fatherCol !== undefined ? parseInt(fatherCol) : -1

      // Build a map from studentName -> StudentLookup[]
      const byName = new Map<string, StudentLookup[]>()
      for (const s of students) {
        const key = s.studentName.trim()
        if (!byName.has(key)) byName.set(key, [])
        byName.get(key)!.push(s)
      }

      // Build updates from mapping
      const buildUpdates = (row: string[]): Record<string, unknown> => {
        const updates: Record<string, unknown> = {}
        for (const [colIdxStr, field] of Object.entries(mapping)) {
          const colIdx = parseInt(colIdxStr)
          const val = row[colIdx]?.trim() ?? ''
          if (!val || field === 'skip') continue
          if (field === 'name') continue // don't update name
          if (field === 'father_first_name') continue // used for matching only
          if (field === 'class') { updates['class_name'] = val; continue }
          if (field === 'transportation') {
            // transportation might be multi-value, handle comma-separated
            const parts = val.split(',').map(s => s.trim()).filter(Boolean)
            updates['transportation'] = parts
            updates['transportation_cost'] = calcTransportCost(parts)
            continue
          }
          // Map field to DB column — all remaining fields use their own name as the column
          updates[field as string] = val
        }
        return updates
      }

      const results: RowResult[] = csvData.map((row, rowIdx) => {
        const studentName = nameColIdx >= 0 ? (row[nameColIdx]?.trim() ?? '') : ''
        const fatherFirstName = fatherColIdx >= 0 ? (row[fatherColIdx]?.trim() ?? '') : ''
        const updates = buildUpdates(row)

        const candidates = byName.get(studentName) ?? []
        let status: MatchStatus = 'not_found'
        let studentId: string | undefined
        let parentName: string | undefined

        if (candidates.length === 1) {
          const c = candidates[0]
          if (!fatherFirstName || c.parentFirstName === fatherFirstName) {
            status = 'matched'
          } else {
            status = 'warning'
          }
          studentId = c.studentId
          parentName = c.parentName
        } else if (candidates.length > 1) {
          const match = candidates.find(c => c.parentFirstName === fatherFirstName)
          if (match) {
            status = 'matched'
            studentId = match.studentId
            parentName = match.parentName
          } else {
            status = 'not_found'
          }
        }

        return { rowIdx, studentName, fatherFirstName, updates, status, studentId, parentName }
      })

      setRows(results)
    } finally {
      setLoadingMatch(false)
    }
  }, [csvData, mapping])

  const goToMatch = useCallback(() => {
    // Validate name is mapped
    const hasName = Object.values(mapping).includes('name')
    if (!hasName) {
      alert('יש למפות לפחות את עמודת שם התלמיד')
      return
    }
    setStep('match')
    runMatching()
  }, [mapping, runMatching])

  const doImport = useCallback(async () => {
    setImporting(true)
    try {
      const toImport = rows.filter(r => !r.skipped && (r.studentId || r.manualStudentId) && r.status !== 'not_found')
      const payload = toImport.map(r => ({
        studentId: r.manualStudentId ?? r.studentId!,
        updates: r.updates,
      }))
      const res = await fetch('/api/admin/import-students-json', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: payload }),
      })
      const result = await res.json()
      setImportResult(result)
      setStep('result')
    } finally {
      setImporting(false)
    }
  }, [rows])

  const resetWizard = () => {
    setStep('upload')
    setCsvData([])
    setHeaderRow([])
    setMapping({})
    setRows([])
    setAllStudents([])
    setImportResult(null)
    setSearchTerms({})
  }

  // Non-empty column indices
  const nonEmptyCols = headerRow.map((_, i) => i).filter(i =>
    csvData.some(r => (r[i]?.trim() ?? '') !== '')
  )

  const matchedCount = rows.filter(r => r.status === 'matched' && !r.skipped).length
  const warningCount = rows.filter(r => r.status === 'warning' && !r.skipped).length
  const notFoundCount = rows.filter(r => r.status === 'not_found' && !r.skipped).length
  const importableCount = rows.filter(r => !r.skipped && (r.studentId || r.manualStudentId)).length

  const STEPS: { key: Step; label: string }[] = [
    { key: 'upload', label: 'העלאת קובץ' },
    { key: 'mapping', label: 'מיפוי עמודות' },
    { key: 'match', label: 'זיהוי תלמידים' },
    { key: 'result', label: 'תוצאות' },
  ]
  const stepIdx = STEPS.findIndex(s => s.key === step)

  return (
    <div dir="rtl" className="max-w-5xl mx-auto space-y-6">
      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEPS.map((s, i) => (
          <div key={s.key} className="flex items-center flex-1">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium transition-colors
              ${i === stepIdx ? 'bg-[#1a3a7a] text-white' : i < stepIdx ? 'bg-blue-100 text-[#1a3a7a]' : 'bg-gray-100 text-gray-400'}`}>
              <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${i === stepIdx ? 'bg-white text-[#1a3a7a]' : i < stepIdx ? 'bg-[#1a3a7a] text-white' : 'bg-gray-300 text-gray-500'}`}>
                {i + 1}
              </span>
              {s.label}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 mx-1 ${i < stepIdx ? 'bg-[#1a3a7a]' : 'bg-gray-200'}`} />}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 'upload' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8">
          <h2 className="text-xl font-bold text-[#1a3a7a] mb-6">העלאת קובץ CSV</h2>
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors
              ${isDragging ? 'border-[#1a3a7a] bg-blue-50' : 'border-gray-300 hover:border-[#1a3a7a] hover:bg-gray-50'}`}
          >
            <div className="text-5xl mb-4">📂</div>
            <p className="text-lg font-medium text-gray-700 mb-2">גרור קובץ CSV לכאן</p>
            <p className="text-sm text-gray-500 mb-4">או לחץ לבחירת קובץ</p>
            <button
              type="button"
              className="px-6 py-2 bg-[#1a3a7a] text-white rounded-lg text-sm font-medium hover:bg-[#15306a]"
              onClick={(e) => { e.stopPropagation(); fileRef.current?.click() }}
            >
              בחר קובץ
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
            />
          </div>
          {csvData.length > 0 && (
            <div className="mt-4 p-4 bg-blue-50 rounded-lg">
              <p className="text-sm text-[#1a3a7a] font-medium">
                נטען: {csvData.length} שורות נתונים, {headerRow.length} עמודות
              </p>
              <div className="mt-3 overflow-x-auto">
                <table className="text-xs border-collapse">
                  <tbody>
                    {csvData.slice(0, 5).map((row, i) => (
                      <tr key={i} className="border-b border-blue-200">
                        {row.slice(0, 10).map((cell, j) => (
                          <td key={j} className="px-2 py-1 border border-blue-200 max-w-[120px] truncate">{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => setStep('mapping')}
                className="mt-4 px-6 py-2 bg-[#1a3a7a] text-white rounded-lg text-sm font-medium hover:bg-[#15306a]"
              >
                המשך למיפוי ←
              </button>
            </div>
          )}
        </div>
      )}

      {/* Step 2: Mapping */}
      {step === 'mapping' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-[#1a3a7a] mb-2">מיפוי עמודות</h2>
          <p className="text-sm text-gray-500 mb-6">בחר לכל עמודה את השדה המתאים בבסיס הנתונים</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-right py-2 px-3 text-gray-500 font-medium w-16">עמודה</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">כותרת</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">דוגמה</th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium w-52">ממופה ל</th>
                </tr>
              </thead>
              <tbody>
                {nonEmptyCols.map(i => {
                  const samples = csvData
                    .map(r => r[i]?.trim() ?? '')
                    .filter(Boolean)
                    .slice(0, 3)
                  return (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="py-2 px-3 font-mono text-gray-400 text-xs">{colLetter(i)}</td>
                      <td className="py-2 px-3 text-gray-600 text-xs truncate max-w-[150px]">{headerRow[i] ?? ''}</td>
                      <td className="py-2 px-3 text-gray-500 text-xs">
                        {samples.join(' | ')}
                      </td>
                      <td className="py-2 px-3">
                        <select
                          value={mapping[i] ?? 'skip'}
                          onChange={e => setMapping(prev => ({ ...prev, [i]: e.target.value as FieldKey }))}
                          className="w-full text-sm border border-gray-200 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/20 focus:border-[#1a3a7a]"
                        >
                          {(Object.entries(FIELD_LABELS) as [FieldKey, string][]).map(([k, v]) => (
                            <option key={k} value={k}>{v}</option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between mt-6">
            <button
              onClick={() => setStep('upload')}
              className="px-5 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
            >
              → חזור
            </button>
            <button
              onClick={goToMatch}
              className="px-6 py-2 bg-[#1a3a7a] text-white rounded-lg text-sm font-medium hover:bg-[#15306a]"
            >
              המשך לזיהוי ←
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Match */}
      {step === 'match' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-[#1a3a7a] mb-4">זיהוי תלמידים</h2>

          {loadingMatch ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#1a3a7a]" />
              <span className="mr-3 text-gray-500">מזהה תלמידים...</span>
            </div>
          ) : (
            <>
              {/* Summary */}
              <div className="flex gap-4 mb-6">
                <div className="flex-1 bg-green-50 border border-green-200 rounded-lg px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-green-700">{matchedCount}</div>
                  <div className="text-xs text-green-600 mt-1">זוהו אוטומטית</div>
                </div>
                <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-lg px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-yellow-700">{warningCount}</div>
                  <div className="text-xs text-yellow-600 mt-1">⚠ אזהרה</div>
                </div>
                <div className="flex-1 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center">
                  <div className="text-2xl font-bold text-red-700">{notFoundCount}</div>
                  <div className="text-xs text-red-600 mt-1">לא נמצאו</div>
                </div>
              </div>

              {/* Rows */}
              <div className="space-y-2 max-h-[500px] overflow-y-auto">
                {rows.map((row) => {
                  if (row.skipped) return (
                    <div key={row.rowIdx} className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg text-sm text-gray-400">
                      <span>{row.studentName}</span>
                      <button onClick={() => setRows(prev => prev.map(r => r.rowIdx === row.rowIdx ? { ...r, skipped: false } : r))}
                        className="text-xs text-blue-500 hover:underline">בטל דילוג</button>
                    </div>
                  )

                  if (row.status === 'matched') return (
                    <div key={row.rowIdx} className="flex items-center justify-between py-2 px-3 bg-green-50 rounded-lg border border-green-100">
                      <div className="flex items-center gap-3">
                        <span className="text-green-500 text-lg">✓</span>
                        <div>
                          <span className="font-medium text-sm text-gray-800">{row.studentName}</span>
                          <span className="text-gray-400 text-xs mr-2">← {row.parentName}</span>
                        </div>
                      </div>
                    </div>
                  )

                  if (row.status === 'warning') return (
                    <div key={row.rowIdx} className="py-3 px-4 bg-yellow-50 rounded-lg border border-yellow-200">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-yellow-500">⚠</span>
                            <span className="font-medium text-sm">{row.studentName}</span>
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            אבא מהקובץ: <strong>{row.fatherFirstName}</strong> | נמצא: {row.parentName}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button
                            onClick={() => setRows(prev => prev.map(r => r.rowIdx === row.rowIdx ? { ...r, status: 'matched' } : r))}
                            className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700"
                          >אשר התאמה</button>
                          <button
                            onClick={() => setRows(prev => prev.map(r => r.rowIdx === row.rowIdx ? { ...r, status: 'not_found', studentId: undefined } : r))}
                            className="px-3 py-1 border border-gray-300 text-gray-600 rounded text-xs hover:bg-gray-50"
                          >בחר ידנית</button>
                        </div>
                      </div>
                    </div>
                  )

                  // not_found
                  const term = searchTerms[row.rowIdx] ?? ''
                  const filtered = term.length >= 1
                    ? allStudents.filter(s =>
                        s.studentName.includes(term) ||
                        s.parentName.includes(term) ||
                        s.parentFirstName.includes(term)
                      ).slice(0, 8)
                    : []

                  return (
                    <div key={row.rowIdx} className="py-3 px-4 bg-red-50 rounded-lg border border-red-200">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-red-400">✗</span>
                          <span className="font-medium text-sm">{row.studentName}</span>
                          {row.fatherFirstName && <span className="text-xs text-gray-500">({row.fatherFirstName})</span>}
                        </div>
                        <button
                          onClick={() => setRows(prev => prev.map(r => r.rowIdx === row.rowIdx ? { ...r, skipped: true } : r))}
                          className="text-xs text-gray-400 hover:text-gray-600 border border-gray-300 rounded px-2 py-1"
                        >דלג</button>
                      </div>
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="חפש תלמיד..."
                          value={term}
                          onChange={e => setSearchTerms(prev => ({ ...prev, [row.rowIdx]: e.target.value }))}
                          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/20 focus:border-[#1a3a7a]"
                        />
                        {filtered.length > 0 && (
                          <div className="absolute z-10 top-full right-0 left-0 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                            {filtered.map(s => (
                              <button
                                key={s.studentId}
                                className="w-full text-right px-3 py-2 hover:bg-blue-50 text-sm border-b border-gray-100 last:border-0"
                                onClick={() => {
                                  setRows(prev => prev.map(r => r.rowIdx === row.rowIdx
                                    ? { ...r, manualStudentId: s.studentId, status: 'matched', parentName: s.parentName }
                                    : r))
                                  setSearchTerms(prev => ({ ...prev, [row.rowIdx]: '' }))
                                }}
                              >
                                <span className="font-medium">{s.studentName}</span>
                                <span className="text-gray-400 text-xs mr-2">{s.parentName}</span>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>

              <div className="flex justify-between mt-6">
                <button
                  onClick={() => setStep('mapping')}
                  className="px-5 py-2 border border-gray-300 text-gray-600 rounded-lg text-sm hover:bg-gray-50"
                >
                  → חזור
                </button>
                <button
                  onClick={doImport}
                  disabled={importing || importableCount === 0}
                  className="px-6 py-2 bg-[#1a3a7a] text-white rounded-lg text-sm font-medium hover:bg-[#15306a] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? 'מייבא...' : `ייבא ${importableCount} תלמידים ←`}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Step 4: Result */}
      {step === 'result' && importResult && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center">
          <div className="text-5xl mb-4">🎉</div>
          <h2 className="text-xl font-bold text-[#1a3a7a] mb-6">הייבוא הושלם</h2>
          <div className="inline-flex gap-8 justify-center mb-6">
            <div className="text-center">
              <div className="text-4xl font-bold text-green-600">{importResult.updated}</div>
              <div className="text-sm text-gray-500 mt-1">✓ עודכנו</div>
            </div>
            {importResult.errors.length > 0 && (
              <div className="text-center">
                <div className="text-4xl font-bold text-red-500">{importResult.errors.length}</div>
                <div className="text-sm text-gray-500 mt-1">✗ שגיאות</div>
              </div>
            )}
          </div>
          {importResult.errors.length > 0 && (
            <div className="text-right bg-red-50 border border-red-200 rounded-lg p-4 mb-6 max-h-40 overflow-y-auto">
              <p className="font-medium text-red-700 mb-2">שגיאות:</p>
              {importResult.errors.map((e, i) => (
                <p key={i} className="text-sm text-red-600">{e}</p>
              ))}
            </div>
          )}
          <button
            onClick={resetWizard}
            className="px-6 py-2 bg-[#1a3a7a] text-white rounded-lg text-sm font-medium hover:bg-[#15306a]"
          >
            ייבוא נוסף
          </button>
        </div>
      )}
    </div>
  )
}
