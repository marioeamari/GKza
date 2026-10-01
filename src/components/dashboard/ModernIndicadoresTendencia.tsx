import React from 'react'
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { cn } from '@/lib/utils'

export interface TendenciaItem {
  id: string
  indicador: string
  atual: number
  anterior: number
  isCurrency?: boolean
  unidade?: string
  invertDirection?: boolean // se subir for ruim (ex: despesas)
  projecaoFimMes?: number
}

interface ModernIndicadoresTendenciaProps {
  itens: TendenciaItem[]
}

export function ModernIndicadoresTendencia({ itens }: ModernIndicadoresTendenciaProps) {
  return (
    <Card className="border-border shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-bold flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          Indicadores de Tendência & Projeção
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-0.5">
          Variação percentual versus histórico anterior e estimativa de fechamento mensal
        </p>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {itens.map((item) => {
            const diff = item.atual - item.anterior
            const pct =
              item.anterior === 0
                ? item.atual > 0
                  ? 100
                  : 0
                : (diff / Math.abs(item.anterior)) * 100

            const isSubindo = pct > 0.5
            const isDescendo = pct < -0.5
            const isEstavel = !isSubindo && !isDescendo

            // Se invertDirection for true (ex: custo/despesa), subida é ruim
            const isBom = item.invertDirection ? isDescendo : isSubindo
            const isRuim = item.invertDirection ? isSubindo : isDescendo

            const formattedAtual = item.isCurrency
              ? formatCurrency(item.atual)
              : `${item.atual.toLocaleString('pt-BR')} ${item.unidade || ''}`

            const formattedAnterior = item.isCurrency
              ? formatCurrency(item.anterior)
              : `${item.anterior.toLocaleString('pt-BR')} ${item.unidade || ''}`

            return (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-3.5 flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-semibold truncate">{item.indicador}</span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-bold',
                        isBom && 'bg-emerald-100 text-emerald-800',
                        isRuim && 'bg-rose-100 text-rose-800',
                        isEstavel && 'bg-slate-100 text-slate-800',
                      )}
                    >
                      {isSubindo && <ArrowUpRight className="h-3 w-3" />}
                      {isDescendo && <ArrowDownRight className="h-3 w-3" />}
                      {isEstavel && <Minus className="h-3 w-3" />}
                      {pct > 0 ? `+${pct.toFixed(1)}%` : `${pct.toFixed(1)}%`}
                    </span>
                  </div>

                  <p className="mt-2 text-xl font-extrabold tabular-nums text-foreground">
                    {formattedAtual}
                  </p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Período anterior: <span className="font-medium">{formattedAnterior}</span>
                  </p>
                </div>

                {item.projecaoFimMes !== undefined && (
                  <div className="mt-3 pt-2 border-t border-border/50 text-[11px] text-muted-foreground flex justify-between items-center">
                    <span>Projeção fechamento:</span>
                    <span className="font-bold text-foreground tabular-nums">
                      {item.isCurrency
                        ? formatCurrency(item.projecaoFimMes)
                        : item.projecaoFimMes.toLocaleString('pt-BR')}
                    </span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
