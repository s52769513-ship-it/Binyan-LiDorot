'use client'

import { useEffect, useState } from 'react'
import { ParentDetail } from '@/lib/types'

function formatCurrency(n: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n)
}

function formatDate(d: string) {
  if (!d) return '—'
  return new Intl.DateTimeFormat('he-IL').format(new Date(d))
}

function calcTuition(childrenCount: number) {
  if (childrenCount <= 0) return 0
  return childrenCount <= 3 ? childrenCount * 500 : childrenCount * 450
}

interface Props {
  parentId: string
  onClose: () => void
}

export default function ParentCard({ parentId, onClose }: Props) {
  const [parent, setParent] = useState<ParentDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'details' | 'students' | 'finance' | 'salary'>('details')

  useEffect(() => {
    setLoading(true)
    setError('')
    fetch(`/api/parents/${parentId}`)
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setParent(data)
      })
      .catch(() => setError('שגיאה בטעינת הנתונים'))
      .finally(() => setLoading(false))
  }, [parentId])

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-gray-100">
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-gray-500 transition-colors"
            aria-label="סגור"
          >
            ✕
          </button>
          <div className="text-right">
            {loading ? (
              <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
            ) : (
              <h2 className="text-xl font-bold text-gray-900">{parent?.name || '—'}</h2>
            )}
            {parent?.city && (
              <p className="text-sm text-gray-500">{parent.city}</p>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-100 px-5 overflow-x-auto">
          {(['details', 'students', 'finance', 'salary'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'details' ? 'פרטים אישיים' : tab === 'students' ? 'ילדים' : tab === 'finance' ? 'מצב כספי' : '💼 משכורת'}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5">
          {loading && (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />
              ))}
            </div>
          )}

          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
          )}

          {parent && activeTab === 'details' && (
            <div className="space-y-4">
              <Section title="פרטי קשר">
                <Row label="אבא" value={parent.firstName} />
                <Row label="אמא" value={parent.motherName} />
                <Row label="משפחה" value={parent.lastName} />
                <Row label="נייד אבא" value={parent.fatherPhone} isPhone />
                <Row label="נייד אמא" value={parent.motherPhone} isPhone />
                <Row label="מייל" value={parent.email} />
              </Section>
              <Section title="כתובת">
                <Row label="רחוב" value={parent.address} />
                <Row label="בניין/דירה" value={parent.building} />
                <Row label="עיר" value={parent.city} />
              </Section>
              {parent.status.length > 0 && (
                <Section title="סטטוס">
                  <div className="flex flex-wrap gap-2">
                    {parent.status.map(s => (
                      <span key={s} className="px-3 py-1 bg-indigo-50 text-indigo-700 rounded-full text-xs font-medium">
                        {s}
                      </span>
                    ))}
                  </div>
                </Section>
              )}
              {parent.notes && (
                <Section title="הערות">
                  <p className="text-sm text-gray-700 whitespace-pre-line">{parent.notes}</p>
                </Section>
              )}
            </div>
          )}

          {parent && activeTab === 'students' && (
            <div className="space-y-3">
              {parent.students.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-8">אין ילדים רשומים</p>
              ) : (
                <>
                  <TuitionCalculation count={parent.childrenCount} total={parent.tuitionTotal} />
                  {parent.students.map(s => (
                    <div key={s.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          {s.status && (
                            <StatusBadge status={s.status} />
                          )}
                          <span className="text-xs text-gray-500">
                            {s.gender === 'זכר' ? '👦' : s.gender === 'נקבה' ? '👧' : '🧒'}
                            {s.age ? ` גיל ${s.age}` : ''}
                          </span>
                        </div>
                        <p className="font-semibold text-gray-800">{s.name}</p>
                      </div>
                      {(s.classDepartment || s.className) && (
                        <p className="text-sm text-gray-500">
                          {s.classDepartment || `כיתה: ${s.className}`}
                        </p>
                      )}
                      {s.transportation.length > 0 && (
                        <div className="mt-2 pt-2 border-t border-gray-100">
                          <p className="text-xs text-gray-500">
                            🚌 הסעות: {s.transportation.join(', ')}
                            {s.transportationCost > 0 && (
                              <span className="mr-2 font-medium text-gray-700">
                                ({formatCurrency(s.transportationCost)})
                              </span>
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {parent && activeTab === 'finance' && (
            <div className="space-y-5">
              {/* Balance summary */}
              <div className={`rounded-xl p-4 ${parent.tuitionBalance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                <p className="text-sm text-gray-600 mb-1">חוב / זכות שכר לימוד</p>
                <p className={`text-3xl font-bold ${parent.tuitionBalance >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
                  {formatCurrency(parent.tuitionBalance)}
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  שכ"ל לתשלום: {formatCurrency(parent.tuitionTotal)}
                </p>
              </div>

              {/* Debts */}
              {parent.debts.length > 0 && (
                <Section title={`חובות פתוחים (${parent.debts.length})`}>
                  {parent.debts.map(d => (
                    <div key={d.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm text-red-600 font-semibold">{formatCurrency(d.amount)}</span>
                      <span className="text-xs text-gray-400">{formatDate(d.createdTime)}</span>
                    </div>
                  ))}
                  <div className="mt-2 pt-2 text-left">
                    <span className="text-sm font-bold text-red-700">
                      סה"כ: {formatCurrency(parent.debts.reduce((s, d) => s + d.amount, 0))}
                    </span>
                  </div>
                </Section>
              )}

              {/* Planned payments */}
              {parent.plannedPayments.length > 0 && (
                <Section title={`תשלומים מתוכננים (${parent.plannedPayments.length})`}>
                  {parent.plannedPayments.slice(0, 6).map(pp => (
                    <div key={pp.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className={`text-sm font-medium ${pp.balance > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                        יתרה: {formatCurrency(pp.balance)}
                      </span>
                      <div className="text-right">
                        <p className="text-sm text-gray-700">{pp.monthYear}</p>
                        <p className="text-xs text-gray-400">{formatCurrency(pp.amount)} מתוכנן</p>
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* Transactions */}
              {parent.transactions.length > 0 && (
                <Section title={`תנועות אחרונות (${parent.transactions.length})`}>
                  {parent.transactions.slice(0, 10).map(tx => (
                    <div key={tx.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                      <span className="text-sm font-semibold text-emerald-700">
                        {formatCurrency(tx.amount)}
                      </span>
                      <div className="text-right">
                        <p className="text-sm text-gray-700">{tx.type || '—'}</p>
                        <p className="text-xs text-gray-400">{formatDate(tx.date)}</p>
                      </div>
                    </div>
                  ))}
                </Section>
              )}
            </div>
          )}

          {parent && activeTab === 'salary' && (
            <div className="space-y-4" dir="rtl">
              {parent.salaryGross > 0 || parent.baseHourlyRate > 0 ? (
                <>
                  {/* Salary summary */}
                  <div className={`rounded-xl p-4 ${parent.deductTuition ? 'bg-blue-50' : 'bg-indigo-50'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-2xl font-bold text-indigo-800">{formatCurrency(parent.salaryGross)}</span>
                      <span className="text-sm text-gray-600">סה"כ ברוטו</span>
                    </div>
                    {parent.deductTuition && (
                      <div className="border-t border-indigo-200 pt-2 mt-2">
                        <div className="flex justify-between text-sm">
                          <span className="text-red-600 font-medium">
                            − {formatCurrency(parent.tuitionBalance > 0 ? parent.tuitionBalance : 0)} קיזוז שכ"ל
                          </span>
                          <span className="text-gray-500">ניכוי שכר לימוד</span>
                        </div>
                        <div className="flex justify-between items-center mt-1">
                          <span className="text-xl font-bold text-emerald-700">{formatCurrency(parent.salaryNet)}</span>
                          <span className="text-sm text-gray-600 font-medium">סה"כ לתשלום</span>
                        </div>
                      </div>
                    )}
                    {!parent.deductTuition && (
                      <p className="text-xs text-gray-500">ללא קיזוז שכר לימוד</p>
                    )}
                  </div>

                  {/* Breakdown */}
                  <Section title="פירוט שכר">
                    {parent.baseHourlyRate > 0 && (
                      <Row
                        label="שכר בסיס לשעה"
                        value={`${formatCurrency(parent.baseHourlyRate)} × ${parent.monthlyHoursDecimal} שעות`}
                      />
                    )}
                    {parent.seniorityBonusHourly > 0 && (
                      <Row
                        label="תוספת ותק לשעה"
                        value={`${formatCurrency(parent.seniorityBonusHourly)} × ${parent.monthlyHoursDecimal} שעות`}
                      />
                    )}
                    {parent.fixedBonus > 0 && (
                      <Row label="תוספת קבועה" value={formatCurrency(parent.fixedBonus)} />
                    )}
                    {parent.transportReimbursement > 0 && (
                      <Row label="תשלום הסעות" value={formatCurrency(parent.transportReimbursement)} />
                    )}
                    {parent.exceptionalExpenses > 0 && (
                      <Row label="הוצאות חריגות" value={`− ${formatCurrency(parent.exceptionalExpenses)}`} />
                    )}
                  </Section>
                </>
              ) : (
                <div className="text-center py-8 text-gray-400 text-sm">אין נתוני משכורת</div>
              )}

              {/* Wife salary section */}
              {parent.women && parent.women.length > 0 && (
                <Section title="משכורת אשה">
                  {parent.women.map(w => (
                    <div key={w.id} className="border border-gray-200 rounded-xl p-3 mb-2">
                      <div className="flex justify-between items-center">
                        <span className="font-semibold text-indigo-700">{formatCurrency(w.salaryGross)}</span>
                        <div className="text-right">
                          <p className="font-medium text-gray-800">{w.name}</p>
                          {w.status && <p className="text-xs text-gray-400">{w.status}</p>}
                        </div>
                      </div>
                      {w.baseHourlyRate > 0 && (
                        <p className="text-xs text-gray-500 mt-1">
                          {formatCurrency(w.baseHourlyRate)}/שעה × {w.monthlyHoursDecimal} שעות
                          {w.fixedBonus > 0 ? ` + ${formatCurrency(w.fixedBonus)} קבועה` : ''}
                        </p>
                      )}
                      {w.role.length > 0 && (
                        <div className="flex gap-1 mt-1 justify-end flex-wrap">
                          {w.role.map(r => (
                            <span key={r} className="text-xs px-2 py-0.5 bg-purple-50 text-purple-700 rounded-full">{r}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                  {parent.showSpouseSalary && parent.women.length > 0 && (
                    <div className="border-t border-gray-200 pt-2 mt-1">
                      <div className="flex justify-between font-semibold text-sm">
                        <span className="text-indigo-800">
                          {formatCurrency(parent.salaryGross + parent.women.reduce((s, w) => s + w.salaryGross, 0))}
                        </span>
                        <span className="text-gray-600">סה"כ משפחתי</span>
                      </div>
                    </div>
                  )}
                </Section>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">{title}</h3>
      <div className="bg-gray-50 rounded-xl p-4 space-y-2">
        {children}
      </div>
    </div>
  )
}

function Row({ label, value, isPhone }: { label: string; value: string; isPhone?: boolean }) {
  if (!value) return null
  return (
    <div className="flex justify-between items-center text-sm">
      {isPhone ? (
        <a href={`tel:${value}`} className="text-indigo-600 hover:underline" dir="ltr">{value}</a>
      ) : (
        <span className="text-gray-800">{value}</span>
      )}
      <span className="text-gray-400">{label}</span>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    'פעיל': 'bg-emerald-100 text-emerald-700',
    'לא פעיל': 'bg-gray-100 text-gray-600',
    'ממתין': 'bg-amber-100 text-amber-700',
  }
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] || 'bg-blue-50 text-blue-700'}`}>
      {status}
    </span>
  )
}

function TuitionCalculation({ count, total }: { count: number; total: number }) {
  const calculated = calcTuition(count)
  const ratePerChild = count <= 3 ? 500 : 450

  return (
    <div className="bg-indigo-50 rounded-xl p-4 mb-3">
      <p className="text-xs text-indigo-600 font-semibold mb-2">חישוב שכר לימוד</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="font-medium text-indigo-800">{formatCurrency(total)}</span>
          <span className="text-indigo-600">סה"כ לתשלום</span>
        </div>
        <div className="flex justify-between text-xs text-indigo-500">
          <span>{count} ילדים × {ratePerChild}₪</span>
          <span>{count <= 3 ? 'עד 3 ילדים' : 'מעל 3 ילדים'} = {ratePerChild}₪ לילד</span>
        </div>
        {total !== calculated && (
          <div className="flex justify-between text-xs text-indigo-400">
            <span>{formatCurrency(calculated)}</span>
            <span>חישוב צפוי</span>
          </div>
        )}
      </div>
    </div>
  )
}
