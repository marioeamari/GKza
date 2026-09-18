import { useMemo } from 'react'
import { Input } from '@/components/ui/input'
import { currencyInput, parseCurrency } from '@/lib/format'

interface MoneyInputProps {
  value: number
  onChange: (value: number) => void
  id?: string
  disabled?: boolean
  placeholder?: string
}

export function MoneyInput({ value, onChange, ...props }: MoneyInputProps) {
  const display = useMemo(() => currencyInput(value), [value])
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">
        R$
      </span>
      <Input
        {...props}
        className="pl-10 tabular-nums"
        inputMode="numeric"
        value={display}
        onChange={(event) => onChange(parseCurrency(event.target.value))}
      />
    </div>
  )
}
