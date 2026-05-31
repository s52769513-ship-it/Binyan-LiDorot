'use client'

import { useState, useEffect } from 'react'
import { ParentDetail } from '@/lib/types'

interface Section { id: string; label: string; enabled: boolean }
interface TxItem  { id: string; amount: number; type: string; date: string; notes: string }

interface Props {
  parent: ParentDetail
  onClose: () => void
}

const SECTIONS: Section[] = [
  { id: 'personal', label: 'פרטים אישיים',                 enabled: true },
  { id: 'children', label: 'ילדים',                         enabled: true },
  { id: 'tuition',  label: 'תשלומים מתוכננים — שכ"ל',     enabled: true },
  { id: 'salary',   label: 'תשלומים מתוכננים — משכורת',    enabled: true },
  { id: 'summary',  label: 'סיכום פיננסי',                  enabled: true },
]

const fmtCur = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const fmtDate = (d: string) => {
  if (!d) return '—'
  try { return new Intl.DateTimeFormat('he-IL').format(new Date(d)) } catch { return d }
}

export default function ReportModal({ parent, onClose }: Props) {
  const [sections, setSections] = useState<Section[]>(SECTIONS)
  const [generating, setGenerating] = useState(false)
  const [settings, setSettings] = useState<{ logoUrl: string; institutionName: string }>({
    logoUrl: '', institutionName: 'בנין לדורות',
  })

  useEffect(() => {
    fetch('/api/settings').then(r => r.json()).then(d => {
      setSettings({ logoUrl: d.logo_url ?? '', institutionName: d.institution_name ?? 'בנין לדורות' })
    }).catch(() => {})
  }, [])

  const toggle = (id: string) =>
    setSections(prev => prev.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))

  const enabled = (id: string) => sections.find(s => s.id === id)?.enabled ?? false

  /* ── fetch all transactions grouped by PP id ── */
  const fetchPPTx = async (ppIds: string[]): Promise<Record<string, TxItem[]>> => {
    const pairs = await Promise.all(ppIds.map(async id => {
      const res  = await fetch(`/api/transactions?plannedPaymentId=${encodeURIComponent(id)}`)
      const data = await res.json()
      return [id, Array.isArray(data) ? data : []] as [string, TxItem[]]
    }))
    return Object.fromEntries(pairs)
  }

  /* ── build the full report HTML ── */
  const buildHTML = async (): Promise<string> => {
    const today       = new Date().toISOString().split('T')[0]
    const tuitionPPs  = (parent.plannedPayments ?? []).filter(pp => pp.ppType !== 'salary')
      .sort((a, b) => { const [am,ay] = a.monthYear.split('/').map(Number); const [bm,by] = b.monthYear.split('/').map(Number); return ay!==by?by-ay:bm-am })
    const salaryPPs   = (parent.plannedPayments ?? []).filter(pp => pp.ppType === 'salary')
      .sort((a, b) => { const [am,ay] = a.monthYear.split('/').map(Number); const [bm,by] = b.monthYear.split('/').map(Number); return ay!==by?by-ay:bm-am })

    const ppsToFetch = [
      ...(enabled('tuition') ? tuitionPPs : []),
      ...(enabled('salary')  ? salaryPPs  : []),
    ]
    const ppTx = ppsToFetch.length > 0 ? await fetchPPTx(ppsToFetch.map(p => p.id)) : {}

    /* helper: one report page */
    const pages: string[] = []
    const addPage = (content: string) => pages.push(content)

    /* ── page: פרטים אישיים ── */
    if (enabled('personal')) {
      const rows = [
        ['שם מלא',          parent.name],
        ['תעודת זהות',      parent.idNumber],
        ['טלפון אב',        parent.fatherPhone],
        ['טלפון אם',        parent.motherPhone],
        ['דוא"ל',           parent.email],
        ['כתובת',           [parent.address, parent.building, parent.city].filter(Boolean).join(', ')],
        ['כינוי',           parent.nickname],
        ['בן/בת הרב',       parent.benReb],
        ['בית כנסת',        parent.synagogue],
        ['בנק',             parent.bankName],
        ['סניף',            parent.bankBranch  ? String(parent.bankBranch)  : ''],
        ['חשבון',           parent.bankAccount ? String(parent.bankAccount) : ''],
        ['יום חיוב',        parent.chargeDay   ? String(parent.chargeDay)   : ''],
        ['סוג הו"ק',        parent.standingOrderType],
      ].filter(([, v]) => v)

      addPage(`
        <h2 class="sec-title">פרטים אישיים</h2>
        <table class="data-table">
          ${rows.map(([l,v],i) => `
            <tr class="${i%2===0?'even':''}">
              <td class="label-cell">${l}</td>
              <td>${v}</td>
            </tr>`).join('')}
        </table>
        ${parent.notes ? `<div class="notes-box"><strong>הערות:</strong><br/>${parent.notes}</div>` : ''}
      `)
    }

    /* ── page: ילדים ── */
    if (enabled('children') && parent.students.length > 0) {
      addPage(`
        <h2 class="sec-title">ילדים (${parent.students.length})</h2>
        <table class="data-table">
          <thead>
            <tr class="th-row">
              <th>שם</th><th>כיתה</th><th>סטטוס</th><th>גיל</th><th>הסעה</th><th>עלות הסעה</th>
            </tr>
          </thead>
          <tbody>
            ${parent.students.map((s,i) => `
              <tr class="${i%2===0?'even':''}">
                <td class="bold">${s.name}</td>
                <td>${s.className||'—'}</td>
                <td>${s.status||'—'}</td>
                <td class="center">${s.age||'—'}</td>
                <td>${(s.transportation??[]).join(', ')||'—'}</td>
                <td class="center">${s.transportationCost ? fmtCur(s.transportationCost) : '—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      `)
    }

    /* ── helper: PP table with sub-transactions ── */
    const ppTable = (pps: typeof tuitionPPs, map: Record<string, TxItem[]>, title: string, overdueColor: string) => {
      const tPlanned = pps.reduce((s,p) => s+p.amount, 0)
      const tPaid    = pps.reduce((s,p) => s+(p.amount-p.balance), 0)
      const tBal     = pps.reduce((s,p) => s+p.balance, 0)
      return `
        <h2 class="sec-title">${title}</h2>
        <table class="data-table">
          <thead>
            <tr class="th-row">
              <th>חודש</th><th>סכום</th><th>שולם</th><th>יתרה</th><th>תאריך יעד</th><th>סטטוס</th>
            </tr>
          </thead>
          <tbody>
            ${pps.map((pp,i) => {
              const paid     = pp.amount - pp.balance
              const overdue  = pp.balance > 0 && pp.date && pp.date < today
              const status   = pp.balance<=0 ? '✓ שולם' : overdue ? '⚠ בפיגור' : 'פתוח'
              const sColor   = pp.balance<=0 ? '#16a34a' : overdue ? overdueColor : '#d97706'
              const txs      = map[pp.id] ?? []
              return `
                <tr class="${i%2===0?'even':''}">
                  <td class="bold">${pp.monthYear||'—'}</td>
                  <td>${fmtCur(pp.amount)}</td>
                  <td class="green">${fmtCur(paid)}</td>
                  <td class="bold" style="color:${pp.balance>0?overdueColor:'#16a34a'}">${fmtCur(pp.balance)}</td>
                  <td>${pp.date ? fmtDate(pp.date) : '—'}</td>
                  <td class="bold" style="color:${sColor}">${status}</td>
                </tr>
                ${txs.length>0 ? `
                  <tr>
                    <td colspan="6" style="padding:0;border:1px solid #e0e0e0;">
                      <table style="width:100%;border-collapse:collapse;background:#f0f9ff;">
                        ${txs.map(tx=>`
                          <tr>
                            <td style="padding:2mm 6mm;font-size:9pt;color:#555;width:22%">↳ ${fmtDate(tx.date)}</td>
                            <td style="padding:2mm 3mm;font-size:9pt;color:#16a34a;font-weight:bold;width:18%">${fmtCur(tx.amount)}</td>
                            <td style="padding:2mm 3mm;font-size:9pt;color:#555;width:20%">${tx.type||'—'}</td>
                            <td style="padding:2mm 3mm;font-size:9pt;color:#555">${tx.notes||''}</td>
                          </tr>`).join('')}
                      </table>
                    </td>
                  </tr>` : ''}
              `}).join('')}
          </tbody>
          <tfoot>
            <tr class="total-row">
              <td>סה"כ</td>
              <td>${fmtCur(tPlanned)}</td>
              <td class="green">${fmtCur(tPaid)}</td>
              <td style="color:${tBal>0?overdueColor:'#16a34a'};font-weight:bold">${fmtCur(tBal)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
        ${parent.ppCredit>0&&title.includes('שכ"ל') ? `<div class="credit-box">זיכוי שמור: ${fmtCur(parent.ppCredit)}</div>` : ''}
      `
    }

    /* ── page: שכ"ל ── */
    if (enabled('tuition') && tuitionPPs.length > 0)
      addPage(ppTable(tuitionPPs, ppTx, 'תשלומים מתוכננים — שכ"ל', '#dc2626'))

    /* ── page: משכורת ── */
    if (enabled('salary') && salaryPPs.length > 0)
      addPage(ppTable(salaryPPs, ppTx, 'תשלומים מתוכננים — משכורת', '#d97706'))

    /* ── page: סיכום פיננסי ── */
    if (enabled('summary')) {
      const tPlanned   = tuitionPPs.reduce((s,p)=>s+p.amount, 0)
      const tPaid      = tuitionPPs.reduce((s,p)=>s+(p.amount-p.balance), 0)
      const tBal       = tuitionPPs.reduce((s,p)=>s+p.balance, 0)
      const tOverdue   = tuitionPPs.filter(p=>p.balance>0&&p.date&&p.date<today).reduce((s,p)=>s+p.balance,0)
      const sPlanned   = salaryPPs.reduce((s,p)=>s+p.amount, 0)
      const sPaid      = salaryPPs.reduce((s,p)=>s+(p.amount-p.balance), 0)
      const sBal       = salaryPPs.reduce((s,p)=>s+p.balance, 0)
      const activeKids = parent.students.filter(s=>s.status==='פעיל').length

      addPage(`
        <h2 class="sec-title">סיכום פיננסי</h2>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:6mm">
          <div class="summary-box" style="border-color:#1a3a7a">
            <div class="summary-box-head" style="background:#1a3a7a">שכר לימוד</div>
            <div style="padding:3mm 4mm">
              <table style="width:100%;font-size:10pt;border-collapse:collapse">
                <tr><td style="padding:1.5mm 0;color:#555">צפוי סה"כ</td><td style="text-align:left;font-weight:bold">${fmtCur(tPlanned)}</td></tr>
                <tr><td style="padding:1.5mm 0;color:#16a34a">שולם</td><td style="text-align:left;font-weight:bold;color:#16a34a">${fmtCur(tPaid)}</td></tr>
                <tr style="border-top:1px solid #e0e0e0"><td style="padding:1.5mm 0;font-weight:bold;color:${tBal>0?'#dc2626':'#555'}">יתרה לגבייה</td><td style="text-align:left;font-weight:bold;color:${tBal>0?'#dc2626':'#16a34a'}">${fmtCur(tBal)}</td></tr>
                ${tOverdue>0 ? `<tr><td style="padding:1.5mm 0;color:#dc2626">מתוכם בפיגור</td><td style="text-align:left;font-weight:bold;color:#dc2626">${fmtCur(tOverdue)}</td></tr>` : ''}
                ${parent.ppCredit>0 ? `<tr><td style="padding:1.5mm 0;color:#16a34a">זיכוי שמור</td><td style="text-align:left;font-weight:bold;color:#16a34a">${fmtCur(parent.ppCredit)}</td></tr>` : ''}
              </table>
            </div>
          </div>
          ${salaryPPs.length>0 ? `
          <div class="summary-box" style="border-color:#7c3aed">
            <div class="summary-box-head" style="background:#7c3aed">משכורת</div>
            <div style="padding:3mm 4mm">
              <table style="width:100%;font-size:10pt;border-collapse:collapse">
                <tr><td style="padding:1.5mm 0;color:#555">צפוי סה"כ</td><td style="text-align:left;font-weight:bold">${fmtCur(sPlanned)}</td></tr>
                <tr><td style="padding:1.5mm 0;color:#16a34a">שולם</td><td style="text-align:left;font-weight:bold;color:#16a34a">${fmtCur(sPaid)}</td></tr>
                <tr style="border-top:1px solid #e0e0e0"><td style="padding:1.5mm 0;font-weight:bold">יתרה לתשלום</td><td style="text-align:left;font-weight:bold;color:${sBal>0?'#d97706':'#16a34a'}">${fmtCur(sBal)}</td></tr>
              </table>
            </div>
          </div>` : '<div></div>'}
        </div>
        <div style="border:1px solid #e0e0e0;border-radius:2mm;padding:3mm 4mm;font-size:10pt">
          <strong>ילדים:</strong> ${parent.students.length} סה"כ · ${activeKids} פעילים
        </div>
      `)
    }

    if (pages.length === 0) return '<p>לא נבחרו קטגוריות לדוח.</p>'

    const { logoUrl, institutionName } = settings
    const total = pages.length

    const pageWrapper = (content: string, idx: number) => `
      <div class="report-page">
        <div class="page-header">
          <div class="header-left">
            ${logoUrl ? `<img src="${logoUrl}" class="logo-img" crossorigin="anonymous"/>` : ''}
            <div class="inst-name">${institutionName}</div>
          </div>
          <div class="bsd">בס"ד</div>
        </div>
        <div class="page-body">
          ${content}
        </div>
        <div class="page-footer">
          <span>עמוד ${idx+1} מתוך ${total}</span>
          <span>דוח: ${parent.name} | ${fmtDate(new Date().toISOString().split('T')[0])}</span>
        </div>
      </div>
    `

    const css = `
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,'Noto Sans Hebrew',sans-serif;background:#e5e7eb;direction:rtl}
        .report-page{
          width:210mm;min-height:297mm;padding:12mm 18mm 18mm 18mm;
          background:white;position:relative;
          page-break-after:always;margin:0 auto 10px
        }
        .report-page:last-child{page-break-after:avoid}
        .page-header{display:flex;justify-content:space-between;align-items:center;
          border-bottom:1.5px solid #1a3a7a;padding-bottom:4mm;margin-bottom:7mm}
        .header-left{display:flex;flex-direction:column;align-items:flex-start;gap:1mm}
        .logo-img{height:12mm;object-fit:contain}
        .inst-name{font-size:8pt;color:#555}
        .bsd{font-size:8pt;color:#888;align-self:flex-start}
        .page-footer{position:absolute;bottom:8mm;left:18mm;right:18mm;
          display:flex;justify-content:space-between;
          border-top:1px solid #ddd;padding-top:2.5mm;font-size:8pt;color:#888}
        .page-body{padding-bottom:15mm}
        .sec-title{font-size:13pt;font-weight:bold;color:#1a3a7a;
          margin-bottom:5mm;border-bottom:1px solid #e0e0e0;padding-bottom:2mm}
        .data-table{width:100%;border-collapse:collapse;font-size:10pt}
        .data-table th,.data-table td{padding:2.5mm 3.5mm;border:1px solid #e0e0e0;text-align:right}
        .data-table .even{background:#f8f9fa}
        .th-row{background:#1a3a7a!important;color:white}
        .th-row th{color:white;font-weight:bold}
        .total-row{background:#e8edf5;font-weight:bold}
        .total-row td{border-color:#c0c9d8}
        .label-cell{font-weight:bold;color:#555;width:35%}
        .bold{font-weight:bold}.center{text-align:center}
        .green{color:#16a34a}
        .notes-box{margin-top:5mm;padding:3mm 4mm;background:#fffbeb;border:1px solid #fde68a;border-radius:2mm;font-size:10pt}
        .credit-box{margin-top:3mm;padding:2.5mm 4mm;background:#f0fdf4;border:1px solid #86efac;border-radius:2mm;font-size:9pt;color:#166534}
        .summary-box{border-width:1.5px;border-style:solid;border-radius:2mm;overflow:hidden}
        .summary-box-head{color:white;padding:2.5mm 4mm;font-weight:bold;font-size:11pt}
        @media print{
          body{background:white}
          .report-page{margin:0;box-shadow:none}
          @page{margin:0;size:A4 portrait}
        }
      </style>
    `

    return `<!DOCTYPE html><html dir="rtl" lang="he">
      <head><meta charset="UTF-8"/><title>דוח — ${parent.name}</title>${css}</head>
      <body>${pages.map((c,i)=>pageWrapper(c,i)).join('')}</body>
    </html>`
  }

  /* ── Print ── */
  const handlePrint = async () => {
    setGenerating(true)
    try {
      const html = await buildHTML()
      const win  = window.open('', '_blank')
      if (!win) return
      win.document.write(html)
      win.document.close()
      setTimeout(() => win.print(), 900)
    } catch (e) { console.error(e) }
    finally { setGenerating(false) }
  }

  /* ── PDF Download ── */
  const handlePDF = async () => {
    setGenerating(true)
    try {
      const html = await buildHTML()
      const win  = window.open('', '_blank')
      if (!win) return
      win.document.write(html)
      win.document.close()

      await new Promise(r => setTimeout(r, 1200))

      const [{ jsPDF }, html2canvas] = await Promise.all([
        import('jspdf'),
        import('html2canvas').then(m => m.default),
      ])

      const pdf    = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageEls = win.document.querySelectorAll('.report-page')

      for (let i = 0; i < pageEls.length; i++) {
        if (i > 0) pdf.addPage()
        const canvas = await html2canvas(pageEls[i] as HTMLElement, {
          scale: 2, useCORS: true, logging: false, windowWidth: 794,
        })
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 210, 297)
      }

      pdf.save(`דוח-${parent.name}.pdf`)
      win.close()
    } catch (e) { console.error('PDF error:', e) }
    finally { setGenerating(false) }
  }

  const enabledCount = sections.filter(s => s.enabled).length

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between flex-row-reverse"
          style={{ background: 'linear-gradient(135deg, #0d1f52 0%, #1a3a7a 100%)' }}>
          <button onClick={onClose}
            className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none">✕</button>
          <div>
            <h3 className="font-bold text-white text-base">הפקת דוח</h3>
            <p className="text-white/60 text-xs">{parent.name}</p>
          </div>
        </div>

        {/* Sections */}
        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">בחר מה לכלול בדוח:</p>
          <div className="space-y-1">
            {sections.map(s => (
              <label key={s.id} className="flex items-center gap-3 cursor-pointer py-1.5 px-1 rounded-lg hover:bg-gray-50 transition-colors">
                <div
                  onClick={() => toggle(s.id)}
                  className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                    s.enabled ? 'bg-[#1a3a7a] border-[#1a3a7a]' : 'bg-white border-gray-300'
                  }`}
                >
                  {s.enabled && <span className="text-white text-[10px] leading-none font-bold">✓</span>}
                </div>
                <span onClick={() => toggle(s.id)} className={`text-sm ${s.enabled ? 'text-gray-900 font-medium' : 'text-gray-400'}`}>
                  {s.label}
                </span>
              </label>
            ))}
          </div>
          <p className="text-[10px] text-gray-400 mt-3 mr-1">{enabledCount} דפים בדוח</p>
        </div>

        {/* Buttons */}
        <div className="px-5 pb-5 flex gap-2 pt-1">
          <button
            onClick={handlePrint}
            disabled={generating || enabledCount === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-[#1a3a7a] text-[#1a3a7a] text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            🖨 הדפסה
          </button>
          <button
            onClick={handlePDF}
            disabled={generating || enabledCount === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1a3a7a] text-white text-sm font-semibold hover:bg-[#0d1f52] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {generating
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> מייצר...</>
              : '⬇ הורדת PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
