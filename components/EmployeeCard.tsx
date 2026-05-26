'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ParentDetail } from '@/lib/types'

/* ─── helpers ──────────────────────────────────────── */
const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

function fmtDate(d: string) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('he-IL').format(new Date(d))
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
    className: 'w-full px-2 py-1 text-sm border-b-2 border-[#1a3a7a] bg-transparent outline-none',
  }

  return (
    <div className="group flex items-start justify-between py-2 border-b border-gray-50">
      <div className="flex-1 min-w-0">
        {editing ? (
          multiline
            ? <textarea rows={3} {...sharedProps} />
            : <input type={type} {...sharedProps} />
        ) : (
          <button
            onClick={() => setEditing(true)}
            className="text-sm text-gray-800 hover:text-[#1a3a7a] text-right w-full flex items-center gap-1"
            title="לחץ לעריכה"
          >
            {saving && <span className="text-xs text-gray-400">שומר...</span>}
            <span>{val || <span className="text-gray-300 italic">לא הוזן</span>}</span>
            <span className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 text-xs mr-1">✏</span>
          </button>
        )}
      </div>
      <span className="text-xs text-gray-400 mr-3 pt-0.5 whitespace-nowrap flex-shrink-0">{label}</span>
    </div>
  )
}

/* ─── props ─────────────────────────────────────────── */
interface Props {
  parentId: string
  onClose: () => void
}

