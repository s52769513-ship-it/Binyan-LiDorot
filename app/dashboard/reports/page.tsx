'use client'

import { useEffect, useRef, useState } from 'react'
import type jsPDFType from 'jspdf'

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

interface ParentPlanned { id: string; name: string; amount: number; date: string; monthYear: string; balance: number }
interface ParentTx      { id: string; amount: number; type: string; date: string; monthYear: string; notes: string }
interface ParentReportData {
  name: string; city: string; fatherPhone: string; motherPhone: string
  tuitionTotal: number; tuitionBalance: number; childrenCount: number
  plannedPayments: ParentPlanned[]
  transactions: ParentTx[]
}
interface Settings { institution_name?: string; logo_url?: string }

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
function buildPrintHtml(data: ParentReportData, settings: Settings, txByMonth: Record<string, ParentTx[]>): string {
  const logoTag = settings.logo_url
    ? `<img src="${settings.logo_url}" alt="לוגו" style="height:70px;object-fit:contain;" />`
    : `<div style="font-size:18px;font-weight:700;color:#1a3a7a;">${settings.institution_name ?? 'מוסד'}</div>`

  const fmtCur = (n: number) =>
    new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
  const fmtDate = (d: string) => d ? new Date(d).toLocaleDateString('he-IL') : '—'

  const ppRows = data.plannedPayments.map(pp => {
    const linked = txByMonth[pp.monthYear] ?? []
    const paidAmt = linked.reduce((s, t) => s + t.amount, 0)
    const txRows = linked.map(tx =>
      `<tr style="background:#f0fdf4;">
        <td style="padding:5px 10px;font-size:11px;color:#555;">↳ שולם ${fmtDate(tx.date)}</td>
        <td style="padding:5px 10px;font-size:11px;color:#555;">${tx.type || ''}</td>
        <td style="padding:5px 10px;font-size:11px;color:#555;">${tx.notes || ''}</td>
        <td style="padding:5px 10px;text-align:left;font-size:12px;color:#059669;font-weight:600;">${fmtCur(tx.amount)}</td>
      </tr>`
    ).join('')
    const balColor = pp.balance > 0 ? '#dc2626' : '#059669'
    return `
      <tr style="background:#fff;">
        <td style="padding:7px 10px;font-weight:600;">${pp.monthYear}</td>
        <td style="padding:7px 10px;">${pp.name || ''}</td>
        <td style="padding:7px 10px;text-align:left;font-variant-numeric:tabular-nums;">${fmtCur(pp.amount)}</td>
        <td style="padding:7px 10px;text-align:left;font-variant-numeric:tabular-nums;color:${balColor};font-weight:700;">
          ${pp.balance > 0 ? fmtCur(pp.balance) : '✓'}
        </td>
      </tr>
      ${txRows}`
  }).join('')

  const totalPlanned = data.plannedPayments.reduce((s, p) => s + p.amount, 0)
  const totalBalance = data.plannedPayments.reduce((s, p) => s + Math.max(0, p.balance), 0)
  const balBg = data.tuitionBalance > 0 ? '#fef2f2' : '#f0fdf4'
  const balColor2 = data.tuitionBalance > 0 ? '#dc2626' : '#059669'
  const balLabel = data.tuitionBalance > 0 ? 'יתרת חוב לתשלום' : 'זכות'

  return `<!DOCTYPE html><html dir="rtl"><head>
    <meta charset="utf-8">
    <title>דוח תשלומים — ${data.name}</title>
    <style>
      body{font-family:Arial,sans-serif;direction:rtl;margin:20px 28px;color:#111;font-size:13px;}
      table{width:100%;border-collapse:collapse;margin-bottom:16px;}
      th{background:#f3f4f6;font-size:11px;padding:6px 10px;text-align:right;border-bottom:2px solid #e5e7eb;}
      td{padding:7px 10px;border-bottom:1px solid #f0f0f0;text-align:right;}
      .section-title{font-size:12px;font-weight:700;color:#1a3a7a;text-transform:uppercase;letter-spacing:.04em;margin:14px 0 6px;}
      .balance-bar{background:${balBg};border:1px solid ${balColor2}55;border-radius:8px;padding:12px 16px;margin-top:16px;display:flex;justify-content:space-between;align-items:center;}
      @media print{body{margin:10px 16px;}}
    </style>
  </head><body>
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;border-bottom:2px solid #1a3a7a;padding-bottom:12px;">
      <div style="font-size:10px;color:#888;">בס"ד</div>
      ${logoTag}
    </div>

    <div style="margin-bottom:16px;">
      <div style="font-size:19px;font-weight:700;">${data.name}</div>
      <div style="font-size:12px;color:#666;margin-top:4px;display:flex;gap:20px;flex-wrap:wrap;">
        ${data.city ? `<span>📍 ${data.city}</span>` : ''}
        ${data.fatherPhone ? `<span dir="ltr">📞 ${data.fatherPhone}</span>` : ''}
        ${data.motherPhone && data.motherPhone !== data.fatherPhone ? `<span dir="ltr">📞 ${data.motherPhone}</span>` : ''}
        <span>👨‍👩‍👧‍👦 ${data.childrenCount} ילדים</span>
        <span style="color:#aaa;">הודפס: ${new Date().toLocaleDateString('he-IL')}</span>
      </div>
    </div>

    <div class="section-title">תשלומים מתוכננים (${data.plannedPayments.length})</div>
    ${data.plannedPayments.length === 0 ? '<p style="color:#999;font-size:12px;">אין תשלומים מתוכננים</p>' : `
    <table>
      <thead><tr>
        <th>חודש</th><th>שם</th><th style="text-align:left;">סכום</th><th style="text-align:left;">יתרה</th>
      </tr></thead>
      <tbody>${ppRows}
        <tr style="background:#f8f9fa;border-top:2px solid #e5e7eb;">
          <td colspan="2" style="font-weight:700;color:#374151;">סה"כ</td>
          <td style="text-align:left;font-weight:700;">${fmtCur(totalPlanned)}</td>
          <td style="text-align:left;font-weight:700;color:#dc2626;">${fmtCur(totalBalance)}</td>
        </tr>
      </tbody>
    </table>`}

    <div class="balance-bar">
      <span style="font-size:22px;font-weight:700;color:${balColor2};">${fmtCur(Math.abs(data.tuitionBalance))}</span>
      <span style="font-size:13px;font-weight:600;color:${balColor2};">${balLabel}</span>
    </div>
  </body></html>`
}

