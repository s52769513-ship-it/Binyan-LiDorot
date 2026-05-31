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
  { id: 'personal', label: 'פרטים אישיים',              enabled: true },
  { id: 'children', label: 'ילדים',                     enabled: true },
  { id: 'tuition',  label: 'תשלומים מתוכננים — שכ"ל',  enabled: true },
  { id: 'salary',   label: 'תשלומים מתוכננים — משכורת', enabled: true },
  { id: 'summary',  label: 'סיכום פיננסי',              enabled: true },
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

  const toggle  = (id: string) => setSections(p => p.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s))
  const enabled = (id: string) => sections.find(s => s.id === id)?.enabled ?? false

  const fetchPPTx = async (ppIds: string[]): Promise<Record<string, TxItem[]>> => {
    const pairs = await Promise.all(ppIds.map(async id => {
      const data = await fetch(`/api/transactions?plannedPaymentId=${encodeURIComponent(id)}`).then(r => r.json())
      return [id, Array.isArray(data) ? data : []] as [string, TxItem[]]
    }))
    return Object.fromEntries(pairs)
  }

  /* ─── build shared CSS ─────────────────────────────────── */
  const css = `
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,'Noto Sans Hebrew',sans-serif;font-size:11pt;color:#1a1a1a;
           direction:rtl;background:white}

      /* ── page shell ── */
      .section{padding:14mm 18mm 18mm 18mm;page-break-before:always;min-height:297mm;position:relative}
      .section:first-child{page-break-before:avoid}

      /* ── header on each section ── */
      .page-hdr{display:flex;justify-content:space-between;align-items:center;
        border-bottom:1.5px solid #1a3a7a;padding-bottom:4mm;margin-bottom:7mm}
      .bsd{font-size:8pt;color:#888;white-space:nowrap;align-self:flex-start;padding-top:1mm}
      .logo-area{display:flex;flex-direction:column;align-items:flex-end;gap:1mm}
      .logo-area img{height:12mm;object-fit:contain;max-width:45mm}
      .inst-name{font-size:8pt;color:#555}

      /* ── footer ── */
      .page-ftr{position:absolute;bottom:8mm;left:18mm;right:18mm;
        display:flex;justify-content:space-between;
        border-top:1px solid #ddd;padding-top:2.5mm;font-size:8pt;color:#888}

      /* ── content ── */
      .sec-title{font-size:13pt;font-weight:bold;color:#1a3a7a;
        margin-bottom:5mm;padding-bottom:2mm;border-bottom:1px solid #e0e0e0}

      table.dt{width:100%;border-collapse:collapse;font-size:10pt}
      table.dt th,table.dt td{padding:2.5mm 3.5mm;border:1px solid #e0e0e0;text-align:right}
      table.dt .even{background:#f8f9fa}
      table.dt thead tr{background:#1a3a7a!important;color:white}
      table.dt thead th{color:white;font-weight:bold}
      table.dt tfoot td{background:#e8edf5;font-weight:bold;border-color:#c0c9d8}
      table.dt tbody tr{page-break-inside:avoid}
      table.dt thead{display:table-header-group}

      .lbl{font-weight:bold;color:#555;width:35%}
      .b{font-weight:bold}.ctr{text-align:center}
      .grn{color:#16a34a}.red{color:#dc2626}.amb{color:#d97706}

      .notes-box{margin-top:4mm;padding:3mm 4mm;background:#fffbeb;
        border:1px solid #fde68a;border-radius:2mm;font-size:10pt;page-break-inside:avoid}
      .credit-box{margin-top:3mm;padding:2.5mm 4mm;background:#f0fdf4;
        border:1px solid #86efac;border-radius:2mm;font-size:9pt;color:#166534;page-break-inside:avoid}

      .summary-grid{display:grid;grid-template-columns:1fr 1fr;gap:5mm;margin-bottom:5mm}
      .sbox{border-width:1.5px;border-style:solid;border-radius:2mm;overflow:hidden;page-break-inside:avoid}
      .sbox-head{color:white;padding:2.5mm 4mm;font-weight:bold;font-size:11pt}
      .sbox-body{padding:3mm 4mm}
      .sbox-body table{width:100%;font-size:10pt;border-collapse:collapse}
      .sbox-body td{padding:1.5mm 0}

      .sub-txs{background:#f0f9ff}
      .sub-txs td{padding:2mm 3.5mm;font-size:9pt;color:#555;border:none;border-bottom:1px solid #e0eeff}
      .sub-txs .grn{color:#16a34a;font-weight:bold}

      @media screen{body{padding:10px;background:#e5e7eb}
        .section{margin-bottom:12px;box-shadow:0 2px 8px rgba(0,0,0,.15)}}
      @media print{
        body{background:white}
        .section{page-break-before:always;margin:0}
        .section:first-child{page-break-before:avoid}
        @page{margin:0;size:A4 portrait}
      }
    </style>
  `

  /* ─── build full HTML document ─────────────────────────── */
  const buildHTML = async (): Promise<string> => {
    const today      = new Date().toISOString().split('T')[0]
    const todayFmt   = fmtDate(today)
    const { logoUrl, institutionName } = settings

    const tuitionPPs = (parent.plannedPayments ?? []).filter(pp => pp.ppType !== 'salary')
      .sort((a,b)=>{ const [am,ay]=a.monthYear.split('/').map(Number),[bm,by]=b.monthYear.split('/').map(Number); return ay!==by?by-ay:bm-am })
    const salaryPPs  = (parent.plannedPayments ?? []).filter(pp => pp.ppType === 'salary')
      .sort((a,b)=>{ const [am,ay]=a.monthYear.split('/').map(Number),[bm,by]=b.monthYear.split('/').map(Number); return ay!==by?by-ay:bm-am })

    const ppsToFetch = [...(enabled('tuition')?tuitionPPs:[]),...(enabled('salary')?salaryPPs:[])]
    const ppTx = ppsToFetch.length>0 ? await fetchPPTx(ppsToFetch.map(p=>p.id)) : {}

    const hdr = (pageLabel: string, pageIdx: number, totalPages: number) => `
      <div class="page-hdr">
        <div class="bsd">בס"ד</div>
        <div class="logo-area">
          ${logoUrl ? `<img src="${logoUrl}" crossorigin="anonymous"/>` : ''}
          <div class="inst-name">${institutionName}</div>
        </div>
      </div>`

    const ftr = (pageIdx: number, totalPages: number) => `
      <div class="page-ftr">
        <span>עמוד ${pageIdx} מתוך ${totalPages}</span>
        <span>${parent.name} | ${todayFmt}</span>
      </div>`

    const sections: string[] = []

    /* ── פרטים אישיים ── */
    if (enabled('personal')) {
      const rows = [
        ['שם מלא',    parent.name],
        ['תעודת זהות',parent.idNumber],
        ['טלפון אב',  parent.fatherPhone],
        ['טלפון אם',  parent.motherPhone],
        ['דוא"ל',     parent.email],
        ['כתובת',     [parent.address,parent.building,parent.city].filter(Boolean).join(', ')],
        ['כינוי',     parent.nickname],
        ['בן/בת הרב', parent.benReb],
        ['בית כנסת',  parent.synagogue],
        ['בנק',       parent.bankName],
        ['סניף',      parent.bankBranch  ? String(parent.bankBranch)  : ''],
        ['חשבון',     parent.bankAccount ? String(parent.bankAccount) : ''],
        ['יום חיוב',  parent.chargeDay   ? String(parent.chargeDay)   : ''],
        ['סוג הו"ק',  parent.standingOrderType],
      ].filter(([,v])=>v)

      sections.push(`
        ${hdr('פרטים אישיים', sections.length+1, 0)}
        <h2 class="sec-title">פרטים אישיים</h2>
        <table class="dt">
          <tbody>
            ${rows.map(([l,v],i)=>`<tr class="${i%2===0?'even':''}"><td class="lbl">${l}</td><td>${v}</td></tr>`).join('')}
          </tbody>
        </table>
        ${parent.notes ? `<div class="notes-box"><strong>הערות:</strong><br/>${parent.notes}</div>` : ''}
      `)
    }

    /* ── ילדים ── */
    if (enabled('children') && parent.students.length > 0) {
      sections.push(`
        ${hdr('ילדים', sections.length+1, 0)}
        <h2 class="sec-title">ילדים (${parent.students.length})</h2>
        <table class="dt">
          <thead><tr>
            <th>שם</th><th>כיתה</th><th>סטטוס</th><th>גיל</th><th>הסעה</th><th>עלות הסעה</th>
          </tr></thead>
          <tbody>
            ${parent.students.map((s,i)=>`
              <tr class="${i%2===0?'even':''}">
                <td class="b">${s.name}</td>
                <td>${s.className||'—'}</td>
                <td>${s.status||'—'}</td>
                <td class="ctr">${s.age||'—'}</td>
                <td>${(s.transportation??[]).join(', ')||'—'}</td>
                <td class="ctr">${s.transportationCost?fmtCur(s.transportationCost):'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      `)
    }

    /* ── PP table helper ── */
    const ppSection = (pps: typeof tuitionPPs, title: string, balColor: string) => {
      const tPlanned = pps.reduce((s,p)=>s+p.amount,0)
      const tPaid    = pps.reduce((s,p)=>s+(p.amount-p.balance),0)
      const tBal     = pps.reduce((s,p)=>s+p.balance,0)

      return `
        ${hdr(title, sections.length+1, 0)}
        <h2 class="sec-title">${title}</h2>
        <table class="dt">
          <thead><tr>
            <th>חודש</th><th>סכום</th><th>שולם</th><th>יתרה</th><th>תאריך יעד</th><th>סטטוס</th>
          </tr></thead>
          <tbody>
            ${pps.map((pp,i)=>{
              const paid    = pp.amount - pp.balance
              const overdue = pp.balance>0 && pp.date && pp.date<today
              const status  = pp.balance<=0?'✓ שולם':overdue?'⚠ בפיגור':'פתוח'
              const sClass  = pp.balance<=0?'grn':overdue?'red':'amb'
              const bClass  = pp.balance<=0?'grn':balColor==='#dc2626'?'red':'amb'
              const txs     = ppTx[pp.id] ?? []
              return `
                <tr class="${i%2===0?'even':''}">
                  <td class="b">${pp.monthYear||'—'}</td>
                  <td>${fmtCur(pp.amount)}</td>
                  <td class="grn">${fmtCur(paid)}</td>
                  <td class="b ${bClass}">${fmtCur(pp.balance)}</td>
                  <td>${pp.date?fmtDate(pp.date):'—'}</td>
                  <td class="b ${sClass}">${status}</td>
                </tr>
                ${txs.length>0?`
                  <tr>
                    <td colspan="6" style="padding:0;border:1px solid #e0e0e0">
                      <table style="width:100%;border-collapse:collapse" class="sub-txs">
                        ${txs.map(tx=>`
                          <tr>
                            <td style="width:22%;padding-right:8mm">↳ ${fmtDate(tx.date)}</td>
                            <td class="grn" style="width:18%">${fmtCur(tx.amount)}</td>
                            <td style="width:20%">${tx.type||'—'}</td>
                            <td>${tx.notes||''}</td>
                          </tr>`).join('')}
                      </table>
                    </td>
                  </tr>`:''}`
            }).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td>סה"כ</td>
              <td>${fmtCur(tPlanned)}</td>
              <td class="grn">${fmtCur(tPaid)}</td>
              <td class="${tBal>0?(balColor==='#dc2626'?'red':'amb'):'grn'} b">${fmtCur(tBal)}</td>
              <td colspan="2"></td>
            </tr>
          </tfoot>
        </table>
        ${parent.ppCredit>0&&title.includes('שכ"ל')?`<div class="credit-box">זיכוי שמור: ${fmtCur(parent.ppCredit)}</div>`:''}
      `
    }

    if (enabled('tuition') && tuitionPPs.length>0) sections.push(ppSection(tuitionPPs,'תשלומים מתוכננים — שכ"ל','#dc2626'))
    if (enabled('salary')  && salaryPPs.length>0)  sections.push(ppSection(salaryPPs, 'תשלומים מתוכננים — משכורת','#d97706'))

    /* ── סיכום פיננסי ── */
    if (enabled('summary')) {
      const tP = tuitionPPs.reduce((s,p)=>s+p.amount,0)
      const tA = tuitionPPs.reduce((s,p)=>s+(p.amount-p.balance),0)
      const tB = tuitionPPs.reduce((s,p)=>s+p.balance,0)
      const tO = tuitionPPs.filter(p=>p.balance>0&&p.date&&p.date<today).reduce((s,p)=>s+p.balance,0)
      const sP = salaryPPs.reduce((s,p)=>s+p.amount,0)
      const sA = salaryPPs.reduce((s,p)=>s+(p.amount-p.balance),0)
      const sB = salaryPPs.reduce((s,p)=>s+p.balance,0)
      const activeKids = parent.students.filter(s=>s.status==='פעיל').length

      sections.push(`
        ${hdr('סיכום', sections.length+1, 0)}
        <h2 class="sec-title">סיכום פיננסי</h2>
        <div class="summary-grid">
          <div class="sbox" style="border-color:#1a3a7a">
            <div class="sbox-head" style="background:#1a3a7a">שכר לימוד</div>
            <div class="sbox-body"><table>
              <tr><td>צפוי סה"כ</td><td style="text-align:left;font-weight:bold">${fmtCur(tP)}</td></tr>
              <tr><td class="grn">שולם</td><td style="text-align:left" class="grn b">${fmtCur(tA)}</td></tr>
              <tr style="border-top:1px solid #e0e0e0"><td class="${tB>0?'red':''} b">יתרה לגבייה</td><td style="text-align:left" class="${tB>0?'red':'grn'} b">${fmtCur(tB)}</td></tr>
              ${tO>0?`<tr><td class="red">מתוכם בפיגור</td><td style="text-align:left" class="red b">${fmtCur(tO)}</td></tr>`:''}
              ${parent.ppCredit>0?`<tr><td class="grn">זיכוי שמור</td><td style="text-align:left" class="grn b">${fmtCur(parent.ppCredit)}</td></tr>`:''}
            </table></div>
          </div>
          ${salaryPPs.length>0?`
          <div class="sbox" style="border-color:#7c3aed">
            <div class="sbox-head" style="background:#7c3aed">משכורת</div>
            <div class="sbox-body"><table>
              <tr><td>צפוי סה"כ</td><td style="text-align:left;font-weight:bold">${fmtCur(sP)}</td></tr>
              <tr><td class="grn">שולם</td><td style="text-align:left" class="grn b">${fmtCur(sA)}</td></tr>
              <tr style="border-top:1px solid #e0e0e0"><td class="b">יתרה לתשלום</td><td style="text-align:left" class="${sB>0?'amb':'grn'} b">${fmtCur(sB)}</td></tr>
            </table></div>
          </div>`:'<div></div>'}
        </div>
        <div style="border:1px solid #e0e0e0;border-radius:2mm;padding:3mm 4mm;font-size:10pt">
          <strong>ילדים:</strong> ${parent.students.length} סה"כ · ${activeKids} פעילים
        </div>
      `)
    }

    if (sections.length === 0) return `<html><body><p>לא נבחרו קטגוריות.</p></body></html>`

    const total = sections.length
    const body  = sections.map((content, i) => `
      <div class="section">
        ${content.replace(/\$\{hdr\([^)]+\)\}/g, '')}
        ${ftr(i+1, total)}
      </div>`).join('')

    return `<!DOCTYPE html><html dir="rtl" lang="he">
      <head><meta charset="UTF-8"/><title>דוח — ${parent.name}</title>${css}</head>
      <body>${body}</body>
    </html>`
  }

  /* ── Actually build HTML with correct page numbers in hdr ── */
  const buildFinalHTML = async (): Promise<string> => {
    const today    = new Date().toISOString().split('T')[0]
    const todayFmt = fmtDate(today)
    const { logoUrl, institutionName } = settings

    const tuitionPPs = (parent.plannedPayments ?? []).filter(pp => pp.ppType !== 'salary')
      .sort((a,b)=>{ const [am,ay]=a.monthYear.split('/').map(Number),[bm,by]=b.monthYear.split('/').map(Number); return ay!==by?by-ay:bm-am })
    const salaryPPs  = (parent.plannedPayments ?? []).filter(pp => pp.ppType === 'salary')
      .sort((a,b)=>{ const [am,ay]=a.monthYear.split('/').map(Number),[bm,by]=b.monthYear.split('/').map(Number); return ay!==by?by-ay:bm-am })

    const ppsToFetch = [...(enabled('tuition')?tuitionPPs:[]),...(enabled('salary')?salaryPPs:[])]
    const ppTx = ppsToFetch.length>0 ? await fetchPPTx(ppsToFetch.map(p=>p.id)) : {}

    const pageSections: { title: string; content: string }[] = []

    const pageHdr = (logoUrl: string, institutionName: string) => `
      <div class="page-hdr">
        <div class="bsd">בס"ד</div>
        <div class="logo-area">
          ${logoUrl ? `<img src="${logoUrl}" crossorigin="anonymous"/>` : ''}
          <div class="inst-name">${institutionName}</div>
        </div>
      </div>`

    /* personal */
    if (enabled('personal')) {
      const rows = [
        ['שם מלא',    parent.name],
        ['תעודת זהות',parent.idNumber],
        ['טלפון אב',  parent.fatherPhone],
        ['טלפון אם',  parent.motherPhone],
        ['דוא"ל',     parent.email],
        ['כתובת',     [parent.address,parent.building,parent.city].filter(Boolean).join(', ')],
        ['כינוי',     parent.nickname],
        ['בן/בת הרב', parent.benReb],
        ['בית כנסת',  parent.synagogue],
        ['בנק',       parent.bankName],
        ['סניף',      parent.bankBranch  ? String(parent.bankBranch)  : ''],
        ['חשבון',     parent.bankAccount ? String(parent.bankAccount) : ''],
        ['יום חיוב',  parent.chargeDay   ? String(parent.chargeDay)   : ''],
        ['סוג הו"ק',  parent.standingOrderType],
      ].filter(([,v])=>v)

      pageSections.push({ title: 'פרטים אישיים', content: `
        <h2 class="sec-title">פרטים אישיים</h2>
        <table class="dt"><tbody>
          ${rows.map(([l,v],i)=>`<tr class="${i%2===0?'even':''}"><td class="lbl">${l}</td><td>${v}</td></tr>`).join('')}
        </tbody></table>
        ${parent.notes ? `<div class="notes-box"><strong>הערות:</strong><br/>${parent.notes}</div>` : ''}
      `})
    }

    /* children */
    if (enabled('children') && parent.students.length > 0) {
      pageSections.push({ title: 'ילדים', content: `
        <h2 class="sec-title">ילדים (${parent.students.length})</h2>
        <table class="dt">
          <thead><tr><th>שם</th><th>כיתה</th><th>סטטוס</th><th>גיל</th><th>הסעה</th><th>עלות הסעה</th></tr></thead>
          <tbody>
            ${parent.students.map((s,i)=>`
              <tr class="${i%2===0?'even':''}">
                <td class="b">${s.name}</td><td>${s.className||'—'}</td><td>${s.status||'—'}</td>
                <td class="ctr">${s.age||'—'}</td>
                <td>${(s.transportation??[]).join(', ')||'—'}</td>
                <td class="ctr">${s.transportationCost?fmtCur(s.transportationCost):'—'}</td>
              </tr>`).join('')}
          </tbody>
        </table>
      `})
    }

    /* PP section builder */
    const buildPPSection = (pps: typeof tuitionPPs, title: string, isOverdueBad: boolean) => {
      const tP = pps.reduce((s,p)=>s+p.amount,0)
      const tA = pps.reduce((s,p)=>s+(p.amount-p.balance),0)
      const tB = pps.reduce((s,p)=>s+p.balance,0)

      return `
        <h2 class="sec-title">${title}</h2>
        <table class="dt">
          <thead><tr><th>חודש</th><th>סכום</th><th>שולם</th><th>יתרה</th><th>תאריך יעד</th><th>סטטוס</th></tr></thead>
          <tbody>
            ${pps.map((pp,i)=>{
              const paid    = pp.amount - pp.balance
              const overdue = pp.balance>0 && pp.date && pp.date<today
              const status  = pp.balance<=0?'✓ שולם':overdue?'⚠ בפיגור':'פתוח'
              const sClass  = pp.balance<=0?'grn':overdue?'red':'amb'
              const bClass  = pp.balance<=0?'grn':isOverdueBad&&overdue?'red':'amb'
              const txs     = ppTx[pp.id] ?? []
              return `
                <tr class="${i%2===0?'even':''}">
                  <td class="b">${pp.monthYear||'—'}</td>
                  <td>${fmtCur(pp.amount)}</td>
                  <td class="grn">${fmtCur(paid)}</td>
                  <td class="b ${bClass}">${fmtCur(pp.balance)}</td>
                  <td>${pp.date?fmtDate(pp.date):'—'}</td>
                  <td class="b ${sClass}">${status}</td>
                </tr>
                ${txs.length>0?`
                  <tr><td colspan="6" style="padding:0;border:1px solid #e0e0e0">
                    <table style="width:100%;border-collapse:collapse" class="sub-txs">
                      ${txs.map(tx=>`
                        <tr>
                          <td style="width:22%;padding-right:8mm">↳ ${fmtDate(tx.date)}</td>
                          <td class="grn" style="width:18%">${fmtCur(tx.amount)}</td>
                          <td style="width:20%">${tx.type||'—'}</td>
                          <td>${tx.notes||''}</td>
                        </tr>`).join('')}
                    </table>
                  </td></tr>`:''}`
            }).join('')}
          </tbody>
          <tfoot><tr>
            <td>סה"כ</td><td>${fmtCur(tP)}</td>
            <td class="grn">${fmtCur(tA)}</td>
            <td class="${tB>0?'red':'grn'} b">${fmtCur(tB)}</td>
            <td colspan="2"></td>
          </tr></tfoot>
        </table>
        ${parent.ppCredit>0&&title.includes('שכ"ל')?`<div class="credit-box">זיכוי שמור: ${fmtCur(parent.ppCredit)}</div>`:''}
      `
    }

    if (enabled('tuition') && tuitionPPs.length>0)
      pageSections.push({ title: 'שכ"ל', content: buildPPSection(tuitionPPs,'תשלומים מתוכננים — שכ"ל',true) })
    if (enabled('salary')  && salaryPPs.length>0)
      pageSections.push({ title: 'משכורת', content: buildPPSection(salaryPPs,'תשלומים מתוכננים — משכורת',false) })

    /* summary */
    if (enabled('summary')) {
      const tP=tuitionPPs.reduce((s,p)=>s+p.amount,0), tA=tuitionPPs.reduce((s,p)=>s+(p.amount-p.balance),0)
      const tB=tuitionPPs.reduce((s,p)=>s+p.balance,0), tO=tuitionPPs.filter(p=>p.balance>0&&p.date&&p.date<today).reduce((s,p)=>s+p.balance,0)
      const sP=salaryPPs.reduce((s,p)=>s+p.amount,0), sA=salaryPPs.reduce((s,p)=>s+(p.amount-p.balance),0), sB=salaryPPs.reduce((s,p)=>s+p.balance,0)
      const activeKids = parent.students.filter(s=>s.status==='פעיל').length

      pageSections.push({ title: 'סיכום', content: `
        <h2 class="sec-title">סיכום פיננסי</h2>
        <div class="summary-grid">
          <div class="sbox" style="border-color:#1a3a7a">
            <div class="sbox-head" style="background:#1a3a7a">שכר לימוד</div>
            <div class="sbox-body"><table>
              <tr><td>צפוי סה"כ</td><td style="text-align:left;font-weight:bold">${fmtCur(tP)}</td></tr>
              <tr><td class="grn">שולם</td><td style="text-align:left" class="grn b">${fmtCur(tA)}</td></tr>
              <tr style="border-top:1px solid #e0e0e0"><td class="${tB>0?'red b':''} ">יתרה לגבייה</td><td style="text-align:left" class="${tB>0?'red':'grn'} b">${fmtCur(tB)}</td></tr>
              ${tO>0?`<tr><td class="red">מתוכם בפיגור</td><td style="text-align:left" class="red b">${fmtCur(tO)}</td></tr>`:''}
              ${parent.ppCredit>0?`<tr><td class="grn">זיכוי שמור</td><td style="text-align:left" class="grn b">${fmtCur(parent.ppCredit)}</td></tr>`:''}
            </table></div>
          </div>
          ${salaryPPs.length>0?`
          <div class="sbox" style="border-color:#7c3aed">
            <div class="sbox-head" style="background:#7c3aed">משכורת</div>
            <div class="sbox-body"><table>
              <tr><td>צפוי סה"כ</td><td style="text-align:left;font-weight:bold">${fmtCur(sP)}</td></tr>
              <tr><td class="grn">שולם</td><td style="text-align:left" class="grn b">${fmtCur(sA)}</td></tr>
              <tr style="border-top:1px solid #e0e0e0"><td class="b">יתרה לתשלום</td><td style="text-align:left" class="${sB>0?'amb':'grn'} b">${fmtCur(sB)}</td></tr>
            </table></div>
          </div>`:'<div></div>'}
        </div>
        <div style="border:1px solid #e0e0e0;border-radius:2mm;padding:3mm 4mm;font-size:10pt;page-break-inside:avoid">
          <strong>ילדים:</strong> ${parent.students.length} סה"כ · ${activeKids} פעילים
        </div>
      `})
    }

    if (pageSections.length === 0) return `<html><body dir="rtl"><p>לא נבחרו קטגוריות.</p></body></html>`

    const total = pageSections.length
    const hdr   = pageHdr(logoUrl, institutionName)

    const body = pageSections.map((sec, i) => `
      <div class="section">
        ${hdr}
        ${sec.content}
        <div class="page-ftr">
          <span>עמוד ${i+1} מתוך ${total}</span>
          <span>${parent.name} | ${todayFmt}</span>
        </div>
      </div>`).join('')

    return `<!DOCTYPE html><html dir="rtl" lang="he">
      <head><meta charset="UTF-8"/><title>דוח — ${parent.name}</title>${css}</head>
      <body>${body}</body>
    </html>`
  }

  const openWindow = async (): Promise<{ win: Window; html: string } | null> => {
    const html = await buildFinalHTML()
    const win  = window.open('', '_blank')
    if (!win) return null
    win.document.write(html)
    win.document.close()
    return { win, html }
  }

  const handlePrint = async () => {
    setGenerating(true)
    try {
      const res = await openWindow()
      if (res) setTimeout(() => res.win.print(), 900)
    } catch (e) { console.error(e) }
    finally { setGenerating(false) }
  }

  const handlePDF = async () => {
    setGenerating(true)
    try {
      const res = await openWindow()
      if (!res) return
      await new Promise(r => setTimeout(r, 1200))

      const [{ jsPDF }, html2canvas] = await Promise.all([
        import('jspdf'),
        import('html2canvas').then(m => m.default),
      ])

      const pdf     = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
      const pageEls = res.win.document.querySelectorAll('.section')

      for (let i = 0; i < pageEls.length; i++) {
        if (i > 0) pdf.addPage()
        const canvas = await html2canvas(pageEls[i] as HTMLElement, {
          scale: 2, useCORS: true, logging: false,
          windowWidth: 794, windowHeight: 1123,
        })
        // Tile the canvas across as many PDF pages as needed (handles overflow)
        const imgW    = 210 // A4 width mm
        const pageH   = 297 // A4 height mm
        const canvasW = canvas.width
        const canvasH = canvas.height
        const pxPerMm = canvasW / imgW
        const pageHpx = pageH * pxPerMm
        let y = 0
        let firstPage = true
        while (y < canvasH) {
          if (!firstPage) pdf.addPage()
          firstPage = false
          const sliceH    = Math.min(pageHpx, canvasH - y)
          const sliceCanvas = document.createElement('canvas')
          sliceCanvas.width  = canvasW
          sliceCanvas.height = pageHpx
          const ctx = sliceCanvas.getContext('2d')
          if (ctx) {
            ctx.fillStyle = 'white'
            ctx.fillRect(0, 0, canvasW, pageHpx)
            ctx.drawImage(canvas, 0, -y)
          }
          const sliceH_mm = (sliceH / pxPerMm)
          pdf.addImage(sliceCanvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, pageH)
          y += pageHpx
        }
      }

      pdf.save(`דוח-${parent.name}.pdf`)
      res.win.close()
    } catch (e) { console.error('PDF error:', e) }
    finally { setGenerating(false) }
  }

  const enabledCount = sections.filter(s => s.enabled).length

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">

        <div className="px-5 py-4 flex items-center justify-between flex-row-reverse"
          style={{ background: 'linear-gradient(135deg, #0d1f52 0%, #1a3a7a 100%)' }}>
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none">✕</button>
          <div>
            <h3 className="font-bold text-white text-base">הפקת דוח</h3>
            <p className="text-white/60 text-xs">{parent.name}</p>
          </div>
        </div>

        <div className="px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 mb-3">בחר מה לכלול בדוח:</p>
          <div className="space-y-1">
            {sections.map(s => (
              <label key={s.id} className="flex items-center gap-3 cursor-pointer py-1.5 px-1 rounded-lg hover:bg-gray-50 transition-colors">
                <div onClick={() => toggle(s.id)}
                  className={`w-5 h-5 rounded flex-shrink-0 flex items-center justify-center border-2 transition-colors ${
                    s.enabled ? 'bg-[#1a3a7a] border-[#1a3a7a]' : 'bg-white border-gray-300'
                  }`}>
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

        <div className="px-5 pb-5 flex gap-2">
          <button onClick={handlePrint} disabled={generating || enabledCount === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border-2 border-[#1a3a7a] text-[#1a3a7a] text-sm font-semibold hover:bg-blue-50 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            🖨 הדפסה
          </button>
          <button onClick={handlePDF} disabled={generating || enabledCount === 0}
            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#1a3a7a] text-white text-sm font-semibold hover:bg-[#0d1f52] transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
            {generating
              ? <><span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" /> מייצר...</>
              : '⬇ הורדת PDF'}
          </button>
        </div>
      </div>
    </div>
  )
}
