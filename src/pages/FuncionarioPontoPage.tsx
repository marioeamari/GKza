import { useState, useEffect, useMemo, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  Play,
  Square,
  Pause,
  RotateCcw,
  UserCheck,
  Building2,
  Calendar,
  DollarSign,
  TrendingDown,
  ShieldCheck,
  MapPin,
  RefreshCw,
  QrCode,
} from 'lucide-react'
import { LocalQRCode } from '@/components/LocalQRCode'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import {
  funcionariosService,
  type FuncionarioRecord,
  type FuncionarioEstacaoRecord,
  type FuncionarioPontoRecord,
  type FuncionarioDividaRecord,
} from '@/services/funcionarios'
import {
  formatarDataExtensoPlanilha,
  calcularLinhaPonto,
  formatarMinutosEmHHMM,
  converterMinutosEmHorasDecimais,
} from '@/lib/funcionarios'
import { formatCurrency, getLocalDateStr } from '@/lib/format'
import { normalizarDataPonto } from '@/lib/funcionarios'

const SESSION_STORAGE_KEY = 'gkza_funcionario_session_token'

export default function FuncionarioPontoPage() {
  const { token } = useParams<{ token?: string }>()
  const { toast } = useToast()

  const [estacao, setEstacao] = useState<FuncionarioEstacaoRecord | null>(null)
  const [estacaoValida, setEstacaoValida] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  // Funcionários para identificação
  const [funcionarios, setFuncionarios] = useState<FuncionarioRecord[]>([])
  const [funcionarioAtual, setFuncionarioAtual] = useState<FuncionarioRecord | null>(null)
  const [selectedFuncionarioId, setSelectedFuncionarioId] = useState<string>('')
  const [pinInput, setPinInput] = useState<string>('')

  // Estado do ponto do dia de hoje
  const [pontoHoje, setPontoHoje] = useState<FuncionarioPontoRecord | null>(null)
  const [historicoPontos, setHistoricoPontos] = useState<FuncionarioPontoRecord[]>([])
  const [dividas, setDividas] = useState<FuncionarioDividaRecord[]>([])
  const [horaAtual, setHoraAtual] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [mostrarQREstacao, setMostrarQREstacao] = useState(false)

  // Relógio em tempo real
  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      setHoraAtual(
        now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      )
    }
    updateTime()
    const timer = setInterval(updateTime, 1000)
    return () => clearInterval(timer)
  }, [])

  // 1. Carregar ponto de hoje e resumo do colaborador ativo
  const carregarDadosDoColaborador = useCallback(async (func: FuncionarioRecord) => {
    try {
      const hojeStr = getLocalDateStr() // Data atual no fuso America/Sao_Paulo
      // Busca ponto de hoje: se houver aberto traz ele; se já foi finalizado traz o último do dia
      const pontoAberto = await funcionariosService.buscarPontoAbertoHoje(func.id, hojeStr)
      if (pontoAberto) {
        setPontoHoje(pontoAberto)
      } else {
        const ultimoDoDia = await funcionariosService.buscarUltimoPontoDoDia(func.id, hojeStr)
        setPontoHoje(ultimoDoDia)
      }

      // Carregar histórico recente dos últimos 30 dias
      const dataInicio = new Date()
      dataInicio.setDate(dataInicio.getDate() - 30)
      const dataInicioStr = getLocalDateStr(dataInicio)

      const pontos = await funcionariosService.listarPontos({
        funcionarioId: func.id,
        dataInicio: dataInicioStr,
      })
      setHistoricoPontos(pontos)

      // Carregar dívidas ativas do funcionário
      const divs = await funcionariosService.listarDividas(func.id)
      setDividas(divs.filter((d) => d.ativa))
    } catch (err) {
      console.error('Erro ao carregar dados do colaborador:', err)
    }
  }, [])

  // 2. Carregar validação da estação pelo token da URL
  const validarEstacaoAtual = useCallback(async () => {
    try {
      if (token) {
        const est = await funcionariosService.buscarEstacaoPorToken(token)
        if (est) {
          setEstacao(est)
          setEstacaoValida(true)
        } else {
          setEstacao(null)
          setEstacaoValida(false)
        }
      } else {
        setEstacao(null)
        setEstacaoValida(false)
      }
    } catch (err) {
      console.error('Erro ao validar ponto:', err)
      setEstacao(null)
      setEstacaoValida(false)
    }
  }, [token])

  useEffect(() => {
    async function inicializarPonto() {
      setLoading(true)
      try {
        await validarEstacaoAtual()

        // Buscar lista de funcionários para seleção
        const funcs = await funcionariosService.listarFuncionarios(true)
        setFuncionarios(funcs)

        // Verificar se já existe vínculo salvo localmente neste celular
        const savedToken = localStorage.getItem(SESSION_STORAGE_KEY)
        if (savedToken) {
          const funcVinculado =
            await funcionariosService.buscarFuncionarioPorTokenSessao(savedToken)
          if (funcVinculado && funcVinculado.ativo) {
            setFuncionarioAtual(funcVinculado)
            setSelectedFuncionarioId(funcVinculado.id)
          }
        }
      } catch (err) {
        console.error('Erro ao inicializar página do ponto:', err)
      } finally {
        setLoading(false)
      }
    }

    inicializarPonto()
  }, [validarEstacaoAtual])

  // Agendador de virada de dia (revalidação e atualização de estação à meia-noite America/Sao_Paulo sem recarregar a página)
  useEffect(() => {
    let timerId: NodeJS.Timeout | null = null

    const agendarProximaMeiaNoite = () => {
      const agora = new Date()
      let h = 0
      let m = 0
      let s = 0

      try {
        const parts = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'America/Sao_Paulo',
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: false,
        }).formatToParts(agora)
        h = parseInt(parts.find((p) => p.type === 'hour')?.value || '0', 10)
        m = parseInt(parts.find((p) => p.type === 'minute')?.value || '0', 10)
        s = parseInt(parts.find((p) => p.type === 'second')?.value || '0', 10)
      } catch {
        h = agora.getHours()
        m = agora.getMinutes()
        s = agora.getSeconds()
      }

      const segundosPassadosHoje = h * 3600 + m * 60 + s
      const segundosAteMeiaNoite = 86400 - segundosPassadosHoje + 2 // +2s de margem de virada
      const msAteMeiaNoite = Math.max(1000, segundosAteMeiaNoite * 1000)

      timerId = setTimeout(async () => {
        try {
          // Revalida a estação com a data do novo dia
          await validarEstacaoAtual()
          // Recarrega os dados do colaborador para o novo dia (limpando o ponto de ontem)
          if (funcionarioAtual) {
            await carregarDadosDoColaborador(funcionarioAtual)
          }
        } catch (err) {
          console.warn('Erro ao atualizar estação/ponto na virada de dia:', err)
        }
        agendarProximaMeiaNoite()
      }, msAteMeiaNoite)
    }

    agendarProximaMeiaNoite()

    return () => {
      if (timerId) clearTimeout(timerId)
    }
  }, [validarEstacaoAtual, funcionarioAtual, carregarDadosDoColaborador])

  useEffect(() => {
    if (funcionarioAtual) {
      carregarDadosDoColaborador(funcionarioAtual)
    }
  }, [funcionarioAtual, carregarDadosDoColaborador])

  // Vinculação de celular ao funcionário
  const handleVincularFuncionario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedFuncionarioId) {
      toast({
        title: 'Selecione seu nome',
        description: 'Escolha seu perfil na lista para continuar.',
        variant: 'destructive',
      })
      return
    }

    const func = funcionarios.find((f) => f.id === selectedFuncionarioId)
    if (!func) return

    // Validar PIN se houver
    if (func.pin && func.pin.trim() !== '') {
      if (pinInput !== func.pin) {
        toast({
          title: 'PIN incorreto',
          description: 'O PIN digitado não confere. Peça ajuda ao seu gestor se esqueceu.',
          variant: 'destructive',
        })
        return
      }
    }

    // Gerar token de sessão e vincular
    const novoTokenSessao = `func_sess_${func.id}_${Math.random().toString(36).substring(2, 12)}`
    try {
      await funcionariosService.atualizarFuncionario(func.id, {
        token_sessao: novoTokenSessao,
      })
      localStorage.setItem(SESSION_STORAGE_KEY, novoTokenSessao)
      setFuncionarioAtual({ ...func, token_sessao: novoTokenSessao })
      toast({
        title: 'Celular vinculado com sucesso!',
        description: `Olá, ${func.nome}! Seu aparelho agora está configurado para bater ponto.`,
      })
    } catch (err) {
      console.error('Erro ao vincular celular:', err)
      toast({
        title: 'Erro ao vincular',
        description: 'Não foi possível salvar a identificação. Tente novamente.',
        variant: 'destructive',
      })
    }
  }

  const handleTrocarFuncionario = () => {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    setFuncionarioAtual(null)
    setPinInput('')
    setPontoHoje(null)
  }

  // Ações de Ponto
  const horaAtualHHMM = () => {
    try {
      // Garante hora no fuso America/Sao_Paulo (horário oficial de Brasília)
      const parts = new Intl.DateTimeFormat('pt-BR', {
        timeZone: 'America/Sao_Paulo',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).formatToParts(new Date())
      const hh = parts.find((p) => p.type === 'hour')?.value || '00'
      const mm = parts.find((p) => p.type === 'minute')?.value || '00'
      return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`
    } catch {
      const now = new Date()
      return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    }
  }

  const handleBaterEntrada = async () => {
    if (!funcionarioAtual || submitting) return

    // Proteção em memória contra duplo-clique se já existir entrada registrada hoje
    if (pontoHoje?.entrada) {
      toast({
        title: 'Entrada já registrada',
        description: `O colaborador já possui entrada registrada às ${pontoHoje.entrada}.`,
        variant: 'destructive',
      })
      return
    }

    setSubmitting(true)
    try {
      const hojeStr = getLocalDateStr() // fuso America/Sao_Paulo
      const horaStr = horaAtualHHMM()
      const origemRegistro = estacaoValida ? 'estacao_qr' : 'fora_do_local'

      const novoPonto = await funcionariosService.registrarEntrada({
        funcionarioId: funcionarioAtual.id,
        data: hojeStr,
        hora: horaStr,
        origem: origemRegistro,
        estacao: estacao?.nome || 'Acesso Direto',
        localAproximado: estacao?.local_descricao || 'Sem estação vinculada',
      })

      setPontoHoje(novoPonto)
      await carregarDadosDoColaborador(funcionarioAtual)

      toast({
        title: 'Entrada registrada com sucesso!',
        description: `Horário de entrada: ${horaStr}${
          origemRegistro === 'fora_do_local' ? ' (Registro marcado como Fora do Local)' : ''
        }`,
      })
    } catch (err: any) {
      console.error('Erro ao bater entrada:', err)
      toast({
        title: 'Registro não permitido',
        description: err.message || 'Erro ao registrar entrada. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleBaterSaida = async () => {
    if (!pontoHoje) return
    setSubmitting(true)
    try {
      const horaStr = horaAtualHHMM()
      const pontoAtualizado = await funcionariosService.registrarSaida(pontoHoje.id, horaStr)
      setPontoHoje(pontoAtualizado)
      if (funcionarioAtual) {
        await carregarDadosDoColaborador(funcionarioAtual)
      }

      toast({
        title: 'Saída registrada!',
        description: `Horário de saída: ${horaStr}. Bom descanso!`,
      })
    } catch (err: any) {
      console.error('Erro ao bater saída:', err)
      toast({
        title: 'Falha ao registrar',
        description: err.message || 'Erro ao registrar saída. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleIniciarPausa = async () => {
    if (!pontoHoje) return
    setSubmitting(true)
    try {
      const horaStr = horaAtualHHMM()
      const pausasAtuais = pontoHoje.pausas || []
      const pontoAtualizado = await funcionariosService.registrarPausa(
        pontoHoje.id,
        pausasAtuais,
        horaStr,
      )
      setPontoHoje(pontoAtualizado)

      toast({
        title: 'Pausa iniciada',
        description: `Início da pausa às ${horaStr}.`,
      })
    } catch (err: any) {
      console.error('Erro ao iniciar pausa:', err)
      toast({
        title: 'Falha ao pausar',
        description: err.message || 'Erro ao iniciar pausa.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetomarPausa = async () => {
    if (!pontoHoje) return
    setSubmitting(true)
    try {
      const horaStr = horaAtualHHMM()
      const pausasAtuais = pontoHoje.pausas || []
      const pontoAtualizado = await funcionariosService.retomarPausa(
        pontoHoje.id,
        pausasAtuais,
        horaStr,
      )
      setPontoHoje(pontoAtualizado)

      toast({
        title: 'Trabalho retomado',
        description: `Retorno às ${horaStr}. Bom trabalho!`,
      })
    } catch (err: any) {
      console.error('Erro ao retomar pausa:', err)
      toast({
        title: 'Falha ao retomar',
        description: err.message || 'Erro ao retomar pausa.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // Estado da pausa atual
  const estaEmPausa = useMemo(() => {
    if (!pontoHoje || !pontoHoje.pausas || pontoHoje.pausas.length === 0) return false
    const ultima = pontoHoje.pausas[pontoHoje.pausas.length - 1]
    return Boolean(ultima.inicio && !ultima.fim)
  }, [pontoHoje])

  const pontoFinalizado = useMemo(() => {
    return Boolean(pontoHoje?.entrada && pontoHoje?.saida)
  }, [pontoHoje])

  // Total acumulado trabalhado no período recente (ganhos do funcionário)
  const resumoFinanceiro = useMemo(() => {
    if (!funcionarioAtual) {
      return { totalHorasDecimais: 0, totalGanho: 0, totalMinutos: 0 }
    }
    let totalMinutos = 0
    let totalGanho = 0

    for (const p of historicoPontos) {
      if (p.entrada && p.saida) {
        const { minutosTrabalhados, valorTotalDia } = calcularLinhaPonto(
          p.data,
          p.entrada,
          p.saida,
          funcionarioAtual.valor_hora,
          p.pausas,
          funcionarioAtual.hora_almoco_conta ?? true,
        )
        totalMinutos += minutosTrabalhados
        totalGanho += valorTotalDia
      }
    }

    const totalHorasDecimais = converterMinutosEmHorasDecimais(totalMinutos)
    return {
      totalMinutos,
      totalHorasDecimais,
      totalGanho: Math.round(totalGanho * 100) / 100,
    }
  }, [historicoPontos, funcionarioAtual])

  const totalDividasAcumuladas = useMemo(() => {
    return dividas.reduce((acc, d) => acc + (d.saldo_atual || 0), 0)
  }, [dividas])

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#FBF9F7] p-4 text-center">
        <div className="space-y-4">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-[#DF5830] border-t-transparent" />
          <p className="text-sm font-semibold text-muted-foreground">
            Carregando estação de ponto...
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FBF9F7] text-foreground">
      {/* CABEÇALHO DO PONTO */}
      <header className="border-b border-border/60 bg-white shadow-xs">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#DF5830]/10 text-[#DF5830]">
              <Clock className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-gray-900">Ponto Eletrônico</h1>
              <p className="text-xs text-muted-foreground">GKza Indústria & Confecção</p>
            </div>
          </div>

          <div className="text-right flex items-center gap-2">
            {estacaoValida ? (
              <Badge
                variant="outline"
                className="gap-1 border-emerald-200 bg-emerald-50 text-emerald-700"
              >
                <ShieldCheck className="h-3.5 w-3.5" />
                No local ({estacao?.nome})
              </Badge>
            ) : (
              <Badge
                variant="outline"
                className="gap-1 border-amber-300 bg-amber-50 text-amber-800"
              >
                <MapPin className="h-3.5 w-3.5" />
                Fora da estação
              </Badge>
            )}
            {estacao && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                title="Exibir QR Code da estação"
                onClick={() => setMostrarQREstacao((prev) => !prev)}
              >
                <QrCode className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl p-4 space-y-4">
        {/* QR CODE DA ESTAÇÃO (SE SOLICITADO OU ATIVO NA TELA) */}
        {estacao && mostrarQREstacao && (
          <Card className="border border-border/80 bg-white shadow-sm text-center">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-bold flex items-center justify-center gap-1.5 text-gray-900">
                <QrCode className="h-4 w-4 text-[#DF5830]" />
                QR Code de Hoje — Estação {estacao.nome}
              </CardTitle>
              <CardDescription className="text-xs">
                Link rotativo diário auto-renovável à meia-noite
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pb-4 pt-1">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <LocalQRCode
                  value={`${window.location.origin}/funcionarios/ponto/${estacao.token_diario || estacao.token}`}
                  size={160}
                  alt={`QR Code Estação ${estacao.nome}`}
                  className="h-40 w-40 rounded-lg bg-white p-2 shadow-xs"
                />
              </div>
              <span className="text-[11px] text-muted-foreground mt-2">
                Outro colaborador pode escanear esta tela para registrar o ponto
              </span>
            </CardContent>
          </Card>
        )}

        {/* RELÓGIO PRINCIPAL */}
        <Card className="border border-border/80 bg-white shadow-sm text-center">
          <CardContent className="pt-6 pb-6">
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {new Date().toLocaleDateString('pt-BR', {
                weekday: 'long',
                day: '2-digit',
                month: 'long',
                year: 'numeric',
              })}
            </div>
            <div className="mt-1 text-5xl font-extrabold tracking-tight text-gray-900">
              {horaAtual || '--:--:--'}
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Horário Oficial de Brasília (GMT-3)
            </div>
          </CardContent>
        </Card>

        {/* IDENTIFICAÇÃO DO COLABORADOR */}
        {!funcionarioAtual ? (
          <Card className="border border-border/80 bg-white shadow-sm">
            <CardHeader>
              <CardTitle className="text-lg font-bold flex items-center gap-2 text-gray-900">
                <UserCheck className="h-5 w-5 text-[#DF5830]" />
                Identifique-se
              </CardTitle>
              <CardDescription>
                Selecione seu nome na lista para vincular seu celular permanentemente a este ponto.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleVincularFuncionario} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="funcionarioSelect" className="text-sm font-semibold">
                    Seu Nome Completo
                  </Label>
                  <Select value={selectedFuncionarioId} onValueChange={setSelectedFuncionarioId}>
                    <SelectTrigger id="funcionarioSelect" className="h-11 bg-white">
                      <SelectValue placeholder="Selecione seu nome na lista..." />
                    </SelectTrigger>
                    <SelectContent>
                      {funcionarios.map((f) => (
                        <SelectItem key={f.id} value={f.id}>
                          {f.nome} {f.cargo ? `— ${f.cargo}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pin" className="text-sm font-semibold">
                    PIN / Senha pessoal (opcional)
                  </Label>
                  <Input
                    id="pin"
                    type="password"
                    placeholder="Deixe em branco se não possui PIN"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="h-11"
                  />
                </div>

                <Button
                  type="submit"
                  className="w-full h-12 text-base font-bold bg-[#DF5830] hover:bg-[#c94b26] text-white shadow-sm"
                >
                  Confirmar e Conectar Celular
                </Button>
              </form>
            </CardContent>
          </Card>
        ) : (
          <>
            {/* CARD DO FUNCIONÁRIO LOGADO / VINCULADO */}
            <div className="flex items-center justify-between rounded-xl border border-border/80 bg-white px-4 py-3 shadow-xs">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#DF5830]/10 font-bold text-[#DF5830]">
                  {funcionarioAtual.nome.substring(0, 2).toUpperCase()}
                </div>
                <div>
                  <h2 className="text-base font-bold text-gray-900 leading-tight">
                    {funcionarioAtual.nome}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    {funcionarioAtual.cargo || 'Colaborador'} •{' '}
                    {formatCurrency(funcionarioAtual.valor_hora)}/hora
                  </p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={handleTrocarFuncionario}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Trocar
              </Button>
            </div>

            {/* AVISO CASO FORA DO LOCAL */}
            {!estacaoValida && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Atenção: Você não escaneou o QR Code da estação!</p>
                  <p className="text-amber-800 mt-0.5">
                    Seu registro será gravado com o status{' '}
                    <span className="font-semibold underline">Fora do local</span> para auditoria da
                    empresa.
                  </p>
                </div>
              </div>
            )}

            {/* BOTÕES DE AÇÃO DE PONTO */}
            <Card className="border border-border/80 bg-white shadow-sm overflow-hidden">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base font-bold text-gray-900">
                    Registro de Hoje
                  </CardTitle>
                  <Badge variant="secondary" className="font-normal text-xs">
                    {new Date().toLocaleDateString('pt-BR')}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* STATUS ATUAL DO PONTO */}
                <div className="grid grid-cols-2 gap-3 text-center">
                  <div className="rounded-lg border border-border/60 bg-[#FBF9F7] p-3">
                    <span className="text-xs font-semibold text-muted-foreground">Entrada</span>
                    <div className="mt-1 text-xl font-bold text-gray-900">
                      {pontoHoje?.entrada || '--:--'}
                    </div>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-[#FBF9F7] p-3">
                    <span className="text-xs font-semibold text-muted-foreground">Saída</span>
                    <div className="mt-1 text-xl font-bold text-gray-900">
                      {pontoHoje?.saida || '--:--'}
                    </div>
                  </div>
                </div>
                {/* PAUSAS SE HOUVER */}
                {pontoHoje?.pausas && pontoHoje.pausas.length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-muted/30 p-2.5 text-xs space-y-1">
                    <span className="font-semibold text-muted-foreground block">
                      Intervalos / Pausas:
                    </span>
                    {pontoHoje.pausas.map((p, idx) => (
                      <div key={idx} className="flex justify-between text-muted-foreground">
                        <span>Pausa #{idx + 1}</span>
                        <span className="font-mono font-bold text-gray-800">
                          {p.inicio} até {p.fim || '(em andamento)'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {/* BOTÕES GRANDES DE ACORDO COM O ESTADO */}
                {!pontoHoje ? (
                  <Button
                    onClick={handleBaterEntrada}
                    disabled={submitting}
                    className="w-full h-16 text-lg font-bold bg-[#DF5830] hover:bg-[#c94b26] text-white shadow-md gap-2"
                  >
                    {submitting ? (
                      <RefreshCw className="h-6 w-6 animate-spin" />
                    ) : (
                      <Play className="h-6 w-6" />
                    )}
                    Registrar Entrada
                  </Button>
                ) : pontoFinalizado ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-center text-emerald-800 space-y-1">
                    <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600" />
                    <p className="font-bold text-sm">Ponto do dia finalizado!</p>
                    <p className="text-xs">
                      Entrada: {pontoHoje.entrada} • Saída: {pontoHoje.saida}
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {/* Botão de Pausa / Retomar */}
                    {!estaEmPausa ? (
                      <Button
                        onClick={handleIniciarPausa}
                        disabled={submitting}
                        variant="outline"
                        className="w-full h-12 text-sm font-bold border-amber-300 text-amber-800 hover:bg-amber-50 gap-2"
                      >
                        <Pause className="h-4 w-4" />
                        Iniciar Almoço / Intervalo
                      </Button>
                    ) : (
                      <Button
                        onClick={handleRetomarPausa}
                        disabled={submitting}
                        className="w-full h-12 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white gap-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Retomar do Intervalo
                      </Button>
                    )}

                    {/* Botão de Saída */}
                    <Button
                      onClick={handleBaterSaida}
                      disabled={submitting || estaEmPausa}
                      className="w-full h-16 text-lg font-bold bg-gray-900 hover:bg-black text-white shadow-md gap-2"
                    >
                      <Square className="h-5 w-5" />
                      Registrar Saída
                    </Button>
                  </div>
                )}{' '}
              </CardContent>
            </Card>

            {/* VISÃO PESSOAL DO EMPREGADO (SOMENTE SEUS DADOS) */}
            <Card className="border border-border/80 bg-white shadow-sm">
              <CardHeader className="pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2 text-gray-900">
                  <DollarSign className="h-5 w-5 text-[#DF5830]" />
                  Meu Painel (Últimos 30 dias)
                </CardTitle>
                <CardDescription>
                  Acompanhe suas horas trabalhadas, ganhos acumulados e saldos devedores.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-border/60 bg-[#FBF9F7] p-3 text-center">
                    <span className="text-xs text-muted-foreground font-semibold">
                      Horas Trabalhadas
                    </span>
                    <div className="mt-1 text-2xl font-black text-gray-900">
                      {formatarMinutosEmHHMM(resumoFinanceiro.totalMinutos)}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      ({resumoFinanceiro.totalHorasDecimais} horas decimais)
                    </span>
                  </div>

                  <div className="rounded-xl border border-border/60 bg-[#FBF9F7] p-3 text-center">
                    <span className="text-xs text-muted-foreground font-semibold">
                      Ganhos Acumulados
                    </span>
                    <div className="mt-1 text-2xl font-black text-emerald-700">
                      {formatCurrency(resumoFinanceiro.totalGanho)}
                    </div>
                    <span className="text-[11px] text-muted-foreground">
                      Taxa: {formatCurrency(funcionarioAtual.valor_hora)}/h
                    </span>
                  </div>
                </div>

                {/* DÍVIDAS / ADIANTAMENTOS */}
                {dividas.length > 0 && (
                  <div className="rounded-xl border border-red-200 bg-red-50/50 p-3 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-red-900">
                      <span className="flex items-center gap-1.5">
                        <TrendingDown className="h-4 w-4 text-red-600" />
                        Minhas Dívidas & Adiantamentos
                      </span>
                      <span>Total: {formatCurrency(totalDividasAcumuladas)}</span>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      {dividas.map((d) => (
                        <div
                          key={d.id}
                          className="flex items-center justify-between text-xs rounded-lg bg-white p-2 border border-red-100"
                        >
                          <div>
                            <span className="font-semibold text-gray-900">{d.descricao}</span>
                            <span className="text-[10px] text-muted-foreground block">
                              Abatimento de {d.percentual_abatimento}% por folha
                            </span>
                          </div>
                          <span className="font-mono font-bold text-red-700">
                            {formatCurrency(d.saldo_atual)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* HISTÓRICO RECENTE DE PONTOS */}
                <div className="space-y-2 pt-2">
                  <span className="text-xs font-bold text-gray-900 block">
                    Espelho de Pontos Recentes
                  </span>
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {historicoPontos.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        Nenhum registro nos últimos 30 dias.
                      </p>
                    ) : (
                      historicoPontos.map((p) => {
                        const { horasFormatadas, valorTotalDia } = p.saida
                          ? calcularLinhaPonto(
                              p.data,
                              p.entrada,
                              p.saida,
                              funcionarioAtual.valor_hora,
                              p.pausas,
                              funcionarioAtual.hora_almoco_conta ?? true,
                            )
                          : { horasFormatadas: '--:--', valorTotalDia: 0 }

                        return (
                          <div
                            key={p.id}
                            className="flex items-center justify-between rounded-lg border border-border/60 bg-white p-2.5 text-xs shadow-2xs"
                          >
                            <div>
                              <div className="font-semibold text-gray-900">
                                {formatarDataExtensoPlanilha(p.data)}
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                {p.entrada} às {p.saida || '(aberto)'}
                                {p.origem === 'fora_do_local' && (
                                  <span className="ml-1 text-amber-700 font-semibold">
                                    • fora do local
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="font-mono font-bold text-gray-900">
                                {horasFormatadas}
                              </div>
                              <div className="text-[11px] text-emerald-700 font-semibold">
                                {p.saida ? formatCurrency(valorTotalDia) : 'Em aberto'}
                              </div>
                            </div>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  )
}
