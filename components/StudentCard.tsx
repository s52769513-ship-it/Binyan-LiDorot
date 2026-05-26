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
}

interface Props {
  studentId: string
  onClose: () => void
  onOpenParent?: (parentId: string) => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

function InlineField({
  label, value, onSave, type = 'text', dir = 'rtl', multiline = false,
}: {
  label: string; value: string; onSave: (v: string) => Promise<void>
  type?: string; dir?: 'rtl' | 'ltr'; multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
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

const TRANSPORT_OPTIONS = ['בוקר', 'צהריים', 'ערב']

export default function StudentCard({ studentId, onClose, onOpenParent }: Props) {
  const [student, setStudent] = useState<StudentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/students/${studentId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setStudent(d) })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }, [studentId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

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
    await patch({ transportation: next })
  }

  const frameworkColor = student?.framework === 'בית חינוך לבנות'
    ? 'bg-pink-100 text-pink-800' : 'bg-blue-100 text-blue-800'

  return (
    <div
      className="flex flex-col bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
      style={{ height: 'calc(100vh - 104px)' }}
    >
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
              {student?.gender && (
                <span className="text-white/50 text-xs">{student.gender === 'נקבה' ? 'בת' : 'בן'}</span>
              )}
            </div>
          </div>
        </div>

        {/* Quick stats strip */}
        {student && (
          <div className="flex gap-px mt-2">
            <div className="flex-1 bg-white/10 rounded-tl-xl px-3 py-2 text-center">
              <p className="text-base font-bold text-white/90">{student.className || '—'}</p>
              <p className="text-[10px] text-white/50">כיתה</p>
            </div>
            <div className="flex-1 bg-white/10 px-3 py-2 text-center">
              <p className="text-base font-bold text-white/90">{student.age || '—'}</p>
              <p className="text-[10px] text-white/50">גיל</p>
            </div>
            <div className="flex-1 bg-white/10 rounded-tr-xl px-3 py-2 text-center">
              <p className="text-base font-bold text-white/90">{student.transportation.length || '—'}</p>
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
            {/* Details */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">פרטים</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4">
                <InlineField label="שם מלא"   value={student.name}      onSave={v => patch({ name: v })} />
                <InlineField label="גיל"      value={String(student.age || '')} onSave={v => patch({ age: v })} />
                <InlineField label="כיתה"     value={student.className} onSave={v => patch({ className: v })} />
                <InlineField label="סטטוס"    value={student.status}    onSave={v => patch({ status: v })} />
              </div>
            </div>

            {/* Transportation */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">הסעות</div>
              <div className="p-4 space-y-3">
                <div className="flex gap-3 flex-wrap">
                  {TRANSPORT_OPTIONS.map(t => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={student.transportation.includes(t)}
                        onChange={() => toggleTransport(t)}
                        className="accent-[#1a3a7a] w-4 h-4"
                      />
                      <span className="text-sm">{t}</span>
                    </label>
                  ))}
                </div>
                {student.transportationCost > 0 && (
                  <p className="text-sm text-gray-500">עלות: <span className="font-semibold text-gray-700">{fmt(student.transportationCost)}</span></p>
                )}
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">הערות</div>
              <div className="p-4">
                <InlineField label="" value={student.notes} onSave={v => patch({ notes: v })} multiline />
              </div>
            </div>

            {/* Parents */}
            {student.parents.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">הורים</div>
                <div className="divide-y divide-gray-100">
                  {student.parents.map(p => (
                    <button
                      key={p.id}
                      onClick={() => onOpenParent?.(p.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors text-right group"
                    >
                      <span className="text-xs text-[#1a3a7a] opacity-0 group-hover:opacity-100">פתח כרטיס ←</span>
                      <span className="font-medium text-gray-800">{p.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
