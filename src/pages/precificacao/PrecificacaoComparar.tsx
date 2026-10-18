import { useEffect, useState, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import {
  Calculator,
  Save,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Sparkles,
  Info,
  DollarSign,
  TrendingUp,
  Percent,
  Layers,
  HelpCircle,
  Clock,
  Eye,
  EyeOff,
  Sliders,
  Check,
  Building2,
  Package,
  ArrowRight,
  ChevronDown,
  GripVertical,
  Store,
  Filter,
  Bookmark,
  Plus,
  Trash2,
  X,
  History,
  Loader2,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { ChevronsUpDown } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { precificacaoService } from '@/services/precificacao'
import { useAuth } from '@/contexts/AuthContext'
import {
  PrecCanalModalidadeRecord,
  PrecCanalRecord,
  PrecKitRecord,
  PrecPerfilTributarioRecord,
  PrecPrecificacaoRecord,
  PrecProdutoRecord,
  PrecTaxaRecord,
} from '@/types/precificacao'
import {
  calcularCustoBaseProduto,
  calcularDemonstrativo,
  calcularPrecoUnitarioCliente,
  calcularTotalUnidadesProduto,
  DemonstrativoResultado,
  resolverPrecoParaMeta,
  resolverTributosModalidade,
  round2,
} from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

interface AccordionTaxasNaoAplicadasProps {
  taxas: Array<{
    taxa_id?: string
    nome: string
    tipo_valor?: string
    aliquota_ou_fixo?: number
    motivo_nao_aplicada?: string
    condicao_resumo?: string
  }>
}

function AccordionTaxasNaoAplicadas({ taxas }: AccordionTaxasNaoAplicadasProps) {
  const [aberto, setAberto] = useState(false)

  if (!taxas || taxas.length === 0) return null

  const labelContador =
    taxas.length === 1 ? '1 taxa não aplicada' : `${taxas.length} taxas não aplicadas`

  return (
    <div className="rounded-lg border border-[#DF5830]/30 bg-[#DF5830]/5 overflow-hidden transition-all text-[11px]">
      <button
        type="button"
        onClick={() => setAberto((prev) => !prev)}
        aria-expanded={aberto}
        className="w-full flex items-center justify-between gap-1.5 p-2 text-left hover:bg-[#DF5830]/10 transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#DF5830]"
      >
        <div className="flex items-center gap-1.5 text-[#DF5830] font-semibold text-[10px] uppercase tracking-wider">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          <span>{labelContador}</span>
        </div>
        <ChevronDown
          className={cn(
            'h-3.5 w-3.5 text-[#DF5830] shrink-0 transition-transform duration-200',
            aberto && 'rotate-180',
          )}
        />
      </button>

      {aberto && (
        <div className="px-2 pb-2 pt-0.5 space-y-1 border-t border-[#DF5830]/20">
          {taxas.map((tx, idx) => {
            const labelTaxa = `${tx.nome}${
              tx.tipo_valor === 'percentual'
                ? ` ${tx.aliquota_ou_fixo}%`
                : tx.tipo_valor === 'fixo'
                  ? ` ${formatCurrency(tx.aliquota_ou_fixo)}`
                  : ''
            }`
            const motivo =
              tx.motivo_nao_aplicada || tx.condicao_resumo || 'Condição da regra não atendida'

            return (
              <div
                key={tx.taxa_id || idx}
                className="text-[10.5px] leading-tight text-foreground/90 pl-1 border-l-2 border-[#DF5830]/40 py-0.5"
              >
                <span className="font-medium text-[#DF5830]">{labelTaxa}:</span>{' '}
                <span className="text-muted-foreground">{motivo}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function PrecificacaoComparar() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [salvando, setSalvando] = useState(false)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [modalidades, setModalidades] = useState<PrecCanalModalidadeRecord[]>([])
  const [taxas, setTaxas] = useState<PrecTaxaRecord[]>([])
  const [perfisTributarios, setPerfisTributarios] = useState<PrecPerfilTributarioRecord[]>([])
  const [precificacoesExistentes, setPrecificacoesExistentes] = useState<PrecPrecificacaoRecord[]>(
    [],
  )

  // Produto selecionado para o estudo
  const [selectedProdutoId, setSelectedProdutoId] = useState<string>('')
  const [comboboxProdutoOpen, setComboboxProdutoOpen] = useState(false)

  // Modo de precificação
  const [modoCalculo, setModoCalculo] = useState<
    'mesmo_preco' | 'meta_lucro' | 'meta_margem' | 'manual'
  >('mesmo_preco')
  const [valorPrecoGlobal, setValorPrecoGlobal] = useState<number>(24.9)
  const [metaLucroReais, setMetaLucroReais] = useState<number>(5.0)
  const [metaMargemPct, setMetaMargemPct] = useState<number>(20.0)

  // Preços manuais por modalidade/canal (quando em modo manual)
  const [precosPorColuna, setPrecosPorColuna] = useState<Record<string, number>>({})

  // Descontos simulados por coluna
  const [descontosPorColuna, setDescontosPorColuna] = useState<
    Record<string, { pctCliente: number; descPixPct: number }>
  >({})

  // Canais/Modalidades ativas na visualização
  const [colunasAtivas, setColunasAtivas] = useState<Record<string, boolean>>({})

  // Cenários Rascunho / Salvos adicionados à grade a partir do Repositório (colunas extras)
  const [cenariosSalvosAdicionados, setCenariosSalvosAdicionados] = useState<
    PrecPrecificacaoRecord[]
  >([])

  // Modal / Dialog de Cenários Salvos (Repositório)
  const [repositorioOpen, setRepositorioOpen] = useState(false)

  // Modal / Dialog de Cenários Aprovados
  const [aprovadosOpen, setAprovadosOpen] = useState(false)
  const [cenarioParaRetirarAprovacao, setCenarioParaRetirarAprovacao] =
    useState<PrecPrecificacaoRecord | null>(null)
  const [retirandoAprovacaoModal, setRetirandoAprovacaoModal] = useState(false)

  // Estado para confirmação de exclusão permanente de cenário salvo no modal do repositório
  const [cenarioParaExcluirModal, setCenarioParaExcluirModal] =
    useState<PrecPrecificacaoRecord | null>(null)
  const [excluindoCenarioModal, setExcluindoCenarioModal] = useState(false)

  // Filtro de canais/marketplaces selecionados (por canal.id)
  const [canaisSelecionados, setCanaisSelecionados] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('precificacao_comparar_canais_selecionados')
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Erro ao ler canais selecionados do localStorage', e)
    }
    return []
  })

  // Ordem personalizada das modalidades/cards (persistido em localStorage)
  const [ordemColunas, setOrdemColunas] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('precificacao_comparar_ordem_cards')
      if (saved) return JSON.parse(saved)
    } catch (e) {
      console.warn('Erro ao ler ordem dos cards do localStorage', e)
    }
    return []
  })

  // Estado de arrasto DND nativo
  const [draggedModId, setDraggedModId] = useState<string | null>(null)
  const [dragOverModId, setDragOverModId] = useState<string | null>(null)

  // Toggle para ocultar/mostrar o card de composição/custo do produto (coluna fixa à esquerda)
  const [mostrarPainelProduto, setMostrarPainelProduto] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('precificacao_comparar_mostrar_painel_produto')
      if (saved !== null) return JSON.parse(saved)
    } catch (e) {
      console.warn('Erro ao ler estado do painel de produto do localStorage', e)
    }
    return true
  })

  // Diferença entre canais selecionados para comparação detalhada
  const [colunaDiffA, setColunaDiffA] = useState<string>('')
  const [colunaDiffB, setColunaDiffB] = useState<string>('')

  // Parâmetros tributários configuráveis na tela (espelho da planilha: DAS 6.95%, ICMS 2.23%)
  const [aliquotaDas, setAliquotaDas] = useState<number>(6.95)
  const [aliquotaIcms, setAliquotaIcms] = useState<number>(2.23)
  const [dasImpostoMes, setDasImpostoMes] = useState<number>(76.5)
  const [pedidosMes, setPedidosMes] = useState<number>(3000)

  // Rastreamento da fonte das premissas tributárias ('perfil' | 'global' | 'sobrescrito')
  const [fonteTributos, setFonteTributos] = useState<'perfil' | 'global' | 'sobrescrito'>('global')
  const [perfilAtivoId, setPerfilAtivoId] = useState<string | null>(null)
  const [isSobrescritoManualmente, setIsSobrescritoManualmente] = useState<boolean>(false)

  // Valores padrão/originais da fonte atual para restauração
  const [valoresOrigemFonte, setValoresOrigemFonte] = useState<{
    aliquotaDas: number
    aliquotaIcms: number
    dasImpostoMes: number
    pedidosMes: number
  }>({
    aliquotaDas: 6.95,
    aliquotaIcms: 2.23,
    dasImpostoMes: 76.5,
    pedidosMes: 3000,
  })

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true)
        const [prods, chans, mods, txs, tribs, precs] = await Promise.all([
          precificacaoService.listProdutos('status != "inativo"'),
          precificacaoService.listCanais(true),
          precificacaoService.listModalidades(),
          precificacaoService.listTaxas(),
          precificacaoService.listPerfisTributarios(),
          precificacaoService.listPrecificacoes(),
        ])

        setProdutos(prods)
        setCanais(chans)
        setModalidades(mods)
        setTaxas(txs)
        setPerfisTributarios(tribs)
        setPrecificacoesExistentes(precs)

        // Inicializar produto da URL ou o primeiro disponível
        const paramSku = searchParams.get('sku')
        const paramCenarioId = searchParams.get('cenarioId')

        if (paramSku && prods.length > 0) {
          const match = prods.find((p) => p.sku === paramSku)
          if (match) setSelectedProdutoId(match.id)
          else setSelectedProdutoId(prods[0]?.id || '')
        } else if (paramCenarioId && precs.length > 0) {
          const cenarioEncontrado = precs.find((c) => c.id === paramCenarioId)
          if (cenarioEncontrado && cenarioEncontrado.produto) {
            setSelectedProdutoId(cenarioEncontrado.produto)
          } else if (prods.length > 0) {
            setSelectedProdutoId(prods[0].id)
          }
        } else if (prods.length > 0) {
          setSelectedProdutoId(prods[0].id)
        }

        // Ativar colunas padrão (todas ativas inicialmente)
        const initialAtivas: Record<string, boolean> = {}
        for (const m of mods) {
          initialAtivas[m.id] = true
        }
        setColunasAtivas(initialAtivas)

        // Inicializar canais selecionados se vazio ou inválido
        setCanaisSelecionados((prev) => {
          if (prev.length > 0) {
            // Manter apenas ids válidos
            const validos = prev.filter((id) => chans.some((c) => c.id === id))
            if (validos.length > 0) return validos
          }
          return chans.map((c) => c.id)
        })
      } catch (err) {
        console.error('Erro ao inicializar comparador:', err)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [])

  const produtoAtual = useMemo(() => {
    return produtos.find((p) => p.id === selectedProdutoId) || null
  }, [produtos, selectedProdutoId])

  // Estado para guardar dados do prec_kits caso o produto seja Kit ou Combo
  const [kitInfoAtual, setKitInfoAtual] = useState<PrecKitRecord | null>(null)
  const [loadingKitInfo, setLoadingKitInfo] = useState<boolean>(false)

  useEffect(() => {
    // Ao trocar ou limpar o produto, limpa imediatamente o kit anterior para não vazar componentes
    setKitInfoAtual(null)

    if (!produtoAtual || (produtoAtual.tipo !== 'kit' && produtoAtual.tipo !== 'combo')) {
      setLoadingKitInfo(false)
      return
    }
    let isMounted = true
    setLoadingKitInfo(true)
    precificacaoService
      .getKitByProdutoPai(produtoAtual.id)
      .then((kitRec) => {
        if (isMounted) setKitInfoAtual(kitRec)
      })
      .catch((err) => {
        console.warn('Erro ao carregar kitInfo em PrecificacaoComparar:', err)
        if (isMounted) setKitInfoAtual(null)
      })
      .finally(() => {
        if (isMounted) setLoadingKitInfo(false)
      })
    return () => {
      isMounted = false
    }
  }, [produtoAtual])

  // Total de unidades contidas no produto selecionado (kits/combos somam itens do kit; avulso usa unidades cadastradas ou 1)
  const totalUnidadesProdutoAtual = useMemo(() => {
    if (!produtoAtual) return 1
    const kitValido =
      kitInfoAtual && kitInfoAtual.produto_pai === produtoAtual.id ? kitInfoAtual : null
    const itensKitConfig = kitValido?.itens?.map((it) => ({
      qtd_efetiva: it.qtd_efetiva,
    }))

    return calcularTotalUnidadesProduto({
      tipo: produtoAtual.tipo,
      unidade: produtoAtual.unidade,
      qtd_por_kit: produtoAtual.qtd_por_kit,
      kit_itens: itensKitConfig,
    })
  }, [produtoAtual, kitInfoAtual])

  // Custo base calculado do produto (suporta fabricação própria, revenda, kit e combo)
  const custoBaseAtual = useMemo(() => {
    if (!produtoAtual) return null
    // Só usa itens do kit se o kitInfoAtual pertencer de fato ao produtoAtual
    const kitValido =
      kitInfoAtual && kitInfoAtual.produto_pai === produtoAtual.id ? kitInfoAtual : null
    const itensKitConfig = kitValido?.itens?.map((it) => ({
      produto_id: it.produto_id,
      nome: it.nome,
      qtd_efetiva: it.qtd_efetiva,
      custo_unitario: it.custo_unitario,
    }))

    return calcularCustoBaseProduto({
      sku: produtoAtual.sku,
      nome: produtoAtual.nome,
      tipo: produtoAtual.tipo,
      categoria: produtoAtual.categoria,
      peso_g: produtoAtual.peso_g,
      dimensao_comprimento_cm: produtoAtual.dimensao_comprimento_cm,
      dimensao_largura_cm: produtoAtual.dimensao_largura_cm,
      dimensao_altura_cm: produtoAtual.dimensao_altura_cm,
      composicao: produtoAtual.composicao,
      perda_pct: produtoAtual.perda_pct,
      custo_aquisicao_unitario: produtoAtual.custo_aquisicao_unitario,
      despesas_compra: produtoAtual.despesas_compra,
      custo_etiqueta: produtoAtual.custo_etiqueta,
      custo_adicional_embalagem: produtoAtual.custo_adicional_embalagem,
      kit_itens: itensKitConfig,
      kit_custos_adicionais: kitValido?.custos_adicionais,
    })
  }, [produtoAtual, kitInfoAtual])

  // Salvar preferências em localStorage
  useEffect(() => {
    try {
      localStorage.setItem(
        'precificacao_comparar_canais_selecionados',
        JSON.stringify(canaisSelecionados),
      )
    } catch (e) {
      console.warn('Erro ao gravar canais selecionados no localStorage', e)
    }
  }, [canaisSelecionados])

  useEffect(() => {
    try {
      localStorage.setItem('precificacao_comparar_ordem_cards', JSON.stringify(ordemColunas))
    } catch (e) {
      console.warn('Erro ao gravar ordem dos cards no localStorage', e)
    }
  }, [ordemColunas])

  useEffect(() => {
    try {
      localStorage.setItem(
        'precificacao_comparar_mostrar_painel_produto',
        JSON.stringify(mostrarPainelProduto),
      )
    } catch (e) {
      console.warn('Erro ao gravar estado do painel de produto no localStorage', e)
    }
  }, [mostrarPainelProduto])

  // Lista base de todas as colunas (modalidades agrupadas por canal)
  const todasColunasModalidade = useMemo(() => {
    const list: Array<{
      modalidade: PrecCanalModalidadeRecord
      canal: PrecCanalRecord
      taxasDoCanal: PrecTaxaRecord[]
    }> = []

    for (const m of modalidades) {
      if (!m.ativo && m.ativo !== undefined) continue
      const canal = canais.find((c) => c.id === m.canal)
      if (!canal || canal.ativo === false) continue

      // Taxas aplicáveis: pertencentes a esta modalidade específica OU ao canal como um todo (modalidade vazia)
      const txs = taxas.filter(
        (t) => t.canal === canal.id && (!t.modalidade || t.modalidade === m.id),
      )

      list.push({
        modalidade: m,
        canal,
        taxasDoCanal: txs,
      })
    }

    return list
  }, [modalidades, canais, taxas])

  // Aplicar perfil tributário correspondente quando mudar o produto selecionado ou os perfis carregados
  useEffect(() => {
    if (!selectedProdutoId || !produtoAtual) {
      // Se não há produto selecionado, manter padrão global caso não sobrescrito
      return
    }

    // Helper para verificar se um perfil está dentro da vigência
    const isPerfilVigente = (perfil: PrecPerfilTributarioRecord): boolean => {
      if (!perfil.vigencia) return true
      const vig = perfil.vigencia.trim()
      if (!vig) return true
      // Se for formato de data YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}/.test(vig)) {
        const vigDate = new Date(vig)
        if (!isNaN(vigDate.getTime())) {
          return new Date() <= vigDate
        }
      }
      return true
    }

    // Precedência de matching:
    // 1. Perfil específico do produto selecionado
    // 2. Perfil da empresa do produto selecionado
    // 3. Perfil de escopo 'operacao' geral
    const perfisValidos = perfisTributarios.filter(isPerfilVigente)
    const perfilProduto = perfisValidos.find(
      (p) => p.escopo === 'produto' && p.produto === selectedProdutoId,
    )
    const perfilEmpresa = produtoAtual.empresa
      ? perfisValidos.find((p) => p.escopo === 'empresa' && p.empresa === produtoAtual.empresa)
      : null
    const perfilOperacao = perfisValidos.find((p) => p.escopo === 'operacao')

    const perfilEscolhido = perfilProduto || perfilEmpresa || perfilOperacao

    if (perfilEscolhido) {
      const novaAliqDas = perfilEscolhido.aliquota_das_pct ?? 6.95
      const novaAliqIcms = perfilEscolhido.aliquota_icms_pct ?? 2.23
      const novoDasMes = perfilEscolhido.outros?.das_imposto_total_mes ?? 76.5
      const novosPedidosMes = perfilEscolhido.outros?.pedidos_estimados_mes ?? 3000

      setPerfilAtivoId(perfilEscolhido.id)
      setValoresOrigemFonte({
        aliquotaDas: novaAliqDas,
        aliquotaIcms: novaAliqIcms,
        dasImpostoMes: novoDasMes,
        pedidosMes: novosPedidosMes,
      })
      setAliquotaDas(novaAliqDas)
      setAliquotaIcms(novaAliqIcms)
      setDasImpostoMes(novoDasMes)
      setPedidosMes(novosPedidosMes)
      setFonteTributos('perfil')
      setIsSobrescritoManualmente(false)
    } else {
      // Sem perfil: aplicar padrão global
      const padraoGlobal = {
        aliquotaDas: 6.95,
        aliquotaIcms: 2.23,
        dasImpostoMes: 76.5,
        pedidosMes: 3000,
      }
      setPerfilAtivoId(null)
      setValoresOrigemFonte(padraoGlobal)
      setAliquotaDas(padraoGlobal.aliquotaDas)
      setAliquotaIcms(padraoGlobal.aliquotaIcms)
      setDasImpostoMes(padraoGlobal.dasImpostoMes)
      setPedidosMes(padraoGlobal.pedidosMes)
      setFonteTributos('global')
      setIsSobrescritoManualmente(false)
    }
  }, [selectedProdutoId, produtoAtual, perfisTributarios])

  // Handlers para edição manual dos tributos
  const handleAtualizarAliquotaDas = (valor: number) => {
    setAliquotaDas(valor)
    setIsSobrescritoManualmente(true)
    setFonteTributos('sobrescrito')
  }

  const handleAtualizarAliquotaIcms = (valor: number) => {
    setAliquotaIcms(valor)
    setIsSobrescritoManualmente(true)
    setFonteTributos('sobrescrito')
  }

  const handleAtualizarDasImpostoMes = (valor: number) => {
    setDasImpostoMes(valor)
    setIsSobrescritoManualmente(true)
    setFonteTributos('sobrescrito')
  }

  const handleAtualizarPedidosMes = (valor: number) => {
    setPedidosMes(valor)
    setIsSobrescritoManualmente(true)
    setFonteTributos('sobrescrito')
  }

  // Restaurar fonte (Perfil se houver, ou Global padrão)
  const handleRestaurarFonteTributos = () => {
    setAliquotaDas(valoresOrigemFonte.aliquotaDas)
    setAliquotaIcms(valoresOrigemFonte.aliquotaIcms)
    setDasImpostoMes(valoresOrigemFonte.dasImpostoMes)
    setPedidosMes(valoresOrigemFonte.pedidosMes)
    setIsSobrescritoManualmente(false)
    setFonteTributos(perfilAtivoId ? 'perfil' : 'global')
    toast({
      title: 'Tributos Restaurados',
      description: perfilAtivoId
        ? 'Alíquotas restauradas a partir do perfil tributário vigente.'
        : 'Alíquotas restauradas para os padrões globais da planilha (6,95% / 2,23%).',
    })
  }

  // Carregar dados salvos das precificações deste produto quando o produto selecionado mudar
  // REGRA DO USUÁRIO: Por padrão, carregar o último card de canal APROVADO (não o rascunho).
  // Se não houver aprovado para o canal, o card começa vazio/pendente com o valor global padrão.
  // Limpa cenários salvos extras adicionados na grade ao trocar de produto (a menos que venha cenarioId de rascunho na URL).
  useEffect(() => {
    const cenarioIdParam = searchParams.get('cenarioId')
    let cenarioAlvoParam: PrecPrecificacaoRecord | undefined

    // Limpar imediatamente preços manuais/anteriores ao trocar de produto
    setCenariosSalvosAdicionados([])
    setPrecosPorColuna({})
    setDescontosPorColuna({})

    if (!selectedProdutoId || !precificacoesExistentes.length) {
      return
    }

    const precsProduto = precificacoesExistentes.filter((p) => p.produto === selectedProdutoId)
    if (!precsProduto.length) {
      return
    }

    if (cenarioIdParam) {
      cenarioAlvoParam = precsProduto.find((p) => p.id === cenarioIdParam)
    }

    const precosRecuperados: Record<string, number> = {}
    const descontosRecuperados: Record<string, { pctCliente: number; descPixPct: number }> = {}

    // Filtrar apenas precificações com status 'aprovada'
    const aprovadas = precsProduto
      .filter((p) => p.status === 'aprovada' && p.modalidade)
      .sort(
        (a, b) =>
          new Date(b.updated || b.created || 0).getTime() -
          new Date(a.updated || a.created || 0).getTime(),
      )

    for (const prec of aprovadas) {
      if (!prec.modalidade) continue
      // Se já preenchemos com o aprovado mais recente desta modalidade, ignorar os mais antigos
      if (precosRecuperados[prec.modalidade] !== undefined) continue

      const precoSalvo = prec.preco_aprovado || prec.premissas?.preco_venda
      if (precoSalvo && precoSalvo > 0) {
        precosRecuperados[prec.modalidade] = precoSalvo
      }

      // Recuperar descontos salvos
      if (prec.premissas?.descontos && Array.isArray(prec.premissas.descontos)) {
        let pctCliente = 0
        let descPixPct = 0
        for (const d of prec.premissas.descontos) {
          if (d.nome?.toLowerCase().includes('pix')) {
            descPixPct = d.valor || 0
          } else {
            pctCliente = d.valor || 0
          }
        }
        if (pctCliente > 0 || descPixPct > 0) {
          descontosRecuperados[prec.modalidade] = { pctCliente, descPixPct }
        }
      }
    }

    // Se o cenarioId na URL apontar para um cenário aprovado específico deste produto
    if (cenarioAlvoParam && cenarioAlvoParam.status === 'aprovada' && cenarioAlvoParam.modalidade) {
      const precoAlvo = cenarioAlvoParam.preco_aprovado || cenarioAlvoParam.premissas?.preco_venda
      if (precoAlvo && precoAlvo > 0) {
        precosRecuperados[cenarioAlvoParam.modalidade] = precoAlvo
      }
      setModoCalculo('manual')
      setCenariosSalvosAdicionados([])
    } else if (cenarioAlvoParam && cenarioAlvoParam.status === 'rascunho') {
      // Se for um rascunho salvo vindo da URL: importar para a grade
      setCenariosSalvosAdicionados([cenarioAlvoParam])

      if (
        cenarioAlvoParam.premissas?.descontos &&
        Array.isArray(cenarioAlvoParam.premissas.descontos)
      ) {
        let pctCliente = 0
        let descPixPct = 0
        for (const d of cenarioAlvoParam.premissas.descontos) {
          if (d.nome?.toLowerCase().includes('pix')) {
            descPixPct = d.valor || 0
          } else {
            pctCliente = d.valor || 0
          }
        }
        descontosRecuperados[`salvo_${cenarioAlvoParam.id}`] = { pctCliente, descPixPct }
      }

      const precoRascunho =
        cenarioAlvoParam.preco_aprovado || cenarioAlvoParam.premissas?.preco_venda
      if (precoRascunho) {
        precosRecuperados[`salvo_${cenarioAlvoParam.id}`] = precoRascunho
      }
    } else {
      setCenariosSalvosAdicionados([])
    }

    // Recalcular valorPrecoGlobal inicial para o produto
    // Precedência v0.0.84: aprovado mais recente > simulação de rascunho > sugerido por custo/modo
    const todasAprovadas = precsProduto
      .filter(
        (p) => p.status === 'aprovada' && Boolean(p.preco_aprovado || p.premissas?.preco_venda),
      )
      .sort(
        (a, b) =>
          new Date(b.updated || b.created || 0).getTime() -
          new Date(a.updated || a.created || 0).getTime(),
      )
    const precoAprovadoRecente =
      todasAprovadas[0]?.preco_aprovado || todasAprovadas[0]?.premissas?.preco_venda

    const rascunhosRecentes = precsProduto
      .filter((p) => p.status === 'rascunho' && Boolean(p.premissas?.preco_venda))
      .sort(
        (a, b) =>
          new Date(b.updated || b.created || 0).getTime() -
          new Date(a.updated || a.created || 0).getTime(),
      )
    const precoRascunhoRecente = rascunhosRecentes[0]?.premissas?.preco_venda

    let precoInicial: number
    if (precoAprovadoRecente && precoAprovadoRecente > 0) {
      precoInicial = precoAprovadoRecente
    } else if (precoRascunhoRecente && precoRascunhoRecente > 0) {
      precoInicial = precoRascunhoRecente
    } else {
      const custoTotal = custoBaseAtual?.custo_total ?? 0
      if (modoCalculo === 'meta_margem') {
        if (metaMargemPct >= 100) {
          precoInicial = round2(custoTotal * 1.5)
        } else {
          precoInicial = round2(custoTotal / (1 - metaMargemPct / 100))
        }
      } else if (modoCalculo === 'meta_lucro') {
        precoInicial = round2(custoTotal + metaLucroReais)
      } else {
        // 'mesmo_preco' ou 'manual'
        precoInicial = round2(custoTotal > 0 ? custoTotal * 1.4 : 24.9)
      }
    }

    setValorPrecoGlobal(precoInicial)
    setPrecosPorColuna(precosRecuperados)
    setDescontosPorColuna(descontosRecuperados)
  }, [
    selectedProdutoId,
    custoBaseAtual,
    precificacoesExistentes,
    searchParams,
    modoCalculo,
    metaLucroReais,
    metaMargemPct,
  ])

  // Ordenação e Filtragem por marketplace/canal selecionado
  const colunasModalidade = useMemo(() => {
    // 1. Filtrar pelos canais/marketplaces ativos no filtro
    const filtradas = todasColunasModalidade.filter((item) => {
      if (canaisSelecionados.length === 0) return true
      return canaisSelecionados.includes(item.canal.id)
    })

    // 2. Aplicar ordem persistida
    if (!ordemColunas || ordemColunas.length === 0) {
      return filtradas
    }

    const mapa = new Map(filtradas.map((c) => [c.modalidade.id, c]))
    const ordenadas: typeof filtradas = []

    for (const id of ordemColunas) {
      const item = mapa.get(id)
      if (item) {
        ordenadas.push(item)
        mapa.delete(id)
      }
    }

    // Acrescentar as que ainda não estavam no array de ordem
    for (const item of mapa.values()) {
      ordenadas.push(item)
    }

    return ordenadas
  }, [todasColunasModalidade, canaisSelecionados, ordemColunas])

  // Handlers para reordenação Drag and Drop nativo dos cards
  const handleDragStart = (e: React.DragEvent, modId: string) => {
    e.dataTransfer.setData('text/plain', modId)
    e.dataTransfer.effectAllowed = 'move'
    setDraggedModId(modId)
  }

  const handleDragOver = (e: React.DragEvent, modId: string) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverModId !== modId) {
      setDragOverModId(modId)
    }
  }

  const handleDragLeave = (_e: React.DragEvent, modId: string) => {
    if (dragOverModId === modId) {
      setDragOverModId(null)
    }
  }

  const handleDrop = (e: React.DragEvent, targetModId: string) => {
    e.preventDefault()
    const sourceModId = e.dataTransfer.getData('text/plain') || draggedModId
    setDraggedModId(null)
    setDragOverModId(null)

    if (!sourceModId || sourceModId === targetModId) return

    // Obter lista atual de IDs visíveis/ordenados
    const currentIds = colunasModalidade.map((c) => c.modalidade.id)
    const sourceIndex = currentIds.indexOf(sourceModId)
    const targetIndex = currentIds.indexOf(targetModId)

    if (sourceIndex === -1 || targetIndex === -1) return

    const newIds = [...currentIds]
    newIds.splice(sourceIndex, 1)
    newIds.splice(targetIndex, 0, sourceModId)

    // Se existiam outros IDs no ordemColunas que não estão visíveis no momento, preservá-los
    const allModIds = todasColunasModalidade.map((c) => c.modalidade.id)
    const finalOrder = [
      ...newIds,
      ...ordemColunas.filter((id) => !newIds.includes(id) && allModIds.includes(id)),
    ]

    setOrdemColunas(finalOrder)
    toast({
      title: 'Sequência reordenada',
      description: 'A nova ordem dos canais foi salva para suas próximas sessões.',
    })
  }

  const handleResetOrdem = () => {
    setOrdemColunas([])
    try {
      localStorage.removeItem('precificacao_comparar_ordem_cards')
    } catch (e) {
      console.warn(e)
    }
    toast({
      title: 'Ordem redefinida',
      description: 'A ordem original dos canais foi restaurada.',
    })
  }

  // Inicializar seleção de comparação A x B
  useEffect(() => {
    if (colunasModalidade.length >= 2 && !colunaDiffA) {
      setColunaDiffA(colunasModalidade[0].modalidade.id)
      setColunaDiffB(colunasModalidade[1].modalidade.id)
    }
  }, [colunasModalidade, colunaDiffA])

  // Lista unificada de colunas: Colunas Padrão (último Aprovado ou Base) + Cenários Salvos Extras adicionados da grade
  type ColunaItem = {
    colKey: string
    isSalvoExtra: boolean
    cenarioSalvoRecord?: PrecPrecificacaoRecord
    modalidade: PrecCanalModalidadeRecord
    canal: PrecCanalRecord
    taxasDoCanal: PrecTaxaRecord[]
    precoSalvoFixo?: number
  }

  const todasColunasComSalvos = useMemo<ColunaItem[]>(() => {
    const list: ColunaItem[] = []

    // 1. Colunas Padrão de cada canal/modalidade
    for (const col of colunasModalidade) {
      list.push({
        colKey: col.modalidade.id,
        isSalvoExtra: false,
        modalidade: col.modalidade,
        canal: col.canal,
        taxasDoCanal: col.taxasDoCanal,
      })
    }

    // 2. Colunas Extras de Cenários Salvos (adicionados pelo repositório)
    for (const cenario of cenariosSalvosAdicionados) {
      // Encontrar a modalidade e canal correspondentes
      const mod = modalidades.find((m) => m.id === cenario.modalidade)
      const chan = canais.find((c) => c.id === cenario.canal || c.id === mod?.canal)
      if (!mod || !chan) continue

      // Taxas aplicáveis
      const txs = taxas.filter(
        (t) => t.canal === chan.id && (!t.modalidade || t.modalidade === mod.id),
      )

      list.push({
        colKey: `salvo_${cenario.id}`,
        isSalvoExtra: true,
        cenarioSalvoRecord: cenario,
        modalidade: mod,
        canal: chan,
        taxasDoCanal: txs,
        precoSalvoFixo: cenario.preco_aprovado || cenario.premissas?.preco_venda,
      })
    }

    return list
  }, [colunasModalidade, cenariosSalvosAdicionados, modalidades, canais, taxas])

  // Cálculo individualizado por coluna (inclui colunas padrão e rascunhos salvos adicionados)
  const demonstrativosPorColuna = useMemo(() => {
    if (!produtoAtual || !custoBaseAtual) return {}

    const res: Record<
      string,
      {
        demonstrativo: DemonstrativoResultado
        precoAnunciado: number
        modalidade: PrecCanalModalidadeRecord
        canal: PrecCanalRecord
        taxas: PrecTaxaRecord[]
        precoSugeridoEquilibrio: number
        precoSugeridoMeta: number
        convergiuMeta: boolean
        isSalvoExtra: boolean
        cenarioSalvoRecord?: PrecPrecificacaoRecord
      }
    > = {}

    for (const col of todasColunasComSalvos) {
      const colKey = col.colKey
      const canal = col.canal

      // Determinar preço anunciado da coluna
      let precoColuna = precosPorColuna[colKey] ?? (col.precoSalvoFixo || valorPrecoGlobal)

      // Descontos
      const descConf = descontosPorColuna[colKey] || { pctCliente: 0, descPixPct: 0 }
      const descontosInput = []
      if (descConf.pctCliente > 0) {
        descontosInput.push({
          nome: 'Desconto ao Cliente',
          tipo: 'percentual' as const,
          valor: descConf.pctCliente,
          financiado_por: 'vendedor' as const,
        })
      }
      if (descConf.descPixPct > 0) {
        descontosInput.push({
          nome: 'Desconto Pix',
          tipo: 'percentual' as const,
          valor: descConf.descPixPct,
          financiado_por: 'vendedor' as const,
        })
      }

      const kitValido =
        kitInfoAtual && kitInfoAtual.produto_pai === produtoAtual.id ? kitInfoAtual : null
      const itensKitConfig = kitValido?.itens?.map((it) => ({
        produto_id: it.produto_id,
        nome: it.nome,
        qtd_efetiva: it.qtd_efetiva,
        custo_unitario: it.custo_unitario,
      }))

      const cenarioBase = {
        produto: {
          sku: produtoAtual.sku,
          nome: produtoAtual.nome,
          tipo: produtoAtual.tipo,
          categoria: produtoAtual.categoria,
          peso_g: produtoAtual.peso_g,
          dimensao_comprimento_cm: produtoAtual.dimensao_comprimento_cm,
          dimensao_largura_cm: produtoAtual.dimensao_largura_cm,
          dimensao_altura_cm: produtoAtual.dimensao_altura_cm,
          composicao: produtoAtual.composicao,
          perda_pct: produtoAtual.perda_pct,
          custo_aquisicao_unitario: produtoAtual.custo_aquisicao_unitario,
          despesas_compra: produtoAtual.despesas_compra,
          custo_etiqueta: produtoAtual.custo_etiqueta,
          custo_adicional_embalagem: produtoAtual.custo_adicional_embalagem,
          kit_itens: itensKitConfig,
          kit_custos_adicionais: kitValido?.custos_adicionais,
        },
        sobrescrita_custo_total: custoBaseAtual?.custo_total,
        preco_anunciado: precoColuna,
        descontos: descontosInput,
        taxas: col.taxasDoCanal.map((t) => ({
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
        tributos: (() => {
          // Se for cenário salvo e tiver alíquotas fixas gravadas nas premissas sem tributos_config
          const tribResolvido = resolverTributosModalidade({
            modalidade: col.modalidade,
            canal,
            globalFallback: {
              aliquotaDas,
              aliquotaIcms,
              dasImpostoMes,
              pedidosMes,
              fonteNome:
                fonteTributos === 'perfil'
                  ? 'Perfil'
                  : fonteTributos === 'sobrescrito'
                    ? 'Sobrescrito'
                    : 'Global',
            },
          })
          return tribResolvido.tributos
        })(),
        prazo_recebimento_dias: col.modalidade.prazo_recebimento_dias || 0,
      }

      // Se o modo for 'meta_lucro' ou 'meta_margem' e não for um cenário salvo fixo
      let precoSugeridoMeta = precoColuna
      let convergiuMeta = true

      if (
        !col.isSalvoExtra &&
        precosPorColuna[colKey] === undefined &&
        modoCalculo === 'meta_lucro'
      ) {
        const sol = resolverPrecoParaMeta(cenarioBase, 'lucro_reais', metaLucroReais)
        precoColuna = sol.preco_sugerido
        precoSugeridoMeta = sol.preco_sugerido
        convergiuMeta = sol.convergiu
      } else if (
        !col.isSalvoExtra &&
        precosPorColuna[colKey] === undefined &&
        modoCalculo === 'meta_margem'
      ) {
        const sol = resolverPrecoParaMeta(cenarioBase, 'margem_pct', metaMargemPct)
        precoColuna = sol.preco_sugerido
        precoSugeridoMeta = sol.preco_sugerido
        convergiuMeta = sol.convergiu
      }

      // Recalcular demonstrativo final para o preço resolvido
      const demonstrativoFinal = calcularDemonstrativo({
        ...cenarioBase,
        preco_anunciado: precoColuna,
      })

      // Ponto de equilíbrio
      const eqSol = resolverPrecoParaMeta(cenarioBase, 'equilibrio', 0)

      res[colKey] = {
        demonstrativo: demonstrativoFinal,
        precoAnunciado: precoColuna,
        modalidade: col.modalidade,
        canal,
        taxas: col.taxasDoCanal,
        precoSugeridoEquilibrio: eqSol.preco_sugerido,
        precoSugeridoMeta,
        convergiuMeta,
        isSalvoExtra: col.isSalvoExtra,
        cenarioSalvoRecord: col.cenarioSalvoRecord,
      }
    }

    return res
  }, [
    produtoAtual,
    custoBaseAtual,
    kitInfoAtual,
    todasColunasComSalvos,
    valorPrecoGlobal,
    modoCalculo,
    precosPorColuna,
    descontosPorColuna,
    metaLucroReais,
    metaMargemPct,
    aliquotaDas,
    aliquotaIcms,
    dasImpostoMes,
    pedidosMes,
  ])

  // Encontrar o canal mais rentável (com premissas completas)
  const melhorCenario = useMemo(() => {
    let melhorModId: string | null = null
    let maiorLucro = -Infinity

    for (const [colKey, item] of Object.entries(demonstrativosPorColuna)) {
      if (item.isSalvoExtra) continue
      if (colunasAtivas[colKey] === false) continue
      // Não considerar cenários incompletos ou inválidos como mais lucrativos
      if (!item.demonstrativo.valido || item.demonstrativo.preco_anunciado <= 0) continue

      if (item.demonstrativo.lucro_liquido > maiorLucro) {
        maiorLucro = item.demonstrativo.lucro_liquido
        melhorModId = colKey
      }
    }

    return melhorModId
  }, [demonstrativosPorColuna, colunasAtivas])

  // Salvar Cenário de Simulação
  async function handleSalvarCenario(colKey: string, aprovar = false) {
    if (!produtoAtual) return
    const colData = demonstrativosPorColuna[colKey]
    if (!colData) return

    try {
      setSalvando(true)
      const dem = colData.demonstrativo
      const modId = colData.modalidade.id

      const descConf = descontosPorColuna[colKey]
      const descontosSalvamento = []
      if (descConf?.pctCliente) {
        descontosSalvamento.push({
          nome: 'Desconto ao Cliente',
          tipo: 'percentual' as const,
          valor: descConf.pctCliente,
          financiado_por: 'vendedor' as const,
        })
      }
      if (descConf?.descPixPct) {
        descontosSalvamento.push({
          nome: 'Desconto Pix',
          tipo: 'percentual' as const,
          valor: descConf.descPixPct,
          financiado_por: 'vendedor' as const,
        })
      }

      const record = await precificacaoService.saveCenarioPrecificacao({
        produto: produtoAtual.id,
        empresa: produtoAtual.empresa,
        canal: colData.canal.id,
        modalidade: modId,
        premissas: {
          preco_venda: dem.preco_anunciado,
          descontos: descontosSalvamento,
          aliquota_das_pct: dem.aliquota_das_pct ?? aliquotaDas,
          aliquota_icms_pct: dem.aliquota_icms_pct ?? aliquotaIcms,
        },
        resultado: dem as unknown as Record<string, unknown>,
        status: aprovar ? 'aprovada' : 'rascunho',
        custo_snapshot: {
          custo_total: dem.custo_total_produto,
          atualizado_em: new Date().toISOString(),
        },
        taxas_snapshot: {
          taxas_count: colData.taxas.length,
          atualizado_em: new Date().toISOString(),
        },
        preco_aprovado: aprovar ? dem.preco_anunciado : undefined,
        aprovado_por: aprovar && user?.id ? user.id : undefined,
        aprovado_em: aprovar ? new Date().toISOString() : undefined,
      })

      if (aprovar && user?.id) {
        await precificacaoService.aprovarPreco(record.id, dem.preco_anunciado, user.id)
      }

      // Se for um card salvo extra que foi aprovado, podemos removê-lo da lista de rascunhos extras
      if (aprovar && colKey.startsWith('salvo_')) {
        const salvoId = colKey.replace('salvo_', '')
        setCenariosSalvosAdicionados((prev) => prev.filter((s) => s.id !== salvoId))
      }

      // Recarregar lista de precificações para manter repositório e comparador sincronizados
      const precsAtualizadas = await precificacaoService.listPrecificacoes()
      setPrecificacoesExistentes(precsAtualizadas)

      toast({
        title: aprovar ? 'Preço Aprovado!' : 'Cenário Salvo no Repositório',
        description: `${produtoAtual.nome} em ${colData.canal.nome} (${colData.modalidade.nome}) registrado como ${aprovar ? 'aprovado' : 'rascunho'}.`,
      })
    } catch (err) {
      console.error('Erro ao salvar cenário:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: 'Não foi possível salvar o cenário no banco de dados.',
      })
    } finally {
      setSalvando(false)
    }
  }

  // Comparação entre dois canais escolhidos (Diff A x B)
  const calculoDiff = useMemo(() => {
    if (!colunaDiffA || !colunaDiffB) return null
    const a = demonstrativosPorColuna[colunaDiffA]
    const b = demonstrativosPorColuna[colunaDiffB]
    if (!a || !b) return null

    const lucroDiff = a.demonstrativo.lucro_liquido - b.demonstrativo.lucro_liquido
    const margemDiff = a.demonstrativo.margem_liquida_pct - b.demonstrativo.margem_liquida_pct

    return {
      a,
      b,
      lucroDiff,
      margemDiff,
    }
  }, [demonstrativosPorColuna, colunaDiffA, colunaDiffB])

  // Rascunhos salvos do produto selecionado (Repositório)
  const rascunhosDoProduto = useMemo(() => {
    if (!selectedProdutoId) return []
    return precificacoesExistentes
      .filter((p) => p.produto === selectedProdutoId && p.status === 'rascunho')
      .sort((a, b) => new Date(b.created || 0).getTime() - new Date(a.created || 0).getTime())
  }, [selectedProdutoId, precificacoesExistentes])

  // Cenários aprovados do produto selecionado
  const aprovadosDoProduto = useMemo(() => {
    if (!selectedProdutoId) return []
    return precificacoesExistentes
      .filter(
        (p) =>
          p.produto === selectedProdutoId &&
          (p.status === 'aprovada' || (p.preco_aprovado !== undefined && p.preco_aprovado > 0)),
      )
      .sort(
        (a, b) =>
          new Date(b.updated || b.created || 0).getTime() -
          new Date(a.updated || a.created || 0).getTime(),
      )
  }, [selectedProdutoId, precificacoesExistentes])

  // Função para adicionar rascunho salvo à grade como coluna extra
  const handleAdicionarCenarioSalvo = (cenario: PrecPrecificacaoRecord) => {
    if (cenariosSalvosAdicionados.some((s) => s.id === cenario.id)) {
      toast({
        title: 'Cenário já está na grade',
        description: 'Este cenário salvo já foi adicionado para comparação.',
      })
      return
    }

    // Inicializar os descontos do cenário na coluna se houver
    if (cenario.premissas?.descontos && Array.isArray(cenario.premissas.descontos)) {
      let pctCliente = 0
      let descPixPct = 0
      for (const d of cenario.premissas.descontos) {
        if (d.nome?.toLowerCase().includes('pix')) {
          descPixPct = d.valor || 0
        } else {
          pctCliente = d.valor || 0
        }
      }
      setDescontosPorColuna((prev) => ({
        ...prev,
        [`salvo_${cenario.id}`]: { pctCliente, descPixPct },
      }))
    }

    // Inicializar preço
    const precoSalvo = cenario.preco_aprovado || cenario.premissas?.preco_venda
    if (precoSalvo) {
      setPrecosPorColuna((prev) => ({
        ...prev,
        [`salvo_${cenario.id}`]: precoSalvo,
      }))
    }

    setCenariosSalvosAdicionados((prev) => [...prev, cenario])
    toast({
      title: 'Cenário Salvo adicionado',
      description: 'O rascunho salvo foi inserido na grade para comparação com o aprovado.',
    })
  }

  // Função para remover rascunho salvo da grade (apenas visual, sem apagar do banco)
  const handleRemoverCenarioSalvo = (cenarioId: string) => {
    setCenariosSalvosAdicionados((prev) => prev.filter((s) => s.id !== cenarioId))
    setPrecosPorColuna((prev) => {
      const next = { ...prev }
      delete next[`salvo_${cenarioId}`]
      return next
    })
    setDescontosPorColuna((prev) => {
      const next = { ...prev }
      delete next[`salvo_${cenarioId}`]
      return next
    })
    toast({
      title: 'Cenário removido da grade',
      description: 'O cenário salvo continua preservado no Repositório.',
    })
  }

  // Função para excluir definitivamente um cenário salvo no modal do Repositório
  const handleConfirmarExclusaoModal = async () => {
    if (!cenarioParaExcluirModal) return
    try {
      setExcluindoCenarioModal(true)
      const cenarioId = cenarioParaExcluirModal.id
      await precificacaoService.excluirCenario(cenarioId)

      // Se o cenário estava adicionado à grade temporária, remove também
      setCenariosSalvosAdicionados((prev) => prev.filter((s) => s.id !== cenarioId))
      setPrecosPorColuna((prev) => {
        const next = { ...prev }
        delete next[`salvo_${cenarioId}`]
        return next
      })
      setDescontosPorColuna((prev) => {
        const next = { ...prev }
        delete next[`salvo_${cenarioId}`]
        return next
      })

      // Atualiza a lista geral de precificações
      const precsAtualizadas = await precificacaoService.listPrecificacoes()
      setPrecificacoesExistentes(precsAtualizadas)

      toast({
        title: 'Cenário removido',
        description: 'O cenário salvo foi excluído permanentemente.',
      })
      setCenarioParaExcluirModal(null)
    } catch (err: unknown) {
      console.error('Erro ao excluir cenário salvo no modal:', err)
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
      setExcluindoCenarioModal(false)
    }
  }

  // Função para retirar aprovação de um cenário no modal de Aprovados
  const handleConfirmarRetiradaModal = async () => {
    if (!cenarioParaRetirarAprovacao) return
    try {
      setRetirandoAprovacaoModal(true)
      await precificacaoService.retirarAprovacao(cenarioParaRetirarAprovacao.id)
      const precsAtualizadas = await precificacaoService.listPrecificacoes()
      setPrecificacoesExistentes(precsAtualizadas)
      toast({
        title: 'Aprovação retirada',
        description: `O cenário voltou para rascunho com sucesso.`,
      })
      setCenarioParaRetirarAprovacao(null)
    } catch (err) {
      console.error('Erro ao retirar aprovação do modal:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao retirar aprovação',
        description: 'Não foi possível reverter o status do cenário. Tente novamente.',
      })
    } finally {
      setRetirandoAprovacaoModal(false)
    }
  }

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Comparador de Preços Lado a Lado"
        subtitulo="Simulação comparativa espelho da planilha de custos, com demonstrativo auditável por canal de venda"
        acoes={
          <div className="flex items-center gap-2 flex-wrap">
            {/* Botão Repositório de Cenários Salvos */}
            <Button
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1.5 transition-colors ${
                rascunhosDoProduto.length > 0
                  ? 'border-primary/60 text-primary bg-primary/5 font-semibold hover:bg-primary/10'
                  : 'bg-white text-muted-foreground'
              }`}
              onClick={() => setRepositorioOpen(true)}
              title="Abrir repositório de rascunhos salvos deste produto para comparar na grade"
            >
              <Bookmark className="h-3.5 w-3.5 text-primary" />
              <span>Cenários Salvos</span>
              {rascunhosDoProduto.length > 0 && (
                <Badge className="bg-primary text-white text-[10px] h-4 px-1.5 font-bold">
                  {rascunhosDoProduto.length}
                </Badge>
              )}
            </Button>

            {/* Botão Cenários Aprovados */}
            <Button
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1.5 transition-colors ${
                aprovadosDoProduto.length > 0
                  ? 'border-emerald-500/60 text-emerald-700 bg-emerald-50/60 font-semibold hover:bg-emerald-100/60'
                  : 'bg-white text-muted-foreground'
              }`}
              onClick={() => setAprovadosOpen(true)}
              title="Visualizar preços e modalidades aprovadas deste produto"
            >
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              <span>Cenários Aprovados</span>
              {aprovadosDoProduto.length > 0 && (
                <Badge className="bg-emerald-600 text-white text-[10px] h-4 px-1.5 font-bold">
                  {aprovadosDoProduto.length}
                </Badge>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className={`h-8 text-xs gap-1.5 transition-colors ${
                !mostrarPainelProduto
                  ? 'border-primary/50 text-primary bg-primary/5 font-semibold'
                  : 'bg-white'
              }`}
              onClick={() => setMostrarPainelProduto((prev) => !prev)}
              title={
                mostrarPainelProduto
                  ? 'Ocultar card fixo de composição/custo do produto para ver mais canais'
                  : 'Mostrar card fixo de composição/custo do produto'
              }
            >
              {mostrarPainelProduto ? (
                <>
                  <EyeOff className="h-3.5 w-3.5" />
                  <span>Ocultar Painel do Produto</span>
                </>
              ) : (
                <>
                  <Eye className="h-3.5 w-3.5" />
                  <span>Exibir Painel do Produto</span>
                </>
              )}
            </Button>

            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-white"
              onClick={() => {
                setPrecosPorColuna({})
                setDescontosPorColuna({})
                setCenariosSalvosAdicionados([])
                setValorPrecoGlobal(24.9)
              }}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
              Resetar Premissas
            </Button>
          </div>
        }
      />

      {/* Bloco de Controles do Topo (3 cartões em 2 linhas) */}
      <div className="space-y-4">
        {/* 1. Cartão Superior: PRODUTO PARA ESTUDO (Full Width) */}
        <Card className="border-border bg-white shadow-xs">
          <CardContent className="p-4 sm:p-5 space-y-3">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                <Package className="h-4 w-4 text-primary" />
              </div>
              <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                Produto para Estudo
              </h2>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Selecione o Produto / SKU para Estudo
              </Label>
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 min-w-0">
                  <Popover open={comboboxProdutoOpen} onOpenChange={setComboboxProdutoOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={comboboxProdutoOpen}
                        className="font-bold text-sm h-11 w-full justify-between bg-secondary/30 border-border px-3.5"
                      >
                        <span className="truncate text-left">
                          {produtoAtual ? (
                            <>
                              <span className="font-mono font-bold text-primary mr-2">
                                [{produtoAtual.sku}]
                              </span>
                              <span className="font-medium text-foreground">
                                {produtoAtual.nome}
                              </span>
                              {(produtoAtual.expand?.fornecedor?.nome_fantasia ||
                                produtoAtual.expand?.fornecedor?.razao_social ||
                                produtoAtual.expand?.empresa?.nome_fantasia ||
                                produtoAtual.expand?.empresa?.razao_social) && (
                                <span className="ml-2 text-xs font-normal text-muted-foreground">
                                  ·{' '}
                                  {produtoAtual.expand?.fornecedor?.nome_fantasia ||
                                    produtoAtual.expand?.fornecedor?.razao_social ||
                                    produtoAtual.expand?.empresa?.nome_fantasia ||
                                    produtoAtual.expand?.empresa?.razao_social}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="text-muted-foreground font-normal">
                              Selecione um produto para estudo...
                            </span>
                          )}
                        </span>
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[min(650px,95vw)] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Buscar por nome, SKU, fornecedor ou empresa..."
                          className="h-10 text-xs"
                        />
                        <CommandList className="max-h-80 overflow-y-auto">
                          <CommandEmpty className="py-6 text-center text-xs text-muted-foreground">
                            Nenhum produto encontrado.
                          </CommandEmpty>

                          {/* 1. Grupo Revenda */}
                          {produtos.some((p) => p.tipo === 'revenda') && (
                            <CommandGroup
                              heading={
                                <span className="font-bold text-xs uppercase tracking-wider text-blue-700 flex items-center gap-1.5">
                                  <Badge className="bg-blue-600 text-white text-[9px] h-4 px-1 py-0 border-none">
                                    Revenda
                                  </Badge>
                                  <span>Produtos de Revenda</span>
                                </span>
                              }
                            >
                              {produtos
                                .filter((p) => p.tipo === 'revenda')
                                .map((p) => {
                                  const fornNome =
                                    p.expand?.fornecedor?.nome_fantasia ||
                                    p.expand?.fornecedor?.razao_social ||
                                    ''
                                  const empNome =
                                    p.expand?.empresa?.nome_fantasia ||
                                    p.expand?.empresa?.razao_social ||
                                    ''
                                  const origemLabel = fornNome
                                    ? `Fornecedor: ${fornNome}`
                                    : empNome
                                      ? `Empresa: ${empNome}`
                                      : ''

                                  return (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.sku} ${p.nome} ${fornNome} ${empNome} revenda`}
                                      onSelect={() => {
                                        setSelectedProdutoId(p.id)
                                        setKitInfoAtual(null)
                                        setPrecosPorColuna({})
                                        setDescontosPorColuna({})
                                        setCenariosSalvosAdicionados([])
                                        setModoCalculo('mesmo_preco')
                                        setSearchParams({ sku: p.sku })
                                        setComboboxProdutoOpen(false)
                                      }}
                                      className="cursor-pointer py-2 px-3 text-xs flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono font-bold text-primary shrink-0">
                                          [{p.sku}]
                                        </span>
                                        <span className="font-medium text-foreground truncate">
                                          {p.nome}
                                        </span>
                                        {origemLabel && (
                                          <span className="text-[11px] text-muted-foreground shrink-0 bg-secondary/60 px-1.5 py-0.5 rounded">
                                            {origemLabel}
                                          </span>
                                        )}
                                      </div>
                                      {selectedProdutoId === p.id && (
                                        <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                                      )}
                                    </CommandItem>
                                  )
                                })}
                            </CommandGroup>
                          )}

                          <CommandSeparator />

                          {/* 2. Grupo Fabricação Própria */}
                          {produtos.some((p) => p.tipo === 'fabricacao_propria') && (
                            <CommandGroup
                              heading={
                                <span className="font-bold text-xs uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
                                  <Badge className="bg-amber-600 text-white text-[9px] h-4 px-1 py-0 border-none">
                                    Fabricação
                                  </Badge>
                                  <span>Fabricação Própria</span>
                                </span>
                              }
                            >
                              {produtos
                                .filter((p) => p.tipo === 'fabricacao_propria')
                                .map((p) => {
                                  const empNome =
                                    p.expand?.empresa?.nome_fantasia ||
                                    p.expand?.empresa?.razao_social ||
                                    ''

                                  return (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.sku} ${p.nome} ${empNome} fabricacao propria`}
                                      onSelect={() => {
                                        setSelectedProdutoId(p.id)
                                        setKitInfoAtual(null)
                                        setPrecosPorColuna({})
                                        setDescontosPorColuna({})
                                        setCenariosSalvosAdicionados([])
                                        setModoCalculo('mesmo_preco')
                                        setSearchParams({ sku: p.sku })
                                        setComboboxProdutoOpen(false)
                                      }}
                                      className="cursor-pointer py-2 px-3 text-xs flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono font-bold text-primary shrink-0">
                                          [{p.sku}]
                                        </span>
                                        <span className="font-medium text-foreground truncate">
                                          {p.nome}
                                        </span>
                                        {empNome && (
                                          <span className="text-[11px] text-muted-foreground shrink-0 bg-secondary/60 px-1.5 py-0.5 rounded">
                                            Empresa: {empNome}
                                          </span>
                                        )}
                                      </div>
                                      {selectedProdutoId === p.id && (
                                        <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                                      )}
                                    </CommandItem>
                                  )
                                })}
                            </CommandGroup>
                          )}

                          <CommandSeparator />

                          {/* 3. Grupo Kits e Combos */}
                          {produtos.some((p) => p.tipo === 'kit' || p.tipo === 'combo') && (
                            <CommandGroup
                              heading={
                                <span className="font-bold text-xs uppercase tracking-wider text-purple-700 flex items-center gap-1.5">
                                  <Badge className="bg-purple-600 text-white text-[9px] h-4 px-1 py-0 border-none">
                                    Kits/Combos
                                  </Badge>
                                  <span>Kits e Combos</span>
                                </span>
                              }
                            >
                              {produtos
                                .filter((p) => p.tipo === 'kit' || p.tipo === 'combo')
                                .map((p) => {
                                  const empNome =
                                    p.expand?.empresa?.nome_fantasia ||
                                    p.expand?.empresa?.razao_social ||
                                    ''

                                  return (
                                    <CommandItem
                                      key={p.id}
                                      value={`${p.sku} ${p.nome} ${empNome} kit combo`}
                                      onSelect={() => {
                                        setSelectedProdutoId(p.id)
                                        setKitInfoAtual(null)
                                        setPrecosPorColuna({})
                                        setDescontosPorColuna({})
                                        setCenariosSalvosAdicionados([])
                                        setModoCalculo('mesmo_preco')
                                        setSearchParams({ sku: p.sku })
                                        setComboboxProdutoOpen(false)
                                      }}
                                      className="cursor-pointer py-2 px-3 text-xs flex items-center justify-between"
                                    >
                                      <div className="flex items-center gap-2 min-w-0">
                                        <span className="font-mono font-bold text-primary shrink-0">
                                          [{p.sku}]
                                        </span>
                                        <span className="font-medium text-foreground truncate">
                                          {p.nome}
                                        </span>
                                        <Badge
                                          variant="secondary"
                                          className="text-[9px] h-4 px-1 py-0 font-semibold shrink-0"
                                        >
                                          {p.tipo === 'kit' ? 'Kit' : 'Combo'}
                                        </Badge>
                                        {empNome && (
                                          <span className="text-[11px] text-muted-foreground shrink-0 bg-secondary/60 px-1.5 py-0.5 rounded">
                                            Empresa: {empNome}
                                          </span>
                                        )}
                                      </div>
                                      {selectedProdutoId === p.id && (
                                        <Check className="h-4 w-4 text-primary shrink-0 ml-2" />
                                      )}
                                    </CommandItem>
                                  )
                                })}
                            </CommandGroup>
                          )}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {produtoAtual && (
                  <>
                    {produtoAtual.tipo === 'kit' && (
                      <Badge className="h-9 px-3.5 text-xs font-semibold shrink-0 bg-primary text-white border-none rounded-lg">
                        Kit
                      </Badge>
                    )}
                    {produtoAtual.tipo === 'combo' && (
                      <Badge className="h-9 px-3.5 text-xs font-semibold shrink-0 bg-purple-600 text-white border-none rounded-lg">
                        Combo
                      </Badge>
                    )}
                    {produtoAtual.tipo === 'fabricacao_propria' && (
                      <Badge className="h-9 px-3.5 text-xs font-semibold shrink-0 bg-amber-600 text-white border-none rounded-lg">
                        Fabricação Própria
                      </Badge>
                    )}
                    {produtoAtual.tipo === 'revenda' && (
                      <Badge className="h-9 px-3.5 text-xs font-semibold shrink-0 bg-blue-600 text-white border-none rounded-lg">
                        Revenda
                      </Badge>
                    )}
                  </>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 2. Linha Inferior: SIMULAÇÃO DE PREÇO e TRIBUTOS E RATEIO lado a lado */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cartão "SIMULAÇÃO DE PREÇO" */}
          <Card className="border-border bg-white shadow-xs">
            <CardContent className="p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <DollarSign className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Simulação de Preço
                </h2>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 pt-0.5">
                {/* Abas do Modo de Simulação */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">
                    Modo de Simulação
                  </Label>
                  <Tabs
                    value={modoCalculo}
                    onValueChange={(v) => setModoCalculo(v as typeof modoCalculo)}
                    className="w-full"
                  >
                    <TabsList className="h-10 w-full grid grid-cols-4 p-1 bg-secondary/40 border border-border">
                      <TabsTrigger
                        value="mesmo_preco"
                        className="text-xs px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-bold"
                      >
                        Mesmo Preço
                      </TabsTrigger>
                      <TabsTrigger
                        value="meta_lucro"
                        className="text-xs px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-bold"
                      >
                        Meta Lucro R$
                      </TabsTrigger>
                      <TabsTrigger
                        value="meta_margem"
                        className="text-xs px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-bold"
                      >
                        Meta Margem %
                      </TabsTrigger>
                      <TabsTrigger
                        value="manual"
                        className="text-xs px-2 data-[state=active]:bg-primary/10 data-[state=active]:text-primary data-[state=active]:font-bold"
                      >
                        Manual
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Divisor vertical em telas sm+ */}
                <div className="hidden sm:block h-10 w-px bg-border/80 self-end mb-1" />

                {/* Valor de Entrada do Modo */}
                <div className="w-full sm:w-28 space-y-1.5 shrink-0">
                  <Label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider truncate block">
                    {modoCalculo === 'mesmo_preco'
                      ? 'Preço (R$)'
                      : modoCalculo === 'meta_lucro'
                        ? 'Meta Lucro (R$)'
                        : modoCalculo === 'meta_margem'
                          ? 'Meta Margem (%)'
                          : 'Preço Base'}
                  </Label>
                  <Input
                    type="number"
                    step="0.10"
                    className="h-10 text-sm font-bold text-center bg-secondary/30 border-border"
                    value={
                      modoCalculo === 'mesmo_preco' || modoCalculo === 'manual'
                        ? valorPrecoGlobal
                        : modoCalculo === 'meta_lucro'
                          ? metaLucroReais
                          : metaMargemPct
                    }
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0
                      if (modoCalculo === 'mesmo_preco' || modoCalculo === 'manual') {
                        setValorPrecoGlobal(val)
                      } else if (modoCalculo === 'meta_lucro') {
                        setMetaLucroReais(val)
                      } else {
                        setMetaMargemPct(val)
                      }
                    }}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cartão "TRIBUTOS E RATEIO" */}
          <Card className="border-border bg-white shadow-xs">
            <CardContent className="p-4 sm:p-5 space-y-3.5">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                  <Calculator className="h-4 w-4 text-primary" />
                </div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-foreground">
                  Tributos e Rateio
                </h2>
              </div>

              <div className="flex flex-wrap items-end gap-2 sm:gap-2.5 pt-0.5">
                {/* Fonte dos tributos (Perfil, Global, Sobrescrito) */}
                <div className="space-y-1.5 min-w-[70px]">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">
                    Tributos
                  </Label>
                  <div className="h-10 flex items-center">
                    {fonteTributos === 'perfil' && (
                      <Badge
                        variant="outline"
                        className="text-xs h-9 px-2.5 font-bold bg-blue-50/80 text-blue-700 border-blue-200 rounded-lg"
                      >
                        Perfil
                      </Badge>
                    )}
                    {fonteTributos === 'global' && (
                      <Badge
                        variant="outline"
                        className="text-xs h-9 px-3 font-bold bg-slate-50/80 text-slate-700 border-slate-200 rounded-lg"
                      >
                        Global
                      </Badge>
                    )}
                    {fonteTributos === 'sobrescrito' && (
                      <div className="flex items-center gap-1">
                        <Badge
                          variant="outline"
                          className="text-xs h-9 px-2 font-bold bg-amber-50/80 text-amber-800 border-amber-300 rounded-lg"
                        >
                          Sobrescrito
                        </Badge>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={handleRestaurarFonteTributos}
                          className="h-8 px-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                          title="Restaurar valores da fonte original"
                        >
                          <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                          Restaurar
                        </Button>
                      </div>
                    )}
                  </div>
                </div>

                <div className="hidden sm:block h-8 w-px bg-border/60 self-center" />

                {/* DAS (%) */}
                <div className="w-[72px] space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block truncate">
                    DAS (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-10 text-xs font-bold text-center bg-secondary/30 border-border px-1"
                    value={aliquotaDas}
                    onChange={(e) => handleAtualizarAliquotaDas(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* ICMS (%) */}
                <div className="w-[72px] space-y-1.5">
                  <Label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block truncate">
                    ICMS (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    className="h-10 text-xs font-bold text-center bg-secondary/30 border-border px-1"
                    value={aliquotaIcms}
                    onChange={(e) => handleAtualizarAliquotaIcms(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* Imposto Fixo Mês (R$) */}
                <div className="w-[84px] space-y-1.5">
                  <Label
                    className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate block"
                    title="Imposto Fixo do Mês (R$)"
                  >
                    Fixo Mês (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.50"
                    className="h-10 text-xs font-bold text-center bg-secondary/30 border-border px-1"
                    value={dasImpostoMes}
                    onChange={(e) => handleAtualizarDasImpostoMes(parseFloat(e.target.value) || 0)}
                  />
                </div>

                {/* Pedidos / Mês */}
                <div className="w-[84px] space-y-1.5">
                  <Label
                    className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider truncate block"
                    title="Pedidos estimados por mês para rateio"
                  >
                    Pedidos/mês
                  </Label>
                  <Input
                    type="number"
                    step="10"
                    className="h-10 text-xs font-bold text-center bg-secondary/30 border-border px-1"
                    value={pedidosMes}
                    onChange={(e) => handleAtualizarPedidosMes(parseFloat(e.target.value) || 0)}
                  />
                </div>

                <div className="hidden sm:block h-8 w-px bg-border/60 self-center" />

                {/* Rateio por venda informativo */}
                <div className="space-y-1.5 min-w-[80px]">
                  <Label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block truncate">
                    Rateio/venda
                  </Label>
                  <div className="h-10 flex items-center justify-center bg-secondary/30 border border-border rounded-md px-2.5">
                    <span className="text-xs font-mono font-bold text-foreground">
                      {formatCurrency(pedidosMes > 0 ? dasImpostoMes / pedidosMes : 0)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Barra de Ações, Filtro de Marketplaces e Seletor de Colunas Visíveis */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Layers className="h-4 w-4 text-primary" />
          <span className="text-sm font-bold text-foreground">
            Comparativo de Canais & Modalidades
          </span>
          {produtoAtual && (
            <span className="text-xs text-muted-foreground hidden sm:inline">
              — {colunasModalidade.filter((c) => colunasAtivas[c.modalidade.id] !== false).length}{' '}
              de {todasColunasModalidade.length} modalidades visíveis
            </span>
          )}
          {!mostrarPainelProduto && (
            <Badge
              variant="outline"
              className="text-[10px] bg-amber-50 text-amber-800 border-amber-200 gap-1 cursor-pointer hover:bg-amber-100"
              onClick={() => setMostrarPainelProduto(true)}
              title="Clique para reexibir o painel de custos do produto"
            >
              <Eye className="h-2.5 w-2.5" />
              Painel do Produto Oculto
            </Badge>
          )}
          {ordemColunas.length > 0 && (
            <Badge
              variant="outline"
              className="text-[10px] bg-secondary text-muted-foreground border-border gap-1"
            >
              <GripVertical className="h-2.5 w-2.5" />
              Ordem Personalizada
              <button
                type="button"
                onClick={handleResetOrdem}
                className="ml-1 text-xs hover:text-foreground font-bold"
                title="Restaurar ordem padrão"
              >
                ×
              </button>
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* 1. Filtro de Seleção de Marketplaces (Múltipla Seleção) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`h-8 text-xs gap-1.5 bg-white ${
                  canaisSelecionados.length < canais.length && canaisSelecionados.length > 0
                    ? 'border-primary/50 text-primary font-semibold'
                    : ''
                }`}
              >
                <Store className="h-3.5 w-3.5 text-primary" />
                <span>
                  Marketplaces{' '}
                  {canaisSelecionados.length > 0 &&
                    canaisSelecionados.length < canais.length &&
                    `(${canaisSelecionados.length}/${canais.length})`}
                </span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 max-h-80 overflow-y-auto">
              <DropdownMenuLabel className="text-xs font-bold flex items-center justify-between">
                <span>Filtrar por Marketplace</span>
                <span className="text-[10px] text-muted-foreground font-normal">
                  {canaisSelecionados.length} de {canais.length}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {canais.map((canal) => {
                const isSelected = canaisSelecionados.includes(canal.id)
                const countModalidades = todasColunasModalidade.filter(
                  (c) => c.canal.id === canal.id,
                ).length

                return (
                  <DropdownMenuCheckboxItem
                    key={canal.id}
                    checked={isSelected}
                    onCheckedChange={(checked) => {
                      setCanaisSelecionados((prev) => {
                        if (checked) {
                          return prev.includes(canal.id) ? prev : [...prev, canal.id]
                        } else {
                          // Impede desmarcar todos para não deixar a tela totalmente vazia acidentalmente, ou permite marcar
                          return prev.filter((id) => id !== canal.id)
                        }
                      })
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <div className="flex items-center justify-between w-full gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: canal.cor || '#DF5830' }}
                        />
                        <span className="font-semibold truncate">{canal.nome}</span>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                        {countModalidades} mod.
                      </span>
                    </div>
                  </DropdownMenuCheckboxItem>
                )
              })}
              <DropdownMenuSeparator />
              <div className="p-1 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 w-full"
                  onClick={() => {
                    setCanaisSelecionados(canais.map((c) => c.id))
                  }}
                >
                  Selecionar todos
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 w-full text-muted-foreground"
                  onClick={() => {
                    // Selecionar apenas o primeiro canal se preferir limpar
                    if (canais.length > 0) {
                      setCanaisSelecionados([canais[0].id])
                    } else {
                      setCanaisSelecionados([])
                    }
                  }}
                >
                  Apenas 1 canal
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 2. Seletor de Colunas / Modalidades Visíveis */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1.5 bg-white">
                <Sliders className="h-3.5 w-3.5" />
                <span>Colunas</span>
                <ChevronDown className="h-3 w-3 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60 max-h-80 overflow-y-auto">
              <DropdownMenuLabel className="text-xs font-bold">
                Modalidades Específicas
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {colunasModalidade.map((col) => {
                const modId = col.modalidade.id
                const isAtiva = colunasAtivas[modId] !== false
                return (
                  <DropdownMenuCheckboxItem
                    key={modId}
                    checked={isAtiva}
                    onCheckedChange={(checked) => {
                      setColunasAtivas((prev) => ({
                        ...prev,
                        [modId]: !!checked,
                      }))
                    }}
                    className="text-xs cursor-pointer"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <span
                        className="h-2 w-2 rounded-full shrink-0"
                        style={{ backgroundColor: col.canal.cor || '#DF5830' }}
                      />
                      <span className="truncate">
                        {col.canal.nome} - {col.modalidade.nome}
                      </span>
                    </div>
                  </DropdownMenuCheckboxItem>
                )
              })}
              <DropdownMenuSeparator />
              <div className="p-1 flex items-center justify-between gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 w-full"
                  onClick={() => {
                    const allTrue: Record<string, boolean> = {}
                    for (const m of todasColunasModalidade) allTrue[m.modalidade.id] = true
                    setColunasAtivas(allTrue)
                  }}
                >
                  Marcar todas
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] px-2 w-full text-muted-foreground"
                  onClick={() => {
                    const allFalse: Record<string, boolean> = {}
                    for (const m of todasColunasModalidade) allFalse[m.modalidade.id] = false
                    setColunasAtivas(allFalse)
                  }}
                >
                  Desmarcar
                </Button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* 3. Botão Toggle Visibilidade do Painel do Produto */}
          <Button
            variant="outline"
            size="sm"
            className={`h-8 text-xs gap-1.5 bg-white ${
              !mostrarPainelProduto ? 'border-primary/40 text-primary' : ''
            }`}
            onClick={() => setMostrarPainelProduto((prev) => !prev)}
            title={
              mostrarPainelProduto
                ? 'Ocultar coluna fixa do produto'
                : 'Exibir coluna fixa do produto'
            }
          >
            {mostrarPainelProduto ? (
              <>
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="hidden sm:inline">Ocultar Produto</span>
              </>
            ) : (
              <>
                <Eye className="h-3.5 w-3.5 text-primary" />
                <span className="font-semibold text-primary">Mostrar Produto</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Estados Vazios Orientativos */}
      {!produtoAtual ? (
        <Card className="p-10 text-center border-dashed border-border bg-white shadow-xs">
          <div className="max-w-md mx-auto space-y-3">
            <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
              <Package className="h-6 w-6" />
            </div>
            <CardTitle className="text-base font-bold">Nenhum produto selecionado</CardTitle>
            <CardDescription className="text-xs text-muted-foreground">
              Cadastre ou selecione um produto com ficha técnica para simular e comparar preços
              entre todos os canais de venda.
            </CardDescription>
            <div className="pt-2">
              <Button asChild className="bg-primary text-white font-bold h-9 text-xs">
                <Link to="/precificacao/produtos">
                  Ir para Produtos de Precificação
                  <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
        </Card>
      ) : (custoBaseAtual?.custo_total || 0) <= 0 ? (
        <Card className="p-4 border-amber-300 bg-amber-50/50 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <p className="text-xs font-bold text-amber-900">
                Complete a composição de custos do produto
              </p>
              <p className="text-xs text-amber-700">
                O produto{' '}
                <span className="font-mono font-bold">
                  [{produtoAtual.sku}] {produtoAtual.nome}
                </span>{' '}
                ainda não possui custos diretos cadastrados (C0..Cn, despesas de compra ou aquisição
                unitária). Os demonstrativos abaixo exibirão custo zero até que a composição seja
                preenchida.
              </p>
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="h-8 text-xs bg-white border-amber-300 text-amber-900 hover:bg-amber-100"
            >
              <Link to="/precificacao/produtos">
                Editar Composição
                <ArrowRight className="ml-1.5 h-3 w-3" />
              </Link>
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Painel Horizontal com Coluna Fixa do Produto (opcional) + Colunas Rolantes dos Canais */}
      {produtoAtual && (
        <div className="relative border border-border rounded-xl bg-card shadow-xs overflow-x-auto">
          <div className="inline-flex min-w-full items-stretch divide-x divide-border">
            {/* 1. Coluna Fixa do Produto (Sticky à esquerda) - Ocultável pelo usuário */}
            {mostrarPainelProduto && (
              <div className="sticky left-0 z-20 w-72 shrink-0 bg-[#fafafa] flex flex-col justify-between p-4 shadow-[4px_0_12px_-2px_rgba(0,0,0,0.06)] border-r border-border">
                <div className="space-y-4">
                  {/* Header do Produto */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="h-14 w-14 rounded-xl bg-secondary/80 border border-border flex items-center justify-center shrink-0 overflow-hidden text-primary">
                        {produtoAtual.imagem ? (
                          <img
                            src={precificacaoService.getProdutoImageUrl(produtoAtual, '120x120')}
                            alt={produtoAtual.nome}
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <Package className="h-7 w-7 text-primary/70" />
                        )}
                      </div>
                      <div className="space-y-1 min-w-0 flex-1">
                        <span className="font-mono text-xs font-black text-primary block truncate">
                          [{produtoAtual.sku}]
                        </span>
                        <h3
                          className="text-sm font-bold text-foreground leading-snug line-clamp-2"
                          title={produtoAtual.nome}
                        >
                          {produtoAtual.nome}
                        </h3>
                        <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                          <Badge
                            variant="outline"
                            className="text-[10px] h-5 px-1.5 font-semibold capitalize bg-white"
                          >
                            {produtoAtual.tipo.replace('_', ' ')}
                          </Badge>
                          {produtoAtual.categoria ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] h-5 px-1.5 text-muted-foreground truncate max-w-[140px]"
                              title={`Categoria: ${produtoAtual.categoria}`}
                            >
                              {produtoAtual.categoria}
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 px-1.5 text-[#DF5830] border-[#DF5830]/40 bg-[#DF5830]/5 font-medium"
                              title="Produto sem categoria: regras de taxa condicionadas por categoria não serão aplicadas no comparador"
                            >
                              Sem categoria
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                      onClick={() => setMostrarPainelProduto(false)}
                      title="Ocultar coluna do produto"
                      aria-label="Ocultar coluna do produto"
                    >
                      <EyeOff className="h-3.5 w-3.5" />
                    </Button>
                  </div>

                  {/* Composição Resumida de Custos (C0..Cn ou Itens do Kit/Combo) */}
                  <div className="space-y-2 pt-1 border-t border-border/70">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-muted-foreground uppercase text-[10px] tracking-wider flex items-center gap-1">
                        <Layers className="h-3 w-3" />
                        Composição de Custo
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {produtoAtual.tipo === 'kit' || produtoAtual.tipo === 'combo'
                          ? `${kitInfoAtual?.itens?.length || 0} itens`
                          : `${produtoAtual.composicao?.length || 0} itens`}
                      </span>
                    </div>

                    <div className="bg-white rounded-lg border border-border/80 p-2 space-y-1.5 text-xs max-h-48 overflow-y-auto">
                      {/* Caso 1: Kit ou Combo */}
                      {produtoAtual.tipo === 'kit' || produtoAtual.tipo === 'combo' ? (
                        loadingKitInfo ? (
                          <div className="flex items-center gap-2 py-3 justify-center text-muted-foreground text-xs">
                            <Loader2 className="h-4 w-4 animate-spin text-primary" />
                            <span>Carregando componentes do {produtoAtual.tipo}...</span>
                          </div>
                        ) : kitInfoAtual?.itens && kitInfoAtual.itens.length > 0 ? (
                          kitInfoAtual.itens.map((item, idx) => {
                            const subtotal = (item.qtd_efetiva || 0) * (item.custo_unitario || 0)
                            return (
                              <div
                                key={idx}
                                className="flex items-center justify-between gap-1 text-[11px] leading-tight"
                              >
                                <span
                                  className="text-muted-foreground truncate flex-1"
                                  title={item.nome}
                                >
                                  <span className="font-mono font-semibold text-foreground/80 mr-1">
                                    {item.qtd_efetiva}x
                                  </span>
                                  {item.nome}
                                  <span className="text-[10px] text-muted-foreground ml-1 font-mono">
                                    ({formatCurrency(item.custo_unitario || 0)})
                                  </span>
                                </span>
                                <span className="font-mono font-semibold text-foreground shrink-0">
                                  {formatCurrency(subtotal)}
                                </span>
                              </div>
                            )
                          })
                        ) : (
                          <div className="rounded-md bg-amber-50 border border-amber-200 p-2 text-[11px] text-amber-800 flex items-start gap-1.5">
                            <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                            <span>
                              {produtoAtual.tipo === 'kit' ? 'Kit' : 'Combo'} sem componentes
                              cadastrados — cadastre os componentes para obter o custo base real.
                            </span>
                          </div>
                        )
                      ) : produtoAtual.composicao && produtoAtual.composicao.length > 0 ? (
                        /* Caso 2: Fabricação própria com composição */
                        produtoAtual.composicao.map((item, idx) => {
                          const subtotal =
                            (item.qtd || 0) *
                            (item.custo_unitario || 0) *
                            (1 + (item.perda_pct || 0) / 100)
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between gap-1 text-[11px] leading-tight"
                            >
                              <span
                                className="text-muted-foreground truncate flex-1"
                                title={item.descricao}
                              >
                                <span className="font-mono font-semibold text-foreground/80 mr-1">
                                  {item.codigo || `C${idx}`}
                                </span>
                                {item.descricao}
                              </span>
                              <span className="font-mono font-semibold text-foreground shrink-0">
                                {formatCurrency(subtotal)}
                              </span>
                            </div>
                          )
                        })
                      ) : produtoAtual.custo_aquisicao_unitario ? (
                        /* Caso 3: Revenda com aquisição unitária */
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Aquisição Unitária</span>
                          <span className="font-mono font-semibold text-foreground">
                            {formatCurrency(produtoAtual.custo_aquisicao_unitario)}
                          </span>
                        </div>
                      ) : (
                        /* Caso 4: Vazio */
                        <div className="text-[11px] text-muted-foreground italic py-1">
                          Nenhum componente cadastrado.
                        </div>
                      )}

                      {/* Embalagem e etiqueta adicionais se existirem */}
                      {((produtoAtual.custo_adicional_embalagem || 0) > 0 ||
                        (produtoAtual.custo_etiqueta || 0) > 0) && (
                        <div className="pt-1 border-t border-border/40 space-y-1">
                          {(produtoAtual.custo_adicional_embalagem || 0) > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Embalagem</span>
                              <span className="font-mono">
                                {formatCurrency(produtoAtual.custo_adicional_embalagem || 0)}
                              </span>
                            </div>
                          )}
                          {(produtoAtual.custo_etiqueta || 0) > 0 && (
                            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                              <span>Etiqueta</span>
                              <span className="font-mono">
                                {formatCurrency(produtoAtual.custo_etiqueta || 0)}
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Métricas Físicas do Produto */}
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white rounded-lg border border-border/70 p-2">
                      <span className="text-[10px] text-muted-foreground block">Peso Total</span>
                      <span className="font-mono font-bold text-foreground">
                        {produtoAtual.peso_g ? `${produtoAtual.peso_g} g` : '—'}
                      </span>
                    </div>
                    <div className="bg-white rounded-lg border border-border/70 p-2">
                      <span className="text-[10px] text-muted-foreground block">
                        Dimensões (CxLxA)
                      </span>
                      <span className="font-mono text-[11px] font-semibold text-foreground truncate block">
                        {produtoAtual.dimensao_comprimento_cm || 0}x
                        {produtoAtual.dimensao_largura_cm || 0}x
                        {produtoAtual.dimensao_altura_cm || 0} cm
                      </span>
                    </div>
                  </div>

                  {/* Aviso no painel do produto se não houver categoria cadastrada */}
                  {!produtoAtual.categoria && (
                    <div className="rounded-lg border border-[#DF5830]/30 bg-[#DF5830]/5 p-2 flex items-start gap-1.5 text-[11px] text-foreground">
                      <AlertTriangle className="h-3.5 w-3.5 text-[#DF5830] shrink-0 mt-0.5" />
                      <div className="leading-tight space-y-0.5">
                        <span className="font-semibold text-[#DF5830] block text-[10.5px]">
                          Produto sem categoria
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">
                          Regras de canais com condição de categoria (ex.: SHEIN Cama, Mesa e Banho)
                          não serão aplicadas.
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Destaque do Custo Total Base */}
                <div className="mt-4 pt-3 border-t border-border/80">
                  <div className="bg-primary/5 rounded-xl border border-primary/20 p-3">
                    <span className="text-[10px] font-bold text-primary uppercase tracking-wider block">
                      Custo Total Base
                    </span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="text-xl font-black font-mono text-primary">
                        {formatCurrency(custoBaseAtual?.custo_total || 0)}
                      </span>
                      <Badge
                        variant="outline"
                        className="text-[10px] bg-white border-primary/30 text-primary"
                      >
                        Fixo p/ Canais
                      </Badge>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 leading-snug">
                      Base para cálculo de markup e ponto de equilíbrio em todos os canais.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 2. Colunas de Canais e Modalidades Reordenáveis via DND + Cenários Salvos Extras */}
            {todasColunasComSalvos.length === 0 ? (
              <div className="p-12 text-center text-xs text-muted-foreground flex-1 flex flex-col items-center justify-center gap-2">
                <Store className="h-8 w-8 text-muted-foreground/40 mb-1" />
                <p className="font-bold text-sm text-foreground">
                  Nenhum marketplace ou modalidade selecionada
                </p>
                <p className="text-muted-foreground max-w-sm">
                  Utilize o filtro &ldquo;Marketplaces&rdquo; ou &ldquo;Colunas&rdquo; no topo para
                  selecionar canais para comparar.
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-2 text-xs"
                  onClick={() => setCanaisSelecionados(canais.map((c) => c.id))}
                >
                  Exibir todos os marketplaces
                </Button>
              </div>
            ) : produtoAtual &&
              (produtoAtual.tipo === 'kit' || produtoAtual.tipo === 'combo') &&
              loadingKitInfo ? (
              <div className="p-16 text-center text-xs text-muted-foreground flex-1 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-8 w-8 text-primary animate-spin" />
                <p className="font-bold text-sm text-foreground">
                  Carregando composição do {produtoAtual.tipo}...
                </p>
                <p className="text-muted-foreground max-w-md">
                  Buscando componentes e calculando o custo base consolidado para a simulação de
                  canais.
                </p>
              </div>
            ) : produtoAtual &&
              (produtoAtual.tipo === 'kit' || produtoAtual.tipo === 'combo') &&
              !loadingKitInfo &&
              (!kitInfoAtual?.itens || kitInfoAtual.itens.length === 0) ? (
              <div className="p-12 text-center text-xs text-muted-foreground flex-1 flex flex-col items-center justify-center gap-3">
                <div className="h-12 w-12 rounded-full bg-amber-100 flex items-center justify-center text-amber-700">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <p className="font-bold text-sm text-amber-900">
                  {produtoAtual.tipo === 'kit' ? 'Kit' : 'Combo'} sem componentes cadastrados
                </p>
                <p className="text-amber-800 max-w-md bg-amber-50 border border-amber-200 p-3 rounded-lg leading-relaxed">
                  Cadastre os componentes para obter o custo base real. A simulação de margens e
                  rentabilidade por canal depende do custo da composição.
                </p>
              </div>
            ) : (
              todasColunasComSalvos
                .filter((col) => col.isSalvoExtra || colunasAtivas[col.modalidade.id] !== false)
                .map((col) => {
                  const colKey = col.colKey
                  const modId = col.modalidade.id
                  const cenario = demonstrativosPorColuna[colKey]
                  if (!cenario) return null

                  const dem = cenario.demonstrativo
                  const isMelhor = melhorCenario === colKey
                  const lucroNegativo = dem.lucro_liquido < 0
                  const descConf = descontosPorColuna[colKey] || { pctCliente: 0, descPixPct: 0 }
                  const precoColuna =
                    precosPorColuna[colKey] ??
                    (modoCalculo === 'manual' || col.isSalvoExtra
                      ? col.precoSalvoFixo || valorPrecoGlobal
                      : cenario.precoAnunciado)

                  const isDraggingThis = draggedModId === modId && !col.isSalvoExtra
                  const isDragOverThis = dragOverModId === modId && !col.isSalvoExtra

                  return (
                    <div
                      key={colKey}
                      draggable={!col.isSalvoExtra}
                      onDragStart={(e) => !col.isSalvoExtra && handleDragStart(e, modId)}
                      onDragOver={(e) => !col.isSalvoExtra && handleDragOver(e, modId)}
                      onDragLeave={(e) => !col.isSalvoExtra && handleDragLeave(e, modId)}
                      onDrop={(e) => !col.isSalvoExtra && handleDrop(e, modId)}
                      className={`w-80 shrink-0 flex flex-col justify-between p-4 bg-white transition-all relative ${
                        col.isSalvoExtra
                          ? 'border-2 border-dashed border-amber-300 bg-amber-50/15'
                          : isMelhor
                            ? 'bg-emerald-50/20 ring-1 ring-emerald-500/30'
                            : ''
                      } ${isDraggingThis ? 'opacity-40 scale-[0.98]' : 'opacity-100'} ${
                        isDragOverThis
                          ? 'border-l-4 border-l-primary ring-2 ring-primary/20 bg-primary/[0.02]'
                          : ''
                      }`}
                    >
                      {/* Selo no topo direito: "Salvo" para card extra com botão de fechar, ou "Melhor Margem" */}
                      {col.isSalvoExtra ? (
                        <div className="absolute top-2 right-2 flex items-center gap-1.5">
                          <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[10px] h-5 px-2 font-bold shadow-xs">
                            <Bookmark className="h-3 w-3 mr-1 text-amber-600" />
                            Salvo (Rascunho)
                          </Badge>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground hover:text-red-600 hover:bg-red-50 rounded-full"
                            title="Remover este cenário salvo da grade"
                            onClick={() =>
                              col.cenarioSalvoRecord &&
                              handleRemoverCenarioSalvo(col.cenarioSalvoRecord.id)
                            }
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ) : (
                        <div className="absolute top-2 right-2 flex items-center gap-1">
                          {isMelhor && (
                            <Badge className="bg-emerald-600 text-white text-[10px] h-5 px-2 font-bold shadow-xs">
                              <Sparkles className="h-3 w-3 mr-1" />
                              Melhor
                            </Badge>
                          )}
                          {/* Badge indicando se é o card Aprovado ou Base */}
                          {precosPorColuna[modId] ? (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 px-1.5 font-semibold text-emerald-800 bg-emerald-50 border-emerald-300"
                              title="Preço e premissas carregados da última precificação aprovada"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5 mr-0.5 text-emerald-600" />
                              Aprovado
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 px-1.5 font-normal text-muted-foreground bg-secondary/30"
                              title="Sem precificação aprovada gravada para este canal"
                            >
                              Padrão
                            </Badge>
                          )}
                        </div>
                      )}

                      <div className="space-y-4">
                        {/* Header do Canal / Modalidade */}
                        <div className="space-y-1.5 pr-24">
                          <div className="flex items-center gap-1.5">
                            {!col.isSalvoExtra ? (
                              <div
                                className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-foreground -ml-1 p-0.5 rounded"
                                title="Arraste para reordenar esta coluna"
                              >
                                <GripVertical className="h-4 w-4" />
                              </div>
                            ) : (
                              <Bookmark className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                            )}
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
                              onMouseDown={(e) => e.stopPropagation()}
                              onClick={(e) => {
                                e.stopPropagation()
                                if (col.isSalvoExtra) {
                                  if (col.cenarioSalvoRecord) {
                                    handleRemoverCenarioSalvo(col.cenarioSalvoRecord.id)
                                  }
                                } else {
                                  setColunasAtivas((prev) => ({
                                    ...prev,
                                    [modId]: false,
                                  }))
                                }
                              }}
                              title={`Ocultar coluna ${col.canal.nome} - ${col.modalidade.nome}`}
                              aria-label={`Ocultar coluna ${col.canal.nome} - ${col.modalidade.nome}`}
                            >
                              <EyeOff className="h-3.5 w-3.5" />
                            </Button>
                            <span
                              className="h-2.5 w-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: col.canal.cor || '#DF5830' }}
                            />
                            <h4 className="text-sm font-black text-foreground truncate">
                              {col.canal.nome}
                            </h4>
                            {col.canal.expand?.marketplace && (
                              <Badge
                                variant="secondary"
                                className="text-[9px] h-4 px-1 py-0 bg-primary/10 text-primary border border-primary/20 shrink-0 font-normal"
                                title={`Marketplace vinculado: ${col.canal.expand.marketplace.nome}`}
                              >
                                🔗 {col.canal.expand.marketplace.nome}
                              </Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 ml-4 flex-wrap">
                            <Badge
                              variant="outline"
                              className="text-[10px] h-5 px-2 font-bold text-foreground border-border bg-secondary/30"
                              style={{
                                borderLeftColor: col.canal.cor || '#DF5830',
                                borderLeftWidth: 3,
                              }}
                            >
                              {col.modalidade.nome}
                            </Badge>
                            {col.modalidade.prazo_recebimento_dias !== undefined && (
                              <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                                <Clock className="h-2.5 w-2.5" />
                                {col.modalidade.prazo_recebimento_dias}d
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bloco de Preço de Venda / Anunciado */}
                        <div className="bg-secondary/30 rounded-xl p-2.5 border border-border/80 space-y-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <Label className="text-[11px] font-bold uppercase text-muted-foreground">
                              Preço Anunciado
                            </Label>
                            {col.isSalvoExtra ? (
                              <span className="text-[10px] text-amber-700 font-semibold">
                                Salvo em{' '}
                                {col.cenarioSalvoRecord?.created
                                  ? new Date(col.cenarioSalvoRecord.created).toLocaleDateString(
                                      'pt-BR',
                                    )
                                  : ''}
                              </span>
                            ) : modoCalculo !== 'manual' ? (
                              <span className="text-[10px] text-muted-foreground">
                                {modoCalculo === 'mesmo_preco' ? 'Global' : 'Resolvido p/ meta'}
                              </span>
                            ) : null}
                          </div>

                          {modoCalculo === 'manual' || col.isSalvoExtra ? (
                            <div className="relative">
                              <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                                R$
                              </span>
                              <Input
                                type="number"
                                step="0.10"
                                className="h-9 pl-8 text-sm font-black font-mono bg-white"
                                value={precoColuna}
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setPrecosPorColuna((prev) => ({
                                    ...prev,
                                    [colKey]: val,
                                  }))
                                }}
                              />
                            </div>
                          ) : (
                            <div className="flex items-baseline justify-between pt-0.5">
                              <span className="text-xl font-black font-mono text-foreground">
                                {formatCurrency(cenario.precoAnunciado)}
                              </span>
                              {(modoCalculo === 'meta_lucro' || modoCalculo === 'meta_margem') && (
                                <Badge
                                  variant="secondary"
                                  className="text-[9px] bg-primary/10 text-primary border-primary/20"
                                >
                                  {cenario.convergiuMeta ? 'Meta atingida' : 'Ajustado'}
                                </Badge>
                              )}
                            </div>
                          )}

                          {/* Aviso se a meta for inviável */}
                          {!col.isSalvoExtra &&
                            (modoCalculo === 'meta_lucro' || modoCalculo === 'meta_margem') &&
                            !cenario.convergiuMeta && (
                              <div className="rounded-md bg-amber-50 border border-amber-200 p-1.5 flex items-start gap-1.5 text-[10px] text-amber-800">
                                <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600 mt-0.5" />
                                <span>
                                  Meta inviável para este canal (taxas/tributos excedem margem).
                                  Preço limitado.
                                </span>
                              </div>
                            )}

                          {/* Descontos Simulados na Coluna */}
                          <div className="pt-2 border-t border-border/60 grid grid-cols-2 gap-2 text-xs">
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-muted-foreground block">
                                Desc. Cliente %
                              </span>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                className="h-7 text-[11px] font-mono px-2 bg-white"
                                value={descConf.pctCliente || ''}
                                placeholder="0%"
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setDescontosPorColuna((prev) => ({
                                    ...prev,
                                    [colKey]: {
                                      pctCliente: val,
                                      descPixPct: prev[colKey]?.descPixPct || 0,
                                    },
                                  }))
                                }}
                              />
                            </div>
                            <div className="space-y-0.5">
                              <span className="text-[10px] text-muted-foreground block">
                                Desc. Pix %
                              </span>
                              <Input
                                type="number"
                                step="1"
                                min="0"
                                max="100"
                                className="h-7 text-[11px] font-mono px-2 bg-white"
                                value={descConf.descPixPct || ''}
                                placeholder="0%"
                                onChange={(e) => {
                                  const val = parseFloat(e.target.value) || 0
                                  setDescontosPorColuna((prev) => ({
                                    ...prev,
                                    [colKey]: {
                                      pctCliente: prev[colKey]?.pctCliente || 0,
                                      descPixPct: val,
                                    },
                                  }))
                                }}
                              />
                            </div>
                          </div>
                        </div>

                        {/* Demonstrativo Detalhado de Taxas */}
                        {(() => {
                          const taxasAplicadas = (dem.linhas_taxas || []).filter(
                            (tx) => tx.aplicada,
                          )
                          const taxasDesconsideradas = (dem.linhas_taxas || []).filter(
                            (tx) => !tx.aplicada,
                          )
                          const temTaxasCadastradas = (dem.linhas_taxas?.length || 0) > 0

                          return (
                            <div className="space-y-1.5 text-xs">
                              <div className="flex items-center justify-between text-[11px]">
                                <span className="font-bold text-muted-foreground uppercase text-[10px]">
                                  Taxas do Canal ({taxasAplicadas.length})
                                </span>
                                <span className="font-mono font-bold text-red-600">
                                  -{formatCurrency(dem.total_taxas_retidas_canal)}
                                </span>
                              </div>

                              <div className="bg-secondary/20 rounded-lg p-2 space-y-1 text-[11px] max-h-36 overflow-y-auto border border-border/50">
                                {!temTaxasCadastradas ? (
                                  <div className="text-[10px] text-muted-foreground italic py-1">
                                    Nenhuma taxa cadastrada neste canal.
                                  </div>
                                ) : taxasAplicadas.length === 0 ? (
                                  <div className="text-[10px] text-muted-foreground italic py-1">
                                    Nenhuma taxa aplicável ao preço/peso atual.
                                  </div>
                                ) : (
                                  taxasAplicadas.map((tx, idx) => (
                                    <div
                                      key={tx.taxa_id || idx}
                                      className="flex items-center justify-between gap-1 leading-tight text-foreground"
                                      title={tx.condicao_resumo || tx.nome}
                                    >
                                      <span className="truncate flex-1">
                                        {tx.nome}
                                        {tx.tipo_valor === 'percentual' && (
                                          <span className="text-[9px] text-muted-foreground ml-1 font-mono">
                                            ({tx.aliquota_ou_fixo}%)
                                          </span>
                                        )}
                                      </span>
                                      <span className="font-mono shrink-0">
                                        -{formatCurrency(tx.valor_calculado)}
                                      </span>
                                    </div>
                                  ))
                                )}
                              </div>

                              {/* Accordion discreto para mostrar / ocultar taxas não aplicadas por condição não atendida */}
                              <AccordionTaxasNaoAplicadas taxas={taxasDesconsideradas} />
                            </div>
                          )
                        })()}

                        {/* Linhas de Fechamento da Venda */}
                        <div className="space-y-1 text-xs border-t border-border/60 pt-2">
                          <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                            <span className="inline-flex items-center gap-1">
                              <span>Preço pago cliente</span>
                              {totalUnidadesProdutoAtual > 1 && (
                                <span className="text-[10px] text-muted-foreground/80 font-normal">
                                  ({totalUnidadesProdutoAtual} un)
                                </span>
                              )}
                            </span>
                            <span className="font-mono font-medium text-foreground">
                              {formatCurrency(dem.preco_pago_cliente)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] bg-slate-50/80 -mx-1 px-1 py-0.5 rounded border border-slate-200/50">
                            <span className="text-muted-foreground font-medium flex items-center gap-1">
                              <span>Preço Unit. Cliente</span>
                              {totalUnidadesProdutoAtual > 1 && (
                                <span className="text-[9px] text-muted-foreground font-mono">
                                  (÷{totalUnidadesProdutoAtual})
                                </span>
                              )}
                            </span>
                            <span className="font-mono font-bold text-slate-800">
                              {formatCurrency(
                                calcularPrecoUnitarioCliente(
                                  dem.preco_pago_cliente,
                                  totalUnidadesProdutoAtual,
                                ),
                              )}
                            </span>
                          </div>
                          <div className="flex items-center justify-between font-semibold text-[11px] text-blue-900">
                            <span>A receber do canal</span>
                            <span className="font-mono font-bold">
                              {formatCurrency(dem.valor_receber_canal)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted-foreground/50 hover:text-foreground transition-colors">
                                  <span>Tributos (DAS + ICMS)</span>
                                  <HelpCircle className="h-3 w-3 text-muted-foreground/70" />
                                </span>
                              </TooltipTrigger>
                              <TooltipContent
                                side="top"
                                className="p-3 text-xs max-w-xs space-y-2 bg-slate-900 text-slate-100 border-slate-800 shadow-xl"
                              >
                                <div className="flex items-center justify-between border-b border-slate-800 pb-1.5 font-bold">
                                  <span>Detalhamento dos Tributos</span>
                                  <Badge
                                    variant="outline"
                                    className={`text-[9px] h-4 px-1.5 font-bold ${
                                      dem.usando_global_fallback
                                        ? 'bg-slate-800 text-slate-300 border-slate-700'
                                        : 'bg-emerald-950 text-emerald-300 border-emerald-800'
                                    }`}
                                  >
                                    Fonte:{' '}
                                    {dem.fonte_tributos ||
                                      (dem.usando_global_fallback
                                        ? 'Global'
                                        : `${col.modalidade.nome} — ${col.canal.nome}`)}
                                  </Badge>
                                </div>

                                <div className="space-y-1 text-[11px]">
                                  <div className="flex justify-between text-slate-300">
                                    <span>Base de cálculo (NF):</span>
                                    <span className="font-mono font-semibold text-white">
                                      {formatCurrency(dem.base_calculo_tributos)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-300">
                                    <span>Alíquota efetiva total:</span>
                                    <span className="font-mono font-semibold text-white">
                                      {dem.aliquota_imposto_efetiva_pct.toFixed(2)}%
                                    </span>
                                  </div>
                                </div>

                                <div className="space-y-1 text-[11px] border-t border-slate-800/80 pt-1.5">
                                  <div className="flex justify-between text-slate-400">
                                    <span>DAS ({dem.aliquota_das_pct ?? aliquotaDas}%):</span>
                                    <span className="font-mono text-slate-200">
                                      {formatCurrency(dem.imposto_das)}
                                    </span>
                                  </div>
                                  <div className="flex justify-between text-slate-400">
                                    <span>ICMS ({dem.aliquota_icms_pct ?? aliquotaIcms}%):</span>
                                    <span className="font-mono text-slate-200">
                                      {formatCurrency(dem.imposto_icms)}
                                    </span>
                                  </div>
                                  {dem.outros_impostos > 0 && (
                                    <div className="flex justify-between text-slate-400">
                                      <span>Outros impostos:</span>
                                      <span className="font-mono text-slate-200">
                                        {formatCurrency(dem.outros_impostos)}
                                      </span>
                                    </div>
                                  )}
                                  {dem.rateio_fixo_imposto_mes > 0 && (
                                    <div className="flex justify-between text-amber-300 pt-0.5 border-t border-slate-800/60">
                                      <span
                                        title={`R$ ${(dem.das_imposto_total_mes ?? dasImpostoMes).toFixed(2)} / ${dem.pedidos_estimados_mes ?? pedidosMes} pedidos`}
                                      >
                                        Rateio imposto fixo mensal:
                                      </span>
                                      <span className="font-mono font-semibold">
                                        +{formatCurrency(dem.rateio_fixo_imposto_mes)}
                                      </span>
                                    </div>
                                  )}
                                </div>

                                {dem.usando_global_fallback && (
                                  <div className="p-1.5 rounded bg-amber-950/60 border border-amber-800/70 text-[10px] text-amber-300 leading-tight">
                                    Modalidade sem régua de tributos — usando global
                                  </div>
                                )}

                                <div className="flex justify-between border-t border-slate-800 pt-1.5 font-bold text-slate-100">
                                  <span>Total de tributos (venda):</span>
                                  <span className="font-mono text-white">
                                    {formatCurrency(dem.total_tributos)}
                                  </span>
                                </div>
                              </TooltipContent>
                            </Tooltip>
                            <span className="font-mono">-{formatCurrency(dem.total_tributos)}</span>
                          </div>
                          <div className="flex items-center justify-between text-muted-foreground text-[11px]">
                            <span>Custo do produto</span>
                            <span className="font-mono">
                              -{formatCurrency(dem.custo_total_produto)}
                            </span>
                          </div>
                        </div>

                        {/* Destaque do Lucro Líquido e Margem */}
                        <div
                          className={`rounded-xl p-3 border ${
                            lucroNegativo
                              ? 'bg-red-50/80 border-red-200 text-red-900'
                              : 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
                            <span>Lucro Líquido</span>
                            <span
                              className={`text-xs px-1.5 py-0.5 rounded-md font-bold ${
                                lucroNegativo
                                  ? 'bg-red-200 text-red-900'
                                  : 'bg-emerald-200 text-emerald-900'
                              }`}
                            >
                              {dem.margem_liquida_pct.toFixed(1)}% margem
                            </span>
                          </div>
                          <div className="mt-1 flex items-baseline justify-between">
                            <span
                              className={`text-2xl font-black font-mono ${
                                lucroNegativo ? 'text-red-600' : 'text-emerald-700'
                              }`}
                            >
                              {formatCurrency(dem.lucro_liquido)}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-mono">
                              Markup: {dem.markup_sobre_custo_pct.toFixed(0)}%
                            </span>
                          </div>
                        </div>

                        {/* Metas e Pontos de Referência */}
                        <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                          <div className="bg-secondary/40 rounded-lg p-2 border border-border/60">
                            <span className="text-[10px] text-muted-foreground block truncate">
                              Pto. Equilíbrio
                            </span>
                            <span className="font-mono font-bold text-foreground text-xs">
                              {formatCurrency(cenario.precoSugeridoEquilibrio)}
                            </span>
                          </div>
                          <div className="bg-secondary/40 rounded-lg p-2 border border-border/60">
                            <span className="text-[10px] text-muted-foreground block truncate">
                              Preço Meta
                            </span>
                            <span className="font-mono font-bold text-primary text-xs">
                              {formatCurrency(cenario.precoSugeridoMeta)}
                            </span>
                          </div>
                        </div>

                        {/* Status de Auditoria e Inconsistências */}
                        <div className="space-y-1">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Status da precificação:</span>
                            {dem.incompleto ? (
                              <Badge
                                variant="outline"
                                className="text-amber-600 border-amber-300 text-[10px] bg-amber-50"
                              >
                                Pendente
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-emerald-600 border-emerald-300 text-[10px] bg-emerald-50"
                              >
                                Auditado
                              </Badge>
                            )}
                          </div>

                          {/* Avisos do demonstrativo se existirem */}
                          {(dem.avisos?.length || 0) > 0 && (
                            <div className="text-[10px] text-amber-700 bg-amber-50/70 p-1.5 rounded border border-amber-200">
                              {dem.avisos?.join(' · ')}
                            </div>
                          )}
                          {(dem.motivos_invalido?.length || 0) > 0 && (
                            <div className="text-[10px] text-red-700 bg-red-50/70 p-1.5 rounded border border-red-200">
                              {dem.motivos_invalido?.join(' · ')}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Botões de Ação do Card */}
                      <div className="pt-4 mt-4 border-t border-border flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs flex-1"
                          disabled={salvando}
                          onClick={() => handleSalvarCenario(colKey, false)}
                        >
                          <Save className="h-3 w-3 mr-1" />
                          Salvar
                        </Button>
                        <Button
                          size="sm"
                          className="h-8 text-xs flex-1 bg-primary text-white font-bold"
                          disabled={salvando}
                          onClick={() => handleSalvarCenario(colKey, true)}
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Aprovar
                        </Button>
                      </div>
                    </div>
                  )
                })
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          TABELA COMPARATIVA CONSOLIDADA (ABAIXO DAS COLUNAS)
          ======================================================== */}
      <Card className="shadow-xs border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
          <div>
            <CardTitle className="text-base font-bold">
              Tabela Comparativa Geral por Canal & Modalidade
            </CardTitle>
            <CardDescription>
              Comparativo direto de lucro, margem e preço de equilíbrio para o SKU{' '}
              {produtoAtual?.sku}
            </CardDescription>
          </div>

          {/* Seletor de Comparação entre 2 canais (Diff R$ e p.p.) */}
          {colunasModalidade.length >= 2 && (
            <div className="flex items-center gap-2 text-xs bg-secondary/50 p-1.5 rounded-lg border border-border">
              <span className="font-semibold text-muted-foreground">Comparar:</span>
              <Select value={colunaDiffA} onValueChange={setColunaDiffA}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colunasModalidade.map((c) => (
                    <SelectItem key={c.modalidade.id} value={c.modalidade.id}>
                      {c.canal.nome} - {c.modalidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="font-bold">vs</span>
              <Select value={colunaDiffB} onValueChange={setColunaDiffB}>
                <SelectTrigger className="h-7 text-xs w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {colunasModalidade.map((c) => (
                    <SelectItem key={c.modalidade.id} value={c.modalidade.id}>
                      {c.canal.nome} - {c.modalidade.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </CardHeader>

        {/* Destaque da Diferença entre Canal A e Canal B */}
        {calculoDiff && (
          <div className="mx-6 mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <span className="font-bold text-foreground">
                Diferença ({calculoDiff.a.canal.nome} vs {calculoDiff.b.canal.nome}):
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground mr-1.5">Spread de Lucro:</span>
                <span
                  className={`font-black font-mono ${
                    calculoDiff.lucroDiff >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {calculoDiff.lucroDiff >= 0 ? '+' : ''}
                  {formatCurrency(calculoDiff.lucroDiff)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground mr-1.5">Spread de Margem:</span>
                <span
                  className={`font-black ${
                    calculoDiff.margemDiff >= 0 ? 'text-emerald-600' : 'text-red-600'
                  }`}
                >
                  {calculoDiff.margemDiff >= 0 ? '+' : ''}
                  {calculoDiff.margemDiff.toFixed(2)} p.p.
                </span>
              </div>
            </div>
          </div>
        )}

        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-y border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                <th className="py-2.5 px-4 font-bold">Canal / Modalidade</th>
                <th className="py-2.5 px-3 font-bold text-right">Preço Anunc.</th>
                <th className="py-2.5 px-3 font-bold text-right">Preço Cliente</th>
                <th
                  className="py-2.5 px-3 font-bold text-right"
                  title="Preço pago pelo cliente dividido pelo total de unidades"
                >
                  Preço Unit. Cliente
                </th>
                <th className="py-2.5 px-3 font-bold text-right">Taxas Retidas</th>
                <th className="py-2.5 px-3 font-bold text-right">A Receber</th>
                <th className="py-2.5 px-3 font-bold text-right">Custo Total</th>
                <th className="py-2.5 px-3 font-bold text-right">Tributos</th>
                <th className="py-2.5 px-3 font-bold text-right">Lucro R$</th>
                <th className="py-2.5 px-3 font-bold text-right">Margem %</th>
                <th className="py-2.5 px-3 font-bold text-right">Pto. Equilíbrio</th>
                <th className="py-2.5 px-3 font-bold text-center">Prazo</th>
                <th className="py-2.5 px-4 font-bold text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {todasColunasComSalvos
                .filter((col) => col.isSalvoExtra || colunasAtivas[col.modalidade.id] !== false)
                .map((col) => {
                  const colKey = col.colKey
                  const cenario = demonstrativosPorColuna[colKey]
                  if (!cenario) return null

                  const dem = cenario.demonstrativo
                  const isMelhor = melhorCenario === colKey
                  const lucroNegativo = dem.lucro_liquido < 0

                  return (
                    <tr
                      key={colKey}
                      className={`hover:bg-secondary/20 transition-colors ${
                        col.isSalvoExtra
                          ? 'bg-amber-50/30'
                          : isMelhor
                            ? 'bg-emerald-50/40 font-semibold'
                            : ''
                      }`}
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-foreground">{col.canal.nome}</span>
                          <span className="text-muted-foreground">({col.modalidade.nome})</span>
                          {col.isSalvoExtra ? (
                            <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] h-4 px-1.5">
                              Salvo
                            </Badge>
                          ) : (
                            isMelhor && (
                              <Badge className="bg-emerald-600 text-white text-[9px] h-4 px-1.5">
                                Melhor
                              </Badge>
                            )
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold">
                        {formatCurrency(dem.preco_anunciado)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(dem.preco_pago_cliente)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-medium text-slate-800 bg-slate-50/50">
                        {formatCurrency(
                          calcularPrecoUnitarioCliente(
                            dem.preco_pago_cliente,
                            totalUnidadesProdutoAtual,
                          ),
                        )}
                        {totalUnidadesProdutoAtual > 1 && (
                          <span className="text-[9px] text-muted-foreground block font-sans">
                            (÷{totalUnidadesProdutoAtual} un)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-red-600">
                        -{formatCurrency(dem.total_taxas_retidas_canal)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono font-bold text-blue-900">
                        {formatCurrency(dem.valor_receber_canal)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(dem.custo_total_produto)}
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(dem.total_tributos)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-mono font-black ${
                          lucroNegativo ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(dem.lucro_liquido)}
                      </td>
                      <td
                        className={`py-3 px-3 text-right font-bold ${
                          lucroNegativo ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {dem.margem_liquida_pct.toFixed(1)}%
                      </td>
                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(cenario.precoSugeridoEquilibrio)}
                      </td>
                      <td className="py-3 px-3 text-center text-muted-foreground">
                        {col.modalidade.prazo_recebimento_dias || 0}d
                      </td>
                      <td className="py-3 px-4 text-center">
                        {dem.incompleto ? (
                          <Badge
                            variant="outline"
                            className="text-amber-600 border-amber-300 text-[10px]"
                          >
                            Pendente
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="text-emerald-600 border-emerald-300 text-[10px]"
                          >
                            Auditado
                          </Badge>
                        )}
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* ========================================================
          MODAL: REPOSITÓRIO DE CENÁRIOS SALVOS (RASCUNHOS)
          ======================================================== */}
      <Dialog open={repositorioOpen} onOpenChange={setRepositorioOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 text-primary">
              <Bookmark className="h-5 w-5" />
              <DialogTitle className="text-base font-bold">
                Repositório de Cenários Salvos
              </DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Rascunhos salvos para o produto{' '}
              <span className="font-semibold text-foreground">
                {produtoAtual ? `[${produtoAtual.sku}] ${produtoAtual.nome}` : ''}
              </span>
              . Escolha quais deseja adicionar à grade como colunas extras para comparar lado a lado
              com os preços aprovados.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
            {rascunhosDoProduto.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl bg-secondary/10 space-y-2">
                <Bookmark className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-xs font-semibold text-foreground">
                  Nenhum rascunho salvo para este produto
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  Ao simular um preço no comparador e clicar em &ldquo;Salvar&rdquo;, o cenário fica
                  guardado aqui no repositório.
                </p>
              </div>
            ) : (
              rascunhosDoProduto.map((cenario) => {
                const canal = canais.find((c) => c.id === cenario.canal)
                const modalidade = modalidades.find((m) => m.id === cenario.modalidade)
                const jaAdicionado = cenariosSalvosAdicionados.some((s) => s.id === cenario.id)
                const precoSalvo = cenario.preco_aprovado || cenario.premissas?.preco_venda || 0
                const resultado = cenario.resultado as Record<string, unknown> | undefined
                const lucroLiquido = (resultado?.lucro_liquido as number) || 0
                const margemPct = (resultado?.margem_liquida_pct as number) || 0

                return (
                  <div
                    key={cenario.id}
                    className={`p-3 rounded-xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      jaAdicionado
                        ? 'bg-amber-50/40 border-amber-300'
                        : 'bg-white border-border hover:border-border/80 hover:shadow-xs'
                    }`}
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: canal?.cor || '#DF5830' }}
                        />
                        <span className="font-bold text-xs text-foreground truncate">
                          {canal?.nome || 'Canal'}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 font-semibold text-muted-foreground bg-secondary/20"
                        >
                          {modalidade?.nome || 'Modalidade'}
                        </Badge>
                        <Badge className="bg-amber-100 text-amber-900 border border-amber-300 text-[9px] h-4 px-1.5 font-bold">
                          Salvo (v{cenario.versao || 1})
                        </Badge>
                        {jaAdicionado && (
                          <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] h-4 px-1.5 font-semibold">
                            Na Grade
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-0.5">
                        <div>
                          <span>Preço: </span>
                          <span className="font-mono font-bold text-foreground">
                            {formatCurrency(precoSalvo)}
                          </span>
                        </div>
                        {lucroLiquido !== 0 && (
                          <div>
                            <span>Lucro Est.: </span>
                            <span
                              className={`font-mono font-bold ${
                                lucroLiquido > 0 ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(lucroLiquido)}
                            </span>
                          </div>
                        )}
                        {margemPct !== 0 && (
                          <div>
                            <span>Margem: </span>
                            <span
                              className={`font-mono font-bold ${
                                margemPct > 0 ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {margemPct.toFixed(1)}%
                            </span>
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <History className="h-3 w-3" />
                          <span>
                            Salvo em{' '}
                            {cenario.created
                              ? new Date(cenario.created).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              : 'Recente'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {jaAdicionado ? (
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs text-amber-700 border-amber-200 hover:bg-amber-50"
                          onClick={() => handleRemoverCenarioSalvo(cenario.id)}
                          title="Remover visualização deste cenário da grade"
                        >
                          <X className="h-3.5 w-3.5 mr-1" />
                          Tirar da Grade
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          className="h-8 text-xs bg-primary text-white font-bold hover:bg-primary/90"
                          onClick={() => handleAdicionarCenarioSalvo(cenario)}
                        >
                          <Plus className="h-3.5 w-3.5 mr-1" />
                          Adicionar à Grade
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setCenarioParaExcluirModal(cenario)}
                        title="Remover cenário salvo permanentemente"
                        aria-label="Remover cenário salvo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="border-t border-border pt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {cenariosSalvosAdicionados.length} cenário(s) salvo(s) adicionado(s) à grade
            </span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setRepositorioOpen(false)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================================
          MODAL: CENÁRIOS APROVADOS DO PRODUTO
          ======================================================== */}
      <Dialog open={aprovadosOpen} onOpenChange={setAprovadosOpen}>
        <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <div className="flex items-center gap-2 text-emerald-600">
              <CheckCircle2 className="h-5 w-5" />
              <DialogTitle className="text-base font-bold">Cenários e Preços Aprovados</DialogTitle>
            </div>
            <DialogDescription className="text-xs text-muted-foreground">
              Modalidades e canais com preço aprovado para o produto{' '}
              <span className="font-semibold text-foreground">
                {produtoAtual ? `[${produtoAtual.sku}] ${produtoAtual.nome}` : ''}
              </span>
              . Estes preços alimentam o registro de vendas diárias nos marketplaces.
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto space-y-3 py-2 pr-1">
            {aprovadosDoProduto.length === 0 ? (
              <div className="text-center py-10 border border-dashed rounded-xl bg-secondary/10 space-y-2">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground/30 mx-auto" />
                <p className="text-xs font-semibold text-foreground">
                  Nenhum preço aprovado para este produto
                </p>
                <p className="text-[11px] text-muted-foreground max-w-sm mx-auto">
                  Simule um preço no comparador e clique em &ldquo;Aprovar Preço&rdquo; no canal
                  desejado para oficializar o valor de venda.
                </p>
              </div>
            ) : (
              aprovadosDoProduto.map((cenario) => {
                const canal = canais.find((c) => c.id === cenario.canal)
                const modalidade = modalidades.find((m) => m.id === cenario.modalidade)
                const precoAprovado = cenario.preco_aprovado || cenario.premissas?.preco_venda || 0
                const resultado = cenario.resultado as Record<string, unknown> | undefined
                const lucroLiquido = (resultado?.lucro_liquido as number) || 0
                const margemPct = (resultado?.margem_liquida_pct as number) || 0

                return (
                  <div
                    key={cenario.id}
                    className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/20 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs"
                  >
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: canal?.cor || '#10B981' }}
                        />
                        <span className="font-bold text-xs text-foreground truncate">
                          {canal?.nome || 'Canal'}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[10px] h-5 px-1.5 font-semibold text-muted-foreground bg-white"
                        >
                          {modalidade?.nome || 'Modalidade Padrão'}
                        </Badge>
                        <Badge className="bg-emerald-100 text-emerald-800 border border-emerald-300 text-[9px] h-4 px-1.5 font-bold">
                          Aprovado (v{cenario.versao || 1})
                        </Badge>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground flex-wrap pt-0.5">
                        <div>
                          <span>Preço Aprovado: </span>
                          <span className="font-mono font-bold text-emerald-700 text-sm">
                            {formatCurrency(precoAprovado)}
                          </span>
                        </div>
                        {lucroLiquido !== 0 && (
                          <div>
                            <span>Lucro Líq.: </span>
                            <span
                              className={`font-mono font-bold ${
                                lucroLiquido > 0 ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {formatCurrency(lucroLiquido)}
                            </span>
                          </div>
                        )}
                        {margemPct !== 0 && (
                          <div>
                            <span>Margem: </span>
                            <span
                              className={`font-mono font-bold ${
                                margemPct > 0 ? 'text-emerald-600' : 'text-red-600'
                              }`}
                            >
                              {margemPct.toFixed(1)}%
                            </span>
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                          <History className="h-3 w-3" />
                          <span>
                            Aprovado em{' '}
                            {cenario.aprovado_em || cenario.updated || cenario.created
                              ? new Date(
                                  cenario.aprovado_em || cenario.updated || cenario.created || '',
                                ).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                })
                              : 'Recente'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs font-semibold border-primary/40 text-primary hover:bg-primary/5"
                        onClick={() => {
                          setAprovadosOpen(false)
                          if (cenario.modalidade && precoAprovado > 0) {
                            setModoCalculo('manual')
                            setPrecosPorColuna((prev) => ({
                              ...prev,
                              [cenario.modalidade!]: precoAprovado,
                            }))
                            toast({
                              title: 'Preço carregado na grade',
                              description: `Preço aprovado de ${formatCurrency(precoAprovado)} aplicado na modalidade ${modalidade?.nome || ''}.`,
                            })
                          }
                        }}
                      >
                        Carregar na Grade
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-xs text-muted-foreground hover:text-amber-700 hover:bg-amber-100/60"
                        onClick={() => setCenarioParaRetirarAprovacao(cenario)}
                        title="Retirar aprovação deste cenário"
                      >
                        <RotateCcw className="h-3.5 w-3.5 mr-1" />
                        Retirar aprovação
                      </Button>
                    </div>
                  </div>
                )
              })
            )}
          </div>

          <div className="border-t border-border pt-3 flex items-center justify-between text-xs text-muted-foreground">
            <span>{aprovadosDoProduto.length} modalidade(s) com preço aprovado</span>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setAprovadosOpen(false)}
            >
              Fechar
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmação de Exclusão de Cenário Salvo no Modal do Repositório */}
      <AlertDialog
        open={!!cenarioParaExcluirModal}
        onOpenChange={(open) => {
          if (!open && !excluindoCenarioModal) {
            setCenarioParaExcluirModal(null)
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
                  {cenarioParaExcluirModal?.versao ? (
                    <span className="font-semibold text-foreground">
                      (versão {cenarioParaExcluirModal.versao})
                    </span>
                  ) : (
                    ''
                  )}{' '}
                  do canal{' '}
                  <strong className="text-foreground">
                    {cenarioParaExcluirModal
                      ? canais.find((c) => c.id === cenarioParaExcluirModal.canal)?.nome || 'Canal'
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
              disabled={excluindoCenarioModal}
              className="text-xs h-9 bg-secondary/50 hover:bg-secondary border-border"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={excluindoCenarioModal}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmarExclusaoModal()
              }}
              className="text-xs h-9 bg-destructive hover:bg-destructive/90 text-destructive-foreground font-bold gap-1.5"
            >
              {excluindoCenarioModal ? (
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

      {/* Confirmação de Retirada de Aprovação no Modal do Comparador */}
      <AlertDialog
        open={!!cenarioParaRetirarAprovacao}
        onOpenChange={(open) => {
          if (!open && !retirandoAprovacaoModal) {
            setCenarioParaRetirarAprovacao(null)
          }
        }}
      >
        <AlertDialogContent className="bg-white border-border sm:max-w-md">
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-primary mb-1">
              <RotateCcw className="h-5 w-5 text-primary" />
              <AlertDialogTitle className="text-base font-bold text-foreground">
                Retirar aprovação do cenário?
              </AlertDialogTitle>
            </div>
            <AlertDialogDescription asChild>
              <div className="text-xs text-muted-foreground space-y-2 text-left">
                <p>
                  Você está retirando a aprovação do preço{' '}
                  <strong className="text-foreground font-mono">
                    {cenarioParaRetirarAprovacao?.preco_aprovado
                      ? formatCurrency(cenarioParaRetirarAprovacao.preco_aprovado)
                      : ''}
                  </strong>{' '}
                  para o canal{' '}
                  <strong className="text-foreground">
                    {cenarioParaRetirarAprovacao
                      ? canais.find((c) => c.id === cenarioParaRetirarAprovacao.canal)?.nome ||
                        'Canal'
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
              disabled={retirandoAprovacaoModal}
              className="text-xs h-9 bg-secondary/50 hover:bg-secondary border-border"
            >
              Cancelar
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={retirandoAprovacaoModal}
              onClick={(e) => {
                e.preventDefault()
                handleConfirmarRetiradaModal()
              }}
              className="text-xs h-9 bg-primary hover:bg-primary/90 text-white font-bold gap-1.5"
            >
              {retirandoAprovacaoModal ? 'Retirando...' : 'Retirar aprovação'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
