'use client'

import { useEffect, useState } from 'react'
import SupplierPicker from '@/components/SupplierPicker'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

export interface CardTask {
  id: string
  monthYear: string
  cardOwnerParentId: string | null
  cardOwnerName: string
  status: string
  creditDoneTotal: number
}

interface BreakdownRow { supplierName: string; amount: number }

export default function CardPaymentTaskModal({
  task, onClose, onSaved,
}: {
  task: CardTask
  onClose: () => void
  onSaved: () => void
}) {
  const [ownerId, setOwnerId]     = useState<string | null>(task.cardOwnerParentId)
  const [ownerName, setOwnerName] = useState(task.cardOwnerName)
  const [rows, setRows]           = useState<BreakdownRow[]>([])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

  // Load the done credit runs of this month for the breakdown table
  useEffect(() => {
    fetch(`/api/recurring-payments/runs?month=${encodeURIComponent(task.monthYear)}`)
      .then(r => r.json())
      .then(d => {
        const credit = (d.runs ?? []).filter((r: Record<string, unknown>) =>
          String(r.paymentMethod ?? '').trim() === 'אשראי' && r.status === 'done')
        setRows(credit.map((r: Record<string, unknown>) => ({
          supplierName: String(r.supplierName ?? ''), amount: Number(r.amountPaid) || 0,
        })))
      })
      .catch(() => {})
  }, [task.monthYear])

  const total = rows.reduce((s, r) => s + r.amount, 0)

  const markDone = async () => {
    if (!ownerId) { setError('יש לבחור בעל כרטיס'); return }
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/recurring-payments/card-task/${task.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ done: true, cardOwnerParentId: ownerId }),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      onSaved(); onClose()
    } catch { setError('שגיאה') } finally { setSaving(false) }
  }

  const unpay = async () => {
    setSaving(true); setError('')
    try {
      const res = await fetch(`/api/recurring-payments/card-task/${task.id}`, {
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <span className="text-sm font-bold" style={{ color: '#d4a921' }}>לשלם לבעל הכרטיס · {task.monthYear}</span>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto" dir="rtl">
          {error && <p className="text-xs text-red-500 text-center">{error}</p>}

          <div className="bg-indigo-50 rounded-xl p-3 text-center">
            <p className="text-xs text-indigo-500">סה&quot;כ לתשלום</p>
            <p className="text-2xl font-bold text-indigo-800 tabular-nums">{fmt(total)}</p>
            <p className="text-[11px] text-gray-500 mt-0.5">{rows.length} ספקים באשראי</p>
          </div>

          {/* Breakdown table */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <div className="bg-gray-50 border-b px-3 py-1.5 text-xs font-semibold text-gray-500">פירוט</div>
            {rows.length === 0 ? (
              <div className="text-xs text-gray-400 text-center py-3">אין תשלומי אשראי שסומנו כבוצעו החודש</div>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-1.5 text-gray-700">{r.supplierName}</td>
                      <td className="px-3 py-1.5 text-left tabular-nums text-gray-600">{fmt(r.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div>
            <label className="text-xs text-gray-400 block mb-1">בעל הכרטיס (אנ&quot;ש)</label>
            <SupplierPicker
              value={ownerId} valueName={ownerName} personType=""
              onSelect={p => { setOwnerId(p?.id ?? null); setOwnerName(p?.name ?? '') }}
              placeholder="חפש בעל כרטיס..."
            />
          </div>
        </div>

        <div className="px-5 pb-5 pt-3 space-y-2 border-t border-gray-100">
          {task.status === 'done' ? (
            <button onClick={unpay} disabled={saving}
              className="w-full py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-60 transition-colors">
              בטל סימון (מחק תנועה)
            </button>
          ) : (
            <button onClick={markDone} disabled={saving || total <= 0}
              className="w-full py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-60 transition-colors">
              {saving ? 'מבצע...' : 'בוצע — צור תנועה מרוכזת'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
