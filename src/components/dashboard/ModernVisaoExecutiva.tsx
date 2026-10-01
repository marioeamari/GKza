import React from 'react'
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  PiggyBank,
  TrendingUp,
  Percent,
  Calendar,
  Building,
  User,
  Layers,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'

export interface VisaoExecutivaData {
  saldoTotal: number
  saldoDisponivel: number
  receitaMes: number
  receitaAnterior: number
  despesaMes: number
  despesaAnterior: number
  resultadoMes: number
  margemLiquidaPct: number
  totalAPagar: number
  totalAReceber: number
  caixaProjetado30d: number
  metaFaturamento?: {
    alvo: number
    realizado: number
    pct: number
  }
}

interface ModernVisaoExecutivaProps {
  data: VisaoExecutivaData
  contextLabel: string
}

export function ModernVisaoExecutiva({ data, contextLabel }: ModernVisaoExecutivaProps) {
  const {
    saldoTotal,
    receitaMes,
    receitaAnterior,
    despesaMes,
    despesaAnterior,
    resultadoMes,
    margemLiquidaPct,
    totalAPagar,
    totalAReceber,
    caixaProjetado30d,
    metaFaturamento,
  } = data

  const deltaReceita =
    receitaAnterior === 0
      ? receitaMes > 0
        ? 100
        : 0
      : ((receitaMes - receitaAnterior) / Math.abs(receitaAnterior)) * 100

  const deltaDespesa =
    despesaAnterior === 0
      ? despesaMes > 0
        ? 100
        : 0
      : ((despesaMes - despesaAnterior) / Math.abs(despesaAnterior)) * 100

  return (
    <div className="space-y-4">
      {/* Banner de Status Executivo */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-primary/5 to-transparent p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-white uppercase tracking-wider">
                Visão Executiva C-Level
              </span>
              <span className="text-xs text-muted-foreground font-medium">
                Contexto: <strong className="text-foreground">{contextLabel}</strong>
              </span>
            </div>
            <h3 className="mt-1.5 text-lg font-extrabold text-foreground tracking-tight sm:text-xl">
              Panorama Estratégico Consolidado
            </h3>
            <p className="text-xs text-muted-foreground max-w-2xl">
              Resumo integrado de liquidez, rentabilidade operacional, metas atingidas e projeção de
              caixa para tomada de decisão ágil.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl border border-border bg-white px-3.5 py-2 text-right shadow-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Margem Líquida
              </span>
              <span
                className={`text-base font-extrabold tabular-nums ${
                  margemLiquidaPct >= 15
                    ? 'text-emerald-700'
                    : margemLiquidaPct >= 0
                      ? 'text-amber-700'
                      : 'text-rose-700'
                }`}
              >
                {margemLiquidaPct.toFixed(1)}%
              </span>
            </div>

            <div className="rounded-xl border border-border bg-white px-3.5 py-2 text-right shadow-xs">
              <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                Resultado Líquido
              </span>
              <span
                className={`text-base font-extrabold tabular-nums ${
                  resultadoMes >= 0 ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {formatCurrency(resultadoMes)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Grid de KPIs da Visão Executiva */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <ModernKpiCard
          title="Saldo em Contas"
          value={saldoTotal}
          icon={Wallet}
          to="/contas"
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle="Disponibilidade bancária e caixas"
        />

        <ModernKpiCard
          title="Receita Realizada"
          value={receitaMes}
          icon={ArrowUpRight}
          to="/lancamentos?tipo=receita"
          trend={deltaReceita}
          trendLabel="vs período anterior"
          colorClass="text-emerald-700"
          bgLightClass="bg-emerald-50"
        />

        <ModernKpiCard
          title="Despesas Realizadas"
          value={despesaMes}
          icon={ArrowDownRight}
          to="/despesas"
          trend={deltaDespesa}
          invertTrend
          trendLabel="vs período anterior"
          colorClass="text-primary"
          bgLightClass="bg-primary/10"
        />

        <ModernKpiCard
          title="Caixa Projetado (30d)"
          value={caixaProjetado30d}
          icon={TrendingUp}
          to="/lancamentos"
          colorClass={caixaProjetado30d >= 0 ? 'text-sky-700' : 'text-rose-700'}
          bgLightClass={caixaProjetado30d >= 0 ? 'bg-sky-50' : 'bg-rose-50'}
          subtitle="Saldo estimado após vencimentos"
        />
      </div>

      {/* Linha secundária de compromissos futuros e metas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4">
        <ModernKpiCard
          title="Contas a Pagar (Pendentes)"
          value={totalAPagar}
          icon={Clock}
          to="/despesas?status=prevista"
          colorClass="text-amber-700"
          bgLightClass="bg-amber-50"
          subtitle="Compromissos e faturas em aberto"
        />

        <ModernKpiCard
          title="A Receber / Repasses"
          value={totalAReceber}
          icon={PiggyBank}
          to="/marketplaces?tab=repasses"
          colorClass="text-indigo-700"
          bgLightClass="bg-indigo-50"
          subtitle="Repasses previstos e recebimentos"
        />

        {metaFaturamento ? (
          <Card className="border-border hover:shadow-sm transition">
            <CardContent className="p-4 sm:p-5 flex flex-col justify-between h-full">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Meta de Faturamento
                  </span>
                  <Badge variant="outline" className="text-[10px] font-bold">
                    {metaFaturamento.pct.toFixed(0)}% atingido
                  </Badge>
                </div>
                <div className="mt-2 flex items-baseline justify-between">
                  <span className="text-lg font-extrabold text-foreground">
                    {formatCurrency(metaFaturamento.realizado)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Alvo: {formatCurrency(metaFaturamento.alvo)}
                  </span>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-secondary">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-300"
                    style={{ width: `${Math.min(metaFaturamento.pct, 100)}%` }}
                  />
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-border/40 flex items-center justify-end text-[11px] font-semibold text-primary">
                <Link to="/hub-metas" className="flex items-center hover:underline">
                  Ver metas e projetos <ArrowRight className="ml-0.5 h-3 w-3" />
                </Link>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-border">
            <CardContent className="p-4 sm:p-5 flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Metas Financeiras
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  Nenhuma meta quantitativa ativa no momento.
                </p>
              </div>
              <Link
                to="/hub-metas"
                className="text-xs font-bold text-primary hover:underline flex items-center gap-1"
              >
                Definir meta <ArrowRight className="h-3 w-3" />
              </Link>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
