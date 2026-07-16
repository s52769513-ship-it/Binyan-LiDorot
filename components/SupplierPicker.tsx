'use client'

import { useState } from 'react'

// Single-select person picker with type-ahead search. Defaults to searching
// only suppliers (person_type contains 'ספק'); pass personType="" to search all.
export default function SupplierPicker({
  value, valueName, onSelect, personType = 'ספק', placeholder = 'חפש שם...',
}: {
  value: string | null
  valueName?: string
  onSelect: (p: { id: string; name: string } | null) => void
  personType?: string
  placeholder?: string
}) {
  const [search, setSearch]   = useState('')
  const [results, setResults] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  // Allow creating a brand-new supplier when searching within a specific type
  const canCreate = !!personType

  const run = async (q: string) => {
    setSearch(q)
    if (!q.trim()) { setResults([]); return }
    setLoading(true)
    try {
      const params = new URLSearchParams({ search: q, limit: '50' })
      if (personType) params.set('personType', personType)
      const r = await fetch(`/api/parents?${params}`)
      const d = await r.json()
      setResults((d.data ?? []).map((p: Record<string, unknown>) => ({ id: String(p.id), name: String(p.name) })))
    } catch { setResults([]) } finally { setLoading(false) }
  }

  const createNew = async () => {
    const name = search.trim()
    if (!name) return
    setCreating(true)
    try {
      const r = await fetch('/api/parents/quick', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, personType: personType || 'ספק' }),
      })
      const d = await r.json()
      if (d.id) { onSelect({ id: d.id, name: d.name }); setSearch(''); setResults([]) }
    } catch {} finally { setCreating(false) }
  }

  if (value) {
    return (
      <div className="p-2.5 bg-blue-50 rounded-lg border border-blue-200 flex items-center justify-between">
        <button onClick={() => onSelect(null)} className="text-xs text-blue-600 hover:text-blue-800 font-semibold">שנה</button>
        <span className="text-sm font-medium text-gray-800">{valueName || '—'}</span>
      </div>
    )
  }

  return (
    <div>
      <input
        value={search}
        onChange={e => run(e.target.value)}
        placeholder={placeholder}
        dir="rtl"
        className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 text-right mb-2"
      />
      {results.length > 0 && (
        <div className="space-y-1 max-h-40 overflow-y-auto border border-gray-100 rounded-lg">
          {results.map(p => (
            <button key={p.id}
              onClick={() => { onSelect(p); setSearch(''); setResults([]) }}
              className="w-full text-right px-3 py-1.5 text-sm hover:bg-blue-50 transition-colors border-b border-gray-50 last:border-b-0 text-gray-700">
              {p.name}
            </button>
          ))}
        </div>
      )}
      {search.trim() && results.length === 0 && !loading && (
        canCreate ? (
          <button onClick={createNew} disabled={creating}
            className="w-full text-center px-3 py-2 text-sm rounded-lg border border-dashed border-[#1a3a7a]/40 text-[#1a3a7a] hover:bg-[#1a3a7a]/5 disabled:opacity-60 transition-colors">
            {creating ? 'יוצר...' : `➕ צור ספק חדש: "${search.trim()}"`}
          </button>
        ) : (
          <div className="text-xs text-gray-400 text-center py-2">לא נמצאו תוצאות</div>
        )
      )}
    </div>
  )
}
