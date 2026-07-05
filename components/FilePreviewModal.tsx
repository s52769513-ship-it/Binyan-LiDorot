'use client'

import { useState } from 'react'

// In-page preview for an attached file (image/PDF), instead of opening it in
// a new browser tab. Content filters like Netfree often trust/allow content
// already loaded inside the current page session but re-check (and can
// block) a fresh top-level navigation to an unfamiliar storage domain — a
// same-tab embed avoids that new navigation entirely.
export default function FilePreviewModal({ url, name, onClose }: {
  url: string
  name?: string
  onClose: () => void
}) {
  const isImage = /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(url)
  const isPdf   = /\.pdf$/i.test(url)
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      // Fetch as a blob so `download` is honored regardless of the storage
      // host's response headers (cross-origin URLs otherwise just navigate).
      const res = await fetch(url)
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      a.download = name || 'חשבונית'
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(blobUrl)
    } catch {
      window.open(url, '_blank')
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm no-print" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl h-[85vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
        dir="rtl"
      >
        <div className="px-4 py-3 border-b flex items-center justify-between flex-shrink-0 no-print" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
          <span className="text-sm font-bold truncate" style={{ color: '#d4a921' }}>{name || 'חשבונית'}</span>
        </div>

        <div className="px-4 py-2 border-b flex items-center gap-2 flex-shrink-0 bg-gray-50 no-print">
          <button onClick={handleDownload} disabled={downloading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 disabled:opacity-60">
            ⬇️ {downloading ? 'מוריד...' : 'הורדה'}
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100">
            🖨️ הדפסה
          </button>
        </div>

        <div id="receipt-print-area" className="flex-1 overflow-auto bg-gray-50 flex items-center justify-center">
          {isImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={url} alt={name || 'חשבונית'} className="max-w-full max-h-full object-contain" />
          ) : isPdf ? (
            <iframe src={url} title={name || 'חשבונית'} className="w-full h-full border-0" />
          ) : (
            <div className="text-center text-gray-500 text-sm p-6">
              <p>לא ניתן להציג תצוגה מקדימה לסוג קובץ זה.</p>
            </div>
          )}
        </div>
      </div>

      {/* Print only the file content — hide everything else on the page,
          including the toolbar/close button, while it's rendered. */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #receipt-print-area, #receipt-print-area * { visibility: visible; }
          #receipt-print-area { position: fixed; inset: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
    </div>
  )
}
