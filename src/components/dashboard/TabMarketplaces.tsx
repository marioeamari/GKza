import React, { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  Store,
  TrendingUp,
  Percent,
  ShoppingBag,
  DollarSign,
  AlertCircle,
  Clock,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatDate } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type { Venda, Repasse, Marketplace, MarketplaceConta } from '@/types/domain'

interface TabMarketplacesProps {
  vendas: Venda[]
  repasses: Repasse[]
  marketplaces: Marketplace[]
  contasMarketplace: MarketplaceConta[]
}

export function TabMarketplaces({
  vendas,
  repasses,
  marketplaces,
  contasMarketplace,
}: TabMarketplacesProps) {
  // Totais consolidados
  const totalBruto = useMemo(() => {
    return vendas.reduce((sum, v) => sum + (v.valor_bruto || 0), 0)
  }, [vendas])

  const totalComissao = useMemo(() => {
    return vendas.reduce((sum, v) => sum + (v.comissao || 0), 0)
  }, [vendas])

  const totalTaxas = useMemo(() => {
    return vendas.reduce((sum, v) => sum + (v.taxas || 0), 0)
  }, [vendas])

  const totalLiquido = useMemo(() => {
    return vendas.reduce((sum, v) => sum + (v.valor_liquido || 0), 0)
  }, [vendas])

  const totalPedidos = vendas.length
  const ticketMedio = totalPedidos > 0 ? totalBruto / totalPedidos : 0
  const taxaMediaPct = totalBruto > 0 ? ((totalComissao + totalTaxas) / totalBruto) * 100 : 0

  // Repasses previstos e realizados
  const repassesPrevistos = useMemo(() => {
    return repasses.filter((r) => r.status === 'previsto')
  }, [repasses])

  const totalRepassesPrevistos = useMemo(() => {
    return repassesPrevistos.reduce((sum, r) => sum + (r.valor || 0), 0)
  }, [repassesPrevistos])

  // Desempenho por Marketplace/Canal
  const porCanal = useMemo(() => {
    const map = new Map<
      string,
      {
        nome: string
        cor: string
        bruto: number
        comissao: number
        taxas: number
        liquido: number
        pedidos: number
      }
    >()

    const contaMap = new Map(contasMarketplace.map((c) => [c.id, c]))
    const mpMap = new Map(marketplaces.map((m) => [m.id, m]))

    for (const v of vendas) {
      const conta = v.expand?.marketplace_conta || contaMap.get(v.marketplace_conta)
      const mp = conta?.expand?.marketplace || (conta ? mpMap.get(conta.marketplace) : undefined)
      const nome = mp?.nome || conta?.apelido || 'Canal Direto'
      const cor = mp?.cor || '#DF5830'

      if (!map.has(nome)) {
        map.set(nome, {
          nome,
          cor,
          bruto: 0,
          comissao: 0,
          taxas: 0,
          liquido: 0,
          pedidos: 0,
        })
      }

      const entry = map.get(nome)!
      entry.bruto += v.valor_bruto || 0
      entry.comissao += v.comissao || 0
      entry.taxas += v.taxas || 0
      entry.liquido += v.valor_liquido || 0
      entry.pedidos += 1
    }

    return Array.from(map.values())
      .map((item) => ({
        ...item,
        participacaoPct: totalBruto > 0 ? (item.bruto / totalBruto) * 100 : 0,
        taxaMediaPct: item.bruto > 0 ? ((item.comissao + item.taxas) / item.bruto) * 100 : 0,
      }))
      .sort((a, b) => b.bruto - a.bruto)
  }, [vendas, contasMarketplace, marketplaces, totalBruto])

  return (
    <div className="space-y-4">
      {/* KPIs de Vendas & Marketplaces */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Faturamento Bruto (GMV)"
          value={totalBruto}
          icon={Store}
          to="/marketplaces"
          colorClass="text-emerald-700"
          bgLightClass="bg-emerald-50"
          subtitle={`${totalPedidos} pedidos faturados`}
        />

        <ModernKpiCard
          title="Receita Líquida dos Canais"
          value={totalLiquido}
          icon={DollarSign}
          to="/marketplaces"
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle="Valor após comissão e taxas"
        />

        <ModernKpiCard
          title="Ticket Médio"
          value={ticketMedio}
          icon={ShoppingBag}
          to="/marketplaces"
          colorClass="text-sky-700"
          bgLightClass="bg-sky-50"
          subtitle="Média por pedido vendido"
        />

        <ModernKpiCard
          title="Taxa Média Retida"
          value={`${taxaMediaPct.toFixed(1)}%`}
          isCurrency={false}
          icon={Percent}
          to="/marketplaces"
          colorClass={taxaMediaPct > 20 ? 'text-amber-700' : 'text-emerald-700'}
          bgLightClass={taxaMediaPct > 20 ? 'bg-amber-50' : 'bg-emerald-50'}
          subtitle={`Comissões: ${formatCurrency(totalComissao + totalTaxas)}`}
        />
      </div>

      {/* Gráfico de Desempenho por Marketplace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-7">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Volume Bruto vs Líquido por Canal</CardTitle>
            <p className="text-xs text-muted-foreground">
              Comparativo de faturamento e repasse retido por canal
            </p>
          </CardHeader>
          <CardContent>
            {porCanal.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={porCanal} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDE6DD" />
                    <XAxis dataKey="nome" tick={{ fontSize: 11, fill: '#8A8078' }} />
                    <YAxis
                      tick={{ fontSize: 11, fill: '#8A8078' }}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    />
                    <Tooltip
                      formatter={(val: unknown) => [
                        formatCurrency(typeof val === 'number' ? val : 0),
                        '',
                      ]}
                    />
                    <Legend />
                    <Bar
                      dataKey="bruto"
                      name="Faturamento Bruto"
                      fill="#DF5830"
                      radius={[3, 3, 0, 0]}
                    />
                    <Bar
                      dataKey="liquido"
                      name="Valor Líquido"
                      fill="#1E6F5C"
                      radius={[3, 3, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Nenhuma venda registrada nos canais no período.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Tabela Resumo dos Canais */}
        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold">Participação por Canal</CardTitle>
              <p className="text-xs text-muted-foreground">Share e taxa retida</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/marketplaces">
                Ver vendas <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {porCanal.length > 0 ? (
              <div className="space-y-2.5">
                {porCanal.map((canal) => (
                  <div
                    key={canal.nome}
                    className="p-3 rounded-xl border border-border/70 hover:bg-secondary/30 transition flex flex-col justify-between"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ background: canal.cor }}
                        />
                        <span className="text-xs font-bold text-foreground truncate">
                          {canal.nome}
                        </span>
                      </div>
                      <Badge variant="outline" className="text-[10px] font-bold">
                        {canal.participacaoPct.toFixed(1)}% do GMV
                      </Badge>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground border-t pt-2">
                      <div>
                        Bruto:{' '}
                        <strong className="text-foreground">{formatCurrency(canal.bruto)}</strong>
                      </div>
                      <div className="text-right">
                        Líquido:{' '}
                        <strong className="text-emerald-700">
                          {formatCurrency(canal.liquido)}
                        </strong>
                      </div>
                      <div>
                        Pedidos: <strong>{canal.pedidos}</strong>
                      </div>
                      <div className="text-right">
                        Taxa: <strong>{canal.taxaMediaPct.toFixed(1)}%</strong>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Nenhum canal ativo no período.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Próximos Repasses de Canais */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div>
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Clock className="h-4 w-4 text-warning" />
              Próximos Repasses Agendados
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Datas estimadas de liberação de saldo pelas plataformas
            </p>
          </div>
          <Button variant="ghost" size="sm" asChild className="text-xs">
            <Link to="/marketplaces?tab=repasses">
              Gerenciar repasses <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {repassesPrevistos.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {repassesPrevistos.slice(0, 6).map((item) => (
                <div
                  key={item.id}
                  className="rounded-xl border border-border p-3 flex items-center justify-between hover:bg-secondary/30 transition"
                >
                  <div className="min-w-0 flex-1 truncate pr-2">
                    <span className="text-xs font-bold text-foreground block truncate">
                      {item.expand?.marketplace_conta?.apelido || 'Marketplace'}
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Previsto para: {formatDate(item.data_prevista)}
                    </span>
                  </div>
                  <span className="text-xs font-extrabold tabular-nums text-foreground shrink-0">
                    {formatCurrency(item.valor)}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhum repasse futuro pendente no momento.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
