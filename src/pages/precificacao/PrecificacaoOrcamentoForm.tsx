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
import {
  normalizarOrcamentoRecord,
  normalizarCanaisComparadosIds,
} from '@/lib/precificacao/orcamentoCalculo'
import { precificacaoService } from '@/services/precificacao'
import { separacaoKitsService } from '@/services/separacaoKits'
import { cadastrosService } from '@/services/cadastros'
import { clientesOrcamentoService } from '@/services/clientesOrcamento'
import { ClienteDialog } from '@/components/precificacao/ClienteDialog'
import { DecisaoAprovacaoItemPanel } from '@/components/precificacao/DecisaoAprovacaoItemPanel'
import { MontanteOrcamentoPanel } from '@/components/precificacao/MontanteOrcamentoPanel'
import { getFileUrl } from '@/lib/pocketbase/files'
import {
  OrcamentoRecord,
  CreateOrcamentoInput,
  OrcamentoPrecoCanalItem,
  OrcamentoFreteCanalItem,
  OrcamentoProdutoVinculadoCanal,
  OrcamentoFreteOpcao,
  ClienteOrcamentoRecord,
  StatusOrcamento,
  TipoItemOrcamento,
  ItemComposicaoOrcamento,
  TipoComposicaoItem,
} from '@/types/orcamento'
import { PrecCanalRecord } from '@/types/precificacao'
import { KitTema, KitModelo } from '@/types/separacaoKits'
import { Pessoa } from '@/types/domain'
import {
  calcularTotaisPorCanal,
  calcularMontanteConsolidadoPorCanal,
  calcularDescontoIndividualItem,
  converterCheioParaUnitario,
  converterUnitarioParaCheio,
  formatarMoedaBR,
  calcularSubtotalProdutosCanal,
  calcularTotalItemComFreteCanal,
} from '@/lib/precificacao/orcamentoCalculo'
import { congelarSnapshotReceita } from '@/services/insumos'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'
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
import {
  Upload,
  Image as ImageIcon,
  FileText,
  CheckCircle2,
  Package,
  ListTree,
  Truck,
} from 'lucide-react'

interface FormItemLinha {
  id?: string
  tipo_item: TipoItemOrcamento
  modelo?: string
  modelo_nome: string
  modelo_codigo?: string
  descricao?: string
  imagem_anexo?: string | File
  preview_imagem?: string
  foto_url?: string
  tema?: string
  tema_nome?: string
  cor?: string
  quantidade: number
  composicao: ItemComposicaoOrcamento[]
  precos_canais: Record<string, OrcamentoPrecoCanalItem>
  fretes_canais: Record<string, OrcamentoFreteCanalItem>
  produtos_canais: Record<string, OrcamentoProdutoVinculadoCanal>
  composicao_receita?: ItemComposicaoCusto[]
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
        modalidade_id?: string
        modalidade_nome?: string
        precificacao_record?: any
        status_precificacao?: string
        desatualizada?: boolean
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
  const [observacoes, setObservacoes] = useState<string>('')
  // Opções livres e ilimitadas de frete para o cliente escolher
  const [opcoesFrete, setOpcoesFrete] = useState<OrcamentoFreteOpcao[]>([])

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
              tipo_item: 'cadastrado',
              modelo_nome: 'Kit Toalhas',
              tema: undefined,
              tema_nome: '',
              cor: '',
              quantidade: 30,
              composicao: [
                {
                  id: 'comp_' + Math.random().toString(36).substring(2, 9),
                  tipo: 'cadastrado',
                  modelo_nome: 'Banho',
                  quantidade: 15,
                },
                {
                  id: 'comp_' + Math.random().toString(36).substring(2, 9),
                  tipo: 'cadastrado',
                  modelo_nome: 'Rosto',
                  quantidade: 15,
                },
              ],
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
          setCanaisSelecionadosIds(normalizarCanaisComparadosIds(orcNormalizado.canais_comparados))
          setObservacoes(orcNormalizado.observacoes || '')
          setOpcoesFrete(orcNormalizado.fretes || [])

          const itensOrc = Array.isArray(orcNormalizado.expand?.itens)
            ? orcNormalizado.expand.itens
            : []
          if (itensOrc.length > 0) {
            setItens(
              itensOrc.map((it) => {
                let compList: ItemComposicaoOrcamento[] = []
                if (Array.isArray(it.composicao) && it.composicao.length > 0) {
                  compList = it.composicao.map((c) => ({
                    ...c,
                    preview_imagem: c.imagem_anexo ? getFileUrl(it, c.imagem_anexo) : c.foto_url,
                  }))
                } else {
                  // Fallback para itens antigos sem composição: cria 1 entrada a partir do próprio item
                  compList = [
                    {
                      id: 'comp_' + Math.random().toString(36).substring(2, 9),
                      tipo: it.tipo_item === 'personalizado' ? 'personalizado' : 'cadastrado',
                      tema: it.tema,
                      tema_nome: it.tema_nome,
                      modelo: it.modelo,
                      modelo_nome: it.modelo_nome,
                      modelo_codigo: it.modelo_codigo,
                      descricao: it.descricao,
                      foto_url: it.foto_url,
                      imagem_anexo: it.imagem_anexo,
                      preview_imagem: it.imagem_anexo
                        ? getFileUrl(it, it.imagem_anexo)
                        : it.foto_url,
                      cor: it.cor,
                      quantidade: it.quantidade || 1,
                    },
                  ]
                }
                return {
                  id: it.id,
                  tipo_item:
                    it.tipo_item || (it.modelo || it.tema ? 'cadastrado' : 'personalizado'),
                  modelo: it.modelo,
                  modelo_nome: it.modelo_nome || '',
                  modelo_codigo: it.modelo_codigo,
                  descricao: it.descricao || '',
                  imagem_anexo: it.imagem_anexo,
                  preview_imagem: it.imagem_anexo ? getFileUrl(it, it.imagem_anexo) : undefined,
                  foto_url: it.foto_url,
                  tema: it.tema || orcNormalizado.tema || undefined,
                  tema_nome: it.tema_nome || orcNormalizado.tema_nome || '',
                  cor: it.cor || orcNormalizado.cor || '',
                  quantidade: it.quantidade || 1,
                  composicao: compList,
                  precos_canais: it.precos_canais || {},
                  fretes_canais: it.fretes_canais || {},
                  produtos_canais: it.produtos_canais || {},
                  composicao_receita: it.composicao_receita || [],
                }
              }),
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

  // Ao selecionar um tema DENTRO de um item cadastrado:
  // Carrega o modelo associado e a imagem do modelo automaticamente!
  const handleSelecionarTemaNoItem = (index: number, tId: string) => {
    const t = temasDisponiveis.find((x) => x.id === tId)
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      if (!it) return prev

      const novoTemaId = tId === 'none' ? undefined : tId
      const novoTemaNome = t?.nome || ''

      // Modelos que pertencem a este tema
      const modelosDesteTema = novoTemaId
        ? modelosDisponiveis.filter((m) => m.tema === novoTemaId)
        : []

      // Se houver modelo do tema ou se já tiver selecionado um modelo válido do tema
      let modeloEscolhido = modelosDesteTema.find((m) => m.id === it.modelo)
      if (!modeloEscolhido && modelosDesteTema.length > 0) {
        modeloEscolhido = modelosDesteTema[0]
      }

      copy[index] = {
        ...it,
        tema: novoTemaId,
        tema_nome: novoTemaNome,
        modelo: modeloEscolhido ? modeloEscolhido.id : it.modelo,
        modelo_nome: modeloEscolhido ? modeloEscolhido.nome : it.modelo_nome,
        modelo_codigo: modeloEscolhido ? modeloEscolhido.codigo : it.modelo_codigo,
      }
      return copy
    })
  }

