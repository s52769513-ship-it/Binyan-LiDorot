'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useState } from 'react'

const EmployeeCard        = dynamic(() => import('@/components/EmployeeCard'),        { ssr: false })
const DonationImportModal = dynamic(() => import('@/components/DonationImportModal'), { ssr: false })

/* ─── helpers ─────────────────────────────────────────── */
const HM: Record<string, string> = {
  '01':'ינואר','02':'פברואר','03':'מרץ','04':'אפריל','05':'מאי','06':'יוני',
  '07':'יולי','08':'אוגוסט','09':'ספטמבר','10':'אוקטובר','11':'נובמבר','12':'דצמבר',
}
const fmtMY = (my: string) => { const [m, y] = my.split('/'); return `${HM[m] || m} ${y}` }
const myToInp = (my: string) => { const [m, y] = my.split('/'); return `${y}-${m}` }
const inpToMY = (v: string) => { const [y, m] = v.split('-'); return `${m}/${y}` }
const fmt = (n: number) =>
  new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(n)

function currentMY() {
  const d = new Date()
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

/* ─── types ─────────────────────────────────────────────── */
interface DonorRow {
  id:              string
  name:            string
  firstName:       string
  lastName:        string
  monthlyDonation: number
  paymentMethod:   string
  soStatus:        string
  ppThisMonth:     { id: string; amount: number; balance: number } | null
}
interface Summary {
  total:        number
  totalMonthly: number
  totalPaid:    number
  totalPartial: number
  totalUnpaid:  number
  month:        string
}
interface PlannedPP {
  id:         string
  name:       string
  amount:     number
  balance:    number
  date:       string
  monthYear:  string
  parentIds:  string[]
  parentName: string
}
interface DonationPayment {
  id:           string
  amount:       number
  type:         string
  date:         string
  monthYear:    string
  notes:        string
  parentIds:    string[]
  parentName:   string
  projectNames: string[]
}

type Tab = 'definitions' | 'planned' | 'executed'

const fmtDate = (d: string) => {
  if (!d) return '—'
  const [y, m, day] = d.split('-')
  return day ? `${day}/${m}/${y.slice(2)}` : d
}

/* ─── Summary cards ──────────────────────────────────── */
function SummaryCard({ label, value, sub, color }: { label: string; value: string; sub?: string; color: string }) {
  return (
    <div className={`rounded-2xl border p-5 ${color}`}>
      <p className="text-sm font-medium text-gray-600">{label}</p>
      <p className="text-3xl font-bold text-gray-900 mt-1 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-1">{sub}</p>}
    </div>
  )
}

/* ─── status badge ─────────────────────────────────── */
function StatusBadge({ donor }: { donor: DonorRow }) {
  const pp = donor.ppThisMonth
  if (!pp) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-gray-100 text-gray-500">ללא PP</span>
  if (pp.balance <= 0) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-emerald-100 text-emerald-700">שולם ✓</span>
  if (pp.balance < pp.amount) return <span className="px-2 py-0.5 rounded-full text-[10px] bg-amber-100 text-amber-700">חלקי</span>
  return <span className="px-2 py-0.5 rounded-full text-[10px] bg-red-50 text-red-600">לא שולם</span>
}

