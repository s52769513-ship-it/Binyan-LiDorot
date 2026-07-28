'use client'

import { useMemo, useState } from 'react'
import { PENDING_STATUS } from '@/lib/registration'
import RegisterStudentForm from '@/components/RegisterStudentForm'

export interface Registrant {
  id: string
  name: string
  className: string
  framework: string
  status: string
  committeeApproved: boolean
}

const STATUS_OPTIONS = [PENDING_STATUS, 'פעיל', 'לא פעיל', 'סיים לימודים', 'עזב']

export default function RegistrantsTab({
  registrants, onOpenStudent, onChanged,
}: {
  registrants: Registrant[]
  onOpenStudent: (id: string) => void
  onChanged: () => void
}) {
  const [search, setSearch]       = useState('')
  const [framework, setFramework] = useState<'all' | 'tt' | 'bs'>('all')
  const [classes, setClasses]     = useState<string[]>([])   // ריק = כל הכיתות
  const [savingId, setSavingId]   = useState<string | null>(null)
  const [error, setError]         = useState('')
  const [showRegister, setShowRegister] = useState(false)

  const classOptions = useMemo(() => {
    const set = new Set(registrants.map(r => r.className || 'ללא כיתה'))
    return [...set].sort((a, b) => a.localeCompare(b, 'he'))
  }, [registrants])

  const filtered = useMemo(() => registrants.filter(r => {
    if (search.trim() && !r.name.includes(search.trim())) return false
    if (framework === 'tt' && r.framework !== 'תלמוד תורה') return false
    if (framework === 'bs' && r.framework !== 'בית חינוך לבנות') return false
    if (classes.length > 0 && !classes.includes(r.className || 'ללא כיתה')) return false
    return true
  }), [registrants, search, framework, classes])

  const waiting = filtered.filter(r => r.status === PENDING_STATUS).length

  const toggleClass = (c: string) =>
    setClasses(prev => prev.includes(c) ? prev.filter(x => x !== c) : [...prev, c])

  /** שמירה מיידית של שינוי בשורה; שורה שסיימה את שני התנאים תיעלם ברענון. */
  const patch = async (id: string, body: Record<string, unknown>) => {
    setSavingId(id); setError('')
    try {
      const res = await fetch(`/api/students/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onChanged()
    } catch { setError('שגיאת רשת') }
    finally { setSavingId(null) }
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <button onClick={() => setShowRegister(true)}
            className="px-3 py-2 rounded-lg text-sm font-semibold text-white whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
            ➕ רישום תלמיד
          </button>
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש נרשם לפי שם..."
            className="flex-1 min-w-[180px] px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
          />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['all','tt','bs'] as const).map(f => (
              <button key={f} onClick={() => setFramework(f)}
                className={`px-3 py-2 whitespace-nowrap ${framework===f ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {f==='all' ? 'כל האגפים' : f==='tt' ? 'תלמוד תורה' : 'בית חינוך'}
              </button>
            ))}
          </div>
        </div>

        {/* Multi-select classes */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            {classes.length > 0 && (
              <button onClick={() => setClasses([])} className="text-xs text-gray-400 hover:text-gray-600 underline">נקה</button>
            )}
            <p className="text-xs font-semibold text-gray-500">סינון לפי כיתה (בחירה מרובה)</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {classOptions.map(c => (
              <button key={c} onClick={() => toggleClass(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  classes.includes(c)
                    ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'
                }`}>
                {c}
              </button>
            ))}
            {classOptions.length === 0 && <span className="text-xs text-gray-400">אין כיתות</span>}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs pt-1">
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200 font-semibold">{waiting} ממתינים</span>
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">מוצגים {filtered.length} מתוך {registrants.length}</span>
        </div>
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
              <th className="px-4 py-3">שם</th>
              <th className="px-4 py-3">כיתה</th>
              <th className="px-4 py-3">אגף</th>
              <th className="px-4 py-3">סטטוס</th>
              <th className="px-4 py-3">מאושר ע"י הוועד</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(r => (
              <tr key={r.id} className={`hover:bg-gray-50 transition-colors ${savingId === r.id ? 'opacity-60' : ''}`}>
                <td className="px-4 py-2.5">
                  <button onClick={() => onOpenStudent(r.id)}
                    className="font-medium text-gray-900 hover:text-[#1a3a7a] hover:underline text-right">
                    {r.name}
                  </button>
                </td>
                <td className="px-4 py-2.5 text-sm text-gray-600">{r.className || '—'}</td>
                <td className="px-4 py-2.5 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs ${r.framework==='בית חינוך לבנות' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>
                    {r.framework || '—'}
                  </span>
                </td>
                {/* עריכה ישירה בשורה — בלי להיכנס לכרטיס */}
                <td className="px-4 py-2.5">
                  <select
                    value={r.status || PENDING_STATUS}
                    disabled={savingId === r.id}
                    onChange={e => patch(r.id, { status: e.target.value })}
                    className="px-2 py-1 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
                  >
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </td>
                <td className="px-4 py-2.5">
                  <label className="inline-flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.committeeApproved}
                      disabled={savingId === r.id}
                      onChange={e => patch(r.id, { committeeApproved: e.target.checked })}
                      className="w-4 h-4 accent-emerald-600 cursor-pointer"
                    />
                    <span className="text-xs text-gray-500">
                      {r.committeeApproved ? 'מאושר' : 'טרם אושר'}
                    </span>
                  </label>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-gray-400">
                {registrants.length === 0 ? 'אין נרשמים ממתינים 🎉' : 'אין תוצאות לסינון הנוכחי'}
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 text-center">
        תלמיד יוצא מרשימת הנרשמים כשהוא מאושר ע"י הוועד <strong>וגם</strong> הסטטוס שלו אינו "{PENDING_STATUS}" — ואז מופיע בכיתה שלו עם שאר התלמידים.
      </p>

      {/* חלון רישום תלמיד — אותו טופס של עמוד "רישום תלמיד" */}
      {showRegister && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowRegister(false) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden" dir="rtl">
            <div className="px-5 py-4 flex items-center justify-between shrink-0"
              style={{ background: 'linear-gradient(90deg, #0d1f52, #1a3a7a)' }}>
              <button onClick={() => setShowRegister(false)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
              <h2 className="text-lg font-bold text-white">➕ רישום תלמיד חדש</h2>
            </div>
            <div className="flex-1 overflow-y-auto p-5">
              <RegisterStudentForm embedded onSaved={onChanged} />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
