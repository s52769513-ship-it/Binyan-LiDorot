'use client'

import { useEffect, useState } from 'react'

interface ParentRow {
  id: string
  name: string
  father_phone?: string
  mother_phone?: string
  id_number?: string
  city?: string
  status?: string
}

interface TxRow { id: string; date: string; amount: number; type: string; notes?: string; parentId: string }
interface PpRow { id: string; month_year: string; amount: number; type: string; status: string; parentId: string }

const FIELD_LABELS: Record<string, string> = {
  name: 'שם', father_phone: 'טלפון אב', mother_phone: 'טלפון אם',
  id_number: 'ת"ז', city: 'עיר', status: 'סטטוס',
}
const FIELDS = Object.keys(FIELD_LABELS) as (keyof ParentRow)[]

const fmtAmt = (n: number) => {
  const s = Math.abs(n).toLocaleString('he-IL', { maximumFractionDigits: 0 })
  return n < 0 ? `-₪${s}` : `₪${s}`
}

/* ─── Records panel (transactions or PPs) ─────────────────────────── */
function RecordsPanel({
  title, rows, keeperId, loserId, keeperName, loserName,
  excluded, onToggle, onToggleAll,
}: {
  title: string
  rows: (TxRow | PpRow)[]
  keeperId: string; loserId: string
  keeperName: string; loserName: string
  excluded: Set<string>
  onToggle: (id: string) => void
  onToggleAll: (ids: string[], check: boolean) => void
}) {
  const loserRows = rows.filter(r => r.parentId === loserId)
  const keeperRows = rows.filter(r => r.parentId === keeperId)
  const allLoserIds = loserRows.map(r => r.id)
  const allExcluded = allLoserIds.every(id => excluded.has(id))

  if (rows.length === 0) return (
    <div className="text-center text-gray-400 text-xs py-4">אין {title}</div>
  )

  const Row = ({ r, isLoser }: { r: TxRow | PpRow; isLoser: boolean }) => {
    const isTx = 'date' in r
    const label = isTx ? (r as TxRow).date : (r as PpRow).month_year
    const note  = isTx ? ((r as TxRow).notes ?? '') : (r as PpRow).status
    const amt   = r.amount
    return (
      <tr className={`text-xs border-b border-gray-50 ${isLoser && excluded.has(r.id) ? 'opacity-40 line-through' : ''}`}>
        {isLoser && (
          <td className="px-2 py-1.5 text-center">
            <input type="checkbox" checked={!excluded.has(r.id)}
              onChange={() => onToggle(r.id)}
              className="accent-indigo-600 cursor-pointer" />
          </td>
        )}
        {!isLoser && <td className="px-2 py-1.5" />}
        <td className={`px-3 py-1.5 font-medium text-xs rounded-full w-fit whitespace-nowrap`}>
          <span className={`px-2 py-0.5 rounded-full text-xs ${isLoser ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
            {isLoser ? loserName : keeperName}
          </span>
        </td>
        <td className="px-3 py-1.5 text-gray-500">{label}</td>
        <td className="px-3 py-1.5 text-gray-700">{r.type}</td>
        <td className={`px-3 py-1.5 font-semibold ${amt < 0 ? 'text-red-500' : 'text-emerald-700'}`}>{fmtAmt(amt)}</td>
        <td className="px-3 py-1.5 text-gray-400 truncate max-w-[120px]">{note}</td>
      </tr>
    )
  }

  return (
    <div className="border border-gray-100 rounded-xl overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 flex items-center justify-between border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-600">{title} ({rows.length})</span>
        {loserRows.length > 0 && (
          <button onClick={() => onToggleAll(allLoserIds, allExcluded)}
            className="text-xs text-indigo-600 hover:underline">
            {allExcluded ? 'בחר הכל מנמחק' : 'בטל הכל מנמחק'}
          </button>
        )}
      </div>
      <div className="max-h-52 overflow-y-auto">
        <table className="w-full">
          <tbody>
            {[...keeperRows.map(r => <Row key={r.id} r={r} isLoser={false} />),
               ...loserRows.map(r => <Row key={r.id} r={r} isLoser={true} />)]}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ─── Main component ───────────────────────────────────────────────── */
export default function MergeParentsTab() {
  const [searchBy, setSearchBy] = useState<'tz' | 'phone' | 'name'>('tz')
  const [query, setQuery]       = useState('')
  const [groups, setGroups]     = useState<ParentRow[][]>([])
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')

  const [selected, setSelected]   = useState<[ParentRow, ParentRow] | null>(null)
  const [keepIdx, setKeepIdx]     = useState<0 | 1>(0)
  const [overrides, setOverrides] = useState<Record<string, string>>({})
  const [merging, setMerging]     = useState(false)
  const [done, setDone]           = useState(false)

  // Records from both parents
  const [txRows, setTxRows] = useState<TxRow[]>([])
  const [ppRows, setPpRows] = useState<PpRow[]>([])
  const [recordsLoading, setRecordsLoading] = useState(false)

  // Which loser records to EXCLUDE from migration
  const [excludedTx, setExcludedTx] = useState<Set<string>>(new Set())
  const [excludedPp, setExcludedPp] = useState<Set<string>>(new Set())

  const keeper = selected ? selected[keepIdx]           : null
  const loser  = selected ? selected[keepIdx ^ 1 as 0|1] : null

  /* ── Search ── */
  const search = async () => {
    setLoading(true); setError(''); setGroups([]); setSelected(null); setDone(false)
    try {
      const r = await fetch(`/api/parents/duplicates?by=${searchBy}&q=${encodeURIComponent(query)}`)
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setGroups(d.groups ?? [])
    } catch { setError('שגיאת רשת') }
    finally { setLoading(false) }
  }

  /* ── Load records for both parents ── */
  const loadRecords = async (a: ParentRow, b: ParentRow) => {
    setRecordsLoading(true); setTxRows([]); setPpRows([])
    try {
      const [txA, txB, ppA, ppB] = await Promise.all([
        fetch(`/api/transactions?parentId=${a.id}&limit=200`).then(r => r.json()),
        fetch(`/api/transactions?parentId=${b.id}&limit=200`).then(r => r.json()),
        fetch(`/api/planned-payments?parentId=${a.id}&limit=200`).then(r => r.json()),
        fetch(`/api/planned-payments?parentId=${b.id}&limit=200`).then(r => r.json()),
      ])
      const toTx = (arr: Record<string,unknown>[], pid: string): TxRow[] =>
        (Array.isArray(arr) ? arr : []).map(t => ({
          id: String(t.id ?? ''), date: String(t.date ?? t.created_at ?? '').slice(0,10),
          amount: Number(t.amount ?? 0), type: String(t.type ?? t.transaction_type ?? ''),
          notes: String(t.notes ?? ''), parentId: pid,
        }))
      const toPp = (arr: Record<string,unknown>[], pid: string): PpRow[] =>
        (Array.isArray(arr) ? arr : (arr as {data?:unknown[]}).data ?? []).map((p: unknown) => {
          const t = p as Record<string,unknown>
          return {
            id: String(t.id ?? ''), month_year: String(t.month_year ?? t.monthYear ?? ''),
            amount: Number(t.amount ?? 0), type: String(t.type ?? t.payment_type ?? ''),
            status: String(t.status ?? ''), parentId: pid,
          }
        })
      setTxRows([...toTx(txA, a.id), ...toTx(txB, b.id)])
      setPpRows([...toPp(ppA, a.id), ...toPp(ppB, b.id)])
    } catch {} finally { setRecordsLoading(false) }
  }

  /* ── Open pair ── */
  const openPair = (a: ParentRow, b: ParentRow) => {
    setSelected([a, b]); setKeepIdx(0)
    const o: Record<string, string> = {}
    for (const f of FIELDS) o[f] = String(a[f] ?? '')
    setOverrides(o); setDone(false)
    setExcludedTx(new Set()); setExcludedPp(new Set())
    loadRecords(a, b)
  }

  const flipKeep = () => {
    if (!selected) return
    const ni = (keepIdx ^ 1) as 0 | 1
    setKeepIdx(ni)
    const o: Record<string, string> = {}
    for (const f of FIELDS) o[f] = String(selected[ni][f] ?? '')
    setOverrides(o)
  }

  // When keepIdx changes, swap which parent is "loser" for exclusion purposes — reset
  useEffect(() => {
    setExcludedTx(new Set()); setExcludedPp(new Set())
  }, [keepIdx])

  const toggleTx = (id: string) => setExcludedTx(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const togglePp = (id: string) => setExcludedPp(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n })
  const toggleAllTx = (ids: string[], check: boolean) => setExcludedTx(s => { const n = new Set(s); ids.forEach(id => check ? n.add(id) : n.delete(id)); return n })
  const toggleAllPp = (ids: string[], check: boolean) => setExcludedPp(s => { const n = new Set(s); ids.forEach(id => check ? n.add(id) : n.delete(id)); return n })

  /* ── Execute merge ── */
  const executeMerge = async () => {
    if (!keeper || !loser) return
    if (!confirm(`לאחד את "${loser.name}" אל "${keeper.name}"?\nפעולה זו בלתי הפיכה.`)) return
    setMerging(true); setError('')
    try {
      const r = await fetch('/api/parents/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          keepId: keeper.id, mergeId: loser.id, overrides,
          excludeTxIds: [...excludedTx],
          excludePpIds: [...excludedPp],
        }),
      })
      const d = await r.json()
      if (d.error) { setError(d.error); return }
      setDone(true); setSelected(null)
      setGroups(prev => prev.map(g => g.filter(p => p.id !== loser.id)).filter(g => g.length >= 2))
    } catch { setError('שגיאת רשת') }
    finally { setMerging(false) }
  }

  const loserTxCount = txRows.filter(t => t.parentId === loser?.id && !excludedTx.has(t.id)).length
  const loserPpCount = ppRows.filter(p => p.parentId === loser?.id && !excludedPp.has(p.id)).length

  return (
    <div className="space-y-6" dir="rtl">

      {/* Search */}
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
            className="px-5 py-2 rounded-xl text-sm font-bold disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
            {loading ? 'מחפש...' : 'חפש כפולים'}
          </button>
        </div>
        {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}
        {done  && <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg text-sm font-medium">✓ האיחוד הושלם בהצלחה</div>}
      </div>

      {/* Groups */}
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
                    <th className="px-4 py-2.5">שם</th><th className="px-4 py-2.5">ת"ז</th>
                    <th className="px-4 py-2.5">טלפון אב</th><th className="px-4 py-2.5">עיר</th>
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

      {groups.length === 0 && !loading && searchBy !== 'name' && (
        <div className="text-center text-gray-400 text-sm py-8">לחץ "חפש כפולים" לסריקת כפילויות</div>
      )}

      {/* Merge panel */}
      {selected && keeper && loser && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 shadow-lg p-5 space-y-5">
          <div className="flex items-center justify-between">
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
            <h3 className="text-base font-bold text-gray-800">איחוד כרטיסים</h3>
          </div>

          {/* Keep / Loser header */}
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

          {/* Field overrides */}
          <div className="border border-gray-100 rounded-xl overflow-hidden">
            <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 text-xs font-semibold text-gray-600">שדות כרטיס</div>
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-xs text-gray-500 text-right">
                  <th className="px-4 py-2">שדה</th>
                  <th className="px-4 py-2 text-emerald-700">נשמר</th>
                  <th className="px-4 py-2 text-red-600">נמחק</th>
                  <th className="px-4 py-2 text-center w-28">בחר</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {FIELDS.map(f => {
                  const vk = String(keeper[f] ?? ''), vl = String(loser[f] ?? '')
                  const chosen = overrides[f] ?? vk
                  return (
                    <tr key={f} className={chosen === vl && vl !== vk ? 'bg-yellow-50' : ''}>
                      <td className="px-4 py-2 text-gray-600 font-medium text-xs">{FIELD_LABELS[f]}</td>
                      <td className="px-4 py-2 text-gray-700 text-xs" dir="ltr">{vk || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs" dir="ltr">{vl || <span className="text-gray-300">—</span>}</td>
                      <td className="px-4 py-2 text-center">
                        <div className="flex justify-center gap-1">
                          <button onClick={() => setOverrides(o => ({ ...o, [f]: vk }))}
                            className={`px-2 py-0.5 text-xs rounded-lg border ${chosen === vk ? 'bg-emerald-100 border-emerald-300 text-emerald-700 font-bold' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
                            נשמר
                          </button>
                          {vl && vl !== vk && (
                            <button onClick={() => setOverrides(o => ({ ...o, [f]: vl }))}
                              className={`px-2 py-0.5 text-xs rounded-lg border ${chosen === vl ? 'bg-yellow-100 border-yellow-300 text-yellow-700 font-bold' : 'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
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

          {/* Records */}
          {recordsLoading
            ? <div className="text-center text-gray-400 text-sm py-4 animate-pulse">טוען תנועות ותשלומים...</div>
            : <>
                <RecordsPanel title="עסקאות" rows={txRows}
                  keeperId={keeper.id} loserId={loser.id}
                  keeperName={keeper.name} loserName={loser.name}
                  excluded={excludedTx} onToggle={toggleTx} onToggleAll={toggleAllTx} />
                <RecordsPanel title="תשלומים מתוכננים" rows={ppRows}
                  keeperId={keeper.id} loserId={loser.id}
                  keeperName={keeper.name} loserName={loser.name}
                  excluded={excludedPp} onToggle={togglePp} onToggleAll={toggleAllPp} />
              </>
          }

          {/* Summary */}
          {(excludedTx.size > 0 || excludedPp.size > 0) && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
              {excludedTx.size > 0 && <span>{excludedTx.size} עסקאות לא יועברו · </span>}
              {excludedPp.size > 0 && <span>{excludedPp.size} ת&quot;מ לא יועברו</span>}
            </div>
          )}

          {loser && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
              יועברו: <strong>{loserTxCount}</strong> עסקאות + <strong>{loserPpCount}</strong> ת&quot;מ מ-{loser.name} → {keeper?.name}
            </div>
          )}

          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

          <button onClick={executeMerge} disabled={merging}
            className="w-full py-3 rounded-xl text-sm font-bold disabled:opacity-50 text-white"
            style={{ background: 'linear-gradient(135deg, #7f1d1d, #b91c1c)' }}>
            {merging ? 'מאחד...' : `⚡ אחד עכשיו — ${loser?.name} → ${keeper?.name}`}
          </button>
        </div>
      )}
    </div>
  )
}
