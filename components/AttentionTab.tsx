'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { exportRowsToExcel } from '@/lib/exportUtils'

// טאב "דורש טיפול" — מרכז את מה שעד היום התגלה רק במקרה: החזרות הו"ק שלא
// טופלו, תשלומים שלא שויכו לחוב, תנועות בסכום אפס, ומצב החיבור לנדרים —
// יחד עם דוח גילאי חוב.

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

interface Finding {
  key: string
  title: string
  count: number | null
  amount?: number
  hint: string
  error?: string
}

interface AgingRow {
  parentId: string
  parentName: string
  d30: number; d60: number; d90: number; d90plus: number
  legacy: number
  total: number
  oldestDays: number
}

interface DetailRow {
  id: string
  parentId: string | null
  parentName: string
  amount: number
  date: string
  label: string
  sub: string
}

interface NedarimStatus {
  ok: boolean
  usingApiKey?: boolean
  credential?: string
  detail?: string
  ms?: number
}

export default function AttentionTab({ onOpenParent }: { onOpenParent: (id: string) => void }) {
  const [findings, setFindings]   = useState<Finding[]>([])
  const [aging, setAging]         = useState<AgingRow[]>([])
  const [agingError, setAgingErr] = useState<string | null>(null)
  const [nedarim, setNedarim]     = useState<NedarimStatus | null>(null)
  const [nedarimErr, setNedErr]   = useState<string | null>(null)
  const [loading, setLoading]     = useState(true)
  // רשימת הטיפול המהיר שנפתחת בלחיצה על קובייה
  const [detail, setDetail]       = useState<{ key: string; title: string } | null>(null)
  const [rows, setRows]           = useState<DetailRow[]>([])
  const [rowsLoading, setRowsLoad] = useState(false)
  const [bulkMsg, setBulkMsg]     = useState('')

  const openDetail = (key: string, title: string) => {
    setDetail({ key, title }); setRows([]); setBulkMsg(''); setRowsLoad(true)
    fetch(`/api/dashboard/attention?detail=${encodeURIComponent(key)}`)
      .then(r => r.json())
      .then(d => setRows(Array.isArray(d.rows) ? d.rows : []))
      .catch(() => setRows([]))
      .finally(() => setRowsLoad(false))
  }

  /** ריענון יתרות לכל ההורים שברשימה — מטפל בשיוך ובזיכויים יתומים בבת אחת. */
  const relinkListed = async () => {
    // רק הורים שיש להם חוב פתוח מתאים — לשאר אין למה לשייך, וריענון עליהם
    // הוא בזבוז זמן שלא ישנה כלום.
    const relevant = rows.filter(r => !r.label.startsWith('אין חוב פתוח'))
    const ids = [...new Set(relevant.map(r => r.parentId).filter(Boolean))] as string[]
    if (ids.length === 0) {
      setBulkMsg('אין ברשימה תשלום שריענון יכול לשייך — לכולם אין חוב פתוח מתאים')
      return
    }
    if (!confirm(`להריץ ריענון ל-${ids.length} הורים שיש להם חוב פתוח מתאים?`)) return
    setBulkMsg(`מרענן 0/${ids.length}...`)
    let done = 0
    for (const id of ids) {
      try { await fetch(`/api/parents/${id}/relink`, { method: 'POST' }) } catch { /* ממשיכים */ }
      done++
      setBulkMsg(`מרענן ${done}/${ids.length}...`)
    }
    setBulkMsg(`הושלם — ${done} הורים רועננו`)
    load()
    openDetail(detail!.key, detail!.title)
  }

  // פירוט תא בדוח גילאי חוב
  const [cell, setCell] = useState<{ parentId: string; parentName: string; bucket: string; label: string } | null>(null)
  const [cellRows, setCellRows] = useState<{
    id: string; name: string; monthYear: string; date: string
    amount: number; balance: number; days: number; bucket: string
  }[]>([])
  const [cellLoading, setCellLoading] = useState(false)

  const openCell = (parentId: string, parentName: string, bucket: string, label: string, value: number) => {
    if (!value) return
    setCell({ parentId, parentName, bucket, label }); setCellRows([]); setCellLoading(true)
    fetch(`/api/dashboard/attention?agingParent=${encodeURIComponent(parentId)}&bucket=${bucket}`)
      .then(r => r.json())
      .then(d => setCellRows(Array.isArray(d.rows) ? d.rows : []))
      .catch(() => setCellRows([]))
      .finally(() => setCellLoading(false))
  }

  const load = useCallback(() => {
    setLoading(true)
    // שתי קריאות נפרדות בכוונה: בדיקת נדרים יוצאת לשרת חיצוני ועלולה להיות
    // איטית — היא לא צריכה לעכב את שאר הממצאים.
    fetch('/api/dashboard/attention')
      .then(r => r.json())
      .then(d => {
        setFindings(Array.isArray(d.findings) ? d.findings : [])
        setAging(Array.isArray(d.aging) ? d.aging : [])
        setAgingErr(d.agingError ?? null)
      })
      .catch(() => setAgingErr('שגיאה בטעינת הממצאים'))
      .finally(() => setLoading(false))

    setNedarim(null); setNedErr(null)
    fetch('/api/nedarim/status')
      .then(r => r.json())
      .then(d => setNedarim(d))
      .catch(() => setNedErr('לא הצלחנו לבדוק את החיבור'))
  }, [])

  useEffect(() => { load() }, [load])

  const openFindings = useMemo(
    () => findings.filter(f => (f.count ?? 0) > 0).length + (nedarim && !nedarim.ok ? 1 : 0),
    [findings, nedarim],
  )

  const agingTotals = useMemo(() => aging.reduce((acc, r) => ({
    d30: acc.d30 + r.d30, d60: acc.d60 + r.d60, d90: acc.d90 + r.d90,
    d90plus: acc.d90plus + r.d90plus, legacy: acc.legacy + r.legacy, total: acc.total + r.total,
  }), { d30: 0, d60: 0, d90: 0, d90plus: 0, legacy: 0, total: 0 }), [aging])

  const exportAging = () => {
    exportRowsToExcel(
      aging.map(r => ({
        'הורה': r.parentName,
        'סה"כ באיחור': r.total,
        'עד 30 יום': r.d30,
        '30–60 יום': r.d60,
        '60–90 יום': r.d90,
        '90+ יום': r.d90plus,
        'חוב ישן': r.legacy,
        'הישן ביותר (ימים)': r.oldestDays,
      })),
      `גילאי-חוב-${new Date().toISOString().slice(0, 10)}.xlsx`,
      'גילאי חוב',
    )
  }

  return (
    <div className="space-y-5">
      {/* ── כותרת ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <button onClick={load} disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-gray-700 hover:border-[#1a3a7a] disabled:opacity-50">
          {loading ? 'בודק...' : '🔄 בדוק שוב'}
        </button>
        <h3 className="text-lg font-bold text-gray-800">
          {loading ? 'סורק את המערכת...'
            : openFindings === 0 ? '✅ הכל תקין — אין ממצאים פתוחים'
            : `⚠️ ${openFindings} נושאים דורשים טיפול`}
        </h3>
      </div>

      {/* ── חיבור נדרים ── */}
      <div className={`rounded-xl border p-4 ${
        nedarimErr || (nedarim && !nedarim.ok) ? 'bg-red-50 border-red-200'
          : nedarim ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'}`}>
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="text-right">
            {!nedarim && !nedarimErr && <p className="text-sm text-gray-500">בודק חיבור לנדרים...</p>}
            {nedarimErr && <p className="text-sm text-red-700 font-semibold">{nedarimErr}</p>}
            {nedarim && (
              <>
                <p className={`text-sm font-bold ${nedarim.ok ? 'text-emerald-800' : 'text-red-800'}`}>
                  {nedarim.ok ? 'החיבור לנדרים תקין' : 'החיבור לנדרים נכשל'}
                </p>
                <p className="text-xs text-gray-600 mt-0.5">
                  {nedarim.credential}{nedarim.detail ? ` · ${nedarim.detail}` : ''}
                  {nedarim.ms != null ? ` · ${nedarim.ms}ms` : ''}
                </p>
                {!nedarim.usingApiKey && (
                  <p className="text-xs text-amber-700 mt-1 font-medium">
                    ⚠ עדיין בשימוש האימות הישן — הוא נחסם ב-20/08/2026
                  </p>
                )}
              </>
            )}
          </div>
          <span className="text-2xl">{nedarim?.ok ? '🔌' : '⚠️'}</span>
        </div>
      </div>

      {/* ── ממצאים ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {loading && findings.length === 0
          ? [1,2,3,4,5].map(i => <div key={i} className="h-28 bg-gray-100 rounded-xl animate-pulse" />)
          : findings.map(f => {
            const failed = f.count === null
            const open   = (f.count ?? 0) > 0
            const clickable = open && !failed
            return (
              <button key={f.key} type="button" disabled={!clickable}
                onClick={() => clickable && openDetail(f.key, f.title)}
                className={`text-right rounded-xl border p-4 transition-colors ${
                failed ? 'bg-gray-50 border-gray-200 cursor-default'
                  : open ? 'bg-amber-50 border-amber-200 hover:border-amber-400 hover:bg-amber-100 cursor-pointer'
                  : 'bg-emerald-50 border-emerald-200 cursor-default'}`}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className={`text-2xl font-bold tabular-nums ${
                    failed ? 'text-gray-400' : open ? 'text-amber-700' : 'text-emerald-700'}`}>
                    {failed ? '—' : f.count}
                  </span>
                  <h4 className="text-sm font-bold text-gray-800 text-right">{f.title}</h4>
                </div>
                {!failed && open && f.amount != null && f.amount > 0 && (
                  <p className="text-xs font-semibold text-amber-700 mt-0.5 text-right">{fmt(f.amount)}</p>
                )}
                <p className="text-[11px] text-gray-500 mt-1.5 leading-snug text-right">
                  {failed ? `הבדיקה נכשלה: ${f.error}` : open ? f.hint : 'תקין — אין ממצאים'}
                </p>
                {clickable && (
                  <p className="text-[11px] font-semibold text-amber-700 mt-1.5 text-right">לחץ לרשימה ולטיפול ←</p>
                )}
              </button>
            )
          })}
      </div>

      {/* ── גילאי חוב ── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between flex-wrap gap-2">
          {aging.length > 0 && (
            <button onClick={exportAging}
              className="px-3 py-1.5 rounded-lg border border-gray-200 text-xs font-semibold text-gray-700 hover:border-[#1a3a7a]">
              📊 ייצוא לאקסל
            </button>
          )}
          <h3 className="font-bold text-gray-800">📅 גילאי חוב</h3>
        </div>

        {agingError ? (
          <p className="p-6 text-center text-sm text-red-600">שגיאה בחישוב: {agingError}</p>
        ) : loading && aging.length === 0 ? (
          <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
        ) : aging.length === 0 ? (
          <p className="p-6 text-center text-sm text-gray-400">אין חובות פתוחים 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs font-semibold text-gray-500">
                  <th className="px-3 py-2 text-right">הורה</th>
                  <th className="px-3 py-2 text-left">סה"כ באיחור</th>
                  <th className="px-3 py-2 text-left">עד 30</th>
                  <th className="px-3 py-2 text-left">30–60</th>
                  <th className="px-3 py-2 text-left">60–90</th>
                  <th className="px-3 py-2 text-left">90+</th>
                  <th className="px-3 py-2 text-left">חוב ישן</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {aging.map(r => (
                  <tr key={r.parentId} className="hover:bg-gray-50 transition-colors">
                    <td className="px-3 py-2">
                      <button onClick={() => onOpenParent(r.parentId)}
                        className="font-medium text-gray-800 hover:text-[#1a3a7a] hover:underline text-right">
                        {r.parentName}
                      </button>
                      {r.oldestDays > 0 && (
                        <span className="text-[10px] text-gray-400 mr-2">הישן ביותר: {r.oldestDays} ימים</span>
                      )}
                    </td>
                    {([
                      ['total',   r.total,   'סה"כ באיחור', 'font-bold text-red-700'],
                      ['d30',     r.d30,     'עד 30 יום',    'text-gray-600'],
                      ['d60',     r.d60,     '30–60 יום',    'text-amber-700'],
                      ['d90',     r.d90,     '60–90 יום',    'text-orange-700'],
                      ['d90plus', r.d90plus, '90+ יום',      'text-red-800 font-semibold'],
                      ['legacy',  r.legacy,  'חוב ישן',      'text-gray-400'],
                    ] as [string, number, string, string][]).map(([bucket, value, label, cls]) => (
                      <td key={bucket} className="px-3 py-2 text-left tabular-nums">
                        {value ? (
                          <button
                            onClick={e => { e.stopPropagation(); openCell(r.parentId, r.parentName, bucket, label, value) }}
                            className={`${cls} hover:underline decoration-dotted underline-offset-2`}
                            title="לחץ לפירוט התשלומים">
                            {fmt(value)}
                          </button>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 font-bold text-xs">
                  <td className="px-3 py-2 text-right">סה"כ · {aging.length} הורים</td>
                  <td className="px-3 py-2 text-left tabular-nums text-red-700">{fmt(agingTotals.total)}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(agingTotals.d30)}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(agingTotals.d60)}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(agingTotals.d90)}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(agingTotals.d90plus)}</td>
                  <td className="px-3 py-2 text-left tabular-nums text-gray-400">{fmt(agingTotals.legacy)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        <p className="px-4 py-2 text-[11px] text-gray-400 border-t border-gray-100 text-right">
          נספר רק חוב שתשלום אוטומטי יכול להקטין — בלי משכורות, בלי חוב ישן ובלי מה שלפני החיתוך.
          חוב ישן מוצג בעמודה נפרדת וניתן לסגירה רק בקישור ידני.
        </p>
      </div>

      {/* ── פירוט תא בגילאי חוב ── */}
      {cell && (
        <div className="fixed inset-0 z-[76] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setCell(null) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden" dir="rtl">
            <div className="px-5 py-4 flex items-center justify-between shrink-0"
              style={{ background: 'linear-gradient(90deg, #0d1f52, #1a3a7a)' }}>
              <button onClick={() => setCell(null)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
              <div className="text-right">
                <h2 className="text-lg font-bold text-white">{cell.parentName}</h2>
                <p className="text-xs text-white/70">{cell.label}</p>
              </div>
            </div>

            <div className="px-5 py-2 border-b border-gray-100 flex items-center justify-between shrink-0">
              <button
                onClick={() => { const pid = cell.parentId; setCell(null); onOpenParent(pid) }}
                className="px-3 py-1.5 rounded-lg bg-[#1a3a7a] text-white text-xs font-semibold">
                פתח כרטיס הורה ←
              </button>
              {cellRows.length > 0 && (
                <span className="text-xs font-bold text-gray-700">
                  {cellRows.length} תשלומים · {fmt(cellRows.reduce((a, x) => a + x.balance, 0))}
                </span>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {cellLoading ? (
                <div className="p-4 space-y-2">{[1,2,3].map(i => <div key={i} className="h-11 bg-gray-100 rounded animate-pulse" />)}</div>
              ) : cellRows.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-400">אין פירוט להצגה</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-xs font-semibold text-gray-500">
                      <th className="px-4 py-2 text-right">חודש</th>
                      <th className="px-4 py-2 text-right">סוג</th>
                      <th className="px-4 py-2 text-left">סכום</th>
                      <th className="px-4 py-2 text-left">יתרה</th>
                      <th className="px-4 py-2 text-left">באיחור</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {cellRows.map(x => (
                      <tr key={x.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800">{x.monthYear || x.date || '—'}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">{x.name || '—'}</td>
                        <td className="px-4 py-2 text-left tabular-nums text-gray-500">{fmt(x.amount)}</td>
                        <td className="px-4 py-2 text-left tabular-nums font-semibold text-red-700">{fmt(x.balance)}</td>
                        <td className="px-4 py-2 text-left text-xs text-gray-400">
                          {x.bucket === 'legacy' ? 'חוב ישן' : `${x.days} ימים`}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── רשימת טיפול מהיר ── */}
      {detail && (
        <div className="fixed inset-0 z-[75] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setDetail(null) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden" dir="rtl">
            <div className="px-5 py-4 flex items-center justify-between shrink-0"
              style={{ background: 'linear-gradient(90deg, #0d1f52, #1a3a7a)' }}>
              <button onClick={() => setDetail(null)} className="text-white/70 hover:text-white text-xl leading-none">✕</button>
              <h2 className="text-lg font-bold text-white">
                {detail.title}{rows.length > 0 ? ` · ${rows.length}` : ''}
              </h2>
            </div>

            {/* פעולות מרוכזות לפי סוג הממצא */}
            <div className="px-5 py-3 border-b border-gray-100 flex flex-wrap items-center gap-2 shrink-0">
              {detail.key === 'returns' && (
                <a href="/dashboard/automations"
                  className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700">
                  ↩️ לתיקון החזרות באוטומציות
                </a>
              )}
              {(detail.key === 'unlinked' || detail.key === 'orphan-credit') && (
                <button onClick={relinkListed}
                  className="px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-semibold hover:bg-emerald-800">
                  🔄 ריענון לכל ההורים ברשימה
                </button>
              )}
              {detail.key === 'so-no-parent' && (
                <a href="/dashboard/parents"
                  className="px-3 py-1.5 rounded-lg bg-[#1a3a7a] text-white text-xs font-semibold">
                  לשיוך הו"ק להורה
                </a>
              )}
              {detail.key === 'unlinked' && rows.length > 0 && (() => {
                const fixable = rows.filter(r => !r.label.startsWith('אין חוב פתוח'))
                const sum = (rs: typeof rows) => rs.reduce((a, r) => a + r.amount, 0)
                return (
                  <span className="text-xs text-gray-600">
                    <strong className="text-amber-700">{fixable.length}</strong> עם חוב פתוח ({fmt(sum(fixable))})
                    {' · '}
                    <strong className="text-gray-500">{rows.length - fixable.length}</strong> בלי חוב פתוח ({fmt(sum(rows) - sum(fixable))})
                  </span>
                )
              })()}
              {bulkMsg && <span className="text-xs font-semibold text-emerald-700">{bulkMsg}</span>}
              <span className="text-[11px] text-gray-400 mr-auto">לחיצה על שורה פותחת את כרטיס ההורה</span>
            </div>

            <div className="flex-1 overflow-y-auto">
              {rowsLoading ? (
                <div className="p-4 space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded animate-pulse" />)}</div>
              ) : rows.length === 0 ? (
                <p className="p-8 text-center text-sm text-gray-400">אין פריטים להצגה</p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50">
                    <tr className="text-xs font-semibold text-gray-500">
                      <th className="px-4 py-2 text-right">הורה</th>
                      <th className="px-4 py-2 text-right">פרטים</th>
                      <th className="px-4 py-2 text-left">סכום</th>
                      <th className="px-4 py-2 text-left">תאריך</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {rows.map(r => (
                      <tr key={r.id}
                        onClick={() => { if (r.parentId) { setDetail(null); onOpenParent(r.parentId) } }}
                        className={`${r.parentId ? 'cursor-pointer hover:bg-blue-50' : ''} transition-colors`}>
                        <td className="px-4 py-2 font-medium text-gray-800">{r.parentName}</td>
                        <td className="px-4 py-2 text-xs text-gray-500">
                          <span className="font-medium text-gray-700">{r.label}</span>
                          {r.sub ? ` · ${r.sub}` : ''}
                        </td>
                        <td className="px-4 py-2 text-left tabular-nums font-semibold text-gray-800">
                          {r.amount ? fmt(r.amount) : '—'}
                        </td>
                        <td className="px-4 py-2 text-left text-xs text-gray-400">{r.date || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
