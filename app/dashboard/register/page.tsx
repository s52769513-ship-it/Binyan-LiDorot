'use client'

import { useEffect, useRef, useState } from 'react'

interface ParentOption { id: string; name: string }
interface ClassOption { class_name: string; framework: string }

const STATUS_OPTIONS    = ['פעיל', 'לא פעיל', 'בוגר', 'הורחק', 'ממתין']
const TRANSPORT_OPTIONS = ['הלוך', 'חזור שעה 1', 'חזור שעה 4']

function calcTransportCost(transport: string[]): number {
  if (!transport.includes('הלוך')) return 0
  const hasReturn = transport.includes('חזור שעה 1') || transport.includes('חזור שעה 4')
  return hasReturn ? 130 : 65
}

export default function RegisterPage() {
  const [form, setForm] = useState({
    firstName: '', lastName: '', gender: 'זכר',
    className: '', status: 'ממתין',
    birthGregorian: '', birthHebrew: '', idNumber: '',
    address: '', city: '', notes: '',
    healthFund: '', previousSchool: '',
  })
  const [transportation, setTransportation] = useState<string[]>([])
  const [parentSearch, setParentSearch]     = useState('')
  const [parentOptions, setParentOptions]   = useState<ParentOption[]>([])
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null)
  const [showParentDropdown, setShowParentDropdown] = useState(false)
  const [classes, setClasses]         = useState<ClassOption[]>([])
  const [classFramework, setClassFramework] = useState('')
  const [showClassDropdown, setShowClassDropdown] = useState(false)
  const [submitting, setSubmitting]   = useState(false)
  const [success, setSuccess]         = useState(false)
  const [error, setError]             = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    fetch('/api/classes').then(r => r.json()).then(d => { if (Array.isArray(d)) setClasses(d) }).catch(() => {})
  }, [])

  useEffect(() => {
    const match = classes.find(c => c.class_name === form.className)
    setClassFramework(match?.framework ?? '')
  }, [form.className, classes])

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

  const filteredClasses = classes.filter(c => !form.className || c.class_name.includes(form.className))

  const transportCost = calcTransportCost(transportation)

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
          gender: form.gender,
          className: form.className,
          status: form.status,
          birthDateGregorian: form.birthGregorian,
          birthDateHebrew: form.birthHebrew,
          idNumber: form.idNumber,
          address: form.address, city: form.city,
          transportation,
          transportationCost: transportCost,
          healthFund: form.healthFund,
          previousSchool: form.previousSchool,
          notes: form.notes,
          parentIds: selectedParent ? [selectedParent.id] : [],
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSuccess(true)
      setForm({ firstName: '', lastName: '', gender: 'זכר', className: '', status: 'ממתין', birthGregorian: '', birthHebrew: '', idNumber: '', address: '', city: '', notes: '', healthFund: '', previousSchool: '' })
      setTransportation([]); setSelectedParent(null); setParentSearch(''); setClassFramework('')
      setTimeout(() => setSuccess(false), 4000)
    } catch { setError('שגיאה בשמירה') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-gray-800 mb-6 text-right">רישום תלמיד חדש</h2>

      {success && <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-right font-medium">✓ התלמיד נשמר בהצלחה!</div>}
      {error   && <div className="mb-4 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-right text-sm">{error}</div>}

      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-6">

        {/* פרטים אישיים */}
        <Section title="פרטים אישיים">
          <div className="grid grid-cols-2 gap-4">
            <Field label="שם משפחה *"><input required value={form.lastName} onChange={e => set('lastName', e.target.value)} className={INPUT} placeholder="כהן" /></Field>
            <Field label="שם פרטי *"> <input required value={form.firstName} onChange={e => set('firstName', e.target.value)} className={INPUT} placeholder="משה" /></Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label='ת"ז'>
              <input value={form.idNumber} onChange={e => set('idNumber', e.target.value)} className={INPUT} placeholder="123456789" dir="ltr" />
            </Field>
            <Field label="סטטוס">
              <select value={form.status} onChange={e => set('status', e.target.value)} className={INPUT}>
                {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="מגדר">
              <div className="flex gap-3 mt-1">
                {['זכר','נקבה'].map(g => (
                  <label key={g} className="flex items-center gap-2 cursor-pointer">
                    <input type="radio" name="gender" value={g} checked={form.gender===g} onChange={e => set('gender', e.target.value)} className="accent-[#1a3a7a]" />
                    <span className="text-sm">{g === 'זכר' ? 'בן' : 'בת'}</span>
                  </label>
                ))}
              </div>
            </Field>
            <Field label="מסגרת">
              <div className={`${INPUT} bg-gray-50 text-gray-500 cursor-default`}>
                {classFramework || <span className="text-gray-300">נקבע לפי הכיתה</span>}
              </div>
            </Field>
          </div>

          {/* Class with autocomplete */}
          <Field label="כיתה">
            <div className="relative">
              <input
                value={form.className}
                onChange={e => { set('className', e.target.value); setShowClassDropdown(true) }}
                onFocus={() => setShowClassDropdown(true)}
                onBlur={() => setTimeout(() => setShowClassDropdown(false), 150)}
                className={INPUT} placeholder="בחר כיתה..."
              />
              {showClassDropdown && filteredClasses.length > 0 && (
                <div className="absolute top-full right-0 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                  {filteredClasses.map(c => (
                    <button key={c.class_name} type="button"
                      onClick={() => { set('className', c.class_name); setShowClassDropdown(false) }}
                      className="w-full text-right px-4 py-2 hover:bg-gray-50 text-sm border-b border-gray-50 last:border-0 flex justify-between items-center">
                      <span className="text-gray-400 text-xs">{c.framework}</span>
                      <span>{c.class_name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </Field>
        </Section>

        {/* תאריך לידה */}
        <Section title="תאריך לידה">
          <div className="grid grid-cols-2 gap-4">
            <Field label="תאריך לועזי (DD/MM/YYYY)">
              <input value={form.birthGregorian} onChange={e => set('birthGregorian', e.target.value)} className={INPUT} placeholder="15/03/2020" dir="ltr" />
            </Field>
            <Field label='תאריך עברי'>
              <input value={form.birthHebrew} onChange={e => set('birthHebrew', e.target.value)} className={INPUT} placeholder='כ"ב אדר תשפ"ה' />
            </Field>
          </div>
        </Section>

        {/* כתובת */}
        <Section title="כתובת">
          <div className="grid grid-cols-2 gap-4">
            <Field label="עיר">    <input value={form.city}    onChange={e => set('city', e.target.value)}    className={INPUT} placeholder="צפת" /></Field>
            <Field label="כתובת"> <input value={form.address}  onChange={e => set('address', e.target.value)} className={INPUT} placeholder="רחוב הרב קוק 5" /></Field>
          </div>
        </Section>

        {/* הסעות */}
        <Section title="הסעות">
          <div className="flex gap-4 flex-wrap">
            {TRANSPORT_OPTIONS.map(t => (
              <label key={t} className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={transportation.includes(t)} onChange={() => toggleTransport(t)} className="accent-[#1a3a7a] w-4 h-4" />
                <span className="text-sm">{t}</span>
              </label>
            ))}
          </div>
          {transportCost > 0 && (
            <p className="text-sm text-[#1a3a7a] font-medium mt-1">
              עלות חודשית: ₪{transportCost}
            </p>
          )}
        </Section>

        {/* פרטים נוספים */}
        <Section title="פרטים נוספים">
          <div className="grid grid-cols-2 gap-4">
            <Field label="קופת חולים">        <input value={form.healthFund}    onChange={e => set('healthFund', e.target.value)}    className={INPUT} placeholder="מכבי, כללית..." /></Field>
            <Field label="מקום לימודים קודם"> <input value={form.previousSchool} onChange={e => set('previousSchool', e.target.value)} className={INPUT} placeholder="" /></Field>
          </div>
        </Section>

        {/* קישור להורה */}
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
                  <input value={parentSearch}
                    onChange={e => { setParentSearch(e.target.value); setShowParentDropdown(true) }}
                    onFocus={() => setShowParentDropdown(true)}
                    className={INPUT} placeholder="הקלד שם הורה לחיפוש..." />
                  {showParentDropdown && parentOptions.length > 0 && (
                    <div className="absolute top-full right-0 left-0 z-10 bg-white border border-gray-200 rounded-xl shadow-lg mt-1 max-h-48 overflow-y-auto">
                      {parentOptions.map(p => (
                        <button key={p.id} type="button"
                          onClick={() => { setSelectedParent(p); setShowParentDropdown(false); setParentSearch('') }}
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

        {/* הערות */}
        <Section title="הערות">
          <textarea value={form.notes} onChange={e => set('notes', e.target.value)}
            className={`${INPUT} resize-none`} rows={3} placeholder="הערות נוספות..." />
        </Section>

        <button type="submit" disabled={submitting}
          className="w-full py-3 rounded-xl font-bold text-base transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
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
