'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import AutomationsTab from '@/components/AutomationsTab'
import MergeParentsTab from '@/components/MergeParentsModal'

type SettingsTab = 'general' | 'automations' | 'merge' | 'import'

interface Settings {
  institution_name?: string
  address?: string
  phone?: string
  primary_color?: string
  logo_url?: string
}

interface ClassRow {
  class_name: string
  framework: string
}

const FRAMEWORKS = ['תלמוד תורה', 'בית חינוך לבנות']

/* ─── Classes section ─────────────────────────────────── */
function ClassesSection() {
  const [classes, setClasses]         = useState<ClassRow[]>([])
  const [loading, setLoading]         = useState(true)
  const [newName, setNewName]         = useState('')
  const [newFw, setNewFw]             = useState(FRAMEWORKS[0])
  const [saving, setSaving]           = useState(false)
  const [deleting, setDeleting]       = useState<string | null>(null)
  const [error, setError]             = useState('')

  const load = () => {
    setLoading(true)
    fetch('/api/classes')
      .then(r => r.json())
      .then(d => { if (Array.isArray(d)) setClasses(d) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  useEffect(() => { load() }, [])

  const upsertClass = async (className: string, framework: string) => {
    setSaving(true); setError('')
    try {
      const res = await fetch('/api/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className, framework }),
      })
      const d = await res.json()
      if (d.error) { setError(d.error); return false }
      return true
    } catch { setError('שגיאה בשמירה'); return false }
    finally { setSaving(false) }
  }

  const deleteClass = async (className: string) => {
    setDeleting(className)
    try {
      await fetch('/api/classes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ className }),
      })
      setClasses(prev => prev.filter(c => c.class_name !== className))
    } catch { setError('שגיאה במחיקה') }
    finally { setDeleting(null) }
  }

  const deleteAllClasses = async () => {
    if (!confirm(`למחוק את כל ${classes.length} הכיתות? הסינק יבנה אותן מחדש.`)) return
    setDeleting('__all__')
    try {
      await fetch('/api/classes?all=true', { method: 'DELETE' })
      setClasses([])
    } catch { setError('שגיאה במחיקה') }
    finally { setDeleting(null) }
  }

  const addNew = async () => {
    if (!newName.trim()) return
    const ok = await upsertClass(newName.trim(), newFw)
    if (ok) { setNewName(''); load() }
  }

  const updateFramework = async (className: string, framework: string) => {
    setClasses(prev => prev.map(c => c.class_name === className ? { ...c, framework } : c))
    await upsertClass(className, framework)
  }

  if (loading) return <div className="h-20 bg-gray-100 rounded-xl animate-pulse" />

  const unlinked = classes.filter(c => !c.framework)
  const linked   = classes.filter(c => !!c.framework)

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">ניהול כיתות ומסגרות</h3>
          <p className="text-xs text-gray-400 mt-0.5">קבע לכל כיתה את המסגרת שלה — זה קובע את הסיווג של כל תלמיד.</p>
        </div>
        {classes.length > 0 && (
          <button
            onClick={deleteAllClasses}
            disabled={deleting === '__all__'}
            className="text-xs text-red-600 hover:text-red-800 border border-red-200 hover:border-red-400 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
          >
            {deleting === '__all__' ? 'מוחק...' : 'איפוס כל הכיתות'}
          </button>
        )}
      </div>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Existing classes */}
      {classes.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {unlinked.length > 0 && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-medium flex items-center justify-between">
              <button
                onClick={() => { if (confirm(`למחוק ${unlinked.length} כיתות לא מקושרות?`)) unlinked.forEach(c => deleteClass(c.class_name)) }}
                className="text-xs text-red-600 hover:text-red-800 font-semibold underline"
              >
                מחק הכל
              </button>
              <span>⚠ {unlinked.length} כיתות ללא מסגרת — יש להגדיר או למחוק</span>
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500">
                <th className="px-4 py-2.5">שם כיתה</th>
                <th className="px-4 py-2.5">מסגרת</th>
                <th className="px-2 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[...linked, ...unlinked].map(c => (
                <tr key={c.class_name} className={`hover:bg-gray-50 ${!c.framework ? 'bg-amber-50/40' : ''}`}>
                  <td className="px-4 py-2.5 font-medium text-gray-800">
                    {!c.framework && <span className="text-amber-500 ml-1">⚠</span>}
                    {c.class_name}
                  </td>
                  <td className="px-4 py-2.5">
                    <select
                      value={c.framework ?? ''}
                      onChange={e => updateFramework(c.class_name, e.target.value)}
                      disabled={saving}
                      className={`px-3 py-1.5 rounded-lg border text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 ${
                        !c.framework ? 'border-amber-300 text-amber-700' : 'border-gray-200'
                      }`}
                    >
                      <option value="">— לא מקושר —</option>
                      {FRAMEWORKS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                  </td>
                  <td className="px-2 py-2.5 text-center">
                    <button
                      onClick={() => deleteClass(c.class_name)}
                      disabled={deleting === c.class_name}
                      className="text-gray-300 hover:text-red-500 text-base transition-colors disabled:opacity-40"
                      title="מחק כיתה"
                    >
                      {deleting === c.class_name ? '...' : '✕'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add new class */}
      <div className="flex gap-2 items-end pt-2 border-t border-gray-100">
        <button
          onClick={addNew}
          disabled={saving || !newName.trim()}
          className="px-4 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50 whitespace-nowrap"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
        >
          {saving ? '...' : '+ הוסף כיתה'}
        </button>
        <select
          value={newFw}
          onChange={e => setNewFw(e.target.value)}
          className="px-3 py-2.5 rounded-xl border border-gray-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
        >
          {FRAMEWORKS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <input
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') addNew() }}
          className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white text-right"
          placeholder="שם הכיתה (לדוגמה: א׳)"
        />
      </div>
    </div>
  )
}

/* ─── Sync section ────────────────────────────────────── */
function SyncSection() {
  const [syncing, setSyncing] = useState(false)
  const [result, setResult]   = useState<{ success?: boolean; counts?: Record<string, number>; error?: string } | null>(null)

  const handleSync = async () => {
    setSyncing(true); setResult(null)
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      const data = await res.json()
      setResult(data)
    } catch {
      setResult({ error: 'שגיאת רשת' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">סנכרון עם Airtable</h3>
      <p className="text-xs text-gray-400">מסנכרן הורים, תלמידים, עסקאות, חובות ותשלומים מתוכננים מ-Airtable.</p>

      <button
        onClick={handleSync}
        disabled={syncing}
        className="w-full py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
        style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
      >
        {syncing ? (
          <><span className="animate-spin inline-block">⟳</span> מסנכרן...</>
        ) : (
          <>⟳ סנכרן עכשיו</>
        )}
      </button>

      {result && (
        result.error ? (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm text-right">{result.error}</div>
        ) : (
          <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-right space-y-1">
            <p className="font-semibold text-emerald-800">✓ סנכרון הושלם בהצלחה</p>
            {result.counts && (
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-emerald-700 pt-1">
                {Object.entries(result.counts).map(([k, v]) => (
                  <span key={k}>{k}: <strong>{v}</strong></span>
                ))}
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

/* ─── Import students section ────────────────────────── */
interface ImportResult {
  updated?: number
  classes?: number
  notFound?: string[]
  errors?: string[]
  error?: string
}

const COLUMN_MAPPING = [
  { col: 'A (0)',  field: 'שם משפחה',              example: 'כהן' },
  { col: 'B (1)',  field: 'שם פרטי תלמיד',         example: 'יוסף' },
  { col: 'C (2)',  field: 'שם האם',                example: 'שרה לוי' },
  { col: 'E (4)',  field: 'ת"ז תלמיד',             example: '234585933' },
  { col: 'F (5)',  field: 'תאריך לידה עברי',       example: "ט\"ו שבט פ\"ג" },
  { col: 'G (6)',  field: 'תאריך לידה לועזי',      example: '06/02/23' },
  { col: 'H (7)',  field: 'כיתה',                  example: "א'1" },
  { col: 'L (11)', field: 'הסעות — הלוך',          example: 'הלוך' },
  { col: 'M (12)', field: 'הסעות — חזור 1',        example: 'חזור שעה 1' },
  { col: 'N (13)', field: 'הסעות — חזור 2',        example: 'חזור שעה 4' },
  { col: 'S (18)', field: 'סטטוס',                 example: 'V / סיים לימודים' },
  { col: 'T (19)', field: 'שם מלא האב (לזיהוי)',   example: 'כהן אברהם יצחק' },
  { col: 'AB (27)',field: 'קופת חולים',             example: 'מכבי' },
  { col: 'AC (28)',field: 'מקום לימודים קודם',     example: 'בית ספר X' },
]

function ImportTab() {
  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">מיפוי עמודות CSV</h3>
        <p className="text-xs text-gray-400">הקובץ חייב להיות CSV — עמודות לפי הסדר הבא:</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm border-collapse" dir="rtl">
            <thead>
              <tr className="bg-gray-50">
                <th className="px-3 py-2 border border-gray-200 font-semibold text-gray-600 text-right">עמודה</th>
                <th className="px-3 py-2 border border-gray-200 font-semibold text-gray-600 text-right">שדה</th>
                <th className="px-3 py-2 border border-gray-200 font-semibold text-gray-600 text-right">דוגמה</th>
              </tr>
            </thead>
            <tbody>
              {COLUMN_MAPPING.map(({ col, field, example }) => (
                <tr key={col} className="hover:bg-gray-50">
                  <td className="px-3 py-2 border border-gray-200 font-mono font-bold text-[#1a3a7a]">{col}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-700">{field}</td>
                  <td className="px-3 py-2 border border-gray-200 text-gray-400 text-xs">{example}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <ImportStudentsSection />
    </div>
  )
}

function ImportStudentsSection() {
  const [file, setFile]         = useState<File | null>(null)
  const [loading, setLoading]   = useState(false)
  const [result, setResult]     = useState<ImportResult | null>(null)
  const fileRef                 = useRef<HTMLInputElement>(null)

  const run = async () => {
    if (!file) return
    setLoading(true); setResult(null)
    try {
      const text = await file.text()
      const res = await fetch('/api/admin/import-students', {
        method: 'POST',
        headers: { 'Content-Type': 'text/csv' },
        body: text,
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      setResult({ error: String(e) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <div>
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">ייבוא תלמידים מ-CSV</h3>
        <p className="text-xs text-gray-400 mt-0.5">מעדכן פרטי תלמידים (מגדר, ת"ז, תאריך לידה, כיתה, הסעות...) לפי קובץ Excel/CSV מהמוסד.</p>
      </div>

      <div className="flex gap-3 items-center">
        <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" className="hidden"
          onChange={e => { setFile(e.target.files?.[0] ?? null); setResult(null) }} />
        <button
          onClick={() => fileRef.current?.click()}
          className="px-4 py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:border-gray-300 hover:text-gray-800 transition-colors bg-white"
        >
          {file ? file.name : 'בחר קובץ CSV…'}
        </button>
        <button
          onClick={run}
          disabled={!file || loading}
          className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
        >
          {loading ? 'מייבא...' : 'ייבא'}
        </button>
      </div>

      {result && (
        result.error ? (
          <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm text-right">{result.error}</div>
        ) : (
          <div className="space-y-2">
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg text-sm text-right">
              <span className="font-semibold text-emerald-800">✓ עודכנו {result.updated} תלמידים</span>
              {result.classes ? <span className="text-emerald-600 mr-2">· {result.classes} כיתות</span> : null}
            </div>
            {result.notFound && result.notFound.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-right text-amber-700">
                <p className="font-semibold mb-1">לא נמצאו ({result.notFound.length}):</p>
                <p className="break-words">{result.notFound.join(' · ')}</p>
              </div>
            )}
            {result.errors && result.errors.length > 0 && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-right text-red-700">
                <p className="font-semibold mb-1">שגיאות ({result.errors.length}):</p>
                {result.errors.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
        )
      )}
    </div>
  )
}

/* ─── Main settings page ──────────────────────────────── */
export default function SettingsPage() {
  const router = useRouter()
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('general')
  const [settings, setSettings] = useState<Settings>({})
  const [loading, setLoading]   = useState(true)
  const [saving, setSaving]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [success, setSuccess]   = useState('')
  const [error, setError]       = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => setSettings(d ?? {}))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const save = async (fields: Partial<Settings>) => {
    setSaving(true); setError(''); setSuccess('')
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields),
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSettings(prev => ({ ...prev, ...fields }))
      setSuccess('נשמר בהצלחה')
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('שגיאה בשמירה') }
    finally { setSaving(false) }
  }

  const uploadLogo = async (file: File) => {
    setUploading(true); setError(''); setSuccess('')
    try {
      const form = new FormData()
      form.append('logo', file)
      const res = await fetch('/api/settings/upload', { method: 'POST', body: form })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setSettings(prev => ({ ...prev, logo_url: data.url }))
      setSuccess('הלוגו הועלה בהצלחה!')
      setTimeout(() => setSuccess(''), 3000)
    } catch { setError('שגיאה בהעלאה') }
    finally { setUploading(false) }
  }

  if (loading) return (
    <div className="max-w-2xl mx-auto space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-20 bg-gray-100 rounded-xl animate-pulse" />)}
    </div>
  )

  return (
    <div className="max-w-2xl mx-auto space-y-6" dir="rtl">
      <h2 className="text-2xl font-bold text-gray-800 text-right">הגדרות</h2>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          { key: 'general',     label: 'הגדרות מוסד' },
          { key: 'automations', label: '🤖 אוטומציות' },
          { key: 'merge',       label: '🔗 איחוד כרטיסים' },
          { key: 'import',      label: '📤 ייבוא תלמידים' },
        ] as { key: SettingsTab; label: string }[]).map(t => (
          <button key={t.key} onClick={() => setSettingsTab(t.key)}
            className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap ${
              settingsTab === t.key
                ? 'border-[#1a3a7a] text-[#1a3a7a]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {settingsTab === 'automations' && <AutomationsTab />}
      {settingsTab === 'merge'       && <MergeParentsTab onOpenParent={id => router.push(`/dashboard?parent=${id}`)} />}
      {settingsTab === 'import'      && <ImportTab />}

      {settingsTab === 'general' && <>
      {success && <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-right font-medium">✓ {success}</div>}
      {error   && <div className="p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-right text-sm">{error}</div>}

      {/* Logo upload */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">לוגו המוסד</h3>

        <div className="flex items-center gap-6">
          <div className="flex-shrink-0">
            {settings.logo_url ? (
              <img src={settings.logo_url} alt="לוגו" className="w-24 h-24 object-contain rounded-xl border border-gray-200 bg-gray-50 p-1" />
            ) : (
              <div className="w-24 h-24 rounded-xl border-2 border-dashed border-gray-200 flex items-center justify-center text-gray-300 text-xs text-center">
                אין לוגו
              </div>
            )}
          </div>

          <div className="flex-1 space-y-2">
            <p className="text-sm text-gray-500">העלה קובץ PNG / JPG / SVG (מומלץ רבוע, לפחות 200×200)</p>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) uploadLogo(f) }} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
            >
              {uploading ? 'מעלה...' : settings.logo_url ? 'החלף לוגו' : 'העלה לוגו'}
            </button>
            {settings.logo_url && (
              <p className="text-xs text-gray-400 break-all">{settings.logo_url}</p>
            )}
          </div>
        </div>
      </div>

      {/* Institution details */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">פרטי המוסד</h3>

        <Field label="שם המוסד">
          <input
            defaultValue={settings.institution_name ?? ''}
            onBlur={e => save({ institution_name: e.target.value })}
            className={INPUT} placeholder="בנין לדורות"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="טלפון">
            <input
              defaultValue={settings.phone ?? ''}
              onBlur={e => save({ phone: e.target.value })}
              className={INPUT} placeholder="04-0000000" dir="ltr"
            />
          </Field>
          <Field label="כתובת">
            <input
              defaultValue={settings.address ?? ''}
              onBlur={e => save({ address: e.target.value })}
              className={INPUT} placeholder="רחוב, עיר"
            />
          </Field>
        </div>
      </div>

      {saving && <p className="text-center text-sm text-gray-400 animate-pulse">שומר...</p>}

      {/* Sync */}
      <SyncSection />

      {/* Classes management */}
      <ClassesSection />


      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800 text-right space-y-1">
        <p className="font-semibold">SQL להרצה ב-Supabase (חד פעמי):</p>
        <pre className="text-xs bg-white border border-amber-100 rounded-lg p-3 overflow-x-auto text-left" dir="ltr">{`CREATE TABLE institution_settings (
  id INTEGER PRIMARY KEY,
  institution_name TEXT,
  logo_url TEXT,
  address TEXT,
  phone TEXT,
  primary_color TEXT DEFAULT '#1a3a7a',
  automation_day INTEGER DEFAULT 1,
  automation_hour INTEGER DEFAULT 8,
  automation_enabled BOOLEAN DEFAULT true,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO institution_settings (id) VALUES (1);

ALTER TABLE institution_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON institution_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- If the table already exists, run these to add the new columns:
-- ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS automation_day INTEGER DEFAULT 1;
-- ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS automation_hour INTEGER DEFAULT 8;
-- ALTER TABLE institution_settings ADD COLUMN IF NOT EXISTS automation_enabled BOOLEAN DEFAULT true;`}</pre>
        <p className="text-xs mt-2">את ה-bucket ליצור דרך Storage → New bucket, שם: <strong>institution</strong>, ציבורי ✓</p>
      </div>
      </>}
    </div>
  )
}


const INPUT = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white text-right'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5 text-right">{label}</label>
      {children}
    </div>
  )
}
