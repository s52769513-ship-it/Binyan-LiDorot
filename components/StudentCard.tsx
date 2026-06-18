'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface StudentData {
  id: string
  name: string
  gender: string
  age: string
  className: string
  framework: string
  status: string
  transportation: string[]
  transportationCost: number
  notes: string
  parentIds: string[]
  parents: { id: string; name: string }[]
  birthDateGregorian: string
  birthDateHebrew: string
  idNumber: string
  healthFund: string
  previousSchool: string
}

interface ClassOption { class_name: string; framework: string }

interface Props {
  studentId: string
  onClose: () => void
  onOpenParent?: (parentId: string) => void
  onUpdate?: () => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const STATUS_OPTIONS    = ['פעיל', 'לא פעיל', 'בוגר', 'הורחק', 'ממתין', 'סיים לימודים']
const TRANSPORT_OPTIONS = ['הלוך', 'חזור שעה 1', 'חזור שעה 4']

function calcTransportCost(transport: string[]): number {
  if (!transport.includes('הלוך')) return 0
  const hasReturn = transport.includes('חזור שעה 1') || transport.includes('חזור שעה 4')
  return hasReturn ? 130 : 65
}

/* ─── InlineField (free text / date) ────────────────── */
function InlineField({
  label, value, onSave, type = 'text', dir = 'rtl', multiline = false,
}: {
  label: string; value: string; onSave: (v: string) => Promise<void>
  type?: string; dir?: 'rtl' | 'ltr'; multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal]         = useState(value)
  const [saving, setSaving]   = useState(false)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    setEditing(false)
    if (val.trim() === (value ?? '').trim()) return
    setSaving(true)
    try { await onSave(val.trim()) } finally { setSaving(false) }
  }

  const props = {
    ref, value: val, dir,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVal(e.target.value),
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) save()
      if (e.key === 'Escape') { setVal(value); setEditing(false) }
    },
    className: 'w-full px-2 py-1 text-sm border-b-2 border-[#1a3a7a] bg-transparent outline-none text-right',
  }

  return (
    <div className="group">
      <div className="text-[10px] text-gray-400 mb-0.5 text-right">{label}</div>
      {editing
        ? multiline ? <textarea rows={3} {...props} /> : <input type={type} {...props} />
        : (
          <button onClick={() => setEditing(true)} className="text-sm text-gray-800 hover:text-[#1a3a7a] w-full text-right flex items-center gap-1 justify-end">
            <span className="opacity-0 group-hover:opacity-60 text-gray-300 text-xs">✏</span>
            {saving ? <span className="text-xs text-gray-400">שומר...</span>
              : <span>{val || <span className="text-gray-300 text-xs italic">לא הוזן</span>}</span>}
          </button>
        )}
    </div>
  )
}

/* ─── ReadOnly ────────────────────────────────────────── */
function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] text-gray-400 mb-0.5 text-right">{label}</div>
      <div className="text-sm text-gray-500 bg-gray-50 px-2 py-1 rounded">
        {value || <span className="italic text-gray-300 text-xs">—</span>}
      </div>
    </div>
  )
}

