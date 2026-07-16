'use client'

import { useState } from 'react'
import SupplierPicker from '@/components/SupplierPicker'
import { authHeaders } from '@/lib/authHeaders'

const METHODS = ['אשראי', 'הו"ק', 'העברה', 'מזומן', 'אחר']

export interface RecurringPayment {
  id: string
  parentId: string | null
  supplierName: string
  amount: number
  chargeDay: number | null
  paymentMethod: string
  bank: string
  active: boolean
  notes: string
}

export default function RecurringPaymentModal({
  existing, onClose, onSaved,
}: {
  existing?: RecurringPayment | null
  onClose: () => void
  onSaved: () => void
}) {
  const [parentId, setParentId]     = useState<string | null>(existing?.parentId ?? null)
  const [supplierName, setSupplierName] = useState(existing?.supplierName ?? '')
  const [amount, setAmount]         = useState(existing ? String(existing.amount) : '')
  const [chargeDay, setChargeDay]   = useState(existing?.chargeDay ? String(existing.chargeDay) : '')
  const [method, setMethod]         = useState(existing?.paymentMethod ?? 'העברה')
  const [bank, setBank]             = useState(existing?.bank ?? '')
  const [active, setActive]         = useState(existing?.active ?? true)
  const [notes, setNotes]           = useState(existing?.notes ?? '')
  const [saving, setSaving]         = useState(false)
  const [error, setError]           = useState('')

  const save = async () => {
    if (!parentId) { setError('יש לבחור ספק'); return }
    if (!amount || isNaN(Number(amount))) { setError('סכום שגוי'); return }
    setSaving(true); setError('')
    try {
      const payload = {
        parentId, supplierName, amount: Number(amount),
        chargeDay: chargeDay ? Number(chargeDay) : null,
        paymentMethod: method, bank, active, notes,
      }
      const res = existing
        ? await fetch(`/api/recurring-payments/${existing.id}`, {
            method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
        : await fetch('/api/recurring-payments', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
          })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSaved(); onClose()
    } catch { setError('שגיאה בשמירה') } finally { setSaving(false) }
  }

  const remove = async () => {
    if (!existing) return
    if (!confirm('למחוק תשלום קבוע זה?')) return
    setSaving(true)
    try {
      await fetch(`/api/recurring-payments/${existing.id}`, { method: 'DELETE', headers: authHeaders() })
      onSaved(); onClose()
    } catch { setError('שגיאה במחיקה') } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <span className="text-sm font-bold" style={{ color: '#d4a921' }}>{existing ? 'עריכת תשלום קבוע' : 'תשלום קבוע חדש'}</span>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto" dir="rtl">
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <div>
            <label className="text-xs text-gray-400 block mb-1">ספק</label>
            <SupplierPicker
              value={parentId} valueName={supplierName}
              onSelect={p => { setParentId(p?.id ?? null); setSupplierName(p?.name ?? '') }}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">סכום</label>
              <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">תאריך חיוב (יום)</label>
              <input type="number" min={1} max={31} value={chargeDay} onChange={e => setChargeDay(e.target.value)}
                placeholder="1" dir="rtl"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-400 block mb-1">אמצעי תשלום</label>
              <select value={method} onChange={e => setMethod(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30">
                {METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 block mb-1">בנק / כרטיס</label>
              <input value={bank} onChange={e => setBank(e.target.value)} dir="rtl"
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">הערות</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} dir="rtl"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 resize-none" />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={active} onChange={e => setActive(e.target.checked)} className="w-4 h-4" />
            <span className="text-sm text-gray-700">פעיל</span>
          </label>
        </div>

        <div className="px-5 pb-5 pt-3 space-y-2 border-t border-gray-100">
          <button onClick={save} disabled={saving}
            className="w-full py-2 rounded-xl text-sm font-semibold bg-[#1a3a7a] text-white hover:bg-[#0d1f52] disabled:opacity-60 transition-colors">
            {saving ? 'שומר...' : 'שמור'}
          </button>
          {existing && (
            <button onClick={remove} disabled={saving}
              className="w-full py-2 rounded-xl text-sm font-medium border border-red-200 text-red-500 hover:bg-red-50 disabled:opacity-60 transition-colors">
              מחק
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
