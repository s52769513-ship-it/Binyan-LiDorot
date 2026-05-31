'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const EmployeeCard        = dynamic(() => import('./EmployeeCard'),        { ssr: false })
const AddTransactionModal = dynamic(() => import('./AddTransactionModal'), { ssr: false })

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

const fmtDate = (d: string) => {
  if (!d) return '—'
  const [, m, day] = d.split('-')
  return day ? `${day}/${m}` : d
}

interface OpenPayment {
  id: string
  name: string
  amount: number
  balance: number
  monthYear: string
}

interface ParentRow {
  id: string
  name: string
  balance: number
  childrenCount: number
  openPayments: OpenPayment[]
}

interface TxRow {
  id: string
  amount: number
  date: string
  monthYear: string
  notes: string
  type: string
  parentId: string
  parentName: string
}

interface ApiData {
  parents: ParentRow[]
  transactions: TxRow[]
  monthTotals: Record<string, number>
  months: string[]
}

interface Props {
  framework: string
  onClose: () => void
}

const DEPT_COLOR: Record<string, { header: string; dot: string; accent: string }> = {
  'תלמוד תורה':       { header: 'bg-blue-700',   dot: '#1a3a7a', accent: '#1a3a7a' },
  'בית חינוך לבנות': { header: 'bg-purple-700', dot: '#7c3aed', accent: '#7c3aed' },
  'אחר':              { header: 'bg-gray-600',   dot: '#6b7280', accent: '#6b7280' },
}

