'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ParentDetail, TransactionItem } from '@/lib/types'
import { TransactionRow } from '@/components/TransactionCard'

/* ─── helpers ──────────────────────────────────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

function fmtDate(d: string) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('he-IL').format(new Date(d))
}

/* ─── FinancialBreakdown ────────────────────────────── */
function FinancialBreakdown({
  parent,
  onClose,
}: {
  parent: ParentDetail
  onClose: () => void
}) {
  const tuitionPerChild = parent.childrenCount <= 3 ? 500 : 450
  const calculatedTuition = parent.childrenCount * tuitionPerChild
  const transportTotal = parent.students.reduce((s, st) => s + (st.transportationCost ?? 0), 0)
  const grandTotal = calculatedTuition + transportTotal

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] overflow-y-auto"
        dir="rtl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 sticky top-0 bg-white rounded-t-2xl z-10">
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 text-lg leading-none">✕</button>
          <h2 className="text-lg font-bold text-gray-800">פירוט כספי — {parent.name}</h2>
        </div>

        <div className="p-4 space-y-3">
          {/* Children */}
          <div className="bg-blue-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-lg">👨‍👩‍👧‍👦</span>
              <span className="font-semibold text-gray-800">ילדים ({parent.childrenCount})</span>
            </div>
            {parent.students.length > 0 ? (
              <ul className="space-y-1 pr-2">
                {parent.students.map(s => (
                  <li key={s.id} className="text-sm text-gray-700 flex items-center justify-between">
                    <span className="text-xs text-gray-400">{s.className || ''}</span>
                    <span>{s.name}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 pr-2">אין מידע על ילדים</p>
            )}
          </div>

          {/* Transport */}
          <div className="bg-emerald-50 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <span className="text-lg">🚌</span>
              <span className="font-semibold text-gray-800">הסעות</span>
            </div>
            {parent.students.some(s => s.transportation.length > 0) ? (
              <ul className="space-y-2 pr-2">
                {parent.students.map(s => (
                  <li key={s.id} className="text-sm text-gray-700">
                    <span className="font-medium">{s.name}:</span>{' '}
                    {s.transportation.length > 0 ? s.transportation.join(', ') : 'ללא הסעות'}
                    {s.transportationCost > 0 && (
                      <span className="text-gray-500 mr-1">({fmt(s.transportationCost)})</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-gray-400 pr-2">ללא הסעות</p>
            )}
            {transportTotal > 0 && (
              <div className="mt-2.5 pt-2 border-t border-emerald-100 text-sm font-semibold text-emerald-700 flex justify-between">
                <span>{fmt(transportTotal)}</span>
                <span>סה"כ הסעות</span>
              </div>
            )}
          </div>

          {/* Tuition calculation */}
          <div className="bg-amber-50 rounded-xl p-4">
            <div className="font-semibold text-gray-800 mb-2">חישוב שכר לימוד</div>
            <div className="text-sm text-gray-700 font-mono bg-white/60 rounded-lg px-3 py-2 text-left" dir="ltr">
              {parent.childrenCount} × {tuitionPerChild.toLocaleString('he-IL')} ₪ = {calculatedTuition.toLocaleString('he-IL')} ₪
            </div>
            <div className="text-xs text-gray-400 mt-1.5 text-right">
              {parent.childrenCount <= 3 ? 'עד 3 ילדים: 500 ₪ לתלמיד' : 'מעל 3 ילדים: 450 ₪ לתלמיד'}
            </div>
          </div>

          {/* Grand total */}
          <div className="bg-indigo-50 rounded-xl p-4">
            <div className="font-semibold text-gray-800 mb-2">סה"כ לתשלום</div>
            <div className="text-sm text-gray-700 font-mono bg-white/60 rounded-lg px-3 py-2 text-left space-y-1" dir="ltr">
              <div>{calculatedTuition.toLocaleString('he-IL')} ₪ (שכ"ל)</div>
              {transportTotal > 0 && <div>+ {transportTotal.toLocaleString('he-IL')} ₪ (הסעות)</div>}
              <div className="border-t border-indigo-100 pt-1 font-bold text-indigo-800">
                = {grandTotal.toLocaleString('he-IL')} ₪
              </div>
            </div>
          </div>

          {/* Actual balance from DB */}
          {parent.tuitionBalance !== 0 && (
            <div className={`rounded-xl p-4 ${parent.tuitionBalance < 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
              <div className="flex items-center justify-between">
                <span className={`text-xl font-bold tabular-nums ${parent.tuitionBalance < 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {fmt(Math.abs(parent.tuitionBalance))}
                </span>
                <span className="text-sm font-medium text-gray-600">
                  {parent.tuitionBalance < 0 ? 'חוב פתוח נוכחי' : 'זכות נוכחית'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function toHebrewDate(d: string) {
  if (!d) return ''
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(d))
  } catch { return '' }
}

/* ─── InlineField ───────────────────────────────────── */
interface IFProps {
  label: string
  value: string
  onSave: (v: string) => Promise<void>
  type?: 'text' | 'email' | 'tel'
  dir?: 'rtl' | 'ltr'
  multiline?: boolean
}
function InlineField({ label, value, onSave, type = 'text', dir = 'rtl', multiline }: IFProps) {
  const [editing, setEditing] = useState(false)
  const [val, setVal] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => { setVal(value) }, [value])
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const save = async () => {
    setEditing(false)
    if (val.trim() === (value ?? '').trim()) return
    setSaving(true)
    try { await onSave(val.trim()) } finally { setSaving(false) }
  }

  const sharedProps = {
    ref,
    value: val,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setVal(e.target.value),
    onBlur: save,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) save()
      if (e.key === 'Escape') { setVal(value); setEditing(false) }
    },
    dir,
    className: 'w-full px-2 py-1 text-sm border-b-2 border-[#1a3a7a] bg-transparent outline-none text-right',
  }

  return (
    <div className="group">
      <div className="text-[10px] text-gray-400 mb-0.5 text-right">{label}</div>
      {editing ? (
        multiline
          ? <textarea rows={3} {...sharedProps} />
          : <input type={type} {...sharedProps} />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="text-sm text-gray-800 hover:text-[#1a3a7a] text-right w-full flex items-center gap-1 justify-end"
          title="לחץ לעריכה"
        >
          <span className="opacity-0 group-hover:opacity-60 text-gray-300 text-xs">✏</span>
          {saving
            ? <span className="text-xs text-gray-400">שומר...</span>
            : <span>{val || <span className="text-gray-300 italic text-xs">לא הוזן</span>}</span>
          }
        </button>
      )}
    </div>
  )
}

/* ─── props ─────────────────────────────────────────── */
interface Props {
  parentId: string
  onClose: () => void
  onOpenStudent?: (studentId: string) => void
  onOpenPayment?: (paymentId: string) => void
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

type TabKey = 'details' | 'children' | 'payments'

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT — side panel (not modal)
═══════════════════════════════════════════════════════ */
export default function EmployeeCard({ parentId, onClose, onOpenStudent, onOpenPayment }: Props) {
  const [parent, setParent] = useState<ParentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabKey>('details')
  const [monthFilter, setMonthFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [transactions, setTransactions] = useState<TransactionItem[]>([])
  const [showBreakdown, setShowBreakdown] = useState(false)

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
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const patch = useCallback(async (fields: Record<string, unknown>) => {
    await fetch(`/api/parents/${parentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    setParent(prev => prev ? { ...prev, ...fields } as ParentDetail : prev)
  }, [parentId])

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details',  label: 'פרטים' },
    ...(parent && parent.students.length > 0        ? [{ key: 'children' as TabKey, label: `ילדים (${parent.students.length})` }] : []),
    ...(parent && parent.plannedPayments.length > 0 ? [{ key: 'payments' as TabKey, label: 'תשלומים' }] : []),
  ]

  const allMonths = [...new Set(parent?.plannedPayments.map(p => p.monthYear).filter(Boolean) ?? [])]
  const filteredPayments = (parent?.plannedPayments ?? []).filter(p => {
    if (monthFilter && p.monthYear !== monthFilter) return false
    if (statusFilter) {
      const s = p.balance <= 0 ? 'שולם' : (p.amount - p.balance) > 0 ? 'חלקי' : 'פתוח'
      if (s !== statusFilter) return false
    }
    return true
  })

  const totalDebt       = (parent?.plannedPayments ?? []).reduce((s, p) => s + Math.max(0, p.balance), 0)
  const currentMonth    = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
  const thisMonthPP     = (parent?.plannedPayments ?? []).filter(p => p.monthYear === currentMonth)
  const paidThisMonth   = thisMonthPP.reduce((s, p) => s + Math.max(0, p.amount - p.balance), 0)
  const remainThisMonth = thisMonthPP.reduce((s, p) => s + Math.max(0, p.balance), 0)

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative flex flex-col bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl overflow-hidden" style={{ height: '92vh', maxHeight: '92vh' }}>

      {/* ── HEADER ── */}
      <div className="px-5 pt-4 pb-0 flex-shrink-0" style={{ background: 'linear-gradient(135deg, #0d1f52 0%, #1a3a7a 100%)' }}>
        <div className="flex items-start justify-between mb-3">
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
          <div className="flex gap-px mb-0 mt-2">
            <div className="flex-1 bg-white/10 rounded-tl-xl px-3 py-2 text-center">
              <p className={`text-base font-bold tabular-nums ${parent.tuitionBalance < 0 ? 'text-red-300' : 'text-emerald-300'}`}>
                {fmt(Math.abs(parent.tuitionBalance))}
              </p>
              <p className="text-[10px] text-white/50">{parent.tuitionBalance < 0 ? 'חוב' : 'זכות'}</p>
            </div>
            <div className="flex-1 bg-white/10 px-3 py-2 text-center">
              <p className="text-base font-bold text-white/80 tabular-nums">{parent.childrenCount}</p>
              <p className="text-[10px] text-white/50">ילדים</p>
            </div>
            <div className="flex-1 bg-white/10 rounded-tr-xl px-3 py-2 text-center">
              <p className="text-base font-bold text-white/80 tabular-nums">{fmt(parent.tuitionTotal)}</p>
              <p className="text-[10px] text-white/50">שכ"ל</p>
            </div>
          </div>
        )}

        {/* Tabs */}
        <div className="flex gap-0.5 mt-3" dir="rtl">
          {tabs.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 text-xs font-semibold transition-colors rounded-t-lg ${
                tab === t.key ? 'bg-white text-[#1a3a7a]' : 'text-white/60 hover:text-white hover:bg-white/10'
              }`}
            >{t.label}</button>
          ))}
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
          <div className="p-4 space-y-4">
            {/* Contact grid */}
            <Card title="פרטי קשר">
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 p-4">
                <InlineField label="שם פרטי"    value={parent.firstName}   onSave={v => patch({ firstName: v })} />
                <InlineField label="שם משפחה"   value={parent.lastName}    onSave={v => patch({ lastName: v })} />
                <InlineField label="שם האמא"    value={parent.motherName}  onSave={v => patch({ motherName: v })} />
                <InlineField label="מייל"        value={parent.email}       onSave={v => patch({ email: v })} type="email" dir="ltr" />
                <InlineField label="טלפון אבא"  value={parent.fatherPhone} onSave={v => patch({ fatherPhone: v })} type="tel" dir="ltr" />
                <InlineField label="טלפון אמא"  value={parent.motherPhone} onSave={v => patch({ motherPhone: v })} type="tel" dir="ltr" />
              </div>
            </Card>

            {/* Address */}
            <Card title="כתובת">
              <div className="grid grid-cols-3 gap-x-4 gap-y-3 p-4">
                <InlineField label="עיר"        value={parent.city}     onSave={v => patch({ city: v })} />
                <InlineField label="רחוב"       value={parent.address}  onSave={v => patch({ address: v })} />
                <InlineField label="בניין/דירה" value={parent.building} onSave={v => patch({ building: v })} />
              </div>
            </Card>

            {/* Notes */}
            <Card title="הערות">
              <div className="p-4">
                <InlineField label="" value={parent.notes} onSave={v => patch({ notes: v })} multiline />
              </div>
            </Card>
          </div>
        )}

        {/* ── CHILDREN TAB ── */}
        {parent && tab === 'children' && (
          <div className="p-4 space-y-3">
            {parent.students.map(s => (
              <div key={s.id}
                onClick={() => onOpenStudent?.(s.id)}
                className={`bg-white border border-gray-200 rounded-xl p-4 transition-colors ${onOpenStudent ? 'cursor-pointer hover:border-[#1a3a7a] hover:bg-blue-50/30' : 'hover:border-[#1a3a7a]/30'}`}>
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
                    {onOpenStudent && <span className="text-[10px] text-[#1a3a7a]/50 group-hover:opacity-100">← פתח כרטיס</span>}
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-500">
                  {s.className && (
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400">כיתה</div>
                      <div className="font-medium text-gray-700">{s.className}</div>
                    </div>
                  )}
                  {s.age && (
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400">גיל</div>
                      <div className="font-medium text-gray-700">{s.age}</div>
                    </div>
                  )}
                  {s.transportation.length > 0 && (
                    <div className="text-right">
                      <div className="text-[10px] text-gray-400">הסעה</div>
                      <div className="font-medium text-gray-700">{s.transportation.join(', ')}</div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── PAYMENTS TAB ── */}
        {parent && tab === 'payments' && (
          <div className="p-4 space-y-4">
            {/* Breakdown button */}
            <button
              onClick={() => setShowBreakdown(true)}
              className="w-full flex items-center justify-between px-4 py-3 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 transition-colors text-right group"
            >
              <span className="text-xs text-indigo-400 group-hover:text-indigo-600">←</span>
              <div>
                <span className="text-sm font-semibold text-indigo-700">פירוט כספי מלא</span>
                <span className="text-xs text-indigo-400 mr-2">ילדים · הסעות · שכ"ל · סה"כ</span>
              </div>
            </button>

            {/* 3 summary numbers */}
            <div className="grid grid-cols-3 gap-2">
              <SummaryNum label="חוב פתוח כולל" value={fmt(totalDebt)}       color="text-red-600"     bg="bg-red-50" />
              <SummaryNum label="שולם החודש"     value={fmt(paidThisMonth)}   color="text-emerald-700" bg="bg-emerald-50" />
              <SummaryNum label="נותר לחודש"     value={fmt(remainThisMonth)} color="text-amber-600"   bg="bg-amber-50" />
            </div>

            {/* Filters */}
            <div className="flex gap-2">
              <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none">
                <option value="">כל החודשים</option>
                {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                className="flex-1 px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none">
                <option value="">כל הסטטוסים</option>
                {['שולם','חלקי','פתוח'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Planned payments table */}
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500">
                    <th className="px-3 py-2">חודש</th>
                    <th className="px-3 py-2 text-left">חוב</th>
                    <th className="px-3 py-2 text-left">שולם</th>
                    <th className="px-3 py-2 text-left">נותר</th>
                    <th className="px-3 py-2 text-center">סטטוס</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredPayments.length === 0
                    ? <tr><td colSpan={5} className="text-center py-6 text-gray-400 text-sm">אין נתונים</td></tr>
                    : filteredPayments.map(pp => {
                      const paid   = Math.max(0, pp.amount - pp.balance)
                      const remain = Math.max(0, pp.balance)
                      const status = remain <= 0 ? 'שולם' : paid > 0 ? 'חלקי' : 'פתוח'
                      return (
                        <tr key={pp.id}
                          onClick={() => onOpenPayment?.(pp.id)}
                          className={`hover:bg-gray-50 ${onOpenPayment ? 'cursor-pointer hover:bg-blue-50/40' : ''}`}>
                          <td className="px-3 py-2.5 font-medium text-right">{pp.monthYear || fmtDate(pp.date)}</td>
                          <td className="px-3 py-2.5 text-left tabular-nums text-gray-600">{fmt(pp.amount)}</td>
                          <td className="px-3 py-2.5 text-left tabular-nums text-emerald-700 font-medium">{fmt(paid)}</td>
                          <td className="px-3 py-2.5 text-left tabular-nums font-semibold text-red-600">
                            {remain > 0 ? fmt(remain) : <span className="text-emerald-600">✓</span>}
                          </td>
                          <td className="px-3 py-2.5 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                              status === 'שולם' ? 'bg-emerald-50 text-emerald-700'
                              : status === 'חלקי' ? 'bg-amber-50 text-amber-700'
                              : 'bg-red-50 text-red-700'}`}>{status}</span>
                          </td>
                        </tr>
                      )
                    })}
                </tbody>
              </table>
            </div>

            {/* Transactions — using TransactionRow */}
            {transactions.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-4 py-2.5 border-b border-gray-100 text-sm font-semibold text-gray-600 bg-gray-50">
                  תנועות כספיות
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
      </div>
      </div>

      {showBreakdown && parent && (
        <FinancialBreakdown parent={parent} onClose={() => setShowBreakdown(false)} />
      )}
    </div>
  )
}

/* ─── sub-components ──────────────────────────────────── */
function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-500 uppercase tracking-wide text-right">
        {title}
      </div>
      {children}
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
