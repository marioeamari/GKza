import { useEffect, useMemo, useState } from 'react'
import {
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
import type {
  Categoria,
  Conta,
  ConfigCalculo,
  DespesaOcorrencia,
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

// Extrai o mês YYYY-MM segundo o fuso de Brasília
function getMesBrasilia(dateStr?: string | null): string | null {
  if (!dateStr) return null
  try {
    const iso =
      dateStr.includes(' ') && !dateStr.includes('T') ? dateStr.replace(' ', 'T') : dateStr
    const d = new Date(iso)
    if (!isNaN(d.getTime())) {
      return getLocalDateStr(d).slice(0, 7) // 'YYYY-MM'
    }
  } catch {
    /* fallback */
  }
  return dateStr.slice(0, 7)
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
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])

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
      const [tipos, configsList, cts, cats, ocorrencias, ofVoluntarias, cxMovs, cxResumo] =
        await Promise.all([
          despesasService.listTiposDizimo(),
          despesasService.listConfigCalculos(),
          financeService.listContas(),
          financeService.listCategorias(),
          despesasService.listOcorrencias({
            filter: `status = 'paga' && dizimo = true`,
            expand: 'compromisso,compromisso.categoria,conta,tipo_dizimo,lancamento',
          }),
          ofertasService.getOfertasMes(selectedMonth),
          ofertasService.listMovimentacoesMes(selectedMonth),
          ofertasService.getResumoCaixa(selectedMonth),
        ])

      setTiposDizimo(tipos)
      setContas(cts)
      setCategorias(cats)
      setOcorrenciasPagas(ocorrencias)
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

  // BASE ÚNICA COMPARTILHADA:
  // As 3 seções (Dízimo, Oferta, Primícias) utilizam a mesma base de cálculo =
  // ocorrências com dizimo=true, status='paga', com data_pagamento dentro do mês de referência (fuso Brasília).
  // O campo tipo_dizimo deixa de ser critério de filtro da base.
  const ocorrenciasFiltradas = useMemo(() => {
    return ocorrenciasPagas
      .filter((oc) => {
        if (oc.status !== 'paga') return false
        const mes =
          getMesBrasilia(oc.data_pagamento) || (oc.competencia ? oc.competencia.slice(0, 7) : null)
        return mes === selectedMonth
      })
      .sort((a, b) => {
        const dataA = a.data_pagamento || a.competencia || ''
        const dataB = b.data_pagamento || b.competencia || ''
        return dataA.localeCompare(dataB)
      })
  }, [ocorrenciasPagas, selectedMonth])

  // Montante total da base única compartilhada
  const baseCompartilhada = useMemo(
    () => ocorrenciasFiltradas.reduce((acc, oc) => acc + (oc.valor_pago || 0), 0),
    [ocorrenciasFiltradas],
  )

  // Percentuais e fatores por tipo
  const percentualDizimo = configs.dizimo?.percentual ?? 10
  const percentualOferta = configs.oferta?.percentual ?? 5
  const fatorPrimicias = 1 / diasNoMes

  // Valores calculados resultantes sobre a MESMA base
  const resultadoDizimo = (baseCompartilhada * percentualDizimo) / 100
  const resultadoOferta = (baseCompartilhada * percentualOferta) / 100
  const resultadoPrimicias = baseCompartilhada * fatorPrimicias

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
                      Base paga no mês: {formatCurrency(baseCompartilhada)}
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

              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-[#DF5830] shrink-0" />
                <span>
                  Base única compartilhada: <strong>{ocorrenciasFiltradas.length}</strong>{' '}
                  {ocorrenciasFiltradas.length === 1 ? 'despesa paga' : 'despesas pagas'} em{' '}
                  <strong>{monthLabel}</strong> (fuso Brasília) compõem a base de cálculo.
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
                      Base paga no mês: {formatCurrency(baseCompartilhada)}
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

              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Info className="h-4 w-4 text-[#B7791F] shrink-0" />
                <span>
                  O montante base de cálculo é o mesmo do dízimo. Você pode atribuir o{' '}
                  <em>"Direcionamento"</em> específico (ex.: Louvor, Bateria, Missões) em cada linha
                  abaixo para auditoria do destino dos recursos.
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
                    Base paga no mês: {formatCurrency(baseCompartilhada)}
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

            <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Info className="h-4 w-4 text-[#1E6F5C] shrink-0" />
              <span>
                No mês de <strong>{monthLabel}</strong> (com <strong>{diasNoMes} dias</strong>), o
                cálculo equivale a 1 dia ({((1 / diasNoMes) * 100).toFixed(2)}%) sobre a base única
                compartilhada de despesas pagas.
              </span>
            </div>
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
                    <TableHead className="text-right font-bold w-36">Valor Pago</TableHead>
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

                        {/* Valor Pago */}
                        <TableCell className="text-right font-bold text-foreground">
                          {formatCurrency(oc.valor_pago || 0)}
                        </TableCell>
                      </TableRow>
                    )
                  })}

                  {/* Subtotal da Base Única Compartilhada */}
                  <TableRow className="bg-secondary/30 font-bold border-t-2 border-border">
                    <TableCell colSpan={6} className="text-right uppercase tracking-wider text-xs">
                      Total da Base Compartilhada ({monthLabel}):
                    </TableCell>
                    <TableCell className="text-right text-base text-foreground font-black">
                      {formatCurrency(baseCompartilhada)}
                    </TableCell>
                  </TableRow>

                  {/* Linha de Resultado Específica da Seção Ativa */}
                  {tipo === 'dizimo' && (
                    <TableRow className="bg-[#DF5830]/10 font-bold">
                      <TableCell colSpan={6} className="text-right text-foreground">
                        Dízimo Apurado ({percentualDizimo}% sobre a base):
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
                      <TableCell colSpan={6} className="text-right text-foreground">
                        Oferta Apurada ({percentualOferta}% sobre a base):
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
                      <TableCell colSpan={6} className="text-right text-foreground">
                        Primícias Apuradas (Fator 1/{diasNoMes} sobre a base):
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

        {/* Seletor de mês */}
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

      {/* Cards de Resumo Geral Superior (alimentados pela MESMA base única compartilhada) */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Card Dízimo */}
        <Card
          onClick={() => setActiveTab('dizimo')}
          className={`cursor-pointer border-l-4 transition-all hover:shadow-md ${
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
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {ocorrenciasFiltradas.length}{' '}
            {ocorrenciasFiltradas.length === 1 ? 'despesa paga na base' : 'despesas pagas na base'}
          </CardContent>
        </Card>

        {/* Card Oferta */}
        <Card
          onClick={() => setActiveTab('oferta')}
          className={`cursor-pointer border-l-4 transition-all hover:shadow-md ${
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
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {ocorrenciasFiltradas.length}{' '}
            {ocorrenciasFiltradas.length === 1 ? 'despesa paga na base' : 'despesas pagas na base'}
          </CardContent>
        </Card>

        {/* Card Primícias */}
        <Card
          onClick={() => setActiveTab('primicias')}
          className={`cursor-pointer border-l-4 transition-all hover:shadow-md ${
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
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {ocorrenciasFiltradas.length}{' '}
            {ocorrenciasFiltradas.length === 1 ? 'despesa paga na base' : 'despesas pagas na base'}
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
    </div>
  )
}
