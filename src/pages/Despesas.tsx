import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  ExternalLink,
  Filter,
  HeartHandshake,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trash2,
  Undo2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PermissionButton } from '@/components/PermissionButton'
import { BaixaOcorrenciaDialog } from '@/components/despesas/BaixaOcorrenciaDialog'
import { DespesaCompromissoDialog } from '@/components/despesas/DespesaCompromissoDialog'
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
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { formatCurrency, formatDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { cadastrosService } from '@/services/cadastros'
import { useRealtime } from '@/hooks/use-realtime'
import { despesasService } from '@/services/despesas'
import { financeService } from '@/services/finance'
import type {
  Categoria,
  Conta,
  DespesaCompromisso,
  DespesaOcorrencia,
  Empresa,
  MetodoPagamento,
  Pessoa,
  SecaoDespesa,
  TagItem,
  TipoDespesa,
  TipoDizimo,
} from '@/types/domain'

function getInitialCompetencia() {
  const d = new Date()
  return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
}

function formatCompetenciaDisplay(comp: string) {
  if (!comp || !comp.includes('-')) return comp
  const [y, m] = comp.split('-')
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

export default function Despesas() {
  const { user } = useAuth()
  const { activeContext } = useAppContext()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()

  const currentCompetencia = params.get('competencia') || getInitialCompetencia()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Dados auxiliares
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [tags, setTags] = useState<TagItem[]>([])
  const [tiposDespesa, setTiposDespesa] = useState<TipoDespesa[]>([])
  const [metodosPagamento, setMetodosPagamento] = useState<MetodoPagamento[]>([])
  const [tiposDizimo, setTiposDizimo] = useState<TipoDizimo[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])

  // Ocorrências e compromissos
  const [ocorrencias, setOcorrencias] = useState<DespesaOcorrencia[]>([])
  const [compromissos, setCompromissos] = useState<DespesaCompromisso[]>([])
  const [cartaoOcorrenciasAll, setCartaoOcorrenciasAll] = useState<DespesaOcorrencia[]>([])

  // Modo de visualização de cartões: 'mes' (mês selecionado) ou 'historico' (todas as compras / histórico completo)
  const [cartaoViewMode, setCartaoViewMode] = useState<Record<string, 'mes' | 'historico'>>({})

  // Modais de ação
  const [baixaModal, setBaixaModal] = useState(false)
  const [ocorrenciaParaBaixar, setOcorrenciaParaBaixar] = useState<DespesaOcorrencia | null>(null)
  const [compromissoParaBaixar, setCompromissoParaBaixar] = useState<DespesaCompromisso | null>(
    null,
  )

  const [compromissoModal, setCompromissoModal] = useState(false)
  const [compromissoEditando, setCompromissoEditando] = useState<DespesaCompromisso | null>(null)
  const [defaultSecaoCompromisso, setDefaultSecaoCompromisso] = useState<SecaoDespesa>(
    'contas_mensais_pix_boleto',
  )

  const [estornando, setEstornando] = useState<DespesaOcorrencia | null>(null)
  const [deletandoCompromisso, setDeletandoCompromisso] = useState<DespesaCompromisso | null>(null)
  const [deletandoOcorrencia, setDeletandoOcorrencia] = useState<DespesaOcorrencia | null>(null)

  // Filtros locais de busca
  const [search, setSearch] = useState('')
  const [filterTag, setFilterTag] = useState('all') // Destino da despesa / Centro de custo
  const [filterTitular, setFilterTitular] = useState('all') // Titular da despesa (CPF ou CNPJ)
  const [filterCategoria, setFilterCategoria] = useState('all') // Categoria financeira (finalidade)
  const [filterStatus, setFilterStatus] = useState('all')
  const [filterSecao, setFilterSecao] = useState('all') // Seção do painel: 'all' | 'contas_mensais_pix_boleto' | 'assinaturas_anuais' | 'cartoes_credito'

  // Ocorrências atrasadas (status 'prevista' com vencimento anterior ao mês atual)
  const [ocorrenciasAtrasadas, setOcorrenciasAtrasadas] = useState<DespesaOcorrencia[]>([])

  const loadData = useCallback(async () => {
    try {
      const [cts, cats, tgs, tps, mts, dzs, emps, pess] = await Promise.all([
        financeService.listContas(),
        financeService.listCategorias(),
        despesasService.listTags(),
        despesasService.listTiposDespesa(),
        despesasService.listMetodosPagamento(),
        despesasService.listTiposDizimo(),
        cadastrosService.listEmpresas(),
        cadastrosService.listPessoas(),
      ])
      setContas(cts)
      setCategorias(cats)
      setTags(tgs)
      setTiposDespesa(tps)
      setMetodosPagamento(mts)
      setTiposDizimo(dzs)
      setEmpresas(emps)
      setPessoas(pess)

      // Carregar compromissos, ocorrências da competência, cartões e ocorrências atrasadas
      const [allComps, allOcs, allOcsCartao, allOcsAtrasadas] = await Promise.all([
        despesasService.listCompromissos(),
        despesasService.listOcorrencias({
          filter: `competencia = '${currentCompetencia}'`,
        }),
        despesasService.listOcorrencias({
          filter: `secao = 'cartoes_credito'`,
          sort: '-data_vencimento',
        }),
        despesasService.listOcorrencias({
          filter: `status = 'prevista' && competencia < '${currentCompetencia}'`,
          sort: 'data_vencimento',
        }),
      ])

      // Função de correspondência ao grupo de contexto ativo
      const isCompromissoInContext = (comp: DespesaCompromisso): boolean => {
        if (activeContext.isAll) return true
        const pId = comp.pessoa
        const eId = comp.empresa
        const cId = comp.conta_padrao

        if (pId && activeContext.pessoaIds.includes(pId)) return true
        if (eId && activeContext.empresaIds.includes(eId)) return true
        if (cId && activeContext.contaIds.includes(cId)) return true

        if (activeContext.hasEmpresas && !activeContext.hasPessoas) {
          return !!eId && activeContext.empresaIds.includes(eId)
        }

        if (comp.contexto_tipo === 'pessoal') {
          if (pId) return activeContext.pessoaIds.includes(pId)
          if (cId && activeContext.contaIds.includes(cId)) return true
          if (activeContext.hasPessoas && !cId) return true
        }

        return false
      }

      const isOcorrenciaInContext = (oc: DespesaOcorrencia): boolean => {
        if (activeContext.isAll) return true
        const comp = oc.expand?.compromisso
        const pId = comp?.pessoa
        const eId = comp?.empresa
        const cId = oc.conta || comp?.conta_padrao

        if (pId && activeContext.pessoaIds.includes(pId)) return true
        if (eId && activeContext.empresaIds.includes(eId)) return true
        if (cId && activeContext.contaIds.includes(cId)) return true

        if (activeContext.hasEmpresas && !activeContext.hasPessoas) {
          return !!eId && activeContext.empresaIds.includes(eId)
        }

        const ctxTipo = oc.contexto_tipo || comp?.contexto_tipo
        if (ctxTipo === 'pessoal') {
          if (pId) return activeContext.pessoaIds.includes(pId)
          if (cId && activeContext.contaIds.includes(cId)) return true
          if (activeContext.hasPessoas && !cId) return true
        }

        return false
      }

      const comps = allComps.filter(isCompromissoInContext)
      const ocs = allOcs.filter(isOcorrenciaInContext)
      const ocsCartaoAll = allOcsCartao.filter(isOcorrenciaInContext)
      const ocsAtrasadas = allOcsAtrasadas.filter(isOcorrenciaInContext)

      setCompromissos(comps)
      setOcorrencias(ocs)
      setCartaoOcorrenciasAll(ocsCartaoAll)
      setOcorrenciasAtrasadas(ocsAtrasadas)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar despesas',
        description: apiMessage(err),
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeContext, currentCompetencia, toast])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Subscrições em tempo real para refletir edições de compromissos e ocorrências instantaneamente
  useRealtime('despesas_compromisso', () => {
    loadData()
  })
  useRealtime('despesas_ocorrencias', () => {
    loadData()
  })

  // Navegação de mês
  const changeMonth = (delta: number) => {
    const [yStr, mStr] = currentCompetencia.split('-')
    const d = new Date(parseInt(yStr, 10), parseInt(mStr, 10) - 1 + delta, 1)
    const nextComp = `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`
    const next = new URLSearchParams(params)
    next.set('competencia', nextComp)
    setParams(next, { replace: true })
  }

  // Sincronizar ocorrências pendentes do mês se necessário
  const handleGerarOcorrenciasMes = async () => {
    setRefreshing(true)
    try {
      for (const comp of compromissos.filter((c) => c.ativo !== false)) {
        await despesasService.gerarOcorrenciasParaCompromisso(comp, [currentCompetencia])
      }
      toast({
        title: 'Ocorrências sincronizadas',
        description: `Compromissos ativos gerados para ${formatCompetenciaDisplay(currentCompetencia)}.`,
      })
      await loadData()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao sincronizar',
        description: apiMessage(e),
      })
      setRefreshing(false)
    }
  }

  // Filtragem das ocorrências
  const filteredOcorrencias = useMemo(() => {
    return ocorrencias.filter((oc) => {
      const comp = oc.expand?.compromisso
      const desc = comp?.descricao || ''
      const forn = comp?.fornecedor || ''
      const matchesSearch =
        !search ||
        desc.toLowerCase().includes(search.toLowerCase()) ||
        forn.toLowerCase().includes(search.toLowerCase())

      const matchesTag =
        filterTag === 'all' || comp?.tag === filterTag || oc.expand?.compromisso?.tag === filterTag

      const matchesCategoria =
        filterCategoria === 'all' ||
        comp?.categoria === filterCategoria ||
        oc.expand?.compromisso?.categoria === filterCategoria

      const matchesTitular =
        filterTitular === 'all' ||
        (filterTitular === 'cpf' &&
          (comp?.titular_tipo === 'cpf' || comp?.contexto_tipo === 'pessoal')) ||
        (filterTitular === 'cnpj' &&
          (comp?.titular_tipo === 'cnpj' || comp?.contexto_tipo === 'empresa'))

      const matchesSecao = filterSecao === 'all' || oc.secao === filterSecao

      const matchesStatus = filterStatus === 'all' || oc.status === filterStatus

      return (
        matchesSearch &&
        matchesTag &&
        matchesCategoria &&
        matchesTitular &&
        matchesSecao &&
        matchesStatus
      )
    })
  }, [ocorrencias, search, filterTag, filterCategoria, filterTitular, filterSecao, filterStatus])

  // Filtragem das ocorrências atrasadas de competências passadas
  // Defesa extra: NUNCA listar como atrasada ocorrência com competência anterior à data_inicio do compromisso
  const filteredOcorrenciasAtrasadas = useMemo(() => {
    return ocorrenciasAtrasadas.filter((oc) => {
      const comp = oc.expand?.compromisso
      const desc = comp?.descricao || ''
      const forn = comp?.fornecedor || ''

      // Validação de consistência: ignorar fantasmas retroativos
      if (comp?.data_inicio && oc.competencia) {
        const compStartStr = String(comp.data_inicio).slice(0, 7)
        if (oc.competencia < compStartStr) {
          return false
        }
      }

      const matchesSearch =
        !search ||
        desc.toLowerCase().includes(search.toLowerCase()) ||
        forn.toLowerCase().includes(search.toLowerCase())

      const matchesTag =
        filterTag === 'all' || comp?.tag === filterTag || oc.expand?.compromisso?.tag === filterTag

      const matchesCategoria =
        filterCategoria === 'all' ||
        comp?.categoria === filterCategoria ||
        oc.expand?.compromisso?.categoria === filterCategoria

      const matchesTitular =
        filterTitular === 'all' ||
        (filterTitular === 'cpf' &&
          (comp?.titular_tipo === 'cpf' || comp?.contexto_tipo === 'pessoal')) ||
        (filterTitular === 'cnpj' &&
          (comp?.titular_tipo === 'cnpj' || comp?.contexto_tipo === 'empresa'))

      const matchesSecao = filterSecao === 'all' || oc.secao === filterSecao

      const matchesStatus = filterStatus === 'all' || oc.status === filterStatus

      return (
        matchesSearch &&
        matchesTag &&
        matchesCategoria &&
        matchesTitular &&
        matchesSecao &&
        matchesStatus
      )
    })
  }, [
    ocorrenciasAtrasadas,
    search,
    filterTag,
    filterCategoria,
    filterTitular,
    filterSecao,
    filterStatus,
  ])

  // Seção 1: Boletos & Contas Mensais Pix
  const secaoBoletosPix = useMemo(
    () => filteredOcorrencias.filter((oc) => !oc.secao || oc.secao === 'contas_mensais_pix_boleto'),
    [filteredOcorrencias],
  )

  // Seção 2: Assinaturas Anuais
  const secaoAssinaturas = useMemo(
    () => filteredOcorrencias.filter((oc) => oc.secao === 'assinaturas_anuais'),
    [filteredOcorrencias],
  )

  // Seção 3: Cartões de Crédito (Agrupados por Cartão)
  const cartaoContas = useMemo(() => contas.filter((c) => c.tipo === 'cartao'), [contas])

  // Filtragem de todas as ocorrências de cartões (para histórico completo)
  const filteredCartaoOcorrenciasAll = useMemo(() => {
    return cartaoOcorrenciasAll.filter((oc) => {
      const comp = oc.expand?.compromisso
      const desc = comp?.descricao || ''
      const forn = comp?.fornecedor || ''
      const matchesSearch =
        !search ||
        desc.toLowerCase().includes(search.toLowerCase()) ||
        forn.toLowerCase().includes(search.toLowerCase())

      const matchesTag =
        filterTag === 'all' || comp?.tag === filterTag || oc.expand?.compromisso?.tag === filterTag

      const matchesCategoria =
        filterCategoria === 'all' ||
        comp?.categoria === filterCategoria ||
        oc.expand?.compromisso?.categoria === filterCategoria

      const matchesTitular =
        filterTitular === 'all' ||
        (filterTitular === 'cpf' &&
          (comp?.titular_tipo === 'cpf' || comp?.contexto_tipo === 'pessoal')) ||
        (filterTitular === 'cnpj' &&
          (comp?.titular_tipo === 'cnpj' || comp?.contexto_tipo === 'empresa'))

      const matchesSecao = filterSecao === 'all' || oc.secao === filterSecao

      const matchesStatus = filterStatus === 'all' || oc.status === filterStatus

      return (
        matchesSearch &&
        matchesTag &&
        matchesCategoria &&
        matchesTitular &&
        matchesSecao &&
        matchesStatus
      )
    })
  }, [
    cartaoOcorrenciasAll,
    search,
    filterTag,
    filterCategoria,
    filterTitular,
    filterSecao,
    filterStatus,
  ])

  const cartoesGrouped = useMemo(() => {
    const map = new Map<
      string,
      {
        conta: Conta
        ocorrenciasMes: DespesaOcorrencia[]
        ocorrenciasTodas: DespesaOcorrencia[]
      }
    >()

    // Inicializa todos os cartões cadastrados
    cartaoContas.forEach((conta) => {
      map.set(conta.id, { conta, ocorrenciasMes: [], ocorrenciasTodas: [] })
    })

    // Ocorrências do mês
    filteredOcorrencias
      .filter((oc) => oc.secao === 'cartoes_credito')
      .forEach((oc) => {
        const contaId =
          oc.conta || oc.expand?.compromisso?.conta_padrao || cartaoContas[0]?.id || 'unknown'
        if (!map.has(contaId)) {
          const found =
            contas.find((c) => c.id === contaId) ||
            ({
              id: contaId,
              nome: 'Outro Cartão',
              tipo: 'cartao',
              saldo_inicial: 0,
              cor: '#DF5830',
              ativa: true,
            } as Conta)
          map.set(contaId, { conta: found, ocorrenciasMes: [], ocorrenciasTodas: [] })
        }
        map.get(contaId)!.ocorrenciasMes.push(oc)
      })

    // Todas as ocorrências do cartão (histórico geral)
    filteredCartaoOcorrenciasAll.forEach((oc) => {
      const contaId =
        oc.conta || oc.expand?.compromisso?.conta_padrao || cartaoContas[0]?.id || 'unknown'
      if (!map.has(contaId)) {
        const found =
          contas.find((c) => c.id === contaId) ||
          ({
            id: contaId,
            nome: 'Outro Cartão',
            tipo: 'cartao',
            saldo_inicial: 0,
            cor: '#DF5830',
            ativa: true,
          } as Conta)
        map.set(contaId, { conta: found, ocorrenciasMes: [], ocorrenciasTodas: [] })
      }
      map.get(contaId)!.ocorrenciasTodas.push(oc)
    })

    return Array.from(map.values())
  }, [cartaoContas, filteredOcorrencias, filteredCartaoOcorrenciasAll, contas])

  // Totais do Período
  const totalPrevistoGeral = useMemo(
    () => ocorrencias.reduce((sum, o) => sum + (o.valor_previsto || 0), 0),
    [ocorrencias],
  )
  const totalPagoGeral = useMemo(
    () =>
      ocorrencias
        .filter((o) => o.status === 'paga')
        .reduce((sum, o) => sum + (o.valor_pago || o.valor_previsto || 0), 0),
    [ocorrencias],
  )
  const totalPendenteGeral = useMemo(
    () =>
      ocorrencias
        .filter((o) => o.status === 'prevista')
        .reduce((sum, o) => sum + (o.valor_previsto || 0), 0),
    [ocorrencias],
  )

  // Dízimo / Ofertas somados
  const totalDizimoOfertas = useMemo(() => {
    return ocorrencias
      .filter((o) => {
        const isDizimo = o.dizimo || o.expand?.compromisso?.dizimo
        return isDizimo
      })
      .reduce((sum, o) => {
        const val = o.status === 'paga' ? o.valor_pago || o.valor_previsto : o.valor_previsto
        return sum + (val || 0)
      }, 0)
  }, [ocorrencias])

  // Abertura de Modais
  const handleOpenBaixa = (oc: DespesaOcorrencia) => {
    setCompromissoParaBaixar(null)
    setOcorrenciaParaBaixar(oc)
    setBaixaModal(true)
  }

  const handleOpenBaixaCompromisso = (comp: DespesaCompromisso) => {
    setOcorrenciaParaBaixar(null)
    setCompromissoParaBaixar(comp)
    setBaixaModal(true)
  }

  const handleEstornar = async () => {
    if (!estornando) return
    try {
      await despesasService.estornarBaixa(estornando)
      toast({
        title: 'Baixa estornada',
        description:
          'A ocorrência voltou ao status prevista e o lançamento financeiro foi removido.',
      })
      await loadData()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao estornar',
        description: apiMessage(e),
      })
    } finally {
      setEstornando(null)
    }
  }

  const handleOpenNovoCompromisso = (secao: SecaoDespesa = 'contas_mensais_pix_boleto') => {
    setCompromissoEditando(null)
    setDefaultSecaoCompromisso(secao)
    setCompromissoModal(true)
  }

  const handleOpenEditarCompromisso = (comp: DespesaCompromisso) => {
    setCompromissoEditando(comp)
    setCompromissoModal(true)
  }

  const handleDeleteCompromisso = async () => {
    if (!deletandoCompromisso) return
    try {
      await despesasService.deleteCompromisso(deletandoCompromisso.id)
      toast({
        title: 'Compromisso excluído',
        description: 'Compromisso e suas ocorrências vinculadas foram removidos.',
      })
      await loadData()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir compromisso',
        description: apiMessage(e),
      })
    } finally {
      setDeletandoCompromisso(null)
    }
  }

  const handleDeleteOcorrencia = async () => {
    if (!deletandoOcorrencia) return
    try {
      await despesasService.deleteOcorrencia(deletandoOcorrencia.id)
      toast({
        title: 'Ocorrência excluída',
        description: 'Apenas a ocorrência selecionada foi removida com sucesso.',
      })
      await loadData()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir ocorrência',
        description: apiMessage(e),
      })
    } finally {
      setDeletandoOcorrencia(null)
    }
  }

  if (loading) return <LoadingState label="Carregando módulo de despesas e compromissos..." />

  return (
    <>
      <PageHeader
        title="Despesas & Compromissos"
        description={`Controle de boletos, pix recorrentes, assinaturas e cartões no contexto ${activeContext.label}.`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleGerarOcorrenciasMes}
              disabled={refreshing}
              title="Sincronizar compromissos deste mês"
            >
              <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${refreshing && 'animate-spin'}`} />
              Sincronizar mês
            </Button>
            <PermissionButton
              allowed={can(user?.role, 'writeFinance')}
              onClick={() => handleOpenNovoCompromisso()}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo compromisso
            </PermissionButton>
          </div>
        }
      />

      {/* SELETOR DE MÊS / COMPETÊNCIA & RESUMO DOS TOTAIS */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <CalendarDays className="h-5 w-5" />
            </span>
            <div>
              <p className="micro-label">Competência de Apuração</p>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => changeMonth(-1)}
                  aria-label="Mês anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span className="text-base font-extrabold capitalize text-foreground sm:text-lg">
                  {formatCompetenciaDisplay(currentCompetencia)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => changeMonth(1)}
                  aria-label="Próximo mês"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-4">
            <div className="rounded-xl border border-border bg-secondary/30 px-3 py-1.5 text-right">
              <p className="micro-label">Total Previsto</p>
              <p className="text-sm font-extrabold tabular-nums text-foreground">
                {formatCurrency(totalPrevistoGeral)}
              </p>
            </div>
            <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-1.5 text-right">
              <p className="micro-label text-success">Total Pago</p>
              <p className="text-sm font-extrabold tabular-nums text-success">
                {formatCurrency(totalPagoGeral)}
              </p>
            </div>
            <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-1.5 text-right">
              <p className="micro-label text-primary">A Pagar / Pendente</p>
              <p className="text-sm font-extrabold tabular-nums text-primary">
                {formatCurrency(totalPendenteGeral)}
              </p>
            </div>
            {/* Card Dízimo / Ofertas */}
            <div className="rounded-xl border border-amber-300 bg-amber-500/10 px-3 py-1.5 text-right">
              <p className="micro-label flex items-center justify-end gap-1 text-amber-700">
                <HeartHandshake className="h-3 w-3" /> Dízimos & Ofertas
              </p>
              <p className="text-sm font-extrabold tabular-nums text-amber-800">
                {formatCurrency(totalDizimoOfertas)}
              </p>
            </div>
          </div>
        </div>

        {/* FILTROS E BUSCA */}
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-white p-3 shadow-soft">
          <div className="relative min-w-[200px] flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar despesa ou fornecedor..."
              className="pl-9 h-9 text-xs"
            />
          </div>

          {/* Destino da despesa / Centro de Custo */}
          <Select value={filterTag} onValueChange={setFilterTag}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="Destino / Centro de Custo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Destinos</SelectItem>
              {tags.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.nome}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Categoria Financeira / Finalidade */}
          <Select value={filterCategoria} onValueChange={setFilterCategoria}>
            <SelectTrigger className="h-9 w-40 text-xs">
              <SelectValue placeholder="Categoria (Finalidade)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Categorias</SelectItem>
              {categorias
                .filter((c) => c.tipo === 'despesa')
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.nome}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>

          {/* Titular da despesa (CPF ou CNPJ) */}
          <Select value={filterTitular} onValueChange={setFilterTitular}>
            <SelectTrigger className="h-9 w-36 text-xs">
              <SelectValue placeholder="Titular" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Titulares</SelectItem>
              <SelectItem value="cpf">Pessoal / CPF</SelectItem>
              <SelectItem value="cnpj">Empresas / CNPJ</SelectItem>
            </SelectContent>
          </Select>

          {/* Seção */}
          <Select value={filterSecao} onValueChange={setFilterSecao}>
            <SelectTrigger className="h-9 w-44 text-xs">
              <SelectValue placeholder="Todas as Seções" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as Seções</SelectItem>
              <SelectItem value="contas_mensais_pix_boleto">Boletos & Pix Mensais</SelectItem>
              <SelectItem value="assinaturas_anuais">Assinaturas Anuais</SelectItem>
              <SelectItem value="cartoes_credito">Cartões de Crédito</SelectItem>
            </SelectContent>
          </Select>

          {/* Status */}
          <Select value={filterStatus} onValueChange={setFilterStatus}>
            <SelectTrigger className="h-9 w-32 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos status</SelectItem>
              <SelectItem value="prevista">Prevista</SelectItem>
              <SelectItem value="paga">Paga</SelectItem>
            </SelectContent>
          </Select>

          {(search ||
            filterTag !== 'all' ||
            filterCategoria !== 'all' ||
            filterTitular !== 'all' ||
            filterSecao !== 'all' ||
            filterStatus !== 'all') && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearch('')
                setFilterTag('all')
                setFilterCategoria('all')
                setFilterTitular('all')
                setFilterSecao('all')
                setFilterStatus('all')
              }}
              className="h-9 text-xs text-primary"
            >
              <X className="mr-1 h-3.5 w-3.5" /> Limpar filtros
            </Button>
          )}
        </div>
      </div>

      {/* ========================================================
          DESTAQUE: DESPESAS PREVISTAS ATRASADAS (MESES ANTERIORES)
         ======================================================== */}
      {filteredOcorrenciasAtrasadas.length > 0 && (
        <div className="mt-6 rounded-2xl border border-destructive/30 bg-destructive/5 p-4 shadow-soft">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between mb-3">
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-destructive text-white">
                <AlertCircle className="h-4 w-4" />
              </span>
              <div>
                <h3 className="text-base font-extrabold text-destructive flex items-center gap-2">
                  Despesas Atrasadas Pendentes
                  <Badge variant="destructive" className="text-xs">
                    {filteredOcorrenciasAtrasadas.length}{' '}
                    {filteredOcorrenciasAtrasadas.length === 1 ? 'pendência' : 'pendências'}
                  </Badge>
                </h3>
                <p className="text-xs text-muted-foreground">
                  Despesas previstas de competências anteriores que ainda não foram baixadas nem
                  pagas.
                </p>
              </div>
            </div>
            <div className="text-xs font-bold text-destructive">
              Total Atrasado:{' '}
              {formatCurrency(
                filteredOcorrenciasAtrasadas.reduce(
                  (acc, curr) => acc + (curr.valor_previsto || 0),
                  0,
                ),
              )}
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-destructive/20 bg-white">
            <div className="divide-y divide-border">
              {filteredOcorrenciasAtrasadas.map((oc) => (
                <OcorrenciaRow
                  key={oc.id}
                  ocorrencia={oc}
                  isAtrasada
                  onBaixar={() => handleOpenBaixa(oc)}
                  onEstornar={() => setEstornando(oc)}
                  onEditarCompromisso={() =>
                    oc.expand?.compromisso && handleOpenEditarCompromisso(oc.expand.compromisso)
                  }
                  onExcluirCompromisso={() =>
                    oc.expand?.compromisso && setDeletandoCompromisso(oc.expand.compromisso)
                  }
                  onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                  canEdit={can(user?.role, 'writeFinance')}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          AS 3 SEÇÕES PRINCIPAIS CONFORME A PLANILHA DO USUÁRIO
         ======================================================== */}
      <div className="mt-8 space-y-8">
        {/* SEÇÃO 1: Pagamentos por boletos, e contas mensais pagas por pix */}
        {(filterSecao === 'all' || filterSecao === 'contas_mensais_pix_boleto') && (
          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Pagamentos por boletos, e contas mensais pagas por pix
                </h2>
                <p className="text-xs text-muted-foreground">
                  Água, energia, internet, escola, aluguel, segurança, dízimos e transferências
                  mensais.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  Total:{' '}
                  {formatCurrency(
                    secaoBoletosPix.reduce((acc, curr) => acc + (curr.valor_previsto || 0), 0),
                  )}
                </span>
                <PermissionButton
                  size="sm"
                  variant="outline"
                  allowed={can(user?.role, 'writeFinance')}
                  onClick={() => handleOpenNovoCompromisso('contas_mensais_pix_boleto')}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                </PermissionButton>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft">
              {secaoBoletosPix.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum boleto ou conta mensal Pix nesta competência.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {secaoBoletosPix.map((oc) => (
                    <OcorrenciaRow
                      key={oc.id}
                      ocorrencia={oc}
                      onBaixar={() => handleOpenBaixa(oc)}
                      onEstornar={() => setEstornando(oc)}
                      onEditarCompromisso={() =>
                        oc.expand?.compromisso && handleOpenEditarCompromisso(oc.expand.compromisso)
                      }
                      onExcluirCompromisso={() =>
                        oc.expand?.compromisso && setDeletandoCompromisso(oc.expand.compromisso)
                      }
                      onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                      canEdit={can(user?.role, 'writeFinance')}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* SEÇÃO 2: Assinaturas anuais */}
        {(filterSecao === 'all' || filterSecao === 'assinaturas_anuais') && (
          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Assinaturas anuais
                </h2>
                <p className="text-xs text-muted-foreground">
                  Domínios, ferramentas, softwares e renovações de ciclo anual.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  Total:{' '}
                  {formatCurrency(
                    secaoAssinaturas.reduce((acc, curr) => acc + (curr.valor_previsto || 0), 0),
                  )}
                </span>
                <PermissionButton
                  size="sm"
                  variant="outline"
                  allowed={can(user?.role, 'writeFinance')}
                  onClick={() => handleOpenNovoCompromisso('assinaturas_anuais')}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                </PermissionButton>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft">
              {secaoAssinaturas.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma assinatura anual com vencimento neste mês.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {secaoAssinaturas.map((oc) => (
                    <OcorrenciaRow
                      key={oc.id}
                      ocorrencia={oc}
                      onBaixar={() => handleOpenBaixa(oc)}
                      onEstornar={() => setEstornando(oc)}
                      onEditarCompromisso={() =>
                        oc.expand?.compromisso && handleOpenEditarCompromisso(oc.expand.compromisso)
                      }
                      onExcluirCompromisso={() =>
                        oc.expand?.compromisso && setDeletandoCompromisso(oc.expand.compromisso)
                      }
                      onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                      canEdit={can(user?.role, 'writeFinance')}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        )}

        {/* SEÇÃO 3: Cartões de Crédito (NuBank, Porto Seguro, Sicred e cadastráveis) */}
        {(filterSecao === 'all' || filterSecao === 'cartoes_credito') && (
          <section className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Cartões de Crédito
                </h2>
                <p className="text-xs text-muted-foreground">
                  Compras parceladas e rotativas separadas por cartão (NuBank, Porto Seguro, Sicred,
                  etc.) com controle da fatura, dia de fechamento e vencimento.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <PermissionButton
                  size="sm"
                  variant="outline"
                  allowed={can(user?.role, 'writeFinance')}
                  onClick={() => handleOpenNovoCompromisso('cartoes_credito')}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" /> Nova compra parcelada
                </PermissionButton>
                <Button size="sm" variant="ghost" asChild>
                  <Link to="/contas">
                    <CreditCard className="mr-1 h-3.5 w-3.5" /> Gerenciar cartões
                  </Link>
                </Button>
              </div>
            </div>

            <div className="space-y-5">
              {cartoesGrouped.length === 0 ? (
                <div className="rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted-foreground shadow-soft">
                  Nenhum cartão cadastrado. Vá em "Contas" para cadastrar seus cartões.
                </div>
              ) : (
                cartoesGrouped.map(({ conta, ocorrenciasMes, ocorrenciasTodas }) => {
                  const currentMode = cartaoViewMode[conta.id] || 'mes'
                  const isHist = currentMode === 'historico'
                  const displayOcorrencias = isHist ? ocorrenciasTodas : ocorrenciasMes

                  const totalMes = ocorrenciasMes.reduce(
                    (sum, o) => sum + (o.valor_previsto || 0),
                    0,
                  )
                  const totalPagoMes = ocorrenciasMes
                    .filter((o) => o.status === 'paga')
                    .reduce((sum, o) => sum + (o.valor_pago || o.valor_previsto || 0), 0)

                  const totalTodas = ocorrenciasTodas.reduce(
                    (sum, o) => sum + (o.valor_previsto || 0),
                    0,
                  )
                  const totalPagoTodas = ocorrenciasTodas
                    .filter((o) => o.status === 'paga')
                    .reduce((sum, o) => sum + (o.valor_pago || o.valor_previsto || 0), 0)

                  return (
                    <div
                      key={conta.id}
                      className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft transition-all"
                    >
                      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/25 p-4 sm:p-5">
                        {/* Dados do Cartão: Nome, Bandeira, Fechamento e Vencimento */}
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-11 w-11 place-items-center rounded-xl text-white shadow-xs"
                            style={{ background: conta.cor || '#4C3A8C' }}
                          >
                            <CreditCard className="h-6 w-6" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-extrabold text-foreground sm:text-lg">
                                {conta.nome}
                              </h3>
                              {conta.bandeira && (
                                <Badge variant="outline" className="font-semibold text-[10px]">
                                  {conta.bandeira}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {conta.dia_fechamento ? (
                                  <>
                                    Fatura fecha todo <strong>dia {conta.dia_fechamento}</strong>
                                  </>
                                ) : (
                                  'Fechamento não informado'
                                )}
                              </span>
                              <span>•</span>
                              <span className="font-medium text-foreground">
                                {conta.dia_vencimento ? (
                                  <>
                                    Vencimento todo <strong>dia {conta.dia_vencimento}</strong>
                                  </>
                                ) : (
                                  'Vencimento não informado'
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Valores e Alternador Mês vs Histórico Completo */}
                        <div className="flex flex-wrap items-center gap-3">
                          {/* Seletor de visualização */}
                          <div className="flex rounded-lg border border-border bg-background p-0.5 text-xs">
                            <button
                              type="button"
                              onClick={() =>
                                setCartaoViewMode((prev) => ({ ...prev, [conta.id]: 'mes' }))
                              }
                              className={`rounded-md px-2.5 py-1 font-medium transition ${
                                !isHist
                                  ? 'bg-primary text-white shadow-xs'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              Mês atual ({formatCompetenciaDisplay(currentCompetencia)})
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setCartaoViewMode((prev) => ({ ...prev, [conta.id]: 'historico' }))
                              }
                              className={`rounded-md px-2.5 py-1 font-medium transition ${
                                isHist
                                  ? 'bg-primary text-white shadow-xs'
                                  : 'text-muted-foreground hover:text-foreground'
                              }`}
                            >
                              Todas as compras ({ocorrenciasTodas.length})
                            </button>
                          </div>

                          {/* Indicadores financeiros */}
                          <div className="flex items-center gap-3">
                            <div className="rounded-xl border border-border bg-white px-3 py-1 text-right">
                              <p className="micro-label">
                                {isHist ? 'Total Compras' : 'Fatura do Mês'}
                              </p>
                              <p className="text-sm font-extrabold tabular-nums text-foreground">
                                {formatCurrency(isHist ? totalTodas : totalMes)}
                              </p>
                            </div>
                            {(isHist ? totalPagoTodas : totalPagoMes) > 0 && (
                              <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-1 text-right">
                                <p className="micro-label text-success">Baixado</p>
                                <p className="text-xs font-bold tabular-nums text-success">
                                  {formatCurrency(isHist ? totalPagoTodas : totalPagoMes)}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </header>

                      {displayOcorrencias.length === 0 ? (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          {isHist
                            ? 'Nenhuma compra realizada com este cartão de crédito.'
                            : `Nenhuma compra ou parcela neste cartão para ${formatCompetenciaDisplay(
                                currentCompetencia,
                              )}. Clique em "Todas as compras" para ver o histórico geral.`}
                        </div>
                      ) : (
                        <div className="divide-y divide-border">
                          {displayOcorrencias.map((oc) => (
                            <OcorrenciaRow
                              key={oc.id}
                              ocorrencia={oc}
                              onBaixar={() => handleOpenBaixa(oc)}
                              onEstornar={() => setEstornando(oc)}
                              onEditarCompromisso={() =>
                                oc.expand?.compromisso &&
                                handleOpenEditarCompromisso(oc.expand.compromisso)
                              }
                              onExcluirCompromisso={() =>
                                oc.expand?.compromisso &&
                                setDeletandoCompromisso(oc.expand.compromisso)
                              }
                              onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                              canEdit={can(user?.role, 'writeFinance')}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        )}
      </div>

      {/* MODAIS */}
      <BaixaOcorrenciaDialog
        open={baixaModal}
        onOpenChange={setBaixaModal}
        ocorrencia={ocorrenciaParaBaixar}
        compromisso={compromissoParaBaixar}
        contas={contas}
        onSuccess={loadData}
      />

      <DespesaCompromissoDialog
        open={compromissoModal}
        onOpenChange={setCompromissoModal}
        compromisso={compromissoEditando}
        categorias={categorias}
        tags={tags}
        tiposDespesa={tiposDespesa}
        metodosPagamento={metodosPagamento}
        tiposDizimo={tiposDizimo}
        contas={contas}
        pessoas={pessoas}
        empresas={empresas}
        defaultSecao={defaultSecaoCompromisso}
        onSuccess={loadData}
      />

      {/* Confirmar Estorno */}
      <AlertDialog open={!!estornando} onOpenChange={(o) => !o && setEstornando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desfazer baixa de pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              A despesa voltará para o status "prevista" e o lançamento gerado no saldo financeiro
              será estornado.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-primary hover:bg-primary/90" onClick={handleEstornar}>
              Confirmar estorno
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar Exclusão da Ocorrência Individual */}
      <AlertDialog
        open={!!deletandoOcorrencia}
        onOpenChange={(o) => !o && setDeletandoOcorrencia(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deletandoOcorrencia?.isAtrasada ||
              deletandoOcorrencia?.competencia < currentCompetencia
                ? 'Excluir pendência atrasada?'
                : 'Excluir ocorrência desta competência?'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta ocorrência de{' '}
              <strong>{deletandoOcorrencia?.competencia}</strong> do compromisso "
              {deletandoOcorrencia?.expand?.compromisso?.descricao ||
                deletandoOcorrencia?.observacoes ||
                'Despesa'}
              "?
              <br />
              <br />
              <span className="text-foreground font-medium">
                O compromisso continuará ativo e nenhuma outra ocorrência (nem as pagas, nem as
                futuras) será afetada.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteOcorrencia}
            >
              Excluir ocorrência
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmar Exclusão do Compromisso Todo */}
      <AlertDialog
        open={!!deletandoCompromisso}
        onOpenChange={(o) => !o && setDeletandoCompromisso(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir compromisso recorrente?</AlertDialogTitle>
            <AlertDialogDescription>
              Isso excluirá o compromisso inteiro "{deletandoCompromisso?.descricao}" e suas
              ocorrências vinculadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={handleDeleteCompromisso}
            >
              Excluir compromisso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

/**
 * Linha de exibição da ocorrência com colunas fiéis à planilha
 */
interface OcorrenciaRowProps {
  ocorrencia: DespesaOcorrencia
  isAtrasada?: boolean
  onBaixar: () => void
  onEstornar: () => void
  onEditarCompromisso: () => void
  onExcluirCompromisso: () => void
  onExcluirOcorrencia?: () => void
  canEdit: boolean
}

function OcorrenciaRow({
  ocorrencia,
  isAtrasada = false,
  onBaixar,
  onEstornar,
  onEditarCompromisso,
  onExcluirCompromisso,
  onExcluirOcorrencia,
  canEdit,
}: OcorrenciaRowProps) {
  const comp = ocorrencia.expand?.compromisso
  const isPaga = ocorrencia.status === 'paga'

  const tag = comp?.expand?.tag // Destino da despesa / Centro de custo
  const categoria = comp?.expand?.categoria // Finalidade
  const metodoPag = comp?.expand?.metodo_pagamento
  const contaPag = ocorrencia.expand?.conta || comp?.expand?.conta_padrao

  // Titular da obrigação
  const titularTipo = comp?.titular_tipo || (comp?.empresa ? 'cnpj' : 'cpf')
  const titularNome =
    titularTipo === 'cnpj'
      ? comp?.expand?.titular_empresa?.nome_fantasia ||
        comp?.expand?.empresa?.nome_fantasia ||
        'Empresa (CNPJ)'
      : comp?.expand?.titular_pessoa?.nome || comp?.expand?.pessoa?.nome || 'Pessoal (CPF)'

  const isDizimo = ocorrencia.dizimo || comp?.dizimo
  const linkPag = ocorrencia.link_pagamento || comp?.link_pagamento

  const parcelaLabel =
    ocorrencia.numero_parcela && ocorrencia.total_parcelas
      ? `${ocorrencia.numero_parcela}/${ocorrencia.total_parcelas}`
      : null

  const isValorVariavel = comp?.tipo_valor === 'variavel'

  return (
    <div
      className={`group flex flex-col gap-3 p-3.5 transition hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between sm:p-4 ${
        isAtrasada ? 'bg-destructive/[0.03]' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {/* Marcador de cor ou status */}
        <span
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
            isPaga
              ? 'bg-success ring-4 ring-success/15'
              : isAtrasada
                ? 'bg-destructive ring-4 ring-destructive/20 animate-pulse'
                : 'bg-primary ring-4 ring-primary/15'
          }`}
          title={isPaga ? 'Paga' : isAtrasada ? 'Prevista (Atrasada)' : 'Prevista'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-foreground text-sm">
              {comp?.descricao || ocorrencia.observacoes || 'Despesa'}
            </span>

            {/* Badge Titular da Despesa */}
            <Badge
              variant="outline"
              className="text-[10px] font-semibold flex items-center gap-1 border-primary/30 bg-primary/5 text-primary"
              title="Titular da obrigação"
            >
              {titularTipo === 'cnpj' ? (
                <Building2 className="h-3 w-3" />
              ) : (
                <UserRound className="h-3 w-3" />
              )}
              {titularNome}
            </Badge>

            {/* Badge Destino da Despesa / Centro de Custo */}
            {tag && (
              <Badge
                variant="secondary"
                className="text-[10px] font-medium"
                style={{ borderColor: tag.cor, color: tag.cor }}
                title="Destino da despesa / Centro de custo"
              >
                Destino: {tag.nome}
              </Badge>
            )}

            {/* Badge Categoria Financeira (Finalidade) */}
            {categoria && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {categoria.nome}
              </span>
            )}

            {isAtrasada && (
              <Badge
                variant="destructive"
                className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
              >
                <Clock className="h-3 w-3" /> Atrasada
              </Badge>
            )}

            {parcelaLabel && (
              <Badge variant="outline" className="font-mono text-[10px] font-bold">
                Parc. {parcelaLabel}
              </Badge>
            )}

            {isValorVariavel && (
              <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                Variável
              </span>
            )}

            {metodoPag && (
              <span className="rounded bg-secondary/80 px-1.5 py-0.5 text-[10px] font-medium text-foreground">
                {metodoPag.nome}
              </span>
            )}

            {isDizimo && (
              <Badge className="bg-amber-500/15 text-amber-800 text-[10px] hover:bg-amber-500/20">
                <HeartHandshake className="mr-1 h-3 w-3" />
                {ocorrencia.expand?.tipo_dizimo?.nome ||
                  comp?.expand?.tipo_dizimo?.nome ||
                  'Dízimo: Sim'}
              </Badge>
            )}

            {comp?.precisa_revisao && (
              <Badge
                variant="outline"
                className="text-[9px] border-amber-400 bg-amber-50 text-amber-700"
              >
                Revisão necessária
              </Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {comp?.fornecedor && (
              <span>
                Para: <strong>{comp.fornecedor}</strong>
              </span>
            )}

            {contaPag && (
              <span>
                Sai de: <strong>{contaPag.nome}</strong>
              </span>
            )}

            <span>
              Venc: <strong>{formatDate(ocorrencia.data_vencimento)}</strong>
              {comp?.regra_vencimento_texto && ` (${comp.regra_vencimento_texto})`}
            </span>
            {ocorrencia.competencia && (
              <span className="font-mono text-[11px] text-muted-foreground/80">
                Comp: {ocorrencia.competencia}
              </span>
            )}
            {isPaga && ocorrencia.data_pagamento && (
              <span className="text-success font-medium">
                Pago em: {formatDate(ocorrencia.data_pagamento)}
              </span>
            )}
            {linkPag && (
              <a
                href={linkPag}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline hover:text-primary/80"
              >
                <ExternalLink className="h-3 w-3" />
                Link de pagamento
              </a>
            )}
          </div>

          {(ocorrencia.observacoes || comp?.observacoes) && (
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1 italic">
              {ocorrencia.observacoes || comp?.observacoes}
            </p>
          )}
        </div>
      </div>

      {/* Valores e Botões de Baixa */}
      <div className="flex items-center justify-between gap-4 border-t border-border pt-2 sm:border-0 sm:pt-0 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">
            {isPaga ? 'Valor Pago' : 'Valor Previsto'}
          </p>
          <p
            className={`text-sm font-extrabold tabular-nums sm:text-base ${
              isPaga ? 'text-success' : 'text-primary'
            }`}
          >
            {formatCurrency(
              isPaga
                ? ocorrencia.valor_pago || ocorrencia.valor_previsto
                : ocorrencia.valor_previsto,
            )}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {canEdit && (
            <>
              {isPaga ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={onEstornar}
                  title="Desfazer baixa"
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Estornar
                </Button>
              ) : (
                <Button
                  size="sm"
                  className="h-8 bg-success hover:bg-success/90 text-xs font-bold"
                  onClick={onBaixar}
                >
                  <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Baixar
                </Button>
              )}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100"
                onClick={onEditarCompromisso}
                title="Editar regra de compromisso"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                onClick={onExcluirOcorrencia || onExcluirCompromisso}
                title={
                  onExcluirOcorrencia
                    ? isAtrasada
                      ? 'Excluir pendência atrasada'
                      : 'Excluir ocorrência'
                    : 'Excluir compromisso'
                }
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
