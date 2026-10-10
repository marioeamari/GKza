import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Users,
  Plus,
  Calendar,
  Clock,
  QrCode,
  DollarSign,
  TrendingDown,
  Printer,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ExternalLink,
  Copy,
  Receipt,
  FileSpreadsheet,
  Lock,
  Unlock,
  ShieldCheck,
  Building,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { useToast } from '@/hooks/use-toast'
import { useAuth } from '@/contexts/AuthContext'
import {
  funcionariosService,
  type FuncionarioRecord,
  type FuncionarioDividaRecord,
  type FuncionarioPontoRecord,
  type FuncionarioEstacaoRecord,
  type FuncionarioFolhaRecord,
} from '@/services/funcionarios'
import {
  calcularValorHoraBase,
  calcularEspelhoFolha,
  formatarDataExtensoPlanilha,
  normalizarDataPonto,
  type EspelhoFolhaCalculado,
  type DescontoAvulsoItem,
} from '@/lib/funcionarios'
import { formatCurrency, getLocalDateStr } from '@/lib/format'
import pb from '@/lib/pocketbase/client'

export default function FuncionariosPage() {
  const { user } = useAuth()
  const { toast } = useToast()

  // Tabs principais: folha | funcionarios | dividas | estacoes | historico_folhas
  const [activeTab, setActiveTab] = useState<
    'folha' | 'funcionarios' | 'dividas' | 'estacoes' | 'folhas'
  >('folha')

  // Estado geral
  const [loading, setLoading] = useState(true)
  const [funcionarios, setFuncionarios] = useState<FuncionarioRecord[]>([])
  const [selectedFuncionarioId, setSelectedFuncionarioId] = useState<string>('')
  const [dividas, setDividas] = useState<FuncionarioDividaRecord[]>([])
  const [estacoes, setEstacoes] = useState<FuncionarioEstacaoRecord[]>([])
  const [pontos, setPontos] = useState<FuncionarioPontoRecord[]>([])
  const [folhas, setFolhas] = useState<FuncionarioFolhaRecord[]>([])

  // Filtros da Folha do Período (personalizado, semanal, quinzenal, etc.)
  const [periodoInicio, setPeriodoInicio] = useState<string>('')
  const [periodoFim, setPeriodoFim] = useState<string>('')
  const [saldoNegativoAnteriorInput, setSaldoNegativoAnteriorInput] = useState<string>('0')
  const [descontosAvulsos, setDescontosAvulsos] = useState<DescontoAvulsoItem[]>([])
  const [novoDescontoDesc, setNovoDescontoDesc] = useState('')
  const [novoDescontoValor, setNovoDescontoValor] = useState('')

  // Modais de Criação e Edição
  const [isFuncionarioModalOpen, setIsFuncionarioModalOpen] = useState(false)
  const [editingFuncionario, setEditingFuncionario] = useState<FuncionarioRecord | null>(null)
  const [funcForm, setFuncForm] = useState({
    nome: '',
    cargo: '',
    salario_base: 1760,
    dias_mes: 22,
    horas_dia: 8,
    valor_hora: 10,
    hora_almoco_conta: true,
    ciclo_pagamento: 'semanal' as 'semanal' | 'quinzenal' | 'mensal' | 'personalizado',
    pix: '',
    telefone: '',
    pin: '',
    ativo: true,
  })

  // Modal Dívidas
  const [isDividaModalOpen, setIsDividaModalOpen] = useState(false)
  const [editingDivida, setEditingDivida] = useState<FuncionarioDividaRecord | null>(null)
  const [dividaForm, setDividaForm] = useState({
    funcionario: '',
    descricao: '',
    valor_total: 0,
    saldo_atual: 0,
    percentual_abatimento: 60,
    ativa: true,
  })

  // Modal Ponto Manual / Correção
  const [isPontoModalOpen, setIsPontoModalOpen] = useState(false)
  const [editingPonto, setEditingPonto] = useState<FuncionarioPontoRecord | null>(null)
  const [pontoForm, setPontoForm] = useState({
    funcionario: '',
    data: '',
    entrada: '',
    saida: '',
    observacao: '',
  })

  // Modal QR Code da Estação para Impressão
  const [selectedEstacaoQR, setSelectedEstacaoQR] = useState<FuncionarioEstacaoRecord | null>(null)

  // Modal Fechamento de Folha
  const [isFecharFolhaModalOpen, setIsFecharFolhaModalOpen] = useState(false)
  const [gerarLancamentoFinanceiro, setGerarLancamentoFinanceiro] = useState(false)
  const [contasFinanceiro, setContasFinanceiro] = useState<any[]>([])
  const [selectedContaId, setSelectedContaId] = useState<string>('')

  // 1. Carregar listas base
  const carregarDadosIniciais = useCallback(async () => {
    setLoading(true)
    try {
      const [funcs, ests, conts] = await Promise.all([
        funcionariosService.listarFuncionarios(),
        funcionariosService.listarEstacoes(),
        pb.collection('contas').getFullList({ filter: 'ativa = true', sort: 'nome' }),
      ])
      setFuncionarios(funcs)
      setEstacoes(ests)
      setContasFinanceiro(conts)

      if (funcs.length > 0 && !selectedFuncionarioId) {
        setSelectedFuncionarioId(funcs[0].id)
      }

      // Definir período padrão se não estiver definido (últimos 7 dias no fuso oficial)
      if (!periodoInicio || !periodoFim) {
        const hojeStr = getLocalDateStr()
        const inicio = new Date()
        inicio.setDate(inicio.getDate() - 7)
        setPeriodoInicio(getLocalDateStr(inicio))
        setPeriodoFim(hojeStr)
      }
    } catch (err) {
      console.error('Erro ao carregar dados de funcionários:', err)
      toast({
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar a lista de colaboradores.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }, [selectedFuncionarioId, periodoInicio, periodoFim, toast])

  useEffect(() => {
    carregarDadosIniciais()
  }, [carregarDadosIniciais])

  // 2. Carregar pontos e dívidas quando o funcionário selecionado mudar
  const carregarDadosDoFuncionario = useCallback(async (funcId: string) => {
    if (!funcId) return
    try {
      const [pontosList, dividasList, folhasList, ultimaFolha] = await Promise.all([
        funcionariosService.listarPontos({ funcionarioId: funcId }),
        funcionariosService.listarDividas(funcId),
        funcionariosService.listarFolhas(funcId),
        funcionariosService.buscarUltimaFolhaQuitada(funcId),
      ])
      setPontos(pontosList)
      setDividas(dividasList)
      setFolhas(folhasList)

      // Se a última folha fechada tinha saldo a receber negativo, pré-carrega como saldo negativo anterior!
      if (ultimaFolha && ultimaFolha.a_receber < 0) {
        setSaldoNegativoAnteriorInput(String(Math.abs(ultimaFolha.a_receber)))
      } else {
        setSaldoNegativoAnteriorInput('0')
      }
    } catch (err) {
      console.error('Erro ao carregar dados do funcionário selecionado:', err)
    }
  }, [])

  useEffect(() => {
    if (selectedFuncionarioId) {
      carregarDadosDoFuncionario(selectedFuncionarioId)
    }
  }, [selectedFuncionarioId, carregarDadosDoFuncionario])

  // Funcionário selecionado atual
  const funcionarioAtual = useMemo(() => {
    return funcionarios.find((f) => f.id === selectedFuncionarioId) || null
  }, [funcionarios, selectedFuncionarioId])

  // Pontos filtrados pelo período selecionado (com normalização segura YYYY-MM-DD)
  const pontosFiltradosPeriodo = useMemo(() => {
    if (!periodoInicio || !periodoFim) return pontos
    const ini = normalizarDataPonto(periodoInicio)
    const fim = normalizarDataPonto(periodoFim)
    return pontos.filter((p) => {
      const dataP = normalizarDataPonto(p.data)
      return dataP >= ini && dataP <= fim
    })
  }, [pontos, periodoInicio, periodoFim])

  // 3. Cálculo do Espelho da Folha (Regras Aritméticas da Planilha Oficial)
  const espelhoFolha: EspelhoFolhaCalculado | null = useMemo(() => {
    if (!funcionarioAtual) return null

    const saldoNegativo = parseFloat(saldoNegativoAnteriorInput) || 0

    return calcularEspelhoFolha({
      periodoInicio,
      periodoFim,
      valorHora: funcionarioAtual.valor_hora,
      horaAlmocoConta: funcionarioAtual.hora_almoco_conta ?? true,
      pontosBrutos: pontosFiltradosPeriodo.map((p) => ({
        id: p.id,
        data: p.data,
        entrada: p.entrada,
        saida: p.saida || '',
        pausas: p.pausas,
        origem: p.origem,
        estacao: p.estacao,
        localAproximado: p.local_aproximado,
        editadoPor: p.editado_por,
        observacao: p.observacao,
      })),
      dividas: dividas.map((d) => ({
        id: d.id,
        descricao: d.descricao,
        percentualAbatimento: d.percentual_abatimento,
        saldoAtual: d.saldo_atual,
        ativa: d.ativa,
      })),
      saldoNegativoAnterior: saldoNegativo,
      outrosDescontos: descontosAvulsos,
    })
  }, [
    funcionarioAtual,
    periodoInicio,
    periodoFim,
    pontosFiltradosPeriodo,
    dividas,
    saldoNegativoAnteriorInput,
    descontosAvulsos,
  ])

  // Manipular Adição de Desconto Avulso
  const handleAdicionarDescontoAvulso = (e: React.FormEvent) => {
    e.preventDefault()
    const valor = parseFloat(novoDescontoValor.replace(',', '.'))
    if (!novoDescontoDesc || isNaN(valor) || valor <= 0) {
      toast({
        title: 'Dados inválidos',
        description: 'Informe uma descrição e um valor positivo.',
        variant: 'destructive',
      })
      return
    }
    setDescontosAvulsos((prev) => [
      ...prev,
      { id: Math.random().toString(), descricao: novoDescontoDesc, valor },
    ])
    setNovoDescontoDesc('')
    setNovoDescontoValor('')
  }

  const handleRemoverDescontoAvulso = (index: number) => {
    setDescontosAvulsos((prev) => prev.filter((_, i) => i !== index))
  }

  // --- CRUD FUNCIONÁRIOS ---
  const handleOpenFuncionarioModal = (func?: FuncionarioRecord) => {
    if (func) {
      setEditingFuncionario(func)
      setFuncForm({
        nome: func.nome,
        cargo: func.cargo || '',
        salario_base: func.salario_base ?? 1760,
        dias_mes: func.dias_mes ?? 22,
        horas_dia: func.horas_dia ?? 8,
        valor_hora: func.valor_hora,
        hora_almoco_conta: func.hora_almoco_conta ?? true,
        ciclo_pagamento: func.ciclo_pagamento || 'semanal',
        pix: func.pix || '',
        telefone: func.telefone || '',
        pin: func.pin || '',
        ativo: func.ativo ?? true,
      })
    } else {
      setEditingFuncionario(null)
      setFuncForm({
        nome: '',
        cargo: '',
        salario_base: 1760,
        dias_mes: 22,
        horas_dia: 8,
        valor_hora: 10,
        hora_almoco_conta: true,
        ciclo_pagamento: 'semanal',
        pix: '',
        telefone: '',
        pin: '',
        ativo: true,
      })
    }
    setIsFuncionarioModalOpen(true)
  }

  const handleSalvarFuncionario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!funcForm.nome) {
      toast({
        title: 'Nome obrigatório',
        description: 'Preencha o nome do funcionário.',
        variant: 'destructive',
      })
      return
    }

    try {
      if (editingFuncionario) {
        await funcionariosService.atualizarFuncionario(editingFuncionario.id, funcForm)
        toast({ title: 'Funcionário atualizado com sucesso!' })
      } else {
        const novo = await funcionariosService.criarFuncionario(funcForm)
        toast({ title: 'Funcionário cadastrado com sucesso!' })
        setSelectedFuncionarioId(novo.id)
      }
      setIsFuncionarioModalOpen(false)
      carregarDadosIniciais()
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar funcionário',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // Recalcular valor hora na mudança de salário base, dias ou horas
  const handleAtualizarBaseSalarial = (salarioBase: number, diasMes: number, horasDia: number) => {
    const calc = calcularValorHoraBase(salarioBase, diasMes, horasDia)
    setFuncForm((prev) => ({
      ...prev,
      salario_base: salarioBase,
      dias_mes: diasMes,
      horas_dia: horasDia,
      valor_hora: calc,
    }))
  }

  // --- CRUD DÍVIDAS ---
  const handleOpenDividaModal = (divida?: FuncionarioDividaRecord) => {
    if (divida) {
      setEditingDivida(divida)
      setDividaForm({
        funcionario: divida.funcionario,
        descricao: divida.descricao,
        valor_total: divida.valor_total,
        saldo_atual: divida.saldo_atual,
        percentual_abatimento: divida.percentual_abatimento,
        ativa: divida.ativa,
      })
    } else {
      setEditingDivida(null)
      setDividaForm({
        funcionario: selectedFuncionarioId,
        descricao: '',
        valor_total: 0,
        saldo_atual: 0,
        percentual_abatimento: 60,
        ativa: true,
      })
    }
    setIsDividaModalOpen(true)
  }

  const handleSalvarDivida = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dividaForm.funcionario || !dividaForm.descricao) {
      toast({
        title: 'Preencha os campos obrigatórios',
        description: 'Selecione o funcionário e preencha a descrição.',
        variant: 'destructive',
      })
      return
    }

    try {
      if (editingDivida) {
        await funcionariosService.atualizarDivida(editingDivida.id, dividaForm)
        toast({ title: 'Dívida atualizada!' })
      } else {
        await funcionariosService.criarDivida(dividaForm)
        toast({ title: 'Dívida registrada!' })
      }
      setIsDividaModalOpen(false)
      if (selectedFuncionarioId) {
        carregarDadosDoFuncionario(selectedFuncionarioId)
      }
    } catch (err: any) {
      toast({ title: 'Erro ao salvar dívida', description: err.message, variant: 'destructive' })
    }
  }

  const handleExcluirDivida = async (id: string) => {
    if (!confirm('Deseja realmente excluir este registro de dívida?')) return
    try {
      await funcionariosService.excluirDivida(id)
      toast({ title: 'Dívida excluída' })
      if (selectedFuncionarioId) {
        carregarDadosDoFuncionario(selectedFuncionarioId)
      }
    } catch (err: any) {
      toast({ title: 'Erro ao excluir', description: err.message, variant: 'destructive' })
    }
  }

  // --- CRUD PONTOS (CORREÇÃO ADMIN) ---
  const handleOpenPontoModal = (ponto?: FuncionarioPontoRecord) => {
    if (ponto) {
      setEditingPonto(ponto)
      setPontoForm({
        funcionario: ponto.funcionario,
        data: ponto.data,
        entrada: ponto.entrada,
        saida: ponto.saida || '',
        observacao: ponto.observacao || '',
      })
    } else {
      setEditingPonto(null)
      setPontoForm({
        funcionario: selectedFuncionarioId,
        data: getLocalDateStr(),
        entrada: '13:00',
        saida: '17:00',
        observacao: '',
      })
    }
    setIsPontoModalOpen(true)
  }

  const handleSalvarPonto = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!pontoForm.data || !pontoForm.entrada) {
      toast({
        title: 'Dados incompletos',
        description: 'Data e horário de entrada são obrigatórios.',
        variant: 'destructive',
      })
      return
    }

    try {
      const adminNome = user?.name || user?.email || 'Admin'
      if (editingPonto) {
        await funcionariosService.atualizarPontoManual(
          editingPonto.id,
          {
            data: pontoForm.data,
            entrada: pontoForm.entrada,
            saida: pontoForm.saida,
            observacao: pontoForm.observacao,
            origem: 'admin',
          },
          adminNome,
        )
        toast({ title: 'Ponto corrigido pelo administrador!' })
      } else {
        await funcionariosService.registrarEntrada({
          funcionarioId: pontoForm.funcionario || selectedFuncionarioId,
          data: pontoForm.data,
          hora: pontoForm.entrada,
          origem: 'admin',
          editadoPor: adminNome,
          observacao: pontoForm.observacao,
        })
        toast({ title: 'Ponto lançado com sucesso!' })
      }
      setIsPontoModalOpen(false)
      if (selectedFuncionarioId) {
        carregarDadosDoFuncionario(selectedFuncionarioId)
      }
    } catch (err: any) {
      toast({ title: 'Erro ao salvar ponto', description: err.message, variant: 'destructive' })
    }
  }

  const handleExcluirPonto = async (id: string) => {
    if (!confirm('Deseja excluir este registro de ponto?')) return
    try {
      await funcionariosService.excluirPonto(id)
      toast({ title: 'Ponto removido!' })
      if (selectedFuncionarioId) {
        carregarDadosDoFuncionario(selectedFuncionarioId)
      }
    } catch (err: any) {
      toast({ title: 'Erro ao excluir ponto', description: err.message, variant: 'destructive' })
    }
  }

  // --- FECHAMENTO E QUITAÇÃO DA FOLHA ---
  const handleConfirmarFechamentoFolha = async () => {
    if (!espelhoFolha || !funcionarioAtual) return
    try {
      const usuarioNome = user?.name || user?.email || 'Admin'
      await funcionariosService.fecharFolha({
        funcionarioId: funcionarioAtual.id,
        periodoInicio: espelhoFolha.periodoInicio,
        periodoFim: espelhoFolha.periodoFim,
        ganhoTotal: espelhoFolha.totalMonetarioTrabalhado,
        descontos: {
          dividas: espelhoFolha.descontosDividas,
          saldoNegativoAnterior: espelhoFolha.saldoNegativoAnterior,
          outros: espelhoFolha.outrosDescontos,
        },
        dividaSemanal: espelhoFolha.totalDescontos,
        aReceber: espelhoFolha.aReceber,
        quitada: true,
        gerarLancamentoFinanceiro,
        contaId: selectedContaId,
        usuarioNome,
      })

      toast({
        title: 'Folha fechada e quitada com sucesso!',
        description: `Período ${espelhoFolha.periodoInicio} a ${espelhoFolha.periodoFim} finalizado. Dívidas abatidas.`,
      })
      setIsFecharFolhaModalOpen(false)
      carregarDadosDoFuncionario(funcionarioAtual.id)
    } catch (err: any) {
      toast({
        title: 'Falha ao fechar folha',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  // URL do Ponto da Estação
  const getPontoUrl = (estacaoToken: string) => {
    return `${window.location.origin}/funcionarios/ponto/${estacaoToken}`
  }

  return (
    <div className="space-y-6 pb-12">
      {/* CABEÇALHO DA PÁGINA */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900 flex items-center gap-2.5">
            <Users className="h-7 w-7 text-[#DF5830]" />
            Módulo de Funcionários & Ponto
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestão de colaboradores, espelho de ponto eletrônico, folha de pagamento e dívidas
            contratuais.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            onClick={() => handleOpenFuncionarioModal()}
            className="bg-[#DF5830] hover:bg-[#c94b26] text-white shadow-xs font-semibold gap-1.5"
          >
            <Plus className="h-4 w-4" />
            Novo Funcionário
          </Button>

          {estacoes.length > 0 && (
            <Button
              variant="outline"
              onClick={() => setSelectedEstacaoQR(estacoes[0])}
              className="gap-1.5 border-border shadow-2xs font-semibold"
            >
              <QrCode className="h-4 w-4 text-[#DF5830]" />
              QR Estação (Imprimir)
            </Button>
          )}
        </div>
      </div>

      {/* TABS DE NAVEGAÇÃO DO MÓDULO */}
      <Tabs value={activeTab} onValueChange={(v: any) => setActiveTab(v)} className="space-y-5">
        <TabsList className="bg-muted/60 p-1 border border-border/50">
          <TabsTrigger value="folha" className="gap-2 font-semibold">
            <FileSpreadsheet className="h-4 w-4" />
            Espelho da Folha
          </TabsTrigger>
          <TabsTrigger value="funcionarios" className="gap-2 font-semibold">
            <Users className="h-4 w-4" />
            Colaboradores ({funcionarios.length})
          </TabsTrigger>
          <TabsTrigger value="dividas" className="gap-2 font-semibold">
            <TrendingDown className="h-4 w-4" />
            Dívidas & Vales ({dividas.length})
          </TabsTrigger>
          <TabsTrigger value="estacoes" className="gap-2 font-semibold">
            <QrCode className="h-4 w-4" />
            Estações de Ponto ({estacoes.length})
          </TabsTrigger>
          <TabsTrigger value="folhas" className="gap-2 font-semibold">
            <Receipt className="h-4 w-4" />
            Histórico Fechamentos
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: ESPELHO DA FOLHA (REPLICAÇÃO EXATA DA PLANILHA) */}
        <TabsContent value="folha" className="space-y-6 focus-visible:outline-none">
          {/* BARRA DE CONTROLE: SELEÇÃO DE COLABORADOR E PERÍODO */}
          <Card className="border border-border/80 bg-white shadow-xs">
            <CardContent className="pt-4 pb-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">Colaborador</Label>
                  <Select value={selectedFuncionarioId} onValueChange={setSelectedFuncionarioId}>
                    <SelectTrigger className="h-10 bg-white font-medium">
                      <SelectValue placeholder="Selecione o funcionário..." />
                    </SelectTrigger>
                    <SelectContent>
                      {funcionarios.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome} ({f.cargo || 'Geral'})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">Início do Período</Label>
                  <Input
                    type="date"
                    value={periodoInicio}
                    onChange={(e) => setPeriodoInicio(e.target.value)}
                    className="h-10 bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-bold text-gray-700">Fim do Período</Label>
                  <Input
                    type="date"
                    value={periodoFim}
                    onChange={(e) => setPeriodoFim(e.target.value)}
                    className="h-10 bg-white"
                  />
                </div>

                <div className="flex gap-2">
                  <Button
                    onClick={() => handleOpenPontoModal()}
                    variant="outline"
                    className="h-10 flex-1 border-border font-semibold gap-1.5 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5 text-[#DF5830]" />
                    Lançar / Corrigir Ponto
                  </Button>

                  <Button
                    onClick={() => setIsFecharFolhaModalOpen(true)}
                    className="h-10 bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 text-xs shadow-xs"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Fechar Folha
                  </Button>
                </div>
              </div>

              {/* Parâmetros do Colaborador Selecionado */}
              {funcionarioAtual && (
                <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
                  <div className="flex items-center gap-4">
                    <span>
                      <strong className="text-gray-900">Base Salarial:</strong>{' '}
                      {formatCurrency(funcionarioAtual.salario_base ?? 1760)}
                    </span>
                    <span>
                      <strong className="text-gray-900">Dias/Mês:</strong>{' '}
                      {funcionarioAtual.dias_mes ?? 22}
                    </span>
                    <span>
                      <strong className="text-gray-900">Horas/Dia:</strong>{' '}
                      {funcionarioAtual.horas_dia ?? 8}
                    </span>
                    <span>
                      <strong className="text-gray-900">Valor Hora:</strong>{' '}
                      <span className="font-bold text-[#DF5830]">
                        {formatCurrency(funcionarioAtual.valor_hora)}
                      </span>
                    </span>
                    <span>
                      <strong className="text-gray-900">Almoço conta:</strong>{' '}
                      {funcionarioAtual.hora_almoco_conta ? 'Sim' : 'Não'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-gray-900 font-semibold">Ciclo:</span>
                    <Badge variant="outline" className="capitalize">
                      {funcionarioAtual.ciclo_pagamento}
                    </Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ESPELHO PRINCIPAL IDÊNTICO À PLANILHA OFICIAL */}
          {espelhoFolha ? (
            <div className="space-y-6">
              {/* CARTÃO DA PLANILHA */}
              <div className="rounded-2xl border border-gray-300 bg-white shadow-sm overflow-hidden font-sans">
                {/* CABEÇALHO DO ESPELHO COM O NOME DO FUNCIONÁRIO */}
                <div className="bg-gray-100/80 px-6 py-3 border-b border-gray-300 flex items-center justify-between">
                  <div className="text-center w-full">
                    <h2 className="text-xl font-bold tracking-tight text-gray-900">
                      {funcionarioAtual?.nome}
                    </h2>
                    <span className="text-xs text-muted-foreground">
                      Período de {formatarDataExtensoPlanilha(periodoInicio)} até{' '}
                      {formatarDataExtensoPlanilha(periodoFim)}
                    </span>
                  </div>
                </div>

                {/* TABELA DE DIAS TRABALHADOS (EXATAMENTE AS COLUNAS DA PLANILHA) */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs text-left border-collapse">
                    <thead>
                      <tr className="border-b border-gray-300 bg-gray-50 text-gray-700 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-4">Dia</th>
                        <th className="py-2.5 px-3 text-center">H.Entrada</th>
                        <th className="py-2.5 px-3 text-center">H.Saída</th>
                        <th className="py-2.5 px-3 text-center">H.Total</th>
                        <th className="py-2.5 px-3 text-right">Conv.H.em.$</th>
                        <th className="py-2.5 px-4 text-right">$.Total.Dia</th>
                        <th className="py-2.5 px-3 text-center">Origem / Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {espelhoFolha.pontos.length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-muted-foreground">
                            Nenhum ponto registrado no período selecionado.
                          </td>
                        </tr>
                      ) : (
                        espelhoFolha.pontos.map((p) => (
                          <tr key={p.id || p.data} className="hover:bg-gray-50/60 transition">
                            <td className="py-2.5 px-4 font-medium text-gray-900">
                              {p.diaSemanaFormatado}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono">{p.entrada}</td>
                            <td className="py-2.5 px-3 text-center font-mono">
                              {p.saida || (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-amber-700 border-amber-300"
                                >
                                  Em aberto
                                </Badge>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-center font-mono font-semibold">
                              {p.horasFormatadas}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono">
                              {p.horasDecimais.toFixed(2).replace('.', ',')}
                            </td>
                            <td className="py-2.5 px-4 text-right font-mono font-bold text-gray-900">
                              {formatCurrency(p.valorTotalDia)}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1">
                                {p.origem === 'fora_do_local' && (
                                  <Badge
                                    variant="outline"
                                    className="text-[9px] text-amber-800 bg-amber-50 border-amber-300"
                                  >
                                    Fora
                                  </Badge>
                                )}
                                {p.editadoPor && (
                                  <Badge
                                    variant="secondary"
                                    className="text-[9px]"
                                    title={`Editado por ${p.editadoPor}`}
                                  >
                                    Editado
                                  </Badge>
                                )}
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    const original = pontos.find((item) => item.id === p.id)
                                    if (original) handleOpenPontoModal(original)
                                  }}
                                >
                                  <Edit2 className="h-3 w-3" />
                                </Button>
                                {p.id && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-6 w-6 text-red-500 hover:text-red-700"
                                    onClick={() => handleExcluirPonto(p.id!)}
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                    {/* LINHA DE TOTAL MONETÁRIO TRABALHADO */}
                    <tfoot>
                      <tr className="bg-gray-100/90 font-bold text-gray-900 border-t-2 border-gray-300">
                        <td colSpan={5} className="py-2.5 px-4 text-right uppercase tracking-wider">
                          Total Monetário Trabalhado
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono text-sm text-[#DF5830]">
                          {formatCurrency(espelhoFolha.totalMonetarioTrabalhado)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* BLOCO VERDE: DESCONTOS SEMANAIS (CONFORME PRINT DA PLANILHA) */}
                <div className="bg-[#107C41] text-white px-4 py-2 font-bold text-xs uppercase tracking-wider text-center">
                  Descontos Semanais
                </div>

                <div className="p-4 bg-white space-y-3 text-xs border-b border-gray-300">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2">
                    {/* Linhas de Dívidas com Percentual */}
                    {espelhoFolha.descontosDividas.map((d) => (
                      <div
                        key={d.dividaId}
                        className="flex items-center justify-between border-b border-dashed border-gray-200 py-1"
                      >
                        <span className="text-gray-700">
                          {d.descricao} = {d.percentual}% do pagamento:
                        </span>
                        <span className="font-mono font-bold text-gray-900">
                          {formatCurrency(d.valorAbatido)}
                        </span>
                      </div>
                    ))}

                    {/* Saldo Negativo da Semana Passada (Arrastado da folha anterior) */}
                    <div className="flex items-center justify-between border-b border-dashed border-gray-200 py-1">
                      <span className="text-gray-700">Saldo negativo da semana passada:</span>
                      <div className="flex items-center gap-1 font-mono font-bold text-gray-900">
                        <span>R$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={saldoNegativoAnteriorInput}
                          onChange={(e) => setSaldoNegativoAnteriorInput(e.target.value)}
                          className="w-24 text-right font-mono font-bold text-gray-900 border border-gray-300 rounded px-1.5 py-0.5"
                        />
                      </div>
                    </div>

                    {/* Descontos Avulsos (Vales, etc.) */}
                    {espelhoFolha.outrosDescontos.map((desc, idx) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between border-b border-dashed border-gray-200 py-1"
                      >
                        <span className="text-gray-700">{desc.descricao}:</span>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-bold text-gray-900">
                            {formatCurrency(desc.valor)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoverDescontoAvulso(idx)}
                            className="text-red-500 hover:text-red-700"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* FORMULÁRIO RÁPIDO PARA ADICIONAR VALE / OUTRA DESPESA */}
                  <form
                    onSubmit={handleAdicionarDescontoAvulso}
                    className="flex items-center gap-2 pt-2 border-t border-gray-100"
                  >
                    <span className="text-[11px] font-bold text-gray-500 uppercase">
                      + Despesa/Vale:
                    </span>
                    <Input
                      placeholder="Descrição (ex: Vale transporte, Adiantamento...)"
                      value={novoDescontoDesc}
                      onChange={(e) => setNovoDescontoDesc(e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                    <Input
                      placeholder="Valor (R$)"
                      value={novoDescontoValor}
                      onChange={(e) => setNovoDescontoValor(e.target.value)}
                      className="h-7 text-xs w-28 text-right font-mono"
                    />
                    <Button type="submit" size="sm" variant="outline" className="h-7 text-xs">
                      Adicionar
                    </Button>
                  </form>
                </div>

                {/* BLOCO ROXO / TOTALIZADOR: DÍVIDA SEMANAL E A RECEBER (EXATAMENTE COMO O PRINT) */}
                <div className="bg-gray-50 p-4 border-b border-gray-300 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    {/* Dívida Semanal */}
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-700 text-sm">Dívida Semanal:</span>
                      <div className="rounded bg-[#8E7CC3] text-white px-4 py-1.5 font-mono font-bold text-base shadow-xs">
                        {formatCurrency(espelhoFolha.totalDescontos)}
                      </div>
                    </div>

                    {/* A Receber (Destaque Vermelho quando negativo) */}
                    <div className="flex items-center gap-3">
                      <span className="font-bold text-gray-700 text-sm">A receber:</span>
                      <div
                        className={`rounded px-4 py-1.5 font-mono font-extrabold text-base shadow-xs ${
                          espelhoFolha.estaNegativo
                            ? 'bg-red-600 text-white'
                            : 'bg-emerald-600 text-white'
                        }`}
                      >
                        {espelhoFolha.estaNegativo
                          ? `-R$ ${Math.abs(espelhoFolha.aReceber).toFixed(2).replace('.', ',')}`
                          : formatCurrency(espelhoFolha.aReceber)}
                      </div>
                    </div>
                  </div>

                  {/* Dívida (-) Pag. Note / Saldo Atual da Dívida */}
                  {espelhoFolha.descontosDividas.map((d) => (
                    <div key={d.dividaId} className="flex items-center gap-3 pt-1 text-xs">
                      <span className="font-bold text-gray-700">Dívida(-)Pag. {d.descricao}:</span>
                      <span className="font-mono text-base font-black text-gray-900">
                        {formatCurrency(d.saldoAtual)}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        (reduzirá para {formatCurrency(d.novoSaldoProjetado)} ao quitar a folha)
                      </span>
                    </div>
                  ))}
                </div>

                {/* RODAPÉ: PIX DO FUNCIONÁRIO E STATUS DE PAGAMENTO */}
                <div className="bg-white px-4 py-3 flex flex-wrap items-center justify-between gap-4 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">Chave Pix:</span>
                    <span className="font-mono bg-gray-100 px-2 py-0.5 rounded text-gray-900 font-semibold select-all">
                      {funcionarioAtual?.pix || '(Pix não cadastrado)'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="font-bold text-gray-700">Status Pagamento:</span>
                    <Badge
                      variant="outline"
                      className="border-amber-300 text-amber-800 bg-amber-50"
                    >
                      Sem Pgnto (Aguardando Quitação)
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-8 text-center bg-white rounded-xl border border-border text-muted-foreground">
              Selecione um funcionário para visualizar o espelho da folha.
            </div>
          )}
        </TabsContent>

        {/* TAB 2: GESTÃO DE COLABORADORES */}
        <TabsContent value="funcionarios" className="space-y-4 focus-visible:outline-none">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {funcionarios.map((func) => (
              <Card key={func.id} className="border border-border/80 bg-white shadow-xs">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base font-bold text-gray-900">
                        {func.nome}
                      </CardTitle>
                      <CardDescription>{func.cargo || 'Colaborador Geral'}</CardDescription>
                    </div>
                    <Badge variant={func.ativo ? 'default' : 'secondary'}>
                      {func.ativo ? 'Ativo' : 'Inativo'}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5 text-xs">
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Valor da Hora:</span>
                    <span className="font-mono font-bold text-[#DF5830]">
                      {formatCurrency(func.valor_hora)}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Base Salarial:</span>
                    <span className="font-mono">{formatCurrency(func.salario_base ?? 1760)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Ciclo:</span>
                    <span className="capitalize font-semibold">{func.ciclo_pagamento}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-border/40">
                    <span className="text-muted-foreground">Chave Pix:</span>
                    <span className="font-mono">{func.pix || 'Não informado'}</span>
                  </div>

                  <div className="flex gap-2 pt-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleOpenFuncionarioModal(func)}
                      className="flex-1 text-xs"
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setSelectedFuncionarioId(func.id)
                        setActiveTab('folha')
                      }}
                      className="flex-1 text-xs text-[#DF5830] border-[#DF5830]/30 hover:bg-[#DF5830]/10"
                    >
                      Ver Folha
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* TAB 3: DÍVIDAS E ADIANTAMENTOS COM PERCENTUAIS */}
        <TabsContent value="dividas" className="space-y-4 focus-visible:outline-none">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              Cada dívida possui um percentual de abatimento automático sobre o ganho da folha (ex:
              Notebook = 60%; vales avulsos = 100%).
            </p>
            <Button
              onClick={() => handleOpenDividaModal()}
              className="bg-[#DF5830] hover:bg-[#c94b26] text-white text-xs font-semibold gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Nova Dívida / Acordo
            </Button>
          </div>

          <div className="rounded-xl border border-border/80 bg-white overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-gray-50 text-gray-700 font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Funcionário</th>
                  <th className="py-2.5 px-4">Descrição da Dívida</th>
                  <th className="py-2.5 px-3 text-right">Valor Inicial</th>
                  <th className="py-2.5 px-3 text-right">Saldo Atual</th>
                  <th className="py-2.5 px-3 text-center">% Abatimento</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {dividas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      Nenhuma dívida cadastrada para este colaborador.
                    </td>
                  </tr>
                ) : (
                  dividas.map((d) => {
                    const func = funcionarios.find((f) => f.id === d.funcionario)
                    return (
                      <tr key={d.id} className="hover:bg-gray-50/50">
                        <td className="py-2.5 px-4 font-semibold text-gray-900">
                          {func?.nome || 'Geral'}
                        </td>
                        <td className="py-2.5 px-4 text-gray-800">{d.descricao}</td>
                        <td className="py-2.5 px-3 text-right font-mono">
                          {formatCurrency(d.valor_total)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-red-600">
                          {formatCurrency(d.saldo_atual)}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">
                          {d.percentual_abatimento}%
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <Badge variant={d.ativa && d.saldo_atual > 0 ? 'default' : 'secondary'}>
                            {d.ativa && d.saldo_atual > 0 ? 'Em Aberto' : 'Quitada'}
                          </Badge>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleOpenDividaModal(d)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 text-red-500 hover:text-red-700"
                              onClick={() => handleExcluirDivida(d.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* TAB 4: ESTAÇÕES DE PONTO (QR CODE FIXO NA PAREDE) */}
        <TabsContent value="estacoes" className="space-y-4 focus-visible:outline-none">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {estacoes.map((est) => {
              const urlPonto = getPontoUrl(est.token)
              const qrCodeImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(
                urlPonto,
              )}`

              return (
                <Card key={est.id} className="border border-border/80 bg-white shadow-xs">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <CardTitle className="text-base font-bold text-gray-900">
                          {est.nome}
                        </CardTitle>
                        <CardDescription>
                          {est.local_descricao || 'Estação física na empresa'}
                        </CardDescription>
                      </div>
                      <Badge variant={est.ativa ? 'default' : 'secondary'}>
                        {est.ativa ? 'Ativa' : 'Inativa'}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-center p-4 bg-gray-50 rounded-xl border border-gray-200">
                      <img
                        src={qrCodeImgUrl}
                        alt={`QR Code Estação ${est.nome}`}
                        className="h-44 w-44 rounded-lg bg-white p-2 shadow-xs"
                      />
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <Label className="text-muted-foreground font-semibold">
                        Link de Acesso Direto da Estação:
                      </Label>
                      <div className="flex gap-1.5">
                        <Input
                          readOnly
                          value={urlPonto}
                          className="h-8 font-mono text-[11px] bg-muted/40"
                        />
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8"
                          onClick={() => {
                            navigator.clipboard.writeText(urlPonto)
                            toast({ title: 'Link copiado!' })
                          }}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        onClick={() => setSelectedEstacaoQR(est)}
                        className="w-full bg-gray-900 hover:bg-black text-white text-xs font-bold gap-1.5"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        Imprimir Cartaz QR para Parede
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* TAB 5: HISTÓRICO DE FOLHAS FECHADAS */}
        <TabsContent value="folhas" className="space-y-4 focus-visible:outline-none">
          <div className="rounded-xl border border-border/80 bg-white overflow-hidden shadow-xs">
            <table className="w-full text-xs text-left border-collapse">
              <thead>
                <tr className="border-b border-border bg-gray-50 text-gray-700 font-bold uppercase text-[11px]">
                  <th className="py-2.5 px-4">Período</th>
                  <th className="py-2.5 px-4">Funcionário</th>
                  <th className="py-2.5 px-3 text-right">Ganho Total</th>
                  <th className="py-2.5 px-3 text-right">Dívida Semanal</th>
                  <th className="py-2.5 px-3 text-right">A Receber</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                  <th className="py-2.5 px-3 text-center">Data Quitação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {folhas.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-muted-foreground">
                      Nenhuma folha fechada encontrada.
                    </td>
                  </tr>
                ) : (
                  folhas.map((f) => (
                    <tr key={f.id} className="hover:bg-gray-50/50">
                      <td className="py-2.5 px-4 font-mono font-semibold">
                        {f.periodo_inicio} até {f.periodo_fim}
                      </td>
                      <td className="py-2.5 px-4 font-semibold text-gray-900">
                        {f.expand?.funcionario?.nome || funcionarioAtual?.nome}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-gray-900">
                        {formatCurrency(f.ganho_total)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono">
                        {formatCurrency(f.divida_semanal)}
                      </td>
                      <td
                        className={`py-2.5 px-3 text-right font-mono font-bold ${
                          f.a_receber < 0 ? 'text-red-600' : 'text-emerald-700'
                        }`}
                      >
                        {formatCurrency(f.a_receber)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge variant={f.quitada ? 'default' : 'outline'}>
                          {f.quitada ? 'Quitada' : 'Aberta'}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-center text-muted-foreground">
                        {f.data_quitacao || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: CADASTRAR / EDITAR FUNCIONÁRIO */}
      <Dialog open={isFuncionarioModalOpen} onOpenChange={setIsFuncionarioModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingFuncionario ? 'Editar Funcionário' : 'Novo Funcionário'}
            </DialogTitle>
            <DialogDescription>
              Preencha os dados e parâmetros da base de cálculo deste colaborador.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarFuncionario} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <Label className="font-semibold">Nome Completo</Label>
              <Input
                required
                value={funcForm.nome}
                onChange={(e) => setFuncForm({ ...funcForm, nome: e.target.value })}
                placeholder="Ex: Lara Silva"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-semibold">Cargo</Label>
                <Input
                  value={funcForm.cargo}
                  onChange={(e) => setFuncForm({ ...funcForm, cargo: e.target.value })}
                  placeholder="Ex: Costureira"
                />
              </div>

              <div className="space-y-1">
                <Label className="font-semibold">Ciclo de Pagamento</Label>
                <Select
                  value={funcForm.ciclo_pagamento}
                  onValueChange={(v: any) => setFuncForm({ ...funcForm, ciclo_pagamento: v })}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="semanal">Semanal</SelectItem>
                    <SelectItem value="quinzenal">Quinzenal</SelectItem>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="personalizado">Personalizado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Aritmética Base Salarial */}
            <div className="rounded-xl border border-border/80 bg-gray-50/70 p-3 space-y-2.5">
              <span className="font-bold text-gray-900 block text-[11px] uppercase tracking-wider">
                Base de Cálculo (Fórmula da Planilha)
              </span>
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Salário Base (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={funcForm.salario_base}
                    onChange={(e) =>
                      handleAtualizarBaseSalarial(
                        parseFloat(e.target.value) || 0,
                        funcForm.dias_mes,
                        funcForm.horas_dia,
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Dias Mês</Label>
                  <Input
                    type="number"
                    value={funcForm.dias_mes}
                    onChange={(e) =>
                      handleAtualizarBaseSalarial(
                        funcForm.salario_base,
                        parseInt(e.target.value) || 1,
                        funcForm.horas_dia,
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] text-muted-foreground">Horas/Dia</Label>
                  <Input
                    type="number"
                    value={funcForm.horas_dia}
                    onChange={(e) =>
                      handleAtualizarBaseSalarial(
                        funcForm.salario_base,
                        funcForm.dias_mes,
                        parseInt(e.target.value) || 1,
                      )
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <Label className="font-bold text-gray-800">Valor da Hora Final (R$):</Label>
                <div className="flex items-center gap-1">
                  <span className="font-mono font-bold text-sm text-[#DF5830]">
                    {formatCurrency(funcForm.valor_hora)}
                  </span>
                  <Input
                    type="number"
                    step="0.01"
                    className="w-20 h-7 text-right text-xs"
                    value={funcForm.valor_hora}
                    onChange={(e) =>
                      setFuncForm({
                        ...funcForm,
                        valor_hora: parseFloat(e.target.value) || 0,
                      })
                    }
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-border/50">
                <Label className="text-[11px] text-gray-700">
                  Hora de almoço conta como trabalhada
                </Label>
                <Switch
                  checked={funcForm.hora_almoco_conta}
                  onCheckedChange={(c) => setFuncForm({ ...funcForm, hora_almoco_conta: c })}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-semibold">Chave Pix</Label>
                <Input
                  value={funcForm.pix}
                  onChange={(e) => setFuncForm({ ...funcForm, pix: e.target.value })}
                  placeholder="CPF, celular ou e-mail"
                />
              </div>

              <div className="space-y-1">
                <Label className="font-semibold">PIN Pessoal (opcional)</Label>
                <Input
                  type="password"
                  value={funcForm.pin}
                  onChange={(e) => setFuncForm({ ...funcForm, pin: e.target.value })}
                  placeholder="Ex: 1234"
                />
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsFuncionarioModalOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#DF5830] hover:bg-[#c94b26] text-white">
                Salvar Funcionário
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: CADASTRAR / EDITAR DÍVIDA */}
      <Dialog open={isDividaModalOpen} onOpenChange={setIsDividaModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingDivida ? 'Editar Dívida' : 'Nova Dívida / Adiantamento'}
            </DialogTitle>
            <DialogDescription>
              Defina a descrição, saldo e o percentual de desconto automático por folha.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarDivida} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <Label className="font-semibold">Colaborador</Label>
              <Select
                value={dividaForm.funcionario}
                onValueChange={(v) => setDividaForm({ ...dividaForm, funcionario: v })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue placeholder="Selecione..." />
                </SelectTrigger>
                <SelectContent>
                  {funcionarios.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="font-semibold">Descrição do Bem / Adiantamento</Label>
              <Input
                required
                value={dividaForm.descricao}
                onChange={(e) => setDividaForm({ ...dividaForm, descricao: e.target.value })}
                placeholder="Ex: Notebook Dell, Celular corporativo, Empréstimo..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-semibold">Valor Total da Dívida (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={dividaForm.valor_total}
                  onChange={(e) =>
                    setDividaForm({
                      ...dividaForm,
                      valor_total: parseFloat(e.target.value) || 0,
                      saldo_atual: editingDivida
                        ? dividaForm.saldo_atual
                        : parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>

              <div className="space-y-1">
                <Label className="font-semibold">Saldo Devedor Atual (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  required
                  value={dividaForm.saldo_atual}
                  onChange={(e) =>
                    setDividaForm({
                      ...dividaForm,
                      saldo_atual: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="space-y-1 rounded-lg border border-border p-2.5 bg-gray-50/60">
              <div className="flex justify-between items-center">
                <Label className="font-bold text-gray-900">
                  Percentual de Abatimento da Folha:
                </Label>
                <span className="font-mono font-bold text-sm text-[#DF5830]">
                  {dividaForm.percentual_abatimento}%
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Exemplo real: Notebook = 60% do ganho total da folha; Vale avulso = 100%.
              </p>
              <Input
                type="number"
                min={1}
                max={100}
                required
                value={dividaForm.percentual_abatimento}
                onChange={(e) =>
                  setDividaForm({
                    ...dividaForm,
                    percentual_abatimento: parseFloat(e.target.value) || 60,
                  })
                }
                className="mt-1"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsDividaModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#DF5830] hover:bg-[#c94b26] text-white">
                Salvar Dívida
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: LANÇAMENTO / CORREÇÃO DE PONTO ADMIN */}
      <Dialog open={isPontoModalOpen} onOpenChange={setIsPontoModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold">
              {editingPonto ? 'Corrigir Ponto do Colaborador' : 'Lançar Ponto Manual'}
            </DialogTitle>
            <DialogDescription>
              Ajustes manuais ficam com registro de auditoria indicando o administrador responsável.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSalvarPonto} className="space-y-3.5 text-xs">
            <div className="space-y-1">
              <Label className="font-semibold">Colaborador</Label>
              <Select
                value={pontoForm.funcionario || selectedFuncionarioId}
                onValueChange={(v) => setPontoForm({ ...pontoForm, funcionario: v })}
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {funcionarios.map((f) => (
                    <SelectItem key={f.id} value={f.id}>
                      {f.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="font-semibold">Data</Label>
              <Input
                type="date"
                required
                value={pontoForm.data}
                onChange={(e) => setPontoForm({ ...pontoForm, data: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="font-semibold">Horário de Entrada (HH:mm)</Label>
                <Input
                  type="time"
                  required
                  value={pontoForm.entrada}
                  onChange={(e) => setPontoForm({ ...pontoForm, entrada: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <Label className="font-semibold">Horário de Saída (HH:mm)</Label>
                <Input
                  type="time"
                  value={pontoForm.saida}
                  onChange={(e) => setPontoForm({ ...pontoForm, saida: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-1">
              <Label className="font-semibold">Motivo da Correção / Observação</Label>
              <Input
                value={pontoForm.observacao}
                onChange={(e) => setPontoForm({ ...pontoForm, observacao: e.target.value })}
                placeholder="Ex: Esqueceu de bater saída; Falta justificada..."
              />
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setIsPontoModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-[#DF5830] hover:bg-[#c94b26] text-white">
                Salvar Registro
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: QR CODE DA ESTAÇÃO PARA IMPRESSÃO EM FOLHA A4 */}
      {selectedEstacaoQR && (
        <Dialog open={Boolean(selectedEstacaoQR)} onOpenChange={() => setSelectedEstacaoQR(null)}>
          <DialogContent className="sm:max-w-md text-center">
            <DialogHeader>
              <DialogTitle className="text-xl font-bold flex items-center justify-center gap-2">
                <ShieldCheck className="h-6 w-6 text-[#DF5830]" />
                Cartaz da Estação de Ponto
              </DialogTitle>
              <DialogDescription>
                Imprima este QR Code e cole na entrada da empresa / parede da produção.
              </DialogDescription>
            </DialogHeader>

            <div className="p-6 bg-white rounded-2xl border-2 border-dashed border-gray-300 space-y-4 my-2">
              <div className="text-center">
                <h3 className="text-xl font-extrabold text-gray-900 tracking-tight">
                  GKza Indústria
                </h3>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-widest mt-0.5">
                  Estação: {selectedEstacaoQR.nome}
                </p>
              </div>

              <div className="flex justify-center">
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=300x300&data=${encodeURIComponent(
                    getPontoUrl(selectedEstacaoQR.token),
                  )}`}
                  alt="QR Code Ponto"
                  className="h-56 w-56 rounded-xl border border-gray-200 p-2 shadow-sm"
                />
              </div>

              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-gray-900">Aponte a câmera do seu celular</p>
                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                  Registre Entrada, Intervalo e Saída. Registros fora da empresa são marcados
                  automaticamente.
                </p>
              </div>
            </div>

            <DialogFooter className="sm:justify-between">
              <Button
                variant="outline"
                onClick={() => {
                  navigator.clipboard.writeText(getPontoUrl(selectedEstacaoQR.token))
                  toast({ title: 'Link copiado!' })
                }}
                className="gap-1.5 text-xs"
              >
                <Copy className="h-3.5 w-3.5" />
                Copiar Link
              </Button>

              <Button
                onClick={() => window.print()}
                className="bg-[#DF5830] hover:bg-[#c94b26] text-white gap-1.5 text-xs font-bold"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimir Cartaz
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* MODAL 5: CONFIRMAR FECHAMENTO / QUITAÇÃO DA FOLHA */}
      {espelhoFolha && (
        <Dialog open={isFecharFolhaModalOpen} onOpenChange={setIsFecharFolhaModalOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg font-bold text-gray-900">
                Fechar & Quitar Folha de Pagamento
              </DialogTitle>
              <DialogDescription>
                Confirme os valores da folha calculada. O saldo das dívidas será atualizado.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-border/80 bg-gray-50/80 p-3.5 space-y-2">
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Colaborador:</span>
                  <span className="font-bold text-gray-900">{funcionarioAtual?.nome}</span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Período:</span>
                  <span className="font-mono">
                    {espelhoFolha.periodoInicio} a {espelhoFolha.periodoFim}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">Ganho Total Trabalhado:</span>
                  <span className="font-mono font-bold text-[#DF5830]">
                    {formatCurrency(espelhoFolha.totalMonetarioTrabalhado)}
                  </span>
                </div>
                <div className="flex justify-between font-medium">
                  <span className="text-muted-foreground">
                    Total de Descontos (Dívida Semanal):
                  </span>
                  <span className="font-mono font-bold text-gray-900">
                    {formatCurrency(espelhoFolha.totalDescontos)}
                  </span>
                </div>
                <div className="flex justify-between font-medium pt-1 border-t border-border/60">
                  <span className="font-bold text-gray-900">Valor Final a Receber:</span>
                  <span
                    className={`font-mono font-black text-sm ${
                      espelhoFolha.estaNegativo ? 'text-red-600' : 'text-emerald-700'
                    }`}
                  >
                    {espelhoFolha.estaNegativo
                      ? `-R$ ${Math.abs(espelhoFolha.aReceber).toFixed(2).replace('.', ',')}`
                      : formatCurrency(espelhoFolha.aReceber)}
                  </span>
                </div>
              </div>

              {/* Opção de Gerar Despesa no Módulo Financeiro */}
              {espelhoFolha.aReceber > 0 && (
                <div className="rounded-xl border border-border/80 p-3 bg-white space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-bold text-gray-900 block">Lançar no Financeiro</span>
                      <span className="text-[11px] text-muted-foreground">
                        Gera uma despesa paga em Lançamentos
                      </span>
                    </div>
                    <Switch
                      checked={gerarLancamentoFinanceiro}
                      onCheckedChange={setGerarLancamentoFinanceiro}
                    />
                  </div>

                  {gerarLancamentoFinanceiro && (
                    <div className="space-y-1 pt-1">
                      <Label className="text-[11px] font-semibold">Conta de Saída:</Label>
                      <Select value={selectedContaId} onValueChange={setSelectedContaId}>
                        <SelectTrigger className="h-8 bg-white text-xs">
                          <SelectValue placeholder="Selecione a conta bancária..." />
                        </SelectTrigger>
                        <SelectContent>
                          {contasFinanceiro.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              )}

              {espelhoFolha.estaNegativo && (
                <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-red-900">
                  <p className="font-bold">Atenção: Saldo devedor!</p>
                  <p className="text-[11px] text-red-800 mt-0.5">
                    Como o ganho foi menor que os descontos, o valor devedor de{' '}
                    <strong>
                      R$ {Math.abs(espelhoFolha.aReceber).toFixed(2).replace('.', ',')}
                    </strong>{' '}
                    será automaticamente sugerido como o saldo negativo anterior na próxima folha
                    deste funcionário.
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="pt-3">
              <Button
                variant="outline"
                onClick={() => setIsFecharFolhaModalOpen(false)}
                className="text-xs"
              >
                Voltar
              </Button>
              <Button
                onClick={handleConfirmarFechamentoFolha}
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-xs"
              >
                Confirmar Fechamento
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
