import { LoaderCircle, WalletCards } from 'lucide-react'

export function LoadingState({ label = 'Carregando informações...' }: { label?: string }) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 text-muted-foreground">
      <LoaderCircle className="h-7 w-7 animate-spin text-primary" />
      <p className="text-sm">{label}</p>
    </div>
  )
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex min-h-[230px] flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-white/50 p-8 text-center">
      <span className="mb-4 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        <WalletCards className="h-6 w-6" />
      </span>
      <h3 className="font-bold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
