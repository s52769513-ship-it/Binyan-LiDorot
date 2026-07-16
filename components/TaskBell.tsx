'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useRealtimeRefresh } from '@/lib/useRealtimeRefresh'

interface TaskItem {
  kind: 'run' | 'card'
  id: string
  title: string
  subtitle: string
  monthYear: string
}

export default function TaskBell({ variant = 'topbar' }: { variant?: 'topbar' | 'sidebar' }) {
  const router = useRouter()
  const [tasks, setTasks] = useState<TaskItem[]>([])
  const [count, setCount] = useState(0)
  const [open, setOpen]   = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/tasks')
      const d = await r.json()
      setTasks(d.tasks ?? [])
      setCount(d.openCount ?? 0)
    } catch {}
  }, [])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(load, ['recurring_payment_runs', 'card_payment_tasks'])

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const go = () => { setOpen(false); router.push('/dashboard/fixed-payments') }

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(o => !o)}
        title="משימות פתוחות"
        className={`relative flex items-center justify-center rounded-lg transition-colors ${
          variant === 'sidebar'
            ? 'w-full py-1.5 border border-white/20 text-white/70 hover:text-white hover:border-white/40 text-xs'
            : 'w-8 h-8 border border-white/20 text-white/70 hover:text-white hover:bg-white/10'
        }`}>
        <span className="text-base leading-none">🔔</span>
        {variant === 'sidebar' && <span className="mr-1">משימות</span>}
        {count > 0 && (
          <span className="absolute -top-1 -left-1 bg-red-500 text-white text-[10px] leading-none rounded-full min-w-[16px] h-4 px-1 flex items-center justify-center font-bold">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 mt-2 w-72 max-h-96 overflow-y-auto bg-white rounded-xl shadow-2xl border border-gray-200 z-50" dir="rtl">
          <div className="px-4 py-2.5 border-b bg-gray-50 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-700">משימות פתוחות</span>
            <span className="text-xs text-gray-400">{count}</span>
          </div>
          {tasks.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-gray-400">אין משימות פתוחות 🎉</div>
          ) : (
            <div>
              {tasks.map(t => (
                <button key={`${t.kind}-${t.id}`} onClick={go}
                  className="w-full text-right px-4 py-2.5 border-b border-gray-50 hover:bg-blue-50 transition-colors block">
                  <p className="text-sm text-gray-800">{t.kind === 'card' ? '💳 ' : '🧾 '}{t.title}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{t.subtitle}</p>
                </button>
              ))}
            </div>
          )}
          <button onClick={go} className="w-full px-4 py-2.5 text-center text-xs text-[#1a3a7a] hover:bg-gray-50 font-medium">
            פתח תשלומים קבועים ←
          </button>
        </div>
      )}
    </div>
  )
}
