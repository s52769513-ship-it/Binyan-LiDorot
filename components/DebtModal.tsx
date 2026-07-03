'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { attributeTxsToPP } from '@/lib/ppAttribution'

const AddTransactionModal = dynamic(() => import('./AddTransactionModal'), { ssr: false })

interface DebtItem {
  id: string
  name?: string
  type?: string
  amount: number
  balance?: number
  monthYear: string
  date?: string
  notes?: string
}

interface DebtCategory {
  total: number
  balance?: number
  items: DebtItem[]
}

interface DebtSummaryData {
  tuitionNew: DebtCategory
  tuitionLegacy: DebtCategory
  collection: DebtCategory
  legacyDebts: { total: number; items: DebtItem[] }
  grandTotal: number
  grandBalance: number
  futureCount?: number
}

interface LinkedTx {
  id: string
  amount: number
  type: string
  date: string
  monthYear: string
  notes: string
  isCredit?: boolean
}

interface DebtModalProps {
  isOpen: boolean
  onClose: () => void
  parentId: string
  parentName?: string
}

const fmt = (n: number) => `₪${Number(n || 0).toLocaleString('he-IL')}`

/* ─── single expandable planned-payment debt row ─── */
function PPRow({
  item,
  highlight,
  onAddPayment,
  refreshKey,
}: {
  item: DebtItem
  highlight?: string
  onAddPayment: (item: DebtItem) => void
  refreshKey: number
}) {
  const [expanded, setExpanded] = useState(false)
  const [txs, setTxs] = useState<LinkedTx[] | null>(null)
  const [loading, setLoading] = useState(false)

  // (Re)load linked transactions when the row is expanded or a payment was added.
  useEffect(() => {
    if (!expanded) return
    setLoading(true)
    fetch(`/api/transactions?plannedPaymentId=${encodeURIComponent(item.id)}`)
      .then((r) => r.json())
      .then((d) => setTxs(Array.isArray(d) ? d : []))
      .catch(() => setTxs([]))
      .finally(() => setLoading(false))
  }, [expanded, item.id, refreshKey])

  return (
    <div className={`rounded border ${highlight ?? 'bg-gray-100 border-transparent'}`}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-right p-3 text-sm"
      >
        <div className="flex justify-between items-center">
          <span className="flex items-center gap-1.5">
            <span className={`text-gray-400 text-xs transition-transform ${expanded ? 'rotate-90' : ''}`}>▶</span>
            <span>{item.name}</span>
          </span>
          <span className="font-semibold">{fmt(item.amount)}</span>
        </div>
        <div className="text-xs text-gray-600 mt-1 pr-5">
          {item.monthYear} • יתרה: {fmt(item.balance ?? 0)}
        </div>
      </button>

      {expanded && (
        <div className="border-t border-gray-200/70 p-3 space-y-2 bg-white/40">
          {loading ? (
            <div className="text-xs text-gray-400">טוען תשלומים...</div>
          ) : txs && txs.length > 0 ? (() => {
            const attribution = attributeTxsToPP(txs, item.amount)
            return (
            <div className="space-y-1">
              <div className="text-[11px] font-semibold text-gray-500">תשלומים מקושרים</div>
              {txs.map((t) => (
                <div key={t.id} className="flex justify-between text-xs bg-white rounded px-2 py-1 border border-gray-100">
                  <span className="text-gray-500">
                    {t.date || t.monthYear}
                    {t.type ? ` • ${t.type}` : ''}
                    {t.isCredit ? ' • זיכוי' : ''}
                  </span>
                  <span className="font-medium tabular-nums">{fmt(Math.abs(t.amount))}</span>
                </div>
              ))}
              {attribution.overflow > 0 && (
                <div className="text-[11px] text-amber-600 bg-amber-50 rounded px-2 py-1">
                  {fmt(attribution.overflow)} מעבר לסכום המתוכנן — גלש לחובות אחרים או לזיכוי
                </div>
              )}
            </div>
            )
          })() : (
            <div className="text-xs text-gray-400">אין תשלומים מקושרים עדיין</div>
          )}

          <button
            type="button"
            onClick={() => onAddPayment(item)}
            className="w-full mt-1 px-3 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
          >
            + הוסף תשלום לרשומה זו
          </button>
        </div>
      )}
    </div>
  )
}

