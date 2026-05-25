'use client'

import { useState, useMemo } from 'react'
import { ParentSummary } from '@/lib/types'

function formatCurrency(n: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n)
}

type SortField = 'name' | 'city' | 'childrenCount' | 'tuitionTotal' | 'tuitionBalance'
type FilterDebt = 'all' | 'debt' | 'credit'

interface Props {
  parents: ParentSummary[]
  onSelectParent: (id: string) => void
}

export default function ParentList({ parents, onSelectParent }: Props) {
  const [search, setSearch] = useState('')
  const [sortField, setSortField] = useState<SortField>('name')
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterDebt, setFilterDebt] = useState<FilterDebt>('all')

  // Collect unique statuses
  const allStatuses = useMemo(() => {
    const s = new Set<string>()
    parents.forEach(p => p.status.forEach(v => s.add(v)))
    return Array.from(s).sort()
  }, [parents])

  const filtered = useMemo(() => {
    let list = [...parents]

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q) ||
        p.fatherPhone.includes(q) ||
        p.motherPhone.includes(q)
      )
    }

    if (filterStatus) {
      list = list.filter(p => p.status.includes(filterStatus))
    }

    if (filterDebt === 'debt') {
      list = list.filter(p => p.tuitionBalance < 0)
    } else if (filterDebt === 'credit') {
      list = list.filter(p => p.tuitionBalance >= 0)
    }

    list.sort((a, b) => {
      let va: string | number = a[sortField]
      let vb: string | number = b[sortField]
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return sortDir === 'asc' ? -1 : 1
      if (va > vb) return sortDir === 'asc' ? 1 : -1
      return 0
    })

    return list
  }, [parents, search, filterStatus, filterDebt, sortField, sortDir])

  function toggleSort(field: SortField) {
    if (sortField === field) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir('asc')
    }
  }

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
            onChange={e => setSearch(e.target.value)}
            className="w-full px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 placeholder:text-gray-400"
          />
        </div>

        {allStatuses.length > 0 && (
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-600"
          >
            <option value="">כל הסטטוסים</option>
            {allStatuses.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        )}

        <select
          value={filterDebt}
          onChange={e => setFilterDebt(e.target.value as FilterDebt)}
          className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 text-gray-600"
        >
          <option value="all">חוב/זכות – הכל</option>
          <option value="debt">חייבים בלבד</option>
          <option value="credit">זכאים בלבד</option>
        </select>

        <span className="text-sm text-gray-400 mr-auto">{filtered.length} / {parents.length}</span>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase tracking-wide">
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
                onClick={() => toggleSort('name')}
              >
                שם <SortIcon field="name" />
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none"
                onClick={() => toggleSort('city')}
              >
                עיר <SortIcon field="city" />
              </th>
              <th className="px-4 py-3">טלפון</th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none text-center"
                onClick={() => toggleSort('childrenCount')}
              >
                ילדים <SortIcon field="childrenCount" />
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none text-left"
                onClick={() => toggleSort('tuitionTotal')}
              >
                שכ"ל <SortIcon field="tuitionTotal" />
              </th>
              <th
                className="px-4 py-3 cursor-pointer hover:text-gray-700 select-none text-left"
                onClick={() => toggleSort('tuitionBalance')}
              >
                יתרה <SortIcon field="tuitionBalance" />
              </th>
              <th className="px-4 py-3">סטטוס</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-gray-400 text-sm">
                  לא נמצאו תוצאות
                </td>
              </tr>
            ) : (
              filtered.map(p => (
                <tr
                  key={p.id}
                  onClick={() => onSelectParent(p.id)}
                  className="hover:bg-indigo-50/50 cursor-pointer transition-colors group"
                >
                  <td className="px-4 py-3">
                    <p className="font-semibold text-gray-900 group-hover:text-indigo-700 transition-colors">
                      {p.name || '—'}
                    </p>
                    {p.email && (
                      <p className="text-xs text-gray-400">{p.email}</p>
                    )}
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
                      {p.status.slice(0, 2).map(s => (
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
    </div>
  )
}
