'use client'

import dynamic from 'next/dynamic'
import { useState } from 'react'

/**
 * רכיבים משותפים למסכי ייבוא/משיכה (חובות ישנים, משיכת Airtable):
 * מודל בחירת הורה ידני + צ'יפ סטטיסטיקה. גרסה אחת במקום עותקים כפולים.
 */

// נטען עצלנית ומוצג כשכבה קבועה מעל המודל עצמו — כדי לוודא שמדובר באותו
// אדם לפני שבוחרים אותו, בלי לסגור את חלון הבחירה מאחוריו.
const EmployeeCard = dynamic(() => import('@/components/EmployeeCard'), { ssr: false })

export interface ParentOption { id: string; name: string; city?: string | null }

export function ParentSelectorModal({ label, allParents, onSelect, onClose }: {
  /** השם/תווית שעבורם בוחרים הורה (מוצג בכותרת) */
  label: string
  allParents: ParentOption[]
  onSelect: (id: string, name: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const [viewingId, setViewingId] = useState<string | null>(null)
  // Guard nulls — a parent row with no name must not crash the whole list
  // (one bad row used to blank the modal, making manual linking impossible).
  const filtered = allParents
    .filter(p => (p.name ?? '').includes(search) || (p.city ?? '').includes(search))
    .slice(0, 50)

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full max-h-[28rem] flex flex-col">
        <div className="p-4 border-b">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            בחר הורה עבור: <span className="text-blue-600">{label}</span>
          </p>
          <input
            type="text"
            placeholder="חפש הורה…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            autoFocus
          />
        </div>
        <div className="flex-1 overflow-y-auto">
          {filtered.map(p => (
            <div
              key={p.id}
              className="w-full flex items-center justify-between gap-2 border-b hover:bg-blue-50 transition"
            >
              <button
                onClick={() => onSelect(p.id, p.name || p.id)}
                className="flex-1 text-right px-4 py-2.5 flex items-center justify-between gap-2"
              >
                <span className="text-sm text-gray-800">{p.name || '(ללא שם)'}</span>
                {p.city && <span className="text-xs text-gray-400 shrink-0">{p.city}</span>}
              </button>
              <button
                onClick={() => setViewingId(p.id)}
                title="פתח כרטיס הורה"
                className="px-3 py-2.5 text-gray-400 hover:text-blue-600 shrink-0"
              >
                🪪
              </button>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="p-4 text-center text-xs text-gray-400">לא נמצאו הורים תואמים</p>
          )}
        </div>
        <div className="p-3 border-t">
          <button
            onClick={onClose}
            className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition"
          >
            ביטול
          </button>
        </div>
      </div>

      {viewingId && (
        <EmployeeCard parentId={viewingId} onClose={() => setViewingId(null)} />
      )}
    </div>
  )
}

const STAT_COLORS: Record<string, string> = {
  gray:  'bg-gray-50',
  green: 'bg-emerald-50',
  amber: 'bg-amber-50',
  red:   'bg-red-50',
  blue:  'bg-blue-50',
}

export function StatChip({ label, value, color = 'gray', onClick }: {
  label: string
  value: string | number
  color?: string
  /** When provided, the chip becomes a button that opens a detail view */
  onClick?: () => void
}) {
  const cls = `${STAT_COLORS[color] ?? STAT_COLORS.gray} rounded-lg py-2 text-center w-full`
  if (onClick) {
    return (
      <button type="button" onClick={onClick} title="לחץ לצפייה בשורות"
        className={`${cls} hover:ring-2 hover:ring-blue-300 transition cursor-pointer`}>
        <div className="text-lg font-bold text-gray-800">{value}</div>
        <div className="text-[11px] text-gray-500">{label}</div>
      </button>
    )
  }
  return (
    <div className={cls}>
      <div className="text-lg font-bold text-gray-800">{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}
