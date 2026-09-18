import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Trend({ value, invert = false }: { value: number; invert?: boolean }) {
  const positive = invert ? value <= 0 : value >= 0
  const Icon = value === 0 ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-bold',
        positive ? 'text-success' : 'text-destructive',
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(value).toFixed(1).replace('.', ',')}%{' '}
      <span className="font-medium text-muted-foreground">vs. período anterior</span>
    </span>
  )
}
