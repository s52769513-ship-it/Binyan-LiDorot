'use client'

import { useState } from 'react'
import TypeMultiSelect from './TypeMultiSelect'

interface Props {
  onClose: () => void
  onSuccess?: (id: string) => void
}

const STATUS_OPTIONS = ['פעיל', 'לא פעיל', 'ממתין', 'בוגר']

export default function AddParentModal({ onClose, onSuccess }: Props) {
  const [form, setForm] = useState({
    firstName: '', lastName: '', motherName: '',
    fatherPhone: '', motherPhone: '', email: '',
    city: '', address: '', building: '',
    notes: '',
  })
  const [status, setStatus] = useState(['פעיל'])
  const [personType, setPersonType] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))
  const toggleStatus = (s: string) =>
    setStatus(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName) { setError('שם פרטי ושם משפחה הם שדות חובה'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/parents', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, status, personType }),
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
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
          <h2 className="text-lg font-bold text-gray-900">הוספת משפחה</h2>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-3">
            <Field label="שם פרטי אבא *" value={form.firstName} onChange={v => set('firstName', v)} placeholder="ישראל" />
            <Field label="שם משפחה *" value={form.lastName} onChange={v => set('lastName', v)} placeholder="ישראלי" />
          </div>
          <Field label="שם אמא" value={form.motherName} onChange={v => set('motherName', v)} placeholder="שרה" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="נייד אבא" value={form.fatherPhone} onChange={v => set('fatherPhone', v)} placeholder="050-0000000" type="tel" />
            <Field label="נייד אמא" value={form.motherPhone} onChange={v => set('motherPhone', v)} placeholder="050-0000000" type="tel" />
          </div>
          <Field label="מייל" value={form.email} onChange={v => set('email', v)} placeholder="israel@example.com" type="email" />
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <Field label="כתובת" value={form.address} onChange={v => set('address', v)} placeholder="רחוב הרצל 1" />
            </div>
            <Field label="דירה/בניין" value={form.building} onChange={v => set('building', v)} placeholder="3" />
          </div>
          <Field label="עיר" value={form.city} onChange={v => set('city', v)} placeholder="ירושלים" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">סטטוס</label>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map(s => (
                <button key={s} type="button"
                  onClick={() => toggleStatus(s)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    status.includes(s)
                      ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]'
                      : 'bg-white text-gray-600 border-gray-300 hover:border-[#1a3a7a]'
                  }`}>
                  {s}
                </button>
              ))}
            </div>
          </div>

          <TypeMultiSelect selected={personType} onChange={setPersonType} label="סוג" />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 resize-none"
              rows={2} placeholder="הערות כלליות..." />
          </div>
        </form>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} type="button"
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
          <button onClick={handleSubmit as unknown as React.MouseEventHandler} disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-[#1a3a7a] text-white text-sm font-medium hover:bg-[#1a3a7a]/90 disabled:opacity-60 transition-colors">
            {submitting ? 'שומר...' : 'הוספת משפחה'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, placeholder, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
    </div>
  )
}
