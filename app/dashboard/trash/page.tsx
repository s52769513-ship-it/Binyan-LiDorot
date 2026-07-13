'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

interface DeletedRecord {
  id: string
  record_type: string
  record_id: string
  deleted_by: string
  deleted_at: string
  restore_deadline: string
  data: any
  parentNames?: string[]
}

const RECORD_TYPES = [
  { value: null, label: 'הכל' },
  { value: 'transaction', label: 'תנועות' },
  { value: 'planned_payment', label: 'תשלומים מתוכננים' },
  { value: 'student', label: 'תלמידים' },
  { value: 'parent', label: 'הורים' },
  { value: 'standing_order', label: 'הוראות קבע' },
  { value: 'woman', label: 'נשים' },
]

const getRecordDisplay = (record: DeletedRecord): string => {
  const data = record.data
  switch (record.record_type) {
    case 'transaction':
      return `${Math.abs(data.amount || 0)} ₪ - ${data.notes || 'ללא הערה'}`
    case 'planned_payment':
      return `${data.name || data.description || 'ללא תיאור'} - ${data.amount || 0} ₪`
    case 'student':
      return `${data.name || 'ללא שם'}${data.class_name ? ` - ${data.class_name}` : ''}`
    case 'parent':
      return `${data.name || 'ללא שם'}`
    case 'standing_order':
      return `${data.bank_name || 'הוראת קבע'}${data.charge_amount ? ` - ${data.charge_amount} ₪` : ''}`
    case 'woman':
      return `${data.name || 'ללא שם'}`
    default:
      return JSON.stringify(data).slice(0, 50)
  }
}

// שם ההורה/אדם המשויך לרשומה - מגיע מה-server (parentNames, מיושב מ-parent_ids),
// חוץ מרשומת הורה עצמה שהשם שלה כבר ב-data.name.
const getPersonName = (record: DeletedRecord): string => {
  if (record.record_type === 'parent') return record.data?.name || '—'
  if (record.record_type === 'student' || record.record_type === 'woman') return record.data?.name || '—'
  return record.parentNames?.length ? record.parentNames.join(', ') : '—'
}

const getCategory = (record: DeletedRecord): string => {
  const data = record.data
  if (record.record_type === 'transaction' || record.record_type === 'planned_payment') {
    const names = (data?.project_names as string[]) ?? []
    return names.length ? names.join(', ') : '—'
  }
  return '—'
}

const getPaymentMethod = (record: DeletedRecord): string => {
  const data = record.data
  if (record.record_type === 'transaction') return data?.type || '—'
  if (record.record_type === 'standing_order') return data?.standing_order_type || data?.bank_name || '—'
  return '—'
}

const getDaysUntilPurge = (deadline: string): number => {
  const now = new Date()
  const deadlineDate = new Date(deadline)
  const diffTime = deadlineDate.getTime() - now.getTime()
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24))
}

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '—'
  const date = new Date(dateStr)
  const day = date.getDate()
  const month = date.getMonth() + 1
  const year = date.getFullYear().toString().slice(2)
  const hours = date.getHours().toString().padStart(2, '0')
  const minutes = date.getMinutes().toString().padStart(2, '0')
  return `${day}/${month}/${year} ${hours}:${minutes}`
}

