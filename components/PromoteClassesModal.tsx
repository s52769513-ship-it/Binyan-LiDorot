'use client'

import { useMemo, useState } from 'react'
import { nextClassName, isFinalGrade } from '@/lib/classPromotion'

export interface PromoteStudent {
  id: string
  name: string
  className: string
  framework: string
  status: string
}

const GRADUATE_STATUS = 'סיים לימודים'
/** ערך מיוחד ב-select שמשמעו "להשאיר בכיתה הנוכחית". */
const STAY = '__STAY__'
/** ערך מיוחד שמשמעו "סיום לימודים" (לא עולה כיתה). */
const GRADUATE = '__GRADUATE__'

export default function PromoteClassesModal({
  students, onClose, onDone,
}: {
  students: PromoteStudent[]
  onClose: () => void
  onDone: () => void
}) {
  // כיתות פעילות בלבד — תלמידים שכבר סיימו לא משתתפים בהעלאה.
  const active = useMemo(
    () => students.filter(s => s.status !== GRADUATE_STATUS && (s.className ?? '').trim()),
    [students],
  )

  const classNames = useMemo(() => {
    const set = new Set(active.map(s => s.className))
    return [...set].sort((a, b) => a.localeCompare(b, 'he'))
  }, [active])

  const allClassNames = useMemo(() => {
    const set = new Set(students.map(s => s.className).filter(Boolean))
    for (const c of classNames) { const n = nextClassName(c); if (n) set.add(n) }
    return [...set].sort((a, b) => a.localeCompare(b, 'he'))
  }, [students, classNames])

  // מסגרת לכל שם כיתה — קודם לפי התלמידים בפועל, ואם זו כיתת יעד חדשה שעוד אין
  // בה תלמידים, לפי השם עצמו. משמש כדי להציע רק כיתות של אותה מסגרת.
  const frameworkOfClass = useMemo(() => {
    const m = new Map<string, string>()
    for (const s of students) {
      if (s.className && s.framework && !m.has(s.className)) m.set(s.className, s.framework)
    }
    const detect = (n: string) =>
      n.includes('תלמוד תורה') ? 'תלמוד תורה' : n.includes('בית חינוך') ? 'בית חינוך לבנות' : ''
    for (const c of allClassNames) {
      if (!m.get(c)) {
        // כיתת יעד שנגזרה מכיתה קיימת יורשת את המסגרת שלה (השם נשמר, רק האות משתנה)
        const src = classNames.find(sc => nextClassName(sc) === c)
        m.set(c, (src && m.get(src)) || detect(c))
      }
    }
    return m
  }, [students, allClassNames, classNames])

  /** כיתות שמותר לבחור עבור מסגרת נתונה — בית חינוך מול בית חינוך בלבד, וכן תלמוד תורה. */
  const optionsFor = (framework: string) =>
    !framework ? allClassNames : allClassNames.filter(c => {
      const f = frameworkOfClass.get(c) ?? ''
      return f === '' || f === framework
    })

  /** יעד ברירת המחדל לכל כיתה: הכיתה הבאה, או סיום לימודים בכיתה האחרונה. */
  const defaultTargets = useMemo(() => {
    const m: Record<string, string> = {}
    for (const c of classNames) {
      if (isFinalGrade(c)) m[c] = GRADUATE
      else m[c] = nextClassName(c) ?? STAY
    }
    return m
  }, [classNames])

  const [targets, setTargets] = useState<Record<string, string>>(defaultTargets)
  // חריגים ברמת תלמיד: studentId → יעד (שם כיתה / STAY / GRADUATE)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const frameworkOf = (s: PromoteStudent) => s.framework || ''

  /** היעד הסופי של תלמיד — חריג אישי גובר על יעד הכיתה. */
  const targetFor = (s: PromoteStudent): string =>
    overrides[s.id] ?? targets[s.className] ?? STAY

  const labelFor = (t: string, current: string) =>
    t === STAY ? `נשאר ב-${current}` : t === GRADUATE ? GRADUATE_STATUS : t

  const searchResults = useMemo(() => {
    const q = search.trim()
    if (!q) return []
    return active.filter(s => s.name.includes(q)).slice(0, 30)
  }, [search, active])

  const summary = useMemo(() => {
    let promoted = 0, staying = 0, graduating = 0
    for (const s of active) {
      const t = targetFor(s)
      if (t === STAY) staying++
      else if (t === GRADUATE) graduating++
      else promoted++
    }
    return { promoted, staying, graduating, total: active.length }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, targets, overrides])

  const apply = async () => {
    const moves = active.map(s => {
      const t = targetFor(s)
      if (t === STAY) return null
      if (t === GRADUATE) return { studentId: s.id, status: GRADUATE_STATUS }
      return { studentId: s.id, className: t }
    }).filter(Boolean)

    if (moves.length === 0) { setError('אין שינויים להחלה'); return }
    if (!confirm(`להחיל את ההעלאה?\n${summary.promoted} עולים כיתה · ${summary.graduating} מסיימים · ${summary.staying} נשארים`)) return

    setSaving(true); setError('')
    try {
      const res = await fetch('/api/students/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ moves }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      alert(`✓ עודכנו ${data.updated} תלמידים`)
      onDone()
    } catch { setError('שגיאת רשת') }
    finally { setSaving(false) }
  }

  /**
   * restrict=true (ההעברה הכללית, ברמת כיתה): רק כיתות מאותה מסגרת — כדי שלא
   * תיווצר טעות של העברת כיתה שלמה מבית חינוך לתלמוד תורה.
   * restrict=false (חריג ברמת תלמיד): כל הכיתות, כולל מסגרת אחרת — העברה פרטנית
   * כזו לגיטימית, ומסומנת למשתמש.
   */
  const ClassSelect = ({ value, current, framework, restrict, onChange }: {
    value: string; current: string; framework: string; restrict: boolean; onChange: (v: string) => void
  }) => {
    const opts = restrict ? optionsFor(framework) : allClassNames
    return (
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 max-w-[190px]"
      >
        <option value={STAY}>נשאר ב-{current}</option>
        <option value={GRADUATE}>🎓 {GRADUATE_STATUS}</option>
        {opts.map(c => {
          const f = frameworkOfClass.get(c) ?? ''
          const crossing = !restrict && !!framework && !!f && f !== framework
          return <option key={c} value={c}>← {c}{crossing ? '  ⚠ מסגרת אחרת' : ''}</option>
        })}
      </select>
    )
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden" dir="rtl">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ background: 'linear-gradient(90deg, #0d1f52, #1a3a7a)' }}>
          <button onClick={onClose} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
          <h2 className="text-lg font-bold text-white">⬆️ העלאת כיתה</h2>
        </div>

        {/* Summary */}
        <div className="px-5 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-2 text-xs shrink-0">
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-semibold">{summary.promoted} עולים כיתה</span>
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">{summary.staying} נשארים</span>
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200 font-semibold">{summary.graduating} מסיימים</span>
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">סה"כ {summary.total}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          {/* ── Per-class mapping ── */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-2">מאיזו כיתה לאיזו כיתה</h3>
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              {classNames.map((c, i) => {
                const list = active.filter(s => s.className === c)
                const overridden = list.filter(s => overrides[s.id] != null).length
                return (
                  <div key={c} className={`flex items-center justify-between gap-3 px-4 py-2.5 ${i % 2 ? 'bg-gray-50/60' : 'bg-white'}`}>
                    <ClassSelect
                      value={targets[c] ?? STAY}
                      current={c}
                      framework={frameworkOfClass.get(c) ?? frameworkOf(list[0] ?? ({} as PromoteStudent))}
                      restrict
                      onChange={v => setTargets(prev => ({ ...prev, [c]: v }))}
                    />
                    <div className="flex items-center gap-2 text-right">
                      {overridden > 0 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          {overridden} חריגים
                        </span>
                      )}
                      <span className="text-[11px] text-gray-400">{list.length} תלמידים</span>
                      <span className="font-semibold text-gray-800 text-sm min-w-[110px]">{c}</span>
                      {list[0] && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${frameworkOf(list[0])==='בית חינוך לבנות' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>
                          {frameworkOf(list[0]) || '—'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {classNames.length === 0 && <p className="text-center text-sm text-gray-400 py-4">אין כיתות פעילות</p>}
            </div>
          </div>

          {/* ── Per-student exceptions ── */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 mb-1">חריגים — תלמיד שנשאר או עובר לכיתה אחרת</h3>
            <p className="text-xs text-gray-400 mb-2">הקלד שם תלמיד כדי לבחור לו כיתה שונה מברירת המחדל של הכיתה</p>
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש תלמיד לפי שם..."
              className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
            />
            {searchResults.length > 0 && (
              <div className="mt-2 border border-gray-200 rounded-xl divide-y divide-gray-100 max-h-64 overflow-y-auto">
                {searchResults.map(s => (
                  <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
                    <ClassSelect
                      value={targetFor(s)}
                      current={s.className}
                      framework={frameworkOf(s) || (frameworkOfClass.get(s.className) ?? '')}
                      restrict={false}
                      onChange={v => setOverrides(prev => ({ ...prev, [s.id]: v }))}
                    />
                    <div className="text-right">
                      <p className="text-sm font-medium text-gray-800">{s.name}</p>
                      <p className="text-[11px] text-gray-400">{s.className}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(overrides).length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-semibold text-gray-500 mb-1">חריגים שנקבעו ({Object.keys(overrides).length})</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(overrides).map(([sid, t]) => {
                    const s = active.find(x => x.id === sid)
                    if (!s) return null
                    return (
                      <span key={sid} className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                        <button
                          onClick={() => setOverrides(prev => { const n = { ...prev }; delete n[sid]; return n })}
                          className="text-amber-500 hover:text-amber-800">✕</button>
                        {s.name}: {labelFor(t, s.className)}
                      </span>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-200 flex items-center gap-3 shrink-0 bg-white">
          <button
            onClick={apply}
            disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-white font-bold text-sm disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}
          >
            {saving ? 'מחיל...' : `החל העלאת כיתה (${summary.promoted + summary.graduating} תלמידים)`}
          </button>
          <button onClick={onClose} className="px-4 py-2.5 rounded-xl border border-gray-300 text-sm hover:bg-gray-50">
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
