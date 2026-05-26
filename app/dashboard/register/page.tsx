'use client'

import { useEffect, useRef, useState } from 'react'

interface ParentOption { id: string; name: string }

// Approximate Hebrew year from Gregorian
function gregorianToHebrewYear(year: number): number {
  return year + 3760
}

// Very basic Hebrew date hint (year only)
function hebrewYearHint(gregorian: string): string {
  if (!gregorian) return ''
  const year = new Date(gregorian).getFullYear()
  const hebrewMonth = new Date(gregorian).getMonth()
  // After Tishrei (roughly Oct), add 3761 instead of 3760
  const hebrewYear = hebrewMonth >= 9 ? year + 3761 : year + 3760
  return `שנה עברית משוערת: תש${hebrewYear.toString().slice(-3)}`
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '', lastName: '', gender: 'זכר', framework: 'תלמוד תורה',
    className: '', birthHebrew: '', birthGregorian: '',
    address: '', city: '', notes: '',
  })
  const [transportation, setTransportation] = useState<string[]>([])
  const [parentSearch, setParentSearch] = useState('')
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([])
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Auto-set framework from gender
  useEffect(() => {
    setForm(f => ({ ...f, framework: f.gender === 'נקבה' ? 'בית חינוך לכנות' : 'תלמוד תורה' }))
  }, [form.gender])

  // Search parents
  useEffect(() => {
    if (!parentSearch.trim()) { setParentOptions([]); return }
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      fetch(`/api/parents?search=${encodeURIComponent(parentSearch)}&page=0`)
        .then(r => r.json())
        .then(d => setParentOptions((d.data ?? []).slice(0, 8).map((p: {id:string;name:string}) => ({ id: p.id, name: p.name }))))
        .catch(() => {})
    }, 300)
  }, [parentSearch])

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }))

  const toggleTransport = (t: string) =>
    setTransportation(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName) { setError('שם פרטי ושם משפחה הם שדות חובה'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/students', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          firstName: form.firstName, lastName: form.lastName,
          gender: form.gender, framework: form.framework,
          className: form.className,
          birthDateHebrew: form.birthHebrew, birthDateGregorian: form.birthGregorian,
          address: form.address, city: form.city,
          transportation, notes: form.notes,
          parentIds: selectedParent ? [selectedParent.id] : [],
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSuccess(true)
      setForm({ firstName: '', lastName: '', gender: 'זכר', framework: 'תלמוד תורה', className: '', birthHebrew: '', birthGregorian: '', address: '', city: '', notes: '' })
      setTransportation([]); setSelectedParent(null); setParentSearch('')
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('שגיאה בשמירה') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-right">רישום תלמיד חדש</h2>

      {success && (
        <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-right font-medium">
          ✓ התלמיד נשמר בהצלחה!
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-right text-sm">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">

        {/* Name */}
        <Section title="פרטי התלמיד">
          <div className="grid grid-cols-2 gap-4">
            <Field label="שם משפחה *"><input required value={form.lastName} onChange={e => set('lastName', e.target.value)} className={INPUT} placeholder="כהן" /></Field>
            <Field label="שם פרטי *"><input required value={form.firstName} onChange={e => set('firstName', e.target.value)} className={INPUT} placeholder="משה" /></Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="מגדר">
              <div className="flex gap-3">
                {['זכר','נקבה'].map(g => (
                  <label key={g} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="gender" value={g} checked={form.gender===g} onChange={e => set('gender', e.target.value)} className="accent-[#1a3a7a]" />
                    <span className="text-sm">{g === 'זכר' ? 'בן' : 'בת'}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="מסגרת">
              <input value={form.framework} onChange={e => set('framework', e.target.value)} className={INPUT} />
            </Field>
          </div>

          <Field label="כיתה">
            <input value={form.className} onChange={e => set('className', e.target.value)} className={INPUT} placeholder="א׳" />
          </Field>
        </Section>

        {/* Dates */}
        <Section title="תאריך לידה">
          <div className="grid grid-cols-2 gap-4">
            <Field label="תאריך לועזי">
              <input type="date" value={form.birthGregorian} onChange={e => set('birthGregorian', e.target.value)} className={INPUT} />
              {form.birthGregorian && (
                <p className="text-xs text-[#1a3a7a] mt-1">{hebrewYearHint(form.birthGregorian)}</p>
              )}
            </Field>
            <Field label='תאריך עברי (לדוגמה: כ"ב אדר תשפ"ה)'>
              <input value={form.birthHebrew} onChange={e => set('birthHebrew', e.target.value)} className={INPUT} placeholder='כ"ב אדר תשפ"ה' dir="rtl" />
            </Field>
          </div>
        </Section>

        {/* Address */}
        <Section title="כתובת">
          <div className="grid grid-cols-2 gap-4">
            <Field label="עיר"><input value={form.city} onChange={e => set('city', e.target.value)} className={INPUT} placeholder="צפת" /></Field>
            <Field label="כתובת"><input value={form.address} onChange={e => set('address', e.target.value)} className={INPUT} placeholder="רחוב הרב קוק 5" /></Field>
          </div>
        </Section>

        {/* Transportation */}
        <Section title="הסעות">
          <div className="flex gap-4 flex-wrap">
            {['בוקר','צהריים','ערב'].map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={transportation.includes(t)} onChange={() => toggleTransport(t)} className="accent-[#1a3a7a] w-4 h-4" />
                <span className="text-sm">{t}</span>
              </label>
            ))}
          </div>
        </Section>

        {/* Parent link */}
        <Section title="קישור להורה">
          <Field label="חיפוש הורה">
            <div className="relative">
              {selectedParent ? (
                <div className="flex items-center justify-between px-4 py-2 rounded-lg border border-[#1a3a7a] bg-blue-50">
                  <button type="button" onClick={() => { setSelectedParent(null); setParentSearch('') }} className="text-gray-400 hover:text-red-500 text-sm">✕</button>
                  <span className="text-sm font-medium text-[#1a3a7a]">{selectedParent.name}</span>
                </div>
              ) : (
                <>
                  <input
                    value={parentSearch}
                    onChange={e => { setParentSearch(e.target.value); setShowDropdown(true) }}
                    onFocus={() => setShowDropdown(true)}
                    className={INPUT}
                    placeholder="הקלד שם הורה לחיפוש..."
                  />
                  {showDropdown && parentOptions.length > 0 && (
                    <div className="absolute top-full right-0 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {parentOptions.map(p => (
                        <button key={p.id} type="button"
                          onClick={() => { setSelectedParent(p); setShowDropdown(false); setParentSearch('') }}
                          className="w-full text-right px-4 py-2.5 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0">
                          {p.name}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </Field>
        </Section>

        {/* Notes */}
        <Section title="הערות">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            className={`${INPUT} resize-none`} rows={3} placeholder="הערות נוספות..." />
        </Section>

        <button
          type="submit" disabled={submitting}
          className="w-full py-3 rounded-xl font-bold text-base transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
        >
          {submitting ? 'שומר...' : 'שמור רישום'}
        </button>
      </form>
    </div>
  )
}

const INPUT = 'w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white text-right'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 text-right">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1 text-right">{label}</label>
      {children}
    </div>
  )
}
