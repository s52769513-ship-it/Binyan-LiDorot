'use client'

import { ParentSummary, SortField, FilterDebt } from '@/lib/types'

function formatCurrency(n: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n)
}

interface Props {
  parents: ParentSummary[]
  total: number
  page: number
  totalPages: number
  loading: boolean
  search: string
  filterStatus: string
  filterDebt: FilterDebt
  sortField: SortField
  sortDir: 'asc' | 'desc'
  statusOptions: string[]
  onSelectParent: (id: string) => void
  onSearch: (v: string) => void
  onFilterStatus: (v: string) => void
  onFilterDebt: (v: FilterDebt) => void
  onSort: (field: SortField) => void
  onPageChange: (p: number) => void
}

export default function ParentList({
  parents, total, page, totalPages, loading,
  search, filterStatus, filterDebt, sortField, sortDir,
  statusOptions,
  onSelectParent, onSearch, onFilterStatus, onFilterDebt, onSort, onPageChange,
}: Props) {

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-[#1a3a7a] ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-gray-100 space-y-3">
        {/* Search + debt filter row */}
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex-1 min-w-[200px]">
            <input
              type="text"
              placeholder="חיפוש לפי שם, עיר, טלפון..."
              value={search}
              onChange={e => onSearch(e.target.value)}
              className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 placeholder:text-gray-400"
            />
          </div>

          {/* Debt/credit buttons */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['all', 'debt', 'credit'] as const).map(d => (
              <button key={d} onClick={() => onFilterDebt(d)}
                className={`px-3 py-2 whitespace-nowrap transition-colors ${
                  filterDebt === d
                    ? d === 'debt' ? 'bg-red-600 text-white' : d === 'credit' ? 'bg-emerald-600 text-white' : 'bg-[#1a3a7a] text-white'
                    : 'bg-white text-gray-600 hover:bg-gray-50'
                }`}>
                {d === 'all' ? 'הכל' : d === 'debt' ? 'חייבים' : 'זכאים'}
              </button>
            ))}
          </div>

          <span className="text-sm text-gray-400">{total} תוצאות</span>
        </div>

        {/* Status filter chips */}
        {statusOptions.length > 0 && (
          <div className="flex flex-wrap gap-2 items-center" dir="rtl">
            <span className="text-xs text-gray-400 ml-1">סטטוס:</span>
            <button
              onClick={() => onFilterStatus('')}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                !filterStatus
                  ? 'bg-[#1a3a7a] text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              הכל
            </button>
            {statusOptions.map(s => (
              <button
                key={s}
                onClick={() => onFilterStatus(filterStatus === s ? '' : s)}
                className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-[#1a3a7a] text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => onSort('last_name')}>
                שם <SortIcon field="last_name" />
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none" onClick={() => onSort('city')}>
                עיר <SortIcon field="city" />
              </th>
              <th className="px-4 py-3">טלפון</th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none text-center" onClick={() => onSort('children_count')}>
                ילדים <SortIcon field="children_count" />
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none text-left" onClick={() => onSort('tuition_total')}>
                שכ"ל <SortIcon field="tuition_total" />
              </th>
              <th className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none text-left" onClick={() => onSort('tuition_balance')}>
                יתרה <SortIcon field="tuition_balance" />
              </th>
              <th className="px-4 py-3">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={7} className="px-4 py-3">
                    <div className="h-8 bg-gray-100 rounded animate-pulse" />
                  </td>
                </tr>
              ))
            ) : parents.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                  לא נמצאו תוצאות
                </td>
              </tr>
            ) : (
              parents.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onSelectParent(p.id)}
                  className="hover:bg-blue-50/40 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 group-hover:text-[#1a3a7a] transition-colors">
                      {p.name || '—'}
                    </p>
                    {p.email && <p className="text-xs text-gray-400">{p.email}</p>}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{p.city || '—'}</td>
                  <td className="px-4 py-3 text-sm text-gray-600" dir="ltr">
                    {p.fatherPhone || p.motherPhone || '—'}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-sm font-medium text-gray-700">
                      {p.childrenCount}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-left text-sm font-medium text-gray-700 tabular-nums">
                    {p.tuitionTotal > 0 ? formatCurrency(p.tuitionTotal) : '—'}
                  </td>
                  <td className="px-4 py-3 text-left tabular-nums">
                    {p.tuitionBalance !== 0 ? (
                      <span className={`text-sm font-semibold ${p.tuitionBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {p.tuitionBalance > 0
                          ? formatCurrency(p.tuitionBalance)
                          : `זכות ${formatCurrency(Math.abs(p.tuitionBalance))}`}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {(p.status ?? []).slice(0, 2).map(s => (
                        <span key={s} className="px-2 py-0.5 bg-[#1a3a7a]/8 text-[#1a3a7a] rounded-full text-xs">
                          {s}
                        </span>
                      ))}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm text-gray-500">
          <button
            onClick={() => onPageChange(Math.max(0, page - 1))}
            disabled={page === 0}
            className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            ← הקודם
          </button>
          <span>עמוד {page + 1} מתוך {totalPages}</span>
          <button
            onClick={() => onPageChange(Math.min(totalPages - 1, page + 1))}
            disabled={page >= totalPages - 1}
            className="px-3 py-1 rounded-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            הבא →
          </button>
        </div>
      )}
    </div>
  )
}
