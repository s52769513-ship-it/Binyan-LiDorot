'use client'

import { useEffect, useRef, useState } from 'react'

type SettingsTab = 'general' | 'automations'

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

/* ─── Main settings page ──────────────────────────────── */
export default function SettingsPage() {
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
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO institution_settings (id) VALUES (1);

ALTER TABLE institution_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_all" ON institution_settings
  FOR ALL TO service_role USING (true) WITH CHECK (true);`}</pre>
        <p className="text-xs mt-2">את ה-bucket ליצור דרך Storage → New bucket, שם: <strong>institution</strong>, ציבורי ✓</p>
      </div>
      </>}
    </div>
  )
}

/* ═══════════════════════════ AUTOMATIONS TAB ═══════════════════════════ */

const HMONTHS: Record<string, string> = {
  '01':'ינואר','02':'פברואר','03':'מרץ','04':'אפריל',
  '05':'מאי','06':'יוני','07':'יולי','08':'אוגוסט',
  '09':'ספטמבר','10':'אוקטובר','11':'נובמבר','12':'דצמבר',
}
function fmtMY(my: string) { const [m, y] = my.split('/'); return `${HMONTHS[m] || m} ${y}` }
function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}
function myToInput(my: string) { const [m, y] = my.split('/'); return `${y}-${m}` }
function inputToMY(v: string) { const [y, m] = v.split('-'); return `${m}/${y}` }
const fmtNum = (n: number) =>
  new Intl.NumberFormat('he-IL', { maximumFractionDigits: 0 }).format(n)

interface RunAction {
  parentId: string; parentName: string; ppId?: string
  salary?: number; tuitionBalance?: number; offset?: number
  skipped: boolean; reason?: string
}
interface RunResult {
  actions: RunAction[]; applied: number; skipped: number
  totalOffset: number; dryRun: boolean; monthYear: string; error?: string
}
interface LogEntry {
  id: string; automation_id: string; run_at: string; dry_run: boolean
  parent_name: string | null; actions_count: number; status: string; summary: string
}
interface ParentOption { id: string; name: string; salary_gross: number }

const FLOW_STEPS = [
  { icon: '⏰', label: 'הפעלה', desc: 'ידני / מתוזמן', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
  { icon: '👥', label: 'הורים עם שכ"ל', desc: 'תשלום פתוח לחודש', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  { icon: '🧮', label: 'חישוב קיזוז', desc: 'min(משכורת, שכ"ל)', bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  { icon: '✅', label: 'יצירת תנועה', desc: 'קיזוז ממשכורת', bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
]

const AUTOMATION_LOGS_SQL = `CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id TEXT NOT NULL,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  dry_run BOOLEAN DEFAULT false,
  parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL,
  parent_name TEXT,
  actions_count INT DEFAULT 0,
  status TEXT DEFAULT 'success',
  summary TEXT,
  details JSONB DEFAULT '[]'
);
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON automation_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);`

function AutomationsTab() {
  return (
    <div className="space-y-5">
      <p className="text-sm text-gray-500">כל האוטומציות הפעילות — הרצה ידנית, בדיקות ולוג פעולות</p>
      <TuitionOffsetCard />
    </div>
  )
}

function TuitionOffsetCard() {
  const [monthYear, setMonthYear]         = useState(currentMY())
  const [phase, setPhase]                 = useState<'idle'|'parent-pick'|'running'|'results'>('idle')
  const [dryRun, setDryRun]               = useState(false)
  const [pickedParent, setPickedParent]   = useState<ParentOption | null>(null)
  const [parentSearch, setParentSearch]   = useState('')
  const [parentOptions, setParentOptions] = useState<ParentOption[]>([])
  const [parentsLoading, setParentsLoading] = useState(false)
  const [result, setResult]               = useState<RunResult | null>(null)
  const [logs, setLogs]                   = useState<LogEntry[]>([])
  const [logsLoading, setLogsLoading]     = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [showMigration, setShowMigration] = useState(false)

  const loadLogs = async () => {
    try {
      const r = await fetch('/api/automations/logs?automationId=tuition-offset')
      const d = await r.json()
      setLogs(d.logs ?? [])
      setNeedsMigration(d.needsMigration ?? false)
    } catch {} finally { setLogsLoading(false) }
  }
  useEffect(() => { loadLogs() }, [])

  const loadParents = async () => {
    setParentsLoading(true)
    try {
      const r = await fetch('/api/automations/tuition-offset')
      const d = await r.json()
      setParentOptions(Array.isArray(d) ? d : [])
    } catch {} finally { setParentsLoading(false) }
  }

  const openSinglePick = (isDry: boolean) => {
    setDryRun(isDry); setPhase('parent-pick')
    setPickedParent(null); setParentSearch('')
    loadParents()
  }

  const runAutomation = async (isDry: boolean, parentId?: string) => {
    setPhase('running')
    try {
      const r = await fetch('/api/automations/tuition-offset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun: isDry, parentId, monthYear }),
      })
      const d: RunResult = await r.json()
      setResult(d); setPhase('results')
      if (!isDry) loadLogs()
    } catch { setPhase('idle') }
  }

  const filteredParents = parentOptions.filter(p =>
    !parentSearch.trim() || (p.name ?? '').includes(parentSearch.trim())
  )

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-gray-200 flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">🔄</span>
            <h4 className="font-bold text-gray-800">קיזוז שכ&quot;ל ממשכורת</h4>
          </div>
          <p className="text-xs text-gray-500 mt-1 mr-7">
            מזין תנועת קיזוז בתשלום שכ&quot;ל החודשי — הנמוך מבין המשכורת לשכ&quot;ל הפתוח
          </p>
        </div>
        <span className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-semibold border border-purple-200 whitespace-nowrap">
          ⏰ ידני
        </span>
      </div>

      {/* Visual flow */}
      <div className="px-6 py-5 border-b border-gray-100 overflow-x-auto" dir="ltr">
        <div className="flex items-stretch gap-0 min-w-max">
          {FLOW_STEPS.map((step, i) => (
            <div key={i} className="flex items-center">
              <div className={`flex flex-col items-center px-4 py-3 rounded-2xl border-2 ${step.bg} ${step.border} min-w-[108px]`}>
                <span className="text-2xl leading-none">{step.icon}</span>
                <span className={`text-xs font-bold mt-1.5 ${step.text}`}>{step.label}</span>
                <span className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight">{step.desc}</span>
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <div className="flex items-center px-1.5">
                  <div className="w-5 h-0.5 bg-gray-300" />
                  <div className="w-0 h-0 border-t-[5px] border-b-[5px] border-l-[7px] border-t-transparent border-b-transparent border-l-gray-300" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Params */}
      <div className="px-6 py-4 border-b border-gray-100" dir="rtl">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">פרמטרים</p>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="text-sm text-gray-700 font-medium whitespace-nowrap">חודש לקיזוז:</label>
          <input
            type="month"
            value={myToInput(monthYear)}
            onChange={e => setMonthYear(inputToMY(e.target.value))}
            className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white"
            dir="ltr"
          />
          <span className="text-sm text-indigo-600 font-medium">{fmtMY(monthYear)}</span>
        </div>
      </div>

      {/* Run buttons */}
      <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-2" dir="rtl">
        <button
          onClick={() => runAutomation(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors flex items-center gap-1.5"
        >
          🧪 בדיקה לכולם
        </button>
        <button
          onClick={() => runAutomation(false)}
          className="px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5"
          style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
        >
          ▶ הרץ לכולם
        </button>
        <button
          onClick={() => openSinglePick(false)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors flex items-center gap-1.5"
        >
          👤 הרץ להורה בודד
        </button>
        <button
          onClick={() => openSinglePick(true)}
          className="px-4 py-2 rounded-xl text-sm font-semibold bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100 transition-colors flex items-center gap-1.5"
        >
          🧪 בדיקה להורה בודד
        </button>
      </div>

      {/* Activity log */}
      <div className="px-6 py-4" dir="rtl">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">לוג פעולות אחרונות</p>
          {needsMigration && (
            <button
              onClick={() => setShowMigration(v => !v)}
              className="text-xs text-amber-600 underline"
            >
              {showMigration ? 'הסתר SQL' : '⚠️ נדרש SQL לאפשר לוג'}
            </button>
          )}
        </div>

        {needsMigration && showMigration && (
          <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800 space-y-1">
            <p className="font-semibold">הרץ ב-Supabase → SQL editor:</p>
            <pre dir="ltr" className="text-[10px] bg-white border border-amber-100 rounded p-2 overflow-x-auto whitespace-pre">
              {AUTOMATION_LOGS_SQL}
            </pre>
          </div>
        )}

        {logsLoading ? (
          <div className="space-y-1">
            {[1,2,3].map(i => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}
          </div>
        ) : logs.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-4">אין הרצות עדיין</p>
        ) : (
          <div className="rounded-xl border border-gray-100 overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100 text-right">
                  <th className="px-3 py-2 font-semibold text-gray-400">תאריך</th>
                  <th className="px-3 py-2 font-semibold text-gray-400">סוג</th>
                  <th className="px-3 py-2 font-semibold text-gray-400">הורה</th>
                  <th className="px-3 py-2 font-semibold text-gray-400">תוצאה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                      {new Date(log.run_at).toLocaleString('he-IL', {
                        day: '2-digit', month: '2-digit',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-3 py-2">
                      {log.dry_run
                        ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">🧪 בדיקה</span>
                        : <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">▶ אמיתי</span>}
                    </td>
                    <td className="px-3 py-2 text-gray-600">{log.parent_name ?? 'כל ההורים'}</td>
                    <td className="px-3 py-2 text-gray-700">{log.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Running overlay ── */}
      {phase === 'running' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center" dir="rtl">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
          <div className="relative bg-white rounded-2xl px-12 py-8 text-center shadow-2xl space-y-2">
            <div className="text-4xl animate-spin">⚙️</div>
            <p className="font-semibold text-gray-700">מריץ אוטומציה...</p>
            <p className="text-xs text-gray-400">{fmtMY(monthYear)}</p>
          </div>
        </div>
      )}

      {/* ── Parent picker modal ── */}
      {phase === 'parent-pick' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPhase('idle')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <button onClick={() => setPhase('idle')} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              <h3 className="font-bold text-gray-800">
                בחר הורה {dryRun ? <span className="text-amber-600 text-sm font-normal">(בדיקה)</span> : ''}
              </h3>
            </div>
            <div className="px-4 py-3 border-b border-gray-100 flex-shrink-0">
              <input
                autoFocus
                type="text"
                placeholder="חיפוש הורה..."
                value={parentSearch}
                onChange={e => setParentSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {parentsLoading
                ? <div className="p-6 text-center text-gray-400 text-sm">טוען...</div>
                : filteredParents.length === 0
                  ? <div className="p-6 text-center text-gray-400 text-sm">לא נמצאו הורים עם משכורת</div>
                  : filteredParents.map(p => (
                    <button key={p.id}
                      onClick={() => setPickedParent(p)}
                      className={`w-full flex items-center justify-between px-5 py-3 text-right text-sm border-b border-gray-50 transition-colors ${pickedParent?.id === p.id ? 'bg-blue-50 border-blue-100' : 'hover:bg-gray-50'}`}
                    >
                      <span className="text-gray-400 text-xs">₪{fmtNum(Number(p.salary_gross))}/חודש</span>
                      <span className="font-medium text-gray-800">{p.name}</span>
                    </button>
                  ))
              }
            </div>
            <div className="px-5 py-4 border-t border-gray-100 flex gap-2 flex-shrink-0">
              <button onClick={() => setPhase('idle')}
                className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">
                ביטול
              </button>
              <button
                disabled={!pickedParent}
                onClick={() => pickedParent && runAutomation(dryRun, pickedParent.id)}
                className="flex-1 py-2 rounded-xl text-sm font-bold transition-all disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
              >
                {dryRun ? '🧪 הרץ בדיקה' : '▶ הרץ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Results modal ── */}
      {phase === 'results' && result && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setPhase('idle'); setResult(null) }} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            {/* Results header */}
            <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
              <button onClick={() => { setPhase('idle'); setResult(null) }} className="text-gray-400 hover:text-gray-600 text-lg leading-none">✕</button>
              <h3 className="font-bold text-gray-800">
                {result.error ? '❌ שגיאה' : result.dryRun ? '🧪 תוצאות בדיקה' : '✅ הרצה הושלמה'}
              </h3>
            </div>

            {/* Summary bar */}
            <div className={`px-5 py-3 border-b flex-shrink-0 ${result.dryRun ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
              {result.error
                ? <p className="text-red-600 text-sm">{result.error}</p>
                : (
                  <div className="flex flex-wrap gap-4 text-sm items-center">
                    <span className="text-gray-600">חודש: <strong>{fmtMY(result.monthYear)}</strong></span>
                    <span className="text-emerald-700 font-semibold">קוזזו: {result.applied} הורים</span>
                    <span className="text-gray-400">דולגו: {result.skipped}</span>
                    <span className="font-bold text-gray-800">סה&quot;כ ₪{fmtNum(result.totalOffset)}</span>
                  </div>
                )}
              {result.dryRun && !result.error && (
                <p className="text-xs text-amber-700 mt-1">⚠️ בדיקה בלבד — שום דבר לא נשמר</p>
              )}
            </div>

            {/* Actions table */}
            {!result.error && (
              <div className="overflow-y-auto flex-1">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-gray-50 border-b border-gray-200">
                    <tr className="text-right text-xs text-gray-400">
                      <th className="px-4 py-2">הורה</th>
                      <th className="px-4 py-2 text-left">משכורת</th>
                      <th className="px-4 py-2 text-left">שכ&quot;ל</th>
                      <th className="px-4 py-2 text-left">קיזוז</th>
                      <th className="px-4 py-2 text-center">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {result.actions.map((a, i) => (
                      <tr key={i} className={a.skipped ? 'opacity-50' : ''}>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{a.parentName}</td>
                        <td className="px-4 py-2.5 text-left tabular-nums text-gray-500">
                          {a.salary != null ? `₪${fmtNum(a.salary)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-left tabular-nums text-gray-500">
                          {a.tuitionBalance != null ? `₪${fmtNum(a.tuitionBalance)}` : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-left tabular-nums font-semibold text-emerald-700">
                          {a.skipped ? '—' : `₪${fmtNum(a.offset ?? 0)}`}
                        </td>
                        <td className="px-4 py-2.5 text-center">
                          {a.skipped
                            ? <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500">{a.reason ?? 'דולג'}</span>
                            : <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700">✓ קוזז</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                onClick={() => { setPhase('idle'); setResult(null) }}
                className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50"
              >
                סגור
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════════════ */

const INPUT = 'w-full px-4 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white text-right'

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1.5 text-right">{label}</label>
      {children}
    </div>
  )
}
