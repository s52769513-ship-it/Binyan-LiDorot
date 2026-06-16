'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import AddTransactionModal from '@/components/AddTransactionModal'
import EmployeeCard from '@/components/EmployeeCard'
import { TxDetailModal } from '@/components/TransactionCard'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

const fmtDate = (d: string) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return day ? `${day}/${m}/${y.slice(2)}` : d
}

// Colour a project badge
const PROJECT_COLORS: Record<string, string> = {
  'בנין לדורות':       'bg-indigo-100 text-indigo-700',
  'הוצאות חריגות':     'bg-red-100 text-red-700',
  'עמלות':             'bg-orange-100 text-orange-700',
  'משכורות':           'bg-pink-100 text-pink-700',
  'דמי מגבית':         'bg-purple-100 text-purple-700',
  'תרומה כללית':       'bg-emerald-100 text-emerald-700',
  'שולחן':             'bg-teal-100 text-teal-700',
  'קופת בית חינוך':    'bg-cyan-100 text-cyan-700',
  'הוצאות חודשי':      'bg-yellow-100 text-yellow-700',
  'הוצאות שנתי':       'bg-amber-100 text-amber-700',
}
const defaultBadge = 'bg-gray-100 text-gray-600'
function projectBadge(name: string) { return PROJECT_COLORS[name] ?? defaultBadge }

interface TxRow {
  id: string; amount: number; type: string; date: string
  monthYear: string; notes: string; parentName: string; parentIds: string[]
  projectNames: string[]
}

