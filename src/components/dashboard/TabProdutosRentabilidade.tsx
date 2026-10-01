import React, { useMemo } from 'react'
import {
  Package,
  TrendingUp,
  Percent,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type { PrecProdutoRecord, PrecPrecificacaoRecord } from '@/types/precificacao'
import type { Venda } from '@/types/domain'

interface TabProdutosRentabilidadeProps {
  produtos: PrecProdutoRecord[]
  precificacoes: PrecPrecificacaoRecord[]
  vendas: Venda[]
}

export function TabProdutosRentabilidade({
  produtos,
  precificacoes,
  vendas,
}: TabProdutosRentabilidadeProps) {
  // Análise de Precificações Aprovadas & Margens
  const precStats = useMemo(() => {
    const ativas = precificacoes.filter((p) => p.status === 'aprovada')

    let somaMargemPct = 0
    let countMargem = 0
    let produtosComMargemNegativa = 0
    let produtosRevisao = 0

    const itensProcessados = ativas.map((p) => {
      const res = p.resultado as any
      const margemPct = res?.margem_liquida_pct ?? res?.margem_pct ?? 0
      const lucroRs = res?.lucro_liquido_unitario ?? res?.lucro_unitario ?? 0
      const precoVenda = p.preco_aprovado || res?.preco_venda || 0
      const custoTotal = res?.custo_total ?? (p.custo_snapshot as any)?.custo_total ?? 0

      if (margemPct < 0 || lucroRs < 0) {
        produtosComMargemNegativa += 1
      }

      if (p.status === 'desatualizada') {
        produtosRevisao += 1
      }

      somaMargemPct += margemPct
      countMargem += 1

      return {
        id: p.id,
        produtoId: p.produto,
        produtoNome: (p.expand as any)?.produto?.nome || 'Produto',
        sku: (p.expand as any)?.produto?.sku || '',
        canalNome: (p.expand as any)?.canal?.nome || 'Canal',
        precoVenda,
        custoTotal,
        lucroRs,
        margemPct,
      }
    })

    const margemMedia = countMargem > 0 ? somaMargemPct / countMargem : 0

    return {
      totalCadastrados: produtos.length,
      precificacoesAtivas: ativas.length,
      margemMedia,
      produtosComMargemNegativa,
      produtosRevisao,
      ranking: itensProcessados.sort((a, b) => b.margemPct - a.margemPct),
    }
  }, [produtos, precificacoes])

  // Produtos que exigem atenção
  const alertasProdutos = useMemo(() => {
    return precStats.ranking.filter((item) => item.margemPct < 5)
  }, [precStats.ranking])

  return (
    <div className="space-y-4">
      {/* KPIs de Produtos & Rentabilidade */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Produtos Cadastrados"
          value={produtos.length}
          isCurrency={false}
          icon={Package}
          to="/precificacao/produtos"
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle={`${produtos.filter((p) => p.status === 'ativo').length} ativos no catálogo`}
        />

        <ModernKpiCard
          title="Margem Média Aprovada"
          value={`${precStats.margemMedia.toFixed(1)}%`}
          isCurrency={false}
          icon={Percent}
          to="/precificacao"
          colorClass={precStats.margemMedia >= 15 ? 'text-emerald-700' : 'text-amber-700'}
          bgLightClass={precStats.margemMedia >= 15 ? 'bg-emerald-50' : 'bg-amber-50'}
          subtitle="Margem de contribuição média"
        />

        <ModernKpiCard
          title="Margem Negativa / Crítica"
          value={precStats.produtosComMargemNegativa}
          isCurrency={false}
          icon={AlertTriangle}
          to="/precificacao"
          colorClass={
            precStats.produtosComMargemNegativa > 0 ? 'text-rose-700' : 'text-emerald-700'
          }
          bgLightClass={precStats.produtosComMargemNegativa > 0 ? 'bg-rose-50' : 'bg-emerald-50'}
          subtitle={
            precStats.produtosComMargemNegativa > 0
              ? 'Exigem revisão urgente de preço/custo'
              : 'Nenhum canal operando no vermelho'
          }
        />

        <ModernKpiCard
          title="Simulações Aprovadas"
          value={precStats.precificacoesAtivas}
          isCurrency={false}
          icon={TrendingUp}
          to="/precificacao/aprovados"
          colorClass="text-indigo-700"
          bgLightClass="bg-indigo-50"
          subtitle="Preços oficiais em vigor"
        />
      </div>

      {/* Grid de Ranking de Margens e Alertas */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Top Rentabilidade */}
        <Card className="lg:col-span-7">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold">Top Rentabilidade por Produto</CardTitle>
              <p className="text-xs text-muted-foreground">
                Maiores margens de contribuição unitárias aprovadas
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/precificacao/aprovados">
                Ver tabela completa <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {precStats.ranking.length > 0 ? (
              <div className="space-y-2.5">
                {precStats.ranking.slice(0, 6).map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl border border-border/70 hover:bg-secondary/30 transition flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 truncate pr-3">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs font-bold text-foreground truncate">
                          {item.produtoNome}
                        </span>
                        {item.sku && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            [{item.sku}]
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Canal: <strong className="text-foreground">{item.canalNome}</strong> ·
                        Preço: {formatCurrency(item.precoVenda)} · Custo:{' '}
                        {formatCurrency(item.custoTotal)}
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span
                        className={`text-sm font-extrabold tabular-nums block ${
                          item.margemPct >= 15
                            ? 'text-emerald-700'
                            : item.margemPct > 0
                              ? 'text-amber-700'
                              : 'text-rose-700'
                        }`}
                      >
                        {item.margemPct.toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Lucro: {formatCurrency(item.lucroRs)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Nenhum cálculo de precificação aprovado encontrado.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Produtos que precisam de revisão */}
        <Card className="lg:col-span-5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                Produtos para Revisão
              </CardTitle>
              <p className="text-xs text-muted-foreground">Margem baixa (&lt; 5%) ou no prejuízo</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/precificacao/comparar">Comparar custos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {alertasProdutos.length > 0 ? (
              <div className="space-y-2">
                {alertasProdutos.map((item) => (
                  <div
                    key={item.id}
                    className="p-2.5 rounded-xl border border-rose-200 bg-rose-50/20 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 truncate pr-2">
                      <span className="text-xs font-bold text-foreground block truncate">
                        {item.produtoNome}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Canal: {item.canalNome} · Preço: {formatCurrency(item.precoVenda)}
                      </span>
                    </div>
                    <Badge variant="destructive" className="text-[10px] font-bold shrink-0">
                      Margem: {item.margemPct.toFixed(1)}%
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center">
                <CheckCircle2 className="mx-auto mb-1.5 h-6 w-6 text-emerald-600" />
                <p className="text-xs font-semibold text-foreground">Tudo em ordem!</p>
                <p className="text-[11px] text-muted-foreground">
                  Nenhum produto cadastrado com margem perigosa ou negativa.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
