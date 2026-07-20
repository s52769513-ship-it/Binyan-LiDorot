'use client'

import Link from 'next/link'
import { useState } from 'react'
import { CHANGELOG, type ChangelogEntry } from '@/lib/changelog'

function fmtDate(iso: string): string {
  try { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) }
  catch { return iso }
}

// Schematic "where is it" illustration: a mock panel with the target item
// highlighted by a pulsing marker — a live map of where to click.
function DemoFrame({ entry }: { entry: ChangelogEntry }) {
  const d = entry.demo
  if (!d) return null
  return (
    <div className="rounded-xl border border-gray-200 overflow-hidden">
      <div className="px-3 py-1.5 bg-gray-50 border-b border-gray-100 text-[11px] font-semibold text-gray-500 flex items-center justify-between">
        <span>{d.frameTitle}</span>
        {d.breadcrumb && <span className="text-gray-400">{d.breadcrumb.join(' ← ')}</span>}
      </div>
      <div className="p-3 space-y-1.5 bg-white">
        {d.items.map((it, i) => (
          <div key={i} className="relative">
            <div className={`rounded-lg px-3 py-2 text-sm border ${
              it.highlight
                ? 'border-amber-400 bg-amber-50 text-gray-900 font-semibold ring-2 ring-amber-300'
                : it.muted
                  ? 'border-gray-100 bg-gray-50 text-gray-400'
                  : 'border-gray-200 bg-white text-gray-600'
            }`}>
              {it.label}
            </div>
            {it.highlight && (
              <>
                <span className="absolute -top-2 -left-2 flex h-4 w-4">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-4 w-4 bg-amber-500" />
                </span>
                <span className="absolute top-1/2 -translate-y-1/2 left-2 text-[10px] font-bold text-amber-600 bg-white/80 rounded px-1">כאן 👆</span>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DemoModal({ entry, onClose }: { entry: ChangelogEntry; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[88vh] overflow-y-auto" dir="rtl" onClick={e => e.stopPropagation()}>
        <div className="px-5 py-4 flex items-center justify-between sticky top-0" style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)' }}>
          <span className="text-sm font-bold" style={{ color: '#d4a921' }}>{entry.icon} {entry.title}</span>
          <button onClick={onClose} className="text-white/60 hover:text-white text-lg leading-none">✕</button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-gray-600 leading-relaxed">{entry.description}</p>

          {entry.demo && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-1.5">📍 איפה זה נמצא</p>
              <DemoFrame entry={entry} />
            </div>
          )}

          {entry.steps && entry.steps.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-gray-400 mb-1.5">איך עושים</p>
              <ol className="space-y-1.5">
                {entry.steps.map((s, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                    <span className="shrink-0 w-5 h-5 rounded-full bg-[#1a3a7a] text-white text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                    <span>{s}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-1 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">{fmtDate(entry.date)}</span>
            {entry.href && (
              <Link href={entry.href}
                className="text-xs px-3 py-1.5 rounded-xl bg-[#1a3a7a] text-white font-medium hover:bg-[#0d1f52]">
                {entry.hrefLabel || 'עבור'} ←
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function UpdatesTab() {
  const [selected, setSelected] = useState<ChangelogEntry | null>(null)

  return (
    <div dir="rtl" className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-800">🆕 עדכוני מערכת</h3>
        <p className="text-sm text-gray-500">כל שינוי, תיקון ותוספת — לחץ על רשומה לראות המחשה של המיקום והפעולה.</p>
      </div>

      <div className="space-y-3">
        {CHANGELOG.map((e, i) => (
          <button key={i} onClick={() => setSelected(e)}
            className="w-full text-right bg-white rounded-2xl border border-gray-200 p-4 hover:border-[#1a3a7a]/40 hover:shadow-sm transition-all">
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none mt-0.5">{e.icon ?? '•'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-gray-800">{e.title}</h4>
                  <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(e.date)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed line-clamp-2">{e.description}</p>
                <p className="text-[11px] text-[#1a3a7a] mt-2 font-medium">לחץ לצפייה בהמחשה →</p>
              </div>
            </div>
          </button>
        ))}
      </div>

      {selected && <DemoModal entry={selected} onClose={() => setSelected(null)} />}
    </div>
  )
}
