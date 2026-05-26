'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardSummary, ParentSummary } from '@/lib/types'
import FinancialSummary from './FinancialSummary'
import ParentList from './ParentList'
import PaymentChart from './PaymentChart'
import ParentCard from './ParentCard'

const EMPTY_SUMMARY: DashboardSummary = {
  totalDebts: 0,
  totalPlannedPayments: 0,
  currentMonthTransactions: 0,
  monthlyData: [],
  lastSync: null,
}

export type SortField = 'last_name' | 'city' | 'children_count' | 'tuition_total' | 'tuition_balance'
export type FilterDebt = 'all' | 'debt' | 'credit'

export default function Dashboard() {
  const [summary, setSummary]             = useState<DashboardSummary>(EMPTY_SUMMARY)
  const [parents, setParents]             = useState<ParentSummary[]>([])
  const [total, setTotal]                 = useState(0)
  const [page, setPage]                   = useState(0)
  const [search, setSearch]               = useState('')
  const [filterStatus, setFilterStatus]   = useState('')
  const [filterDebt, setFilterDebt]       = useState<FilterDebt>('all')
  const [sortField, setSortField]         = useState<SortField>('last_name')
  const [sortDir, setSortDir]             = useState<'asc' | 'desc'>('asc')
  const [selectedId, setSelectedId]       = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingParents, setLoadingParents] = useState(true)
  const [error, setError]                 = useState('')

  // Debounced search
  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  const loadSummary = useCallback(() => {
    setLoadingSummary(true)
    fetch('/api/summary')
      .then(r => r.json())
      .then(d => { if (!d.error) setSummary(d); else setError(d.error) })
      .catch(() => setError('שגיאה בחיבור לשרת'))
      .finally(() => setLoadingSummary(false))
  }, [])

  const loadParents = useCallback(() => {
    setLoadingParents(true)
    const params = new URLSearchParams({
      page: String(page),
      search: debouncedSearch,
      status: filterStatus,
      debt: filterDebt,
      sort: sortField,
      dir: sortDir,
    })
    fetch(`/api/parents?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setParents(d.data ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => setError('שגיאה בטעינת הורים'))
      .finally(() => setLoadingParents(false))
  }, [page, debouncedSearch, filterStatus, filterDebt, sortField, sortDir])

  useEffect(() => { loadSummary() }, [loadSummary])
  useEffect(() => { loadParents() }, [loadParents])

  // Reset to page 0 on filter/sort change
  const handleSearch = (v: string) => { setSearch(v); setPage(0) }
  const handleStatus = (v: string) => { setFilterStatus(v); setPage(0) }
  const handleDebt   = (v: FilterDebt) => { setFilterDebt(v); setPage(0) }
  const handleSort   = (field: SortField) => {
    if (sortField === field) { setSortDir(d => d === 'asc' ? 'desc' : 'asc') }
    else { setSortField(field); setSortDir('asc') }
    setPage(0)
  }

  const totalPages = Math.ceil(total / 50)

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-end">
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">בנין לדורות</h1>
            <p className="text-xs text-gray-500">מערכת ניהול · תלמוד תורה ובית חינוך</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
            <button onClick={() => { loadSummary(); loadParents() }} className="text-red-600 underline text-xs">נסה שוב</button>
            <span>{error}</span>
          </div>
        )}

        {loadingSummary ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : (
          <FinancialSummary summary={summary} />
        )}

        {!loadingSummary && summary.monthlyData.some(d => d.amount > 0) && (
          <PaymentChart data={summary.monthlyData} />
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">
              {loadingParents ? 'טוען...' : `${total} אנ"ש`}
            </span>
            <h2 className="text-lg font-bold text-gray-800">רשימת אנ"ש</h2>
          </div>

          {loadingParents && parents.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8">
              <div className="space-y-3 animate-pulse">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            </div>
          ) : (
            <ParentList
              parents={parents}
              total={total}
              page={page}
              totalPages={totalPages}
              loading={loadingParents}
              search={search}
              filterStatus={filterStatus}
              filterDebt={filterDebt}
              sortField={sortField}
              sortDir={sortDir}
              onSelectParent={setSelectedId}
              onSearch={handleSearch}
              onFilterStatus={handleStatus}
              onFilterDebt={handleDebt}
              onSort={handleSort}
              onPageChange={setPage}
            />
          )}
        </div>
      </main>

      {selectedId && (
        <ParentCard parentId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
