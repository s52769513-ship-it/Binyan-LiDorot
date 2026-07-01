'use client'

import { useState } from 'react'

/**
 * רכיבים משותפים למסכי ייבוא/משיכה (חובות ישנים, משיכת Airtable):
 * מודל בחירת הורה ידני + צ'יפ סטטיסטיקה. גרסה אחת במקום עותקים כפולים.
 */

export interface ParentOption { id: string; name: string }

export function ParentSelectorModal({ label, allParents, onSelect, onClose }: {
  /** השם/תווית שעבורם בוחרים הורה (מוצג בכותרת) */
  label: string
  allParents: ParentOption[]
  onSelect: (id: string, name: string) => void
  onClose: () => void
}) {
  const [search, setSearch] = useState('')
  const filtered = allParents.filter(p => p.name.includes(search)).slice(0, 50)

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
            <button
              key={p.id}
              onClick={() => onSelect(p.id, p.name)}
              className="w-full text-right px-4 py-2.5 hover:bg-blue-50 border-b text-sm text-gray-800 transition"
            >
              {p.name}
            </button>
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

export function StatChip({ label, value, color = 'gray' }: {
  label: string
  value: string | number
  color?: string
}) {
  return (
    <div className={`${STAT_COLORS[color] ?? STAT_COLORS.gray} rounded-lg py-2 text-center`}>
      <div className="text-lg font-bold text-gray-800">{value}</div>
      <div className="text-[11px] text-gray-500">{label}</div>
    </div>
  )
}
