'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ParentDetail, PlannedPaymentItem, TransactionItem, WomanDetail } from '@/lib/types'
import { TransactionRow, TxDetailModal } from '@/components/TransactionCard'
import type { Transaction } from '@/components/TransactionCard'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

const AddTransactionModal    = dynamic(() => import('./AddTransactionModal'),    { ssr: false })
const AddPlannedPaymentModal = dynamic(() => import('./AddPlannedPaymentModal'), { ssr: false })

/* ─── helpers ──────────────────────────────────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

function fmtDate(d: string) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('he-IL').format(new Date(d))
}

const MONTH_NAMES: Record<string, string> = {
  '01': 'ינואר', '02': 'פברואר', '03': 'מרץ',    '04': 'אפריל',
  '05': 'מאי',   '06': 'יוני',   '07': 'יולי',   '08': 'אוגוסט',
  '09': 'ספטמבר','10': 'אוקטובר','11': 'נובמבר', '12': 'דצמבר',
}
const HEBREW_MONTH_NAMES: Record<string, string> = {
  '01': 'שבט',   '02': 'אדר',    '03': 'ניסן',  '04': 'אייר',
  '05': 'סיון',  '06': 'תמוז',   '07': 'אב',    '08': 'אלול',
  '09': 'תשרי',  '10': 'חשון',   '11': 'כסלו',  '12': 'טבת',
}
function hebrewMonth(my: string): string {
  const [m] = my.split('/')
  return HEBREW_MONTH_NAMES[m] || ''
}
function fmtMonthYear(my: string): string {
  const [m, y] = my.split('/')
  const greg   = MONTH_NAMES[m] || m
  const heb    = HEBREW_MONTH_NAMES[m] || ''
  return `${greg} ${y}${heb ? ` · ${heb}` : ''}`
}

function computeAge(birthDate: string): string {
  if (!birthDate) return ''
  const birth = new Date(birthDate)
  if (isNaN(birth.getTime())) return ''
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const m = today.getMonth() - birth.getMonth()
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--
  return age >= 0 ? String(age) : ''
}

/* ─── InlineField ───────────────────────────────────── */
interface IFProps {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'email' | 'tel' | 'number' | 'date'
  multiline?: boolean
}
function InlineField({ label, value, onSave, type = 'text', multiline }: IFProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const inputDir = (type === 'tel' || type === 'email' || type === 'number') ? 'ltr' : 'rtl'

  const save = async () => {
    setEditing(false)
    if (val.trim() === (value ?? '').trim()) return
    setSaving(true)
    try { await onSave(val.trim()) } finally { setSaving(false) }
  }

  return (
    <div className="group">
      <div className="text-[10px] font-medium text-gray-400 mb-0.5">{label}</div>
      {editing ? (
        multiline ? (
          <textarea
            ref={ref as React.RefObject<HTMLTextAreaElement>}
            rows={3}
            value={val}
            onChange={e => setVal(e.target.value)}
            onBlur={save}
            onKeyDown={e => { if (e.key === 'Escape') { setVal(value); setEditing(false) } }}
            className="w-full px-0 py-0.5 text-sm border-b-2 border-[#1a3a7a] bg-transparent outline-none text-right resize-none"
          />
        ) : (
          <input
            ref={ref as React.RefObject<HTMLInputElement>}
            type={type}
            value={val}
            dir={inputDir}
            onChange={e => setVal(e.target.value)}
            onBlur={save}
            onKeyDown={e => {
              if (e.key === 'Enter') save()
              if (e.key === 'Escape') { setVal(value); setEditing(false) }
            }}
            className="w-full px-0 py-0.5 text-sm border-b-2 border-[#1a3a7a] bg-transparent outline-none text-right"
          />
        )
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="w-full text-right block hover:text-[#1a3a7a] transition-colors"
        >
          {saving ? (
            <span className="text-xs text-gray-400">שומר...</span>
          ) : (
            <span className="text-sm text-gray-800">
              {val || <span className="text-gray-300 italic text-xs">לחץ למילוי</span>}
            </span>
          )}
          <span className="opacity-0 group-hover:opacity-40 text-gray-300 text-xs mr-1"> ✏</span>
        </button>
      )}
    </div>
  )
}

