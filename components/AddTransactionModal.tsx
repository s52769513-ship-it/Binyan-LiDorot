'use client'

import { useEffect, useRef, useState } from 'react'

const PAYMENT_METHODS = ['העברה', 'מזומן', 'הו"ק', 'אשראי', 'פנימי', 'קיזוז שכר לימוד']

interface ParentOption { id: string; name: string }

function getMonthYear(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

interface Props {
  parentId?: string
  parentName?: string
  fixedLabel?: string        // shows a fixed label instead of parent picker (e.g. "בנין לדורות")
  prefilledAmount?: number
  prefilledNotes?: string
  sourceLabel?: string       // shows a "מקור" chip (e.g. the planned payment name)
  onClose: () => void
  onSuccess?: () => void
}

export default function AddTransactionModal({ parentId, parentName, fixedLabel, prefilledAmount, prefilledNotes, sourceLabel, onClose, onSuccess }: Props) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  const [direction, setDirection] = useState<'הכנסה' | 'הוצאה'>('הכנסה')
  const [amount, setAmount]       = useState(prefilledAmount ? String(Math.abs(prefilledAmount)) : '')
  const [type, setType]           = useState('העברה')
  const [date, setDate]           = useState(todayStr)
  const [monthYear, setMonthYear] = useState(getMonthYear(todayStr))
  const [notes, setNotes]         = useState(prefilledNotes ?? '')
  const [project, setProject]     = useState('')
  const [projects, setProjects]   = useState<string[]>([])
  const [parentSearch, setParentSearch] = useState(parentName ?? '')
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([])
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(
    parentId && parentName ? { id: parentId, name: parentName } : null
  )
  const [showParentDrop, setShowParentDrop] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const parentRef = useRef<HTMLDivElement>(null)

  // Load project list
  useEffect(() => {
    fetch('/api/projects')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setProjects(d) })
      .catch(() => {})
  }, [])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (parentRef.current && !parentRef.current.contains(e.target as Node)) setShowParentDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    if (parentId) return  // pre-linked
    if (!parentSearch.trim()) { setParentOptions([]); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      fetch(`/api/parents?search=${encodeURIComponent(parentSearch)}&page=0`)
        .then(r => r.json())
        .then(d => setParentOptions((d.data ?? []).slice(0, 8).map((p: {id:string;name:string}) => ({ id: p.id, name: p.name }))))
        .catch(() => {})
    }, 300)
  }, [parentSearch, parentId])

  const handleDateChange = (d: string) => {
    setDate(d)
    setMonthYear(getMonthYear(d))
  }

  const handleSubmit = async () => {
    const amtNum = Number(amount)
    if (!amount || isNaN(amtNum) || amtNum === 0) { setError('יש להזין סכום תקין'); return }
    // הוצאה = שלילי, הכנסה = חיובי
    const finalAmount = direction === 'הוצאה' ? -Math.abs(amtNum) : Math.abs(amtNum)
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: finalAmount,
          type, date, monthYear, notes,
          parentIds: selectedParent ? [selectedParent.id] : (parentId ? [parentId] : []),
          projectNames: project ? [project] : [],
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSuccess?.()
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
          <h2 className="text-lg font-bold text-gray-900">הוספת תנועה</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          {/* Direction toggle */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection('הכנסה')}
              className={`py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
                direction === 'הכנסה'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'
              }`}>
              ↙ הכנסה
            </button>
            <button type="button" onClick={() => setDirection('הוצאה')}
              className={`py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
                direction === 'הוצאה'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-red-400'
              }`}>
              ↗ הוצאה
            </button>
          </div>

          {/* Parent search / fixed label */}
          {fixedLabel ? (
            /* Institution-level payment — show fixed label, no picker */
            <div className="space-y-2">
              <div className="bg-[#1a3a7a]/10 rounded-lg p-3 text-sm font-medium text-[#1a3a7a] flex items-center justify-between">
                <span className="text-xs text-[#1a3a7a]/60">מוסד</span>
                <span>{fixedLabel}</span>
              </div>
              {sourceLabel && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-sm flex items-center justify-between">
                  <span className="text-xs text-amber-600">מקור תשלום</span>
                  <span className="font-medium text-amber-800">{sourceLabel}</span>
                </div>
              )}
            </div>
          ) : !parentId ? (
            <div ref={parentRef} className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">הורה</label>
              <input value={selectedParent ? selectedParent.name : parentSearch}
                onChange={e => { setParentSearch(e.target.value); setSelectedParent(null); setShowParentDrop(true) }}
                onFocus={() => setShowParentDrop(true)}
                placeholder="חיפוש הורה..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
              {showParentDrop && parentOptions.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {parentOptions.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setSelectedParent(p); setParentSearch(p.name); setShowParentDrop(false) }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-blue-50 transition-colors">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="bg-blue-50 rounded-lg p-3 text-sm font-medium text-[#1a3a7a] flex items-center justify-between">
                <span className="text-xs text-[#1a3a7a]/60">הורה</span>
                <span>{parentName}</span>
              </div>
              {sourceLabel && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-sm flex items-center justify-between">
                  <span className="text-xs text-amber-600">מקור תשלום</span>
                  <span className="font-medium text-amber-800">{sourceLabel}</span>
                </div>
              )}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סכום ₪ *</label>
            <div className="relative">
              <span className={`absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold ${direction === 'הוצאה' ? 'text-red-500' : 'text-emerald-600'}`}>
                {direction === 'הוצאה' ? '−' : '+'}
              </span>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                placeholder="0" step="0.01" min="0"
                className="w-full pr-7 pl-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
          </div>

          {/* Project */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">קטגוריה / פרויקט</label>
            {projects.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setProject('')}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    project === '' ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                  }`}>
                  ללא
                </button>
                {projects.map(p => (
                  <button key={p} type="button" onClick={() => setProject(p)}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                      project === p
                        ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'
                    }`}>
                    {p}
                  </button>
                ))}
              </div>
            ) : (
              <select value={project} onChange={e => setProject(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30">
                <option value="">ללא קטגוריה</option>
              </select>
            )}
          </div>

          {/* Payment method */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">אמצעי תשלום</label>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_METHODS.map(t => (
                <button key={t} type="button" onClick={() => setType(t)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    type === t ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'
                  }`}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Date + Month */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך</label>
              <input type="date" value={date} onChange={e => handleDateChange(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">חודש/שנה</label>
              <input value={monthYear} onChange={e => setMonthYear(e.target.value)}
                placeholder="MM/YYYY"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 resize-none"
              rows={2} placeholder="תיאור התשלום..." />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60 transition-colors ${
              direction === 'הוצאה' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-700 hover:bg-emerald-800'
            }`}>
            {submitting ? 'שומר...' : direction === 'הוצאה' ? 'שמור הוצאה' : 'שמור הכנסה'}
          </button>
        </div>
      </div>
    </div>
  )
}
