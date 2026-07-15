'use client'

import { useState, useEffect } from 'react'

interface SpecificDateSchedule {
  id: string
  automation_id: string
  scheduled_date: string
  hour: number
  enabled: boolean
}

export function SpecificDatesScheduler({ automationId }: { automationId: string }) {
  const [dates, setDates] = useState<SpecificDateSchedule[]>([])
  const [loading, setLoading] = useState(true)
  const [newDate, setNewDate] = useState('')
  const [newHour, setNewHour] = useState('08')
  const [adding, setAdding] = useState(false)

  const loadDates = async () => {
    try {
      const r = await fetch(`/api/automations/specific-dates?automationId=${automationId}`)
      const d = await r.json()
      setDates(d.dates ?? [])
    } catch (err) {
      console.error('Failed to load specific dates:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDates()
  }, [automationId])

  const addDate = async () => {
    if (!newDate) return
    setAdding(true)
    try {
      const r = await fetch('/api/automations/specific-dates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          automationId,
          scheduledDate: newDate,
          hour: Number(newHour),
        }),
      })
      if (r.ok) {
        const d = await r.json()
        setDates(p => [...p, d.date].sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date)))
        setNewDate('')
        setNewHour('08')
      }
    } catch (err) {
      console.error('Failed to add date:', err)
    } finally {
      setAdding(false)
    }
  }

  const removeDate = async (id: string) => {
    try {
      const r = await fetch(`/api/automations/specific-dates?id=${id}`, {
        method: 'DELETE',
      })
      if (r.ok) {
        setDates(p => p.filter(d => d.id !== id))
      }
    } catch (err) {
      console.error('Failed to remove date:', err)
    }
  }

  const toggleEnabled = async (id: string, enabled: boolean) => {
    try {
      const r = await fetch(`/api/automations/specific-dates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !enabled }),
      })
      if (r.ok) {
        const updated = await r.json()
        setDates(p => p.map(d => d.id === id ? updated.date : d))
      }
    } catch (err) {
      console.error('Failed to toggle date:', err)
    }
  }

  const updateHour = async (id: string, hour: number) => {
    try {
      const r = await fetch(`/api/automations/specific-dates/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hour }),
      })
      if (r.ok) {
        const updated = await r.json()
        setDates(p => p.map(d => d.id === id ? updated.date : d))
      }
    } catch (err) {
      console.error('Failed to update hour:', err)
    }
  }

  return (
    <div className="space-y-3" dir="rtl">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">תאריכים ספציפיים</p>

      {/* Add new date */}
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="date"
          value={newDate}
          onChange={e => setNewDate(e.target.value)}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white"
          dir="ltr"
        />
        <input
          type="time"
          value={`${newHour}:00`}
          onChange={e => setNewHour(e.target.value.split(':')[0])}
          className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white"
          dir="ltr"
        />
        <button
          onClick={addDate}
          disabled={!newDate || adding}
          className="px-3 py-1.5 rounded-lg text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 disabled:opacity-40 transition-colors"
        >
          {adding ? '...' : '➕ הוסף'}
        </button>
      </div>

      {/* List of dates */}
      {loading ? (
        <div className="text-sm text-gray-400">טוען...</div>
      ) : dates.length === 0 ? (
        <p className="text-sm text-gray-400">אין תאריכים ספציפיים</p>
      ) : (
        <div className="rounded-lg border border-gray-100 overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b text-right text-gray-400">
                <th className="px-3 py-2">תאריך</th>
                <th className="px-3 py-2">שעה</th>
                <th className="px-3 py-2">סטטוס</th>
                <th className="px-3 py-2">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {dates.map(d => (
                <tr key={d.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-700 font-medium">{d.scheduled_date}</td>
                  <td className="px-3 py-2">
                    <input
                      type="number"
                      min="0"
                      max="23"
                      value={d.hour}
                      onChange={e => updateHour(d.id, Number(e.target.value))}
                      className="w-12 px-2 py-1 rounded border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => toggleEnabled(d.id, d.enabled)}
                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                        d.enabled
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {d.enabled ? '✓ פעיל' : '⊘ כבוי'}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <button
                      onClick={() => removeDate(d.id)}
                      className="text-red-600 hover:text-red-700 font-semibold"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
