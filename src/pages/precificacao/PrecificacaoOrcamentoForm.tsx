import { useEffect, useState, useMemo } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Calendar,
  User,
  Store,
  Sparkles,
  AlertTriangle,
  Layers,
  ChevronRight,
  Info,
  Check,
  Percent,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { orcamentosService } from '@/services/orcamentos'
import { normalizarOrcamentoRecord } from '@/lib/precificacao/orcamentoCalculo'
import { precificacaoService } from '@/services/precificacao'
import { separacaoKitsService } from '@/services/separacaoKits'
import { cadastrosService } from '@/services/cadastros'
import { clientesOrcamentoService } from '@/services/clientesOrcamento'
import { ClienteDialog } from '@/components/precificacao/ClienteDialog'
import {
  OrcamentoRecord,
  CreateOrcamentoInput,
  OrcamentoPrecoCanalItem,
  OrcamentoFreteCanalItem,
  OrcamentoProdutoVinculadoCanal,
  ClienteOrcamentoRecord,
  StatusOrcamento,
} from '@/types/orcamento'
import { PrecCanalRecord } from '@/types/precificacao'
import { KitTema, KitModelo } from '@/types/separacaoKits'
import { Pessoa } from '@/types/domain'
import {
  calcularTotaisPorCanal,
  converterCheioParaUnitario,
  converterUnitarioParaCheio,
  formatarMoedaBR,
} from '@/lib/precificacao/orcamentoCalculo'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'

interface FormItemLinha {
  id?: string
  modelo?: string
  modelo_nome: string
  modelo_codigo?: string
  quantidade: number
  precos_canais: Record<string, OrcamentoPrecoCanalItem>
  fretes_canais: Record<string, OrcamentoFreteCanalItem>
  produtos_canais: Record<string, OrcamentoProdutoVinculadoCanal>
}

