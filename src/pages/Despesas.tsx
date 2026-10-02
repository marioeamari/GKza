import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertCircle,
  ArrowUpDown,
  Banknote,
  Building2,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Copy,
  CreditCard,
  ExternalLink,
  FileText,
  Filter,
  HeartHandshake,
  HelpCircle,
  Landmark,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ServerCrash,
  SlidersHorizontal,
  Trash2,
  Undo2,
  UserRound,
  WalletCards,
  X,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import { ClientResponseError } from 'pocketbase'

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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { getFileUrl } from '@/lib/pocketbase/files'
import { apiMessage } from '@/lib/api-error'
import { formatCurrency, formatCompactCurrency, formatDate, getLocalDateStr } from '@/lib/format'
import { calcularFaturaCartao } from '@/lib/cartao-fatura'
import { can } from '@/lib/permissions'
import { cadastrosService } from '@/services/cadastros'
import { useRealtime } from '@/hooks/use-realtime'
import { despesasService } from '@/services/despesas'
import { financeService } from '@/services/finance'
import { CONTA_TIPO_PAGAMENTO_LABELS } from '@/types/domain'
import type {
  Categoria,
  Conta,
  ContaTipoPagamento,
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
  return getLocalDateStr().slice(0, 7)
}

function formatCompetenciaDisplay(comp: string) {
  if (!comp || !comp.includes('-')) return comp
  const [y, m] = comp.split('-')
  const date = new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1)
  return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
}

interface CompromissoAnualRowProps {
  compromisso: DespesaCompromisso
  ocorrenciaMes?: DespesaOcorrencia
  ultimaOcorrenciaPaga?: DespesaOcorrencia
  competencia: string
  onBaixarOcorrencia: (oc: DespesaOcorrencia) => void
  onRegistrarPagamentoRetroativo: () => void
  onEstornarOcorrencia: (oc: DespesaOcorrencia) => void
  onEditarCompromisso: () => void
  onDuplicarCompromisso?: () => void
  onExcluirCompromisso: () => void
  onExcluirOcorrencia: (oc: DespesaOcorrencia) => void
  canEdit: boolean
}

