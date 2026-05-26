'use client'

import { useEffect, useMemo, useState } from 'react'
import PaymentCard from '@/components/PaymentCard'
import EmployeeCard from '@/components/EmployeeCard'
import PaymentChart from '@/components/PaymentChart'

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

type SortCol = 'parent' | 'month' | 'amount' | 'paid' | 'balance'
type SortDir = 'asc' | 'desc'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const STATUS_STYLE: Record<string, string> = {
  'שולם':  'bg-emerald-50 text-emerald-700',
  'חלקי':  'bg-amber-50 text-amber-700',
  'ממתין': 'bg-red-50 text-red-700',
}

export default function TuitionPage() {
  const [data, setData]       = useState<TuitionData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')

  // filters (all client-side)
  const [selectedMonth, setSelectedMonth]   = useState('')
  const [search, setSearch]                 = useState('')
  const [statusFilter, setStatusFilter]     = useState('')
  const [sortCol, setSortCol]               = useState<SortCol>('month')
  const [sortDir, setSortDir]               = useState<SortDir>('asc')

  const [selectedPaymentId, setSelectedPaymentId] = useState<string | null>(null)
  const [selectedParentId, setSelectedParentId]   = useState<string | null>(null)

  // fetch all rows once (no server-side month filter)
  useEffect(() => {
    setLoading(true)
    fetch('/api/tuition')
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d); else setError(d.error) })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }, [])

  // chart data — remaining balance per month
  const chartData = useMemo(() =>
    (data?.months ?? []).map(m => {
      const rows = data!.rows.filter(r => r.monthYear === m)
      return {
        month: m,
        remaining: rows.reduce((s, r) => s + Math.max(0, r.balance), 0),
        total:     rows.reduce((s, r) => s + r.amount, 0),
      }
    }), [data])

  const handleBarClick = (month: string) =>
    setSelectedMonth(prev => prev === month ? '' : month)

  // filtered + sorted rows
  const displayRows = useMemo(() => {
    let rows = data?.rows ?? []
    if (selectedMonth) rows = rows.filter(r => r.monthYear === selectedMonth)
    if (search.trim()) rows = rows.filter(r => r.parentName.includes(search.trim()))
    if (statusFilter)  rows = rows.filter(r => r.status === statusFilter)

    return [...rows].sort((a, b) => {
      let cmp = 0
      if (sortCol === 'parent')  cmp = a.parentName.localeCompare(b.parentName, 'he')
      else if (sortCol === 'month')   cmp = a.monthYear.localeCompare(b.monthYear)
      else if (sortCol === 'amount')  cmp = a.amount  - b.amount
      else if (sortCol === 'paid')    cmp = a.paid    - b.paid
      else if (sortCol === 'balance') cmp = a.balance - b.balance
      return sortDir === 'asc' ? cmp : -cmp
    })
  }, [data, selectedMonth, search, statusFilter, sortCol, sortDir])

  // summary for current view
  const summary = useMemo(() => ({
    totalAmount:    displayRows.reduce((s, r) => s + r.amount,  0),
    totalPaid:      displayRows.reduce((s, r) => s + r.paid,    0),
    totalRemaining: displayRows.reduce((s, r) => s + Math.max(0, r.balance), 0),
  }), [displayRows])

  const handleSort = (col: SortCol) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('asc') }
  }
  function SortIcon({ col }: { col: SortCol }) {
    if (sortCol !== col) return <span className="text-gray-300 mr-0.5">↕</span>
    return <span className="text-[#1a3a7a] mr-0.5">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  const hasFilters = selectedMonth || search || statusFilter

  return (
    <div className="space-y-4" dir="rtl">
      <h2 className="text-2xl font-bold text-gray-800">שכר לימוד</h2>

      {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

      {/* Interactive chart */}
      {!loading && chartData.length > 0 && (
        <PaymentChart data={chartData} selectedMonth={selectedMonth} onBarClick={handleBarClick} />
      )}

      {/* Filters row */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search */}
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש הורה..."
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
        />

        {/* Status filter buttons */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['', 'ממתין', 'חלקי', 'שולם'] as const).map(s => (
            <button key={s} onClick={() => setStatusFilter(s === statusFilter ? '' : s)}
              className={`px-3 py-2 whitespace-nowrap transition-colors ${
                statusFilter === s && s !== ''
                  ? s === 'שולם' ? 'bg-emerald-600 text-white'
                    : s === 'חלקי' ? 'bg-amber-500 text-white'
                    : 'bg-red-600 text-white'
                  : s === '' && !statusFilter ? 'bg-[#1a3a7a] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {s || 'הכל'}
            </button>
          ))}
        </div>

        {/* Month chip (set by chart) */}
        {selectedMonth && (
          <button onClick={() => setSelectedMonth('')}
            className="flex items-center gap-1 px-3 py-2 rounded-lg bg-[#1a3a7a] text-white text-sm">
            {selectedMonth} <span className="opacity-70 text-xs">✕</span>
          </button>
        )}

        {/* Clear all */}
        {hasFilters && (
          <button onClick={() => { setSelectedMonth(''); setSearch(''); setStatusFilter('') }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">
            נקה הכל
          </button>
        )}

        <span className="text-sm text-gray-400 mr-auto">{displayRows.length} שורות</span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'סה"כ לתשלום', value: summary.totalAmount,    color: 'text-gray-800',    bg: 'bg-white' },
          { label: 'שולם',         value: summary.totalPaid,      color: 'text-emerald-700', bg: 'bg-emerald-50' },
          { label: 'נותר לגביה',   value: summary.totalRemaining, color: 'text-red-600',     bg: 'bg-red-50' },
        ].map(c => (
          <div key={c.label} className={`${c.bg} rounded-xl border border-gray-200 p-4`}>
            <p className="text-xs text-gray-500 mb-1">{c.label}</p>
            <p className={`text-xl font-bold tabular-nums text-left ${c.color}`}>{fmt(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Table */}
      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i =>
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[540px]">
              <thead>
                <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase select-none">
                  <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort('parent')}>
                    <SortIcon col="parent" />הורה
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-gray-700" onClick={() => handleSort('month')}>
                    <SortIcon col="month" />חודש
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-gray-700 text-left" onClick={() => handleSort('amount')}>
                    לתשלום<SortIcon col="amount" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-gray-700 text-left" onClick={() => handleSort('paid')}>
                    שולם<SortIcon col="paid" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-gray-700 text-left" onClick={() => handleSort('balance')}>
                    יתרה<SortIcon col="balance" />
                  </th>
                  <th className="px-4 py-3 text-center">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {displayRows.length === 0
                  ? <tr><td colSpan={6} className="text-center py-12 text-gray-400">אין נתונים</td></tr>
                  : displayRows.map(row => (
                    <tr key={row.id} onClick={() => setSelectedPaymentId(row.id)}
                      className="cursor-pointer hover:bg-blue-50/30 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{row.parentName}</td>
                      <td className="px-4 py-3 text-sm text-gray-600">{row.monthYear}</td>
                      <td className="px-4 py-3 text-left text-sm tabular-nums text-gray-700">{fmt(row.amount)}</td>
                      <td className="px-4 py-3 text-left text-sm tabular-nums text-emerald-700 font-medium">{fmt(row.paid)}</td>
                      <td className="px-4 py-3 text-left text-sm tabular-nums font-semibold">
                        {row.balance > 0
                          ? <span className="text-red-600">{fmt(row.balance)}</span>
                          : <span className="text-emerald-600">✓</span>}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLE[row.status] ?? ''}`}>
                          {row.status}
                        </span>
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
        <EmployeeCard parentId={selectedParentId} onClose={() => setSelectedParentId(null)}
          onOpenPayment={id => { setSelectedParentId(null); setSelectedPaymentId(id) }}
        />
      )}
    </div>
  )
}
