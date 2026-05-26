'use client'

import { ParentSummary } from '@/lib/types'
import { SortField, FilterDebt } from './Dashboard'

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
  onSelectParent, onSearch, onFilterStatus, onFilterDebt, onSort, onPageChange,
}: Props) {

  function SortIcon({ field }: { field: SortField }) {
    if (sortField !== field) return <span className="text-gray-300 ml-1">↕</span>
    return <span className="text-indigo-600 ml-1">{sortDir === 'asc' ? '↑' : '↓'}</span>
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Filters */}
      <div className="p-4 border-b border-gray-100 flex flex-wrap gap-3 items-center">
        <div className="flex-1 min-w-[200px]">
          <input
            type="text"
            placeholder="חיפוש לפי שם, עיר, טלפון..."
            value={search}
            onChange={e => onSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-gray-400"
          />
        </div>

        <select
          value={filterStatus}
          onChange={e => onFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-600"
        >
          <option value="">כל הסטטוסים</option>
          <option value="פעיל">פעיל</option>
          <option value="לא פעיל">לא פעיל</option>
        </select>

        <select
          value={filterDebt}
          onChange={e => onFilterDebt(e.target.value as FilterDebt)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-600"
        >
          <option value="all">חוב/זכות – הכל</option>
          <option value="debt">חייבים בלבד</option>
          <option value="credit">זכאים בלבד</option>
        </select>

        <span className="text-sm text-gray-400 mr-auto">{total} תוצאות</span>
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
                  className="hover:bg-indigo-50/50 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
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
                      <span className={`text-sm font-semibold ${p.tuitionBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {p.tuitionBalance >= 0 ? '+' : ''}{formatCurrency(p.tuitionBalance)}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1 justify-end">
                      {(p.status ?? []).slice(0, 2).map(s => (
                        <span key={s} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs">
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
