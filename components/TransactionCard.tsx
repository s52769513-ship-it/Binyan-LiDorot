'use client'

import { useState, useRef, useEffect } from 'react'
import { attributeTxsToPP } from '@/lib/ppAttribution'
import FilePreviewModal from '@/components/FilePreviewModal'
import { isCashFundTransaction } from '@/lib/cashFund'
import { authHeaders } from '@/lib/authHeaders'
import LinkedPersonEditor from '@/components/LinkedPersonEditor'

export interface Transaction {
  id: string
  amount: number
  type: string
  date: string
  time?: string
  monthYear: string
  notes: string
  projectNames: string[]
  parentName?: string
  parentIds?: string[]
  plannedPaymentId?: string | null
  framework?: string
  receiptUrl?: string
}

const FRAMEWORKS = ['', 'תלמוד תורה', 'בית חינוך לבנות']

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

// Foreign-currency payments (Nadarim Plus USD) get converted to ILS at
// insert time; the original amount/rate is embedded as free text in notes,
// e.g. "(75 USD × 3.070)" — parse it back out to show a currency badge.
function detectCurrency(notes: string): { icon: string; label: string; original: string } {
  const m = notes.match(/\(([\d.]+)\s*USD[^)]*\)/)
  if (m) return { icon: '$', label: 'דולר', original: `${m[1]} USD` }
  return { icon: '₪', label: 'שקל', original: '' }
}

const TX_TYPES = ['הו"ק', 'נדרים', 'העברה בנקאית', 'מזומן', 'שיק', 'זיכוי', 'קיזוז משכר לימוד', 'קיזוז ממשכורת', 'אחר']
const PROJECT_OPTIONS = ['בנין לדורות', 'משכורת', 'הכנסה', 'הוצאה', 'אחר']

