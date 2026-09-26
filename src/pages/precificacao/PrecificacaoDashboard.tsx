import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  LayoutDashboard,
  Filter,
  AlertTriangle,
  TrendingUp,
  Percent,
  CheckCircle2,
  TrendingDown,
  Info,
  Layers,
  ArrowRight,
  ExternalLink,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { precificacaoService } from '@/services/precificacao'
import { cadastrosService } from '@/services/cadastros'
import { PrecCanalRecord, PrecPrecificacaoRecord, PrecProdutoRecord } from '@/types/precificacao'
import { Empresa } from '@/types/domain'
import { formatCurrency } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'

export default function PrecificacaoDashboard() {
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [precificacoes, setPrecificacoes] = useState<PrecPrecificacaoRecord[]>([])
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  // Filtros
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('todas')
  const [filtroCanal, setFiltroCanal] = useState<string>('todos')
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        const [prods, precs, chans, emps] = await Promise.all([
          precificacaoService.listProdutos(),
          precificacaoService.listPrecificacoes(),
          precificacaoService.listCanais(),
          cadastrosService.listEmpresas(),
        ])
        setProdutos(prods)
        setPrecificacoes(precs)
        setCanais(chans)
        setEmpresas(emps)
      } catch (err) {
        console.error('Erro ao carregar dados do dashboard:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // Filtragem analítica
  const precificacoesFiltradas = useMemo(() => {
    return precificacoes.filter((item) => {
      if (filtroEmpresa !== 'todas' && item.empresa !== filtroEmpresa) return false
      if (filtroCanal !== 'todos' && item.canal !== filtroCanal) return false
      if (filtroStatus !== 'todos' && item.status !== filtroStatus) return false
      if (filtroTipo !== 'todos') {
        const prod = produtos.find((p) => p.id === item.produto)
        if (prod?.tipo !== filtroTipo) return false
      }
      return true
    })
  }, [precificacoes, filtroEmpresa, filtroCanal, filtroStatus, filtroTipo, produtos])

  // Métricas calculadas
  const skusPrecificados = useMemo(() => {
    const ids = new Set(precificacoesFiltradas.map((p) => p.produto))
    return ids.size
  }, [precificacoesFiltradas])

  const skusSemPrecoAprovado = useMemo(() => {
    const prodsAprovados = new Set(
      precificacoes.filter((p) => p.status === 'aprovada').map((p) => p.produto),
    )
    return produtos.filter((p) => !prodsAprovados.has(p.id)).length
  }, [produtos, precificacoes])

  const precificacoesComPrejuizo = useMemo(() => {
    return precificacoesFiltradas.filter((p) => {
      const res = p.resultado as { lucro_liquido?: number }
      return typeof res?.lucro_liquido === 'number' && res.lucro_liquido < 0
    })
  }, [precificacoesFiltradas])

  const precificacoesDesatualizadas = useMemo(() => {
    return precificacoesFiltradas.filter((p) => p.status === 'desatualizada')
  }, [precificacoesFiltradas])

  // Distribuição de margem prevista
  const distribuicaoMargem = useMemo(() => {
    let menosQueZero = 0
    let zeroA10 = 0
    let dezA20 = 0
    let vinteA30 = 0
    let maisDe30 = 0

    for (const p of precificacoesFiltradas) {
      const res = p.resultado as { margem_liquida_pct?: number }
      const m = Number(res?.margem_liquida_pct) || 0
      if (m < 0) menosQueZero++
      else if (m < 10) zeroA10++
      else if (m < 20) dezA20++
      else if (m < 30) vinteA30++
      else maisDe30++
    }

    const total = precificacoesFiltradas.length || 1
    return {
      menosQueZero: { count: menosQueZero, pct: Math.round((menosQueZero / total) * 100) },
      zeroA10: { count: zeroA10, pct: Math.round((zeroA10 / total) * 100) },
      dezA20: { count: dezA20, pct: Math.round((dezA20 / total) * 100) },
      vinteA30: { count: vinteA30, pct: Math.round((vinteA30 / total) * 100) },
      maisDe30: { count: maisDe30, pct: Math.round((maisDe30 / total) * 100) },
    }
  }, [precificacoesFiltradas])

  // Menor margem prevista (top 5)
  const rankingMenorMargem = useMemo(() => {
    return [...precificacoesFiltradas]
      .filter(
        (p) => (p.resultado as { margem_liquida_pct?: number })?.margem_liquida_pct !== undefined,
      )
      .sort((a, b) => {
        const ma = (a.resultado as { margem_liquida_pct?: number }).margem_liquida_pct ?? 0
        const mb = (b.resultado as { margem_liquida_pct?: number }).margem_liquida_pct ?? 0
        return ma - mb
      })
      .slice(0, 5)
  }, [precificacoesFiltradas])

  // Dispersão e Sensibilidade (produtos com maior diferença de preço entre canais)
  const produtosDispersao = useMemo(() => {
    const map = new Map<string, number[]>()
    for (const p of precificacoes) {
      const preco = Number((p.resultado as { preco_anunciado?: number })?.preco_anunciado) || 0
      if (preco > 0) {
        const arr = map.get(p.produto) || []
        arr.push(preco)
        map.set(p.produto, arr)
      }
    }

    const res: Array<{
      produto: PrecProdutoRecord
      min: number
      max: number
      diff: number
      diffPct: number
    }> = []
    map.forEach((precos, prodId) => {
      if (precos.length > 1) {
        const min = Math.min(...precos)
        const max = Math.max(...precos)
        const diff = max - min
        const prod = produtos.find((p) => p.id === prodId)
        if (prod && min > 0) {
          res.push({
            produto: prod,
            min,
            max,
            diff,
            diffPct: Math.round((diff / min) * 100),
          })
        }
      }
    })

    return res.sort((a, b) => b.diff - a.diff).slice(0, 5)
  }, [precificacoes, produtos])

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Dashboard de Margens & Sensibilidade"
        subtitulo="Visão analítica de preços projetados, dispersão entre canais e monitoramento de rentabilidade"
        acoes={
          <Button asChild className="bg-primary hover:bg-primary/90 text-white font-bold">
            <Link to="/precificacao/comparar">Nova Simulação / Comparar</Link>
          </Button>
        }
      />

      {/* AVISO MANDATÓRIO: SEPARAÇÃO DE SIMULAÇÃO E REALIZADO */}
      <div className="rounded-xl border border-amber-300 bg-amber-50/80 p-4 text-xs sm:text-sm text-amber-950 flex items-start gap-3">
        <Info className="h-5 w-5 text-amber-600 mt-0.5 shrink-0" />
        <div>
          <span className="font-bold text-amber-900 block">
            Atenção: Indicadores de SIMULAÇÃO PROJETADA (Sem integração com pedidos reais)
          </span>
          <p className="mt-0.5 text-amber-800 leading-relaxed">
            Todas as métricas de lucro, markup e margem exibidas nesta tela são simulações
            matemáticas calculadas a partir das regras de taxas e composição de custo dos produtos.
            Nenhuma venda foi importada ou somada ao faturamento realizado da empresa.
          </p>
        </div>
      </div>

      {/* Barra de Filtros */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-white p-3 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground mr-1">
          <Filter className="h-4 w-4" />
          <span>Filtros:</span>
        </div>

        {/* Empresa */}
        <div className="w-44">
          <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Empresa" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as Empresas</SelectItem>
              {empresas.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.nome_fantasia || e.razao_social}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Canal */}
        <div className="w-44">
          <Select value={filtroCanal} onValueChange={setFiltroCanal}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Canal / Marketplace" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Canais</SelectItem>
              {canais.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Status */}
        <div className="w-40">
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Status</SelectItem>
              <SelectItem value="aprovada">Aprovada</SelectItem>
              <SelectItem value="rascunho">Rascunho</SelectItem>
              <SelectItem value="desatualizada">Desatualizada</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Tipo de Produto */}
        <div className="w-44">
          <Select value={filtroTipo} onValueChange={setFiltroTipo}>
            <SelectTrigger className="h-8 text-xs">
              <SelectValue placeholder="Tipo de Produto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos os Tipos</SelectItem>
              <SelectItem value="fabricacao_propria">Fabricação Própria</SelectItem>
              <SelectItem value="revenda">Revenda</SelectItem>
              <SelectItem value="kit">Kit / Combo</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {(filtroEmpresa !== 'todas' ||
          filtroCanal !== 'todos' ||
          filtroStatus !== 'todos' ||
          filtroTipo !== 'todos') && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setFiltroEmpresa('todas')
              setFiltroCanal('todos')
              setFiltroStatus('todos')
              setFiltroTipo('todos')
            }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {/* Cards de Indicadores do Dashboard */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              SKUs Precificados
            </CardTitle>
            <Layers className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-foreground">
                {skusPrecificados}{' '}
                <span className="text-xs font-normal text-muted-foreground">
                  de {produtos.length}
                </span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Produtos com ao menos 1 cenário simulado
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Sem Preço Aprovado
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-amber-600">{skusSemPrecoAprovado}</div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Necessitam de validação ou precificação
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Cenários com Prejuízo
            </CardTitle>
            <TrendingDown className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-red-600">
                {precificacoesComPrejuizo.length}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Lucro líquido negativo na simulação
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground uppercase">
              Preços Desatualizados
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-orange-600">
                {precificacoesDesatualizadas.length}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Custo do SKU ou taxa do canal foi alterada
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Distribuição de Margem Líquida Prevista */}
      <Card className="shadow-xs border-border/80">
        <CardHeader>
          <CardTitle className="text-sm font-bold flex items-center gap-2">
            <Percent className="h-4 w-4 text-primary" />
            Distribuição de Margem Líquida Prevista (% sobre preço de venda)
          </CardTitle>
          <CardDescription>
            Faixas de rentabilidade projetadas entre as {precificacoesFiltradas.length}{' '}
            precificações ativas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="rounded-lg border border-red-200 bg-red-50/50 p-3">
              <span className="text-xs font-bold text-red-700 block">Prejuízo (&lt; 0%)</span>
              <span className="text-xl font-black text-red-800">
                {distribuicaoMargem.menosQueZero.count}
              </span>
              <span className="text-[10px] text-red-600 ml-1">
                ({distribuicaoMargem.menosQueZero.pct}%)
              </span>
            </div>

            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-3">
              <span className="text-xs font-bold text-amber-700 block">
                Margem Baixa (0% - 10%)
              </span>
              <span className="text-xl font-black text-amber-800">
                {distribuicaoMargem.zeroA10.count}
              </span>
              <span className="text-[10px] text-amber-600 ml-1">
                ({distribuicaoMargem.zeroA10.pct}%)
              </span>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
              <span className="text-xs font-bold text-blue-700 block">
                Margem Média (10% - 20%)
              </span>
              <span className="text-xl font-black text-blue-800">
                {distribuicaoMargem.dezA20.count}
              </span>
              <span className="text-[10px] text-blue-600 ml-1">
                ({distribuicaoMargem.dezA20.pct}%)
              </span>
            </div>

            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3">
              <span className="text-xs font-bold text-emerald-700 block">
                Margem Boa (20% - 30%)
              </span>
              <span className="text-xl font-black text-emerald-800">
                {distribuicaoMargem.vinteA30.count}
              </span>
              <span className="text-[10px] text-emerald-600 ml-1">
                ({distribuicaoMargem.vinteA30.pct}%)
              </span>
            </div>

            <div className="rounded-lg border border-primary/30 bg-primary/10 p-3">
              <span className="text-xs font-bold text-primary block">
                Alta Rentabilidade (&gt; 30%)
              </span>
              <span className="text-xl font-black text-primary">
                {distribuicaoMargem.maisDe30.count}
              </span>
              <span className="text-[10px] text-primary/80 ml-1">
                ({distribuicaoMargem.maisDe30.pct}%)
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabelas de Análise: Menor Margem e Maior Dispersão */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Menor Margem */}
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-foreground flex items-center justify-between">
              <span>Atenção: Menor Margem Prevista (Top 5)</span>
              <Badge variant="outline" className="text-red-600 border-red-200 text-[10px]">
                Risco de Prejuízo
              </Badge>
            </CardTitle>
            <CardDescription>
              Cenários que necessitam de revisão urgente de taxas ou aumento de preço anunciado
            </CardDescription>
          </CardHeader>
          <CardContent>
            {rankingMenorMargem.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Nenhuma simulação cadastrada com os filtros atuais.
              </p>
            ) : (
              <div className="divide-y divide-border/60 text-xs">
                {rankingMenorMargem.map((item) => {
                  const res = item.resultado as {
                    lucro_liquido?: number
                    margem_liquida_pct?: number
                    preco_anunciado?: number
                  }
                  const lucro = res?.lucro_liquido ?? 0
                  const margem = res?.margem_liquida_pct ?? 0

                  return (
                    <div key={item.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">
                            {item.expand?.produto?.nome || 'SKU'}
                          </span>
                          <Badge variant="outline" className="text-[9px] font-mono">
                            {item.expand?.produto?.sku}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground mt-0.5">
                          {item.expand?.canal?.nome} • {item.expand?.modalidade?.nome || 'Padrão'}
                        </p>
                      </div>

                      <div className="text-right">
                        <span
                          className={`font-black text-sm ${
                            lucro < 0 ? 'text-red-600' : 'text-amber-600'
                          }`}
                        >
                          {formatCurrency(lucro)}
                        </span>
                        <span
                          className={`block text-[10px] font-bold ${
                            margem < 0 ? 'text-red-600' : 'text-amber-700'
                          }`}
                        >
                          {margem.toFixed(1)}% margem
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Dispersão de Preços entre Canais */}
        <Card className="shadow-xs border-border/80">
          <CardHeader>
            <CardTitle className="text-sm font-bold text-foreground flex items-center justify-between">
              <span>Maior Diferença de Preço entre Canais</span>
              <Badge variant="secondary" className="text-[10px]">
                Dispersão de Preço
              </Badge>
            </CardTitle>
            <CardDescription>
              SKUs com maior spread de preço anunciado devido às diferentes taxas das plataformas
            </CardDescription>
          </CardHeader>
          <CardContent>
            {produtosDispersao.length === 0 ? (
              <p className="text-xs text-muted-foreground py-6 text-center">
                Cadastre simulações para o mesmo SKU em mais de um canal para visualizar a
                dispersão.
              </p>
            ) : (
              <div className="divide-y divide-border/60 text-xs">
                {produtosDispersao.map((item) => (
                  <div
                    key={item.produto.id}
                    className="py-2.5 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-foreground">{item.produto.nome}</span>
                        <Badge variant="outline" className="text-[9px] font-mono">
                          {item.produto.sku}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground mt-0.5">
                        Menor: {formatCurrency(item.min)} • Maior: {formatCurrency(item.max)}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="font-black text-sm text-foreground">
                        +{formatCurrency(item.diff)}
                      </span>
                      <span className="block text-[10px] text-muted-foreground font-semibold">
                        Δ {item.diffPct}% de variação
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
