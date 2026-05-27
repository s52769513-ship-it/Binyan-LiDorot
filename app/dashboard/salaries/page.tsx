'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import EmployeeCard from '@/components/EmployeeCard'

const AddTransactionModal = dynamic(() => import('@/components/AddTransactionModal'), { ssr: false })

interface Woman {
  id: string
  name: string
  salaryGross: number
  status: string
  role: string[]
}

interface Employee {
  id: string
  name: string
  firstName: string
  lastName: string
  baseHourlyRate: number
  seniorityBonusHourly: number
  monthlyHoursDecimal: number
  fixedBonus: number
  transportReimbursement: number
  exceptionalExpenses: number
  deductTuition: boolean
  showSpouseSalary: boolean
  salaryGross: number
  salaryNet: number
  familySalary: number
  tuitionDeduction: number
  netAfterTuition: number
  wifeSalary: number
  women: Woman[]
}

interface PlannedSalary {
  id: string
  name: string
  amount: number
  balance: number
  date: string
  monthYear: string
  parentIds: string[]
}

interface Transaction {
  id: string
  amount: number
  type: string
  date: string
  monthYear: string
  notes: string
  parentIds: string[]
  parentName?: string
}

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('he-IL').format(new Date(d))
}

type TabKey = 'settings' | 'planned' | 'actual'

