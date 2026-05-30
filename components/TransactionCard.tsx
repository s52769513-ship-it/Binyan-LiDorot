'use client'

import { useState, useRef, useEffect } from 'react'

export interface Transaction {
  id: string
  amount: number
  type: string
  date: string
  monthYear: string
  notes: string
  projectNames: string[]
  parentName?: string
  parentIds?: string[]
  plannedPaymentId?: string | null
}

interface Props {
  tx: Transaction
  onUpdate: (updated: Transaction) => void
  onDelete: (id: string) => void
  onOpenParent?: (parentId: string) => void
}

const HLETTERS_ONES    = ['','א','ב','ג','ד','ה','ו','ז','ח','ט']
const HLETTERS_TENS    = ['','י','כ','ל','מ','נ','ס','ע','פ','צ']
const HLETTERS_HUNDREDS = ['','ק','ר','ש','ת','תק','תר','תש','תת','תתק']

function toHebrewLetters(n: number): string {
  if (n <= 0) return ''
  const h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10
  let s = HLETTERS_HUNDREDS[h] ?? ''
  if (t === 1 && o === 5) s += 'טו'
  else if (t === 1 && o === 6) s += 'טז'
  else s += (HLETTERS_TENS[t] ?? '') + (HLETTERS_ONES[o] ?? '')
  return s.length === 1 ? s + "'" : s.slice(0, -1) + '"' + s.slice(-1)
}

function hebrewDate(iso: string): string {
  if (!iso) return ''
  try {
    const d = new Date(iso)
    const dayRaw  = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { day: 'numeric' }).format(d)
    const month   = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { month: 'long' }).format(d)
    const yearRaw = new Intl.DateTimeFormat('he-IL-u-ca-hebrew', { year: 'numeric' }).format(d)
    const dayLetters  = toHebrewLetters(parseInt(dayRaw))
    const yearLetters = toHebrewLetters(parseInt(yearRaw) - 5000)
    return `${dayLetters} ב${month} ${yearLetters}`
  } catch {
    return iso
  }
}

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency', currency: 'ILS', maximumFractionDigits: 0,
  }).format(n)
}

const TX_TYPES = ['תשלום', 'החזר', 'זיכוי', 'חוב', 'אחר']

function InlineText({
  value, onSave, multiline = false,
}: { value: string; onSave: (v: string) => void; multiline?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => { setEditing(false); if (draft !== value) onSave(draft) }

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(value); setEditing(true) }}
        className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 text-right block min-h-[1.5em]"
        title="לחץ לעריכה"
      >
        {value || <span className="text-gray-300 text-xs">—</span>}
      </span>
    )
  }

  const commonProps = {
    ref,
    value: draft,
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setDraft(e.target.value),
    onBlur: commit,
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !multiline) commit()
      if (e.key === 'Escape') { setEditing(false); setDraft(value) }
    },
    className: 'w-full border border-[#1a3a7a]/40 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30',
    dir: 'rtl' as const,
  }

  return multiline
    ? <textarea {...commonProps} rows={2} />
    : <input {...commonProps} />
}

function InlineSelect({
  value, options, onSave,
}: { value: string; options: string[]; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)

  if (!editing) {
    return (
      <span
        onClick={() => setEditing(true)}
        className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 text-right block"
        title="לחץ לעריכה"
      >
        {value || <span className="text-gray-300 text-xs">—</span>}
      </span>
    )
  }
  return (
    <select
      autoFocus
      value={value}
      onChange={e => { onSave(e.target.value); setEditing(false) }}
      onBlur={() => setEditing(false)}
      className="w-full border border-[#1a3a7a]/40 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
    >
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function InlineAmount({
  value, onSave,
}: { value: number; onSave: (v: number) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value))
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => {
    setEditing(false)
    const n = parseFloat(draft)
    if (!isNaN(n) && n !== value) onSave(n)
  }

  if (!editing) {
    return (
      <span
        onClick={() => { setDraft(String(value)); setEditing(true) }}
        className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 font-semibold tabular-nums"
        title="לחץ לעריכה"
      >
        {fmt(value)}
      </span>
    )
  }
  return (
    <input
      ref={ref}
      type="number"
      value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(String(value)) } }}
      className="w-28 border border-[#1a3a7a]/40 rounded px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
    />
  )
}

