'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import CashFundEntryModal from '@/components/CashFundEntryModal'
import { TxDetailModal, Transaction } from '@/components/TransactionCard'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

const fmtDate = (d: string) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return day ? `${day}/${m}/${y.slice(2)}` : d
}

// Smoothly counts from the previous value to the new one whenever `value`
// changes, instead of the figure just popping to the new total.
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(value)
  const fromRef = useRef(value)
  useEffect(() => {
    const from = fromRef.current
    const to = value
    if (from === to) return
    const duration = 600
    const start = performance.now()
    let raf = 0
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - Math.pow(1 - t, 3)
      setDisplay(from + (to - from) * eased)
      if (t < 1) raf = requestAnimationFrame(tick)
      else fromRef.current = to
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <>{fmt(display)}</>
}

interface EntryRow {
  id: string
  amount: number
  date: string
  notes: string
  sourceTransactionId: string | null
}

export default function CashFundPage() {
  const [rows, setRows]         = useState<EntryRow[]>([])
  const [balance, setBalance]   = useState(0)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [openTx, setOpenTx]     = useState<Transaction | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/cash-fund')
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.data ?? [])
        setBalance(d.balance ?? 0)
      })
      .catch(() => setError('שגיאה בטעינת קופת מזומנים'))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(load, 'cash_fund_entries')

  const openSourceTransaction = async (id: string) => {
    const r = await fetch(`/api/transactions/${id}`)
    const t = await r.json()
    if (t.error) return
    setOpenTx({
      id: t.id, amount: Number(t.amount) || 0, type: t.type ?? '', date: t.date ?? '',
      monthYear: t.month_year ?? '', notes: t.notes ?? '',
      projectNames: t.project_names ?? [], parentIds: t.parent_ids ?? [],
      plannedPaymentId: t.planned_payment_id ?? null,
      framework: t.framework ?? '', receiptUrl: t.receipt_url ?? '',
    })
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/cash-fund/${id}`, { method: 'DELETE' })
    setConfirmDeleteId(null)
    load()
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">💵 קופת מזומנים</h2>
        <button onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors">
          <span className="text-lg leading-none">+</span> הוספת תנועה
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      <div className="bg-white rounded-2xl border border-gray-200 p-6 text-center">
        <p className="text-sm text-gray-500 mb-1">יתרה עדכנית</p>
        <p className={`text-4xl font-bold tabular-nums ${balance < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
          ₪<AnimatedNumber value={balance} />
        </p>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          {[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">אין תנועות בקופה</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px]">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase text-right bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3">הערות</th>
                  <th className="px-4 py-3">מקור</th>
                  <th className="px-4 py-3 text-left">סכום</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(row => (
                  <tr key={row.id} className="hover:bg-blue-50/40 transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500 tabular-nums whitespace-nowrap">{fmtDate(row.date)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500 max-w-[220px] truncate">{row.notes || '—'}</td>
                    <td className="px-4 py-3">
                      {row.sourceTransactionId ? (
                        <button onClick={() => openSourceTransaction(row.sourceTransactionId!)}
                          className="text-xs font-medium text-[#1a3a7a] hover:underline">
                          תנועה מקושרת ↗
                        </button>
                      ) : <span className="text-sm text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-left">
                      <span className={`text-sm font-bold tabular-nums ${row.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {row.amount < 0 ? '−' : '+'}₪{fmt(row.amount)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {confirmDeleteId !== row.id ? (
                        <button onClick={() => setConfirmDeleteId(row.id)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                      ) : (
                        <div className="flex items-center gap-1.5 justify-end">
                          <button onClick={() => setConfirmDeleteId(null)} className="text-xs text-gray-400">ביטול</button>
                          <button onClick={() => handleDelete(row.id)}
                            className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded hover:bg-red-600">מחק</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showAdd && <CashFundEntryModal onClose={() => setShowAdd(false)} onSuccess={load} />}
      {openTx && (
        <TxDetailModal tx={openTx} onClose={() => setOpenTx(null)} />
      )}
    </div>
  )
}
