'use client'

import Link from 'next/link'
import { CHANGELOG } from '@/lib/changelog'

function fmtDate(iso: string): string {
  try { return new Intl.DateTimeFormat('he-IL', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(iso)) }
  catch { return iso }
}

export default function UpdatesTab() {
  return (
    <div dir="rtl" className="max-w-3xl space-y-4">
      <div>
        <h3 className="text-lg font-bold text-gray-800">🆕 עדכוני מערכת</h3>
        <p className="text-sm text-gray-500">כל שינוי, תיקון ותוספת — עם הסבר, מיקום והנחיה. החדש ביותר למעלה.</p>
      </div>

      <div className="space-y-3">
        {CHANGELOG.map((e, i) => (
          <div key={i} className="bg-white rounded-2xl border border-gray-200 p-4">
            <div className="flex items-start gap-3">
              <span className="text-2xl leading-none mt-0.5">{e.icon ?? '•'}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <h4 className="text-sm font-bold text-gray-800">{e.title}</h4>
                  <span className="text-[11px] text-gray-400 shrink-0">{fmtDate(e.date)}</span>
                </div>
                <p className="text-sm text-gray-600 mt-1 leading-relaxed">{e.description}</p>
                <div className="flex items-center justify-between gap-2 flex-wrap mt-2">
                  <p className="text-[11px] text-gray-400">📍 {e.location}</p>
                  {e.href && (
                    <Link href={e.href}
                      className="text-[11px] px-2.5 py-1 rounded-full border border-[#1a3a7a]/30 text-[#1a3a7a] hover:bg-[#1a3a7a]/5 font-medium shrink-0">
                      {e.hrefLabel || 'עבור'} ←
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
