'use client'

import { useState } from 'react'

/* ─── Types ─────────────────────────────────────────────────────── */
interface ParentFull {
  id: string
  name?: string
  first_name?: string
  last_name?: string
  father_phone?: string
  mother_phone?: string
  email?: string
  city?: string
  address?: string
  id_number?: string
  status?: string | string[]
  tuition_balance?: number
  tuition_total?: number
  notes?: string
  [key: string]: unknown
}

interface LinkedRecord { id: string; label: string; sub?: string; amount?: number }

interface ParentData {
  parent: ParentFull
  students: LinkedRecord[]
  transactions: LinkedRecord[]
  plannedPayments: LinkedRecord[]
  standingOrders: LinkedRecord[]
}

type SearchMode = 'tz' | 'phone' | 'name'

/* ─── Field definitions ─────────────────────────────────────────── */
const SCALAR_FIELDS: { key: string; label: string }[] = [
  { key: 'name',          label: 'שם מלא' },
  { key: 'first_name',    label: 'שם פרטי' },
  { key: 'last_name',     label: 'שם משפחה' },
  { key: 'id_number',     label: 'ת"ז' },
  { key: 'father_phone',  label: 'טלפון אב' },
  { key: 'mother_phone',  label: 'טלפון אם' },
  { key: 'email',         label: 'אימייל' },
  { key: 'city',          label: 'עיר' },
  { key: 'address',       label: 'כתובת' },
  { key: 'status',        label: 'סטטוס' },
  { key: 'notes',         label: 'הערות' },
]

const LINKED_SECTIONS: { key: keyof ParentData; label: string }[] = [
  { key: 'students',        label: 'ילדים' },
  { key: 'standingOrders',  label: 'הוראות קבע' },
  { key: 'plannedPayments', label: 'תשלומים מתוכננים' },
  { key: 'transactions',    label: 'עסקאות' },
]

const fmtVal = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

const fmtAmt = (n: number) =>
  `${n < 0 ? '-' : ''}₪${Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}`

/* ─── Data fetching ─────────────────────────────────────────────── */
async function fetchParentData(id: string): Promise<ParentData> {
  const [pRes, txRes, ppRes, soRes, stuRes] = await Promise.all([
    fetch(`/api/parents/${id}`),
    fetch(`/api/transactions?parentId=${id}&limit=200`),
    fetch(`/api/planned-payments?parentId=${id}&limit=200`),
    fetch(`/api/standing-orders?parentId=${id}`),
    fetch(`/api/students`),
  ])
  const pJson   = await pRes.json()
  const txJson  = await txRes.json()
  const ppJson  = await ppRes.json()
  const soJson  = await soRes.json()
  const stuJson = await stuRes.json()

  const parent: ParentFull = pJson.parent ?? pJson

  const toRecs = (
    arr: unknown[],
    labelFn: (r: Record<string,unknown>) => string,
    subFn?: (r: Record<string,unknown>) => string,
    amtFn?: (r: Record<string,unknown>) => number,
  ): LinkedRecord[] =>
    arr.map(r => {
      const row = r as Record<string,unknown>
      return { id: String(row.id ?? ''), label: labelFn(row), sub: subFn?.(row), amount: amtFn?.(row) }
    })

  const txArr  = Array.isArray(txJson) ? txJson : (txJson.data ?? [])
  const ppArr  = Array.isArray(ppJson) ? ppJson : (ppJson.data ?? [])
  const soArr  = Array.isArray(soJson) ? soJson : []
  // Filter students by parent_ids containing this parent's id
  const allStu = Array.isArray(stuJson) ? stuJson : (stuJson.data ?? stuJson.students ?? [])
  const stuArr = (allStu as Record<string,unknown>[]).filter(s => {
    const pids = s.parent_ids ?? s.parentIds
    return Array.isArray(pids) ? pids.includes(id) : false
  })

  return {
    parent,
    transactions:    toRecs(txArr,  r => String(r.type ?? r.transaction_type ?? ''), r => String(r.date ?? '').slice(0,10), r => Number(r.amount ?? 0)),
    plannedPayments: toRecs(ppArr,  r => String(r.type ?? r.payment_type ?? ''), r => `${r.month_year ?? r.monthYear ?? ''} · ${r.status ?? ''}`, r => Number(r.amount ?? 0)),
    standingOrders:  toRecs(soArr,  r => String(r.standingOrderType ?? r.standing_order_type ?? ''), r => r.bankName ? String(r.bankName) : r.cardLast4 ? `****${r.cardLast4}` : ''),
    students:        toRecs(stuArr, r => String(r.name ?? ''), r => String(r.class_name ?? r.class ?? '')),
  }
}

