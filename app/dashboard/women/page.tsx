'use client'

import { useEffect, useState, useRef } from 'react'

interface Woman {
  id: string
  name: string
  parentName: string
  baseHourlyRate: number
  monthlyHoursDecimal: number
  fixedBonus: number
  exceptionalExpenses: number
  salaryGross: number
  isFixedSalary: boolean
  status: string
  role: string[]
  notes: string
}

function fmt(n: number) {
  return n > 0 ? `₪${new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)}` : '—'
}

function NumCell({ value, onSave, highlight = false }: { value: number; onSave: (v: number) => void; highlight?: boolean }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(String(value || ''))
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (editing) return (
    <input
      ref={ref}
      type="number" value={draft} min="0" step="10"
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); const n = Number(draft); if (!isNaN(n) && n !== value) onSave(n) }}
      onKeyDown={e => { if (e.key === 'Enter') ref.current?.blur(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false) } }}
      className="w-24 px-2 py-1 rounded border border-[#1a3a7a] text-sm text-center focus:outline-none"
    />
  )
  return (
    <button onClick={() => { setDraft(String(value || '')); setEditing(true) }}
      className={`tabular-nums text-sm hover:underline hover:text-[#1a3a7a] cursor-pointer ${highlight ? 'font-semibold text-[#1a3a7a]' : 'text-gray-700'}`}>
      {fmt(value)}
    </button>
  )
}

function TextCell({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => { if (editing) ref.current?.focus() }, [editing])

  if (editing) return (
    <input ref={ref} value={draft}
      onChange={e => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSave(draft) }}
      onKeyDown={e => { if (e.key === 'Enter') ref.current?.blur(); if (e.key === 'Escape') { setDraft(value); setEditing(false) } }}
      className="w-36 px-2 py-1 rounded border border-[#1a3a7a] text-sm focus:outline-none"
    />
  )
  return (
    <button onClick={() => { setDraft(value); setEditing(true) }}
      className="text-sm text-gray-700 hover:underline hover:text-[#1a3a7a] cursor-pointer text-right">
      {value || <span className="text-gray-300">—</span>}
    </button>
  )
}

export default function WomenPage() {
  const [women, setWomen]   = useState<Woman[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState<Record<string, boolean>>({})
  const [search, setSearch]   = useState('')

  useEffect(() => {
    setLoading(true)
    fetch('/api/women')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setWomen(d) })
      .finally(() => setLoading(false))
  }, [])

  const patch = async (id: string, fields: Partial<Woman>) => {
    setSaving(prev => ({ ...prev, [id]: true }))
    setWomen(prev => prev.map(w => w.id === id ? { ...w, ...fields } : w))
    try {
      await fetch(`/api/women/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
    } catch { /* revert on error */ }
    finally { setSaving(prev => ({ ...prev, [id]: false })) }
  }

  const filtered = women.filter(w => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return w.name.toLowerCase().includes(q) || w.parentName.toLowerCase().includes(q)
  })

  const totalGross = filtered.reduce((s, w) => s + w.salaryGross, 0)

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">נשים — שכר</h1>
        <span className="text-sm text-gray-400">{filtered.length} מורות / עובדות</span>
        <div className="mr-auto text-sm font-semibold text-[#1a3a7a]">
          סה״כ: ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(totalGross)}
        </div>
      </div>

      <input
        value={search} onChange={e => setSearch(e.target.value)}
        placeholder="חיפוש שם..."
        className="px-3 py-2 rounded-lg border border-gray-200 text-sm w-60 focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
      />

      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500 text-right">
              <th className="px-4 py-3 font-semibold">שם</th>
              <th className="px-4 py-3 font-semibold">בעל / קישור</th>
              <th className="px-4 py-3 font-semibold">תפקיד</th>
              <th className="px-4 py-3 font-semibold text-center">שעות/חודש</th>
              <th className="px-4 py-3 font-semibold text-center">שכר בסיס/שעה</th>
              <th className="px-4 py-3 font-semibold text-center">תוספת קבועה</th>
              <th className="px-4 py-3 font-semibold text-center">הוצאות חריגות</th>
              <th className="px-4 py-3 font-semibold text-center">סה״כ לתשלום</th>
              <th className="px-4 py-3 font-semibold">הערות</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {loading ? (
              [1,2,3,4,5].map(i => (
                <tr key={i}>
                  {[1,2,3,4,5,6,7,8,9,10].map(j => (
                    <td key={j} className="px-4 py-3"><div className="h-5 bg-gray-100 rounded animate-pulse" /></td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr><td colSpan={10} className="px-4 py-12 text-center text-gray-400">אין נתונים</td></tr>
            ) : (
              filtered.map(w => (
                <tr key={w.id} className={`hover:bg-gray-50/50 transition-colors ${saving[w.id] ? 'opacity-60' : ''}`}>
                  <td className="px-4 py-2.5">
                    <div className="font-semibold text-gray-900">{w.name}</div>
                    {w.status && <div className="text-[11px] text-gray-400">{w.status}</div>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500 text-xs">{w.parentName || '—'}</td>
                  <td className="px-4 py-2.5">
                    <div className="flex flex-wrap gap-0.5">
                      {w.role.map(r => (
                        <span key={r} className="px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600 text-[10px] font-medium">{r}</span>
                      ))}
                      {w.role.length === 0 && <span className="text-gray-300 text-xs">—</span>}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {w.isFixedSalary
                      ? <span className="text-xs text-gray-400 italic">קבוע</span>
                      : <NumCell value={w.monthlyHoursDecimal} onSave={v => patch(w.id, { monthlyHoursDecimal: v })} />}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {w.isFixedSalary
                      ? <span className="text-xs text-gray-400 italic">—</span>
                      : <NumCell value={w.baseHourlyRate} onSave={v => patch(w.id, { baseHourlyRate: v })} />}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <NumCell value={w.fixedBonus} onSave={v => patch(w.id, { fixedBonus: v })} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <NumCell value={w.exceptionalExpenses} onSave={v => patch(w.id, { exceptionalExpenses: v })} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    {w.isFixedSalary
                      ? <NumCell value={w.salaryGross} onSave={v => patch(w.id, { salaryGross: v })} highlight />
                      : <span className="font-semibold text-[#1a3a7a] tabular-nums">{fmt(w.salaryGross)}</span>}
                  </td>
                  <td className="px-4 py-2.5">
                    <TextCell value={w.notes} onSave={v => patch(w.id, { notes: v })} />
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <label className="flex items-center gap-1 cursor-pointer justify-center" title="שכר קבוע (לא לפי שעות)">
                      <input type="checkbox" checked={w.isFixedSalary}
                        onChange={e => patch(w.id, { isFixedSalary: e.target.checked })}
                        className="w-3.5 h-3.5 rounded border-gray-300 text-purple-600 focus:ring-purple-300" />
                      <span className="text-[10px] text-gray-400">קבוע</span>
                    </label>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {!loading && filtered.length > 0 && (
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50">
                <td colSpan={7} className="px-4 py-2 text-xs text-gray-500">סה״כ</td>
                <td className="px-4 py-2 text-center font-bold text-[#1a3a7a] tabular-nums">
                  ₪{new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(totalGross)}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