export function DebtModal({ isOpen, onClose, parentId, parentName }: DebtModalProps) {
  const [data, setData] = useState<DebtSummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tuition' | 'collection'>('tuition')
  const [refreshKey, setRefreshKey] = useState(0)
  const [addPaymentFor, setAddPaymentFor] = useState<DebtItem | null>(null)

  useEffect(() => {
    if (!isOpen) return
    loadDebtSummary()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, parentId])

  const loadDebtSummary = async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/parents/${parentId}/debt-summary`)
      if (!res.ok) throw new Error('שגיאה בטעינת נתונים')
      const json = await res.json()
      setData(json)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" dir="rtl">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">סיכום חובות</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}

        {loading && !data && (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-gray-300 border-t-gray-600 rounded-full animate-spin" />
          </div>
        )}

        {data && (
        <>
        {/* Summary section */}
        <div className="grid grid-cols-2 gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
          <div>
            <div className="text-xs text-gray-600">סה"כ חובות</div>
            <div className="text-lg font-bold">{fmt(data.grandTotal)}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">חוב פתוח</div>
            <div className="text-lg font-bold text-red-600">{fmt(data.grandBalance)}</div>
          </div>
        </div>

        {data.futureCount ? (
          <div className="text-[11px] text-gray-400 -mt-4 mb-4">
            {data.futureCount} תשלומים עתידיים אינם נכללים (התאריך עוד לא הגיע)
          </div>
        ) : null}

        {/* Tabs */}
        <div className="flex gap-2 mb-4 border-b">
          <button
            onClick={() => setActiveTab('tuition')}
            className={`px-3 py-2 font-semibold text-sm ${
              activeTab === 'tuition'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            שכ"ל ({data.tuitionNew.items.length + data.tuitionLegacy.items.length})
          </button>
          <button
            onClick={() => setActiveTab('collection')}
            className={`px-3 py-2 font-semibold text-sm ${
              activeTab === 'collection'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            מגבית ({data.collection.items.length})
          </button>
        </div>

        {/* Tab content */}
        <div className="space-y-3">
          {activeTab === 'tuition' && (
            <>
              {data.tuitionNew.items.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">שכ"ל חדשים</div>
                  <div className="space-y-2">
                    {data.tuitionNew.items.map((item) => (
                      <PPRow key={item.id} item={item}
                        onAddPayment={setAddPaymentFor} refreshKey={refreshKey} />
                    ))}
                  </div>
                </div>
              )}

              {data.tuitionLegacy.items.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">שכ"ל ישנים</div>
                  <div className="space-y-2">
                    {data.tuitionLegacy.items.map((item) => (
                      <PPRow key={item.id} item={item}
                        highlight="bg-yellow-50 border-yellow-200"
                        onAddPayment={setAddPaymentFor} refreshKey={refreshKey} />
                    ))}
                  </div>
                </div>
              )}

              {data.tuitionNew.items.length === 0 && data.tuitionLegacy.items.length === 0 && (
                <p className="text-gray-500 text-center py-4">אין חובות שכ"ל</p>
              )}
            </>
          )}

          {activeTab === 'collection' && (
            <>
              {data.collection.items.length > 0 ? (
                <div className="space-y-2">
                  {data.collection.items.map((item) => (
                    <PPRow key={item.id} item={item}
                      onAddPayment={setAddPaymentFor} refreshKey={refreshKey} />
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">אין חובות מגבית</p>
              )}
            </>
          )}

        </div>
        </>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded border border-gray-300 hover:bg-gray-50"
          >
            סגור
          </button>
        </div>
      </div>

      {addPaymentFor && (
        <AddTransactionModal
          parentId={parentId}
          parentName={parentName}
          plannedPaymentId={addPaymentFor.id}
          prefilledAmount={addPaymentFor.balance ?? addPaymentFor.amount}
          sourceLabel={addPaymentFor.name || addPaymentFor.monthYear}
          onClose={() => setAddPaymentFor(null)}
          onSuccess={() => {
            setAddPaymentFor(null)
            setRefreshKey((k) => k + 1)
            loadDebtSummary()
          }}
        />
      )}
    </div>
  )
}
