'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import EmployeeCard from './EmployeeCard'

const AddParentModal      = dynamic(() => import('./AddParentModal'),      { ssr: false })
const AddTransactionModal = dynamic(() => import('./AddTransactionModal'), { ssr: false })

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

const fmtDate = (d: string) => {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return day ? `${day}/${m}` : d
}

interface DebtAlert   { id: string; name: string; balance: number; childrenCount: number }
interface RecentTx    { id: string; amount: number; type: string; date: string; monthYear: string; notes: string; parentName: string }
interface MonthlyItem { month: string; planned: number; actual: number }
interface DeptStat    { framework: string; expected: number; paid: number; remaining: number; totalDebt: number; familiesCount: number; pct: number }

interface DashboardData {
  plannedThisMonth: number
  actualThisMonth: number
  totalDebt: number
  parentsInDebt: number
  debtAlerts: DebtAlert[]
  recentTransactions: RecentTx[]
  monthlyData: MonthlyItem[]
  lastSync: string | null
}

function KpiCard({
  label, value, sub, pct, fillColor, dotColor, footer,
}: {
  label: string; value: number; sub?: string; pct: number; fillColor: string; dotColor: string; footer?: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: dotColor }} />
        <span className="text-xs text-gray-500 leading-tight">{label}</span>
        {sub && <span className="text-[11px] text-gray-400 mr-auto">{sub}</span>}
      </div>
      <div className="text-xl font-bold tabular-nums text-gray-900 leading-none">
        <span className="text-sm font-normal text-gray-400 ml-0.5">₪</span>{fmt(value)}
      </div>
      <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, pct)}%`, background: fillColor }} />
      </div>
      {footer && <div className="text-[11px] text-gray-500 flex items-center gap-1">{footer}</div>}
    </div>
  )
}

function MonthChart({ data }: { data: MonthlyItem[] }) {
  if (!data.length) return null
  const max = Math.max(...data.flatMap(d => [d.planned, d.actual]), 1)
  const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm px-3 py-2.5">
      <div className="flex items-baseline justify-between mb-2">
        <h3 className="text-xs font-semibold text-gray-600">גביית שכ״ל לאורך השנה</h3>
        <span className="text-[11px] text-gray-400">אלפי ₪</span>
      </div>
      <div className="flex items-end gap-1 h-20">
        {data.map(d => {
          const planH = (d.planned / max) * 100
          const actH  = (d.actual  / max) * 100
          const isCur = d.month === currentMonth
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
              <div className="w-full flex items-end gap-0.5" style={{ height: 64 }}>
                <div className="flex-1 rounded-t" style={{ height: `${planH}%`, background: '#e5e7eb', minHeight: 2 }} />
                <div className="flex-1 rounded-t" style={{
                  height: `${actH}%`,
                  background: isCur ? '#1a3a7a' : '#10b981',
                  minHeight: d.actual > 0 ? 2 : 0,
                }} />
              </div>
              <div className={`text-[9px] tabular-nums whitespace-nowrap ${isCur ? 'font-bold text-[#1a3a7a]' : 'text-gray-400'}`}>
                {d.month.slice(0, 2)}
              </div>
            </div>
          )
        })}
      </div>
      <div className="flex gap-3 mt-1.5 text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-gray-200" />צפוי</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />נגבה</span>
        <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-sm bg-[#1a3a7a]" />חודש פעיל</span>
      </div>
    </div>
  )
}

function DepartmentBlock() {
  const [depts, setDepts]     = useState<DeptStat[] | null>(null)
  const [month, setMonth]     = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/summary/department')
      .then(r => r.json())
      .then(d => { setDepts(d.departments ?? []); setMonth(d.month ?? '') })
      .catch(() => setDepts([]))
      .finally(() => setLoading(false))
  }, [])

  const FW_COLOR: Record<string, { bar: string; badge: string; text: string }> = {
    'תלמוד תורה':       { bar: '#1a3a7a', badge: 'bg-blue-50 text-blue-800',    text: 'text-blue-700' },
    'בית חינוך לבנות': { bar: '#7c3aed', badge: 'bg-violet-50 text-violet-800', text: 'text-violet-700' },
    'לא מוגדר':         { bar: '#9ca3af', badge: 'bg-gray-50 text-gray-500',     text: 'text-gray-500' },
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
        <h3 className="text-xs font-semibold text-gray-700">סיכום לפי אגף</h3>
        {month && <span className="text-[11px] text-gray-400">· {month}</span>}
      </div>

      {loading ? (
        <div className="p-3 flex gap-2">
          {[1, 2].map(i => <div key={i} className="flex-1 h-16 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : !depts?.length ? (
        <div className="py-6 text-center text-gray-400 text-xs">אין נתונים</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x sm:divide-x-reverse divide-gray-100">
          {depts.map(d => {
            const colors = FW_COLOR[d.framework] ?? FW_COLOR['לא מוגדר']
            return (
              <div key={d.framework} className="px-3 py-2.5 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full ${colors.badge}`}>{d.framework}</span>
                  <span className="text-[11px] text-gray-400 mr-auto">{d.familiesCount} משפחות</span>
                  <span className={`text-[11px] font-bold tabular-nums ${colors.text}`}>{d.pct}%</span>
                </div>

                <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${Math.min(100, d.pct)}%`, background: colors.bar }} />
                </div>

                <div className="grid grid-cols-3 gap-1 text-center">
                  <div>
                    <div className="text-[10px] text-gray-400">צפוי</div>
                    <div className="text-xs font-semibold tabular-nums text-gray-800">₪{fmt(d.expected)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">שולם</div>
                    <div className="text-xs font-semibold tabular-nums text-emerald-700">₪{fmt(d.paid)}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-gray-400">נותר</div>
                    <div className="text-xs font-semibold tabular-nums text-amber-600">₪{fmt(d.remaining)}</div>
                  </div>
                </div>

                {d.totalDebt > 0 && (
                  <div className="flex items-center justify-between text-[11px] border-t border-gray-50 pt-1">
                    <span className="text-gray-400">חוב מצטבר</span>
                    <span className="font-semibold text-red-500 tabular-nums">₪{fmt(d.totalDebt)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Dashboard() {
  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [selectedId, setSelectedId]         = useState<string | null>(null)
  const [showAddParent, setShowAddParent]   = useState(false)
  const [showAddTx, setShowAddTx]           = useState(false)

  const load = () => {
    setLoading(true)
    setError('')
    fetch('/api/summary')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('שגיאה בחיבור לשרת'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const d = data

  const collectionPct = d && d.plannedThisMonth > 0
    ? Math.round((d.actualThisMonth / d.plannedThisMonth) * 100)
    : 0

  const lastSyncLabel = d?.lastSync
    ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d.lastSync))
    : null

  return (
    <div className="space-y-3" dir="rtl">
      {/* Quick-add buttons */}
      <div className="flex gap-2 justify-start">
        <button onClick={() => setShowAddParent(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1a3a7a] text-white text-xs font-medium hover:bg-[#1a3a7a]/90 transition-colors">
          <span className="leading-none">+</span> הוספת משפחה
        </button>
        <button onClick={() => setShowAddTx(true)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 transition-colors">
          <span className="leading-none">+</span> הוספת תנועה
        </button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
          <button onClick={load} className="text-red-600 underline text-xs">נסה שוב</button>
          <span>{error}</span>
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        {loading ? (
          [1,2,3,4].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)
        ) : (
          <>
            <KpiCard
              label="הכנסות צפויות החודש"
              value={d?.plannedThisMonth ?? 0}
              pct={100}
              fillColor="#8899cc"
              dotColor="#1a3a7a"
              footer={<><span className="text-gray-400">תשלומים מתוכננים</span></>}
            />
            <KpiCard
              label="נגבה בפועל"
              value={d?.actualThisMonth ?? 0}
              pct={collectionPct}
              fillColor="#10b981"
              dotColor="#10b981"
              footer={
                <>
                  <span className="font-semibold text-emerald-700">{collectionPct}%</span>
                  <span className="text-gray-400">מהצפי</span>
                  <span className="mr-auto text-gray-400">
                    פער ₪{fmt(Math.abs((d?.actualThisMonth ?? 0) - (d?.plannedThisMonth ?? 0)))}
                  </span>
                </>
              }
            />
            <KpiCard
              label="חוב שכ״ל כולל"
              value={d?.totalDebt ?? 0}
              pct={Math.min(100, ((d?.totalDebt ?? 0) / Math.max(d?.plannedThisMonth ?? 1, 1)) * 100)}
              fillColor="#f59e0b"
              dotColor="#f59e0b"
              footer={<><span className="text-gray-400">יתרה פתוחה מכל החודשים</span></>}
            />
            <KpiCard
              label="משפחות בחוב"
              value={d?.parentsInDebt ?? 0}
              sub=" "
              pct={d && d.parentsInDebt > 0 ? 60 : 0}
              fillColor="#ef4444"
              dotColor="#ef4444"
              footer={<><span className="text-gray-400">מחכות לגבייה</span></>}
            />
          </>
        )}
      </div>

      {/* Department summary */}
      <DepartmentBlock />

      {/* Middle row: debt alerts + recent transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Debt alerts */}
        <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700">התראות חוב</h3>
            {!loading && d && (
              <span className="text-[11px] text-gray-400">· {d.parentsInDebt} משפחות</span>
            )}
            {!loading && d && d.debtAlerts.length > 0 && (
              <span className="mr-auto px-1.5 py-0.5 rounded-full text-[11px] font-medium bg-red-50 text-red-700">
                ● {d.debtAlerts.length} עם חוב גבוה
              </span>
            )}
          </div>
          {loading ? (
            <div className="p-3 space-y-1.5">{[1,2,3,4].map(i =>
              <div key={i} className="h-10 bg-gray-100 rounded-md animate-pulse" />
            )}</div>
          ) : !d?.debtAlerts.length ? (
            <div className="py-8 text-center text-gray-400 text-xs">אין חובות פתוחים</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {d.debtAlerts.map(a => (
                <button
                  key={a.id}
                  onClick={() => setSelectedId(a.id)}
                  className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50/40 transition-colors text-right"
                >
                  <div className="w-1 self-stretch rounded-full bg-red-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-gray-900 text-xs truncate">{a.name}</div>
                    <div className="text-[11px] text-gray-400">{a.childrenCount} ילדים</div>
                  </div>
                  <div className="text-left flex-shrink-0">
                    <div className="text-xs font-bold tabular-nums text-red-600">₪{fmt(a.balance)}</div>
                    <div className="text-[11px] text-gray-400">חוב פתוח</div>
                  </div>
                </button>
              ))}
            </div>
          )}
          {!loading && d && d.parentsInDebt > 6 && (
            <div className="px-3 py-1.5 border-t border-gray-100 text-[11px] text-gray-400 text-left">
              ועוד {d.parentsInDebt - 6} משפחות →{' '}
              <a href="/dashboard/parents?debt=debt" className="underline text-[#1a3a7a]">לכל הרשימה</a>
            </div>
          )}
        </div>

        {/* Recent transactions */}
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
            <h3 className="text-xs font-semibold text-gray-700">תנועות אחרונות</h3>
            {lastSyncLabel && (
              <span className="mr-auto text-[11px] text-gray-400">סנכרן {lastSyncLabel}</span>
            )}
          </div>
          {loading ? (
            <div className="p-3 space-y-1.5">{[1,2,3,4,5].map(i =>
              <div key={i} className="h-8 bg-gray-100 rounded-md animate-pulse" />
            )}</div>
          ) : !d?.recentTransactions.length ? (
            <div className="py-8 text-center text-gray-400 text-xs">אין תנועות</div>
          ) : (
            <div className="divide-y divide-gray-50">
              {d.recentTransactions.map(tx => (
                <div key={tx.id} className="flex items-center gap-2 px-3 py-1.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-medium text-gray-900 truncate">
                      {tx.parentName || tx.notes || tx.type || '—'}
                    </div>
                    <div className="text-[11px] text-gray-400">{fmtDate(tx.date)} · {tx.type}</div>
                  </div>
                  <div className={`text-xs font-bold tabular-nums flex-shrink-0 ${tx.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                    {tx.amount < 0 ? '−' : '+'}₪{fmt(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Monthly chart */}
      {!loading && d && d.monthlyData.some(m => m.planned > 0 || m.actual > 0) && (
        <MonthChart data={d.monthlyData} />
      )}

      {selectedId && (
        <EmployeeCard parentId={selectedId} onClose={() => setSelectedId(null)} />
      )}
      {showAddParent && (
        <AddParentModal onClose={() => setShowAddParent(false)} onSuccess={() => { setShowAddParent(false); load() }} />
      )}
      {showAddTx && (
        <AddTransactionModal onClose={() => setShowAddTx(false)} onSuccess={() => { setShowAddTx(false); load() }} />
      )}
    </div>
  )
}
