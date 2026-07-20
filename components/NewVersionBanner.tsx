'use client'

import { useEffect, useRef, useState } from 'react'

// Polls /api/version and shows a refresh banner when the live deployment
// differs from the version this tab loaded with — so users don't keep working
// on a stale build after a new deploy.
const POLL_MS = 90_000

export default function NewVersionBanner() {
  const loadedVersion = useRef<string | null>(null)
  const [stale, setStale] = useState(false)

  useEffect(() => {
    let cancelled = false

    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        const d = await r.json()
        const v = String(d?.version ?? '')
        if (!v) return
        if (loadedVersion.current === null) {
          loadedVersion.current = v            // first load — remember it
        } else if (v !== loadedVersion.current && !cancelled) {
          setStale(true)                       // a newer deploy is live
        }
      } catch { /* offline / transient — ignore */ }
    }

    check()
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') check()
    }, POLL_MS)
    const onVisible = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVisible)

    return () => { cancelled = true; clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  if (!stale) return null

  return (
    <div className="fixed bottom-4 inset-x-0 z-[100] flex justify-center px-4 pointer-events-none" dir="rtl">
      <div className="pointer-events-auto flex items-center gap-3 bg-[#1a3a7a] text-white rounded-2xl shadow-2xl px-4 py-3 max-w-md w-full">
        <span className="text-lg">🆕</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold">עודכנה גרסה חדשה</p>
          <p className="text-xs text-white/70">רענן כדי לקבל את העדכונים האחרונים</p>
        </div>
        <button onClick={() => window.location.reload()}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-white text-[#1a3a7a] text-sm font-bold hover:bg-gray-100">
          רענן
        </button>
        <button onClick={() => setStale(false)} className="shrink-0 text-white/50 hover:text-white text-lg leading-none">✕</button>
      </div>
    </div>
  )
}
