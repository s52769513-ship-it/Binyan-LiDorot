'use client'

import { useEffect, useState } from 'react'

interface Woman {
  id: string
  name: string
  salaryGross: number
  status: string
  role: string[]
}

interface Employee {
  id: string
  name: string
  firstName: string
  lastName: string
  baseHourlyRate: number
  seniorityBonusHourly: number
  monthlyHoursDecimal: number
  fixedBonus: number
  transportReimbursement: number
  exceptionalExpenses: number
  deductTuition: boolean
  showSpouseSalary: boolean
  salaryGross: number
  salaryNet: number
  familySalary: number
  tuitionDeduction: number
  netAfterTuition: number
  wifeSalary: number
  women: Woman[]
}

function fmt(n: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency', currency: 'ILS', maximumFractionDigits: 0,
  }).format(n)
}

export default function SalariesPage() {
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showDetails, setShowDetails] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/salaries')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setEmployees(data) })
      .finally(() => setLoading(false))
  }, [])

  const filtered = employees.filter(e =>
    !search || e.name.includes(search) || e.firstName.includes(search) || e.lastName.includes(search)
  )

  const totalGross  = filtered.reduce((s, e) => s + (e.showSpouseSalary ? e.familySalary : e.salaryGross), 0)
  const totalDeduct = filtered.reduce((s, e) => s + e.tuitionDeduction, 0)
  const totalNet    = filtered.reduce((s, e) => s + e.netAfterTuition, 0)

  return (
    <div dir="rtl">
      {/* Page header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">💼 משכורות</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {loading ? '...' : `${filtered.length} עובדים`}
          </p>
        </div>
        <input
          type="text"
          placeholder="חיפוש שם..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          dir="rtl"
        />
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1,2,3,4,5].map(i => (
            <div key={i} className="h-14 bg-gray-100 rounded-xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-indigo-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">סה"כ ברוטו</p>
              <p className="text-xl font-bold text-indigo-800">{fmt(totalGross)}</p>
            </div>
            <div className="bg-red-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">קיזוז שכ"ל</p>
              <p className="text-xl font-bold text-red-700">− {fmt(totalDeduct)}</p>
            </div>
            <div className="bg-emerald-50 rounded-xl p-4 text-center">
              <p className="text-xs text-gray-500 mb-1">סה"כ לתשלום</p>
              <p className="text-xl font-bold text-emerald-700">{fmt(totalNet)}</p>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl shadow-sm overflow-hidden border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-xs">
                  <th className="px-4 py-3 text-right font-semibold">שם</th>
                  <th className="px-4 py-3 text-center font-semibold">שעות</th>
                  <th className="px-4 py-3 text-center font-semibold">ברוטו</th>
                  <th className="px-4 py-3 text-center font-semibold">קיזוז שכ"ל</th>
                  <th className="px-4 py-3 text-center font-semibold">נטו לתשלום</th>
                  <th className="px-4 py-3 text-center font-semibold">אשה</th>
                  <th className="px-2 py-3" />
                </tr>
              </thead>
              <tbody>
                {filtered.map(emp => {
                  const isOpen = showDetails === emp.id
                  const displayGross = emp.showSpouseSalary ? emp.familySalary : emp.salaryGross
                  return (
                    <>
                      <tr
                        key={emp.id}
                        onClick={() => setShowDetails(isOpen ? null : emp.id)}
                        className={`border-b border-gray-100 cursor-pointer transition-colors ${
                          isOpen ? 'bg-indigo-50' : 'hover:bg-gray-50/60'
                        }`}
                      >
                        <td className="px-4 py-3 font-medium text-gray-800">{emp.name}</td>
                        <td className="px-4 py-3 text-center text-gray-500 tabular-nums">
                          {emp.monthlyHoursDecimal > 0 ? emp.monthlyHoursDecimal : '—'}
                        </td>
                        <td className="px-4 py-3 text-center font-semibold text-indigo-700 tabular-nums">
                          {displayGross > 0 ? fmt(displayGross) : '—'}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">
                          {emp.tuitionDeduction > 0
                            ? <span className="text-red-600 font-medium">− {fmt(emp.tuitionDeduction)}</span>
                            : <span className="text-gray-300">—</span>
                          }
                        </td>
                        <td className="px-4 py-3 text-center font-bold tabular-nums">
                          <span className={emp.netAfterTuition > 0 ? 'text-emerald-700' : 'text-gray-500'}>
                            {emp.netAfterTuition > 0 ? fmt(emp.netAfterTuition) : '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {emp.women.length > 0 ? (
                            <div className="flex flex-col items-center gap-0.5">
                              {emp.women.map(w => (
                                <div key={w.id} className="text-xs text-purple-700 font-medium">
                                  {w.name}
                                  {w.salaryGross > 0 && (
                                    <span className="text-gray-400 font-normal mr-1">({fmt(w.salaryGross)})</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="text-gray-300 text-xs">—</span>
                          )}
                        </td>
                        <td className="px-2 py-3 text-gray-400 text-xs">{isOpen ? '▲' : '▼'}</td>
                      </tr>

                      {/* Expanded details row */}
                      {isOpen && (
                        <tr key={`${emp.id}-detail`} className="bg-indigo-50/50">
                          <td colSpan={7} className="px-6 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                              {emp.baseHourlyRate > 0 && (
                                <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
                                  <p className="text-gray-400">שכר בסיס לשעה</p>
                                  <p className="font-semibold text-gray-800 mt-0.5">{fmt(emp.baseHourlyRate)}</p>
                                </div>
                              )}
                              {emp.seniorityBonusHourly > 0 && (
                                <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
                                  <p className="text-gray-400">תוספת ותק לשעה</p>
                                  <p className="font-semibold text-gray-800 mt-0.5">{fmt(emp.seniorityBonusHourly)}</p>
                                </div>
                              )}
                              {emp.monthlyHoursDecimal > 0 && (
                                <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
                                  <p className="text-gray-400">שעות חודשיות</p>
                                  <p className="font-semibold text-gray-800 mt-0.5">{emp.monthlyHoursDecimal} שעות</p>
                                </div>
                              )}
                              {emp.fixedBonus > 0 && (
                                <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
                                  <p className="text-gray-400">תוספת קבועה</p>
                                  <p className="font-semibold text-gray-800 mt-0.5">{fmt(emp.fixedBonus)}</p>
                                </div>
                              )}
                              {emp.transportReimbursement > 0 && (
                                <div className="bg-white rounded-lg p-2.5 border border-indigo-100">
                                  <p className="text-gray-400">תשלום הסעות</p>
                                  <p className="font-semibold text-gray-800 mt-0.5">{fmt(emp.transportReimbursement)}</p>
                                </div>
                              )}
                              {emp.exceptionalExpenses > 0 && (
                                <div className="bg-white rounded-lg p-2.5 border border-red-100">
                                  <p className="text-gray-400">הוצאות חריגות</p>
                                  <p className="font-semibold text-red-600 mt-0.5">− {fmt(emp.exceptionalExpenses)}</p>
                                </div>
                              )}
                              {emp.deductTuition && (
                                <div className="bg-white rounded-lg p-2.5 border border-amber-100">
                                  <p className="text-gray-400">קיזוז שכ"ל</p>
                                  <p className="font-semibold text-amber-700 mt-0.5">✓ מופחת</p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  )
                })}
              </tbody>

              {/* Totals footer */}
              {filtered.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-50 border-t-2 border-gray-200 font-bold text-sm">
                    <td className="px-4 py-3 text-gray-700">סה"כ ({filtered.length})</td>
                    <td />
                    <td className="px-4 py-3 text-center text-indigo-700 tabular-nums">{fmt(totalGross)}</td>
                    <td className="px-4 py-3 text-center text-red-600 tabular-nums">
                      {totalDeduct > 0 ? `− ${fmt(totalDeduct)}` : '—'}
                    </td>
                    <td className="px-4 py-3 text-center text-emerald-700 tabular-nums">{fmt(totalNet)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              )}
            </table>

            {filtered.length === 0 && !loading && (
              <div className="text-center py-12 text-gray-400">
                <p className="text-4xl mb-3">💼</p>
                <p>{search ? 'לא נמצאו תוצאות' : 'אין נתוני משכורות — הרץ סינק מאיירטייבל'}</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