/* ─── badge ─────────────────────────────────────────── */
const STATUS_STYLE: Record<string, string> = {
  'פעיל': 'bg-emerald-100 text-emerald-800',
  'לא פעיל': 'bg-gray-100 text-gray-600',
  'ממתין': 'bg-amber-100 text-amber-700',
}
function Badge({ text }: { text: string }) {
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${STATUS_STYLE[text] ?? 'bg-blue-50 text-blue-700'}`}>
      {text}
    </span>
  )
}

type TabKey = 'details' | 'children' | 'payments' | 'salaries'

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
═══════════════════════════════════════════════════════ */
export default function EmployeeCard({ parentId, onClose }: Props) {
  const [parent, setParent] = useState<ParentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [tab, setTab] = useState<TabKey>('details')
  const [monthFilter, setMonthFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch(`/api/parents/${parentId}`)
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setParent(d) })
      .catch(() => setError('שגיאה'))
      .finally(() => setLoading(false))
  }, [parentId])

  useEffect(() => { load() }, [load])
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  /* patch helper */
  const patch = useCallback(async (fields: Record<string, unknown>) => {
    await fetch(`/api/parents/${parentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(fields),
    })
    setParent(prev => prev ? { ...prev, ...fields } as ParentDetail : prev)
  }, [parentId])

  /* available tabs */
  const tabs: { key: TabKey; label: string }[] = [
    { key: 'details',  label: 'פרטים אישיים' },
    ...(parent && parent.students.length > 0  ? [{ key: 'children' as TabKey, label: 'ילדים' }] : []),
    ...(parent && parent.plannedPayments.length > 0 ? [{ key: 'payments' as TabKey, label: 'תשלומים' }] : []),
  ]

  /* payment filter */
  const allMonths = [...new Set(parent?.plannedPayments.map(p => p.monthYear).filter(Boolean) ?? [])]
  const filteredPayments = (parent?.plannedPayments ?? []).filter(p => {
    if (monthFilter && p.monthYear !== monthFilter) return false
    if (statusFilter) {
      const s = p.balance <= 0 ? 'שולם' : (p.amount - p.balance) > 0 ? 'חלקי' : 'פתוח'
      if (s !== statusFilter) return false
    }
    return true
  })

  const totalDebt    = (parent?.plannedPayments ?? []).reduce((s, p) => s + Math.max(0, p.balance), 0)
  const currentMonth = `${String(new Date().getMonth() + 1).padStart(2, '0')}/${new Date().getFullYear()}`
  const thisMonthPP  = (parent?.plannedPayments ?? []).filter(p => p.monthYear === currentMonth)
  const paidThisMonth = thisMonthPP.reduce((s, p) => s + Math.max(0, p.amount - p.balance), 0)
  const remainThisMonth = thisMonthPP.reduce((s, p) => s + Math.max(0, p.balance), 0)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-3"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── HEADER ── */}
        <div className="px-5 pt-5 pb-4 border-b border-gray-100" style={{ background: 'linear-gradient(135deg, #0d1f52 0%, #1a3a7a 100%)' }}>
          <div className="flex items-start justify-between">
            <div className="flex gap-2">
              <button
                onClick={() => window.open(`/dashboard/parents/${parentId}`, '_blank')}
                title="פתח בדף נפרד"
                className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10 text-xs"
              >↗</button>
              <button onClick={onClose} className="p-1.5 rounded-lg text-white/60 hover:text-white hover:bg-white/10">✕</button>
            </div>
            <div className="text-right">
              {loading
                ? <div className="h-7 w-48 bg-white/20 rounded animate-pulse mb-1" />
                : <h2 className="text-2xl font-bold text-white">{parent?.name || '—'}</h2>}
              <div className="flex items-center gap-2 justify-end mt-1.5 flex-wrap">
                {parent?.city && <span className="text-white/60 text-xs">{parent.city}</span>}
                {(parent?.status ?? []).slice(0, 3).map(s => <Badge key={s} text={s} />)}
              </div>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4" dir="rtl">
            {tabs.map(t => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-4 py-1.5 rounded-t-lg text-sm font-medium transition-colors ${
                  tab === t.key ? 'bg-white text-[#1a3a7a]' : 'text-white/70 hover:text-white hover:bg-white/10'
                }`}
              >{t.label}</button>
            ))}
          </div>
        </div>

        {/* ── BODY ── */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="p-5 space-y-3">
              {[1,2,3,4].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}
            </div>
          )}
          {error && <div className="p-5 text-red-600 text-sm bg-red-50 m-4 rounded-xl">{error}</div>}

          {/* ── TAB: DETAILS ── */}
          {parent && tab === 'details' && (
            <div className="p-5 space-y-5">
              <FieldGroup title="זהות">
                <InlineField label="שם פרטי"   value={parent.firstName}   onSave={v => patch({ firstName: v })} />
                <InlineField label="שם משפחה"  value={parent.lastName}    onSave={v => patch({ lastName: v })} />
                <InlineField label="שם האמא"   value={parent.motherName}  onSave={v => patch({ motherName: v })} />
                <InlineField label="טלפון אבא" value={parent.fatherPhone} onSave={v => patch({ fatherPhone: v })} type="tel" dir="ltr" />
                <InlineField label="טלפון אמא" value={parent.motherPhone} onSave={v => patch({ motherPhone: v })} type="tel" dir="ltr" />
                <InlineField label="מייל"      value={parent.email}       onSave={v => patch({ email: v })} type="email" dir="ltr" />
              </FieldGroup>

              <FieldGroup title="כתובת">
                <InlineField label="רחוב"      value={parent.address}  onSave={v => patch({ address: v })} />
                <InlineField label="בניין/דירה" value={parent.building} onSave={v => patch({ building: v })} />
                <InlineField label="עיר"       value={parent.city}     onSave={v => patch({ city: v })} />
              </FieldGroup>

              {parent.notes && (
                <FieldGroup title="הערות">
                  <InlineField label="הערות" value={parent.notes} onSave={v => patch({ notes: v })} multiline />
                </FieldGroup>
              )}

              {/* Financial summary */}
              <FieldGroup title="מצב כספי">
                <div className="grid grid-cols-2 gap-3 py-1">
                  <div className={`rounded-xl p-3 text-center ${parent.tuitionBalance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                    <p className={`text-xl font-bold tabular-nums ${parent.tuitionBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                      {fmt(parent.tuitionBalance)}
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">חוב / זכות</p>
                  </div>
                  <div className="rounded-xl p-3 text-center bg-gray-50">
                    <p className="text-xl font-bold tabular-nums text-gray-700">{fmt(parent.tuitionTotal)}</p>
                    <p className="text-xs text-gray-500 mt-0.5">שכ"ל לתשלום</p>
                  </div>
                </div>
              </FieldGroup>
            </div>
          )}

          {/* ── TAB: CHILDREN ── */}
          {parent && tab === 'children' && (
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {parent.students.map(s => {
                  const framework = s.gender === 'נקבה' ? 'בית חינוך' : 'תלמוד תורה'
                  return (
                    <div key={s.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:border-[#1a3a7a]/40 hover:shadow-sm transition-all cursor-pointer">
                      <div className="flex items-start justify-between mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          s.status === 'פעיל' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                        }`}>{s.status || 'לא ידוע'}</span>
                        <p className="font-bold text-gray-900 text-right">{s.name}</p>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600 text-right">
                        {s.className && <p>כיתה: {s.className}</p>}
                        <p>{s.age ? `גיל: ${s.age} ·` : ''} {framework}</p>
                        {s.transportation.length > 0 && (
                          <p className="text-xs text-gray-400">🚌 {s.transportation.join(', ')}</p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── TAB: PAYMENTS ── */}
          {parent && tab === 'payments' && (
            <div className="p-5 space-y-4">
              {/* 3 summary numbers */}
              <div className="grid grid-cols-3 gap-3">
                <SummaryNum label="חוב כולל פתוח" value={fmt(totalDebt)} color="text-red-600" bg="bg-red-50" />
                <SummaryNum label="שולם החודש"    value={fmt(paidThisMonth)}   color="text-emerald-700" bg="bg-emerald-50" />
                <SummaryNum label="נותר לחודש"    value={fmt(remainThisMonth)} color="text-amber-600"   bg="bg-amber-50" />
              </div>

              {/* Filters */}
              <div className="flex gap-2 flex-wrap">
                <select value={monthFilter} onChange={e => setMonthFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/20">
                  <option value="">כל החודשים</option>
                  {allMonths.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
                  className="px-3 py-1.5 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/20">
                  <option value="">כל הסטטוסים</option>
                  {['שולם','חלקי','פתוח'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>

              {/* Table */}
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[480px] text-sm">
                    <thead>
                      <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500 uppercase">
                        <th className="px-3 py-2">חודש</th>
                        <th className="px-3 py-2 text-left">חוב</th>
                        <th className="px-3 py-2 text-left">שולם</th>
                        <th className="px-3 py-2 text-left">נותר</th>
                        <th className="px-3 py-2 text-center">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {filteredPayments.length === 0
                        ? <tr><td colSpan={5} className="text-center py-8 text-gray-400">אין נתונים</td></tr>
                        : filteredPayments.map(pp => {
                          const paid   = Math.max(0, pp.amount - pp.balance)
                          const remain = Math.max(0, pp.balance)
                          const status = remain <= 0 ? 'שולם' : paid > 0 ? 'חלקי' : 'פתוח'
                          return (
                            <tr key={pp.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2.5 font-medium">{pp.monthYear || fmtDate(pp.date)}</td>
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
              </div>

              {/* Transactions history */}
              {parent.transactions.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-gray-600 mb-2 text-right">תנועות אחרונות</h3>
                  <div className="space-y-1">
                    {parent.transactions.slice(0, 10).map(tx => (
                      <div key={tx.id} className="flex items-center justify-between px-4 py-2.5 bg-white border border-gray-100 rounded-xl hover:border-[#1a3a7a]/30 hover:shadow-sm transition-all">
                        <span className="text-sm font-bold text-emerald-700 tabular-nums">{fmt(tx.amount)}</span>
                        <div className="text-right">
                          <p className="text-sm text-gray-700">{tx.type || '—'}</p>
                          <p className="text-xs text-gray-400">{fmtDate(tx.date)} {tx.date && <span className="text-[#1a3a7a]/60">{toHebrewDate(tx.date)}</span>}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ─── sub-components ──────────────────────────────────── */
function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2 text-right">{title}</h3>
      <div className="bg-gray-50 rounded-xl px-4 divide-y divide-gray-100">{children}</div>
    </div>
  )
}

function SummaryNum({ label, value, color, bg }: { label: string; value: string; color: string; bg: string }) {
  return (
    <div className={`${bg} rounded-xl p-3 text-center`}>
      <p className={`text-lg font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-tight">{label}</p>
    </div>
  )
}
