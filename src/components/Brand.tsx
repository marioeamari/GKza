import { Landmark } from 'lucide-react'
import { cn } from '@/lib/utils'

export function Brand({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white shadow-brand">
        <Landmark className="h-5 w-5" strokeWidth={1.9} />
      </span>
      {!compact && (
        <div className="leading-tight">
          <p className="text-[15px] font-extrabold tracking-tight text-foreground">
            Gestão Financeira
          </p>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">
            & Marketplaces
          </p>
        </div>
      )}
    </div>
  )
}
