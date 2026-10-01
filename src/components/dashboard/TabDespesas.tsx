import React, { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
} from 'recharts'
import {
  ArrowDownRight,
  CreditCard,
  Layers,
  Tag,
  AlertTriangle,
  Repeat,
  CheckCircle2,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type {
  Lancamento,
  Categoria,
  DespesaCompromisso,
  DespesaOcorrencia,
  TagItem,
} from '@/types/domain'

interface TabDespesasProps {
  lancamentos: Lancamento[]
  categorias: Categoria[]
  compromissos: DespesaCompromisso[]
  ocorrencias: DespesaOcorrencia[]
  tags: TagItem[]
}

const COLORS = ['#DF5830', '#E57373', '#F97316', '#F59E0B', '#84CC16', '#06B6D4', '#8B5CF6']

export function TabDespesas({
  lancamentos,
  categorias,
  compromissos,
  ocorrencias,
  tags,
}: TabDespesasProps) {
  const despesasPagas = useMemo(() => {
    return lancamentos.filter((l) => l.tipo === 'despesa' && l.status === 'pago')
  }, [lancamentos])

  const totalDespesaPaga = useMemo(() => {
    return despesasPagas.reduce((sum, l) => sum + l.valor, 0)
  }, [despesasPagas])

  // Ocorrências a pagar (previstas)
  const ocorrenciasPrevistas = useMemo(() => {
    return ocorrencias.filter((o) => o.status === 'prevista')
  }, [ocorrencias])

  const totalAPagar = useMemo(() => {
    return ocorrenciasPrevistas.reduce((sum, o) => sum + (o.valor_previsto || 0), 0)
  }, [ocorrenciasPrevistas])

  // Despesas Fixas vs Variáveis (a partir dos compromissos e ocorrências)
  const compMap = useMemo(() => new Map(compromissos.map((c) => [c.id, c])), [compromissos])

  const fixasVariáveis = useMemo(() => {
    let fixas = 0
    let variaveis = 0
    let parceladas = 0

    for (const c of compromissos) {
      if (!c.ativo) continue
      const isParc = c.modalidade_parcelamento === 'parcelado' || c.regra_repeticao === 'parcelado'
      const val = c.valor_parcela || c.valor_estimado || 0

      if (isParc) {
        parceladas += val
      } else if (c.tipo_valor === 'variavel') {
        variaveis += val
      } else {
        fixas += val
      }
    }

    return { fixas, variaveis, parceladas }
  }, [compromissos])

  // Agrupamento por Categoria
  const porCategoria = useMemo(() => {
    const map = new Map<string, number>()
    const catMap = new Map(categorias.map((c) => [c.id, c.nome]))

    for (const d of despesasPagas) {
      const nome = (d.categoria && catMap.get(d.categoria)) || 'Outras Despesas'
      map.set(nome, (map.get(nome) || 0) + d.valor)
    }

    return Array.from(map.entries())
      .map(([nome, valor]) => ({
        nome,
        valor,
        pct: totalDespesaPaga > 0 ? (valor / totalDespesaPaga) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
  }, [despesasPagas, categorias, totalDespesaPaga])

  // Maiores Despesas Individuais Pagas
  const maioresDespesas = useMemo(() => {
    return [...despesasPagas].sort((a, b) => b.valor - a.valor).slice(0, 5)
  }, [despesasPagas])

  return (
    <div className="space-y-4">
      {/* KPIs da Despesa */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Despesa Total Paga"
          value={totalDespesaPaga}
          icon={ArrowDownRight}
          to="/despesas"
          colorClass="text-primary"
          bgLightClass="bg-primary/10"
          subtitle="Saídas efetivas no período"
        />

        <ModernKpiCard
          title="Contas a Pagar (Previsto)"
          value={totalAPagar}
          icon={Clock}
          to="/despesas?status=prevista"
          colorClass="text-amber-700"
          bgLightClass="bg-amber-50"
          subtitle={`${ocorrenciasPrevistas.length} conta(s) pendente(s)`}
        />

        <ModernKpiCard
          title="Compromissos Fixos (Estim.)"
          value={fixasVariáveis.fixas}
          icon={Repeat}
          to="/despesas"
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle="Mensalidades e custos fixos"
        />

        <ModernKpiCard
          title="Parcelamentos Ativos"
          value={fixasVariáveis.parceladas}
          icon={CreditCard}
          to="/despesas"
          colorClass="text-indigo-700"
          bgLightClass="bg-indigo-50"
          subtitle="Compromissos parcelados"
        />
      </div>

      {/* Gráficos de Despesas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Distribuição por Categoria */}
        <Card className="lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Despesas por Categoria</CardTitle>
            <p className="text-xs text-muted-foreground">Principais centros de custo e alocações</p>
          </CardHeader>
          <CardContent>
            {porCategoria.length > 0 ? (
              <div className="space-y-3">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={porCategoria}
                        dataKey="valor"
                        nameKey="nome"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        innerRadius={45}
                        paddingAngle={2}
                      >
                        {porCategoria.map((entry, index) => (
                          <Cell key={entry.nome} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: unknown) => [
                          formatCurrency(typeof val === 'number' ? val : 0),
                          '',
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {porCategoria.map((cat, i) => (
                    <div
                      key={cat.nome}
                      className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <i
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        <span className="font-medium truncate">{cat.nome}</span>
                      </span>
                      <span className="font-bold tabular-nums shrink-0 ml-2">
                        {formatCurrency(cat.valor)}{' '}
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({cat.pct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Nenhuma despesa registrada neste período.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Maiores Despesas do Período */}
        <Card className="lg:col-span-6">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold">Maiores Despesas</CardTitle>
              <p className="text-xs text-muted-foreground">Maiores desembolsos do período</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/despesas">
                Ver todas <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {maioresDespesas.length > 0 ? (
              <div className="space-y-2">
                {maioresDespesas.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-border/60 hover:bg-secondary/40 transition"
                  >
                    <div className="min-w-0 flex-1 truncate pr-2">
                      <span className="text-xs font-bold text-foreground block truncate">
                        {item.descricao}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(item.data)} · {item.expand?.categoria?.nome || 'Sem categoria'}
                      </span>
                    </div>
                    <span className="text-xs font-extrabold tabular-nums text-primary shrink-0">
                      {formatCurrency(item.valor)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Sem despesas registradas.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
