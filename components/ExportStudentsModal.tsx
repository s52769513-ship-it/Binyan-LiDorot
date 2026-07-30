'use client'

import { useState } from 'react'
import { exportRowsToExcel, exportSheetsToExcel, type ExportRow } from '@/lib/exportUtils'

type Scope     = 'students' | 'registrants' | 'alumni'
type Framework = 'all' | 'tt' | 'bs'
type Details   = 'names' | 'full'

const SCOPE_LABEL: Record<Scope, string> = {
  students:    'תלמידים',
  registrants: 'נרשמים',
  alumni:      'בוגרים',
}

const FRAMEWORK_LABEL: Record<Framework, string> = {
  all: 'הכל',
  tt:  'תלמוד תורה',
  bs:  'בית חינוך',
}

export default function ExportStudentsModal({
  defaultScope = 'students', onClose,
}: {
  defaultScope?: Scope
  onClose: () => void
}) {
  const [scope, setScope]         = useState<Scope>(defaultScope)
  const [framework, setFramework] = useState<Framework>('all')
  const [details, setDetails]     = useState<Details>('names')
  const [byClass, setByClass]     = useState(true)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState('')

  const run = async () => {
    setBusy(true); setError('')
    try {
      const qs = new URLSearchParams({ scope, framework, details })
      const res  = await fetch(`/api/students/export?${qs}`)
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      const rows: ExportRow[] = data.data ?? []
      if (rows.length === 0) { setError('אין נתונים לייצוא לפי הבחירה'); return }

      const stamp = new Date().toISOString().slice(0, 10)
      const fwPart = framework === 'all' ? '' : `-${FRAMEWORK_LABEL[framework]}`
      const name = `${SCOPE_LABEL[scope]}${fwPart}-${stamp}.xlsx`

      if (byClass) {
        // גיליון נפרד לכל כיתה, לפי סדר א׳-ב׳
        const groups = new Map<string, ExportRow[]>()
        for (const r of rows) {
          const cls = String(r['כיתה'] || 'ללא כיתה')
          if (!groups.has(cls)) groups.set(cls, [])
          groups.get(cls)!.push(r)
        }
        const sheets = [...groups.entries()]
          .sort((a, b) => a[0].localeCompare(b[0], 'he'))
          .map(([name, rows]) => ({ name, rows }))
        const ok = await exportSheetsToExcel(sheets, name)
        if (!ok) { setError('אין נתונים לייצוא לפי הבחירה'); return }
      } else {
        await exportRowsToExcel(rows, name, SCOPE_LABEL[scope])
      }
      onClose()
    } catch {
      setError('שגיאה בהורדת הקובץ')
    } finally { setBusy(false) }
  }

  const Choice = <T extends string>(
    { value, current, onPick, children }:
    { value: T; current: T; onPick: (v: T) => void; children: React.ReactNode },
  ) => (
    <button type="button" onClick={() => onPick(value)}
      className={`px-3 py-2 rounded-lg text-sm font-medium border transition-colors ${
        current === value
          ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]'
          : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'
      }`}>
      {children}
    </button>
  )

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden" dir="rtl">
        <div className="px-5 py-4 flex items-center justify-between"
          style={{ background: 'linear-gradient(90deg, #0d1f52, #1a3a7a)' }}>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
          <h2 className="text-lg font-bold text-white">📊 הורדת אקסל</h2>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">מה להוריד</p>
            <div className="flex flex-wrap gap-2">
              {(['students','registrants','alumni'] as Scope[]).map(s => (
                <Choice key={s} value={s} current={scope} onPick={setScope}>{SCOPE_LABEL[s]}</Choice>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">אגף</p>
            <div className="flex flex-wrap gap-2">
              {(['all','tt','bs'] as Framework[]).map(f => (
                <Choice key={f} value={f} current={framework} onPick={setFramework}>{FRAMEWORK_LABEL[f]}</Choice>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 mb-1.5">רמת פירוט</p>
            <div className="flex flex-wrap gap-2">
              <Choice value="names" current={details} onPick={setDetails}>שמות בלבד</Choice>
              <Choice value="full"  current={details} onPick={setDetails}>כל הפרטים</Choice>
            </div>
            <p className="text-[11px] text-gray-400 mt-1.5">
              {details === 'full'
                ? 'מ.ז. · תאריך לידה · שם האב · שם האם · טלפון האב · טלפון האם · כתובת · עיר'
                : 'שם · כיתה · אגף'}
            </p>
          </div>

          <label className="flex items-center gap-2 cursor-pointer pt-1">
            <input type="checkbox" checked={byClass} onChange={e => setByClass(e.target.checked)}
              className="w-4 h-4 accent-[#1a3a7a]" />
            <span className="text-sm text-gray-700">מחולק לפי כיתות — גיליון נפרד לכל כיתה</span>
          </label>

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <button onClick={run} disabled={busy}
            className="w-full py-3 rounded-xl font-bold text-base disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
            {busy ? 'מכין קובץ...' : '⬇ הורד אקסל'}
          </button>
        </div>
      </div>
    </div>
  )
}
