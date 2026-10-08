import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar,
  Plus,
  Trash2,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Receipt,
  Info,
  DollarSign,
  Package,
  Layers,
  ChevronDown,
  CalendarPlus,
  Store,
  Check,
  Building2,
  Edit2,
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { formatCurrency } from '@/lib/format'
import {
  calcularCustoLinha,
  calcularFaixaSemanaProducao,
  calcularFechamentoRegistro,
  calcularGradeProdutosRegistro,
  calcularResumoSaques,
  calcularTotalDia,
  formatarCabecalhoDia,
  formatarDiaMes,
  formatarRangeDatas,
  getDiaSemanaAbrev,
  getSegundaFeiraSemana,
  adicionarDias,
  ordenarDatasIso,
} from '@/lib/producao'
import {
  producaoService,
  ProducaoRegistroRecord,
  RegistroProducaoCompleto,
  ProducaoProdutoRecord,
  FornecedorReferencia,
  FornecedorProdutoReferencia,
} from '@/services/producao'

export default function ProducaoPage() {
  const { toast } = useToast()

  // Lista de registros no topo e registro selecionado
  const [registros, setRegistros] = useState<ProducaoRegistroRecord[]>([])
  const [registroSelecionadoId, setRegistroSelecionadoId] = useState<string>('')

  const [loading, setLoading] = useState<boolean>(true)
  const [salvando, setSalvando] = useState<boolean>(false)
  const [dadosRegistro, setDadosRegistro] = useState<RegistroProducaoCompleto | null>(null)

  // Referências externas para seleção (somente leitura)
  const [fornecedores, setFornecedores] = useState<FornecedorReferencia[]>([])
  const [sugestoesMarketplace, setSugestoesMarketplace] = useState<string[]>([])

  // Modal: Novo Registro de Pagamento
  const [modalNovoRegistroAberto, setModalNovoRegistroAberto] = useState<boolean>(false)
  const [novoFornId, setNovoFornId] = useState<string>('')
  const [novoDataInicioCompra, setNovoDataInicioCompra] = useState<string>('')
  const [novoDataFimCompra, setNovoDataFimCompra] = useState<string>('')
  const [novoDataInicioSaques, setNovoDataInicioSaques] = useState<string>('')
  const [novoDataFimSaques, setNovoDataFimSaques] = useState<string>('')

  // Modal: Editar Header do Registro (Fornecedor, Ranges, Observações)
  const [modalEditarRegistroAberto, setModalEditarRegistroAberto] = useState<boolean>(false)
  const [editFornId, setEditFornId] = useState<string>('')
  const [editDataInicioCompra, setEditDataInicioCompra] = useState<string>('')
  const [editDataFimCompra, setEditDataFimCompra] = useState<string>('')
  const [editDataInicioSaques, setEditDataInicioSaques] = useState<string>('')
  const [editDataFimSaques, setEditDataFimSaques] = useState<string>('')
  const [editObservacoes, setEditObservacoes] = useState<string>('')

  // Modal: Adicionar do Fornecedor (Catálogo)
  const [modalCatalogoAberto, setModalCatalogoAberto] = useState<boolean>(false)
  const [produtosCatalogo, setProdutosCatalogo] = useState<FornecedorProdutoReferencia[]>([])
  const [catalogoCarregando, setCatalogoCarregando] = useState<boolean>(false)
  const [itensCatalogoSelecionados, setItensCatalogoSelecionados] = useState<
    Record<string, { selecionado: boolean; custoEditado: number }>
  >({})

  // Modal: Adicionar/Editar Produto Avulso na Grade
  const [modalProdutoAberto, setModalProdutoAberto] = useState<boolean>(false)
  const [produtoEditando, setProdutoEditando] = useState<Partial<ProducaoProdutoRecord> | null>(
    null,
  )

  // Modal: Adicionar Nova Data na Grade
  const [modalNovaDataAberto, setModalNovaDataAberto] = useState<boolean>(false)
  const [novaDataInput, setNovaDataInput] = useState<string>('')

  // Modal: Novo Grupo de Saques
  const [modalNovoGrupoAberto, setModalNovoGrupoAberto] = useState<boolean>(false)
  const [novoGrupoTitulo, setNovoGrupoTitulo] = useState<string>('')

  // Carregar lista inicial de fornecedores e marketplaces para referência
  useEffect(() => {
    producaoService
      .listarFornecedoresReferencia()
      .then(setFornecedores)
      .catch(() => {})
    producaoService
      .listarMarketplacesReferencia()
      .then(setSugestoesMarketplace)
      .catch(() => {})
  }, [])

  // Carregar lista de registros disponíveis
  const carregarListaRegistros = useCallback(
    async (preferirId?: string) => {
      try {
        const lista = await producaoService.listarRegistros()
        setRegistros(lista)

        if (lista.length > 0) {
          const idParaSelecionar =
            preferirId && lista.some((r) => r.id === preferirId) ? preferirId : lista[0].id
          setRegistroSelecionadoId(idParaSelecionar)
        } else {
          // Se ainda não houver nenhum, cria um inicial padrão
          const inicial = await producaoService.getOrCreateSemana()
          setRegistros([inicial.registro])
          setRegistroSelecionadoId(inicial.registro.id)
        }
      } catch {
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar registros de pagamento',
        })
      }
    },
    [toast],
  )

  useEffect(() => {
    carregarListaRegistros()
  }, [carregarListaRegistros])

  // Carregar registro completo selecionado
  const carregarRegistro = useCallback(
    async (regId: string) => {
      if (!regId) return
      setLoading(true)
      try {
        const dados = await producaoService.carregarRegistroCompleto(regId)
        setDadosRegistro(dados)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Falha ao carregar registro de pagamento'
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar dados do registro',
          description: msg,
        })
      } finally {
        setLoading(false)
      }
    },
    [toast],
  )

  useEffect(() => {
    if (registroSelecionadoId) {
      carregarRegistro(registroSelecionadoId)
    }
  }, [registroSelecionadoId, carregarRegistro])

  // Datas cadastradas na grade do registro
  const datasGrade = useMemo(() => {
    if (!dadosRegistro?.registro.datas_grade) return []
    return ordenarDatasIso(dadosRegistro.registro.datas_grade)
  }, [dadosRegistro?.registro.datas_grade])

  // Labels amigáveis dos ranges de compra e de saques
  const labelsFaixas = useMemo(() => {
    if (!dadosRegistro) {
      return { compra: '', saques: '', completo: '' }
    }
    const reg = dadosRegistro.registro
    const compra =
      reg.label_compra || formatarRangeDatas(reg.data_inicio_compra, reg.data_fim_compra)
    const saques =
      reg.label_saques || formatarRangeDatas(reg.data_inicio_saques, reg.data_fim_saques)
    return {
      compra,
      saques,
      completo: `${compra} »»» ${saques}`,
    }
  }, [dadosRegistro])

  // Mapa de quantidades por data e produto: data -> produto_id -> quantidade
  const mapaQuantidadesPorDia = useMemo(() => {
    const mapa: Record<string, Record<string, number>> = {}
    if (!dadosRegistro) return mapa

    for (const item of dadosRegistro.diasItens) {
      const dataIso = item.data.slice(0, 10)
      if (!mapa[dataIso]) {
        mapa[dataIso] = {}
      }
      mapa[dataIso][item.produto] = item.quantidade
    }
    return mapa
  }, [dadosRegistro])

  // Dicionário de custos unitários por produto
  const custoPorProduto = useMemo(() => {
    const mapa: Record<string, number> = {}
    if (!dadosRegistro) return mapa
    for (const p of dadosRegistro.produtos) {
      mapa[p.id] = p.custo_unitario
    }
    return mapa
  }, [dadosRegistro])

  // Grade consolidada de produtos do registro (soma todas as datas cadastradas)
  const gradeFornecedor = useMemo(() => {
    if (!dadosRegistro) return { linhas: [], quantidade_total_geral: 0, custo_total_fornecedor: 0 }
    return calcularGradeProdutosRegistro(
      dadosRegistro.produtos,
      dadosRegistro.diasItens.map((d) => ({
        data: d.data.slice(0, 10),
        produto_id: d.produto,
        quantidade: d.quantidade,
      })),
    )
  }, [dadosRegistro])

  // Resumo dos Saques do registro
  const resumoSaques = useMemo(() => {
    if (!dadosRegistro) return { grupos: [], total_saques_geral: 0 }
    return calcularResumoSaques(
      dadosRegistro.gruposSaques.map((g) => ({
        id: g.id,
        titulo: g.titulo,
        itens: (g.itens || []).map((i) => ({
          id: i.id,
          descricao: i.descricao,
          valor: i.valor,
        })),
      })),
    )
  }, [dadosRegistro])

  // Fechamento: Saques − Impostos − Custo Fornecedor = Saldo
  const fechamento = useMemo(() => {
    const imposto = dadosRegistro?.registro.imposto || 0
    return calcularFechamentoRegistro(
      gradeFornecedor.custo_total_fornecedor,
      resumoSaques.total_saques_geral,
      imposto,
    )
  }, [
    gradeFornecedor.custo_total_fornecedor,
    resumoSaques.total_saques_geral,
    dadosRegistro?.registro.imposto,
  ])

  // Abrir modal de criação com valores padrão sugeridos
  const handleAbrirModalNovoRegistro = () => {
    const seg = getSegundaFeiraSemana()
    const faixa = calcularFaixaSemanaProducao(seg, 6)
    setNovoFornId(fornecedores[0]?.id || '')
    setNovoDataInicioCompra(faixa.data_inicio_fornecedor)
    setNovoDataFimCompra(faixa.data_fim_fornecedor)
    setNovoDataInicioSaques(faixa.data_inicio_saques)
    setNovoDataFimSaques(faixa.data_fim_saques)
    setModalNovoRegistroAberto(true)
  }

  // Criar novo registro
  const handleCriarNovoRegistro = async () => {
    if (
      !novoDataInicioCompra ||
      !novoDataFimCompra ||
      !novoDataInicioSaques ||
      !novoDataFimSaques
    ) {
      toast({
        variant: 'destructive',
        title: 'Preencha os ranges de datas da compra e dos saques',
      })
      return
    }

    setSalvando(true)
    try {
      const fornObj = fornecedores.find((f) => f.id === novoFornId)
      const novoCompleto = await producaoService.criarRegistro({
        fornecedorId: fornObj?.id,
        fornecedorNome: fornObj?.nome || '',
        dataInicioCompra: novoDataInicioCompra,
        dataFimCompra: novoDataFimCompra,
        dataInicioSaques: novoDataInicioSaques,
        dataFimSaques: novoDataFimSaques,
        datasIniciaisGrade: [novoDataInicioCompra], // Inicia com o primeiro dia de compra
      })

      toast({
        title: 'Registro de Pagamento criado',
        description: `Fornecedor: ${fornObj?.nome || 'Avulso'}`,
      })
      setModalNovoRegistroAberto(false)
      await carregarListaRegistros(novoCompleto.registro.id)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao criar registro'
      toast({
        variant: 'destructive',
        title: 'Erro ao criar registro',
        description: msg,
      })
    } finally {
      setSalvando(false)
    }
  }

  // Abrir modal para editar cabeçalho do registro atual
  const handleAbrirEditarRegistro = () => {
    if (!dadosRegistro) return
    const reg = dadosRegistro.registro
    setEditFornId(reg.fornecedor || '')
    setEditDataInicioCompra(reg.data_inicio_compra.slice(0, 10))
    setEditDataFimCompra(reg.data_fim_compra.slice(0, 10))
    setEditDataInicioSaques(reg.data_inicio_saques.slice(0, 10))
    setEditDataFimSaques(reg.data_fim_saques.slice(0, 10))
    setEditObservacoes(reg.observacoes || '')
    setModalEditarRegistroAberto(true)
  }

  // Salvar alterações de cabeçalho do registro
  const handleSalvarEdicaoRegistro = async () => {
    if (!dadosRegistro) return
    setSalvando(true)
    try {
      const fornObj = fornecedores.find((f) => f.id === editFornId)
      await producaoService.atualizarRegistro(dadosRegistro.registro.id, {
        fornecedor: fornObj?.id || '',
        fornecedor_nome: fornObj?.nome || '',
        data_inicio_compra: editDataInicioCompra,
        data_fim_compra: editDataFimCompra,
        data_inicio_saques: editDataInicioSaques,
        data_fim_saques: editDataFimSaques,
        observacoes: editObservacoes,
      })

      toast({ title: 'Registro de pagamento atualizado' })
      setModalEditarRegistroAberto(false)
      await carregarListaRegistros(dadosRegistro.registro.id)
      carregarRegistro(dadosRegistro.registro.id)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar dados do registro',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Excluir registro atual
  const handleExcluirRegistro = async () => {
    if (!dadosRegistro) return
    if (!confirm('Deseja excluir este registro de pagamento e todas as suas grades e saques?'))
      return
    setSalvando(true)
    try {
      await producaoService.excluirRegistro(dadosRegistro.registro.id)
      toast({ title: 'Registro excluído com sucesso' })
      await carregarListaRegistros()
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir registro',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Adicionar nova data na grade do registro
  const handleAdicionarDataGrade = async () => {
    if (!dadosRegistro || !novaDataInput) return
    try {
      const novas = await producaoService.adicionarDataNaGrade(
        dadosRegistro.registro.id,
        novaDataInput,
      )
      setDadosRegistro((prev) =>
        prev
          ? {
              ...prev,
              registro: { ...prev.registro, datas_grade: novas },
            }
          : prev,
      )
      toast({
        title: 'Data adicionada na grade',
        description: `Dia ${formatarDiaMes(novaDataInput)} adicionado para recebimento de produtos.`,
      })
      setModalNovaDataAberto(false)
      setNovaDataInput('')
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao adicionar data',
      })
    }
  }

  // Remover data da grade do registro
  const handleRemoverDataGrade = async (dataParaRemover: string) => {
    if (!dadosRegistro) return
    const formatada = formatarDiaMes(dataParaRemover)
    if (!confirm(`Deseja remover o dia ${formatada} da grade deste registro de pagamento?`)) return

    try {
      const novas = await producaoService.removerDataDaGrade(
        dadosRegistro.registro.id,
        dataParaRemover,
      )
      setDadosRegistro((prev) =>
        prev
          ? {
              ...prev,
              registro: { ...prev.registro, datas_grade: novas },
              diasItens: prev.diasItens.filter((i) => i.data.slice(0, 10) !== dataParaRemover),
            }
          : prev,
      )
      toast({ title: `Dia ${formatada} removido da grade` })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao remover data da grade',
      })
    }
  }

  // Abrir modal de catálogo do fornecedor
  const handleAbrirModalCatalogo = async () => {
    if (!dadosRegistro?.registro.fornecedor) {
      toast({
        title: 'Vincule um Fornecedor primeiro',
        description: 'Edite o registro para selecionar a qual fornecedor ele pertence.',
      })
      return
    }

    setModalCatalogoAberto(true)
    setCatalogoCarregando(true)
    try {
      const prods = await producaoService.listarProdutosDoFornecedor(
        dadosRegistro.registro.fornecedor,
      )
      setProdutosCatalogo(prods)

      // Inicializa estado de seleção com custo unitário padrão do cadastro
      const estadoInicial: Record<string, { selecionado: boolean; custoEditado: number }> = {}
      for (const p of prods) {
        estadoInicial[p.id] = {
          selecionado: false,
          custoEditado: p.preco_custo_unitario || 0,
        }
      }
      setItensCatalogoSelecionados(estadoInicial)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar catálogo de produtos do fornecedor',
      })
    } finally {
      setCatalogoCarregando(false)
    }
  }

  // Confirmar adição dos produtos marcados do catálogo
  const handleAdicionarProdutosCatalogoConfirmar = async () => {
    if (!dadosRegistro) return
    const itensParaAdicionar = produtosCatalogo
      .filter((p) => itensCatalogoSelecionados[p.id]?.selecionado)
      .map((p) => ({
        nome: p.descricao,
        custo_unitario: Number(itensCatalogoSelecionados[p.id]?.custoEditado) || 0,
        codigo_referencia: p.sku_fornecedor || '',
      }))

    if (itensParaAdicionar.length === 0) {
      toast({ title: 'Nenhum produto marcado' })
      return
    }

    setSalvando(true)
    try {
      await producaoService.adicionarProdutosDoCatalogo(
        dadosRegistro.registro.id,
        itensParaAdicionar,
      )
      toast({
        title: `${itensParaAdicionar.length} produtos adicionados à grade`,
        description: 'Custos unitários sugeridos pelo catálogo aplicados neste registro.',
      })
      setModalCatalogoAberto(false)
      carregarRegistro(dadosRegistro.registro.id)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao adicionar produtos na grade',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Manipulação de quantidade no bloco diário
  const handleAlterarQuantidade = async (dataIso: string, produtoId: string, valorStr: string) => {
    if (!dadosRegistro) return
    const qtdNum = Math.max(0, parseInt(valorStr, 10) || 0)
    const dataLimpa = dataIso.slice(0, 10)

    // Atualização otimista
    setDadosRegistro((prev) => {
      if (!prev) return prev
      const index = prev.diasItens.findIndex(
        (i) => i.data.slice(0, 10) === dataLimpa && i.produto === produtoId,
      )
      const novosDiasItens = [...prev.diasItens]
      if (index >= 0) {
        novosDiasItens[index] = { ...novosDiasItens[index], quantidade: qtdNum }
      } else {
        novosDiasItens.push({
          id: `temp-${Date.now()}`,
          registro: prev.registro.id,
          data: dataLimpa,
          produto: produtoId,
          quantidade: qtdNum,
          created: new Date().toISOString(),
          updated: new Date().toISOString(),
        })
      }
      return { ...prev, diasItens: novosDiasItens }
    })

    try {
      await producaoService.salvarQuantidadeDia(
        dadosRegistro.registro.id,
        dataLimpa,
        produtoId,
        qtdNum,
      )
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar quantidade',
      })
    }
  }

  // Manipulação de custo unitário do produto neste registro
  const handleAlterarCustoProduto = async (produtoId: string, novoCustoStr: string) => {
    if (!dadosRegistro) return
    const novoCusto = Math.max(0, parseFloat(novoCustoStr.replace(',', '.')) || 0)

    // Otimista
    setDadosRegistro((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        produtos: prev.produtos.map((p) =>
          p.id === produtoId ? { ...p, custo_unitario: novoCusto } : p,
        ),
      }
    })

    try {
      const prod = dadosRegistro.produtos.find((p) => p.id === produtoId)
      if (prod) {
        await producaoService.salvarProduto(dadosRegistro.registro.id, {
          id: prod.id,
          nome: prod.nome,
          custo_unitario: novoCusto,
          ordem: prod.ordem,
        })
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar custo unitário',
      })
    }
  }

  // Salvar produto avulso ou edição
  const handleSalvarProdutoModal = async () => {
    if (!dadosRegistro || !produtoEditando?.nome) return
    setSalvando(true)
    try {
      await producaoService.salvarProduto(dadosRegistro.registro.id, {
        id: produtoEditando.id,
        nome: produtoEditando.nome.trim(),
        custo_unitario: Number(produtoEditando.custo_unitario) || 0,
        ordem: produtoEditando.ordem ?? dadosRegistro.produtos.length + 1,
      })
      toast({
        title: produtoEditando.id ? 'Produto atualizado' : 'Produto avulso cadastrado',
      })
      setModalProdutoAberto(false)
      setProdutoEditando(null)
      carregarRegistro(dadosRegistro.registro.id)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar produto',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Excluir produto do registro
  const handleExcluirProduto = async (produtoId: string) => {
    if (!dadosRegistro) return
    if (!confirm('Deseja excluir este produto deste registro de pagamento?')) return
    try {
      await producaoService.excluirProduto(produtoId)
      toast({ title: 'Produto excluído da grade' })
      carregarRegistro(dadosRegistro.registro.id)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir produto',
      })
    }
  }

  // Criar novo grupo de saques
  const handleCriarGrupoSaque = async () => {
    if (!dadosRegistro || !novoGrupoTitulo.trim()) return
    setSalvando(true)
    try {
      await producaoService.criarGrupoSaque(dadosRegistro.registro.id, novoGrupoTitulo.trim())
      toast({ title: 'Grupo de saque adicionado' })
      setNovoGrupoTitulo('')
      setModalNovoGrupoAberto(false)
      carregarRegistro(dadosRegistro.registro.id)
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
      carregarRegistro(dadosRegistro!.registro.id)
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
      carregarRegistro(dadosRegistro!.registro.id)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao adicionar linha de saque',
      })
    }
  }

  // Alterar valor de item de saque
  const handleAlterarValorSaque = async (itemId: string, novoValorStr: string) => {
    if (!dadosRegistro) return
    const valorNum = Math.max(0, parseFloat(novoValorStr.replace(',', '.')) || 0)

    setDadosRegistro((prev) => {
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
    if (!dadosRegistro) return
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
      carregarRegistro(dadosRegistro!.registro.id)
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir saque',
      })
    }
  }

  // Alterar imposto
  const handleAlterarImposto = async (novoValorStr: string) => {
    if (!dadosRegistro) return
    const impostoNum = Math.max(0, parseFloat(novoValorStr.replace(',', '.')) || 0)

    setDadosRegistro((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        registro: { ...prev.registro, imposto: impostoNum },
      }
    })

    try {
      await producaoService.atualizarRegistro(dadosRegistro.registro.id, { imposto: impostoNum })
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar imposto',
      })
    }
  }

  return (
    <div className="min-h-screen bg-neutral-50/50 pb-24">
      {/* =================================================================== */}
      {/* BARRA SUPERIOR: LISTA DE REGISTROS DE PAGAMENTO & AÇÕES            */}
      {/* =================================================================== */}
      <header className="sticky top-0 z-30 border-b border-border bg-white shadow-xs">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Package className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-foreground">
                  Registros de Pagamento de Fornecedor
                </h1>
                <Badge
                  variant="outline"
                  className="border-primary/20 bg-primary/5 text-xs text-primary font-semibold"
                >
                  Produção
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <span>Fechamentos individuais por fornecedor e ranges de datas independentes</span>
              </p>
            </div>
          </div>

          {/* SELETOR DE REGISTRO & BOTÃO + NOVO REGISTRO */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground hidden sm:inline">Registro:</span>
              <Select
                value={registroSelecionadoId}
                onValueChange={(val) => setRegistroSelecionadoId(val)}
              >
                <SelectTrigger className="h-9 w-[240px] sm:w-[280px] text-xs font-semibold">
                  <SelectValue placeholder="Selecione um registro..." />
                </SelectTrigger>
                <SelectContent className="max-h-72">
                  {registros.map((reg) => {
                    const labelCompra =
                      reg.label_compra ||
                      formatarRangeDatas(reg.data_inicio_compra, reg.data_fim_compra)
                    const fornNome = reg.fornecedor_nome || 'Sem Fornecedor'
                    return (
                      <SelectItem key={reg.id} value={reg.id} className="text-xs">
                        <span className="font-bold text-foreground">{fornNome}</span>
                        <span className="text-muted-foreground ml-1.5 font-mono text-[11px]">
                          ({labelCompra})
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* BOTÃO NOVO REGISTRO */}
            <Button
              variant="default"
              size="sm"
              onClick={handleAbrirModalNovoRegistro}
              className="h-9 gap-1.5 text-xs font-semibold bg-primary hover:bg-primary/90 text-white"
            >
              <Plus className="h-4 w-4" />
              <span>Novo Registro de Pagamento</span>
            </Button>

            {/* RECARREGAR */}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                carregarListaRegistros(registroSelecionadoId)
                if (registroSelecionadoId) carregarRegistro(registroSelecionadoId)
              }}
              disabled={loading}
              className="h-9 w-9 p-0"
              title="Recarregar"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-primary' : ''}`} />
            </Button>
          </div>
        </div>

        {/* FAIXA VISUAL DO REGISTRO SELECIONADO (FORNECEDOR + DUAS FACES DE DATAS) */}
        {dadosRegistro && (
          <div className="border-t border-border/60 bg-muted/30 px-4 py-2 sm:px-6">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 text-xs">
              {/* FORNECEDOR E RANGES COM BOTÃO DE EDIÇÃO */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-md bg-white border border-border px-2.5 py-1 font-semibold text-foreground shadow-2xs">
                  <Building2 className="h-3.5 w-3.5 text-blue-600" />
                  <span>
                    Fornecedor:{' '}
                    <strong className="text-blue-700">
                      {dadosRegistro.registro.fornecedor_nome || 'Nenhum fornecedor vinculado'}
                    </strong>
                  </span>
                </div>

                <div className="flex items-center gap-2 font-mono">
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md bg-blue-50 px-2.5 py-1 font-bold text-blue-700 border border-blue-200"
                    title="Range de Compra"
                  >
                    <Package className="h-3.5 w-3.5" />
                    {labelsFaixas.compra}
                  </span>
                  <span className="text-muted-foreground font-bold tracking-widest">»»»</span>
                  <span
                    className="inline-flex items-center gap-1.5 rounded-md bg-purple-50 px-2.5 py-1 font-bold text-purple-700 border border-purple-200"
                    title="Range de Saques"
                  >
                    <DollarSign className="h-3.5 w-3.5" />
                    {labelsFaixas.saques}
                  </span>
                </div>

                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleAbrirEditarRegistro}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground"
                  title="Editar dados e datas deste registro"
                >
                  <Edit2 className="h-3 w-3 mr-1" />
                  Editar
                </Button>
              </div>

              {/* OPÇÕES ADICIONAIS DO REGISTRO */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleExcluirRegistro}
                  className="h-7 text-[11px] text-muted-foreground hover:text-destructive"
                  title="Excluir este registro de pagamento"
                >
                  <Trash2 className="h-3 w-3 mr-1" />
                  Excluir Registro
                </Button>
              </div>
            </div>
          </div>
        )}
      </header>

      {/* =================================================================== */}
      {/* CONTEÚDO PRINCIPAL DO REGISTRO ATIVO                                */}
      {/* =================================================================== */}
      <main className="mx-auto max-w-7xl px-4 pt-6 sm:px-6">
        {loading && !dadosRegistro ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <RefreshCw className="h-8 w-8 animate-spin text-primary" />
            <p className="text-sm">Carregando dados do registro de pagamento...</p>
          </div>
        ) : !dadosRegistro ? (
          <div className="flex h-64 flex-col items-center justify-center gap-3 text-muted-foreground">
            <Package className="h-10 w-10 text-muted-foreground/40" />
            <p className="text-sm font-semibold">Nenhum registro selecionado</p>
            <Button size="sm" onClick={handleAbrirModalNovoRegistro}>
              Criar Novo Registro de Pagamento
            </Button>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12 items-start">
              {/* ======================================================== */}
              {/* FACE 1: FORNECEDOR (ESQUERDA - 7 COLUNAS)                */}
              {/* ======================================================== */}
              <div className="space-y-6 lg:col-span-7">
                {/* 1.1 GRADE CONSOLIDADA TOTAL DO FORNECEDOR */}
                <Card className="border border-border/80 shadow-xs bg-white overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-blue-50/80 to-indigo-50/40 pb-3 border-b border-border/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-bold tracking-tight text-blue-950 flex items-center gap-2">
                          <Layers className="h-4 w-4 text-blue-600" />
                          Custo/Qtde Total Fornecedor (
                          {dadosRegistro.registro.fornecedor_nome || 'Geral'})
                        </CardTitle>
                        <p className="text-[11px] text-blue-700/80 font-medium mt-0.5">
                          {labelsFaixas.compra} (Consolidado de todas as datas recebidas)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5">
                        {/* BOTÃO ADICIONAR DO FORNECEDOR (CATÁLOGO) */}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleAbrirModalCatalogo}
                          disabled={salvando}
                          className="h-7 text-[11px] border-blue-300 bg-white text-blue-800 hover:bg-blue-100 font-semibold shadow-2xs"
                          title="Listar produtos do catálogo deste fornecedor com custo sugerido"
                        >
                          <Store className="mr-1 h-3.5 w-3.5 text-blue-600" />
                          Adicionar do Fornecedor
                        </Button>

                        {/* NOVO PRODUTO AVULSO */}
                        <Button
                          variant="default"
                          size="sm"
                          onClick={() => {
                            setProdutoEditando({ nome: '', custo_unitario: 0 })
                            setModalProdutoAberto(true)
                          }}
                          className="h-7 text-[11px] bg-blue-600 hover:bg-blue-700 text-white font-semibold"
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
                            <th className="py-2.5 px-2 text-right">Qtde Total</th>
                            <th className="py-2.5 px-2 text-right">Custo uni.</th>
                            <th className="py-2.5 px-2 text-right">Custo Total</th>
                            <th className="py-2.5 pr-3 pl-1 text-center w-8"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border/40 font-medium">
                          {gradeFornecedor.linhas.length === 0 ? (
                            <tr>
                              <td colSpan={5} className="py-8 text-center text-muted-foreground">
                                Nenhum produto adicionado na grade deste registro.
                                <br />
                                <div className="mt-2 flex justify-center gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={handleAbrirModalCatalogo}
                                    className="text-xs text-blue-700 border-blue-200"
                                  >
                                    <Store className="h-3.5 w-3.5 mr-1" />
                                    Adicionar do Fornecedor
                                  </Button>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => {
                                      setProdutoEditando({ nome: '', custo_unitario: 0 })
                                      setModalProdutoAberto(true)
                                    }}
                                    className="text-xs"
                                  >
                                    <Plus className="h-3.5 w-3.5 mr-1" />
                                    Item Avulso
                                  </Button>
                                </div>
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
                                        title="Clique para editar custo unitário neste registro"
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
                                            const prod = dadosRegistro?.produtos.find(
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
                                          Excluir da grade
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
                            <td className="py-3 pl-4 pr-2">Custo Total Fornecedor (Registro)</td>
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

                {/* 1.2 BLOCOS DIÁRIOS DINÂMICOS (USUÁRIO ADICIONA AS DATAS REAIS) */}
                <div className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-2">
                    <div>
                      <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        Lançamentos por Data Real Recebida ({datasGrade.length}{' '}
                        {datasGrade.length === 1 ? 'dia' : 'dias'})
                      </h2>
                      <span className="text-[11px] text-muted-foreground">
                        Adicione apenas as datas em que houve recebimento de produtos
                      </span>
                    </div>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const sug =
                          datasGrade.length > 0
                            ? adicionarDias(datasGrade[datasGrade.length - 1], 1)
                            : dadosRegistro.registro.data_inicio_compra.slice(0, 10)
                        setNovaDataInput(sug)
                        setModalNovaDataAberto(true)
                      }}
                      className="h-7 text-xs border-dashed gap-1 text-foreground"
                    >
                      <CalendarPlus className="h-3.5 w-3.5 text-blue-600" />+ Adicionar Data
                    </Button>
                  </div>

                  {datasGrade.length === 0 ? (
                    <Card className="border border-dashed p-6 text-center text-muted-foreground text-xs space-y-2">
                      <p>Nenhuma data de recebimento adicionada ainda.</p>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          setNovaDataInput(dadosRegistro.registro.data_inicio_compra.slice(0, 10))
                          setModalNovaDataAberto(true)
                        }}
                      >
                        <CalendarPlus className="mr-1.5 h-3.5 w-3.5" />
                        Adicionar Primeira Data
                      </Button>
                    </Card>
                  ) : (
                    datasGrade.map((dataIso) => {
                      const cabecalhoTexto = formatarCabecalhoDia(dataIso)
                      const itensDoDia =
                        dadosRegistro?.produtos.map((p) => ({
                          produto_id: p.id,
                          quantidade: mapaQuantidadesPorDia[dataIso]?.[p.id] || 0,
                        })) || []

                      const totalDoDia = calcularTotalDia(itensDoDia, custoPorProduto)
                      const diaAbrev = getDiaSemanaAbrev(dataIso)
                      const diaMes = formatarDiaMes(dataIso)

                      return (
                        <Card
                          key={dataIso}
                          className="border border-border/80 shadow-xs bg-white overflow-hidden"
                        >
                          <CardHeader className="bg-slate-100/70 py-2 px-4 border-b border-border/60 flex-row items-center justify-between space-y-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-foreground capitalize">
                                {cabecalhoTexto}
                              </span>
                              <Badge
                                variant="secondary"
                                className="font-mono text-[11px] bg-white border border-border"
                              >
                                {diaAbrev} {diaMes}
                              </Badge>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoverDataGrade(dataIso)}
                              className="text-muted-foreground/60 hover:text-destructive p-1 rounded text-xs"
                              title="Remover esta data da grade"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </CardHeader>

                          <CardContent className="p-0">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                  <tr className="border-b border-border/50 bg-muted/20 text-[10px] font-semibold text-muted-foreground uppercase">
                                    <th className="py-1.5 pl-4 pr-2">Produto</th>
                                    <th className="py-1.5 px-2 text-right w-20">Qtde</th>
                                    <th className="py-1.5 px-2 text-right w-24">Custo uni.</th>
                                    <th className="py-1.5 pr-4 pl-2 text-right w-28">
                                      Custo Total
                                    </th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/30">
                                  {dadosRegistro?.produtos.length === 0 ? (
                                    <tr>
                                      <td
                                        colSpan={4}
                                        className="py-3 text-center text-muted-foreground text-[11px]"
                                      >
                                        Cadastre ou adicione produtos do fornecedor acima.
                                      </td>
                                    </tr>
                                  ) : (
                                    dadosRegistro?.produtos.map((prod) => {
                                      const qtd = mapaQuantidadesPorDia[dataIso]?.[prod.id] || 0
                                      const custoTotalLinha = calcularCustoLinha(
                                        qtd,
                                        prod.custo_unitario,
                                      )
                                      const isZero = qtd === 0

                                      return (
                                        <tr
                                          key={`${dataIso}-${prod.id}`}
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
                                                  dataIso,
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
                                    })
                                  )}
                                </tbody>
                                <tfoot>
                                  <tr className="border-t border-border bg-slate-50 font-bold text-xs text-foreground">
                                    <td colSpan={3} className="py-2 pl-4 text-right pr-2">
                                      Custo Total ({diaMes}):
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
                    })
                  )}
                </div>
              </div>

              {/* ======================================================== */}
              {/* FACE 2: SAQUES DOS MARKETPLACES (DIREITA - 5 COLUNAS)    */}
              {/* Pertencem exclusivamente a este registro de pagamento   */}
              {/* ======================================================== */}
              <div className="space-y-6 lg:col-span-5">
                <Card className="border border-border/80 shadow-xs bg-white overflow-hidden">
                  <CardHeader className="bg-gradient-to-r from-purple-50/90 to-pink-50/40 pb-3 border-b border-border/60">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <CardTitle className="text-sm font-bold tracking-tight text-purple-950 flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-purple-600" />
                          Saques dos Marketplaces
                        </CardTitle>
                        <p className="text-[11px] text-purple-800/80 font-medium mt-0.5">
                          {labelsFaixas.saques} (Período de Saques)
                        </p>
                      </div>

                      <Button
                        variant="default"
                        size="sm"
                        onClick={() => {
                          setNovoGrupoTitulo('')
                          setModalNovoGrupoAberto(true)
                        }}
                        className="h-7 text-[11px] bg-purple-700 hover:bg-purple-800 text-white font-semibold"
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Novo Grupo
                      </Button>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-5">
                    {resumoSaques.grupos.length === 0 ? (
                      <div className="py-8 text-center text-muted-foreground text-xs">
                        Nenhum grupo de saques cadastrado neste registro.
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

                    {/* TOTAL GERAL DE SAQUES DO REGISTRO */}
                    <div className="rounded-xl bg-purple-900 p-4 text-white shadow-xs space-y-1">
                      <div className="text-[11px] font-medium tracking-wide uppercase text-purple-200">
                        Total Geral Saques:
                      </div>
                      <div className="text-2xl font-black font-mono tracking-tight text-white">
                        {formatCurrency(resumoSaques.total_saques_geral)}
                      </div>
                    </div>

                    {/* CAMPO DE IMPOSTO DO REGISTRO */}
                    <div className="rounded-xl border border-border bg-slate-50 p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                          <Receipt className="h-3.5 w-3.5" />
                          Imposto do Período:
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
                            dadosRegistro?.registro.imposto === 0
                              ? ''
                              : dadosRegistro?.registro.imposto
                          }
                          onBlur={(e) => handleAlterarImposto(e.target.value)}
                          className="h-10 font-mono text-base font-bold bg-white"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* ======================================================== */}
                {/* FECHAMENTO DO REGISTRO DE PAGAMENTO                     */}
                {/* Saques − Impostos − Custo Fornecedor = Saldo             */}
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
                      <span>Fechamento do Registro</span>
                      <Badge
                        variant={fechamento.is_negativo ? 'destructive' : 'default'}
                        className="font-bold text-[10px]"
                      >
                        {fechamento.is_negativo ? 'Déficit no Período' : 'Superávit no Período'}
                      </Badge>
                    </CardTitle>
                    <p className="text-[11px] text-muted-foreground">
                      Fórmula: Total Saques − Impostos − Custo Fornecedor
                    </p>
                  </CardHeader>

                  <CardContent className="space-y-4 pt-1">
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
                        Saldo Final do Registro
                      </div>
                      <div className="text-3xl sm:text-4xl font-black font-mono tracking-tight">
                        {formatCurrency(fechamento.saldo)}
                      </div>
                      <p className="text-[11px] mt-1 opacity-80">
                        {fechamento.is_negativo
                          ? 'Os saques não cobriram o fornecedor e impostos neste fechamento.'
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

      {/* =================================================================== */}
      {/* MODAL: NOVO REGISTRO DE PAGAMENTO DE FORNECEDOR                     */}
      {/* =================================================================== */}
      <Dialog open={modalNovoRegistroAberto} onOpenChange={setModalNovoRegistroAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Registro de Pagamento de Fornecedor</DialogTitle>
            <DialogDescription>
              Crie um novo fechamento individual com ranges independentes. Registros com datas
              sobrepostas são permitidos.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* FORNECEDOR */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Fornecedor (Referência)
              </label>
              <Select value={novoFornId} onValueChange={setNovoFornId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione o fornecedor..." />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* RANGE COMPRA */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <Package className="h-3.5 w-3.5 text-blue-600" />
                Range de Compra (Início e Fim)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">Início</span>
                  <Input
                    type="date"
                    value={novoDataInicioCompra}
                    onChange={(e) => setNovoDataInicioCompra(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Fim</span>
                  <Input
                    type="date"
                    value={novoDataFimCompra}
                    onChange={(e) => setNovoDataFimCompra(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
              {novoDataInicioCompra && novoDataFimCompra && (
                <p className="text-[11px] font-mono text-blue-700">
                  Label: {formatarRangeDatas(novoDataInicioCompra, novoDataFimCompra)}
                </p>
              )}
            </div>

            {/* RANGE SAQUES */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-purple-600" />
                Range de Saques (Início e Fim)
              </label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">Início</span>
                  <Input
                    type="date"
                    value={novoDataInicioSaques}
                    onChange={(e) => setNovoDataInicioSaques(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Fim</span>
                  <Input
                    type="date"
                    value={novoDataFimSaques}
                    onChange={(e) => setNovoDataFimSaques(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
              {novoDataInicioSaques && novoDataFimSaques && (
                <p className="text-[11px] font-mono text-purple-700">
                  Label: {formatarRangeDatas(novoDataInicioSaques, novoDataFimSaques)}
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovoRegistroAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleCriarNovoRegistro}
              disabled={salvando}
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              Criar Registro
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* MODAL: EDITAR CABEÇALHO DO REGISTRO (FORNECEDOR & RANGES)           */}
      {/* =================================================================== */}
      <Dialog open={modalEditarRegistroAberto} onOpenChange={setModalEditarRegistroAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Registro de Pagamento</DialogTitle>
            <DialogDescription>
              Ajuste o fornecedor vinculado, as faixas de datas ou observações.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Fornecedor</label>
              <Select value={editFornId} onValueChange={setEditFornId}>
                <SelectTrigger className="text-xs">
                  <SelectValue placeholder="Selecione o fornecedor..." />
                </SelectTrigger>
                <SelectContent>
                  {fornecedores.map((f) => (
                    <SelectItem key={f.id} value={f.id} className="text-xs">
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* RANGE COMPRA */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Range de Compra</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">Início</span>
                  <Input
                    type="date"
                    value={editDataInicioCompra}
                    onChange={(e) => setEditDataInicioCompra(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Fim</span>
                  <Input
                    type="date"
                    value={editDataFimCompra}
                    onChange={(e) => setEditDataFimCompra(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            {/* RANGE SAQUES */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Range de Saques</label>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <span className="text-[10px] text-muted-foreground">Início</span>
                  <Input
                    type="date"
                    value={editDataInicioSaques}
                    onChange={(e) => setEditDataInicioSaques(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground">Fim</span>
                  <Input
                    type="date"
                    value={editDataFimSaques}
                    onChange={(e) => setEditDataFimSaques(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Observações</label>
              <Input
                placeholder="Anotações sobre este fechamento..."
                value={editObservacoes}
                onChange={(e) => setEditObservacoes(e.target.value)}
                className="text-xs"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalEditarRegistroAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSalvarEdicaoRegistro}
              disabled={salvando}
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              Salvar Alterações
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* MODAL: ADICIONAR DO FORNECEDOR (CATÁLOGO COM CUSTO EDITÁVEL)        */}
      {/* =================================================================== */}
      <Dialog open={modalCatalogoAberto} onOpenChange={setModalCatalogoAberto}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Store className="h-4 w-4 text-blue-600" />
              Produtos do Catálogo de {dadosRegistro?.registro.fornecedor_nome}
            </DialogTitle>
            <DialogDescription>
              Marque os produtos para incluir na grade deste registro. O custo unitário do cadastro
              é trazido como sugestão e pode ser ajustado antes de adicionar.
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-80 overflow-y-auto divide-y divide-border/60 py-2">
            {catalogoCarregando ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                <RefreshCw className="h-5 w-5 animate-spin mx-auto mb-2 text-primary" />
                Carregando catálogo do fornecedor...
              </div>
            ) : produtosCatalogo.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum produto cadastrado no catálogo deste fornecedor (/fornecedores).
              </div>
            ) : (
              produtosCatalogo.map((prod) => {
                const itemEstado = itensCatalogoSelecionados[prod.id] || {
                  selecionado: false,
                  custoEditado: prod.preco_custo_unitario,
                }
                return (
                  <div
                    key={prod.id}
                    className={`flex items-center justify-between gap-3 p-2.5 transition-colors ${
                      itemEstado.selecionado ? 'bg-blue-50/60' : 'hover:bg-muted/20'
                    }`}
                  >
                    <label className="flex items-center gap-2.5 cursor-pointer flex-1">
                      <input
                        type="checkbox"
                        checked={itemEstado.selecionado}
                        onChange={(e) =>
                          setItensCatalogoSelecionados((prev) => ({
                            ...prev,
                            [prod.id]: {
                              ...itemEstado,
                              selecionado: e.target.checked,
                            },
                          }))
                        }
                        className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                      />
                      <div>
                        <div className="font-semibold text-xs text-foreground">
                          {prod.descricao}
                        </div>
                        {prod.sku_fornecedor && (
                          <span className="text-[10px] text-muted-foreground font-mono">
                            SKU: {prod.sku_fornecedor}
                          </span>
                        )}
                      </div>
                    </label>

                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-muted-foreground">Custo:</span>
                      <span className="text-xs text-muted-foreground font-mono">R$</span>
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={itemEstado.custoEditado}
                        onChange={(e) =>
                          setItensCatalogoSelecionados((prev) => ({
                            ...prev,
                            [prod.id]: {
                              ...itemEstado,
                              custoEditado: parseFloat(e.target.value) || 0,
                            },
                          }))
                        }
                        className="w-20 rounded border border-border/80 bg-white px-2 py-1 text-right font-mono text-xs font-semibold focus:border-primary focus:outline-none"
                      />
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <DialogFooter className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {Object.values(itensCatalogoSelecionados).filter((i) => i.selecionado).length}{' '}
              selecionados
            </span>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setModalCatalogoAberto(false)}>
                Cancelar
              </Button>
              <Button
                onClick={handleAdicionarProdutosCatalogoConfirmar}
                disabled={salvando || produtosCatalogo.length === 0}
                className="bg-primary hover:bg-primary/90 text-white font-semibold"
              >
                Incluir na Grade
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* MODAL: ADICIONAR DATA NA GRADE DINÂMICA                             */}
      {/* =================================================================== */}
      <Dialog open={modalNovaDataAberto} onOpenChange={setModalNovaDataAberto}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>Adicionar Data na Grade</DialogTitle>
            <DialogDescription>
              Selecione o dia real em que houve entrada ou recebimento de produtos.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2 space-y-2">
            <Input
              type="date"
              value={novaDataInput}
              onChange={(e) => setNovaDataInput(e.target.value)}
              className="text-xs font-mono"
            />
            {novaDataInput && (
              <p className="text-[11px] text-muted-foreground">
                {formatarCabecalhoDia(novaDataInput)}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setModalNovaDataAberto(false)}>
              Cancelar
            </Button>
            <Button
              onClick={handleAdicionarDataGrade}
              disabled={!novaDataInput}
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              Adicionar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* MODAL: NOVO PRODUTO AVULSO / EDITAR PRODUTO NA GRADE                */}
      {/* =================================================================== */}
      <Dialog open={modalProdutoAberto} onOpenChange={setModalProdutoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {produtoEditando?.id ? 'Editar Produto na Grade' : 'Cadastrar Produto Avulso'}
            </DialogTitle>
            <DialogDescription>
              Itens avulsos pertencem exclusivamente a este registro de pagamento.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">Nome / Descrição</label>
              <Input
                placeholder="Ex: Toalha Banhão Ouro"
                value={produtoEditando?.nome || ''}
                onChange={(e) => setProdutoEditando((prev) => ({ ...prev, nome: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-foreground">
                Custo Unitário neste Registro (R$)
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
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              Salvar Produto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* =================================================================== */}
      {/* MODAL: NOVO GRUPO DE SAQUE (MARKETPLACE)                            */}
      {/* =================================================================== */}
      <Dialog open={modalNovoGrupoAberto} onOpenChange={setModalNovoGrupoAberto}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Novo Grupo de Saque</DialogTitle>
            <DialogDescription>
              Crie um canal de saque para este registro de pagamento.
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
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              Criar Grupo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