/* ─── הגדרות Tab ─────────────────────────────────── */
function SettingsTab() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [showDetails, setShowDetails] = useState<string | null>(null)
  const [openCard, setOpenCard]   = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/salaries')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEmployees(data) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = employees.filter(e =>
    !search || e.name.includes(search) || e.firstName.includes(search) || e.lastName.includes(search)
  )
  const totalGross  = filtered.reduce((s, e) => s + (e.showSpouseSalary ? e.familySalary : e.salaryGross), 0)
  const totalDeduct = filtered.reduce((s, e) => s + e.tuitionDeduction, 0)
  const totalNet    = filtered.reduce((s, e) => s + e.netAfterTuition, 0)

  return (
    <div className="space-y-4">
      {/* Search + summary */}
      <div className="flex items-center gap-4">
        <input
          type="text" placeholder="חיפוש שם..." value={search}
          onChange={e => setSearch(e.target.value)} dir="rtl"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <div className="flex gap-3 flex-1">
          <div className="bg-indigo-50 rounded-xl px-4 py-2 text-center flex-1">
            <p className="text-xs text-gray-500">ברוטו</p>
            <p className="text-base font-bold text-indigo-800">{fmt(totalGross)}</p>
          </div>
          <div className="bg-red-50 rounded-xl px-4 py-2 text-center flex-1">
            <p className="text-xs text-gray-500">קיזוז שכ"ל</p>
            <p className="text-base font-bold text-red-700">− {fmt(totalDeduct)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl px-4 py-2 text-center flex-1">
            <p className="text-xs text-gray-500">לתשלום</p>
            <p className="text-base font-bold text-emerald-700">{fmt(totalNet)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs">
                <th className="px-4 py-3 text-right font-semibold">שם</th>
                <th className="px-4 py-3 text-center font-semibold">שעות</th>
                <th className="px-4 py-3 text-center font-semibold">ברוטו</th>
                <th className="px-4 py-3 text-center font-semibold">קיזוז שכ"ל</th>
                <th className="px-4 py-3 text-center font-semibold">נטו לתשלום</th>
                <th className="px-4 py-3 text-center font-semibold">אשה</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const isOpen = showDetails === emp.id
                const displayGross = emp.showSpouseSalary ? emp.familySalary : emp.salaryGross
                return (
                  <>
                    <tr key={emp.id}
                      onClick={() => setShowDetails(isOpen ? null : emp.id)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${isOpen ? 'bg-indigo-50' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        <button
                          onClick={e => { e.stopPropagation(); setOpenCard(emp.id) }}
                          className="text-[#1a3a7a] hover:underline font-semibold"
                        >{emp.name}</button>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 tabular-nums">
                        {emp.monthlyHoursDecimal > 0 ? emp.monthlyHoursDecimal : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-indigo-700 tabular-nums">
                        {displayGross > 0 ? fmt(displayGross) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {emp.tuitionDeduction > 0
                          ? <span className="text-red-600 font-medium">− {fmt(emp.tuitionDeduction)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-bold tabular-nums">
                        <span className={emp.netAfterTuition > 0 ? 'text-emerald-700' : 'text-gray-500'}>
                          {emp.netAfterTuition > 0 ? fmt(emp.netAfterTuition) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {emp.women.length > 0 ? (
                          <div className="flex flex-col items-center gap-0.5">
                            {emp.women.map(w => (
                              <div key={w.id} className="text-xs text-purple-700 font-medium">
                                {w.name}{w.salaryGross > 0 && <span className="text-gray-400 font-normal mr-1">({fmt(w.salaryGross)})</span>}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-3 text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</td>
                    </tr>
                    {isOpen && (
                      <tr key={`${emp.id}-detail`} className="bg-indigo-50/50">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                            {emp.baseHourlyRate > 0 && <InfoChip label="שכר בסיס לשעה" value={fmt(emp.baseHourlyRate)} />}
                            {emp.seniorityBonusHourly > 0 && <InfoChip label="תוספת ותק לשעה" value={fmt(emp.seniorityBonusHourly)} />}
                            {emp.monthlyHoursDecimal > 0 && <InfoChip label="שעות חודשיות" value={`${emp.monthlyHoursDecimal} שעות`} />}
                            {emp.fixedBonus > 0 && <InfoChip label="תוספת קבועה" value={fmt(emp.fixedBonus)} />}
                            {emp.transportReimbursement > 0 && <InfoChip label="תשלום הסעות" value={fmt(emp.transportReimbursement)} />}
                            {emp.exceptionalExpenses > 0 && <InfoChip label="הוצאות חריגות" value={`− ${fmt(emp.exceptionalExpenses)}`} color="red" />}
                            {emp.deductTuition && <InfoChip label={'קיזוז שכ"ל'} value="✓ מופחת" color="amber" />}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                  <td className="px-4 py-3 text-gray-700">סה&quot;כ ({filtered.length})</td>
                  <td /><td className="px-4 py-3 text-center text-indigo-700 tabular-nums">{fmt(totalGross)}</td>
                  <td className="px-4 py-3 text-center text-red-600 tabular-nums">{totalDeduct > 0 ? `− ${fmt(totalDeduct)}` : '—'}</td>
                  <td className="px-4 py-3 text-center text-emerald-700 tabular-nums">{fmt(totalNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">💼</p>
              <p>{search ? 'לא נמצאו תוצאות' : 'אין נתוני משכורות — הרץ סינק מאיירטייבל'}</p>
            </div>
          )}
        </div>
      )}

      {openCard && <EmployeeCard parentId={openCard} onClose={() => setOpenCard(null)} />}
    </div>
  )
}

/* ─── תשלומים מתוכננים Tab ─────────────────────────── */
function PlannedTab() {
  const [planned, setPlanned]   = useState<PlannedSalary[]>([])
  const [loading, setLoading]   = useState(true)
  const [monthFilter, setMonth] = useState('')
  const [openCard, setOpenCard] = useState<string | null>(null)
  const [showAddTx, setShowAddTx] = useState<PlannedSalary | null>(null)

  useEffect(() => {
    // Load planned payments categorized under 'משכורת'
    fetch('/api/planned-payments?project=משכורת')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPlanned(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const months = [...new Set(planned.map(p => p.monthYear).filter(Boolean))].sort()
  const rows   = monthFilter ? planned.filter(p => p.monthYear === monthFilter) : planned
  const today  = new Date(); today.setHours(0,0,0,0)
  const totalBalance = rows.reduce((s, p) => s + Math.max(0, p.balance), 0)
  const totalPaid    = rows.reduce((s, p) => s + Math.max(0, p.amount - p.balance), 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">ממתין לתשלום</p>
          <p className="text-lg font-bold text-amber-700">{fmt(totalBalance)}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">שולם</p>
          <p className="text-lg font-bold text-emerald-700">{fmt(totalPaid)}</p>
        </div>
        <div className="bg-indigo-50 rounded-xl p-3 text-center">
          <p className="text-xs text-gray-500">סה&quot;כ תשלומים</p>
          <p className="text-lg font-bold text-indigo-700">{rows.length}</p>
        </div>
      </div>

      {/* Month filter */}
      {months.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMonth('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!monthFilter ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'}`}>
            כל החודשים
          </button>
          {months.map(m => (
            <button key={m} onClick={() => setMonth(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${monthFilter === m ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'}`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">📋</p>
          <p>אין תשלומים מתוכננים — הם נוצרים אוטומטית מהגדרות המשכורת</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 text-right">
                <th className="px-4 py-2.5">שם</th>
                <th className="px-4 py-2.5">חודש</th>
                <th className="px-4 py-2.5 text-center">סכום</th>
                <th className="px-4 py-2.5 text-center">שולם</th>
                <th className="px-4 py-2.5 text-center">יתרה</th>
                <th className="px-4 py-2.5 text-center">סטטוס</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(p => {
                const paid   = Math.max(0, p.amount - p.balance)
                const remain = Math.max(0, p.balance)
                const isOverdue = remain > 0 && !!p.date && new Date(p.date) < today
                const status = remain <= 0 ? 'שולם' : isOverdue ? 'באיחור' : 'פתוח'
                return (
                  <tr key={p.id} className={`hover:bg-gray-50 ${isOverdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                    <td className="px-4 py-2.5 text-gray-500">{p.monthYear || fmtDate(p.date)}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums">{fmt(p.amount)}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums text-emerald-700 font-medium">{paid > 0 ? fmt(paid) : '—'}</td>
                    <td className="px-4 py-2.5 text-center tabular-nums font-semibold">
                      {remain > 0 ? <span className={isOverdue ? 'text-red-600' : 'text-amber-600'}>{fmt(remain)}</span> : <span className="text-emerald-600">✓</span>}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        status === 'שולם' ? 'bg-emerald-50 text-emerald-700'
                        : status === 'באיחור' ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-700'}`}>{status}</span>
                    </td>
                    <td className="px-2 py-2.5 text-center">
                      {remain > 0 && (
                        <button onClick={() => setShowAddTx(p)}
                          className="text-xs px-2 py-1 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 transition-colors">
                          + שלם
                        </button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {openCard && <EmployeeCard parentId={openCard} onClose={() => setOpenCard(null)} />}
      {showAddTx && (
        <AddTransactionModal
          prefilledAmount={showAddTx.balance}
          prefilledNotes={showAddTx.name}
          onClose={() => setShowAddTx(null)}
          onSuccess={() => { setShowAddTx(null); setLoading(true); fetch('/api/planned-payments?project=משכורת').then(r=>r.json()).then(d=>{if(Array.isArray(d))setPlanned(d)}).finally(()=>setLoading(false)) }}
        />
      )}
    </div>
  )
}

/* ─── תשלומים בפועל Tab ─────────────────────────────── */
function ActualTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [monthFilter, setMonth]         = useState('')
  const [showAdd, setShowAdd]           = useState(false)
  const [openCard, setOpenCard]         = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/transactions?type=קיזוז שכר לימוד&limit=200')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTransactions(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const months = [...new Set(transactions.map(t => t.monthYear).filter(Boolean))].sort().reverse()
  const rows   = monthFilter ? transactions.filter(t => t.monthYear === monthFilter) : transactions
  const total  = rows.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-4">
      {/* Summary + add button */}
      <div className="flex items-center justify-between gap-4">
        <div className="bg-emerald-50 rounded-xl px-5 py-3 text-center">
          <p className="text-xs text-gray-500">סה&quot;כ ששולם</p>
          <p className="text-xl font-bold text-emerald-700">{fmt(Math.abs(total))}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
          + הוסף תשלום משכורת
        </button>
      </div>

      {/* Month filter */}
      {months.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMonth('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!monthFilter ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200'}`}>
            הכל
          </button>
          {months.slice(0,12).map(m => (
            <button key={m} onClick={() => setMonth(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${monthFilter === m ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">💸</p>
          <p>אין תשלומי משכורת בפועל</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 text-right">
                <th className="px-4 py-2.5">שם / הערות</th>
                <th className="px-4 py-2.5">חודש</th>
                <th className="px-4 py-2.5">תאריך</th>
                <th className="px-4 py-2.5 text-center">סכום</th>
                <th className="px-4 py-2.5">סוג</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    {tx.parentName
                      ? <button onClick={() => setOpenCard(tx.parentName!)} className="text-[#1a3a7a] hover:underline">{tx.parentName}</button>
                      : <span className="text-gray-500 italic">{tx.notes || '—'}</span>
                    }
                    {tx.notes && tx.parentName && <p className="text-xs text-gray-400">{tx.notes}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{tx.monthYear || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{fmtDate(tx.date)}</td>
                  <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-emerald-700">
                    {fmt(Math.abs(tx.amount))}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{tx.type}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                <td className="px-4 py-3 text-gray-700">סה&quot;כ ({rows.length})</td>
                <td /><td />
                <td className="px-4 py-3 text-center text-emerald-700">{fmt(Math.abs(total))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {openCard && <EmployeeCard parentId={openCard} onClose={() => setOpenCard(null)} />}
      {showAdd && (
        <AddTransactionModal
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

/* ─── InfoChip helper ─── */
function InfoChip({ label, value, color }: { label: string; value: string; color?: 'red' | 'amber' }) {
  const border = color === 'red' ? 'border-red-100' : color === 'amber' ? 'border-amber-100' : 'border-indigo-100'
  const text   = color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-700' : 'text-gray-800'
  return (
    <div className={`bg-white rounded-lg p-2.5 border ${border}`}>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={`font-semibold mt-0.5 text-sm ${text}`}>{value}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function SalariesPage() {
  const [tab, setTab] = useState<TabKey>('settings')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'settings', label: '⚙ הגדרות משכורת' },
    { key: 'planned',  label: '📋 תשלומים מתוכננים' },
    { key: 'actual',   label: '💸 תשלומים בפועל' },
  ]

  return (
    <div dir="rtl">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">💼 משכורות</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-[#1a3a7a] text-[#1a3a7a]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && <SettingsTab />}
      {tab === 'planned'  && <PlannedTab />}
      {tab === 'actual'   && <ActualTab />}
    </div>
  )
}
