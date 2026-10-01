import React from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  ExternalLink,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface DecisaoItem {
  id: string
  titulo: string
  descricao: string
  prioridade: 'critica' | 'alta' | 'media' | 'baixa'
  categoria: 'caixa' | 'contas' | 'vendas' | 'produtos' | 'metas' | 'triagem'
  acaoTexto: string
  acaoLink: string
  valor?: number
  dataRef?: string
}

interface ModernDecisoesAlertasProps {
  decisoes: DecisaoItem[]
  onAcaoClick?: (item: DecisaoItem) => void
}

const prioridadeBadges: Record<
  DecisaoItem['prioridade'],
  { label: string; class: string; icon: typeof AlertTriangle }
> = {
  critica: {
    label: 'Crítica',
    class: 'bg-rose-100 text-rose-800 border-rose-300',
    icon: ShieldAlert,
  },
  alta: {
    label: 'Alta',
    class: 'bg-amber-100 text-amber-800 border-amber-300',
    icon: AlertTriangle,
  },
  media: {
    label: 'Média',
    class: 'bg-sky-100 text-sky-800 border-sky-300',
    icon: Clock,
  },
  baixa: {
    label: 'Baixa',
    class: 'bg-slate-100 text-slate-800 border-slate-300',
    icon: CheckCircle2,
  },
}

export function ModernDecisoesAlertas({ decisoes, onAcaoClick }: ModernDecisoesAlertasProps) {
  if (!decisoes.length) {
    return (
      <Card className="border-emerald-200/60 bg-emerald-50/30">
        <CardContent className="p-5 flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-foreground">Operação em dia</h4>
            <p className="text-xs text-muted-foreground">
              Nenhuma anomalia, vencimento atrasado ou pendência crítica detectada no período
              selecionado.
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  const criticas = decisoes.filter((d) => d.prioridade === 'critica').length
  const altas = decisoes.filter((d) => d.prioridade === 'alta').length

  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Decisões Necessárias & Alertas Operacionais
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Pontos de atenção priorizados que exigem intervenção imediata ou acompanhamento
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {criticas > 0 && (
            <Badge className="bg-rose-600 text-white border-0 text-[10px]">
              {criticas} crítica(s)
            </Badge>
          )}
          {altas > 0 && (
            <Badge className="bg-amber-500 text-white border-0 text-[10px]">{altas} alta(s)</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-2.5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {decisoes.map((item) => {
            const conf = prioridadeBadges[item.prioridade]
            const IconComponent = conf.icon

            return (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl border p-3.5 transition-all duration-150 flex flex-col justify-between bg-card hover:shadow-sm',
                  item.prioridade === 'critica' && 'border-rose-200 bg-rose-50/20',
                  item.prioridade === 'alta' && 'border-amber-200 bg-amber-50/20',
                )}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase border',
                        conf.class,
                      )}
                    >
                      <IconComponent className="h-3 w-3" />
                      {conf.label}
                    </span>

                    {item.valor !== undefined && (
                      <span className="text-xs font-extrabold tabular-nums text-foreground">
                        {formatCurrency(item.valor)}
                      </span>
                    )}
                  </div>

                  <h4 className="mt-2 text-sm font-bold text-foreground leading-snug">
                    {item.titulo}
                  </h4>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                    {item.descricao}
                  </p>

                  {item.dataRef && (
                    <p className="mt-2 text-[11px] text-muted-foreground font-medium">
                      Referência: {formatDate(item.dataRef)}
                    </p>
                  )}
                </div>

                <div className="mt-3 pt-2.5 border-t border-border/50 flex items-center justify-end">
                  <Button
                    size="sm"
                    variant={item.prioridade === 'critica' ? 'default' : 'outline'}
                    className={cn(
                      'h-7 text-xs font-semibold px-2.5',
                      item.prioridade === 'critica' &&
                        'bg-rose-600 hover:bg-rose-700 text-white border-transparent',
                    )}
                    asChild
                  >
                    <Link to={item.acaoLink} onClick={() => onAcaoClick?.(item)}>
                      {item.acaoTexto}
                      <ArrowRight className="ml-1 h-3 w-3" />
                    </Link>
                  </Button>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
