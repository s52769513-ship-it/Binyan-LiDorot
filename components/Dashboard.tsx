'use client'

import { useCallback, useEffect, useState } from 'react'
import { DashboardSummary, ParentSummary, SyncResult } from '@/lib/types'
import FinancialSummary from './FinancialSummary'
import ParentList from './ParentList'
import PaymentChart from './PaymentChart'
import ParentCard from './ParentCard'

const EMPTY_SUMMARY: DashboardSummary = {
  totalDebts: 0,
  totalPlannedPayments: 0,
  currentMonthTransactions: 0,
  monthlyData: [],
  lastSync: null,
}

type SyncStatus = 'idle' | 'syncing' | 'success' | 'error'
type SetupStatus = 'idle' | 'running' | 'success' | 'error'

function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'לפני כמה שניות'
  if (m < 60) return `לפני ${m} דקות`
  const h = Math.floor(m / 60)
  if (h < 24) return `לפני ${h} שעות`
  return `לפני ${Math.floor(h / 24)} ימים`
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY)
  const [parents, setParents] = useState<ParentSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingParents, setLoadingParents] = useState(true)
  const [error, setError] = useState('')
  const [syncStatus, setSyncStatus] = useState<SyncStatus>('idle')
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null)
  const [setupStatus, setSetupStatus] = useState<SetupStatus>('idle')
  const [setupMsg, setSetupMsg] = useState('')

  const loadData = useCallback(() => {
    setLoadingSummary(true)
    setLoadingParents(true)
    setError('')

    fetch('/api/summary')
      .then(r => r.json())
      .then(d => { if (!d.error) setSummary(d); else setError(d.error) })
      .catch(() => setError('שגיאה בחיבור לשרת'))
      .finally(() => setLoadingSummary(false))

    fetch('/api/parents')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setParents(d) })
      .catch(() => setError('שגיאה בטעינת הורים'))
      .finally(() => setLoadingParents(false))
  }, [])

  useEffect(() => { loadData() }, [loadData])

  async function handleSetup() {
    setSetupStatus('running')
    setSetupMsg('')
    try {
      const res = await fetch('/api/setup', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setSetupStatus('error')
        setSetupMsg(data.error)
      } else {
        setSetupStatus('success')
        setSetupMsg(`${data.total} פקודות בוצעו · ${data.failed} שגיאות`)
      }
    } catch {
      setSetupStatus('error')
      setSetupMsg('שגיאת חיבור')
    }
    setTimeout(() => setSetupStatus('idle'), 10000)
  }

  async function handleSync() {
    setSyncStatus('syncing')
    setSyncResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data: SyncResult = await res.json()
      if (data.error) {
        setSyncStatus('error')
        setSyncResult(data)
      } else {
        setSyncStatus('success')
        setSyncResult(data)
        // Reload fresh data from Supabase
        loadData()
      }
    } catch {
      setSyncStatus('error')
    }
    // Reset status after 8 seconds
    setTimeout(() => setSyncStatus('idle'), 8000)
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
          {/* Action buttons */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Setup DB button */}
            <button
              onClick={handleSetup}
              disabled={setupStatus === 'running'}
              title="מריץ את lib/schema.sql מול Supabase ויוצר את הטבלאות"
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                setupStatus === 'running'
                  ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  : setupStatus === 'success'
                  ? 'bg-emerald-100 text-emerald-700'
                  : setupStatus === 'error'
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              <span>{setupStatus === 'running' ? '⟳' : setupStatus === 'success' ? '✓' : setupStatus === 'error' ? '✕' : '🗄'}</span>
              {setupStatus === 'running' ? 'מקים...' : setupStatus === 'success' ? 'הוקם!' : setupStatus === 'error' ? 'שגיאה' : 'הקמת טבלאות'}
            </button>
            {setupMsg && (
              <span className={`text-xs hidden sm:inline ${setupStatus === 'error' ? 'text-red-500' : 'text-gray-500'}`}>
                {setupMsg}
              </span>
            )}

            <div className="w-px h-6 bg-gray-200 mx-1 hidden sm:block" />

            {/* Sync button */}
            <button
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                syncStatus === 'syncing'
                  ? 'bg-indigo-100 text-indigo-400 cursor-not-allowed'
                  : syncStatus === 'success'
                  ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                  : syncStatus === 'error'
                  ? 'bg-red-100 text-red-700 hover:bg-red-200'
                  : 'bg-indigo-600 text-white hover:bg-indigo-700'
              }`}
            >
              <span className={syncStatus === 'syncing' ? 'animate-spin inline-block' : ''}>
                {syncStatus === 'syncing' ? '⟳' : syncStatus === 'success' ? '✓' : syncStatus === 'error' ? '✕' : '⟳'}
              </span>
              {syncStatus === 'syncing'
                ? 'מסנכרן...'
                : syncStatus === 'success'
                ? 'סונכרן!'
                : syncStatus === 'error'
                ? 'שגיאה'
                : 'סנכרן מ-Airtable'}
            </button>

            {/* Sync details */}
            {syncStatus === 'success' && syncResult?.counts && (
              <span className="text-xs text-gray-500 hidden sm:inline">
                {syncResult.counts.parents} הורים ·{' '}
                {syncResult.counts.students} תלמידים ·{' '}
                {syncResult.counts.transactions} תנועות
              </span>
            )}
            {syncStatus === 'error' && syncResult?.error && (
              <span className="text-xs text-red-500 max-w-xs truncate">
                {syncResult.error}
              </span>
            )}
            {syncStatus === 'idle' && summary.lastSync && (
              <span className="text-xs text-gray-400 hidden sm:inline">
                סנכרון אחרון: {timeAgo(summary.lastSync)}
              </span>
            )}
          </div>

          {/* School name */}
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900 leading-tight">בנין לדורות</h1>
            <p className="text-xs text-gray-500">מערכת ניהול · תלמוד תורה ובית חינוך</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm flex items-center justify-between">
            <button onClick={loadData} className="text-red-600 underline text-xs">נסה שוב</button>
            <span>{error}</span>
          </div>
        )}

        {/* No data yet – prompt first sync */}
        {!loadingParents && parents.length === 0 && !error && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-6 text-center">
            <p className="text-indigo-800 font-semibold mb-2">הטבלאות ריקות – יש לסנכרן ראשית מ-Airtable</p>
            <p className="text-indigo-600 text-sm mb-4">לחץ על "סנכרן מ-Airtable" בכותרת כדי לייבא את הנתונים</p>
            <button
              onClick={handleSync}
              disabled={syncStatus === 'syncing'}
              className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors disabled:opacity-50"
            >
              {syncStatus === 'syncing' ? 'מסנכרן...' : 'סנכרן עכשיו'}
            </button>
          </div>
        )}

        {/* Summary cards */}
        {loadingSummary ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-5 h-24 animate-pulse" />
            ))}
          </div>
        ) : (
          <FinancialSummary summary={summary} />
        )}

        {/* Chart */}
        {!loadingSummary && summary.monthlyData.some(d => d.amount > 0) && (
          <PaymentChart data={summary.monthlyData} />
        )}

        {/* Parent list */}
        {(parents.length > 0 || loadingParents) && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">
                {loadingParents ? 'טוען...' : `${parents.length} אנ"ש`}
              </span>
              <h2 className="text-lg font-bold text-gray-800">רשימת אנ"ש</h2>
            </div>

            {loadingParents ? (
              <div className="bg-white rounded-xl border border-gray-200 p-8">
                <div className="space-y-3 animate-pulse">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                  ))}
                </div>
              </div>
            ) : (
              <ParentList parents={parents} onSelectParent={setSelectedId} />
            )}
          </div>
        )}
      </main>

      {/* Parent detail modal */}
      {selectedId && (
        <ParentCard parentId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
