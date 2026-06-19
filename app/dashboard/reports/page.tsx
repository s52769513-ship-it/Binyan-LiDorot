'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

/* ─── Interfaces ─── */
interface DebtRow {
  id: string; parentName: string; city: string
  fatherPhone: string; motherPhone: string
  tuitionTotal: number; tuitionBalance: number; childrenCount: number
}

interface TuitionRow {
  id: string; parentName: string; paymentName: string
  amount: number; paid: number; balance: number
  monthYear: string; status: 'שולם' | 'חלקי' | 'ממתין'
}

interface ClassRow { className: string; framework: string; count: number }

interface TxItem { id: string; amount: number; type: string; date: string; monthYear: string; notes: string }
interface PPItem { id: string; name: string; amount: number; date: string; monthYear: string; balance: number }

interface ParentReportData {
  id: string; name: string; tuitionBalance: number; tuitionTotal: number
  plannedPayments: PPItem[]; transactions: TxItem[]
}

interface Settings { logo_url?: string; institution_name?: string }

/* ─── Helpers ─── */
const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) => {
  if (!d) return ''
  try { return new Intl.DateTimeFormat('he-IL').format(new Date(d)) } catch { return d }
}

const STATUS_STYLE: Record<string, string> = {
  'שולם': 'bg-emerald-50 text-emerald-700',
  'חלקי': 'bg-amber-50 text-amber-700',
  'ממתין': 'bg-red-50 text-red-700',
}

type ReportType = 'debts' | 'tuition' | 'students-per-class'

/* ════════════════════════════════════════════════════
   PARENT DEBT REPORT MODAL
════════════════════════════════════════════════════ */
function buildPrintHtml(
  data: ParentReportData,
  settings: Settings,
  txByMonth: Record<string, TxItem[]>,
): string {
  const logoHtml = settings.logo_url
    ? `<img src="${settings.logo_url}" crossorigin="anonymous"
           style="height:48px;object-fit:contain;display:block;margin:0 auto 6px;" />`
    : ''

  let rows = ''
  for (const pp of data.plannedPayments) {
    const balColor = pp.balance > 0 ? '#dc2626' : '#059669'
    const balText  = pp.balance <= 0 ? `✓ ${fmt(0)}` : fmt(pp.balance)
    rows += `
      <tr>
        <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;vertical-align:top;">${pp.monthYear || '—'}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:right;vertical-align:top;">${pp.name}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:left;font-variant-numeric:tabular-nums;vertical-align:top;">${fmt(pp.amount)}</td>
        <td style="padding:9px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;text-align:left;font-variant-numeric:tabular-nums;vertical-align:top;color:${balColor};font-weight:600;">${balText}</td>
      </tr>`
    for (const tx of txByMonth[pp.monthYear] ?? []) {
      rows += `
        <tr style="background:#f0fdf4;">
          <td colspan="2"
            style="padding:6px 14px 6px 32px;border-bottom:1px solid #dcfce7;font-size:11px;text-align:right;color:#555;">
            ↳ ${tx.type || 'הכנסה'}${tx.date ? ' · ' + fmtDate(tx.date) : ''}${tx.notes ? ' · ' + tx.notes : ''}
          </td>
          <td colspan="2"
            style="padding:6px 14px;border-bottom:1px solid #dcfce7;font-size:12px;text-align:left;color:#059669;font-weight:700;font-variant-numeric:tabular-nums;">
            ${fmt(tx.amount)}
          </td>
        </tr>`
    }
  }
  if (!rows) {
    rows = `<tr><td colspan="4" style="padding:24px;text-align:center;color:#aaa;">אין תשלומים מתוכננים</td></tr>`
  }

  const balBg    = data.tuitionBalance > 0 ? '#fef2f2' : '#f0fdf4'
  const balColor = data.tuitionBalance > 0 ? '#dc2626' : '#059669'
  const balLabel = data.tuitionBalance > 0 ? 'חוב שכר לימוד' : 'זכות שכר לימוד'

  const body = `
<div style="position:relative;padding:24px;direction:rtl;font-family:Arial,Helvetica,sans-serif;max-width:750px;margin:0 auto;">
  <div style="position:absolute;top:24px;left:28px;font-size:11px;color:#888;">בס"ד</div>
  <div style="text-align:center;margin-bottom:20px;">
    ${logoHtml}
    <h1 style="font-size:18px;color:#1a3a7a;margin:0 0 4px;">${settings.institution_name || 'בנין לדורות'}</h1>
    <h2 style="font-size:14px;color:#444;margin:0 0 4px;">דוח תשלומים – ${data.name}</h2>
    <p style="font-size:11px;color:#aaa;margin:0;">הופק בתאריך: ${fmtDate(new Date().toISOString().slice(0, 10))}</p>
  </div>
  <table style="width:100%;border-collapse:collapse;direction:rtl;">
    <colgroup>
      <col style="width:15%;"><col style="width:45%;"><col style="width:20%;"><col style="width:20%;">
    </colgroup>
    <thead>
      <tr style="background:#1a3a7a;color:white;">
        <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;">חודש</th>
        <th style="padding:10px 14px;text-align:right;font-size:12px;font-weight:600;">תיאור</th>
        <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;">סכום</th>
        <th style="padding:10px 14px;text-align:left;font-size:12px;font-weight:600;">יתרה</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  <div style="margin-top:20px;padding:14px 18px;background:${balBg};border-radius:8px;display:flex;justify-content:space-between;align-items:center;">
    <span style="font-size:22px;font-weight:700;color:${balColor};">${fmt(Math.abs(data.tuitionBalance))}</span>
    <span style="font-size:14px;color:#555;">${balLabel}</span>
  </div>
</div>`

  return `<!DOCTYPE html>
<html dir="rtl" lang="he">
<head>
<meta charset="UTF-8">
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { background: white; font-family: Arial, Helvetica, sans-serif; direction: rtl; }
@media print { @page { margin: 15mm; } }
</style>
</head>
<body>${body}</body>
</html>`
}

