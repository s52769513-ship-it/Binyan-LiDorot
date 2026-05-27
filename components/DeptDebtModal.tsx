'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'

const EmployeeCard      = dynamic(() => import('./EmployeeCard'),      { ssr: false })
const AddTransactionModal = dynamic(() => import('./AddTransactionModal'), { ssr: false })

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

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

interface Props {
  framework: string
  onClose: () => void
}

const DEPT_COLOR: Record<string, { header: string; dot: string }> = {
  'תלמוד תורה':       { header: 'bg-blue-700',   dot: '#1a3a7a' },
  'בית חינוך לבנות': { header: 'bg-purple-700', dot: '#7c3aed' },
  'אחר':              { header: 'bg-gray-600',   dot: '#6b7280' },
}

export default function DeptDebtModal({ framework, onClose }: Props) {
  const [parents, setParents]       = useState<ParentRow[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
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
      .then(d => { if (d.error) setError(d.error); else setParents(d.parents ?? []) })
      .catch(() => setError('שגיאה בטעינה'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [framework])

  const c = DEPT_COLOR[framework] ?? DEPT_COLOR['אחר']
  const totalDebt = parents.reduce((s, p) => s + p.balance, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className={`${c.header} text-white px-5 py-4 flex items-center gap-3`}>
          <div className="flex-1 min-w-0">
            <h2 className="font-bold text-lg leading-tight">{framework}</h2>
            {!loading && (
              <p className="text-xs text-white/70 mt-0.5">
                {parents.length} משפחות בחוב · סה״כ ₪{fmt(totalDebt)}
              </p>
            )}
          </div>
          <button onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white text-sm transition-colors flex-shrink-0">
            ✕
          </button>
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
          ) : parents.length === 0 ? (
            <div className="py-16 text-center text-gray-400 text-sm">אין חובות פתוחים</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {parents.map(p => {
                const isOpen = expanded[p.id]
                return (
                  <div key={p.id}>
                    {/* Parent row */}
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

                      {/* Debt + actions */}
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

                    {/* Expanded planned payments */}
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
          )}
        </div>

        {/* Footer */}
        {!loading && parents.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-3 bg-gray-50 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              {parents.reduce((s, p) => s + p.openPayments.length, 0)} תשלומים פתוחים
            </span>
            <span className="text-sm font-bold text-red-600 tabular-nums">סה״כ חוב: ₪{fmt(totalDebt)}</span>
          </div>
        )}
      </div>

      {/* Employee card overlay */}
      {selectedId && (
        <EmployeeCard parentId={selectedId} onClose={() => setSelectedId(null)} />
      )}

      {/* Add transaction overlay */}
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
