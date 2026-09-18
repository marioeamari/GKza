import { useMemo } from 'react'

import { addDays, formatCompactCurrency, formatShortDate, parseDate } from '@/lib/format'
import type { Lancamento } from '@/types/domain'

export function CashFlowChart({
  data,
  start,
  end,
  openingBalance,
}: {
  data: Lancamento[]
  start: Date
  end: Date
  openingBalance: number
}) {
  const chart = useMemo(() => {
    const days: { date: Date; key: string; receita: number; despesa: number; saldo: number }[] = []
    let current = new Date(start)
    let saldo = openingBalance
    while (current <= end && days.length < 92) {
      const key = current.toISOString().slice(0, 10)
      const entries = data.filter(
        (item) => item.data.slice(0, 10) === key && item.status === 'pago',
      )
      const receita = entries
        .filter((item) => item.tipo === 'receita')
        .reduce((sum, item) => sum + item.valor, 0)
      const despesa = entries
        .filter((item) => item.tipo === 'despesa')
        .reduce((sum, item) => sum + item.valor, 0)
      saldo += receita - despesa
      days.push({ date: new Date(current), key, receita, despesa, saldo })
      current = addDays(current, 1)
    }
    return days
  }, [data, end, openingBalance, start])

  const width = Math.max(620, chart.length * (chart.length > 40 ? 12 : 24))
  const height = 240
  const top = 18
  const bottom = 34
  const plotHeight = height - top - bottom
  const maxFlow = Math.max(...chart.flatMap((day) => [day.receita, day.despesa]), 1)
  const balances = chart.map((day) => day.saldo)
  const minBalance = Math.min(...balances, 0)
  const maxBalance = Math.max(...balances, 1)
  const balanceRange = Math.max(maxBalance - minBalance, 1)
  const slot = width / Math.max(chart.length, 1)
  const line = chart
    .map((day, index) => {
      const x = slot * index + slot / 2
      const y = top + plotHeight - ((day.saldo - minBalance) / balanceRange) * plotHeight
      return `${x},${y}`
    })
    .join(' ')

  if (!chart.length)
    return (
      <div className="grid h-56 place-items-center text-sm text-muted-foreground">
        Sem movimentações para exibir.
      </div>
    )
  return (
    <div className="chart-scroll -mx-2 overflow-x-auto px-2 pb-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        role="img"
        aria-label="Fluxo de caixa diário"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((part) => (
          <line
            key={part}
            x1="0"
            x2={width}
            y1={top + plotHeight * part}
            y2={top + plotHeight * part}
            stroke="#EDE6DD"
            strokeWidth="1"
            strokeDasharray="3 5"
          />
        ))}
        {chart.map((day, index) => {
          const x = slot * index
          const receitaHeight = (day.receita / maxFlow) * plotHeight * 0.72
          const despesaHeight = (day.despesa / maxFlow) * plotHeight * 0.72
          const barWidth = Math.max(3, Math.min(8, slot * 0.3))
          const showLabel =
            chart.length <= 35 ? index % Math.ceil(chart.length / 8) === 0 : index % 15 === 0
          return (
            <g key={day.key}>
              <rect
                x={x + slot / 2 - barWidth - 1}
                y={top + plotHeight - receitaHeight}
                width={barWidth}
                height={receitaHeight}
                rx="2"
                fill="#1E6F5C"
              >
                <title>
                  {formatShortDate(day.date)} — Receitas: {formatCompactCurrency(day.receita)}
                </title>
              </rect>
              <rect
                x={x + slot / 2 + 1}
                y={top + plotHeight - despesaHeight}
                width={barWidth}
                height={despesaHeight}
                rx="2"
                fill="#DF5830"
              >
                <title>
                  {formatShortDate(day.date)} — Despesas: {formatCompactCurrency(day.despesa)}
                </title>
              </rect>
              {showLabel && (
                <text
                  x={x + slot / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="10"
                  fill="#8A8078"
                >
                  {formatShortDate(day.date)}
                </text>
              )}
            </g>
          )
        })}
        <polyline
          points={line}
          fill="none"
          stroke="#2B5BA8"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {chart.map((day, index) => (
          <circle
            key={day.key}
            cx={slot * index + slot / 2}
            cy={top + plotHeight - ((day.saldo - minBalance) / balanceRange) * plotHeight}
            r={chart.length > 45 ? 1.8 : 3}
            fill="#fff"
            stroke="#2B5BA8"
            strokeWidth="1.8"
          >
            <title>
              {formatShortDate(parseDate(day.key))} — Saldo: {formatCompactCurrency(day.saldo)}
            </title>
          </circle>
        ))}
      </svg>
    </div>
  )
}
