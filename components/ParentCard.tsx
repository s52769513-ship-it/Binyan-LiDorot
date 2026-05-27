'use client'

import { useEffect, useState } from 'react'
import { ParentDetail } from '@/lib/types'
import dynamic from 'next/dynamic'

const AddStudentModal       = dynamic(() => import('./AddStudentModal'),       { ssr: false })
const AddTransactionModal   = dynamic(() => import('./AddTransactionModal'),   { ssr: false })
const AddPlannedPaymentModal = dynamic(() => import('./AddPlannedPaymentModal'), { ssr: false })

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
  const [activeTab, setActiveTab] = useState<'details' | 'students' | 'finance'>('details')
  const [showAddStudent, setShowAddStudent]   = useState(false)
  const [showAddTx, setShowAddTx]             = useState(false)
  const [showAddPlanned, setShowAddPlanned]   = useState(false)

  const reload = () => {
    setLoading(true)
    fetch(`/api/parents/${parentId}`)
      .then(r => r.json())
      .then(data => { if (!data.error) setParent(data) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }

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

        {/* Tabs + quick action buttons */}
        <div className="flex items-center border-b border-gray-100 px-5 gap-1">
          {(['details', 'students', 'finance'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'details' ? 'פרטים' : tab === 'students' ? 'ילדים' : 'כספים'}
            </button>
          ))}
          <div className="flex-1" />
          <button onClick={() => setShowAddStudent(true)}
            className="px-3 py-1.5 text-xs rounded-lg bg-[#1a3a7a] text-white font-medium hover:bg-[#1a3a7a]/90 transition-colors">
            + ילד
          </button>
          <button onClick={() => setShowAddTx(true)}
            className="px-3 py-1.5 text-xs rounded-lg bg-emerald-700 text-white font-medium hover:bg-emerald-800 transition-colors">
            + תנועה
          </button>
          <button onClick={() => setShowAddPlanned(true)}
            className="px-3 py-1.5 text-xs rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-colors">
            + מתוכנן
          </button>
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
                  <TuitionCalculation
                    activeCount={parent.students.filter(s => s.status === 'פעיל').length}
                    totalCount={parent.childrenCount}
                    total={parent.tuitionTotal}
                  />
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
                      {s.className && (
                        <p className="text-sm text-gray-500">כיתה: {s.className}</p>
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
              <div className={`rounded-xl p-4 ${parent.tuitionBalance > 0 ? 'bg-red-50' : 'bg-emerald-50'}`}>
                <p className="text-sm text-gray-600 mb-1">{parent.tuitionBalance > 0 ? 'חוב' : 'זכות'} שכר לימוד</p>
                <p className={`text-3xl font-bold ${parent.tuitionBalance > 0 ? 'text-red-700' : 'text-emerald-700'}`}>
                  {formatCurrency(Math.abs(parent.tuitionBalance))}
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
        </div>
      </div>

      {/* Sub-modals */}
      {showAddStudent && (
        <AddStudentModal
          parentId={parentId}
          parentName={parent?.name}
          onClose={() => setShowAddStudent(false)}
          onSuccess={() => { setShowAddStudent(false); reload() }}
        />
      )}
      {showAddTx && (
        <AddTransactionModal
          parentId={parentId}
          parentName={parent?.name}
          onClose={() => setShowAddTx(false)}
          onSuccess={() => { setShowAddTx(false); reload() }}
        />
      )}
      {showAddPlanned && (
        <AddPlannedPaymentModal
          parentId={parentId}
          parentName={parent?.name}
          onClose={() => setShowAddPlanned(false)}
          onSuccess={() => { setShowAddPlanned(false); reload() }}
        />
      )}
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

function TuitionCalculation({ activeCount, totalCount, total }: { activeCount: number; totalCount: number; total: number }) {
  const calculated = calcTuition(activeCount)
  const ratePerChild = activeCount <= 3 ? 500 : 450

  return (
    <div className="bg-indigo-50 rounded-xl p-4 mb-3">
      <p className="text-xs text-indigo-600 font-semibold mb-2">חישוב שכר לימוד</p>
      <div className="space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="font-medium text-indigo-800">{formatCurrency(total)}</span>
          <span className="text-indigo-600">סה"כ לתשלום</span>
        </div>
        <div className="flex justify-between text-xs text-indigo-500">
          <span>{activeCount} ילדים פעילים × {ratePerChild}₪</span>
          <span>{activeCount <= 3 ? 'עד 3 ילדים' : 'מעל 3 ילדים'} = {ratePerChild}₪ לילד</span>
        </div>
        {totalCount !== activeCount && (
          <div className="flex justify-between text-xs text-indigo-400">
            <span>{totalCount} ילדים בסה"כ (כולל לא פעילים)</span>
          </div>
        )}
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
