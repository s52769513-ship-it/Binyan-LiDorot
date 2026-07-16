'use client'

import { useState } from 'react'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

export interface RunLite {
  id: string
  supplierName: string
  monthYear: string
  amountDue: number
  amountPaid: number
  paymentMethod: string
  status: string
}

export default function PayRunModal({
  run, onClose, onSaved,
}: {
  run: RunLite
  onClose: () => void
  onSaved: () => void
}) {
  const isCredit = (run.paymentMethod || '').trim() === 'אשראי'
  const [amountPaid, setAmountPaid] = useState(String(run.amountPaid > 0 ? run.amountPaid : run.amountDue))
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState('')

  const submit = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/recurring-payments/runs/${run.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountPaid: Number(amountPaid) }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSaved(); onClose()
    } catch { setError('שגיאה בשמירה') } finally { setSaving(false) }
  }

  const unpay = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/recurring-payments/runs/${run.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unpay: true }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSaved(); onClose()
    } catch { setError('שגיאה') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <span className="text-sm font-bold" style={{ color: '#d4a921' }}>סימון תשלום</span>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3" dir="rtl">
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-gray-800">{run.supplierName}</span>
            <span className="text-xs text-gray-400">{run.monthYear}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="tabular-nums font-medium">{fmt(run.amountDue)}</span>
            <span className="text-gray-500">סכום לתשלום</span>
          </div>

          {isCredit && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
              אשראי: לא נוצרת תנועה כעת — הסכום ייכנס למשימת &quot;לשלם לבעל הכרטיס&quot; בסוף החודש.
            </div>
          )}

          <div>
            <label className="text-xs text-gray-400 block mb-1">סכום ששולם</label>
            <input type="number" value={amountPaid} onChange={e => setAmountPaid(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            {Number(amountPaid) < run.amountDue && Number(amountPaid) > 0 && (
              <p className="text-[11px] text-amber-600 mt-1">תשלום חלקי — יישאר כמשימה פתוחה</p>
            )}
          </div>
        </div>

        <div className="px-5 pb-5 pt-3 space-y-2 border-t border-gray-100">
          <button onClick={submit} disabled={saving}
            className="w-full py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
            {saving ? 'שומר...' : 'שולם'}
          </button>
          {(run.status === 'done' || run.amountPaid > 0) && (
            <button onClick={unpay} disabled={saving}
              className="w-full py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-60 transition-colors">
              בטל סימון
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
