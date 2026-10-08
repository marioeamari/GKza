import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Calendar,
  Plus,
  Trash2,
  RefreshCw,
  Sparkles,
  Settings2,
  TrendingDown,
  TrendingUp,
  Receipt,
  Info,
  DollarSign,
  Package,
  Layers,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/format'
import {
  calcularCustoLinha,
  calcularFaixaSemanaProducao,
  calcularFechamentoSemana,
  calcularGradeSemanalFornecedor,
  calcularResumoSaques,
  calcularTotalDia,
  formatarCabecalhoDia,
  gerarCincoDiasUteis,
  getSegundaFeiraSemana,
  adicionarDias,
} from '@/lib/producao'
import {
  producaoService,
  SemanaProducaoCompleta,
  ProducaoProdutoRecord,
  ProducaoSaqueGrupoRecord,
  ProducaoSaqueItemRecord,
} from '@/services/producao'

export default function ProducaoPage() {
  const { toast } = useToast()

  // Data atual da segunda-feira ativa
  const [segundaFeiraAtual, setSegundaFeiraAtual] = useState<string>(() => getSegundaFeiraSemana())

  const [loading, setLoading] = useState<boolean>(true)
  const [salvando, setSalvando] = useState<boolean>(false)
  const [dadosSemana, setDadosSemana] = useState<SemanaProducaoCompleta | null>(null)

  // Modais de edição
  const [modalProdutoAberto, setModalProdutoAberto] = useState<boolean>(false)
  const [produtoEditando, setProdutoEditando] = useState<Partial<ProducaoProdutoRecord> | null>(
    null,
  )

  const [modalNovoGrupoAberto, setModalNovoGrupoAberto] = useState<boolean>(false)
  const [novoGrupoTitulo, setNovoGrupoTitulo] = useState<string>('')
  const [sugestoesMarketplace, setSugestoesMarketplace] = useState<string[]>([])

  const [modalConfigOffsetAberto, setModalConfigOffsetAberto] = useState<boolean>(false)
  const [offsetDiasInput, setOffsetDiasInput] = useState<number>(6)

  // Carregar lista de marketplaces para referência de sugestão
  useEffect(() => {
    producaoService
      .listarMarketplacesReferencia()
      .then(setSugestoesMarketplace)
      .catch(() => {})
  }, [])

  // Carrega ou inicializa a semana sob demanda
  const carregarSemana = useCallback(
    async (segundaIso: string) => {
      setLoading(true)
      try {
        const dados = await producaoService.getOrCreateSemana(segundaIso)
        setDadosSemana(dados)
        setOffsetDiasInput(dados.semana.dias_offset_saques ?? 6)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao carregar semana de produção'
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar dados',
          description: msg,
        })
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    carregarSemana(segundaFeiraAtual)
  }, [segundaFeiraAtual, carregarSemana])

  // Navegação de semanas
  const handleNavegarSemana = (dias: number) => {
    const novaSegunda = adicionarDias(segundaFeiraAtual, dias)
    setSegundaFeiraAtual(novaSegunda)
  }

  const handleIrParaHoje = () => {
    const hojeSegunda = getSegundaFeiraSemana()
    setSegundaFeiraAtual(hojeSegunda)
  }

  // Faixa de datas atual
  const faixaSemana = useMemo(() => {
    const offset = dadosSemana?.semana.dias_offset_saques ?? 6
    return calcularFaixaSemanaProducao(segundaFeiraAtual, offset)
  }, [segundaFeiraAtual, dadosSemana?.semana.dias_offset_saques])

  // 5 dias úteis (Segunda a Sexta)
  const cincoDias = useMemo(() => {
    return gerarCincoDiasUteis(segundaFeiraAtual)
  }, [segundaFeiraAtual])

  // Mapa de quantidades por data e produto: data -> produto_id -> quantidade
  const mapaQuantidadesPorDia = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {}
    if (!dadosSemana) return mapa

    for (const item of dadosSemana.diasItens) {
      if (!mapa[item.data]) {
        mapa[item.data] = {}
      }
      mapa[item.data][item.produto] = item.quantidade
    }
    return mapa
  }, [dadosSemana])

  // Dicionário de custos unitários por produto
  const custoPorProduto = useMemo(() => {
    const mapa: Record<string, number> = {}
    if (!dadosSemana) return mapa
    for (const p of dadosSemana.produtos) {
      mapa[p.id] = p.custo_unitario
    }
    return mapa
  }, [dadosSemana])

  // Grade semanal consolidada do Fornecedor (Face 1 Resumo)
  const gradeFornecedor = useMemo(() => {
    if (!dadosSemana) return { linhas: [], quantidade_total_geral: 0, custo_total_fornecedor: 0 }
    return calcularGradeSemanalFornecedor(
      dadosSemana.produtos,
      dadosSemana.diasItens.map((d) => ({
        data: d.data,
        produto_id: d.produto,
        quantidade: d.quantidade,
      })),
    )
  }, [dadosSemana])

  // Resumo dos Saques (Face 2)
  const resumoSaques = useMemo(() => {
    if (!dadosSemana) return { grupos: [], total_saques_geral: 0 }
    return calcularResumoSaques(
      dadosSemana.gruposSaques.map((g) => ({
        id: g.id,
        titulo: g.titulo,
        itens: (g.itens || []).map((i) => ({
          id: i.id,
          descricao: i.descricao,
          valor: i.valor,
        })),
      })),
    )
  }, [dadosSemana])

  // Fechamento da semana (Saques − Impostos − Fornecedor)
  const fechamento = useMemo(() => {
    const imposto = dadosSemana?.semana.imposto || 0
    return calcularFechamentoSemana(
      gradeFornecedor.custo_total_fornecedor,
      resumoSaques.total_saques_geral,
      imposto,
    )
  }, [
    gradeFornecedor.custo_total_fornecedor,
    resumoSaques.total_saques_geral,
    dadosSemana?.semana.imposto,
  ])

  // Manipulação de quantidade no bloco diário com debounce/salvamento
  const handleAlterarQuantidade = async (dataIso: string, produtoId: string, valorStr: string) => {
    if (!dadosSemana) return
    const qtdNum = Math.max(0, parseInt(valorStr, 10) || 0)

    // Atualiza estado local de forma otimista
    setDadosSemana((prev) => {
      if (!prev) return prev
      const index = prev.diasItens.findIndex((i) => i.data === dataIso && i.produto === produtoId)
      let novosDiasItens = [...prev.diasItens]
      if (index >= 0) {
        novosDiasItens[index] = { ...novosDiasItens[index], quantidade: qtdNum }
      } else {
        novosDiasItens.push({
          id: `temp-${Date.now()}`,
          semana: prev.semana.id,
          data: dataIso,
          produto: produtoId,
          quantidade: qtdNum,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        })
      }
      return { ...prev, diasItens: novosDiasItens }
    })

    try {
      await producaoService.salvarQuantidadeDia(dadosSemana.semana.id, dataIso, produtoId, qtdNum)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar quantidade',
        description: 'Tente novamente.',
      })
    }
  }

  // Manipulação de custo unitário do produto na semana
  const handleAlterarCustoProduto = async (produtoId: string, novoCustoStr: string) => {
    if (!dadosSemana) return
    const novoCusto = Math.max(0, parseFloat(novoCustoStr.replace(',', '.')) || 0)

    // Otimista
    setDadosSemana((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        produtos: prev.produtos.map((p) =>
          p.id === produtoId ? { ...p, custo_unitario: novoCusto } : p,
        ),
      }
    })

    try {
      const prod = dadosSemana.produtos.find((p) => p.id === produtoId)
      if (prod) {
        await producaoService.salvarProduto(dadosSemana.semana.id, {
          id: prod.id,
          nome: prod.nome,
          custo_unitario: novoCusto,
          ordem: prod.ordem,
        })
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar custo do produto',
      })
    }
  }

  // Salvar novo produto ou edição
  const handleSalvarProdutoModal = async () => {
    if (!dadosSemana || !produtoEditando?.nome) return
    setSalvando(true)
    try {
      await producaoService.salvarProduto(dadosSemana.semana.id, {
        id: produtoEditando.id,
        nome: produtoEditando.nome.trim(),
        custo_unitario: Number(produtoEditando.custo_unitario) || 0,
        ordem: produtoEditando.ordem ?? dadosSemana.produtos.length + 1,
      })
      toast({
        title: produtoEditando.id ? 'Produto atualizado' : 'Produto cadastrado',
        description: 'Custos aplicados na semana corrente.',
      })
      setModalProdutoAberto(false)
      setProdutoEditando(null)
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar produto',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Excluir produto
  const handleExcluirProduto = async (produtoId: string) => {
    if (!dadosSemana) return
    if (!confirm('Deseja excluir este produto desta semana?')) return
    try {
      await producaoService.excluirProduto(produtoId)
      toast({ title: 'Produto excluído da semana' })
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir produto',
      })
    }
  }

  // Recarregar os 18 produtos padrão
  const handleCarregarProdutosPadrao = async () => {
    if (!dadosSemana) return
    setSalvando(true)
    try {
      await producaoService.carregarProdutosPadraoNaSemana(dadosSemana.semana.id)
      toast({
        title: 'Produtos padrão carregados',
        description: 'Grade inicial de 18 produtos sincronizada.',
      })
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar produtos padrão',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Criar novo grupo de saques
  const handleCriarGrupoSaque = async () => {
    if (!dadosSemana || !novoGrupoTitulo.trim()) return
    setSalvando(true)
    try {
      await producaoService.criarGrupoSaque(dadosSemana.semana.id, novoGrupoTitulo.trim())
      toast({ title: 'Grupo de saque adicionado' })
      setNovoGrupoTitulo('')
      setModalNovoGrupoAberto(false)
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao criar grupo',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Excluir grupo de saques
  const handleExcluirGrupoSaque = async (grupoId: string) => {
    if (!confirm('Deseja excluir este grupo de saques?')) return
    try {
      await producaoService.excluirGrupoSaque(grupoId)
      toast({ title: 'Grupo de saque removido' })
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao remover grupo',
      })
    }
  }

  // Adicionar linha de saque ao grupo
  const handleAdicionarItemSaque = async (grupoId: string) => {
    try {
      await producaoService.adicionarItemSaque(grupoId, 'Auto Saque', 0)
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao adicionar linha de saque',
      })
    }
  }

  // Alterar valor de item de saque
  const handleAlterarValorSaque = async (itemId: string, novoValorStr: string) => {
    if (!dadosSemana) return
    const valorNum = Math.max(0, parseFloat(novoValorStr.replace(',', '.')) || 0)

    // Otimista
    setDadosSemana((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        gruposSaques: prev.gruposSaques.map((g) => ({
          ...g,
          itens: g.itens.map((it) => (it.id === itemId ? { ...it, valor: valorNum } : it)),
        })),
      }
    })

    try {
      await producaoService.salvarItemSaque(itemId, { valor: valorNum })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar valor do saque',
      })
    }
  }

  // Alterar descrição de item de saque
  const handleAlterarDescricaoSaque = async (itemId: string, novaDesc: string) => {
    if (!dadosSemana) return
    try {
      await producaoService.salvarItemSaque(itemId, { descricao: novaDesc })
    } catch {
      // Silencioso
    }
  }

  // Excluir item de saque
  const handleExcluirItemSaque = async (itemId: string) => {
    try {
      await producaoService.excluirItemSaque(itemId)
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir saque',
      })
    }
  }

  // Alterar imposto
  const handleAlterarImposto = async (novoValorStr: string) => {
    if (!dadosSemana) return
    const impostoNum = Math.max(0, parseFloat(novoValorStr.replace(',', '.')) || 0)

    setDadosSemana((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        semana: { ...prev.semana, imposto: impostoNum },
      }
    })

    try {
      await producaoService.atualizarSemana(dadosSemana.semana.id, { imposto: impostoNum })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar imposto',
      })
    }
  }

  // Alterar offset de defasagem de saques
  const handleSalvarOffsetSaques = async () => {
    if (!dadosSemana) return
    setSalvando(true)
    try {
      await producaoService.atualizarSemana(dadosSemana.semana.id, {
        dias_offset_saques: Number(offsetDiasInput) || 6,
      })
      toast({
        title: 'Defasagem atualizada',
        description: 'Faixa de saques recalculada com sucesso.',
      })
      setModalConfigOffsetAberto(false)
      carregarSemana(segundaFeiraAtual)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar defasagem',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-20">
      {/* BARRA SUPERIOR DE CABEÇALHO & SELETOR DE SEMANA */}
      <header className="sticky top-0 z-30 border-b border-border bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Controle de Produção & Saques
                </h1>
                <Badge
                  variant="outline"
                  className="border-primary/20 bg-primary/5 text-xs text-primary font-semibold"
                >
                  Semanal
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Semana de Compra vs. Semana de Pagamento (defasagem isolada)</span>
              </p>
            </div>
          </div>

          {/* NAVEGAÇÃO DE SEMANA */}
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg border border-border bg-white p-1 shadow-2xs">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleNavegarSemana(-7)}
                className="h-8 w-8 p-0"
                title="Semana anterior (◀)"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleIrParaHoje}
                className="h-8 px-3 text-xs font-semibold text-foreground hover:text-primary"
              >
                <Calendar className="mr-1.5 h-3.5 w-3.5 text-primary" />
                Esta Semana
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleNavegarSemana(7)}
                className="h-8 w-8 p-0"
                title="Próxima semana (▶)"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* BOTÃO CONFIGURAR DEFASAGEM */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => setModalConfigOffsetAberto(true)}
              className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              title="Ajustar defasagem de saques"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Defasagem</span>
            </Button>

            {/* ATUALIZAR */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => carregarSemana(segundaFeiraAtual)}
              disabled={loading}
              className="h-9 w-9 p-0"
              title="Recarregar semana"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-primary' : ''}`} />
            </Button>
          </div>
        </div>

        {/* FAIXA VISUAL DE DATAS (DUAS FACES COM DEFASAGEM) */}
        <div className="border-t border-border/60 bg-muted/30 px-4 py-2 sm:px-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-mono">
              <span className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2 py-0.5 font-bold text-blue-700 border border-blue-200">
                <Package className="h-3.5 w-3.5" />
                {faixaSemana.label_fornecedor}
              </span>
              <span className="text-muted-foreground font-bold tracking-widest">»»»</span>
              <span className="inline-flex items-center gap-1.5 rounded-md bg-purple-50 px-2 py-0.5 font-bold text-purple-700 border border-purple-200">
                <DollarSign className="h-3.5 w-3.5" />
                {faixaSemana.label_saques}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Identificador:</span>
              <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px] font-semibold text-foreground">
                {faixaSemana.semana_ano}
              </code>
            </div>
          </div>
        </div>
      </header>

      {/* CONTEÚDO PRINCIPAL: TELA ÚNICA EM 2 COLUNAS */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {loading && !dadosSemana ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Carregando dados da semana de produção...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* GRID PRINCIPAL: ESQUERDA (FACE 1) & DIREITA (FACE 2) */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
              {/* ======================================================== */}
              {/* FACE 1: FORNECEDOR (ESQUERDA - 7 COLUNAS EM TELAS LG)   */}
              {/* ======================================================== */}
              <div className="space-y-6 lg:col-span-7">
                {/* 1.1 GRADE RESUMO SEMANAL DO FORNECEDOR */}
                <Card className="border border-border/80 shadow-xs bg-white overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-blue-50/80 to-indigo-50/40 pb-3 border-b border-border/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-bold tracking-tight text-blue-950 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-blue-600" />
                          Custo/Qtde Total Fornecedor Semanal
                        </CardTitle>
                        <p className="text-[11px] text-blue-700/80 font-medium mt-0.5">
                          {faixaSemana.label_fornecedor} (Consolidado semanal)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleCarregarProdutosPadrao}
                          disabled={salvando}
                          className="h-7 text-[11px] border-blue-200 text-blue-800 hover:bg-blue-100"
                          title="Recarregar os 18 produtos padrão da planilha"
                        >
                          <Sparkles className="mr-1 h-3 w-3 text-blue-600" />
                          Carregar Padrão
                        </Button>
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setProdutoEditando({ nome: '', custo_unitario: 0 })
                            setModalProdutoAberto(true)
                          }}
                          className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Novo Produto
                        </Button>
                      </div>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-border/60 bg-muted/40 text-[11px] font-semibold text-muted-foreground uppercase">
                            <th className="py-2.5 pl-4 pr-2">Produto Desc.</th>
                            <th className="py-2.5 px-2 text-right">Qtde</th>
                            <th className="py-2.5 px-2 text-right">Custo uni.</th>
                            <th className="py-2.5 px-2 text-right">Custo Total</th>
                            <th className="py-2.5 pr-3 pl-1 text-center w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-medium">
                          {gradeFornecedor.linhas.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-muted-foreground">
                                Nenhum produto cadastrado nesta semana.
                                <br />
                                <Button
                                  variant="link"
                                  size="sm"
                                  onClick={handleCarregarProdutosPadrao}
                                  className="mt-2 text-xs text-primary"
                                >
                                  Clique para carregar os 18 produtos padrão
                                </Button>
                              </td>
                            </tr>
                          ) : (
                            gradeFornecedor.linhas.map((linha) => {
                              const isZero = linha.quantidade_total === 0
                              return (
                                <tr
                                  key={linha.produto_id}
                                  className={`hover:bg-muted/25 transition-colors ${
                                    isZero ? 'text-muted-foreground/80' : 'text-foreground'
                                  }`}
                                >
                                  <td className="py-1.5 pl-4 pr-2 font-medium truncate max-w-[200px]">
                                    {linha.nome}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono">
                                    {isZero ? '-' : linha.quantidade_total}
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono">
                                    <div className="inline-flex items-center gap-1 justify-end">
                                      <span className="text-muted-foreground text-[10px]">R$</span>
                                      <input
                                        type="number"
                                        step="0.05"
                                        min="0"
                                        defaultValue={linha.custo_unitario}
                                        onBlur={(e) =>
                                          handleAlterarCustoProduto(
                                            linha.produto_id,
                                            e.target.value,
                                          )
                                        }
                                        className="w-16 rounded border border-transparent px-1 py-0.5 text-right font-mono text-xs hover:border-border focus:border-primary focus:bg-white focus:outline-none"
                                        title="Clique para editar custo unitário desta semana"
                                      />
                                    </div>
                                  </td>
                                  <td className="py-1.5 px-2 text-right font-mono font-semibold">
                                    {isZero ? (
                                      <span className="text-muted-foreground">-</span>
                                    ) : (
                                      formatCurrency(linha.custo_total)
                                    )}
                                  </td>
                                  <td className="py-1.5 pr-3 pl-1 text-center">
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button
                                          type="button"
                                          className="text-muted-foreground hover:text-foreground p-1 rounded"
                                        >
                                          ⋮
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem
                                          onClick={() => {
                                            const prod = dadosSemana?.produtos.find(
                                              (p) => p.id === linha.produto_id,
                                            )
                                            if (prod) {
                                              setProdutoEditando(prod)
                                              setModalProdutoAberto(true)
                                            }
                                          }}
                                        >
                                          Editar produto
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                          className="text-destructive"
                                          onClick={() => handleExcluirProduto(linha.produto_id)}
                                        >
                                          Excluir da semana
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </td>
                                </tr>
                              )
                            })
                          )}
                        </tbody>
                        {/* RODAPÉ RESUMO DO FORNECEDOR */}
                        <tfoot>
                          <tr className="border-t-2 border-blue-900/30 bg-blue-900 text-white font-bold text-xs">
                            <td className="py-3 pl-4 pr-2">Custo Total Fornecedor Semanal</td>
                            <td className="py-3 px-2 text-right font-mono">
                              {gradeFornecedor.quantidade_total_geral} un
                            </td>
                            <td className="py-3 px-2 text-right"></td>
                            <td className="py-3 px-2 text-right font-mono text-sm tracking-tight text-blue-100">
                              {formatCurrency(gradeFornecedor.custo_total_fornecedor)}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                {/* 1.2 OS 5 BLOCOS DIÁRIOS EMPILHADOS (SEG A SEX) */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between border-b pb-2">
                    <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Lançamentos Diários de Entrada (Segunda a Sexta)
                    </h2>
                    <span className="text-[11px] text-muted-foreground">
                      Preencha a quantidade fornecida em cada dia
                    </span>
                  </div>

                  {cincoDias.map((dia) => {
                    const cabecalhoTexto = formatarCabecalhoDia(dia.data, dia.nome_dia)
                    const itensDoDia =
                      dadosSemana?.produtos.map((p) => ({
                        produto_id: p.id,
                        quantidade: mapaQuantidadesPorDia[dia.data]?.[p.id] || 0,
                      })) || []

                    const totalDoDia = calcularTotalDia(itensDoDia, custoPorProduto)
                    const diaMesPill = dia.data.split('-').slice(1).reverse().join('/')

                    return (
                      <Card
                        key={dia.data}
                        className="border border-border/80 shadow-xs bg-white overflow-hidden"
                      >
                        <CardHeader className="bg-slate-100/70 py-2 px-4 border-b border-border/60 flex-row items-center justify-between space-y-0">
                          <span className="text-xs font-bold text-foreground capitalize">
                            {cabecalhoTexto}
                          </span>
                          <Badge
                            variant="secondary"
                            className="font-mono text-[11px] bg-white border border-border"
                          >
                            {diaMesPill}
                          </Badge>
                        </CardHeader>

                        <CardContent className="p-0">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-border/50 bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase">
                                  <th className="py-1.5 pl-4 pr-2">Produto(unid.)</th>
                                  <th className="py-1.5 px-2 text-right w-20">Qtde</th>
                                  <th className="py-1.5 px-2 text-right w-24">Custo uni.</th>
                                  <th className="py-1.5 pr-4 pl-2 text-right w-28">Custo Total</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-border/30">
                                {dadosSemana?.produtos.map((prod) => {
                                  const qtd = mapaQuantidadesPorDia[dia.data]?.[prod.id] || 0
                                  const custoTotalLinha = calcularCustoLinha(
                                    qtd,
                                    prod.custo_unitario,
                                  )
                                  const isZero = qtd === 0

                                  return (
                                    <tr
                                      key={`${dia.data}-${prod.id}`}
                                      className={`hover:bg-muted/20 transition-colors ${
                                        isZero ? 'text-muted-foreground/70' : 'text-foreground'
                                      }`}
                                    >
                                      <td className="py-1 pl-4 pr-2 truncate max-w-[220px]">
                                        {prod.nome}
                                      </td>
                                      <td className="py-1 px-2 text-right">
                                        <input
                                          type="number"
                                          min="0"
                                          placeholder="-"
                                          defaultValue={qtd === 0 ? '' : qtd}
                                          onBlur={(e) =>
                                            handleAlterarQuantidade(
                                              dia.data,
                                              prod.id,
                                              e.target.value,
                                            )
                                          }
                                          className="w-16 rounded border border-border/60 bg-white px-1.5 py-0.5 text-right font-mono text-xs hover:border-primary/50 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/20"
                                        />
                                      </td>
                                      <td className="py-1 px-2 text-right font-mono text-[11px] text-muted-foreground">
                                        R$ {prod.custo_unitario.toFixed(2)}
                                      </td>
                                      <td className="py-1 pr-4 pl-2 text-right font-mono font-medium">
                                        {isZero ? (
                                          <span className="text-muted-foreground">-</span>
                                        ) : (
                                          formatCurrency(custoTotalLinha)
                                        )}
                                      </td>
                                    </tr>
                                  )
                                })}
                              </tbody>
                              <tfoot>
                                <tr className="border-t border-border bg-slate-50 font-bold text-xs text-foreground">
                                  <td colSpan={3} className="py-2 pl-4 text-right pr-2">
                                    Custo Total:
                                  </td>
                                  <td className="py-2 pr-4 pl-2 text-right font-mono text-primary font-bold">
                                    {formatCurrency(totalDoDia)}
                                  </td>
                                </tr>
                              </tfoot>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                </div>
              </div>

              {/* ======================================================== */}
              {/* FACE 2: SAQUES DOS MARKETPLACES (DIREITA - 5 COLUNAS)    */}
              {/* ======================================================== */}
              <div className="space-y-6 lg:col-span-5">
                <Card className="border border-border/80 shadow-xs bg-white overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-purple-50/90 to-pink-50/40 pb-3 border-b border-border/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-bold tracking-tight text-purple-950 flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-purple-600" />
                          Total Saq. Mkt.Plac. Sem. Post. Ped. Forn.
                        </CardTitle>
                        <p className="text-[11px] text-purple-800/80 font-medium mt-0.5">
                          {faixaSemana.label_saques} (Semana de Pagamento)
                        </p>
                      </div>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setNovoGrupoTitulo('')
                          setModalNovoGrupoAberto(true)
                        }}
                        className="h-7 text-[11px] bg-purple-700 hover:bg-purple-800 text-white"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Novo Grupo
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-5">
                    {resumoSaques.grupos.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground text-xs">
                        Nenhum grupo de saques cadastrado.
                      </div>
                    ) : (
                      resumoSaques.grupos.map((grupo) => (
                        <div
                          key={grupo.id}
                          className="rounded-lg border border-purple-100 bg-purple-50/30 p-3 space-y-2.5 transition-all hover:border-purple-200"
                        >
                          {/* CABEÇALHO DO GRUPO */}
                          <div className="flex items-center justify-between border-b border-purple-200/60 pb-1.5">
                            <span className="font-bold text-xs text-purple-950 tracking-tight">
                              {grupo.titulo}
                            </span>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => grupo.id && handleAdicionarItemSaque(grupo.id)}
                                className="h-6 px-1.5 text-[10px] text-purple-700 hover:bg-purple-100"
                                title="Adicionar linha de auto saque"
                              >
                                <Plus className="h-3 w-3 mr-0.5" />
                                Linha
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => grupo.id && handleExcluirGrupoSaque(grupo.id)}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                                title="Excluir grupo"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>

                          {/* LINHAS DE AUTO SAQUE */}
                          <div className="space-y-1.5">
                            {grupo.itens.map((item, idx) => (
                              <div key={item.id || idx} className="flex items-center gap-2 text-xs">
                                <input
                                  type="text"
                                  defaultValue={item.descricao || 'Auto Saque'}
                                  onBlur={(e) =>
                                    item.id && handleAlterarDescricaoSaque(item.id, e.target.value)
                                  }
                                  placeholder="Descrição do saque"
                                  className="flex-1 rounded border border-transparent bg-transparent px-1.5 py-0.5 text-xs text-muted-foreground hover:border-border hover:bg-white focus:border-purple-400 focus:bg-white focus:outline-none"
                                />

                                <div className="flex items-center gap-1">
                                  <span className="text-[11px] text-muted-foreground font-mono">
                                    R$
                                  </span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    placeholder="-"
                                    defaultValue={item.valor === 0 ? '' : item.valor}
                                    onBlur={(e) =>
                                      item.id && handleAlterarValorSaque(item.id, e.target.value)
                                    }
                                    className="w-24 rounded border border-border/70 bg-white px-2 py-0.5 text-right font-mono text-xs font-semibold hover:border-purple-300 focus:border-purple-500 focus:outline-none"
                                  />
                                </div>

                                {grupo.itens.length > 1 && (
                                  <button
                                    type="button"
                                    onClick={() => item.id && handleExcluirItemSaque(item.id)}
                                    className="text-muted-foreground/60 hover:text-destructive p-0.5"
                                    title="Remover linha"
                                  >
                                    ×
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>

                          {/* TOTAL DO GRUPO */}
                          <div className="flex items-center justify-between border-t border-purple-200/60 pt-2 text-xs font-bold text-purple-900">
                            <span>Total {grupo.titulo.split('(')[0]}:</span>
                            <span className="font-mono">{formatCurrency(grupo.total_grupo)}</span>
                          </div>
                        </div>
                      ))
                    )}

                    {/* ALL SAQUE TOTAL BANNER (Como na planilha do modelo) */}
                    <div className="rounded-xl bg-purple-900 p-4 text-white shadow-xs space-y-1">
                      <div className="text-[11px] font-medium tracking-wide uppercase text-purple-200">
                        All Saque total:
                      </div>
                      <div className="text-2xl font-black font-mono tracking-tight text-white">
                        {formatCurrency(resumoSaques.total_saques_geral)}
                      </div>
                    </div>

                    {/* CAMPO DE IMPOSTO */}
                    <div className="rounded-xl border border-border bg-slate-50 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5" />
                          Imposto da Semana:
                        </label>
                        <span className="text-[11px] text-muted-foreground">
                          Deduzido dos saques
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-bold text-foreground">R$</span>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          defaultValue={
                            dadosSemana?.semana.imposto === 0 ? '' : dadosSemana?.semana.imposto
                          }
                          onBlur={(e) => handleAlterarImposto(e.target.value)}
                          className="h-10 font-mono text-base font-bold bg-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ======================================================== */}
                {/* FECHAMENTO DA SEMANA EM DESTAQUE (CARD GRANDE BASE)       */}
                {/* Fornecedor − Saques − Impostos                            */}
                {/* ======================================================== */}
                <Card
                  className={`border-2 shadow-md transition-all ${
                    fechamento.is_negativo
                      ? 'border-red-300 bg-red-50/40'
                      : 'border-emerald-300 bg-emerald-50/40'
                  }`}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-xs font-extrabold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
                      <span>Fechamento Semanal de Produção</span>
                      <Badge
                        variant={fechamento.is_negativo ? 'destructive' : 'default'}
                        className="font-bold text-[10px]"
                      >
                        {fechamento.is_negativo ? 'Déficit na Semana' : 'Superávit na Semana'}
                      </Badge>
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      Fórmula da planilha: Total Saques − Impostos − Total Fornecedor
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-1">
                    {/* RESUMO DAS 3 CONTAS */}
                    <div className="grid grid-cols-3 gap-2 text-center text-xs">
                      <div className="rounded-lg bg-white/80 p-2 border border-border/60">
                        <span className="text-[10px] text-muted-foreground block">
                          Saques Total
                        </span>
                        <span className="font-mono font-bold text-purple-700">
                          {formatCurrency(fechamento.total_saques)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-white/80 p-2 border border-border/60">
                        <span className="text-[10px] text-muted-foreground block">
                          (-) Impostos
                        </span>
                        <span className="font-mono font-bold text-amber-700">
                          {formatCurrency(fechamento.impostos)}
                        </span>
                      </div>
                      <div className="rounded-lg bg-white/80 p-2 border border-border/60">
                        <span className="text-[10px] text-muted-foreground block">
                          (-) Fornecedor
                        </span>
                        <span className="font-mono font-bold text-blue-700">
                          {formatCurrency(fechamento.total_fornecedor)}
                        </span>
                      </div>
                    </div>

                    {/* SALDO GRANDE EM DESTAQUE */}
                    <div
                      className={`rounded-2xl p-4 text-center border shadow-xs ${
                        fechamento.is_negativo
                          ? 'bg-red-600 text-white border-red-700'
                          : 'bg-emerald-600 text-white border-emerald-700'
                      }`}
                    >
                      <div className="text-xs uppercase font-extrabold tracking-wider opacity-90 mb-1 flex items-center justify-center gap-1.5">
                        {fechamento.is_negativo ? (
                          <TrendingDown className="h-4 w-4" />
                        ) : (
                          <TrendingUp className="h-4 w-4" />
                        )}
                        Saldo Final da Semana
                      </div>
                      <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                        {formatCurrency(fechamento.saldo_semana)}
                      </div>
                      <p className="text-[11px] mt-1 opacity-80">
                        {fechamento.is_negativo
                          ? 'Os saques não cobriram o fornecedor e impostos nesta semana.'
                          : 'Receita de saques suficiente para cobrir os produtos fornecidos.'}
                      </p>
                    </div>

                    <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-start gap-2">
                      <Info className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                      <span>
                        Módulo 100% isolado do financeiro. Nenhuma alteração é gravada em contas ou
                        no extrato bancário.
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ================================================================= */}
      {/* MODAL: NOVO PRODUTO / EDITAR PRODUTO NA SEMANA                   */}
      {/* ================================================================= */}
      <Dialog open={modalProdutoAberto} onOpenChange={setModalProdutoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {produtoEditando?.id ? 'Editar Produto' : 'Cadastrar Produto na Semana'}
            </DialogTitle>
            <DialogDescription>
              O custo unitário pode variar semana a semana e não altera o histórico global.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nome do Produto</label>
              <Input
                placeholder="Ex: Toalha Banhão Ouro"
                value={produtoEditando?.nome || ''}
                onChange={(e) => setProdutoEditando((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Custo Unitário da Semana (R$)
              </label>
              <Input
                type="number"
                step="0.05"
                min="0"
                placeholder="Ex: 14.20"
                value={produtoEditando?.custo_unitario ?? ''}
                onChange={(e) =>
                  setProdutoEditando((prev) => ({
                    ...prev,
                    custo_unitario: parseFloat(e.target.value) || 0,
                  }))
                }
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setModalProdutoAberto(false)
                setProdutoEditando(null)
              }}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarProdutoModal}
              disabled={salvando || !produtoEditando?.nome}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              Salvar Produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* MODAL: NOVO GRUPO DE SAQUE (MARKETPLACE)                          */}
      {/* ================================================================= */}
      <Dialog open={modalNovoGrupoAberto} onOpenChange={setModalNovoGrupoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Grupo de Saque</DialogTitle>
            <DialogDescription>
              Crie um agrupamento por marketplace ou canal de venda para monitorar os saques.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Título do Grupo</label>
              <Input
                placeholder="Ex: Saque Shopee-SHPP(Sicred)"
                value={novoGrupoTitulo}
                onChange={(e) => setNovoGrupoTitulo(e.target.value)}
              />
            </div>

            {sugestoesMarketplace.length > 0 && (
              <div className="space-y-1.5">
                <span className="text-[11px] text-muted-foreground">Sugestões rápidas:</span>
                <div className="flex flex-wrap gap-1.5">
                  {sugestoesMarketplace.map((mkt) => (
                    <Button
                      key={mkt}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-[10px] px-2"
                      onClick={() => setNovoGrupoTitulo(`Saque ${mkt}`)}
                    >
                      {mkt}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovoGrupoAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCriarGrupoSaque}
              disabled={salvando || !novoGrupoTitulo.trim()}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              Criar Grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ================================================================= */}
      {/* MODAL: CONFIGURAÇÃO DE DEFASAGEM DE SAQUES                        */}
      {/* ================================================================= */}
      <Dialog open={modalConfigOffsetAberto} onOpenChange={setModalConfigOffsetAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Configurar Defasagem da Semana</DialogTitle>
            <DialogDescription>
              Ajuste quantos dias após a segunda-feira de fornecimento inicia a semana de saques.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Dias de Defasagem (Padrão: +6 dias = Domingo posterior)
              </label>
              <Input
                type="number"
                min="0"
                max="30"
                value={offsetDiasInput}
                onChange={(e) => setOffsetDiasInput(parseInt(e.target.value, 10) || 0)}
              />
              <p className="text-[11px] text-muted-foreground">
                Com offset 6, a compra de Seg 24/08 a Sex 28/08 tem a semana de pagamento iniciando
                no Dom 30/08 a Sáb 05/09 (exatamente como no modelo).
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalConfigOffsetAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarOffsetSaques}
              disabled={salvando}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              Aplicar Defasagem
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
