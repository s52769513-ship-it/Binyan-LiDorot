'use client'

import { useState } from 'react'

interface Props {
  onClose: () => void
  onSuccess: () => void
}

export default function CashFundEntryModal({ onClose, onSuccess }: Props) {
  const now = new Date()
  const todayStr = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`

  const [direction, setDirection] = useState<'הפקדה' | 'משיכה'>('הפקדה')
  const [amount, setAmount]       = useState('')
  const [date, setDate]           = useState(todayStr)
  const [notes, setNotes]         = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]         = useState('')

  const handleSubmit = async () => {
    const amtNum = Number(amount)
    if (!amount || isNaN(amtNum) || amtNum <= 0) { setError('יש להזין סכום תקין'); return }
    setSubmitting(true); setError('')
    try {
      const res = await fetch('/api/cash-fund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: direction === 'משיכה' ? -amtNum : amtNum,
          date, notes,
        }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSuccess()
      onClose()
    } catch { setError('שגיאה בשמירה') }
    finally { setSubmitting(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden" dir="rtl">
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500">✕</button>
          <h2 className="text-lg font-bold text-gray-900">תנועה בקופת מזומנים</h2>
        </div>

        <div className="p-5 space-y-4">
          {error && <div className="bg-red-50 text-red-700 rounded-lg p-3 text-sm">{error}</div>}

          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={() => setDirection('הפקדה')}
              className={`py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
                direction === 'הפקדה'
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'
              }`}>
              ↙ הפקדה
            </button>
            <button type="button" onClick={() => setDirection('משיכה')}
              className={`py-3 rounded-xl text-sm font-bold border-2 transition-colors ${
                direction === 'משיכה'
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-red-400'
              }`}>
              ↗ משיכה
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">סכום ₪ *</label>
            <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
              placeholder="0" step="0.01" min="0"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">תאריך</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 resize-none"
              rows={2} placeholder="תיאור..." />
          </div>
        </div>

        <div className="p-4 border-t border-gray-100 flex gap-3">
          <button onClick={onClose} className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-700 hover:bg-gray-50">
            ביטול
          </button>
          <button onClick={handleSubmit} disabled={submitting}
            className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-medium disabled:opacity-60 transition-colors ${
              direction === 'משיכה' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-700 hover:bg-emerald-800'
            }`}>
            {submitting ? 'שומר...' : direction === 'משיכה' ? 'שמור משיכה' : 'שמור הפקדה'}
          </button>
        </div>
      </div>
    </div>
  )
}
