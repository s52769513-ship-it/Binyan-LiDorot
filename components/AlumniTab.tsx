'use client'

import { useMemo, useState } from 'react'
import { NO_COHORT_LABEL } from '@/lib/registration'

export interface Alumnus {
  id: string
  name: string
  className: string
  framework: string
  status: string
  graduationYear: string
}

/** תשפ״ו → 786, לצורך מיון מהמחזור החדש לישן. "ללא שנתון" תמיד אחרון. */
function cohortRank(label: string): number {
  if (label === NO_COHORT_LABEL) return -1
  const V: Record<string, number> = { א:1,ב:2,ג:3,ד:4,ה:5,ו:6,ז:7,ח:8,ט:9,י:10,כ:20,ל:30,מ:40,נ:50,ס:60,ע:70,פ:80,צ:90,ק:100,ר:200,ש:300,ת:400 }
  let sum = 0
  for (const ch of label.replace(/[״"׳']/g, '')) sum += V[ch] ?? 0
  return sum
}

export default function AlumniTab({
  alumni, onOpenStudent,
}: {
  alumni: Alumnus[]
  onOpenStudent: (id: string) => void
}) {
  const [search, setSearch]       = useState('')
  const [framework, setFramework] = useState<'all' | 'tt' | 'bs'>('all')
  const [cohort, setCohort]       = useState<string>('all')

  const filtered = useMemo(() => alumni.filter(a => {
    if (search.trim() && !a.name.includes(search.trim())) return false
    if (framework === 'tt' && a.framework !== 'תלמוד תורה') return false
    if (framework === 'bs' && a.framework !== 'בית חינוך לבנות') return false
    if (cohort !== 'all' && (a.graduationYear || NO_COHORT_LABEL) !== cohort) return false
    return true
  }), [alumni, search, framework, cohort])

  /** קיבוץ לשנתונים, מהמחזור האחרון לראשון. */
  const groups = useMemo(() => {
    const m = new Map<string, Alumnus[]>()
    for (const a of filtered) {
      const key = a.graduationYear || NO_COHORT_LABEL
      if (!m.has(key)) m.set(key, [])
      m.get(key)!.push(a)
    }
    return [...m.entries()]
      .map(([year, list]) => ({
        year,
        list: list.sort((x, y) => x.name.localeCompare(y.name, 'he')),
      }))
      .sort((a, b) => cohortRank(b.year) - cohortRank(a.year))
  }, [filtered])

  const cohorts = useMemo(() => {
    const set = new Set(alumni.map(a => a.graduationYear || NO_COHORT_LABEL))
    return [...set].sort((a, b) => cohortRank(b) - cohortRank(a))
  }, [alumni])

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap gap-3">
          <input
            type="text" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש בוגר לפי שם..."
            className="flex-1 min-w-[180px] px-4 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
          />
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            {(['all','tt','bs'] as const).map(f => (
              <button key={f} onClick={() => setFramework(f)}
                className={`px-3 py-2 whitespace-nowrap ${framework===f ? 'bg-[#1a3a7a] text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}>
                {f==='all' ? 'כל האגפים' : f==='tt' ? 'תלמוד תורה' : 'בית חינוך'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 mb-1.5 text-right">שנתון</p>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setCohort('all')}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cohort==='all' ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'}`}>
              הכל
            </button>
            {cohorts.map(c => (
              <button key={c} onClick={() => setCohort(c)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border ${cohort===c ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]' : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a]'}`}>
                {c}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2 text-xs pt-1">
          <span className="px-2.5 py-1 rounded-full bg-gray-100 text-gray-600">
            מוצגים {filtered.length} מתוך {alumni.length} בוגרים
          </span>
        </div>
      </div>

      {groups.map(g => (
        <div key={g.year} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs text-gray-400">{g.list.length} בוגרים</span>
            <h3 className="font-bold text-[#1a3a7a]">🎓 {g.year}</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {g.list.map(a => (
              <button key={a.id} onClick={() => onOpenStudent(a.id)}
                className="w-full px-4 py-2 flex items-center justify-between hover:bg-gray-50 transition-colors text-right">
                <span className="text-xs text-gray-400">
                  {a.status}{a.className ? ` · ${a.className}` : ''}
                </span>
                <span className="text-sm font-medium text-gray-800">{a.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}

      {groups.length === 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 text-center text-sm text-gray-400">
          {alumni.length === 0 ? 'אין עדיין בוגרים' : 'אין תוצאות לסינון הנוכחי'}
        </div>
      )}
    </div>
  )
}
