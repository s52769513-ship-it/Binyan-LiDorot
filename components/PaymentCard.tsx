'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { TransactionRow } from '@/components/TransactionCard'
import { TransactionItem } from '@/lib/types'

interface PaymentData {
  id: string
  name: string
  amount: number
  paid: number
  balance: number
  monthYear: string
  date: string
  notes: string
  parentIds: string[]
  parents: { id: string; name: string; fatherPhone: string; motherPhone: string }[]
  transactions: TransactionItem[]
}

interface Props {
  paymentId: string
  onClose: () => void
  onOpenParent?: (parentId: string) => void
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

function toHebrewDate(d: string) {
  if (!d) return ''
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(d))
  } catch { return '' }
}

function InlineAmount({ value, onSave }: { value: number; onSave: (v: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(String(value))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    setEditing(false)
    const n = parseFloat(val)
    if (!isNaN(n) && n !== value) await onSave(n)
  }

  if (!editing) {
    return (
      <button onClick={() => { setVal(String(value)); setEditing(true) }}
        className="text-2xl font-bold tabular-nums hover:text-[#1a3a7a] cursor-pointer group flex items-center gap-1">
        <span className="opacity-0 group-hover:opacity-60 text-gray-300 text-sm">✏</span>
        {fmt(value)}
      </button>
    )
  }
  return (
    <input ref={ref} type="number" value={val}
      onChange={e => setVal(e.target.value)}
      onBlur={save}
      onKeyDown={e => { if (e.key === 'Enter') save(); if (e.key === 'Escape') setEditing(false) }}
      className="text-xl font-bold border-b-2 border-[#1a3a7a] bg-transparent outline-none w-36 tabular-nums"
    />
  )
}

function InlineText({ label, value, onSave, multiline = false }: {
  label: string; value: string; onSave: (v: string) => Promise<void>; multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    setEditing(false)
    if (val.trim() === (value ?? '').trim()) return
    await onSave(val.trim())
  }
  const props = {
    ref, value: val,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVal(e.target.value),
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) save()
      if (e.key === 'Escape') { setVal(value); setEditing(false) }
    },
    className: 'w-full px-2 py-1 text-sm border-b-2 border-[#1a3a7a] bg-transparent outline-none text-right',
    dir: 'rtl' as const,
  }

  return (
    <div className="group">
      <div className="text-[10px] text-gray-400 mb-0.5 text-right">{label}</div>
      {editing
        ? multiline ? <textarea rows={2} {...props} /> : <input {...props} />
        : (
          <button onClick={() => setEditing(true)} className="text-sm text-gray-800 hover:text-[#1a3a7a] w-full text-right flex items-center gap-1 justify-end">
            <span className="opacity-0 group-hover:opacity-60 text-gray-300 text-xs">✏</span>
            <span>{val || <span className="text-gray-300 text-xs italic">לא הוזן</span>}</span>
          </button>
        )}
    </div>
  )
}

