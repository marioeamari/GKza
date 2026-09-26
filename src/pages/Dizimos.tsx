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
  FileSpreadsheet,
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
import type {
  Categoria,
  Conta,
  ConfigCalculo,
  DespesaOcorrencia,
  TipoCalculoDizimo,
  TipoDizimo,
} from '@/types/domain'

export default function Dizimos() {
  const { user } = useAuth()
  const { toast } = useToast()

  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<TipoCalculoDizimo>('dizimo')

  // Mês de referência (default mês corrente segundo fuso local / Brasília)
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
      const [tipos, configsList, cts, cats, ocorrencias] = await Promise.all([
        despesasService.listTiposDizimo(),
        despesasService.listConfigCalculos(),
        financeService.listContas(),
        financeService.listCategorias(),
        despesasService.listOcorrencias({
          filter: `status = 'paga' && dizimo = true`,
          expand: 'compromisso,compromisso.categoria,conta,tipo_dizimo,lancamento',
        }),
      ])

      setTiposDizimo(tipos)
      setContas(cts)
      setCategorias(cats)
      setOcorrenciasPagas(ocorrencias)

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

  useEffect(() => {
    loadData()
  }, [])

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

  // Identifica os IDs de tipos_dizimo correspondentes a cada categoria
  const idsPorTipo = useMemo(() => {
    const normalize = (s: string) =>
      s
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')

    const res: Record<TipoCalculoDizimo, string[]> = {
      dizimo: [],
      oferta: [],
      primicias: [],
    }

    for (const t of tiposDizimo) {
      const nomeNorm = normalize(t.nome || '')
      if (nomeNorm.includes('primicia') || nomeNorm.includes('premica')) {
        res.primicias.push(t.id)
      } else if (nomeNorm.includes('oferta')) {
        res.oferta.push(t.id)
      } else if (nomeNorm.includes('dizimo')) {
        res.dizimo.push(t.id)
      } else {
        // Fallback: se não tiver palavras-chave, associa ao dízimo por padrão
        res.dizimo.push(t.id)
      }
    }
    return res
  }, [tiposDizimo])

  // Filtra as despesas pagas no mês selecionado (pela data_pagamento ou competência)
  // O usuário foi enfático: SÓ entra despesa efetivamente PAGA/BAIXADA!
  const ocorrenciasFiltradas = useMemo(() => {
    return ocorrenciasPagas.filter((oc) => {
      if (oc.status !== 'paga') return false
      // Verifica data do pagamento (fuso local: YYYY-MM)
      const dataPag = oc.data_pagamento
        ? oc.data_pagamento.slice(0, 7)
        : oc.competencia?.slice(0, 7)
      return dataPag === selectedMonth
    })
  }, [ocorrenciasPagas, selectedMonth])

  // Separa por categoria de cálculo
  const despesasDizimo = useMemo(() => {
    const ids = idsPorTipo.dizimo
    return ocorrenciasFiltradas.filter((oc) => {
      // Se tiver tipo_dizimo explícito, confere se bate com dízimo
      if (oc.tipo_dizimo) return ids.includes(oc.tipo_dizimo)
      // Se não tiver tipo_dizimo mas tiver dizimo=true e nenhum tipo específico foi marcado como oferta/primícia
      return true
    })
  }, [ocorrenciasFiltradas, idsPorTipo.dizimo])

  const despesasOferta = useMemo(() => {
    const ids = idsPorTipo.oferta
    return ocorrenciasFiltradas.filter((oc) => oc.tipo_dizimo && ids.includes(oc.tipo_dizimo))
  }, [ocorrenciasFiltradas, idsPorTipo.oferta])

  const despesasPrimicias = useMemo(() => {
    const ids = idsPorTipo.primicias
    return ocorrenciasFiltradas.filter((oc) => oc.tipo_dizimo && ids.includes(oc.tipo_dizimo))
  }, [ocorrenciasFiltradas, idsPorTipo.primicias])

  // Totais de base de cálculo
  const baseDizimo = useMemo(
    () => despesasDizimo.reduce((acc, oc) => acc + (oc.valor_pago || 0), 0),
    [despesasDizimo],
  )
  const baseOferta = useMemo(
    () => despesasOferta.reduce((acc, oc) => acc + (oc.valor_pago || 0), 0),
    [despesasOferta],
  )
  const basePrimicias = useMemo(
    () => despesasPrimicias.reduce((acc, oc) => acc + (oc.valor_pago || 0), 0),
    [despesasPrimicias],
  )

  // Percentuais configurados
  const percentualDizimo = configs.dizimo?.percentual ?? 10
  const percentualOferta = configs.oferta?.percentual ?? 10
  const fatorPrimicias = 1 / diasNoMes

  // Valores calculados resultantes
  const resultadoDizimo = (baseDizimo * percentualDizimo) / 100
  const resultadoOfertaCalculada = (baseOferta * percentualOferta) / 100
  const resultadoPrimicias = basePrimicias * fatorPrimicias

  // Abrir modal de edição de percentual
  const handleOpenEdit = (tipo: TipoCalculoDizimo) => {
    setEditingType(tipo)
    const current = configs[tipo]?.percentual ?? (tipo === 'dizimo' || tipo === 'oferta' ? 10 : 0)
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
        description: `O percentual para ${editingType === 'dizimo' ? 'Dízimo' : 'Oferta'} agora é ${val}%.`,
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

  // Editar direcionamento da despesa/oferta
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

  if (loading) return <LoadingState label="Carregando cálculos de dízimos e ofertas..." />

  return (
    <div className="space-y-6 pb-12">
      {/* Cabeçalho */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <PageHeader
          title="Dízimos, Ofertas & Primícias"
          description="Cálculos independentes e auditoria transparente de despesas pagas com marcação ministerial."
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

      {/* Cards de Resumo Geral Superior */}
      <div className="grid gap-4 sm:grid-cols-3">
        {/* Card Dízimo */}
        <Card
          className={`border-l-4 transition-all ${
            activeTab === 'dizimo' ? 'ring-2 ring-primary/40' : ''
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
                Base: {formatCurrency(baseDizimo)}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-black text-foreground">
              {formatCurrency(resultadoDizimo)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {despesasDizimo.length}{' '}
            {despesasDizimo.length === 1 ? 'despesa paga' : 'despesas pagas'} no mês
          </CardContent>
        </Card>

        {/* Card Oferta */}
        <Card
          className={`border-l-4 transition-all ${
            activeTab === 'oferta' ? 'ring-2 ring-primary/40' : ''
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
                Total Ofertas: {formatCurrency(baseOferta)}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-black text-foreground">
              {formatCurrency(baseOferta > 0 ? baseOferta : resultadoOfertaCalculada)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {despesasOferta.length}{' '}
            {despesasOferta.length === 1 ? 'oferta direcionada' : 'ofertas direcionadas'}
          </CardContent>
        </Card>

        {/* Card Primícias */}
        <Card
          className={`border-l-4 transition-all ${
            activeTab === 'primicias' ? 'ring-2 ring-primary/40' : ''
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
                Base: {formatCurrency(basePrimicias)}
              </Badge>
            </div>
            <CardTitle className="text-2xl font-black text-foreground">
              {formatCurrency(resultadoPrimicias)}
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 text-xs text-muted-foreground">
            {despesasPrimicias.length}{' '}
            {despesasPrimicias.length === 1 ? 'despesa paga' : 'despesas pagas'} no mês
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

        {/* =========================================================
            TAB 1: DÍZIMO
           ========================================================= */}
        <TabsContent value="dizimo" className="space-y-6">
          {/* Card de Configuração & Auditoria da Fórmula */}
          <Card className="border border-border shadow-soft">
            <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Calculator className="h-5 w-5 text-primary" />
                  Cálculo do Dízimo Ministerial ({monthLabel})
                </CardTitle>
                <CardDescription>
                  Configuração percentual independente aplicada exclusivamente às despesas ticadas
                  em dízimo e com pagamento baixado.
                </CardDescription>
              </div>

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
            </CardHeader>

            <CardContent>
              {/* Memória de Cálculo Destacada */}
              <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 sm:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Fórmula de Auditoria
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground sm:text-lg">
                      <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border">
                        Base paga: {formatCurrency(baseDizimo)}
                      </span>
                      <span className="text-muted-foreground">×</span>
                      <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border text-primary font-black">
                        {percentualDizimo}%
                      </span>
                      <span className="text-muted-foreground">=</span>
                      <span className="rounded-lg bg-primary px-3 py-1 font-black text-white shadow-xs">
                        {formatCurrency(resultadoDizimo)}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-white p-3 text-right shadow-2xs">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Valor apurado de Dízimo
                    </span>
                    <p className="text-xl font-black text-primary sm:text-2xl">
                      {formatCurrency(resultadoDizimo)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 text-primary shrink-0" />
                  <span>
                    Apenas despesas com status <strong>"paga"</strong> e pagamento realizado em{' '}
                    <strong>{monthLabel}</strong> compõem a base. Despesas previstas não entram no
                    cálculo.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Auditoria / Despesas da Base */}
          <Card className="border border-border shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Despesas Pagas Ticadas em Dízimo (Base de Cálculo)
                </CardTitle>
                <CardDescription>
                  Memória de cálculo detalhada com todas as ocorrências de despesas que geraram a
                  base de {formatCurrency(baseDizimo)}.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="font-bold">
                {despesasDizimo.length} {despesasDizimo.length === 1 ? 'registro' : 'registros'}
              </Badge>
            </CardHeader>

            <CardContent>
              {despesasDizimo.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <Receipt className="mb-2 h-10 w-10 stroke-[1.5] text-muted-foreground/60" />
                  <p className="font-semibold text-foreground">
                    Nenhuma despesa paga com dízimo neste mês
                  </p>
                  <p className="text-xs">
                    Ao registrar o pagamento de despesas marcadas com "Dízimo", elas aparecerão aqui
                    automaticamente.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader className="bg-secondary/40">
                      <TableRow>
                        <TableHead className="font-bold">Data Pagamento</TableHead>
                        <TableHead className="font-bold">Descrição da Despesa</TableHead>
                        <TableHead className="font-bold">Categoria</TableHead>
                        <TableHead className="font-bold">Conta / Saída</TableHead>
                        <TableHead className="font-bold">Direcionamento</TableHead>
                        <TableHead className="text-right font-bold">Valor Pago</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {despesasDizimo.map((oc) => {
                        const comp = oc.expand?.compromisso
                        const catNome =
                          oc.expand?.compromisso?.expand?.categoria?.nome ||
                          getCategoriaNome(comp?.categoria)
                        const dataPag = oc.data_pagamento
                          ? formatDate(oc.data_pagamento.slice(0, 10))
                          : oc.competencia || '—'

                        return (
                          <TableRow key={oc.id} className="hover:bg-muted/40">
                            <TableCell className="font-medium text-xs whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                {dataPag}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {comp?.descricao || oc.observacoes || 'Despesa'}
                              {comp?.fornecedor && (
                                <span className="block text-[11px] text-muted-foreground">
                                  {comp.fornecedor}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[11px]">
                                {catNome}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {getContaNome(oc.conta || comp?.conta_padrao)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => handleOpenDirecionamento(oc)}
                                className="group flex items-center gap-1 text-left hover:text-primary"
                                title="Editar direcionamento"
                              >
                                <span>{oc.direcionamento || '—'}</span>
                                {can(user?.role, 'writeFinance') && (
                                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {formatCurrency(oc.valor_pago || 0)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {/* Subtotal da Base */}
                      <TableRow className="bg-secondary/30 font-bold border-t-2 border-border">
                        <TableCell colSpan={5} className="text-right">
                          Total da Base de Dízimo ({monthLabel}):
                        </TableCell>
                        <TableCell className="text-right text-base text-primary font-black">
                          {formatCurrency(baseDizimo)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-primary/10 font-bold">
                        <TableCell colSpan={5} className="text-right text-foreground">
                          Dízimo Apurado ({percentualDizimo}% sobre a base):
                        </TableCell>
                        <TableCell className="text-right text-base text-primary font-black">
                          {formatCurrency(resultadoDizimo)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================
            TAB 2: OFERTA (MODELO DA PLANILHA DO USUÁRIO)
           ========================================================= */}
        <TabsContent value="oferta" className="space-y-6">
          {/* Card de Configuração & Auditoria da Fórmula de Oferta */}
          <Card className="border border-border shadow-soft">
            <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <FileSpreadsheet className="h-5 w-5 text-[#B7791F]" />
                  Ofertas do Mês ({monthLabel})
                </CardTitle>
                <CardDescription>
                  Organização inspirada no modelo da sua planilha: ofertas pagas discriminadas por
                  Data, Rótulo, Categoria e Valor, com direcionamento específico.
                </CardDescription>
              </div>

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
            </CardHeader>

            <CardContent>
              {/* Memória de Cálculo / Resumo das Ofertas */}
              <div className="rounded-2xl border border-[#B7791F]/30 bg-[#B7791F]/5 p-4 sm:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Totalizador do Mês
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground sm:text-lg">
                      <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border">
                        Total de Ofertas no mês: {formatCurrency(baseOferta)}
                      </span>
                      {baseOferta > 0 && (
                        <>
                          <span className="text-muted-foreground">·</span>
                          <span className="text-xs font-normal text-muted-foreground">
                            Critério percentual configurado: {percentualOferta}% (
                            {formatCurrency(resultadoOfertaCalculada)})
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-border bg-white p-3 text-right shadow-2xs">
                    <span className="text-[11px] font-medium text-muted-foreground">
                      Total Ofertas do Mês
                    </span>
                    <p className="text-xl font-black text-[#B7791F] sm:text-2xl">
                      {formatCurrency(baseOferta)}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Info className="h-4 w-4 text-[#B7791F] shrink-0" />
                  <span>
                    Como normalmente as <strong>ofertas são direcionadas</strong> (ex.: Bateria,
                    Louvor, Igreja, Missões), preencha o campo <em>"Direcionamento"</em> na linha
                    para auditoria.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela no formato exato da planilha do usuário */}
          <Card className="border border-border shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Extrato de Ofertas (Modelo Planilha)
                </CardTitle>
                <CardDescription>
                  Linhas correspondentes às ofertas efetivamente pagas e baixadas no mês.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="font-bold">
                {despesasOferta.length} {despesasOferta.length === 1 ? 'oferta' : 'ofertas'}
              </Badge>
            </CardHeader>

            <CardContent>
              {despesasOferta.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <HeartHandshake className="mb-2 h-10 w-10 stroke-[1.5] text-muted-foreground/60" />
                  <p className="font-semibold text-foreground">
                    Nenhuma oferta paga registrada em {monthLabel}
                  </p>
                  <p className="text-xs max-w-sm mt-1">
                    Para registrar uma oferta no extrato, marque o compromisso ou ocorrência de
                    despesa com tipo de dízimo "Oferta" e registre a baixa.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader className="bg-secondary/40">
                      <TableRow>
                        <TableHead className="font-bold w-28">Data</TableHead>
                        <TableHead className="font-bold">Categoria / Rótulo</TableHead>
                        <TableHead className="font-bold">Direcionamento</TableHead>
                        <TableHead className="font-bold">Descrição</TableHead>
                        <TableHead className="font-bold">Conta</TableHead>
                        <TableHead className="text-right font-bold w-36">Valor</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {despesasOferta.map((oc) => {
                        const comp = oc.expand?.compromisso
                        const catNome =
                          oc.expand?.compromisso?.expand?.categoria?.nome ||
                          getCategoriaNome(comp?.categoria)
                        const dataPag = oc.data_pagamento
                          ? formatDate(oc.data_pagamento.slice(0, 10))
                          : oc.competencia || '—'

                        return (
                          <TableRow key={oc.id} className="hover:bg-muted/40">
                            <TableCell className="font-medium text-xs whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                {dataPag}
                              </span>
                            </TableCell>
                            <TableCell className="font-semibold text-foreground">
                              <div className="flex items-center gap-2">
                                <span className="rounded-md bg-[#B7791F]/10 px-2 py-0.5 text-xs font-bold text-[#B7791F]">
                                  {catNome || 'Oferta'}
                                </span>
                              </div>
                            </TableCell>
                            <TableCell>
                              <button
                                type="button"
                                onClick={() => handleOpenDirecionamento(oc)}
                                className="group flex items-center gap-1.5 text-xs text-foreground font-medium hover:text-primary"
                                title="Editar direcionamento desta oferta"
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
                            <TableCell className="text-xs text-muted-foreground">
                              {comp?.descricao || oc.observacoes || 'Oferta voluntária'}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {getContaNome(oc.conta || comp?.conta_padrao)}
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {formatCurrency(oc.valor_pago || 0)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {/* Linha de Totalização Fechando a Lista */}
                      <TableRow className="bg-secondary/40 font-black border-t-2 border-border text-foreground">
                        <TableCell
                          colSpan={5}
                          className="text-right uppercase tracking-wider text-xs"
                        >
                          Total de Ofertas do Mês ({monthLabel}):
                        </TableCell>
                        <TableCell className="text-right text-base text-[#B7791F] font-black">
                          {formatCurrency(baseOferta)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* =========================================================
            TAB 3: PRIMÍCIAS (1 / DIAS DO MÊS)
           ========================================================= */}
        <TabsContent value="primicias" className="space-y-6">
          {/* Card de Configuração & Auditoria da Fórmula de Primícias */}
          <Card className="border border-border shadow-soft">
            <CardHeader className="flex flex-col gap-3 pb-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground">
                  <Sparkles className="h-5 w-5 text-[#1E6F5C]" />
                  Cálculo de Oferta de Primícias ({monthLabel})
                </CardTitle>
                <CardDescription>
                  Fórmula bíblica proporcional a 1 dia do mês: o fator é exatamente 1 dividido pela
                  quantidade de dias do mês de referência.
                </CardDescription>
              </div>

              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="border-[#1E6F5C]/40 bg-[#1E6F5C]/10 text-[#1E6F5C] font-bold"
                >
                  Fator: 1/{diasNoMes} avos ({((1 / diasNoMes) * 100).toFixed(2)}%)
                </Badge>
              </div>
            </CardHeader>

            <CardContent>
              {/* Memória de Cálculo Destacada */}
              <div className="rounded-2xl border border-[#1E6F5C]/30 bg-[#1E6F5C]/5 p-4 sm:p-5">
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div className="space-y-1">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      Fórmula de Auditoria de Primícias
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-base font-bold text-foreground sm:text-lg">
                      <span className="rounded-lg bg-white px-2.5 py-1 shadow-xs border border-border">
                        Base paga: {formatCurrency(basePrimicias)}
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
                    No mês de <strong>{monthLabel}</strong> (com <strong>{diasNoMes} dias</strong>),
                    o cálculo equivale a 1 dia ({((1 / diasNoMes) * 100).toFixed(2)}%) sobre as
                    despesas marcadas como primícias e efetivamente pagas.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Tabela de Auditoria / Despesas da Base de Primícias */}
          <Card className="border border-border shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base font-bold text-foreground">
                  Despesas Pagas Ticadas em Primícias (Base de Cálculo)
                </CardTitle>
                <CardDescription>
                  Memória de cálculo detalhada com todas as ocorrências de despesas que geraram a
                  base de {formatCurrency(basePrimicias)}.
                </CardDescription>
              </div>
              <Badge variant="secondary" className="font-bold">
                {despesasPrimicias.length}{' '}
                {despesasPrimicias.length === 1 ? 'registro' : 'registros'}
              </Badge>
            </CardHeader>

            <CardContent>
              {despesasPrimicias.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <Sparkles className="mb-2 h-10 w-10 stroke-[1.5] text-muted-foreground/60" />
                  <p className="font-semibold text-foreground">
                    Nenhuma despesa paga com primícias neste mês
                  </p>
                  <p className="text-xs">
                    Ao registrar o pagamento de despesas marcadas com "Primícias", elas aparecerão
                    aqui automaticamente.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <Table>
                    <TableHeader className="bg-secondary/40">
                      <TableRow>
                        <TableHead className="font-bold">Data Pagamento</TableHead>
                        <TableHead className="font-bold">Descrição da Despesa</TableHead>
                        <TableHead className="font-bold">Categoria</TableHead>
                        <TableHead className="font-bold">Conta / Saída</TableHead>
                        <TableHead className="font-bold">Direcionamento</TableHead>
                        <TableHead className="text-right font-bold">Valor Pago</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {despesasPrimicias.map((oc) => {
                        const comp = oc.expand?.compromisso
                        const catNome =
                          oc.expand?.compromisso?.expand?.categoria?.nome ||
                          getCategoriaNome(comp?.categoria)
                        const dataPag = oc.data_pagamento
                          ? formatDate(oc.data_pagamento.slice(0, 10))
                          : oc.competencia || '—'

                        return (
                          <TableRow key={oc.id} className="hover:bg-muted/40">
                            <TableCell className="font-medium text-xs whitespace-nowrap">
                              <span className="inline-flex items-center gap-1.5">
                                <CheckCircle2 className="h-3.5 w-3.5 text-success shrink-0" />
                                {dataPag}
                              </span>
                            </TableCell>
                            <TableCell className="font-medium text-foreground">
                              {comp?.descricao || oc.observacoes || 'Despesa'}
                              {comp?.fornecedor && (
                                <span className="block text-[11px] text-muted-foreground">
                                  {comp.fornecedor}
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <Badge variant="outline" className="text-[11px]">
                                {catNome}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {getContaNome(oc.conta || comp?.conta_padrao)}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              <button
                                type="button"
                                onClick={() => handleOpenDirecionamento(oc)}
                                className="group flex items-center gap-1 text-left hover:text-primary"
                                title="Editar direcionamento"
                              >
                                <span>{oc.direcionamento || '—'}</span>
                                {can(user?.role, 'writeFinance') && (
                                  <Pencil className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                )}
                              </button>
                            </TableCell>
                            <TableCell className="text-right font-bold text-foreground">
                              {formatCurrency(oc.valor_pago || 0)}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                      {/* Subtotal e Resultado de Primícias */}
                      <TableRow className="bg-secondary/30 font-bold border-t-2 border-border">
                        <TableCell colSpan={5} className="text-right">
                          Total da Base de Primícias ({monthLabel}):
                        </TableCell>
                        <TableCell className="text-right text-base text-[#1E6F5C] font-black">
                          {formatCurrency(basePrimicias)}
                        </TableCell>
                      </TableRow>
                      <TableRow className="bg-[#1E6F5C]/10 font-bold">
                        <TableCell colSpan={5} className="text-right text-foreground">
                          Primícias Apuradas (Fator 1/{diasNoMes} sobre a base):
                        </TableCell>
                        <TableCell className="text-right text-base text-[#1E6F5C] font-black">
                          {formatCurrency(resultadoPrimicias)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
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
              Defina a alíquota percentual que será multiplicada pela soma das despesas pagas
              marcadas como {editingType === 'dizimo' ? 'dízimo' : 'oferta'}.
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
                Exemplo: 10% calcula um décimo das despesas pagas; 5% calcula a metade.
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