export default function DeptDebtModal({ framework, onClose }: Props) {
  const [apiData, setApiData]       = useState<ApiData | null>(null)
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [tab, setTab]               = useState<'debt' | 'income'>('debt')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [addTxFor, setAddTxFor]     = useState<{
    id: string; name: string;
    plannedPaymentId?: string; sourceLabel?: string; amount?: number
  } | null>(null)
  const [expanded, setExpanded]     = useState<Record<string, boolean>>({})

  const load = () => {
    setLoading(true); setError('')
    fetch(`/api/dept-debt?framework=${encodeURIComponent(framework)}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setApiData(d) })
      .catch(() => setError('שגיאה בטעינה'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [framework])

  const c = DEPT_COLOR[framework] ?? DEPT_COLOR['אחר']
  const parents       = apiData?.parents ?? []
  const transactions  = apiData?.transactions ?? []
  const monthTotals   = apiData?.monthTotals ?? {}
  const months        = apiData?.months ?? []
  const totalDebt     = parents.reduce((s, p) => s + p.balance, 0)
  const totalIncome   = transactions.reduce((s, t) => s + t.amount, 0)

  // Group transactions by month for income tab
  const txByMonth: Record<string, TxRow[]> = {}
  for (const m of months) txByMonth[m] = []
  for (const tx of transactions) {
    if (tx.monthYear in txByMonth) txByMonth[tx.monthYear].push(tx)
    else txByMonth[tx.monthYear] = [tx]
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className={`${c.header} text-white px-5 py-4`}>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-lg leading-tight">{framework}</h2>
            </div>
            <button onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-sm transition-colors flex-shrink-0">
              ✕
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1">
            <button
              onClick={() => setTab('debt')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'debt'
                  ? 'bg-white text-gray-800'
                  : 'bg-white/20 text-white/80 hover:bg-white/30'
              }`}
            >
              חוב פתוח
              {!loading && (
                <span className={`mr-1.5 text-[10px] font-normal ${tab === 'debt' ? 'text-red-600' : 'text-white/60'}`}>
                  ₪{fmt(totalDebt)}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab('income')}
              className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === 'income'
                  ? 'bg-white text-gray-800'
                  : 'bg-white/20 text-white/80 hover:bg-white/30'
              }`}
            >
              הכנסות (3 חודשים)
              {!loading && (
                <span className={`mr-1.5 text-[10px] font-normal ${tab === 'income' ? 'text-emerald-700' : 'text-white/60'}`}>
                  ₪{fmt(totalIncome)}
                </span>
              )}
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {error && (
            <div className="m-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {loading ? (
            <div className="p-4 space-y-2">
              {[1,2,3,4,5].map(i => (
                <div key={i} className="h-16 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>

          ) : tab === 'debt' ? (
            /* ── DEBT TAB ── */
            parents.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">אין חובות פתוחים</div>
            ) : (
              <div className="divide-y divide-gray-100">
                {parents.map(p => {
                  const isOpen = expanded[p.id]
                  return (
                    <div key={p.id}>
                      <div className="flex items-center gap-3 px-4 py-3">
                        <div className="w-1 self-stretch rounded-full bg-red-400 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <button
                            onClick={() => setSelectedId(p.id)}
                            className="text-sm font-semibold text-gray-900 hover:text-[#1a3a7a] text-right truncate block"
                          >
                            {p.name}
                          </button>
                          <div className="text-[11px] text-gray-400 mt-0.5">
                            {p.childrenCount} ילדים
                            {p.openPayments.length > 0 && (
                              <span className="mr-2 text-amber-600">· {p.openPayments.length} תשלומים פתוחים</span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <div className="text-right">
                            <div className="text-sm font-bold tabular-nums text-red-600">₪{fmt(p.balance)}</div>
                            <div className="text-[10px] text-gray-400">חוב פתוח</div>
                          </div>
                          <button
                            onClick={() => setAddTxFor({ id: p.id, name: p.name })}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-700 text-white text-xs font-medium hover:bg-emerald-800 transition-colors"
                          >
                            + תשלום
                          </button>
                          {p.openPayments.length > 0 && (
                            <button
                              onClick={() => setExpanded(prev => ({ ...prev, [p.id]: !isOpen }))}
                              className="w-7 h-7 rounded-lg border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors text-xs"
                            >
                              {isOpen ? '▲' : '▼'}
                            </button>
                          )}
                        </div>
                      </div>

                      {isOpen && p.openPayments.length > 0 && (
                        <div className="bg-amber-50/60 border-t border-amber-100 divide-y divide-amber-100">
                          {p.openPayments.map(pp => (
                            <div key={pp.id} className="flex items-center gap-3 px-6 py-2.5">
                              <div className="flex-1 min-w-0">
                                <div className="text-xs font-medium text-gray-700 truncate">
                                  {pp.name || pp.monthYear || '—'}
                                </div>
                                {pp.monthYear && pp.name && (
                                  <div className="text-[10px] text-gray-400">{pp.monthYear}</div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0 ml-2">
                                <div className="text-xs font-bold text-amber-700 tabular-nums">
                                  ₪{fmt(pp.balance)}
                                  <span className="text-[10px] font-normal text-gray-400 mr-1">/ ₪{fmt(pp.amount)}</span>
                                </div>
                                <div className="text-[10px] text-gray-400">יתרה פתוחה</div>
                              </div>
                              <button
                                onClick={() => setAddTxFor({
                                  id: p.id,
                                  name: p.name,
                                  plannedPaymentId: pp.id,
                                  sourceLabel: pp.name || pp.monthYear,
                                  amount: pp.balance,
                                })}
                                className="flex-shrink-0 px-2 py-1 rounded-lg bg-emerald-700 text-white text-[11px] font-medium hover:bg-emerald-800 transition-colors"
                              >
                                + שלם
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )

          ) : (
            /* ── INCOME TAB ── */
            transactions.length === 0 ? (
              <div className="py-16 text-center text-gray-400 text-sm">אין תנועות הכנסה ב-3 חודשים האחרונים</div>
            ) : (
              <div>
                {/* Month summary bar */}
                <div className="flex gap-0 border-b border-gray-100">
                  {months.map(m => (
                    <div key={m} className="flex-1 text-center px-2 py-2 border-l border-gray-100 first:border-l-0">
                      <div className="text-[10px] text-gray-400">{m.slice(0, 2)}/{m.slice(5)}</div>
                      <div className="text-xs font-bold text-emerald-700 tabular-nums">
                        ₪{fmt(monthTotals[m] ?? 0)}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Transactions grouped by month */}
                {months.slice().reverse().map(m => {
                  const mTxs = txByMonth[m] ?? []
                  if (!mTxs.length) return null
                  return (
                    <div key={m}>
                      <div className="px-4 py-1.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-gray-600">{m}</span>
                        <span className="text-[11px] font-bold text-emerald-700 tabular-nums">
                          ₪{fmt(mTxs.reduce((s, t) => s + t.amount, 0))} · {mTxs.length} תנועות
                        </span>
                      </div>
                      <div className="divide-y divide-gray-50">
                        {mTxs.map(tx => (
                          <button
                            key={tx.id}
                            onClick={() => tx.parentId && setSelectedId(tx.parentId)}
                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-emerald-50/40 transition-colors text-right"
                          >
                            <div className="w-1 self-stretch rounded-full bg-emerald-400 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="text-sm font-medium text-gray-900 truncate">
                                {tx.parentName || tx.notes || tx.type || '—'}
                              </div>
                              <div className="text-[10px] text-gray-400 mt-0.5">
                                {fmtDate(tx.date)}
                                {tx.notes && tx.parentName && <span className="mr-2">{tx.notes}</span>}
                              </div>
                            </div>
                            <div className="text-sm font-bold tabular-nums text-emerald-700 flex-shrink-0">
                              +₪{fmt(tx.amount)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          )}
        </div>

        {/* Footer */}
        {!loading && (
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex items-center justify-between">
            {tab === 'debt' ? (
              <>
                <span className="text-xs text-gray-500">
                  {parents.reduce((s, p) => s + p.openPayments.length, 0)} תשלומים פתוחים · {parents.length} משפחות
                </span>
                <span className="text-sm font-bold text-red-600 tabular-nums">סה״כ חוב: ₪{fmt(totalDebt)}</span>
              </>
            ) : (
              <>
                <span className="text-xs text-gray-500">
                  {transactions.length} תנועות · 3 חודשים אחרונים
                </span>
                <span className="text-sm font-bold text-emerald-700 tabular-nums">סה״כ נגבה: ₪{fmt(totalIncome)}</span>
              </>
            )}
          </div>
        )}
      </div>

      {selectedId && (
        <EmployeeCard parentId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {addTxFor && (
        <AddTransactionModal
          parentId={addTxFor.id}
          parentName={addTxFor.name}
          plannedPaymentId={addTxFor.plannedPaymentId}
          sourceLabel={addTxFor.sourceLabel}
          prefilledAmount={addTxFor.amount}
          preselectedProject="בנין לדורות"
          onClose={() => setAddTxFor(null)}
          onSuccess={() => { setAddTxFor(null); load() }}
        />
      )}
    </div>
  )
}
