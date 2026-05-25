'use client'

import { MonthlyStat } from '@/lib/types'

const MONTH_NAMES: Record<string, string> = {
  '01': 'ינו׳', '02': 'פבר׳', '03': 'מרץ', '04': 'אפר׳',
  '05': 'מאי', '06': 'יוני', '07': 'יולי', '08': 'אוג׳',
  '09': 'ספט׳', '10': 'אוק׳', '11': 'נוב׳', '12': 'דצמ׳',
}

function formatMonth(mmyyyy: string) {
  const [mm] = mmyyyy.split('/')
  return MONTH_NAMES[mm] || mmyyyy
}

function formatAmount(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(0)}K`
  return String(n)
}

export default function PaymentChart({ data }: { data: MonthlyStat[] }) {
  if (!data.length) return null

  const max = Math.max(...data.map(d => d.amount), 1)
  const chartH = 140
  const barW = 36
  const gap = 14
  const totalW = data.length * (barW + gap) - gap

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
      <h2 className="text-base font-semibold text-gray-800 mb-4">תנועות כספיות – 6 חודשים אחרונים</h2>
      <div className="overflow-x-auto">
        <svg
          width={totalW + 8}
          height={chartH + 48}
          className="overflow-visible"
          style={{ minWidth: '100%' }}
        >
          {data.map((d, i) => {
            const barH = max > 0 ? Math.round((d.amount / max) * chartH) : 0
            const x = i * (barW + gap)
            const y = chartH - barH

            return (
              <g key={d.month}>
                {/* Bar */}
                <rect
                  x={x}
                  y={y}
                  width={barW}
                  height={barH}
                  rx={4}
                  className="fill-indigo-500"
                  opacity={i === data.length - 1 ? 1 : 0.65}
                />
                {/* Amount label above bar */}
                {d.amount > 0 && (
                  <text
                    x={x + barW / 2}
                    y={y - 4}
                    textAnchor="middle"
                    className="text-xs fill-gray-600"
                    fontSize={10}
                  >
                    {formatAmount(d.amount)}
                  </text>
                )}
                {/* Month label below */}
                <text
                  x={x + barW / 2}
                  y={chartH + 18}
                  textAnchor="middle"
                  className="fill-gray-500"
                  fontSize={11}
                >
                  {formatMonth(d.month)}
                </text>
              </g>
            )
          })}

          {/* Baseline */}
          <line
            x1={0}
            y1={chartH}
            x2={totalW}
            y2={chartH}
            stroke="#e5e7eb"
            strokeWidth={1}
          />
        </svg>
      </div>
    </div>
  )
}
