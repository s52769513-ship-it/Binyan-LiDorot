'use client'

import { useEffect, useRef, useState } from 'react'

/* ─── Types ─────────────────────────────────────────────────────── */
interface ParentFull {
  id: string
  name: string
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
  children_count?: number
  notes?: string
}

interface LinkedRecord {
  id: string
  label: string
  sub?: string
  amount?: number
}

interface ParentData {
  parent: ParentFull
  students:  LinkedRecord[]
  transactions: LinkedRecord[]
  plannedPayments: LinkedRecord[]
  standingOrders: LinkedRecord[]
}

type SearchMode = 'tz' | 'phone' | 'name'

/* ─── Field definitions ─────────────────────────────────────────── */
const SCALAR_FIELDS: { key: keyof ParentFull; label: string }[] = [
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

const LINKED_SECTIONS: { key: keyof ParentData; label: string; icon: string }[] = [
  { key: 'students',        label: 'ילדים',             icon: '👦' },
  { key: 'standingOrders',  label: 'הוראות קבע',        icon: '🏦' },
  { key: 'plannedPayments', label: 'תשלומים מתוכננים',  icon: '📋' },
  { key: 'transactions',    label: 'עסקאות',            icon: '💳' },
]

const fmtVal = (v: unknown) => {
  if (v === null || v === undefined || v === '') return ''
  if (Array.isArray(v)) return v.join(', ')
  return String(v)
}

const fmtAmt = (n: number | undefined) =>
  n !== undefined ? `₪${Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })}` : ''

/* ─── Fetch parent full data ────────────────────────────────────── */
async function fetchParentData(id: string): Promise<ParentData> {
  const [pRes, txRes, ppRes, soRes, stuRes] = await Promise.all([
    fetch(`/api/parents/${id}`),
    fetch(`/api/transactions?parentId=${id}&limit=200`),
    fetch(`/api/planned-payments?parentId=${id}&limit=200`),
    fetch(`/api/standing-orders?parentId=${id}`),
    fetch(`/api/students?parentId=${id}`),
  ])
  const p   = await pRes.json()
  const tx  = await txRes.json()
  const pp  = await ppRes.json()
  const so  = await soRes.json()
  const stu = await stuRes.json()

  const toRecs = (arr: unknown[], labelFn: (r: Record<string,unknown>) => string, subFn?: (r: Record<string,unknown>) => string, amtFn?: (r: Record<string,unknown>) => number | undefined): LinkedRecord[] =>
    (Array.isArray(arr) ? arr : []).map((r: unknown) => {
      const row = r as Record<string,unknown>
      return { id: String(row.id ?? ''), label: labelFn(row), sub: subFn?.(row), amount: amtFn?.(row) }
    })

  const txArr  = Array.isArray(tx) ? tx : (tx.data ?? [])
  const ppArr  = Array.isArray(pp) ? pp : (pp.data ?? [])
  const soArr  = Array.isArray(so) ? so : []
  const stuArr = Array.isArray(stu) ? stu : (stu.data ?? [])

  return {
    parent: p.parent ?? p,
    transactions:    toRecs(txArr,  r => String(r.type ?? r.transaction_type ?? ''), r => `${String(r.date ?? '').slice(0,10)}`, r => Number(r.amount ?? 0)),
    plannedPayments: toRecs(ppArr,  r => String(r.type ?? r.payment_type ?? ''),    r => `${String(r.month_year ?? r.monthYear ?? '')} · ${String(r.status ?? '')}`, r => Number(r.amount ?? 0)),
    standingOrders:  toRecs(soArr,  r => String(r.standingOrderType ?? r.standing_order_type ?? ''), r => r.bankName ? `${r.bankName}` : r.cardLast4 ? `****${r.cardLast4}` : ''),
    students:        toRecs(stuArr, r => String(r.name ?? r.student_name ?? ''), r => String(r.class_name ?? r.class ?? '')),
  }
}

/* ─── Single parent column ──────────────────────────────────────── */
function ParentColumn({
  data, isWinner, isPrimary, selections, onSelect, onSetPrimary,
}: {
  data: ParentData
  isWinner: boolean
  isPrimary: boolean
  selections: Record<string, string>  // fieldKey → parentId that wins
  onSelect: (field: string, parentId: string) => void
  onSetPrimary: () => void
}) {
  const p = data.parent
  const pid = p.id

  return (
    <div className={`flex flex-col rounded-2xl border-2 overflow-hidden ${isPrimary ? 'border-emerald-400' : 'border-gray-200'}`}>
      {/* Header */}
      <div className={`px-4 py-3 flex items-center justify-between ${isPrimary ? 'bg-emerald-50' : 'bg-gray-50'}`}>
        <button onClick={onSetPrimary}
          className={`text-xs px-3 py-1 rounded-full font-semibold border transition-colors ${isPrimary ? 'bg-emerald-500 text-white border-emerald-500' : 'border-gray-300 text-gray-500 hover:bg-gray-100'}`}>
          {isPrimary ? '✓ ראשי' : 'הגדר ראשי'}
        </button>
        <div className="text-right">
          <div className="font-bold text-gray-800 text-sm">{p.name}</div>
          {p.id_number && <div className="text-xs text-gray-400" dir="ltr">ת"ז: {p.id_number}</div>}
        </div>
      </div>

      {/* Scalar fields */}
      <div className="flex-1 divide-y divide-gray-50 overflow-y-auto">
        {SCALAR_FIELDS.map(({ key, label }) => {
          const val = fmtVal(p[key])
          if (!val) return null
          const isSelected = selections[key] === pid
          const isOtherSelected = selections[key] && selections[key] !== pid
          return (
            <button key={key} onClick={() => onSelect(key, pid)}
              className={`w-full text-right px-4 py-2.5 flex flex-col gap-0.5 transition-colors ${
                isSelected    ? 'bg-emerald-50 border-r-4 border-r-emerald-400' :
                isOtherSelected ? 'bg-red-50 border-r-4 border-r-red-300 opacity-60' :
                'hover:bg-gray-50'
              }`}>
              <span className="text-xs text-gray-400">{label}</span>
              <span className={`text-sm font-medium ${isSelected ? 'text-emerald-800' : isOtherSelected ? 'text-red-700 line-through' : 'text-gray-700'}`}>
                {val}
              </span>
            </button>
          )
        })}

        {/* Linked sections — always "+" (both merge) */}
        {LINKED_SECTIONS.map(({ key, label, icon }) => {
          const items = data[key] as LinkedRecord[]
          if (!items.length) return null
          return (
            <div key={key} className="px-4 py-2.5 bg-emerald-50/40">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-xs flex items-center justify-center font-bold">+</span>
                  {icon} {label} ({items.length})
                </span>
              </div>
              <div className="space-y-0.5">
                {items.slice(0, 4).map(item => (
                  <div key={item.id} className="text-xs text-emerald-800 flex justify-between">
                    <span>{item.amount !== undefined ? fmtAmt(item.amount) : ''}</span>
                    <span>{item.label}{item.sub ? ` · ${item.sub}` : ''}</span>
                  </div>
                ))}
                {items.length > 4 && <div className="text-xs text-gray-400">+{items.length - 4} נוספים</div>}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ─── Preview column ─────────────────────────────────────────────── */
function PreviewColumn({ allData, primaryId, selections }: {
  allData: ParentData[]
  primaryId: string
  selections: Record<string, string>
}) {
  const primary = allData.find(d => d.parent.id === primaryId)
  if (!primary) return null

  // Build merged parent fields
  const merged: Partial<ParentFull> = {}
  for (const { key } of SCALAR_FIELDS) {
    const winnerId = selections[key]
    if (winnerId) {
      const winner = allData.find(d => d.parent.id === winnerId)
      if (winner) merged[key] = winner.parent[key] as never
    } else {
      merged[key] = primary.parent[key] as never
    }
  }

  // Linked: union of all
  const allStudents  = allData.flatMap(d => d.students)
  const allSo        = allData.flatMap(d => d.standingOrders)
  const allPp        = allData.flatMap(d => d.plannedPayments)
  const allTx        = allData.flatMap(d => d.transactions)

  return (
    <div className="flex flex-col rounded-2xl border-2 border-indigo-300 overflow-hidden bg-indigo-50/30">
      <div className="px-4 py-3 bg-indigo-600 text-white">
        <div className="font-bold text-sm text-center">תצוגה מקדימה — מאוחד</div>
      </div>
      <div className="flex-1 divide-y divide-indigo-50 overflow-y-auto">
        {SCALAR_FIELDS.map(({ key, label }) => {
          const val = fmtVal(merged[key])
          if (!val) return null
          return (
            <div key={key} className="px-4 py-2.5">
              <div className="text-xs text-indigo-400">{label}</div>
              <div className="text-sm font-medium text-indigo-900">{val}</div>
            </div>
          )
        })}
        {[
          { label: 'ילדים', icon: '👦', items: allStudents },
          { label: 'הוראות קבע', icon: '🏦', items: allSo },
          { label: 'תשלומים מתוכננים', icon: '📋', items: allPp },
          { label: 'עסקאות', icon: '💳', items: allTx },
        ].filter(s => s.items.length > 0).map(({ label, icon, items }) => (
          <div key={label} className="px-4 py-2.5">
            <div className="text-xs text-indigo-500 font-semibold mb-1">{icon} {label}</div>
            <div className="text-sm font-bold text-indigo-900">{items.length} רשומות</div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ─── Main ─────────────────────────────────────────────────────── */
export default function MergeParentsTab() {
  const [searchBy, setSearchBy] = useState<SearchMode>('tz')
  const [query, setQuery]       = useState('')
  const [groups, setGroups]     = useState<{ id: string; name: string; id_number?: string; father_phone?: string; city?: string }[][]>([])
  const [loading, setLoading]   = useState(false)
  const [searchError, setSearchError] = useState('')

  // Selected group to merge
  const [activeGroup, setActiveGroup] = useState<{ id: string; name: string }[] | null>(null)
  const [allData, setAllData]     = useState<ParentData[]>([])
  const [dataLoading, setDataLoading] = useState(false)

  // Merge state
  const [primaryId, setPrimaryId]   = useState('')
  const [selections, setSelections] = useState<Record<string, string>>({})  // field → parentId
  const [merging, setMerging]       = useState(false)
  const [mergeError, setMergeError] = useState('')
  const [done, setDone]             = useState(false)

  /* Search */
  const search = async () => {
    setLoading(true); setSearchError(''); setGroups([]); setActiveGroup(null); setDone(false)
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
    setActiveGroup(group); setDataLoading(true); setMergeError(''); setDone(false)
    setSelections({}); setAllData([])
    try {
      const results = await Promise.all(group.map(p => fetchParentData(p.id)))
      setAllData(results)
      setPrimaryId(group[0].id)
      // default: primary parent wins all fields
      const sel: Record<string, string> = {}
      for (const { key } of SCALAR_FIELDS) sel[key] = group[0].id
      setSelections(sel)
    } catch { setMergeError('שגיאה בטעינת נתונים') }
    finally { setDataLoading(false) }
  }

  /* When primary changes, re-default selections to new primary */
  const handleSetPrimary = (id: string) => {
    setPrimaryId(id)
    const sel: Record<string, string> = {}
    for (const { key } of SCALAR_FIELDS) {
      const currentWinner = allData.find(d => d.parent.id === selections[key])
      // Keep explicit overrides; only default unset fields to new primary
      sel[key] = selections[key] || id
    }
    // Reset all to new primary
    const newSel: Record<string, string> = {}
    for (const { key } of SCALAR_FIELDS) newSel[key] = id
    setSelections(newSel)
  }

  /* Execute merge */
  const executeMerge = async () => {
    if (!primaryId || allData.length < 2) return
    const loserIds = allData.map(d => d.parent.id).filter(id => id !== primaryId)
    if (!confirm(`לאחד ${loserIds.length} כרטיסים אל "${allData.find(d=>d.parent.id===primaryId)?.parent.name}"?\nפעולה זו בלתי הפיכה.`)) return

    setMerging(true); setMergeError('')
    try {
      // Build overrides from selections (fields that differ from primary)
      const primary = allData.find(d => d.parent.id === primaryId)!
      const overrides: Record<string, unknown> = {}
      for (const { key } of SCALAR_FIELDS) {
        const winnerId = selections[key]
        if (winnerId && winnerId !== primaryId) {
          const winner = allData.find(d => d.parent.id === winnerId)
          if (winner && winner.parent[key] !== undefined) overrides[key as string] = winner.parent[key]
        }
      }

      // Merge each loser into primary sequentially
      for (const loserId of loserIds) {
        const r = await fetch('/api/parents/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ keepId: primaryId, mergeId: loserId, overrides }),
        })
        const d = await r.json()
        if (d.error) throw new Error(d.error)
      }

      setDone(true); setActiveGroup(null)
      setGroups(prev => prev.filter(g => !g.some(p => p.id === primaryId)))
    } catch (e) { setMergeError(String(e)) }
    finally { setMerging(false) }
  }

  const primaryData = allData.find(d => d.parent.id === primaryId)

  return (
    <div className="space-y-5" dir="rtl">

      {/* Search bar */}
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
      {groups.length > 0 && !activeGroup && (
        <div className="space-y-3">
          {groups.map((group, gi) => (
            <div key={gi} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between">
                <button onClick={() => openGroup(group)}
                  className="text-xs px-3 py-1 rounded-lg bg-indigo-600 text-white font-semibold hover:bg-indigo-700">
                  פתח לאיחוד →
                </button>
                <span className="text-xs font-semibold text-amber-700">{group.length} כרטיסים כפולים</span>
              </div>
              <div className="divide-y divide-gray-50">
                {group.map(p => (
                  <div key={p.id} className="px-5 py-2.5 flex items-center justify-between text-sm">
                    <span className="text-gray-400 text-xs" dir="ltr">{p.father_phone ?? p.id_number ?? ''}</span>
                    <span className="font-medium text-gray-800">{p.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {groups.length === 0 && !loading && !activeGroup && searchBy !== 'name' && (
        <div className="text-center text-gray-400 text-sm py-10">לחץ "חפש כפולים" לסריקת כפילויות לפי ת"ז או טלפון</div>
      )}

      {/* Merge workspace */}
      {activeGroup && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <button onClick={() => setActiveGroup(null)} className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1">← חזור לרשימה</button>
            <h3 className="text-base font-bold text-gray-800">איחוד כרטיסים</h3>
          </div>

          {dataLoading
            ? <div className="text-center text-gray-400 py-12 animate-pulse">טוען נתונים...</div>
            : allData.length > 0 && (
              <>
                <p className="text-xs text-gray-500 text-center">בחר כרטיס ראשי · לחץ על שדה לבחירה · שדות מקושרים ימוזגו מכולם</p>

                {/* 3-column grid */}
                <div className={`grid gap-4 items-start`} style={{ gridTemplateColumns: `repeat(${allData.length}, 1fr) 280px` }}>
                  {allData.map(d => (
                    <ParentColumn key={d.parent.id}
                      data={d}
                      isWinner={true}
                      isPrimary={d.parent.id === primaryId}
                      selections={selections}
                      onSelect={(field, pid) => setSelections(s => ({ ...s, [field]: pid }))}
                      onSetPrimary={() => handleSetPrimary(d.parent.id)}
                    />
                  ))}
                  <PreviewColumn allData={allData} primaryId={primaryId} selections={selections} />
                </div>

                {mergeError && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-sm">{mergeError}</div>}

                <button onClick={executeMerge} disabled={merging}
                  className="w-full py-3.5 rounded-xl text-sm font-bold disabled:opacity-50 text-white shadow-lg"
                  style={{ background: 'linear-gradient(135deg, #1a3a7a, #0d1f52)' }}>
                  {merging ? 'מאחד...' : `⚡ אחד ${allData.length} כרטיסים → ${primaryData?.parent.name}`}
                </button>
              </>
            )
          }
        </div>
      )}
    </div>
  )
}
