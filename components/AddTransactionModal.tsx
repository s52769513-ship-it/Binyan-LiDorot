'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  parentId?: string
  parentName?: string
  onClose: () => void
  onSuccess?: () => void
}

const TRANSACTION_TYPES = ['מזומן', 'העברה בנקאית', 'שיק', 'ביט/פייבוקס', 'אחר']

interface ParentOption { id: string; name: string }

function getMonthYear(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function AddTransactionModal({ parentId, parentName, onClose, onSuccess }: Props) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  const [amount, setAmount]     = useState('')
  const [type, setType]         = useState('מזומן')
  const [date, setDate]         = useState(todayStr)
  const [monthYear, setMonthYear] = useState(getMonthYear(todayStr))
  const [notes, setNotes]       = useState('')
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
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amtNum,
          type, date, monthYear, notes,
          parentIds: selectedParent ? [selectedParent.id] : (parentId ? [parentId] : []),
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

          {/* Parent search (only if not pre-linked) */}
          {!parentId ? (
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
            <div className="bg-blue-50 rounded-lg p-3 text-sm font-medium text-[#1a3a7a]">
              הורה: {parentName}
            </div>
          )}

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סכום ₪ *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0" step="0.01"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            <p className="text-xs text-gray-400 mt-1">חיובי = הכנסה, שלילי = הוצאה</p>
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">אמצעי תשלום</label>
            <div className="flex flex-wrap gap-2">
              {TRANSACTION_TYPES.map(t => (
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
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 disabled:opacity-60 transition-colors">
            {submitting ? 'שומר...' : 'שמור תנועה'}
          </button>
        </div>
      </div>
    </div>
  )
}
