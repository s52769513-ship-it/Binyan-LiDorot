'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import EmployeeCard from './EmployeeCard'
import ChatPanel from './ChatPanel'

function UserBadge() {
  const [user, setUser] = useState<{ email: string; role: string } | null>(null)
  const [loggingOut, setLoggingOut] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => setUser(u ?? null)).catch(() => {})
  }, [])

  const handleLogout = useCallback(async () => {
    setLoggingOut(true)
    try {
      await fetch('/api/auth/logout', { method: 'POST' })
      window.location.href = '/'
    } catch {
      setLoggingOut(false)
    }
  }, [])

  if (!user) return null

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-2 rounded-lg px-3 py-1.5 border"
        style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', borderColor: '#d4a921', color: '#d4a921' }}
      >
        <span className="text-xs font-bold">{user.role}</span>
        <span className="text-[10px] opacity-60 hidden sm:inline">{user.email}</span>
      </div>
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="text-xs px-2.5 py-1.5 rounded-lg border border-gray-200 text-gray-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors disabled:opacity-50"
        title="יציאה מהמערכת"
      >
        {loggingOut ? '...' : 'יציאה'}
      </button>
    </div>
  )
}

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
  salaryDebt: number
  salaryDebtCount: number
  overdueAmount: number
  overdueCount: number
  ppCreditTotal: number
  ppCreditList: { id: string; name: string; ppCredit: number }[]
  overdueAlerts: { id: string; parentId: string; parentName: string; balance: number; date: string; monthYear: string }[]
  salaryAlerts: { parentId: string; parentName: string; balance: number; monthYear: string }[]
  donationMonthlyTotal?: number
  donationDonorsCount?: number
  donationPPsThisMonth?: number
  donationCollectedThisMonth?: number
}

