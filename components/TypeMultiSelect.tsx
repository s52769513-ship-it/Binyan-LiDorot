'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * בחירה מרובה של "סוג בן אדם" עם אפשרות ליצור ערך חדש.
 * האפשרויות נטענות מ-/api/parents/types (ברירות מחדל + כל ערך שכבר נשמר),
 * וערך חדש שמוקלד נוסף מיד לרשימה המקומית ונשמר על ההורה — כך שבפעמים
 * הבאות הוא כבר יופיע בתפריט (כי הוא קיים ב-DB).
 */
export default function TypeMultiSelect({
  selected,
  onChange,
  label = 'סוג',
}: {
  selected: string[]
  onChange: (next: string[]) => void
  label?: string
}) {
  const [options, setOptions] = useState<string[]>([])
  const [custom, setCustom] = useState('')
  const loadedRef = useRef(false)

  useEffect(() => {
    if (loadedRef.current) return
    loadedRef.current = true
    fetch('/api/parents/types')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d?.types)) setOptions(d.types) })
      .catch(() => {})
  }, [])

  const toggle = (t: string) =>
    onChange(selected.includes(t) ? selected.filter(x => x !== t) : [...selected, t])

  const addCustom = () => {
    const v = custom.trim()
    if (!v) return
    if (!options.includes(v)) setOptions(prev => [...prev, v].sort((a, b) => a.localeCompare(b, 'he')))
    if (!selected.includes(v)) onChange([...selected, v])
    setCustom('')
  }

  // אפשרויות להצגה = הרשימה מהשרת + כל ערך נבחר שעדיין לא בה (סוג שנשמר בעבר)
  const allOptions = [...new Set([...options, ...selected])].sort((a, b) => a.localeCompare(b, 'he'))

  return (
    <div>
      {label && <label className="block text-sm font-medium text-gray-700 mb-2">{label}</label>}
      <div className="flex flex-wrap gap-2 mb-2">
        {allOptions.map(t => (
          <button key={t} type="button"
            onClick={() => toggle(t)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
              selected.includes(t)
                ? 'bg-[#1a3a7a] text-white border-[#1a3a7a]'
                : 'bg-white text-gray-600 border-gray-300 hover:border-[#1a3a7a]'
            }`}>
            {t}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          value={custom}
          onChange={e => setCustom(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustom() } }}
          placeholder="סוג חדש..."
          className="flex-1 px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
        />
        <button type="button" onClick={addCustom} disabled={!custom.trim()}
          className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-sm font-medium hover:bg-gray-200 disabled:opacity-40">
          + הוסף
        </button>
      </div>
    </div>
  )
}
