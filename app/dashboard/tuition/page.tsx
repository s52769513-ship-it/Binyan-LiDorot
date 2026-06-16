'use client'

import { useEffect, useMemo, useState, useCallback } from 'react'
import EmployeeCard from '@/components/EmployeeCard'
import { TxDetailModal } from '@/components/TransactionCard'
import type { Transaction } from '@/components/TransactionCard'
import dynamic from 'next/dynamic'
const AddTransactionModal = dynamic(() => import('@/components/AddTransactionModal'), { ssr: false })

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))
const fmtCur = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

const STATUS_STYLE: Record<string, string> = {
  'שולם':  'bg-emerald-50 text-emerald-700 border-emerald-200',
  'חלקי':  'bg-amber-50  text-amber-700  border-amber-200',
  'ממתין': 'bg-red-50    text-red-700    border-red-200',
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'ינואר', '02': 'פברואר', '03': 'מרץ',    '04': 'אפריל',
  '05': 'מאי',   '06': 'יוני',   '07': 'יולי',   '08': 'אוגוסט',
  '09': 'ספטמבר','10': 'אוקטובר','11': 'נובמבר', '12': 'דצמבר',
}
const HEBREW_MONTH: Record<string, string> = {
  '01': 'שבט', '02': 'אדר',  '03': 'ניסן', '04': 'אייר',
  '05': 'סיון','06': 'תמוז', '07': 'אב',   '08': 'אלול',
  '09': 'תשרי','10': 'חשון', '11': 'כסלו', '12': 'טבת',
}
function fmtMY(my: string) {
  const [m, y] = my.split('/')
  return `${MONTH_NAMES[m] || m} ${y} · ${HEBREW_MONTH[m] || ''}`
}

interface KidRow {
  id: string; studentId: string; studentName: string; className: string
  gender: string; status: string; parentId: string; parentName: string
  expected: number; paid: number; balance: number; numSiblings: number
  paymentStatus: 'שולם' | 'חלקי' | 'ממתין'
}

interface KidsData {
  rows: KidRow[]
  month: string
  months: string[]
  summary: { totalExpected: number; totalPaid: number; totalBalance: number; totalKids: number }
}

interface ParentPreview {
  id: string; name: string; amount: number; toCreate: string[]; toSkip: string[]
}
interface PreviewData {
  parents: ParentPreview[]; totalToCreate: number; months: string[]
}

type TuitionTab = 'kids' | 'planned'