export default function PrecificacaoOrcamentoForm() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const isEdicao = Boolean(id)

  const [carregando, setCarregando] = useState(true)
  const [salvando, setSalvando] = useState(false)

  // Metadados do banco
  const [canaisDisponiveis, setCanaisDisponiveis] = useState<PrecCanalRecord[]>([])
  const [temasDisponiveis, setTemasDisponiveis] = useState<KitTema[]>([])
  const [modelosDisponiveis, setModelosDisponiveis] = useState<KitModelo[]>([])
  const [pessoasDisponiveis, setPessoasDisponiveis] = useState<Pessoa[]>([])
  const [clientesDisponiveis, setClientesDisponiveis] = useState<ClienteOrcamentoRecord[]>([])
  const [produtosAprovadosPorCanal, setProdutosAprovadosPorCanal] = useState<
    Record<
      string,
      Array<{
        precificacao_id: string
        produto_id: string
        produto_nome: string
        produto_sku?: string
        preco_aprovado: number
      }>
    >
  >({})

  // Modal inline de criação rápida de cliente
  const [modalClienteAberto, setModalClienteAberto] = useState(false)

  // Estado do formulário
  const [titulo, setTitulo] = useState('')
  const [clienteId, setClienteId] = useState<string>('')
  const [clientePessoaId, setClientePessoaId] = useState<string>('')
  const [clienteNome, setClienteNome] = useState('')
  const [clienteWhatsapp, setClienteWhatsapp] = useState('')
  const [dataOrcamento, setDataOrcamento] = useState(new Date().toISOString().split('T')[0])
  const [validadeDias, setValidadeDias] = useState<number>(7)
  const [validadeData, setValidadeData] = useState<string>('')
  const [status, setStatus] = useState<StatusOrcamento>('rascunho')
  const [canaisSelecionadosIds, setCanaisSelecionadosIds] = useState<string[]>([])
  const [temaId, setTemaId] = useState<string>('')
  const [temaNome, setTemaNome] = useState<string>('')
  const [cor, setCor] = useState<string>('')
  const [observacoes, setObservacoes] = useState<string>('')

  // Itens do orçamento
  const [itens, setItens] = useState<FormItemLinha[]>([])

  // Atualiza data de validade quando altera data ou dias
  useEffect(() => {
    if (dataOrcamento && validadeDias) {
      const dt = new Date(dataOrcamento)
      dt.setDate(dt.getDate() + Number(validadeDias))
      setValidadeData(dt.toISOString().split('T')[0])
    }
  }, [dataOrcamento, validadeDias])

  // Carrega listas de apoio
  useEffect(() => {
    let active = true

    async function carregarDadosIniciais() {
      try {
        setCarregando(true)
        const [canais, temas, modelos, pessoas, clientes] = await Promise.all([
          precificacaoService.listCanais(),
          separacaoKitsService.getTemas(),
          separacaoKitsService.getModelos(),
          cadastrosService.listPessoas().catch(() => []),
          clientesOrcamentoService.listClientes().catch(() => []),
        ])

        if (!active) return

        const canaisAtivos = (canais || []).filter((c) => c.ativo !== false)
        setCanaisDisponiveis(canaisAtivos)
        setTemasDisponiveis(temas || [])
        setModelosDisponiveis(modelos || [])
        setPessoasDisponiveis(pessoas || [])
        setClientesDisponiveis(clientes || [])

        // Carrega produtos aprovados de cada canal
        const mapaAprovados: Record<string, any[]> = {}
        await Promise.all(
          canaisAtivos.map(async (c) => {
            const prods = await orcamentosService.listarProdutosAprovadosPorCanal(c.id)
            mapaAprovados[c.id] = prods
          }),
        )
        if (!active) return
        setProdutosAprovadosPorCanal(mapaAprovados)

        // Se for novo, pré-seleciona os canais mais comuns (Shopee e Site ou os 2 primeiros)
        if (!isEdicao) {
          const idsPadrao = canaisAtivos.slice(0, 2).map((c) => c.id)
          setCanaisSelecionadosIds(idsPadrao)

          // Item inicial de exemplo
          setItens([
            {
              modelo_nome: 'Banho',
              quantidade: 25,
              precos_canais: {},
              fretes_canais: {},
              produtos_canais: {},
            },
            {
              modelo_nome: 'Rosto',
              quantidade: 25,
              precos_canais: {},
              fretes_canais: {},
              produtos_canais: {},
            },
          ])
        } else if (id) {
          // Carrega registro existente
          const orc = await orcamentosService.getOrcamento(id)
          setTitulo(orc.titulo || '')
          setClienteId(orc.cliente || '')
          setClientePessoaId(orc.cliente_pessoa || '')
          setClienteNome(orc.cliente_nome || '')
          setClienteWhatsapp(orc.cliente_whatsapp || '')
          setDataOrcamento(orc.data_orcamento ? orc.data_orcamento.split('T')[0] : '')
          setValidadeDias(orc.validade_dias || 7)
          setValidadeData(orc.validade_data ? orc.validade_data.split('T')[0] : '')
          setStatus(orc.status || 'rascunho')
          const orcNormalizado = normalizarOrcamentoRecord(orc)
          setCanaisSelecionadosIds(orcNormalizado.canais_comparados || [])
          setTemaId(orcNormalizado.tema || '')
          setTemaNome(orcNormalizado.tema_nome || '')
          setCor(orcNormalizado.cor || '')
          setObservacoes(orcNormalizado.observacoes || '')

          const itensOrc = Array.isArray(orcNormalizado.expand?.itens)
            ? orcNormalizado.expand.itens
            : []
          if (itensOrc.length > 0) {
            setItens(
              itensOrc.map((it) => ({
                id: it.id,
                modelo: it.modelo,
                modelo_nome: it.modelo_nome || '',
                modelo_codigo: it.modelo_codigo,
                quantidade: it.quantidade || 1,
                precos_canais: it.precos_canais || {},
                fretes_canais: it.fretes_canais || {},
                produtos_canais: it.produtos_canais || {},
              })),
            )
          }
        }
      } catch (err: any) {
        console.error('Erro ao carregar dados:', err)
        toast({
          title: 'Erro de carregamento',
          description: err.message,
          variant: 'destructive',
        })
      } finally {
        if (active) setCarregando(false)
      }
    }

    carregarDadosIniciais()

    return () => {
      active = false
    }
  }, [id, isEdicao])

  // Filtra modelos do tema selecionado
  const modelosDoTema = useMemo(() => {
    if (!temaId) return modelosDisponiveis
    return modelosDisponiveis.filter((m) => m.tema === temaId)
  }, [temaId, modelosDisponiveis])

  // Ao selecionar um cliente cadastrado da coleção 'clientes'
  const handleSelecionarCliente = (cId: string) => {
    if (cId === 'novo') {
      setModalClienteAberto(true)
      return
    }
    setClienteId(cId === 'none' ? '' : cId)
    if (cId && cId !== 'none') {
      const cl = clientesDisponiveis.find((x) => x.id === cId)
      if (cl) {
        setClienteNome(cl.nome)
        if (cl.whatsapp || cl.telefone) {
          setClienteWhatsapp(cl.whatsapp || cl.telefone || '')
        }
      }
    }
  }

  // Callback de sucesso ao salvar cliente no modal inline
  const handleClienteCriadoInline = (novoCliente: ClienteOrcamentoRecord) => {
    setClientesDisponiveis((prev) => [novoCliente, ...prev])
    setClienteId(novoCliente.id)
    setClienteNome(novoCliente.nome)
    if (novoCliente.whatsapp || novoCliente.telefone) {
      setClienteWhatsapp(novoCliente.whatsapp || novoCliente.telefone || '')
    }
  }

  // Ao selecionar um tema
  const handleSelecionarTema = (tId: string) => {
    setTemaId(tId)
    const t = temasDisponiveis.find((x) => x.id === tId)
    setTemaNome(t?.nome || '')
  }

  // Alternar canal selecionado
  const handleToggleCanal = (canalId: string) => {
    setCanaisSelecionadosIds((prev) =>
      prev.includes(canalId) ? prev.filter((c) => c !== canalId) : [...prev, canalId],
    )
  }

  // Adicionar item
  const handleAdicionarItem = () => {
    setItens((prev) => [
      ...prev,
      {
        modelo_nome: '',
        quantidade: 1,
        precos_canais: {},
        fretes_canais: {},
        produtos_canais: {},
      },
    ])
  }

  // Remover item
  const handleRemoverItem = (index: number) => {
    setItens((prev) => prev.filter((_, i) => i !== index))
  }

  // Atualizar campo de item
  const handleAtualizarItem = (index: number, campo: keyof FormItemLinha, valor: any) => {
    setItens((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [campo]: valor }
      return copy
    })
  }

  // Ao selecionar modelo pré-cadastrado no item (expedição - puro, sem preço e sem alerta)
  const handleSelecionarModeloNoItem = (index: number, modeloId: string) => {
    const mod = modelosDisponiveis.find((m) => m.id === modeloId)
    if (!mod) {
      setItens((prev) => {
        const copy = [...prev]
        copy[index] = {
          ...copy[index],
          modelo: undefined,
          modelo_codigo: undefined,
        }
        return copy
      })
      return
    }

    setItens((prev) => {
      const copy = [...prev]
      copy[index] = {
        ...copy[index],
        modelo: mod.id,
        modelo_nome: copy[index].modelo_nome || mod.nome,
        modelo_codigo: mod.codigo,
      }
      return copy
    })
  }

  // Ao selecionar um Produto Vinculado aprovado para um canal específico no item
  const handleSelecionarProdutoVinculadoNoCanal = (
    index: number,
    canalId: string,
    produtoId: string,
  ) => {
    const canalObj = canaisDisponiveis.find((c) => c.id === canalId)
    if (!canalObj) return

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      if (!it) return prev

      const prodsCanal = produtosAprovadosPorCanal[canalId] || []
      const prodAprovado = prodsCanal.find((p) => p.produto_id === produtoId)

      const precos = { ...it.precos_canais }
      const produtosCanais = { ...it.produtos_canais }
      const qtd = Number(it.quantidade) || 1

      if (!prodAprovado || produtoId === 'none') {
        // Remove vínculo desse canal
        delete produtosCanais[canalId]
        if (precos[canalId]) {
          precos[canalId] = {
            ...precos[canalId],
            produto_vinculado_id: undefined,
            produto_vinculado_nome: undefined,
            produto_vinculado_sku: undefined,
            precificacao_id: undefined,
            tem_precificacao_oficial: false,
          }
        }
      } else {
        // Vincula produto aprovado do canal e puxa preço unitário aprovado
        const precoAprovado = prodAprovado.preco_aprovado
        const precoCheio = Math.round(precoAprovado * qtd * 100) / 100

        produtosCanais[canalId] = {
          canal_id: canalId,
          canal_nome: canalObj.nome,
          produto_id: prodAprovado.produto_id,
          produto_nome: prodAprovado.produto_nome,
          produto_sku: prodAprovado.produto_sku,
          preco_aprovado: precoAprovado,
          precificacao_id: prodAprovado.precificacao_id,
        }

        precos[canalId] = {
          canal_id: canalId,
          canal_nome: canalObj.nome,
          preco_unitario: precoAprovado,
          preco_cheio: precoCheio,
          preco_sugerido_oficial: precoAprovado,
          tem_precificacao_oficial: true,
          desconto_aplicado: false,
          produto_vinculado_id: prodAprovado.produto_id,
          produto_vinculado_nome: prodAprovado.produto_nome,
          produto_vinculado_sku: prodAprovado.produto_sku,
          precificacao_id: prodAprovado.precificacao_id,
        }
      }

      copy[index] = {
        ...it,
        precos_canais: precos,
        produtos_canais: produtosCanais,
      }
      return copy
    })
  }

  // Preço unitário digitado manualmente => calcula Preço Cheio em tempo real (unitário × quantidade)
  const handleAlterarPrecoUnitarioCanal = (
    index: number,
    canalId: string,
    valorUnitario: number,
  ) => {
    const canalObj = canaisDisponiveis.find((c) => c.id === canalId)
    if (!canalObj) return

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      const precos = { ...it.precos_canais }
      const oficial = precos[canalId]?.preco_sugerido_oficial
      const qtd = Number(it.quantidade) || 1
      const precoCheioCalculado = converterUnitarioParaCheio(valorUnitario, qtd)

      precos[canalId] = {
        canal_id: canalId,
        canal_nome: canalObj.nome,
        preco_unitario: valorUnitario,
        preco_cheio: precoCheioCalculado,
        preco_sugerido_oficial: oficial,
        tem_precificacao_oficial: precos[canalId]?.tem_precificacao_oficial ?? false,
        desconto_aplicado: oficial ? valorUnitario < oficial : false,
        produto_vinculado_id: precos[canalId]?.produto_vinculado_id,
        produto_vinculado_nome: precos[canalId]?.produto_vinculado_nome,
        produto_vinculado_sku: precos[canalId]?.produto_vinculado_sku,
        precificacao_id: precos[canalId]?.precificacao_id,
      }

      copy[index] = { ...it, precos_canais: precos }
      return copy
    })
  }

  // Preço cheio digitado manualmente => calcula Preço Unitário em tempo real (cheio ÷ quantidade)
  const handleAlterarPrecoCheioCanal = (index: number, canalId: string, valorCheio: number) => {
    const canalObj = canaisDisponiveis.find((c) => c.id === canalId)
    if (!canalObj) return

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      const precos = { ...it.precos_canais }
      const oficial = precos[canalId]?.preco_sugerido_oficial
      const qtd = Number(it.quantidade) || 1
      const precoUnitarioCalculado = converterCheioParaUnitario(valorCheio, qtd)

      precos[canalId] = {
        canal_id: canalId,
        canal_nome: canalObj.nome,
        preco_unitario: precoUnitarioCalculado,
        preco_cheio: valorCheio,
        preco_sugerido_oficial: oficial,
        tem_precificacao_oficial: precos[canalId]?.tem_precificacao_oficial ?? false,
        desconto_aplicado: oficial ? precoUnitarioCalculado < oficial : false,
        produto_vinculado_id: precos[canalId]?.produto_vinculado_id,
        produto_vinculado_nome: precos[canalId]?.produto_vinculado_nome,
        produto_vinculado_sku: precos[canalId]?.produto_vinculado_sku,
        precificacao_id: precos[canalId]?.precificacao_id,
      }

      copy[index] = { ...it, precos_canais: precos }
      return copy
    })
  }

  // Quando altera quantidade de um item, recalcula precos cheios com base nos unitários existentes
  const handleAlterarQuantidadeItem = (index: number, novaQtd: number) => {
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      if (!it) return prev
      const precos = { ...it.precos_canais }
      for (const cId of Object.keys(precos)) {
        const u = precos[cId]?.preco_unitario || 0
        precos[cId] = {
          ...precos[cId],
          preco_cheio: Math.round(u * novaQtd * 100) / 100,
        }
      }
      copy[index] = {
        ...it,
        quantidade: novaQtd,
        precos_canais: precos,
      }
      return copy
    })
  }

  // Atualiza frete digitado manualmente no canal
  const handleAlterarFreteCanal = (index: number, canalId: string, valor: number) => {
    const canalObj = canaisDisponiveis.find((c) => c.id === canalId)
    if (!canalObj) return

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      const fretes = { ...it.fretes_canais }

      fretes[canalId] = {
        canal_id: canalId,
        canal_nome: canalObj.nome,
        valor_frete: valor,
      }

      copy[index] = { ...it, fretes_canais: fretes }
      return copy
    })
  }

  // Canais ativos selecionados para exibição
  const canaisSelecionados = useMemo(() => {
    return canaisDisponiveis.filter((c) => canaisSelecionadosIds.includes(c.id))
  }, [canaisDisponiveis, canaisSelecionadosIds])

  // Totais calculados em tempo real
  const totaisCalculados = useMemo(() => {
    return calcularTotaisPorCanal(
      canaisSelecionados.map((c) => ({ id: c.id, nome: c.nome })),
      itens,
    )
  }, [canaisSelecionados, itens])

  // Salvar Orçamento
  const handleSalvar = async () => {
    if (!clienteNome.trim()) {
      toast({
        title: 'Cliente obrigatório',
        description: 'Selecione ou informe o nome do cliente.',
        variant: 'destructive',
      })
      return
    }

    if (canaisSelecionadosIds.length === 0) {
      toast({
        title: 'Selecione ao menos um canal',
        description: 'Escolha os canais que farão parte desta cotação comparativa.',
        variant: 'destructive',
      })
      return
    }

    if (itens.length === 0) {
      toast({
        title: 'Adicione itens',
        description: 'O orçamento precisa ter ao menos um item / modelo.',
        variant: 'destructive',
      })
      return
    }

    try {
      setSalvando(true)

      // Monta título automático se em branco
      let tituloFinal = titulo
      if (!tituloFinal.trim()) {
        const qtdTotal = itens.reduce((acc, i) => acc + (Number(i.quantidade) || 0), 0)
        const nomes = itens
          .map((i) => i.modelo_nome)
          .filter(Boolean)
          .join(' e ')
        tituloFinal = `Combo ${qtdTotal} unidades ${nomes || 'Itens'}`
        if (temaNome) tituloFinal += ` Tema ${temaNome.toUpperCase()}`
        if (cor) tituloFinal += ` cor ${cor.toUpperCase()}`
      }

      const payload: CreateOrcamentoInput = {
        titulo: tituloFinal,
        cliente: clienteId || undefined,
        cliente_pessoa: clientePessoaId || undefined, // snapshot/legado
        cliente_nome: clienteNome,
        cliente_whatsapp: clienteWhatsapp || undefined,
        data_orcamento: dataOrcamento,
        validade_dias: validadeDias,
        validade_data: validadeData,
        status,
        canais_comparados: canaisSelecionadosIds,
        tema: temaId || undefined,
        tema_nome: temaNome || undefined,
        cor: cor || undefined,
        observacoes: observacoes || undefined,
        itens: itens.map((it, idx) => ({
          id: it.id,
          modelo: it.modelo,
          modelo_nome: it.modelo_nome || 'Item sem nome',
          modelo_codigo: it.modelo_codigo,
          quantidade: Number(it.quantidade) || 1,
          precos_canais: it.precos_canais,
          fretes_canais: it.fretes_canais,
          produtos_canais: it.produtos_canais,
          ordem: idx,
        })),
      }

      let orcResultado: OrcamentoRecord
      if (isEdicao && id) {
        orcResultado = await orcamentosService.updateOrcamento(id, payload)
        toast({
          title: 'Orçamento atualizado!',
          description: `Alterações salvas com sucesso no orçamento ${orcResultado.codigo}.`,
        })
      } else {
        orcResultado = await orcamentosService.createOrcamento(payload)
        toast({
          title: 'Orçamento criado!',
          description: `Novo orçamento ${orcResultado.codigo} gerado com sucesso.`,
        })
      }

      navigate(`/precificacao/orcamentos/${orcResultado.id}`)
    } catch (err: any) {
      console.error('Erro ao salvar orçamento:', err)
      toast({
        title: 'Erro ao salvar',
        description: err.message || 'Verifique os dados preenchidos.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  if (carregando) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-80 w-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
            <Link
              to="/precificacao/orcamentos"
              className="text-primary hover:underline flex items-center gap-1 font-bold"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Orçamentos
            </Link>
            <ChevronRight className="h-3 w-3" />
            <span>{isEdicao ? 'Editar Cotação' : 'Nova Cotação'}</span>
          </div>
          <h1 className="text-2xl font-black text-foreground">
            {isEdicao ? 'Editar Orçamento' : 'Gerar Orçamento para Cliente'}
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure o combo, selecione os canais comparados e ajuste preços e fretes
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/precificacao/orcamentos">Cancelar</Link>
          </Button>
          <Button
            size="sm"
            onClick={handleSalvar}
            disabled={salvando}
            className="bg-primary hover:bg-primary/90 text-white font-bold shadow-xs"
          >
            <Save className="w-4 h-4 mr-1.5" />
            {salvando ? 'Salvando...' : 'Salvar & Gerar Opções'}
          </Button>
        </div>
      </div>

      {/* BLOCO 1: DADOS DO CLIENTE & PROPOSTA */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <CardTitle className="text-base font-bold">1. Cliente e Validade</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Vincule um cliente cadastrado ou digite livremente nome e WhatsApp
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold">Cliente (Módulo Orçamentos)</Label>
              <button
                type="button"
                onClick={() => setModalClienteAberto(true)}
                className="text-[11px] font-bold text-primary hover:underline flex items-center gap-0.5"
              >
                <Plus className="w-3 h-3" /> Novo
              </button>
            </div>
            <Select value={clienteId || 'none'} onValueChange={handleSelecionarCliente}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione um cliente (PF / PJ)..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Digitação Livre / Sem Vínculo --</SelectItem>
                <SelectItem value="novo" className="text-primary font-bold">
                  + Cadastrar Novo Cliente Agora...
                </SelectItem>
                {clientesDisponiveis.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome} {c.tipo === 'pessoa_juridica' ? '(PJ)' : '(PF)'}{' '}
                    {c.whatsapp ? `• ${c.whatsapp}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">
              Nome do Cliente <span className="text-red-500">*</span>
            </Label>
            <Input
              placeholder="Ex: Maria Eduarda"
              value={clienteNome}
              onChange={(e) => setClienteNome(e.target.value)}
              className="h-9 text-xs font-semibold"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">WhatsApp do Cliente</Label>
            <Input
              placeholder="(11) 99999-9999"
              value={clienteWhatsapp}
              onChange={(e) => setClienteWhatsapp(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Status do Orçamento</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as StatusOrcamento)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rascunho">Rascunho</SelectItem>
                <SelectItem value="enviado">Enviado</SelectItem>
                <SelectItem value="aceito">Aceito</SelectItem>
                <SelectItem value="recusado">Recusado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Data da Proposta</Label>
            <Input
              type="date"
              value={dataOrcamento}
              onChange={(e) => setDataOrcamento(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Validade (em dias)</Label>
            <Input
              type="number"
              min="1"
              value={validadeDias}
              onChange={(e) => setValidadeDias(Number(e.target.value) || 1)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Data Limite de Validade</Label>
            <Input
              type="date"
              value={validadeData}
              onChange={(e) => setValidadeData(e.target.value)}
              className="h-9 text-xs bg-muted/30"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Título Personalizado (opcional)</Label>
            <Input
              placeholder="Ex: Combo 25 Toalhas Banho e Rosto"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              className="h-9 text-xs"
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 2: SELEÇÃO DE CANAIS COMPARADOS */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              <CardTitle className="text-base font-bold">2. Canais Comparados</CardTitle>
            </div>
            <span className="text-xs text-muted-foreground">
              {canaisSelecionadosIds.length} selecionado(s)
            </span>
          </div>
          <CardDescription className="text-xs">
            Selecione quais canais serão exibidos lado a lado na cotação do cliente
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {canaisDisponiveis.map((canal) => {
              const selecionado = canaisSelecionadosIds.includes(canal.id)
              return (
                <div
                  key={canal.id}
                  onClick={() => handleToggleCanal(canal.id)}
                  className={`p-3 rounded-xl border-2 cursor-pointer transition-all flex items-center justify-between ${
                    selecionado
                      ? 'border-primary bg-primary/5 text-foreground shadow-xs'
                      : 'border-border/70 bg-card hover:bg-muted/40 text-muted-foreground'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Checkbox
                      checked={selecionado}
                      onCheckedChange={() => handleToggleCanal(canal.id)}
                    />
                    <span className="font-bold text-xs truncate text-foreground">{canal.nome}</span>
                  </div>
                  <Badge variant="secondary" className="text-[9px] shrink-0">
                    {canal.tipo === 'site_proprio' ? 'Site' : 'Mkt'}
                  </Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 3: ESPECIFICAÇÃO DE TEMA E COR */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-primary" />
            <CardTitle className="text-base font-bold">3. Tema e Variação</CardTitle>
          </div>
          <CardDescription className="text-xs">
            Escolha o tema dos kits e a cor desejada pelo cliente
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Tema do Kit (opcional)</Label>
            <Select value={temaId} onValueChange={handleSelecionarTema}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione um tema cadastrado..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">-- Nenhum ou Digitação Livre --</SelectItem>
                {temasDisponiveis.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Nome do Tema (Livre)</Label>
            <Input
              placeholder="Ex: BLUEY, Turma da Mônica..."
              value={temaNome}
              onChange={(e) => setTemaNome(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Cor Escolhida</Label>
            <Input
              placeholder="Ex: AZUL, ROSA, BRANCO..."
              value={cor}
              onChange={(e) => setCor(e.target.value)}
              className="h-9 text-xs uppercase"
            />
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 4: ITENS DO COMBO COM PREÇOS POR CANAL */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-row items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-primary" />
              <CardTitle className="text-base font-bold">4. Itens & Quantidades</CardTitle>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Preços pré-carregados das precificações oficiais. Altere pontualmente sem afetar o
              canal oficial.
            </CardDescription>
          </div>
          <Button
            size="sm"
            onClick={handleAdicionarItem}
            variant="outline"
            className="text-xs font-bold border-primary/30 text-primary hover:bg-primary/5"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Adicionar Item
          </Button>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {itens.map((item, index) => (
            <div
              key={index}
              className="p-4 rounded-xl border border-border/80 bg-card shadow-xs space-y-3"
            >
              {/* Linha 1 do item: identificação e quantidade */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-border/40 pb-3">
                <div className="flex flex-wrap items-center gap-3 flex-1">
                  <span className="h-6 w-6 rounded-full bg-primary/10 text-primary font-bold text-xs flex items-center justify-center">
                    {index + 1}
                  </span>

                  {/* Seletor rápido de modelo existente (apenas para indicar modelo da expedição) */}
                  <div className="w-52">
                    <Select
                      value={item.modelo || 'none'}
                      onValueChange={(val) => handleSelecionarModeloNoItem(index, val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue placeholder="Modelo Expedição (opcional)..." />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- Modelo Livre --</SelectItem>
                        {modelosDoTema.map((m) => (
                          <SelectItem key={m.id} value={m.id}>
                            {m.codigo} - {m.nome}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {/* Nome do Modelo (livre ou puxado) */}
                  <div className="flex-1 min-w-[160px]">
                    <Input
                      placeholder="Nome do Modelo (ex: Banho, Rosto...)"
                      value={item.modelo_nome}
                      onChange={(e) => handleAtualizarItem(index, 'modelo_nome', e.target.value)}
                      className="h-8 text-xs font-semibold"
                    />
                  </div>

                  {/* Quantidade */}
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs text-muted-foreground">Qtd:</Label>
                    <Input
                      type="number"
                      min="1"
                      value={item.quantidade}
                      onChange={(e) =>
                        handleAlterarQuantidadeItem(index, Math.max(1, Number(e.target.value) || 1))
                      }
                      className="h-8 w-20 text-xs font-bold text-center"
                    />
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleRemoverItem(index)}
                  className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50"
                  title="Remover Item"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>

              {/* Linha 2 do item: Colunas de canais com Produto Vinculado aprovado, Preço Unit., Preço Cheio e Frete */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {canaisSelecionados.map((canal) => {
                  const precoObj = item.precos_canais[canal.id]
                  const freteObj = item.fretes_canais[canal.id]
                  const produtoVinculadoObj = item.produtos_canais?.[canal.id]

                  const precoUnit = precoObj?.preco_unitario || 0
                  const precoCheio =
                    precoObj?.preco_cheio !== undefined
                      ? precoObj.preco_cheio
                      : Math.round(precoUnit * item.quantidade * 100) / 100
                  const frete = freteObj?.valor_frete || 0

                  const prodsAprovadosDesteCanal = produtosAprovadosPorCanal[canal.id] || []

                  return (
                    <div
                      key={canal.id}
                      className="p-3 rounded-lg border border-border/70 bg-muted/20 space-y-2.5 text-xs"
                    >
                      <div className="flex items-center justify-between font-bold text-foreground">
                        <span className="text-xs font-black">{canal.nome}</span>
                        <span className="text-primary font-black">
                          Subtotal: {formatarMoedaBR(precoCheio)}
                        </span>
                      </div>

                      {/* Campo Produto Vinculado filtrado por este canal */}
                      <div className="space-y-1 bg-white p-2 rounded-md border border-border/60">
                        <Label className="text-[10px] font-bold text-muted-foreground flex items-center justify-between">
                          <span>Produto Vinculado ({canal.nome})</span>
                          {produtoVinculadoObj?.preco_aprovado && (
                            <span className="text-emerald-700 font-mono">
                              Aprovado: {formatarMoedaBR(produtoVinculadoObj.preco_aprovado)}
                            </span>
                          )}
                        </Label>
                        <Select
                          value={produtoVinculadoObj?.produto_id || 'none'}
                          onValueChange={(val) =>
                            handleSelecionarProdutoVinculadoNoCanal(index, canal.id, val)
                          }
                        >
                          <SelectTrigger className="h-7 text-[11px]">
                            <SelectValue placeholder="Vincular produto aprovado..." />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">-- Modelo puro (Sem vínculo) --</SelectItem>
                            {prodsAprovadosDesteCanal.map((p) => (
                              <SelectItem key={p.produto_id} value={p.produto_id}>
                                {p.produto_nome} {p.produto_sku ? `(${p.produto_sku})` : ''} -{' '}
                                {formatarMoedaBR(p.preco_aprovado)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Conversão em Tempo Real: Preço Unitário <-> Preço Cheio */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] text-muted-foreground block font-medium">
                            Preço Unit. (R$)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0,00"
                            value={precoUnit || ''}
                            onChange={(e) =>
                              handleAlterarPrecoUnitarioCanal(
                                index,
                                canal.id,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="h-7 text-xs font-semibold"
                          />
                        </div>

                        <div>
                          <Label className="text-[10px] text-muted-foreground block font-medium">
                            Preço Cheio (R$)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="0,00"
                            value={precoCheio || ''}
                            onChange={(e) =>
                              handleAlterarPrecoCheioCanal(
                                index,
                                canal.id,
                                parseFloat(e.target.value) || 0,
                              )
                            }
                            className="h-7 text-xs font-semibold text-primary"
                          />
                        </div>
                      </div>

                      <div>
                        <Label className="text-[10px] text-muted-foreground block font-medium">
                          Frete do Item (R$)
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0,00"
                          value={frete || ''}
                          onChange={(e) =>
                            handleAlterarFreteCanal(
                              index,
                              canal.id,
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}

          {itens.length === 0 && (
            <div className="text-center py-6 text-muted-foreground text-xs">
              Nenhum item adicionado ainda. Clique em "Adicionar Item" acima.
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 5: RESUMO DOS TOTAIS POR CANAL EM TEMPO REAL */}
      <Card className="border-2 border-primary/20 bg-primary/5 shadow-xs">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-black text-primary">
            Totais Comparados por Canal (Tempo Real)
          </CardTitle>
          <CardDescription className="text-xs">
            Soma dos itens + Fretes conforme a fórmula: Total Canal = Subtotal dos Itens + Frete
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {canaisSelecionados.map((canal) => {
              const tot = totaisCalculados[canal.id]
              return (
                <div
                  key={canal.id}
                  className="bg-white p-4 rounded-xl border border-primary/20 shadow-xs space-y-1.5"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-sm text-foreground">{canal.nome}</span>
                    <Badge variant="outline" className="text-[9px] border-primary/40 text-primary">
                      {canal.tipo === 'site_proprio' ? 'Site' : 'Marketplace'}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground space-y-0.5">
                    <div className="flex justify-between">
                      <span>Itens:</span>
                      <span className="font-medium">{formatarMoedaBR(tot?.total_itens || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Fretes:</span>
                      <span className="font-medium">{formatarMoedaBR(tot?.total_fretes || 0)}</span>
                    </div>
                  </div>
                  <div className="pt-2 border-t border-border/60 flex justify-between items-baseline">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase">
                      Total:
                    </span>
                    <span className="text-lg font-black text-primary">
                      {formatarMoedaBR(tot?.total_geral || 0)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* BLOCO 6: OBSERVAÇÕES */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-2">
          <CardTitle className="text-xs font-bold text-foreground">
            Observações Gerais da Proposta (opcional)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            placeholder="Ex: Condições de frete e prazos de produção de 3 a 5 dias úteis."
            value={observacoes}
            onChange={(e) => setObservacoes(e.target.value)}
            className="text-xs"
          />
        </CardContent>
      </Card>

      {/* Botões de Ação Final */}
      <div className="flex items-center justify-end gap-3 pt-4 border-t border-border/60">
        <Button asChild variant="outline">
          <Link to="/precificacao/orcamentos">Cancelar</Link>
        </Button>
        <Button
          onClick={handleSalvar}
          disabled={salvando}
          className="bg-primary hover:bg-primary/90 text-white font-bold px-6 shadow-xs"
        >
          <Save className="w-4 h-4 mr-1.5" />
          {salvando ? 'Salvando...' : 'Salvar & Gerar Opções (WhatsApp, PDF e Link)'}
        </Button>
      </div>

      {/* Modal Inline para cadastro rápido de cliente */}
      <ClienteDialog
        open={modalClienteAberto}
        onOpenChange={setModalClienteAberto}
        initialNome={clienteNome}
        initialWhatsapp={clienteWhatsapp}
        onSaved={handleClienteCriadoInline}
      />
    </div>
  )
}
