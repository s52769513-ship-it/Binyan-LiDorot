'use client'

import { useState } from 'react'

interface DeleteOldPPsModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

interface PPToDelete {
  name: string
  parentIds: string[]
  monthYear: string
  amount: number
}

export function DeleteOldPPsModal({ isOpen, onClose, onSuccess }: DeleteOldPPsModalProps) {
  const [step, setStep] = useState<'preview' | 'confirm' | 'done'>('preview')
  const [toDelete, setToDelete] = useState<PPToDelete[]>([])
  const [deleted, setDeleted] = useState(0)
  const [failed, setFailed] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handlePreview = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/planned-payments/delete-before-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeMonth: '04/2026', execute: false }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'שגיאה')
        return
      }

      if (data.toDelete.length === 0) {
        setError('אין תשלומים להמחיקה')
        return
      }

      setToDelete(data.toDelete)
      setStep('confirm')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleConfirm = async () => {
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/planned-payments/delete-before-month', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ beforeMonth: '04/2026', execute: true }),
      })

      const data = await res.json()

      if (!res.ok) {
        setError(data.error || 'שגיאה במחיקה')
        return
      }

      setDeleted(data.deleted)
      setFailed(data.failed)
      setStep('done')

      setTimeout(() => {
        onSuccess()
        onClose()
      }, 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
        {step === 'preview' && (
          <>
            <h2 className="text-xl font-bold mb-4">מחיקת תשלומים מתוכננים ישנים</h2>
            <p className="text-gray-600 mb-4">
              יוסרו כל תשלומים מתוכננים שכ"ל מלפני 04/2026
            </p>
            {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                ביטול
              </button>
              <button
                onClick={handlePreview}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50"
              >
                {loading ? '...' : 'בדוק כמה לי יש'}
              </button>
            </div>
          </>
        )}

        {step === 'confirm' && (
          <>
            <h2 className="text-xl font-bold mb-4">אישור מחיקה</h2>
            <div className="mb-4 max-h-64 overflow-y-auto">
              <p className="font-semibold mb-3 text-red-600">
                ⚠️ עומדים למחיקה {toDelete.length} תשלומים:
              </p>
              <div className="space-y-2 text-sm">
                {toDelete.map((pp, idx) => (
                  <div key={idx} className="bg-gray-100 p-2 rounded">
                    <div>{pp.name} - {pp.monthYear}</div>
                    <div className="text-gray-600">{pp.amount}₪</div>
                  </div>
                ))}
              </div>
            </div>
            {error && <div className="text-red-600 mb-4 text-sm">{error}</div>}
            <div className="flex gap-3">
              <button
                onClick={() => setStep('preview')}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >
                חזור
              </button>
              <button
                onClick={handleConfirm}
                disabled={loading}
                className="flex-1 px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              >
                {loading ? '...' : 'מחק עכשיו!'}
              </button>
            </div>
          </>
        )}

        {step === 'done' && (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="text-4xl mb-4">✅</div>
            <p className="text-lg font-bold text-green-600 mb-2">אנדה!</p>
            <p className="text-gray-600 text-sm text-center">
              נמחקו {deleted} תשלומים
              {failed > 0 && ` (${failed} כשלו)`}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
