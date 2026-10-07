import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Calculator,
  CheckCircle2,
  DollarSign,
  HeartHandshake,
  Info,
  LoaderCircle,
  Pencil,
  Percent,
  RefreshCw,
  Sparkles,
  Receipt,
  ArrowDown,
} from 'lucide-react'

import { PageHeader } from '@/components/PageHeader'
import { LoadingState } from '@/components/LoadingState'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { can } from '@/lib/permissions'
import { formatCurrency, formatDate, getLocalDateStr } from '@/lib/format'
import { apiMessage } from '@/lib/api-error'
import { despesasService } from '@/services/despesas'
import { financeService } from '@/services/finance'
import { ofertasService } from '@/services/ofertas'
import { OfertasVoluntariasModule } from '@/components/dizimos/OfertasVoluntariasModule'
import {
  getMesBrasilia,
  getPercentualDizimoEfetivo,
  calcularValorEfetivoBaseDizimo,
  filtrarOcorrenciasDizimoMes,
  calcularBaseCompartilhadaDizimo,
  filtrarOcorrenciasAbertoDizimoMes,
  calcularValorPorTipo,
  getDiasNoMes,
  getStatusPagamentoMinisterial,
  formatDescricaoMinisterial,
} from '@/lib/dizimoCalculo'
import { BaixaOcorrenciaDialog } from '@/components/despesas/BaixaOcorrenciaDialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import type {
  Categoria,
  Conta,
  ConfigCalculo,
  DespesaCompromisso,
  DespesaOcorrencia,
  Lancamento,
  MovimentacaoCaixaOferta,
  OfertaVoluntaria,
  ResumoCaixaOfertas,
  TipoCalculoDizimo,
  TipoDizimo,
} from '@/types/domain'

// Formata data do pagamento respeitando o fuso de Brasília
function formatDataPagamentoBrasilia(dateStr?: string | null): string {
  if (!dateStr) return '—'
  try {
    const iso =
      dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      }).format(d)
    }
  } catch {
    /* fallback */
  }
  return formatDate(dateStr.slice(0, 10))
}

