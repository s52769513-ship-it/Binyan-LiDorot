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
            return (
              <div key={f.key} className={`rounded-xl border p-4 ${
                failed ? 'bg-gray-50 border-gray-200'
                  : open ? 'bg-amber-50 border-amber-200'
                  : 'bg-emerald-50 border-emerald-200'}`}>
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
              </div>
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
                    <td className="px-3 py-2 text-left tabular-nums font-bold text-red-700">{fmt(r.total)}</td>
                    <td className="px-3 py-2 text-left tabular-nums text-gray-600">{r.d30 ? fmt(r.d30) : '—'}</td>
                    <td className="px-3 py-2 text-left tabular-nums text-amber-700">{r.d60 ? fmt(r.d60) : '—'}</td>
                    <td className="px-3 py-2 text-left tabular-nums text-orange-700">{r.d90 ? fmt(r.d90) : '—'}</td>
                    <td className="px-3 py-2 text-left tabular-nums text-red-800 font-semibold">{r.d90plus ? fmt(r.d90plus) : '—'}</td>
                    <td className="px-3 py-2 text-left tabular-nums text-gray-400">{r.legacy ? fmt(r.legacy) : '—'}</td>
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
    </div>
  )
}
