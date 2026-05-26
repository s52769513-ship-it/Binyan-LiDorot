'use client'

import { useState, useRef, useEffect } from 'react'

export interface Transaction {
  id: string
  amount: number
  type: string
  date: string
  monthYear: string
  notes: string
}

interface Props {
  tx: Transaction
  onUpdate: (updated: Transaction) => void
  onDelete: (id: string) => void
}

function hebrewDate(iso: string): string {
  if (!iso) return ''
  try {
    return new Intl.DateTimeFormat('he-IL-u-ca-hebrew', {
      day: 'numeric', month: 'long', year: 'numeric',
    }).format(new Date(iso))
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

/* Compact row variant for use inside tables */
export function TransactionRow({ tx, onUpdate, onDelete }: Props) {
  const [local, setLocal] = useState<Transaction>(tx)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

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
    <tr className="border-b border-gray-100 hover:bg-gray-50/50" dir="rtl">
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
      <td className="px-3 py-2 text-sm text-gray-500 max-w-[200px] truncate">
        {local.notes}
      </td>
      <td className="px-3 py-2 text-right">
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
  )
}
