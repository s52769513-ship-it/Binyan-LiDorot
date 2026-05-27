'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  parentId?: string
  parentName?: string
  onClose: () => void
  onSuccess?: (id: string) => void
}

const TRANSPORT_OPTIONS = ['הלוך', 'חזור שעה 1', 'חזור שעה 4']

function calcTransportCost(t: string[]): number {
  if (!t.includes('הלוך')) return 0
  return (t.includes('חזור שעה 1') || t.includes('חזור שעה 4')) ? 130 : 65
}

interface ClassOption { class_name: string }

export default function AddStudentModal({ parentId, parentName, onClose, onSuccess }: Props) {
  const [form, setForm] = useState({ firstName: '', lastName: '', gender: 'זכר', className: '', status: 'ממתין', age: '' })
  const [transportation, setTransportation] = useState<string[]>([])
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [showClassDrop, setShowClassDrop] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const classRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/classes?linked=true').then(r => r.json()).then(d => { if (Array.isArray(d)) setClasses(d) }).catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (classRef.current && !classRef.current.contains(e.target as Node)) setShowClassDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const toggleTransport = (t: string) =>
    setTransportation(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const filteredClasses = classes.filter(c =>
    !form.className || c.class_name.toLowerCase().includes(form.className.toLowerCase())
  )

  const handleSubmit = async () => {
    if (!form.firstName || !form.lastName) { setError('שם פרטי ושם משפחה הם שדות חובה'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          gender: form.gender, className: form.className,
          status: form.status, age: form.age,
          transportation,
          transportationCost: calcTransportCost(transportation),
          parentIds: parentId ? [parentId] : [],
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSuccess?.(data.id)
      onClose()
    } catch { setError('שגיאה בשמירה') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-900">הוספת ילד</h2>
            {parentName && <p className="text-sm text-gray-500">משפחה: {parentName}</p>}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="שם פרטי *" value={form.firstName} onChange={v => set('firstName', v)} placeholder="יוסי" />
            <Field label="שם משפחה *" value={form.lastName} onChange={v => set('lastName', v)} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">מגדר</label>
            <div className="flex gap-2">
              {['זכר', 'נקבה'].map(g => (
                <button key={g} type="button" onClick={() => set('gender', g)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${form.gender === g ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {g === 'זכר' ? '👦 בן' : '👧 בת'}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Class with autocomplete */}
            <div ref={classRef} className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">כיתה</label>
              <input value={form.className} onChange={e => { set('className', e.target.value); setShowClassDrop(true) }}
                onFocus={() => setShowClassDrop(true)}
                placeholder="חפש כיתה..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
              {showClassDrop && filteredClasses.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {filteredClasses.slice(0, 10).map(c => (
                    <button key={c.class_name} type="button"
                      onClick={() => { set('className', c.class_name); setShowClassDrop(false) }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50 transition-colors">
                      {c.class_name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">גיל</label>
              <input type="number" value={form.age} onChange={e => set('age', e.target.value)}
                placeholder="8" min="3" max="20"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סטטוס</label>
            <div className="flex gap-2">
              {['ממתין', 'פעיל', 'לא פעיל'].map(s => (
                <button key={s} type="button" onClick={() => set('status', s)}
                  className={`flex-1 py-2 rounded-lg border text-sm font-medium transition-colors ${form.status === s ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200'}`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">הסעות</label>
            <div className="flex flex-wrap gap-2">
              {TRANSPORT_OPTIONS.map(t => (
                <button key={t} type="button" onClick={() => toggleTransport(t)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    transportation.includes(t) ? 'bg-amber-500 text-white border-amber-500' : 'bg-white text-gray-600 border-gray-200 hover:border-amber-400'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
            {transportation.length > 0 && (
              <p className="text-xs text-gray-400 mt-1">עלות הסעה: ₪{calcTransportCost(transportation)}</p>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#1a3a7a] text-white text-sm font-medium hover:bg-[#1a3a7a]/90 disabled:opacity-60 transition-colors">
            {submitting ? 'שומר...' : 'הוספת ילד'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
    </div>
  )
}
