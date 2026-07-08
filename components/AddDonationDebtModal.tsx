'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  /** אם מגיע מתוך כרטיס — קבוע ולא ניתן לשינוי. אחרת בוחרים בן אדם בחלון. */
  parentId?: string
  parentName?: string
  /** Pre-fill the amount (e.g. the donor's monthly donation) */
  defaultAmount?: number
  onClose: () => void
  onSuccess?: () => void
}

interface ParentOption { id: string; name: string }

/* חודש נוכחי בפורמט MM/YYYY */
function currentMY(): string {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
/* MM/YYYY → YYYY-MM (עבור <input type="month">) */
const myToInput = (my: string) => { const [m, y] = my.split('/'); return `${y}-${m}` }
/* YYYY-MM → MM/YYYY */
const inputToMY = (v: string) => { const [y, m] = v.split('-'); return `${m}/${y}` }

/**
 * הוספת חוב מגבית — יוצר PP מגבית (pp_type='donation') לבן אדם.
 * מתוך הכרטיס: השם כבר מקושר לבן אדם ולכן צריך רק סכום וחודש.
 * מתוך עמוד המגבית: אין כרטיס, ולכן בוחרים גם בן אדם.
 */
export default function AddDonationDebtModal({ parentId, parentName, defaultAmount, onClose, onSuccess }: Props) {
  const [amount, setAmount]       = useState(defaultAmount && defaultAmount > 0 ? String(defaultAmount) : '')
  const [monthYear, setMonthYear] = useState(currentMY())
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

  // בחירת בן אדם (רק כשלא מגיע parentId קבוע מתוך כרטיס)
  const [parentSearch, setParentSearch]     = useState('')
  const [parentOptions, setParentOptions]   = useState<ParentOption[]>([])
  const [selectedParent, setSelectedParent] = useState<ParentOption | null>(null)
  const [showParentDrop, setShowParentDrop] = useState(false)
  const debounce  = useRef<ReturnType<typeof setTimeout> | null>(null)
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
        .then(d => setParentOptions((d.data ?? []).slice(0, 8).map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
        .catch(() => {})
    }, 300)
  }, [parentSearch, parentId])

  const handleSubmit = async () => {
    const pid = parentId ?? selectedParent?.id
    if (!pid) { setError('יש לבחור בן אדם'); return }
    const amtNum = Number(amount)
    if (!amount || isNaN(amtNum) || amtNum <= 0) { setError('יש להזין סכום חיובי'); return }
    if (!/^\d{2}\/\d{4}$/.test(monthYear)) { setError('יש לבחור חודש'); return }

    setSubmitting(true); setError('')
    try {
      const [m, y] = monthYear.split('/')
      const res = await fetch('/api/planned-payments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount:    amtNum,
          name:      `דמי מגבית ${monthYear}`,
          date:      `${y}-${m}-01`,
          monthYear,
          parentIds: [pid],
          ppType:    'donation',
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSuccess?.()
      onClose()
    } catch {
      setError('שגיאה בשמירה')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-visible" dir="rtl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100 bg-emerald-50 rounded-t-2xl">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-emerald-100 text-gray-500">✕</button>
          <h2 className="text-lg font-bold text-emerald-800">➕ הוספת חוב מגבית</h2>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          {parentId ? (
            parentName && (
              <div className="bg-emerald-50 rounded-lg p-3 text-sm font-medium text-emerald-800">
                {parentName}
              </div>
            )
          ) : (
            <div ref={parentRef} className="relative">
              <label className="block text-sm font-medium text-gray-700 mb-1">בן אדם *</label>
              <input
                value={selectedParent ? selectedParent.name : parentSearch}
                onChange={e => { setParentSearch(e.target.value); setSelectedParent(null); setShowParentDrop(true) }}
                onFocus={() => setShowParentDrop(true)}
                placeholder="חיפוש בן אדם..."
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
              />
              {showParentDrop && parentOptions.length > 0 && (
                <div className="absolute z-10 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto">
                  {parentOptions.map(p => (
                    <button key={p.id} type="button"
                      onClick={() => { setSelectedParent(p); setParentSearch(p.name); setShowParentDrop(false) }}
                      className="w-full text-right px-3 py-2 text-sm hover:bg-emerald-50 transition-colors">
                      {p.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סכום ₪ *</label>
            <input
              type="number"
              value={amount}
              onChange={e => setAmount(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit() }}
              placeholder="0"
              min="1"
              dir="ltr"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">חודש *</label>
            <input
              type="month"
              value={myToInput(monthYear)}
              onChange={e => e.target.value && setMonthYear(inputToMY(e.target.value))}
              dir="ltr"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300"
            />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose}
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {submitting ? 'שומר...' : 'הוסף חוב'}
          </button>
        </div>
      </div>
    </div>
  )
}
