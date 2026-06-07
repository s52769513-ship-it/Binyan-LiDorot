'use client'

import { useEffect, useRef, useState } from 'react'

/* ─── helpers ─────────────────────────────────────────────────────────── */
const HM: Record<string, string> = {
  '01':'ינואר','02':'פברואר','03':'מרץ','04':'אפריל','05':'מאי','06':'יוני',
  '07':'יולי','08':'אוגוסט','09':'ספטמבר','10':'אוקטובר','11':'נובמבר','12':'דצמבר',
}
const fmtMY   = (my: string) => { const [m,y]=my.split('/'); return `${HM[m]||m} ${y}` }
const myToInp = (my: string) => { const [m,y]=my.split('/'); return `${y}-${m}` }
const inpToMY = (v: string)  => { const [y,m]=v.split('-'); return `${m}/${y}` }
const fmtN    = (n: number)  => new Intl.NumberFormat('he-IL',{maximumFractionDigits:0}).format(n)

function currentMY() {
  const d=new Date(); return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
function nextRunLabel(day = 1): string {
  const d    = new Date()
  const next = d.getDate() >= day
    ? new Date(d.getFullYear(), d.getMonth() + 1, day)
    : new Date(d.getFullYear(), d.getMonth(), day)
  return `${day} ל${HM[String(next.getMonth()+1).padStart(2,'0')]} ${next.getFullYear()}`
}
function prevMY() {
  const d=new Date(); d.setMonth(d.getMonth()-1)
  return `${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`
}
function last6Months(): string[] {
  const months: string[] = []
  const d = new Date()
  for (let i=1; i<=6; i++) {
    const t = new Date(d.getFullYear(), d.getMonth()-i, 1)
    months.push(`${String(t.getMonth()+1).padStart(2,'0')}/${t.getFullYear()}`)
  }
  return months
}

/* ─── types ───────────────────────────────────────────────────────────── */
interface ParentOpt  { id: string; name: string; salary_gross: number }
interface LiveLine   { time: string; kind: 'step'|'ok'|'skip'|'done'|'err'; text: string; detail?: string }
interface RunAction  { parentName: string; salary?: number; tuitionBalance?: number; offset?: number; offsetFound?: number; ppCreated?: boolean; ppExists?: boolean; skipped: boolean; reason?: string }
interface RunResult  { actions: RunAction[]; applied: number; skipped: number; totalOffset: number; totalCreated?: number; dryRun: boolean; monthYear: string; error?: string }
interface LogEntry   { id: string; run_at: string; dry_run: boolean; parent_name: string|null; actions_count: number; summary: string }
interface FlowStep   { icon: string; label: string; desc: string; bg: string; border: string; text: string }

type Phase = 'idle'|'parent-pick'|'running'|'results'

/* ─── automation definitions ──────────────────────────────────────────── */
interface AutoDef {
  id: string; name: string; icon: string; desc: string
  defaultMonth: () => string; steps: FlowStep[]
  endpoint: string
  sql: string
}

const DEFS: AutoDef[] = [
  {
    id: 'tuition-offset', name: 'קיזוז שכ"ל ממשכורת', icon: '🔄',
    desc: 'יוצר תנועת קיזוז על תשלום השכ"ל החודשי — הנמוך מבין המשכורת לשכ"ל הפתוח',
    defaultMonth: currentMY,
    endpoint: '/api/automations/tuition-offset',
    steps: [
      { icon:'⏰', label:'הפעלה',        desc:'ידני / מתוזמן',       bg:'bg-purple-50',  border:'border-purple-200',  text:'text-purple-700'  },
      { icon:'👥', label:'שאילתת הורים', desc:'שכ"ל פתוח לחודש',     bg:'bg-blue-50',    border:'border-blue-200',    text:'text-blue-700'    },
      { icon:'🧮', label:'חישוב קיזוז',  desc:'min(משכורת, שכ"ל)',   bg:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700'   },
      { icon:'✅', label:'יצירת תנועה',  desc:'קיזוז ממשכורת',       bg:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700' },
    ],
    sql: `-- טבלת לוגים (אם עדיין לא קיימת)
CREATE TABLE IF NOT EXISTS automation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id TEXT NOT NULL,
  run_at TIMESTAMPTZ DEFAULT NOW(),
  dry_run BOOLEAN DEFAULT false,
  parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL,
  parent_name TEXT, actions_count INT DEFAULT 0,
  status TEXT DEFAULT 'success', summary TEXT, details JSONB DEFAULT '[]'
);
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON automation_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);`,
  },
  {
    id: 'nedarim-bank-hok-enrich', name: 'סינק הו"ק בנקאי', icon: '🏦',
    desc: 'מושך פרטים מלאים לכל הו"ק בנקאי: בנק/סניף/חשבון, סטטוס, סכום, קטגוריה, ת"ז',
    defaultMonth: currentMY,
    endpoint: '/api/automations/nedarim-bank-hok-enrich',
    steps: [
      { icon:'⏰', label:'הפעלה',        desc:'ידני',               bg:'bg-purple-50',  border:'border-purple-200',  text:'text-purple-700'  },
      { icon:'🔄', label:'כל הו"ק בנקאי', desc:'לפי DB',            bg:'bg-blue-50',    border:'border-blue-200',    text:'text-blue-700'    },
      { icon:'🌐', label:'GetMasavId',   desc:'קריאה לכל הו"ק',     bg:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700'   },
      { icon:'✅', label:'עדכון פרטים',  desc:'בנק / סטטוס / ת"ז',  bg:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700' },
    ],
    sql: '',
  },
  {
    id: 'salary-pp', name: 'יצירת תשלום מתוכנן למשכורת', icon: '💼',
    desc: 'יוצר תשלום מתוכנן למשכורת של חודש קודם ומקשר קיזוזי שכ"ל שנמצאו',
    defaultMonth: prevMY,
    endpoint: '/api/automations/salary-pp',
    steps: [
      { icon:'⏰', label:'הפעלה',          desc:'ידני / מתוזמן',        bg:'bg-purple-50',  border:'border-purple-200',  text:'text-purple-700'  },
      { icon:'👥', label:'שאילתת הורים',   desc:'הורים עם משכורת',      bg:'bg-blue-50',    border:'border-blue-200',    text:'text-blue-700'    },
      { icon:'📋', label:'יצירת תשלום',     desc:'תשלום מתוכנן לחודש',   bg:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700'   },
      { icon:'🔗', label:'קיזוז שכ"ל',     desc:'קישור תנועות קיזוז',   bg:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700' },
    ],
    sql: `-- טבלת היסטוריית קיזוזים
CREATE TABLE IF NOT EXISTS salary_offsets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  parent_id TEXT REFERENCES parents(id) ON DELETE SET NULL,
  parent_name TEXT, month_year TEXT NOT NULL,
  salary_gross NUMERIC DEFAULT 0, offset_amount NUMERIC DEFAULT 0,
  salary_pp_id TEXT, tuition_tx_ids JSONB DEFAULT '[]'
);
ALTER TABLE salary_offsets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "service_role_all" ON salary_offsets
  FOR ALL TO service_role USING (true) WITH CHECK (true);`,
  },
  {
    id: 'nedarim-credit-hok-sync', name: 'סינק הו"ק אשראי מנדרים', icon: '💳',
    desc: 'מושך רשימת הו"ק אשראי מנדרים ומעדכן פרטי כרטיס: 4 ספרות, תוקף, סכום חיוב, יתרה',
    defaultMonth: currentMY,
    endpoint: '/api/automations/nedarim-credit-hok-sync',
    steps: [
      { icon:'⏰', label:'הפעלה',         desc:'ידני',                   bg:'bg-purple-50',  border:'border-purple-200',  text:'text-purple-700'  },
      { icon:'🌐', label:'נדרים API',     desc:'GetKevaNew',             bg:'bg-blue-50',    border:'border-blue-200',    text:'text-blue-700'    },
      { icon:'🔍', label:'התאמת הו"ק',   desc:'לפי external_id',        bg:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700'   },
      { icon:'✅', label:'עדכון פרטים',  desc:'כרטיס / יתרה / קטגוריה', bg:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700' },
    ],
    sql: '',
  },
  {
    id: 'nedarim-credit-hok-pull', name: 'משיכת תנועות הו"ק אשראי', icon: '💳',
    desc: 'מושך היסטוריית חיובים לכל הו"ק אשראי, מעדכן פרטי כרטיס, ומקשר תנועות ל-PP שכ"ל',
    defaultMonth: currentMY,
    endpoint: '/api/automations/nedarim-credit-hok-pull',
    steps: [
      { icon:'⏰', label:'הפעלה',          desc:'ידני',                 bg:'bg-purple-50',  border:'border-purple-200',  text:'text-purple-700'  },
      { icon:'💳', label:'כל הו"ק אשראי', desc:'לפי DB',               bg:'bg-blue-50',    border:'border-blue-200',    text:'text-blue-700'    },
      { icon:'🌐', label:'GetKevald',      desc:'היסטוריה לכל הו"ק',   bg:'bg-amber-50',   border:'border-amber-200',   text:'text-amber-700'   },
      { icon:'✅', label:'תנועה + PP',     desc:'חיוב / קישור לשכ"ל', bg:'bg-emerald-50', border:'border-emerald-200', text:'text-emerald-700' },
    ],
    sql: '',
  },
]

/* ─── FlowDiagram ─────────────────────────────────────────────────────── */
function FlowDiagram({ steps, activeStep }: { steps: FlowStep[]; activeStep: number }) {
  return (
    <div className="flex items-center gap-0 min-w-max" dir="ltr">
      {steps.map((s, i) => {
        const n   = i + 1
        const act = activeStep === n
        const done= activeStep > n  && activeStep > 0
        return (
          <div key={i} className="flex items-center">
            <div className={`
              relative flex flex-col items-center px-4 py-3 rounded-2xl border-2 min-w-[108px]
              transition-all duration-300 overflow-hidden
              ${s.bg} ${s.border}
              ${act  ? `scale-110 shadow-xl ring-4 ring-offset-1 ${s.border.replace('border-','ring-')}` : ''}
              ${done ? 'opacity-40' : ''}
            `}>
              {/* pulse overlay when active */}
              {act && <div className={`absolute inset-0 ${s.bg} animate-ping opacity-30 rounded-2xl`} />}
              <span className="text-2xl leading-none relative z-10">{s.icon}</span>
              <span className={`text-xs font-bold mt-1.5 ${s.text} relative z-10 text-center`}>{s.label}</span>
              <span className="text-[10px] text-gray-400 mt-0.5 text-center leading-tight relative z-10">{s.desc}</span>
              {done && <div className="absolute top-1 right-1.5 text-[10px] text-emerald-500 font-bold z-10">✓</div>}
              {/* traveling dot under active node */}
              {act && <div className={`absolute bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full ${s.text.replace('text-','bg-')} opacity-80 animate-bounce z-10`} />}
            </div>

            {i < steps.length - 1 && (
              <div className="relative flex items-center px-0.5">
                {/* static arrow line */}
                <div className={`h-0.5 w-6 transition-colors duration-500 ${done || activeStep > i+1 ? 'bg-emerald-300' : 'bg-gray-200'}`} />
                {/* traveling beam when next step is about to activate */}
                {activeStep === n && (
                  <div className="absolute inset-0 overflow-hidden h-0.5 my-auto">
                    <div className="h-full bg-gradient-to-r from-transparent via-indigo-400 to-transparent animate-beam" />
                  </div>
                )}
                <div className={`w-0 h-0 border-t-[5px] border-b-[5px] border-l-[7px] border-t-transparent border-b-transparent transition-colors duration-500 ${done || activeStep > i+1 ? 'border-l-emerald-300' : 'border-l-gray-200'}`} />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ─── LiveTerminal ────────────────────────────────────────────────────── */
function LiveTerminal({ lines, running }: { lines: LiveLine[]; running: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [lines])

  return (
    <div ref={ref}
      className="font-mono text-xs bg-gray-950 rounded-xl p-3 h-36 overflow-y-auto scroll-smooth"
      dir="ltr"
    >
      {lines.map((l, i) => (
        <div key={i} className="flex gap-2 py-0.5 leading-relaxed">
          <span className="text-gray-600 shrink-0 select-none">{l.time}</span>
          <span className={
            l.kind==='step' ? 'text-yellow-400' :
            l.kind==='done' ? 'text-emerald-300 font-semibold' :
            l.kind==='err'  ? 'text-red-400' :
            l.kind==='skip' ? 'text-gray-500' :
            'text-green-400'
          }>{l.text}</span>
          {l.detail && <span className="text-gray-600 text-[10px] self-center">· {l.detail}</span>}
        </div>
      ))}
      {running && <span className="text-green-400 animate-pulse">▮</span>}
    </div>
  )
}

/* ─── ResultsModal ────────────────────────────────────────────────────── */
function ResultsModal({ result, def, onClose }: { result: RunResult; def: AutoDef; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0">
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
          <h3 className="font-bold text-gray-800">
            {result.error ? '❌ שגיאה' : result.dryRun ? '🧪 תוצאות בדיקה' : '✅ הרצה הושלמה'}
          </h3>
        </div>
        <div className={`px-5 py-3 border-b flex-shrink-0 ${result.dryRun ? 'bg-amber-50 border-amber-100' : 'bg-emerald-50 border-emerald-100'}`}>
          {result.error
            ? <p className="text-red-600 text-sm">{result.error}</p>
            : (() => {
              const isHok = ['nedarim-bank-hok-enrich','nedarim-credit-hok-sync','nedarim-credit-hok-pull'].includes(def.id)
              return (
                <div className="flex flex-wrap gap-4 text-sm">
                  {!isHok && <span>חודש: <strong>{fmtMY(result.monthYear)}</strong></span>}
                  {def.id === 'tuition-offset'
                    ? <><span className="text-emerald-700 font-semibold">קוזזו: {result.applied} הורים</span><span className="font-bold">₪{fmtN(result.totalOffset)} סה&quot;כ</span></>
                    : isHok
                      ? <>
                          {(result as {created?:number}).created != null && (result as {created?:number}).created! > 0 && <span className="text-blue-700 font-semibold">נוצרו: {(result as {created?:number}).created}</span>}
                          {(result as {updated?:number}).updated != null && <span className="text-emerald-700 font-semibold">עודכנו: {(result as {updated?:number}).updated}</span>}
                          {(result as {imported?:number}).imported != null && <span className="text-emerald-700 font-semibold">יובאו: {(result as {imported?:number}).imported}</span>}
                          {(result.totalOffset ?? 0) > 0 && <span className="font-bold">₪{fmtN(result.totalOffset)}</span>}
                        </>
                      : <><span className="text-emerald-700 font-semibold">נוצרו: {result.totalCreated ?? result.applied} תשלומים מתוכננים</span><span className="font-bold">קוזז ₪{fmtN(result.totalOffset)}</span></>
                  }
                  <span className="text-gray-400">דולגו: {result.skipped}</span>
                </div>
              )
            })()}
          {result.dryRun && !result.error && <p className="text-xs text-amber-700 mt-1">⚠️ בדיקה בלבד — שום דבר לא נשמר</p>}
        </div>
        {!result.error && (
          <div className="overflow-y-auto flex-1">
            {['nedarim-bank-hok-enrich','nedarim-credit-hok-sync','nedarim-credit-hok-pull'].includes(def.id) ? (
              // הו"ק automations — show simple message list from liveLines (passed via actions workaround)
              <p className="px-5 py-6 text-center text-sm text-gray-400">הפעולה הושלמה — ראה לוג הרצה למעלה לפרטים</p>
            ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b">
                <tr className="text-right text-xs text-gray-400">
                  <th className="px-4 py-2">הורה</th>
                  {def.id === 'tuition-offset' ? <>
                    <th className="px-4 py-2 text-left">משכורת</th>
                    <th className="px-4 py-2 text-left">שכ&quot;ל</th>
                    <th className="px-4 py-2 text-left">קיזוז</th>
                  </> : <>
                    <th className="px-4 py-2 text-left">משכורת</th>
                    <th className="px-4 py-2 text-center">תשלום מתוכנן</th>
                    <th className="px-4 py-2 text-left">קיזוז שנמצא</th>
                  </>}
                  <th className="px-4 py-2 text-center">סטטוס</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {result.actions.map((a, i) => (
                  <tr key={i} className={a.skipped ? 'opacity-40' : ''}>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{a.parentName}</td>
                    {def.id === 'tuition-offset' ? <>
                      <td className="px-4 py-2.5 text-left tabular-nums text-gray-500">{a.salary!=null?`₪${fmtN(a.salary)}`:'—'}</td>
                      <td className="px-4 py-2.5 text-left tabular-nums text-gray-500">{a.tuitionBalance!=null?`₪${fmtN(a.tuitionBalance)}`:'—'}</td>
                      <td className="px-4 py-2.5 text-left tabular-nums font-semibold text-emerald-700">{a.skipped?'—':`₪${fmtN(a.offset??0)}`}</td>
                    </> : <>
                      <td className="px-4 py-2.5 text-left tabular-nums text-gray-500">{a.salary!=null?`₪${fmtN(a.salary)}`:'—'}</td>
                      <td className="px-4 py-2.5 text-center text-xs">
                        {a.ppCreated ? <span className="text-emerald-600">נוצר ✓</span> : a.ppExists ? <span className="text-gray-400">קיים</span> : '—'}
                      </td>
                      <td className="px-4 py-2.5 text-left tabular-nums text-blue-600">{(a.offsetFound??0)>0?`₪${fmtN(a.offsetFound??0)}`:'—'}</td>
                    </>}
                    <td className="px-4 py-2.5 text-center">
                      {a.skipped
                        ? <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500">{a.reason??'דולג'}</span>
                        : <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700">✓</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        )}
        <div className="px-5 py-4 border-t flex-shrink-0">
          <button onClick={onClose} className="w-full py-2.5 rounded-xl border border-gray-200 text-sm text-gray-600 hover:bg-gray-50">סגור</button>
        </div>
      </div>
    </div>
  )
}

/* ─── MissedMonthsModal ───────────────────────────────────────────────── */
function MissedMonthsModal({ months, onRun, onSkip }: {
  months: string[]
  onRun: (selected: string[]) => void
  onSkip: () => void
}) {
  const [selected, setSelected] = useState<string[]>(months)
  const toggle = (m: string) => setSelected(p => p.includes(m) ? p.filter(x=>x!==m) : [...p, m])
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" dir="rtl">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs">
        <div className="px-5 py-4 border-b">
          <h3 className="font-bold text-gray-800 text-center">האוטומציה הייתה מכובה</h3>
          <p className="text-xs text-gray-500 text-center mt-1">נמצאו חודשים שלא טופלו — לבצע עכשיו?</p>
        </div>
        <div className="px-5 py-3 space-y-2">
          {months.map(m => (
            <label key={m} className="flex items-center gap-3 cursor-pointer py-1">
              <input type="checkbox" checked={selected.includes(m)} onChange={() => toggle(m)}
                className="w-4 h-4 rounded text-[#1a3a7a]" />
              <span className="text-sm font-medium text-gray-700">{fmtMY(m)}</span>
            </label>
          ))}
        </div>
        <div className="px-5 py-4 border-t flex gap-2">
          <button onClick={onSkip} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm text-gray-500 hover:bg-gray-50">דלג</button>
          <button
            disabled={selected.length === 0}
            onClick={() => onRun(selected)}
            className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}
          >
            הרץ על {selected.length} חודשים
          </button>
        </div>
      </div>
    </div>
  )
}

/* ─── AutomationCard ──────────────────────────────────────────────────── */
function AutomationCard({ def, enabled, onToggleEnabled }: {
  def: AutoDef; enabled: boolean; onToggleEnabled: (val: boolean) => void
}) {
  const [monthYear, setMonthYear]           = useState(def.defaultMonth())
  // salary-pp range mode
  const schoolYearStart = (): string => {
    const now = new Date(); const y = now.getFullYear()
    return now.getMonth() >= 8 ? `09/${y}` : `09/${y - 1}`
  }
  const curMonth = (): string => {
    const now = new Date()
    return `${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()}`
  }
  const [fromMonth, setFromMonth]           = useState(schoolYearStart())
  const [toMonth, setToMonth]               = useState(curMonth())
  const [phase, setPhase]                   = useState<Phase>('idle')
  const [dryRun, setDryRun]                 = useState(false)
  const [activeStep, setActiveStep]         = useState(0)
  const [liveLines, setLiveLines]           = useState<LiveLine[]>([])
  const [result, setResult]                 = useState<RunResult|null>(null)
  const [pickedParent, setPickedParent]     = useState<ParentOpt|null>(null)
  const [parentSearch, setParentSearch]     = useState('')
  const [parentOptions, setParentOptions]   = useState<ParentOpt[]>([])
  const [parentsLoading, setParentsLoading] = useState(false)
  const [logs, setLogs]                     = useState<LogEntry[]>([])
  const [logsLoading, setLogsLoading]       = useState(true)
  const [needsSql, setNeedsSql]             = useState(false)
  const [showSql, setShowSql]               = useState(false)
  const [missedMonths, setMissedMonths]     = useState<string[]|null>(null)

  const nowStr = () => new Date().toLocaleTimeString('he-IL', { hour:'2-digit', minute:'2-digit', second:'2-digit' })
  const addLine = (kind: LiveLine['kind'], text: string, detail?: string) =>
    setLiveLines(p => [...p, { time: nowStr(), kind, text, detail }])
  const delay = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

  const loadLogs = async () => {
    try {
      const r = await fetch(`/api/automations/logs?automationId=${def.id}`)
      const d = await r.json()
      setLogs(d.logs ?? [])
      setNeedsSql(d.needsMigration ?? false)
    } catch {} finally { setLogsLoading(false) }
  }
  useEffect(() => { loadLogs() }, [])

  const loadParents = async () => {
    setParentsLoading(true)
    try {
      const r = await fetch(def.endpoint)
      const d = await r.json()
      setParentOptions(Array.isArray(d) ? d : [])
    } catch {} finally { setParentsLoading(false) }
  }

  /* detect missed months (look at logs for last 6 months) */
  const getMissed = (currentLogs: LogEntry[]): string[] => {
    const successMonths = new Set(
      currentLogs
        .filter(l => !l.dry_run)
        .map(l => { const m=l.summary.match(/\((\d{2}\/\d{4})\)/); return m?.[1]||'' })
        .filter(Boolean)
    )
    return last6Months().filter(m => !successMonths.has(m))
  }

  const handleToggleOn = () => {
    const missed = getMissed(logs)
    if (missed.length > 0) setMissedMonths(missed)
    else onToggleEnabled(true)
  }

  const runStream = async (isDry: boolean, pid?: string, my?: string) => {
    const targetMY = my || monthYear
    setPhase('running')
    setActiveStep(1)
    setLiveLines([])
    const actions: RunAction[] = []

    addLine('step', `▶ מתחיל${isDry ? ' בדיקה' : ''} — ${fmtMY(targetMY)}`)

    try {
      const resp = await fetch(def.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          def.id === 'salary-pp' && !pid
            ? { dryRun: isDry, fromMonth, toMonth }
            : { dryRun: isDry, parentId: pid, monthYear: targetMY }
        ),
      })
      if (!resp.body) throw new Error('no stream')
      const reader = resp.body.getReader()
      const dec    = new TextDecoder()
      let buf      = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''
        for (const line of lines) {
          if (!line.trim()) continue
          try {
            const ev = JSON.parse(line)
            if (ev.type === 'step') {
              setActiveStep(ev.step)
              addLine('step', `◆ ${ev.msg}`)
              await delay(60)
            } else if (ev.type === 'progress') {
              if (ev.current != null && ev.total != null && !ev.parentName) {
                // numeric progress only — no line, just step indicator
              } else if (ev.skipped) {
                addLine('skip', `  — ${ev.parentName}`, ev.reason)
              } else if (def.id === 'tuition-offset') {
                addLine('ok', `  ✓ ${ev.parentName} → ₪${fmtN(ev.offset??0)}`,
                  `משכורת ₪${fmtN(ev.salary??0)} · שכ"ל ₪${fmtN(ev.tuitionBalance??0)}`)
              } else {
                addLine('ok', `  ✓ ${ev.parentName}${ev.ppCreated?' — PP נוצר':''}${(ev.offsetFound??0)>0?` · קיזוז ₪${fmtN(ev.offsetFound)}`:''}`)
              }
              actions.push(ev as RunAction)
              await delay(80)
            } else if (ev.type === 'complete') {
              setActiveStep(def.steps.length + 1)
              addLine('done',
                def.id==='tuition-offset'
                  ? `✅ הושלם — ${ev.applied} הורים · ₪${fmtN(ev.totalOffset)} קוזז`
                  : `✅ הושלם — ${ev.totalCreated??ev.applied} תשלומים מתוכננים נוצרו · ₪${fmtN(ev.totalOffset)} קוזז`
              )
              setResult({ ...ev, actions })
              setPhase('results')
              if (!isDry) loadLogs()
            } else if (ev.type === 'log') {
              addLine('ok', `  ${ev.message ?? ev.msg ?? ''}`)
            } else if (ev.type === 'done') {
              setActiveStep(def.steps.length + 1)
              const parts: string[] = []
              if (ev.imported != null) parts.push(`יובאו ${ev.imported}`)
              if (ev.updated  != null) parts.push(`עודכנו ${ev.updated}`)
              if (ev.deleted  != null && ev.deleted > 0) parts.push(`נמחקו ${ev.deleted}`)
              if (ev.skipped  != null) parts.push(`דולגו ${ev.skipped}`)
              if (ev.totalAmount) parts.push(`₪${fmtN(ev.totalAmount)}`)
              addLine('done', `✅ הושלם — ${parts.join(' · ')}${ev.dryRun ? ' [dry]' : ''}`)
              setResult({ ...ev, actions, applied: ev.imported ?? ev.updated ?? 0, totalOffset: ev.totalAmount ?? 0, dryRun: isDry, monthYear: targetMY })
              setPhase('results')
              if (!isDry) loadLogs()
            } else if (ev.type === 'error') {
              const msg = ev.message ?? ev.error ?? 'שגיאה לא ידועה'
              addLine('err', `❌ ${msg}`)
              setResult({ error: msg, actions, applied: 0, skipped: 0, totalOffset: 0, dryRun: isDry, monthYear: targetMY })
              setPhase('results')
            }
          } catch {}
        }
      }
    } catch (err) {
      addLine('err', `❌ ${String(err)}`)
      setPhase('idle')
    }
  }

  const openPick = (isDry: boolean) => {
    setDryRun(isDry); setPhase('parent-pick')
    setPickedParent(null); setParentSearch('')
    loadParents()
  }

  const filteredParents = parentOptions.filter(p =>
    !parentSearch.trim() || (p.name ?? '').includes(parentSearch.trim())
  )

  const isRunning = phase === 'running'

  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
      {/* ── Header ── */}
      <div className={`px-6 py-4 border-b border-gray-200 flex items-start justify-between ${enabled ? 'bg-gradient-to-r from-purple-50 to-indigo-50' : 'bg-gray-50'}`}>
        <div>
          <div className="flex items-center gap-2">
            <span className="text-xl">{def.icon}</span>
            <h4 className={`font-bold text-base ${enabled ? 'text-gray-800' : 'text-gray-400'}`}>{def.name}</h4>
          </div>
          <p className={`text-xs mt-1 mr-7 ${enabled ? 'text-gray-500' : 'text-gray-400'}`}>{def.desc}</p>
        </div>
        {/* ON/OFF toggle */}
        <button
          onClick={() => enabled ? onToggleEnabled(false) : handleToggleOn()}
          className={`relative flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
            enabled
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
              : 'bg-gray-100 text-gray-400 border-gray-200 hover:bg-gray-200'
          }`}
        >
          <span className={`w-7 h-4 rounded-full relative transition-colors duration-200 ${enabled ? 'bg-emerald-500' : 'bg-gray-300'}`}>
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-all duration-200 ${enabled ? 'right-0.5' : 'left-0.5'}`} />
          </span>
          {enabled ? 'פעיל' : 'כבוי'}
        </button>
      </div>

      {/* ── Schedule bar ── */}
      <ScheduleBar autoId={def.id} enabled={enabled} />

      {/* ── Flow diagram (always visible) ── */}
      <div className={`px-6 py-5 border-b border-gray-100 overflow-x-auto ${!enabled ? 'opacity-40' : ''}`} dir="ltr">
        <FlowDiagram steps={def.steps} activeStep={isRunning ? activeStep : 0} />
      </div>

      {/* ── Disabled notice ── */}
      {!enabled && (
        <div className="px-6 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2 text-xs text-gray-400" dir="rtl">
          <span>⏸</span>
          <span>האוטומציה כבויה — הרצות אמיתיות מושבתות. בדיקות עדיין זמינות.</span>
        </div>
      )}

      {/* ── Live terminal (during run) ── */}
      {(isRunning || liveLines.length > 0) && (
        <div className="px-6 py-3 border-b border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">לוג הרצה</p>
          <LiveTerminal lines={liveLines} running={isRunning} />
        </div>
      )}

      {/* ── Params ── */}
      {!isRunning && (
        <div className="px-6 py-4 border-b border-gray-100" dir="rtl">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-3">פרמטרים</p>
          {def.id === 'salary-pp' ? (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-gray-700 font-medium whitespace-nowrap">מחודש:</label>
              <input type="month" value={myToInp(fromMonth)} onChange={e => setFromMonth(inpToMY(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white" dir="ltr" />
              <label className="text-sm text-gray-700 font-medium whitespace-nowrap">עד חודש:</label>
              <input type="month" value={myToInp(toMonth)} onChange={e => setToMonth(inpToMY(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white" dir="ltr" />
              <button onClick={() => { setFromMonth(schoolYearStart()); setToMonth(curMonth()) }}
                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100">
                📅 מתחילת שנה
              </button>
              <span className="text-xs text-gray-400">{fromMonth} → {toMonth}</span>
            </div>
          ) : (
            <div className="flex items-center gap-3 flex-wrap">
              <label className="text-sm text-gray-700 font-medium whitespace-nowrap">חודש:</label>
              <input type="month" value={myToInp(monthYear)} onChange={e => setMonthYear(inpToMY(e.target.value))}
                className="px-3 py-1.5 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30 bg-white" dir="ltr" />
              <span className="text-sm text-indigo-600 font-medium">{fmtMY(monthYear)}</span>
            </div>
          )}
        </div>
      )}

      {/* ── Run buttons ── */}
      {!isRunning && (
        <div className="px-6 py-4 border-b border-gray-100 flex flex-wrap gap-2" dir="rtl">
          <button onClick={() => runStream(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors">
            🧪 בדיקה לכולם
          </button>
          {enabled && <>
            <button onClick={() => runStream(false)}
              className="px-4 py-2 rounded-xl text-sm font-bold transition-all"
              style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
              ▶ הרץ לכולם
            </button>
            <button onClick={() => openPick(false)}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 transition-colors">
              👤 הרץ להורה בודד
            </button>
          </>}
          <button onClick={() => openPick(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 transition-colors">
            🧪 בדיקה להורה
          </button>
        </div>
        )}

        {/* ── Activity log ── */}
        <div className="px-6 py-4" dir="rtl">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">הרצות אחרונות</p>
            {needsSql && (
              <button onClick={() => setShowSql(v=>!v)} className="text-xs text-amber-600 underline">
                {showSql ? 'הסתר SQL' : '⚠️ נדרש SQL לאפשר לוג'}
              </button>
            )}
          </div>
          {needsSql && showSql && (
            <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs space-y-1">
              <p className="font-semibold text-amber-800">הרץ ב-Supabase SQL editor:</p>
              <pre dir="ltr" className="text-[10px] bg-white border border-amber-100 rounded p-2 overflow-x-auto">{def.sql}</pre>
            </div>
          )}
          {logsLoading
            ? <div className="space-y-1">{[1,2,3].map(i=><div key={i} className="h-7 bg-gray-100 rounded animate-pulse"/>)}</div>
            : logs.length === 0
              ? <p className="text-sm text-gray-400 text-center py-3">אין הרצות עדיין</p>
              : (
                <div className="rounded-xl border border-gray-100 overflow-hidden">
                  <table className="w-full text-xs">
                    <thead><tr className="bg-gray-50 border-b text-right text-gray-400">
                      <th className="px-3 py-2">תאריך</th>
                      <th className="px-3 py-2">סוג</th>
                      <th className="px-3 py-2">הורה</th>
                      <th className="px-3 py-2">תוצאה</th>
                    </tr></thead>
                    <tbody className="divide-y divide-gray-50">
                      {logs.map(l => (
                        <tr key={l.id} className="hover:bg-gray-50">
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {new Date(l.run_at).toLocaleString('he-IL',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}
                          </td>
                          <td className="px-3 py-2">
                            {l.dry_run
                              ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">🧪 בדיקה</span>
                              : <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-700 rounded">▶ אמיתי</span>}
                          </td>
                          <td className="px-3 py-2 text-gray-600">{l.parent_name ?? 'כל ההורים'}</td>
                          <td className="px-3 py-2 text-gray-700">{l.summary}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
          }
        </div>

      {/* ── Modals ── */}
      {isRunning && (
        <div className="fixed inset-0 z-[70] pointer-events-none flex items-end justify-center pb-6" dir="rtl">
          <div className="bg-gray-950/90 backdrop-blur-sm text-white px-6 py-3 rounded-2xl flex items-center gap-3 pointer-events-auto shadow-2xl">
            <span className="text-lg animate-spin inline-block">⚙️</span>
            <span className="text-sm font-medium">
              {def.name} רץ{dryRun ? ' (בדיקה)' : ''} — {fmtMY(monthYear)}
            </span>
          </div>
        </div>
      )}

      {phase === 'parent-pick' && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" dir="rtl">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setPhase('idle')} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm max-h-[80vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b flex items-center justify-between flex-shrink-0">
              <button onClick={() => setPhase('idle')} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
              <h3 className="font-bold text-gray-800">בחר הורה {dryRun ? <span className="text-amber-500 text-sm">(בדיקה)</span> : ''}</h3>
            </div>
            <div className="px-4 py-3 border-b flex-shrink-0">
              <input autoFocus type="text" placeholder="חיפוש..." value={parentSearch}
                onChange={e => setParentSearch(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a3a7a]/30" />
            </div>
            <div className="overflow-y-auto flex-1">
              {parentsLoading
                ? <div className="p-6 text-center text-gray-400 text-sm">טוען...</div>
                : filteredParents.length === 0
                  ? <div className="p-6 text-center text-gray-400 text-sm">לא נמצאו הורים עם משכורת</div>
                  : filteredParents.map(p => (
                    <button key={p.id} onClick={() => setPickedParent(p)}
                      className={`w-full flex items-center justify-between px-5 py-3 text-right text-sm border-b border-gray-50 transition-colors ${pickedParent?.id===p.id?'bg-blue-50':'hover:bg-gray-50'}`}>
                      <span className="text-gray-400 text-xs">₪{fmtN(p.salary_gross)}/חודש</span>
                      <span className="font-medium">{p.name}</span>
                    </button>
                  ))}
            </div>
            <div className="px-5 py-4 border-t flex gap-2 flex-shrink-0">
              <button onClick={() => setPhase('idle')} className="flex-1 py-2 rounded-xl border text-sm text-gray-600 hover:bg-gray-50">ביטול</button>
              <button disabled={!pickedParent} onClick={() => pickedParent && runStream(dryRun, pickedParent.id)}
                className="flex-1 py-2 rounded-xl text-sm font-bold disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
                {dryRun ? '🧪 הרץ בדיקה' : '▶ הרץ'}
              </button>
            </div>
          </div>
        </div>
      )}

      {phase === 'results' && result && (
        <ResultsModal result={result} def={def} onClose={() => { setPhase('idle'); setResult(null) }} />
      )}

      {missedMonths !== null && (
        <MissedMonthsModal
          months={missedMonths}
          onSkip={() => { setMissedMonths(null); onToggleEnabled(true) }}
          onRun={async (selected) => {
            setMissedMonths(null)
            onToggleEnabled(true)
            for (const m of selected.sort()) {
              await runStream(false, undefined, m)
            }
          }}
        />
      )}
    </div>
  )
}

/* ─── ScheduleBar (per-automation) ───────────────────────────────────── */
function ScheduleBar({ autoId, enabled }: { autoId: string; enabled: boolean }) {
  const key = (f: string) => `${autoId.replace(/-/g, '_')}_${f}`
  const [day,  setDay]  = useState(1)
  const [time, setTime] = useState('08:00')  // HH:MM
  const [saving, setSaving] = useState(false)
  const [saved,  setSaved]  = useState(false)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d[key('day')]  != null) setDay(Number(d[key('day')]))
        if (d[key('time')] != null) setTime(String(d[key('time')]))
        else if (d[key('hour')] != null) setTime(`${String(Number(d[key('hour')])).padStart(2,'0')}:00`)
      })
      .catch(() => {})
  }, [autoId])

  const save = async () => {
    setSaving(true); setSaved(false)
    await fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key('day')]: day, [key('time')]: time, [key('hour')]: Number(time.split(':')[0]) }),
    }).catch(() => {})
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 px-4 py-2.5 border-b text-sm transition-opacity ${enabled ? 'bg-indigo-50 border-indigo-100' : 'bg-gray-50 border-gray-100 opacity-50 pointer-events-none'}`} dir="rtl">
      <span className="font-semibold text-indigo-600 shrink-0 text-xs">🕐 תזמון אוטומטי:</span>

      <span className="text-indigo-400 text-xs shrink-0">יום</span>
      <select value={day} onChange={e => setDay(Number(e.target.value))}
        className="px-2 py-0.5 rounded border border-indigo-200 text-xs bg-white focus:outline-none">
        {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>{d}</option>)}
      </select>

      <span className="text-indigo-400 text-xs shrink-0">שעה</span>
      <input
        type="time" value={time}
        onChange={e => setTime(e.target.value)}
        className="px-2 py-0.5 rounded border border-indigo-200 text-xs bg-white focus:outline-none"
        dir="ltr"
      />

      <button onClick={save} disabled={saving}
        className="px-2.5 py-0.5 rounded text-xs font-bold disabled:opacity-40 transition-all"
        style={{ background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)', color: '#d4a921' }}>
        {saving ? '...' : 'שמור'}
      </button>
      {saved && <span className="text-xs text-emerald-600">✓</span>}
      {enabled && <span className="text-xs text-indigo-400 mr-auto">הבא: {nextRunLabel(day)} בשעה {time}</span>}
      {!enabled && <span className="text-xs text-gray-400 mr-auto">כבוי — הפעל עם המתג למעלה</span>}
    </div>
  )
}

/* ─── AutomationsTab (exported) ───────────────────────────────────────── */
export default function AutomationsTab() {
  const [selectedId, setSelectedId] = useState(DEFS[0].id)

  // on/off state per automation, persisted in localStorage
  const [enabled, setEnabled] = useState<Record<string, boolean>>(() => {
    if (typeof window === 'undefined') return Object.fromEntries(DEFS.map(d => [d.id, true]))
    try {
      const raw = localStorage.getItem('automation_enabled')
      return raw ? JSON.parse(raw) : Object.fromEntries(DEFS.map(d => [d.id, true]))
    } catch { return Object.fromEntries(DEFS.map(d => [d.id, true])) }
  })

  const setAutomationEnabled = (id: string, val: boolean) => {
    const next = { ...enabled, [id]: val }
    setEnabled(next)
    try { localStorage.setItem('automation_enabled', JSON.stringify(next)) } catch {}
    // Save to DB so Cron knows about it too
    const dbKey = `${id.replace(/-/g, '_')}_enabled`
    fetch('/api/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [dbKey]: val }),
    }).catch(() => {})
  }

  const selectedDef = DEFS.find(d => d.id === selectedId) ?? DEFS[0]

  return (
    <div className="space-y-4" dir="rtl">
      {/* Automation selector pills */}
      <div className="flex gap-2 flex-wrap">
        {DEFS.map(d => (
          <button key={d.id} onClick={() => setSelectedId(d.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border transition-all ${
              selectedId === d.id
                ? 'bg-[#1a3a7a] text-white border-[#1a3a7a] shadow-sm'
                : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a3a7a] hover:text-[#1a3a7a]'
            }`}>
            <span>{d.icon}</span>
            <span>{d.name}</span>
            <span className={`w-2 h-2 rounded-full ${enabled[d.id] ? 'bg-emerald-400' : 'bg-gray-300'}`} />
          </button>
        ))}
        <span className="px-4 py-2 text-sm text-gray-300 border border-dashed border-gray-200 rounded-xl">
          + אוטומציות נוספות בקרוב
        </span>
      </div>

      {/* Selected card */}
      <AutomationCard
        key={selectedId}
        def={selectedDef}
        enabled={enabled[selectedId] ?? true}
        onToggleEnabled={val => setAutomationEnabled(selectedId, val)}
      />
    </div>
  )
}
