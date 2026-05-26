'use client'

import { useEffect, useState } from 'react'

interface DebtRow {
  id: string
  parentName: string
  city: string
  fatherPhone: string
  motherPhone: string
  tuitionTotal: number
  tuitionBalance: number
  childrenCount: number
}

interface TuitionRow {
  id: string
  parentName: string
  paymentName: string
  amount: number
  paid: number
  balance: number
  monthYear: string
  status: 'שולם' | 'חלקי' | 'ממתין'
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const STATUS_STYLE: Record<string, string> = {
  'שולם':  'bg-emerald-50 text-emerald-700',
  'חלקי':  'bg-amber-50 text-amber-700',
  'ממתין': 'bg-red-50 text-red-700',
}

type ReportType = 'debts' | 'tuition' | 'students-per-class'

interface ClassRow { className: string; framework: string; count: number }

export default function ReportsPage() {
  const [report, setReport] = useState<ReportType>('debts')
  const [loading, setLoading] = useState(false)
  const [debtRows, setDebtRows] = useState<DebtRow[]>([])
  const [tuitionRows, setTuitionRows] = useState<TuitionRow[]>([])
  const [tuitionMonth, setTuitionMonth] = useState('')
  const [tuitionMonths, setTuitionMonths] = useState<string[]>([])
  const [classRows, setClassRows] = useState<ClassRow[]>([])
  const [tuitionSummary, setTuitionSummary] = useState({ totalAmount: 0, totalPaid: 0, totalRemaining: 0 })

  // Load debt report
  useEffect(() => {
    if (report !== 'debts') return
    setLoading(true)
    fetch('/api/parents?debt=debt&sort=tuition_balance&dir=desc&page=0&search=&status=')
      .then(r => r.json())
      .then(d => {
        const rows = (d.data ?? []).map((p: DebtRow & { name: string }) => ({
          id: p.id,
          parentName: p.name ?? (p as unknown as { firstName?: string; lastName?: string }).firstName + ' ' + (p as unknown as { firstName?: string; lastName?: string }).lastName,
          city: p.city,
          fatherPhone: p.fatherPhone,
          motherPhone: p.motherPhone,
          tuitionTotal: p.tuitionTotal,
          tuitionBalance: p.tuitionBalance,
          childrenCount: p.childrenCount,
        }))
        setDebtRows(rows)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [report])

  // Load tuition report
  useEffect(() => {
    if (report !== 'tuition') return
    setLoading(true)
    const params = tuitionMonth ? `?month=${encodeURIComponent(tuitionMonth)}` : ''
    fetch(`/api/tuition${params}`)
      .then(r => r.json())
      .then(d => {
        setTuitionRows(d.rows ?? [])
        setTuitionMonths(d.months ?? [])
        setTuitionSummary(d.summary ?? { totalAmount: 0, totalPaid: 0, totalRemaining: 0 })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [report, tuitionMonth])

  // Load class report
  useEffect(() => {
    if (report !== 'students-per-class') return
    setLoading(true)
    fetch('/api/students')
      .then(r => r.json())
      .then(d => {
        const map: Record<string, ClassRow> = {}
        for (const s of (d.data ?? [])) {
          const key = s.className || 'לא משויך'
          if (!map[key]) map[key] = { className: key, framework: s.framework || '', count: 0 }
          map[key].count++
        }
        setClassRows(Object.values(map).sort((a, b) => a.className.localeCompare(b.className, 'he')))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [report])

  const printReport = () => window.print()

  const totalDebt = debtRows.reduce((s, r) => s + Math.max(0, r.tuitionBalance), 0)

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={printReport}
          className="px-4 py-2 rounded-lg text-sm font-medium border border-gray-200 bg-white hover:bg-gray-50 flex items-center gap-2"
        >
          <span>🖨</span> הדפסה
        </button>
        <h2 className="text-2xl font-bold text-gray-800">דוחות</h2>
      </div>

      {/* Report selector */}
      <div className="flex gap-2 flex-wrap justify-end" dir="rtl">
        {([
          ['debts',             'דוח חובות'],
          ['tuition',          'שכר לימוד לפי חודש'],
          ['students-per-class','תלמידים לפי כיתה'],
        ] as [ReportType, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setReport(key)}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
              report === key
                ? 'text-white shadow-sm'
                : 'bg-white border border-gray-200 text-gray-600 hover:border-[#1a3a7a]/40'
            }`}
            style={report === key ? { background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' } : {}}
          >{label}</button>
        ))}
      </div>

      {loading && (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      )}

      {/* ── DEBT REPORT ── */}
      {!loading && report === 'debts' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <div className="bg-red-50 rounded-xl border border-red-100 p-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-red-700">{fmt(totalDebt)}</p>
              <p className="text-xs text-gray-500 mt-1">סה"כ חובות</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold tabular-nums text-gray-800">{debtRows.length}</p>
              <p className="text-xs text-gray-500 mt-1">משפחות עם חוב</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-4 py-3">שם</th>
                    <th className="px-4 py-3">עיר</th>
                    <th className="px-4 py-3 text-center">ילדים</th>
                    <th className="px-4 py-3 text-left">שכ"ל</th>
                    <th className="px-4 py-3 text-left">חוב</th>
                    <th className="px-4 py-3">טלפון</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {debtRows.length === 0
                    ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">אין חובות</td></tr>
                    : debtRows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 text-right">{r.parentName}</td>
                      <td className="px-4 py-3 text-gray-500 text-right">{r.city || '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.childrenCount}</td>
                      <td className="px-4 py-3 text-left tabular-nums text-gray-700">{fmt(r.tuitionTotal)}</td>
                      <td className="px-4 py-3 text-left tabular-nums font-semibold text-red-600">{fmt(r.tuitionBalance)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500 dir-ltr">
                        {r.fatherPhone || r.motherPhone || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── TUITION REPORT ── */}
      {!loading && report === 'tuition' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-3">
            <select
              value={tuitionMonth} onChange={e => setTuitionMonth(e.target.value)}
              className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none"
            >
              <option value="">כל החודשים</option>
              {tuitionMonths.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'סה"כ לתשלום', value: tuitionSummary.totalAmount,    color: 'text-gray-800', bg: 'bg-white' },
              { label: 'שולם',         value: tuitionSummary.totalPaid,      color: 'text-emerald-700', bg: 'bg-emerald-50' },
              { label: 'נותר לגביה',   value: tuitionSummary.totalRemaining, color: 'text-red-600', bg: 'bg-red-50' },
            ].map(c => (
              <div key={c.label} className={`${c.bg} rounded-xl border border-gray-200 p-4 text-center`}>
                <p className={`text-xl font-bold tabular-nums ${c.color}`}>{fmt(c.value)}</p>
                <p className="text-xs text-gray-500 mt-1">{c.label}</p>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[600px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-4 py-3">הורה</th>
                    <th className="px-4 py-3">חודש</th>
                    <th className="px-4 py-3 text-left">לתשלום</th>
                    <th className="px-4 py-3 text-left">שולם</th>
                    <th className="px-4 py-3 text-left">יתרה</th>
                    <th className="px-4 py-3 text-center">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {tuitionRows.length === 0
                    ? <tr><td colSpan={6} className="text-center py-10 text-gray-400">אין נתונים</td></tr>
                    : tuitionRows.map(row => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 text-right">{row.parentName}</td>
                      <td className="px-4 py-3 text-gray-500">{row.monthYear}</td>
                      <td className="px-4 py-3 text-left tabular-nums text-gray-700">{fmt(row.amount)}</td>
                      <td className="px-4 py-3 text-left tabular-nums text-emerald-700 font-medium">{fmt(row.paid)}</td>
                      <td className="px-4 py-3 text-left tabular-nums font-semibold text-red-600">
                        {row.balance > 0 ? fmt(row.balance) : <span className="text-emerald-600">✓</span>}
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
        </div>
      )}

      {/* ── CLASS REPORT ── */}
      {!loading && report === 'students-per-class' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{classRows.reduce((s, r) => s + r.count, 0)}</p>
              <p className="text-xs text-gray-500 mt-1">סה"כ תלמידים</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
              <p className="text-2xl font-bold text-gray-800">{classRows.length}</p>
              <p className="text-xs text-gray-500 mt-1">כיתות</p>
            </div>
            <div className="bg-blue-50 rounded-xl border border-blue-100 p-4 text-center">
              <p className="text-2xl font-bold text-blue-700">
                {classRows.filter(r => r.framework === 'תלמוד תורה').reduce((s, r) => s + r.count, 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">תלמוד תורה</p>
            </div>
            <div className="bg-pink-50 rounded-xl border border-pink-100 p-4 text-center">
              <p className="text-2xl font-bold text-pink-700">
                {classRows.filter(r => r.framework === 'בית חינוך לבנות').reduce((s, r) => s + r.count, 0)}
              </p>
              <p className="text-xs text-gray-500 mt-1">בית חינוך לבנות</p>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
                  <th className="px-4 py-3">כיתה</th>
                  <th className="px-4 py-3">מסגרת</th>
                  <th className="px-4 py-3 text-center">מספר תלמידים</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {classRows.map(r => (
                  <tr key={r.className} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900 text-right">{r.className}</td>
                    <td className="px-4 py-3 text-right">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        r.framework === 'בית חינוך לבנות' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
                      }`}>{r.framework || '—'}</span>
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-gray-700">{r.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