function ParentDebtReportModal({ parentId, onClose }: { parentId: string; onClose: () => void }) {
  const [data, setData]         = useState<ParentReportData | null>(null)
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading]   = useState(true)
  const [pdfLoading, setPdfLoading] = useState(false)
  const [error, setError]       = useState('')

  useEffect(() => {
    Promise.all([
      fetch(`/api/parents/${parentId}`).then(r => r.json()),
      fetch('/api/settings').then(r => r.json()),
    ])
      .then(([p, s]) => {
        if (p.error) { setError(p.error); return }
        setData(p)
        setSettings(s)
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'))
      .finally(() => setLoading(false))
  }, [parentId])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const txByMonth = useMemo<Record<string, TxItem[]>>(() => {
    const map: Record<string, TxItem[]> = {}
    for (const tx of data?.transactions ?? []) {
      if (!map[tx.monthYear]) map[tx.monthYear] = []
      map[tx.monthYear].push(tx)
    }
    return map
  }, [data])

  const handlePrint = () => {
    if (!data) return
    const html = buildPrintHtml(data, settings, txByMonth)
    const w = window.open('', '_blank', 'width=900,height=700')
    if (!w) return
    w.document.open()
    w.document.write(html)
    w.document.close()
    setTimeout(() => { try { w.print() } catch { /* ignore */ } }, 400)
  }

  const handlePdf = async () => {
    if (!data) return
    setPdfLoading(true)
    try {
      const [{ jsPDF }, html2canvas] = await Promise.all([
        import('jspdf').then(m => m),
        import('html2canvas').then(m => m),
      ])

      const fullHtml = buildPrintHtml(data, settings, txByMonth)

      const iframe = document.createElement('iframe')
      iframe.style.cssText =
        'position:fixed;top:-99999px;left:0;width:794px;height:1px;border:none;visibility:hidden;'
      document.body.appendChild(iframe)

      const iDoc = iframe.contentDocument!
      iDoc.open()
      iDoc.write(fullHtml)
      iDoc.close()

      await new Promise(r => setTimeout(r, 1500))

      const scrollH = iDoc.body.scrollHeight || 800
      iframe.style.height      = scrollH + 'px'
      iframe.style.visibility  = 'visible'

      await new Promise(r => setTimeout(r, 200))

      const canvas = await (html2canvas.default ?? html2canvas)(iDoc.body, {
        scale: 2, useCORS: true, allowTaint: true,
        width: 794, height: scrollH,
      })

      document.body.removeChild(iframe)

      const imgData  = canvas.toDataURL('image/jpeg', 0.95)
      const pdf      = new jsPDF({ orientation: 'p', unit: 'px', format: 'a4' })
      const pageW    = pdf.internal.pageSize.getWidth()
      const pageH    = pdf.internal.pageSize.getHeight()
      const imgH     = (canvas.height * pageW) / canvas.width
      let heightLeft = imgH
      let position   = 0

      pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
      heightLeft -= pageH

      while (heightLeft > 0) {
        position -= pageH
        pdf.addPage()
        pdf.addImage(imgData, 'JPEG', 0, position, pageW, imgH)
        heightLeft -= pageH
      }

      const dateStr = new Date().toLocaleDateString('he-IL').replace(/\//g, '-')
      pdf.save(`דוח_${data.name}_${dateStr}.pdf`)
    } catch (err) {
      console.error('PDF error:', err)
      alert('שגיאה ביצירת ה-PDF')
    } finally {
      setPdfLoading(false)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 flex items-center gap-1.5"
            >
              🖨 הדפסה
            </button>
            <button
              onClick={handlePdf}
              disabled={pdfLoading || loading || !data}
              className="px-3 py-1.5 rounded-lg text-sm border border-[#1a3a7a]/30 text-[#1a3a7a] hover:bg-blue-50 flex items-center gap-1.5 disabled:opacity-50"
            >
              {pdfLoading ? '⏳ מכין...' : '⬇ הורד PDF'}
            </button>
          </div>
          <div className="text-right">
            <p className="text-xs text-gray-400">בס"ד</p>
            <h2 className="text-lg font-bold text-gray-900">
              {loading ? '...' : data?.name || '—'}
            </h2>
            <p className="text-xs text-gray-500">דוח תשלומים מתוכננים</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-400"
            aria-label="סגור"
          >✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3, 4].map(i => (
                <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}
          {error && <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

          {data && (
            <div className="space-y-4">
              <div className="overflow-x-auto rounded-xl border border-gray-200">
                <table className="w-full text-sm" dir="rtl">
                  <thead>
                    <tr className="text-xs font-semibold text-white"
                      style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
                      <th className="px-4 py-3 text-right">חודש</th>
                      <th className="px-4 py-3 text-right">תיאור</th>
                      <th className="px-4 py-3 text-left">סכום</th>
                      <th className="px-4 py-3 text-left">יתרה</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {data.plannedPayments.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-10 text-center text-gray-400 text-sm">
                          אין תשלומים מתוכננים
                        </td>
                      </tr>
                    ) : data.plannedPayments.map(pp => (
                      <>
                        <tr key={pp.id} className="bg-blue-50/30 hover:bg-blue-50/60">
                          <td className="px-4 py-2.5 text-right text-gray-700 font-medium">{pp.monthYear || '—'}</td>
                          <td className="px-4 py-2.5 text-right text-gray-800">{pp.name}</td>
                          <td className="px-4 py-2.5 text-left tabular-nums text-gray-700">{fmt(pp.amount)}</td>
                          <td className={`px-4 py-2.5 text-left tabular-nums font-semibold ${
                            pp.balance > 0 ? 'text-red-600' : 'text-emerald-600'
                          }`}>
                            {pp.balance > 0 ? fmt(pp.balance) : '✓'}
                          </td>
                        </tr>
                        {(txByMonth[pp.monthYear] ?? []).map(tx => (
                          <tr key={tx.id} className="bg-emerald-50/40">
                            <td colSpan={2} className="px-4 py-1.5 pr-8 text-right text-xs text-gray-500">
                              ↳ {tx.type || 'הכנסה'}{tx.date ? ' · ' + fmtDate(tx.date) : ''}
                              {tx.notes ? <span className="text-gray-400"> · {tx.notes}</span> : null}
                            </td>
                            <td colSpan={2} className="px-4 py-1.5 text-left text-xs font-semibold text-emerald-700 tabular-nums">
                              {fmt(tx.amount)}
                            </td>
                          </tr>
                        ))}
                      </>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Balance summary */}
              <div className={`rounded-xl p-4 flex justify-between items-center ${
                data.tuitionBalance > 0 ? 'bg-red-50' : 'bg-emerald-50'
              }`}>
                <span className={`text-2xl font-bold ${
                  data.tuitionBalance > 0 ? 'text-red-700' : 'text-emerald-700'
                }`}>
                  {fmt(Math.abs(data.tuitionBalance))}
                </span>
                <span className="text-sm text-gray-600">
                  {data.tuitionBalance > 0 ? 'חוב שכר לימוד' : 'זכות שכר לימוד'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════════════════
   MAIN REPORTS PAGE
════════════════════════════════════════════════════ */
function ReportsPageContent() {
  const searchParams = useSearchParams()
  const [report, setReport] = useState<ReportType>(
    (searchParams.get('tab') as ReportType) || 'debts'
  )
  useEffect(() => {
    const tab = searchParams.get('tab') as ReportType
    if (tab) setReport(tab)
  }, [searchParams])
  const [loading, setLoading]           = useState(false)
  const [debtRows, setDebtRows]         = useState<DebtRow[]>([])
  const [tuitionRows, setTuitionRows]   = useState<TuitionRow[]>([])
  const [tuitionMonth, setTuitionMonth] = useState('')
  const [tuitionMonths, setTuitionMonths] = useState<string[]>([])
  const [classRows, setClassRows]       = useState<ClassRow[]>([])
  const [tuitionSummary, setTuitionSummary] = useState({ totalAmount: 0, totalPaid: 0, totalRemaining: 0 })
  const [reportParentId, setReportParentId] = useState<string | null>(null)

  useEffect(() => {
    if (report !== 'debts') return
    setLoading(true)
    fetch('/api/parents?debt=debt&sort=tuition_balance&dir=desc&page=0&search=&status=')
      .then(r => r.json())
      .then(d => {
        setDebtRows((d.data ?? []).map((p: DebtRow & { name: string }) => ({
          id: p.id,
          parentName: p.name,
          city: p.city,
          fatherPhone: p.fatherPhone,
          motherPhone: p.motherPhone,
          tuitionTotal: p.tuitionTotal,
          tuitionBalance: p.tuitionBalance,
          childrenCount: p.childrenCount,
        })))
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [report])

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

  const totalDebt = debtRows.reduce((s, r) => s + Math.max(0, r.tuitionBalance), 0)

  return (
    <div className="space-y-5">
      {/* Modal */}
      {reportParentId && (
        <ParentDebtReportModal
          parentId={reportParentId}
          onClose={() => setReportParentId(null)}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div />
        <h2 className="text-2xl font-bold text-gray-800">דוחות</h2>
      </div>

      {/* Report selector */}
      <div className="flex gap-2 flex-wrap justify-end" dir="rtl">
        {([
          ['debts',              'דוח חובות'],
          ['tuition',           'שכר לימוד לפי חודש'],
          ['students-per-class', 'תלמידים לפי כיתה'],
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
        <div className="space-y-2">{[1,2,3,4,5].map(i => (
          <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
        ))}</div>
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
              <table className="w-full min-w-[650px] text-sm">
                <thead>
                  <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
                    <th className="px-4 py-3">שם</th>
                    <th className="px-4 py-3">עיר</th>
                    <th className="px-4 py-3 text-center">ילדים</th>
                    <th className="px-4 py-3 text-left">שכ"ל</th>
                    <th className="px-4 py-3 text-left">חוב</th>
                    <th className="px-4 py-3">טלפון</th>
                    <th className="px-4 py-3 text-center">דוח</th>
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
                      <td className="px-4 py-3 text-right text-xs text-gray-500">
                        {r.fatherPhone || r.motherPhone || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setReportParentId(r.id)}
                          className="px-2.5 py-1 rounded-lg text-xs font-medium border border-[#1a3a7a]/30 text-[#1a3a7a] hover:bg-blue-50 transition-colors"
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

export default function ReportsPage() {
  return <Suspense><ReportsPageContent /></Suspense>
}