function CompromissoAnualRow({
  compromisso,
  ocorrenciaMes,
  ultimaOcorrenciaPaga,
  competencia,
  onBaixarOcorrencia,
  onRegistrarPagamentoRetroativo,
  onEstornarOcorrencia,
  onEditarCompromisso,
  onDuplicarCompromisso,
  onExcluirCompromisso,
  onExcluirOcorrencia,
  canEdit,
}: CompromissoAnualRowProps) {
  const isPagaNoMes = ocorrenciaMes?.status === 'paga'
  const tag = compromisso.expand?.tag
  const categoria = compromisso.expand?.categoria
  const contaPadrao = ocorrenciaMes?.expand?.conta || compromisso.expand?.conta_padrao

  const titularTipo = compromisso.titular_tipo || (compromisso.empresa ? 'cnpj' : 'cpf')
  const titularNome =
    titularTipo === 'cnpj'
      ? compromisso.expand?.titular_empresa?.nome_fantasia ||
        compromisso.expand?.empresa?.nome_fantasia ||
        'Empresa (CNPJ)'
      : compromisso.expand?.titular_pessoa?.nome ||
        compromisso.expand?.pessoa?.nome ||
        'Pessoal (CPF)'

  const valor =
    ocorrenciaMes?.valor_pago ||
    ocorrenciaMes?.valor_previsto ||
    ultimaOcorrenciaPaga?.valor_pago ||
    compromisso.valor_estimado ||
    compromisso.valor_parcela ||
    0

  // Cálculo do mês e dia de renovação do ciclo anual
  const startDate = compromisso.data_inicio ? new Date(compromisso.data_inicio) : new Date()
  const diaVenc = compromisso.dia_vencimento || startDate.getUTCDate() || 10
  const mesVenc = !isNaN(startDate.getTime()) ? startDate.getUTCMonth() + 1 : 1

  // Determina se a competência em exibição coincide com o mês da renovação
  const mesCompetenciaNum = parseInt(competencia.slice(5, 7), 10)
  const isMesDeRenovacao = mesCompetenciaNum === mesVenc

  // Identifica se o ciclo anual já foi quitado
  // Critério: já paga no mês OU há ocorrência paga recente e não estamos com ocorrência pendente no mês de renovação
  const dataPagamentoFormatada = isPagaNoMes
    ? ocorrenciaMes?.data_pagamento
      ? formatDate(ocorrenciaMes.data_pagamento)
      : ''
    : ultimaOcorrenciaPaga?.data_pagamento
      ? formatDate(ultimaOcorrenciaPaga.data_pagamento)
      : ''

  const cicloPagoSemRenovacaoPendente = isPagaNoMes || (!isMesDeRenovacao && !!ultimaOcorrenciaPaga)

  return (
    <div className="group flex flex-col gap-3 p-3.5 transition hover:bg-secondary/40 sm:flex-row sm:items-center sm:justify-between sm:p-4">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        <span
          className={`mt-1 h-3 w-3 shrink-0 rounded-full ${
            isPagaNoMes ? 'bg-success ring-4 ring-success/15' : 'bg-primary ring-4 ring-primary/15'
          }`}
          title={isPagaNoMes ? 'Paga nesta competência' : 'Assinatura ativa'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-foreground text-sm">{compromisso.descricao}</span>

            {/* Badge Titular */}
            <Badge
              variant="outline"
              className="text-[10px] font-semibold flex items-center gap-1 border-primary/30 bg-primary/5 text-primary"
            >
              {titularTipo === 'cnpj' ? (
                <Building2 className="h-3 w-3" />
              ) : (
                <UserRound className="h-3 w-3" />
              )}
              {titularNome}
            </Badge>

            {/* Destino / Centro de Custo */}
            {tag && (
              <Badge
                variant="secondary"
                className="text-[10px] font-medium"
                style={{ borderColor: tag.cor, color: tag.cor }}
              >
                Destino: {tag.nome}
              </Badge>
            )}

            {/* Categoria */}
            {categoria && (
              <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {categoria.nome}
              </span>
            )}

            {/* Status no ciclo atual */}
            {isPagaNoMes ? (
              <Badge className="bg-success/15 text-success border-success/30 text-[10px] font-bold">
                <CheckCircle2 className="mr-1 h-3 w-3" /> Paga nesta competência ({competencia})
              </Badge>
            ) : isMesDeRenovacao ? (
              <Badge
                variant="outline"
                className="text-[10px] font-bold border-amber-500 bg-amber-50 text-amber-800 animate-pulse"
              >
                Mês de renovação anual ({String(diaVenc).padStart(2, '0')}/
                {String(mesVenc).padStart(2, '0')})
              </Badge>
            ) : cicloPagoSemRenovacaoPendente ? (
              <Badge
                variant="outline"
                className="text-[10px] font-semibold border-success/40 bg-success/10 text-success"
              >
                <CheckCircle2 className="mr-1 h-3 w-3" /> Pagamento realizado em{' '}
                {dataPagamentoFormatada || 'ciclo anterior'}
              </Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] font-medium text-muted-foreground">
                Ciclo Anual (Renova todo dia {diaVenc}/{String(mesVenc).padStart(2, '0')})
              </Badge>
            )}
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {compromisso.fornecedor && (
              <span>
                Para: <strong>{compromisso.fornecedor}</strong>
              </span>
            )}

            {contaPadrao && (
              <span>
                Sai de: <strong>{contaPadrao.nome}</strong>
              </span>
            )}

            <span>
              Cobrança anual:{' '}
              <strong>
                Dia {diaVenc}/{String(mesVenc).padStart(2, '0')}
              </strong>
            </span>

            {isPagaNoMes && ocorrenciaMes?.data_pagamento ? (
              <span className="text-success font-medium">
                Pago em: {formatDate(ocorrenciaMes.data_pagamento)}
              </span>
            ) : !isMesDeRenovacao && ultimaOcorrenciaPaga?.data_pagamento ? (
              <span className="text-success font-medium flex items-center gap-1">
                <CheckCircle2 className="h-3 w-3 inline text-success" />
                Pagamento realizado em {formatDate(ultimaOcorrenciaPaga.data_pagamento)}
              </span>
            ) : null}

            {compromisso.link_pagamento && (
              <a
                href={compromisso.link_pagamento}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline hover:text-primary/80"
              >
                <ExternalLink className="h-3 w-3" />
                Painel / Link
              </a>
            )}

            {compromisso.anexo_conta && (
              <a
                href={getFileUrl('despesas_compromisso', compromisso.id, compromisso.anexo_conta)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                title="Ver anexo / conta a pagar"
              >
                <FileText className="h-3 w-3" />
                Ver conta
              </a>
            )}

            {ocorrenciaMes?.comprovante_pagamento && (
              <a
                href={getFileUrl(
                  'despesas_ocorrencias',
                  ocorrenciaMes.id,
                  ocorrenciaMes.comprovante_pagamento,
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                title="Ver comprovante de pagamento"
              >
                <FileText className="h-3 w-3" />
                Comprovante
              </a>
            )}
          </div>

          {compromisso.observacoes && (
            <p className="mt-1 text-[11px] text-muted-foreground line-clamp-1 italic">
              {compromisso.observacoes}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 border-t border-border pt-2 sm:border-0 sm:pt-0 sm:justify-end">
        <div className="text-left sm:text-right">
          <p className="text-[10px] uppercase font-bold text-muted-foreground">
            {isPagaNoMes ? 'Valor Pago' : 'Valor Anual'}
          </p>
          <p
            className={`text-sm font-extrabold tabular-nums sm:text-base ${
              isPagaNoMes ? 'text-success' : 'text-primary'
            }`}
          >
            {formatCurrency(valor)}
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {canEdit && (
            <>
              {isPagaNoMes ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => ocorrenciaMes && onEstornarOcorrencia(ocorrenciaMes)}
                  title="Desfazer baixa"
                >
                  <Undo2 className="mr-1 h-3.5 w-3.5" /> Estornar
                </Button>
              ) : isMesDeRenovacao ? (
                ocorrenciaMes ? (
                  <Button
                    size="sm"
                    className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm"
                    onClick={() => onBaixarOcorrencia(ocorrenciaMes)}
                    title="Dar baixa na renovação anual"
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Atualizar / Pagar renovação
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm"
                    onClick={onRegistrarPagamentoRetroativo}
                    title="Registrar renovação anual da assinatura"
                  >
                    <RefreshCw className="mr-1 h-3.5 w-3.5" /> Atualizar / Pagar renovação
                  </Button>
                )
              ) : !cicloPagoSemRenovacaoPendente ? (
                // Fora do mês de renovação mas sem quitação do ciclo vigente
                <Button
                  size="sm"
                  className="h-8 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shadow-sm"
                  onClick={
                    ocorrenciaMes
                      ? () => onBaixarOcorrencia(ocorrenciaMes)
                      : onRegistrarPagamentoRetroativo
                  }
                  title="Atualizar pagamento pendente da assinatura"
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" /> Atualizar / Pagar renovação
                </Button>
              ) : null}

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
                onClick={onDuplicarCompromisso}
                title="Duplicar despesa (criar nova a partir desta)"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground sm:opacity-0 sm:group-hover:opacity-100"
                onClick={onEditarCompromisso}
                title="Editar compromisso anual"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                onClick={
                  ocorrenciaMes ? () => onExcluirOcorrencia(ocorrenciaMes) : onExcluirCompromisso
                }
                title={ocorrenciaMes ? 'Excluir ocorrência deste mês' : 'Excluir compromisso'}
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

export default function Despesas() {
  const { user } = useAuth()
  const { activeContext } = useAppContext()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()

  const currentCompetencia = params.get('competencia') || getInitialCompetencia()

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [isOverloaded, setIsOverloaded] = useState(false)

  // Cache de módulo/sessão para as tabelas de apoio fixas
  const apoioCacheRef = useRef<{
    contas: Conta[]
    categorias: Categoria[]
    tags: TagItem[]
    tiposDespesa: TipoDespesa[]
    metodosPagamento: MetodoPagamento[]
    tiposDizimo: TipoDizimo[]
    empresas: Empresa[]
    pessoas: Pessoa[]
  } | null>(null)

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
  const [assinaturasOcorrenciasAll, setAssinaturasOcorrenciasAll] = useState<DespesaOcorrencia[]>(
    [],
  )

  // Modo de visualização de cartões: 'mes' (mês selecionado) ou 'historico' (todas as compras / histórico completo)
  const [cartaoViewMode, setCartaoViewMode] = useState<Record<string, 'mes' | 'historico'>>({})
  const [cartaoExpanded, setCartaoExpanded] = useState<Record<string, boolean>>({})

  // Modais de ação
  const [baixaModal, setBaixaModal] = useState(false)
  const [ocorrenciaParaBaixar, setOcorrenciaParaBaixar] = useState<DespesaOcorrencia | null>(null)
  const [compromissoParaBaixar, setCompromissoParaBaixar] = useState<DespesaCompromisso | null>(
    null,
  )

  const [compromissoModal, setCompromissoModal] = useState(false)
  const [compromissoEditando, setCompromissoEditando] = useState<DespesaCompromisso | null>(null)
  const [isDuplicandoCompromisso, setIsDuplicandoCompromisso] = useState(false)
  const [defaultSecaoCompromisso, setDefaultSecaoCompromisso] = useState<SecaoDespesa>(
    'contas_mensais_pix_boleto',
  )
  const [defaultContaCompromissoId, setDefaultContaCompromissoId] = useState<string | undefined>()
  const [defaultMetodoCompromissoId, setDefaultMetodoCompromissoId] = useState<string | undefined>()

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

  // Filtro de Competência de Apuração: 'vencimento' (padrão) | 'pagamento'
  const [filtroDataCompetencia, setFiltroDataCompetencia] = useState<'vencimento' | 'pagamento'>(
    () => {
      try {
        const saved = localStorage.getItem('despesas_filtro_data_competencia')
        if (saved === 'vencimento' || saved === 'pagamento') {
          return saved
        }
      } catch (e) {
        console.warn('Erro ao ler filtro de data de competência do localStorage:', e)
      }
      return 'vencimento'
    },
  )

  const handleFiltroDataCompetenciaChange = (value: 'vencimento' | 'pagamento') => {
    setFiltroDataCompetencia(value)
    try {
      localStorage.setItem('despesas_filtro_data_competencia', value)
    } catch (e) {
      console.warn('Erro ao salvar filtro de data de competência no localStorage:', e)
    }
  }

  // Ordenação: 'urgente' (mais urgente primeiro: pendentes vencidas/hoje/futuras no topo) | 'recente' (mais tarde primeiro)
  const [sortBy, setSortBy] = useState<'urgente' | 'recente'>(() => {
    try {
      const saved = localStorage.getItem('despesas_ordem_vencimento')
      if (saved === 'urgente' || saved === 'recente') {
        return saved
      }
    } catch (e) {
      console.warn('Erro ao ler ordem de vencimento do localStorage:', e)
    }
    return 'urgente'
  })

  const handleSortChange = (value: 'urgente' | 'recente') => {
    setSortBy(value)
    try {
      localStorage.setItem('despesas_ordem_vencimento', value)
    } catch (e) {
      console.warn('Erro ao salvar ordem de vencimento no localStorage:', e)
    }
  }

  // Ocorrências atrasadas (status 'prevista' com vencimento anterior ao mês atual)
  const [ocorrenciasAtrasadas, setOcorrenciasAtrasadas] = useState<DespesaOcorrencia[]>([])

  const loadData = useCallback(async () => {
    try {
      // 1. Carrega dados de apoio essenciais (contas, categorias, cadastros) com cache de módulo/sessão
      if (!apoioCacheRef.current) {
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
        apoioCacheRef.current = {
          contas: cts,
          categorias: cats,
          tags: tgs,
          tiposDespesa: tps,
          metodosPagamento: mts,
          tiposDizimo: dzs,
          empresas: emps,
          pessoas: pess,
        }
      }

      setContas(apoioCacheRef.current.contas)
      setCategorias(apoioCacheRef.current.categorias)
      setTags(apoioCacheRef.current.tags)
      setTiposDespesa(apoioCacheRef.current.tiposDespesa)
      setMetodosPagamento(apoioCacheRef.current.metodosPagamento)
      setTiposDizimo(apoioCacheRef.current.tiposDizimo)
      setEmpresas(apoioCacheRef.current.empresas)
      setPessoas(apoioCacheRef.current.pessoas)

      // Pequeno atraso para escalonar e não colidir com as consultas seguintes
      await new Promise((r) => setTimeout(r, 60))

      // Data REAL de hoje no fuso oficial America/Sao_Paulo (independente da competência que o usuário estiver navegando)
      const realTodayStr = getLocalDateStr() // 'YYYY-MM-DD'
      const realCurrentComp = realTodayStr.slice(0, 7) // 'YYYY-MM'

      // 2. Carrega compromissos e ocorrências da competência atual (respeitando o modo vencimento vs pagamento)
      const isModoPagamento = filtroDataCompetencia === 'pagamento'
      const [anoC, mesC] = currentCompetencia.split('-').map((v) => parseInt(v, 10))
      const ultimoDiaMes = new Date(Date.UTC(anoC, mesC, 0)).getUTCDate()
      const dataInicioMes = `${currentCompetencia}-01`
      const dataFimMes = `${currentCompetencia}-${String(ultimoDiaMes).padStart(2, '0')} 23:59:59`

      // Se filtroDataCompetencia === 'pagamento':
      // Busca ocorrências pagas no mês pela data_pagamento E previstas cuja competência = currentCompetencia
      const filterOcorrencias = isModoPagamento
        ? `(status = 'paga' && data_pagamento >= '${dataInicioMes}' && data_pagamento <= '${dataFimMes}') || (status = 'prevista' && competencia = '${currentCompetencia}')`
        : `competencia = '${currentCompetencia}'`

      const [allComps, allOcs] = await Promise.all([
        despesasService.listCompromissos(),
        despesasService.listOcorrencias({
          filter: filterOcorrencias,
        }),
      ])

      // Pequeno atraso para escalonar antes das 3 consultas pesadas
      await new Promise((r) => setTimeout(r, 80))

      // 3. Carrega consultas secundárias (cartões, assinaturas anuais e atrasadas) escalonadas para evitar rajada
      const allOcsCartao = await despesasService.listOcorrencias({
        filter: `secao = 'cartoes_credito'`,
        sort: '-data_vencimento',
      })
      await new Promise((r) => setTimeout(r, 60))

      const allOcsAtrasadas = await despesasService.listOcorrencias({
        filter: `status = 'prevista' && (competencia < '${realCurrentComp}' || (competencia = '${realCurrentComp}' && data_vencimento < '${realTodayStr} 23:59:59'))`,
        sort: 'data_vencimento',
      })
      await new Promise((r) => setTimeout(r, 60))

      const allOcsAssinaturas = await despesasService.listOcorrencias({
        filter: `secao = 'assinaturas_anuais'`,
        sort: '-data_pagamento',
      })

      // Função de correspondência ao grupo de contexto ativo
      const isCompromissoInContext = (comp: DespesaCompromisso): boolean => {
        if (activeContext.isAll) return true
        const pId = comp.pessoa
        const eId = comp.empresa
        const cId = comp.conta_padrao

        if (pId && activeContext.pessoaIds.includes(pId)) return true
        if (eId && activeContext.empresaIds.includes(eId)) return true
        if (cId && activeContext.contaIds.includes(cId)) return true
        // Rede de segurança: conta padrão órfã (sem nenhum grupo) não fica invisível
        if (cId && !activeContext.linkedContaIds.includes(cId)) return true

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
        // Rede de segurança: conta órfã (sem nenhum grupo) não fica invisível
        if (cId && !activeContext.linkedContaIds.includes(cId)) return true

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
      const ocsAssinaturasAll = allOcsAssinaturas.filter(isOcorrenciaInContext)

      setCompromissos(comps)
      setOcorrencias(ocs)
      setCartaoOcorrenciasAll(ocsCartaoAll)
      setOcorrenciasAtrasadas(ocsAtrasadas)
      setAssinaturasOcorrenciasAll(ocsAssinaturasAll)
      setIsOverloaded(false)
    } catch (err: any) {
      const is429 =
        (err instanceof ClientResponseError && err.status === 429) ||
        err?.status === 429 ||
        String(err?.message || '').includes('429')

      if (is429) {
        setIsOverloaded(true)
      } else {
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar despesas',
          description: apiMessage(err),
        })
      }
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [activeContext, currentCompetencia, filtroDataCompetencia, toast])

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

  // Data real de hoje em America/Sao_Paulo para cálculo de vencimento/atraso
  const realTodayStr = getLocalDateStr() // 'YYYY-MM-DD'

  // Filtragem das ocorrências atrasadas com base na DATA REAL de hoje
  // Defesa extra: NUNCA listar como atrasada ocorrência com competência anterior à data_inicio do compromisso
  const filteredOcorrenciasAtrasadas = useMemo(() => {
    return ocorrenciasAtrasadas.filter((oc) => {
      const comp = oc.expand?.compromisso
      const desc = comp?.descricao || ''
      const forn = comp?.fornecedor || ''

      // Validação de consistência: ignorar fantasmas retroativos à data_inicio do compromisso
      if (comp?.data_inicio && oc.competencia) {
        const compStartStr = String(comp.data_inicio).slice(0, 7)
        if (oc.competencia < compStartStr) {
          return false
        }
      }

      // Validação estrita: para ser considerada atrasada, a data de vencimento DEVE ser estritamente anterior à data real de hoje
      const dueStr = oc.data_vencimento ? oc.data_vencimento.slice(0, 10) : ''
      if (dueStr && dueStr >= realTodayStr) {
        return false
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

  // Função utilitária para ordenação inteligente de ocorrências:
  // Separa não pagas (previstas) das já pagas (pagas sempre após as pendentes).
  // - Em 'urgente' (default):
  //     * Pendentes vencidas e que vencem hoje no topo em ordem cronológica (mais antiga primeiro),
  //       seguidas pelas pendentes futuras em ordem cronológica crescente (mais próxima primeiro).
  //     * Desempate estável: descrição -> ID -> valor decrescente.
  // - Em 'recente' (mais tarde primeiro):
  //     * Inversão completa da urgência: pendentes futuras com vencimento mais distante no topo
  //       (ordem cronológica decrescente), seguidas pelas vencidas/hoje (com vencimento menos atrasado antes do mais antigo).
  //     * Desempate estável: descrição -> ID -> valor decrescente.
  // - Pagas: agrupadas ao final em ambas as opções, ordenadas cronologicamente de forma consistente.
  const sortOcorrenciasList = useCallback(
    (list: DespesaOcorrencia[]) => {
      const copy = [...list]
      const today = realTodayStr // 'YYYY-MM-DD'

      return copy.sort((a, b) => {
        const isPagaA = a.status === 'paga'
        const isPagaB = b.status === 'paga'

        // 1. As pagas ficam sempre abaixo das não pagas para garantir que as que precisam ser pagas fiquem no topo
        if (isPagaA !== isPagaB) {
          return isPagaA ? 1 : -1
        }

        // Se ambas são pagas: ordena de acordo com sortBy (recente: mais recente primeiro; urgente: mais antiga primeiro)
        if (isPagaA && isPagaB) {
          const dtA = (a.data_pagamento || a.data_vencimento || '').slice(0, 10)
          const dtB = (b.data_pagamento || b.data_vencimento || '').slice(0, 10)
          const cmpPago = sortBy === 'recente' ? dtB.localeCompare(dtA) : dtA.localeCompare(dtB)
          if (cmpPago !== 0) return cmpPago
          const descA = a.expand?.compromisso?.descricao || a.observacoes || ''
          const descB = b.expand?.compromisso?.descricao || b.observacoes || ''
          const cmpDesc = descA.localeCompare(descB)
          if (cmpDesc !== 0) return cmpDesc
          return a.id.localeCompare(b.id)
        }

        // Se ambas são pendentes (previstas):
        const dueA = a.data_vencimento ? a.data_vencimento.slice(0, 10) : '9999-99-99'
        const dueB = b.data_vencimento ? b.data_vencimento.slice(0, 10) : '9999-99-99'

        const isUrgenteA = dueA <= today
        const isUrgenteB = dueB <= today

        if (sortBy === 'urgente') {
          // Mais urgente primeiro: vencidas e hoje no topo
          if (isUrgenteA && !isUrgenteB) return -1
          if (!isUrgenteA && isUrgenteB) return 1

          // Ambas vencidas/hoje OU ambas futuras: ordem crescente de vencimento (mais próxima/urgente primeiro)
          const cmp = dueA.localeCompare(dueB)
          if (cmp !== 0) return cmp
        } else {
          // 'recente': Mais tarde primeiro — datas mais distantes (futuras) no topo; vencidas/hoje ao final das pendentes
          if (!isUrgenteA && isUrgenteB) return -1
          if (isUrgenteA && !isUrgenteB) return 1

          // Ambas futuras OU ambas vencidas/hoje: ordem decrescente de vencimento (data mais distante primeiro)
          const cmp = dueB.localeCompare(dueA)
          if (cmp !== 0) return cmp
        }

        // Desempate consistente e determinístico
        const descA = a.expand?.compromisso?.descricao || a.observacoes || ''
        const descB = b.expand?.compromisso?.descricao || b.observacoes || ''
        const cmpDesc = descA.localeCompare(descB)
        if (cmpDesc !== 0) return cmpDesc

        const valDiff = (b.valor_previsto || 0) - (a.valor_previsto || 0)
        if (valDiff !== 0) return valDiff

        return a.id.localeCompare(b.id)
      })
    },
    [realTodayStr, sortBy],
  )

  const compromissosMap = useMemo(() => {
    return new Map<string, DespesaCompromisso>(compromissos.map((c) => [c.id, c]))
  }, [compromissos])

  // Novo agrupamento estruturado por Conta (com Abas), Cartões, Dinheiro, Assinaturas Anuais e Sem Conta
  const despesasAgrupadas = useMemo(() => {
    return despesasService.agruparDespesasParaVisualizacao({
      ocorrencias: filteredOcorrencias,
      contas,
      compromissos,
      metodosPagamento,
      sortFn: sortOcorrenciasList,
    })
  }, [filteredOcorrencias, contas, compromissos, metodosPagamento, sortOcorrenciasList])

  // Seção: Compromissos anuais ativos (visíveis em qualquer competência) + ocorrências do mês
  const compromissosAnuais = useMemo(() => {
    const filtered = compromissos.filter((c) => {
      const isAnual = c.secao === 'assinaturas_anuais' || c.regra_repeticao === 'anual'
      if (!isAnual || c.ativo === false) return false

      const desc = c.descricao || ''
      const forn = c.fornecedor || ''
      const matchesSearch =
        !search ||
        desc.toLowerCase().includes(search.toLowerCase()) ||
        forn.toLowerCase().includes(search.toLowerCase())

      const matchesTag = filterTag === 'all' || c.tag === filterTag
      const matchesCategoria = filterCategoria === 'all' || c.categoria === filterCategoria
      const matchesTitular =
        filterTitular === 'all' ||
        (filterTitular === 'cpf' && (c.titular_tipo === 'cpf' || c.contexto_tipo === 'pessoal')) ||
        (filterTitular === 'cnpj' && (c.titular_tipo === 'cnpj' || c.contexto_tipo === 'empresa'))

      // Se filtro de status foi selecionado, verifica compatibilidade com o status deste ciclo
      if (filterStatus !== 'all') {
        const oc = ocorrencias.find((o) => o.compromisso === c.id)
        const st = oc?.status || 'prevista'
        if (st !== filterStatus) return false
      }

      return matchesSearch && matchesTag && matchesCategoria && matchesTitular
    })

    // Ordenação dos compromissos anuais respeitando sortBy
    const [anoComp] = currentCompetencia.split('-').map((v) => parseInt(v, 10))
    const today = realTodayStr

    return [...filtered].sort((cA, cB) => {
      const ocA = ocorrencias.find((o) => o.compromisso === cA.id)
      const ocB = ocorrencias.find((o) => o.compromisso === cB.id)

      const isPagaA = ocA?.status === 'paga'
      const isPagaB = ocB?.status === 'paga'

      // Não pagas sobem
      if (isPagaA !== isPagaB) {
        return isPagaA ? 1 : -1
      }

      // Calcula data de renovação/vencimento
      const dateA = cA.data_inicio ? new Date(cA.data_inicio) : new Date()
      const diaA = cA.dia_vencimento || dateA.getUTCDate() || 10
      const mesA = !isNaN(dateA.getTime()) ? dateA.getUTCMonth() + 1 : 1
      const dueStrA = `${anoComp || 2025}-${String(mesA).padStart(2, '0')}-${String(diaA).padStart(2, '0')}`

      const dateB = cB.data_inicio ? new Date(cB.data_inicio) : new Date()
      const diaB = cB.dia_vencimento || dateB.getUTCDate() || 10
      const mesB = !isNaN(dateB.getTime()) ? dateB.getUTCMonth() + 1 : 1
      const dueStrB = `${anoComp || 2025}-${String(mesB).padStart(2, '0')}-${String(diaB).padStart(2, '0')}`

      if (sortBy === 'urgente') {
        if (!isPagaA) {
          const isUrgenteA = dueStrA <= today
          const isUrgenteB = dueStrB <= today
          if (isUrgenteA && !isUrgenteB) return -1
          if (!isUrgenteA && isUrgenteB) return 1
        }
        const cmp = dueStrA.localeCompare(dueStrB)
        if (cmp !== 0) return cmp
        const descCmp = (cA.descricao || '').localeCompare(cB.descricao || '')
        if (descCmp !== 0) return descCmp
        return cA.id.localeCompare(cB.id)
      } else {
        if (!isPagaA) {
          const isUrgenteA = dueStrA <= today
          const isUrgenteB = dueStrB <= today
          // Em 'recente': datas mais distantes (futuras) no topo; vencidas/hoje ao final das pendentes
          if (!isUrgenteA && isUrgenteB) return -1
          if (isUrgenteA && !isUrgenteB) return 1
        }
        const cmp = dueStrB.localeCompare(dueStrA)
        if (cmp !== 0) return cmp
        const descCmp = (cA.descricao || '').localeCompare(cB.descricao || '')
        if (descCmp !== 0) return descCmp
        return cA.id.localeCompare(cB.id)
      }
    })
  }, [
    compromissos,
    search,
    filterTag,
    filterCategoria,
    filterTitular,
    filterStatus,
    ocorrencias,
    currentCompetencia,
    realTodayStr,
    sortBy,
  ])

  // Ocorrências da seção de assinaturas anuais na competência atual
  const secaoAssinaturasOcorrencias = useMemo(
    () => filteredOcorrencias.filter((oc) => oc.secao === 'assinaturas_anuais'),
    [filteredOcorrencias],
  )

  // Seção 3: Cartões de Crédito (Agrupados por Cartão) — somente cartões ativos
  const cartaoContas = useMemo(
    () =>
      contas
        .filter((c) => c.tipo === 'cartao' && c.ativa)
        .sort((a, b) => {
          const ordemA = a.ordem ?? 999999
          const ordemB = b.ordem ?? 999999
          if (ordemA !== ordemB) return ordemA - ordemB
          return (a.nome || '').localeCompare(b.nome || '')
        }),
    [contas],
  )

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
        abasMes: Map<ContaTipoPagamento, DespesaOcorrencia[]>
        abasTodas: Map<ContaTipoPagamento, DespesaOcorrencia[]>
      }
    >()

    const createCartaoEntry = (conta: Conta) => {
      const tipos = despesasService.getTiposPagamentoConta(conta)
      const abasMes = new Map<ContaTipoPagamento, DespesaOcorrencia[]>()
      const abasTodas = new Map<ContaTipoPagamento, DespesaOcorrencia[]>()
      tipos.forEach((t) => {
        abasMes.set(t, [])
        abasTodas.set(t, [])
      })
      return {
        conta,
        ocorrenciasMes: [] as DespesaOcorrencia[],
        ocorrenciasTodas: [] as DespesaOcorrencia[],
        abasMes,
        abasTodas,
      }
    }

    // Inicializa todos os cartões cadastrados ativos
    cartaoContas.forEach((conta) => {
      map.set(conta.id, createCartaoEntry(conta))
    })

    const alocarEmAba = (
      entry: ReturnType<typeof createCartaoEntry>,
      oc: DespesaOcorrencia,
      target: 'mes' | 'todas',
    ) => {
      const comp =
        oc.expand?.compromisso || (oc.compromisso ? compromissosMap.get(oc.compromisso) : undefined)
      const metodoObj =
        comp?.expand?.metodo_pagamento ||
        (comp?.metodo_pagamento
          ? metodosPagamento.find((m) => m.id === comp.metodo_pagamento)
          : null)

      const tipos = despesasService.getTiposPagamentoConta(entry.conta)
      const tipoAlocado = despesasService.mapearMetodoParaTipoPagamento(metodoObj, tipos)

      const abasMap = target === 'mes' ? entry.abasMes : entry.abasTodas
      if (!abasMap.has(tipoAlocado)) {
        abasMap.set(tipoAlocado, [])
      }
      abasMap.get(tipoAlocado)!.push(oc)

      if (target === 'mes') {
        entry.ocorrenciasMes.push(oc)
      } else {
        entry.ocorrenciasTodas.push(oc)
      }
    }

    // Ocorrências do mês: somente aloca nos grupos de cartões ativos
    filteredOcorrencias
      .filter((oc) => oc.secao === 'cartoes_credito')
      .forEach((oc) => {
        const contaId = oc.conta || oc.expand?.compromisso?.conta_padrao || ''
        // Cartão inativo/arquivado não gera grupo em cartões; suas ocorrências caem na rede de segurança "Sem Conta Definida"
        if (!contaId || !map.has(contaId)) {
          return
        }
        alocarEmAba(map.get(contaId)!, oc, 'mes')
      })

    // Todas as ocorrências do cartão (histórico geral): somente cartões ativos
    filteredCartaoOcorrenciasAll.forEach((oc) => {
      const contaId = oc.conta || oc.expand?.compromisso?.conta_padrao || ''
      if (!contaId || !map.has(contaId)) {
        return
      }
      alocarEmAba(map.get(contaId)!, oc, 'todas')
    })

    return Array.from(map.values()).map((item) => {
      const tipos = despesasService.getTiposPagamentoConta(item.conta)
      const abasObj: {
        tipo: ContaTipoPagamento
        ocorrenciasMes: DespesaOcorrencia[]
        ocorrenciasTodas: DespesaOcorrencia[]
      }[] = []

      tipos.forEach((t) => {
        abasObj.push({
          tipo: t,
          ocorrenciasMes: sortOcorrenciasList(item.abasMes.get(t) || []),
          ocorrenciasTodas: sortOcorrenciasList(item.abasTodas.get(t) || []),
        })
      })

      // Se houver tipos extras dinâmicos
      item.abasMes.forEach((_, t) => {
        if (!tipos.includes(t)) {
          abasObj.push({
            tipo: t,
            ocorrenciasMes: sortOcorrenciasList(item.abasMes.get(t) || []),
            ocorrenciasTodas: sortOcorrenciasList(item.abasTodas.get(t) || []),
          })
        }
      })

      return {
        conta: item.conta,
        tipos,
        abas: abasObj,
        ocorrenciasMes: sortOcorrenciasList(item.ocorrenciasMes),
        ocorrenciasTodas: sortOcorrenciasList(item.ocorrenciasTodas),
      }
    })
  }, [
    cartaoContas,
    filteredOcorrencias,
    filteredCartaoOcorrenciasAll,
    contas,
    sortOcorrenciasList,
    compromissosMap,
    metodosPagamento,
  ])

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

  const handleOpenNovoCompromisso = (
    secao: SecaoDespesa = 'contas_mensais_pix_boleto',
    options?: { contaId?: string; metodoId?: string },
  ) => {
    setIsDuplicandoCompromisso(false)
    setCompromissoEditando(null)
    setDefaultSecaoCompromisso(secao)
    setDefaultContaCompromissoId(options?.contaId)
    setDefaultMetodoCompromissoId(options?.metodoId)
    setCompromissoModal(true)
  }

  const handleOpenEditarCompromisso = (comp: DespesaCompromisso) => {
    setIsDuplicandoCompromisso(false)
    setCompromissoEditando(comp)
    setDefaultContaCompromissoId(undefined)
    setDefaultMetodoCompromissoId(undefined)
    setCompromissoModal(true)
  }

  const handleOpenDuplicarCompromisso = (comp: DespesaCompromisso) => {
    setIsDuplicandoCompromisso(true)
    setCompromissoEditando(comp)
    setDefaultSecaoCompromisso(comp.secao || 'contas_mensais_pix_boleto')
    setDefaultContaCompromissoId(comp.conta_padrao)
    setDefaultMetodoCompromissoId(comp.metodo_pagamento)
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

  if (isOverloaded) {
    return (
      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-dashed border-amber-300 bg-amber-50/50 p-8 text-center shadow-soft">
        <span className="mb-4 grid h-14 w-14 place-items-center rounded-2xl bg-amber-100 text-amber-700">
          <ServerCrash className="h-7 w-7" />
        </span>
        <h3 className="text-lg font-bold text-foreground">
          Sobrecarga temporária, tente novamente
        </h3>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          O servidor está processando muitas solicitações simultâneas no momento. Aguarde alguns
          instantes e tente recarregar os dados.
        </p>
        <div className="mt-6 flex items-center gap-3">
          <Button
            onClick={() => {
              setLoading(true)
              loadData()
            }}
            className="gap-2"
          >
            <RotateCcw className="h-4 w-4" /> Recarregar agora
          </Button>
        </div>
      </div>
    )
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
          </div>
        }
      />

      {/* SELETOR DE MÊS / COMPETÊNCIA & RESUMO DOS TOTAIS */}
      <div className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
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

            {/* Dropdown Data de vencimento vs Data de pagamento */}
            <div className="sm:border-l sm:border-border sm:pl-4">
              <p className="micro-label mb-1">Filtrar competência por</p>
              <Select
                value={filtroDataCompetencia}
                onValueChange={(val) =>
                  handleFiltroDataCompetenciaChange(val as 'vencimento' | 'pagamento')
                }
              >
                <SelectTrigger
                  className="h-8 w-48 text-xs font-semibold border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition"
                  title="Defina se as despesas são apuradas pela data de vencimento ou pagamento"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="vencimento">
                    <div className="flex flex-col py-0.5">
                      <span className="font-semibold text-xs text-foreground">
                        Data de vencimento
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Padrão: vencimento no mês
                      </span>
                    </div>
                  </SelectItem>
                  <SelectItem value="pagamento">
                    <div className="flex flex-col py-0.5">
                      <span className="font-semibold text-xs text-foreground">
                        Data de pagamento
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Pagas no mês + previstas
                      </span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
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
              <SelectItem value="contas_mensais_pix_boleto">
                Contas & Métodos de Pagamento
              </SelectItem>
              <SelectItem value="cartoes_credito">Cartões de Crédito</SelectItem>
              <SelectItem value="assinaturas_anuais">Assinaturas Anuais</SelectItem>
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

          {/* Ordenação por Vencimento */}
          <div className="flex items-center gap-1.5 ml-auto">
            <Select value={sortBy} onValueChange={handleSortChange}>
              <SelectTrigger
                className="h-9 w-56 text-xs font-medium border-primary/30 bg-primary/5 text-primary hover:bg-primary/10 transition"
                title="Critério de ordenação da lista"
              >
                <div className="flex items-center gap-1.5 truncate">
                  <ArrowUpDown className="h-3.5 w-3.5 shrink-0 text-primary" />
                  <span className="truncate">
                    {sortBy === 'urgente'
                      ? 'Vencimento: mais urgente primeiro'
                      : 'Vencimento: mais tarde primeiro'}
                  </span>
                </div>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="urgente">
                  <div className="flex flex-col py-0.5">
                    <span className="font-semibold text-xs text-foreground">
                      Vencimento (mais urgente primeiro)
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Vencidas e a pagar hoje no topo
                    </span>
                  </div>
                </SelectItem>
                <SelectItem value="recente">
                  <div className="flex flex-col py-0.5">
                    <span className="font-semibold text-xs text-foreground">
                      Vencimento (mais tarde primeiro)
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      Datas mais distantes no topo
                    </span>
                  </div>
                </SelectItem>
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
              {filteredOcorrenciasAtrasadas.map((oc) => {
                const compObj =
                  oc.expand?.compromisso ||
                  (oc.compromisso ? compromissosMap.get(oc.compromisso) : undefined)
                return (
                  <OcorrenciaRow
                    key={oc.id}
                    ocorrencia={oc}
                    isAtrasada
                    compromissoFallback={compObj}
                    onBaixar={() => handleOpenBaixa(oc)}
                    onEstornar={() => setEstornando(oc)}
                    onEditarCompromisso={() => compObj && handleOpenEditarCompromisso(compObj)}
                    onDuplicarCompromisso={() => compObj && handleOpenDuplicarCompromisso(compObj)}
                    onExcluirCompromisso={() => compObj && setDeletandoCompromisso(compObj)}
                    onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                    canEdit={can(user?.role, 'writeFinance')}
                  />
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          AS 3 SEÇÕES PRINCIPAIS CONFORME A PLANILHA DO USUÁRIO
         ======================================================== */}
      <div className="mt-8 space-y-8">
        {/* SEÇÃO 1: Contas Bancárias e Caixas (Agrupadas por Conta com Abas por Tipo de Pagamento) */}
        {(filterSecao === 'all' || filterSecao === 'contas_mensais_pix_boleto') && (
          <section className="space-y-6">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Contas & Métodos de Pagamento
                </h2>
                <p className="text-xs text-muted-foreground">
                  Despesas e compromissos organizados por conta bancária e divididos em abas por
                  método (Pix, Boletos, Débito, Transferência).
                </p>
              </div>
            </div>

            {despesasAgrupadas.contasNaoCartao.length === 0 ? (
              <div className="overflow-hidden rounded-2xl border border-border bg-white p-8 text-center text-sm text-muted-foreground shadow-soft">
                Nenhuma conta bancária possui despesas nesta competência.
              </div>
            ) : (
              <div className="space-y-6">
                {despesasAgrupadas.contasNaoCartao.map(({ conta, totalOcorrencias, abas }) => {
                  const abasComDespesas = abas.filter((aba) => aba.ocorrencias.length > 0)
                  const defaultTab = abasComDespesas[0]?.tipo || abas[0]?.tipo || 'pix'
                  const totalPrevistoConta = abas.reduce(
                    (sumAba, aba) =>
                      sumAba + aba.ocorrencias.reduce((s, o) => s + (o.valor_previsto || 0), 0),
                    0,
                  )
                  const totalPagoConta = abas.reduce(
                    (sumAba, aba) =>
                      sumAba +
                      aba.ocorrencias
                        .filter((o) => o.status === 'paga')
                        .reduce((s, o) => s + (o.valor_pago || o.valor_previsto || 0), 0),
                    0,
                  )

                  return (
                    <div
                      key={conta.id}
                      className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft transition-all"
                    >
                      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/25 p-4 sm:p-5">
                        <div className="flex items-center gap-3">
                          <span
                            className="grid h-11 w-11 place-items-center rounded-xl text-white shadow-xs"
                            style={{ background: conta.cor || '#1E40AF' }}
                          >
                            <Building2 className="h-6 w-6" />
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="text-base font-extrabold text-foreground sm:text-lg">
                                {conta.nome}
                              </h3>
                              {conta.natureza && (
                                <Badge
                                  variant="outline"
                                  className="font-semibold text-[10px] uppercase"
                                >
                                  {conta.natureza === 'juridica' ? 'PJ' : 'PF'}
                                </Badge>
                              )}
                              <Badge variant="secondary" className="text-[10px]">
                                {totalOcorrencias} {totalOcorrencias === 1 ? 'item' : 'itens'}
                              </Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {conta.tipo === 'caixa'
                                ? 'Conta Caixa / Espécie'
                                : 'Conta Corrente / Bancária'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <div className="rounded-xl border border-border bg-white px-3 py-1 text-right">
                            <p className="micro-label">Total Previsto</p>
                            <p className="text-sm font-extrabold tabular-nums text-foreground">
                              {formatCurrency(totalPrevistoConta)}
                            </p>
                          </div>
                          {totalPagoConta > 0 && (
                            <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-1 text-right">
                              <p className="micro-label text-success">Total Pago</p>
                              <p className="text-xs font-bold tabular-nums text-success">
                                {formatCurrency(totalPagoConta)}
                              </p>
                            </div>
                          )}
                          <PermissionButton
                            size="sm"
                            variant="outline"
                            allowed={can(user?.role, 'writeFinance')}
                            onClick={() =>
                              handleOpenNovoCompromisso('contas_mensais_pix_boleto', {
                                contaId: conta.id,
                              })
                            }
                            className="h-8 gap-1 text-xs"
                          >
                            <Plus className="h-3 w-3" /> Adicionar nesta conta
                          </PermissionButton>
                        </div>
                      </header>

                      <div className="p-4 sm:p-5">
                        <Tabs defaultValue={defaultTab} className="w-full">
                          <TabsList className="mb-4 flex h-auto flex-wrap gap-1 bg-muted/60 p-1">
                            {abas.map((aba) => {
                              const qtd = aba.ocorrencias.length
                              const totalAba = aba.ocorrencias.reduce(
                                (s, o) => s + (o.valor_previsto || 0),
                                0,
                              )
                              const label = CONTA_TIPO_PAGAMENTO_LABELS[aba.tipo] || aba.tipo

                              return (
                                <TabsTrigger
                                  key={aba.tipo}
                                  value={aba.tipo}
                                  className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs"
                                >
                                  <span>{label}</span>
                                  <Badge
                                    variant={qtd > 0 ? 'secondary' : 'outline'}
                                    className="h-5 px-1.5 text-[10px] font-bold"
                                  >
                                    {qtd}
                                  </Badge>
                                  {qtd > 0 && (
                                    <span className="hidden text-[11px] font-normal text-muted-foreground sm:inline">
                                      ({formatCompactCurrency(totalAba)})
                                    </span>
                                  )}
                                </TabsTrigger>
                              )
                            })}
                          </TabsList>

                          {abas.map((aba) => (
                            <TabsContent
                              key={aba.tipo}
                              value={aba.tipo}
                              className="m-0 focus-visible:outline-none"
                            >
                              {aba.ocorrencias.length === 0 ? (
                                <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                                  Nenhum pagamento via{' '}
                                  {CONTA_TIPO_PAGAMENTO_LABELS[aba.tipo] || aba.tipo} cadastrado
                                  nesta conta para este mês.
                                </div>
                              ) : (
                                <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-white shadow-2xs">
                                  {aba.ocorrencias.map((oc) => {
                                    const compObj =
                                      oc.expand?.compromisso ||
                                      (oc.compromisso
                                        ? compromissosMap.get(oc.compromisso)
                                        : undefined)
                                    return (
                                      <OcorrenciaRow
                                        key={oc.id}
                                        ocorrencia={oc}
                                        isModoPagamento={filtroDataCompetencia === 'pagamento'}
                                        compromissoFallback={compObj}
                                        onBaixar={() => handleOpenBaixa(oc)}
                                        onEstornar={() => setEstornando(oc)}
                                        onEditarCompromisso={() =>
                                          compObj && handleOpenEditarCompromisso(compObj)
                                        }
                                        onDuplicarCompromisso={() =>
                                          compObj && handleOpenDuplicarCompromisso(compObj)
                                        }
                                        onExcluirCompromisso={() =>
                                          compObj && setDeletandoCompromisso(compObj)
                                        }
                                        onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                                        canEdit={can(user?.role, 'writeFinance')}
                                      />
                                    )
                                  })}
                                </div>
                              )}
                            </TabsContent>
                          ))}
                        </Tabs>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {/* Subseção: Pagamentos em Dinheiro */}
            {despesasAgrupadas.dinheiro.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-soft">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-emerald-100 bg-emerald-50/60 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-600 text-white shadow-xs">
                      <Banknote className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-foreground">
                        Pagamentos em Dinheiro (Espécie)
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Despesas liquidadas ou previstas em moeda física
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-emerald-200 bg-white px-3 py-1 text-right">
                      <p className="micro-label">Total</p>
                      <p className="text-sm font-extrabold tabular-nums text-foreground">
                        {formatCurrency(
                          despesasAgrupadas.dinheiro.reduce(
                            (s, o) => s + (o.valor_previsto || 0),
                            0,
                          ),
                        )}
                      </p>
                    </div>
                  </div>
                </header>
                <div className="divide-y divide-border">
                  {despesasAgrupadas.dinheiro.map((oc) => {
                    const compObj =
                      oc.expand?.compromisso ||
                      (oc.compromisso ? compromissosMap.get(oc.compromisso) : undefined)
                    return (
                      <OcorrenciaRow
                        key={oc.id}
                        ocorrencia={oc}
                        isModoPagamento={filtroDataCompetencia === 'pagamento'}
                        compromissoFallback={compObj}
                        onBaixar={() => handleOpenBaixa(oc)}
                        onEstornar={() => setEstornando(oc)}
                        onEditarCompromisso={() => compObj && handleOpenEditarCompromisso(compObj)}
                        onDuplicarCompromisso={() =>
                          compObj && handleOpenDuplicarCompromisso(compObj)
                        }
                        onExcluirCompromisso={() => compObj && setDeletandoCompromisso(compObj)}
                        onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                        canEdit={can(user?.role, 'writeFinance')}
                      />
                    )
                  })}
                </div>
              </div>
            )}

            {/* Subseção: Sem Conta Definida (Órfãs ou Contas Excluídas) */}
            {despesasAgrupadas.semConta.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-amber-300 bg-white shadow-soft">
                <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-200 bg-amber-50/70 p-4 sm:p-5">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500 text-white shadow-xs">
                      <HelpCircle className="h-5 w-5" />
                    </span>
                    <div>
                      <h3 className="text-base font-extrabold text-foreground">
                        Sem Conta Definida
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        Despesas sem conta bancária associada ou cuja conta vinculada foi removida
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl border border-amber-200 bg-white px-3 py-1 text-right">
                      <p className="micro-label">Total</p>
                      <p className="text-sm font-extrabold tabular-nums text-foreground">
                        {formatCurrency(
                          despesasAgrupadas.semConta.reduce(
                            (s, o) => s + (o.valor_previsto || 0),
                            0,
                          ),
                        )}
                      </p>
                    </div>
                  </div>
                </header>
                <div className="divide-y divide-border">
                  {despesasAgrupadas.semConta.map((oc) => {
                    const compObj =
                      oc.expand?.compromisso ||
                      (oc.compromisso ? compromissosMap.get(oc.compromisso) : undefined)
                    return (
                      <OcorrenciaRow
                        key={oc.id}
                        ocorrencia={oc}
                        isModoPagamento={filtroDataCompetencia === 'pagamento'}
                        compromissoFallback={compObj}
                        onBaixar={() => handleOpenBaixa(oc)}
                        onEstornar={() => setEstornando(oc)}
                        onEditarCompromisso={() => compObj && handleOpenEditarCompromisso(compObj)}
                        onDuplicarCompromisso={() =>
                          compObj && handleOpenDuplicarCompromisso(compObj)
                        }
                        onExcluirCompromisso={() => compObj && setDeletandoCompromisso(compObj)}
                        onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                        canEdit={can(user?.role, 'writeFinance')}
                      />
                    )
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* SEÇÃO 2: Cartões de Crédito (cadastráveis) */}
        {(filterSecao === 'all' || filterSecao === 'cartoes_credito') && (
          <section className="space-y-4">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Cartões de Crédito
                </h2>
                <p className="text-xs text-muted-foreground">
                  Compras parceladas e rotativas separadas por cartão com controle da fatura, dia de
                  fechamento e vencimento.
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
                cartoesGrouped.map(({ conta, abas, ocorrenciasMes, ocorrenciasTodas }) => {
                  const currentMode = cartaoViewMode[conta.id] || 'mes'
                  const isHist = currentMode === 'historico'
                  // Toggle aberto por padrão
                  const isExpanded = cartaoExpanded[conta.id] !== false

                  // Totais do cartão no modo selecionado (usado no header)
                  const totalHeaderMes = ocorrenciasMes.reduce(
                    (sum, o) => sum + (o.valor_previsto || 0),
                    0,
                  )
                  const totalPagoHeaderMes = ocorrenciasMes
                    .filter((o) => o.status === 'paga')
                    .reduce((sum, o) => sum + (o.valor_pago || o.valor_previsto || 0), 0)

                  const totalHeaderTodas = ocorrenciasTodas.reduce(
                    (sum, o) => sum + (o.valor_previsto || 0),
                    0,
                  )
                  const totalPagoHeaderTodas = ocorrenciasTodas
                    .filter((o) => o.status === 'paga')
                    .reduce((sum, o) => sum + (o.valor_pago || o.valor_previsto || 0), 0)

                  // Se o cartão tem apenas 1 tipo de pagamento (ex: apenas 'credito'), omite a barra de abas
                  const hasSingleTab = abas.length <= 1

                  // Aba padrão: a primeira com ocorrências no modo ativo, senão a primeira do cadastro
                  const abasComOcorrencias = abas.filter((aba) =>
                    isHist ? aba.ocorrenciasTodas.length > 0 : aba.ocorrenciasMes.length > 0,
                  )
                  const defaultTab = abasComOcorrencias[0]?.tipo || abas[0]?.tipo || 'credito'

                  const countComprasExibidas = isHist
                    ? ocorrenciasTodas.length
                    : ocorrenciasMes.length

                  const renderOcorrenciasList = (
                    list: DespesaOcorrencia[],
                    tipoAba?: ContaTipoPagamento,
                  ) => {
                    if (list.length === 0) {
                      const tipoLabel = tipoAba
                        ? CONTA_TIPO_PAGAMENTO_LABELS[tipoAba] || tipoAba
                        : 'cartão'
                      return (
                        <div className="p-8 text-center text-xs text-muted-foreground">
                          {isHist
                            ? `Nenhuma compra ou pagamento via ${tipoLabel} realizada com este cartão.`
                            : `Nenhum pagamento via ${tipoLabel} cadastrado neste cartão para ${formatCompetenciaDisplay(
                                currentCompetencia,
                              )}. Clique em "Todas as compras" para ver o histórico geral.`}
                        </div>
                      )
                    }

                    return (
                      <div className="divide-y divide-border">
                        {list.map((oc) => {
                          const compObj =
                            oc.expand?.compromisso ||
                            (oc.compromisso ? compromissosMap.get(oc.compromisso) : undefined)
                          return (
                            <OcorrenciaRow
                              key={oc.id}
                              ocorrencia={oc}
                              isModoPagamento={filtroDataCompetencia === 'pagamento'}
                              compromissoFallback={compObj}
                              onBaixar={() => handleOpenBaixa(oc)}
                              onEstornar={() => setEstornando(oc)}
                              onEditarCompromisso={() =>
                                compObj && handleOpenEditarCompromisso(compObj)
                              }
                              onDuplicarCompromisso={() =>
                                compObj && handleOpenDuplicarCompromisso(compObj)
                              }
                              onExcluirCompromisso={() =>
                                compObj && setDeletandoCompromisso(compObj)
                              }
                              onExcluirOcorrencia={() => setDeletandoOcorrencia(oc)}
                              canEdit={can(user?.role, 'writeFinance')}
                            />
                          )
                        })}
                      </div>
                    )
                  }

                  return (
                    <div
                      key={conta.id}
                      className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft transition-all"
                    >
                      <header
                        className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-secondary/25 p-4 sm:p-5 cursor-pointer hover:bg-secondary/35 transition"
                        onClick={() =>
                          setCartaoExpanded((prev) => ({
                            ...prev,
                            [conta.id]: prev[conta.id] === undefined ? false : !prev[conta.id],
                          }))
                        }
                      >
                        {/* Dados do Cartão: Chevron toggle, Ícone, Nome, Bandeira, Fechamento e Vencimento */}
                        <div className="flex items-center gap-3 min-w-0">
                          <button
                            type="button"
                            className="grid h-8 w-8 place-items-center rounded-lg bg-white border border-border text-muted-foreground hover:text-foreground shrink-0 shadow-xs"
                            onClick={(e) => {
                              e.stopPropagation()
                              setCartaoExpanded((prev) => ({
                                ...prev,
                                [conta.id]: prev[conta.id] === undefined ? false : !prev[conta.id],
                              }))
                            }}
                            title={isExpanded ? 'Recolher cartão' : 'Expandir cartão'}
                          >
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4" />
                            ) : (
                              <ChevronRight className="h-4 w-4" />
                            )}
                          </button>

                          <span
                            className="grid h-11 w-11 place-items-center rounded-xl text-white shadow-xs shrink-0"
                            style={{ background: conta.cor || '#4C3A8C' }}
                          >
                            <CreditCard className="h-6 w-6" />
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3 className="text-base font-extrabold text-foreground sm:text-lg truncate">
                                {conta.nome}
                              </h3>
                              {conta.bandeira && (
                                <Badge variant="outline" className="font-semibold text-[10px]">
                                  {conta.bandeira}
                                </Badge>
                              )}
                              {conta.natureza && (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] uppercase font-semibold py-0 px-1.5 h-4 text-muted-foreground"
                                >
                                  {conta.natureza === 'fisica'
                                    ? 'Pessoa Física'
                                    : 'Pessoa Jurídica'}
                                </Badge>
                              )}
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                              <span className="font-medium text-foreground">
                                {countComprasExibidas}{' '}
                                {countComprasExibidas === 1 ? 'lançamento' : 'lançamentos'}
                                {!isHist ? ' no mês' : ' no histórico'}
                              </span>
                              <span>•</span>
                              <span>
                                {conta.dia_fechamento ? (
                                  <>
                                    Fechamento dia <strong>{conta.dia_fechamento}</strong>
                                  </>
                                ) : (
                                  'Fechamento não informado'
                                )}
                              </span>
                              <span>•</span>
                              <span className="font-semibold text-foreground flex items-center gap-1">
                                <Calendar className="h-3 w-3 text-primary" />
                                {conta.dia_vencimento ? (
                                  <>
                                    Vencimento dia <strong>{conta.dia_vencimento}</strong>
                                  </>
                                ) : (
                                  'Vencimento não informado'
                                )}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Valores e Alternador Mês vs Histórico Completo */}
                        <div
                          className="flex flex-wrap items-center gap-3 ml-auto"
                          onClick={(e) => e.stopPropagation()}
                        >
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
                                {formatCurrency(isHist ? totalHeaderTodas : totalHeaderMes)}
                              </p>
                            </div>
                            {(isHist ? totalPagoHeaderTodas : totalPagoHeaderMes) > 0 && (
                              <div className="rounded-xl border border-success/30 bg-success/10 px-3 py-1 text-right">
                                <p className="micro-label text-success">Baixado</p>
                                <p className="text-xs font-bold tabular-nums text-success">
                                  {formatCurrency(
                                    isHist ? totalPagoHeaderTodas : totalPagoHeaderMes,
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </header>

                      {isExpanded && (
                        <>
                          {hasSingleTab ? (
                            // Cartões com apenas 1 tipo de pagamento (ex: ["credito"]): exibe direto sem poluir com abas
                            renderOcorrenciasList(
                              isHist ? ocorrenciasTodas : ocorrenciasMes,
                              abas[0]?.tipo,
                            )
                          ) : (
                            // Cartões com múltiplos tipos de pagamento (ex: NuBank com Crédito, Débito, Boleto, Pix, etc.)
                            <div className="p-4 sm:p-5">
                              <Tabs defaultValue={defaultTab} className="w-full">
                                <TabsList className="mb-4 flex h-auto flex-wrap gap-1 bg-muted/60 p-1">
                                  {abas.map((aba) => {
                                    const list = isHist ? aba.ocorrenciasTodas : aba.ocorrenciasMes
                                    const qtd = list.length
                                    const totalAba = list.reduce(
                                      (s, o) => s + (o.valor_previsto || 0),
                                      0,
                                    )
                                    const label = CONTA_TIPO_PAGAMENTO_LABELS[aba.tipo] || aba.tipo

                                    return (
                                      <TabsTrigger
                                        key={aba.tipo}
                                        value={aba.tipo}
                                        className="flex items-center gap-2 px-3 py-1.5 text-xs font-semibold data-[state=active]:bg-white data-[state=active]:shadow-xs"
                                      >
                                        <span>{label}</span>
                                        <Badge
                                          variant={qtd > 0 ? 'secondary' : 'outline'}
                                          className="h-5 px-1.5 text-[10px] font-bold"
                                        >
                                          {qtd}
                                        </Badge>
                                        {qtd > 0 && (
                                          <span className="hidden text-[11px] font-normal text-muted-foreground sm:inline">
                                            ({formatCompactCurrency(totalAba)})
                                          </span>
                                        )}
                                      </TabsTrigger>
                                    )
                                  })}
                                </TabsList>

                                {abas.map((aba) => {
                                  const list = isHist ? aba.ocorrenciasTodas : aba.ocorrenciasMes
                                  return (
                                    <TabsContent
                                      key={aba.tipo}
                                      value={aba.tipo}
                                      className="m-0 focus-visible:outline-none"
                                    >
                                      {renderOcorrenciasList(list, aba.tipo)}
                                    </TabsContent>
                                  )
                                })}
                              </Tabs>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </section>
        )}

        {/* SEÇÃO 3: Assinaturas anuais */}
        {(filterSecao === 'all' || filterSecao === 'assinaturas_anuais') && (
          <section className="space-y-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-bold tracking-tight text-foreground sm:text-xl">
                  Assinaturas anuais
                </h2>
                <p className="text-xs text-muted-foreground">
                  Domínios, ferramentas, softwares e renovações de ciclo anual ativos em qualquer
                  competência.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-muted-foreground">
                  Ativas: {compromissosAnuais.length}
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
              {compromissosAnuais.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma assinatura anual cadastrada.
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {compromissosAnuais.map((comp) => {
                    // Verifica se existe ocorrência deste compromisso na competência visualizada
                    const ocorrenciaDoMes = secaoAssinaturasOcorrencias.find(
                      (o) => o.compromisso === comp.id,
                    )

                    // Busca a última ocorrência paga deste compromisso no histórico geral
                    const ultimaPaga = assinaturasOcorrenciasAll.find(
                      (o) => o.compromisso === comp.id && o.status === 'paga',
                    )

                    return (
                      <CompromissoAnualRow
                        key={comp.id}
                        compromisso={comp}
                        ocorrenciaMes={ocorrenciaDoMes}
                        ultimaOcorrenciaPaga={ultimaPaga}
                        competencia={currentCompetencia}
                        onBaixarOcorrencia={(oc) => handleOpenBaixa(oc)}
                        onRegistrarPagamentoRetroativo={() => handleOpenBaixaCompromisso(comp)}
                        onEstornarOcorrencia={(oc) => setEstornando(oc)}
                        onEditarCompromisso={() => handleOpenEditarCompromisso(comp)}
                        onDuplicarCompromisso={() => handleOpenDuplicarCompromisso(comp)}
                        onExcluirCompromisso={() => setDeletandoCompromisso(comp)}
                        onExcluirOcorrencia={(oc) => setDeletandoOcorrencia(oc)}
                        canEdit={can(user?.role, 'writeFinance')}
                      />
                    )
                  })}
                </div>
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
        onOpenChange={(open) => {
          setCompromissoModal(open)
          if (!open) {
            setIsDuplicandoCompromisso(false)
          }
        }}
        compromisso={compromissoEditando}
        isDuplicating={isDuplicandoCompromisso}
        categorias={categorias}
        tags={tags}
        tiposDespesa={tiposDespesa}
        metodosPagamento={metodosPagamento}
        tiposDizimo={tiposDizimo}
        contas={contas}
        pessoas={pessoas}
        empresas={empresas}
        defaultSecao={defaultSecaoCompromisso}
        defaultContaId={defaultContaCompromissoId}
        defaultMetodoId={defaultMetodoCompromissoId}
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
  isModoPagamento?: boolean
  compromissoFallback?: DespesaCompromisso
  onBaixar: () => void
  onEstornar: () => void
  onEditarCompromisso: () => void
  onDuplicarCompromisso?: () => void
  onExcluirCompromisso: () => void
  onExcluirOcorrencia?: () => void
  canEdit: boolean
}

function OcorrenciaRow({
  ocorrencia,
  isAtrasada = false,
  isModoPagamento = false,
  compromissoFallback,
  onBaixar,
  onEstornar,
  onEditarCompromisso,
  onDuplicarCompromisso,
  onExcluirCompromisso,
  onExcluirOcorrencia,
  canEdit,
}: OcorrenciaRowProps) {
  const comp = ocorrencia.expand?.compromisso || compromissoFallback
  const isPaga = ocorrencia.status === 'paga'

  const tag = comp?.expand?.tag // Destino da despesa / Centro de custo
  const categoria = comp?.expand?.categoria // Finalidade
  const metodoPag = comp?.expand?.metodo_pagamento
  const contaPag = ocorrencia.expand?.conta || comp?.expand?.conta_padrao

  // Ocorrência só é considerada em atraso se NÃO estiver paga e a data de vencimento for anterior à data REAL de hoje
  const todayStr = getLocalDateStr()
  const dueStr = ocorrencia.data_vencimento ? ocorrencia.data_vencimento.slice(0, 10) : ''
  const isRealmenteAtrasada = !isPaga && dueStr !== '' && dueStr < todayStr
  const isCartao = contaPag?.tipo === 'cartao' || ocorrencia.secao === 'cartoes_credito'

  // Badge do ciclo da fatura do cartão
  const faturaCicloBadge = useMemo(() => {
    if (!contaPag || contaPag.tipo !== 'cartao') return null
    const dataRef =
      ocorrencia.data_pagamento?.slice(0, 10) ||
      ocorrencia.data_vencimento?.slice(0, 10) ||
      comp?.data_inicio?.slice(0, 10) ||
      getLocalDateStr()
    const ciclo = calcularFaturaCartao(contaPag, dataRef)
    const dateObj = new Date(ciclo.dataFechamento + 'T12:00:00')
    const mesAno = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    const mesCap = mesAno.charAt(0).toUpperCase() + mesAno.slice(1)
    const [vy, vm, vd] = ciclo.dataVencimento.split('-')
    return `Fatura de ${mesCap} · vence ${vd}/${vm}`
  }, [contaPag, ocorrencia.data_pagamento, ocorrencia.data_vencimento, comp?.data_inicio])

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
              : isRealmenteAtrasada
                ? 'bg-destructive ring-4 ring-destructive/20 animate-pulse'
                : 'bg-primary ring-4 ring-primary/15'
          }`}
          title={isPaga ? 'Paga' : isRealmenteAtrasada ? 'Prevista (Atrasada)' : 'Prevista'}
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-extrabold text-foreground text-sm">
              {comp?.descricao || ocorrencia.observacoes || 'Despesa'}
            </span>

            {/* Badge do Ciclo da Fatura do Cartão */}
            {faturaCicloBadge && (
              <Badge
                variant="outline"
                className="border-primary/40 bg-primary/10 text-primary font-bold text-[10px] px-2 py-0.5"
                title="Ciclo da fatura correspondente a esta compra"
              >
                {faturaCicloBadge}
              </Badge>
            )}

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

            {isRealmenteAtrasada && (
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

            {isModoPagamento && !isPaga && (
              <span className="rounded border border-primary/30 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                Prevista para esta competência (vencimento)
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

            {!isCartao && (
              <span>
                Venc: <strong>{formatDate(ocorrencia.data_vencimento)}</strong>
                {comp?.regra_vencimento_texto && ` (${comp.regra_vencimento_texto})`}
              </span>
            )}
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

            {/* Anexo da conta a pagar (compromisso) - visível tanto para pendentes quanto pagas */}
            {comp?.anexo_conta && (
              <a
                href={getFileUrl('despesas_compromisso', comp.id, comp.anexo_conta)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                title="Ver fatura / conta a pagar anexada"
              >
                <FileText className="h-3 w-3" />
                Ver conta
              </a>
            )}

            {/* Comprovante da baixa de pagamento - visível quando anexado */}
            {ocorrencia.comprovante_pagamento && (
              <a
                href={getFileUrl(
                  'despesas_ocorrencias',
                  ocorrencia.id,
                  ocorrencia.comprovante_pagamento,
                )}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                title="Ver comprovante de pagamento"
              >
                <FileText className="h-3 w-3" />
                Comprovante
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
              ) : isCartao ? (
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 border-primary/30 text-primary hover:bg-primary/10 text-xs font-semibold"
                  onClick={onBaixar}
                  title="Lançar compra no ciclo da fatura do cartão"
                >
                  <CreditCard className="mr-1 h-3.5 w-3.5" /> Lançar na fatura
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
                className="h-8 w-8 text-muted-foreground hover:text-primary sm:opacity-0 sm:group-hover:opacity-100"
                onClick={onDuplicarCompromisso}
                title="Duplicar despesa (criar nova a partir desta)"
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>

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