export default function PaymentCard({ paymentId, onClose, onOpenParent }: Props) {
  const [payment, setPayment] = useState<PaymentData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [transactions, setTransactions] = useState<TransactionItem[]>([])

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/payments/${paymentId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else { setPayment(d); setTransactions(d.transactions ?? []) }
      })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }, [paymentId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    await fetch(`/api/payments/${paymentId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    setPayment(prev => {
      if (!prev) return prev
      const next = { ...prev, ...fields } as PaymentData
      if ('amount' in fields || 'balance' in fields) {
        next.paid = Math.max(0, (next.amount ?? prev.amount) - (next.balance ?? prev.balance))
      }
      return next
    })
  }, [paymentId])

  const remain = payment ? Math.max(0, payment.balance) : 0
  const statusLabel = !payment ? '' : remain <= 0 ? 'שולם' : payment.paid > 0 ? 'חלקי' : 'ממתין'
  const statusStyle = statusLabel === 'שולם' ? 'bg-emerald-100 text-emerald-800'
    : statusLabel === 'חלקי' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg overflow-hidden" style={{ height: '88vh', maxHeight: '88vh' }}
    >
      {/* Header */}
      <div className="px-5 pt-4 pb-3 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
        <div className="flex items-start justify-between mb-2">
          <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none">✕</button>
          <div className="text-right flex-1 mr-2">
            {loading
              ? <div className="h-6 w-40 bg-white/20 rounded animate-pulse ml-auto" />
              : <>
                  <h2 className="text-lg font-bold text-white">{payment?.name || 'תשלום'}</h2>
                  <div className="flex items-center gap-2 justify-end mt-1">
                    {payment?.monthYear && <span className="text-white/60 text-sm">{payment.monthYear}</span>}
                    {statusLabel && <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${statusStyle}`}>{statusLabel}</span>}
                  </div>
                </>
            }
          </div>
        </div>

        {/* Amount strip */}
        {payment && (
          <div className="flex gap-px mt-3">
            <div className="flex-1 bg-white/10 rounded-tl-xl px-3 py-2 text-center">
              <p className="text-base font-bold text-white/90 tabular-nums">{fmt(payment.amount)}</p>
              <p className="text-[10px] text-white/50">לתשלום</p>
            </div>
            <div className="flex-1 bg-white/10 px-3 py-2 text-center">
              <p className="text-base font-bold text-emerald-300 tabular-nums">{fmt(payment.paid)}</p>
              <p className="text-[10px] text-white/50">שולם</p>
            </div>
            <div className="flex-1 bg-white/10 rounded-tr-xl px-3 py-2 text-center">
              <p className={`text-base font-bold tabular-nums ${remain > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {remain > 0 ? fmt(remain) : '✓'}
              </p>
              <p className="text-[10px] text-white/50">נותר</p>
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4 space-y-4" dir="rtl">
        {loading && <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>}
        {error && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

        {payment && (
          <>
            {/* Edit amounts */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">עריכה</div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4">
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">סכום לתשלום</div>
                  <InlineAmount value={payment.amount} onSave={v => patch({ amount: v })} />
                </div>
                <div>
                  <div className="text-[10px] text-gray-400 mb-1">יתרה (חוב)</div>
                  <InlineAmount value={payment.balance} onSave={v => patch({ balance: v })} />
                </div>
                <InlineText label="חודש/שנה"  value={payment.monthYear} onSave={v => patch({ month_year: v })} />
                <InlineText label="תאריך"      value={payment.date}      onSave={v => patch({ date: v })} />
              </div>
              {payment.date && (
                <p className="px-4 pb-3 text-xs text-[#1a3a7a]/70 text-right">{toHebrewDate(payment.date)}</p>
              )}
            </div>

            {/* Notes */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">הערות</div>
              <div className="p-4">
                <InlineText label="" value={payment.notes} onSave={v => patch({ notes: v })} multiline />
              </div>
            </div>

            {/* Parents */}
            {payment.parents.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">הורים</div>
                <div className="divide-y divide-gray-100">
                  {payment.parents.map(p => (
                    <button key={p.id} onClick={() => onOpenParent?.(p.id)}
                      className="w-full flex items-center justify-between px-4 py-3 hover:bg-blue-50 transition-colors group text-right">
                      <div className="text-xs text-gray-400 text-left" dir="ltr">
                        {p.fatherPhone || p.motherPhone || ''}
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-gray-800">{p.name}</p>
                        <p className="text-xs text-[#1a3a7a] opacity-0 group-hover:opacity-100">פתח כרטיס הורה ←</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Related transactions (excluding דמי מגבית) */}
            {(() => {
              const filteredTxs = transactions.filter(tx =>
                !(tx.projectNames ?? []).includes('דמי מגבית')
              )
              if (filteredTxs.length === 0) return null
              return (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    תנועות קשורות לחודש זה
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-xs text-gray-400 border-b border-gray-100">
                        <th className="px-3 py-2">תאריך</th>
                        <th className="px-3 py-2">סוג</th>
                        <th className="px-3 py-2 text-left">סכום</th>
                        <th className="px-3 py-2">הערות</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {filteredTxs.map(tx => (
                        <TransactionRow
                          key={tx.id}
                          tx={tx}
                          onUpdate={u => setTransactions(prev => prev.map(t => t.id === u.id ? u : t))}
                          onDelete={id => setTransactions(prev => prev.filter(t => t.id !== id))}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            })()}
          </>
        )}
      </div>
      </div>
    </div>
  )
}
