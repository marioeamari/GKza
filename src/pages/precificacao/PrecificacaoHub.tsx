import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Calculator,
  LayoutDashboard,
  PackagePlus,
  Store,
  BookmarkCheck,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Building2,
  Tag,
  FileSpreadsheet,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { precificacaoService } from '@/services/precificacao'
import { PrecProdutoRecord, PrecPrecificacaoRecord, PrecCanalRecord } from '@/types/precificacao'
import { formatCurrency } from '@/lib/format'
import { Skeleton } from '@/components/ui/skeleton'
import { MobileSubpagesMenu, MobileSubpageItem } from '@/components/MobileSubpagesMenu'

const SUBPAGINAS_PRECIFICACAO: MobileSubpageItem[] = [
  {
    to: '/precificacao/comparar',
    label: 'Comparador Lado a Lado',
    description: 'Simulações matemáticas e margens por marketplace',
    icon: Calculator,
  },
  {
    to: '/precificacao/aprovados',
    label: 'Cenários & Repositório',
    description: 'Preços vigentes aprovados por canal e data',
    icon: BookmarkCheck,
  },
  {
    to: '/precificacao/dashboard',
    label: 'Dashboard de Margens',
    description: 'Sensibilidade de custos e dispersão de preços',
    icon: LayoutDashboard,
  },
  {
    to: '/precificacao/produtos',
    label: 'Produtos & Kits',
    description: 'Custos de insumos, embalagem e composição',
    icon: Layers,
  },
  {
    to: '/precificacao/canais',
    label: 'Canais & Taxas',
    description: 'Comissões, fretes e faixas de marketplace',
    icon: Store,
  },
  {
    to: '/precificacao/orcamentos',
    label: 'Orçamentos & Cotações',
    description: 'Gerador de propostas com WhatsApp, PDF e Link público',
    icon: FileSpreadsheet,
  },
]

