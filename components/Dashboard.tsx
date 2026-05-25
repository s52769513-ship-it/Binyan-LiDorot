'use client'

import { useEffect, useState } from 'react'
import { DashboardSummary, ParentSummary } from '@/lib/types'
import FinancialSummary from './FinancialSummary'
import ParentList from './ParentList'
import PaymentChart from './PaymentChart'
import ParentCard from './ParentCard'

const EMPTY_SUMMARY: DashboardSummary = {
  totalDebts: 0,
  totalPlannedPayments: 0,
  currentMonthTransactions: 0,
  monthlyData: [],
}

export default function Dashboard() {
  const [summary, setSummary] = useState<DashboardSummary>(EMPTY_SUMMARY)
  const [parents, setParents] = useState<ParentSummary[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [loadingSummary, setLoadingSummary] = useState(true)
  const [loadingParents, setLoadingParents] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/summary')
      .then(r => r.json())
      .then(d => { if (!d.error) setSummary(d) })
      .catch(() => setError('שגיאה בטעינת סיכום'))
      .finally(() => setLoadingSummary(false))

    fetch('/api/parents')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setParents(d) })
      .catch(() => setError('שגיאה בטעינת רשימת הורים'))
      .finally(() => setLoadingParents(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3 text-gray-400 text-sm">
            <span>
              {new Intl.DateTimeFormat('he-IL', { dateStyle: 'long' }).format(new Date())}
            </span>
          </div>
          <div className="text-right">
            <h1 className="text-xl font-bold text-gray-900">בנין לדורות</h1>
            <p className="text-xs text-gray-500">מערכת ניהול · תלמוד תורה ובית חינוך</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            {error}
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
        {!loadingSummary && summary.monthlyData.length > 0 && (
          <PaymentChart data={summary.monthlyData} />
        )}

        {/* Parent list */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm text-gray-400">
              {loadingParents ? 'טוען...' : `${parents.length} אנ"ש`}
            </span>
            <h2 className="text-lg font-bold text-gray-800">רשימת אנ"ש</h2>
          </div>

          {loadingParents ? (
            <div className="bg-white rounded-xl border border-gray-200 p-8 animate-pulse">
              <div className="space-y-3">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-12 bg-gray-100 rounded-lg" />
                ))}
              </div>
            </div>
          ) : (
            <ParentList parents={parents} onSelectParent={setSelectedId} />
          )}
        </div>
      </main>

      {/* Parent detail modal */}
      {selectedId && (
        <ParentCard parentId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </div>
  )
}
