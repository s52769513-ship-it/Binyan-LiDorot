'use client'

import { DashboardSummary } from '@/lib/types'

function formatCurrency(n: number) {
  return new Intl.NumberFormat('he-IL', {
    style: 'currency',
    currency: 'ILS',
    maximumFractionDigits: 0,
  }).format(n)
}

interface CardProps {
  title: string
  value: number
  icon: string
  colorClass: string
  bgClass: string
  subtitle?: string
}

function SummaryCard({ title, value, icon, colorClass, bgClass, subtitle }: CardProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 flex items-center gap-4">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${bgClass}`}>
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm text-gray-500 mb-0.5">{title}</p>
        <p className={`text-2xl font-bold ${colorClass} tabular-nums`}>
          {formatCurrency(value)}
        </p>
        {subtitle && <p className="text-xs text-gray-400 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  )
}

export default function FinancialSummary({ summary }: { summary: DashboardSummary }) {
  const currentMonthName = new Intl.DateTimeFormat('he-IL', { month: 'long' }).format(new Date())

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <SummaryCard
        title="סה״כ חובות פתוחים"
        value={summary.totalDebts}
        icon="📋"
        colorClass="text-red-600"
        bgClass="bg-red-50"
      />
      <SummaryCard
        title="תשלומים מתוכננים (יתרה)"
        value={summary.totalPlannedPayments}
        icon="📅"
        colorClass="text-amber-600"
        bgClass="bg-amber-50"
      />
      <SummaryCard
        title={`תנועות ${currentMonthName}`}
        value={summary.currentMonthTransactions}
        icon="💰"
        colorClass="text-emerald-600"
        bgClass="bg-emerald-50"
        subtitle="סה״כ תנועות החודש"
      />
    </div>
  )
}