function InlineDate({
  value, onSave,
}: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  const commit = () => { setEditing(false); if (draft !== value) onSave(draft) }

  if (!editing) {
    return (
      <div
        onClick={() => { setDraft(value); setEditing(true) }}
        className="cursor-pointer hover:bg-blue-50 rounded px-1 py-0.5 text-right"
        title="לחץ לעריכה"
      >
        <div className="text-sm font-medium">{hebrewDate(value)}</div>
        <div className="text-xs text-gray-400">{value}</div>
      </div>
    )
  }
  return (
    <div>
      <input
        ref={ref}
        type="date"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') { setEditing(false); setDraft(value) } }}
        className="border border-[#1a3a7a]/40 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
      />
      {draft && <div className="text-xs text-[#1a3a7a] mt-0.5">{hebrewDate(draft)}</div>}
    </div>
  )
}

export default function TransactionCard({ tx, onUpdate, onDelete }: Props) {
  const [local, setLocal] = useState<Transaction>(tx)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const patch = async (fields: Partial<Transaction>) => {
    const next = { ...local, ...fields }
    setLocal(next)
    setSaving(true)
    setSaveError('')
    try {
      const res = await fetch(`/api/transactions/${local.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const data = await res.json()
      if (data.error) { setSaveError(data.error); setLocal(local) }
      else onUpdate(next)
    } catch {
      setSaveError('שגיאה בשמירה')
      setLocal(local)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/transactions/${local.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (data.error) { setSaveError(data.error); setDeleting(false); setConfirmDelete(false) }
      else onDelete(local.id)
    } catch {
      setSaveError('שגיאה במחיקה')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  const typeColor: Record<string, string> = {
    'תשלום': 'bg-emerald-50 text-emerald-700',
    'החזר': 'bg-blue-50 text-blue-700',
    'זיכוי': 'bg-purple-50 text-purple-700',
    'חוב': 'bg-red-50 text-red-700',
    'אחר': 'bg-gray-100 text-gray-600',
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-3" dir="rtl">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${typeColor[local.type] ?? 'bg-gray-100 text-gray-600'}`}>
            <InlineSelect value={local.type} options={TX_TYPES} onSave={v => patch({ type: v })} />
          </span>
          {saving && <span className="text-xs text-gray-400 animate-pulse">שומר...</span>}
          {saveError && <span className="text-xs text-red-500">{saveError}</span>}
        </div>

        {/* Delete button */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="text-gray-300 hover:text-red-400 transition-colors text-sm"
            title="מחק תנועה"
          >
            ✕
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setConfirmDelete(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              ביטול
            </button>
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="text-xs bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 disabled:opacity-60"
            >
              {deleting ? '...' : 'מחק'}
            </button>
          </div>
        )}
      </div>

      {/* Amount + Date */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <div className="text-xs text-gray-400 mb-0.5">סכום</div>
          <InlineAmount value={local.amount} onSave={v => patch({ amount: v })} />
        </div>
        <div>
          <div className="text-xs text-gray-400 mb-0.5">תאריך</div>
          <InlineDate value={local.date} onSave={v => patch({ date: v })} />
        </div>
      </div>

      {/* Notes */}
      <div>
        <div className="text-xs text-gray-400 mb-0.5">הערות</div>
        <InlineText value={local.notes} onSave={v => patch({ notes: v })} multiline />
      </div>
    </div>
  )
}

/* ─── Transaction Detail Modal ─────────────────────────────── */
export function TxDetailModal({ tx, onClose, onOpenParent, onSaved }: {
  tx: Transaction
  onClose: () => void
  onOpenParent?: (id: string) => void
  onSaved?: (updated: Transaction) => void
}) {
  const fmtIL = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.abs(n))

  const [draft, setDraft]     = useState<Transaction>(tx)
  const [saving, setSaving]   = useState(false)
  const [ppInfo, setPpInfo]   = useState<{ name: string; amount: number; balance: number } | null>(null)
  const dirty = JSON.stringify(draft) !== JSON.stringify(tx)

  // Load PP info if linked
  useEffect(() => {
    if (!tx.plannedPaymentId) { setPpInfo(null); return }
    fetch(`/api/transactions?plannedPaymentId=${encodeURIComponent(tx.plannedPaymentId)}`)
      .catch(() => null)
    // Fetch PP details directly
    fetch(`/api/planned-payments`)
      .then(r => r.json())
      .then((list: { id: string; name: string; amount: number; balance: number }[]) => {
        const pp = list.find(p => p.id === tx.plannedPaymentId)
        if (pp) setPpInfo({ name: pp.name, amount: pp.amount, balance: pp.balance })
      })
      .catch(() => null)
  }, [tx.plannedPaymentId])

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (draft.amount    !== tx.amount)    body.amount    = draft.amount
      if (draft.type      !== tx.type)      body.type      = draft.type
      if (draft.date      !== tx.date)      body.date      = draft.date
      if (draft.monthYear !== tx.monthYear) body.month_year = draft.monthYear
      if (draft.notes     !== tx.notes)     body.notes     = draft.notes
      if (draft.plannedPaymentId !== tx.plannedPaymentId)
        body.planned_payment_id = draft.plannedPaymentId ?? null

      if (Object.keys(body).length === 0) return
      const r = await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (r.ok) { onSaved?.(draft); onClose() }
    } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <span className="text-sm font-bold" style={{ color: '#d4a921' }}>פירוט תנועה</span>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>

        <div className="p-5 space-y-3 max-h-[70vh] overflow-y-auto">
          {tx.parentName && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400">שם</span>
              <span className="text-sm font-medium text-gray-800">{tx.parentName}</span>
            </div>
          )}

          {/* Amount */}
          <div className="flex justify-between items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0">סכום</span>
            <input type="number" value={draft.amount} onChange={e => setDraft(d => ({ ...d, amount: Number(e.target.value) }))}
              className="text-base font-bold text-emerald-700 text-left w-28 border-b border-gray-200 focus:border-emerald-400 focus:outline-none bg-transparent" />
          </div>

          {/* Type */}
          <div className="flex justify-between items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0">אמצעי תשלום</span>
            <input value={draft.type} onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
              className="text-sm text-gray-800 text-right flex-1 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent" />
          </div>

          {/* Date */}
          <div className="flex justify-between items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0">תאריך</span>
            <input type="date" value={draft.date} onChange={e => setDraft(d => ({ ...d, date: e.target.value }))}
              className="text-sm text-gray-800 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent" />
          </div>

          {/* Month */}
          <div className="flex justify-between items-center gap-3">
            <span className="text-xs text-gray-400 shrink-0">חודש</span>
            <input value={draft.monthYear} onChange={e => setDraft(d => ({ ...d, monthYear: e.target.value }))}
              placeholder="MM/YYYY" className="text-sm text-gray-800 text-right w-24 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent" />
          </div>

          {/* Project */}
          {tx.projectNames?.length > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-xs text-gray-400 shrink-0">קטגוריה</span>
              <span className="text-sm text-gray-700">{tx.projectNames.join(', ')}</span>
            </div>
          )}

          {/* Notes */}
          <div className="flex justify-between items-start gap-3">
            <span className="text-xs text-gray-400 shrink-0 mt-1">הערות</span>
            <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              rows={2} className="text-sm text-gray-800 text-right flex-1 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent resize-none" />
          </div>

          {/* Linked PP */}
          {ppInfo && (
            <div className="bg-indigo-50 rounded-xl p-3 space-y-1">
              <div className="flex justify-between items-center">
                <button onClick={() => setDraft(d => ({ ...d, plannedPaymentId: null }))}
                  className="text-xs text-red-400 hover:text-red-600">נתק</button>
                <span className="text-xs font-semibold text-indigo-700">תשלום מתוכנן מקושר</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-amber-600 font-medium">{fmtIL(ppInfo.balance)} נשאר</span>
                <span className="text-gray-600">{ppInfo.name}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span>{fmtIL(ppInfo.amount)} סכום מלא</span>
                <span>{fmtIL(ppInfo.amount - ppInfo.balance)} שולם</span>
              </div>
            </div>
          )}
          {!ppInfo && tx.plannedPaymentId && (
            <div className="text-xs text-gray-400 text-center">טוען פרטי תשלום מתוכנן...</div>
          )}
          {draft.plannedPaymentId !== tx.plannedPaymentId && draft.plannedPaymentId === null && (
            <div className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">הקישור לתשלום המתוכנן יוסר בשמירה</div>
          )}
        </div>

        <div className="px-5 pb-5 pt-3 space-y-2 border-t border-gray-100">
          {dirty && (
            <button onClick={save} disabled={saving}
              className="w-full py-2 rounded-xl text-sm font-semibold bg-[#1a3a7a] text-white hover:bg-[#0d1f52] disabled:opacity-60 transition-colors">
              {saving ? 'שומר...' : 'שמור שינויים'}
            </button>
          )}
          {onOpenParent && tx.parentIds?.[0] && (
            <button onClick={() => { onOpenParent(tx.parentIds![0]); onClose() }}
              className="w-full py-2 rounded-xl text-sm font-semibold border border-[#1a3a7a] text-[#1a3a7a] hover:bg-[#1a3a7a] hover:text-white transition-colors">
              פתח כרטיס הורה
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/* Compact row variant for use inside tables */
export function TransactionRow({ tx, onUpdate, onDelete, onOpenParent }: Props) {
  const [local, setLocal] = useState<Transaction>(tx)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDetail, setShowDetail] = useState(false)

  const patch = async (fields: Partial<Transaction>) => {
    const next = { ...local, ...fields }
    setLocal(next)
    try {
      await fetch(`/api/transactions/${local.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      onUpdate(next)
    } catch { setLocal(local) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/transactions/${local.id}`, { method: 'DELETE' })
      onDelete(local.id)
    } catch { setDeleting(false); setConfirmDelete(false) }
  }

  const typeColor: Record<string, string> = {
    'תשלום': 'text-emerald-700', 'החזר': 'text-blue-700',
    'זיכוי': 'text-purple-700', 'חוב': 'text-red-700', 'אחר': 'text-gray-600',
  }

  return (
    <>
      {showDetail && (
        <TxDetailModal tx={local} onClose={() => setShowDetail(false)} onOpenParent={onOpenParent} />
      )}
    <tr onClick={() => setShowDetail(true)} className="border-b border-gray-100 hover:bg-blue-50/40 cursor-pointer transition-colors" dir="rtl">
      <td className="px-3 py-2 text-sm">
        <div className="text-xs">{hebrewDate(local.date)}</div>
        <div className="text-gray-400 text-xs">{local.date}</div>
      </td>
      <td className={`px-3 py-2 text-sm font-medium ${typeColor[local.type] ?? ''}`}>
        {local.type}
      </td>
      <td className="px-3 py-2 text-sm font-semibold tabular-nums text-left">
        {fmt(local.amount)}
      </td>
      <td className="px-3 py-2 text-xs text-gray-500 max-w-[140px] truncate">
        {local.notes}
      </td>
      <td className="px-3 py-2 text-xs max-w-[100px]">
        {local.projectNames?.length > 0
          ? local.projectNames.map(p => (
              <span key={p} className="inline-block px-1.5 py-0.5 bg-[#1a3a7a]/10 text-[#1a3a7a] rounded text-[10px] font-medium mr-0.5">{p}</span>
            ))
          : <span className="text-gray-300">—</span>}
      </td>
      <td className="px-3 py-2 text-right" onClick={e => e.stopPropagation()}>
        {!confirmDelete ? (
          <button onClick={() => setConfirmDelete(true)} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
        ) : (
          <div className="flex items-center gap-1 justify-end">
            <button onClick={() => setConfirmDelete(false)} className="text-xs text-gray-400">ביטול</button>
            <button onClick={handleDelete} disabled={deleting}
              className="text-xs bg-red-500 text-white px-1.5 py-0.5 rounded disabled:opacity-60">
              {deleting ? '...' : 'מחק'}
            </button>
          </div>
        )}
      </td>
    </tr>
    </>
  )
}