export default function TrashPage() {
  const [records, setRecords] = useState<DeletedRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedType, setSelectedType] = useState<string | null>(null)
  const [selectedRecords, setSelectedRecords] = useState<Set<string>>(new Set())
  const [restoringId, setRestoringId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    const query = selectedType ? `?type=${selectedType}` : ''
    fetch(`/api/deleted${query}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRecords(d.data ?? [])
      })
      .catch(() => setError('שגיאה בטעינת אשפה'))
      .finally(() => setLoading(false))
  }, [selectedType])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(load, 'deleted_records')

  const handleRestore = async (id: string) => {
    setRestoringId(id)
    try {
      const res = await fetch(`/api/deleted/${id}/restore`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setRestoringId(null)
    }
  }

  const handlePermanentDelete = async (id: string) => {
    setDeletingId(id)
    try {
      const res = await fetch(`/api/deleted/${id}/permanent`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) { setError(data.error); return }
      load()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setDeletingId(null)
    }
  }

  const toggleRecord = (id: string) => {
    const newSelected = new Set(selectedRecords)
    if (newSelected.has(id)) newSelected.delete(id)
    else newSelected.add(id)
    setSelectedRecords(newSelected)
  }

  const handleBulkRestore = async () => {
    for (const id of selectedRecords) {
      await handleRestore(id)
    }
    setSelectedRecords(new Set())
  }

  const handleBulkDelete = async () => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק סופית ${selectedRecords.size} פריטים?`)) return
    for (const id of selectedRecords) {
      await handlePermanentDelete(id)
    }
    setSelectedRecords(new Set())
  }

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-800">🗑️ אשפה</h2>
      </div>

      {error && <div className="bg-red-50 text-red-700 rounded-xl p-3 text-sm">{error}</div>}

      {/* סינון */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-medium text-gray-700 mb-3">סוג הרשומה:</p>
        <div className="flex flex-wrap gap-2">
          {RECORD_TYPES.map(({ value, label }) => (
            <button
              key={value || 'all'}
              onClick={() => { setSelectedType(value); setSelectedRecords(new Set()) }}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedType === value
                  ? 'bg-blue-100 text-blue-800 border border-blue-300'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* כפתורים לפעולות בכמויות */}
      {selectedRecords.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center justify-between">
          <span className="text-sm text-blue-800">נבחרו {selectedRecords.size} פריטים</span>
          <div className="flex gap-2">
            <button
              onClick={handleBulkRestore}
              className="px-3 py-1.5 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700"
            >
              📥 החזרה בכמויות
            </button>
            <button
              onClick={handleBulkDelete}
              className="px-3 py-1.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700"
            >
              🗑️ מחיקה סופית בכמויות
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-2">
          {[1, 2, 3].map(i => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      ) : records.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">אין רשומות בטבלת האשפה</div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[800px]">
              <thead>
                <tr className="text-xs font-semibold text-gray-400 uppercase text-right bg-gray-50 border-b border-gray-100">
                  <th className="px-4 py-3 text-left w-8">
                    <input
                      type="checkbox"
                      checked={selectedRecords.size === records.length && records.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRecords(new Set(records.map(r => r.id)))
                        } else {
                          setSelectedRecords(new Set())
                        }
                      }}
                      className="w-4 h-4"
                    />
                  </th>
                  <th className="px-4 py-3">סוג</th>
                  <th className="px-4 py-3">שם</th>
                  <th className="px-4 py-3">קטגוריה</th>
                  <th className="px-4 py-3">אמצעי תשלום</th>
                  <th className="px-4 py-3">פרטים</th>
                  <th className="px-4 py-3">מחק על-ידי / מתי</th>
                  <th className="px-4 py-3">ימים עד מחיקה סופית</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {records.map(record => {
                  const daysLeft = getDaysUntilPurge(record.restore_deadline)
                  return (
                    <tr key={record.id} className="hover:bg-blue-50/40 transition-colors">
                      <td className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          checked={selectedRecords.has(record.id)}
                          onChange={() => toggleRecord(record.id)}
                          className="w-4 h-4"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-xs font-semibold px-2 py-1 rounded ${
                          record.record_type === 'transaction' ? 'bg-blue-100 text-blue-800' :
                          record.record_type === 'planned_payment' ? 'bg-purple-100 text-purple-800' :
                          record.record_type === 'student' ? 'bg-green-100 text-green-800' :
                          record.record_type === 'parent' ? 'bg-orange-100 text-orange-800' :
                          record.record_type === 'standing_order' ? 'bg-cyan-100 text-cyan-800' :
                          record.record_type === 'woman' ? 'bg-pink-100 text-pink-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {RECORD_TYPES.find(t => t.value === record.record_type)?.label || record.record_type}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-700 font-medium max-w-[160px] truncate">
                        {getPersonName(record)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 max-w-[140px] truncate">
                        {getCategory(record)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500 whitespace-nowrap">
                        {getPaymentMethod(record)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-[220px] truncate">
                        {getRecordDisplay(record)}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        <div className="text-xs">{record.deleted_by}</div>
                        <div className="text-xs text-gray-400">{formatDate(record.deleted_at)}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className={`text-sm font-bold ${
                          daysLeft < 7 ? 'text-red-600' : daysLeft < 14 ? 'text-orange-600' : 'text-green-600'
                        }`}>
                          {daysLeft} ימים
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => handleRestore(record.id)}
                            disabled={restoringId === record.id}
                            className="text-xs bg-emerald-600 text-white px-2.5 py-1 rounded hover:bg-emerald-700 disabled:opacity-60"
                          >
                            📥 {restoringId === record.id ? 'החזרה...' : 'החזרה'}
                          </button>
                          <button
                            onClick={() => handlePermanentDelete(record.id)}
                            disabled={deletingId === record.id}
                            className="text-xs bg-red-600 text-white px-2.5 py-1 rounded hover:bg-red-700 disabled:opacity-60"
                          >
                            🗑️ {deletingId === record.id ? 'מוחק...' : 'מחק סופית'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
