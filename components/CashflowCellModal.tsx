'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ExportMenu from '@/components/ExportMenu'
import type { ExportRow } from '@/lib/exportUtils'

const HMONTHS: Record<string, string> = {
  '01': 'ינואר', '02': 'פברואר', '03': 'מרץ', '04': 'אפריל', '05': 'מאי', '06': 'יוני',
  '07': 'יולי', '08': 'אוגוסט', '09': 'ספטמבר', '10': 'אוקטובר', '11': 'נובמבר', '12': 'דצמבר',
}
const fmtMonth = (my: string) => { const [m, y] = (my || '').split('/'); return m && y ? `${HMONTHS[m] ?? m} ${y}` : my }
const fmt = (n: number) => new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(Math.abs(n))

export type CashflowPool = 'tuition' | 'donation' | 'salary'
export type CashflowField = 'planned' | 'collected' | 'remaining'

/** רכיב אחד של תא נטו (מוצג ישירות, בלי שליפה נוספת) */
export interface NetComponent { label: string; amount: number; sign: 1 | -1 }

export interface CashflowCellTarget {
  month: string
  /** כותרת התא (למשל "הכנסות שכ״ל · צפוי") */
  label: string
  accent: string
  /** תא רגיל — שליפה מהשרת */
  pool?: CashflowPool
  field?: CashflowField
  /** תא נטו — הרכב מקומי, בלי שליפה */
  netComponents?: NetComponent[]
}

interface Props {
  target: CashflowCellTarget
  onClose: () => void
  onOpenParent: (id: string) => void
}

interface Row { parentId: string; parentName: string; amount: number }

/**
 * חלון "ממה מורכב המספר" בתזרים. תא רגיל — רשימת ההורים והסכום שלהם (שליפה
 * מ-/api/cashflow/breakdown, לחיצה על הורה פותחת כרטיס). תא נטו — הרכב
 * הקומפוננטות (שכ"ל + מגבית − משכורת). בכל מקרה יש כפתור הורדה (הדפסה/PDF/אקסל).
 */
export default function CashflowCellModal({ target, onClose, onOpenParent }: Props) {
  const [rows, setRows]       = useState<Row[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(!target.netComponents)
  const [error, setError]     = useState('')
  const printRef = useRef<HTMLDivElement>(null)

  const isNet = !!target.netComponents

  useEffect(() => {
    if (isNet) return
    setLoading(true); setError('')
    const params = new URLSearchParams({ month: target.month, pool: target.pool!, field: target.field! })
    fetch(`/api/cashflow/breakdown?${params}`)
      .then(r => r.json())
      .then(d => {
        if (d.error) { setError(d.error); return }
        setRows(d.rows ?? [])
        setTotal(d.total ?? 0)
      })
      .catch(() => setError('שגיאה בטעינת פירוט'))
      .finally(() => setLoading(false))
  }, [isNet, target.month, target.pool, target.field])

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])

  const filename = `${target.label.replace(/[·\s]+/g, '-')}-${target.month.replace('/', '-')}`

  const getRows = (): ExportRow[] => {
    if (isNet) {
      return target.netComponents!.map(c => ({
        'רכיב': c.label,
        'סכום': c.sign * c.amount,
      }))
    }
    return rows.map(r => ({ 'הורה': r.parentName, 'סכום': r.amount }))
  }

  const netTotal = useMemo(
    () => (target.netComponents ?? []).reduce((s, c) => s + c.sign * c.amount, 0),
    [target.netComponents],
  )

  return (
    <div className="fixed inset-0 z-[85] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 flex items-center justify-between gap-3 shrink-0"
          style={{ background: `linear-gradient(135deg, ${target.accent}, ${target.accent}dd)` }}>
          <div className="min-w-0">
            <h2 className="text-white font-bold text-sm truncate">{target.label}</h2>
            <p className="text-white/80 text-xs mt-0.5">{fmtMonth(target.month)}</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <ExportMenu filename={filename} title={`${target.label} · ${fmtMonth(target.month)}`} getRows={getRows} target={printRef} />
            <button onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/30 text-white text-lg leading-none">×</button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4">
          <div ref={printRef}>
            <h1 className="text-sm font-bold text-gray-700 mb-2 pb-1.5 border-b border-gray-100">
              {target.label} · {fmtMonth(target.month)}
            </h1>
            {isNet ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-right py-1.5">רכיב</th>
                    <th className="text-left py-1.5">סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {target.netComponents!.map((c, i) => (
                    <tr key={i} className="border-b border-gray-50">
                      <td className="py-2 text-gray-700">{c.label}</td>
                      <td className={`py-2 text-left tabular-nums font-medium ${c.sign > 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                        {c.sign > 0 ? '+' : '−'}₪{fmt(c.amount)}
                      </td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td className="py-2 font-bold text-gray-800">נטו</td>
                    <td className={`py-2 text-left tabular-nums font-bold ${netTotal >= 0 ? 'text-emerald-700' : 'text-red-600'}`}>
                      {netTotal >= 0 ? '+' : '−'}₪{fmt(netTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            ) : loading ? (
              <div className="space-y-2">{[1, 2, 3, 4, 5].map(i => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
            ) : error ? (
              <div className="py-12 text-center text-red-400 text-sm">{error}</div>
            ) : rows.length === 0 ? (
              <div className="py-12 text-center text-gray-400 text-sm">אין רשומות</div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-gray-400 border-b border-gray-100">
                    <th className="text-right py-1.5">הורה</th>
                    <th className="text-left py-1.5">סכום</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.parentId || r.parentName} className="border-b border-gray-50 hover:bg-gray-50 group">
                      <td className="py-2">
                        <button
                          onClick={() => r.parentId && onOpenParent(r.parentId)}
                          disabled={!r.parentId}
                          className="text-gray-800 group-hover:text-[#1a3a7a] disabled:cursor-default text-right"
                        >
                          {r.parentName}
                          {r.parentId && <span className="text-gray-300 text-xs mr-1 opacity-0 group-hover:opacity-100">↗</span>}
                        </button>
                      </td>
                      <td className="py-2 text-left tabular-nums font-medium" style={{ color: target.accent }}>₪{fmt(r.amount)}</td>
                    </tr>
                  ))}
                  <tr className="tot">
                    <td className="py-2 font-bold text-gray-800">סה״כ ({rows.length})</td>
                    <td className="py-2 text-left tabular-nums font-bold text-gray-800">₪{fmt(total)}</td>
                  </tr>
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