interface CashflowMonth {
  monthYear: string
  isPast: boolean
  isCurrent: boolean
  tuition: { planned: number; collected: number; remaining: number; collectionPct: number; byDept: Record<string, { planned: number; collected: number; remaining: number }> }
  salary: { planned: number; paid: number; remaining: number }
  donation: { planned: number; collected: number; remaining: number; collectionPct: number }
  net: number
  netActual: number
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

// ─── RecordsPanel ─────────────────────────────────────────────────────────────

interface RecordsPanelProps {
  title: string
  records: { key: string; name: string; amount: number; sub?: string; parentId?: string; amountColor?: string }[]
  total?: number
  totalLabel?: string
  onClose: () => void
  onOpenParent: (id: string) => void
  loading?: boolean
}

const MIN_PANEL_WIDTH = 260
const MAX_PANEL_WIDTH = 560
const DEFAULT_PANEL_WIDTH = 340

function RecordsPanel({ title, records, total, totalLabel, onClose, onOpenParent, loading }: RecordsPanelProps) {
  const [width, setWidth] = useState(DEFAULT_PANEL_WIDTH)
  const dragging = useRef(false)
  const startX = useRef(0)
  const startW = useRef(0)

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    startX.current = e.clientX
    startW.current = width
    document.body.style.cursor = 'ew-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      // panel is on the right; dragging left (smaller clientX) = wider panel
      const delta = startX.current - ev.clientX
      const next = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, startW.current + delta))
      setWidth(next)
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  return (
    <div
      className="fixed inset-y-0 right-0 z-[70] bg-white shadow-xl flex flex-col"
      style={{ width }}
      dir="rtl"
    >
      {/* Resize handle – left edge */}
      <div
        onMouseDown={onMouseDown}
        className="absolute top-0 bottom-0 left-0 w-1.5 cursor-ew-resize group z-10"
        title="גרור לשינוי רוחב"
      >
        <div className="absolute inset-y-0 left-0 w-0.5 bg-gray-200 group-hover:bg-[#1a3a7a] transition-colors" />
      </div>

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-gray-50">
        <span className="text-sm font-semibold text-gray-800">{title}</span>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-gray-200 text-gray-500 hover:text-gray-700 transition-colors text-base font-bold"
        >
          ×
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 space-y-2">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : records.length === 0 ? (
          <div className="py-12 text-center text-gray-400 text-sm">אין רשומות</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {records.map(r => (
              <button
                key={r.key}
                onClick={() => r.parentId && onOpenParent(r.parentId)}
                disabled={!r.parentId}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-right disabled:cursor-default"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{r.name}</div>
                  {r.sub && <div className="text-[11px] text-gray-400 mt-0.5">{r.sub}</div>}
                </div>
                <div
                  className="text-sm font-bold tabular-nums flex-shrink-0"
                  style={{ color: r.amountColor ?? '#ef4444' }}
                >
                  ₪{fmt(r.amount)}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer total */}
      {total !== undefined && (
        <div className="border-t border-gray-200 px-4 py-3 bg-gray-50 flex items-center justify-between">
          <span className="text-xs font-semibold text-gray-600">{totalLabel ?? 'סה״כ'}</span>
          <span className="text-sm font-bold tabular-nums text-gray-900">₪{fmt(total)}</span>
        </div>
      )}
    </div>
  )
}

// ─── Cashflow table ───────────────────────────────────────────────────────────

function CashflowTable({ data, loading, showDept, onToggleDept }: {
  data: CashflowMonth[] | null
  loading: boolean
  showDept: boolean
  onToggleDept: () => void
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1,2,3,4,5,6,7,8,9].map(i => (
          <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
        ))}
      </div>
    )
  }
  if (!data) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      {/* Table header controls */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-gray-50">
        <span className="text-xs font-semibold text-gray-700">תזרים מזומנים — 9 חודשים</span>
        <button
          onClick={onToggleDept}
          className={`text-[11px] px-2.5 py-1 rounded border transition-colors ${
            showDept
              ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]'
              : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
          }`}
        >
          חלוקה לפי אגף
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs" dir="rtl">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-3 py-2 text-right font-semibold text-gray-600 whitespace-nowrap">חודש</th>
              {/* Tuition group */}
              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap border-r border-gray-100" colSpan={4}>
                הכנסות שכ״ל
              </th>
              {/* Donation group */}
              <th className="px-2 py-2 text-center font-semibold text-emerald-700 whitespace-nowrap border-r border-gray-100" colSpan={3}>
                דמי מגבית
              </th>
              {/* Salary group */}
              <th className="px-2 py-2 text-center font-semibold text-gray-600 whitespace-nowrap border-r border-gray-100" colSpan={3}>
                הוצאות משכורת
              </th>
              <th className="px-3 py-2 text-center font-semibold text-gray-600 whitespace-nowrap">נטו</th>
            </tr>
            <tr className="bg-gray-50 border-b border-gray-200 text-[10px] text-gray-400">
              <th className="px-3 py-1 text-right"></th>
              <th className="px-2 py-1 text-center">צפוי</th>
              <th className="px-2 py-1 text-center">נגבה</th>
              <th className="px-2 py-1 text-center">יתרה</th>
              <th className="px-2 py-1 text-center border-r border-gray-100">%</th>
              <th className="px-2 py-1 text-center">צפוי</th>
              <th className="px-2 py-1 text-center">נגבה</th>
              <th className="px-2 py-1 text-center border-r border-gray-100">יתרה</th>
              <th className="px-2 py-1 text-center">צפוי</th>
              <th className="px-2 py-1 text-center">שולם</th>
              <th className="px-2 py-1 text-center border-r border-gray-100">יתרה</th>
              <th className="px-3 py-1 text-center"></th>
            </tr>
          </thead>
          <tbody>
            {data.map(row => {
              const isPast = row.isPast
              const isCurrent = row.isCurrent
              const rowClass = isCurrent
                ? 'bg-blue-50 font-semibold'
                : isPast
                  ? 'text-gray-400'
                  : ''

              const deptEntries = showDept ? Object.entries(row.tuition.byDept) : []

              return (
                <>
                  <tr
                    key={row.monthYear}
                    className={`border-b border-gray-100 hover:bg-gray-50 transition-colors ${rowClass}`}
                  >
                    <td className="px-3 py-2 font-medium whitespace-nowrap">
                      {isCurrent && <span className="inline-block w-1.5 h-1.5 rounded-full bg-blue-500 ml-1 mb-0.5" />}
                      {row.monthYear}
                    </td>
                    {/* Tuition */}
                    <td className="px-2 py-2 text-center tabular-nums">{row.tuition.planned > 0 ? `₪${fmt(row.tuition.planned)}` : '—'}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${!isPast ? 'text-emerald-700' : ''}`}>
                      {row.tuition.collected > 0 ? `₪${fmt(row.tuition.collected)}` : '—'}
                    </td>
                    <td className={`px-2 py-2 text-center tabular-nums ${row.tuition.remaining > 0 && !isPast ? 'text-amber-600' : ''}`}>
                      {row.tuition.remaining > 0 ? `₪${fmt(row.tuition.remaining)}` : '—'}
                    </td>
                    <td className="px-2 py-2 text-center border-r border-gray-100">
                      {row.tuition.planned > 0 ? (
                        <span className={`text-[10px] px-1 py-0.5 rounded-full font-medium ${
                          row.tuition.collectionPct >= 90 ? 'bg-emerald-100 text-emerald-700' :
                          row.tuition.collectionPct >= 60 ? 'bg-amber-100 text-amber-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {row.tuition.collectionPct}%
                        </span>
                      ) : '—'}
                    </td>
                    {/* Donation */}
                    <td className="px-2 py-2 text-center tabular-nums">{row.donation.planned > 0 ? `₪${fmt(row.donation.planned)}` : '—'}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${row.donation.collected > 0 && !isPast ? 'text-emerald-700' : ''}`}>
                      {row.donation.collected > 0 ? `₪${fmt(row.donation.collected)}` : '—'}
                    </td>
                    <td className={`px-2 py-2 text-center tabular-nums border-r border-gray-100 ${row.donation.remaining > 0 && !isPast ? 'text-amber-600' : ''}`}>
                      {row.donation.remaining > 0 ? `₪${fmt(row.donation.remaining)}` : '—'}
                    </td>
                    {/* Salary */}
                    <td className="px-2 py-2 text-center tabular-nums">{row.salary.planned > 0 ? `₪${fmt(row.salary.planned)}` : '—'}</td>
                    <td className={`px-2 py-2 text-center tabular-nums ${row.salary.paid > 0 && !isPast ? 'text-red-600' : ''}`}>
                      {row.salary.paid > 0 ? `₪${fmt(row.salary.paid)}` : '—'}
                    </td>
                    <td className={`px-2 py-2 text-center tabular-nums border-r border-gray-100 ${row.salary.remaining > 0 && !isPast ? 'text-amber-600' : ''}`}>
                      {row.salary.remaining > 0 ? `₪${fmt(row.salary.remaining)}` : '—'}
                    </td>
                    {/* Net */}
                    <td className={`px-3 py-2 text-center tabular-nums font-bold ${
                      row.net >= 0 ? 'text-emerald-700' : 'text-red-600'
                    } ${isCurrent ? 'text-base' : ''}`}>
                      {row.net !== 0 ? `${row.net >= 0 ? '+' : '−'}₪${fmt(Math.abs(row.net))}` : '—'}
                    </td>
                  </tr>

                  {/* Dept breakdown rows */}
                  {showDept && deptEntries.map(([dept, vals]) => (
                    <tr
                      key={`${row.monthYear}-${dept}`}
                      className={`border-b border-gray-50 bg-gray-50/50 text-[10px] text-gray-500 ${isPast ? 'opacity-60' : ''}`}
                    >
                      <td className="px-3 py-1.5 pr-6 whitespace-nowrap">
                        <span className="flex items-center gap-1">
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ background: DEPT_COLOR[dept]?.dot ?? '#9ca3af' }}
                          />
                          {dept}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{vals.planned > 0 ? `₪${fmt(vals.planned)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{vals.collected > 0 ? `₪${fmt(vals.collected)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-center tabular-nums">{vals.remaining > 0 ? `₪${fmt(vals.remaining)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-center border-r border-gray-100">
                        {vals.planned > 0 ? `${Math.round((vals.collected / vals.planned) * 100)}%` : '—'}
                      </td>
                      <td colSpan={7} />
                    </tr>
                  ))}
                </>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// ─── Main Dashboard ───────────────────────────────────────────────────────────

type ViewMode = 'current' | 'cashflow' | 'analytics'
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

  const [cashflow, setCashflow]     = useState<CashflowMonth[] | null>(null)
  const [cashflowLoading, setCashflowLoading] = useState(false)
  const [showDeptBreakdown, setShowDeptBreakdown] = useState(false)

  const [activePanel, setActivePanel] = useState<'debt' | 'overdue' | 'salary' | 'credit' | null>(null)

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

  const loadCashflow = () => {
    setCashflowLoading(true)
    fetch('/api/cashflow')
      .then(r => r.json())
      .then(d => { if (!d.error) setCashflow(d) })
      .catch(() => {})
      .finally(() => setCashflowLoading(false))
  }

  useEffect(() => {
    if (view === 'analytics') loadAnalytics(period)
  }, [view, period])

  useEffect(() => {
    if (view === 'cashflow' && !cashflow) loadCashflow()
  }, [view])

  const d = data
  const collectionPct = d && d.plannedThisMonth > 0
    ? Math.round((d.actualThisMonth / d.plannedThisMonth) * 100) : 0
  const lastSyncLabel = d?.lastSync
    ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d.lastSync))
    : null

  // Build panel records
  const debtPanelRecords = (d?.debtAlerts ?? []).map(a => ({
    key: a.id,
    name: a.name,
    amount: a.balance,
    sub: `${a.childrenCount} ילדים`,
    parentId: a.id,
    amountColor: '#ef4444',
  }))

  const overduePanelRecords = (d?.overdueAlerts ?? []).map(a => ({
    key: a.id,
    name: a.parentName || a.parentId,
    amount: a.balance,
    sub: `${a.monthYear} · ${fmtDate(a.date)}`,
    parentId: a.parentId,
    amountColor: '#ef4444',
  }))

  const salaryPanelRecords = (d?.salaryAlerts ?? []).map((a, i) => ({
    key: `${a.parentId}-${i}`,
    name: a.parentName || a.parentId,
    amount: a.balance,
    sub: a.monthYear,
    parentId: a.parentId,
    amountColor: '#f59e0b',
  }))

  const creditPanelRecords = (d?.ppCreditList ?? []).map(p => ({
    key: p.id,
    name: p.name,
    amount: p.ppCredit,
    parentId: p.id,
    amountColor: '#10b981',
  }))

  type PanelRecord = { key: string; name: string; amount: number; sub?: string; parentId?: string; amountColor?: string }
  const activePanelConfig: Record<NonNullable<typeof activePanel>, {
    title: string
    records: PanelRecord[]
    total: number
    totalLabel: string
  }> = {
    debt: {
      title: 'חוב שכ״ל — משפחות בחוב',
      records: debtPanelRecords,
      total: d?.totalDebt ?? 0,
      totalLabel: 'סה״כ חוב',
    },
    overdue: {
      title: 'תשלומים בפיגור',
      records: overduePanelRecords,
      total: d?.overdueAmount ?? 0,
      totalLabel: 'סה״כ פיגור',
    },
    salary: {
      title: 'חוב משכורות',
      records: salaryPanelRecords,
      total: d?.salaryDebt ?? 0,
      totalLabel: 'סה״כ חוב משכורות',
    },
    credit: {
      title: 'זיכויים שמורים',
      records: creditPanelRecords,
      total: d?.ppCreditTotal ?? 0,
      totalLabel: 'סה״כ זיכויים',
    },
  }

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
          {(['current', 'cashflow', 'analytics'] as ViewMode[]).map(v => (
            <button key={v} onClick={() => setView(v)}
              className={`px-3 py-1.5 font-medium transition-colors ${
                view === v ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {v === 'current' ? 'חודש שוטף' : v === 'cashflow' ? 'תזרים עתידי' : 'ניתוח היסטורי'}
            </button>
          ))}
        </div>

        {lastSyncLabel && (
          <span className="text-[10px] text-gray-400">סנכרן {lastSyncLabel}</span>
        )}

        <div className="mr-auto">
          <UserBadge />
        </div>
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
          {/* KPI row — 6 cards in 3×2 grid */}
          <div className="grid grid-cols-3 gap-2">
            {loading ? [1,2,3,4,5,6].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />) : (
              <>
                {/* Row 1: Planned, Collected, Debt */}
                <div className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#1a3a7a' }} />
                    <span className="text-[11px] text-gray-600 leading-tight">צפוי החודש</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-gray-900 leading-none">
                    <span className="text-xs font-normal text-gray-400">₪</span>{fmt(d?.plannedThisMonth ?? 0)}
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: '100%', background: '#8899cc' }} />
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">תשלומים מתוכננים</div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#10b981' }} />
                    <span className="text-[11px] text-gray-600 leading-tight">נגבה בפועל</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-gray-900 leading-none">
                    <span className="text-xs font-normal text-gray-400">₪</span>{fmt(d?.actualThisMonth ?? 0)}
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, collectionPct)}%`, background: '#10b981' }} />
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">
                    {collectionPct}% · פער ₪{fmt(Math.abs((d?.actualThisMonth ?? 0) - (d?.plannedThisMonth ?? 0)))}
                  </div>
                </div>

                <button
                  onClick={() => setActivePanel('debt')}
                  className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1 text-right hover:shadow-md hover:border-amber-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f59e0b' }} />
                    <span className="text-[11px] text-gray-600 leading-tight">חוב שכ״ל</span>
                    <span className="mr-auto text-[10px] text-gray-300 group-hover:text-amber-400">←</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-gray-900 leading-none">
                    <span className="text-xs font-normal text-gray-400">₪</span>{fmt(d?.totalDebt ?? 0)}
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{
                      width: `${Math.min(100, ((d?.totalDebt ?? 0) / Math.max(d?.plannedThisMonth ?? 1, 1)) * 100)}%`,
                      background: '#f59e0b',
                    }} />
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">{d?.parentsInDebt ?? 0} משפחות בחוב</div>
                </button>

                {/* Row 2: Overdue, Salary debt, Credits */}
                <button
                  onClick={() => setActivePanel('overdue')}
                  className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1 text-right hover:shadow-md hover:border-red-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#ef4444' }} />
                    <span className="text-[11px] text-gray-600 leading-tight">בפיגור</span>
                    <span className="mr-auto text-[10px] text-gray-300 group-hover:text-red-400">←</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-red-700 leading-none">
                    <span className="text-xs font-normal text-gray-400">₪</span>{fmt(d?.overdueAmount ?? 0)}
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: d && d.overdueCount > 0 ? '70%' : '0%', background: '#ef4444' }} />
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">{d?.overdueCount ?? 0} תשלומים באיחור</div>
                </button>

                <button
                  onClick={() => setActivePanel('salary')}
                  className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1 text-right hover:shadow-md hover:border-orange-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#f97316' }} />
                    <span className="text-[11px] text-gray-600 leading-tight">חוב משכורות</span>
                    <span className="mr-auto text-[10px] text-gray-300 group-hover:text-orange-400">←</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-orange-700 leading-none">
                    <span className="text-xs font-normal text-gray-400">₪</span>{fmt(d?.salaryDebt ?? 0)}
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: d && d.salaryDebtCount > 0 ? '60%' : '0%', background: '#f97316' }} />
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">{d?.salaryDebtCount ?? 0} רשומות פתוחות</div>
                </button>

                <button
                  onClick={() => setActivePanel('credit')}
                  className="bg-white rounded-lg border border-gray-200 p-2.5 flex flex-col gap-1 text-right hover:shadow-md hover:border-emerald-300 transition-all cursor-pointer group"
                >
                  <div className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#10b981' }} />
                    <span className="text-[11px] text-gray-600 leading-tight">זיכויים שמורים</span>
                    <span className="mr-auto text-[10px] text-gray-300 group-hover:text-emerald-400">←</span>
                  </div>
                  <div className="text-xl font-bold tabular-nums text-emerald-700 leading-none">
                    <span className="text-xs font-normal text-gray-400">₪</span>{fmt(d?.ppCreditTotal ?? 0)}
                  </div>
                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: d && (d.ppCreditTotal ?? 0) > 0 ? '50%' : '0%', background: '#10b981' }} />
                  </div>
                  <div className="text-[10px] text-gray-400 truncate">{d?.ppCreditList?.length ?? 0} משפחות עם זיכוי</div>
                </button>
              </>
            )}
          </div>

          {/* Donation summary */}
          {!loading && (d?.donationDonorsCount ?? 0) > 0 && (
            <div>
              <div className="text-[11px] font-semibold text-gray-500 mb-1.5">💚 מגבית — החודש</div>
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-right">
                  <div className="text-[10px] text-emerald-600 mb-0.5">תורמים</div>
                  <div className="text-lg font-bold text-emerald-700">{d?.donationDonorsCount ?? 0}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-right">
                  <div className="text-[10px] text-emerald-600 mb-0.5">מתוכנן</div>
                  <div className="text-lg font-bold text-emerald-700 tabular-nums">₪{fmt(d?.donationPPsThisMonth ?? 0)}</div>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 text-right">
                  <div className="text-[10px] text-emerald-600 mb-0.5">נגבה</div>
                  <div className="text-lg font-bold text-emerald-700 tabular-nums">₪{fmt(d?.donationCollectedThisMonth ?? 0)}</div>
                </div>
              </div>
            </div>
          )}

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

      {/* ── CASHFLOW VIEW ── */}
      {view === 'cashflow' && (
        <div className="space-y-3">
          <CashflowTable
            data={cashflow}
            loading={cashflowLoading}
            showDept={showDeptBreakdown}
            onToggleDept={() => setShowDeptBreakdown(v => !v)}
          />
        </div>
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

      {/* ── PANELS ── */}
      {activePanel && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/20 z-[60]"
            onClick={() => setActivePanel(null)}
          />
          <RecordsPanel
            title={activePanelConfig[activePanel].title}
            records={activePanelConfig[activePanel].records}
            total={activePanelConfig[activePanel].total}
            totalLabel={activePanelConfig[activePanel].totalLabel}
            onClose={() => setActivePanel(null)}
            onOpenParent={id => { setActivePanel(null); setSelectedId(id) }}
            loading={loading}
          />
        </>
      )}

      {deptModal && <DeptDebtModal framework={deptModal} onClose={() => setDeptModal(null)} />}
      {selectedId && <EmployeeCard parentId={selectedId} onClose={() => setSelectedId(null)} />}
      {showAddParent && (
        <AddParentModal onClose={() => setShowAddParent(false)} onSuccess={() => { setShowAddParent(false); load() }} />
      )}
      {showAddTx && (
        <AddTransactionModal onClose={() => setShowAddTx(false)} onSuccess={() => { setShowAddTx(false); load() }} />
      )}
      <ChatPanel />
    </div>
  )
}