/* ─── Main component ─────────────────────────────────────────────── */
export default function MergeParentsTab({ onOpenParent }: { onOpenParent?: (id: string) => void }) {
  const [searchBy, setSearchBy] = useState<SearchMode>('tz')
  const [query, setQuery]       = useState('')
  const [groups, setGroups]     = useState<{ id: string; name: string; id_number?: string; father_phone?: string }[][]>([])
  const [loading, setLoading]   = useState(false)
  const [searchError, setSearchError] = useState('')

  const [allData, setAllData]       = useState<ParentData[]>([])
  const [dataLoading, setDataLoading] = useState(false)
  const [activeGroupIds, setActiveGroupIds] = useState<string[] | null>(null)

  // primaryId = the card that survives
  const [primaryId, setPrimaryId]   = useState('')
  // selections[fieldKey] = parentId whose value wins (default = primaryId for all)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [merging, setMerging]       = useState(false)
  const [mergeError, setMergeError] = useState('')
  const [done, setDone]             = useState(false)
  // excluded linked record IDs (from non-primary parents) that should NOT be re-pointed
  const [excludedLinked, setExcludedLinked] = useState<Set<string>>(new Set())
  const toggleLinked = (id: string) => setExcludedLinked(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAllLinked = (ids: string[], exclude: boolean) =>
    setExcludedLinked(s => { const n = new Set(s); ids.forEach(id => exclude ? n.add(id) : n.delete(id)); return n })

  /* Search */
  const search = async () => {
    setLoading(true); setSearchError(''); setGroups([]); setActiveGroupIds(null); setDone(false)
    try {
      const r = await fetch(`/api/parents/duplicates?by=${searchBy}&q=${encodeURIComponent(query)}`)
      const d = await r.json()
      if (d.error) { setSearchError(d.error); return }
      setGroups(d.groups ?? [])
    } catch { setSearchError('שגיאת רשת') }
    finally { setLoading(false) }
  }

  /* Open group */
  const openGroup = async (group: { id: string; name: string }[]) => {
    setActiveGroupIds(group.map(p => p.id))
    setDataLoading(true); setMergeError(''); setDone(false); setAllData([])
    try {
      const results = await Promise.all(group.map(p => fetchParentData(p.id)))
      setAllData(results)
      const pid = group[0].id
      setPrimaryId(pid)
      const sel: Record<string, string> = {}
      for (const { key } of SCALAR_FIELDS) sel[key] = pid
      setSelections(sel)
    } catch { setMergeError('שגיאה בטעינת נתונים') }
    finally { setDataLoading(false) }
  }

  /* Change primary → reset all field selections to new primary */
  const handleSetPrimary = (id: string) => {
    setPrimaryId(id)
    const sel: Record<string, string> = {}
    for (const { key } of SCALAR_FIELDS) sel[key] = id
    setSelections(sel)
  }

  /* Execute merge */
  const executeMerge = async () => {
    const primary = allData.find(d => d.parent.id === primaryId)
    if (!primary) return
    const loserIds = allData.map(d => d.parent.id).filter(id => id !== primaryId)
    if (!confirm(`לאחד ${loserIds.length} כרטיסים אל "${primary.parent.name}"?\nפעולה זו בלתי הפיכה.`)) return

    setMerging(true); setMergeError('')
    try {
      // overrides = fields where a non-primary parent wins
      const overrides: Record<string, unknown> = {}
      for (const { key } of SCALAR_FIELDS) {
        const winnerId = selections[key]
        if (winnerId && winnerId !== primaryId) {
          const winner = allData.find(d => d.parent.id === winnerId)
          if (winner) overrides[key] = winner.parent[key]
        }
      }
      const excludeTxIds = [...excludedLinked].filter(id =>
        allData.some(d => d.parent.id !== primaryId && d.transactions.some(t => t.id === id))
      )
      const excludePpIds = [...excludedLinked].filter(id =>
        allData.some(d => d.parent.id !== primaryId && d.plannedPayments.some(p => p.id === id))
      )
      for (const loserId of loserIds) {
        const r = await fetch('/api/parents/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepId: primaryId, mergeId: loserId, overrides, excludeTxIds, excludePpIds }),
        })
        const d = await r.json()
        if (d.error) throw new Error(d.error)
      }
      setDone(true); setActiveGroupIds(null); setAllData([]); setExcludedLinked(new Set())
      setGroups(prev => prev.filter(g => !g.some(p => p.id === primaryId || loserIds.includes(p.id))))
      if (onOpenParent) onOpenParent(primaryId)
    } catch (e) { setMergeError(String(e)) }
    finally { setMerging(false) }
  }

  /* Build merged preview values */
  const mergedFields: Record<string, string> = {}
  for (const { key } of SCALAR_FIELDS) {
    const winnerId = selections[key]
    const winner = allData.find(d => d.parent.id === winnerId) ?? allData.find(d => d.parent.id === primaryId)
    mergedFields[key] = fmtVal(winner?.parent[key])
  }

  const n = allData.length

  return (
    <div className="space-y-5" dir="rtl">

      {/* Search */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">חיפוש כרטיסים לאיחוד</h3>
        <div className="flex gap-2 flex-wrap items-center">
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
              className="flex-1 min-w-[160px] px-4 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 text-right" />
          )}
          <button onClick={search} disabled={loading}
            className="px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
            {loading ? 'מחפש...' : 'חפש כפולים'}
          </button>
        </div>
        {searchError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{searchError}</div>}
        {done && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium">✓ האיחוד הושלם בהצלחה!</div>}
      </div>

      {/* Groups list */}
      {groups.length > 0 && !activeGroupIds && (
        <div className="space-y-3">
          {groups.map((group, gi) => (
            <div key={gi} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <button onClick={() => openGroup(group)}
                  className="text-xs px-3 py-1.5 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
                  פתח לאיחוד →
                </button>
                <span className="text-xs font-semibold text-amber-700">{group.length} כרטיסים כפולים</span>
              </div>
              <div className="divide-y divide-gray-50">
                {group.map(p => (
                  <div key={p.id} className="px-5 py-2.5 flex justify-between text-sm">
                    <span className="text-gray-400 text-xs" dir="ltr">{p.father_phone ?? p.id_number ?? ''}</span>
                    <span className="font-medium text-gray-800">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && !loading && !activeGroupIds && searchBy !== 'name' && (
        <div className="text-center text-gray-400 text-sm py-10">לחץ "חפש כפולים" לסריקה לפי ת"ז או טלפון</div>
      )}

      {/* Merge workspace */}
      {activeGroupIds && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => { setActiveGroupIds(null); setAllData([]) }}
              className="text-sm text-gray-500 hover:text-gray-700">← חזור לרשימה</button>
            <h3 className="font-bold text-gray-800">איחוד כרטיסים</h3>
          </div>

          {dataLoading
            ? <div className="text-center text-gray-400 py-12 animate-pulse">טוען נתונים...</div>
            : allData.length > 0 && (() => {
                // column widths: n parent cols + 1 preview col
                const colStyle = `repeat(${n}, minmax(0,1fr)) minmax(180px,220px)`
                const headerBg = (id: string) => id === primaryId ? '#d1fae5' : '#fef3c7'
                const headerBorder = (id: string) => id === primaryId ? '#34d399' : '#fcd34d'

                return (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                    <p className="text-xs text-gray-500 text-center py-2 border-b border-gray-100">
                      לחץ על ערך לבחירה · שדות מקושרים מאוחדים מכל הכרטיסים · ירוק = יכנס למאוחד
                    </p>

                    {/* Column headers */}
                    <div className="grid border-b border-gray-200" style={{ gridTemplateColumns: colStyle }}>
                      {allData.map(d => (
                        <div key={d.parent.id} className="px-3 py-3 flex flex-col items-center gap-1.5 border-l border-gray-100 first:border-l-0"
                          style={{ background: headerBg(d.parent.id), borderBottom: `3px solid ${headerBorder(d.parent.id)}` }}>
                          <span className="font-bold text-sm text-gray-800 text-center">{d.parent.name}</span>
                          <button onClick={() => handleSetPrimary(d.parent.id)}
                            className={`text-xs px-3 py-1 rounded-full font-semibold border transition-colors ${
                              d.parent.id === primaryId
                                ? 'bg-emerald-500 text-white border-emerald-500'
                                : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                            }`}>
                            {d.parent.id === primaryId ? '✓ ראשי (ישמר)' : 'הגדר ראשי'}
                          </button>
                        </div>
                      ))}
                      <div className="px-3 py-3 flex items-center justify-center bg-indigo-600 border-l border-indigo-500">
                        <span className="font-bold text-sm text-white">תצוגה מקדימה</span>
                      </div>
                    </div>

                    {/* Scalar fields — one row per field */}
                    {SCALAR_FIELDS.map(({ key, label }) => {
                      const vals = allData.map(d => fmtVal(d.parent[key]))
                      const allEmpty = vals.every(v => !v)
                      return (
                        <div key={key}
                          className="grid border-b border-gray-100 last:border-b-0"
                          style={{ gridTemplateColumns: colStyle }}>
                          {allData.map((d, i) => {
                            const val = vals[i]
                            const isWinner  = selections[key] === d.parent.id
                            const hasOtherWinner = !!selections[key] && selections[key] !== d.parent.id
                            return (
                              <button key={d.parent.id}
                                onClick={() => !allEmpty && setSelections(s => ({ ...s, [key]: d.parent.id }))}
                                className={`text-right px-3 py-2.5 border-l border-gray-100 first:border-l-0 transition-colors w-full ${
                                  isWinner ? 'bg-emerald-50' :
                                  hasOtherWinner && val ? 'bg-red-50' : 'hover:bg-gray-50'
                                }`}>
                                <div className="text-xs text-gray-400 mb-0.5">{label}</div>
                                <div className={`text-sm font-medium min-h-[1.25rem] ${
                                  isWinner ? 'text-emerald-800' :
                                  hasOtherWinner && val ? 'text-red-500 line-through opacity-60' :
                                  val ? 'text-gray-700' : 'text-gray-300'
                                }`}>
                                  {val || '—'}
                                  {isWinner && val && <span className="mr-1 text-emerald-500">✓</span>}
                                </div>
                              </button>
                            )
                          })}
                          {/* Preview cell */}
                          <div className="px-3 py-2.5 bg-indigo-50 border-l border-indigo-100">
                            <div className="text-xs text-indigo-400 mb-0.5">{label}</div>
                            <div className={`text-sm font-medium min-h-[1.25rem] ${mergedFields[key] ? 'text-indigo-900' : 'text-indigo-200'}`}>
                              {mergedFields[key] || '—'}
                            </div>
                          </div>
                        </div>
                      )
                    })}

                    {/* Linked sections */}
                    {LINKED_SECTIONS.map(({ key, label }) => {
                      const includedCount = allData.flatMap(d => {
                        const items = d[key] as LinkedRecord[]
                        if (d.parent.id === primaryId) return items
                        return items.filter(item => !excludedLinked.has(item.id))
                      }).length
                      return (
                        <div key={key}
                          className="grid border-b border-gray-100 last:border-b-0"
                          style={{ gridTemplateColumns: colStyle }}>
                          {allData.map(d => {
                            const items = d[key] as LinkedRecord[]
                            const isLoser = d.parent.id !== primaryId
                            const loserIds = items.map(i => i.id)
                            const allExcluded = loserIds.length > 0 && loserIds.every(id => excludedLinked.has(id))
                            return (
                              <div key={d.parent.id} className="px-3 py-2.5 bg-emerald-50/50 border-l border-gray-100 first:border-l-0">
                                <div className="flex items-center justify-between mb-1.5">
                                  <div className="flex items-center gap-1">
                                    {isLoser && items.length > 0 && (
                                      <button onClick={() => toggleAllLinked(loserIds, !allExcluded)}
                                        className="text-xs text-indigo-500 hover:underline">
                                        {allExcluded ? 'בחר הכל' : 'בטל הכל'}
                                      </button>
                                    )}
                                  </div>
                                  <span className="text-xs font-semibold text-emerald-700">
                                    {label} ({items.length})
                                  </span>
                                </div>
                                {items.length > 0
                                  ? <div className="space-y-1">
                                      {items.map(item => {
                                        const excluded = isLoser && excludedLinked.has(item.id)
                                        return (
                                          <div key={item.id}
                                            className={`flex items-center gap-1.5 text-xs ${excluded ? 'opacity-40' : ''}`}>
                                            {isLoser && (
                                              <input type="checkbox" checked={!excluded}
                                                onChange={() => toggleLinked(item.id)}
                                                className="accent-emerald-600 cursor-pointer flex-shrink-0" />
                                            )}
                                            {!isLoser && <span className="w-3.5 flex-shrink-0" />}
                                            <span className={`flex-1 truncate ${excluded ? 'line-through text-gray-400' : 'text-emerald-800'}`}>
                                              {item.label}{item.sub ? ` · ${item.sub}` : ''}
                                            </span>
                                            {item.amount !== undefined && (
                                              <span className={`flex-shrink-0 font-medium ${item.amount < 0 ? 'text-red-500' : 'text-gray-600'}`}>
                                                {fmtAmt(item.amount)}
                                              </span>
                                            )}
                                          </div>
                                        )
                                      })}
                                    </div>
                                  : <div className="text-xs text-gray-300">אין</div>
                                }
                              </div>
                            )
                          })}
                          {/* Preview: included count */}
                          <div className="px-3 py-2.5 bg-indigo-50 border-l border-indigo-100 flex flex-col justify-center">
                            <div className="text-xs text-indigo-400 mb-0.5">{label}</div>
                            <div className="text-sm font-bold text-indigo-900">{includedCount} רשומות</div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )
              })()
          }

          {mergeError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{mergeError}</div>}

          {allData.length > 0 && (
            <button onClick={executeMerge} disabled={merging}
              className="w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-50 text-white shadow-lg"
              style={{ background: 'linear-gradient(135deg, #1a3a7a, #0d1f52)' }}>
              {merging ? 'מאחד...' : `⚡ אחד ${allData.length} כרטיסים → ${allData.find(d=>d.parent.id===primaryId)?.parent.name}`}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