/* ─── Bank HOK Pull Modal ─────────────────────────────────────────────── */
function BankHokPullModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const today = new Date().toISOString().split('T')[0]
  const [from, setFrom]       = useState('')
  const [to, setTo]           = useState(today)
  const [dryRun, setDryRun]               = useState(false)
  const [skipDup, setSkipDup]             = useState(false)
  const [lastTo, setLastTo]               = useState<string | null>(null)
  const [running, setRunning]             = useState(false)
  const [lines, setLines]                 = useState<{ text: string; kind: string }[]>([])
  const [done, setDone]                   = useState(false)
  const [summary, setSummary]             = useState<{ imported: number; returned: number; skipped: number; totalAmount: number; totalReturnAmount: number } | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch('/api/automations/nedarim-pull')
      .then(r => r.json())
      .then(d => {
        const lt = (d.lastTo as string) ?? null
        setLastTo(lt)
        if (lt) {
          const after = new Date(lt)
          after.setDate(after.getDate() + 1)
          setFrom(after.toISOString().split('T')[0])
        } else {
          setFrom(today.slice(0, 8) + '01')
        }
      })
      .catch(() => { setFrom(today.slice(0, 8) + '01') })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [lines])

  const fmtD = (d: string) => { const [y,m,day] = d.split('-'); return `${day}/${m}/${y.slice(2)}` }

  const addLine = (text: string, kind = 'info') =>
    setLines(prev => [...prev, { text, kind }])

  const run = async () => {
    if (!from || !to) return
    setRunning(true); setLines([]); setDone(false); setSummary(null)
    try {
      const res = await fetch('/api/automations/nedarim-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, dryRun, skipDuplicateCheck: skipDup }),
      })
      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { done: d, value } = await reader.read()
        if (d) break
        buf += decoder.decode(value, { stream: true })
        const parts = buf.split('\n')
        buf = parts.pop() ?? ''
        for (const part of parts) {
          const line = part.trim(); if (!line) continue
          try {
            const ev = JSON.parse(line)
            if (ev.type === 'step')     addLine(ev.msg, 'step')
            else if (ev.type === 'progress') {
              if (ev.skipped) {
                addLine(`⏭ ${ev.donorName} (${ev.hokNumber}) — ${ev.reason}`, 'skip')
              } else if (ev.amount < 0 || (ev.status && String(ev.status).includes('חזרה'))) {
                addLine(`↩ ${ev.donorName} (${ev.hokNumber}) החזרה ₪${Math.abs(ev.amount)} | ${ev.dateRaw || ''}`, 'err')
              } else {
                const ppTag = ev.ppLinked ? ' [PP✓]' : ''
                addLine(`✓ ${ev.donorName} (${ev.hokNumber}) ₪${ev.amount} | ${ev.dateRaw || ''}${ppTag}`, 'ok')
              }
            } else if (ev.type === 'complete') {
              setSummary({ imported: ev.imported, returned: ev.returned, skipped: ev.skipped, totalAmount: ev.totalAmount, totalReturnAmount: ev.totalReturnAmount ?? 0 })
              const net = (ev.totalAmount ?? 0) - (ev.totalReturnAmount ?? 0)
              addLine(`הושלם${ev.dryRun ? ' [בדיקה]' : ''}: +₪${ev.totalAmount} נכנס · −₪${ev.totalReturnAmount ?? 0} חזר · נטו ₪${net}`, 'done')
              setDone(true)
              if (!ev.dryRun) onDone()
            } else if (ev.type === 'error') {
              addLine(`שגיאה: ${ev.error}`, 'err'); setDone(true)
            }
          } catch { /* bad json line */ }
        }
      }
    } catch (err) {
      addLine(`שגיאת רשת: ${String(err)}`, 'err'); setDone(true)
    } finally { setRunning(false) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6 space-y-4" onClick={e => e.stopPropagation()} dir="rtl">
        <div className="flex items-center justify-between">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl leading-none">✕</button>
          <h3 className="text-lg font-bold text-gray-800">🏦 משיכת הו&quot;ק בנקאי</h3>
        </div>

        {lastTo && (
          <p className="text-xs text-gray-400">משכת תנועות עד תאריך <strong className="text-gray-600">{fmtD(lastTo)}</strong></p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">מתאריך</label>
            <input type="date" value={from} onChange={e => setFrom(e.target.value)} dir="ltr"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">עד תאריך</label>
            <input type="date" value={to} onChange={e => setTo(e.target.value)} dir="ltr"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
          </div>
        </div>

        <div className="space-y-2">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)} className="w-4 h-4 accent-amber-500" />
            <span className="text-sm text-gray-700">בדיקה בלבד — לא ישמור בסיס נתונים</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={skipDup} onChange={e => setSkipDup(e.target.checked)} className="w-4 h-4 accent-rose-500" />
            <span className="text-sm text-gray-700">התעלם מיבוא קודם — ייבא הכל מחדש</span>
          </label>
        </div>

        {lines.length > 0 && (
          <div ref={logRef} className="font-mono text-xs bg-gray-950 rounded-xl p-3 h-44 overflow-y-auto scroll-smooth" dir="ltr">
            {lines.map((l, i) => (
              <div key={i} className={`py-0.5 leading-relaxed ${
                l.kind==='step' ? 'text-yellow-400' :
                l.kind==='done' ? 'text-emerald-300 font-semibold' :
                l.kind==='err'  ? 'text-red-400' :
                l.kind==='skip' ? 'text-gray-500' :
                'text-green-400'
              }`}>{l.text}</div>
            ))}
            {running && <span className="text-green-400 animate-pulse">▮</span>}
          </div>
        )}

        {summary && !running && (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-emerald-50 rounded-xl p-3 text-center">
                <p className="text-base font-bold text-emerald-700">+₪{fmt(summary.totalAmount)}</p>
                <p className="text-[10px] text-gray-500">{summary.imported} תנועות נכנסו</p>
              </div>
              <div className="bg-red-50 rounded-xl p-3 text-center">
                <p className="text-base font-bold text-red-600">−₪{fmt(summary.totalReturnAmount)}</p>
                <p className="text-[10px] text-gray-500">{summary.returned} החזרות</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="bg-blue-50 rounded-xl p-3 text-center">
                <p className="text-base font-bold text-blue-700">₪{fmt(summary.totalAmount - summary.totalReturnAmount)}</p>
                <p className="text-[10px] text-gray-500">נטו</p>
              </div>
              <div className="bg-gray-50 rounded-xl p-3 text-center">
                <p className="text-base font-bold text-gray-500">{summary.skipped}</p>
                <p className="text-[10px] text-gray-500">דולגו</p>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2 pt-1">
          {done ? (
            <button onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
              סגור
            </button>
          ) : (
            <button onClick={run} disabled={running || !from || !to}
              className="flex-1 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
              {running ? <><span className="animate-spin inline-block mr-1">⟳</span>מושך...</> : '⬇ משוך תנועות'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default function TransactionsPage() {
  const [rows, setRows]         = useState<TxRow[]>([])
  const [total, setTotal]       = useState(0)
  const [page, setPage]         = useState(0)
  const [search, setSearch]     = useState('')
  const [month, setMonth]       = useState('')
  const [type, setType]         = useState('')
  const [project, setProject]   = useState('')
  const [months, setMonths]     = useState<string[]>([])
  const [types, setTypes]       = useState<string[]>([])
  const [projects, setProjects] = useState<string[]>([])
  const [loading, setLoading]   = useState(true)
  const [error, setError]       = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [showHokPull, setShowHokPull] = useState(false)
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [selectedTx, setSelectedTx] = useState<TxRow | null>(null)

  const [debouncedSearch, setDebouncedSearch] = useState('')
  useEffect(() => { const t = setTimeout(() => setDebouncedSearch(search), 350); return () => clearTimeout(t) }, [search])

  const PAGE_SIZE = 50

  const load = useCallback(() => {
    setLoading(true)
    const params = new URLSearchParams({ page: String(page) })
    if (debouncedSearch) params.set('search', debouncedSearch)
    if (month)   params.set('month', month)
    if (type)    params.set('type', type)
    if (project) params.set('project', project)
    fetch(`/api/transactions?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.data ?? [])
        setTotal(d.total ?? 0)
        if (d.months?.length)   setMonths(d.months)
        if (d.types?.length)    setTypes(d.types)
        if (d.projects?.length) setProjects(d.projects)
      })
      .catch(() => setError('שגיאה בטעינת תנועות'))
      .finally(() => setLoading(false))
  }, [page, debouncedSearch, month, type, project])

  useEffect(() => { setPage(0) }, [debouncedSearch, month, type, project])
  useEffect(() => { load() }, [load])
  useRealtimeRefresh(load, 'transactions')

  const totalIncome  = useMemo(() => rows.filter(r => r.amount > 0).reduce((s, r) => s + r.amount, 0), [rows])
  const totalExpense = useMemo(() => rows.filter(r => r.amount < 0).reduce((s, r) => s + r.amount, 0), [rows])
  const totalPages   = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">תנועות</h2>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowHokPull(true)}
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-blue-200 text-blue-700 text-sm font-medium hover:bg-blue-50 transition-colors">
            🏦 משיכת הו&quot;ק
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-700 text-white text-sm font-medium hover:bg-emerald-800 transition-colors">
            <span className="text-lg leading-none">+</span> הוספת תנועה
          </button>
        </div>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      {/* Summary row */}
      {!loading && rows.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500 mb-1">סה"כ בעמוד</p>
            <p className="text-lg font-bold text-gray-700">{rows.length} מתוך {total}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl border border-emerald-200 p-4">
            <p className="text-xs text-gray-500 mb-1">הכנסות</p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">+₪{fmt(totalIncome)}</p>
          </div>
          <div className="bg-red-50 rounded-xl border border-red-200 p-4">
            <p className="text-xs text-gray-500 mb-1">הוצאות</p>
            <p className="text-lg font-bold text-red-600 tabular-nums">−₪{fmt(Math.abs(totalExpense))}</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="חיפוש לפי שם הורה..."
          className="flex-1 min-w-[180px] px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />

        {months.length > 0 && (
          <select value={month} onChange={e => setMonth(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30">
            <option value="">כל החודשים</option>
            {months.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}

        {types.length > 0 && (
          <select value={type} onChange={e => setType(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30">
            <option value="">כל האמצעים</option>
            {types.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}

        {projects.length > 0 && (
          <select value={project} onChange={e => setProject(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30">
            <option value="">כל הקטגוריות</option>
            {projects.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}

        {(search || month || type || project) && (
          <button onClick={() => { setSearch(''); setMonth(''); setType(''); setProject('') }}
            className="px-3 py-2 text-sm text-gray-400 hover:text-gray-700 underline">נקה</button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          {[1,2,3,4,5].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">אין תנועות</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px]">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase text-right bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3">הורה</th>
                  <th className="px-4 py-3">קטגוריה</th>
                  <th className="px-4 py-3">אמצעי</th>
                  <th className="px-4 py-3">חודש</th>
                  <th className="px-4 py-3">הערות</th>
                  <th className="px-4 py-3 text-left">סכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {rows.map(tx => (
                  <tr key={tx.id} onClick={() => setSelectedTx(tx)}
                    className="hover:bg-blue-50/40 cursor-pointer transition-colors">
                    <td className="px-4 py-3 text-sm text-gray-500 tabular-nums whitespace-nowrap">{fmtDate(tx.date)}</td>
                    <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                      {tx.parentName ? (
                        <button onClick={() => setSelectedParent(tx.parentIds[0])}
                          className="text-sm font-medium text-[#1a3a7a] hover:underline">
                          {tx.parentName}
                        </button>
                      ) : <span className="text-sm text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {tx.projectNames.length > 0
                          ? tx.projectNames.map(p => (
                              <span key={p} className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${projectBadge(p)}`}>{p}</span>
                            ))
                          : <span className="text-sm text-gray-300">—</span>
                        }
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">{tx.type || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{tx.monthYear || '—'}</td>
                    <td className="px-4 py-3 text-sm text-gray-400 max-w-[140px] truncate">{tx.notes || '—'}</td>
                    <td className="px-4 py-3 text-left">
                      <span className={`text-sm font-bold tabular-nums ${tx.amount < 0 ? 'text-red-600' : 'text-emerald-700'}`}>
                        {tx.amount < 0 ? '−' : '+'}₪{fmt(tx.amount)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
              <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page >= totalPages - 1}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                ‹ הבא
              </button>
              <span className="text-sm text-gray-500">עמוד {page + 1} מתוך {totalPages}</span>
              <button onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1.5 text-sm rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-gray-50">
                הקודם ›
              </button>
            </div>
          )}
        </div>
      )}

      {showAdd && <AddTransactionModal onClose={() => setShowAdd(false)} onSuccess={() => { setShowAdd(false); load() }} />}
      {showHokPull && <BankHokPullModal onClose={() => setShowHokPull(false)} onDone={load} />}
      {selectedParent && <EmployeeCard parentId={selectedParent} onClose={() => setSelectedParent(null)} />}
      {selectedTx && (
        <TxDetailModal
          tx={{ ...selectedTx, projectNames: selectedTx.projectNames }}
          onClose={() => setSelectedTx(null)}
          onOpenParent={id => { setSelectedTx(null); setSelectedParent(id) }}
        />
      )}
    </div>
  )
}
