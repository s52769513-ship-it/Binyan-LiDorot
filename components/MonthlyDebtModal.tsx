'use client'

import { useEffect, useMemo, useState } from 'react'

/* פורמט חודש "MM/YYYY" → "ינואר 2026" */
const HMONTHS: Record<string, string> = {
  '01': 'ינואר', '02': 'פברואר', '03': 'מרץ', '04': 'אפריל', '05': 'מאי', '06': 'יוני',
  '07': 'יולי', '08': 'אוגוסט', '09': 'ספטמבר', '10': 'אוקטובר', '11': 'נובמבר', '12': 'דצמבר',
}
function fmtMonth(my: string): string {
  const [m, y] = (my || '').split('/')
  return m && y ? `${HMONTHS[m] ?? m} ${y}` : (my || '—')
}
const fmt = (n: number) => new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

interface ParentRecord {
  parentId: string
  parentName: string
  balance: number
  childrenCount: number
}
interface MonthBucket {
  monthYear: string
  total: number
  parents: ParentRecord[]
}
interface BreakdownData {
  months: MonthBucket[]
  grandTotal: number
  parentCount: number
}

export type DebtPool = 'tuition' | 'donation' | 'salary'
export interface PoolOption { key: DebtPool; label: string }

interface Props {
  /** בריכות חוב לבחירה. יותר מאחת → נציג טוגל שכ"ל/מגבית. */
  pools: PoolOption[]
  /** רק תאריכים שכבר עברו */
  dueOnly: boolean
  title: string
  /** צבע הדגשה (טאב פעיל, סכומים) */
  accent: string
  onClose: () => void
  onOpenParent: (parentId: string) => void
}

/**
 * מודל פירוט חוב לפי חודשים. אם יש יותר מבריכה אחת (שכ"ל/מגבית) — טוגל בראש.
 * טאב לכל חודש שיש בו חוב פתוח, ותחתיו רשומות ההורים עם היתרה. לחיצה על הורה
 * פותחת את הכרטיס שלו. חיפוש מסנן בכל החודשים.
 */
