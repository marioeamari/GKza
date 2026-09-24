import { Badge } from '@/components/ui/badge'
import { User, Building2 } from 'lucide-react'
import type { ContextoTipo, Empresa, Pessoa } from '@/types/domain'

interface ContextBadgeProps {
  tipo: ContextoTipo
  pessoa?: Pessoa | string
  empresa?: Empresa | string
  className?: string
}

export function ContextBadge({ tipo, pessoa, empresa, className }: ContextBadgeProps) {
  const isEmpresa = tipo === 'empresa'

  let label = isEmpresa ? 'CNPJ' : 'Pessoal (CPF)'
  if (typeof pessoa === 'object' && pessoa?.nome) {
    label = pessoa.nome
  } else if (typeof empresa === 'object' && empresa?.nome_fantasia) {
    label = empresa.nome_fantasia
  }

  return (
    <Badge
      variant="outline"
      className={`inline-flex items-center gap-1 text-[11px] font-medium py-0.5 px-2 rounded-md ${
        isEmpresa
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
          : 'bg-blue-50 text-blue-700 border-blue-200'
      } ${className || ''}`}
    >
      {isEmpresa ? (
        <Building2 className="h-3 w-3 shrink-0" />
      ) : (
        <User className="h-3 w-3 shrink-0" />
      )}
      <span className="truncate max-w-[130px]">{label}</span>
    </Badge>
  )
}