  // Upload de imagem do item personalizado
  const handleUploadImagemPersonalizado = (index: number, file: File | null) => {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setItens((prev) => {
      const copy = [...prev]
      copy[index] = {
        ...copy[index],
        imagem_anexo: file,
        preview_imagem: previewUrl,
      }
      return copy
    })
  }

  // Alternar canal selecionado
  const handleToggleCanal = (canalId: string) => {
    setCanaisSelecionadosIds((prev) =>
      prev.includes(canalId) ? prev.filter((c) => c !== canalId) : [...prev, canalId],
    )
  }

  // Adicionar item (produto que o cliente compra)
  const handleAdicionarItem = (tipo: TipoItemOrcamento = 'cadastrado') => {
    setItens((prev) => [
      ...prev,
      {
        tipo_item: tipo,
        modelo_nome: tipo === 'cadastrado' ? 'Produto' : 'Item Personalizado',
        modelo: undefined,
        modelo_codigo: undefined,
        descricao: '',
        tema: undefined,
        tema_nome: '',
        cor: '',
        quantidade: 10,
        composicao: [
          {
            id: 'comp_' + Math.random().toString(36).substring(2, 9),
            tipo: 'cadastrado',
            modelo_nome: '',
            quantidade: 10,
          },
        ],
        precos_canais: {},
        fretes_canais: {},
        produtos_canais: {},
      },
    ])
  }