export default function Dizimos() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TipoCalculoDizimo>('dizimo')

  // Mês de referência (default mês corrente segundo fuso Brasília)
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const todayStr = getLocalDateStr(new Date())
    return todayStr.slice(0, 7) // 'YYYY-MM'
  })

  // Dados carregados do backend
  const [configs, setConfigs] = useState<Record<TipoCalculoDizimo, ConfigCalculo | null>>({
    dizimo: null,
    oferta: null,
    primicias: null,
  })
  const [tiposDizimo, setTiposDizimo] = useState<TipoDizimo[]>([])
  const [ocorrenciasPagas, setOcorrenciasPagas] = useState<DespesaOcorrencia[]>([])
  const [ocorrenciasAbertas, setOcorrenciasAbertas] = useState<DespesaOcorrencia[]>([])
  const [compromissosDizimo, setCompromissosDizimo] = useState<DespesaCompromisso[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentosMes, setLancamentosMes] = useState<Lancamento[]>([])

  // Estado para fluxo oficial de baixa reutilizando BaixaOcorrenciaDialog
  const [baixaModalOpen, setBaixaModalOpen] = useState(false)
  const [ocorrenciaParaBaixar, setOcorrenciaParaBaixar] = useState<DespesaOcorrencia | null>(null)
  const [compromissoParaBaixar, setCompromissoParaBaixar] = useState<DespesaCompromisso | null>(
    null,
  )
  const [sincronizandoMes, setSincronizandoMes] = useState(false)

  // Diálogo de Pagamento Ministerial Único do Mês (Dízimo, Oferta ou Primícias)
  const [pagamentoModalOpen, setPagamentoModalOpen] = useState(false)
  const [tipoParaPagar, setTipoParaPagar] = useState<TipoCalculoDizimo>('dizimo')
  const [pagamentoValorInput, setPagamentoValorInput] = useState<number>(0)
  const [pagamentoContaId, setPagamentoContaId] = useState<string>('')
  const [pagamentoData, setPagamentoData] = useState<string>(() => getLocalDateStr(new Date()))
  const [pagamentoObservacoes, setPagamentoObservacoes] = useState<string>('')
  const [savingPagamento, setSavingPagamento] = useState(false)

  // Diálogo de Ajuste do Pagamento Ministerial
  const [ajusteModalOpen, setAjusteModalOpen] = useState(false)
  const [lancamentoParaAjustar, setLancamentoParaAjustar] = useState<Lancamento | null>(null)
  const [ajusteTipo, setAjusteTipo] = useState<TipoCalculoDizimo>('dizimo')
  const [ajusteValorInput, setAjusteValorInput] = useState<number>(0)
  const [ajusteContaId, setAjusteContaId] = useState<string>('')
  const [ajusteData, setAjusteData] = useState<string>('')
  const [ajusteObservacoes, setAjusteObservacoes] = useState<string>('')
  const [savingAjuste, setSavingAjuste] = useState(false)
  const [estornandoPagamento, setEstornandoPagamento] = useState(false)

  // Ofertas Voluntárias & Caixa de Ofertas
  const [ofertasVoluntarias, setOfertasVoluntarias] = useState<OfertaVoluntaria[]>([])
  const [movimentacoesCaixa, setMovimentacoesCaixa] = useState<MovimentacaoCaixaOferta[]>([])
  const [resumoCaixa, setResumoCaixa] = useState<ResumoCaixaOfertas>({
    totalEntradasMes: 0,
    totalSaidasMes: 0,
    saldoMes: 0,
    saldoAcumuladoGeral: 0,
  })

  // Modal de edição de percentual
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [editingType, setEditingType] = useState<TipoCalculoDizimo>('dizimo')
  const [percentualInput, setPercentualInput] = useState<string>('10')
  const [savingPercentual, setSavingPercentual] = useState(false)

  // Modal para atualizar direcionamento da ocorrência (inline na auditoria/tabela)
  const [editDirecionamentoOpen, setEditDirecionamentoOpen] = useState(false)
  const [editingOcorrencia, setEditingOcorrencia] = useState<DespesaOcorrencia | null>(null)
  const [direcionamentoInput, setDirecionamentoInput] = useState('')
  const [savingDirecionamento, setSavingDirecionamento] = useState(false)

  // Carrega todas as informações necessárias
  const loadData = async () => {
    setLoading(true)
    try {
      const [
        tipos,
        configsList,
        cts,
        cats,
        ocorrenciasPagasRes,
        ocorrenciasAbertasRes,
        compromissosDizimoRes,
        lancamentosRes,
        ofVoluntarias,
        cxMovs,
        cxResumo,
      ] = await Promise.all([
        despesasService.listTiposDizimo(),
        despesasService.listConfigCalculos(),
        financeService.listContas(),
        financeService.listCategorias(),
        despesasService.listOcorrencias({
          filter: `status = 'paga' && dizimo = true`,
          expand:
            'compromisso,compromisso.categoria,compromisso.tipo_dizimo,conta,tipo_dizimo,lancamento',
        }),
        despesasService.listOcorrencias({
          filter: `status != 'paga' && dizimo = true`,
          expand:
            'compromisso,compromisso.categoria,compromisso.tipo_dizimo,compromisso.conta_padrao,conta,tipo_dizimo,lancamento',
        }),
        despesasService.listCompromissos({
          filter: `dizimo = true && ativo = true`,
          expand: 'categoria,tipo_dizimo,conta_padrao',
        }),
        financeService.listLancamentos({
          filter: `competencia = '${selectedMonth}'`,
        }),
        ofertasService.getOfertasMes(selectedMonth),
        ofertasService.listMovimentacoesMes(selectedMonth),
        ofertasService.getResumoCaixa(selectedMonth),
      ])

      setTiposDizimo(tipos)
      setContas(cts)
      setCategorias(cats)
      setOcorrenciasPagas(ocorrenciasPagasRes)
      setOcorrenciasAbertas(ocorrenciasAbertasRes)
      setCompromissosDizimo(compromissosDizimoRes)
      setLancamentosMes(lancamentosRes)
      setOfertasVoluntarias(ofVoluntarias)
      setMovimentacoesCaixa(cxMovs)
      setResumoCaixa(cxResumo)

      // Mapeia configs por tipo
      const map: Record<TipoCalculoDizimo, ConfigCalculo | null> = {
        dizimo: null,
        oferta: null,
        primicias: null,
      }
      for (const c of configsList) {
        if (c.tipo === 'dizimo' || c.tipo === 'oferta' || c.tipo === 'primicias') {
          map[c.tipo] = c
        }
      }
      setConfigs(map)
    } catch (err) {
      console.error('Erro ao carregar dados de dízimos:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dízimos e ofertas',
        description: apiMessage(err),
      })
    } finally {
      setLoading(false)
    }
  }

  // Recarrega apenas dados de ofertas voluntárias e caixa
  const reloadOfertasVoluntarias = async () => {
    try {
      const [ofVoluntarias, cxMovs, cxResumo] = await Promise.all([
        ofertasService.getOfertasMes(selectedMonth),
        ofertasService.listMovimentacoesMes(selectedMonth),
        ofertasService.getResumoCaixa(selectedMonth),
      ])
      setOfertasVoluntarias(ofVoluntarias)
      setMovimentacoesCaixa(cxMovs)
      setResumoCaixa(cxResumo)
    } catch (err) {
      console.error('Erro ao atualizar ofertas voluntárias:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar ofertas',
        description: apiMessage(err),
      })
    }
  }

  useEffect(() => {
    loadData()
  }, [selectedMonth])

  // Navegação de mês
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const prev = new Date(y, m - 2, 1)
    const yStr = prev.getFullYear()
    const mStr = String(prev.getMonth() + 1).padStart(2, '0')
    setSelectedMonth(`${yStr}-${mStr}`)
  }

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number)
    const next = new Date(y, m, 1)
    const yStr = next.getFullYear()
    const mStr = String(next.getMonth() + 1).padStart(2, '0')
    setSelectedMonth(`${yStr}-${mStr}`)
  }

  // Nome do mês formatado em português
  const monthLabel = useMemo(() => {
    try {
      const [y, m] = selectedMonth.split('-').map(Number)
      const d = new Date(y, m - 1, 15)
      const name = d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      return name.charAt(0).toUpperCase() + name.slice(1)
    } catch {
      return selectedMonth
    }
  }, [selectedMonth])

  // Quantidade de dias no mês selecionado
  const diasNoMes = useMemo(() => {
    try {
      const [y, m] = selectedMonth.split('-').map(Number)
      return new Date(y, m, 0).getDate()
    } catch {
      return 30
    }
  }, [selectedMonth])

  // BASE ÚNICA COMPARTILHADA COM CÁLCULO PONDERADO:
  // As 3 seções (Dízimo, Oferta, Primícias) utilizam a mesma base de cálculo =
  // ocorrências com dizimo=true, status='paga', com data_pagamento dentro do mês de referência (fuso Brasília).
  // Cada ocorrência contribui na base com: valor_pago * (dizimo_percentual ?? 100) / 100.
  const ocorrenciasFiltradas = useMemo(() => {
    return filtrarOcorrenciasDizimoMes(ocorrenciasPagas, selectedMonth)
  }, [ocorrenciasPagas, selectedMonth])

  // Total bruto pago das ocorrências de dízimo no mês
  const totalBrutoPago = useMemo(
    () => ocorrenciasFiltradas.reduce((acc, oc) => acc + (oc.valor_pago || 0), 0),
    [ocorrenciasFiltradas],
  )

  // Montante efetivo da base compartilhada calculada de forma ponderada por percentual
  const baseCompartilhada = useMemo(
    () => calcularBaseCompartilhadaDizimo(ocorrenciasFiltradas),
    [ocorrenciasFiltradas],
  )

  // Percentuais e fatores por tipo
  const percentualDizimo = configs.dizimo?.percentual ?? 10
  const percentualOferta = configs.oferta?.percentual ?? 5
  const fatorPrimicias = 1 / diasNoMes

  // Valores calculados resultantes sobre a MESMA base
  const resultadoDizimo = useMemo(
    () =>
      calcularValorPorTipo('dizimo', baseCompartilhada, {
        percentualDizimo,
      }),
    [baseCompartilhada, percentualDizimo],
  )

  const resultadoOferta = useMemo(
    () =>
      calcularValorPorTipo('oferta', baseCompartilhada, {
        percentualOferta,
      }),
    [baseCompartilhada, percentualOferta],
  )

  const resultadoPrimicias = useMemo(
    () =>
      calcularValorPorTipo('primicias', baseCompartilhada, {
        diasNoMes,
        mes: selectedMonth,
      }),
    [baseCompartilhada, diasNoMes, selectedMonth],
  )

  // Estado de pagamento de cada um dos 3 tipos no mês selecionado
  const statusDizimo = useMemo(
    () => getStatusPagamentoMinisterial(lancamentosMes, 'dizimo', selectedMonth, resultadoDizimo),
    [lancamentosMes, selectedMonth, resultadoDizimo],
  )

  const statusOferta = useMemo(
    () => getStatusPagamentoMinisterial(lancamentosMes, 'oferta', selectedMonth, resultadoOferta),
    [lancamentosMes, selectedMonth, resultadoOferta],
  )

  const statusPrimicias = useMemo(
    () =>
      getStatusPagamentoMinisterial(lancamentosMes, 'primicias', selectedMonth, resultadoPrimicias),
    [lancamentosMes, selectedMonth, resultadoPrimicias],
  )

  // Conta padrão sensível (primeira conta bancária/caixa ativa ou primeira ativa)
  const contaPadraoId = useMemo(() => {
    const bancaria = contas.find((c) => c.ativa && (c.tipo === 'bancaria' || c.tipo === 'caixa'))
    if (bancaria) return bancaria.id
    const ativa = contas.find((c) => c.ativa)
    return ativa?.id || contas[0]?.id || ''
  }, [contas])

  // Abrir modal de pagamento ministerial
  const handleOpenRegistrarPagamento = (tipo: TipoCalculoDizimo) => {
    setTipoParaPagar(tipo)
    const valorCalculado =
      tipo === 'dizimo' ? resultadoDizimo : tipo === 'oferta' ? resultadoOferta : resultadoPrimicias
    setPagamentoValorInput(Number(valorCalculado.toFixed(2)))
    setPagamentoContaId(contaPadraoId)
    setPagamentoData(getLocalDateStr(new Date()))
    setPagamentoObservacoes('')
    setPagamentoModalOpen(true)
  }

  // Confirmar pagamento ministerial único
  const handleConfirmarPagamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pagamentoContaId) {
      toast({
        variant: 'destructive',
        title: 'Selecione uma conta',
        description: 'É necessário selecionar a conta bancária ou de caixa para débito.',
      })
      return
    }

    if (pagamentoValorInput <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'O valor do pagamento deve ser maior que zero.',
      })
      return
    }

    setSavingPagamento(true)
    try {
      await despesasService.registrarPagamentoMinisterialMes({
        tipo: tipoParaPagar,
        competencia: selectedMonth,
        monthLabel,
        valor: pagamentoValorInput,
        dataPagamento: pagamentoData,
        contaId: pagamentoContaId,
        observacoes: pagamentoObservacoes,
      })

      toast({
        title: 'Pagamento registrado com sucesso!',
        description: `Lançamento de ${
          tipoParaPagar === 'dizimo'
            ? 'Dízimo'
            : tipoParaPagar === 'oferta'
              ? 'Oferta'
              : 'Primícias'
        } criado em /lancamentos para ${monthLabel}.`,
      })
      setPagamentoModalOpen(false)
      await loadData()
    } catch (err) {
      console.error('Erro ao registrar pagamento ministerial:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao registrar pagamento',
        description: apiMessage(err),
      })
    } finally {
      setSavingPagamento(false)
    }
  }

  // Abrir modal de ajuste do lançamento ministerial pago
  const handleOpenAjustePagamento = (
    tipo: TipoCalculoDizimo,
    lancamento: Lancamento,
    valorCalculadoAtual: number,
  ) => {
    setAjusteTipo(tipo)
    setLancamentoParaAjustar(lancamento)
    // Sugere o valor da base recalculada
    setAjusteValorInput(Number(valorCalculadoAtual.toFixed(2)))
    setAjusteContaId(lancamento.conta || contaPadraoId)
    setAjusteData(lancamento.data ? lancamento.data.slice(0, 10) : getLocalDateStr(new Date()))
    setAjusteObservacoes(lancamento.observacoes || '')
    setAjusteModalOpen(true)
  }

  // Salvar ajuste do pagamento
  const handleConfirmarAjuste = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!lancamentoParaAjustar) return
    if (!ajusteContaId) {
      toast({
        variant: 'destructive',
        title: 'Selecione uma conta',
        description: 'É necessário selecionar a conta para o lançamento.',
      })
      return
    }
    if (ajusteValorInput <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'O valor deve ser maior que zero.',
      })
      return
    }

    setSavingAjuste(true)
    try {
      await despesasService.ajustarPagamentoMinisterial(lancamentoParaAjustar.id, {
        valor: ajusteValorInput,
        contaId: ajusteContaId,
        dataPagamento: ajusteData,
        observacoes: ajusteObservacoes,
      })

      toast({
        title: 'Pagamento ajustado com sucesso!',
        description: `O valor do lançamento foi atualizado para ${formatCurrency(ajusteValorInput)}.`,
      })
      setAjusteModalOpen(false)
      setLancamentoParaAjustar(null)
      await loadData()
    } catch (err) {
      console.error('Erro ao ajustar pagamento:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao ajustar pagamento',
        description: apiMessage(err),
      })
    } finally {
      setSavingAjuste(false)
    }
  }

  // Estornar pagamento ministerial (remover lançamento)
  const handleEstornarPagamento = async (lancamentoId: string, tipo: TipoCalculoDizimo) => {
    const rotulo = tipo === 'dizimo' ? 'Dízimo' : tipo === 'oferta' ? 'Oferta' : 'Primícias'
    if (
      !window.confirm(
        `Deseja realmente estornar o pagamento de ${rotulo} de ${monthLabel}? O lançamento financeiro será excluído de /lancamentos.`,
      )
    ) {
      return
    }

    setEstornandoPagamento(true)
    try {
      await despesasService.estornarPagamentoMinisterial(lancamentoId)
      toast({
        title: 'Pagamento estornado com sucesso!',
        description: `O lançamento de ${rotulo} foi removido e o mês está novamente em aberto.`,
      })
      if (ajusteModalOpen) {
        setAjusteModalOpen(false)
        setLancamentoParaAjustar(null)
      }
      await loadData()
    } catch (err) {
      console.error('Erro ao estornar pagamento:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao estornar pagamento',
        description: apiMessage(err),
      })
    } finally {
      setEstornandoPagamento(false)
    }
  }

  // Abrir modal de edição de percentual (dízimo ou oferta)
  const handleOpenEdit = (tipo: TipoCalculoDizimo) => {
    setEditingType(tipo)
    const current =
      configs[tipo]?.percentual ?? (tipo === 'dizimo' ? 10 : tipo === 'oferta' ? 5 : 0)
    setPercentualInput(String(current))
    setEditDialogOpen(true)
  }

  const handleSavePercentual = async (e: React.FormEvent) => {
    e.preventDefault()
    const val = parseFloat(percentualInput.replace(',', '.'))
    if (isNaN(val) || val < 0 || val > 100) {
      toast({
        variant: 'destructive',
        title: 'Percentual inválido',
        description: 'Informe um percentual válido entre 0% e 100%.',
      })
      return
    }

    setSavingPercentual(true)
    try {
      const updated = await despesasService.saveConfigCalculo(editingType, {
        percentual: val,
      })
      setConfigs((prev) => ({
        ...prev,
        [editingType]: updated,
      }))
      toast({
        title: 'Configuração atualizada com sucesso!',
        description: `O percentual para ${
          editingType === 'dizimo' ? 'Dízimo' : 'Oferta'
        } agora é ${val}%.`,
      })
      setEditDialogOpen(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar configuração',
        description: apiMessage(err),
      })
    } finally {
      setSavingPercentual(false)
    }
  }

  // Estado para edição retroativa de percentual de dízimo na ocorrência
  const [editPercentualOcorrOpen, setEditPercentualOcorrOpen] = useState(false)
  const [editingOcorrenciaPercentual, setEditingOcorrenciaPercentual] =
    useState<DespesaOcorrencia | null>(null)
  const [percentualOcorrenciaInput, setPercentualOcorrenciaInput] = useState<number>(100)
  const [savingPercentualOcorrencia, setSavingPercentualOcorrencia] = useState(false)

  // Abrir modal de edição de percentual de ocorrência
  const handleOpenEditPercentualOcorr = (oc: DespesaOcorrencia) => {
    setEditingOcorrenciaPercentual(oc)
    const pct = getPercentualDizimoEfetivo(oc)
    setPercentualOcorrenciaInput(pct)
    setEditPercentualOcorrOpen(true)
  }

  const handleSavePercentualOcorrencia = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOcorrenciaPercentual) return
    const val = Math.max(0, Math.min(100, Number(percentualOcorrenciaInput) || 0))
    setSavingPercentualOcorrencia(true)
    try {
      await despesasService.atualizarOcorrencia(editingOcorrenciaPercentual.id, {
        dizimo_percentual: val,
        dizimo: val > 0,
      })
      // Atualiza localmente
      setOcorrenciasPagas((prev) =>
        prev.map((oc) =>
          oc.id === editingOcorrenciaPercentual.id
            ? { ...oc, dizimo_percentual: val, dizimo: val > 0 }
            : oc,
        ),
      )
      toast({
        title: 'Percentual atualizado!',
        description: `Percentual da ocorrência ajustado para ${val}%. Base do mês recalculada.`,
      })
      setEditPercentualOcorrOpen(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao atualizar percentual',
        description: apiMessage(err),
      })
    } finally {
      setSavingPercentualOcorrencia(false)
    }
  }

  // Editar direcionamento da ocorrência (inline na tabela)
  const handleOpenDirecionamento = (oc: DespesaOcorrencia) => {
    setEditingOcorrencia(oc)
    setDirecionamentoInput(oc.direcionamento || '')
    setEditDirecionamentoOpen(true)
  }

  const handleSaveDirecionamento = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingOcorrencia) return
    setSavingDirecionamento(true)
    try {
      const val = direcionamentoInput.trim() || null
      await despesasService.atualizarOcorrencia(editingOcorrencia.id, {
        direcionamento: val as unknown as string,
      })
      // Atualiza localmente na lista
      setOcorrenciasPagas((prev) =>
        prev.map((oc) =>
          oc.id === editingOcorrencia.id ? { ...oc, direcionamento: val || undefined } : oc,
        ),
      )
      toast({
        title: 'Direcionamento salvo!',
        description: val
          ? `Oferta direcionada para: "${val}".`
          : 'Direcionamento limpo com sucesso.',
      })
      setEditDirecionamentoOpen(false)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar direcionamento',
        description: apiMessage(err),
      })
    } finally {
      setSavingDirecionamento(false)
    }
  }

  // Auxiliares de exibição
  const getContaNome = (contaId?: string) => {
    if (!contaId) return '—'
    const c = contas.find((item) => item.id === contaId)
    return c?.nome || 'Conta vinculada'
  }

  const getCategoriaNome = (categoriaId?: string) => {
    if (!categoriaId) return 'Sem categoria'
    const cat = categorias.find((item) => item.id === categoriaId)
    return cat?.nome || 'Sem categoria'
  }

  const getTipoDizimoNome = (tipoId?: string, expandTipo?: TipoDizimo) => {
    if (expandTipo?.nome) return expandTipo.nome
    if (!tipoId) return 'Dízimo'
    const found = tiposDizimo.find((t) => t.id === tipoId)
    return found?.nome || 'Dízimo'
  }

  const scrollToTabela = (tipo: TipoCalculoDizimo) => {
    const el = document.getElementById(`tabela-base-${tipo}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }

  // Abrir fluxo de baixa oficial para uma ocorrência específica em aberto
  const handleOpenBaixaOcorrencia = (oc: DespesaOcorrencia) => {
    setCompromissoParaBaixar(null)
    setOcorrenciaParaBaixar(oc)
    setBaixaModalOpen(true)
  }

  // Abrir fluxo de baixa para compromisso sem ocorrência gerada ainda na competência
  const handleOpenBaixaCompromissoDireto = (comp: DespesaCompromisso) => {
    setOcorrenciaParaBaixar(null)
    setCompromissoParaBaixar(comp)
    setBaixaModalOpen(true)
  }

  // Sincronizar ocorrências pendentes dos compromissos de dízimo para o mês atual
  const handleSincronizarMes = async () => {
    if (compromissosDizimo.length === 0) {
      toast({
        title: 'Nenhum compromisso ministerial',
        description: 'Cadastre compromissos com marcação ministerial para gerar ocorrências.',
      })
      return
    }
    setSincronizandoMes(true)
    try {
      await despesasService.gerarOcorrenciasParaCompromissosLote({
        compromissos: compromissosDizimo,
        competencias: [selectedMonth],
        batchSize: 4,
        batchDelayMs: 150,
      })
      toast({
        title: 'Ocorrências sincronizadas!',
        description: `Ocorrências de ${monthLabel} verificadas e sincronizadas com sucesso.`,
      })
      await loadData()
    } catch (err) {
      console.error('Erro ao sincronizar ocorrências do mês:', err)
      toast({
        variant: 'destructive',
        title: 'Erro ao sincronizar',
        description: apiMessage(err),
      })
    } finally {
      setSincronizandoMes(false)
    }
  }

  if (loading) return <LoadingState label="Carregando cálculos de dízimos e ofertas..." />

  // Renderiza a memória de cálculo da fórmula por seção
  const renderCardCalculo = (tipo: TipoCalculoDizimo) => {
    if (tipo === 'dizimo') {
      return (
        <Card className="border border-border shadow-soft">
          <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                <Calculator className="h-5 w-5 text-[#DF5830]" />
                Cálculo do Dízimo Ministerial ({monthLabel})
              </CardTitle>
              <CardDescription>
                Configuração percentual independente de {percentualDizimo}% aplicada sobre a base
                única de despesas pagas no mês.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToTabela('dizimo')}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Ver base de cálculo
              </Button>
              {can(user?.role, 'writeFinance') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEdit('dizimo')}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar percentual ({percentualDizimo}%)
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-2xl border border-[#DF5830]/30 bg-[#DF5830]/5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fórmula de Auditoria — Dízimo
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground sm:text-lg">
                    <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border">
                      Base efetiva no mês: {formatCurrency(baseCompartilhada)}
                    </span>
                    <span className="text-muted-foreground">×</span>
                    <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border text-[#DF5830] font-black">
                      {percentualDizimo}%
                    </span>
                    <span className="text-muted-foreground">=</span>
                    <span className="rounded-lg bg-[#DF5830] px-3 py-1 font-black text-white shadow-xs">
                      {formatCurrency(resultadoDizimo)}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-white p-3 text-right shadow-2xs">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Valor apurado de Dízimo
                  </span>
                  <p className="text-xl font-black text-[#DF5830] sm:text-2xl">
                    {formatCurrency(resultadoDizimo)}
                  </p>
                </div>
              </div>

              {/* Composição: Total bruto pago com dízimo vs quanto efetivamente entrou na base */}
              <div className="mt-3 pt-3 border-t border-[#DF5830]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">
                    Total bruto pago das despesas de dízimo:
                  </span>
                  <strong className="text-foreground">{formatCurrency(totalBrutoPago)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Efetivamente ponderado na base:</span>
                  <strong className="text-[#DF5830] font-bold">
                    {formatCurrency(baseCompartilhada)}
                  </strong>
                  {totalBrutoPago > 0 && totalBrutoPago !== baseCompartilhada && (
                    <Badge
                      variant="outline"
                      className="text-[10px] bg-white border-[#DF5830]/30 text-[#DF5830]"
                    >
                      {((baseCompartilhada / totalBrutoPago) * 100).toFixed(1)}% do valor bruto
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-[#DF5830] shrink-0" />
                <span>
                  Base ponderada por despesa: <strong>{ocorrenciasFiltradas.length}</strong>{' '}
                  {ocorrenciasFiltradas.length === 1 ? 'despesa paga' : 'despesas pagas'} em{' '}
                  <strong>{monthLabel}</strong> somando cada parcela pelo seu percentual específico.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    if (tipo === 'oferta') {
      return (
        <Card className="border border-border shadow-soft">
          <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                <HeartHandshake className="h-5 w-5 text-[#B7791F]" />
                Cálculo de Oferta Ministerial ({monthLabel})
              </CardTitle>
              <CardDescription>
                Alíquota percentual de {percentualOferta}% aplicada sobre a mesma base de cálculo
                compartilhada do dízimo, com auditoria de direcionamentos.
              </CardDescription>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => scrollToTabela('oferta')}
                className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Ver base de cálculo
              </Button>
              {can(user?.role, 'writeFinance') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleOpenEdit('oferta')}
                  className="gap-1.5"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar percentual ({percentualOferta}%)
                </Button>
              )}
            </div>
          </CardHeader>

          <CardContent>
            <div className="rounded-2xl border border-[#B7791F]/30 bg-[#B7791F]/5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="space-y-1">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Fórmula de Auditoria — Oferta
                  </span>
                  <div className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground sm:text-lg">
                    <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border">
                      Base efetiva no mês: {formatCurrency(baseCompartilhada)}
                    </span>
                    <span className="text-muted-foreground">×</span>
                    <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border text-[#B7791F] font-black">
                      {percentualOferta}%
                    </span>
                    <span className="text-muted-foreground">=</span>
                    <span className="rounded-lg bg-[#B7791F] px-3 py-1 font-black text-white shadow-xs">
                      {formatCurrency(resultadoOferta)}
                    </span>
                  </div>
                </div>

                <div className="rounded-xl border border-border bg-white p-3 text-right shadow-2xs">
                  <span className="text-[11px] font-medium text-muted-foreground">
                    Valor apurado de Oferta
                  </span>
                  <p className="text-xl font-black text-[#B7791F] sm:text-2xl">
                    {formatCurrency(resultadoOferta)}
                  </p>
                </div>
              </div>

              {/* Composição: Total bruto pago com dízimo vs quanto efetivamente entrou na base */}
              <div className="mt-3 pt-3 border-t border-[#B7791F]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Total bruto pago das despesas:</span>
                  <strong className="text-foreground">{formatCurrency(totalBrutoPago)}</strong>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Efetivamente ponderado na base:</span>
                  <strong className="text-[#B7791F] font-bold">
                    {formatCurrency(baseCompartilhada)}
                  </strong>
                </div>
              </div>

              <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-[#B7791F] shrink-0" />
                <span>
                  O montante base de cálculo é o mesmo do dízimo (ponderado por percentual). Você
                  pode atribuir o <em>"Direcionamento"</em> específico (ex.: Louvor, Bateria,
                  Missões) em cada linha abaixo para auditoria do destino dos recursos.
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      )
    }

    // Primícias (1 / diasNoMes)
    return (
      <Card className="border border-border shadow-soft">
        <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
              <Sparkles className="h-5 w-5 text-[#1E6F5C]" />
              Cálculo de Oferta de Primícias ({monthLabel})
            </CardTitle>
            <CardDescription>
              Fórmula bíblica proporcional a 1 dia do mês: fator de 1 dividido pela quantidade de
              dias do mês de referência ({diasNoMes} dias), aplicado sobre a base compartilhada.
            </CardDescription>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => scrollToTabela('primicias')}
              className="gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowDown className="h-3.5 w-3.5" />
              Ver base de cálculo
            </Button>
            <Badge
              variant="outline"
              className="border-[#1E6F5C]/40 bg-[#1E6F5C]/10 text-[#1E6F5C] font-bold"
            >
              Fator: 1/{diasNoMes} avos ({((1 / diasNoMes) * 100).toFixed(2)}%)
            </Badge>
          </div>
        </CardHeader>

        <CardContent>
          <div className="rounded-2xl border border-[#1E6F5C]/30 bg-[#1E6F5C]/5 p-4 sm:p-5">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Fórmula de Auditoria — Primícias
                </span>
                <div className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground sm:text-lg">
                  <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border">
                    Base efetiva no mês: {formatCurrency(baseCompartilhada)}
                  </span>
                  <span className="text-muted-foreground">×</span>
                  <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border text-[#1E6F5C] font-black">
                    1/{diasNoMes}
                  </span>
                  <span className="text-muted-foreground">=</span>
                  <span className="rounded-lg bg-[#1E6F5C] px-3 py-1 font-black text-white shadow-xs">
                    {formatCurrency(resultadoPrimicias)}
                  </span>
                </div>
              </div>

              <div className="rounded-xl border border-border bg-white p-3 text-right shadow-2xs">
                <span className="text-[11px] font-medium text-muted-foreground">
                  Primícias Apuradas (1/{diasNoMes})
                </span>
                <p className="text-xl font-black text-[#1E6F5C] sm:text-2xl">
                  {formatCurrency(resultadoPrimicias)}
                </p>
              </div>
            </div>
            {/* Composição: Total bruto pago com dízimo vs quanto efetivamente entrou na base */}
            <div className="mt-3 pt-3 border-t border-[#1E6F5C]/20 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Total bruto pago das despesas:</span>
                <strong className="text-foreground">{formatCurrency(totalBrutoPago)}</strong>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-muted-foreground">Efetivamente ponderado na base:</span>
                <strong className="text-[#1E6F5C] font-bold">
                  {formatCurrency(baseCompartilhada)}
                </strong>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-[#1E6F5C] shrink-0" />
              <span>
                No mês de <strong>{monthLabel}</strong> (com <strong>{diasNoMes} dias</strong>), o
                cálculo equivale a 1 dia ({((1 / diasNoMes) * 100).toFixed(2)}%) sobre a base única
                compartilhada ponderada de despesas pagas.
              </span>
            </div>{' '}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Renderiza a tabela detalhada de auditoria da base compartilhada (modelo de colunas de Ofertas)
  const renderTabelaAuditoria = (tipo: TipoCalculoDizimo) => {
    const corTema = tipo === 'dizimo' ? '#DF5830' : tipo === 'oferta' ? '#B7791F' : '#1E6F5C'

    return (
      <Card id={`tabela-base-${tipo}`} className="border border-border shadow-soft">
        <CardHeader className="flex flex-row items-center justify-between pb-3">
          <div>
            <CardTitle className="text-base font-bold text-foreground">
              Base de Cálculo Compartilhada — Despesas Pagas no Mês ({monthLabel})
            </CardTitle>
            <CardDescription>
              Memória de cálculo com as {ocorrenciasFiltradas.length}{' '}
              {ocorrenciasFiltradas.length === 1 ? 'despesa' : 'despesas'} pagas que formam a base
              única de {formatCurrency(baseCompartilhada)} para Dízimo, Oferta e Primícias.
            </CardDescription>
          </div>
          <Badge variant="secondary" className="font-bold">
            {ocorrenciasFiltradas.length}{' '}
            {ocorrenciasFiltradas.length === 1 ? 'despesa na base' : 'despesas na base'}
          </Badge>
        </CardHeader>

        <CardContent>
          {ocorrenciasFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
              <Receipt className="mb-2 h-10 w-10 stroke-[1.5] text-muted-foreground/60" />
              <p className="font-semibold text-foreground">
                Nenhuma despesa paga com dízimo neste mês ({monthLabel})
              </p>
              <p className="text-xs max-w-md mt-1">
                Ao registrar o pagamento de despesas marcadas com "Dízimo", elas aparecerão aqui
                automaticamente formando a base compartilhada para Dízimo, Oferta e Primícias.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-border">
              <Table>
                {/* Colunas no modelo da seção Oferta: Data / Rótulo / Categoria / Descrição / Conta / Direcionamento / Valor */}
                <TableHeader className="bg-secondary/40">
                  <TableRow>
                    <TableHead className="font-bold w-28">Data</TableHead>
                    <TableHead className="font-bold">Rótulo</TableHead>
                    <TableHead className="font-bold">Categoria</TableHead>
                    <TableHead className="font-bold">Descrição</TableHead>
                    <TableHead className="font-bold">Conta / Saída</TableHead>
                    <TableHead className="font-bold">Direcionamento</TableHead>
                    <TableHead className="font-bold text-center w-28">% Dízimo</TableHead>
                    <TableHead className="text-right font-bold w-32">Valor Bruto</TableHead>
                    <TableHead className="text-right font-bold w-36">Base Efetiva</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ocorrenciasFiltradas.map((oc) => {
                    const comp = oc.expand?.compromisso
                    const catNome =
                      oc.expand?.compromisso?.expand?.categoria?.nome ||
                      getCategoriaNome(comp?.categoria)
                    const dataPag = formatDataPagamentoBrasilia(oc.data_pagamento)
                    const rotuloNome = getTipoDizimoNome(oc.tipo_dizimo, oc.expand?.tipo_dizimo)
                    const pct = getPercentualDizimoEfetivo(oc)
                    const valorPago = oc.valor_pago || 0
                    const valorEfetivo = (valorPago * pct) / 100

                    return (
                      <TableRow key={oc.id} className="hover:bg-muted/40">
                        {/* Data */}
                        <TableCell className="font-medium text-xs whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                            {dataPag}
                          </span>
                        </TableCell>

                        {/* Rótulo / Marcador ministerial */}
                        <TableCell className="text-xs">
                          <Badge
                            variant="outline"
                            className="text-[11px] font-semibold bg-muted/40"
                          >
                            {rotuloNome}
                          </Badge>
                        </TableCell>

                        {/* Categoria */}
                        <TableCell className="text-xs text-muted-foreground">
                          <Badge variant="outline" className="text-[11px]">
                            {catNome}
                          </Badge>
                        </TableCell>

                        {/* Descrição e Fornecedor */}
                        <TableCell className="font-medium text-foreground">
                          <div>
                            <span>{comp?.descricao || oc.observacoes || 'Despesa'}</span>
                            {comp?.fornecedor && (
                              <span className="block text-[11px] text-muted-foreground">
                                {comp.fornecedor}
                              </span>
                            )}
                          </div>
                        </TableCell>

                        {/* Conta */}
                        <TableCell className="text-xs text-muted-foreground">
                          {getContaNome(oc.conta || comp?.conta_padrao)}
                        </TableCell>

                        {/* Direcionamento */}
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => handleOpenDirecionamento(oc)}
                            className="group flex items-center gap-1.5 text-xs text-foreground font-medium hover:text-primary"
                            title="Editar direcionamento desta oferta/despesa"
                          >
                            {oc.direcionamento ? (
                              <Badge
                                variant="outline"
                                className="border-primary/40 bg-primary/5 text-primary text-[11px]"
                              >
                                {oc.direcionamento}
                              </Badge>
                            ) : (
                              <span className="italic text-muted-foreground text-xs">
                                + Adicionar direcionamento
                              </span>
                            )}
                            {can(user?.role, 'writeFinance') && (
                              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                            )}
                          </button>
                        </TableCell>

                        {/* Percentual com botão para ajuste retroativo */}
                        <TableCell className="text-center">
                          <button
                            type="button"
                            onClick={() => handleOpenEditPercentualOcorr(oc)}
                            className="group inline-flex items-center gap-1 hover:opacity-80"
                            title="Clique para ajustar percentual desta ocorrência"
                          >
                            <Badge
                              variant={pct === 100 ? 'secondary' : 'outline'}
                              className={`text-[11px] font-bold ${
                                pct === 100
                                  ? 'bg-secondary text-foreground'
                                  : pct === 0
                                    ? 'bg-destructive/10 text-destructive border-destructive/30'
                                    : 'bg-amber-500/10 text-amber-700 border-amber-300'
                              }`}
                            >
                              {pct}%
                            </Badge>
                            {can(user?.role, 'writeFinance') && (
                              <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                            )}
                          </button>
                        </TableCell>

                        {/* Valor Pago Bruto */}
                        <TableCell className="text-right text-xs text-muted-foreground">
                          {formatCurrency(valorPago)}
                        </TableCell>

                        {/* Valor Efetivo na Base */}
                        <TableCell className="text-right font-bold text-foreground">
                          {formatCurrency(valorEfetivo)}
                        </TableCell>
                      </TableRow>
                    )
                  })}

                  {/* Subtotal da Base Única Compartilhada */}
                  <TableRow className="bg-secondary/30 font-bold border-t-2 border-border">
                    <TableCell colSpan={7} className="text-right uppercase tracking-wider text-xs">
                      Totais ({monthLabel}):
                    </TableCell>
                    <TableCell className="text-right text-xs text-muted-foreground font-semibold">
                      {formatCurrency(totalBrutoPago)}
                    </TableCell>
                    <TableCell className="text-right text-base text-foreground font-black">
                      {formatCurrency(baseCompartilhada)}
                    </TableCell>
                  </TableRow>

                  {/* Linha de Resultado Específica da Seção Ativa */}
                  {tipo === 'dizimo' && (
                    <TableRow className="bg-[#DF5830]/10 font-bold">
                      <TableCell colSpan={8} className="text-right text-foreground">
                        Dízimo Apurado ({percentualDizimo}% sobre a base efetiva):
                      </TableCell>
                      <TableCell
                        className="text-right text-base font-black"
                        style={{ color: corTema }}
                      >
                        {formatCurrency(resultadoDizimo)}
                      </TableCell>
                    </TableRow>
                  )}

                  {tipo === 'oferta' && (
                    <TableRow className="bg-[#B7791F]/10 font-bold">
                      <TableCell colSpan={8} className="text-right text-foreground">
                        Oferta Apurada ({percentualOferta}% sobre a base efetiva):
                      </TableCell>
                      <TableCell
                        className="text-right text-base font-black"
                        style={{ color: corTema }}
                      >
                        {formatCurrency(resultadoOferta)}
                      </TableCell>
                    </TableRow>
                  )}

                  {tipo === 'primicias' && (
                    <TableRow className="bg-[#1E6F5C]/10 font-bold">
                      <TableCell colSpan={8} className="text-right text-foreground">
                        Primícias Apuradas (Fator 1/{diasNoMes} sobre a base efetiva):
                      </TableCell>
                      <TableCell
                        className="text-right text-base font-black"
                        style={{ color: corTema }}
                      >
                        {formatCurrency(resultadoPrimicias)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Dízimos, Ofertas & Primícias"
          description="Base única compartilhada e cálculos independentes de despesas pagas com marcação ministerial."
        />

        {/* Seletor de mês e sincronização */}
        <div className="flex flex-wrap items-center gap-2">
          {compromissosDizimo.length > 0 && can(user?.role, 'writeFinance') && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleSincronizarMes}
              disabled={sincronizandoMes}
              className="h-9 gap-1.5 border-primary/30 text-xs font-semibold text-primary hover:bg-primary/10"
              title={`Sincronizar ocorrências pendentes de ${monthLabel}`}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sincronizandoMes ? 'animate-spin' : ''}`} />
              <span>Sincronizar mês</span>
            </Button>
          )}

          <div className="flex items-center gap-2 rounded-xl border border-border bg-white p-1.5 shadow-soft">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handlePrevMonth}
              title="Mês anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="flex items-center gap-2 px-2 text-sm font-bold text-foreground">
              <CalendarDays className="h-4 w-4 text-primary" />
              <span>{monthLabel}</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={handleNextMonth}
              title="Próximo mês"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              onClick={loadData}
              title="Atualizar dados"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Cards de Resumo Geral Superior (alimentados pela MESMA base única compartilhada) */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Card Dízimo */}
        <Card
          onClick={() => setActiveTab('dizimo')}
          className={`cursor-pointer border-l-4 transition-all hover:shadow-md flex flex-col justify-between ${
            activeTab === 'dizimo' ? 'ring-2 ring-[#DF5830]/40' : ''
          }`}
          style={{ borderLeftColor: '#DF5830' }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Dízimo ({percentualDizimo}%)
              </span>
              <Badge
                variant="outline"
                className="border-[#DF5830]/30 bg-[#DF5830]/10 text-[#DF5830]"
              >
                Base: {formatCurrency(baseCompartilhada)}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-black text-foreground">
              {formatCurrency(resultadoDizimo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              {ocorrenciasFiltradas.length}{' '}
              {ocorrenciasFiltradas.length === 1
                ? 'despesa paga na base'
                : 'despesas pagas na base'}
            </p>

            {/* Linha de status de pagamento e Botão de Ação */}
            <div className="border-t border-border pt-3">
              {statusDizimo.pago ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-success text-white hover:bg-success/90 font-bold gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pago{' '}
                      {statusDizimo.dataPagamento
                        ? `em ${formatDate(statusDizimo.dataPagamento)}`
                        : '✓'}
                    </Badge>
                    <span className="text-xs font-bold text-foreground tabular-nums">
                      {formatCurrency(statusDizimo.valorPago)}
                    </span>
                  </div>

                  {statusDizimo.baseMudou && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-300 p-2 text-[11px] text-amber-800 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Base atualizada após o pagamento
                      </p>
                      <p className="text-[10px] text-amber-700">
                        Novo total apurado: {formatCurrency(resultadoDizimo)} (dif:{' '}
                        {statusDizimo.diferenca > 0 ? '+' : ''}
                        {formatCurrency(statusDizimo.diferenca)})
                      </p>
                    </div>
                  )}

                  {can(user?.role, 'writeFinance') && statusDizimo.lancamento && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenAjustePagamento(
                            'dizimo',
                            statusDizimo.lancamento!,
                            resultadoDizimo,
                          )
                        }}
                        className="h-7 text-xs flex-1 border-border font-semibold hover:bg-muted"
                      >
                        Ajustar pagamento
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEstornarPagamento(statusDizimo.lancamento!.id, 'dizimo')
                        }}
                        disabled={estornandoPagamento}
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        title="Estornar lançamento de dízimo deste mês"
                      >
                        Estornar
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                can(user?.role, 'writeFinance') && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenRegistrarPagamento('dizimo')
                    }}
                    disabled={resultadoDizimo <= 0}
                    className="w-full gap-1.5 text-xs font-bold shadow-xs text-white"
                    style={{ backgroundColor: '#DF5830' }}
                    title={`Registrar pagamento do dízimo de ${monthLabel}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Registrar pagamento ({formatCurrency(resultadoDizimo)})</span>
                  </Button>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card Oferta */}
        <Card
          onClick={() => setActiveTab('oferta')}
          className={`cursor-pointer border-l-4 transition-all hover:shadow-md flex flex-col justify-between ${
            activeTab === 'oferta' ? 'ring-2 ring-[#B7791F]/40' : ''
          }`}
          style={{ borderLeftColor: '#B7791F' }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Oferta ({percentualOferta}%)
              </span>
              <Badge
                variant="outline"
                className="border-[#B7791F]/30 bg-[#B7791F]/10 text-[#B7791F]"
              >
                Base: {formatCurrency(baseCompartilhada)}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-black text-foreground">
              {formatCurrency(resultadoOferta)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              {ocorrenciasFiltradas.length}{' '}
              {ocorrenciasFiltradas.length === 1
                ? 'despesa paga na base'
                : 'despesas pagas na base'}
            </p>

            {/* Linha de status de pagamento e Botão de Ação */}
            <div className="border-t border-border pt-3">
              {statusOferta.pago ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-success text-white hover:bg-success/90 font-bold gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pago{' '}
                      {statusOferta.dataPagamento
                        ? `em ${formatDate(statusOferta.dataPagamento)}`
                        : '✓'}
                    </Badge>
                    <span className="text-xs font-bold text-foreground tabular-nums">
                      {formatCurrency(statusOferta.valorPago)}
                    </span>
                  </div>

                  {statusOferta.baseMudou && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-300 p-2 text-[11px] text-amber-800 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Base atualizada após o pagamento
                      </p>
                      <p className="text-[10px] text-amber-700">
                        Novo total apurado: {formatCurrency(resultadoOferta)} (dif:{' '}
                        {statusOferta.diferenca > 0 ? '+' : ''}
                        {formatCurrency(statusOferta.diferenca)})
                      </p>
                    </div>
                  )}

                  {can(user?.role, 'writeFinance') && statusOferta.lancamento && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenAjustePagamento(
                            'oferta',
                            statusOferta.lancamento!,
                            resultadoOferta,
                          )
                        }}
                        className="h-7 text-xs flex-1 border-border font-semibold hover:bg-muted"
                      >
                        Ajustar pagamento
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEstornarPagamento(statusOferta.lancamento!.id, 'oferta')
                        }}
                        disabled={estornandoPagamento}
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        title="Estornar lançamento de oferta deste mês"
                      >
                        Estornar
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                can(user?.role, 'writeFinance') && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenRegistrarPagamento('oferta')
                    }}
                    disabled={resultadoOferta <= 0}
                    className="w-full gap-1.5 text-xs font-bold shadow-xs text-white"
                    style={{ backgroundColor: '#B7791F' }}
                    title={`Registrar pagamento da oferta de ${monthLabel}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Registrar pagamento ({formatCurrency(resultadoOferta)})</span>
                  </Button>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* Card Primícias */}
        <Card
          onClick={() => setActiveTab('primicias')}
          className={`cursor-pointer border-l-4 transition-all hover:shadow-md flex flex-col justify-between ${
            activeTab === 'primicias' ? 'ring-2 ring-[#1E6F5C]/40' : ''
          }`}
          style={{ borderLeftColor: '#1E6F5C' }}
        >
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Primícias (1/{diasNoMes} avos)
              </span>
              <Badge
                variant="outline"
                className="border-[#1E6F5C]/30 bg-[#1E6F5C]/10 text-[#1E6F5C]"
              >
                Base: {formatCurrency(baseCompartilhada)}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-black text-foreground">
              {formatCurrency(resultadoPrimicias)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-3">
            <p className="text-xs text-muted-foreground">
              {ocorrenciasFiltradas.length}{' '}
              {ocorrenciasFiltradas.length === 1
                ? 'despesa paga na base'
                : 'despesas pagas na base'}
            </p>

            {/* Linha de status de pagamento e Botão de Ação */}
            <div className="border-t border-border pt-3">
              {statusPrimicias.pago ? (
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Badge className="bg-success text-white hover:bg-success/90 font-bold gap-1 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Pago{' '}
                      {statusPrimicias.dataPagamento
                        ? `em ${formatDate(statusPrimicias.dataPagamento)}`
                        : '✓'}
                    </Badge>
                    <span className="text-xs font-bold text-foreground tabular-nums">
                      {formatCurrency(statusPrimicias.valorPago)}
                    </span>
                  </div>

                  {statusPrimicias.baseMudou && (
                    <div className="rounded-lg bg-amber-500/10 border border-amber-300 p-2 text-[11px] text-amber-800 space-y-1">
                      <p className="font-semibold flex items-center gap-1">
                        <AlertCircle className="h-3 w-3 shrink-0" />
                        Base atualizada após o pagamento
                      </p>
                      <p className="text-[10px] text-amber-700">
                        Novo total apurado: {formatCurrency(resultadoPrimicias)} (dif:{' '}
                        {statusPrimicias.diferenca > 0 ? '+' : ''}
                        {formatCurrency(statusPrimicias.diferenca)})
                      </p>
                    </div>
                  )}

                  {can(user?.role, 'writeFinance') && statusPrimicias.lancamento && (
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleOpenAjustePagamento(
                            'primicias',
                            statusPrimicias.lancamento!,
                            resultadoPrimicias,
                          )
                        }}
                        className="h-7 text-xs flex-1 border-border font-semibold hover:bg-muted"
                      >
                        Ajustar pagamento
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleEstornarPagamento(statusPrimicias.lancamento!.id, 'primicias')
                        }}
                        disabled={estornandoPagamento}
                        className="h-7 text-xs text-destructive hover:bg-destructive/10"
                        title="Estornar lançamento de primícias deste mês"
                      >
                        Estornar
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                can(user?.role, 'writeFinance') && (
                  <Button
                    type="button"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleOpenRegistrarPagamento('primicias')
                    }}
                    disabled={resultadoPrimicias <= 0}
                    className="w-full gap-1.5 text-xs font-bold shadow-xs text-white"
                    style={{ backgroundColor: '#1E6F5C' }}
                    title={`Registrar pagamento de primícias de ${monthLabel}`}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Registrar pagamento ({formatCurrency(resultadoPrimicias)})</span>
                  </Button>
                )
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Navegação entre as 3 categorias */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as TipoCalculoDizimo)}
        className="space-y-6"
      >
        <TabsList className="grid h-auto w-full grid-cols-3 rounded-xl bg-secondary/60 p-1">
          <TabsTrigger
            value="dizimo"
            className="flex items-center justify-center gap-2 py-3 text-xs font-bold sm:text-sm"
          >
            <DollarSign className="h-4 w-4 text-[#DF5830]" />
            <span>Dízimo</span>
          </TabsTrigger>
          <TabsTrigger
            value="oferta"
            className="flex items-center justify-center gap-2 py-3 text-xs font-bold sm:text-sm"
          >
            <HeartHandshake className="h-4 w-4 text-[#B7791F]" />
            <span>Oferta</span>
          </TabsTrigger>
          <TabsTrigger
            value="primicias"
            className="flex items-center justify-center gap-2 py-3 text-xs font-bold sm:text-sm"
          >
            <Sparkles className="h-4 w-4 text-[#1E6F5C]" />
            <span>Primícias</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: DÍZIMO */}
        <TabsContent value="dizimo" className="space-y-6">
          {renderCardCalculo('dizimo')}
          {renderTabelaAuditoria('dizimo')}
        </TabsContent>

        {/* TAB 2: OFERTA */}
        <TabsContent value="oferta" className="space-y-6">
          {renderCardCalculo('oferta')}
          {renderTabelaAuditoria('oferta')}
          <OfertasVoluntariasModule
            selectedMonth={selectedMonth}
            monthLabel={monthLabel}
            ofertas={ofertasVoluntarias}
            movimentacoesCaixa={movimentacoesCaixa}
            resumoCaixa={resumoCaixa}
            loading={loading}
            onReload={reloadOfertasVoluntarias}
          />
        </TabsContent>

        {/* TAB 3: PRIMÍCIAS */}
        <TabsContent value="primicias" className="space-y-6">
          {renderCardCalculo('primicias')}
          {renderTabelaAuditoria('primicias')}
        </TabsContent>
      </Tabs>

      {/* DIALOG: EDITAR PERCENTUAL */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              Editar percentual de {editingType === 'dizimo' ? 'Dízimo' : 'Oferta'}
            </DialogTitle>
            <DialogDescription>
              Defina a alíquota percentual que será multiplicada pela base única de despesas pagas
              para {editingType === 'dizimo' ? 'dízimo' : 'oferta'}.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePercentual} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="percentual">Percentual a ser aplicado (%)</Label>
              <div className="relative">
                <Input
                  id="percentual"
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  value={percentualInput}
                  onChange={(e) => setPercentualInput(e.target.value)}
                  placeholder="Ex: 10"
                  className="pr-8 text-lg font-bold"
                  required
                  autoFocus
                />
                <span className="absolute right-3 top-2.5 text-muted-foreground font-bold">%</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Exemplo: 10% calcula um décimo da base de despesas pagas; 5% calcula a vigésima
                parte.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDialogOpen(false)}
                disabled={savingPercentual}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingPercentual}>
                {savingPercentual ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Salvar percentual
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: EDITAR DIRECIONAMENTO */}
      <Dialog open={editDirecionamentoOpen} onOpenChange={setEditDirecionamentoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <HeartHandshake className="h-5 w-5 text-primary" />
              Direcionamento da Oferta / Despesa
            </DialogTitle>
            <DialogDescription>
              Indique para onde ou para quem o recurso foi direcionado (ex.: "Bateria", "Louvor",
              "Missões", "Sede").
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSaveDirecionamento} className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs">
              <p className="font-bold text-foreground">
                {editingOcorrencia?.expand?.compromisso?.descricao ||
                  editingOcorrencia?.observacoes ||
                  'Despesa selecionada'}
              </p>
              <p className="text-muted-foreground">
                Valor pago: {formatCurrency(editingOcorrencia?.valor_pago || 0)}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="direcionamento">Direcionamento</Label>
              <Input
                id="direcionamento"
                value={direcionamentoInput}
                onChange={(e) => setDirecionamentoInput(e.target.value)}
                placeholder="Ex.: Ministério de Louvor, Bateria, Igreja Sede..."
                autoFocus
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditDirecionamentoOpen(false)}
                disabled={savingDirecionamento}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingDirecionamento}>
                {savingDirecionamento ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Salvar direcionamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: EDITAR PERCENTUAL DE DÍZIMO DA OCORRÊNCIA (AJUSTE RETROATIVO) */}
      <Dialog open={editPercentualOcorrOpen} onOpenChange={setEditPercentualOcorrOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              Percentual de Dízimo da Ocorrência
            </DialogTitle>
            <DialogDescription>
              Ajuste o percentual desta despesa/parcela específica paga que compõe a base do dízimo
              deste mês.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSavePercentualOcorrencia} className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-1">
              <p className="font-bold text-foreground">
                {editingOcorrenciaPercentual?.expand?.compromisso?.descricao ||
                  editingOcorrenciaPercentual?.observacoes ||
                  'Despesa selecionada'}
              </p>
              <p className="text-muted-foreground">
                Valor pago: {formatCurrency(editingOcorrenciaPercentual?.valor_pago || 0)} · Pago
                em: {formatDataPagamentoBrasilia(editingOcorrenciaPercentual?.data_pagamento)}
              </p>
              <p className="text-xs font-semibold text-primary">
                Valor que entrará na base:{' '}
                {formatCurrency(
                  ((editingOcorrenciaPercentual?.valor_pago || 0) * percentualOcorrenciaInput) /
                    100,
                )}
              </p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Percentual sobre esta ocorrência (%)</Label>
                <span className="text-xs font-bold text-primary">{percentualOcorrenciaInput}%</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {[100, 75, 50, 25, 0].map((pct) => (
                  <Button
                    key={pct}
                    type="button"
                    size="sm"
                    variant={percentualOcorrenciaInput === pct ? 'default' : 'outline'}
                    className={`h-7 px-2.5 text-xs font-semibold ${
                      percentualOcorrenciaInput === pct
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-background'
                    }`}
                    onClick={() => setPercentualOcorrenciaInput(pct)}
                  >
                    {pct}%
                  </Button>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <span className="text-xs text-muted-foreground">Custom:</span>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={percentualOcorrenciaInput}
                    onChange={(e) => {
                      const val = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                      setPercentualOcorrenciaInput(val)
                    }}
                    className="h-7 w-16 text-xs text-right font-semibold"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                0% remove esta despesa da base do dízimo; 50% computa metade do valor pago; 100%
                computa o valor integral.
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setEditPercentualOcorrOpen(false)}
                disabled={savingPercentualOcorrencia}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={savingPercentualOcorrencia}>
                {savingPercentualOcorrencia ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Salvar percentual
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG DE BAIXA OFICIAL: REUTILIZA BAIXAOCORRENCIADIALOG */}
      <BaixaOcorrenciaDialog
        open={baixaModalOpen}
        onOpenChange={(open) => {
          setBaixaModalOpen(open)
          if (!open) {
            setOcorrenciaParaBaixar(null)
            setCompromissoParaBaixar(null)
          }
        }}
        ocorrencia={ocorrenciaParaBaixar}
        compromisso={compromissoParaBaixar}
        contas={contas}
        onSuccess={async () => {
          await loadData()
          setOcorrenciaParaBaixar(null)
          setCompromissoParaBaixar(null)
          toast({
            title: 'Pagamento ministerial registrado!',
            description:
              'A ocorrência foi baixada e integrada automaticamente à base de dízimos e ao saldo da conta.',
          })
        }}
      />

      {/* DIALOG: REGISTRAR PAGAMENTO MINISTERIAL DO MÊS */}
      <Dialog open={pagamentoModalOpen} onOpenChange={setPagamentoModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2
                className="h-5 w-5"
                style={{
                  color:
                    tipoParaPagar === 'dizimo'
                      ? '#DF5830'
                      : tipoParaPagar === 'oferta'
                        ? '#B7791F'
                        : '#1E6F5C',
                }}
              />
              Registrar pagamento de{' '}
              {tipoParaPagar === 'dizimo'
                ? 'Dízimo'
                : tipoParaPagar === 'oferta'
                  ? 'Oferta'
                  : 'Primícias'}
            </DialogTitle>
            <DialogDescription>
              Confirmação de pagamento único referente a <strong>{monthLabel}</strong>. Será gerado
              um lançamento financeiro em <strong>/lancamentos</strong> debitado da conta
              selecionada.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmarPagamento} className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Descrição do lançamento:</span>
                <strong className="text-foreground">
                  {formatDescricaoMinisterial(tipoParaPagar, monthLabel)}
                </strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Competência:</span>
                <span className="font-mono font-semibold text-foreground">{selectedMonth}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Base apurada:</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(baseCompartilhada)}
                </span>
              </div>
            </div>

            {/* Valor preenchido */}
            <div className="space-y-1.5">
              <Label htmlFor="valor-pagamento">Valor a Pagar (R$)</Label>
              <Input
                id="valor-pagamento"
                type="number"
                step="0.01"
                min="0.01"
                value={pagamentoValorInput}
                onChange={(e) => setPagamentoValorInput(Number(e.target.value) || 0)}
                className="text-lg font-black"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                Valor pré-calculado sobre a base de {formatCurrency(baseCompartilhada)}.
              </p>
            </div>

            {/* Conta de Débito */}
            <div className="space-y-1.5">
              <Label htmlFor="conta-pagamento">Conta de Débito (Saída do recurso)</Label>
              <Select value={pagamentoContaId} onValueChange={setPagamentoContaId}>
                <SelectTrigger id="conta-pagamento">
                  <SelectValue placeholder="Selecione a conta bancária ou de caixa" />
                </SelectTrigger>
                <SelectContent>
                  {contas
                    .filter((c) => c.ativa)
                    .map((cta) => (
                      <SelectItem key={cta.id} value={cta.id}>
                        {cta.nome} {cta.banco ? `(${cta.banco})` : ''} — Saldo:{' '}
                        {formatCurrency(cta.saldo_atual || 0)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data do Pagamento */}
            <div className="space-y-1.5">
              <Label htmlFor="data-pagamento">Data do Pagamento</Label>
              <Input
                id="data-pagamento"
                type="date"
                value={pagamentoData}
                onChange={(e) => setPagamentoData(e.target.value)}
                required
              />
            </div>

            {/* Observações opcionais */}
            <div className="space-y-1.5">
              <Label htmlFor="obs-pagamento">Observações (Opcional)</Label>
              <Textarea
                id="obs-pagamento"
                rows={2}
                placeholder="Ex.: Pago via PIX pelo banco Santander..."
                value={pagamentoObservacoes}
                onChange={(e) => setPagamentoObservacoes(e.target.value)}
              />
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                onClick={() => setPagamentoModalOpen(false)}
                disabled={savingPagamento}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingPagamento}
                style={{
                  backgroundColor:
                    tipoParaPagar === 'dizimo'
                      ? '#DF5830'
                      : tipoParaPagar === 'oferta'
                        ? '#B7791F'
                        : '#1E6F5C',
                  color: '#fff',
                }}
              >
                {savingPagamento ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="mr-2 h-4 w-4" />
                )}
                Confirmar pagamento
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG: AJUSTAR PAGAMENTO MINISTERIAL DO MÊS */}
      <Dialog open={ajusteModalOpen} onOpenChange={setAjusteModalOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5 text-primary" />
              Ajustar pagamento de{' '}
              {ajusteTipo === 'dizimo'
                ? 'Dízimo'
                : ajusteTipo === 'oferta'
                  ? 'Oferta'
                  : 'Primícias'}
            </DialogTitle>
            <DialogDescription>
              Edite os dados do lançamento de {monthLabel}. Você também pode estornar o lançamento
              se desejar cancelá-lo.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleConfirmarAjuste} className="space-y-4">
            <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Lançamento:</span>
                <strong className="text-foreground">{lancamentoParaAjustar?.descricao}</strong>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Valor pago atualmente:</span>
                <span className="font-semibold text-foreground">
                  {formatCurrency(lancamentoParaAjustar?.valor || 0)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total apurado recalculado:</span>
                <span className="font-bold text-primary">
                  {formatCurrency(
                    ajusteTipo === 'dizimo'
                      ? resultadoDizimo
                      : ajusteTipo === 'oferta'
                        ? resultadoOferta
                        : resultadoPrimicias,
                  )}
                </span>
              </div>
            </div>

            {/* Valor ajustado */}
            <div className="space-y-1.5">
              <Label htmlFor="valor-ajuste">Novo Valor (R$)</Label>
              <Input
                id="valor-ajuste"
                type="number"
                step="0.01"
                min="0.01"
                value={ajusteValorInput}
                onChange={(e) => setAjusteValorInput(Number(e.target.value) || 0)}
                className="text-lg font-black"
                required
              />
            </div>

            {/* Conta */}
            <div className="space-y-1.5">
              <Label htmlFor="conta-ajuste">Conta</Label>
              <Select value={ajusteContaId} onValueChange={setAjusteContaId}>
                <SelectTrigger id="conta-ajuste">
                  <SelectValue placeholder="Selecione a conta" />
                </SelectTrigger>
                <SelectContent>
                  {contas
                    .filter((c) => c.ativa)
                    .map((cta) => (
                      <SelectItem key={cta.id} value={cta.id}>
                        {cta.nome} {cta.banco ? `(${cta.banco})` : ''}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {/* Data */}
            <div className="space-y-1.5">
              <Label htmlFor="data-ajuste">Data</Label>
              <Input
                id="data-ajuste"
                type="date"
                value={ajusteData}
                onChange={(e) => setAjusteData(e.target.value)}
                required
              />
            </div>

            {/* Observações */}
            <div className="space-y-1.5">
              <Label htmlFor="obs-ajuste">Observações</Label>
              <Textarea
                id="obs-ajuste"
                rows={2}
                value={ajusteObservacoes}
                onChange={(e) => setAjusteObservacoes(e.target.value)}
              />
            </div>

            <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2">
              <Button
                type="button"
                variant="destructive"
                onClick={() => {
                  if (lancamentoParaAjustar) {
                    handleEstornarPagamento(lancamentoParaAjustar.id, ajusteTipo)
                  }
                }}
                disabled={savingAjuste || estornandoPagamento}
              >
                {estornandoPagamento ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : null}
                Estornar pagamento
              </Button>

              <div className="flex items-center gap-2 justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setAjusteModalOpen(false)}
                  disabled={savingAjuste}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={savingAjuste}>
                  {savingAjuste ? (
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="mr-2 h-4 w-4" />
                  )}
                  Salvar alteração
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