/* ─── Main page ──────────────────────────────────────── */
export default function DonationsPage() {
  const [tab, setTab]               = useState<Tab>('definitions')
  const [month, setMonth]           = useState(currentMY())
  const [donors, setDonors]         = useState<DonorRow[]>([])
  const [summary, setSummary]       = useState<Summary | null>(null)
  const [planned, setPlanned]       = useState<PlannedPP[]>([])
  const [executed, setExecuted]     = useState<DonationPayment[]>([])
  const [loading, setLoading]       = useState(true)
  const [search, setSearch]         = useState('')
  const [filterMethod, setFilterMethod] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [selectedParent, setSelectedParent] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [linking, setLinking]       = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (tab === 'definitions') {
        const r = await fetch(`/api/donations?month=${encodeURIComponent(month)}`)
        const d = await r.json()
        setDonors(d.donors ?? [])
        setSummary(d.summary ?? null)
      } else if (tab === 'planned') {
        const r = await fetch(`/api/planned-payments?ppType=donation&monthYear=${encodeURIComponent(month)}&withParentNames=true`)
        const d = await r.json()
        setPlanned(Array.isArray(d) ? d : [])
      } else {
        const r = await fetch(`/api/donations/payments?month=${encodeURIComponent(month)}`)
        const d = await r.json()
        setExecuted(d.payments ?? [])
      }
    } catch {} finally { setLoading(false) }
  }, [month, tab])

  useEffect(() => { load() }, [load])

  const linkPayments = async () => {
    if (linking) return
    setLinking(true)
    try {
      const r = await fetch('/api/admin/link-donation-payments', { method: 'POST' })
      const d = await r.json()
      if (d.error) alert('שגיאה בקישור: ' + d.error)
      else alert(`קושרו ${d.linked} תנועות, עודכנו ${d.ppsUpdated} תשלומים מתוכננים`)
      await load()
    } catch {
      alert('שגיאה בקישור התשלומים')
    } finally {
      setLinking(false)
    }
  }

  const filtered = donors.filter(d => {
    if (search && !d.name.includes(search) && !d.lastName.includes(search)) return false
    if (filterMethod && d.paymentMethod !== filterMethod) return false
    if (filterStatus === 'paid'    && !(d.ppThisMonth && d.ppThisMonth.balance <= 0)) return false
    if (filterStatus === 'partial' && !(d.ppThisMonth && d.ppThisMonth.balance > 0 && d.ppThisMonth.balance < d.monthlyDonation)) return false
    if (filterStatus === 'unpaid'  && !(d.ppThisMonth && d.ppThisMonth.balance >= d.monthlyDonation)) return false
    if (filterStatus === 'no_pp'   && d.ppThisMonth) return false
    return true
  })

  const methods = [...new Set(donors.map(d => d.paymentMethod).filter(Boolean))]

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-6 pb-12">

      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💚 דמי מגבית</h1>
          <p className="text-sm text-gray-500 mt-0.5">ניהול תרומות חודשיות</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="month"
            value={myToInp(month)}
            onChange={e => setMonth(inpToMY(e.target.value))}
            className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
            dir="ltr"
          />
          <span className="text-sm font-medium text-emerald-700">{fmtMY(month)}</span>
          <button
            onClick={linkPayments}
            disabled={linking}
            className="px-4 py-2 rounded-xl text-sm font-semibold border border-emerald-600 text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50"
          >
            {linking ? 'מקשר...' : '🔗 קשר תשלומים'}
          </button>
          {tab === 'definitions' && (
            <button
              onClick={() => setShowImport(true)}
              className="px-4 py-2 rounded-xl text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              ⬆ ייבוא CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex gap-1 border-b border-gray-200">
        {([
          ['definitions', 'הגדרה'],
          ['planned',     'תשלומים מתוכננים'],
          ['executed',    'תשלומים שבוצעו'],
        ] as [Tab, string][]).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 text-sm font-semibold -mb-px border-b-2 transition-colors ${
              tab === key
                ? 'border-emerald-600 text-emerald-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Summary cards ── */}
      {tab === 'definitions' && summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <SummaryCard
            label="תורמים פעילים"
            value={String(summary.total)}
            color="bg-white border-gray-200"
          />
          <SummaryCard
            label="סה&quot;כ חודשי מתחייב"
            value={fmt(summary.totalMonthly)}
            color="bg-emerald-50 border-emerald-200"
          />
          <SummaryCard
            label="שילמו החודש"
            value={String(summary.totalPaid)}
            sub={`מתוך ${summary.total} תורמים`}
            color="bg-blue-50 border-blue-200"
          />
          <SummaryCard
            label="ממתינים לתשלום"
            value={String(summary.totalUnpaid + summary.totalPartial)}
            color="bg-amber-50 border-amber-200"
          />
        </div>
      )}

      {/* ── Filters (definitions) ── */}
      {tab === 'definitions' && (
      <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap gap-3 items-center">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="חפש שם..."
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 w-48"
        />
        <select
          value={filterMethod}
          onChange={e => setFilterMethod(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
        >
          <option value="">כל שיטות תשלום</option>
          {methods.map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        <select
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
          className="px-3 py-2 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-300 bg-white"
        >
          <option value="">כל הסטטוסים</option>
          <option value="paid">שולם</option>
          <option value="partial">חלקי</option>
          <option value="unpaid">לא שולם</option>
          <option value="no_pp">ללא PP</option>
        </select>
        {(search || filterMethod || filterStatus) && (
          <button
            onClick={() => { setSearch(''); setFilterMethod(''); setFilterStatus('') }}
            className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded-lg border border-gray-200 hover:bg-gray-50"
          >
            נקה מסננים
          </button>
        )}
        <span className="text-xs text-gray-400 mr-auto">{filtered.length} תורמים</span>
      </div>
      )}

      {/* ── Table (definitions) ── */}
      {tab === 'definitions' && (
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse"/>)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <p className="text-4xl mb-3">💚</p>
            <p className="font-medium">אין תורמים</p>
            <p className="text-sm mt-1">ייבא CSV כדי להוסיף תורמים</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b sticky top-0">
              <tr className="text-right text-xs text-gray-500">
                <th className="px-4 py-3">שם</th>
                <th className="px-4 py-3 text-left">התחייבות</th>
                <th className="px-4 py-3 text-left">שולם</th>
                <th className="px-4 py-3 text-left">יתרה</th>
                <th className="px-4 py-3">שיטה</th>
                <th className="px-4 py-3 text-center">סטטוס</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(donor => (
                <tr
                  key={donor.id}
                  onClick={() => setSelectedParent(donor.id)}
                  className="hover:bg-emerald-50/50 cursor-pointer transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{donor.name}</td>
                  <td className="px-4 py-3 text-left tabular-nums text-emerald-700 font-semibold">
                    {fmt(donor.monthlyDonation)}
                  </td>
                  <td className="px-4 py-3 text-left tabular-nums text-gray-500">
                    {donor.ppThisMonth
                      ? fmt(donor.ppThisMonth.amount - donor.ppThisMonth.balance)
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-left tabular-nums text-gray-500">
                    {donor.ppThisMonth ? fmt(donor.ppThisMonth.balance) : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{donor.paymentMethod}</td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge donor={donor} />
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-gray-50 border-t">
              <tr className="text-xs font-semibold text-gray-600">
                <td className="px-4 py-3">סה&quot;כ ({filtered.length})</td>
                <td className="px-4 py-3 text-left tabular-nums text-emerald-700">
                  {fmt(filtered.reduce((s, d) => s + d.monthlyDonation, 0))}
                </td>
                <td className="px-4 py-3 text-left tabular-nums">
                  {fmt(filtered.reduce((s, d) => s + (d.ppThisMonth ? d.ppThisMonth.amount - d.ppThisMonth.balance : 0), 0))}
                </td>
                <td className="px-4 py-3 text-left tabular-nums">
                  {fmt(filtered.reduce((s, d) => s + (d.ppThisMonth?.balance ?? 0), 0))}
                </td>
                <td colSpan={2} />
              </tr>
            </tfoot>
          </table>
        )}
      </div>
      )}

      {/* ── Planned payments tab ── */}
      {tab === 'planned' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse"/>)}
            </div>
          ) : planned.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-4xl mb-3">📅</p>
              <p className="font-medium">אין תשלומים מתוכננים לחודש זה</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr className="text-right text-xs text-gray-500">
                  <th className="px-4 py-3">תורם</th>
                  <th className="px-4 py-3">תיאור</th>
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3 text-left">סכום</th>
                  <th className="px-4 py-3 text-left">יתרה</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {planned.map(pp => (
                  <tr
                    key={pp.id}
                    onClick={() => pp.parentIds[0] && setSelectedParent(pp.parentIds[0])}
                    className="hover:bg-emerald-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{pp.parentName || '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{pp.name}</td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{fmtDate(pp.date)}</td>
                    <td className="px-4 py-3 text-left tabular-nums text-emerald-700 font-semibold">{fmt(pp.amount)}</td>
                    <td className="px-4 py-3 text-left tabular-nums text-gray-500">{fmt(pp.balance)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr className="text-xs font-semibold text-gray-600">
                  <td className="px-4 py-3" colSpan={3}>סה&quot;כ ({planned.length})</td>
                  <td className="px-4 py-3 text-left tabular-nums text-emerald-700">
                    {fmt(planned.reduce((s, p) => s + p.amount, 0))}
                  </td>
                  <td className="px-4 py-3 text-left tabular-nums">
                    {fmt(planned.reduce((s, p) => s + p.balance, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── Executed payments tab ── */}
      {tab === 'executed' && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
          {loading ? (
            <div className="p-8 space-y-3">
              {[1,2,3,4,5].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse"/>)}
            </div>
          ) : executed.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <p className="text-4xl mb-3">✅</p>
              <p className="font-medium">אין תשלומים שבוצעו לחודש זה</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b sticky top-0">
                <tr className="text-right text-xs text-gray-500">
                  <th className="px-4 py-3">תורם</th>
                  <th className="px-4 py-3">תאריך</th>
                  <th className="px-4 py-3">אמצעי</th>
                  <th className="px-4 py-3 text-left">סכום</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {executed.map(p => (
                  <tr
                    key={p.id}
                    onClick={() => p.parentIds[0] && setSelectedParent(p.parentIds[0])}
                    className="hover:bg-emerald-50/50 cursor-pointer transition-colors"
                  >
                    <td className="px-4 py-3 font-medium text-gray-800">{p.parentName || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 tabular-nums">{fmtDate(p.date)}</td>
                    <td className="px-4 py-3 text-gray-600">{p.type || '—'}</td>
                    <td className="px-4 py-3 text-left tabular-nums text-emerald-700 font-semibold">{fmt(p.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 border-t">
                <tr className="text-xs font-semibold text-gray-600">
                  <td className="px-4 py-3" colSpan={3}>סה&quot;כ ({executed.length})</td>
                  <td className="px-4 py-3 text-left tabular-nums text-emerald-700">
                    {fmt(executed.reduce((s, p) => s + p.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}

      {/* ── Parent card modal ── */}
      {selectedParent && (
        <EmployeeCard
          parentId={selectedParent}
          onClose={() => setSelectedParent(null)}
        />
      )}

      {/* ── Import modal ── */}
      {showImport && (
        <DonationImportModal
          onClose={() => setShowImport(false)}
          onSuccess={() => { setShowImport(false); load() }}
        />
      )}
    </div>
  )
}