/* ─── InlineSelect ────────────────────────────────────── */
function InlineSelect({
  label, value, options, onSave,
}: {
  label: string; value: string; options: string[]; onSave: (v: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const handle = async (v: string) => {
    if (v === value) return
    setSaving(true)
    try { await onSave(v) } finally { setSaving(false) }
  }
  return (
    <div>
      <div className="text-[10px] text-gray-400 mb-0.5 text-right">{label}</div>
      {saving ? <span className="text-xs text-gray-400">שומר...</span> : (
        <select value={value} onChange={e => handle(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 text-right">
          <option value="">— בחר —</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      )}
    </div>
  )
}

/* ─── InlineClassSelect ───────────────────────────────── */
function InlineClassSelect({
  label, value, classes, onSave,
}: {
  label: string; value: string; classes: ClassOption[];
  onSave: (className: string, framework: string) => Promise<void>
}) {
  const [saving, setSaving] = useState(false)
  const handle = async (className: string) => {
    if (className === value) return
    const fw = classes.find(c => c.class_name === className)?.framework ?? ''
    setSaving(true)
    try { await onSave(className, fw) } finally { setSaving(false) }
  }
  return (
    <div>
      <div className="text-[10px] text-gray-400 mb-0.5 text-right">{label}</div>
      {saving ? <span className="text-xs text-gray-400">שומר...</span> : (
        <select value={value} onChange={e => handle(e.target.value)}
          className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 text-right">
          <option value="">— בחר כיתה —</option>
          {classes.map(c => (
            <option key={c.class_name} value={c.class_name}>{c.class_name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

/* ─── Section ─────────────────────────────────────────── */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</div>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4">{children}</div>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════ */
export default function StudentCard({ studentId, onClose, onOpenParent, onUpdate }: Props) {
  const [student, setStudent] = useState<StudentData | null>(null)
  const [classes, setClasses] = useState<ClassOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // Parent linking state
  const [parentSearch, setParentSearch]       = useState('')
  const [parentResults, setParentResults]     = useState<{ id: string; name: string }[]>([])
  const [parentSearching, setParentSearching] = useState(false)
  const [showParentSearch, setShowParentSearch] = useState(false)
  const parentInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true); setError('')
    Promise.all([
      fetch(`/api/students/${studentId}`).then(r => r.json()),
      fetch('/api/classes').then(r => r.json()),
    ])
      .then(([d, cls]) => {
        if (d.error) setError(d.error); else setStudent(d)
        if (Array.isArray(cls)) setClasses(cls)
      })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }, [studentId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Debounced parent search
  useEffect(() => {
    if (!parentSearch.trim()) { setParentResults([]); return }
    setParentSearching(true)
    const t = setTimeout(() =>
      fetch(`/api/parents?search=${encodeURIComponent(parentSearch)}&page=0`)
        .then(r => r.json())
        .then(d => setParentResults((d.data ?? []).slice(0, 8).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
        .finally(() => setParentSearching(false))
    , 300)
    return () => clearTimeout(t)
  }, [parentSearch])

  const linkParent = async (parentId: string) => {
    if (!student) return
    if (student.parentIds.includes(parentId)) return
    const picked = parentResults.find(p => p.id === parentId)
    const newIds = [...student.parentIds, parentId]
    setStudent(prev => prev ? {
      ...prev,
      parentIds: newIds,
      parents: picked && !prev.parents.some(p => p.id === parentId)
        ? [...prev.parents, picked]
        : prev.parents,
    } : prev)
    await patch({ parentIds: newIds })
    setParentSearch(''); setParentResults([]); setShowParentSearch(false)
  }

  const unlinkParent = async (parentId: string) => {
    if (!student) return
    if (!confirm('להסיר שיוך להורה זה?')) return
    const newIds = student.parentIds.filter(id => id !== parentId)
    setStudent(prev => prev ? {
      ...prev,
      parentIds: newIds,
      parents: prev.parents.filter(p => p.id !== parentId),
    } : prev)
    await fetch(`/api/students/${studentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ parentIds: newIds }),
    })
    onUpdate?.()
  }

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    await fetch(`/api/students/${studentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    setStudent(prev => prev ? { ...prev, ...fields } as StudentData : prev)
  }, [studentId])

  const toggleTransport = async (t: string) => {
    if (!student) return
    const next = student.transportation.includes(t)
      ? student.transportation.filter(x => x !== t)
      : [...student.transportation, t]
    const cost = calcTransportCost(next)
    setStudent(prev => prev ? { ...prev, transportation: next, transportationCost: cost } : prev)
    await patch({ transportation: next, transportationCost: cost })
  }

  const frameworkColor = student?.framework === 'בית חינוך לבנות'
    ? 'bg-pink-100 text-pink-800' : 'bg-blue-100 text-blue-800'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden"
        style={{ height: '92vh', maxHeight: '92vh' }}>

        {/* Header */}
        <div className="px-5 pt-4 pb-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <div className="flex items-start justify-between mb-2">
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none">✕</button>
            <div className="text-right flex-1 mr-2">
              {loading
                ? <div className="h-6 w-40 bg-white/20 rounded animate-pulse ml-auto" />
                : <h2 className="text-xl font-bold text-white">{student?.name || '—'}</h2>
              }
              <div className="flex items-center gap-1.5 justify-end mt-1 flex-wrap">
                {student?.framework && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${frameworkColor}`}>
                    {student.framework}
                  </span>
                )}
                {student?.status && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    student.status === 'פעיל' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-600'
                  }`}>{student.status}</span>
                )}
              </div>
            </div>
          </div>

          {student && (
            <div className="flex gap-px mt-2">
              <div className="flex-1 bg-white/10 rounded-tl-xl px-3 py-2 text-center">
                <p className="text-sm font-bold text-white/90">{student.className || '—'}</p>
                <p className="text-[10px] text-white/50">כיתה</p>
              </div>
              <div className="flex-1 bg-white/10 px-3 py-2 text-center">
                <p className="text-sm font-bold text-white/90">{student.age || '—'}</p>
                <p className="text-[10px] text-white/50">גיל</p>
              </div>
              <div className="flex-1 bg-white/10 px-3 py-2 text-center">
                <p className="text-sm font-bold text-white/90">{student.birthDateHebrew || student.birthDateGregorian || '—'}</p>
                <p className="text-[10px] text-white/50">ת. לידה</p>
              </div>
              <div className="flex-1 bg-white/10 rounded-tr-xl px-3 py-2 text-center">
                <p className="text-sm font-bold text-white/90">{student.transportation.length ? student.transportation.join(' + ') : '—'}</p>
                <p className="text-[10px] text-white/50">הסעות</p>
              </div>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4 space-y-4" dir="rtl">
          {loading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>}
          {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

          {student && (
            <>
              {/* פרטים אישיים */}
              <Section title="פרטים אישיים">
                <InlineField label="שם מלא"   value={student.name}     onSave={v => patch({ name: v })} />
                <InlineField label='ת"ז'      value={student.idNumber} onSave={v => patch({ idNumber: v })} dir="ltr" />
                <InlineSelect label="מגדר"    value={student.gender}   options={['זכר', 'נקבה']} onSave={v => patch({ gender: v })} />
                <InlineSelect label="סטטוס"   value={student.status}   options={STATUS_OPTIONS}   onSave={v => patch({ status: v })} />
                <InlineClassSelect
                  label="כיתה" value={student.className} classes={classes}
                  onSave={(className, framework) => {
                    setStudent(prev => prev ? { ...prev, className, framework } : prev)
                    return patch({ className })
                  }}
                />
                <ReadOnly label="מסגרת" value={student.framework} />
              </Section>

              {/* תאריך לידה */}
              <Section title="תאריך לידה">
                <InlineField label="תאריך עברי"  value={student.birthDateHebrew}    onSave={v => patch({ birthDateHebrew: v })} />
                <InlineField label="תאריך לועזי" value={student.birthDateGregorian} onSave={v => patch({ birthDateGregorian: v })} dir="ltr" />
                <ReadOnly label="גיל (מחושב)" value={student.age} />
              </Section>

              {/* פרטים נוספים */}
              <Section title="פרטים נוספים">
                <InlineField label="קופת חולים"       value={student.healthFund}    onSave={v => patch({ healthFund: v })} />
                <InlineField label="מקום לימודים קודם" value={student.previousSchool} onSave={v => patch({ previousSchool: v })} />
              </Section>

              {/* הסעות */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">הסעות</div>
                <div className="p-4 space-y-3">
                  <div className="flex gap-4 flex-wrap">
                    {TRANSPORT_OPTIONS.map(t => (
                      <label key={t} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={student.transportation.includes(t)}
                          onChange={() => toggleTransport(t)} className="accent-[#1a3a7a] w-4 h-4" />
                        <span className="text-sm">{t}</span>
                      </label>
                    ))}
                  </div>
                  {student.transportationCost > 0 && (
                    <p className="text-sm text-gray-500">עלות: <span className="font-semibold">{fmt(student.transportationCost)}</span></p>
                  )}
                </div>
              </div>

              {/* הערות */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">הערות</div>
                <div className="p-4">
                  <InlineField label="" value={student.notes} onSave={v => patch({ notes: v })} multiline />
                </div>
              </div>

              {/* הורים */}
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                  <button
                    onClick={() => { setShowParentSearch(v => !v); setParentSearch(''); setParentResults([]) }}
                    className="text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors"
                    style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
                  >
                    + שייך הורה
                  </button>
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">הורים</span>
                </div>

                {/* Parent search */}
                {showParentSearch && (
                  <div className="px-4 py-3 border-b border-gray-100 relative" dir="rtl">
                    <input
                      ref={parentInputRef}
                      autoFocus
                      value={parentSearch}
                      onChange={e => setParentSearch(e.target.value)}
                      placeholder="חפש לפי שם..."
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
                    />
                    {parentSearching && <p className="text-xs text-gray-400 mt-1 text-right">מחפש...</p>}
                    {parentResults.length > 0 && (
                      <div className="mt-1 bg-white border border-gray-200 rounded-xl shadow overflow-hidden">
                        {parentResults.map(p => (
                          <button key={p.id} onClick={() => linkParent(p.id)}
                            className="w-full text-right px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-0">
                            {p.name}
                          </button>
                        ))}
                      </div>
                    )}
                    {parentSearch.trim() && !parentSearching && parentResults.length === 0 && (
                      <p className="text-xs text-gray-400 mt-1 text-right">לא נמצאו תוצאות</p>
                    )}
                  </div>
                )}

                {student.parents.length === 0 && !showParentSearch ? (
                  <p className="text-sm text-gray-400 text-center py-4">אין הורים משויכים</p>
                ) : (
                  <div className="divide-y divide-gray-100">
                    {student.parents.map(p => (
                      <div key={p.id} className="flex items-center justify-between px-4 py-2.5 group hover:bg-blue-50/40 transition-colors">
                        <button
                          onClick={() => unlinkParent(p.id)}
                          className="text-xs text-gray-300 hover:text-red-500 transition-colors px-1"
                          title="הסר שיוך"
                        >
                          ✕
                        </button>
                        <button onClick={() => onOpenParent?.(p.id)} className="flex-1 text-right">
                          <span className="font-medium text-gray-800 group-hover:text-[#1a3a7a]">{p.name}</span>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
