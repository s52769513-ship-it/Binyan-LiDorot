'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import EmployeeCard from './EmployeeCard'

const AddParentModal      = dynamic(() => import('./AddParentModal'),      { ssr: false })
const AddTransactionModal = dynamic(() => import('./AddTransactionModal'), { ssr: false })
const DeptDebtModal       = dynamic(() => import('./DeptDebtModal'),       { ssr: false })

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
interface DeptStat    { name: string; planned: number; actual: number; debt: number; parentsInDebt: number; collectionPct: number }

interface DashboardData {
  plannedThisMonth: number
  actualThisMonth: number
  totalDebt: number
  parentsInDebt: number
  debtAlerts: DebtAlert[]
  recentTransactions: RecentTx[]
  monthlyData: MonthlyItem[]
  lastSync: string | null
  departmentStats: DeptStat[]
}

interface AnalyticsMonthItem { month: string; income: number; expenses: number; balance: number }
interface BreakdownItem      { name: string; amount: number }
interface TypeItem           { type: string; amount: number }
interface AnalyticsData {
  monthlyData: AnalyticsMonthItem[]
  typeBreakdown: TypeItem[]
  bankClassBreakdown: BreakdownItem[]
  paymentMethodBreakdown: BreakdownItem[]
  totalIncome: number
  totalExpenses: number
  totalBalance: number
  periodMonths: number
}

const DEPT_COLOR: Record<string, { bg: string; bar: string; dot: string }> = {
  'תלמוד תורה':       { bg: 'bg-blue-50',   bar: '#1a3a7a', dot: '#1a3a7a' },
  'בית חינוך לבנות': { bg: 'bg-purple-50', bar: '#7c3aed', dot: '#7c3aed' },
  'אחר':              { bg: 'bg-gray-50',   bar: '#6b7280', dot: '#6b7280' },
}

const ANALYTICS_COLORS = [
  '#1a3a7a', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#f97316', '#84cc16',
]

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

function DeptCard({ d, onClick }: { d: DeptStat; onClick: () => void }) {
  const c = DEPT_COLOR[d.name] ?? DEPT_COLOR['אחר']
  return (
    <button
      onClick={onClick}
      className={`rounded-lg border border-gray-200 p-3 flex flex-col gap-1.5 ${c.bg} w-full text-right hover:shadow-md hover:border-gray-300 transition-all`}
    >
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold text-gray-700">{d.name}</span>
        <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600">
          {d.collectionPct}% גבייה
        </span>
      </div>
      <div className="grid grid-cols-3 gap-1 text-center">
        <div>
          <div className="text-[10px] text-gray-400">צפוי</div>
          <div className="text-xs font-semibold text-gray-700">₪{fmt(d.planned)}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">נגבה</div>
          <div className="text-xs font-semibold text-emerald-700">₪{fmt(d.actual)}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-400">חוב</div>
          <div className="text-xs font-semibold text-red-600">₪{fmt(d.debt)}</div>
        </div>
      </div>
      <MiniBar pct={d.collectionPct} color={c.bar} />
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-gray-400">{d.parentsInDebt} משפחות בחוב</div>
        <div className="text-[10px] text-gray-400">פירוט ←</div>
      </div>
    </button>
  )
}

