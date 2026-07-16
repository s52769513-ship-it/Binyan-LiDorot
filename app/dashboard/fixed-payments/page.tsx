'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'
import type { RecurringPayment } from '@/components/RecurringPaymentModal'
import type { RunLite } from '@/components/PayRunModal'
import type { CardTask } from '@/components/CardPaymentTaskModal'

const RecurringPaymentModal = dynamic(() => import('@/components/RecurringPaymentModal'), { ssr: false })
const PayRunModal           = dynamic(() => import('@/components/PayRunModal'),           { ssr: false })
const CardPaymentTaskModal  = dynamic(() => import('@/components/CardPaymentTaskModal'),  { ssr: false })

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
const myToInp = (my: string) => { const [m, y] = my.split('/'); return `${y}-${m}` }
const inpToMY = (v: string) => { const [y, m] = v.split('-'); return `${m}/${y}` }
function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

interface Summary { total: number; credit: number; hok: number; transfer: number; cash: number; other: number; month: string }
interface Run extends RunLite { bank: string; dueDate: string; transactionId: string | null }

function SummaryCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className={`rounded-2xl border p-4 ${color}`}>
      <p className="text-xs font-medium text-gray-600">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
    </div>
  )
}

export default function FixedPaymentsPage() {
  const [month, setMonth]     = useState(currentMY())
  const [defs, setDefs]       = useState<RecurringPayment[]>([])
  const [runs, setRuns]       = useState<Run[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [cardTask, setCardTask] = useState<CardTask | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const [editDef, setEditDef]   = useState<RecurringPayment | null | undefined>(undefined) // undefined=closed, null=new
  const [payRun, setPayRun]     = useState<Run | null>(null)
  const [showCard, setShowCard] = useState(false)

  const loadDefs = useCallback(async () => {
    try {
      const r = await fetch('/api/recurring-payments')
      const d = await r.json()
      setDefs(Array.isArray(d) ? d : [])
    } catch {}
  }, [])

  const loadRuns = useCallback(async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/recurring-payments/runs?month=${encodeURIComponent(month)}`)
      const d = await r.json()
      setRuns(d.runs ?? [])
      setSummary(d.summary ?? null)
      setCardTask(d.cardTask ?? null)
    } catch {} finally { setLoading(false) }
  }, [month])

  useEffect(() => { loadDefs() }, [loadDefs])
  useEffect(() => { loadRuns() }, [loadRuns])
  useRealtimeRefresh(() => { loadRuns(); loadDefs() }, ['recurring_payments', 'recurring_payment_runs', 'card_payment_tasks', 'transactions'])

  const generate = async () => {
    setGenerating(true)
    try {
      // Stream endpoint — drain to completion
      const res = await fetch('/api/automations/recurring-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: false, monthYear: month }),
      })
      await res.text()
      loadRuns()
    } catch {} finally { setGenerating(false) }
  }

  const toggleActive = async (def: RecurringPayment) => {
    await fetch(`/api/recurring-payments/${def.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !def.active }),
    })
    loadDefs()
  }

  const runStatus = (r: Run) => {
    if (r.status === 'done') return <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700">בוצע ✓</span>
    if (r.amountPaid > 0) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700">חלקי</span>
    return <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-600">ממתין</span>
  }

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🧾 תשלומים קבועים</h1>
          <p className="text-sm text-gray-500">ניהול חיובים חוזרים לספקים</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="month" value={myToInp(month)} onChange={e => setMonth(inpToMY(e.target.value))}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
          <button onClick={generate} disabled={generating}
            className="px-3 py-2 rounded-xl text-sm font-medium border border-[#1a3a7a] text-[#1a3a7a] hover:bg-[#1a3a7a] hover:text-white disabled:opacity-60 transition-colors">
            {generating ? 'יוצר...' : 'צור חיובי החודש'}
          </button>
          <button onClick={() => setEditDef(null)}
            className="px-4 py-2 rounded-xl bg-[#1a3a7a] text-white text-sm font-medium hover:bg-[#0d1f52] transition-colors">
            + תשלום קבוע
          </button>
        </div>
      </div>

      {/* KPI (month filter affects these only) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <SummaryCard label="סכום כללי" value={fmt(summary?.total ?? 0)} color="bg-blue-50 border-blue-100" />
        <SummaryCard label="אשראי"     value={fmt(summary?.credit ?? 0)} color="bg-purple-50 border-purple-100" />
        <SummaryCard label='הו"ק'      value={fmt(summary?.hok ?? 0)} color="bg-white border-gray-200" />
        <SummaryCard label="העברה"     value={fmt(summary?.transfer ?? 0)} color="bg-white border-gray-200" />
        <SummaryCard label="מזומן"     value={fmt(summary?.cash ?? 0)} color="bg-white border-gray-200" />
        <SummaryCard label="אחר"       value={fmt(summary?.other ?? 0)} color="bg-white border-gray-200" />
      </div>

      {/* Card-owner task */}
      {cardTask && cardTask.creditDoneTotal > 0 && (
        <button onClick={() => setShowCard(true)}
          className="w-full text-right bg-gradient-to-l from-indigo-50 to-white border border-indigo-200 rounded-2xl p-4 flex items-center justify-between hover:border-indigo-400 transition-colors">
          <div>
            <p className="text-sm font-semibold text-indigo-800">💳 לשלם לבעל הכרטיס · {cardTask.monthYear}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {cardTask.status === 'done' ? `שולם ל${cardTask.cardOwnerName || 'בעל הכרטיס'}` : 'ממתין לביצוע'}
            </p>
          </div>
          <div className="text-left">
            <p className="text-xl font-bold text-indigo-800 tabular-nums">{fmt(cardTask.creditDoneTotal)}</p>
            {cardTask.status === 'done'
              ? <span className="text-[10px] text-emerald-600">בוצע ✓</span>
              : <span className="text-[10px] text-amber-600">לחץ לביצוע</span>}
          </div>
        </button>
      )}

      {/* Runs / tasks for the month */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b px-4 py-2 text-sm font-semibold text-gray-600">משימות החודש</div>
        {loading ? (
          <div className="p-6 space-y-3 animate-pulse">{[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg" />)}</div>
        ) : runs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">אין חיובים לחודש זה — לחץ &quot;צור חיובי החודש&quot;</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right font-medium">ספק</th>
                <th className="px-3 py-2 text-right font-medium">אמצעי</th>
                <th className="px-3 py-2 text-right font-medium">יום</th>
                <th className="px-3 py-2 text-left font-medium">לתשלום</th>
                <th className="px-3 py-2 text-left font-medium">שולם</th>
                <th className="px-3 py-2 text-center font-medium">סטטוס</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {runs.map(r => (
                <tr key={r.id} className="border-b border-gray-50 hover:bg-blue-50/40">
                  <td className="px-3 py-2 font-medium text-gray-800">{r.supplierName}{r.bank ? <span className="text-gray-400 text-xs"> · {r.bank}</span> : null}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{r.paymentMethod}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{r.dueDate ? r.dueDate.slice(8, 10) : '—'}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(r.amountDue)}</td>
                  <td className="px-3 py-2 text-left tabular-nums text-gray-600">{r.amountPaid > 0 ? fmt(r.amountPaid) : '—'}</td>
                  <td className="px-3 py-2 text-center">{runStatus(r)}</td>
                  <td className="px-3 py-2 text-left">
                    <button onClick={() => setPayRun(r)}
                      className="text-xs px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 font-medium">
                      {r.status === 'done' ? 'ערוך' : 'שולם'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Definitions */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="bg-gray-50 border-b px-4 py-2 text-sm font-semibold text-gray-600">הגדרות ספקים ({defs.length})</div>
        {defs.length === 0 ? (
          <div className="p-8 text-center text-sm text-gray-400">אין תשלומים קבועים — הוסף אחד</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b text-gray-500 text-xs">
              <tr>
                <th className="px-3 py-2 text-right font-medium">שם ספק</th>
                <th className="px-3 py-2 text-left font-medium">סכום</th>
                <th className="px-3 py-2 text-right font-medium">יום חיוב</th>
                <th className="px-3 py-2 text-right font-medium">אמצעי</th>
                <th className="px-3 py-2 text-right font-medium">בנק</th>
                <th className="px-3 py-2 text-center font-medium">פעיל</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {defs.map(d => (
                <tr key={d.id} className="border-b border-gray-50 hover:bg-blue-50/40">
                  <td className="px-3 py-2 font-medium text-gray-800">{d.supplierName}</td>
                  <td className="px-3 py-2 text-left tabular-nums">{fmt(d.amount)}</td>
                  <td className="px-3 py-2 text-gray-500">{d.chargeDay ?? '1'}</td>
                  <td className="px-3 py-2 text-gray-600 text-xs">{d.paymentMethod}</td>
                  <td className="px-3 py-2 text-gray-500 text-xs">{d.bank || '—'}</td>
                  <td className="px-3 py-2 text-center">
                    <button onClick={() => toggleActive(d)}
                      className={`text-xs px-2 py-0.5 rounded-full ${d.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-400'}`}>
                      {d.active ? 'פעיל' : 'כבוי'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-left">
                    <button onClick={() => setEditDef(d)} className="text-xs text-[#1a3a7a] hover:underline">ערוך</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {editDef !== undefined && (
        <RecurringPaymentModal existing={editDef} onClose={() => setEditDef(undefined)}
          onSaved={() => { loadDefs(); loadRuns() }} />
      )}
      {payRun && (
        <PayRunModal run={payRun} onClose={() => setPayRun(null)} onSaved={loadRuns} />
      )}
      {showCard && cardTask && (
        <CardPaymentTaskModal task={cardTask} onClose={() => setShowCard(false)} onSaved={loadRuns} />
      )}
    </div>
  )
}
