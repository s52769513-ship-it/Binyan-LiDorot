'use client'

import { useEffect, useState } from 'react'
import StudentCard from '@/components/StudentCard'
import EmployeeCard from '@/components/EmployeeCard'
import PaymentCard from '@/components/PaymentCard'

interface Student {
  id: string; name: string; gender: string; age: string
  className: string; framework: string; status: string
  transportation: string[]; transportationCost: number; parentIds: string[]
}

export default function StudentsPage() {
  const [students, setStudents]   = useState<Student[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [search, setSearch]       = useState('')
  const [framework, setFramework] = useState<'all' | 'tt' | 'bs'>('all')
  const [view, setView]           = useState<'class' | 'list'>('class')
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const [selectedParentId, setSelectedParentId]   = useState<string | null>(null)
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [bulkClass, setBulkClass] = useState<string | null>(null)   // class whose status panel is open
  const [bulkStatus, setBulkStatus] = useState('סיים לימודים')
  const [bulkSaving, setBulkSaving] = useState(false)

  const STATUS_OPTIONS = ['סיים לימודים', 'פעיל', 'ממתין', 'עזב']

  const load = () => {
    setLoading(true)
    fetch('/api/students')
      .then(r => r.json())
      .then(d => { if (!d.error) setStudents(d.data ?? []); else setError(d.error) })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const applyClassStatus = async (className: string, list: Student[]) => {
    if (!confirm(`לשנות את הסטטוס של כל ${list.length} התלמידים בכיתה "${className}" ל־"${bulkStatus}"?`)) return
    setBulkSaving(true)
    try {
      const res = await fetch('/api/students/bulk-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentIds: list.map(s => s.id), status: bulkStatus }),
      })
      const data = await res.json()
      if (data.error) { alert(`שגיאה: ${data.error}`); return }
      setBulkClass(null)
      load()
    } catch { alert('שגיאת רשת') }
    finally { setBulkSaving(false) }
  }

  const filtered = students.filter(s => {
    if (search && !s.name.includes(search)) return false
    if (framework === 'tt' && s.framework !== 'תלמוד תורה') return false
    if (framework === 'bs' && s.framework !== 'בית חינוך לבנות') return false
    return true
  })

  const byClass: Record<string, Student[]> = {}
  filtered.forEach(s => {
    const key = s.className || 'לא משויך'
    if (!byClass[key]) byClass[key] = []
    byClass[key].push(s)
  })
  const classes = Object.entries(byClass).sort(([a], [b]) => a.localeCompare(b, 'he'))

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">{filtered.length} תלמידים</span>
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button onClick={() => setView('class')} className={`px-3 py-1.5 ${view==='class' ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>לפי כיתה</button>
            <button onClick={() => setView('list')}  className={`px-3 py-1.5 ${view==='list'  ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>רשימה</button>
          </div>
        </div>
        <h2 className="text-2xl font-bold text-gray-800">תלמידים</h2>
      </div>

      <div className="flex flex-wrap gap-3">
        <input type="text" placeholder="חיפוש לפי שם..." value={search} onChange={e => setSearch(e.target.value)}
          className="flex-1 min-w-[180px] px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['all','tt','bs'] as const).map(f => (
            <button key={f} onClick={() => setFramework(f)}
              className={`px-3 py-2 whitespace-nowrap ${framework===f ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
              {f==='all' ? 'הכל' : f==='tt' ? 'תלמוד תורה' : 'בית חינוך'}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : view === 'class' ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {classes.map(([className, list]) => (
            <div key={className} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'linear-gradient(90deg, #0d1f52, #1a3a7a)' }}>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: '#d4a921', color: '#0d1f52' }}>{list.length}</span>
                  <button
                    onClick={() => setBulkClass(bulkClass === className ? null : className)}
                    title="שינוי סטטוס לכל הכיתה"
                    className="text-[11px] px-2 py-0.5 rounded-full border border-white/30 text-white/80 hover:text-white hover:border-white/60 transition-colors">
                    סטטוס לכיתה
                  </button>
                </div>
                <span className="font-bold text-white">{className}</span>
              </div>
              {bulkClass === className && (
                <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex items-center gap-2 flex-wrap" dir="rtl">
                  <select
                    value={bulkStatus}
                    onChange={e => setBulkStatus(e.target.value)}
                    className="px-3 py-1.5 rounded-lg border border-amber-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-400">
                    {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button
                    onClick={() => applyClassStatus(className, list)}
                    disabled={bulkSaving}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-sm font-semibold hover:bg-amber-700 disabled:opacity-60">
                    {bulkSaving ? 'מחיל...' : `החל על ${list.length} תלמידים`}
                  </button>
                  <button onClick={() => setBulkClass(null)} className="text-xs text-gray-500 hover:text-gray-700">ביטול</button>
                </div>
              )}
              <div className="divide-y divide-gray-50">
                {list.map(s => (
                  <div key={s.id} onClick={() => setSelectedStudentId(s.id)}
                    className="px-4 py-2.5 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors">
                    <div className="flex items-center gap-1.5 text-xs">
                      {s.status && <span className={`px-1.5 py-0.5 rounded ${s.status==='פעיל' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>}
                    </div>
                    <span className="text-sm font-medium text-gray-800">{s.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full min-w-[600px]">
            <thead>
              <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
                <th className="px-4 py-3">שם</th><th className="px-4 py-3">כיתה</th>
                <th className="px-4 py-3">מסגרת</th><th className="px-4 py-3">גיל</th>
                <th className="px-4 py-3">סטטוס</th><th className="px-4 py-3">הסעה</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(s => (
                <tr key={s.id} onClick={() => setSelectedStudentId(s.id)} className="cursor-pointer hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 font-medium text-gray-900">{s.name}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.className || '—'}</td>
                  <td className="px-4 py-3 text-sm">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${s.framework==='בית חינוך לבנות' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'}`}>{s.framework || '—'}</span>
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{s.age || '—'}</td>
                  <td className="px-4 py-3">
                    {s.status && <span className={`px-2 py-0.5 rounded-full text-xs ${s.status==='פעיל' ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>{s.status}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{s.transportation.join(', ') || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedStudentId && (
        <StudentCard studentId={selectedStudentId} onClose={() => setSelectedStudentId(null)}
          onOpenParent={id => { setSelectedStudentId(null); setSelectedParentId(id) }} />
      )}
      {selectedParentId && (
        <EmployeeCard parentId={selectedParentId} onClose={() => setSelectedParentId(null)}
          onOpenStudent={id => { setSelectedParentId(null); setSelectedStudentId(id) }}
        />
      )}
      {selectedPaymentId && (
        <PaymentCard paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)}
          onOpenParent={id => { setSelectedPaymentId(null); setSelectedParentId(id) }} />
      )}
    </div>
  )
}
