import React from 'react'
import { Link } from 'react-router-dom'
import { ArrowDownRight, ArrowUpRight, ChevronRight, type LucideIcon } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface ModernKpiCardProps {
  title: string
  value: number | string
  isCurrency?: boolean
  subtitle?: string
  trend?: number
  trendLabel?: string
  invertTrend?: boolean
  icon?: LucideIcon
  colorClass?: string
  bgLightClass?: string
  to?: string
  badge?: string
  badgeVariant?: 'default' | 'success' | 'warning' | 'destructive' | 'outline'
  onClick?: () => void
}

export function ModernKpiCard({
  title,
  value,
  isCurrency = true,
  subtitle,
  trend,
  trendLabel = 'vs período anterior',
  invertTrend = false,
  icon: Icon,
  colorClass = 'text-primary',
  bgLightClass = 'bg-primary/10',
  to,
  badge,
  badgeVariant = 'outline',
  onClick,
}: ModernKpiCardProps) {
  const isPositive = typeof trend === 'number' && trend > 0
  const isNegative = typeof trend === 'number' && trend < 0
  const isZero = typeof trend === 'number' && trend === 0

  const trendGood = invertTrend ? isNegative : isPositive
  const trendBad = invertTrend ? isPositive : isNegative

  const formattedVal =
    typeof value === 'number'
      ? isCurrency
        ? formatCurrency(value)
        : value.toLocaleString('pt-BR')
      : value

  const content = (
    <Card className="group relative overflow-hidden transition-all duration-200 hover:shadow-md hover:border-primary/30">
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground truncate">
            {title}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {badge && (
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-[10px] font-bold tracking-wide',
                  badgeVariant === 'success' && 'bg-emerald-100 text-emerald-800',
                  badgeVariant === 'warning' && 'bg-amber-100 text-amber-800',
                  badgeVariant === 'destructive' && 'bg-rose-100 text-rose-800',
                  badgeVariant === 'outline' && 'border border-border text-muted-foreground',
                  badgeVariant === 'default' && 'bg-primary/15 text-primary',
                )}
              >
                {badge}
              </span>
            )}
            {Icon && (
              <span
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-xl transition-transform group-hover:scale-105',
                  bgLightClass,
                  colorClass,
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
            )}
          </div>
        </div>

        <div className="mt-3">
          <p
            className={cn(
              'text-2xl font-extrabold tracking-tight tabular-nums sm:text-[26px]',
              colorClass,
            )}
          >
            {formattedVal}
          </p>

          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {typeof trend === 'number' && (
              <span
                className={cn(
                  'inline-flex items-center font-bold',
                  trendGood && 'text-emerald-600',
                  trendBad && 'text-rose-600',
                  isZero && 'text-muted-foreground',
                )}
              >
                {trendGood ? (
                  <ArrowUpRight className="mr-0.5 h-3.5 w-3.5" />
                ) : trendBad ? (
                  <ArrowDownRight className="mr-0.5 h-3.5 w-3.5" />
                ) : null}
                {trend > 0 ? `+${trend.toFixed(1)}%` : `${trend.toFixed(1)}%`}
              </span>
            )}
            {subtitle && (
              <span className="truncate">
                {typeof trend === 'number' && '·'} {subtitle || trendLabel}
              </span>
            )}
          </div>
        </div>

        {to && (
          <div className="mt-3 flex items-center justify-end border-t border-border/40 pt-2 text-[11px] font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100 sm:flex">
            <span>Ver detalhes</span>
            <ChevronRight className="ml-0.5 h-3 w-3" />
          </div>
        )}
      </CardContent>
    </Card>
  )

  if (to) {
    return (
      <Link to={to} className="block focus:outline-none">
        {content}
      </Link>
    )
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="block w-full text-left focus:outline-none">
        {content}
      </button>
    )
  }

  return content
}