export default function MonthlyDebtModal({ pools, dueOnly, title, accent, onClose, onOpenParent }: Props) {
  const [pool, setPool]       = useState<DebtPool>(pools[0]?.key ?? 'tuition')
  const [data, setData]       = useState<BreakdownData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [activeMonth, setActiveMonth] = useState<string | null>(null)
  const [search, setSearch]   = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    fetch(`/api/debt-breakdown?pool=${encodeURIComponent(pool)}&dueOnly=${dueOnly ? 1 : 0}`)
      .then(r => r.json())
      .then((d: BreakdownData & { error?: string }) => {
        if (cancelled) return
        if (d.error) { setError(d.error); return }
        setData(d)
        const now = new Date()
        const cur = `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
        const hasCur = d.months.some(m => m.monthYear === cur)
        setActiveMonth(hasCur ? cur : d.months[d.months.length - 1]?.monthYear ?? null)
      })
      .catch(() => { if (!cancelled) setError('שגיאה בטעינת נתונים') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [pool, dueOnly])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const q = search.trim()
  const activeBucket = useMemo(
    () => data?.months.find(m => m.monthYear === activeMonth) ?? null,
    [data, activeMonth],
  )
  const visibleParents = useMemo(() => {
    if (!activeBucket) return []
    if (!q) return activeBucket.parents
    return activeBucket.parents.filter(p => p.parentName.includes(q))
  }, [activeBucket, q])

  const matchMonths = useMemo(() => {
    if (!data || !q) return null
    return data.months.filter(m => m.parents.some(p => p.parentName.includes(q))).map(m => m.monthYear)
  }, [data, q])

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between shrink-0"
          style={{ background: `linear-gradient(135deg, ${accent}, ${accent}dd)` }}>
          <div>
            <h2 className="text-white font-bold text-base">{title}</h2>
            {data && (
              <p className="text-white/80 text-xs mt-0.5">
                ₪{fmt(data.grandTotal)} · {data.parentCount} משפחות · {data.months.length} חודשים
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg leading-none transition-colors">
            ×
          </button>
        </div>

        {/* Pool toggle (שכ"ל / מגבית) */}
        {pools.length > 1 && (
          <div className="px-4 pt-3 shrink-0">
            <div className="inline-flex rounded-lg border border-gray-200 p-0.5 bg-gray-50">
              {pools.map(p => (
                <button
                  key={p.key}
                  onClick={() => { setPool(p.key); setSearch('') }}
                  className={`px-4 py-1.5 rounded-md text-xs font-semibold transition-all ${
                    pool === p.key ? 'text-white shadow-sm' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  style={pool === p.key ? { background: accent } : undefined}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search */}
        {!loading && !error && data && data.months.length > 0 && (
          <div className="px-4 pt-3 shrink-0">
            <input
              type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="חיפוש הורה..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2"
              style={{ '--tw-ring-color': `${accent}55` } as React.CSSProperties}
            />
            {matchMonths && (
              <p className="text-[11px] text-gray-400 mt-1">
                {matchMonths.length > 0 ? `נמצא ב-${matchMonths.length} חודשים` : 'לא נמצאו התאמות'}
              </p>
            )}
          </div>
        )}

        {/* Month tabs */}
        {!loading && !error && data && data.months.length > 0 && (
          <div className="px-4 pt-2 shrink-0">
            <div className="flex gap-1.5 overflow-x-auto pb-2">
              {data.months.map(m => {
                const isActive = m.monthYear === activeMonth
                const hasMatch = !q || m.parents.some(p => p.parentName.includes(q))
                return (
                  <button
                    key={m.monthYear}
                    onClick={() => setActiveMonth(m.monthYear)}
                    className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border ${
                      isActive ? 'text-white border-transparent' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                    } ${!hasMatch ? 'opacity-40' : ''}`}
                    style={isActive ? { background: accent } : undefined}
                  >
                    <span>{fmtMonth(m.monthYear)}</span>
                    <span className={`block text-[10px] font-normal ${isActive ? 'text-white/80' : 'text-gray-400'}`}>
                      ₪{fmt(m.total)} · {m.parents.length}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-4 pb-2 min-h-[200px]">
          {loading ? (
            <div className="space-y-2 pt-2">
              {[1, 2, 3, 4, 5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          ) : error ? (
            <div className="py-16 text-center text-red-400 text-sm">{error}</div>
          ) : !data || data.months.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">אין חוב פתוח 🎉</div>
          ) : visibleParents.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">
              {q ? 'אין התאמות בחודש זה' : 'אין רשומות בחודש זה'}
            </div>
          ) : (
            <div className="divide-y divide-gray-50 pt-1">
              {visibleParents.map(p => (
                <button
                  key={p.parentId || p.parentName}
                  onClick={() => p.parentId && onOpenParent(p.parentId)}
                  disabled={!p.parentId}
                  className="w-full flex items-center gap-3 px-2 py-3 hover:bg-gray-50 rounded-lg transition-colors text-right disabled:cursor-default group"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate group-hover:text-[#1a3a7a]">
                      {p.parentName}
                      {p.parentId && <span className="text-gray-300 text-xs mr-1 opacity-0 group-hover:opacity-100 transition-opacity">↗</span>}
                    </div>
                    {p.childrenCount > 0 && (
                      <div className="text-[11px] text-gray-400 mt-0.5">{p.childrenCount} ילדים</div>
                    )}
                  </div>
                  <div className="text-sm font-bold tabular-nums shrink-0" style={{ color: accent }}>
                    ₪{fmt(p.balance)}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer — active month total + grand total */}
        {!loading && !error && activeBucket && (
          <div className="border-t border-gray-100 px-5 py-3 shrink-0 bg-gray-50 flex items-center justify-between text-sm">
            <span className="text-gray-500">
              {fmtMonth(activeBucket.monthYear)}: <b className="tabular-nums" style={{ color: accent }}>₪{fmt(activeBucket.total)}</b>
            </span>
            <span className="text-gray-500">
              סה״כ: <b className="tabular-nums text-gray-800">₪{fmt(data!.grandTotal)}</b>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
