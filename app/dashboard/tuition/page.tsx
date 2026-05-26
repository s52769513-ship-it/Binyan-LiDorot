'use client'

import { useEffect, useMemo, useState } from 'react'
import ParentCard from '@/components/ParentCard'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

const STATUS_STYLE: Record<string, string> = {
  'שולם':  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'חלקי':  'bg-amber-50  text-amber-700  border-amber-200',
  'ממתין': 'bg-red-50    text-red-700    border-red-200',
}

interface KidRow {
  id: string; studentId: string; studentName: string; className: string
  gender: string; status: string; parentId: string; parentName: string
  expected: number; paid: number; balance: number; numSiblings: number
  paymentStatus: 'שולם' | 'חלקי' | 'ממתין'
}

interface KidsData {
  rows: KidRow[]
  month: string
  months: string[]
  summary: { totalExpected: number; totalPaid: number; totalBalance: number; totalKids: number }
}

export default function TuitionPage() {
  const [data, setData]         = useState<KidsData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [month, setMonth]       = useState('')
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatus] = useState('')
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  const load = (m?: string) => {
    setLoading(true)
    setError('')
    const url = m ? `/api/tuition/kids?month=${encodeURIComponent(m)}` : '/api/tuition/kids'
    fetch(url)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setData(d); if (!month && d.month) setMonth(d.month) } })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleMonthChange = (m: string) => { setMonth(m); load(m) }

  const filtered = useMemo(() => {
    let rows = data?.rows ?? []
    if (search.trim()) rows = rows.filter(r =>
      r.studentName.includes(search) || r.parentName.includes(search) || r.className.includes(search)
    )
    if (statusFilter) rows = rows.filter(r => r.paymentStatus === statusFilter)
    return rows
  }, [data, search, statusFilter])

  // Group by className
  const grouped = useMemo(() => {
    const map = new Map<string, KidRow[]>()
    for (const r of filtered) {
      const cls = r.className || 'ללא כיתה'
      if (!map.has(cls)) map.set(cls, [])
      map.get(cls)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'he'))
  }, [filtered])

  const summary = data?.summary

  const toggleClass = (cls: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(cls) ? next.delete(cls) : next.add(cls)
      return next
    })

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">שכר לימוד</h2>
        {summary && !loading && (
          <span className="text-sm text-gray-400">{summary.totalKids} ילדים</span>
        )}
      </div>

      {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

      {/* Summary KPIs */}
      {!loading && summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'סה"כ לתשלום', value: summary.totalExpected, color: 'text-gray-800', bg: 'bg-white' },
            { label: 'שולם',         value: summary.totalPaid,     color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'נותר לגביה',   value: summary.totalBalance,  color: 'text-red-600',     bg: 'bg-red-50' },
          ].map(c => (
            <div key={c.label} className={`${c.bg} rounded-xl border border-gray-200 p-4`}>
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>₪{fmt(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {data?.months && data.months.length > 1 && (
          <select
            value={month}
            onChange={e => handleMonthChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white"
          >
            {data.months.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש ילד / הורה / כיתה..."
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
        />

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['', 'ממתין', 'חלקי', 'שולם'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s === statusFilter ? '' : s)}
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

        {(search || statusFilter) && (
          <button onClick={() => { setSearch(''); setStatus('') }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">
            נקה
          </button>
        )}
      </div>

      {/* Table grouped by class */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i =>
          <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="h-10 bg-gray-100 animate-pulse" />
            {[1,2,3].map(j => <div key={j} className="h-12 border-t border-gray-100 bg-gray-50/50 animate-pulse" />)}
          </div>
        )}</div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
          {data?.rows.length === 0 ? 'אין נתונים לחודש זה' : 'אין תוצאות לחיפוש'}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([cls, kids]) => {
            const isOpen = !collapsed.has(cls)
            const clsExpected = kids.reduce((s, k) => s + k.expected, 0)
            const clsPaid     = kids.reduce((s, k) => s + k.paid,     0)
            const clsBalance  = kids.reduce((s, k) => s + Math.max(0, k.balance), 0)
            const pct = clsExpected > 0 ? Math.round((clsPaid / clsExpected) * 100) : 0

            return (
              <div key={cls} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Class header */}
                <button
                  onClick={() => toggleClass(cls)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-right border-b border-gray-200"
                >
                  <span className="text-gray-400 text-xs">{isOpen ? '▼' : '▶'}</span>
                  <span className="font-semibold text-gray-800">{cls}</span>
                  <span className="text-xs text-gray-400">{kids.length} ילדים</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500 tabular-nums hidden sm:inline">צפוי ₪{fmt(clsExpected)}</span>
                    <span className="text-emerald-700 font-medium tabular-nums">שולם ₪{fmt(clsPaid)}</span>
                    {clsBalance > 0 && <span className="text-red-600 font-medium tabular-nums">נותר ₪{fmt(clsBalance)}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 tabular-nums">
                      {pct}%
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="text-xs font-semibold text-gray-400 uppercase text-right border-b border-gray-100">
                          <th className="px-4 py-2">ילד</th>
                          <th className="px-4 py-2">הורה</th>
                          <th className="px-4 py-2 text-left">לתשלום</th>
                          <th className="px-4 py-2 text-left">שולם</th>
                          <th className="px-4 py-2 text-left">יתרה</th>
                          <th className="px-4 py-2 text-center">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {kids.map(kid => (
                          <tr key={kid.id}
                            onClick={() => setSelectedParent(kid.parentId)}
                            className="cursor-pointer hover:bg-blue-50/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 text-sm">{kid.studentName}</div>
                              {kid.numSiblings > 1 && (
                                <div className="text-xs text-gray-400">{kid.numSiblings} ילדים במשפחה</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{kid.parentName}</td>
                            <td className="px-4 py-3 text-left text-sm tabular-nums text-gray-700">₪{fmt(kid.expected)}</td>
                            <td className="px-4 py-3 text-left text-sm tabular-nums text-emerald-700 font-medium">₪{fmt(kid.paid)}</td>
                            <td className="px-4 py-3 text-left text-sm tabular-nums font-semibold">
                              {kid.balance > 0
                                ? <span className="text-red-600">₪{fmt(kid.balance)}</span>
                                : <span className="text-emerald-600 text-base">✓</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[kid.paymentStatus] ?? ''}`}>
                                {kid.paymentStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedParent && (
        <ParentCard parentId={selectedParent} onClose={() => setSelectedParent(null)} />
      )}
    </div>
  )
}