  // --- Handlers de Composição Interna do Item ---
  const handleAdicionarEntradaComposicao = (
    itemIndex: number,
    tipo: TipoComposicaoItem = 'cadastrado',
  ) => {
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[itemIndex]
      if (!it) return prev
      const compAtual = it.composicao || []
      const novaEntrada: ItemComposicaoOrcamento = {
        id: 'comp_' + Math.random().toString(36).substring(2, 9),
        tipo,
        modelo_nome: tipo === 'cadastrado' ? '' : 'Personalizado',
        descricao: '',
        quantidade: 1,
      }
      copy[itemIndex] = {
        ...it,
        composicao: [...compAtual, novaEntrada],
      }
      return copy
    })
  }

  const handleRemoverEntradaComposicao = (itemIndex: number, compIndex: number) => {
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[itemIndex]
      if (!it) return prev
      copy[itemIndex] = {
        ...it,
        composicao: (it.composicao || []).filter((_, idx) => idx !== compIndex),
      }
      return copy
    })
  }

  const handleAtualizarEntradaComposicao = (
    itemIndex: number,
    compIndex: number,
    campo: keyof ItemComposicaoOrcamento,
    valor: any,
  ) => {
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[itemIndex]
      if (!it) return prev
      const compAtual = [...(it.composicao || [])]
      if (!compAtual[compIndex]) return prev
      compAtual[compIndex] = {
        ...compAtual[compIndex],
        [campo]: valor,
      }
      copy[itemIndex] = {
        ...it,
        composicao: compAtual,
      }
      return copy
    })
  }

  const handleSelecionarTemaNaComposicao = (
    itemIndex: number,
    compIndex: number,
    temaId: string,
  ) => {
    const t = temasDisponiveis.find((x) => x.id === temaId)
    const temaValidoId = temaId === 'none' ? undefined : temaId
    const temaNome = t?.nome || ''

    // Busca modelos deste tema
    const modelosDesteTema = temaValidoId
      ? modelosDisponiveis.filter((m) => m.tema === temaValidoId)
      : []
    const modeloPadrao = modelosDesteTema.length > 0 ? modelosDesteTema[0] : undefined

    let fotoUrl: string | undefined = undefined
    if (modeloPadrao?.foto) {
      fotoUrl = getFileUrl(modeloPadrao, modeloPadrao.foto)
    }

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[itemIndex]
      if (!it) return prev
      const compAtual = [...(it.composicao || [])]
      const ent = compAtual[compIndex]
      if (!ent) return prev

      compAtual[compIndex] = {
        ...ent,
        tema: temaValidoId,
        tema_nome: temaNome,
        modelo: modeloPadrao?.id,
        modelo_nome: modeloPadrao?.nome || ent.modelo_nome,
        modelo_codigo: modeloPadrao?.codigo || ent.modelo_codigo,
        foto_url: fotoUrl,
        preview_imagem: fotoUrl,
      }

      copy[itemIndex] = {
        ...it,
        composicao: compAtual,
      }
      return copy
    })
  }

  const handleSelecionarModeloNaComposicao = (
    itemIndex: number,
    compIndex: number,
    modeloId: string,
  ) => {
    const mod = modelosDisponiveis.find((m) => m.id === modeloId)
    let fotoUrl: string | undefined = undefined
    if (mod?.foto) {
      fotoUrl = getFileUrl(mod, mod.foto)
    }

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[itemIndex]
      if (!it) return prev
      const compAtual = [...(it.composicao || [])]
      const ent = compAtual[compIndex]
      if (!ent) return prev

      compAtual[compIndex] = {
        ...ent,
        modelo: mod?.id,
        modelo_nome: mod?.nome || ent.modelo_nome,
        modelo_codigo: mod?.codigo,
        foto_url: fotoUrl || ent.foto_url,
        preview_imagem: fotoUrl || ent.preview_imagem,
      }

      copy[itemIndex] = {
        ...it,
        composicao: compAtual,
      }
      return copy
    })
  }

  const handleUploadImagemComposicao = (
    itemIndex: number,
    compIndex: number,
    file: File | null,
  ) => {
    if (!file) return
    const previewUrl = URL.createObjectURL(file)
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[itemIndex]
      if (!it) return prev
      const compAtual = [...(it.composicao || [])]
      const ent = compAtual[compIndex]
      if (!ent) return prev

      compAtual[compIndex] = {
        ...ent,
        imagem_anexo: file as any,
        preview_imagem: previewUrl,
      }

      copy[itemIndex] = {
        ...it,
        composicao: compAtual,
      }
      return copy
    })
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

  // Ao selecionar um Produto Vinculado aprovado (por ID de precificação) para um canal específico no item
  const handleSelecionarProdutoVinculadoNoCanal = async (
    index: number,
    canalId: string,
    precificacaoOuProdutoId: string,
  ) => {
    const canalObj = canaisDisponiveis.find((c) => c.id === canalId)
    if (!canalObj) return

    const prodsCanal = produtosAprovadosPorCanal[canalId] || []
    // Suporta seleção por precificacao_id (preferencial) com fallback para produto_id retroativo
    const prodAprovado = prodsCanal.find(
      (p) =>
        p.precificacao_id === precificacaoOuProdutoId || p.produto_id === precificacaoOuProdutoId,
    )

    // Se houver um produto vinculado selecionado, carrega o produto técnico e congela sua receita técnica
    let receitaCongelada: ItemComposicaoCusto[] | undefined = undefined
    if (prodAprovado && precificacaoOuProdutoId && precificacaoOuProdutoId !== 'none') {
      try {
        const prodCompleto = await precificacaoService.getProduto(prodAprovado.produto_id)
        if (prodCompleto?.composicao && prodCompleto.composicao.length > 0) {
          receitaCongelada = congelarSnapshotReceita(prodCompleto.composicao)
        }
      } catch (err) {
        console.warn(
          'Não foi possível carregar a composição técnica do produto para congelar snapshot:',
          err,
        )
      }
    }

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      if (!it) return prev

      const precos = { ...it.precos_canais }
      const produtosCanais = { ...it.produtos_canais }
      const qtd = Number(it.quantidade) || 1

      if (!prodAprovado || precificacaoOuProdutoId === 'none') {
        // Remove vínculo desse canal mantendo o desconto atual recalculado sobre o preço manual
        delete produtosCanais[canalId]
        if (precos[canalId]) {
          const unit = precos[canalId]?.preco_unitario || 0
          const cheio = precos[canalId]?.preco_cheio || Math.round(unit * qtd * 100) / 100
          const descPct = precos[canalId]?.desconto_pct || 0
          const descCalc = calcularDescontoIndividualItem({
            subtotalOuPrecoCheio: cheio,
            descontoPct: descPct,
            quantidade: qtd,
          })

          precos[canalId] = {
            ...precos[canalId],
            produto_vinculado_id: undefined,
            produto_vinculado_nome: undefined,
            produto_vinculado_sku: undefined,
            precificacao_id: undefined,
            tem_precificacao_oficial: false,
            desconto_pct: descCalc.descontoPct,
            valor_desconto: descCalc.valorDescontoTotal,
            preco_final: descCalc.precoFinalTotal,
            alerta_margem: descCalc.alertaMargem,
            preco_aprovado_base: undefined,
          }
        }
      } else {
        // Vincula produto aprovado do canal e puxa preço unitário aprovado daquela modalidade/cenário
        const precoAprovado = prodAprovado.preco_aprovado
        const precoCheio = Math.round(precoAprovado * qtd * 100) / 100
        const descPct = precos[canalId]?.desconto_pct || 0
        const descCalc = calcularDescontoIndividualItem({
          subtotalOuPrecoCheio: precoCheio,
          descontoPct: descPct,
          quantidade: qtd,
          precoAprovadoReferencia: precoAprovado,
        })

        produtosCanais[canalId] = {
          canal_id: canalId,
          canal_nome: canalObj.nome,
          produto_id: prodAprovado.produto_id,
          produto_nome: prodAprovado.produto_nome,
          produto_sku: prodAprovado.produto_sku,
          preco_aprovado: precoAprovado,
          precificacao_id: prodAprovado.precificacao_id,
          modalidade_id: prodAprovado.modalidade_id,
          modalidade_nome: prodAprovado.modalidade_nome,
          status_precificacao: prodAprovado.status_precificacao,
          desatualizada: prodAprovado.desatualizada,
        }

        precos[canalId] = {
          canal_id: canalId,
          canal_nome: canalObj.nome,
          preco_unitario: precoAprovado,
          preco_cheio: precoCheio,
          preco_sugerido_oficial: precoAprovado,
          tem_precificacao_oficial: true,
          desconto_aplicado: descPct > 0,
          desconto_pct: descCalc.descontoPct,
          valor_desconto: descCalc.valorDescontoTotal,
          preco_final: descCalc.precoFinalTotal,
          alerta_margem: descCalc.alertaMargem,
          preco_aprovado_base: precoAprovado,
          produto_vinculado_id: prodAprovado.produto_id,
          produto_vinculado_nome: prodAprovado.produto_nome,
          produto_vinculado_sku: prodAprovado.produto_sku,
          precificacao_id: prodAprovado.precificacao_id,
        }
      }

      // Se o item ainda não tem um modelo_nome definido ou tem o placeholder padrão, atualiza com o nome do produto
      const novoModeloNome =
        (!it.modelo_nome || it.modelo_nome === 'Produto' || it.modelo_nome === 'Item') &&
        prodAprovado
          ? prodAprovado.produto_nome
          : it.modelo_nome

      copy[index] = {
        ...it,
        modelo_nome: novoModeloNome,
        precos_canais: precos,
        produtos_canais: produtosCanais,
        // Se conseguimos congelar a receita técnica do produto selecionado, persistimos no item
        composicao_receita:
          receitaCongelada !== undefined ? receitaCongelada : it.composicao_receita,
      }
      return copy
    })
  }

  // Atualiza Desconto individual em % por canal do item
  const handleAlterarDescontoCanal = (index: number, canalId: string, descontoPct: number) => {
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      if (!it) return prev
      const precos = { ...it.precos_canais }
      const precoExistente = precos[canalId]
      if (!precoExistente) return prev

      const qtd = Number(it.quantidade) || 1
      const precoCheioBase =
        precoExistente.preco_cheio !== undefined && Number(precoExistente.preco_cheio) > 0
          ? Number(precoExistente.preco_cheio)
          : Math.round((precoExistente.preco_unitario || 0) * qtd * 100) / 100
      const refAprovado =
        precoExistente.preco_aprovado_base ||
        it.produtos_canais?.[canalId]?.preco_aprovado ||
        precoExistente.preco_sugerido_oficial

      const descCalc = calcularDescontoIndividualItem({
        subtotalOuPrecoCheio: precoCheioBase,
        descontoPct,
        quantidade: qtd,
        precoAprovadoReferencia: refAprovado,
      })

      precos[canalId] = {
        ...precoExistente,
        desconto_pct: descCalc.descontoPct,
        valor_desconto: descCalc.valorDescontoTotal,
        preco_final: descCalc.precoFinalTotal,
        alerta_margem: descCalc.alertaMargem,
        desconto_aplicado: descCalc.descontoPct > 0,
      }

      copy[index] = { ...it, precos_canais: precos }
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
      const descPct = precos[canalId]?.desconto_pct || 0
      const refAprovado =
        precos[canalId]?.preco_aprovado_base ||
        it.produtos_canais?.[canalId]?.preco_aprovado ||
        oficial

      const descCalc = calcularDescontoIndividualItem({
        subtotalOuPrecoCheio: precoCheioCalculado,
        descontoPct: descPct,
        quantidade: qtd,
        precoAprovadoReferencia: refAprovado,
      })

      precos[canalId] = {
        canal_id: canalId,
        canal_nome: canalObj.nome,
        preco_unitario: valorUnitario,
        preco_cheio: precoCheioCalculado,
        preco_sugerido_oficial: oficial,
        tem_precificacao_oficial: precos[canalId]?.tem_precificacao_oficial ?? false,
        desconto_aplicado: descCalc.descontoPct > 0,
        desconto_pct: descCalc.descontoPct,
        valor_desconto: descCalc.valorDescontoTotal,
        preco_final: descCalc.precoFinalTotal,
        alerta_margem: descCalc.alertaMargem,
        preco_aprovado_base: precos[canalId]?.preco_aprovado_base,
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
      const descPct = precos[canalId]?.desconto_pct || 0
      const refAprovado =
        precos[canalId]?.preco_aprovado_base ||
        it.produtos_canais?.[canalId]?.preco_aprovado ||
        oficial

      const descCalc = calcularDescontoIndividualItem({
        subtotalOuPrecoCheio: valorCheio,
        descontoPct: descPct,
        quantidade: qtd,
        precoAprovadoReferencia: refAprovado,
      })

      precos[canalId] = {
        canal_id: canalId,
        canal_nome: canalObj.nome,
        preco_unitario: precoUnitarioCalculado,
        preco_cheio: valorCheio,
        preco_sugerido_oficial: oficial,
        tem_precificacao_oficial: precos[canalId]?.tem_precificacao_oficial ?? false,
        desconto_aplicado: descCalc.descontoPct > 0,
        desconto_pct: descCalc.descontoPct,
        valor_desconto: descCalc.valorDescontoTotal,
        preco_final: descCalc.precoFinalTotal,
        alerta_margem: descCalc.alertaMargem,
        preco_aprovado_base: precos[canalId]?.preco_aprovado_base,
        produto_vinculado_id: precos[canalId]?.produto_vinculado_id,
        produto_vinculado_nome: precos[canalId]?.produto_vinculado_nome,
        produto_vinculado_sku: precos[canalId]?.produto_vinculado_sku,
        precificacao_id: precos[canalId]?.precificacao_id,
      }

      copy[index] = { ...it, precos_canais: precos }
      return copy
    })
  }

  // Quando altera quantidade de um item, recalcula precos cheios e descontos com base nos unitários existentes
  const handleAlterarQuantidadeItem = (index: number, novaQtd: number) => {
    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      if (!it) return prev
      const precos = { ...it.precos_canais }
      for (const cId of Object.keys(precos)) {
        const u = precos[cId]?.preco_unitario || 0
        const novoCheio = Math.round(u * novaQtd * 100) / 100
        const descPct = precos[cId]?.desconto_pct || 0
        const refAprovado =
          precos[cId]?.preco_aprovado_base ||
          it.produtos_canais?.[cId]?.preco_aprovado ||
          precos[cId]?.preco_sugerido_oficial

        const descCalc = calcularDescontoIndividualItem({
          subtotalOuPrecoCheio: novoCheio,
          descontoPct: descPct,
          quantidade: novaQtd,
          precoAprovadoReferencia: refAprovado,
        })

        precos[cId] = {
          ...precos[cId],
          preco_cheio: novoCheio,
          desconto_pct: descCalc.descontoPct,
          valor_desconto: descCalc.valorDescontoTotal,
          preco_final: descCalc.precoFinalTotal,
          alerta_margem: descCalc.alertaMargem,
          desconto_aplicado: descCalc.descontoPct > 0,
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
      const freteExistente = fretes[canalId]

      fretes[canalId] = {
        canal_id: canalId,
        canal_nome: canalObj.nome,
        valor_frete: valor,
        modo_frete: freteExistente?.modo_frete || 'pago_pelo_cliente',
      }

      copy[index] = { ...it, fretes_canais: fretes }
      return copy
    })
  }

  // Alterna o modo de frete por item/canal: 'pago_pelo_cliente' | 'frete_gratis'
  const handleAlterarModoFreteCanal = (
    index: number,
    canalId: string,
    modo: 'pago_pelo_cliente' | 'frete_gratis',
  ) => {
    const canalObj = canaisDisponiveis.find((c) => c.id === canalId)
    if (!canalObj) return

    setItens((prev) => {
      const copy = [...prev]
      const it = copy[index]
      const fretes = { ...it.fretes_canais }
      const freteExistente = fretes[canalId]

      fretes[canalId] = {
        canal_id: canalId,
        canal_nome: canalObj.nome,
        valor_frete: freteExistente?.valor_frete || 0,
        modo_frete: modo,
      }

      copy[index] = { ...it, fretes_canais: fretes }
      return copy
    })
  }

  // Canais ativos selecionados para exibição
  const canaisSelecionados = useMemo(() => {
    return canaisDisponiveis.filter((c) => canaisSelecionadosIds.includes(c.id))
  }, [canaisDisponiveis, canaisSelecionadosIds])

  // Mapa de registros de precificação aprovada indexados por ID
  const mapaPrecificacoesAprovadas = useMemo(() => {
    const mapa: Record<string, any> = {}
    for (const canalId of Object.keys(produtosAprovadosPorCanal)) {
      const lista = produtosAprovadosPorCanal[canalId] || []
      for (const item of lista) {
        if (item.precificacao_id) {
          mapa[item.precificacao_id] = item.precificacao_record || {
            preco_aprovado: item.preco_aprovado,
            resultado: {
              preco_anunciado: item.preco_aprovado,
            },
          }
        }
      }
    }
    return mapa
  }, [produtosAprovadosPorCanal])

  // Totais calculados em tempo real
  const totaisCalculados = useMemo(() => {
    return calcularTotaisPorCanal(
      canaisSelecionados.map((c) => ({ id: c.id, nome: c.nome })),
      itens,
    )
  }, [canaisSelecionados, itens])

  // Montante consolidado por canal em tempo real
  const montantesPorCanal = useMemo(() => {
    return calcularMontanteConsolidadoPorCanal({
      canais: canaisSelecionados.map((c) => ({ id: c.id, nome: c.nome, tipo: c.tipo })),
      itens,
      mapaPrecificacoesAprovadas,
    })
  }, [canaisSelecionados, itens, mapaPrecificacoesAprovadas])

  const totalUnidadesGeral = useMemo(() => {
    return itens.reduce((acc, it) => acc + (Number(it.quantidade) || 0), 0)
  }, [itens])

  // Handlers para opções ilimitadas de frete
  const handleAdicionarOpcaoFrete = () => {
    setOpcoesFrete((prev) => [
      ...prev,
      {
        id: 'frete_' + Math.random().toString(36).substring(2, 9),
        transportadora: '',
        prazo: '',
        valor: 0,
      },
    ])
  }

  const handleRemoverOpcaoFrete = (index: number) => {
    setOpcoesFrete((prev) => prev.filter((_, i) => i !== index))
  }

  const handleAtualizarOpcaoFrete = (
    index: number,
    campo: keyof OrcamentoFreteOpcao,
    valor: any,
  ) => {
    setOpcoesFrete((prev) => {
      const copy = [...prev]
      copy[index] = { ...copy[index], [campo]: valor }
      return copy
    })
  }

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
        const primeiroTema = itens.find((i) => i.tema_nome)?.tema_nome
        const primeiraCor = itens.find((i) => i.cor)?.cor
        if (primeiroTema) tituloFinal += ` Tema ${primeiroTema.toUpperCase()}`
        if (primeiraCor) tituloFinal += ` cor ${primeiraCor.toUpperCase()}`
      }

      // Herança para o cabeçalho (compatibilidade retroativa com visualizadores legados)
      const temaCabecalho = itens.find((i) => i.tema)?.tema
      const temaNomeCabecalho = itens.find((i) => i.tema_nome)?.tema_nome
      const corCabecalho = itens.find((i) => i.cor)?.cor

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
        tema: temaCabecalho || undefined,
        tema_nome: temaNomeCabecalho || undefined,
        cor: corCabecalho || undefined,
        observacoes: observacoes || undefined,
        fretes: opcoesFrete.map((f, fIdx) => ({
          id: f.id || `frete_${fIdx}`,
          transportadora: f.transportadora || '',
          prazo: f.prazo || '',
          valor: Math.max(0, Number(f.valor) || 0),
          observacoes: f.observacoes || undefined,
        })),
        itens: itens.map((it, idx) => ({
          id: it.id,
          tipo_item: it.tipo_item,
          modelo: it.modelo,
          modelo_nome: it.modelo_nome || 'Produto sem nome',
          modelo_codigo: it.modelo_codigo,
          descricao: it.descricao || undefined,
          imagem_anexo: it.imagem_anexo,
          foto_url: it.foto_url,
          tema: it.tema || undefined,
          tema_nome: it.tema_nome || undefined,
          cor: it.cor || undefined,
          quantidade: Number(it.quantidade) || 1,
          composicao: it.composicao || [],
          precos_canais: it.precos_canais,
          fretes_canais: it.fretes_canais,
          produtos_canais: it.produtos_canais,
          composicao_receita: it.composicao_receita,
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

      {/* BLOCO: MONTANTE CONSOLIDADO DO ORÇAMENTO (TEMPO REAL) */}
      <MontanteOrcamentoPanel
        montantesPorCanal={montantesPorCanal}
        totalItensQtd={totalUnidadesGeral}
        qtdModelos={itens.length}
      />

      {/* BLOCO 3: ITENS & QUANTIDADES (O ITEM É O PRODUTO QUE O CLIENTE COMPRA; COM COMPOSIÇÃO INTERNA PARA EXPEDIÇÃO) */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Package className="w-4 h-4 text-primary" />
              <CardTitle className="text-base font-bold">
                3. Itens & Quantidades (Produtos Vendidos)
              </CardTitle>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Cada item é o <strong>Produto que o cliente compra</strong> (com preço por canal e
              quantidade total). Dentro dele, monte a <strong>Composição Interna</strong> para
              expedição (temas cadastrados ou personalizados sem preço).
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              type="button"
              onClick={() => handleAdicionarItem('cadastrado')}
              variant="outline"
              className="text-xs font-bold border-primary/40 text-primary bg-primary/5 hover:bg-primary/10"
            >
              <Plus className="w-3.5 h-3.5 mr-1" />+ Novo Item (Produto)
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-4 space-y-6">
          {itens.map((item, index) => {
            const composicao = item.composicao || []
            const somaComposicao = composicao.reduce(
              (acc, c) => acc + (Number(c.quantidade) || 0),
              0,
            )
            const quantidadeItem = Number(item.quantidade) || 0
            const composicaoFecha = composicao.length === 0 || somaComposicao === quantidadeItem

            return (
              <div
                key={index}
                className="p-4 rounded-xl border-2 border-border/90 bg-card/60 shadow-xs space-y-4"
              >
                {/* Linha 1 do item: Produto que o cliente compra + Quantidade + Botão Remover */}
                <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 border-b border-border/60 pb-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <span className="h-7 w-7 rounded-full font-bold text-xs flex items-center justify-center shrink-0 bg-primary/15 text-primary">
                      {index + 1}
                    </span>

                    <div className="flex-1 space-y-3 min-w-0">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border-primary/30"
                        >
                          Item {index + 1} • Produto Comercial
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          Item com precificação para o cliente
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="sm:col-span-2">
                          <Label className="text-[10px] font-semibold text-muted-foreground">
                            Nome do Produto Comercial *
                          </Label>
                          <Input
                            placeholder="Ex: Kit 30 Toalhas Bordadas"
                            value={item.modelo_nome}
                            onChange={(e) =>
                              handleAtualizarItem(index, 'modelo_nome', e.target.value)
                            }
                            className="h-8 text-xs font-semibold"
                          />
                        </div>

                        <div>
                          <Label className="text-[10px] font-semibold text-muted-foreground">
                            Quantidade do Item *
                          </Label>
                          <Input
                            type="number"
                            min="1"
                            value={item.quantidade}
                            onChange={(e) =>
                              handleAlterarQuantidadeItem(
                                index,
                                Math.max(1, Number(e.target.value) || 1),
                              )
                            }
                            className="h-8 text-xs font-bold text-center"
                          />
                        </div>

                        <div>
                          <Label className="text-[10px] font-semibold text-muted-foreground">
                            Observação / Detalhe (opcional)
                          </Label>
                          <Input
                            placeholder="Ex: Embalagem individual"
                            value={item.descricao || ''}
                            onChange={(e) =>
                              handleAtualizarItem(index, 'descricao', e.target.value)
                            }
                            className="h-8 text-xs font-medium"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Botão de Remover Item */}
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleRemoverItem(index)}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0 self-start"
                    title="Remover Item"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>

                {/* Linha 2 do item: SUB-LISTA DE COMPOSIÇÃO INTERNA (PARA EXPEDIÇÃO, SEM PREÇO) */}
                <div className="p-3.5 rounded-lg border border-dashed border-border/90 bg-muted/20 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <ListTree className="w-4 h-4 text-muted-foreground" />
                      <span className="text-xs font-bold text-foreground">
                        Composição Interna deste Item (Expedição / Temas)
                      </span>
                      <Badge variant="secondary" className="text-[10px] font-mono">
                        Soma: {somaComposicao} / {quantidadeItem} un
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => handleAdicionarEntradaComposicao(index, 'cadastrado')}
                        variant="outline"
                        className="h-7 text-[11px] font-bold border-emerald-300 text-emerald-800 bg-emerald-50/70 hover:bg-emerald-100"
                      >
                        <Plus className="w-3 h-3 mr-1" />+ Tema Cadastrado
                      </Button>
                      <Button
                        size="sm"
                        type="button"
                        onClick={() => handleAdicionarEntradaComposicao(index, 'personalizado')}
                        variant="outline"
                        className="h-7 text-[11px] font-bold border-violet-300 text-violet-800 bg-violet-50/70 hover:bg-violet-100"
                      >
                        <Sparkles className="w-3 h-3 mr-1" />+ Personalizado
                      </Button>
                    </div>
                  </div>

                  {/* Alerta Visível se a soma da composição não fechar com a quantidade do item */}
                  {!composicaoFecha && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs font-semibold">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>
                        Aviso: A soma das quantidades da composição ({somaComposicao}) não fecha com
                        a quantidade do item ({quantidadeItem}). O orçamento pode ser salvo
                        normalmente, mas confira a distribuição para a expedição.
                      </span>
                    </div>
                  )}

                  {/* Lista de entradas da composição */}
                  <div className="space-y-2.5">
                    {composicao.map((comp, compIdx) => {
                      const isCompPersonalizado = comp.tipo === 'personalizado'
                      const modelosDoTema = comp.tema
                        ? modelosDisponiveis.filter((m) => m.tema === comp.tema)
                        : modelosDisponiveis
                      const imagemPreview = comp.preview_imagem || comp.foto_url

                      return (
                        <div
                          key={comp.id || compIdx}
                          className={`p-2.5 rounded-lg border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                            isCompPersonalizado
                              ? 'border-violet-200 bg-violet-50/20'
                              : 'border-emerald-200 bg-emerald-50/20'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            {/* Miniatura da Imagem */}
                            <div className="h-12 w-12 rounded-md border border-border/80 bg-background flex items-center justify-center overflow-hidden shrink-0 relative">
                              {imagemPreview ? (
                                <img
                                  src={imagemPreview}
                                  alt={comp.modelo_nome || comp.tema_nome || 'Composição'}
                                  className="h-full w-full object-cover"
                                />
                              ) : (
                                <ImageIcon className="w-4 h-4 text-muted-foreground/40" />
                              )}
                            </div>

                            {/* Campos da Entrada */}
                            <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 items-center">
                              {isCompPersonalizado ? (
                                <>
                                  <div className="sm:col-span-2">
                                    <Label className="text-[9px] font-semibold text-muted-foreground">
                                      Descrição / Nome do Personalizado
                                    </Label>
                                    <Input
                                      placeholder="Ex: Brasão Família Silva (Linha Dourada)"
                                      value={comp.modelo_nome || ''}
                                      onChange={(e) =>
                                        handleAtualizarEntradaComposicao(
                                          index,
                                          compIdx,
                                          'modelo_nome',
                                          e.target.value,
                                        )
                                      }
                                      className="h-7 text-xs font-semibold"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-[9px] font-semibold text-muted-foreground">
                                      Upload de Imagem
                                    </Label>
                                    <label className="cursor-pointer text-[10px] font-bold text-violet-700 hover:text-violet-900 flex items-center justify-center gap-1 bg-violet-100/70 hover:bg-violet-200 px-2 py-1 rounded transition-colors border border-violet-300">
                                      <Upload className="w-3 h-3" />
                                      <span>{comp.imagem_anexo ? 'Trocar' : 'Anexar'}</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={(e) => {
                                          const file = e.target.files?.[0] || null
                                          handleUploadImagemComposicao(index, compIdx, file)
                                        }}
                                      />
                                    </label>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <div>
                                    <Label className="text-[9px] font-semibold text-muted-foreground">
                                      Tema da Expedição *
                                    </Label>
                                    <Select
                                      value={comp.tema || 'none'}
                                      onValueChange={(val) =>
                                        handleSelecionarTemaNaComposicao(index, compIdx, val)
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder="Selecione o tema..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">-- Escolher Tema --</SelectItem>
                                        {temasDisponiveis.map((t) => (
                                          <SelectItem key={t.id} value={t.id}>
                                            {t.nome}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <Label className="text-[9px] font-semibold text-muted-foreground">
                                      Modelo do Tema
                                    </Label>
                                    <Select
                                      value={comp.modelo || 'none'}
                                      onValueChange={(val) =>
                                        handleSelecionarModeloNaComposicao(index, compIdx, val)
                                      }
                                    >
                                      <SelectTrigger className="h-7 text-xs">
                                        <SelectValue placeholder="Modelo..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="none">-- Modelo Livre --</SelectItem>
                                        {modelosDoTema.map((m) => (
                                          <SelectItem key={m.id} value={m.id}>
                                            {m.codigo ? `${m.codigo} - ` : ''}
                                            {m.nome}
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>

                                  <div>
                                    <Label className="text-[9px] font-semibold text-muted-foreground">
                                      Nome / Variação
                                    </Label>
                                    <Input
                                      placeholder="Ex: Banho, Rosto..."
                                      value={comp.modelo_nome || ''}
                                      onChange={(e) =>
                                        handleAtualizarEntradaComposicao(
                                          index,
                                          compIdx,
                                          'modelo_nome',
                                          e.target.value,
                                        )
                                      }
                                      className="h-7 text-xs font-semibold"
                                    />
                                  </div>
                                </>
                              )}

                              <div>
                                <Label className="text-[9px] font-semibold text-muted-foreground">
                                  Qtd na Expedição
                                </Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={comp.quantidade}
                                  onChange={(e) =>
                                    handleAtualizarEntradaComposicao(
                                      index,
                                      compIdx,
                                      'quantidade',
                                      Math.max(1, Number(e.target.value) || 1),
                                    )
                                  }
                                  className="h-7 text-xs font-bold text-center"
                                />
                              </div>
                            </div>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => handleRemoverEntradaComposicao(index, compIdx)}
                            className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0 self-end md:self-center"
                            title="Remover Entrada da Composição"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      )
                    })}

                    {composicao.length === 0 && (
                      <p className="text-[11px] text-muted-foreground italic text-center py-2">
                        Nenhuma composição cadastrada. Adicione os temas ou modelos que compõem este
                        kit para a expedição.
                      </p>
                    )}
                  </div>
                </div>

                {/* Linha 3 do item: Canais de Venda e Preços (PREÇO VEM DO PRODUTO VINCULADO E NÃO DO TEMA) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
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
                    const valorSelecionadoPrec =
                      produtoVinculadoObj?.precificacao_id ||
                      precoObj?.precificacao_id ||
                      (produtoVinculadoObj?.produto_id &&
                      prodsAprovadosDesteCanal.some(
                        (p) => p.precificacao_id === produtoVinculadoObj.produto_id,
                      )
                        ? produtoVinculadoObj.produto_id
                        : prodsAprovadosDesteCanal.find(
                            (p) => p.produto_id === produtoVinculadoObj?.produto_id,
                          )?.precificacao_id) ||
                      'none'

                    const descPctAtual = Number(precoObj?.desconto_pct) || 0
                    const valorDescontoAtual = Number(precoObj?.valor_desconto) || 0
                    const precoFinalAtual =
                      precoObj?.preco_final !== undefined
                        ? Number(precoObj.preco_final)
                        : Math.max(0, Math.round((precoCheio - valorDescontoAtual) * 100) / 100)
                    const precoFinalUnitario =
                      item.quantidade > 0
                        ? Math.round((precoFinalAtual / item.quantidade) * 100) / 100
                        : 0
                    const temAlertaMargem = Boolean(precoObj?.alerta_margem)

                    return (
                      <div
                        key={canal.id}
                        className="p-3 rounded-lg border border-border/80 bg-background/90 shadow-xs space-y-2.5 text-xs flex flex-col justify-between"
                      >
                        <div className="flex items-center justify-between font-bold text-foreground">
                          <span className="text-xs font-black">{canal.nome}</span>
                          <div className="text-right">
                            <span className="text-primary font-black font-mono">
                              Total: {formatarMoedaBR(precoFinalAtual)}
                            </span>
                            {descPctAtual > 0 && (
                              <div className="text-[10px] text-muted-foreground line-through font-mono">
                                Cheio: {formatarMoedaBR(precoCheio)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Produto Vinculado do Repositório /precificacao/aprovados para este canal */}
                        <div className="space-y-1 bg-muted/20 p-2 rounded-md border border-border/60">
                          <Label className="text-[10px] font-bold text-muted-foreground flex items-center justify-between">
                            <span>Produto Vinculado ({canal.nome})</span>
                            {produtoVinculadoObj?.preco_aprovado && (
                              <span className="text-emerald-700 font-mono">
                                {produtoVinculadoObj.desatualizada ||
                                produtoVinculadoObj.status_precificacao === 'desatualizada'
                                  ? 'Base: '
                                  : 'Aprovado: '}
                                {formatarMoedaBR(produtoVinculadoObj.preco_aprovado)}
                              </span>
                            )}
                          </Label>
                          <Select
                            value={valorSelecionadoPrec}
                            onValueChange={(val) =>
                              handleSelecionarProdutoVinculadoNoCanal(index, canal.id, val)
                            }
                          >
                            <SelectTrigger className="h-7 text-[11px]">
                              <SelectValue placeholder="Vincular produto aprovado..." />
                            </SelectTrigger>
                            <SelectContent className="max-h-72">
                              <SelectItem value="none">-- Preço Livre (Sem Vínculo) --</SelectItem>
                              {prodsAprovadosDesteCanal.map((p) => {
                                const isDesat =
                                  p.desatualizada || p.status_precificacao === 'desatualizada'
                                return (
                                  <SelectItem key={p.precificacao_id} value={p.precificacao_id}>
                                    <span className="inline-flex items-center gap-1.5 flex-wrap">
                                      <span className="font-semibold">{p.produto_nome}</span>
                                      {p.produto_sku && (
                                        <span className="text-[10px] text-muted-foreground">
                                          ({p.produto_sku})
                                        </span>
                                      )}
                                      <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-sky-100 text-sky-800 border border-sky-300">
                                        {p.modalidade_nome || 'Padrão'}
                                      </span>
                                      <span className="font-mono text-emerald-700 font-bold">
                                        {formatarMoedaBR(p.preco_aprovado)}
                                      </span>
                                      {isDesat && (
                                        <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                          desatualizada
                                        </span>
                                      )}
                                    </span>
                                  </SelectItem>
                                )
                              })}
                            </SelectContent>
                          </Select>

                          {/* Badge da Modalidade selecionada */}
                          {produtoVinculadoObj?.modalidade_nome && (
                            <div className="flex items-center gap-1.5 pt-0.5">
                              <span className="text-[10px] text-muted-foreground">Modalidade:</span>
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-sky-50 text-sky-900 border-sky-300 font-bold px-1.5 py-0"
                              >
                                {produtoVinculadoObj.modalidade_nome}
                              </Badge>
                            </div>
                          )}

                          {/* Aviso visível quando o produto selecionado está com precificação desatualizada */}
                          {(produtoVinculadoObj?.desatualizada ||
                            produtoVinculadoObj?.status_precificacao === 'desatualizada') && (
                            <div className="mt-1 flex items-start gap-1 p-1.5 rounded bg-amber-50 border border-amber-300 text-[10px] text-amber-900 leading-tight">
                              <span className="font-bold shrink-0">⚠️</span>
                              <span>
                                Precificação desatualizada — confira em{' '}
                                <Link
                                  to="/precificacao"
                                  target="_blank"
                                  rel="noreferrer"
                                  className="underline font-bold text-amber-950 hover:text-amber-800"
                                >
                                  /precificacao
                                </Link>
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Conversão em Tempo Real: Preço Unitário <-> Preço Cheio */}
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-[10px] text-muted-foreground block font-medium">
                              Preço Unit. Base (R$)
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
                              Preço Cheio Base (R$)
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
                              className="h-7 text-xs font-semibold text-slate-800 font-mono"
                            />
                          </div>
                        </div>

                        {/* Campo individual: Desconto (%) por canal */}
                        <div className="p-2 rounded-md bg-amber-50/50 border border-amber-200/80 space-y-1.5">
                          <div className="flex items-center justify-between">
                            <Label className="text-[10px] font-bold text-amber-950">
                              Desconto no Canal (%)
                            </Label>
                            {descPctAtual > 0 && (
                              <span className="text-[10px] font-mono font-bold text-amber-800">
                                -{formatarMoedaBR(valorDescontoAtual)}
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 items-center">
                            <div className="relative">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.5"
                                placeholder="0"
                                value={descPctAtual || ''}
                                onChange={(e) =>
                                  handleAlterarDescontoCanal(
                                    index,
                                    canal.id,
                                    Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)),
                                  )
                                }
                                className="h-7 text-xs font-bold text-amber-950 pr-6 border-amber-300"
                              />
                              <span className="absolute right-2 top-1.5 text-xs font-bold text-amber-700 pointer-events-none">
                                %
                              </span>
                            </div>
                            <div className="text-right">
                              <div className="text-[9px] text-muted-foreground uppercase font-bold">
                                Preço Final
                              </div>
                              <div className="text-xs font-black text-emerald-800 font-mono">
                                {formatarMoedaBR(precoFinalAtual)}
                              </div>
                              <div className="text-[10px] text-muted-foreground font-mono">
                                ({formatarMoedaBR(precoFinalUnitario)}/un)
                              </div>
                            </div>
                          </div>

                          {/* Alerta visual amarelo (sem bloqueio) se unitário ficar abaixo do aprovado */}
                          {temAlertaMargem && (
                            <div className="flex items-start gap-1 p-1 rounded bg-amber-100/90 border border-amber-400 text-[10px] text-amber-950 font-medium leading-tight">
                              <span className="shrink-0">⚠️</span>
                              <span>
                                Preço final unitário ({formatarMoedaBR(precoFinalUnitario)}) abaixo
                                do preço aprovado original (
                                {formatarMoedaBR(
                                  precoObj?.preco_aprovado_base ||
                                    produtoVinculadoObj?.preco_aprovado ||
                                    precoObj?.preco_sugerido_oficial ||
                                    0,
                                )}
                                ).
                              </span>
                            </div>
                          )}
                        </div>

                        <div>
                          {/* Modos de frete: 'Frete pago pelo Cliente' e 'Frete Grátis' */}
                          <div className="flex items-center justify-between mb-1">
                            <Label className="text-[10px] text-muted-foreground block font-medium">
                              Frete do Item (R$)
                            </Label>
                            <span className="text-[9px] text-muted-foreground font-mono">
                              {freteObj?.modo_frete === 'frete_gratis'
                                ? 'Loja paga'
                                : 'Cliente paga'}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-1 mb-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleAlterarModoFreteCanal(index, canal.id, 'pago_pelo_cliente')
                              }
                              className={`text-[10px] px-2 py-1 rounded font-semibold border transition-all text-center leading-tight ${
                                (freteObj?.modo_frete || 'pago_pelo_cliente') ===
                                'pago_pelo_cliente'
                                  ? 'bg-amber-100 border-amber-400 text-amber-950 shadow-xs'
                                  : 'bg-muted/30 border-border/70 text-muted-foreground hover:bg-muted/60'
                              }`}
                            >
                              Frete pago pelo Cliente
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleAlterarModoFreteCanal(index, canal.id, 'frete_gratis')
                              }
                              className={`text-[10px] px-2 py-1 rounded font-semibold border transition-all text-center leading-tight ${
                                freteObj?.modo_frete === 'frete_gratis'
                                  ? 'bg-emerald-100 border-emerald-400 text-emerald-950 shadow-xs'
                                  : 'bg-muted/30 border-border/70 text-muted-foreground hover:bg-muted/60'
                              }`}
                            >
                              Frete Grátis
                            </button>
                          </div>

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
                            className={`h-7 text-xs ${
                              freteObj?.modo_frete === 'frete_gratis'
                                ? 'border-emerald-300 font-semibold text-emerald-900 bg-emerald-50/40'
                                : ''
                            }`}
                          />
                        </div>

                        {/* REQUISITO (A): Abaixo do card do produto referente ao canal de venda,
                            exibir o VALOR FINAL TOTAL que o cliente vai pagar = produtos + frete */}
                        {(() => {
                          const calculoItem = calcularTotalItemComFreteCanal({
                            canalId: canal.id,
                            quantidade: item.quantidade,
                            precoObj,
                            freteObj,
                          })
                          return (
                            <div className="mt-2.5 pt-2 border-t border-border/80 bg-primary/5 rounded-md p-2 flex items-center justify-between">
                              <div className="space-y-0.5">
                                <span className="text-[10px] font-bold text-foreground block uppercase tracking-wider">
                                  Valor Final Total (Cliente)
                                </span>
                                <span className="text-[9px] text-muted-foreground block font-mono">
                                  {formatarMoedaBR(calculoItem.subtotalProdutos)} (produto)
                                  {calculoItem.valorFreteCliente > 0
                                    ? ` + ${formatarMoedaBR(calculoItem.valorFreteCliente)} (frete)`
                                    : freteObj?.modo_frete === 'frete_gratis'
                                      ? ' + Frete Grátis'
                                      : ''}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="text-sm font-black text-primary font-mono block">
                                  {formatarMoedaBR(calculoItem.totalCliente)}
                                </span>
                              </div>
                            </div>
                          )
                        })()}
                      </div>
                    )
                  })}
                </div>
                {/* Linha 4 do item: PAINEL DA DECISÃO DE APROVAÇÃO POR ITEM (Dinâmico para cada canal) */}
                <div className="pt-2 border-t border-border/50 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-muted-foreground">
                      Decisão de Aprovação do Item {index + 1} ({item.modelo_nome || 'Sem nome'})
                    </span>
                  </div>
                  <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
                    {canaisSelecionados.map((canal) => {
                      const precoObj = item.precos_canais[canal.id]
                      const freteObj = item.fretes_canais[canal.id]
                      const produtoVinculadoObj = item.produtos_canais?.[canal.id]

                      const precoUnit = precoObj?.preco_unitario || 0
                      const precoCheio =
                        precoObj?.preco_cheio !== undefined
                          ? precoObj.preco_cheio
                          : Math.round(precoUnit * item.quantidade * 100) / 100
                      const precoFinalUnitario =
                        item.quantidade > 0 && precoObj?.preco_final !== undefined
                          ? Math.round((Number(precoObj.preco_final) / item.quantidade) * 100) / 100
                          : precoUnit
                      const frete = freteObj?.valor_frete || 0

                      const precKey =
                        produtoVinculadoObj?.precificacao_id || precoObj?.precificacao_id
                      const precRec = precKey ? mapaPrecificacoesAprovadas[precKey] : null

                      return (
                        <DecisaoAprovacaoItemPanel
                          key={canal.id}
                          canalNome={canal.nome}
                          quantidadeItem={item.quantidade}
                          precoCheioEditado={
                            precoObj?.preco_final !== undefined
                              ? Number(precoObj.preco_final)
                              : precoCheio
                          }
                          precoUnitarioEditado={precoFinalUnitario}
                          freteItemEditado={frete}
                          modoFreteItem={freteObj?.modo_frete || 'pago_pelo_cliente'}
                          precificacaoAprovadaRecord={precRec}
                          produtoVinculado={produtoVinculadoObj}
                        />
                      )
                    })}
                  </div>
                </div>
              </div>
            )
          })}

          {itens.length === 0 && (
            <div className="text-center py-8 text-muted-foreground text-xs space-y-2 border-2 border-dashed rounded-xl">
              <p>Nenhum item adicionado ainda neste orçamento.</p>
              <div className="flex items-center justify-center gap-2 pt-1">
                <Button
                  size="sm"
                  type="button"
                  onClick={() => handleAdicionarItem('cadastrado')}
                  variant="outline"
                  className="text-xs border-emerald-300 text-emerald-700 bg-emerald-50"
                >
                  <Plus className="w-3 h-3 mr-1" />
                  Item Cadastrado
                </Button>
                <Button
                  size="sm"
                  type="button"
                  onClick={() => handleAdicionarItem('personalizado')}
                  variant="outline"
                  className="text-xs border-violet-300 text-violet-700 bg-violet-50"
                >
                  <Sparkles className="w-3 h-3 mr-1" />
                  Item Personalizado
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 4: OPÇÕES DISCRIMINADAS DE FRETE (ILIMITADAS, PREENCHIMENTO LIVRE E CÁLCULO AUTOMÁTICO) */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="pb-3 border-b border-border/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              <CardTitle className="text-base font-bold">
                4. Opções de Frete para o Cliente Decidir
              </CardTitle>
            </div>
            <CardDescription className="text-xs mt-0.5">
              Adicione quantas opções de frete desejar (Transportadora, Prazo e Valor). O total com
              o frete somado aos produtos do orçamento é calculado automaticamente para o cliente
              comparar.
            </CardDescription>
          </div>
          <Button
            size="sm"
            type="button"
            onClick={handleAdicionarOpcaoFrete}
            variant="outline"
            className="text-xs font-bold border-primary/40 text-primary bg-primary/5 hover:bg-primary/10 shrink-0"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />+ Adicionar Opção de Frete
          </Button>
        </CardHeader>
        <CardContent className="pt-4 space-y-4">
          {opcoesFrete.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-xs space-y-2 border-2 border-dashed rounded-xl bg-muted/10">
              <Truck className="w-6 h-6 mx-auto text-muted-foreground/50" />
              <p>Nenhuma opção adicional de frete cadastrada ainda.</p>
              <p className="text-[11px] text-muted-foreground">
                Exemplo: Sedex (2 dias - R$ 30,00), PAC (5 dias - R$ 20,00), J&L (4 dias - R$
                25,00)...
              </p>
              <Button
                size="sm"
                type="button"
                onClick={handleAdicionarOpcaoFrete}
                variant="outline"
                className="text-xs font-semibold"
              >
                <Plus className="w-3 h-3 mr-1" />
                Adicionar Primeira Opção
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {opcoesFrete.map((op, opIdx) => {
                const valorFreteNum = Math.max(0, Number(op.valor) || 0)

                return (
                  <div
                    key={op.id || opIdx}
                    className="p-3.5 rounded-xl border border-border/80 bg-background shadow-2xs space-y-3"
                  >
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="h-6 w-6 rounded-full font-bold text-[11px] flex items-center justify-center bg-primary/10 text-primary shrink-0">
                          {opIdx + 1}
                        </span>
                        <span className="text-xs font-bold text-foreground">
                          Opção {opIdx + 1}: {op.transportadora || 'Transportadora'}
                          {op.prazo ? ` (${op.prazo})` : ''}
                        </span>
                      </div>

                      <Button
                        size="sm"
                        variant="ghost"
                        type="button"
                        onClick={() => handleRemoverOpcaoFrete(opIdx)}
                        className="h-7 px-2 text-red-500 hover:text-red-700 hover:bg-red-50 self-end md:self-auto text-xs"
                      >
                        <Trash2 className="w-3.5 h-3.5 mr-1" />
                        Remover
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                          Transportadora / Modalidade (livre) *
                        </Label>
                        <Input
                          placeholder="Ex: Correios Sedex, Correios PAC, J&L..."
                          value={op.transportadora}
                          onChange={(e) =>
                            handleAtualizarOpcaoFrete(opIdx, 'transportadora', e.target.value)
                          }
                          className="h-8 text-xs font-semibold mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                          Prazo de Entrega (livre) *
                        </Label>
                        <Input
                          placeholder="Ex: 2 dias, 5 dias úteis, 24 horas..."
                          value={op.prazo}
                          onChange={(e) =>
                            handleAtualizarOpcaoFrete(opIdx, 'prazo', e.target.value)
                          }
                          className="h-8 text-xs mt-1"
                        />
                      </div>

                      <div>
                        <Label className="text-[10px] font-semibold text-muted-foreground">
                          Valor do Frete (R$) *
                        </Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          placeholder="0,00"
                          value={op.valor || ''}
                          onChange={(e) =>
                            handleAtualizarOpcaoFrete(
                              opIdx,
                              'valor',
                              parseFloat(e.target.value) || 0,
                            )
                          }
                          className="h-8 text-xs font-mono font-bold text-orange-600 mt-1"
                        />
                      </div>
                    </div>

                    {/* Somatória automática do frete com os produtos por canal de venda */}
                    <div className="pt-2 border-t border-border/50 bg-muted/20 rounded-lg p-2.5">
                      <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block mb-1.5">
                        Total Automático do Cliente com esta opção de frete:
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {canaisSelecionados.map((canal) => {
                          const subtotalProd = calcularSubtotalProdutosCanal(canal.id, itens)
                          const totalComEstaOpcao =
                            Math.round((subtotalProd + valorFreteNum) * 100) / 100

                          return (
                            <div
                              key={canal.id}
                              className="p-2 rounded bg-background border border-border/60 flex items-center justify-between text-xs"
                            >
                              <div>
                                <span className="font-bold text-foreground block">
                                  {canal.nome}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {formatarMoedaBR(subtotalProd)} + {formatarMoedaBR(valorFreteNum)}
                                </span>
                              </div>
                              <div className="text-right">
                                <span className="font-black text-primary font-mono text-xs">
                                  {formatarMoedaBR(totalComEstaOpcao)}
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* BLOCO 5: OBSERVAÇÕES */}
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
