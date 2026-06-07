'use client'

import { useState } from 'react'

interface ParentRow {
  id: string
  name: string
  father_phone?: string
  mother_phone?: string
  id_number?: string
  city?: string
  status?: string
}

interface MergeSummary {
  transactions: number
  plannedPayments: number
  students: number
  women: number
  standingOrders: number
  overrideFields: string[]
}

const FIELD_LABELS: Record<string, string> = {
  name: 'שם',
  father_phone: 'טלפון אב',
  mother_phone: 'טלפון אם',
  id_number: 'ת"ז',
  city: 'עיר',
  status: 'סטטוס',
}
const FIELDS = Object.keys(FIELD_LABELS) as (keyof ParentRow)[]

export default function MergeParentsTab() {
  const [searchBy, setSearchBy]     = useState<'tz' | 'phone' | 'name'>('tz')
  const [query, setQuery]           = useState('')
  const [groups, setGroups]         = useState<ParentRow[][]>([])
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  const [selected, setSelected]     = useState<[ParentRow, ParentRow] | null>(null)
  const [keepIdx, setKeepIdx]       = useState<0 | 1>(0)
  const [overrides, setOverrides]   = useState<Record<string, string>>({})
  const [preview, setPreview]       = useState<{ dryRun: true; summary: MergeSummary } | null>(null)
  const [merging, setMerging]       = useState(false)
  const [done, setDone]             = useState(false)

  /* ── Search ── */
  const search = async () => {
    setLoading(true); setError(''); setGroups([]); setSelected(null); setDone(false)
    try {
      const params = new URLSearchParams({ by: searchBy, q: query })
      const r = await fetch(`/api/parents/duplicates?${params}`)
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setGroups(d.groups ?? [])
    } catch { setError('שגיאת רשת') }
    finally { setLoading(false) }
  }

  /* ── Open pair for merge ── */
  const openPair = (a: ParentRow, b: ParentRow) => {
    setSelected([a, b])
    setKeepIdx(0)
    // default overrides: take from "keep" parent
    const o: Record<string, string> = {}
    for (const f of FIELDS) o[f] = String(a[f] ?? '')
    setOverrides(o)
    setPreview(null); setDone(false)
  }

  const keeper  = selected ? selected[keepIdx]     : null
  const loser   = selected ? selected[keepIdx ^ 1 as 0|1] : null

  const flipKeep = () => {
    if (!selected) return
    const newIdx = (keepIdx ^ 1) as 0 | 1
    setKeepIdx(newIdx)
    const o: Record<string, string> = {}
    for (const f of FIELDS) o[f] = String(selected[newIdx][f] ?? '')
    setOverrides(o)
    setPreview(null)
  }

  /* ── Dry-run preview ── */
  const runPreview = async () => {
    if (!keeper || !loser) return
    setMerging(true); setError('')
    try {
      const r = await fetch('/api/parents/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: keeper.id, mergeId: loser.id, overrides, dryRun: true }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setPreview(d)
    } catch { setError('שגיאת רשת') }
    finally { setMerging(false) }
  }

  /* ── Execute merge ── */
  const executeMerge = async () => {
    if (!keeper || !loser) return
    if (!confirm(`לאחד את "${loser.name}" אל "${keeper.name}"? פעולה זו בלתי הפיכה.`)) return
    setMerging(true); setError('')
    try {
      const r = await fetch('/api/parents/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keepId: keeper.id, mergeId: loser.id, overrides }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setDone(true)
      setSelected(null)
      // remove merged parents from groups
      setGroups(prev => prev.map(g => g.filter(p => p.id !== loser.id)).filter(g => g.length >= 2))
    } catch { setError('שגיאת רשת') }
    finally { setMerging(false) }
  }

  return (
    <div className="space-y-6" dir="rtl">

      {/* Search bar */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">חיפוש כפולים</h3>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex rounded-xl border border-gray-200 overflow-hidden text-sm">
            {(['tz', 'phone', 'name'] as const).map(opt => (
              <button key={opt} onClick={() => setSearchBy(opt)}
                className={`px-4 py-2 font-medium transition-colors ${searchBy === opt ? 'text-white' : 'text-gray-600 hover:bg-gray-50'}`}
                style={searchBy === opt ? { background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' } : {}}>
                {{ tz: 'ת"ז', phone: 'טלפון', name: 'שם' }[opt]}
              </button>
            ))}
          </div>
          {searchBy === 'name' && (
            <input value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && search()}
              placeholder="חפש לפי שם..."
              className="flex-1 min-w-[180px] px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 text-right" />
          )}
          <button onClick={search} disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
            {loading ? 'מחפש...' : 'חפש כפולים'}
          </button>
        </div>

        {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
        {done  && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium">✓ האיחוד הושלם בהצלחה</div>}
      </div>

      {/* Results */}
      {groups.length > 0 && (
        <div className="space-y-3">
          {groups.map((group, gi) => (
            <div key={gi} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 text-xs font-semibold text-amber-700">
                נמצאו {group.length} כרטיסים כפולים
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-xs text-gray-500 text-right">
                    <th className="px-4 py-2.5">שם</th>
                    <th className="px-4 py-2.5">ת"ז</th>
                    <th className="px-4 py-2.5">טלפון אב</th>
                    <th className="px-4 py-2.5">עיר</th>
                    <th className="px-4 py-2.5 w-20" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {group.map((p, pi) => (
                    <tr key={p.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{p.name}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs" dir="ltr">{p.id_number ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs" dir="ltr">{p.father_phone ?? '—'}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs">{p.city ?? '—'}</td>
                      <td className="px-4 py-2.5 text-center">
                        {pi < group.length - 1 && (
                          <button onClick={() => openPair(p, group[pi + 1])}
                            className="text-xs px-3 py-1 rounded-lg bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-medium whitespace-nowrap">
                            ← אחד →
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && !loading && query === '' && searchBy !== 'name' && (
        <div className="text-center text-gray-400 text-sm py-8">לחץ "חפש כפולים" כדי לסרוק את כל הכרטיסים</div>
      )}

      {/* Merge panel */}
      {selected && keeper && loser && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-5 space-y-5">
          <div className="flex items-center justify-between">
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            <h3 className="text-base font-bold text-gray-800">בחר שדות לאיחוד</h3>
          </div>

          {/* Keep / Merge headers */}
          <div className="grid grid-cols-3 gap-3 text-sm font-semibold text-center">
            <div className="rounded-xl p-3 bg-emerald-50 border border-emerald-200 text-emerald-800">
              ✓ נשמר<br /><span className="text-xs font-normal">{keeper.name}</span>
            </div>
            <div className="flex items-center justify-center">
              <button onClick={flipKeep}
                className="px-3 py-2 text-xs rounded-xl border border-gray-200 hover:bg-gray-50 text-gray-600 font-medium">
                ⇄ החלף
              </button>
            </div>
            <div className="rounded-xl p-3 bg-red-50 border border-red-200 text-red-700">
              ✕ יימחק<br /><span className="text-xs font-normal">{loser.name}</span>
            </div>
          </div>

          {/* Field-by-field chooser */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 text-right">
                  <th className="px-4 py-2.5">שדה</th>
                  <th className="px-4 py-2.5 text-emerald-700">ערך נשמר</th>
                  <th className="px-4 py-2.5 text-red-600">ערך נמחק</th>
                  <th className="px-4 py-2.5 text-center w-28">בחר</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {FIELDS.map(f => {
                  const vKeep  = String(keeper[f] ?? '')
                  const vLoser = String(loser[f] ?? '')
                  const chosen = overrides[f] ?? vKeep
                  return (
                    <tr key={f} className={chosen === vLoser && vLoser !== vKeep ? 'bg-yellow-50' : ''}>
                      <td className="px-4 py-2.5 text-gray-600 font-medium">{FIELD_LABELS[f]}</td>
                      <td className="px-4 py-2.5 text-gray-700 text-xs" dir="ltr">{vKeep || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-gray-500 text-xs" dir="ltr">{vLoser || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2.5 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => setOverrides(o => ({ ...o, [f]: vKeep }))}
                            className={`px-2 py-1 text-xs rounded-lg border transition-colors ${chosen === vKeep ? 'bg-emerald-100 border-emerald-300 text-emerald-700 font-bold' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                            נשמר
                          </button>
                          {vLoser && vLoser !== vKeep && (
                            <button onClick={() => setOverrides(o => ({ ...o, [f]: vLoser }))}
                              className={`px-2 py-1 text-xs rounded-lg border transition-colors ${chosen === vLoser ? 'bg-yellow-100 border-yellow-300 text-yellow-700 font-bold' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                              נמחק
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {/* Preview result */}
          {preview && (
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-sm text-blue-800 space-y-1">
              <p className="font-semibold text-center mb-2">תצוגה מקדימה — מה יקרה באיחוד:</p>
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                {[
                  ['עסקאות', preview.summary.transactions],
                  ['תשלומים מתוכננים', preview.summary.plannedPayments],
                  ['תלמידים', preview.summary.students],
                  ['נשים', preview.summary.women],
                  ['הוראות קבע', preview.summary.standingOrders],
                ].map(([label, count]) => (
                  <div key={label as string} className="bg-white rounded-lg p-2 border border-blue-100">
                    <div className="font-bold text-blue-900 text-base">{count}</div>
                    <div className="text-blue-600">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <div className="flex gap-2 pt-1">
            <button onClick={runPreview} disabled={merging}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-indigo-300 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50">
              {merging && !preview ? 'בודק...' : '🔍 תצוגה מקדימה'}
            </button>
            <button onClick={executeMerge} disabled={merging}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50 text-white"
              style={{ background: 'linear-gradient(135deg, #7f1d1d, #b91c1c)' }}>
              {merging ? 'מאחד...' : '⚡ אחד עכשיו'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
