'use client'

import { useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/authHeaders'

interface Props {
  parentId?: string
  parentName?: string
  initialName?: string
  initialAmount?: number
  initialMonthYear?: string
  /** מתויג ל-pp_type מפורש (למשל 'donation') — אחרת נגזר לפי השם בשרת */
  ppType?: string
  onClose: () => void
  onSuccess?: () => void
}

interface ParentOption { id: string; name: string }

function getMonthYear(dateStr: string): string {
  if (!dateStr) return ''
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return ''
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export default function AddPlannedPaymentModal({ parentId, parentName, initialName, initialAmount, initialMonthYear, ppType, onClose, onSuccess }: Props) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
  const currentMonthYear = `${String(now.getMonth()+1).padStart(2,'0')}/${now.getFullYear()}`

  const [amount, setAmount]   = useState(initialAmount ? String(initialAmount) : '')
  const [name, setName]       = useState(initialName ?? 'שכ"ל')
  const [date, setDate]       = useState(todayStr)
  const [monthYear, setMonthYear] = useState(initialMonthYear ?? currentMonthYear)
  const [parentSearch, setParentSearch] = useState(parentName ?? '')
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([])
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(
    parentId && parentName ? { id: parentId, name: parentName } : null
  )
  const [showParentDrop, setShowParentDrop] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [dupWarning, setDupWarning] = useState<{ amount: number; name: string }[] | null>(null)
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
    if (parentId) return
    if (!parentSearch.trim()) { setParentOptions([]); return }
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => {
      fetch(`/api/parents?search=${encodeURIComponent(parentSearch)}&page=0`)
        .then(r => r.json())
        .then(d => setParentOptions((d.data ?? []).slice(0, 8).map((p: {id:string;name:string}) => ({ id: p.id, name: p.name }))))
        .catch(() => {})
    }, 300)
  }, [parentSearch, parentId])

  const handleDateChange = (d: string) => { setDate(d); setMonthYear(getMonthYear(d)) }

  const handleSubmit = async (force = false) => {
    const amtNum = Number(amount)
    if (!amount || isNaN(amtNum) || amtNum <= 0) { setError('יש להזין סכום חיובי'); return }
    setSubmitting(true); setError('')
    try {
      const pid = selectedParent?.id ?? parentId

      // Warn (not block) if a planned payment of the same type already exists
      // for this parent+month — a common source of duplicate tuition PPs.
      if (!force && pid && monthYear.trim()) {
        const intendedType = ppType ?? (name === 'משכורת' ? 'salary' : 'tuition')
        try {
          const existing = await fetch(
            `/api/planned-payments?parentId=${encodeURIComponent(pid)}&monthYear=${encodeURIComponent(monthYear)}`,
          ).then(r => r.json())
          const dups = (Array.isArray(existing) ? existing : [])
            .filter((pp: { ppType?: string }) => (pp.ppType ?? 'tuition') === intendedType)
            .map((pp: { amount?: number; name?: string }) => ({ amount: Number(pp.amount) || 0, name: String(pp.name ?? '') }))
          if (dups.length > 0) { setDupWarning(dups); setSubmitting(false); return }
        } catch { /* if the check fails, don't block creation */ }
      }

      const res = await fetch('/api/planned-payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ amount: amtNum, name, date, monthYear, parentIds: pid ? [pid] : [], ...(ppType ? { ppType } : {}) }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setDupWarning(null)
      onSuccess?.()
      onClose()
    } catch { setError('שגיאה בשמירה') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[90vh] flex flex-col overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
          <h2 className="text-lg font-bold text-gray-900">תשלום מתוכנן</h2>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

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
            <div className="bg-blue-50 rounded-lg p-3 text-sm font-medium text-[#1a3a7a]">הורה: {parentName}</div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">שם התשלום</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סכום ₪ *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="1500" min="1"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">תאריך יעד</label>
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
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
          <button onClick={() => handleSubmit()} disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-medium hover:bg-amber-600 disabled:opacity-60 transition-colors">
            {submitting ? 'שומר...' : 'שמור'}
          </button>
        </div>
      </div>

      {/* Duplicate warning — a PP of this type already exists for this month */}
      {dupWarning && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDupWarning(null) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5 space-y-3" dir="rtl">
            <p className="text-sm font-bold text-gray-800 text-center">⚠️ כבר קיים תשלום מתוכנן</p>
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              לחודש <b>{monthYear}</b> כבר קיים תשלום מסוג זה:
            </p>
            <div className="space-y-1">
              {dupWarning.map((d, i) => (
                <div key={i} className="text-xs text-gray-600 bg-gray-50 rounded px-2 py-1 flex justify-between">
                  <span className="tabular-nums font-semibold">₪{d.amount.toLocaleString('he-IL')}</span>
                  <span>{d.name || 'תשלום מתוכנן'}</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-amber-600 text-center">ליצור בכל זאת תשלום נוסף לאותו חודש?</p>
            <div className="flex gap-2">
              <button onClick={() => setDupWarning(null)}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                ביטול
              </button>
              <button onClick={() => { setDupWarning(null); handleSubmit(true) }} disabled={submitting}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-amber-500 text-white hover:bg-amber-600 disabled:opacity-60">
                צור בכל זאת
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
