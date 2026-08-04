'use client'

// גבול שגיאה לאזור הדשבורד. בלעדיו כל שגיאת רינדור מפילה את העמוד למסך
// "This page couldn't load" ריק, בלי שום רמז מה נשבר ובלי דרך לחזור.
// כאן מוצגת הודעה בעברית, פרטי השגיאה (לשליחה אליי), ואפשרות לנסות שוב
// בלי לאבד את מה שהיה על המסך.

import { useEffect } from 'react'

export default function DashboardError({
  error, reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error('[dashboard error]', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center p-6" dir="rtl">
      <div className="w-full max-w-lg bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4" style={{ background: 'linear-gradient(90deg, #0d1f52, #1a3a7a)' }}>
          <h2 className="text-lg font-bold text-white">משהו נשבר במסך הזה</h2>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600">
            הנתונים שלך בטוחים — זו תקלת תצוגה בלבד. אפשר לנסות שוב, ואם זה חוזר
            שלח את הפרטים שלמטה.
          </p>

          <div className="rounded-lg bg-gray-50 border border-gray-200 p-3">
            <p className="text-[11px] font-semibold text-gray-500 mb-1">פרטי השגיאה</p>
            <p className="text-xs font-mono text-red-600 break-all">
              {error?.message || 'שגיאה לא ידועה'}
            </p>
            {error?.digest && (
              <p className="text-[11px] font-mono text-gray-400 mt-1">digest: {error.digest}</p>
            )}
          </div>

          <div className="flex gap-2">
            <button onClick={reset}
              className="flex-1 py-2.5 rounded-xl font-bold text-sm text-white"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
              נסה שוב
            </button>
            <button onClick={() => window.location.href = '/dashboard'}
              className="px-4 py-2.5 rounded-xl border border-gray-200 text-gray-700 text-sm font-semibold hover:border-[#1a3a7a]">
              לדשבורד
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
