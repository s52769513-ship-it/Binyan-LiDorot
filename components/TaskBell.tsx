'use client'

import { useCallback, useEffect, useState } from 'react'
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

  // Close the drawer on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const go = () => { setOpen(false); router.push('/dashboard/fixed-payments') }

  return (
    <>
      <button onClick={() => setOpen(true)}
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
        <div className="fixed inset-0 z-[90]" dir="rtl">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          {/* Right-side drawer */}
          <div className="absolute top-0 right-0 h-full w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col animate-[slideIn_0.2s_ease-out]">
            <div className="px-5 py-4 flex items-center justify-between shrink-0"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
              <span className="text-sm font-bold" style={{ color: '#d4a921' }}>
                🔔 משימות פתוחות {count > 0 && `(${count})`}
              </span>
              <button onClick={() => setOpen(false)} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {tasks.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-gray-400">אין משימות פתוחות 🎉</div>
              ) : (
                tasks.map(t => (
                  <button key={`${t.kind}-${t.id}`} onClick={go}
                    className="w-full text-right px-5 py-3 border-b border-gray-100 hover:bg-blue-50 transition-colors block">
                    <p className="text-sm text-gray-800">{t.kind === 'card' ? '💳 ' : '🧾 '}{t.title}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{t.subtitle}</p>
                  </button>
                ))
              )}
            </div>

            <button onClick={go}
              className="shrink-0 px-5 py-3 text-center text-sm text-[#1a3a7a] hover:bg-gray-50 font-medium border-t border-gray-100">
              פתח תשלומים קבועים ←
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slideIn { from { transform: translateX(100%); } to { transform: translateX(0); } }
      `}</style>
    </>
  )
}
