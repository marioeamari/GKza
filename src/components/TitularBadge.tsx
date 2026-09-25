import { Building2, UserRound } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import type { Lancamento } from '@/types/domain'

export type TitularTipoLancamento = 'cpf' | 'cnpj'

export interface TitularInfo {
  tipo: TitularTipoLancamento
  label: string // 'Pessoal (CPF)' ou 'Empresa (CNPJ)'
  nome?: string // Nome da pessoa ou Razão/Fantasia da empresa, se disponível
}

/**
 * Identifica o tipo do titular de um lançamento.
 * Retorna null se o lançamento não tiver titularidade (nem pessoa, nem empresa).
 *
 * Prioridade:
 * 1. Empresa vinculada -> Empresa (CNPJ)
 * 2. Pessoa vinculada -> Pessoal (CPF)
 */
export function getTitularInfo(lancamento?: Lancamento | null): TitularInfo | null {
  if (!lancamento) return null

  // Se tem empresa explicitamente vinculada (ID ou expand)
  if (lancamento.empresa || lancamento.expand?.empresa) {
    const nome =
      lancamento.expand?.empresa?.nome_fantasia ||
      lancamento.expand?.empresa?.razao_social ||
      undefined

    return {
      tipo: 'cnpj',
      label: 'Empresa (CNPJ)',
      nome,
    }
  }

  // Se tem pessoa vinculada (ID ou expand)
  if (lancamento.pessoa || lancamento.expand?.pessoa) {
    const nome = lancamento.expand?.pessoa?.nome || undefined

    return {
      tipo: 'cpf',
      label: 'Pessoal (CPF)',
      nome,
    }
  }

  return null
}

interface TitularBadgeProps {
  lancamento?: Lancamento | null
  className?: string
  showName?: boolean
}

export function TitularBadge({ lancamento, className, showName = false }: TitularBadgeProps) {
  const titular = getTitularInfo(lancamento)
  if (!titular) return null

  const isCnpj = titular.tipo === 'cnpj'
  const displayText = showName && titular.nome ? titular.nome : titular.label
  const tooltipText = titular.nome
    ? `${titular.label} · ${titular.nome}`
    : `Tipo do Titular: ${titular.label}`

  return (
    <Badge
      variant="outline"
      title={tooltipText}
      className={cn(
        'inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded transition-colors shrink-0',
        isCnpj
          ? 'bg-amber-500/10 text-amber-700 border-amber-300/60 dark:bg-amber-950/30 dark:text-amber-300 dark:border-amber-800'
          : 'bg-blue-500/10 text-blue-700 border-blue-300/60 dark:bg-blue-950/30 dark:text-blue-300 dark:border-blue-800',
        className,
      )}
    >
      {isCnpj ? (
        <Building2 className="h-3 w-3 shrink-0" />
      ) : (
        <UserRound className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate">{displayText}</span>
    </Badge>
  )
}
