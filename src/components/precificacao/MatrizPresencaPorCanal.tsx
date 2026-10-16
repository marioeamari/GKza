import { useState, useMemo } from 'react'
import {
  PrecCanalRecord,
  PrecCategoriaProdutoRecord,
  PrecMatrizClassificacaoRecord,
  PrecMatrizLegendaRecord,
  PrecProdutoRecord,
} from '@/types/precificacao'
import { precificacaoService } from '@/services/precificacao'
import { formatCurrency } from '@/lib/format'
import {
  agruparProdutosPorCategoria,
  extrairDadosCelulaMatriz,
  filtrarProdutosMatriz,
  getTextoContraste,
  normalizarLista,
  PrecoAprovadoCanalInfo,
} from '@/lib/precificacao/matrizHelpers'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Search,
  Filter,
  Palette,
  Tag,
  Check,
  X,
  Package,
  Layers,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'
import { useToast } from '@/hooks/use-toast'

import { PrecCanalModalidadeRecord } from '@/types/precificacao'

interface MatrizPresencaProps {
  canais: PrecCanalRecord[]
  produtos: PrecProdutoRecord[]
  categorias: PrecCategoriaProdutoRecord[]
  legendas: PrecMatrizLegendaRecord[]
  modalidades?: PrecCanalModalidadeRecord[]
  classificacoes: PrecMatrizClassificacaoRecord[]
  mapaPrecoPorProdCanal: Record<string, PrecoAprovadoCanalInfo>
  loading?: boolean
  onAbrirLegendas: () => void
  onAbrirCategorias: () => void
  onAtualizacaoClassificacao?: () => void
}

