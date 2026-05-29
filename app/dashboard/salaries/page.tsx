'use client'

import dynamic from 'next/dynamic'
import { useEffect, useState } from 'react'
import EmployeeCard from '@/components/EmployeeCard'

const AddTransactionModal = dynamic(() => import('@/components/AddTransactionModal'), { ssr: false })

interface Woman {
  id: string
  name: string
  salaryGross: number
  status: string
  role: string[]
}

interface Employee {
  id: string
  name: string
  firstName: string
  lastName: string
  baseHourlyRate: number
  seniorityBonusHourly: number
  monthlyHoursDecimal: number
  fixedBonus: number
  transportReimbursement: number
  exceptionalExpenses: number
  deductTuition: boolean
  showSpouseSalary: boolean
  salaryGross: number
  salaryNet: number
  familySalary: number
  tuitionDeduction: number
  netAfterTuition: number
  wifeSalary: number
  women: Woman[]
}


interface Transaction {
  id: string
  amount: number
  type: string
  date: string
  monthYear: string
  notes: string
  parentIds: string[]
  parentName?: string
}

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)
}
function fmtDate(d: string) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('he-IL').format(new Date(d))
}

type TabKey = 'settings' | 'planned' | 'actual'

/* ─── הגדרות Tab ─────────────────────────────────── */
function SettingsTab() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading]     = useState(true)
  const [search, setSearch]       = useState('')
  const [openId, setOpenId]       = useState<string | null>(null)
  const [openCard, setOpenCard]   = useState<string | null>(null)
  const [saving, setSaving]       = useState<string | null>(null)
  const [saveErr, setSaveErr]     = useState<Record<string, string>>({})
  // Edits keyed by employee id
  const [edits, setEdits]         = useState<Record<string, Partial<Employee>>>({})

  useEffect(() => {
    fetch('/api/salaries')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEmployees(data) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = employees.filter(e =>
    !search || e.name.includes(search) || e.firstName.includes(search) || e.lastName.includes(search)
  )
  const totalGross  = filtered.reduce((s, e) => s + (e.showSpouseSalary ? e.familySalary : e.salaryGross), 0)
  const totalDeduct = filtered.reduce((s, e) => s + e.tuitionDeduction, 0)
  const totalNet    = filtered.reduce((s, e) => s + e.netAfterTuition, 0)

  const getEdit = (id: string): Partial<Employee> => edits[id] ?? {}
  const setEdit = (id: string, field: keyof Employee, value: unknown) =>
    setEdits(prev => ({ ...prev, [id]: { ...(prev[id] ?? {}), [field]: value } }))

  const save = async (emp: Employee) => {
    const patch = edits[emp.id]
    if (!patch || Object.keys(patch).length === 0) { setOpenId(null); return }
    setSaving(emp.id)
    setSaveErr(prev => { const n = {...prev}; delete n[emp.id]; return n })
    try {
      const res  = await fetch(`/api/parents/${emp.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) {
        setSaveErr(prev => ({ ...prev, [emp.id]: data.error ?? 'שגיאה בשמירה' }))
        return
      }
      // Refresh
      const list = await fetch('/api/salaries').then(r => r.json())
      if (Array.isArray(list)) setEmployees(list)
      setEdits(prev => { const n = {...prev}; delete n[emp.id]; return n })
      setOpenId(null)
    } finally { setSaving(null) }
  }

  return (
    <div className="space-y-4">
      {/* Search + summary */}
      <div className="flex items-center gap-4">
        <input
          type="text" placeholder="חיפוש שם..." value={search}
          onChange={e => setSearch(e.target.value)} dir="rtl"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300"
        />
        <div className="flex gap-3 flex-1">
          <div className="bg-indigo-50 rounded-xl px-4 py-2 text-center flex-1">
            <p className="text-xs text-gray-500">ברוטו</p>
            <p className="text-base font-bold text-indigo-800">{fmt(totalGross)}</p>
          </div>
          <div className="bg-red-50 rounded-xl px-4 py-2 text-center flex-1">
            <p className="text-xs text-gray-500">קיזוז שכ&quot;ל</p>
            <p className="text-base font-bold text-red-700">− {fmt(totalDeduct)}</p>
          </div>
          <div className="bg-emerald-50 rounded-xl px-4 py-2 text-center flex-1">
            <p className="text-xs text-gray-500">לתשלום</p>
            <p className="text-base font-bold text-emerald-700">{fmt(totalNet)}</p>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3,4,5].map(i => <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : (
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs">
                <th className="px-4 py-3 text-right font-semibold">שם</th>
                <th className="px-4 py-3 text-center font-semibold">שעות</th>
                <th className="px-4 py-3 text-center font-semibold">ברוטו</th>
                <th className="px-4 py-3 text-center font-semibold">קיזוז שכ&quot;ל</th>
                <th className="px-4 py-3 text-center font-semibold">נטו לתשלום</th>
                <th className="px-4 py-3 text-center font-semibold">אשה</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(emp => {
                const isOpen = openId === emp.id
                const ed = getEdit(emp.id)
                const displayGross = emp.showSpouseSalary ? emp.familySalary : emp.salaryGross
                return (
                  <>
                    <tr key={emp.id}
                      onClick={() => setOpenId(isOpen ? null : emp.id)}
                      className={`border-b border-gray-100 cursor-pointer transition-colors ${isOpen ? 'bg-indigo-50' : 'hover:bg-gray-50/60'}`}>
                      <td className="px-4 py-3 font-medium text-gray-800">
                        <button
                          onClick={e => { e.stopPropagation(); setOpenCard(emp.id) }}
                          className="text-[#1a3a7a] hover:underline font-semibold"
                        >{emp.name}</button>
                      </td>
                      <td className="px-4 py-3 text-center text-gray-500 tabular-nums">
                        {emp.monthlyHoursDecimal > 0 ? emp.monthlyHoursDecimal : '—'}
                      </td>
                      <td className="px-4 py-3 text-center font-semibold text-indigo-700 tabular-nums">
                        {displayGross > 0 ? fmt(displayGross) : '—'}
                      </td>
                      <td className="px-4 py-3 text-center tabular-nums">
                        {emp.tuitionDeduction > 0
                          ? <span className="text-red-600 font-medium">− {fmt(emp.tuitionDeduction)}</span>
                          : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-center font-bold tabular-nums">
                        <span className={emp.netAfterTuition > 0 ? 'text-emerald-700' : 'text-gray-500'}>
                          {emp.netAfterTuition > 0 ? fmt(emp.netAfterTuition) : '—'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        {emp.women.length > 0 ? (
                          <div className="flex flex-col items-center gap-0.5">
                            {emp.women.map(w => (
                              <div key={w.id} className="text-xs text-purple-700 font-medium">
                                {w.name}{w.salaryGross > 0 && <span className="text-gray-400 font-normal mr-1">({fmt(w.salaryGross)})</span>}
                              </div>
                            ))}
                          </div>
                        ) : <span className="text-gray-300 text-xs">—</span>}
                      </td>
                      <td className="px-2 py-3 text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</td>
                    </tr>
                    {isOpen && (
                      <tr key={`${emp.id}-edit`} className="bg-indigo-50/50 border-b border-gray-100">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs mb-3">
                            <label className="flex flex-col gap-1">
                              <span className="text-gray-500">שכר בסיס לשעה</span>
                              <input type="number" min="0" step="10"
                                defaultValue={emp.baseHourlyRate || ''}
                                onChange={e => setEdit(emp.id, 'baseHourlyRate', Number(e.target.value))}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-gray-500">שעות חודשיות</span>
                              <input type="number" min="0" step="1"
                                defaultValue={emp.monthlyHoursDecimal || ''}
                                onChange={e => setEdit(emp.id, 'monthlyHoursDecimal', Number(e.target.value))}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-gray-500">תוספת ותק לשעה</span>
                              <input type="number" min="0" step="1"
                                defaultValue={emp.seniorityBonusHourly || ''}
                                onChange={e => setEdit(emp.id, 'seniorityBonusHourly', Number(e.target.value))}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-gray-500">תוספת קבועה</span>
                              <input type="number" min="0" step="10"
                                defaultValue={emp.fixedBonus || ''}
                                onChange={e => setEdit(emp.id, 'fixedBonus', Number(e.target.value))}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-gray-500">תשלום הסעות</span>
                              <input type="number" min="0" step="10"
                                defaultValue={emp.transportReimbursement || ''}
                                onChange={e => setEdit(emp.id, 'transportReimbursement', Number(e.target.value))}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </label>
                            <label className="flex flex-col gap-1">
                              <span className="text-gray-500">הוצאות חריגות</span>
                              <input type="number" min="0" step="10"
                                defaultValue={emp.exceptionalExpenses || ''}
                                onChange={e => setEdit(emp.id, 'exceptionalExpenses', Number(e.target.value))}
                                className="px-2 py-1.5 rounded-lg border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-indigo-300" />
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer col-span-1 pt-4">
                              <input type="checkbox"
                                defaultChecked={emp.deductTuition}
                                onChange={e => setEdit(emp.id, 'deductTuition', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300" />
                              <span className="text-gray-600">קיזוז שכ&quot;ל</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer col-span-1 pt-4">
                              <input type="checkbox"
                                defaultChecked={emp.showSpouseSalary}
                                onChange={e => setEdit(emp.id, 'showSpouseSalary', e.target.checked)}
                                className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-300" />
                              <span className="text-gray-600">כולל שכר אשה</span>
                            </label>
                          </div>
                          {saveErr[emp.id] && (
                            <p className="text-xs text-red-600 bg-red-50 rounded-lg px-2 py-1.5 mb-1">{saveErr[emp.id]}</p>
                          )}
                          <div className="flex gap-2 justify-start">
                            <button
                              onClick={e => { e.stopPropagation(); save(emp) }}
                              disabled={saving === emp.id}
                              className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-700 disabled:opacity-60 transition-colors"
                            >
                              {saving === emp.id ? 'שומר...' : 'שמור שינויים'}
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); setOpenId(null); setSaveErr(prev => { const n={...prev}; delete n[emp.id]; return n }); setEdits(prev => { const n={...prev}; delete n[emp.id]; return n }) }}
                              className="px-4 py-1.5 rounded-lg border border-gray-200 text-xs text-gray-600 hover:bg-gray-50 transition-colors"
                            >
                              ביטול
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
            {filtered.length > 0 && (
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                  <td className="px-4 py-3 text-gray-700">סה&quot;כ ({filtered.length})</td>
                  <td /><td className="px-4 py-3 text-center text-indigo-700 tabular-nums">{fmt(totalGross)}</td>
                  <td className="px-4 py-3 text-center text-red-600 tabular-nums">{totalDeduct > 0 ? `− ${fmt(totalDeduct)}` : '—'}</td>
                  <td className="px-4 py-3 text-center text-emerald-700 tabular-nums">{fmt(totalNet)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            )}
          </table>
          {filtered.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-4xl mb-3">💼</p>
              <p>{search ? 'לא נמצאו תוצאות' : 'אין נתוני משכורות — הרץ סינק מאיירטייבל'}</p>
            </div>
          )}
        </div>
      )}

      {openCard && <EmployeeCard parentId={openCard} onClose={() => setOpenCard(null)} />}
    </div>
  )
}

/* ─── תשלומים מתוכננים Tab ─────────────────────────── */
function PlannedTab() {
  const today     = new Date()
  const initMY    = `${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear()}`
  const initInput = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`

  const [monthInput, setMonthInput] = useState(initInput)
  const [monthYear,  setMonthYear]  = useState(initMY)
  const [file,       setFile]       = useState<File | null>(null)
  const [dryRun,     setDryRun]     = useState(false)
  const [importing,  setImporting]  = useState(false)
  const [importRes,  setImportRes]  = useState<{ success: boolean; dryRun: boolean; totalCreated: number; results: { parentName: string; payments: { method: string; amount: number }[]; ppFound: boolean }[] } | null>(null)
  const [importErr,  setImportErr]  = useState('')

  const handleMonthChange = (v: string) => {
    setMonthInput(v)
    const [y, m] = v.split('-')
    if (y && m) setMonthYear(`${m}/${y}`)
  }

  const handleDownload = () => {
    window.location.href = `/api/salaries/export?monthYear=${encodeURIComponent(monthYear)}`
  }

  const handleImport = async () => {
    if (!file) return
    setImporting(true); setImportErr(''); setImportRes(null)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('monthYear', monthYear)
      fd.append('dryRun', String(dryRun))
      const res  = await fetch('/api/salaries/import', { method: 'POST', body: fd })
      const data = await res.json()
      if (data.error) { setImportErr(data.error); return }
      setImportRes(data)
    } catch (e) { setImportErr(String(e)) }
    finally { setImporting(false) }
  }

  return (
    <div className="space-y-5" dir="rtl">
      {/* Month picker */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-700 mb-3">חודש לעיבוד</p>
        <div className="flex items-center gap-3">
          <input type="month" value={monthInput} onChange={e => handleMonthChange(e.target.value)}
            className="px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white" dir="ltr" />
          <span className="text-sm font-medium text-indigo-600">{monthYear}</span>
        </div>
      </div>

      {/* Download */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
        <p className="text-sm font-semibold text-gray-700 mb-1">שלב 1 — הורדת אקסל</p>
        <p className="text-xs text-gray-400 mb-3">קובץ עם כל העובדים, עמודות אמצעי תשלום ונוסחאות מחושבות</p>
        <button onClick={handleDownload}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
          ⬇ הורד אקסל משכורות — {monthYear}
        </button>
      </div>

      {/* Upload */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 space-y-3">
        <p className="text-sm font-semibold text-gray-700">שלב 2 — העלאת אקסל לאחר מילוי</p>
        <p className="text-xs text-gray-400">המערכת תיצור תנועות תשלום לכל עובד לפי אמצעי התשלום שמולאו</p>

        <input type="file" accept=".xlsx,.xls"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setImportRes(null); setImportErr('') }}
          className="block text-sm text-gray-600 file:mr-3 file:py-1.5 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />

        <label className="flex items-center gap-2 cursor-pointer select-none">
          <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}
            className="w-4 h-4 rounded text-amber-500" />
          <span className="text-sm text-amber-700">בדיקה בלבד — לא שומר לדאטהבייס</span>
        </label>

        {importErr && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{importErr}</p>}

        <button disabled={!file || importing} onClick={handleImport}
          className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all disabled:opacity-40 ${
            dryRun ? 'bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100'
                   : 'text-white'
          }`}
          style={!dryRun ? { background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' } : {}}>
          {importing ? 'מעבד...' : dryRun ? '🧪 בדוק אקסל' : '⬆ ייבא תשלומים'}
        </button>
      </div>

      {/* Results */}
      {importRes && (
        <div className={`rounded-2xl border shadow-sm overflow-hidden ${importRes.dryRun ? 'border-amber-200' : 'border-emerald-200'}`}>
          <div className={`px-5 py-3 flex items-center justify-between ${importRes.dryRun ? 'bg-amber-50' : 'bg-emerald-50'}`}>
            <span className={`text-sm font-bold ${importRes.dryRun ? 'text-amber-800' : 'text-emerald-800'}`}>
              {importRes.dryRun ? '🧪 תוצאות בדיקה' : '✅ ייבוא הושלם'}
            </span>
            <span className="text-xs text-gray-500">{importRes.totalCreated} תנועות {importRes.dryRun ? 'שהיו נוצרות' : 'נוצרו'}</span>
          </div>
          <div className="bg-white divide-y divide-gray-50">
            {importRes.results.map((r, i) => (
              <div key={i} className="px-5 py-3 flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className={`text-xs px-1.5 py-0.5 rounded ${r.ppFound ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'}`}>
                    {r.ppFound ? 'PP ✓' : 'ללא PP'}
                  </span>
                  <span className="font-medium text-gray-800">{r.parentName}</span>
                </div>
                <div className="flex gap-2 text-xs text-gray-500">
                  {r.payments.map((p, j) => (
                    <span key={j} className="bg-gray-50 border border-gray-100 rounded px-2 py-0.5">
                      {p.method} ₪{new Intl.NumberFormat('he-IL').format(p.amount)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

/* ─── תשלומים בפועל Tab ─────────────────────────────── */
function ActualTab() {
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [monthFilter, setMonth]         = useState('')
  const [showAdd, setShowAdd]           = useState(false)
  const [openCard, setOpenCard]         = useState<string | null>(null)

  const load = () => {
    setLoading(true)
    fetch('/api/transactions?type=קיזוז שכר לימוד&limit=200')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setTransactions(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const months = [...new Set(transactions.map(t => t.monthYear).filter(Boolean))].sort().reverse()
  const rows   = monthFilter ? transactions.filter(t => t.monthYear === monthFilter) : transactions
  const total  = rows.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="space-y-4">
      {/* Summary + add button */}
      <div className="flex items-center justify-between gap-4">
        <div className="bg-emerald-50 rounded-xl px-5 py-3 text-center">
          <p className="text-xs text-gray-500">סה&quot;כ ששולם</p>
          <p className="text-xl font-bold text-emerald-700">{fmt(Math.abs(total))}</p>
        </div>
        <button onClick={() => setShowAdd(true)}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
          + הוסף תשלום משכורת
        </button>
      </div>

      {/* Month filter */}
      {months.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <button onClick={() => setMonth('')}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${!monthFilter ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200'}`}>
            הכל
          </button>
          {months.slice(0,12).map(m => (
            <button key={m} onClick={() => setMonth(m)}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${monthFilter === m ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200'}`}>
              {m}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p className="text-3xl mb-2">💸</p>
          <p>אין תשלומי משכורת בפועל</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 text-right">
                <th className="px-4 py-2.5">שם / הערות</th>
                <th className="px-4 py-2.5">חודש</th>
                <th className="px-4 py-2.5">תאריך</th>
                <th className="px-4 py-2.5 text-center">סכום</th>
                <th className="px-4 py-2.5">סוג</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(tx => (
                <tr key={tx.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    {tx.parentName
                      ? <button onClick={() => setOpenCard(tx.parentName!)} className="text-[#1a3a7a] hover:underline">{tx.parentName}</button>
                      : <span className="text-gray-500 italic">{tx.notes || '—'}</span>
                    }
                    {tx.notes && tx.parentName && <p className="text-xs text-gray-400">{tx.notes}</p>}
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{tx.monthYear || '—'}</td>
                  <td className="px-4 py-2.5 text-gray-500">{fmtDate(tx.date)}</td>
                  <td className="px-4 py-2.5 text-center font-semibold tabular-nums text-emerald-700">
                    {fmt(Math.abs(tx.amount))}
                  </td>
                  <td className="px-4 py-2.5 text-xs text-gray-400">{tx.type}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                <td className="px-4 py-3 text-gray-700">סה&quot;כ ({rows.length})</td>
                <td /><td />
                <td className="px-4 py-3 text-center text-emerald-700">{fmt(Math.abs(total))}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {openCard && <EmployeeCard parentId={openCard} onClose={() => setOpenCard(null)} />}
      {showAdd && (
        <AddTransactionModal
          preselectedProject="משכורת"
          onClose={() => setShowAdd(false)}
          onSuccess={() => { setShowAdd(false); load() }}
        />
      )}
    </div>
  )
}

/* ─── InfoChip helper ─── */
function InfoChip({ label, value, color }: { label: string; value: string; color?: 'red' | 'amber' }) {
  const border = color === 'red' ? 'border-red-100' : color === 'amber' ? 'border-amber-100' : 'border-indigo-100'
  const text   = color === 'red' ? 'text-red-600' : color === 'amber' ? 'text-amber-700' : 'text-gray-800'
  return (
    <div className={`bg-white rounded-lg p-2.5 border ${border}`}>
      <p className="text-gray-400 text-xs">{label}</p>
      <p className={`font-semibold mt-0.5 text-sm ${text}`}>{value}</p>
    </div>
  )
}

/* ═══════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════ */
export default function SalariesPage() {
  const [tab, setTab] = useState<TabKey>('settings')

  const tabs: { key: TabKey; label: string }[] = [
    { key: 'settings', label: '⚙ הגדרות משכורת' },
    { key: 'planned',  label: '📋 תשלומים מתוכננים' },
    { key: 'actual',   label: '💸 תשלומים בפועל' },
  ]

  return (
    <div dir="rtl">
      {/* Page header */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">💼 משכורות</h1>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-[#1a3a7a] text-[#1a3a7a]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'settings' && <SettingsTab />}
      {tab === 'planned'  && <PlannedTab />}
      {tab === 'actual'   && <ActualTab />}
    </div>
  )
}
