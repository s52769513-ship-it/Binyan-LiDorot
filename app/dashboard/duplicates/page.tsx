'use client'

import { useCallback, useEffect, useState } from 'react'
import { authHeaders } from '@/lib/authHeaders'

const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

interface PP {
  id: string
  name: string
  amount: number
  balance: number
  paid: number
  linkedTxCount: number
  isLegacy: boolean
  createdAt: string
  safeToDelete: boolean
}
interface Group {
  parentIds: string[]
  parentName: string
  monthYear: string
  pps: PP[]
}

export default function DuplicatesPage() {
  const [groups, setGroups]   = useState<Group[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [confirmId, setConfirmId] = useState<string | null>(null)

  const load = useCallback(() => {
    setLoading(true); setError('')
    fetch('/api/planned-payments/duplicates?ppType=tuition')
      .then(r => r.json())
      .then(d => { if (d.error) setError(d.error); else setGroups(d.groups ?? []) })
      .catch(() => setError('שגיאה בטעינה'))
      .finally(() => setLoading(false))
  }, [])
  useEffect(() => { load() }, [load])

  const del = async (pp: PP) => {
    setDeleting(pp.id); setConfirmId(null)
    try {
      const res = await fetch(`/api/planned-payments/${pp.id}`, { method: 'DELETE', headers: authHeaders() })
      const data = await res.json().catch(() => ({}))
      if (data?.error) { setError(data.error); return }
      load()
    } catch { setError('שגיאה במחיקה') }
    finally { setDeleting(null) }
  }

  const totalPhantom = groups.reduce((s, g) => s + g.pps.filter(p => p.safeToDelete).length, 0)

  return (
    <div dir="rtl" className="max-w-4xl mx-auto space-y-5 pb-12">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">🔍 בדיקת כפילויות שכ&quot;ל</h1>
          <p className="text-sm text-gray-500">הורים עם יותר מתשלום מתוכנן אחד לאותו חודש. שום דבר לא נמחק אוטומטית.</p>
        </div>
        <button onClick={load} className="px-3 py-2 rounded-xl text-sm font-medium border border-[#1a3a7a] text-[#1a3a7a] hover:bg-[#1a3a7a] hover:text-white transition-colors">רענן</button>
      </div>

      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 leading-relaxed">
        ⚠️ ניתן למחוק כאן <b>רק</b> תשלום שלא שולם עליו כלום ואין לו תנועות מקושרות (&quot;חוב רפאים&quot; ודאי).
        תשלום ששולם עליו או שיש לו תנועות — מסומן ונעול; טפל בו ידנית דרך כרטיס ההורה כדי לא לאבד מידע.
        כל מחיקה היא רכה וניתנת לשחזור מהאשפה.
      </div>

      {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">{error}</div>}

      {loading ? (
        <div className="space-y-3">{[1,2,3].map(i => <div key={i} className="h-24 bg-gray-100 rounded-xl animate-pulse" />)}</div>
      ) : groups.length === 0 ? (
        <div className="text-center text-sm text-gray-400 py-16">אין כפילויות שכ&quot;ל 🎉</div>
      ) : (
        <>
          <p className="text-xs text-gray-500">{groups.length} קבוצות · {totalPhantom} חובות רפאים ניתנים למחיקה בטוחה</p>
          {groups.map((g, gi) => (
            <div key={gi} className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
              <div className="bg-gray-50 border-b px-4 py-2 flex items-center justify-between">
                <span className="text-sm font-bold text-gray-800">{g.parentName}</span>
                <span className="text-xs text-gray-400">{g.monthYear} · {g.pps.length} תשלומים</span>
              </div>
              <table className="w-full text-sm">
                <thead className="text-[11px] text-gray-400 border-b">
                  <tr>
                    <th className="px-3 py-1.5 text-right font-medium">סכום</th>
                    <th className="px-3 py-1.5 text-right font-medium">שולם</th>
                    <th className="px-3 py-1.5 text-right font-medium">תנועות</th>
                    <th className="px-3 py-1.5 text-right font-medium">נוצר</th>
                    <th className="px-3 py-1.5"></th>
                  </tr>
                </thead>
                <tbody>
                  {g.pps.map(pp => (
                    <tr key={pp.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 font-semibold tabular-nums">{fmt(pp.amount)}{pp.isLegacy && <span className="text-[10px] text-purple-500 mr-1">ישן</span>}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{pp.paid > 0 ? fmt(pp.paid) : '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{pp.linkedTxCount || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-gray-400">{pp.createdAt ? new Date(pp.createdAt).toLocaleDateString('he-IL') : '—'}</td>
                      <td className="px-3 py-2 text-left">
                        {pp.safeToDelete ? (
                          confirmId === pp.id ? (
                            <span className="inline-flex items-center gap-1.5">
                              <button onClick={() => setConfirmId(null)} className="text-[11px] text-gray-400">ביטול</button>
                              <button onClick={() => del(pp)} disabled={deleting === pp.id}
                                className="text-[11px] bg-red-500 text-white px-2 py-0.5 rounded hover:bg-red-600 disabled:opacity-60">
                                {deleting === pp.id ? '...' : 'מחק'}
                              </button>
                            </span>
                          ) : (
                            <button onClick={() => setConfirmId(pp.id)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 font-medium">
                              מחק רפאים
                            </button>
                          )
                        ) : (
                          <span className="text-[11px] text-amber-600" title="שולם עליו או יש תנועות מקושרות — טפל בכרטיס ההורה">🔒 טפל בכרטיס</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </>
      )}
    </div>
  )
}
