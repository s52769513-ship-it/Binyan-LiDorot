'use client'

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

interface BarData {
  month: string
  remaining: number
  total: number
}

interface Props {
  data: BarData[]
  selectedMonth?: string
  onBarClick?: (month: string) => void
}

export default function PaymentChart({ data, selectedMonth, onBarClick }: Props) {
  if (!data.length) return null

  const max = Math.max(...data.map(d => d.remaining), 1)
  const chartH = 100
  const barW   = 38
  const gap    = 12
  const totalW = data.length * (barW + gap) - gap

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-gray-400">לחץ על עמוד לסינון</p>
        <h2 className="text-sm font-semibold text-gray-700">יתרה לגביה לפי חודש</h2>
      </div>
      <div className="overflow-x-auto">
        <svg
          width={totalW + 8}
          height={chartH + 52}
          className="overflow-visible"
          style={{ minWidth: '100%' }}
        >
          {data.map((d, i) => {
            const barH = max > 0 ? Math.max(4, Math.round((d.remaining / max) * chartH)) : 4
            const x    = i * (barW + gap)
            const y    = chartH - barH
            const isSelected = selectedMonth === d.month
            const color = d.remaining <= 0 ? '#059669' : '#dc2626'
            const opacity = selectedMonth && !isSelected ? 0.35 : 1

            return (
              <g key={d.month} style={{ cursor: onBarClick ? 'pointer' : 'default' }}
                onClick={() => onBarClick?.(d.month)}>
                {/* Hover/select bg */}
                <rect x={x - 4} y={0} width={barW + 8} height={chartH + 4}
                  rx={6} fill={isSelected ? '#1a3a7a' : 'transparent'} opacity={0.07} />
                {/* Bar */}
                <rect x={x} y={y} width={barW} height={barH} rx={4}
                  fill={isSelected ? '#1a3a7a' : color} opacity={opacity} />
                {/* Amount label */}
                {d.remaining > 0 && (
                  <text x={x + barW / 2} y={y - 5} textAnchor="middle"
                    fontSize={9} fill={isSelected ? '#1a3a7a' : '#6b7280'} fontWeight={isSelected ? 700 : 400}>
                    {formatAmount(d.remaining)}
                  </text>
                )}
                {/* Month label */}
                <text x={x + barW / 2} y={chartH + 18} textAnchor="middle"
                  fontSize={11} fill={isSelected ? '#1a3a7a' : '#9ca3af'}
                  fontWeight={isSelected ? 700 : 400}>
                  {formatMonth(d.month)}
                </text>
                {/* Selected dot */}
                {isSelected && (
                  <circle cx={x + barW / 2} cy={chartH + 30} r={3} fill="#1a3a7a" />
                )}
              </g>
            )
          })}
          <line x1={0} y1={chartH} x2={totalW} y2={chartH} stroke="#f3f4f6" strokeWidth={1} />
        </svg>
      </div>
    </div>
  )
}