/* ─── WomanLinkField ─────────────────────────────────── */
function WomanLinkField({ women, parentId, onUpdate }: {
  women: WomanDetail[]
  parentId: string
  onUpdate: () => void
}) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [busy, setBusy] = useState(false)

  const search = async (q: string) => {
    setQuery(q)
    if (!q.trim()) { setResults([]); return }
    const r = await fetch(`/api/women?search=${encodeURIComponent(q)}`)
    const data = await r.json()
    setResults((data ?? []).filter((w: { id: string }) => !women.some(lw => lw.id === w.id)))
  }

  const link = async (w: { id: string; name: string }) => {
    setBusy(true)
    await fetch(`/api/women/${w.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addParentId: parentId }),
    })
    setBusy(false)
    setSearching(false)
    setQuery('')
    setResults([])
    onUpdate()
  }

  const unlink = async (womanId: string) => {
    setBusy(true)
    await fetch(`/api/women/${womanId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ removeParentId: parentId }),
    })
    setBusy(false)
    onUpdate()
  }

  return (
    <div className="group">
      <div className="text-[10px] font-medium text-gray-400 mb-1">אשה / קישור זוגי</div>
      <div className="flex flex-wrap gap-1 mb-1">
        {women.map(w => (
          <span key={w.id} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-purple-50 text-purple-700 border border-purple-200">
            {w.name}
            <button
              onClick={() => unlink(w.id)}
              disabled={busy}
              className="text-purple-300 hover:text-red-500 leading-none disabled:opacity-40"
            >✕</button>
          </span>
        ))}
        {!searching && (
          <button
            onClick={() => setSearching(true)}
            className="px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500 hover:bg-gray-200 border border-gray-200 transition-colors"
          >
            + קישור
          </button>
        )}
        {busy && <span className="text-[10px] text-gray-400">שומר...</span>}
      </div>
      {searching && (
        <div className="relative">
          <input
            autoFocus
            value={query}
            onChange={e => search(e.target.value)}
            onBlur={() => setTimeout(() => { setSearching(false); setQuery(''); setResults([]) }, 200)}
            placeholder="חפש שם אשה..."
            className="w-full px-2 py-1 text-sm border border-gray-200 rounded-lg text-right focus:outline-none focus:border-purple-400"
          />
          {results.length > 0 && (
            <div className="absolute right-0 top-full mt-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg z-20 max-h-40 overflow-y-auto">
              {results.map(w => (
                <button
                  key={w.id}
                  onMouseDown={() => link(w)}
                  className="w-full px-3 py-2 text-sm text-right hover:bg-purple-50 text-gray-800 block border-b border-gray-50 last:border-0"
                >
                  {w.name}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ─── props ─────────────────────────────────────────── */
interface Props {
  parentId: string
  onClose: () => void
  onOpenStudent?: (studentId: string) => void
}

/* ─── badge ─────────────────────────────────────────── */
const STATUS_STYLE: Record<string, string> = {
  'פעיל':    'bg-emerald-100 text-emerald-800',
  'לא פעיל': 'bg-gray-100 text-gray-600',
  'ממתין':   'bg-amber-100 text-amber-700',
}
function Badge({ text }: { text: string }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[text] ?? 'bg-blue-50 text-blue-700'}`}>
      {text}
    </span>
  )
}

type TabKey = 'details' | 'children' | 'payments' | 'salary'
type SalarySubTab = 'summary' | 'settings' | 'women'

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function EmployeeCard({ parentId, onClose, onOpenStudent }: Props) {
  const [parent, setParent]       = useState<ParentDetail | null>(null)
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState('')
  const [tab, setTab]             = useState<TabKey>('details')

  // Planned payments
  const [selectedPP, setSelectedPP]         = useState<PlannedPaymentItem | null>(null)
  const [txForPP, setTxForPP]               = useState<PlannedPaymentItem | null>(null)
  const [showAddTx, setShowAddTx]           = useState(false)
  const [showAddPlanned, setShowAddPlanned] = useState(false)
  const [showAddTxForPP, setShowAddTxForPP] = useState(false)
  const [editingPPAmount, setEditingPPAmount] = useState(false)
  const [ppAmountDraft, setPPAmountDraft]     = useState('')
  const [savingPPAmount, setSavingPPAmount]   = useState(false)
  // Linked transactions in PP modal
  const [ppTxList, setPpTxList]               = useState<{id:string;amount:number;date:string;monthYear:string;type:string;notes:string;parentIds:string[];projectNames:string[];isCredit:boolean}[]>([])
  const [selectedPpTx, setSelectedPpTx]       = useState<Transaction | null>(null)
  const [loadingPpTx, setLoadingPpTx]         = useState(false)

  // Salary detail modal
  const [showSalaryDetail, setShowSalaryDetail] = useState(false)
  // Generate year planned payments
  const [generatingYear, setGeneratingYear]     = useState(false)
  const [yearGenResult, setYearGenResult]       = useState<{ created: string[]; skipped: string[] } | null>(null)

  // Finance
  const [transactions, setTransactions] = useState<TransactionItem[]>([])

  // Salary
  const [salarySubTab, setSalarySubTab]               = useState<SalarySubTab>('summary')
  const [editingWoman, setEditingWoman]               = useState<string | null>(null)
  const [womanDraft, setWomanDraft]                   = useState<Record<string, string | number | boolean>>({})
  const [savingWoman, setSavingWoman]                 = useState(false)
  const [editingSettings, setEditingSettings]         = useState(false)
  const [settingsDraft, setSettingsDraft]             = useState<Record<string, string | number | boolean>>({})
  const [savingSettings, setSavingSettings]           = useState(false)

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/parents/${parentId}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) setError(d.error)
        else { setParent(d); setTransactions(d.transactions ?? []) }
      })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }, [parentId])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(load, ['transactions', 'planned_payments', 'parents'])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  // Keep selectedPP in sync with fresh parent data after load()
  useEffect(() => {
    if (!selectedPP || !parent) return
    const updated = parent.plannedPayments.find(pp => pp.id === selectedPP.id)
    if (updated) setSelectedPP(updated)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.plannedPayments])

  // Load transactions linked to the selected planned payment
  // Re-fetch also when parent data refreshes (Realtime) so list stays in sync
  const loadPpTx = useCallback((ppId: string) => {
    setLoadingPpTx(true)
    fetch(`/api/transactions?plannedPaymentId=${encodeURIComponent(ppId)}`)
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setPpTxList(d); else setPpTxList([]) })
      .catch(() => setPpTxList([]))
      .finally(() => setLoadingPpTx(false))
  }, [])

  useEffect(() => {
    if (!selectedPP) { setPpTxList([]); return }
    loadPpTx(selectedPP.id)
  }, [selectedPP?.id, loadPpTx])

  // When parent data refreshes via Realtime, also refresh ppTxList
  useEffect(() => {
    if (selectedPP?.id) loadPpTx(selectedPP.id)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parent?.plannedPayments])

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    await fetch(`/api/parents/${parentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    setParent(prev => prev ? { ...prev, ...fields } as ParentDetail : prev)
  }, [parentId])

  const patchWoman = async (womanId: string, fields: Record<string, unknown>) => {
    await fetch(`/api/women/${womanId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
  }

  // Planned payment helpers
  const today = new Date(); today.setHours(0,0,0,0)
  const isOverdue = (pp: PlannedPaymentItem) => pp.balance > 0 && !!pp.date && new Date(pp.date) < today

  // Tuition PPs only (for payments tab)
  const tuitionPPs_all = (parent?.plannedPayments ?? []).filter(pp => pp.name !== 'משכורת')
  const overduePPs = tuitionPPs_all.filter(isOverdue)
  const pendingPPs = tuitionPPs_all.filter(pp => !isOverdue(pp) && pp.balance > 0)
  const paidPPs    = tuitionPPs_all.filter(pp => pp.balance <= 0)
  const overdueTotal = overduePPs.reduce((s, pp) => s + pp.balance, 0)

  // Salary PPs (for salary tab)
  const salaryPPs_all = (parent?.plannedPayments ?? []).filter(pp => pp.name === 'משכורת')

  const currentMonth    = `${String(new Date().getMonth()+1).padStart(2,'0')}/${new Date().getFullYear()}`
  const thisMonthPP     = tuitionPPs_all.filter(p => p.monthYear === currentMonth)
  const paidThisMonth   = thisMonthPP.reduce((s, p) => s + Math.max(0, p.amount - p.balance), 0)
  const remainThisMonth = thisMonthPP.reduce((s, p) => s + Math.max(0, p.balance), 0)
  const totalDebt       = tuitionPPs_all.reduce((s, p) => s + Math.max(0, p.balance), 0)

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details',  label: 'פרטים' },
    { key: 'children', label: `ילדים${parent ? ` (${parent.students.length})` : ''}` },
    { key: 'payments', label: '📋 תשלומים' },
    { key: 'salary',   label: '💼 משכורת' },
  ]

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl overflow-hidden"
        style={{ height: '92vh', maxHeight: '92vh' }}
      >

        {/* ── HEADER ── */}
        <div className="px-5 pt-4 pb-0 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0d1f52 0%, #1a3a7a 100%)' }}>
          <div className="flex items-start justify-between mb-2">
            <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-lg leading-none">✕</button>
            <div className="text-right flex-1 mr-2">
              {loading
                ? <div className="h-7 w-48 bg-white/20 rounded animate-pulse mb-1 ml-auto" />
                : <h2 className="text-xl font-bold text-white">{parent?.name || '—'}</h2>
              }
              <div className="flex items-center gap-1.5 justify-end mt-1 flex-wrap">
                {parent?.city && <span className="text-white/50 text-xs">{parent.city}</span>}
                {(parent?.status ?? []).slice(0, 3).map(s => <Badge key={s} text={s} />)}
              </div>
            </div>
          </div>

          {/* Financial strip */}
          {parent && (
            <div className="flex gap-px mb-0 mt-1">
              <div className="flex-1 bg-white/10 rounded-tl-xl px-3 py-2 text-center">
                <p className={`text-base font-bold tabular-nums ${parent.tuitionBalance > 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                  {fmt(Math.abs(parent.tuitionBalance))}
                </p>
                <p className="text-[10px] text-white/50">{parent.tuitionBalance > 0 ? 'חוב' : 'זכות'}</p>
              </div>
              <div className="flex-1 bg-white/10 px-3 py-2 text-center">
                <p className="text-base font-bold text-white/80 tabular-nums">{parent.childrenCount}</p>
                <p className="text-[10px] text-white/50">ילדים</p>
              </div>
              <div className="flex-1 bg-white/10 px-3 py-2 text-center">
                <p className="text-base font-bold text-white/80 tabular-nums">{fmt(parent.tuitionTotal)}</p>
                <p className="text-[10px] text-white/50">שכ"ל</p>
              </div>
              {parent.salaryGross > 0 && (() => {
                const totalSal = parent.salaryGross + (parent.women ?? []).reduce((s, w) => s + (w.salaryGross ?? 0), 0)
                return (
                <button
                  onClick={() => setShowSalaryDetail(true)}
                  className="flex-1 bg-white/10 rounded-tr-xl px-3 py-2 text-center hover:bg-white/20 transition-colors"
                >
                  <p className="text-base font-bold text-purple-300 tabular-nums">{fmt(totalSal)}</p>
                  <p className="text-[10px] text-white/50">משכורת משפחתי</p>
                </button>
                )
              })()}
              {parent.salaryGross === 0 && <div className="flex-1 bg-white/10 rounded-tr-xl" />}
            </div>
          )}

          {/* Tabs + quick actions */}
          <div className="flex items-center gap-0.5 mt-2" dir="rtl">
            <div className="flex gap-0.5 flex-1 overflow-x-auto">
              {tabs.map(t => (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`px-3 py-2 text-xs font-semibold transition-colors rounded-t-lg whitespace-nowrap ${
                    tab === t.key ? 'bg-white text-[#1a3a7a]' : 'text-white/60 hover:text-white hover:bg-white/10'
                  }`}
                >{t.label}</button>
              ))}
            </div>
            {/* Quick actions */}
            <div className="flex gap-1 shrink-0 pb-1">
              <button
                onClick={() => setShowAddTx(true)}
                className="px-2.5 py-1 text-xs rounded-lg bg-emerald-600/80 hover:bg-emerald-500 text-white font-medium transition-colors whitespace-nowrap"
              >+ תנועה</button>
              <button
                onClick={() => setShowAddPlanned(true)}
                className="px-2.5 py-1 text-xs rounded-lg bg-amber-500/80 hover:bg-amber-400 text-white font-medium transition-colors whitespace-nowrap"
              >+ מתוכנן</button>
              <button
                disabled={generatingYear || !parent}
                onClick={async () => {
                  if (!parent) return
                  const amount = parent.tuitionTotal
                  if (!amount || amount <= 0) {
                    alert('לא מוגדר שכ"ל להורה זה')
                    return
                  }
                  setGeneratingYear(true)
                  try {
                    const res = await fetch('/api/planned-payments/generate-year', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ parentId, amount }),
                    })
                    const data = await res.json()
                    if (data.error) { alert(data.error); return }
                    setYearGenResult(data)
                    load()
                  } finally {
                    setGeneratingYear(false)
                  }
                }}
                className="px-2.5 py-1 text-xs rounded-lg bg-violet-600/80 hover:bg-violet-500 text-white font-medium transition-colors whitespace-nowrap disabled:opacity-40"
              >{generatingYear ? '...' : '⚡ שנה'}</button>
            </div>
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50" dir="rtl">
          {loading && (
            <div className="p-4 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          )}
          {error && <div className="p-4 text-red-600 text-sm bg-red-50 m-4 rounded-xl">{error}</div>}

          {/* ── DETAILS TAB ── */}
          {parent && tab === 'details' && (
            <div className="p-4 space-y-3">

              {/* ── פרטי קשר ── */}
              <SectionCard title="פרטי קשר">
                <div className="divide-y divide-gray-50">
                  <FieldPair>
                    <InlineField label="שם פרטי (אבא)" value={parent.firstName}   onSave={v => patch({ firstName: v })} />
                    <InlineField label="שם משפחה"       value={parent.lastName}    onSave={v => patch({ lastName: v })} />
                  </FieldPair>
                  <FieldPair>
                    <InlineField label="שם האמא"    value={parent.motherName}  onSave={v => patch({ motherName: v })} />
                    <InlineField label='ת"ז'         value={parent.idNumber}    onSave={v => patch({ idNumber: v })} />
                  </FieldPair>
                  <FieldPair>
                    <InlineField label="תאריך לידה" value={parent.birthDate ?? ''} onSave={v => patch({ birthDate: v })} type="date" />
                    <div className="flex flex-col gap-0.5 py-2 px-3">
                      <span className="text-[10px] text-gray-400 uppercase tracking-wide">גיל</span>
                      <span className="text-sm font-medium text-gray-700">
                        {computeAge(parent.birthDate ?? '') || '—'}
                      </span>
                    </div>
                  </FieldPair>
                  <FieldPair>
                    <InlineField label="טלפון אבא"  value={parent.fatherPhone} onSave={v => patch({ fatherPhone: v })} type="tel" />
                    <InlineField label="טלפון אמא"  value={parent.motherPhone} onSave={v => patch({ motherPhone: v })} type="tel" />
                  </FieldPair>
                  <FieldPair>
                    <InlineField label="טלפון בית"  value={parent.homePhone}   onSave={v => patch({ homePhone: v })} type="tel" />
                    <InlineField label="טלפון נוסף" value={parent.extraPhone}  onSave={v => patch({ extraPhone: v })} type="tel" />
                  </FieldPair>
                  <FieldPair>
                    <InlineField label="מייל" value={parent.email} onSave={v => patch({ email: v })} type="email" />
                    <InlineField label="כינוי" value={parent.nickname} onSave={v => patch({ nickname: v })} />
                  </FieldPair>
                </div>
              </SectionCard>

              {/* ── פרטים אישיים ── */}
              <SectionCard title="פרטים אישיים">
                <div className="divide-y divide-gray-50">
                  <FieldPair>
                    <InlineField label="תואר אחרי"   value={parent.titleAfter}      onSave={v => patch({ titleAfter: v })} />
                    <InlineField label='ב"ר'          value={parent.benReb}          onSave={v => patch({ benReb: v })} />
                  </FieldPair>
                  <FieldPair>
                    <InlineField label="שם מוטב"     value={parent.beneficiaryName} onSave={v => patch({ beneficiaryName: v })} />
                    <InlineField label="מתפלל"        value={parent.synagogue}       onSave={v => patch({ synagogue: v })} />
                  </FieldPair>
                  {/* Wife link */}
                  <div className="px-4 py-2.5">
                    <WomanLinkField women={parent.women} parentId={parentId} onUpdate={load} />
                  </div>
                  {/* Role chips — read-only (managed in Airtable) */}
                  <div className="px-4 py-2.5">
                    <div className="text-[10px] font-medium text-gray-400 mb-1">תפקיד</div>
                    <div className="flex flex-wrap gap-1">
                      {parent.role.length > 0
                        ? parent.role.map(r => (
                          <span key={r} className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700">{r}</span>
                        ))
                        : <span className="text-gray-300 italic text-xs">לא הוזן</span>
                      }
                    </div>
                  </div>
                  {parent.teacherClassIds.length > 0 && (
                    <div className="px-4 py-2.5">
                      <div className="text-[10px] font-medium text-gray-400 mb-0.5">מלמד/מורה</div>
                      <div className="text-sm text-gray-700">{parent.teacherClassIds.length} כיתות</div>
                    </div>
                  )}
                </div>
              </SectionCard>

              {/* ── כתובת ── */}
              <SectionCard title="כתובת">
                <div className="divide-y divide-gray-50">
                  <FieldPair>
                    <InlineField label="עיר"        value={parent.city}     onSave={v => patch({ city: v })} />
                    <InlineField label="רחוב"       value={parent.address}  onSave={v => patch({ address: v })} />
                  </FieldPair>
                  <div className="px-4 py-2.5">
                    <InlineField label="בניין/דירה" value={parent.building} onSave={v => patch({ building: v })} />
                  </div>
                </div>
              </SectionCard>

              {/* ── פרטי בנק / הו"ק ── */}
              <SectionCard title='פרטי בנק / הו"ק'>
                <div className="divide-y divide-gray-50">
                  <FieldPair>
                    <InlineField label="בנק"          value={parent.bankName ?? ''}         onSave={v => patch({ bankName: v })} />
                    <InlineField label="סניף"         value={parent.bankBranch != null ? String(parent.bankBranch) : ''} onSave={v => patch({ bankBranch: v ? Number(v) : null })} type="number" />
                  </FieldPair>
                  <FieldPair>
                    <InlineField label="מספר חשבון"  value={parent.bankAccount != null ? String(parent.bankAccount) : ''} onSave={v => patch({ bankAccount: v ? Number(v) : null })} type="number" />
                    <InlineField label="תאריך חיוב"  value={parent.chargeDay != null ? String(parent.chargeDay) : ''}    onSave={v => patch({ chargeDay: v ? Number(v) : null })} type="number" />
                  </FieldPair>
                  <FieldPair>
                    <InlineField label='סוג הו"ק'    value={parent.standingOrderType ?? ''}  onSave={v => patch({ standingOrderType: v })} />
                    <InlineField label='מזהה הו"ק'   value={parent.standingOrderId != null ? String(parent.standingOrderId) : ''} onSave={v => patch({ standingOrderId: v ? Number(v) : null })} type="number" />
                  </FieldPair>
                </div>
              </SectionCard>

              <SectionCard title="הערות">
                <div className="p-4">
                  <InlineField label="" value={parent.notes} onSave={v => patch({ notes: v })} multiline />
                </div>
              </SectionCard>
            </div>
          )}

          {/* ── CHILDREN TAB ── */}
          {parent && tab === 'children' && (
            <div className="p-4 space-y-3">
              {parent.students.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">אין ילדים רשומים</p>
              ) : (
                parent.students.map(s => (
                  <div
                    key={s.id}
                    onClick={() => onOpenStudent?.(s.id)}
                    className={`bg-white border border-gray-200 rounded-xl p-4 transition-colors ${
                      onOpenStudent ? 'cursor-pointer hover:border-[#1a3a7a] hover:bg-blue-50/30' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-1.5">
                        {s.status && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.status === 'פעיל' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                          }`}>{s.status}</span>
                        )}
                        {s.framework && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            s.framework === 'בית חינוך לבנות' ? 'bg-pink-50 text-pink-700' : 'bg-blue-50 text-blue-700'
                          }`}>{s.framework}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{s.name}</p>
                        <span className="text-xs text-gray-400">
                          {s.gender === 'זכר' ? '👦' : s.gender === 'נקבה' ? '👧' : '🧒'}
                          {s.age ? ` גיל ${s.age}` : ''}
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      {(s.classDepartment || s.className) && (
                        <div className="text-right col-span-2">
                          <div className="text-[10px] text-gray-400">כיתה / אגף</div>
                          <div className="font-medium text-gray-700">{s.classDepartment || s.className}</div>
                        </div>
                      )}
                      {s.transportation.length > 0 && (
                        <div className="text-right">
                          <div className="text-[10px] text-gray-400">הסעה</div>
                          <div className="font-medium text-gray-700">
                            {s.transportation.join(', ')}
                            {s.transportationCost > 0 && <span className="text-gray-400"> ({fmt(s.transportationCost)})</span>}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* ── PAYMENTS TAB ── */}
          {parent && tab === 'payments' && (
            <div className="p-4 space-y-4">
              {/* Summary chips */}
              <div className="grid grid-cols-3 gap-2">
                <SummaryNum label="חוב פתוח כולל" value={fmt(totalDebt)}       color="text-red-600"     bg="bg-red-50" />
                <SummaryNum label="שולם החודש"     value={fmt(paidThisMonth)}   color="text-emerald-700" bg="bg-emerald-50" />
                <SummaryNum label="נותר לחודש"     value={fmt(remainThisMonth)} color="text-amber-600"   bg="bg-amber-50" />
              </div>

              {/* Overdue banner */}
              {overdueTotal > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                  <p className="text-xs text-red-500 mb-0.5">סכום באיחור תשלום</p>
                  <p className="text-3xl font-bold text-red-700">{fmt(overdueTotal)}</p>
                  <p className="text-xs text-red-400 mt-1">{overduePPs.length} תשלומים שעברו תאריך</p>
                </div>
              )}

              {/* Credit badge */}
              {(parent.ppCredit ?? 0) > 0 && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <span className="text-emerald-600 text-lg">💚</span>
                  <div>
                    <p className="text-xs text-emerald-500">זיכוי שמור</p>
                    <p className="text-sm font-bold text-emerald-700">{fmt(parent.ppCredit)} יוחלו על התשלום הבא</p>
                  </div>
                </div>
              )}

              {/* Two-panel: pending | paid */}
              {tuitionPPs_all.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-6">אין תשלומים מתוכננים</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {/* Right: pending/overdue */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      ממתין ({overduePPs.length + pendingPPs.length})
                    </h4>
                    <div className="space-y-1.5">
                      {[...overduePPs, ...pendingPPs].map(pp => (
                        <button key={pp.id} onClick={() => setSelectedPP(pp)}
                          className={`w-full text-right rounded-xl p-3 border transition-all hover:shadow-sm active:scale-95 ${
                            isOverdue(pp)
                              ? 'bg-red-50 border-red-200 hover:border-red-400'
                              : 'bg-white border-gray-200 hover:border-indigo-300'
                          }`}>
                          <div className="flex justify-between items-center">
                            <span className={`text-sm font-bold ${isOverdue(pp) ? 'text-red-600' : 'text-amber-600'}`}>
                              {fmt(pp.balance)}
                            </span>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">{pp.monthYear || pp.date}</p>
                              {pp.monthYear && hebrewMonth(pp.monthYear) && (
                                <p className="text-[10px] text-gray-400">{hebrewMonth(pp.monthYear)}</p>
                              )}
                            </div>
                          </div>
                          {pp.name && <p className="text-xs text-gray-400 mt-0.5 truncate">{pp.name}</p>}
                          {isOverdue(pp) && <p className="text-xs text-red-400 mt-0.5">⚠ באיחור</p>}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Left: paid */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                      שולם ({paidPPs.length})
                    </h4>
                    <div className="space-y-1.5">
                      {paidPPs.map(pp => (
                        <button key={pp.id} onClick={() => setSelectedPP(pp)}
                          className="w-full text-right rounded-xl p-3 border border-emerald-100 bg-emerald-50 hover:border-emerald-300 transition-all hover:shadow-sm active:scale-95">
                          <div className="flex justify-between items-center">
                            <span className="text-sm font-bold text-emerald-600">✓ {fmt(pp.amount)}</span>
                            <div className="text-right">
                              <p className="text-xs text-gray-500">{pp.monthYear || pp.date}</p>
                              {pp.monthYear && hebrewMonth(pp.monthYear) && (
                                <p className="text-[10px] text-gray-400">{hebrewMonth(pp.monthYear)}</p>
                              )}
                            </div>
                          </div>
                          {pp.name && <p className="text-xs text-gray-400 mt-0.5 truncate">{pp.name}</p>}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Transactions */}
              {transactions.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-600 bg-gray-50 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{transactions.length} תנועות</span>
                    <span>תנועות כספיות</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-right text-xs text-gray-400 border-b border-gray-100">
                        <th className="px-3 py-2">תאריך</th>
                        <th className="px-3 py-2">סוג</th>
                        <th className="px-3 py-2 text-left">סכום</th>
                        <th className="px-3 py-2">הערות</th>
                        <th className="px-3 py-2">קטגוריה</th>
                        <th className="px-3 py-2" />
                      </tr>
                    </thead>
                    <tbody>
                      {transactions.map(tx => (
                        <TransactionRow
                          key={tx.id}
                          tx={tx}
                          onUpdate={updated => setTransactions(prev => prev.map(t => t.id === updated.id ? updated : t))}
                          onDelete={id => setTransactions(prev => prev.filter(t => t.id !== id))}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SALARY TAB ── */}
          {parent && tab === 'salary' && (
            <div className="p-4">
              {/* Sub-tabs */}
              <div className="flex gap-0.5 mb-4 border-b border-gray-200">
                {(['summary', 'settings', 'women'] as const).map(st => (
                  <button key={st} onClick={() => setSalarySubTab(st)}
                    className={`py-2 px-3 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                      salarySubTab === st
                        ? 'border-[#1a3a7a] text-[#1a3a7a]'
                        : 'border-transparent text-gray-500 hover:text-gray-700'
                    }`}>
                    {st === 'summary' ? 'סיכום'
                      : st === 'settings' ? '⚙ הגדרות'
                      : `👩 נשים${parent.women?.length ? ` (${parent.women.length})` : ''}`}
                  </button>
                ))}
              </div>

              {/* ── סיכום ── */}
              {salarySubTab === 'summary' && (
                <div className="space-y-4">
                  {parent.salaryGross > 0 || parent.baseHourlyRate > 0 ? (
                    <>
                      <div className="bg-indigo-50 rounded-xl p-4">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-2xl font-bold text-indigo-800">{fmt(parent.salaryGross)}</span>
                          <span className="text-sm text-gray-500">ברוטו</span>
                        </div>
                        {parent.deductTuition && (
                          <div className="border-t border-indigo-200 pt-2 mt-2 space-y-1">
                            <div className="flex justify-between text-sm">
                              <span className="text-red-500">− {fmt(parent.tuitionBalance > 0 ? parent.tuitionBalance : 0)}</span>
                              <span className="text-gray-400">קיזוז שכ"ל</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-xl font-bold text-emerald-700">{fmt(parent.salaryNet)}</span>
                              <span className="text-sm text-gray-600">לתשלום</span>
                            </div>
                          </div>
                        )}
                        {!parent.deductTuition && (
                          <p className="text-xs text-gray-400 mt-1">ללא קיזוז שכר לימוד</p>
                        )}
                      </div>

                      {/* Family total if has women */}
                      {parent.women && parent.women.length > 0 && (
                        <div className="bg-purple-50 rounded-xl p-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="font-semibold">{fmt(parent.salaryGross)}</span>
                            <span className="text-purple-600 font-medium">בעל</span>
                          </div>
                          {parent.women.map(w => (
                            <div key={w.id} className="flex justify-between text-sm mb-1">
                              <span className="font-semibold">{fmt(w.salaryGross)}</span>
                              <span className="text-purple-500">{w.name?.split(' ').slice(-1)[0]}</span>
                            </div>
                          ))}
                          <div className="border-t border-purple-200 mt-2 pt-2 flex justify-between font-bold text-sm">
                            <span className="text-purple-800">
                              {fmt(parent.salaryGross + parent.women.reduce((s, w) => s + w.salaryGross, 0))}
                            </span>
                            <span className="text-purple-600">סה&quot;כ משפחתי</span>
                          </div>
                        </div>
                      )}

                      <SectionCard title="פירוט">
                        <div className="p-4 space-y-2">
                          {parent.baseHourlyRate > 0 && (
                            <DetailRow label="שכר בסיס לשעה" value={`${fmt(parent.baseHourlyRate)} × ${parent.monthlyHoursDecimal} ש'`} />
                          )}
                          {parent.seniorityBonusHourly > 0 && (
                            <DetailRow label="ותק לשעה" value={`${fmt(parent.seniorityBonusHourly)} × ${parent.monthlyHoursDecimal} ש'`} />
                          )}
                          {parent.fixedBonus > 0 && (
                            <DetailRow label="תוספת קבועה" value={fmt(parent.fixedBonus)} />
                          )}
                          {parent.transportReimbursement > 0 && (
                            <DetailRow label="הסעות" value={fmt(parent.transportReimbursement)} />
                          )}
                          {parent.exceptionalExpenses > 0 && (
                            <DetailRow label="הוצאות חריגות" value={`− ${fmt(parent.exceptionalExpenses)}`} />
                          )}
                        </div>
                      </SectionCard>

                      {/* ── תשלומים מתוכננים של משכורת ── */}
                      {salaryPPs_all.length > 0 && (() => {
                        const salaryOverdue  = salaryPPs_all.filter(isOverdue)
                        const salaryPending  = salaryPPs_all.filter(pp => !isOverdue(pp) && pp.balance > 0)
                        const salaryPaid     = salaryPPs_all.filter(pp => pp.balance <= 0)
                        return (
                          <SectionCard title="תשלומים מתוכננים - משכורת">
                            <div className="divide-y divide-gray-50">
                              {[...salaryOverdue, ...salaryPending].map(pp => (
                                <button key={pp.id} onClick={() => setSelectedPP(pp)}
                                  className={`w-full text-right flex justify-between items-center px-4 py-2.5 hover:bg-gray-50 transition-colors ${isOverdue(pp) ? 'bg-red-50' : ''}`}>
                                  <span className={`text-sm font-bold ${isOverdue(pp) ? 'text-red-600' : 'text-amber-600'}`}>{fmt(pp.balance)}</span>
                                  <div className="text-right">
                                    <p className="text-xs text-gray-500">{pp.monthYear}</p>
                                    {isOverdue(pp) && <p className="text-[10px] text-red-400">⚠ באיחור</p>}
                                  </div>
                                </button>
                              ))}
                              {salaryPaid.map(pp => (
                                <button key={pp.id} onClick={() => setSelectedPP(pp)}
                                  className="w-full text-right flex justify-between items-center px-4 py-2.5 hover:bg-emerald-50 transition-colors">
                                  <span className="text-sm font-bold text-emerald-600">✓ {fmt(pp.amount)}</span>
                                  <p className="text-xs text-gray-500">{pp.monthYear}</p>
                                </button>
                              ))}
                              {salaryOverdue.length === 0 && salaryPending.length === 0 && salaryPaid.length === 0 && (
                                <p className="text-xs text-gray-400 text-center py-3">אין תשלומים</p>
                              )}
                            </div>
                          </SectionCard>
                        )
                      })()}

                      {/* ── תשלומים ששולמו ── */}
                      {(() => {
                        const salaryTxs = transactions.filter(t =>
                          (t.projectNames ?? []).includes('משכורת') ||
                          t.type === 'קיזוז משכר לימוד' ||
                          t.type === 'קיזוז ממשכורת'
                        )
                        if (salaryTxs.length === 0) return null
                        const months = [...new Set(salaryTxs.map(t => t.monthYear).filter(Boolean))].sort().reverse()
                        return (
                          <SectionCard title="תשלומי משכורת ששולמו">
                            <div className="divide-y divide-gray-100">
                              {months.map(my => {
                                const mTxs = salaryTxs.filter(t => t.monthYear === my)
                                const total = mTxs.filter(t => t.type !== 'קיזוז משכר לימוד' && t.type !== 'קיזוז ממשכורת')
                                  .reduce((s, t) => s + Math.abs(t.amount), 0)
                                return (
                                  <div key={my} className="px-4 py-2.5">
                                    <div className="flex justify-between items-center mb-1.5">
                                      <span className="text-xs font-bold text-emerald-700">{total > 0 ? fmt(total) : ''}</span>
                                      <span className="text-xs font-semibold text-gray-500">{my}</span>
                                    </div>
                                    <div className="space-y-1">
                                      {mTxs.map(t => {
                                        const isOffset = t.type === 'קיזוז משכר לימוד' || t.type === 'קיזוז ממשכורת'
                                        return (
                                          <div key={t.id} className="flex justify-between items-center text-sm">
                                            <span className={`tabular-nums font-semibold ${isOffset ? 'text-red-500' : 'text-emerald-700'}`}>
                                              {isOffset ? '− ' : ''}{fmt(Math.abs(t.amount))}
                                            </span>
                                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${isOffset ? 'bg-red-50 text-red-600' : 'bg-indigo-50 text-indigo-700'}`}>
                                              {t.type || 'משכורת'}
                                            </span>
                                          </div>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </SectionCard>
                        )
                      })()}
                    </>
                  ) : (
                    <p className="text-center text-gray-400 text-sm py-8">אין נתוני משכורת</p>
                  )}
                </div>
              )}

              {/* ── הגדרות ── */}
              {salarySubTab === 'settings' && (
                <div className="space-y-4">
                  {!editingSettings ? (
                    <>
                      <SectionCard title="הגדרות שכר">
                        <div className="p-4 space-y-2">
                          <DetailRow label="שכר בסיס לשעה"   value={parent.baseHourlyRate > 0 ? fmt(parent.baseHourlyRate) : '—'} />
                          <DetailRow label="תוספת ותק לשעה"  value={parent.seniorityBonusHourly > 0 ? fmt(parent.seniorityBonusHourly) : '—'} />
                          <DetailRow label="שעות חודשיות"    value={parent.monthlyHoursDecimal > 0 ? `${parent.monthlyHoursDecimal}` : '—'} />
                          <DetailRow label="תוספת קבועה"     value={parent.fixedBonus > 0 ? fmt(parent.fixedBonus) : '—'} />
                          <DetailRow label="תשלום הסעות"     value={parent.transportReimbursement > 0 ? fmt(parent.transportReimbursement) : '—'} />
                          <DetailRow label="הוצאות חריגות"   value={parent.exceptionalExpenses > 0 ? fmt(parent.exceptionalExpenses) : '—'} />
                        </div>
                      </SectionCard>
                      <SectionCard title="קיזוזים">
                        <div className="p-4 space-y-2">
                          <div className="flex justify-between items-center text-sm">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${parent.deductTuition ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-400'}`}>
                              {parent.deductTuition ? '✓ מקזז שכ"ל' : 'לא מקזז'}
                            </span>
                            <span className="text-gray-400">קיזוז שכר לימוד</span>
                          </div>
                          <div className="flex justify-between items-center text-sm">
                            <span className={`px-2 py-0.5 rounded-full text-xs ${parent.showSpouseSalary ? 'bg-purple-100 text-purple-700' : 'bg-gray-100 text-gray-400'}`}>
                              {parent.showSpouseSalary ? '✓ כולל בן זוג' : 'ללא בן זוג'}
                            </span>
                            <span className="text-gray-400">הצגת משכורת בן זוג</span>
                          </div>
                        </div>
                      </SectionCard>
                      <button
                        onClick={() => {
                          setSettingsDraft({
                            baseHourlyRate: parent.baseHourlyRate,
                            seniorityBonusHourly: parent.seniorityBonusHourly,
                            monthlyHoursDecimal: parent.monthlyHoursDecimal,
                            fixedBonus: parent.fixedBonus,
                            exceptionalExpenses: parent.exceptionalExpenses,
                            transportReimbursement: parent.transportReimbursement,
                            deductTuition: parent.deductTuition,
                            showSpouseSalary: parent.showSpouseSalary,
                          })
                          setEditingSettings(true)
                        }}
                        className="w-full py-2 rounded-xl border border-[#1a3a7a]/30 text-[#1a3a7a] text-sm font-medium hover:bg-indigo-50 transition-colors"
                      >
                        ✏ ערוך הגדרות
                      </button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <h4 className="font-semibold text-gray-700 text-sm">עריכת הגדרות שכר</h4>
                      {([
                        { key: 'baseHourlyRate', label: 'שכר בסיס לשעה ₪' },
                        { key: 'seniorityBonusHourly', label: 'תוספת ותק לשעה ₪' },
                        { key: 'monthlyHoursDecimal', label: 'שעות חודשיות' },
                        { key: 'fixedBonus', label: 'תוספת קבועה ₪' },
                        { key: 'exceptionalExpenses', label: 'הוצאות חריגות ₪' },
                        { key: 'transportReimbursement', label: 'תשלום הסעות ₪' },
                      ] as const).map(({ key, label }) => (
                        <div key={key}>
                          <label className="block text-xs text-gray-500 mb-1">{label}</label>
                          <input
                            type="number"
                            value={String(settingsDraft[key] ?? '')}
                            onChange={e => setSettingsDraft(d => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))}
                            className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
                          />
                        </div>
                      ))}
                      <div className="flex gap-4 items-center pt-1">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={!!settingsDraft.deductTuition}
                            onChange={e => setSettingsDraft(d => ({ ...d, deductTuition: e.target.checked }))}
                            className="w-4 h-4 accent-[#1a3a7a]" />
                          קיזוז שכר לימוד
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input type="checkbox" checked={!!settingsDraft.showSpouseSalary}
                            onChange={e => setSettingsDraft(d => ({ ...d, showSpouseSalary: e.target.checked }))}
                            className="w-4 h-4 accent-[#1a3a7a]" />
                          כולל בן זוג
                        </label>
                      </div>
                      <div className="flex gap-2 pt-2">
                        <button onClick={() => setEditingSettings(false)}
                          className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                          ביטול
                        </button>
                        <button
                          disabled={savingSettings}
                          onClick={async () => {
                            setSavingSettings(true)
                            try {
                              await patch(settingsDraft)
                              setEditingSettings(false)
                            } finally { setSavingSettings(false) }
                          }}
                          className="flex-1 py-2 rounded-xl bg-[#1a3a7a] text-white text-sm font-medium disabled:opacity-60 hover:bg-[#0d1f52]"
                        >
                          {savingSettings ? 'שומר...' : 'שמור'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* ── נשים ── */}
              {salarySubTab === 'women' && (
                <div className="space-y-3">
                  {(!parent.women || parent.women.length === 0) ? (
                    <p className="text-center text-gray-400 text-sm py-8">אין נשים מקושרות</p>
                  ) : (
                    parent.women.map((w: WomanDetail) => (
                      <div key={w.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        {/* Woman header */}
                        <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-100">
                          <button
                            onClick={() => {
                              if (editingWoman === w.id) { setEditingWoman(null) }
                              else {
                                setWomanDraft({
                                  salaryGross: w.salaryGross,
                                  baseHourlyRate: w.baseHourlyRate,
                                  fixedBonus: w.fixedBonus,
                                  monthlyHoursDecimal: w.monthlyHoursDecimal,
                                  exceptionalExpenses: w.exceptionalExpenses,
                                })
                                setEditingWoman(w.id)
                              }
                            }}
                            className="text-xs text-[#1a3a7a] hover:text-[#0d1f52] font-medium"
                          >
                            {editingWoman === w.id ? 'ביטול' : '✏ ערוך'}
                          </button>
                          <div className="text-right">
                            <p className="font-semibold text-gray-800">{w.name}</p>
                            <div className="flex gap-1 justify-end mt-0.5">
                              {w.role.map(r => (
                                <span key={r} className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-600 rounded-full">{r}</span>
                              ))}
                              {w.status && <span className="text-xs text-gray-400">{w.status}</span>}
                            </div>
                          </div>
                        </div>

                        {/* View mode */}
                        {editingWoman !== w.id && (
                          <div className="px-4 py-3 space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-xl font-bold text-[#1a3a7a]">{fmt(w.salaryGross)}</span>
                              <span className="text-xs text-gray-400">סה&quot;כ לתשלום</span>
                            </div>
                            {w.baseHourlyRate > 0 && (
                              <p className="text-xs text-gray-500">
                                {fmt(w.baseHourlyRate)}/שעה × {w.monthlyHoursDecimal} ש'
                                {w.fixedBonus > 0 ? ` + ${fmt(w.fixedBonus)} קבועה` : ''}
                              </p>
                            )}
                            {w.notes && (
                              <p className="text-xs text-gray-400 italic">{w.notes}</p>
                            )}
                          </div>
                        )}

                        {/* Edit mode */}
                        {editingWoman === w.id && (
                          <div className="px-4 py-3 space-y-3">
                            {([
                              { key: 'salaryGross', label: 'סה"כ לתשלום ₪' },
                              { key: 'baseHourlyRate', label: 'שכר בסיס לשעה ₪' },
                              { key: 'fixedBonus', label: 'תוספת קבועה ₪' },
                              { key: 'monthlyHoursDecimal', label: 'שעות חודשיות' },
                              { key: 'exceptionalExpenses', label: 'הוצאות חריגות ₪' },
                            ] as const).map(({ key, label }) => (
                              <div key={key}>
                                <label className="block text-xs text-gray-500 mb-1">{label}</label>
                                <input
                                  type="number"
                                  value={String(womanDraft[key] ?? '')}
                                  onChange={e => setWomanDraft(d => ({ ...d, [key]: parseFloat(e.target.value) || 0 }))}
                                  className="w-full px-3 py-1.5 rounded-lg border border-gray-200 text-sm text-left focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
                                />
                              </div>
                            ))}
                            <div className="flex gap-2">
                              <button onClick={() => setEditingWoman(null)}
                                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                                ביטול
                              </button>
                              <button
                                disabled={savingWoman}
                                onClick={async () => {
                                  setSavingWoman(true)
                                  try {
                                    await patchWoman(w.id, womanDraft)
                                    setEditingWoman(null)
                                    load()
                                  } finally { setSavingWoman(false) }
                                }}
                                className="flex-1 py-2 rounded-xl bg-[#1a3a7a] text-white text-sm font-medium disabled:opacity-60 hover:bg-[#0d1f52]"
                              >
                                {savingWoman ? 'שומר...' : 'שמור'}
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Planned payment detail modal ── */}
      {selectedPP && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setSelectedPP(null) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => { setSelectedPP(null); setEditingPPAmount(false) }} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              <h3 className="font-bold text-gray-800 text-base">{selectedPP.name || 'תשלום מתוכנן'}</h3>
            </div>
            <div className="space-y-3 mb-5">
              <div className="flex justify-between items-center">
                {editingPPAmount ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="number"
                      className="w-28 border border-emerald-400 rounded-lg px-2 py-1 text-xl font-bold text-gray-800 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                      value={ppAmountDraft}
                      onChange={e => setPPAmountDraft(e.target.value)}
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          const newAmt = Number(ppAmountDraft)
                          if (!newAmt || newAmt <= 0) return
                          setSavingPPAmount(true)
                          fetch('/api/planned-payments', {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ id: selectedPP.id, amount: newAmt }),
                          })
                            .then(r => r.json())
                            .then(d => {
                              if (d.success) {
                                setSelectedPP(prev => prev ? { ...prev, amount: d.amount, balance: d.balance } : prev)
                                load()
                              }
                            })
                            .finally(() => { setSavingPPAmount(false); setEditingPPAmount(false) })
                        }
                        if (e.key === 'Escape') setEditingPPAmount(false)
                      }}
                    />
                    <button
                      disabled={savingPPAmount}
                      onClick={() => {
                        const newAmt = Number(ppAmountDraft)
                        if (!newAmt || newAmt <= 0) return
                        setSavingPPAmount(true)
                        fetch('/api/planned-payments', {
                          method: 'PATCH',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ id: selectedPP.id, amount: newAmt }),
                        })
                          .then(r => r.json())
                          .then(d => {
                            if (d.success) {
                              setSelectedPP(prev => prev ? { ...prev, amount: d.amount, balance: d.balance } : prev)
                              load()
                            }
                          })
                          .finally(() => { setSavingPPAmount(false); setEditingPPAmount(false) })
                      }}
                      className="text-emerald-600 hover:text-emerald-800 font-bold text-sm disabled:opacity-40"
                    >✓</button>
                    <button onClick={() => setEditingPPAmount(false)} className="text-gray-400 hover:text-gray-600 text-sm">✕</button>
                  </div>
                ) : (
                  <button
                    onClick={() => { setPPAmountDraft(String(selectedPP.amount)); setEditingPPAmount(true) }}
                    className="text-2xl font-bold text-gray-800 hover:text-emerald-700 transition-colors text-right"
                    title="לחץ לעריכה"
                  >
                    {fmt(selectedPP.amount)}
                  </button>
                )}
                <span className="text-xs text-gray-400 mr-2">סכום מתוכנן</span>
              </div>
              {(() => {
                const paid = selectedPP.amount - selectedPP.balance
                return (
                  <>
                    {paid > 0 && (
                      <div className="flex justify-between items-center bg-emerald-50 rounded-lg px-3 py-2">
                        <span className="text-base font-bold text-emerald-600">{fmt(paid)}</span>
                        <span className="text-xs text-emerald-500">שולם</span>
                      </div>
                    )}
                    {selectedPP.balance > 0 ? (
                      <div className="flex justify-between items-center bg-red-50 rounded-lg px-3 py-2">
                        <span className="text-lg font-bold text-red-600">{fmt(selectedPP.balance)}</span>
                        <span className="text-xs text-red-400">יתרה לתשלום</span>
                      </div>
                    ) : (
                      <div className="bg-emerald-50 rounded-lg px-3 py-2 text-center">
                        <span className="text-sm font-semibold text-emerald-600">✓ שולם במלואו</span>
                      </div>
                    )}
                  </>
                )
              })()}
              {selectedPP.date && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{fmtDate(selectedPP.date)}</span>
                  <span className="text-gray-400">תאריך</span>
                </div>
              )}
              {selectedPP.monthYear && (
                <div className="flex justify-between text-sm text-gray-600">
                  <span>{selectedPP.monthYear}</span>
                  <span className="text-gray-400">חודש</span>
                </div>
              )}
            </div>

            {/* ── Linked transactions ── */}
            <div className="border-t border-gray-100 pt-3 mb-4">
              <p className="text-xs font-semibold text-gray-500 mb-2">
                תשלומים ששולמו
                {loadingPpTx && <span className="text-gray-300 mr-1">...</span>}
              </p>
              {!loadingPpTx && ppTxList.length === 0 ? (
                <p className="text-xs text-gray-300 text-center py-1">אין תשלומים עדיין</p>
              ) : (
                <div className="space-y-1.5 max-h-44 overflow-y-auto">
                  {ppTxList.map(tx => (
                    <div key={tx.id} className={`flex items-center justify-between rounded-lg px-3 py-2 ${tx.isCredit ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                      {tx.isCredit ? (
                        /* Credit-transfer row — display only, no edit */
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-sm font-bold text-emerald-600">{fmt(Math.abs(tx.amount))}</span>
                          <span className="text-xs text-emerald-500">{tx.notes}</span>
                        </div>
                      ) : (
                        /* Clickable transaction row → opens TxDetailModal */
                        <button
                          className="flex items-center justify-between flex-1 text-right hover:bg-white/60 rounded-lg px-1 -mx-1 transition-colors"
                          onClick={() => setSelectedPpTx({
                            id:               tx.id,
                            amount:           Math.abs(tx.amount),
                            type:             tx.type,
                            date:             tx.date,
                            monthYear:        tx.monthYear,
                            notes:            tx.notes,
                            projectNames:     tx.projectNames,
                            parentIds:        tx.parentIds,
                            plannedPaymentId: selectedPP?.id ?? null,
                          })}
                        >
                          <div className="flex items-center gap-2">
                            {tx.type && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white text-gray-500 border border-gray-200">{tx.type}</span>}
                            {tx.date && <span className="text-xs text-gray-400">{fmtDate(tx.date)}</span>}
                          </div>
                          <span className="text-sm font-bold text-emerald-700">{fmt(Math.abs(tx.amount))}</span>
                        </button>
                      )}
                      {!tx.isCredit && (
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            if (!confirm('למחוק תשלום זה?')) return
                            const ppParam = selectedPP ? `?plannedPaymentId=${encodeURIComponent(selectedPP.id)}` : ''
                            fetch(`/api/transactions/${tx.id}${ppParam}`, { method: 'DELETE' })
                              .then(() => {
                                setPpTxList(prev => prev.filter(t => t.id !== tx.id))
                                load()
                              })
                          }}
                          className="p-1 text-gray-300 hover:text-red-400 text-xs mr-1 shrink-0"
                          title="מחיקה"
                        >🗑️</button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {selectedPP.balance > 0 && (
              <button
                onClick={() => {
                  setTxForPP(selectedPP)   // save data before closing
                  setSelectedPP(null)       // close PP modal first
                  setShowAddTxForPP(true)   // then open transaction modal (no z-index conflict)
                }}
                className="w-full py-2.5 rounded-xl bg-emerald-700 text-white font-semibold text-sm hover:bg-emerald-800 transition-colors"
              >
                + הוסף תשלום
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Generate-year result modal ── */}
      {yearGenResult && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setYearGenResult(null) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setYearGenResult(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              <h3 className="font-bold text-gray-800">יצירת תשלומים לשנה</h3>
            </div>

            {yearGenResult.created.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-semibold text-emerald-700 mb-2">
                  ✅ נוצרו {yearGenResult.created.length} תשלומים חדשים
                </p>
                <div className="space-y-1">
                  {yearGenResult.created.map(my => (
                    <div key={my} className="text-xs text-gray-600 bg-emerald-50 rounded px-2 py-1">
                      {fmtMonthYear(my)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {yearGenResult.skipped.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-gray-500 mb-2">
                  ⏭️ {yearGenResult.skipped.length} קיימים כבר
                </p>
                <div className="space-y-1">
                  {yearGenResult.skipped.map(my => (
                    <div key={my} className="text-xs text-gray-400 bg-gray-50 rounded px-2 py-1">
                      {fmtMonthYear(my)}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {yearGenResult.created.length === 0 && yearGenResult.skipped.length === 0 && (
              <p className="text-sm text-gray-500 text-center py-2">אין חודשים ליצירה</p>
            )}

            <button
              onClick={() => setYearGenResult(null)}
              className="mt-4 w-full py-2 rounded-xl bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 transition-colors"
            >סגור</button>
          </div>
        </div>
      )}

      {/* ── Transaction detail modal (from PP list) ── */}
      {selectedPpTx && (
        <TxDetailModal
          tx={selectedPpTx}
          onClose={() => setSelectedPpTx(null)}
          onSaved={updated => {
            setPpTxList(prev => prev.map(t =>
              t.id === updated.id
                ? { ...t, amount: updated.amount, type: updated.type, date: updated.date, monthYear: updated.monthYear, notes: updated.notes, projectNames: updated.projectNames }
                : t
            ))
            setSelectedPpTx(null)
            load()
          }}
        />
      )}

      {/* ── Salary detail modal ── */}
      {showSalaryDetail && parent && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={e => { if (e.target === e.currentTarget) setShowSalaryDetail(false) }}>
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs p-5" dir="rtl">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => setShowSalaryDetail(false)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              <h3 className="font-bold text-gray-800">פירוט משכורת משפחתי</h3>
            </div>
            <div className="space-y-2">
              <div className="flex justify-between items-center text-sm py-1">
                <span className="font-semibold text-gray-800">{fmt(parent.salaryGross)}</span>
                <span className="text-gray-500">בעל</span>
              </div>
              {(parent.women ?? []).map(w => (
                <div key={w.id} className="flex justify-between items-center text-sm py-1">
                  <span className="font-semibold text-gray-800">{fmt(w.salaryGross)}</span>
                  <span className="text-gray-500">{w.name}</span>
                </div>
              ))}
              <div className="border-t border-gray-200 pt-3 mt-2 flex justify-between items-center">
                <span className="text-lg font-bold text-purple-800">
                  {fmt(parent.salaryGross + (parent.women ?? []).reduce((s, w) => s + (w.salaryGross ?? 0), 0))}
                </span>
                <span className="text-sm text-purple-600 font-semibold">סה&quot;כ</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showAddTx && parent && (
        <AddTransactionModal
          parentId={parentId}
          parentName={parent.name}
          onClose={() => setShowAddTx(false)}
          onSuccess={() => { setShowAddTx(false); load() }}
        />
      )}
      {showAddTxForPP && txForPP && (
        <AddTransactionModal
          fixedLabel="בנין לדורות"
          sourceLabel={txForPP.name}
          prefilledAmount={txForPP.balance}
          plannedPaymentId={txForPP.id}
          parentId={parentId}
          preselectedProject="בניין לדורות"
          onClose={() => { setShowAddTxForPP(false); setTxForPP(null) }}
          onSuccess={() => { setShowAddTxForPP(false); setTxForPP(null); load() }}
        />
      )}
      {showAddPlanned && parent && (
        <AddPlannedPaymentModal
          parentId={parentId}
          parentName={parent.name}
          onClose={() => setShowAddPlanned(false)}
          onSuccess={() => { setShowAddPlanned(false); load() }}
        />
      )}
    </div>
  )
}

/* ─── sub-components ──────────────────────────────────── */
function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
        {title}
      </div>
      {children}
    </div>
  )
}

/* Two-column pair inside a section, each col right-aligned */
function FieldPair({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 px-4 py-2.5">
      {children}
    </div>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-center text-sm">
      <span className="font-medium text-gray-800">{value}</span>
      <span className="text-gray-400">{label}</span>
    </div>
  )
}

function SummaryNum({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-3 text-center`}>
      <p className={`text-base font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-gray-500 mt-0.5 leading-tight">{label}</p>
    </div>
  )
}
