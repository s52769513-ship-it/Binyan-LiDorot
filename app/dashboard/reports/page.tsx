'use client'

import { useEffect, useRef, useState } from 'react'

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

interface ParentDebt { id: string; amount: number; createdTime: string }
interface ParentTx   { id: string; amount: number; type: string; date: string; notes: string }
interface ParentReportData {
  name: string; city: string; fatherPhone: string; motherPhone: string
  tuitionTotal: number; tuitionBalance: number; childrenCount: number
  debts: ParentDebt[]
  transactions: ParentTx[]
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

/* ─── ParentDebtReportModal ───────────────────────────── */
function ParentDebtReportModal({ parentId, onClose }: { parentId: string; onClose: () => void }) {
  const [data, setData] = useState<ParentReportData | null>(null)
  const [loading, setLoading] = useState(true)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/parents/${parentId}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setData(d) })
      .finally(() => setLoading(false))
  }, [parentId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const handlePrint = () => {
    if (!printRef.current) return
    const content = printRef.current.innerHTML
    const w = window.open('', '_blank', 'width=820,height=960')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html dir="rtl"><head>
      <meta charset="utf-8"><title>דוח חוב — ${data?.name ?? ''}</title>
      <style>
        body { font-family: Arial, sans-serif; direction: rtl; margin: 24px; color: #111; }
        h1 { font-size: 20px; margin-bottom: 4px; }
        .meta { font-size: 13px; color: #555; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f3f4f6; font-size: 11px; padding: 6px 10px; text-align: right; }
        td { padding: 7px 10px; font-size: 13px; border-bottom: 1px solid #e5e7eb; text-align: right; }
        .amount { text-align: left; font-variant-numeric: tabular-nums; }
        .red { color: #dc2626; font-weight: 700; }
        .green { color: #059669; font-weight: 700; }
        .section-title { font-size: 13px; font-weight: 700; margin-bottom: 6px; color: #1a3a7a; }
        .balance-bar { background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 12px 16px; margin-top: 16px; display: flex; justify-content: space-between; }
        @media print { body { margin: 12px; } }
      </style>
    </head><body>${content}</body></html>`)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 400)
  }

  const totalDebts = data?.debts.reduce((s, d) => s + d.amount, 0) ?? 0
  const totalPaid  = data?.transactions.reduce((s, t) => s + t.amount, 0) ?? 0

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors" aria-label="סגור">✕</button>
            <button onClick={handlePrint} disabled={loading || !data}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a3a7a] text-white text-sm font-medium hover:bg-[#0d1f52] disabled:opacity-40 transition-colors">
              🖨 הדפסה / PDF
            </button>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-900">דוח חוב אישי</h2>
            {data && <p className="text-sm text-gray-500">{data.name}</p>}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5" dir="rtl">
          {loading && (
            <div className="space-y-3">{[1,2,3].map(i =>
              <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
          )}
          {data && (
            <div ref={printRef}>
              {/* Parent info */}
              <div className="mb-5">
                <h1 className="text-xl font-bold text-gray-900">{data.name}</h1>
                <div className="text-sm text-gray-500 mt-1 space-x-3 flex flex-wrap gap-x-4 gap-y-1">
                  {data.city && <span>📍 {data.city}</span>}
                  {data.fatherPhone && <span dir="ltr">📞 {data.fatherPhone}</span>}
                  {data.motherPhone && data.motherPhone !== data.fatherPhone &&
                    <span dir="ltr">📞 {data.motherPhone}</span>}
                  <span>👨‍👩‍👧‍👦 {data.childrenCount} ילדים</span>
                  <span className="text-gray-400">הודפס: {new Date().toLocaleDateString('he-IL')}</span>
                </div>
              </div>

              {/* Debts */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#1a3a7a] uppercase tracking-wide mb-2">חובות פתוחים ({data.debts.length})</p>
                {data.debts.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">אין חובות פתוחים</p>
                ) : (
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100 text-xs text-gray-500">
                          <th className="px-4 py-2 text-right">תאריך</th>
                          <th className="px-4 py-2 text-left">סכום חוב</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.debts.map(d => (
                          <tr key={d.id}>
                            <td className="px-4 py-2.5 text-gray-600">
                              {d.createdTime ? new Date(d.createdTime).toLocaleDateString('he-IL') : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-left tabular-nums font-semibold text-red-600">{fmt(d.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-red-50">
                          <td className="px-4 py-2.5 text-right text-sm font-bold text-red-700">סה"כ חובות</td>
                          <td className="px-4 py-2.5 text-left tabular-nums font-bold text-red-700">{fmt(totalDebts)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Transactions / payments */}
              <div className="mb-4">
                <p className="text-xs font-semibold text-[#1a3a7a] uppercase tracking-wide mb-2">תשלומים ({data.transactions.length})</p>
                {data.transactions.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">אין תשלומים</p>
                ) : (
                  <div className="bg-gray-50 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-100 text-xs text-gray-500">
                          <th className="px-4 py-2 text-right">תאריך</th>
                          <th className="px-4 py-2 text-right">סוג</th>
                          <th className="px-4 py-2 text-right">הערות</th>
                          <th className="px-4 py-2 text-left">סכום</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {data.transactions.map(tx => (
                          <tr key={tx.id}>
                            <td className="px-4 py-2.5 text-gray-600">
                              {tx.date ? new Date(tx.date).toLocaleDateString('he-IL') : '—'}
                            </td>
                            <td className="px-4 py-2.5 text-gray-700">{tx.type || '—'}</td>
                            <td className="px-4 py-2.5 text-gray-500 text-xs">{tx.notes || ''}</td>
                            <td className="px-4 py-2.5 text-left tabular-nums font-semibold text-emerald-700">{fmt(tx.amount)}</td>
                          </tr>
                        ))}
                        <tr className="bg-emerald-50">
                          <td colSpan={3} className="px-4 py-2.5 text-right text-sm font-bold text-emerald-700">סה"כ שולם</td>
                          <td className="px-4 py-2.5 text-left tabular-nums font-bold text-emerald-700">{fmt(totalPaid)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Balance bar */}
              <div className={`rounded-xl p-4 ${data.tuitionBalance > 0 ? 'bg-red-50 border border-red-100' : 'bg-emerald-50 border border-emerald-100'}`}>
                <div className="flex items-center justify-between">
                  <span className={`text-2xl font-bold tabular-nums ${data.tuitionBalance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                    {fmt(Math.abs(data.tuitionBalance))}
                  </span>
                  <span className={`text-sm font-semibold ${data.tuitionBalance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {data.tuitionBalance > 0 ? '⚠️ יתרת חוב לתשלום' : '✓ זכות'}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-1">שכ"ל מקורי: {fmt(data.tuitionTotal)}</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
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
  const [reportParentId, setReportParentId] = useState<string | null>(null)

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
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {debtRows.length === 0
                    ? <tr><td colSpan={7} className="text-center py-10 text-gray-400">אין חובות</td></tr>
                    : debtRows.map(r => (
                    <tr key={r.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900 text-right">{r.parentName}</td>
                      <td className="px-4 py-3 text-gray-500 text-right">{r.city || '—'}</td>
                      <td className="px-4 py-3 text-center text-gray-600">{r.childrenCount}</td>
                      <td className="px-4 py-3 text-left tabular-nums text-gray-700">{fmt(r.tuitionTotal)}</td>
                      <td className="px-4 py-3 text-left tabular-nums font-semibold text-red-600">{fmt(r.tuitionBalance)}</td>
                      <td className="px-4 py-3 text-right text-xs text-gray-500" dir="ltr">
                        {r.fatherPhone || r.motherPhone || '—'}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setReportParentId(r.id)}
                          className="px-2 py-1 text-xs rounded-lg border border-[#1a3a7a]/30 text-[#1a3a7a] hover:bg-[#1a3a7a]/5 transition-colors whitespace-nowrap"
                        >
                          📄 דוח
                        </button>
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

      {reportParentId && (
        <ParentDebtReportModal parentId={reportParentId} onClose={() => setReportParentId(null)} />
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
