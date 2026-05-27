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
  const [y, m, day] = d.split('-')
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

const DEPT_COLOR: Record<string, { bg: string; bar: string; dot: string; label: string }> = {
  'תלמוד תורה':       { bg: 'bg-blue-50',   bar: '#1a3a7a', dot: '#1a3a7a', label: 'ת"ת' },
  'בית חינוך לבנות': { bg: 'bg-purple-50', bar: '#7c3aed', dot: '#7c3aed', label: 'בי"ח' },
  'אחר':              { bg: 'bg-gray-50',   bar: '#6b7280', dot: '#6b7280', label: 'אחר' },
}

function MiniBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 bg-gray-100 rounded-full overflow-hidden w-full">
      <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  )
}

function DeptCard({ d }: { d: DeptStat }) {
  const c = DEPT_COLOR[d.name] ?? DEPT_COLOR['אחר']
  return (
    <div className={`rounded-lg border border-gray-200 p-3 flex flex-col gap-1.5 ${c.bg}`}>
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
      <div className="text-[10px] text-gray-400 text-left">{d.parentsInDebt} משפחות בחוב</div>
    </div>
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
            <span className="flex items-center gap-0.5"><span className="inline-block w-2 h-2 rounded-sm bg-[#1a3a7a]" />פעיל</span>
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
              {/* Amount label above bar */}
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
              {/* planned amount below */}
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

export default function Dashboard() {
  const [data, setData]       = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [showAddParent, setShowAddParent]   = useState(false)
  const [showAddTx, setShowAddTx]           = useState(false)

  const load = () => {
    setLoading(true); setError('')
    fetch('/api/summary')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setData(d) })
      .catch(() => setError('שגיאה בחיבור לשרת'))
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const d = data
  const collectionPct = d && d.plannedThisMonth > 0
    ? Math.round((d.actualThisMonth / d.plannedThisMonth) * 100) : 0
  const lastSyncLabel = d?.lastSync
    ? new Intl.DateTimeFormat('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(d.lastSync))
    : null

  const skel = (h = 'h-8') => <div className={`${h} bg-gray-100 rounded animate-pulse`} />

  return (
    <div className="space-y-3" dir="rtl">

      {/* Top bar: buttons + error */}
      <div className="flex items-center gap-2">
        <button onClick={() => setShowAddParent(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#1a3a7a] text-white text-xs font-medium hover:bg-[#1a3a7a]/90 transition-colors">
          + משפחה
        </button>
        <button onClick={() => setShowAddTx(true)}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 transition-colors">
          + תנועה
        </button>
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

      {/* ── KPI row (4 cards) ── */}
      <div className="grid grid-cols-4 gap-2">
        {loading ? [1,2,3,4].map(i => <div key={i} className="h-20 bg-gray-100 rounded-lg animate-pulse" />) : (
          <>
            {[
              { label: 'צפוי החודש', value: d?.plannedThisMonth ?? 0, pct: 100, fill: '#8899cc', dot: '#1a3a7a', sub: 'תשלומים מתוכננים' },
              { label: 'נגבה בפועל',  value: d?.actualThisMonth ?? 0,  pct: collectionPct, fill: '#10b981', dot: '#10b981',
                sub: `${collectionPct}% · פער ₪${fmt(Math.abs((d?.actualThisMonth ?? 0) - (d?.plannedThisMonth ?? 0)))}` },
              { label: 'חוב שכ״ל',   value: d?.totalDebt ?? 0,          pct: Math.min(100, ((d?.totalDebt ?? 0) / Math.max(d?.plannedThisMonth ?? 1, 1)) * 100), fill: '#f59e0b', dot: '#f59e0b', sub: 'יתרה פתוחה' },
              { label: 'משפחות בחוב', value: d?.parentsInDebt ?? 0,      pct: d && d.parentsInDebt > 0 ? 60 : 0, fill: '#ef4444', dot: '#ef4444', sub: 'ממתינות לגבייה' },
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

      {/* ── Department breakdown ── */}
      {(loading || (d?.departmentStats && d.departmentStats.length > 0)) && (
        <div>
          <div className="text-[11px] font-semibold text-gray-500 mb-1.5">חלוקה לפי אגף — החודש</div>
          <div className="grid grid-cols-2 gap-2">
            {loading
              ? [1,2].map(i => <div key={i} className="h-24 bg-gray-100 rounded-lg animate-pulse" />)
              : (d?.departmentStats ?? [] as DeptStat[]).map((ds: DeptStat) => <DeptCard key={ds.name} d={ds} />)
            }
          </div>
        </div>
      )}

      {/* ── Bottom row: debt alerts + recent tx ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Debt alerts – 2 cols */}
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
                  <div className="text-left flex-shrink-0">
                    <div className="text-xs font-bold tabular-nums text-red-600">₪{fmt(a.balance)}</div>
                  </div>
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

        {/* Recent tx – 1 col */}
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
