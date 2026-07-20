'use client'

import { useState } from 'react'
import SupplierPicker from '@/components/SupplierPicker'

// Shows who a record (transaction / planned payment) is linked to, with a
// "שנה" flow to reassign it to a different person — gated behind an explicit
// confirmation dialog. `locked` blocks the whole flow (used when a transaction
// is linked to a PP, or a PP already has linked transactions — reassigning
// either half of an already-linked pair would silently orphan the other).
export default function LinkedPersonEditor({
  currentId, currentName, locked, lockedReason, onConfirm, onUnlink, unlinkLabel = 'נתק תחילה', label = 'מקושר ל',
}: {
  currentId: string | null
  currentName: string
  locked: boolean
  lockedReason?: string
  onConfirm: (newParent: { id: string; name: string }) => Promise<void> | void
  /** When locked, an optional action that clears the lock (e.g. unlink the tx from its PP). */
  onUnlink?: () => Promise<void> | void
  unlinkLabel?: string
  label?: string
}) {
  const [picking, setPicking]   = useState(false)
  const [pendingParent, setPendingParent] = useState<{ id: string; name: string } | null>(null)
  const [applying, setApplying] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [error, setError]       = useState('')

  const doUnlink = async () => {
    if (!onUnlink) return
    setUnlinking(true); setError('')
    try {
      await onUnlink()
    } catch {
      setError('שגיאה בניתוק')
    } finally {
      setUnlinking(false)
    }
  }

  const confirm = async () => {
    if (!pendingParent) return
    setApplying(true); setError('')
    try {
      await onConfirm(pendingParent)
      setPendingParent(null)
      setPicking(false)
    } catch {
      setError('שגיאה בעדכון השיוך')
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center gap-3">
        <div className="flex items-center gap-2">
          {!locked && (
            <button onClick={() => setPicking(p => !p)} className="text-xs text-[#1a3a7a] hover:underline">
              {picking ? 'ביטול' : 'שנה'}
            </button>
          )}
          <span className="text-sm font-medium text-gray-800">{currentName || '—'}</span>
        </div>
        <span className="text-xs text-gray-400 shrink-0" title={locked ? lockedReason : undefined}>
          {label}{locked && ' 🔒'}
        </span>
      </div>

      {locked && (lockedReason || onUnlink) && (
        <div className="text-[11px] text-amber-600 bg-amber-50 rounded-lg px-2.5 py-1.5 flex items-center justify-between gap-2">
          <span>{lockedReason}</span>
          {onUnlink && (
            <button onClick={doUnlink} disabled={unlinking}
              className="shrink-0 px-2 py-0.5 rounded bg-amber-500 text-white font-medium hover:bg-amber-600 disabled:opacity-60">
              {unlinking ? '...' : unlinkLabel}
            </button>
          )}
        </div>
      )}

      {picking && !locked && (
        <div className="bg-gray-50 rounded-lg p-2.5">
          <SupplierPicker
            value={null}
            personType=""
            placeholder="חפש שם..."
            onSelect={p => { if (p && p.id !== currentId) setPendingParent(p) }}
          />
        </div>
      )}

      {pendingParent && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => !applying && setPendingParent(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xs mx-4 p-5 space-y-3" dir="rtl" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-bold text-gray-800 text-center">שינוי שיוך</p>
            <p className="text-sm text-gray-600 text-center leading-relaxed">
              להעביר את השיוך מ־<span className="font-semibold">{currentName || 'ללא'}</span> ל־<span className="font-semibold text-[#1a3a7a]">{pendingParent.name}</span>?
            </p>
            {error && <p className="text-xs text-red-500 text-center">{error}</p>}
            <div className="flex gap-2">
              <button onClick={() => setPendingParent(null)} disabled={applying}
                className="flex-1 py-2 rounded-xl text-sm font-medium border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-60">
                ביטול
              </button>
              <button onClick={confirm} disabled={applying}
                className="flex-1 py-2 rounded-xl text-sm font-semibold bg-[#1a3a7a] text-white hover:bg-[#0d1f52] disabled:opacity-60">
                {applying ? 'מעדכן...' : 'אישור'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