function MonthChart({ data }: { data: MonthlyItem[] }) {
  if (!data.length) return null
  const max = Math.max(...data.flatMap(d => [d.planned, d.actual]), 1)
  const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">גביית שכ״ל — 6 חודשים</span>
        <div className="flex items-center gap-3">
          <div className="flex gap-2 text-[10px] text-gray-400">
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-gray-200" />צפוי</span>
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />נגבה</span>
          </div>
          <a href="/dashboard/transactions" className="text-[10px] text-[#1a3a7a] underline whitespace-nowrap">כל התנועות ←</a>
        </div>
      </div>
      <div className="flex items-end gap-1.5">
        {data.map(d => {
          const planH = (d.planned / max) * 100
          const actH  = (d.actual  / max) * 100
          const isCur = d.month === currentMonth
          return (
            <div key={d.month} className="flex-1 flex flex-col items-center gap-0.5">
              <div className={`text-[9px] tabular-nums leading-tight ${isCur ? 'text-[#1a3a7a] font-bold' : 'text-gray-400'}`}>
                {d.actual > 0 ? `₪${Math.round(d.actual / 1000)}k` : ''}
              </div>
              <div className="w-full flex items-end gap-0.5" style={{ height: 52 }}>
                <div className="flex-1 rounded-t" style={{ height: `${planH}%`, background: '#e5e7eb', minHeight: 2 }} />
                <div className="flex-1 rounded-t" style={{
                  height: `${actH}%`,
                  background: isCur ? '#1a3a7a' : '#10b981',
                  minHeight: d.actual > 0 ? 2 : 0,
                }} />
              </div>
              <div className={`text-[9px] tabular-nums ${isCur ? 'font-bold text-[#1a3a7a]' : 'text-gray-400'}`}>
                {d.month.slice(0, 2)}
              </div>
              <div className="text-[8px] text-gray-300 tabular-nums leading-tight">
                {d.planned > 0 ? `${Math.round(d.planned / 1000)}k` : ''}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Analytics components ────────────────────────────────────────────────────

function AnalyticsKPI({ label, value, color, sub }: { label: string; value: number; color: string; sub?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3 flex flex-col gap-1">
      <div className="text-[11px] text-gray-500">{label}</div>
      <div className="text-lg font-bold tabular-nums" style={{ color }}>
        <span className="text-xs font-normal text-gray-400">₪</span>{fmt(value)}
      </div>
      {sub && <div className="text-[10px] text-gray-400">{sub}</div>}
    </div>
  )
}

function AnalyticsBarChart({ data, period }: { data: AnalyticsMonthItem[]; period: string }) {
  if (!data.length) return <div className="text-center text-xs text-gray-400 py-8">אין נתונים</div>
  const max = Math.max(...data.flatMap(d => [d.income, d.expenses]), 1)
  const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
  const showAll = period === 'all' && data.length > 24

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold text-gray-700">הכנסות והוצאות לפי חודש</span>
        <div className="flex gap-2 text-[10px] text-gray-400">
          <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-emerald-500" />הכנסות</span>
          <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-red-400" />הוצאות</span>
        </div>
      </div>
      <div className={`flex items-end gap-1 ${showAll ? 'overflow-x-auto' : ''}`}
           style={showAll ? { minWidth: `${data.length * 28}px` } : {}}>
        {data.map(d => {
          const incH = (d.income / max) * 100
          const expH = (d.expenses / max) * 100
          const isCur = d.month === currentMonth
          return (
            <div key={d.month} className="flex-1 min-w-[22px] flex flex-col items-center gap-0.5">
              <div className={`text-[8px] tabular-nums leading-tight ${isCur ? 'text-[#1a3a7a] font-bold' : 'text-gray-400'}`}>
                {d.income > 0 ? `${Math.round(d.income / 1000)}k` : ''}
              </div>
              <div className="w-full flex items-end gap-0.5" style={{ height: 60 }}>
                <div className="flex-1 rounded-t bg-emerald-400" style={{ height: `${incH}%`, minHeight: d.income > 0 ? 2 : 0 }} />
                <div className="flex-1 rounded-t bg-red-300" style={{ height: `${expH}%`, minHeight: d.expenses > 0 ? 2 : 0 }} />
              </div>
              <div className={`text-[8px] tabular-nums ${isCur ? 'font-bold text-[#1a3a7a]' : 'text-gray-400'}`}>
                {d.month.slice(0, 2)}/{d.month.slice(5)}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function HBarChart({ title, items, total }: { title: string; items: { name: string; amount: number }[]; total: number }) {
  if (!items.length) return null
  const max = items[0]?.amount ?? 1
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-xs font-semibold text-gray-700 mb-2">{title}</div>
      <div className="space-y-2">
        {items.slice(0, 8).map((item, i) => {
          const pct = Math.round((item.amount / total) * 100)
          const barPct = (item.amount / max) * 100
          return (
            <div key={item.name} className="space-y-0.5">
              <div className="flex justify-between items-center">
                <span className="text-[10px] text-gray-500 truncate flex-1 ml-2">{item.name}</span>
                <span className="text-[10px] font-semibold text-gray-700 tabular-nums flex-shrink-0">
                  ₪{fmt(item.amount)} <span className="text-gray-400 font-normal">({pct}%)</span>
                </span>
              </div>
              <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full transition-all"
                  style={{ width: `${barPct}%`, background: ANALYTICS_COLORS[i % ANALYTICS_COLORS.length] }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type ViewMode = 'current' | 'analytics'
type AnalyticsPeriod = '6' | '12' | 'all'

export default function Dashboard() {
  const [data, setData]             = useState<DashboardData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [showAddParent, setShowAddParent] = useState(false)
  const [showAddTx, setShowAddTx]   = useState(false)
  const [deptModal, setDeptModal]   = useState<string | null>(null)

  const [view, setView]             = useState<ViewMode>('current')
  const [period, setPeriod]         = useState<AnalyticsPeriod>('6')
  const [analytics, setAnalytics]   = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(false)

  const load = () => {
    setLoading(true); setError('')
    fetch('/api/summary')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('שגיאה בחיבור לשרת'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const loadAnalytics = (p: AnalyticsPeriod) => {
    setAnalyticsLoading(true)
    fetch(`/api/analytics?period=${p}`)
      .then(r => r.json())
      .then(d => { if (!d.error) setAnalytics(d) })
      .catch(() => {})
      .finally(() => setAnalyticsLoading(false))
  }

  useEffect(() => {
    if (view === 'analytics') loadAnalytics(period)
  }, [view, period])

  const d = data
  const collectionPct = d && d.plannedThisMonth > 0
    ? Math.round((d.actualThisMonth / d.plannedThisMonth) * 100) : 0
  const lastSyncLabel = d?.lastSync
    ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d.lastSync))
    : null

  return (
    <div className="space-y-3" dir="rtl">

      {/* Top bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setShowAddParent(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a3a7a] text-white text-xs font-medium hover:bg-[#1a3a7a]/90 transition-colors">
          + משפחה
        </button>
        <button onClick={() => setShowAddTx(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 transition-colors">
          + תנועה
        </button>

        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
          {(['current', 'analytics'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                view === v ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {v === 'current' ? 'חודש שוטף' : 'ניתוח היסטורי'}
            </button>
          ))}
        </div>

        {lastSyncLabel && (
          <span className="mr-auto text-[10px] text-gray-400">סנכרן {lastSyncLabel}</span>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs flex items-center justify-between">
          <button onClick={load} className="text-red-600 underline">נסה שוב</button>
          <span>{error}</span>
        </div>
      )}

      {/* ── CURRENT MONTH VIEW ── */}
      {view === 'current' && (
        <>
          {/* KPI row */}
          <div className="grid grid-cols-4 gap-2">
            {loading ? [1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />) : (
              <>
                {[
                  { label: 'צפוי החודש', value: d?.plannedThisMonth ?? 0, pct: 100, fill: '#8899cc', dot: '#1a3a7a', sub: 'תשלומים מתוכננים' },
                  { label: 'נגבה בפועל',  value: d?.actualThisMonth ?? 0,  pct: collectionPct, fill: '#10b981', dot: '#10b981',
                    sub: `${collectionPct}% · פער ₪${fmt(Math.abs((d?.actualThisMonth ?? 0) - (d?.plannedThisMonth ?? 0)))}` },
                  { label: 'חוב שכ״ל',   value: d?.totalDebt ?? 0, pct: Math.min(100, ((d?.totalDebt ?? 0) / Math.max(d?.plannedThisMonth ?? 1, 1)) * 100), fill: '#f59e0b', dot: '#f59e0b', sub: 'יתרה פתוחה' },
                  { label: 'משפחות בחוב', value: d?.parentsInDebt ?? 0, pct: d && d.parentsInDebt > 0 ? 60 : 0, fill: '#ef4444', dot: '#ef4444', sub: 'ממתינות לגבייה' },
                ].map(({ label, value, pct, fill, dot, sub }) => (
                  <div key={label} className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: dot }} />
                      <span className="text-[11px] text-gray-600 leading-tight">{label}</span>
                    </div>
                    <div className="text-xl font-bold tabular-nums text-gray-900 leading-none">
                      <span className="text-xs font-normal text-gray-400">₪</span>{fmt(value)}
                    </div>
                    <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: fill }} />
                    </div>
                    <div className="text-[10px] text-gray-400 truncate">{sub}</div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Department breakdown */}
          {(loading || (d?.departmentStats && d.departmentStats.length > 0)) && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5">חלוקה לפי אגף — החודש</div>
              <div className="grid grid-cols-2 gap-2">
                {loading
                  ? [1,2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)
                  : (d?.departmentStats ?? [] as DeptStat[]).map((ds: DeptStat) => (
                      <DeptCard key={ds.name} d={ds} onClick={() => setDeptModal(ds.name)} />
                    ))
                }
              </div>
            </div>
          )}

          {/* Bottom row: debt alerts + recent tx */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="lg:col-span-2 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-700">התראות חוב</span>
                {!loading && d && <span className="text-[10px] text-gray-400">· {d.parentsInDebt} משפחות</span>}
                {!loading && d && d.debtAlerts.length > 0 && (
                  <span className="mr-auto px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700">
                    ● {d.debtAlerts.length} גבוהים
                  </span>
                )}
              </div>
              {loading ? (
                <div className="p-3 space-y-1.5">{[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}</div>
              ) : !d?.debtAlerts.length ? (
                <div className="py-8 text-center text-gray-400 text-xs">אין חובות פתוחים</div>
              ) : (
                <div className="divide-y divide-gray-50">
                  {d.debtAlerts.map(a => (
                    <button key={a.id} onClick={() => setSelectedId(a.id)}
                      className="w-full flex items-center gap-2 px-3 py-2 hover:bg-red-50/40 transition-colors text-right">
                      <div className="w-0.5 self-stretch rounded-full bg-red-400 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 text-xs truncate">{a.name}</div>
                        <div className="text-[10px] text-gray-400">{a.childrenCount} ילדים</div>
                      </div>
                      <div className="text-xs font-bold tabular-nums text-red-600 flex-shrink-0">₪{fmt(a.balance)}</div>
                    </button>
                  ))}
                </div>
              )}
              {!loading && d && d.parentsInDebt > 6 && (
                <div className="px-3 py-1.5 border-t border-gray-100 text-[10px] text-gray-400 text-left">
                  ועוד {d.parentsInDebt - 6} →{' '}
                  <a href="/dashboard/parents?debt=debt" className="underline text-[#1a3a7a]">כל הרשימה</a>
                </div>
              )}
            </div>

            <div className="lg:col-span-1 bg-white rounded-lg border border-gray-200 overflow-hidden">
              <div className="flex items-center px-3 py-2 border-b border-gray-100">
                <span className="text-xs font-semibold text-gray-700">תנועות אחרונות</span>
              </div>
              {loading ? (
                <div className="p-3 space-y-1.5">{[1,2,3,4,5].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
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
                        <div className="text-[10px] text-gray-400">{fmtDate(tx.date)}</div>
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
        </>
      )}

      {/* ── ANALYTICS VIEW ── */}
      {view === 'analytics' && (
        <div className="space-y-3">
          {/* Period selector */}
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-gray-500 font-medium">תקופה:</span>
            <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs">
              {([['6', '6 חודשים'], ['12', '12 חודשים'], ['all', 'הכל']] as [AnalyticsPeriod, string][]).map(([v, label]) => (
                <button key={v} onClick={() => setPeriod(v)}
                  className={`px-3 py-1.5 font-medium transition-colors ${
                    period === v ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}>
                  {label}
                </button>
              ))}
            </div>
            <a href="/dashboard/transactions" className="mr-auto text-[10px] text-[#1a3a7a] underline">
              כל התנועות ←
            </a>
          </div>

          {analyticsLoading ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-2">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />)}
              </div>
              <div className="h-40 bg-gray-100 rounded-lg animate-pulse" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
                <div className="h-48 bg-gray-100 rounded-lg animate-pulse" />
              </div>
            </div>
          ) : analytics ? (
            <>
              {/* KPI summary */}
              <div className="grid grid-cols-3 gap-2">
                <AnalyticsKPI
                  label="סה״כ הכנסות"
                  value={analytics.totalIncome}
                  color="#10b981"
                  sub={`${analytics.periodMonths} חודשים`}
                />
                <AnalyticsKPI
                  label="סה״כ הוצאות"
                  value={analytics.totalExpenses}
                  color="#ef4444"
                  sub={`${analytics.periodMonths} חודשים`}
                />
                <AnalyticsKPI
                  label="מאזן נטו"
                  value={analytics.totalBalance}
                  color={analytics.totalBalance >= 0 ? '#1a3a7a' : '#ef4444'}
                  sub={analytics.totalBalance >= 0 ? 'עודף' : 'גירעון'}
                />
              </div>

              {/* Monthly bar chart */}
              <AnalyticsBarChart data={analytics.monthlyData} period={period} />

              {/* Breakdowns grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {analytics.bankClassBreakdown.length > 0 && (
                  <HBarChart
                    title="סיווג בנק"
                    items={analytics.bankClassBreakdown}
                    total={analytics.totalIncome}
                  />
                )}
                {analytics.paymentMethodBreakdown.length > 0 && (
                  <HBarChart
                    title="אמצעי תשלום"
                    items={analytics.paymentMethodBreakdown}
                    total={analytics.totalIncome}
                  />
                )}
                {analytics.typeBreakdown.length > 0 && (
                  <HBarChart
                    title="סוג תנועה"
                    items={analytics.typeBreakdown.map(t => ({ name: t.type, amount: t.amount }))}
                    total={analytics.totalIncome}
                  />
                )}
              </div>
            </>
          ) : (
            <div className="py-12 text-center text-gray-400 text-sm">אין נתונים זמינים</div>
          )}
        </div>
      )}

      {deptModal && <DeptDebtModal framework={deptModal} onClose={() => setDeptModal(null)} />}
      {selectedId && <EmployeeCard parentId={selectedId} onClose={() => setSelectedId(null)} />}
      {showAddParent && (
        <AddParentModal onClose={() => setShowAddParent(false)} onSuccess={() => { setShowAddParent(false); load() }} />
      )}
      {showAddTx && (
        <AddTransactionModal onClose={() => setShowAddTx(false)} onSuccess={() => { setShowAddTx(false); load() }} />
      )}
    </div>
  )
}
