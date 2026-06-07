'use client'

import { useEffect, useRef, useState } from 'react'

interface ProgressEvent {
  type: 'step' | 'progress' | 'complete' | 'error'
  step?: number
  msg?: string
  current?: number
  total?: number
  hokNumber?: string
  donorName?: string
  amount?: number
  status?: string
  imported?: number
  returned?: number
  skipped?: number
  totalAmount?: number
  dryRun?: boolean
  error?: string
  actions?: object[]
}

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function toDisplayDate(iso: string) {
  if (!iso) return ''
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}
function toNedarimDate(iso: string) {
  // Nedarim expects DD/MM/YYYY
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export default function NedarimPullModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [lastRun, setLastRun]         = useState<string | null>(null)
  const [lastSummary, setLastSummary] = useState<string | null>(null)
  const [fromDate, setFromDate]       = useState('')
  const [toDate, setToDate]           = useState(todayStr())
  const [dryRun, setDryRun]           = useState(false)
  const [running, setRunning]         = useState(false)
  const [events, setEvents]           = useState<ProgressEvent[]>([])
  const [done, setDone]               = useState<ProgressEvent | null>(null)
  const [pullError, setPullError]     = useState('')
  const logRef = useRef<HTMLDivElement>(null)

  // Load last pull info
  useEffect(() => {
    fetch('/api/automations/nedarim-pull')
      .then(r => r.json())
      .then(d => {
        setLastRun(d.lastRun ?? null)
        setLastSummary(d.lastSummary ?? null)
        // Default from = day after last pull's to-date, or 30 days ago
        if (d.lastTo) {
          // lastTo is DD/MM/YYYY — convert to ISO
          const parts = String(d.lastTo).split('/')
          if (parts.length === 3) {
            const nextDay = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`)
            nextDay.setDate(nextDay.getDate() + 1)
            setFromDate(nextDay.toISOString().split('T')[0])
            return
          }
        }
        const d30 = new Date(); d30.setDate(d30.getDate() - 30)
        setFromDate(d30.toISOString().split('T')[0])
      })
      .catch(() => {
        const d30 = new Date(); d30.setDate(d30.getDate() - 30)
        setFromDate(d30.toISOString().split('T')[0])
      })
  }, [])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [events])

  async function startPull() {
    if (!fromDate || !toDate) return
    if (fromDate > toDate) { setPullError('תאריך התחלה חייב להיות לפני תאריך הסיום'); return }
    setPullError('')
    setRunning(true)
    setEvents([])
    setDone(null)

    try {
      const res = await fetch('/api/automations/nedarim-pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: toNedarimDate(fromDate),
          to:   toNedarimDate(toDate),
          dryRun,
        }),
      })

      const reader  = res.body!.getReader()
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done: readerDone, value } = await reader.read()
        if (readerDone) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed) continue
          try {
            const ev: ProgressEvent = JSON.parse(trimmed)
            if (ev.type === 'complete') { setDone(ev); if (!dryRun) onDone() }
            else if (ev.type === 'error') setPullError(ev.error ?? 'שגיאה')
            setEvents(prev => [...prev, ev])
          } catch { /* ignore */ }
        }
      }
    } catch (err) {
      setPullError(String(err))
    } finally {
      setRunning(false)
    }
  }

  const progressEv = events.filter(e => e.type === 'progress').at(-1)
  const progressPct = (progressEv?.current && progressEv?.total)
    ? Math.round((progressEv.current / progressEv.total) * 100)
    : 0

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <h2 className="text-lg font-bold text-gray-800">משיכת הו"ק מנדרים</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Last pull info */}
          <div className="bg-indigo-50 rounded-xl p-3 text-sm text-indigo-800">
            {lastRun ? (
              <>
                <p className="font-semibold text-xs text-indigo-500 mb-0.5">משיכה אחרונה</p>
                <p>{new Date(lastRun).toLocaleString('he-IL')}</p>
                {lastSummary && <p className="text-xs text-indigo-600 mt-0.5">{lastSummary}</p>}
              </>
            ) : (
              <p className="text-indigo-500">לא נמשכו נתונים עדיין</p>
            )}
          </div>

          {/* Date range */}
          {!running && !done && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">מתאריך</label>
                  <input
                    type="date"
                    value={fromDate}
                    onChange={e => setFromDate(e.target.value)}
                    max={toDate}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">עד תאריך</label>
                  <input
                    type="date"
                    value={toDate}
                    onChange={e => setToDate(e.target.value)}
                    max={todayStr()}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
                <input type="checkbox" checked={dryRun} onChange={e => setDryRun(e.target.checked)}
                  className="rounded" />
                <span>הרצת ניסיון (בלי שמירה)</span>
              </label>

              {pullError && <p className="text-red-600 text-sm">{pullError}</p>}
            </div>
          )}

          {/* Progress */}
          {running && (
            <div className="space-y-3">
              {progressEv && (
                <>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>מעבד {progressEv.current} מתוך {progressEv.total}</span>
                    <span>{progressPct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-300"
                      style={{ width: `${progressPct}%` }}
                    />
                  </div>
                  {progressEv.donorName && (
                    <div className="bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-gray-500 text-xs">עכשיו:</span>{' '}
                      <span className="font-medium">{progressEv.donorName}</span>
                      {progressEv.amount != null && (
                        <span className="mr-2 text-emerald-700 font-semibold">₪{fmt(progressEv.amount)}</span>
                      )}
                      {progressEv.status && (
                        <span className={`mr-2 text-xs px-1.5 py-0.5 rounded-full ${
                          progressEv.status.includes('חזרה') || progressEv.status.includes('החזרת')
                            ? 'bg-red-100 text-red-600'
                            : 'bg-emerald-100 text-emerald-700'
                        }`}>{progressEv.status}</span>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Live log */}
              <div ref={logRef} className="bg-gray-50 rounded-xl p-3 text-xs text-gray-600 space-y-0.5 h-32 overflow-y-auto font-mono">
                {events.filter(e => e.type === 'step').map((e, i) => (
                  <div key={i} className="text-indigo-600">▶ {e.msg}</div>
                ))}
              </div>
            </div>
          )}

          {/* Summary */}
          {done && (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-emerald-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-emerald-700">{done.imported}</p>
                  <p className="text-xs text-emerald-600 mt-0.5">תנועות יובאו</p>
                </div>
                <div className="bg-red-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-red-600">{done.returned}</p>
                  <p className="text-xs text-red-500 mt-0.5">החזרות</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-3 text-center">
                  <p className="text-2xl font-bold text-gray-500">{done.skipped}</p>
                  <p className="text-xs text-gray-400 mt-0.5">דולגו</p>
                </div>
              </div>
              {(done.totalAmount ?? 0) > 0 && (
                <div className="bg-indigo-50 rounded-xl p-4 text-center">
                  <p className="text-xs text-indigo-500 mb-1">סה"כ כסף שנכנס</p>
                  <p className="text-3xl font-bold text-indigo-700">₪{fmt(done.totalAmount ?? 0)}</p>
                </div>
              )}
              <div className="text-center">
                <p className="text-sm text-gray-500">
                  {done.dryRun ? '🔍 ניסיון — לא נשמר כלום' : `${toDisplayDate(fromDate)} – ${toDisplayDate(toDate)}`}
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-gray-100 flex gap-3 justify-end">
          {!running && !done && (
            <>
              <button onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 rounded-lg border border-gray-200">
                ביטול
              </button>
              <button
                onClick={startPull}
                disabled={!fromDate || !toDate}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {dryRun ? 'הרץ ניסיון' : 'משוך נתונים'}
              </button>
            </>
          )}
          {running && (
            <span className="text-sm text-gray-500 flex items-center gap-2">
              <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
              מעבד...
            </span>
          )}
          {done && (
            <button onClick={onClose}
              className="px-5 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700">
              סגור
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
