import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

export function StatusBadge({ status }: { status: string }) {
  const label: Record<string, string> = {
    pendente: 'Pendente',
    pago: 'Pago',
    paga: 'Paga',
    repassada: 'Repassada',
    previsto: 'Previsto',
    realizado: 'Realizado',
  }
  return (
    <Badge
      variant="secondary"
      className={cn(
        'border-0',
        (status === 'pago' || status === 'paga' || status === 'realizado') &&
          'bg-success/10 text-success',
        status === 'pendente' && 'bg-warning/10 text-warning',
        (status === 'repassada' || status === 'previsto') && 'bg-info/10 text-info',
      )}
    >
      {label[status] || status}
    </Badge>
  )
}
