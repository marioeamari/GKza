import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Bookmark,
  CheckCircle2,
  Search,
  Filter,
  ArrowUpDown,
  Calculator,
  RotateCcw,
  Package,
  Layers,
  ArrowRight,
  TrendingUp,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Clock,
  Undo2,
  Trash2,
  Loader2,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Skeleton } from '@/components/ui/skeleton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { useToast } from '@/hooks/use-toast'
import { precificacaoService } from '@/services/precificacao'
import {
  PrecProdutoRecord,
  PrecPrecificacaoRecord,
  PrecCanalRecord,
  PrecCanalModalidadeRecord,
  PrecTaxaRecord,
  PrecPerfilTributarioRecord,
} from '@/types/precificacao'
import { calcularDemonstrativo, DemonstrativoResultado } from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'

type TabFiltroStatus = 'todos' | 'aprovados' | 'salvos'

export default function PrecificacaoAprovados() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [precificacoes, setPrecificacoes] = useState<PrecPrecificacaoRecord[]>([])
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [modalidades, setModalidades] = useState<PrecCanalModalidadeRecord[]>([])
  const [taxas, setTaxas] = useState<PrecTaxaRecord[]>([])
  const [perfisTributarios, setPerfisTributarios] = useState<PrecPerfilTributarioRecord[]>([])

  // Filtros
  const { toast } = useToast()
  const [busca, setBusca] = useState('')
  const [canalFiltro, setCanalFiltro] = useState<string>('todos')
  const [statusAba, setStatusAba] = useState<TabFiltroStatus>('todos')
  const [ordenacao, setOrdenacao] = useState<'recente' | 'preco_desc' | 'margem_desc' | 'nome'>(
    'recente',
  )

  // Estado para confirmação de retirada de aprovação
  const [cenarioParaRetirar, setCenarioParaRetirar] = useState<{
    cenario: PrecPrecificacaoRecord
    produto: PrecProdutoRecord
  } | null>(null)
  const [retirandoAprovacao, setRetirandoAprovacao] = useState(false)

  // Estado para confirmação de exclusão de cenário salvo (rascunho)
  const [cenarioParaExcluir, setCenarioParaExcluir] = useState<{
    cenario: PrecPrecificacaoRecord
    produto: PrecProdutoRecord
  } | null>(null)
  const [excluindoCenario, setExcluindoCenario] = useState(false)

  const recarregarPrecificacoes = async () => {
    try {
      const precs = await precificacaoService.listPrecificacoes()
      setPrecificacoes(precs || [])
    } catch (err) {
      console.error('Erro ao recarregar precificações:', err)
    }
  }

  const handleConfirmarRetirada = async () => {
    if (!cenarioParaRetirar) return
    try {
      setRetirandoAprovacao(true)
      await precificacaoService.retirarAprovacao(cenarioParaRetirar.cenario.id)
      await recarregarPrecificacoes()
      toast({
        title: 'Aprovação retirada',
        description: `O cenário de ${cenarioParaRetirar.produto.nome} voltou para rascunho com sucesso.`,
      })
      setCenarioParaRetirar(null)
    } catch (err) {
      console.error('Erro ao retirar aprovação:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao retirar aprovação',
        description: 'Não foi possível reverter o status do cenário. Tente novamente.',
      })
    } finally {
      setRetirandoAprovacao(false)
    }
  }

  const handleConfirmarExclusao = async () => {
    if (!cenarioParaExcluir) return
    try {
      setExcluindoCenario(true)
      await precificacaoService.excluirCenario(cenarioParaExcluir.cenario.id)
      await recarregarPrecificacoes()
      toast({
        title: 'Cenário removido',
        description: `O cenário salvo de ${cenarioParaExcluir.produto.nome} foi excluído com sucesso.`,
      })
      setCenarioParaExcluir(null)
    } catch (err: unknown) {
      console.error('Erro ao excluir cenário:', err)
      const mensagem =
        err instanceof Error
          ? err.message
          : 'Não foi possível excluir o cenário salvo. Tente novamente.'
      toast({
        variant: 'destructive',
        title: 'Erro ao remover cenário',
        description: mensagem,
      })
    } finally {
      setExcluindoCenario(false)
    }
  }

  useEffect(() => {
    let active = true

    async function carregarDados() {
      try {
        setLoading(true)
        const [prods, precs, chans, mods, txs, tribs] = await Promise.all([
          precificacaoService.listProdutos(),
          precificacaoService.listPrecificacoes(),
          precificacaoService.listCanais(true),
          precificacaoService.listModalidades(),
          precificacaoService.listTaxas(),
          precificacaoService.listPerfisTributarios(),
        ])

        if (active) {
          setProdutos(prods || [])
          setPrecificacoes(precs || [])
          setCanais(chans || [])
          setModalidades(mods || [])
          setTaxas(txs || [])
          setPerfisTributarios(tribs || [])
        }
      } catch (err) {
        console.error('Erro ao carregar dados do repositório de precificações:', err)
      } finally {
        if (active) setLoading(false)
      }
    }

    carregarDados()

    return () => {
      active = false
    }
  }, [])

  // Sincronizar SKU inicial caso venha da URL
  useEffect(() => {
    const skuParam = searchParams.get('sku')
    if (skuParam && !busca) {
      setBusca(skuParam)
    }
  }, [searchParams])

  // Mapas auxiliares para consulta rápida
  const canaisMap = useMemo(() => new Map(canais.map((c) => [c.id, c])), [canais])
  const modalidadesMap = useMemo(() => new Map(modalidades.map((m) => [m.id, m])), [modalidades])

  // Filtragem e classificação das precificações
  const precificacoesFiltradas = useMemo(() => {
    return precificacoes.filter((prec) => {
      // Filtro de status: Aprovados vs Salvos (rascunhos)
      const isAprovado =
        prec.status === 'aprovada' || (prec.preco_aprovado !== undefined && prec.preco_aprovado > 0)
      const isSalvo = prec.status === 'rascunho' || (!isAprovado && prec.status !== 'desatualizada')

      if (statusAba === 'aprovados' && !isAprovado) return false
      if (statusAba === 'salvos' && !isSalvo) return false

      // Filtro por canal
      if (canalFiltro !== 'todos' && prec.canal !== canalFiltro) {
        return false
      }

      // Filtro por texto (produto, SKU, canal, modalidade)
      if (busca.trim()) {
        const termo = busca.trim().toLowerCase()
        const prod = produtos.find((p) => p.id === prec.produto)
        const canal = canaisMap.get(prec.canal)
        const mod = prec.modalidade ? modalidadesMap.get(prec.modalidade) : null

        const matchNome = prod?.nome.toLowerCase().includes(termo) ?? false
        const matchSku = prod?.sku.toLowerCase().includes(termo) ?? false
        const matchCanal = canal?.nome.toLowerCase().includes(termo) ?? false
        const matchMod = mod?.nome.toLowerCase().includes(termo) ?? false

        if (!matchNome && !matchSku && !matchCanal && !matchMod) {
          return false
        }
      }

      return true
    })
  }, [precificacoes, statusAba, canalFiltro, busca, produtos, canaisMap, modalidadesMap])

  // Recalcular demonstrativo em tempo real para cada cenário/produto com as regras e custos vigentes
  const demonstrativosMap = useMemo(() => {
    const mapa = new Map<string, DemonstrativoResultado>()
    const produtosMap = new Map(produtos.map((p) => [p.id, p]))

    // Helper para perfil tributário vigente
    const isPerfilVigente = (perfil: PrecPerfilTributarioRecord): boolean => {
      if (!perfil.vigencia) return true
      const vig = perfil.vigencia.trim()
      if (!vig) return true
      if (/^\d{4}-\d{2}-\d{2}/.test(vig)) {
        const vigDate = new Date(vig)
        if (!isNaN(vigDate.getTime())) {
          return new Date() <= vigDate
        }
      }
      return true
    }
    const perfisValidos = perfisTributarios.filter(isPerfilVigente)

    for (const cenario of precificacoes) {
      const prod = produtosMap.get(cenario.produto)
      if (!prod) continue

      const preco = cenario.preco_aprovado || cenario.premissas?.preco_venda || 0

      // Modalidade e canal
      const modalidade = cenario.modalidade ? modalidadesMap.get(cenario.modalidade) : null

      // Taxas do canal/modalidade vigentes
      const taxasDoCanal = taxas.filter(
        (t) => t.canal === cenario.canal && (!t.modalidade || t.modalidade === cenario.modalidade),
      )

      // Perfil tributário
      const perfilProduto = perfisValidos.find(
        (p) => p.escopo === 'produto' && p.produto === prod.id,
      )
      const perfilEmpresa = prod.empresa
        ? perfisValidos.find((p) => p.escopo === 'empresa' && p.empresa === prod.empresa)
        : null
      const perfilOperacao = perfisValidos.find((p) => p.escopo === 'operacao')
      const perfil = perfilProduto || perfilEmpresa || perfilOperacao

      const aliquotaDas = cenario.premissas?.aliquota_das_pct ?? perfil?.aliquota_das_pct ?? 6.95
      const aliquotaIcms = cenario.premissas?.aliquota_icms_pct ?? perfil?.aliquota_icms_pct ?? 2.23
      const dasImpostoMes = perfil?.outros?.das_imposto_total_mes ?? 76.5
      const pedidosMes = perfil?.outros?.pedidos_estimados_mes ?? 3000
      const prazoRecebimentoDias = modalidade?.prazo_recebimento_dias || 0

      // Descontos salvos no cenário se houver
      const descontosInput = Array.isArray(cenario.premissas?.descontos)
        ? cenario.premissas.descontos.map((d) => ({
            nome: d.nome || 'Desconto',
            tipo: d.tipo || ('percentual' as const),
            valor: d.valor || 0,
            financiado_por: d.financiado_por || ('vendedor' as const),
          }))
        : []

      try {
        const dem = calcularDemonstrativo({
          produto: {
            sku: prod.sku,
            nome: prod.nome,
            tipo: prod.tipo,
            categoria: prod.categoria,
            peso_g: prod.peso_g,
            dimensao_comprimento_cm: prod.dimensao_comprimento_cm,
            dimensao_largura_cm: prod.dimensao_largura_cm,
            dimensao_altura_cm: prod.dimensao_altura_cm,
            composicao: prod.composicao,
            perda_pct: prod.perda_pct,
            custo_aquisicao_unitario: prod.custo_aquisicao_unitario,
            despesas_compra: prod.despesas_compra,
            custo_etiqueta: prod.custo_etiqueta,
            custo_adicional_embalagem: prod.custo_adicional_embalagem,
          },
          preco_anunciado: preco,
          descontos: descontosInput,
          taxas: taxasDoCanal.map((t) => ({
            id: t.id,
            nome: t.nome,
            base_calculo: t.base_calculo,
            tipo_valor: t.tipo_valor,
            valor: t.valor,
            condicao: t.condicao,
            responsavel: t.responsavel,
            tipo_regra: t.tipo_regra,
            financiado_por: t.financiado_por,
            status_conferencia: t.status_conferencia,
          })),
          tributos: {
            aliquota_das_pct: aliquotaDas,
            aliquota_icms_pct: aliquotaIcms,
            das_imposto_total_mes: dasImpostoMes,
            pedidos_estimados_mes: pedidosMes,
          },
          prazo_recebimento_dias: prazoRecebimentoDias,
        })
        mapa.set(cenario.id, dem)
      } catch (err) {
        console.warn(`Erro ao calcular demonstrativo para o cenário ${cenario.id}:`, err)
      }
    }

    return mapa
  }, [precificacoes, produtos, modalidadesMap, taxas, perfisTributarios])

  // Agrupamento por produto
  const gruposPorProduto = useMemo(() => {
    const mapa = new Map<
      string,
      { produto: PrecProdutoRecord; cenarios: PrecPrecificacaoRecord[] }
    >()

    // Criar mapa com produtos que têm cenários filtrados
    for (const prec of precificacoesFiltradas) {
      const prod = produtos.find((p) => p.id === prec.produto)
      if (!prod) continue

      if (!mapa.has(prod.id)) {
        mapa.set(prod.id, { produto: prod, cenarios: [] })
      }
      mapa.get(prod.id)!.cenarios.push(prec)
    }

    // Ordenar cenários dentro de cada produto e transformar em lista ordenada de grupos
    const lista = Array.from(mapa.values()).map((grupo) => {
      // Ordenação interna dos cenários do produto
      grupo.cenarios.sort((a, b) => {
        const precoA = a.preco_aprovado || a.premissas?.preco_venda || 0
        const precoB = b.preco_aprovado || b.premissas?.preco_venda || 0

        const demA = demonstrativosMap.get(a.id)
        const demB = demonstrativosMap.get(b.id)
        const resA = a.resultado as Record<string, unknown> | undefined
        const resB = b.resultado as Record<string, unknown> | undefined

        const margemA = demA?.margem_liquida_pct ?? (resA?.margem_liquida_pct as number) ?? 0
        const margemB = demB?.margem_liquida_pct ?? (resB?.margem_liquida_pct as number) ?? 0

        if (ordenacao === 'preco_desc') return precoB - precoA
        if (ordenacao === 'margem_desc') return margemB - margemA
        return (
          new Date(b.updated || b.created || 0).getTime() -
          new Date(a.updated || a.created || 0).getTime()
        )
      })
      return grupo
    })

    // Ordenação dos grupos de produtos
    lista.sort((a, b) => {
      if (ordenacao === 'nome') return a.produto.nome.localeCompare(b.produto.nome)
      // Por padrão, quem tem cenário mais recente vem primeiro
      const dataA = a.cenarios[0]
        ? new Date(a.cenarios[0].updated || a.cenarios[0].created || 0).getTime()
        : 0
      const dataB = b.cenarios[0]
        ? new Date(b.cenarios[0].updated || b.cenarios[0].created || 0).getTime()
        : 0
      return dataB - dataA
    })

    return lista
  }, [precificacoesFiltradas, produtos, ordenacao, demonstrativosMap])

  // Estatísticas do repositório
  const stats = useMemo(() => {
    let totalAprovados = 0
    let totalSalvos = 0
    const produtosComAprovado = new Set<string>()

    for (const p of precificacoes) {
      const isAprovado =
        p.status === 'aprovada' || (p.preco_aprovado !== undefined && p.preco_aprovado > 0)
      if (isAprovado) {
        totalAprovados++
        produtosComAprovado.add(p.produto)
      } else {
        totalSalvos++
      }
    }

    return {
      totalCenarios: precificacoes.length,
      totalAprovados,
      totalSalvos,
      produtosComAprovado: produtosComAprovado.size,
      totalProdutos: produtos.length,
    }
  }, [precificacoes, produtos])

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Repositório de Cenários Salvos & Aprovados"
        subtitulo="Visão consolidada de todas as simulações salvas e preços oficiais homologados por canal de venda"
        acoes={
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm" className="bg-white">
              <Link to="/precificacao/produtos">
                <Package className="mr-1.5 h-4 w-4" />
                Catálogo de Produtos
              </Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-primary hover:bg-primary/90 text-white font-bold"
            >
              <Link to="/precificacao/comparar">
                <Calculator className="mr-1.5 h-4 w-4" />
                Abrir Comparador
              </Link>
            </Button>
          </div>
        }
      />

      {/* Cards de Resumo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-border bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Total de Cenários
            </CardTitle>
            <Bookmark className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-foreground">{stats.totalCenarios}</div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Rascunhos salvos e preços vigentes
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Preços Aprovados
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-emerald-600">{stats.totalAprovados}</div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Ativos nos canais e alimentando vendas
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cenários Salvos (Rascunhos)
            </CardTitle>
            <Sparkles className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-amber-600">{stats.totalSalvos}</div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              Simulações preservadas para comparação
            </p>
          </CardContent>
        </Card>

        <Card className="border-border bg-white shadow-xs">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Cobertura de Catálogo
            </CardTitle>
            <TrendingUp className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-black text-blue-600">
                {stats.produtosComAprovado}{' '}
                <span className="text-sm font-semibold text-muted-foreground">
                  / {stats.totalProdutos} SKUs
                </span>
              </div>
            )}
            <p className="text-[11px] text-muted-foreground mt-1">
              {stats.totalProdutos > 0
                ? `${Math.round((stats.produtosComAprovado / stats.totalProdutos) * 100)}% dos produtos têm preço homologado`
                : 'Nenhum produto cadastrado'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="border-border bg-white shadow-xs">
        <CardContent className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            {/* Abas: Todos, Aprovados, Salvos */}
            <Tabs
              value={statusAba}
              onValueChange={(val) => setStatusAba(val as TabFiltroStatus)}
              className="w-full md:w-auto"
            >
              <TabsList className="h-9 grid grid-cols-3 bg-secondary/40 border border-border">
                <TabsTrigger
                  value="todos"
                  className="text-xs data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-bold"
                >
                  Todos ({precificacoes.length})
                </TabsTrigger>
                <TabsTrigger
                  value="aprovados"
                  className="text-xs data-[state=active]:bg-emerald-50 data-[state=active]:text-emerald-700 data-[state=active]:font-bold"
                >
                  Aprovados ({stats.totalAprovados})
                </TabsTrigger>
                <TabsTrigger
                  value="salvos"
                  className="text-xs data-[state=active]:bg-amber-50 data-[state=active]:text-amber-700 data-[state=active]:font-bold"
                >
                  Salvos ({stats.totalSalvos})
                </TabsTrigger>
              </TabsList>
            </Tabs>

            {/* Controles da Direita: Busca, Canal e Ordenação */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1 sm:flex-initial">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Buscar produto, SKU, canal..."
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  className="pl-8 h-9 text-xs"
                />
              </div>

              <Select value={canalFiltro} onValueChange={setCanalFiltro}>
                <SelectTrigger className="h-9 text-xs w-[150px]">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Canal" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos" className="text-xs font-semibold">
                    Todos os Canais
                  </SelectItem>
                  {canais.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ordenacao} onValueChange={(v) => setOrdenacao(v as typeof ordenacao)}>
                <SelectTrigger className="h-9 text-xs w-[160px]">
                  <ArrowUpDown className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Ordenar por" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="recente" className="text-xs">
                    Mais Recentes
                  </SelectItem>
                  <SelectItem value="preco_desc" className="text-xs">
                    Maior Preço
                  </SelectItem>
                  <SelectItem value="margem_desc" className="text-xs">
                    Maior Margem %
                  </SelectItem>
                  <SelectItem value="nome" className="text-xs">
                    Nome do Produto
                  </SelectItem>
                </SelectContent>
              </Select>

              {(busca || canalFiltro !== 'todos' || statusAba !== 'todos') && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setBusca('')
                    setCanalFiltro('todos')
                    setStatusAba('todos')
                    setSearchParams({})
                  }}
                  className="h-9 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RotateCcw className="h-3.5 w-3.5 mr-1" />
                  Limpar
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Lista Agrupada por Produto */}
      {loading ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-32 w-full rounded-xl" />
        </div>
      ) : gruposPorProduto.length === 0 ? (
        <Card className="border-border bg-white shadow-xs">
          <CardContent className="p-12 text-center space-y-3">
            <Bookmark className="h-12 w-12 text-muted-foreground/30 mx-auto" />
            <h3 className="text-base font-bold text-foreground">
              Nenhum cenário ou preço encontrado
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Não encontramos cenários salvos ou preços homologados com os filtros atuais. Abra o
              Comparador para simular premissas e salvar novos cenários.
            </p>
            <div className="pt-2 flex justify-center gap-2">
              <Button asChild size="sm" className="bg-primary text-white font-bold">
                <Link to="/precificacao/comparar">
                  <Calculator className="h-4 w-4 mr-1.5" />
                  Abrir Comparador Lado a Lado
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-5">
          {gruposPorProduto.map(({ produto, cenarios }) => {
            const aprovadosCount = cenarios.filter(
              (c) =>
                c.status === 'aprovada' || (c.preco_aprovado !== undefined && c.preco_aprovado > 0),
            ).length
            const salvosCount = cenarios.length - aprovadosCount

            return (
              <Card key={produto.id} className="border-border bg-white shadow-xs overflow-hidden">
                {/* Cabeçalho do Grupo do Produto */}
                <div className="bg-secondary/20 p-4 border-b border-border/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-white border border-border flex items-center justify-center font-bold text-xs text-muted-foreground shrink-0 overflow-hidden shadow-2xs">
                      {produto.imagem ? (
                        <img
                          src={precificacaoService.getProdutoImageUrl(produto, '100x100')}
                          alt={produto.nome}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="font-mono text-primary font-bold">
                          {produto.sku.slice(0, 3)}
                        </span>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-foreground">{produto.nome}</span>
                        <Badge
                          variant="outline"
                          className="font-mono text-[11px] font-bold bg-white text-primary border-primary/30"
                        >
                          {produto.sku}
                        </Badge>
                        {produto.tipo === 'kit' && (
                          <Badge className="bg-primary hover:bg-primary text-white text-[10px] font-semibold border-none">
                            Kit
                          </Badge>
                        )}
                        {produto.tipo === 'combo' && (
                          <Badge className="bg-purple-600 hover:bg-purple-600 text-white text-[10px] font-semibold border-none">
                            Combo
                          </Badge>
                        )}
                        {produto.tipo === 'fabricacao_propria' && (
                          <Badge className="bg-amber-600 hover:bg-amber-600 text-white text-[10px] font-semibold border-none">
                            Fabricação Própria
                          </Badge>
                        )}
                        {produto.tipo === 'revenda' && (
                          <Badge className="bg-blue-600 hover:bg-blue-600 text-white text-[10px] font-semibold border-none">
                            Revenda
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {cenarios.length} cenário(s) registrado(s) •{' '}
                        <span className="text-emerald-700 font-semibold">
                          {aprovadosCount} aprovado(s)
                        </span>
                        {salvosCount > 0 && (
                          <span>
                            {' '}
                            •{' '}
                            <span className="text-amber-700 font-semibold">
                              {salvosCount} salvo(s)
                            </span>
                          </span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    <Button
                      asChild
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs font-semibold bg-white border-primary/30 text-primary hover:bg-primary/5"
                    >
                      <Link to={`/precificacao/comparar?sku=${produto.sku}`}>
                        <Calculator className="h-3.5 w-3.5 mr-1.5" />
                        Simular no Comparador
                      </Link>
                    </Button>
                  </div>
                </div>

                {/* Grid dos Cards de Cenários deste Produto */}
                <CardContent className="p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {cenarios.map((cenario) => {
                      const canal = canaisMap.get(cenario.canal)
                      const modalidade = cenario.modalidade
                        ? modalidadesMap.get(cenario.modalidade)
                        : null
                      const isAprovado =
                        cenario.status === 'aprovada' ||
                        (cenario.preco_aprovado !== undefined && cenario.preco_aprovado > 0)
                      const preco = cenario.preco_aprovado || cenario.premissas?.preco_venda || 0

                      const dem = demonstrativosMap.get(cenario.id)
                      const resultado = cenario.resultado as Record<string, unknown> | undefined

                      const lucroLiquido =
                        dem?.lucro_liquido ?? ((resultado?.lucro_liquido as number) || 0)
                      const margemPct =
                        dem?.margem_liquida_pct ?? ((resultado?.margem_liquida_pct as number) || 0)
                      const taxasTotal =
                        dem?.total_taxas_retidas_canal ??
                        ((resultado?.total_taxas_retidas_canal as number) || 0)

                      return (
                        <div
                          key={cenario.id}
                          className={`rounded-xl border p-3.5 transition-all flex flex-col justify-between gap-3 shadow-2xs hover:shadow-xs ${
                            isAprovado
                              ? 'border-emerald-300 bg-emerald-50/20'
                              : 'border-border bg-white hover:border-border/80'
                          }`}
                        >
                          <div className="space-y-2">
                            {/* Linha Superior: Canal + Modalidade + Badge de Status + Ação de Retirar */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5 min-w-0">
                                <span
                                  className="h-2.5 w-2.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      canal?.cor || (isAprovado ? '#10B981' : '#DF5830'),
                                  }}
                                />
                                <span className="font-bold text-xs text-foreground truncate">
                                  {canal?.nome || 'Canal'}
                                </span>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {isAprovado ? (
                                  <>
                                    <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[10px] h-5 px-1.5 font-bold shrink-0 gap-1">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Aprovado {cenario.versao ? `(v${cenario.versao})` : ''}
                                    </Badge>
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              setCenarioParaRetirar({ cenario, produto })
                                            }
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-amber-700 hover:bg-amber-100/60 transition-colors"
                                            aria-label="Retirar aprovação"
                                          >
                                            <Undo2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                          Retirar aprovação
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </>
                                ) : (
                                  <>
                                    <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] h-5 px-1.5 font-bold shrink-0 gap-1">
                                      <Bookmark className="h-3 w-3" />
                                      Salvo {cenario.versao ? `(v${cenario.versao})` : ''}
                                    </Badge>
                                    <TooltipProvider delayDuration={200}>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            onClick={() =>
                                              setCenarioParaExcluir({ cenario, produto })
                                            }
                                            className="h-6 w-6 p-0 text-muted-foreground hover:text-red-700 hover:bg-red-100/60 transition-colors"
                                            aria-label="Remover cenário salvo"
                                          >
                                            <Trash2 className="h-3.5 w-3.5" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                          Remover cenário salvo
                                        </TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Modalidade */}
                            <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                              <span className="font-medium text-foreground">
                                {modalidade?.nome || 'Modalidade Padrão'}
                              </span>
                              {modalidade?.prazo_recebimento_dias !== undefined && (
                                <span className="text-[10px]">
                                  {modalidade.prazo_recebimento_dias} dias p/ repasse
                                </span>
                              )}
                            </div>

                            {/* Destaque do Preço */}
                            <div className="p-2.5 rounded-lg bg-secondary/30 border border-border/60 flex items-center justify-between">
                              <div>
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                  {isAprovado ? 'Preço Homologado' : 'Preço Simulado'}
                                </span>
                                <span className="text-base font-black font-mono text-foreground">
                                  {formatCurrency(preco)}
                                </span>
                              </div>

                              <div className="text-right">
                                <span className="text-[10px] uppercase font-bold text-muted-foreground block">
                                  Margem Líquida
                                </span>
                                <span
                                  className={`text-sm font-black font-mono ${
                                    margemPct > 0 ? 'text-emerald-600' : 'text-red-600'
                                  }`}
                                >
                                  {margemPct > 0 ? '+' : ''}
                                  {margemPct.toFixed(1)}%
                                </span>
                              </div>
                            </div>

                            {/* Detalhamento dos custos e lucro */}
                            <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                              <div>
                                <span className="text-muted-foreground">Lucro Líquido: </span>
                                <span
                                  className={`font-mono font-bold ${
                                    lucroLiquido > 0 ? 'text-emerald-600' : 'text-red-600'
                                  }`}
                                >
                                  {formatCurrency(lucroLiquido)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-muted-foreground">Taxas Est.: </span>
                                <span className="font-mono font-semibold text-foreground">
                                  {formatCurrency(taxasTotal)}
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Rodapé do Card: Data e Ação */}
                          <div className="pt-2 border-t border-border/50 flex items-center justify-between text-[10px] text-muted-foreground">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              <span>
                                {isAprovado && cenario.aprovado_em
                                  ? `Aprovado em ${new Date(cenario.aprovado_em).toLocaleDateString('pt-BR')}`
                                  : `Salvo em ${new Date(cenario.updated || cenario.created || '').toLocaleDateString('pt-BR')}`}
                              </span>
                            </div>

                            <Button
                              asChild
                              variant="ghost"
                              size="sm"
                              className="h-6 px-1.5 text-[10px] font-bold text-primary hover:text-primary hover:bg-primary/10"
                            >
                              <Link
                                to={`/precificacao/comparar?sku=${produto.sku}&cenarioId=${cenario.id}`}
                              >
                                Abrir
                                <ArrowRight className="h-2.5 w-2.5 ml-1" />
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
          })}
        </div>
      )}

      {/* AlertDialog de Confirmação para Retirar Aprovação */}
      <AlertDialog
        open={!!cenarioParaRetirar}
        onOpenChange={(open) => {
          if (!open && !retirandoAprovacao) {
            setCenarioParaRetirar(null)
          }
        }}
      >
        <AlertDialogContent className="bg-white border-border sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-primary mb-1">
              <Undo2 className="h-5 w-5 text-primary" />
              <AlertDialogTitle className="text-base font-bold text-foreground">
                Retirar aprovação do cenário?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-2 text-left">
                <p>
                  Você está retirando a aprovação do preço{' '}
                  <strong className="text-foreground font-mono">
                    {cenarioParaRetirar?.cenario.preco_aprovado
                      ? formatCurrency(cenarioParaRetirar.cenario.preco_aprovado)
                      : ''}
                  </strong>{' '}
                  para o produto{' '}
                  <strong className="text-foreground">{cenarioParaRetirar?.produto.nome}</strong> no
                  canal{' '}
                  <strong className="text-foreground">
                    {cenarioParaRetirar
                      ? canaisMap.get(cenarioParaRetirar.cenario.canal)?.nome || 'Canal'
                      : ''}
                  </strong>
                  .
                </p>
                <p className="bg-amber-50 border border-amber-200 text-amber-900 p-2.5 rounded-lg text-[11px] leading-relaxed">
                  O cenário voltará para rascunho e o preço aprovado será removido. As vendas já
                  registradas não são afetadas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel
              disabled={retirandoAprovacao}
              className="text-xs h-9 bg-secondary/50 hover:bg-secondary border-border"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={retirandoAprovacao}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmarRetirada()
              }}
              className="text-xs h-9 bg-primary hover:bg-primary/90 text-white font-bold gap-1.5"
            >
              {retirandoAprovacao ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Retirando...
                </>
              ) : (
                <>
                  <Undo2 className="h-3.5 w-3.5" />
                  Retirar aprovação
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* AlertDialog de Confirmação para Excluir Cenário Salvo (Rascunho) */}
      <AlertDialog
        open={!!cenarioParaExcluir}
        onOpenChange={(open) => {
          if (!open && !excluindoCenario) {
            setCenarioParaExcluir(null)
          }
        }}
      >
        <AlertDialogContent className="bg-white border-border sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive mb-1">
              <Trash2 className="h-5 w-5 text-destructive" />
              <AlertDialogTitle className="text-base font-bold text-foreground">
                Excluir cenário salvo?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-2 text-left">
                <p>
                  Você está prestes a remover o cenário salvo{' '}
                  {cenarioParaExcluir?.cenario.versao ? (
                    <span className="font-semibold text-foreground">
                      (versão {cenarioParaExcluir.cenario.versao})
                    </span>
                  ) : (
                    ''
                  )}{' '}
                  do produto{' '}
                  <strong className="text-foreground">{cenarioParaExcluir?.produto.nome}</strong> no
                  canal{' '}
                  <strong className="text-foreground">
                    {cenarioParaExcluir
                      ? canaisMap.get(cenarioParaExcluir.cenario.canal)?.nome || 'Canal'
                      : ''}
                  </strong>
                  .
                </p>
                <p className="bg-destructive/10 border border-destructive/20 text-destructive p-2.5 rounded-lg text-[11px] leading-relaxed">
                  O cenário salvo será excluído permanentemente. Esta ação não pode ser desfeita.
                  Vendas já registradas não são afetadas.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="mt-2">
            <AlertDialogCancel
              disabled={excluindoCenario}
              className="text-xs h-9 bg-secondary/50 hover:bg-secondary border-border"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={excluindoCenario}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmarExclusao()
              }}
              className="text-xs h-9 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold gap-1.5"
            >
              {excluindoCenario ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Excluindo...
                </>
              ) : (
                <>
                  <Trash2 className="h-3.5 w-3.5" />
                  Excluir cenário
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
