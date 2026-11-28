import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { Coffee, LogOut, PauseCircle, PlayCircle } from 'lucide-react'
import type { PontoHojeItem } from '@/services/pontoApi'

export type EstadoBatida = 'trabalhando' | 'pausa' | 'fora'

export function derivarEstadoBatida(ultimoRegistro?: PontoHojeItem | null): EstadoBatida {
  if (!ultimoRegistro) return 'fora'
  if (ultimoRegistro.tipo === 'entrada' || ultimoRegistro.tipo === 'retomar') return 'trabalhando'
  if (ultimoRegistro.tipo === 'pausa') return 'pausa'
  return 'fora'
}

const CONFIG_ESTADO: Record<
  EstadoBatida,
  { label: string; className: string; Icon: typeof LogOut }
> = {
  trabalhando: {
    label: 'Trabalhando',
    className: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
    Icon: PlayCircle,
  },
  pausa: {
    label: 'Em pausa',
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
    Icon: PauseCircle,
  },
  fora: {
    label: 'Fora',
    className: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    Icon: LogOut,
  },
}

export function BadgeEstadoBatida({ estado }: { estado: EstadoBatida }) {
  const { label, className, Icon } = CONFIG_ESTADO[estado]
  return (
    <Badge variant="outline" className={cn('gap-1', className)}>
      <Icon className="h-3 w-3" />
      {label}
    </Badge>
  )
}

export function BadgePausaAtiva() {
  return (
    <Badge
      variant="outline"
      className="gap-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
    >
      <Coffee className="h-3 w-3" />
      Pausa
    </Badge>
  )
}

const CONFIG_TIPO: Record<string, { label: string; className: string }> = {
  entrada: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300',
  saida: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  pausa: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  retomar: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
}

export function BadgeTipoPonto({ tipo }: { tipo: string }) {
  const className = CONFIG_TIPO[tipo] ?? ''
  const label = tipo.charAt(0).toUpperCase() + tipo.slice(1)
  return (
    <Badge variant="outline" className={className}>
      {label}
    </Badge>
  )
}
