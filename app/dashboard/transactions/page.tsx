'use client'

import { useEffect, useMemo, useState } from 'react'
import AddTransactionModal from '@/components/AddTransactionModal'
import ParentCard from '@/components/ParentCard'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

const fmtDate = (d: string) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return day ? `${day}/${m}/${y.slice(2)}` : d
}

interface TxRow {
  id: string; amount: number; type: string; date: string
  monthYear: string; notes: string; parentName: string; parentIds: string[]
  projectNames: string[]
}

export default function TransactionsPage() {
  const [rows, setRows]         = useState<TxRow[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const [month, setMonth]       = useState('')
  const [type, setType]         = useState('')
  const [months, setMonths]     = useState<string[]>([])
  const [types, setTypes]       = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [selectedParent, setSelectedParent] = useState<string | null>(null)

  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 350); return () => clearTimeout(t) }, [search])

  const PAGE_SIZE = 50

  const load = () => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (month) params.set('month', month)
    if (type)  params.set('type', type)
    fetch(`/api/transactions?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.data ?? [])
        setTotal(d.total ?? 0)
        if (d.months?.length) setMonths(d.months)
        if (d.types?.length)  setTypes(d.types)
      })
      .catch(() => setError('שגיאה בטעינת תנועות'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { setPage(0) }, [debouncedSearch, month, type])
  useEffect(() => { load() }, [page, debouncedSearch, month, type])

  const totalIncome  = useMemo(() => rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0), [rows])
  const totalExpense = useMemo(() => rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0), [rows])
  const totalPages   = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">תנועות</h2>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors">
          <span className="text-lg leading-none">+</span> הוספת תנועה
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      {/* Summary row */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">סה"כ בעמוד</p>
            <p className="text-lg font-bold text-gray-700">{rows.length} מתוך {total}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <p className="text-xs text-gray-500 mb-1">הכנסות בעמוד</p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">+₪{fmt(totalIncome)}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <p className="text-xs text-gray-500 mb-1">הוצאות בעמוד</p>
            <p className="text-lg font-bold text-red-600 tabular-nums">−₪{fmt(Math.abs(totalExpense))}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם הורה..."
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />

        {months.length > 0 && (
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30">
            <option value="">כל החודשים</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}

        {types.length > 0 && (
          <select value={type} onChange={e => setType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30">
            <option value="">כל הסוגים</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {(search || month || type) && (
          <button onClick={() => { setSearch(''); setMonth(''); setType('') }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">נקה</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">אין תנועות</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase text-right bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3">הורה</th>
                  <th className="px-4 py-3">סוג</th>
                  <th className="px-4 py-3">חודש</th>
                  <th className="px-4 py-3">הערות</th>
                  <th className="px-4 py-3 text-left">סכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(tx => (
                  <tr key={tx.id} className="hover:bg-gray-50/60 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500 tabular-nums whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td className="px-4 py-3">
                      {tx.parentName ? (
                        <button onClick={() => setSelectedParent(tx.parentIds[0])}
                          className="text-sm font-medium text-[#1a3a7a] hover:underline">
                          {tx.parentName}
                        </button>
                      ) : <span className="text-sm text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tx.type || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{tx.monthYear || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[150px] truncate">{tx.notes || '—'}</td>
                    <td className="px-4 py-3 text-left">
                      <span className={`text-sm font-bold tabular-nums ${tx.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {tx.amount < 0 ? '−' : '+'}₪{fmt(tx.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                ‹ הבא
              </button>
              <span className="text-sm text-gray-500">עמוד {page + 1} מתוך {totalPages}</span>
              <button onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                הקודם ›
              </button>
            </div>
          )}
        </div>
      )}

      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); load() }} />}
      {selectedParent && <ParentCard parentId={selectedParent} onClose={() => setSelectedParent(null)} />}
    </div>
  )
}