export default function TuitionPage() {
  const [activeTab, setActiveTab] = useState<TuitionTab>('kids')
  const [data, setData]         = useState<KidsData | null>(null)
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [month, setMonth]       = useState('')
  const [search, setSearch]     = useState('')
  const [statusFilter, setStatus] = useState('')
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Generate-year-all state
  const [genLoading, setGenLoading]   = useState(false)
  const [genPreview, setGenPreview]   = useState<PreviewData | null>(null)
  const [genExecuting, setGenExecuting] = useState(false)
  const [genResult, setGenResult]     = useState<{ created: number; skipped: number } | null>(null)
  const [genError, setGenError]       = useState('')

  const loadPreview = async () => {
    setGenLoading(true); setGenError(''); setGenPreview(null); setGenResult(null)
    try {
      const res  = await fetch('/api/planned-payments/generate-year-all')
      const data = await res.json()
      if (data.error) { setGenError(data.error); return }
      setGenPreview(data)
    } catch { setGenError('שגיאת רשת') }
    finally { setGenLoading(false) }
  }

  const executeGen = async () => {
    setGenExecuting(true); setGenError('')
    try {
      const res  = await fetch('/api/planned-payments/generate-year-all', { method: 'POST' })
      const data = await res.json()
      if (data.error) { setGenError(data.error); return }
      setGenResult(data)
      setGenPreview(null)
    } catch { setGenError('שגיאת רשת') }
    finally { setGenExecuting(false) }
  }

  const load = (m?: string) => {
    setLoading(true)
    setError('')
    const url = m ? `/api/tuition/kids?month=${encodeURIComponent(m)}` : '/api/tuition/kids'
    fetch(url)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else { setData(d); if (!month && d.month) setMonth(d.month) } })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const handleMonthChange = (m: string) => { setMonth(m); load(m) }

  const filtered = useMemo(() => {
    let rows = data?.rows ?? []
    if (search.trim()) rows = rows.filter(r =>
      r.studentName.includes(search) || r.parentName.includes(search) || r.className.includes(search)
    )
    if (statusFilter) rows = rows.filter(r => r.paymentStatus === statusFilter)
    return rows
  }, [data, search, statusFilter])

  // Group by className
  const grouped = useMemo(() => {
    const map = new Map<string, KidRow[]>()
    for (const r of filtered) {
      const cls = r.className || 'ללא כיתה'
      if (!map.has(cls)) map.set(cls, [])
      map.get(cls)!.push(r)
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b, 'he'))
  }, [filtered])

  const summary = data?.summary

  const toggleClass = (cls: string) =>
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(cls) ? next.delete(cls) : next.add(cls)
      return next
    })

  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={loadPreview}
            disabled={genLoading}
            className="px-3 py-2 text-sm font-semibold rounded-xl transition-all disabled:opacity-60 flex items-center gap-1.5 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
          >
            {genLoading ? <><span className="animate-spin inline-block text-xs">⟳</span> טוען...</> : '⚡ צור תשלומים לכל ההורים'}
          </button>
          {genResult && (
            <span className="text-sm text-emerald-700 font-medium">
              ✅ נוצרו {genResult.created} תשלומים
              <button onClick={() => setGenResult(null)} className="mr-2 text-xs text-gray-400 underline">סגור</button>
            </span>
          )}
          {genError && <span className="text-sm text-red-600">{genError}</span>}
        </div>
        <h2 className="text-2xl font-bold text-gray-800">שכר לימוד</h2>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'kids',    label: 'ילדים' },
          { key: 'planned', label: '📋 תשלומים מתוכננים' },
        ] as { key: TuitionTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.key ? 'border-[#1a3a7a] text-[#1a3a7a]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {error && activeTab === 'kids' && <div className="text-red-600 text-sm bg-red-50 rounded-xl p-3">{error}</div>}

      {activeTab === 'planned' && <PlannedPaymentsTab onOpenParent={id => setSelectedParent(id)} />}

      {activeTab === 'kids' && <>
      {/* Summary KPIs */}
      {!loading && summary && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: 'סה"כ לתשלום', value: summary.totalExpected, color: 'text-gray-800', bg: 'bg-white' },
            { label: 'שולם',         value: summary.totalPaid,     color: 'text-emerald-700', bg: 'bg-emerald-50' },
            { label: 'נותר לגביה',   value: summary.totalBalance,  color: 'text-red-600',     bg: 'bg-red-50' },
          ].map(c => (
            <div key={c.label} className={`${c.bg} rounded-xl border border-gray-200 p-4`}>
              <p className="text-xs text-gray-500 mb-1">{c.label}</p>
              <p className={`text-xl font-bold tabular-nums ${c.color}`}>₪{fmt(c.value)}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        {data?.months && data.months.length > 1 && (
          <select
            value={month}
            onChange={e => handleMonthChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white"
          >
            {data.months.map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}

        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש ילד / הורה / כיתה..."
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
        />

        <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
          {(['', 'ממתין', 'חלקי', 'שולם'] as const).map(s => (
            <button key={s} onClick={() => setStatus(s === statusFilter ? '' : s)}
              className={`px-3 py-2 whitespace-nowrap transition-colors ${
                statusFilter === s && s !== ''
                  ? s === 'שולם' ? 'bg-emerald-600 text-white'
                    : s === 'חלקי' ? 'bg-amber-500 text-white'
                    : 'bg-red-600 text-white'
                  : s === '' && !statusFilter ? 'bg-[#1a3a7a] text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-50'
              }`}>
              {s || 'הכל'}
            </button>
          ))}
        </div>

        {(search || statusFilter) && (
          <button onClick={() => { setSearch(''); setStatus('') }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">
            נקה
          </button>
        )}
      </div>

      {/* Table grouped by class */}
      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i =>
          <div key={i} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="h-10 bg-gray-100 animate-pulse" />
            {[1,2,3].map(j => <div key={j} className="h-12 border-t border-gray-100 bg-gray-50/50 animate-pulse" />)}
          </div>
        )}</div>
      ) : grouped.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
          {data?.rows.length === 0 ? 'אין נתונים לחודש זה' : 'אין תוצאות לחיפוש'}
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map(([cls, kids]) => {
            const isOpen = !collapsed.has(cls)
            const clsExpected = kids.reduce((s, k) => s + k.expected, 0)
            const clsPaid     = kids.reduce((s, k) => s + k.paid,     0)
            const clsBalance  = kids.reduce((s, k) => s + Math.max(0, k.balance), 0)
            const pct = clsExpected > 0 ? Math.round((clsPaid / clsExpected) * 100) : 0

            return (
              <div key={cls} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                {/* Class header */}
                <button
                  onClick={() => toggleClass(cls)}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-right border-b border-gray-200"
                >
                  <span className="text-gray-400 text-xs">{isOpen ? '▼' : '▶'}</span>
                  <span className="font-semibold text-gray-800">{cls}</span>
                  <span className="text-xs text-gray-400">{kids.length} ילדים</span>
                  <div className="flex-1" />
                  <div className="flex items-center gap-4 text-sm">
                    <span className="text-gray-500 tabular-nums hidden sm:inline">צפוי ₪{fmt(clsExpected)}</span>
                    <span className="text-emerald-700 font-medium tabular-nums">שולם ₪{fmt(clsPaid)}</span>
                    {clsBalance > 0 && <span className="text-red-600 font-medium tabular-nums">נותר ₪{fmt(clsBalance)}</span>}
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white border border-gray-200 text-gray-600 tabular-nums">
                      {pct}%
                    </span>
                  </div>
                </button>

                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[500px]">
                      <thead>
                        <tr className="text-xs font-semibold text-gray-400 uppercase text-right border-b border-gray-100">
                          <th className="px-4 py-2">ילד</th>
                          <th className="px-4 py-2">הורה</th>
                          <th className="px-4 py-2 text-left">לתשלום</th>
                          <th className="px-4 py-2 text-left">שולם</th>
                          <th className="px-4 py-2 text-left">יתרה</th>
                          <th className="px-4 py-2 text-center">סטטוס</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {kids.map(kid => (
                          <tr key={kid.id}
                            onClick={() => setSelectedParent(kid.parentId)}
                            className="cursor-pointer hover:bg-blue-50/30 transition-colors">
                            <td className="px-4 py-3">
                              <div className="font-medium text-gray-900 text-sm">{kid.studentName}</div>
                              {kid.numSiblings > 1 && (
                                <div className="text-xs text-gray-400">{kid.numSiblings} ילדים במשפחה</div>
                              )}
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">{kid.parentName}</td>
                            <td className="px-4 py-3 text-left text-sm tabular-nums text-gray-700">₪{fmt(kid.expected)}</td>
                            <td className="px-4 py-3 text-left text-sm tabular-nums text-emerald-700 font-medium">₪{fmt(kid.paid)}</td>
                            <td className="px-4 py-3 text-left text-sm tabular-nums font-semibold">
                              {kid.balance > 0
                                ? <span className="text-red-600">₪{fmt(kid.balance)}</span>
                                : <span className="text-emerald-600 text-base">✓</span>}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${STATUS_STYLE[kid.paymentStatus] ?? ''}`}>
                                {kid.paymentStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {selectedParent && (
        <EmployeeCard parentId={selectedParent} onClose={() => setSelectedParent(null)} />
      )}
      </>}

      {/* Generate-year preview modal */}
      {genPreview && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setGenPreview(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <button onClick={() => setGenPreview(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              <h3 className="font-bold text-gray-800 text-base">אישור יצירת תשלומים</h3>
            </div>

            <div className="px-5 py-4 bg-amber-50 border-b border-amber-100 flex-shrink-0">
              {genPreview.totalToCreate === 0 ? (
                <p className="text-sm text-gray-500 text-center">כל התשלומים לשנה הנוכחית כבר קיימים — אין מה ליצור.</p>
              ) : (
                <div className="space-y-1">
                  <p className="font-semibold text-amber-800">
                    עומד לייצר <strong>{genPreview.totalToCreate}</strong> תשלומים עבור <strong>{genPreview.parents.length}</strong> הורים
                  </p>
                  <p className="text-xs text-amber-600">
                    {fmtMY(genPreview.months[0])} עד {fmtMY(genPreview.months[genPreview.months.length - 1])}
                  </p>
                </div>
              )}
            </div>

            <div className="overflow-y-auto flex-1 px-5 py-3 space-y-2">
              {genPreview.parents.map(p => (
                <div key={p.id} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex justify-between items-center mb-0.5">
                    <span className="text-xs text-emerald-600 font-medium">+{p.toCreate.length} חדשים</span>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">{fmtCur(p.amount)} לחודש</p>
                    </div>
                  </div>
                  {p.toSkip.length > 0 && (
                    <p className="text-[10px] text-gray-400">{p.toSkip.length} חודשים קיימים ידולגו</p>
                  )}
                </div>
              ))}
              {genPreview.parents.length === 0 && (
                <p className="text-sm text-gray-400 text-center py-4">אין הורים הזקוקים לתשלומים חדשים</p>
              )}
            </div>

            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button
                onClick={() => setGenPreview(null)}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                ביטול
              </button>
              {genPreview.totalToCreate > 0 && (
                <button
                  onClick={executeGen}
                  disabled={genExecuting}
                  className="flex-1 py-2.5 rounded-xl font-bold text-sm transition-all disabled:opacity-60"
                  style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
                >
                  {genExecuting ? 'יוצר...' : `✓ אשר ויצור ${genPreview.totalToCreate} תשלומים`}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function hebrewDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(new Date(iso))
  } catch { return iso }
}

/* ─── PlannedPaymentsTab ─────────────────────────────── */
interface PPRow {
  id: string; name: string; ppType: string; amount: number; balance: number
  date: string; monthYear: string; parentIds: string[]; parentName: string
}

type PpTxItem = {
  id: string; amount: number; date: string; monthYear: string
  type: string; notes: string; parentIds: string[]; projectNames: string[]; isCredit: boolean
}

function PlannedPaymentsTab({ onOpenParent }: { onOpenParent: (id: string) => void }) {
  const [rows, setRows]         = useState<PPRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [search, setSearch]     = useState('')
  const [monthFilter, setMonthFilter] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)

  // PP detail modal state
  const [selectedPP, setSelectedPP]     = useState<PPRow | null>(null)
  const [ppTxList, setPpTxList]         = useState<PpTxItem[]>([])
  const [ppTxLoading, setPpTxLoading]   = useState(false)
  const [selectedPpTx, setSelectedPpTx] = useState<Transaction | null>(null)
  const [showAddTxForPP, setShowAddTxForPP] = useState(false)

  const loadPpTx = useCallback((ppId: string) => {
    setPpTxLoading(true)
    fetch(`/api/transactions?plannedPaymentId=${encodeURIComponent(ppId)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPpTxList(d); else setPpTxList([]) })
      .catch(() => setPpTxList([]))
      .finally(() => setPpTxLoading(false))
  }, [])

  useEffect(() => {
    if (!selectedPP) { setPpTxList([]); return }
    loadPpTx(selectedPP.id)
  }, [selectedPP, loadPpTx])

  // After ppTxList loads, recompute the real balance from linked transactions
  // and patch the DB if it's stale
  useEffect(() => {
    if (!selectedPP || ppTxLoading) return
    const computedPaid    = ppTxList.reduce((s, t) => s + Math.abs(t.amount), 0)
    const computedBalance = Math.max(0, selectedPP.amount - computedPaid)
    if (computedBalance === selectedPP.balance) return  // already correct

    // Update local state immediately
    setSelectedPP(prev => prev ? { ...prev, balance: computedBalance } : prev)
    setRows(prev => prev.map(r => r.id === selectedPP.id ? { ...r, balance: computedBalance } : r))

    // Patch DB silently
    fetch('/api/planned-payments', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: selectedPP.id, balance: computedBalance }),
    }).catch(() => {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ppTxList, ppTxLoading])

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const load = () => {
    setLoading(true)
    fetch('/api/planned-payments?withParentNames=true&limit=500')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setRows(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const months = [...new Set(rows.map(r => r.monthYear).filter(Boolean))].sort((a, b) => {
    const [am, ay] = a.split('/').map(Number)
    const [bm, by] = b.split('/').map(Number)
    return by !== ay ? by - ay : bm - am
  })

  const filtered = rows.filter(r => {
    if (r.ppType === 'salary') return false
    if (monthFilter && r.monthYear !== monthFilter) return false
    if (search.trim()) {
      const q = search.trim()
      return r.parentName?.includes(q) || r.monthYear?.includes(q) || r.name?.includes(q)
    }
    return true
  })

  const deletePP = async (id: string) => {
    if (!confirm('למחוק תשלום מתוכנן זה? גם תנועות המשויכות אליו יימחקו.')) return
    setDeleting(id)
    try {
      const res = await fetch(`/api/planned-payments?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const d = await res.json()
      if (d.error) { alert(d.error); return }
      setRows(prev => prev.filter(r => r.id !== id))
    } catch { alert('שגיאה במחיקה') }
    finally { setDeleting(null) }
  }

  const totalBalance = filtered.reduce((s, r) => s + Math.max(0, r.balance), 0)
  const totalAmount  = filtered.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-xs text-gray-500">סה&quot;כ תשלומים</p>
          <p className="text-lg font-bold text-gray-800">{filtered.length}</p>
        </div>
        <div className="bg-emerald-50 rounded-xl border border-emerald-100 p-3 text-center">
          <p className="text-xs text-gray-500">שולם</p>
          <p className="text-lg font-bold text-emerald-700">
            ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(totalAmount - totalBalance)}
          </p>
        </div>
        <div className="bg-red-50 rounded-xl border border-red-100 p-3 text-center">
          <p className="text-xs text-gray-500">יתרה לגביה</p>
          <p className="text-lg font-bold text-red-600">
            ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(totalBalance)}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש הורה / חודש..."
          className="flex-1 min-w-[160px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
        />
        {months.length > 0 && (
          <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white">
            <option value="">כל החודשים</option>
            {months.map(m => <option key={m} value={m}>{fmtMY(m)}</option>)}
          </select>
        )}
        {(search || monthFilter) && (
          <button onClick={() => { setSearch(''); setMonthFilter('') }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">נקה</button>
        )}
      </div>

      {/* ── PP detail modal ── */}
      {selectedPP && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" dir="rtl"
          onClick={e => { if (e.target === e.currentTarget) setSelectedPP(null) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setSelectedPP(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5 z-10">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setSelectedPP(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              <h3 className="font-bold text-gray-800 text-base">{selectedPP.name || 'תשלום מתוכנן'}</h3>
            </div>

            {/* PP info */}
            <div className="space-y-2 mb-4">
              <div className="flex justify-between items-center">
                <span className="text-2xl font-bold text-gray-800">
                  ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(selectedPP.amount)}
                </span>
                <span className="text-xs text-gray-400">סכום מתוכנן</span>
              </div>
              {(() => {
                const paid = selectedPP.amount - selectedPP.balance
                return <>
                  {paid > 0 && (
                    <div className="flex justify-between items-center bg-emerald-50 rounded-lg px-3 py-2">
                      <span className="text-base font-bold text-emerald-600">
                        ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(paid)}
                      </span>
                      <span className="text-xs text-emerald-500">שולם</span>
                    </div>
                  )}
                  {selectedPP.balance > 0 ? (
                    <div className="flex justify-between items-center bg-red-50 rounded-lg px-3 py-2">
                      <span className="text-lg font-bold text-red-600">
                        ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(selectedPP.balance)}
                      </span>
                      <span className="text-xs text-red-400">יתרה לתשלום</span>
                    </div>
                  ) : (
                    <div className="bg-emerald-50 rounded-lg px-3 py-2 text-center">
                      <span className="text-sm font-semibold text-emerald-600">✓ שולם במלואו</span>
                    </div>
                  )}
                </>
              })()}
              {selectedPP.date && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span className="text-xs text-gray-400">{hebrewDate(selectedPP.date)}</span>
                  <span className="text-gray-400">תאריך</span>
                </div>
              )}
              {selectedPP.monthYear && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{selectedPP.monthYear}</span>
                  <span className="text-gray-400">חודש</span>
                </div>
              )}
              {selectedPP.parentName && (
                <button
                  onClick={() => { onOpenParent(selectedPP.parentIds[0]); setSelectedPP(null) }}
                  className="w-full text-right text-sm text-[#1a3a7a] hover:underline"
                >
                  ↗ {selectedPP.parentName}
                </button>
              )}
            </div>

            {/* Linked transactions */}
            <div className="border-t border-gray-100 pt-3 mb-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">
                תשלומים ששולמו
                {ppTxLoading && <span className="text-gray-300 mr-1">...</span>}
              </p>
              {!ppTxLoading && ppTxList.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-1">אין תשלומים עדיין</p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto">
                  {ppTxList.map(tx => (
                    <div key={tx.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${tx.isCredit ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                      {tx.isCredit ? (
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm font-bold text-emerald-600">
                            ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(tx.amount))}
                          </span>
                          <span className="text-xs text-emerald-500">{tx.notes}</span>
                        </div>
                      ) : (
                        <button
                          className="flex items-center justify-between flex-1 text-right hover:bg-white/60 rounded-lg px-1 -mx-1 transition-colors"
                          onClick={() => setSelectedPpTx({
                            id: tx.id, amount: Math.abs(tx.amount), type: tx.type,
                            date: tx.date, monthYear: tx.monthYear, notes: tx.notes,
                            projectNames: tx.projectNames, parentIds: tx.parentIds,
                            plannedPaymentId: selectedPP.id,
                          })}
                        >
                          <div className="flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-2">
                              {tx.type && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">{tx.type}</span>}
                              {tx.date && <span className="text-xs text-gray-400">{new Intl.DateTimeFormat('he-IL').format(new Date(tx.date))}</span>}
                            </div>
                            {tx.notes && <span className="text-[10px] text-gray-400 italic">{tx.notes}</span>}
                          </div>
                          <span className="text-sm font-bold text-emerald-700">
                            ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(tx.amount))}
                          </span>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="space-y-2">
              {selectedPP.balance > 0 && (
                <button
                  onClick={() => setShowAddTxForPP(true)}
                  className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors"
                >
                  + הוסף תשלום
                </button>
              )}
              <button
                onClick={() => { onOpenParent(selectedPP.parentIds[0]); setSelectedPP(null) }}
                className="w-full py-2 rounded-xl border border-[#1a3a7a]/30 text-[#1a3a7a] text-sm font-medium hover:bg-indigo-50 transition-colors"
              >
                פתח כרטיס הורה
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TxDetailModal for editing a linked tx */}
      {selectedPpTx && (
        <TxDetailModal
          tx={selectedPpTx}
          onClose={() => setSelectedPpTx(null)}
          onSaved={() => {
            setSelectedPpTx(null)
            if (selectedPP) loadPpTx(selectedPP.id)
          }}
        />
      )}

      {/* AddTransactionModal for paying a PP */}
      {showAddTxForPP && selectedPP && (
        <AddTransactionModal
          fixedLabel="בנין לדורות"
          sourceLabel={selectedPP.name}
          prefilledAmount={selectedPP.balance}
          plannedPaymentId={selectedPP.id}
          parentId={selectedPP.parentIds[0]}
          preselectedProject="בניין לדורות"
          onClose={() => setShowAddTxForPP(false)}
          onSuccess={() => {
            setShowAddTxForPP(false)
            // Refresh PP row balance
            fetch(`/api/planned-payments?id=${encodeURIComponent(selectedPP.id)}`)
              .then(r => r.json())
              .then(d => {
                if (Array.isArray(d) && d[0]) {
                  setSelectedPP(prev => prev ? { ...prev, balance: d[0].balance } : prev)
                  setRows(prev => prev.map(r => r.id === selectedPP.id ? { ...r, balance: d[0].balance } : r))
                }
              })
            loadPpTx(selectedPP.id)
          }}
        />
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3,4].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">אין תשלומים מתוכננים</div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 text-right">
                <th className="px-4 py-2.5">הורה</th>
                <th className="px-4 py-2.5">חודש</th>
                <th className="px-4 py-2.5 text-left">סכום</th>
                <th className="px-4 py-2.5 text-left">יתרה</th>
                <th className="px-4 py-2.5 text-center">סטטוס</th>
                <th className="px-2 py-2.5 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map(r => {
                const isOverdue = r.balance > 0 && !!r.date && new Date(r.date) < today
                const isPaid    = r.balance <= 0
                return (
                  <tr key={r.id}
                    onClick={() => setSelectedPP(r)}
                    className={`cursor-pointer hover:bg-blue-50/40 transition-colors ${isOverdue ? 'bg-red-50/30' : ''}`}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.parentName || '—'}</td>
                    <td className="px-4 py-2.5 text-gray-600">
                      <div>{r.monthYear}</div>
                      {r.monthYear && <div className="text-[10px] text-gray-400">{HEBREW_MONTH[r.monthYear.split('/')[0]] || ''}</div>}
                    </td>
                    <td className="px-4 py-2.5 text-left tabular-nums text-gray-700">
                      ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(r.amount)}
                    </td>
                    <td className="px-4 py-2.5 text-left tabular-nums font-semibold">
                      {isPaid
                        ? <span className="text-emerald-600">✓</span>
                        : <span className={isOverdue ? 'text-red-600' : 'text-amber-600'}>
                            ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(r.balance)}
                          </span>
                      }
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        isPaid    ? 'bg-emerald-50 text-emerald-700'
                        : isOverdue ? 'bg-red-50 text-red-700'
                        : 'bg-amber-50 text-amber-700'
                      }`}>
                        {isPaid ? 'שולם' : isOverdue ? 'באיחור' : 'פתוח'}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 text-center" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => deletePP(r.id)}
                        disabled={deleting === r.id}
                        className="p-1.5 text-gray-300 hover:text-red-500 transition-colors disabled:opacity-40 text-base"
                        title="מחק תשלום"
                      >
                        {deleting === r.id ? '...' : '🗑'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
