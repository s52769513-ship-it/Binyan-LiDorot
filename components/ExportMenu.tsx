'use client'

import { useEffect, useRef, useState } from 'react'
import { exportRowsToExcel, exportElementToPDF, printElement, type ExportRow } from '@/lib/exportUtils'

interface Props {
  /** שם קובץ בסיס (ללא סיומת) */
  filename: string
  /** כותרת להדפסה */
  title: string
  /** בונה את שורות האקסל בעת הלחיצה */
  getRows: () => ExportRow[]
  /** האלמנט שיודפס / יומר ל-PDF */
  target: React.RefObject<HTMLElement | null>
  className?: string
}

/** כפתור "הורדה" קטן שפותח תפריט: הדפסה / PDF / אקסל. */
export default function ExportMenu({ filename, title, getRows, target, className }: Props) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState<'pdf' | 'excel' | 'print' | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const doExcel = async () => {
    setBusy('excel')
    try { await exportRowsToExcel(getRows(), filename) } finally { setBusy(null); setOpen(false) }
  }
  const doPDF = async () => {
    if (!target.current) return
    setBusy('pdf')
    try { await exportElementToPDF(target.current, filename) } finally { setBusy(null); setOpen(false) }
  }
  const doPrint = () => {
    if (!target.current) return
    setBusy('print')
    try { printElement(target.current, title) } finally { setBusy(null); setOpen(false) }
  }

  return (
    <div ref={wrapRef} className={`relative ${className ?? ''}`}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-semibold transition-colors"
      >
        <span>⬇</span> הורדה
      </button>
      {open && (
        <div className="absolute left-0 mt-1 w-40 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-10" dir="rtl">
          <button onClick={doPrint} disabled={!!busy}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-right">
            <span>🖨️</span> {busy === 'print' ? '...' : 'הדפסה'}
          </button>
          <button onClick={doPDF} disabled={!!busy}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-right border-t border-gray-50">
            <span>📄</span> {busy === 'pdf' ? 'מכין...' : 'הורדת PDF'}
          </button>
          <button onClick={doExcel} disabled={!!busy}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50 text-right border-t border-gray-50">
            <span>📊</span> {busy === 'excel' ? '...' : 'הורדת אקסל'}
          </button>
        </div>
      )}
    </div>
  )
}
