import React, { useMemo } from 'react'
import {
  FileText,
  TrendingDown,
  TrendingUp,
  Percent,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type { Lancamento, Categoria, DespesaCompromisso } from '@/types/domain'

interface TabOrcamentoProps {
  lancamentosRealizados: Lancamento[]
  categorias: Categoria[]
  compromissos: DespesaCompromisso[]
}

export function TabOrcamento({
  lancamentosRealizados,
  categorias,
  compromissos,
}: TabOrcamentoProps) {
  // Orçado baseado na soma dos compromissos ativos recorrentes
  const orcadoTotalDespesas = useMemo(() => {
    return compromissos
      .filter((c) => c.ativo)
      .reduce((sum, c) => sum + (c.valor_parcela || c.valor_estimado || 0), 0)
  }, [compromissos])

  const realizadoTotalDespesas = useMemo(() => {
    return lancamentosRealizados
      .filter((l) => l.tipo === 'despesa' && l.status === 'pago')
      .reduce((sum, l) => sum + l.valor, 0)
  }, [lancamentosRealizados])

  const realizadoTotalReceitas = useMemo(() => {
    return lancamentosRealizados
      .filter((l) => l.tipo === 'receita' && l.status === 'pago')
      .reduce((sum, l) => sum + l.valor, 0)
  }, [lancamentosRealizados])

  const desvioRs = realizadoTotalDespesas - orcadoTotalDespesas
  const desvioPct = orcadoTotalDespesas > 0 ? (desvioRs / orcadoTotalDespesas) * 100 : 0

  // Comparativo por categoria
  const comparativoCategorias = useMemo(() => {
    const map = new Map<string, { nome: string; orcado: number; realizado: number }>()

    const catMap = new Map(categorias.map((c) => [c.id, c.nome]))

    for (const c of compromissos) {
      if (!c.ativo) continue
      const catNome = (c.categoria && catMap.get(c.categoria)) || 'Geral'
      if (!map.has(catNome)) {
        map.set(catNome, { nome: catNome, orcado: 0, realizado: 0 })
      }
      map.get(catNome)!.orcado += c.valor_parcela || c.valor_estimado || 0
    }

    for (const l of lancamentosRealizados) {
      if (l.tipo !== 'despesa' || l.status !== 'pago') continue
      const catNome = (l.categoria && catMap.get(l.categoria)) || 'Geral'
      if (!map.has(catNome)) {
        map.set(catNome, { nome: catNome, orcado: 0, realizado: 0 })
      }
      map.get(catNome)!.realizado += l.valor
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        desvio: item.realizado - item.orcado,
        estourou: item.orcado > 0 && item.realizado > item.orcado,
      }))
      .sort((a, b) => b.realizado - a.realizado)
  }, [compromissos, lancamentosRealizados, categorias])

  return (
    <div className="space-y-4">
      {/* KPIs de Orçamento */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Despesas Orçadas"
          value={orcadoTotalDespesas}
          icon={FileText}
          to="/despesas"
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle="Previsão baseada em compromissos"
        />

        <ModernKpiCard
          title="Despesas Realizadas"
          value={realizadoTotalDespesas}
          icon={TrendingDown}
          to="/despesas"
          colorClass="text-primary"
          bgLightClass="bg-primary/10"
          subtitle="Saídas efetivas até o momento"
        />

        <ModernKpiCard
          title="Desvio do Orçamento"
          value={desvioRs}
          icon={Percent}
          colorClass={desvioRs > 0 ? 'text-rose-700' : 'text-emerald-700'}
          bgLightClass={desvioRs > 0 ? 'bg-rose-50' : 'bg-emerald-50'}
          subtitle={
            desvioRs > 0
              ? `Estouro de ${desvioPct.toFixed(1)}% sobre a meta`
              : `Economia de ${Math.abs(desvioPct).toFixed(1)}%`
          }
        />

        <ModernKpiCard
          title="Receita Realizada vs Orçada"
          value={realizadoTotalReceitas}
          icon={TrendingUp}
          to="/lancamentos?tipo=receita"
          colorClass="text-emerald-700"
          bgLightClass="bg-emerald-50"
          subtitle="Total de entradas consolidadas"
        />
      </div>

      {/* Tabela de Comparativo Orçado vs Realizado por Categoria */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-bold">Orçado × Realizado por Categoria</CardTitle>
            <p className="text-xs text-muted-foreground">
              Acompanhe onde o orçamento foi respeitado ou onde houve desvio
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-xs">
            <Link to="/categorias">
              Ver categorias <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {comparativoCategorias.length > 0 ? (
            <div className="space-y-2.5">
              {comparativoCategorias.map((item) => {
                const pctGasto = item.orcado > 0 ? (item.realizado / item.orcado) * 100 : 100

                return (
                  <div
                    key={item.nome}
                    className="p-3 rounded-xl border border-border/70 hover:bg-secondary/30 transition flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-foreground truncate">
                        {item.nome}
                      </span>
                      <div className="flex items-center gap-2">
                        {item.estourou ? (
                          <Badge variant="destructive" className="text-[10px] font-bold">
                            Acima do orçamento (+{formatCurrency(item.desvio)})
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px] font-bold"
                          >
                            Dentro do limite
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs text-muted-foreground">
                      <div>
                        Orçado:{' '}
                        <strong className="text-foreground">{formatCurrency(item.orcado)}</strong>
                      </div>
                      <div>
                        Realizado:{' '}
                        <strong className="text-primary">{formatCurrency(item.realizado)}</strong>
                      </div>
                      <div className="col-span-2 sm:col-span-1 text-right">
                        Utilizado:{' '}
                        <strong className="text-foreground">{pctGasto.toFixed(0)}%</strong>
                      </div>
                    </div>

                    {/* Barra de progresso do orçamento */}
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          item.estourou ? 'bg-rose-500' : 'bg-emerald-600'
                        }`}
                        style={{ width: `${Math.min(pctGasto, 100)}%` }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Nenhuma categoria com movimentação ou orçamento cadastrado.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
