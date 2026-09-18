import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { PeriodRange } from '@/types/domain'

export function PeriodSelector({
  value,
  onChange,
}: {
  value: PeriodRange['key']
  onChange: (value: PeriodRange['key']) => void
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => next && onChange(next as PeriodRange['key'])}
      className="w-full justify-start gap-1 overflow-x-auto rounded-xl border border-border bg-white p-1 sm:w-auto"
    >
      {[
        ['current', 'Este mês'],
        ['previous', 'Mês passado'],
        ['90days', 'Últimos 90 dias'],
      ].map(([key, label]) => (
        <ToggleGroupItem
          key={key}
          value={key}
          className="h-8 shrink-0 rounded-lg px-3 text-xs font-bold data-[state=on]:bg-primary data-[state=on]:text-white"
        >
          {label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
