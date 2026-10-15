import React from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import { formatarMoedaBR } from '@/lib/precificacao/orcamentoCalculo'
import { TrendingUp, Layers, DollarSign, Store, Percent } from 'lucide-react'

export interface MontanteCanalConsolidado {
  canalId: string
  canalNome: string
  tipoCanal?: string
  totalItens: number
  totalFretes: number
  faturamentoTotal: number
  custoTotalProdutos: number
  tributosTotal: number
  taxasTotal: number
  lucroLiquidoTotal: number
  margemConsolidadaPct: number
}

export interface MontanteOrcamentoProps {
  montantesPorCanal: MontanteCanalConsolidado[]
  totalItensQtd: number
  qtdModelos: number
}

export function MontanteOrcamentoPanel({
  montantesPorCanal,
  totalItensQtd,
  qtdModelos,
}: MontanteOrcamentoProps) {
  if (!montantesPorCanal || montantesPorCanal.length === 0) {
    return null
  }

  return (
    <Card className="border-2 border-primary/25 bg-gradient-to-br from-primary/[0.04] via-background to-muted/20 shadow-sm overflow-hidden">
      <CardHeader className="pb-3 border-b border-primary/15 bg-primary/[0.03]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <TrendingUp className="w-4 h-4" />
            </div>
            <div>
              <CardTitle className="text-base font-black text-foreground">
                Montante Consolidado do Orçamento (Por Canal)
              </CardTitle>
              <CardDescription className="text-xs">
                Soma de todos os itens cadastrados e personalizados: Faturamento, Lucro Líquido e
                Margem Consolidada em tempo real.
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs font-semibold">
              <Layers className="w-3 h-3 mr-1" />
              {qtdModelos} {qtdModelos === 1 ? 'item' : 'itens'} ({totalItensQtd} un)
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
          {montantesPorCanal.map((canal) => {
            const lucroNegativo = canal.lucroLiquidoTotal < 0

            return (
              <div
                key={canal.canalId}
                className="bg-card rounded-xl p-4 border border-border/80 shadow-xs flex flex-col justify-between space-y-3 hover:border-primary/40 transition-colors"
              >
                {/* Cabeçalho do Canal */}
                <div className="flex items-center justify-between border-b border-border/50 pb-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Store className="w-3.5 h-3.5 text-primary shrink-0" />
                    <span className="font-extrabold text-sm text-foreground truncate">
                      {canal.canalNome}
                    </span>
                  </div>
                  <Badge variant="outline" className="text-[10px] shrink-0 font-medium">
                    {canal.tipoCanal === 'site_proprio' ? 'Site' : 'Marketplace'}
                  </Badge>
                </div>

                {/* Linhas de Valores do Canal */}
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between text-muted-foreground text-[11px]">
                    <span>Subtotal Itens:</span>
                    <span className="font-mono font-medium text-foreground">
                      {formatarMoedaBR(canal.totalItens)}
                    </span>
                  </div>
                  {canal.totalFretes > 0 && (
                    <div className="flex justify-between text-muted-foreground text-[11px]">
                      <span>Frete Total:</span>
                      <span className="font-mono font-medium text-orange-600">
                        +{formatarMoedaBR(canal.totalFretes)}
                      </span>
                    </div>
                  )}

                  <div className="pt-1 border-t border-border/40 flex justify-between items-baseline font-bold text-xs text-foreground">
                    <span>Faturamento Total:</span>
                    <span className="text-base font-black font-mono text-primary">
                      {formatarMoedaBR(canal.faturamentoTotal)}
                    </span>
                  </div>
                </div>

                {/* Destaque do Lucro Líquido e Margem Consolidada */}
                <div
                  className={`rounded-lg p-2.5 border transition-colors ${
                    lucroNegativo
                      ? 'bg-rose-50/90 border-rose-200 text-rose-950'
                      : 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider">
                    <span className={lucroNegativo ? 'text-rose-900' : 'text-emerald-900'}>
                      LUCRO TOTAL
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                        lucroNegativo
                          ? 'bg-rose-200 text-rose-900'
                          : 'bg-emerald-200 text-emerald-900'
                      }`}
                    >
                      {canal.margemConsolidadaPct.toFixed(1)}% MARGEM
                    </span>
                  </div>
                  <div className="mt-1 flex items-baseline justify-between">
                    <span
                      className={`text-xl font-black font-mono tracking-tight ${
                        lucroNegativo ? 'text-rose-600' : 'text-emerald-700'
                      }`}
                    >
                      {formatCurrency(canal.lucroLiquidoTotal)}
                    </span>
                    {canal.custoTotalProdutos > 0 && (
                      <span className="text-[10px] text-muted-foreground font-mono">
                        Custo: {formatCurrency(canal.custoTotalProdutos)}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