function dateToMonthYear(iso: string): string {
  if (!iso) return ''
  const [y, m] = iso.split('-')
  return m && y ? `${m}/${y}` : ''
}

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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
      const res = await fetch(`/api/transactions/${local.id}`, { method: 'DELETE', headers: authHeaders() })
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
export function TxDetailModal({ tx, onClose, onOpenParent, onSaved, onDeleted }: {
  tx: Transaction
  onClose: () => void
  onOpenParent?: (id: string) => void
  onSaved?: (updated: Transaction) => void
  onDeleted?: (id: string) => void
}) {
  const fmtIL = (n: number) => new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(Math.abs(n))

  const [draft, setDraft]       = useState<Transaction>(tx)
  const [saving, setSaving]     = useState(false)
  const [ppInfo, setPpInfo]     = useState<{ name: string; amount: number; balance: number; date: string; monthYear: string } | null>(null)
  const [ppTxList, setPpTxList] = useState<{ id: string; amount: number; date: string; isCredit?: boolean }[] | null>(null)
  const [spillovers, setSpillovers] = useState<{ id: string; amount: number; ppName: string; monthYear: string }[]>([])
  const [ppLoading, setPpLoading] = useState(false)
  const [ppError, setPpError]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting]   = useState(false)
  const [deleteError, setDeleteError] = useState('')
  const [previewReceipt, setPreviewReceipt] = useState(false)
  const [uploadingReceipt, setUploadingReceipt] = useState(false)
  const [receiptError, setReceiptError] = useState('')
  const [cashFundStatus, setCashFundStatus] = useState<'checking' | 'none' | 'duplicated'>('checking')
  const [duplicating, setDuplicating] = useState(false)
  const [duplicateError, setDuplicateError] = useState('')
  const [showPpPicker, setShowPpPicker] = useState(false)
  const [ppOptions, setPpOptions] = useState<{ id: string; name: string; amount: number; balance: number; monthYear: string; ppType: string }[]>([])
  const [ppOptionsLoading, setPpOptionsLoading] = useState(false)

  const loadPpOptions = () => {
    const pid = tx.parentIds?.[0]
    if (!pid) return
    setPpOptionsLoading(true)
    fetch(`/api/planned-payments?parentId=${encodeURIComponent(pid)}`)
      .then(r => r.json())
      .then(d => setPpOptions(Array.isArray(d) ? d : []))
      .catch(() => setPpOptions([]))
      .finally(() => setPpOptionsLoading(false))
  }

  const dirty = JSON.stringify(draft) !== JSON.stringify(tx)
  const isCashFund = isCashFundTransaction(tx.projectNames)

  // Cash-fund duplication status — checked against the persisted tx (not the
  // in-progress draft) so the button doesn't flicker while editing category.
  useEffect(() => {
    if (!isCashFund) { setCashFundStatus('none'); return }
    setCashFundStatus('checking')
    fetch(`/api/cash-fund?sourceTransactionId=${encodeURIComponent(tx.id)}`)
      .then(r => r.json())
      .then(d => setCashFundStatus(d ? 'duplicated' : 'none'))
      .catch(() => setCashFundStatus('none'))
  }, [isCashFund, tx.id])

  const handleDuplicate = async () => {
    setDuplicating(true); setDuplicateError('')
    try {
      const r = await fetch('/api/cash-fund/duplicate', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ sourceTransactionId: tx.id }),
      })
      const data = await r.json()
      if (data.error) { setDuplicateError(data.error); return }
      setCashFundStatus('duplicated')
    } catch {
      setDuplicateError('שגיאה בשכפול')
    } finally {
      setDuplicating(false)
    }
  }

  // Load PP info by direct ID lookup + all its linked transactions (for the
  // paid amount and attribution) + spillover rows this transaction generated
  // (עודף שגלש ל-PPs אחרים / זיכוי)
  useEffect(() => {
    // Track the live draft link so a manual pick/unlink updates the panel now.
    const linkedId = draft.plannedPaymentId
    if (!linkedId) { setPpInfo(null); setPpTxList(null); setSpillovers([]); return }
    setPpLoading(true); setPpError(false)
    Promise.all([
      fetch(`/api/planned-payments?id=${encodeURIComponent(linkedId)}`).then(r => r.json()),
      fetch(`/api/transactions?plannedPaymentId=${encodeURIComponent(linkedId)}`).then(r => r.json()),
      fetch(`/api/transactions?sourceTransactionId=${encodeURIComponent(tx.id)}`).then(r => r.json()),
    ])
      .then(([ppList, txList, spillList]) => {
        const pp = Array.isArray(ppList) ? ppList[0] : null
        if (pp) setPpInfo({ name: pp.name, amount: pp.amount, balance: pp.balance, date: pp.date ?? '', monthYear: pp.monthYear ?? '' })
        else setPpError(true)
        setPpTxList(Array.isArray(txList) ? txList : [])
        setSpillovers(Array.isArray(spillList) ? spillList : [])
      })
      .catch(() => setPpError(true))
      .finally(() => setPpLoading(false))
  }, [draft.plannedPaymentId, tx.id])

  // When date changes, auto-update monthYear
  const handleDateChange = (newDate: string) => {
    setDraft(d => ({ ...d, date: newDate, monthYear: dateToMonthYear(newDate) }))
  }

  // Upload/replace an invoice/receipt on any transaction. Uploads to storage
  // then persists receipt_url immediately (independent of the שמור button).
  const handleReceiptChange = async (file: File | null) => {
    setReceiptError('')
    if (!file) return
    setUploadingReceipt(true)
    try {
      const form = new FormData()
      form.set('file', file)
      const res = await fetch('/api/transactions/upload-receipt', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setReceiptError(data.error); return }
      await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ receipt_url: data.url }),
      })
      setDraft(d => ({ ...d, receiptUrl: data.url }))
      onSaved?.({ ...draft, receiptUrl: data.url })
    } catch {
      setReceiptError('שגיאה בהעלאת הקובץ')
    } finally {
      setUploadingReceipt(false)
    }
  }

  const removeReceipt = async () => {
    setReceiptError('')
    try {
      await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ receipt_url: '' }),
      })
      setDraft(d => ({ ...d, receiptUrl: '' }))
      onSaved?.({ ...draft, receiptUrl: '' })
    } catch { setReceiptError('שגיאה') }
  }

  const save = async () => {
    setSaving(true)
    try {
      const body: Record<string, unknown> = {}
      if (draft.amount    !== tx.amount)    body.amount    = draft.amount
      if (draft.type      !== tx.type)      body.type      = draft.type
      if (draft.date      !== tx.date)      body.date      = draft.date
      if (draft.monthYear !== tx.monthYear) body.month_year = draft.monthYear
      if (draft.notes     !== tx.notes)     body.notes     = draft.notes
      if (JSON.stringify(draft.projectNames) !== JSON.stringify(tx.projectNames))
        body.project_names = draft.projectNames
      if (draft.plannedPaymentId !== tx.plannedPaymentId)
        body.planned_payment_id = draft.plannedPaymentId ?? null
      if ((draft.framework ?? '') !== (tx.framework ?? ''))
        body.framework = draft.framework ?? ''

      if (Object.keys(body).length === 0) { onClose(); return }
      const r = await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(body),
      })
      if (r.ok) { onSaved?.(draft); onClose() }
    } finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true); setDeleteError('')
    try {
      const r = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE', headers: authHeaders() })
      const data = await r.json().catch(() => ({}))
      if (data?.error) { setDeleteError(data.error); return }
      onDeleted?.(tx.id)
      onClose()
    } catch {
      setDeleteError('שגיאה במחיקה')
    } finally {
      setDeleting(false)
    }
  }

  const currentType = TX_TYPES.includes(draft.type) ? draft.type : draft.type
  const currentProject = draft.projectNames?.[0] ?? ''
  const currency = detectCurrency(tx.notes)

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <span className="text-sm font-bold" style={{ color: '#d4a921' }}>פירוט תנועה</span>
          <div className="flex items-center gap-3">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} className="text-white/60 hover:text-red-300 text-base leading-none" title="מחק תנועה">🗑️</button>
            ) : (
              <div className="flex items-center gap-1.5">
                <button onClick={() => setConfirmDelete(false)} className="text-[11px] text-white/60 hover:text-white">ביטול</button>
                <button onClick={handleDelete} disabled={deleting}
                  className="text-[11px] bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 disabled:opacity-60">
                  {deleting ? '...' : 'מחק'}
                </button>
              </div>
            )}
            <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
          </div>
        </div>

        <div className="p-5 space-y-3 max-h-[82vh] overflow-y-auto" dir="rtl">
          {deleteError && <p className="text-xs text-red-500 text-center">{deleteError}</p>}
          <LinkedPersonEditor
            currentId={draft.parentIds?.[0] ?? null}
            currentName={tx.parentName ?? ''}
            label="שם"
            locked={!!draft.plannedPaymentId}
            lockedReason="מקושרת לתשלום מתוכנן — נתק כדי לשנות שיוך"
            onUnlink={async () => {
              const res = await fetch(`/api/transactions/${tx.id}`, {
                method: 'PATCH', headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ planned_payment_id: null }),
              })
              const data = await res.json().catch(() => ({}))
              if (data?.error) throw new Error(data.error)
              setDraft(d => ({ ...d, plannedPaymentId: null }))
              onSaved?.({ ...draft, plannedPaymentId: null })
            }}
            onConfirm={async newParent => {
              const res = await fetch(`/api/transactions/${tx.id}/reassign`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ newParentId: newParent.id }),
              })
              const data = await res.json()
              if (data.error) throw new Error(data.error)
              onSaved?.({ ...tx, parentIds: [newParent.id], parentName: newParent.name })
              onClose()
            }}
          />

          {/* Direction toggle — הכנסה/הוצאה */}
          <div className="grid grid-cols-2 gap-2">
            <button type="button"
              onClick={() => setDraft(d => ({ ...d, amount: Math.abs(d.amount) }))}
              className={`py-2 rounded-lg text-xs font-bold border-2 transition-colors ${
                draft.amount >= 0
                  ? 'bg-emerald-600 text-white border-emerald-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-emerald-400'
              }`}>
              ↙ הכנסה
            </button>
            <button type="button"
              onClick={() => setDraft(d => ({ ...d, amount: -Math.abs(d.amount) }))}
              className={`py-2 rounded-lg text-xs font-bold border-2 transition-colors ${
                draft.amount < 0
                  ? 'bg-red-600 text-white border-red-600'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-red-400'
              }`}>
              ↗ הוצאה
            </button>
          </div>

          {/* Amount */}
          <div className="flex justify-between items-center gap-3">
            <div className="flex items-center gap-1.5">
              <input type="number" value={Math.abs(draft.amount)}
                onChange={e => {
                  const abs = Math.abs(Number(e.target.value))
                  setDraft(d => ({ ...d, amount: d.amount < 0 ? -abs : abs }))
                }}
                className={`text-xl font-bold w-32 border-b-2 focus:outline-none bg-transparent text-left ${
                  draft.amount < 0
                    ? 'text-red-600 border-red-300 focus:border-red-500'
                    : 'text-emerald-700 border-emerald-300 focus:border-emerald-500'
                }`} />
              <span
                className="flex items-center justify-center w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-bold shrink-0"
                title={currency.original ? `שולם ב${currency.label} (${currency.original}), הומר לשקלים` : 'שקל'}
              >
                {currency.icon}
              </span>
            </div>
            <span className="text-xs text-gray-400 shrink-0">סכום</span>
          </div>

          {/* Type — select */}
          <div className="flex justify-between items-center gap-3">
            <select
              value={currentType}
              onChange={e => setDraft(d => ({ ...d, type: e.target.value }))}
              className="text-sm text-gray-800 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent flex-1 text-right"
            >
              {!TX_TYPES.includes(draft.type) && draft.type && (
                <option value={draft.type}>{draft.type}</option>
              )}
              {TX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <span className="text-xs text-gray-400 shrink-0">אמצעי תשלום</span>
          </div>

          {/* Date */}
          <div className="flex justify-between items-center gap-3">
            <input type="date" value={draft.date} onChange={e => handleDateChange(e.target.value)}
              className="text-sm text-gray-800 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent" />
            <span className="text-xs text-gray-400 shrink-0">תאריך</span>
          </div>

          {/* Time — only known for transactions from Nadarim Plus */}
          {tx.time && (
            <div className="flex justify-between items-center gap-3">
              <span className="text-sm text-gray-500 tabular-nums">{tx.time}</span>
              <span className="text-xs text-gray-400 shrink-0">שעה</span>
            </div>
          )}

          {/* Month — read-only, auto from date */}
          <div className="flex justify-between items-center gap-3">
            <span className="text-sm text-gray-500 tabular-nums">{draft.monthYear}</span>
            <span className="text-xs text-gray-400 shrink-0">חודש</span>
          </div>

          {/* Category — select */}
          <div className="flex justify-between items-center gap-3">
            <select
              value={currentProject}
              onChange={e => setDraft(d => ({ ...d, projectNames: e.target.value ? [e.target.value] : [] }))}
              className="text-sm text-gray-800 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent flex-1 text-right"
            >
              <option value="">— ללא —</option>
              {!PROJECT_OPTIONS.includes(currentProject) && currentProject && (
                <option value={currentProject}>{currentProject}</option>
              )}
              {PROJECT_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
            <span className="text-xs text-gray-400 shrink-0">קטגוריה</span>
          </div>

          {/* קופת מזומנים — only for transactions tagged with the cash-fund
              category (the swap: bank transfer to a person → person returns
              the equivalent in physical cash into the fund). */}
          {isCashFund && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-1.5">
              {cashFundStatus === 'checking' ? (
                <p className="text-xs text-gray-400 text-center">בודק סטטוס קופת מזומנים...</p>
              ) : cashFundStatus === 'duplicated' ? (
                <p className="text-xs text-emerald-700 font-medium text-center">✓ כבר שוכפל לקופת המזומנים</p>
              ) : (
                <button onClick={handleDuplicate} disabled={duplicating}
                  className="w-full py-1.5 rounded-lg text-xs font-semibold border border-amber-400 text-amber-700 hover:bg-amber-100 disabled:opacity-60 transition-colors">
                  {duplicating ? 'משכפל...' : '🔁 שכפל לקופת המזומנים'}
                </button>
              )}
              {duplicateError && <p className="text-xs text-red-500 text-center">{duplicateError}</p>}
            </div>
          )}

          {/* Framework/division — relevant for expenses */}
          {draft.amount < 0 && (
            <div className="flex justify-between items-center gap-3">
              <select
                value={draft.framework ?? ''}
                onChange={e => setDraft(d => ({ ...d, framework: e.target.value }))}
                className="text-sm text-gray-800 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent flex-1 text-right"
              >
                {FRAMEWORKS.map(f => <option key={f || 'none'} value={f}>{f || 'כללי / משותף'}</option>)}
              </select>
              <span className="text-xs text-gray-400 shrink-0">מסגרת</span>
            </div>
          )}

          {/* Receipt/invoice — upload / view / replace / remove (all transactions) */}
          <div className="flex justify-between items-start gap-3">
            <div className="flex-1 min-w-0">
              {draft.receiptUrl ? (
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setPreviewReceipt(true)}
                    className="text-sm text-emerald-700 font-medium hover:underline truncate">📎 צפייה בחשבונית</button>
                  <label className="text-xs text-[#1a3a7a] hover:underline cursor-pointer">
                    {uploadingReceipt ? 'מעלה...' : 'החלף'}
                    <input type="file" accept="image/*,.pdf" className="hidden"
                      onChange={e => handleReceiptChange(e.target.files?.[0] ?? null)} disabled={uploadingReceipt} />
                  </label>
                  <button onClick={removeReceipt} className="text-xs text-red-400 hover:text-red-600">הסר</button>
                </div>
              ) : (
                <label className="inline-flex items-center gap-1.5 text-sm text-[#1a3a7a] border border-dashed border-[#1a3a7a]/40 rounded-lg px-3 py-1.5 hover:bg-[#1a3a7a]/5 cursor-pointer">
                  <span>{uploadingReceipt ? 'מעלה...' : '📎 העלה חשבונית / מסמך'}</span>
                  <input type="file" accept="image/*,.pdf" className="hidden"
                    onChange={e => handleReceiptChange(e.target.files?.[0] ?? null)} disabled={uploadingReceipt} />
                </label>
              )}
              {receiptError && <p className="text-xs text-red-500 mt-1">{receiptError}</p>}
            </div>
            <span className="text-xs text-gray-400 shrink-0 mt-1.5">חשבונית</span>
          </div>

          {/* Notes */}
          <div className="flex justify-between items-start gap-3">
            <textarea value={draft.notes} onChange={e => setDraft(d => ({ ...d, notes: e.target.value }))}
              rows={2} className="text-sm text-gray-800 text-right flex-1 border-b border-gray-200 focus:border-[#1a3a7a] focus:outline-none bg-transparent resize-none" />
            <span className="text-xs text-gray-400 shrink-0 mt-1">הערות</span>
          </div>

          {/* Linked PP */}
          {draft.plannedPaymentId && !showPpPicker && (
            ppLoading ? (
              <div className="text-xs text-gray-400 text-center py-2">טוען תשלום מתוכנן...</div>
            ) : ppError ? (
              <div className="text-xs text-red-400 text-center py-2">לא נמצא תשלום מתוכנן</div>
            ) : ppInfo ? (() => {
              // Use actual paid transactions sum; fallback to DB balance delta.
              // Linked payments can exceed the PP amount (עודף שגלש לחובות
              // אחרים / זיכוי) — count only up to the PP amount as paid here
              // and surface the overflow explicitly.
              const totalLinked = ppTxList !== null
                ? ppTxList.reduce((s, t) => s + Math.abs(t.amount), 0)
                : (ppInfo.amount - ppInfo.balance)
              const paid = Math.min(totalLinked, ppInfo.amount)
              const overflow = Math.max(0, totalLinked - ppInfo.amount)
              const remaining = Math.max(0, ppInfo.amount - paid)
              // How much of THIS transaction counted toward THIS PP
              const appliedHere = ppTxList !== null
                ? (attributeTxsToPP(ppTxList, ppInfo.amount).appliedById.get(tx.id) ?? null)
                : null
              const txAmount = Math.abs(tx.amount)
              const spillSum = spillovers.reduce((s, r) => s + Math.abs(r.amount), 0)
              const creditPart = appliedHere !== null
                ? Math.max(0, Math.round((txAmount - appliedHere - spillSum) * 100) / 100)
                : 0
              const showBreakdown = (appliedHere !== null && appliedHere < txAmount - 0.005) || spillovers.length > 0
              return (
                <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
                  {/* Header: title + change / unlink */}
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                      <button onClick={() => { setShowPpPicker(true); loadPpOptions() }}
                        className="text-xs text-indigo-500 hover:text-indigo-700">שנה</button>
                      <button onClick={() => setDraft(d => ({ ...d, plannedPaymentId: null }))}
                        className="text-xs text-red-400 hover:text-red-600">נתק</button>
                    </div>
                    <span className="text-xs font-semibold text-indigo-700">תשלום מתוכנן מקושר</span>
                  </div>

                  {/* PP name + dates — clickable to open parent */}
                  <button
                    onClick={() => { if (onOpenParent && tx.parentIds?.[0]) { onOpenParent(tx.parentIds[0]); onClose() } }}
                    className="w-full text-right group"
                    disabled={!onOpenParent || !tx.parentIds?.[0]}
                  >
                    <div className="flex justify-between items-start">
                      <div className="text-right">
                        {ppInfo.date && (
                          <div className="text-xs text-indigo-500 group-hover:text-indigo-700 transition-colors">
                            {hebrewDate(ppInfo.date)}
                          </div>
                        )}
                        {ppInfo.monthYear && (
                          <div className="text-[10px] text-gray-400">{ppInfo.monthYear}</div>
                        )}
                      </div>
                      <span className="text-sm font-bold text-indigo-800 group-hover:underline">
                        {ppInfo.name}
                        {onOpenParent && tx.parentIds?.[0] && <span className="text-indigo-400 text-xs mr-1">↗</span>}
                      </span>
                    </div>
                  </button>

                  {/* Amounts */}
                  <div className="flex justify-between text-sm border-t border-indigo-100 pt-1.5">
                    <span className={`font-medium ${remaining > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                      {remaining > 0 ? `${fmtIL(remaining)} נשאר` : '✓ שולם במלואו'}
                    </span>
                    <span className="text-gray-500 text-xs">{fmtIL(ppInfo.amount)} סכום מלא</span>
                  </div>
                  {paid > 0 && (
                    <div className="text-xs text-emerald-600">{fmtIL(paid)} שולם</div>
                  )}
                  {overflow > 0 && (
                    <div className="text-xs text-amber-600">{fmtIL(overflow)} מעבר לסכום — גלש לחובות אחרים / זיכוי</div>
                  )}

                  {/* מה כיסה התשלום הזה — פירוק מדויק כשהתשלום גלש */}
                  {showBreakdown && (
                    <div className="border-t border-indigo-100 pt-1.5 space-y-1">
                      <div className="text-[10px] font-semibold text-indigo-400">מה כיסה התשלום הזה ({fmtIL(txAmount)})</div>
                      {appliedHere !== null && appliedHere > 0 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600 tabular-nums">{fmtIL(appliedHere)}</span>
                          <span className="text-gray-500">{ppInfo.name || 'תשלום זה'}</span>
                        </div>
                      )}
                      {spillovers.map(s => (
                        <div key={s.id} className="flex justify-between text-xs">
                          <span className="text-gray-600 tabular-nums">{fmtIL(s.amount)}</span>
                          <span className="text-gray-500">{s.ppName || s.monthYear || 'תשלום אחר'}</span>
                        </div>
                      ))}
                      {creditPart > 0.005 && (
                        <div className="flex justify-between text-xs">
                          <span className="text-gray-600 tabular-nums">{fmtIL(creditPart)}</span>
                          <span className="text-gray-500">יתרת זכות</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })() : null
          )}

          {/* Not linked → offer to link to a chosen planned payment */}
          {!draft.plannedPaymentId && !showPpPicker && tx.parentIds?.[0] && (
            <button onClick={() => { setShowPpPicker(true); loadPpOptions() }}
              className="w-full py-2 rounded-xl text-sm font-medium border border-dashed border-indigo-300 text-indigo-600 hover:bg-indigo-50 transition-colors">
              🔗 קשר לתשלום מתוכנן
            </button>
          )}

          {/* PP picker — choose which planned payment to link this transaction to */}
          {showPpPicker && (
            <div className="bg-indigo-50 rounded-xl p-3 space-y-2">
              <div className="flex items-center justify-between">
                <button onClick={() => setShowPpPicker(false)} className="text-xs text-gray-400 hover:text-gray-600">סגור</button>
                <span className="text-xs font-semibold text-indigo-700">בחר תשלום מתוכנן לקישור</span>
              </div>
              {ppOptionsLoading ? (
                <p className="text-xs text-gray-400 text-center py-2">טוען...</p>
              ) : ppOptions.length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">אין תשלומים מתוכננים לאדם זה</p>
              ) : (
                <div className="max-h-56 overflow-y-auto space-y-1">
                  {ppOptions.map(pp => (
                    <button key={pp.id}
                      onClick={() => { setDraft(d => ({ ...d, plannedPaymentId: pp.id })); setShowPpPicker(false) }}
                      className={`w-full text-right px-3 py-2 rounded-lg border text-sm transition-colors ${
                        draft.plannedPaymentId === pp.id
                          ? 'border-indigo-400 bg-white'
                          : 'border-gray-200 bg-white hover:border-indigo-300 hover:bg-indigo-50/40'
                      }`}>
                      <div className="flex justify-between items-center">
                        <span className={`text-xs tabular-nums ${pp.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                          {pp.balance > 0 ? `${fmtIL(pp.balance)} נשאר` : '✓ שולם'}
                        </span>
                        <span className="font-medium text-gray-800">{pp.name || 'תשלום'} · {pp.monthYear}</span>
                      </div>
                      <div className="text-[10px] text-gray-400 text-right mt-0.5">סכום {fmtIL(pp.amount)}</div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[10px] text-gray-400">הקישור נשמר בלחיצה על &quot;שמור שינויים&quot; והיתרה תתעדכן.</p>
            </div>
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
      {previewReceipt && draft.receiptUrl && (
        <FilePreviewModal url={draft.receiptUrl} onClose={() => setPreviewReceipt(false)} />
      )}
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
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(fields),
      })
      onUpdate(next)
    } catch { setLocal(local) }
  }

  const handleDelete = async () => {
    setDeleting(true)
    try {
      await fetch(`/api/transactions/${local.id}`, { method: 'DELETE', headers: authHeaders() })
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
        <TxDetailModal tx={local} onClose={() => setShowDetail(false)} onOpenParent={onOpenParent}
          onDeleted={id => { setShowDetail(false); onDelete(id) }} />
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
