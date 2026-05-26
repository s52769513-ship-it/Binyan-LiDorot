'use client'

import { useEffect, useState } from 'react'
import PaymentCard from '@/components/PaymentCard'
import EmployeeCard from '@/components/EmployeeCard'

interface TuitionRow {
  id: string; parentId: string; parentName: string
  amount: number; paid: number; balance: number
  monthYear: string; status: 'שולם' | 'חלקי' | 'ממתין'
}
interface TuitionData {
  rows: TuitionRow[]
  summary: { totalAmount: number; totalPaid: number; totalRemaining: number }
  months: string[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const STATUS_STYLE: Record<string, string> = {
  'שולם': 'bg-emerald-50 text-emerald-700',
  'חלקי': 'bg-amber-50 text-amber-700',
  'ממתין': 'bg-red-50 text-red-700',
}

export default function TuitionPage() {
  const [data, setData]       = useState<TuitionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [month, setMonth]     = useState('')
  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [selectedParentId, setSelectedParentId]   = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/tuition${month ? `?month=${encodeURIComponent(month)}` : ''}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); else setError(d.error) })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }, [month])

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <select value={month} onChange={e => setMonth(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none">
          <option value="">כל החודשים</option>
          {data?.months.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <h2 className="text-2xl font-bold text-gray-800">שכר לימוד</h2>
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

      {data && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'סה"כ לתשלום', value: data.summary.totalAmount,    color: 'text-gray-800',    bg: 'bg-white' },
            { label: 'שולם',         value: data.summary.totalPaid,      color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'נותר לגביה',   value: data.summary.totalRemaining, color: 'text-red-600',     bg: 'bg-red-50' },
          ].map(c => (
            <div key={c.label} className={`${c.bg} rounded-xl border border-gray-200 p-4`}>
              <p className="text-xs text-gray-500 mb-1 text-right">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums text-left ${c.color}`}>{fmt(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px]">
              <thead>
                <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-4 py-3">הורה</th><th className="px-4 py-3">חודש</th>
                  <th className="px-4 py-3 text-left">לתשלום</th><th className="px-4 py-3 text-left">שולם</th>
                  <th className="px-4 py-3 text-left">יתרה</th><th className="px-4 py-3 text-center">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(data?.rows ?? []).length === 0
                  ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">אין נתונים</td></tr>
                  : (data?.rows ?? []).map(row => (
                  <tr key={row.id} onClick={() => setSelectedPaymentId(row.id)}
                    className="cursor-pointer hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 font-medium text-gray-900 text-right">{row.parentName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.monthYear}</td>
                    <td className="px-4 py-3 text-left text-sm tabular-nums text-gray-700">{fmt(row.amount)}</td>
                    <td className="px-4 py-3 text-left text-sm tabular-nums text-emerald-700 font-medium">{fmt(row.paid)}</td>
                    <td className="px-4 py-3 text-left text-sm tabular-nums font-semibold text-red-600">
                      {row.balance > 0 ? fmt(row.balance) : <span className="text-emerald-600">✓</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[row.status] ?? ''}`}>{row.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedPaymentId && (
        <PaymentCard paymentId={selectedPaymentId} onClose={() => setSelectedPaymentId(null)}
          onOpenParent={id => { setSelectedPaymentId(null); setSelectedParentId(id) }} />
      )}
      {selectedParentId && (
        <EmployeeCard parentId={selectedParentId} onClose={() => setSelectedParentId(null)} />
      )}
    </div>
  )
}