function ParentDebtReportModal({ parentId, onClose }: { parentId: string; onClose: () => void }) {
  const [data, setData]             = useState<ParentReportData | null>(null)
  const [settings, setSettings]     = useState<Settings>({})
  const [loading, setLoading]       = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  const pdfRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([
      fetch(`/api/parents/${parentId}`).then(r => r.json()),
      fetch('/api/settings').then(r => r.json()).catch(() => ({})),
    ]).then(([d, s]) => {
      if (!d.error) setData(d)
      setSettings(s ?? {})
    }).finally(() => setLoading(false))
  }, [parentId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Group transactions by monthYear for linking
  const txByMonth: Record<string, ParentTx[]> = {}
  if (data) {
    for (const tx of data.transactions) {
      if (tx.monthYear) {
        if (!txByMonth[tx.monthYear]) txByMonth[tx.monthYear] = []
        txByMonth[tx.monthYear].push(tx)
      }
    }
  }

  const handlePrint = () => {
    if (!data) return
    const html = buildPrintHtml(data, settings, txByMonth)
    const w = window.open('', '_blank', 'width=820,height=960')
    if (!w) return
    w.document.write(html)
    w.document.close()
    w.focus()
    setTimeout(() => w.print(), 300)
  }

  const handlePdf = async () => {
    if (!pdfRef.current || !data) return
    setPdfLoading(true)
    try {
      const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
        import('jspdf'),
        import('html2canvas'),
      ])
      // Wait a tick for any pending renders
      await new Promise(r => setTimeout(r, 800))
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        scrollY: -window.scrollY,
      })
      const imgData = canvas.toDataURL('image/jpeg', 0.95)
      const pdf = new (jsPDF as unknown as typeof jsPDFType)({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageW = pdf.internal.pageSize.getWidth()
      const pageH = pdf.internal.pageSize.getHeight()
      const ratio = canvas.width / canvas.height
      const imgH  = pageW / ratio
      let posY = 0
      let remaining = imgH
      while (remaining > 0) {
        pdf.addImage(imgData, 'JPEG', 0, posY === 0 ? 0 : -(imgH - remaining), pageW, imgH)
        remaining -= pageH
        if (remaining > 0) { pdf.addPage(); posY = -(imgH - remaining) }
      }
      pdf.save(`דוח_${data.name}_${new Date().toLocaleDateString('he-IL').replace(/\//g, '-')}.pdf`)
    } finally {
      setPdfLoading(false)
    }
  }

  const totalPlanned = data?.plannedPayments.reduce((s, p) => s + p.amount, 0) ?? 0
  const totalRemaining = data?.plannedPayments.reduce((s, p) => s + Math.max(0, p.balance), 0) ?? 0

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
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-gray-700 text-sm font-medium hover:bg-gray-50 disabled:opacity-40 transition-colors">
              🖨 הדפסה
            </button>
            <button onClick={handlePdf} disabled={loading || !data || pdfLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1a3a7a] text-white text-sm font-medium hover:bg-[#0d1f52] disabled:opacity-40 transition-colors">
              {pdfLoading ? <span className="animate-spin">⏳</span> : '⬇'} {pdfLoading ? 'מכין...' : 'הורדת PDF'}
            </button>
          </div>
          <div className="text-right">
            <h2 className="text-lg font-bold text-gray-900">דוח תשלומים אישי</h2>
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
            <div ref={pdfRef} className="bg-white">
              {/* Parent info */}
              <div className="mb-5 flex items-start justify-between">
                <p className="text-xs text-gray-400">בס"ד</p>
                <div className="text-right">
                  <h3 className="text-lg font-bold text-gray-900">{data.name}</h3>
                  <div className="text-sm text-gray-500 mt-1 flex flex-wrap gap-x-4 gap-y-1">
                    {data.city && <span>📍 {data.city}</span>}
                    {data.fatherPhone && <span dir="ltr">📞 {data.fatherPhone}</span>}
                    {data.motherPhone && data.motherPhone !== data.fatherPhone &&
                      <span dir="ltr">📞 {data.motherPhone}</span>}
                    <span>👨‍👩‍👧‍👦 {data.childrenCount} ילדים</span>
                  </div>
                </div>
              </div>

              {/* Planned payments */}
              <p className="text-xs font-semibold text-[#1a3a7a] uppercase tracking-wide mb-2">
                תשלומים מתוכננים ({data.plannedPayments.length})
              </p>
              {data.plannedPayments.length === 0 ? (
                <p className="text-sm text-gray-400 py-2">אין תשלומים מתוכננים</p>
              ) : (
                <div className="bg-gray-50 rounded-xl overflow-hidden mb-4">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-100 text-xs text-gray-500">
                        <th className="px-4 py-2 text-right">חודש</th>
                        <th className="px-4 py-2 text-right">שם</th>
                        <th className="px-4 py-2 text-left">לתשלום</th>
                        <th className="px-4 py-2 text-left">יתרה</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.plannedPayments.map(pp => {
                        const linked = txByMonth[pp.monthYear] ?? []
                        return (
                          <>
                            <tr key={pp.id} className="border-t border-gray-200">
                              <td className="px-4 py-2.5 font-semibold text-gray-800">{pp.monthYear}</td>
                              <td className="px-4 py-2.5 text-gray-600">{pp.name || '—'}</td>
                              <td className="px-4 py-2.5 text-left tabular-nums text-gray-700">{fmt(pp.amount)}</td>
                              <td className={`px-4 py-2.5 text-left tabular-nums font-bold ${pp.balance > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                                {pp.balance > 0 ? fmt(pp.balance) : '✓'}
                              </td>
                            </tr>
                            {linked.map(tx => (
                              <tr key={tx.id} className="bg-emerald-50/60">
                                <td className="px-4 py-1.5 pr-8 text-xs text-gray-400">↳ שולם {tx.date ? new Date(tx.date).toLocaleDateString('he-IL') : ''}</td>
                                <td className="px-4 py-1.5 text-xs text-gray-500">{tx.type || ''} {tx.notes ? `· ${tx.notes}` : ''}</td>
                                <td colSpan={2} className="px-4 py-1.5 text-left tabular-nums text-xs font-semibold text-emerald-700">{fmt(tx.amount)}</td>
                              </tr>
                            ))}
                          </>
                        )
                      })}
                      <tr className="bg-gray-100 border-t-2 border-gray-200">
                        <td colSpan={2} className="px-4 py-2.5 font-bold text-gray-700">סה"כ</td>
                        <td className="px-4 py-2.5 text-left tabular-nums font-bold text-gray-700">{fmt(totalPlanned)}</td>
                        <td className="px-4 py-2.5 text-left tabular-nums font-bold text-red-600">{fmt(totalRemaining)}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

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