export default function PrecificacaoHub() {
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [precificacoes, setPrecificacoes] = useState<PrecPrecificacaoRecord[]>([])
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])

  useEffect(() => {
    let active = true

    async function loadData() {
      try {
        setLoading(true)
        // Timeout de proteção para nunca deixar o skeleton ou loading travado indefinidamente
        const dataPromise = Promise.all([
          precificacaoService.listProdutos(),
          precificacaoService.listPrecificacoes(),
          precificacaoService.listCanais(),
        ])
        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Timeout ao buscar dados de precificação')), 7000),
        )

        const [prods, precs, chans] = await Promise.race([dataPromise, timeoutPromise])
        if (active) {
          setProdutos(prods || [])
          setPrecificacoes(precs || [])
          setCanais(chans || [])
        }
      } catch (err) {
        console.warn('Erro ou timeout ao carregar dados do Hub de precificação:', err)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }
    loadData()

    return () => {
      active = false
    }
  }, [])

  const totalSKUs = produtos.length
  const skusAprovados = precificacoes.filter((p) => p.status === 'aprovada').length
  const skusDesatualizados = precificacoes.filter((p) => p.status === 'desatualizada').length
  const skusSemPreco = produtos.filter(
    (prod) => !precificacoes.some((p) => p.produto === prod.id && p.status === 'aprovada'),
  ).length

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Central de Precificação"
        subtitulo="Simulação matemática auditável, comparação de margens por canal e gestão de regras tributárias"
        acoes={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="border-border">
              <Link to="/precificacao/aprovados">
                <BookmarkCheck className="mr-2 h-4 w-4 text-emerald-600" />
                Repositório de Cenários
              </Link>
            </Button>
            <Button
              asChild
              className="bg-primary hover:bg-primary/90 text-white shadow-sm font-bold"
            >
              <Link to="/precificacao/comparar">
                <Calculator className="mr-2 h-4 w-4" />
                Abrir Comparador
              </Link>
            </Button>
          </div>
        }
      />

      {/* Menu Vertical de Subpáginas exclusivo Mobile */}
      <MobileSubpagesMenu
        titulo="Áreas de Precificação"
        descricao="Acesse as ferramentas e tabelas do módulo:"
        subpaginas={SUBPAGINAS_PRECIFICACAO}
      />

      {/* Aviso de Isolamento das Finanças Reais */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm text-foreground flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-1.5 text-primary">
          <Calculator className="h-5 w-5" />
        </div>
        <div>
          <p className="font-semibold text-primary">Ambiente Auditável de Simulações de Preço</p>
          <p className="text-muted-foreground mt-0.5 leading-relaxed">
            Este módulo opera de forma 100% autônoma e segura. Nenhuma simulação ou meta altera os
            lançamentos reais do fluxo de caixa ou de despesas. Custos e margens são recalculados
            analiticamente para cada marketplace e vigência.
          </p>
        </div>
      </div>

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total de Produtos / SKUs
            </CardTitle>
            <Layers className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{totalSKUs}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Fabricação própria, revenda e kits</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Preços Aprovados
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-emerald-600">{skusAprovados}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Com premissas de canal validadas</p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Desatualizados
            </CardTitle>
            <AlertTriangle className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold text-amber-600">{skusDesatualizados}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">
              Por alteração recente de custo ou taxa
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-xs border-border/80">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Canais Cadastrados
            </CardTitle>
            <Store className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-2xl font-bold">{canais.length}</div>
            )}
            <p className="text-xs text-muted-foreground mt-1">Marketplaces & Site próprio</p>
          </CardContent>
        </Card>
      </div>

      {/* Ações Rápidas / Atalhos em Destaque */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="hover:border-primary/50 transition-colors shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-orange-100 p-2 text-primary">
                <Calculator className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Comparador Lado a Lado</CardTitle>
                <CardDescription>
                  Simule o mesmo preço ou metas iguais em canais diferentes (Shopee, Mercado Livre,
                  Kwai, etc.)
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Estrutura idêntica à planilha: coluna de produto fixa com foto, SKU e composição de
              custos, seguida por colunas rolantes de cada marketplace com demonstrativo auditável
              linha a linha.
            </p>
            <Button asChild className="w-full sm:w-auto bg-primary text-white font-semibold">
              <Link to="/precificacao/comparar">
                Abrir Comparador Agora
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card className="hover:border-primary/50 transition-colors shadow-xs">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-blue-100 p-2 text-blue-600">
                <LayoutDashboard className="h-6 w-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Dashboard Próprio de Margens</CardTitle>
                <CardDescription>
                  Sensibilidade a custos, dispersão de preços, produtos em prejuízo e métricas
                  analíticas
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Visualização gerencial independente com filtros por empresa, categoria e canal. Avisos
              explícitos de que são projeções matemáticas, sem misturar com realizado de vendas.
            </p>
            <Button asChild variant="outline" className="w-full sm:w-auto">
              <Link to="/precificacao/dashboard">
                Acessar Dashboard
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Lista Rápida de Produtos Prontos para Simulação */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base font-bold">
              Produtos Cadastrados para Precificação
            </CardTitle>
            <CardDescription>
              Produtos disponíveis para simular e aprovar preços por canal
            </CardDescription>
          </div>
          <Button asChild variant="ghost" size="sm">
            <Link to="/precificacao/produtos" className="text-xs font-semibold text-primary">
              Ver todos ({produtos.length})
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Link>
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : produtos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Layers className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="font-semibold">Nenhum produto cadastrado no módulo ainda</p>
              <p className="text-xs mt-1">
                Cadastre seus produtos ou kits para iniciar simulações analíticas de venda.
              </p>
              <Button asChild className="mt-4 bg-primary text-white" size="sm">
                <Link to="/precificacao/produtos">Ver Produtos & Kits</Link>
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {produtos.slice(0, 6).map((prod) => {
                const totalCusto =
                  prod.tipo === 'fabricacao_propria'
                    ? (prod.composicao || []).reduce(
                        (acc, i) => acc + i.qtd * i.custo_unitario,
                        0,
                      ) +
                      (prod.custo_adicional_embalagem || 0) +
                      (prod.custo_etiqueta || 0)
                    : prod.custo_aquisicao_unitario || 0

                return (
                  <div
                    key={prod.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-2"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-lg bg-secondary/80 flex items-center justify-center font-bold text-xs text-muted-foreground overflow-hidden">
                        {prod.imagem ? (
                          <img
                            src={precificacaoService.getProdutoImageUrl(prod, '100x100')}
                            alt={prod.nome}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          prod.sku.slice(0, 3)
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-foreground">{prod.nome}</span>
                          <Badge variant="outline" className="text-[10px] font-mono">
                            {prod.sku}
                          </Badge>
                          <Badge variant="secondary" className="text-[10px] capitalize">
                            {prod.tipo.replace('_', ' ')}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {prod.expand?.empresa?.nome_fantasia || 'Sem empresa vinculada'}
                          {prod.categoria && ` • ${prod.categoria}`}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 self-end sm:self-center">
                      <div className="text-right">
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground block">
                          Custo Base
                        </span>
                        <span className="text-sm font-semibold font-mono">
                          {formatCurrency(totalCusto)}
                        </span>
                      </div>
                      <Button asChild size="sm" variant="outline" className="border-border">
                        <Link to={`/precificacao/comparar?sku=${prod.sku}`}>
                          Simular
                          <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