export function MatrizPresencaPorCanal({
  canais,
  produtos,
  categorias,
  legendas,
  modalidades: modalidadesIniciais = [],
  classificacoes: classificacoesIniciais,
  mapaPrecoPorProdCanal,
  loading = false,
  onAbrirLegendas,
  onAbrirCategorias,
  onAtualizacaoClassificacao,
}: MatrizPresencaProps) {
  const { toast } = useToast()

  // Estados locais com normalização
  const [busca, setBusca] = useState('')
  const [categoriaFiltro, setCategoriaFiltro] = useState<string>('todas')
  const [classificacoesLocais, setClassificacoesLocais] =
    useState<PrecMatrizClassificacaoRecord[]>(classificacoesIniciais)
  const [salvandoCelula, setSalvandoCelula] = useState<string | null>(null)
  const [popoverAberto, setPopoverAberto] = useState<string | null>(null)
  // Estado do seletor de modalidade por coluna: Record<canalId, modalidadeId | '__vigente__'>
  const [modalidadePorColuna, setModalidadePorColuna] = useState<Record<string, string>>({})

  // Sincroniza se as classificações externas mudarem
  useMemo(() => {
    setClassificacoesLocais(normalizarLista(classificacoesIniciais))
  }, [classificacoesIniciais])

  const canaisNormalizados = useMemo(() => {
    return normalizarLista<PrecCanalRecord>(canais).filter((c) => c.ativo !== false)
  }, [canais])

  const legendasNormalizadas = useMemo(() => {
    return normalizarLista<PrecMatrizLegendaRecord>(legendas).filter((l) => l.ativo !== false)
  }, [legendas])

  const categoriasNormalizadas = useMemo(() => {
    return normalizarLista<PrecCategoriaProdutoRecord>(categorias)
  }, [categorias])

  const modalidadesNormalizadas = useMemo(() => {
    return normalizarLista<PrecCanalModalidadeRecord>(modalidadesIniciais)
  }, [modalidadesIniciais])

  const mapaModalidadesPorId = useMemo(() => {
    const map = new Map<string, { id: string; nome: string; canal: string }>()
    modalidadesNormalizadas.forEach((m) => {
      if (m.id) {
        map.set(m.id, { id: m.id, nome: m.nome, canal: m.canal })
      }
    })
    return map
  }, [modalidadesNormalizadas])

  // Mapas rápidos
  const mapaLegendas = useMemo(() => {
    const map = new Map<string, PrecMatrizLegendaRecord>()
    legendasNormalizadas.forEach((l) => {
      if (l.id) map.set(l.id, l)
    })
    return map
  }, [legendasNormalizadas])

  const mapaClassificacoes = useMemo(() => {
    const map = new Map<string, PrecMatrizClassificacaoRecord>()
    classificacoesLocais.forEach((c) => {
      if (c.produto && c.canal) {
        map.set(`${c.produto}__${c.canal}`, c)
      }
    })
    return map
  }, [classificacoesLocais])

  // Filtragem e agrupamento de produtos
  const produtosFiltrados = useMemo(() => {
    return filtrarProdutosMatriz(produtos, busca, categoriaFiltro)
  }, [produtos, busca, categoriaFiltro])

  const gruposPorCategoria = useMemo(() => {
    return agruparProdutosPorCategoria(produtosFiltrados, categoriasNormalizadas)
  }, [produtosFiltrados, categoriasNormalizadas])

  // Total de produtos na matriz
  const totalProdutosAprovados = normalizarLista(produtos).length

  // Ação de definir classificação e/ou modalidade na célula com atualização otimista
  async function handleSalvarCelula({
    produtoId,
    canalId,
    legendaId,
    modalidadeId,
  }: {
    produtoId: string
    canalId: string
    legendaId: string | null
    modalidadeId?: string | null
  }) {
    const chave = `${produtoId}__${canalId}`
    const classificacaoAnterior = mapaClassificacoes.get(chave)

    // Atualização otimista imediata na UI
    if (!legendaId) {
      setClassificacoesLocais((prev) =>
        prev.filter((c) => !(c.produto === produtoId && c.canal === canalId)),
      )
    } else {
      const legObj = mapaLegendas.get(legendaId)
      const modObj = modalidadeId ? mapaModalidadesPorId.get(modalidadeId) : undefined
      const novaModalidadeVal =
        modalidadeId !== undefined ? modalidadeId || undefined : classificacaoAnterior?.modalidade

      const novaClassificacao: PrecMatrizClassificacaoRecord = {
        id: classificacaoAnterior?.id || `temp_${Date.now()}`,
        produto: produtoId,
        canal: canalId,
        legenda: legendaId,
        modalidade: novaModalidadeVal,
        created: classificacaoAnterior?.created || new Date().toISOString(),
        updated: new Date().toISOString(),
        expand: {
          legenda: legObj || classificacaoAnterior?.expand?.legenda,
          modalidade: modObj
            ? ({
                id: modObj.id,
                nome: modObj.nome,
                canal: modObj.canal,
                created: '',
                updated: '',
              } as PrecCanalModalidadeRecord)
            : novaModalidadeVal === classificacaoAnterior?.modalidade
              ? classificacaoAnterior?.expand?.modalidade
              : undefined,
        },
      }

      setClassificacoesLocais((prev) => {
        const semAtual = prev.filter((c) => !(c.produto === produtoId && c.canal === canalId))
        return [...semAtual, novaClassificacao]
      })
    }

    setPopoverAberto(null)
    setSalvandoCelula(chave)

    try {
      await precificacaoService.setMatrizClassificacao({
        produtoId,
        canalId,
        legendaId,
        modalidadeId,
      })
      onAtualizacaoClassificacao?.()
    } catch (err) {
      console.error('Erro ao salvar dados da célula na matriz:', err)
      // Reverter se falhar
      if (classificacaoAnterior) {
        setClassificacoesLocais((prev) => {
          const semAtual = prev.filter((c) => !(c.produto === produtoId && c.canal === canalId))
          return [...semAtual, classificacaoAnterior]
        })
      } else {
        setClassificacoesLocais((prev) =>
          prev.filter((c) => !(c.produto === produtoId && c.canal === canalId)),
        )
      }
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar alteração',
        description: 'Não foi possível registrar a alteração no servidor.',
      })
    } finally {
      setSalvandoCelula(null)
    }
  }

  // Helper para trocar a modalidade de uma célula preservando sua legenda
  function handleTrocarModalidadeCelula(
    produtoId: string,
    canalId: string,
    novaModalidadeId: string | null,
  ) {
    const chave = `${produtoId}__${canalId}`
    const classificacao = mapaClassificacoes.get(chave)
    // Se ainda não tem legenda selecionada, usa a primeira legenda ativa como padrão (ex.: "Ativo")
    const legendaId = classificacao?.legenda || legendasNormalizadas[0]?.id || ''
    if (!legendaId) {
      toast({
        variant: 'destructive',
        title: 'Selecione uma classificação primeiro',
      })
      return
    }

    handleSalvarCelula({
      produtoId,
      canalId,
      legendaId,
      modalidadeId: novaModalidadeId,
    })
  }

  return (
    <div className="space-y-4">
      {/* Barra de Filtros e Controles */}
      <div className="bg-white border border-border/80 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-1 flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          {/* Busca por SKU ou Nome */}
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por SKU ou referência..."
              className="pl-9 h-9 text-xs bg-secondary/20 border-border"
            />
            {busca && (
              <button
                type="button"
                onClick={() => setBusca('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground text-xs"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Filtro por Categoria */}
          <div className="w-full sm:w-[220px]">
            <Select value={categoriaFiltro} onValueChange={setCategoriaFiltro}>
              <SelectTrigger className="h-9 text-xs bg-secondary/20 border-border">
                <div className="flex items-center gap-1.5 truncate">
                  <Filter className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <SelectValue placeholder="Todas as categorias" />
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todas" className="text-xs">
                  Todas as Categorias ({totalProdutosAprovados})
                </SelectItem>
                {categoriasNormalizadas.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 rounded-full shrink-0"
                        style={{ backgroundColor: c.cor || '#0284C7' }}
                      />
                      <span>{c.nome}</span>
                    </div>
                  </SelectItem>
                ))}
                <SelectItem value="__sem_categoria__" className="text-xs">
                  Sem categoria
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Botões de Gestão: Legendas e Categorias */}
        <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAbrirLegendas}
            className="h-9 text-xs font-semibold border-border hover:bg-secondary/40 shadow-xs"
          >
            <Palette className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Legendas ({legendasNormalizadas.length})
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onAbrirCategorias}
            className="h-9 text-xs font-semibold border-border hover:bg-secondary/40 shadow-xs"
          >
            <Tag className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Categorias ({categoriasNormalizadas.length})
          </Button>
        </div>
      </div>

      {/* Faixa Informativa / Resumo da Planilha */}
      <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-foreground">
            {produtosFiltrados.length}{' '}
            {produtosFiltrados.length === 1 ? 'produto exibido' : 'produtos exibidos'}
          </span>
          <span>•</span>
          <span>{canaisNormalizados.length} canais mapeados</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] hidden sm:inline text-muted-foreground">
            Dica: clique na célula para classificar ou limpar a presença no canal.
          </span>
        </div>
      </div>

      {/* Grade tipo Planilha do Usuário com colunas congeladas e scroll horizontal independente */}
      <div className="relative border border-border/80 rounded-2xl bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[72vh] scrollbar-thin">
          <table className="w-full border-collapse text-xs select-none">
            {/* Cabeçalho da Tabela */}
            <thead className="sticky top-0 z-30 bg-slate-100/95 backdrop-blur-xs shadow-xs">
              <tr className="border-b border-border/80">
                {/* Coluna 1 Fixa: SKU */}
                <th
                  scope="col"
                  className="sticky left-0 z-40 bg-slate-100 px-3 py-3 text-left font-bold text-foreground w-[110px] min-w-[110px] max-w-[110px] border-r border-border/60 uppercase tracking-wider text-[11px]"
                >
                  SKU
                </th>

                {/* Coluna 2 Fixa: Referência (Nome) */}
                <th
                  scope="col"
                  className="sticky left-[110px] z-40 bg-slate-100 px-3 py-3 text-left font-bold text-foreground w-[260px] min-w-[260px] max-w-[260px] border-r border-border/60 uppercase tracking-wider text-[11px]"
                >
                  Referência
                </th>

                {/* Coluna 3 Fixa: Miniatura Img */}
                <th
                  scope="col"
                  className="sticky left-[370px] z-40 bg-slate-100 px-2 py-3 text-center font-bold text-foreground w-[54px] min-w-[54px] max-w-[54px] border-r-2 border-slate-300 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] uppercase tracking-wider text-[11px]"
                >
                  Img
                </th>

                {/* Colunas Dinâmicas: Todos os Canais da base de canais (prec_canais) */}
                {canaisNormalizados.map((canal) => {
                  const corCanal = canal.cor || '#DF5830'
                  const corTextoCabecalho = getTextoContraste(corCanal)
                  const modalidadesCanal = modalidadesNormalizadas.filter(
                    (m) => m.canal === canal.id && m.ativo !== false,
                  )
                  const modalidadeSelecionadaColuna = modalidadePorColuna[canal.id] || '__vigente__'

                  return (
                    <th
                      key={canal.id}
                      scope="col"
                      style={{ backgroundColor: corCanal, color: corTextoCabecalho }}
                      className="px-3 py-2 text-center font-extrabold min-w-[145px] border-r border-black/10 transition-colors shadow-2xs"
                    >
                      <div className="flex flex-col items-center justify-center gap-1">
                        <span className="truncate text-xs font-black tracking-wide block max-w-[140px]">
                          {canal.nome}
                        </span>

                        {/* Seletor no topo da matriz para trocar a modalidade exibida da COLUNA inteira */}
                        {modalidadesCanal.length > 0 && (
                          <div
                            className="w-full max-w-[135px]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Select
                              value={modalidadeSelecionadaColuna}
                              onValueChange={(val) => {
                                setModalidadePorColuna((prev) => ({
                                  ...prev,
                                  [canal.id]: val,
                                }))
                              }}
                            >
                              <SelectTrigger
                                aria-label={`Modalidade da coluna ${canal.nome}`}
                                className="h-6 text-[10px] px-1.5 py-0 bg-black/20 hover:bg-black/30 border-white/20 text-inherit font-semibold rounded-md shadow-2xs flex items-center justify-between"
                              >
                                <span className="truncate text-[10px]">
                                  {modalidadeSelecionadaColuna === '__vigente__'
                                    ? 'Mod: Vigente'
                                    : modalidadesCanal.find(
                                        (m) => m.id === modalidadeSelecionadaColuna,
                                      )?.nome || 'Mod: Vigente'}
                                </span>
                              </SelectTrigger>
                              <SelectContent className="text-xs bg-white text-foreground z-50">
                                <SelectItem value="__vigente__" className="text-xs font-semibold">
                                  ⚡ Vigente (Automático)
                                </SelectItem>
                                {modalidadesCanal.map((m) => (
                                  <SelectItem key={m.id} value={m.id} className="text-xs">
                                    {m.nome}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                      </div>
                    </th>
                  )
                })}
              </tr>
            </thead>

            {/* Corpo da Tabela */}
            <tbody className="divide-y divide-border/60">
              {loading ? (
                <tr>
                  <td
                    colSpan={3 + canaisNormalizados.length}
                    className="p-12 text-center text-muted-foreground text-xs"
                  >
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                      <span>Carregando dados da matriz de canais...</span>
                    </div>
                  </td>
                </tr>
              ) : produtosFiltrados.length === 0 ? (
                <tr>
                  <td
                    colSpan={3 + canaisNormalizados.length}
                    className="p-12 text-center text-muted-foreground text-xs"
                  >
                    <div className="flex flex-col items-center justify-center gap-2 max-w-md mx-auto">
                      <Package className="h-8 w-8 text-muted-foreground/50" />
                      <p className="font-bold text-foreground">Nenhum produto encontrado</p>
                      <p className="text-[11px] leading-relaxed">
                        A matriz exibe os produtos do repositório de aprovados (com preço aprovado
                        vigente em qualquer canal). Se você acabou de cadastrar produtos, homologue
                        ou salve seus cenários no Comparador para que eles apareçam aqui.
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                gruposPorCategoria.map((grupo) => (
                  <tr key={`group_wrapper_${grupo.id}`} className="contents">
                    {/* Linha de Título da Categoria */}
                    <tr
                      key={`header_${grupo.id}`}
                      className="bg-slate-50/90 font-bold border-y border-border/80"
                    >
                      <td
                        colSpan={3 + canaisNormalizados.length}
                        style={{ borderLeftColor: grupo.cor || '#0284C7' }}
                        className="py-2 px-3 text-xs border-l-4"
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: grupo.cor || '#0284C7' }}
                          />
                          <span className="font-extrabold uppercase tracking-wide text-foreground text-[11px]">
                            {grupo.nome}
                          </span>
                          <Badge
                            variant="secondary"
                            className="text-[10px] h-4 px-1.5 py-0 font-normal bg-white border border-border/60 text-muted-foreground"
                          >
                            {grupo.produtos.length} {grupo.produtos.length === 1 ? 'item' : 'itens'}
                          </Badge>
                        </div>
                      </td>
                    </tr>

                    {/* Linhas de Produtos dentro deste grupo */}
                    {grupo.produtos.map((produto, pIndex) => {
                      const zebra = pIndex % 2 === 1 ? 'bg-slate-50/40' : 'bg-white'
                      const thumbUrl = produto.imagem
                        ? precificacaoService.getProdutoImageUrl(produto, '80x80')
                        : ''

                      return (
                        <tr
                          key={produto.id}
                          className={`${zebra} hover:bg-amber-50/30 transition-colors group`}
                        >
                          {/* Coluna 1 Fixa: SKU */}
                          <td className="sticky left-0 z-20 bg-inherit px-3 py-2 text-left font-mono font-bold text-foreground border-r border-border/60 truncate w-[110px] min-w-[110px] max-w-[110px] text-xs">
                            <span title={produto.sku} className="truncate block">
                              {produto.sku}
                            </span>
                          </td>

                          {/* Coluna 2 Fixa: Referência / Nome */}
                          <td className="sticky left-[110px] z-20 bg-inherit px-3 py-2 text-left font-medium text-foreground border-r border-border/60 truncate w-[260px] min-w-[260px] max-w-[260px] text-xs">
                            <span title={produto.nome} className="truncate block">
                              {produto.nome}
                            </span>
                          </td>

                          {/* Coluna 3 Fixa: Miniatura da Imagem */}
                          <td className="sticky left-[370px] z-20 bg-inherit px-1.5 py-1 text-center border-r-2 border-slate-300 shadow-[2px_0_4px_-1px_rgba(0,0,0,0.06)] w-[54px] min-w-[54px] max-w-[54px]">
                            <div className="h-8 w-8 mx-auto rounded-md bg-secondary/30 border border-border/70 flex items-center justify-center overflow-hidden">
                              {thumbUrl ? (
                                <img
                                  src={thumbUrl}
                                  alt={produto.nome}
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <span className="text-[9px] font-mono font-bold text-muted-foreground/60">
                                  {produto.sku.slice(0, 2)}
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Células Produto × Canais */}
                          {canaisNormalizados.map((canal) => {
                            const chave = `${produto.id}__${canal.id}`
                            const modColunaVal = modalidadePorColuna[canal.id]
                            const modColunaId =
                              modColunaVal && modColunaVal !== '__vigente__'
                                ? modColunaVal
                                : undefined

                            const celula = extrairDadosCelulaMatriz({
                              produtoId: produto.id,
                              canalId: canal.id,
                              mapaClassificacoes,
                              mapaPrecoPorProdCanal,
                              mapaLegendas,
                              modalidadeColunaId: modColunaId,
                              mapaModalidadesPorId,
                            })

                            const isSalvando = salvandoCelula === chave
                            const temClassificacao = !!celula.classificacao && !!celula.legenda
                            const corFundo = temClassificacao
                              ? celula.legenda?.cor || '#10B981'
                              : 'transparent'
                            const corTexto = temClassificacao
                              ? celula.legenda?.cor_texto || getTextoContraste(celula.legenda?.cor)
                              : '#6B7280'

                            const temPreco = celula.precoInfo && celula.precoInfo.preco_aprovado > 0
                            const valorFormatado = temPreco
                              ? formatCurrency(celula.precoInfo!.preco_aprovado)
                              : temClassificacao
                                ? celula.legenda?.nome
                                : ''

                            // Exibição do preço com indicação discreta da modalidade (ex.: 'R$ 24,90 · MEI')
                            const modalidadeIndicador = celula.modalidadeEfetivaNome
                            const textoLinhaPrincipal =
                              temPreco && modalidadeIndicador
                                ? `${valorFormatado} · ${modalidadeIndicador}`
                                : valorFormatado

                            const temLucroGravado =
                              temPreco &&
                              celula.precoInfo?.lucro_liquido !== undefined &&
                              celula.precoInfo?.lucro_liquido !== null
                            const lucroFormatado = temLucroGravado
                              ? `Lucro ${formatCurrency(celula.precoInfo!.lucro_liquido!)}`
                              : null

                            const isDesatualizada = celula.precoInfo?.status === 'desatualizada'
                            const avisoDesatualizadaTexto =
                              'Precificação desatualizada — confira em /precificacao'

                            const tooltipConteudo = isDesatualizada ? (
                              <div className="space-y-1 text-xs">
                                <div className="font-bold flex items-center gap-1.5 text-amber-600">
                                  <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                  <span>{avisoDesatualizadaTexto}</span>
                                </div>
                                {temClassificacao && (
                                  <div className="flex items-center gap-1.5 text-[11px] pt-0.5">
                                    <span
                                      className="h-2 w-2 rounded-full"
                                      style={{ backgroundColor: celula.legenda?.cor }}
                                    />
                                    <span>{celula.legenda?.nome}</span>
                                  </div>
                                )}
                                {temPreco && (
                                  <div className="text-[11px] space-y-0.5">
                                    <div>
                                      Preço:{' '}
                                      <strong className="font-mono">
                                        {formatCurrency(celula.precoInfo!.preco_aprovado)}
                                      </strong>
                                    </div>
                                    {temLucroGravado && (
                                      <div>
                                        Lucro Líquido:{' '}
                                        <strong className="font-mono">
                                          {formatCurrency(celula.precoInfo!.lucro_liquido!)}
                                        </strong>
                                      </div>
                                    )}
                                    {modalidadeIndicador && (
                                      <div className="text-[10px] text-muted-foreground">
                                        Modalidade: <strong>{modalidadeIndicador}</strong>
                                        {celula.isEscolhaManual ? ' (escolha manual)' : ''}
                                      </div>
                                    )}
                                  </div>
                                )}
                                <div className="text-[10px] text-muted-foreground/80 pt-1">
                                  Clique para alterar classificação ou modalidade
                                </div>
                              </div>
                            ) : temClassificacao ? (
                              <div className="space-y-1 text-xs">
                                <div className="font-bold flex items-center gap-1.5">
                                  <span
                                    className="h-2 w-2 rounded-full"
                                    style={{ backgroundColor: celula.legenda?.cor }}
                                  />
                                  <span>{celula.legenda?.nome}</span>
                                </div>
                                {temPreco ? (
                                  <div className="text-[11px] space-y-0.5">
                                    <div>
                                      Preço:{' '}
                                      <strong className="font-mono">
                                        {formatCurrency(celula.precoInfo!.preco_aprovado)}
                                      </strong>
                                    </div>
                                    {temLucroGravado && (
                                      <div>
                                        Lucro Líquido:{' '}
                                        <strong className="font-mono">
                                          {formatCurrency(celula.precoInfo!.lucro_liquido!)}
                                        </strong>
                                      </div>
                                    )}
                                    {modalidadeIndicador && (
                                      <div className="text-[10px] text-muted-foreground">
                                        Modalidade: <strong>{modalidadeIndicador}</strong>
                                        {celula.isEscolhaManual ? ' (escolha manual)' : ''}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <div className="text-[11px] text-muted-foreground">
                                    Sem preço aprovado cadastrado neste canal
                                  </div>
                                )}
                                <div className="text-[10px] text-muted-foreground/80 pt-1">
                                  Clique para alterar classificação ou modalidade
                                </div>
                              </div>
                            ) : (
                              <div className="text-xs">
                                <span>Sem classificação no canal {canal.nome}</span>
                                <div className="text-[10px] text-muted-foreground/80 pt-0.5">
                                  Clique para atribuir (Ativo, Rejeitado, Análise...)
                                </div>
                              </div>
                            )

                            return (
                              <td
                                key={canal.id}
                                className="p-1 text-center border-r border-border/50 align-middle"
                              >
                                <TooltipProvider delayDuration={250}>
                                  <Tooltip>
                                    <Popover
                                      open={popoverAberto === chave}
                                      onOpenChange={(op) => setPopoverAberto(op ? chave : null)}
                                    >
                                      <TooltipTrigger asChild>
                                        <PopoverTrigger asChild>
                                          <button
                                            type="button"
                                            disabled={isSalvando}
                                            style={
                                              temClassificacao
                                                ? {
                                                    backgroundColor: corFundo,
                                                    color: corTexto,
                                                  }
                                                : undefined
                                            }
                                            className={`w-full min-h-[34px] py-1 rounded-md px-1.5 font-bold font-mono text-[11px] transition-all flex flex-col items-center justify-center border text-center ${
                                              temClassificacao
                                                ? 'border-black/15 shadow-2xs hover:scale-[1.02] cursor-pointer'
                                                : 'bg-slate-50/50 hover:bg-slate-100/90 text-muted-foreground/50 border-dashed border-border/70 hover:border-border cursor-pointer'
                                            }`}
                                          >
                                            {isSalvando ? (
                                              <span className="h-3 w-3 border-2 border-white/80 border-t-transparent rounded-full animate-spin" />
                                            ) : textoLinhaPrincipal ? (
                                              <div className="w-full flex flex-col items-center justify-center leading-tight">
                                                <div className="flex items-center justify-center gap-1 max-w-full">
                                                  {isDesatualizada && (
                                                    <AlertTriangle
                                                      className="h-3 w-3 shrink-0 text-amber-400 drop-shadow-xs"
                                                      aria-label={avisoDesatualizadaTexto}
                                                    />
                                                  )}
                                                  <span className="truncate block">
                                                    {valorFormatado}
                                                    {modalidadeIndicador && (
                                                      <span className="inline-flex items-center gap-0.5 ml-1 font-semibold opacity-90">
                                                        <span>· {modalidadeIndicador}</span>
                                                        {isDesatualizada && (
                                                          <AlertTriangle
                                                            className="h-2.5 w-2.5 shrink-0 text-amber-400"
                                                            aria-label={avisoDesatualizadaTexto}
                                                          />
                                                        )}
                                                      </span>
                                                    )}
                                                  </span>
                                                </div>
                                                {lucroFormatado && (
                                                  <span className="text-[9.5px] font-medium opacity-90 truncate block tracking-tight">
                                                    {lucroFormatado}
                                                  </span>
                                                )}
                                              </div>
                                            ) : (
                                              <span className="truncate block leading-tight">
                                                —
                                              </span>
                                            )}
                                          </button>
                                        </PopoverTrigger>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs max-w-xs">
                                        {tooltipConteudo}
                                      </TooltipContent>

                                      {/* Menu Popup para Escolha de Legenda, Modalidade de Preço ou Limpar */}
                                      <PopoverContent
                                        side="bottom"
                                        align="center"
                                        className="w-64 p-2.5 rounded-xl border-border bg-white shadow-lg space-y-2 z-50"
                                      >
                                        <div className="px-2 py-1 border-b border-border/60">
                                          <span className="text-[11px] font-bold text-foreground block truncate">
                                            {produto.sku} • {canal.nome}
                                          </span>
                                          <span className="text-[10px] text-muted-foreground block">
                                            Classificação e Preço por Modalidade
                                          </span>
                                        </div>

                                        {/* SEÇÃO 1: Escolha da Modalidade do Preço (se houver opções aprovadas) */}
                                        {celula.modalidadesDisponiveis.length > 0 && (
                                          <div className="space-y-1">
                                            <div className="flex items-center justify-between px-2 pt-0.5">
                                              <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                                Preço por Modalidade:
                                              </span>
                                              {celula.isEscolhaManual && (
                                                <Badge
                                                  variant="secondary"
                                                  className="text-[9px] h-3.5 px-1 py-0 font-normal bg-primary/10 text-primary border-none"
                                                >
                                                  Fixado
                                                </Badge>
                                              )}
                                            </div>

                                            <div className="space-y-0.5 max-h-36 overflow-y-auto">
                                              {/* Opção Padrão: Vigente / Automático */}
                                              <button
                                                type="button"
                                                onClick={() =>
                                                  handleTrocarModalidadeCelula(
                                                    produto.id,
                                                    canal.id,
                                                    null,
                                                  )
                                                }
                                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                                  !celula.isEscolhaManual
                                                    ? 'bg-secondary font-bold text-foreground'
                                                    : 'hover:bg-muted text-foreground'
                                                }`}
                                              >
                                                <div className="flex flex-col text-left">
                                                  <span className="font-semibold text-[11px]">
                                                    ⚡ Vigente (Automático)
                                                  </span>
                                                  <span className="text-[10px] text-muted-foreground font-mono">
                                                    Acompanha canal e reaprovações
                                                  </span>
                                                </div>
                                                {!celula.isEscolhaManual && (
                                                  <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                )}
                                              </button>

                                              {/* Modalidades com preço aprovado */}
                                              {celula.modalidadesDisponiveis.map((mod) => {
                                                const isModSelected =
                                                  celula.modalidadeEscolhidaId === mod.modalidade_id
                                                return (
                                                  <button
                                                    key={mod.modalidade_id || 'sem_mod'}
                                                    type="button"
                                                    onClick={() =>
                                                      handleTrocarModalidadeCelula(
                                                        produto.id,
                                                        canal.id,
                                                        mod.modalidade_id,
                                                      )
                                                    }
                                                    className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-xs transition-colors ${
                                                      isModSelected
                                                        ? 'bg-secondary font-bold text-foreground'
                                                        : 'hover:bg-muted text-foreground'
                                                    }`}
                                                  >
                                                    <div className="flex flex-col text-left truncate pr-1">
                                                      <span className="font-semibold text-[11px] truncate">
                                                        {mod.modalidade_nome}
                                                      </span>
                                                      <span className="text-[10px] font-mono text-emerald-700 font-bold flex items-center gap-1 flex-wrap">
                                                        <span>
                                                          {formatCurrency(mod.preco_aprovado)}
                                                        </span>
                                                        {mod.lucro_liquido !== undefined &&
                                                          mod.lucro_liquido !== null && (
                                                            <span className="text-[9px] font-medium text-muted-foreground">
                                                              · Lucro{' '}
                                                              {formatCurrency(mod.lucro_liquido)}
                                                            </span>
                                                          )}
                                                        {mod.status === 'desatualizada' && (
                                                          <span className="inline-flex items-center gap-0.5 text-amber-600 font-normal ml-0.5">
                                                            <AlertTriangle className="h-2.5 w-2.5 shrink-0" />
                                                            <span>(desatualizada)</span>
                                                          </span>
                                                        )}
                                                      </span>
                                                    </div>
                                                    {isModSelected && (
                                                      <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                    )}
                                                  </button>
                                                )
                                              })}
                                            </div>
                                          </div>
                                        )}

                                        {/* SEÇÃO 2: Classificação / Legenda */}
                                        <div className="pt-1 border-t border-border/60 space-y-1">
                                          <div className="px-2 pt-0.5">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                                              Classificação:
                                            </span>
                                          </div>
                                          <div className="space-y-0.5 max-h-36 overflow-y-auto">
                                            {legendasNormalizadas.map((leg) => {
                                              const isSelected =
                                                celula.classificacao?.legenda === leg.id
                                              return (
                                                <button
                                                  key={leg.id}
                                                  type="button"
                                                  onClick={() =>
                                                    handleSalvarCelula({
                                                      produtoId: produto.id,
                                                      canalId: canal.id,
                                                      legendaId: leg.id,
                                                      modalidadeId: celula.modalidadeEscolhidaId,
                                                    })
                                                  }
                                                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs transition-colors ${
                                                    isSelected
                                                      ? 'bg-secondary font-bold text-foreground'
                                                      : 'hover:bg-muted text-foreground'
                                                  }`}
                                                >
                                                  <div className="flex items-center gap-2">
                                                    <span
                                                      className="h-3 w-3 rounded-full shrink-0 border border-black/10 shadow-2xs"
                                                      style={{ backgroundColor: leg.cor }}
                                                    />
                                                    <span>{leg.nome}</span>
                                                  </div>
                                                  {isSelected && (
                                                    <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                                                  )}
                                                </button>
                                              )
                                            })}
                                          </div>
                                        </div>

                                        {/* Opção para Limpar Classificação (Célula vazia) */}
                                        {temClassificacao && (
                                          <div className="pt-1 border-t border-border/60">
                                            <button
                                              type="button"
                                              onClick={() =>
                                                handleSalvarCelula({
                                                  produtoId: produto.id,
                                                  canalId: canal.id,
                                                  legendaId: null,
                                                })
                                              }
                                              className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors"
                                            >
                                              <X className="h-3.5 w-3.5" />
                                              <span>Limpar presença na matriz</span>
                                            </button>
                                          </div>
                                        )}
                                      </PopoverContent>
                                    </Popover>
                                  </Tooltip>
                                </TooltipProvider>
                              </td>
                            )
                          })}
                        </tr>
                      )
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Barra de Rodapé com Legenda Rápida de Cores */}
      <div className="bg-white border border-border/80 rounded-2xl p-3.5 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="font-bold text-foreground text-xs flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            Legenda da Matriz:
          </span>
          {legendasNormalizadas.map((leg) => (
            <div key={leg.id} className="flex items-center gap-1.5">
              <span
                className="h-3 w-3 rounded-full shrink-0 border border-black/10"
                style={{ backgroundColor: leg.cor }}
              />
              <span className="text-muted-foreground font-medium text-[11px]">{leg.nome}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-md bg-slate-100 border border-dashed border-border shrink-0" />
            <span className="text-muted-foreground text-[11px]">Sem classificação</span>
          </div>
        </div>

        <div className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Layers className="h-3 w-3" />
          <span>Sincronizado em tempo real com repositório de preços homologados</span>
        </div>
      </div>
    </div>
  )
}
