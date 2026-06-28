'use client'

import { useEffect, useState } from 'react'

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
}

interface DebtModalProps {
  isOpen: boolean
  onClose: () => void
  parentId: string
}

export function DebtModal({ isOpen, onClose, parentId }: DebtModalProps) {
  const [data, setData] = useState<DebtSummaryData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'tuition' | 'collection' | 'legacy'>('tuition')

  useEffect(() => {
    if (!isOpen) return
    loadDebtSummary()
  }, [isOpen, parentId])

  const loadDebtSummary = async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const res = await fetch(`/api/parents/${parentId}/debt-summary`)
      if (!res.ok) throw new Error('שגיאה בטעינת נתונים')
      const data = await res.json()
      setData(data)
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
            <div className="text-lg font-bold">₪{data.grandTotal.toLocaleString('he-IL')}</div>
          </div>
          <div>
            <div className="text-xs text-gray-600">חוב פתוח</div>
            <div className="text-lg font-bold text-red-600">₪{data.grandBalance.toLocaleString('he-IL')}</div>
          </div>
        </div>

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
          <button
            onClick={() => setActiveTab('legacy')}
            className={`px-3 py-2 font-semibold text-sm ${
              activeTab === 'legacy'
                ? 'text-orange-600 border-b-2 border-orange-600'
                : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            חובות ישנים ({data.legacyDebts.items.length})
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
                      <div key={item.id} className="bg-gray-100 p-3 rounded text-sm">
                        <div className="flex justify-between">
                          <span>{item.name}</span>
                          <span className="font-semibold">₪{Number(item.amount).toLocaleString('he-IL')}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {item.monthYear} • יתרה: ₪{Number(item.balance).toLocaleString('he-IL')}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.tuitionLegacy.items.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-gray-700 mb-2">שכ"ל ישנים</div>
                  <div className="space-y-2">
                    {data.tuitionLegacy.items.map((item) => (
                      <div key={item.id} className="bg-yellow-50 p-3 rounded text-sm border border-yellow-200">
                        <div className="flex justify-between">
                          <span>{item.name}</span>
                          <span className="font-semibold">₪{Number(item.amount).toLocaleString('he-IL')}</span>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {item.monthYear} • יתרה: ₪{Number(item.balance).toLocaleString('he-IL')}
                        </div>
                      </div>
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
                    <div key={item.id} className="bg-gray-100 p-3 rounded text-sm">
                      <div className="flex justify-between">
                        <span>{item.name}</span>
                        <span className="font-semibold">₪{Number(item.amount).toLocaleString('he-IL')}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {item.monthYear} • יתרה: ₪{Number(item.balance).toLocaleString('he-IL')}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">אין חובות מגבית</p>
              )}
            </>
          )}

          {activeTab === 'legacy' && (
            <>
              {data.legacyDebts.items.length > 0 ? (
                <div className="space-y-2">
                  {data.legacyDebts.items.map((item) => (
                    <div key={item.id} className="bg-red-50 p-3 rounded text-sm border border-red-200">
                      <div className="flex justify-between">
                        <span>{item.type}</span>
                        <span className="font-semibold">₪{Number(item.amount).toLocaleString('he-IL')}</span>
                      </div>
                      <div className="text-xs text-gray-600 mt-1">
                        {item.monthYear} {item.notes && `• ${item.notes}`}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-4">אין חובות היסטוריים</p>
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
    </div>
  )
}
