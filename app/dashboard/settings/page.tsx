'use client'

import { useEffect, useRef, useState } from 'react'

/* ─── Import section ──────────────────────────────────── */
function ImportSection() {
  const [importing, setImporting] = useState(false)
  const [result, setResult]       = useState<{ updated: number; classes: number; notFound: string[]; errors: string[] } | null>(null)
  const [error, setError]         = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  const runImport = async (file: File) => {
    setImporting(true); setResult(null); setError('')
    try {
      const text = await file.text()
      const res  = await fetch('/api/admin/import-students', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: text,
      })
      const data = await res.json()
      if (data.error) { setError(data.error); return }
      setResult(data)
    } catch { setError('שגיאה בייבוא') }
    finally { setImporting(false) }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">ייבוא תלמידים מאקסל / CSV</h3>
      <p className="text-xs text-gray-400">העלה קובץ CSV מאיירטייבל — המערכת תעדכן את כל התלמידים הקיימים לפי שם.</p>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {result && (
        <div className="space-y-2">
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-lg text-sm font-medium">
            ✓ עודכנו {result.updated} תלמידים בהצלחה
            {result.classes > 0 && ` · נוצרו/עודכנו ${result.classes} כיתות`}
          </div>
          {result.notFound.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
              <p className="font-semibold mb-1">לא נמצאו במערכת ({result.notFound.length}):</p>
              <p className="leading-relaxed">{result.notFound.join(' · ')}</p>
            </div>
          )}
          {result.errors.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700">
              <p className="font-semibold mb-1">שגיאות ({result.errors.length}):</p>
              <p className="leading-relaxed">{result.errors.join(' · ')}</p>
            </div>
          )}
        </div>
      )}

      <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) runImport(f) }} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        className="px-5 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
        style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
      >
        {importing ? 'מייבא...' : 'העלה קובץ CSV לייבוא'}
      </button>
    </div>
  )
}

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
  const [classes, setClasses]     = useState<ClassRow[]>([])
  const [loading, setLoading]     = useState(true)
  const [newName, setNewName]     = useState('')
  const [newFw, setNewFw]         = useState(FRAMEWORKS[0])
  const [saving, setSaving]       = useState(false)
  const [error, setError]         = useState('')

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

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">ניהול כיתות ומסגרות</h3>
      <p className="text-xs text-gray-400">קבע לכל כיתה את המסגרת שלה — זה קובע את הסיווג של כל תלמיד.</p>

      {error && <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-lg text-sm">{error}</div>}

      {/* Existing classes */}
      {classes.length > 0 && (
        <div className="border border-gray-100 rounded-xl overflow-hidden">
          {classes.some(c => !c.framework) && (
            <div className="px-4 py-2.5 bg-amber-50 border-b border-amber-100 text-xs text-amber-700 font-medium">
              ⚠ כיתות ללא מסגרת — יש להגדיר כדי שהתלמידים יסווגו נכון
            </div>
          )}
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-right text-xs font-semibold text-gray-500">
                <th className="px-4 py-2.5">שם כיתה</th>
                <th className="px-4 py-2.5">מסגרת</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {classes.map(c => (
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
                      <option value="">— לא מוגדר —</option>
                      {FRAMEWORKS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
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

/* ─── Admin tools section ────────────────────────────── */
function AdminSection() {
  const [fixSigns, setFixSigns]   = useState<{ loading: boolean; result: string }>({ loading: false, result: '' })
  const [allocate, setAllocate]   = useState<{ loading: boolean; result: string }>({ loading: false, result: '' })

  const runAction = async (
    url: string,
    setState: React.Dispatch<React.SetStateAction<{ loading: boolean; result: string }>>
  ) => {
    setState({ loading: true, result: '' })
    try {
      const res  = await fetch(url, { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        setState({ loading: false, result: `שגיאה: ${data.error}` })
      } else {
        const parts = Object.entries(data)
          .filter(([k]) => k !== 'success')
          .map(([k, v]) => `${k}: ${v}`)
          .join(' · ')
        setState({ loading: false, result: `✓ הושלם — ${parts}` })
      }
    } catch {
      setState({ loading: false, result: 'שגיאת רשת' })
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 space-y-4">
      <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">כלי ניהול</h3>

      {/* Fix transaction signs */}
      <div className="flex flex-col gap-2 pb-4 border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">תיקון סימן תנועות</p>
            <p className="text-xs text-gray-400 mt-0.5">מושך מחדש את כל התנועות מאיירטייבל ומתקן הוצאה→מינוס / הכנסה→פלוס</p>
          </div>
          <button
            onClick={() => runAction('/api/admin/fix-transaction-signs', setFixSigns)}
            disabled={fixSigns.loading}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
          >
            {fixSigns.loading ? '⟳ מתקן...' : 'תקן תנועות'}
          </button>
        </div>
        {fixSigns.result && (
          <p className={`text-xs rounded-lg px-3 py-2 ${fixSigns.result.startsWith('שגיאה') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {fixSigns.result}
          </p>
        )}
      </div>

      {/* Recalculate allocations */}
      <div className="flex flex-col gap-2">
        <div className="flex items-start justify-between gap-4">
          <div className="text-right">
            <p className="text-sm font-medium text-gray-700">חישוב חלוקת תשלומים</p>
            <p className="text-xs text-gray-400 mt-0.5">מחשב מחדש את חלוקת עסקאות בנין לדורות בין הילדים הפעילים</p>
          </div>
          <button
            onClick={() => runAction('/api/admin/recalculate-allocations', setAllocate)}
            disabled={allocate.loading}
            className="flex-shrink-0 px-4 py-2 rounded-xl text-sm font-semibold transition-all disabled:opacity-60 whitespace-nowrap"
            style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: 'white' }}
          >
            {allocate.loading ? '⟳ מחשב...' : 'חשב חלוקה'}
          </button>
        </div>
        {allocate.result && (
          <p className={`text-xs rounded-lg px-3 py-2 ${allocate.result.startsWith('שגיאה') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-800'}`}>
            {allocate.result}
          </p>
        )}
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
      const res  = await fetch('/api/sync', { method: 'POST' })
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
        {syncing ? '⟳ מסנכרן...' : '⟳ סנכרן עכשיו'}
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

/* ─── Main settings page ──────────────────────────────── */
export default function SettingsPage() {
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
      <h2 className="text-2xl font-bold text-gray-800 text-right">הגדרות מוסד</h2>

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

      {/* Admin tools */}
      <AdminSection />

      {/* Classes management */}
      <ClassesSection />

      {/* CSV import */}
      <ImportSection />
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
