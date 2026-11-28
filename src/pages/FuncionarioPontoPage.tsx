import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
  AlertTriangle,
  ListChecks,
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
  formatarDataExtensoPlanilha,
  calcularLinhaPonto,
  formatarMinutosEmHHMM,
  converterMinutosEmHorasDecimais,
  formatarDataDDMMAAAA,
  formatarDataDDMM,
  normalizarDataPonto,
  MSG_BLOQUEIO_FORA_DO_LOCAL,
} from '@/lib/funcionarios'
import { formatCurrency, getLocalDateStr } from '@/lib/format'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { formatarPeriodoChecklist, type ChecklistItemExecucao } from '@/lib/funcionariosChecklists'
import {
  PontoApiError,
  listarFuncionariosEstacao,
  loginPonto,
  registrarEntrada,
  registrarSaida,
  iniciarPausa,
  retomarPausa,
  pontosDoDia,
  pontosHistorico,
  listarConfirmacoes,
  salvarConfirmacao,
  listarDividas,
  listarFolhas,
  conferirFolha,
  listarChecklistsDoDia,
  listarExecucoesDoDia,
  marcarItemChecklist,
  lerTokenSessao,
  limparTokenSessao,
  type PontoEstacaoInfo,
  type PontoLoginResultado,
  type PontoRegistroApi,
  type PontoDiaItem,
  type PontoHistoricoItem,
  type PontoConfirmacaoApi,
  type PontoDividaApi,
  type PontoFolhaApi,
  type PontoChecklistApi,
  type PontoChecklistExecucaoApi,
} from '@/services/pontoApi'

// Sessão local persistida por aparelho (token_sessao devolvido por /ponto/login)
const LOCAL_FUNC_KEY = 'gkza_funcionario_local_id'
const LOCAL_FUNC_NOME_KEY = 'gkza_funcionario_local_nome'
const LOCAL_FUNC_CARGO_KEY = 'gkza_funcionario_local_cargo'

export default function FuncionarioPontoPage() {
  const { token } = useParams<{ token?: string }>()
  const { toast } = useToast()

  const [estacao, setEstacao] = useState<PontoEstacaoInfo | null>(null)
  const [estacaoValida, setEstacaoValida] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)

  // Funcionários para identificação
  const [funcionarios, setFuncionarios] = useState<PontoEstacaoInfo[]>([])
  const [funcionarioAtual, setFuncionarioAtual] = useState<{
    id: string
    nome: string
    cargo?: string
  } | null>(null)
  const [selectedFuncionarioId, setSelectedFuncionarioId] = useState<string>('')
  const [pinInput, setPinInput] = useState<string>('')

  // Estado do ponto do dia de hoje
  const [pontoHoje, setPontoHoje] = useState<PontoRegistroApi | null>(null)
  const [historicoPontos, setHistoricoPontos] = useState<PontoHistoricoItem[]>([])
  const [confirmacoes, setConfirmacoes] = useState<PontoConfirmacaoApi[]>([])
  const [dividas, setDividas] = useState<PontoDividaApi[]>([])
  const [horaAtual, setHoraAtual] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [mostrarQREstacao, setMostrarQREstacao] = useState(false)

  // Bloqueio de PIN (5 erros = 15 min — o backend devolve isso)
  const [pinBloqueadoAte, setPinBloqueadoAte] = useState<number | null>(null)
  const [pinSegundosRestantes, setPinSegundosRestantes] = useState(0)

  // Modal de Divergência do Colaborador (dias pontuais)
  const [modalDivergenciaData, setModalDivergenciaData] = useState<string | null>(null)
  const [motivoDivergenciaTexto, setMotivoDivergenciaTexto] = useState('')
  const [salvandoConfirmacao, setSalvandoConfirmacao] = useState(false)

  // Notificação de Pagamento Realizado & Conferência de Folha Paga pelo Colaborador
  const [folhaPendenteConferencia, setFolhaPendenteConferencia] = useState<PontoFolhaApi | null>(
    null,
  )
  const [salvandoConferenciaFolha, setSalvandoConferenciaFolha] = useState(false)
  const [modalDivergenciaFolhaAberta, setModalDivergenciaFolhaAberta] = useState(false)
  const [motivoDivergenciaFolha, setMotivoDivergenciaFolha] = useState('')

  // --- CHECKLISTS DO DIA (vinculados às funções do funcionário) ---
  const [checklistsHoje, setChecklistsHoje] = useState<PontoChecklistApi[]>([])
  const [execucoesHoje, setExecucoesHoje] = useState<Record<string, PontoChecklistExecucaoApi>>({})
  const [itemMarcando, setItemMarcando] = useState<string | null>(null)

  // REGRA: batida de ponto (entrada/saída/pausa/retorno) somente a partir do
  // escaneamento do QR Code da estação. A sessão vinculada (token_sessao)
  // continua valendo para confirmar dias trabalhados e conferir o pagamento.
  const podeBaterPonto = estacaoValida === true

  // valor_hora e hora_almoco_conta NÃO vêm das rotas (nem devem): a tela do
  // colaborador não precisa deles — o backend calcula as horas por batida e a
  // folha devolve os valores. Mantemos o resumo por horas/minutos apenas.
  const valorHoraLocal = 0

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

  // Contador regressivo do bloqueio de PIN
  useEffect(() => {
    if (pinBloqueadoAte == null) return
    const tick = () => {
      const restaMs = pinBloqueadoAte - Date.now()
      if (restaMs <= 0) {
        setPinBloqueadoAte(null)
        setPinSegundosRestantes(0)
        return
      }
      setPinSegundosRestantes(Math.ceil(restaMs / 1000))
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [pinBloqueadoAte])

  const mapConfirmacoes = useMemo(() => {
    const mapa: Record<string, PontoConfirmacaoApi> = {}
    for (const c of confirmacoes) {
      mapa[normalizarDataPonto(c.data)] = c
    }
    return mapa
  }, [confirmacoes])

  // 1. Carregar ponto de hoje, histórico, confirmações, dívidas, folha e checklists
  const carregarDadosDoColaborador = useCallback(async () => {
    try {
      const hojeStr = getLocalDateStr() // Data atual no fuso America/Sao_Paulo

      // Ponto de hoje (rota devolve todos do dia; usamos o aberto ou o último)
      const dia = await pontosDoDia(hojeStr)
      const listaDia = dia?.pontos || []
      const aberto = listaDia.find((p) => p.entrada && !p.saida) || null
      const ultimo = listaDia.length > 0 ? listaDia[listaDia.length - 1] : null
      setPontoHoje(aberto || ultimo)

      // Histórico recente dos últimos 30 dias (rota paginada)
      const dataInicio = new Date()
      dataInicio.setDate(dataInicio.getDate() - 30)
      const dataInicioStr = getLocalDateStr(dataInicio)
      const hist = await pontosHistorico(1, 100)
      setHistoricoPontos(
        (hist || []).filter((p) => normalizarDataPonto(p.data) >= dataInicioStr),
      )

      // Confirmações do período recente
      const confs = await listarConfirmacoes()
      setConfirmacoes((confs || []).filter((c) => normalizarDataPonto(c.data) >= dataInicioStr))

      // Dívidas ativas (rota já devolve só as ativas)
      setDividas(await listarDividas())

      // Folha mais recente quitada para conferência de pagamento pelo colaborador
      const folhas = await listarFolhas()
      const pendente =
        (folhas || []).find(
          (f) => f.quitada && (!f.status_conferencia_colaborador || f.status_conferencia_colaborador === 'pendente'),
        ) || null
      setFolhaPendenteConferencia(pendente)

      // --- CHECKLIST DO DIA ---
      try {
        const [checklists, execucoes] = await Promise.all([
          listarChecklistsDoDia(hojeStr),
          listarExecucoesDoDia(hojeStr),
        ])
        setChecklistsHoje(checklists || [])
        const mapaExecucoes: Record<string, PontoChecklistExecucaoApi> = {}
        for (const exec of execucoes || []) {
          mapaExecucoes[exec.checklist] = exec
        }
        setExecucoesHoje(mapaExecucoes)
      } catch (errChecklist) {
        console.error('Erro ao carregar checklists do dia')
      }
    } catch (err) {
      if (err instanceof PontoApiError && err.status === 401) {
        // token_sessao expirado: recomeça o fluxo de identificação
        limparTokenSessao()
        setFuncionarioAtual(null)
      }
      console.error('Erro ao carregar dados do colaborador')
    }
  }, [])

  // 2. Carregar validação da estação pelo token da URL
  const validarEstacaoAtual = useCallback(async () => {
    try {
      if (token) {
        const lista = await listarFuncionariosEstacao(token)
        if (lista && lista.length > 0) {
          setEstacao({ id: token, nome: 'Estação' })
          setEstacaoValida(true)
        } else {
          setEstacao(null)
          setEstacaoValida(false)
          return
        }
        const funcs = await listarFuncionariosEstacao(token)
        setFuncionarios(funcs || [])
      } else {
        setEstacao(null)
        setEstacaoValida(false)
      }
    } catch (err) {
      console.error('Erro ao validar estação')
      setEstacao(null)
      setEstacaoValida(false)
    }
  }, [token])

  useEffect(() => {
    async function inicializarPonto() {
      setLoading(true)
      try {
        await validarEstacaoAtual()

        // Verificar se já existe vínculo salvo localmente neste celular
        const savedToken = lerTokenSessao()
        if (savedToken) {
          try {
            // Um ping barato que exige X-Ponto-Token: se a sessão ainda é
            // válida, mantemos o vínculo local.
            await pontosDoDia()
            const id = localStorage.getItem(LOCAL_FUNC_KEY) || ''
            const nome = localStorage.getItem(LOCAL_FUNC_NOME_KEY) || ''
            if (id && nome) {
              setFuncionarioAtual({ id, nome, cargo: localStorage.getItem(LOCAL_FUNC_CARGO_KEY) || '' })
              setSelectedFuncionarioId(id)
            }
          } catch {
            limparTokenSessao()
          }
        }
      } catch (err) {
        console.error('Erro ao inicializar página do ponto')
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
            await carregarDadosDoColaborador()
          }
        } catch (err) {
          console.warn('Erro ao atualizar estação/ponto na virada de dia')
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
      carregarDadosDoColaborador()
    }
  }, [funcionarioAtual, carregarDadosDoColaborador])

  // Vinculação de celular ao funcionário: o PIN vai ao SERVIDOR via /ponto/login
  // e o token_sessao volta para os headers X-Ponto-Token. Nada de PIN no navegador.
  const handleVincularFuncionario = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) {
      toast({
        title: 'Estação não vinculada',
        description: 'Escaneie o QR Code da estação antes de se identificar.',
        variant: 'destructive',
      })
      return
    }
    if (!selectedFuncionarioId) {
      toast({
        title: 'Selecione seu nome',
        description: 'Escolha seu perfil na lista para continuar.',
        variant: 'destructive',
      })
      return
    }
    if (pinBloqueadoAte != null) {
      toast({
        title: 'Muitas tentativas incorretas',
        description: `Tente novamente em ${Math.ceil(pinSegundosRestantes / 60)} minuto(s).`,
        variant: 'destructive',
      })
      return
    }

    const func = funcionarios.find((f) => f.id === selectedFuncionarioId)
    if (!func) return

    const pin = pinInput.trim()
    if (!pin) {
      toast({
        title: 'Informe seu PIN',
        description: 'Peça ajuda ao seu gestor se não souber.',
        variant: 'destructive',
      })
      return
    }

    try {
      const resultado: PontoLoginResultado = await loginPonto({
        tokenEstacao: token,
        funcionarioId: func.id,
        pin,
      })
      const nomeAnterior = localStorage.getItem(LOCAL_FUNC_NOME_KEY)
      setFuncionarioAtual({
        id: resultado.funcionarioId,
        nome: nomeAnterior && selectedFuncionarioId === localStorage.getItem(LOCAL_FUNC_KEY) ? nomeAnterior : func.nome,
        cargo: '',
      })
      localStorage.setItem(LOCAL_FUNC_KEY, resultado.funcionarioId)
      localStorage.setItem(LOCAL_FUNC_NOME_KEY, func.nome)
      setPinInput('')
      setPinBloqueadoAte(null)
      setPinSegundosRestantes(0)
      toast({
        title: 'Celular vinculado com sucesso!',
        description: `Olá, ${func.nome}! Seu aparelho agora está configurado para bater ponto.`,
      })
    } catch (err) {
      if (err instanceof PontoApiError) {
        if (err.bloqueado) {
          const restaMin = err.minutosRestantes || 15
          setPinBloqueadoAte(Date.now() + restaMin * 60000)
          setPinSegundosRestantes(restaMin * 60)
          toast({
            title: 'Muitas tentativas incorretas',
            description: `Por segurança, o PIN foi bloqueado. Tente novamente em ${restaMin} minuto(s).`,
            variant: 'destructive',
          })
        } else {
          const resta = err.tentativasRestantes
          toast({
            title: 'PIN incorreto',
            description:
              (err.message || 'O PIN digitado não confere.') +
              (typeof resta === 'number' && resta > 0
                ? ` Tentativas restantes: ${resta}.`
                : ''),
            variant: 'destructive',
          })
        }
      } else {
        console.error('Erro ao vincular celular')
        toast({
          title: 'Erro ao vincular',
          description: 'Não foi possível salvar a identificação. Tente novamente.',
          variant: 'destructive',
        })
      }
    }
  }

  const handleTrocarFuncionario = () => {
    limparTokenSessao()
    localStorage.removeItem(LOCAL_FUNC_KEY)
    localStorage.removeItem(LOCAL_FUNC_NOME_KEY)
    localStorage.removeItem(LOCAL_FUNC_CARGO_KEY)
    setFuncionarioAtual(null)
    setFolhaPendenteConferencia(null)
    setPinInput('')
    setPontoHoje(null)
  }

  // Ações de Conferência de Pagamento pelo Colaborador (Regra 4 invertida)
  const handleConfirmarPagamentoCorreto = async () => {
    if (!folhaPendenteConferencia || salvandoConferenciaFolha) return
    setSalvandoConferenciaFolha(true)
    try {
      const resp = await conferirFolha(folhaPendenteConferencia.id, 'confirmado')
      setFolhaPendenteConferencia((prev) =>
        prev ? { ...prev, status_conferencia_colaborador: resp.status_conferencia_colaborador } : prev,
      )
      toast({
        title: 'Pagamento confirmado com sucesso!',
        description: 'Você confirmou que o valor recebido está condizente com os dias trabalhados.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao confirmar pagamento',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoConferenciaFolha(false)
    }
  }

  const handleSalvarDivergenciaPagamento = async () => {
    if (!folhaPendenteConferencia || salvandoConferenciaFolha) return
    if (!motivoDivergenciaFolha.trim()) {
      toast({
        title: 'Descreva a divergência',
        description: 'Informe o motivo pelo qual o valor não condiz com os dias trabalhados.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoConferenciaFolha(true)
    try {
      const resp = await conferirFolha(
        folhaPendenteConferencia.id,
        'divergente',
        motivoDivergenciaFolha.trim(),
      )
      setFolhaPendenteConferencia((prev) =>
        prev ? { ...prev, status_conferencia_colaborador: resp.status_conferencia_colaborador, motivo_divergencia_colaborador: motivoDivergenciaFolha.trim() } : prev,
      )
      setModalDivergenciaFolhaAberta(false)
      setMotivoDivergenciaFolha('')
      toast({
        title: 'Divergência de pagamento registrada!',
        description: 'O administrador foi avisado para avaliar o ajuste na próxima folha aberta.',
      })
    } catch (err) {
      toast({
        title: 'Erro ao registrar divergência',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoConferenciaFolha(false)
    }
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
    // REGRA: batida de ponto somente a partir do escaneamento do QR da estação.
    if (!podeBaterPonto || !token) {
      toast({
        title: 'Registro não permitido',
        description: MSG_BLOQUEIO_FORA_DO_LOCAL,
        variant: 'destructive',
      })
      return
    }

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
      const resp = await registrarEntrada(token)
      setPontoHoje(resp)
      await carregarDadosDoColaborador()

      toast({
        title: 'Entrada registrada com sucesso!',
        description: `Horário de entrada: ${resp.entrada || horaAtualHHMM()}.`,
      })
    } catch (err) {
      console.error('Erro ao bater entrada')
      toast({
        title: 'Registro não permitido',
        description: err instanceof Error ? err.message : 'Erro ao registrar entrada. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleBaterSaida = async () => {
    if (!pontoHoje || !token) return
    setSubmitting(true)
    try {
      const resp = await registrarSaida(token)
      setPontoHoje(resp)

      // REGRA: saída com itens pendentes de checklist apenas AVISA — nunca bloqueia.
      let avisoChecklist: string | undefined
      try {
        const execucoes = await listarExecucoesDoDia(getLocalDateStr())
        const mapaExec: Record<string, PontoChecklistExecucaoApi> = {}
        for (const exec of execucoes || []) mapaExec[exec.checklist] = exec
        let pendentes = 0
        for (const cl of checklistsHoje) {
          const exec = mapaExec[cl.id]
          const itens = exec?.itens?.length ? exec.itens : (cl.itens || []).map((t) => ({ texto: t.texto, marcado: false }))
          pendentes += itens.filter((i) => !i.marcado).length
        }
        if (pendentes > 0) {
          avisoChecklist = `Atenção: ${pendentes} ${
            pendentes === 1 ? 'item pendente' : 'itens pendentes'
          } no checklist do dia.`
        }
      } catch (errChecklist) {
        console.error('Erro ao contar itens pendentes do checklist')
      }

      await carregarDadosDoColaborador()

      toast({
        title: 'Saída registrada!',
        description: `Horário de saída: ${resp.saida || horaAtualHHMM()}.${avisoChecklist ? ` ${avisoChecklist}` : ''} Bom descanso!`,
      })
    } catch (err) {
      console.error('Erro ao bater saída')
      toast({
        title: 'Falha ao registrar',
        description: err instanceof Error ? err.message : 'Erro ao registrar saída. Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  // --- CHECKLIST DO DIA: marcar item (exige origem do ponto: estação QR/admin) ---
  const handleMarcarItemChecklist = async (
    checklist: PontoChecklistApi,
    index: number,
  ) => {
    if (!funcionarioAtual) return
    // REGRA: sem estação QR válida a marcação é RECUSADA com o aviso padrão.
    if (!podeBaterPonto) {
      toast({
        title: 'Marcação não permitida',
        description: MSG_BLOQUEIO_FORA_DO_LOCAL,
        variant: 'destructive',
      })
      return
    }

    const chave = `${checklist.id}:${index}`
    setItemMarcando(chave)
    try {
      const hojeStr = getLocalDateStr()
      const atualizada = await marcarItemChecklist(checklist.id, index, true, hojeStr)
      setExecucoesHoje((prev) => ({ ...prev, [checklist.id]: atualizada }))

      if (atualizada.itens[index]?.marcado) {
        toast({
          title: 'Item marcado',
          description: `"${checklist.itens[index]?.texto}" foi marcado no checklist.`,
        })
      }
    } catch (err) {
      toast({
        title: 'Erro ao marcar item',
        description: err instanceof Error ? err.message : 'Tente novamente.',
        variant: 'destructive',
      })
    } finally {
      setItemMarcando(null)
    }
  }

  const handleIniciarPausa = async () => {
    if (!pontoHoje || !token) return
    setSubmitting(true)
    try {
      const resp = await iniciarPausa(token)
      if (resp?.pausas) {
        setPontoHoje((prev) => (prev ? { ...prev, pausas: resp.pausas } : prev))
      }
      toast({
        title: 'Pausa iniciada',
        description: `Início da pausa às ${horaAtualHHMM()}.`,
      })
    } catch (err) {
      console.error('Erro ao iniciar pausa')
      toast({
        title: 'Falha ao pausar',
        description: err instanceof Error ? err.message : 'Erro ao iniciar pausa.',
        variant: 'destructive',
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleRetomarPausa = async () => {
    if (!pontoHoje || !token) return
    setSubmitting(true)
    try {
      const resp = await retomarPausa(token)
      if (resp?.pausas) {
        setPontoHoje((prev) => (prev ? { ...prev, pausas: resp.pausas } : prev))
      }
      toast({
        title: 'Trabalho retomado',
        description: `Retorno às ${horaAtualHHMM()}. Bom trabalho!`,
      })
    } catch (err) {
      console.error('Erro ao retomar pausa')
      toast({
        title: 'Falha ao retomar',
        description: err instanceof Error ? err.message : 'Erro ao retomar pausa.',
        variant: 'destructive',
      })
    } finally {
      submittingRef.current = false
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

  // Total acumulado trabalhado no período recente (horas do próprio funcionário)
  const resumoFinanceiro = useMemo(() => {
    if (!funcionarioAtual) {
      return { totalHorasDecimais: 0, totalGanho: 0, totalMinutos: 0 }
    }
    let totalMinutos = 0
    for (const p of historicoPontos) {
      if (p.entrada && p.saida) {
        if (p.horas != null && p.horas > 0) {
          totalMinutos += Math.round(p.horas * 60)
        } else {
          const { minutosTrabalhados } = calcularLinhaPonto(
            normalizarDataPonto(p.data),
            p.entrada,
            p.saida,
            valorHoraLocal,
            p.pausas,
            true,
          )
          totalMinutos += minutosTrabalhados
          void totalGanhoRef
        }
      }
    }

    const totalHorasDecimais = converterMinutosEmHorasDecimais(totalMinutos)
    return {
      totalMinutos,
      totalHorasDecimais,
      totalGanho: 0,
    }
  }, [historicoPontos, funcionarioAtual])

  const totalDividasAcumuladas = useMemo(() => {
    return dividas.reduce((acc, d) => acc + (d.saldo_atual || 0), 0)
  }, [dividas])

  // Ações de Confirmação pelo Funcionário
  const handleConfirmarDia = async (dataYYYYMMDD: string) => {
    if (!funcionarioAtual || salvandoConfirmacao) return
    setSalvandoConfirmacao(true)
    try {
      await salvarConfirmacao(dataYYYYMMDD, false)
      setConfirmacoes((prev) => [
        ...prev,
        {
          id: '',
          data: dataYYYYMMDD,
          confirmado: true,
          divergencia_apontada: false,
        },
      ])
      toast({
        title: 'Período trabalhado confirmado!',
        description: `Você confirmou as horas de ${formatarDataDDMMAAAA(dataYYYYMMDD)}.`,
      })
    } catch (err) {
      toast({
        title: 'Erro ao confirmar',
        description: err instanceof Error ? err.message : 'Não foi possível confirmar o dia.',
        variant: 'destructive',
      })
    } finally {
      setSalvandoConfirmacao(false)
    }
  }

  const handleAbrirDivergencia = (dataYYYYMMDD: string) => {
    setModalDivergenciaData(dataYYYYMMDD)
    const conf = mapConfirmacoes[dataYYYYMMDD]
    setMotivoDivergenciaTexto(conf?.motivo_divergencia || '')
  }

  const handleSalvarDivergencia = async () => {
    if (!funcionarioAtual || !modalDivergenciaData || salvandoConfirmacao) return
    if (!motivoDivergenciaTexto.trim()) {
      toast({
        title: 'Informe a divergência',
        description: 'Descreva o que está incorreto nas horas ou valor.',
        variant: 'destructive',
      })
      return
    }

    setSalvandoConfirmacao(true)
    try {
      await salvarConfirmacao(modalDivergenciaData, true, motivoDivergenciaTexto.trim())
      setConfirmacoes((prev) => {
        const filtered = prev.filter((c) => normalizarDataPonto(c.data) !== modalDivergenciaData)
        return [...filtered, { id: '', data: modalDivergenciaData, confirmado: false, divergencia_apontada: true, motivo_divergencia: motivoDivergenciaTexto.trim() }]
      })
      toast({
        title: 'Divergência apontada!',
        description:
          'Seu apontamento foi enviado para o administrador ajustar neste mesmo período.',
      })
      setModalDivergenciaData(null)
      setMotivoDivergenciaTexto('')
    } catch (err) {
      toast({
        title: 'Erro ao salvar divergência',
        description: err instanceof Error ? err.message : '',
        variant: 'destructive',
      })
    } finally {
      setSalvandoConfirmacao(false)
    }
  }

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
    <div className="min-h-dvh bg-[#FBF9F7] text-foreground">
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
                No local
              </Badge "extra"
              >
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
                onClick={() => setMostrarQREstacao((prev) => undefined)}
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
                QR Code de Hoje — Estação
              </CardTitle>
              <CardDescription className="text-xs">
                Link rotativo diário auto-renovável à meia-noite
              </CardLinkDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center justify-center pb-4 pt-1">
              <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                <LocalQRCode
                  value={`${window.location.origin}/funcionarios/ponto/${token || ''}`}
                  size={160}
                  alt={`QR Code Estação`}
                  className="h-40 w-40 rounded-lg bg-white p-2 shadow-xs"
                />
              </div>
              <span className="text-[11px] real text-muted-foreground mt-2">
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
              </ nome>
              <CardDescription>
                Selecione seu nome na lista e digite seu PIN para vincular seu celular a este ponto.
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
                          {f.nome}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="pin" className="text verificado">
                    PIN / Senha pessoal
                  </Label>
                  <Input
                    id="pin"
                    type="password"
                    autoComplete="current-password"
                    inputMode="numeric"
                    placeholder="Seu PIN de ponto"
                    value={pinInput}
                    onChange={(e) => setPinInput(e.target.value)}
                    className="h-11"
                  />
                  {pinBloqueadoAte != null && (
                    <p className="text-xs text-red-600 font-semibold">
                      Muitas tentativas incorretas. Tente novamente em{' '}
                      {formatarContagem(pinSegundosRestantes)}.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Por segurança, o PIN fica bloqueado por 15 minutos após 5 erros seguidos.
                    </p>
                  )}
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
                    {funcionarioAtual.cargo || 'Colaborador'}
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

            {/* CARD / BANNER DE NOTIFICAÇÃO: PAGAMENTO REALIZADO & CONFERÊNCIA (REGRA 4 INVERTIDA) */}
            {folhaPendenteConferencia && folhaPendenteConferencia.quitada && (
              <div
                className={`rounded-xl border p-4 text-xs shadow-xs space-y-3 transition ${
                  folhaPendenteConferencia.status_conferencia_colaborador === 'confirmado'
                    ? 'border-emerald-300 bg-emerald-50/70 text-emerald-950'
                    : folhaPendenteConferencia.status_conferencia_colaborador === 'divergente'
                      ? 'border-amber-300 bg-amber-50/70 text-amber-950'
                      : 'border-blue-300 bg-blue-50/80 text-blue-950'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    {folhaPendenteConferencia.status_conferencia_colaborador === 'confirmado' ? (
                      <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : folhaPendenteConferencia.status_conferencia_colaborador === 'divergente' ? (
                      <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    ) : (
                      <DollarSign className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm">
                          {folhaPendenteConferencia.status_conferencia_colaborador === 'confirmado'
                            ? 'Pagamento conferido e confirmado'
                            : folhaPendenteConferencia.status_conferencia_colaborador ===
                                'divergente'
                              ? 'Divergência de pagamento sob análise'
                              : '🔔 Pagamento realizado pelo administrador!'}
                        </span>
                        <Badge
                          variant="outline"
                          className={`text-[10px] ${
                            folhaPendenteConferencia.status_conferencia_colaborador === 'confirmado'
                              ? 'border-emerald-400 bg-emerald-100 text-emerald-900'
                              : folhaPendenteColaborador === 'divergente'
                                ? 'border-amber-400 bg-amber-100 text-amber-900'
                                : 'border-blue-400 bg-blue-100 text-blue-900'
                          }`}
                        >
                          {folhaPendenteConferencia.status_conferencia_colaborador === 'confirmado'
                            ? 'Conferido'
                            : folhaPendenteConferencia.status_conferencia_colaborador ===
                                'divergente'
                              ? 'Divergente'
                              : 'Aguardando sua conferência'}
                        </Badge>
                      </div>

                      <p className="mt-1 text-xs leading-relaxed">
                        Período:{' '}
                        <strong>
                          {formatarDataDDMMAAAA(folhaPendenteConferencia.periodo_inicio)} até{' '}
                          {formatarDataDDMMAAAA(folhaPendenteConferencia.periodo_fim)}
                        </strong>{' '}
                        • Valor Pago:{' '}
                        <strong className="font-mono text-emerald-700">
                          {formatCurrency(folhaPendenteConferencia.a_receber)}
                        </strong>
                        .
                      </p>

                      <p className="text-[11px] opacity-90 mt-0.5">
                        {folhaPendenteConferencia.status_conferencia_colaborador === 'confirmado'
                          ? `Você confirmou que o valor recebido está condizente com os dias trabalhados em ${formatarDataDDMM(
                              folhaPendenteConferencia.conferido_colaborador_em || '',
                            )}.`
                          : folhaPendenteConferencia.status_conferencia_colaborador === 'divergente'
                            ? `Divergência apontada: "${folhaPendenteConferencia.motivo_divergencia_colaborador}". O administrador ajustará na próxima folha.`
                            : 'Confira abaixo se o valor recebido está condizente com os dias trabalhados neste período.'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* BOTÕES DE CONFIRMAÇÃO DO COLABORADOR */}
                {(!folhaPendenteConferencia.status_conferencia_colaborador ||
                  folhaPendenteConferencia.status_conferencia_colaborador === 'pendente') && (
                  <div className="pt-2 border-t border-blue-200/60 flex flex-wrap items-center justify-end gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setModalDivergenciaFolhaAberta(true)}
                      disabled={salvandoConferenciaFolha}
                      className="h-8 text-xs border-amber-300 text-amber-900 hover:bg-amber-100 font-semibold gap-1"
                    >
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                      Valor não condiz (Apontar)
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleConfirmarPagamentoCorreto}
                      disabled={salvandoConferenciaFolha}
                      className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1 shadow-2xs"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Valor correto (Confirmar)
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* AVISO CASO FORA DO LOCAL — REGRA: batida bloqueada sem estação escaneada */}
            {!estacaoValida && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3.5 text-xs text-amber-900 flex items-start gap-2.5">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Escaneie o QR Code da estação para registrar o ponto.</p>
                  <p className="text-amber-800 mt-0.5">
                    Sem o escaneamento do QR Code da estação, os botões de registro ficam
                    desabilitados. Seu celular vinculado continua valendo para confirmar os dias
                    trabalhados e conferir o pagamento da folha.
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
                    disabled={submitting || !podeBaterPonto}
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
                        onClick={handleIniciarPpausa}
                        disabled={submitting || !podeBaterPonto}
                        variant="outline"
                        className="w-full h-12 text-sm font-bold border-amber-300 text-amber-800 hover:bg-amber-50 gap-2"
                      >
                        <Pause className="h-4 w-4" />
                        Iniciar Almoço / Intervalo
                      </Button>
                    ) : (
                      <Button
                        onClick={handleRetomarPausa}
                        disabled={submitting || !podeBaterPonto}
                        className="w-full h-12 text-sm font-bold bg-amber-600 hover:bg-amber-700 text-white gap-2"
                      >
                        <RotateCcw className="h-4 w-4" />
                        Retomar do Intervalo
                        </Button>
                    )}

                    {/* Botão de Saída */}
                    <Button
                      onClick={handleBaterSaida}
                      disabled={submitting || estaEmPausa || !podeBaterPonto}
                      className="w-full h-16 text-lg font-bold bg-gray-900 hover:bg-black text-white shadow-md gap-2"
                    >
                      <Square className="h-5 w-5" />
                      Registrar Saída
                    </Button>
                  </div>
                )}{' '}
              </CardContent>
            </Card>

            {/* CHECKLIST DO DIA — vinculado às funções do funcionário */}
            {funcionarioAtual && checklistsHoje.length > 0 && (
              <Card className="border border-border/80 bg-white shadow-sm">
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <ListChecks className="h-5 w-5 text-[#DF5830]" />
                      Checklist do dia
                    </CardTitle>
                    <Badge variant="secondary" className="font-normal text-xs">
                      {checklistsHoje.length}{' '}
                      {checklistsHoje.length === 1 ? 'checklist' : 'checklists'}
                    </Badge>
                  </div>
                  <CardDescription>
                    Marque cada item ao concluí-lo — o horário da marcação fica registrado.
                    {!podeBaterPonto && ' Escaneie o QR da estação para poder marcar.'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {checklistsHoje.map((checklist) => {
                    const execucao = execucoesHoje[checklist.id]
                    // REGRA: o card renderiza os itens da EXECUÇÃO do dia
                    // (funcionarios_checklist_execucoes, com marcado_em/horário).
                    // Itens do TEMPLATE sem execução ainda aparecem como pendentes.
                    const itens: ChecklistItemExecucao[] = execucao?.itens?.length
                      ? execucao.itens.map((i) => ({
                          texto: (i as any).texto || '',
                          marcado: Boolean((i as any).marcado),
                          horario: (i as any).horario || undefined,
                        }))
                      : (checklist.itens || []).map((t) => ({
                          texto: t.texto,
                          marcado: false,
                        }))
                    const total = itens.length
                    const marcados = itens.filter((i) => i.marcado).length
                    const concluido = total >  type ? marcados === total : false

                    return (
                      <div
                        key={checklist.id}
                        className="rounded-xl border border-border/70 bg-[#FBF9F7] p-3 space-y-2"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">
                              {checklist.nome}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {formatarPeriodoChecklist({
                                id: checklist.id,
                                nome: checklist.nome,
                                periodo: checklist.periodo,
                                dia_semana: checklist.dia_semana,
                                dia_mes: checklist.dia_mes,
                                itens: [],
                                ativo: true,
                              } as any)}
                            </p>
                          </div>
                          <Badge
                            variant="outline"
                            className={`text-[10px] shrink-0 ${
                              concluido
                                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                                : marcados > 0
                                  ? 'border-amber-300 bg-amber-50 text-amber-800'
                                  : ''
                            }`}
                          >
                            {marcados}/{total}
                          </Badge>
                        </div>

                        <div className="space-y-1">
                          {itens.map((item, idx) => {
                            const chave = `${checklist.id}:${idx}`
                            const emMarcacao = itemMarcando === chave
                            return (
                              <label
                                key={idx}
                                className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-sm cursor-pointer transition-colors ${
                                  item.marcado ? 'bg-emerald-50/60' : 'hover:bg-white'
                                } ${!podeBaterPonto ? 'opacity-60 cursor-not-allowed' : ''}`}
                              >
                                <Checkbox
                                  checked={item.marcado}
                                  disabled={!podeBaterPonto || emMarcacao || submitting}
                                  onCheckedChange={() => handleMarcarItemChecklist(checklist, idx)}
                                />
                                <span
                                  className={`flex-1 ${
                                    item.marcado ? 'line-through text-muted-foreground' : ''
                                  }`}
                                >
                                  {item.texto}
                                </span>
                                {item.horario && (
                                  <span className="text-[10px] font-mono text-muted-foreground">
                                    {item.horario}
                                  </span>
                                )}
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            )}

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
                  <div className="rounded-xl border border-border/60 bg-[#FBF9F7] className="p-3 text-center">
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
                      Calculado pela folha
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

                {/* HISTÓRICO RECENTE DE PONTOS COM CONFERÊNCIA POR DATA (REGRA 4) */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-gray-900 block">
                      Minha Atividade & Conferência do Período
                    </span>
                    <span className="text-[11px] text-muted-foreground">
                      Confirme cada dia trabalhado
                    </span>
                  </div>

                  <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                    {historicoPontos.length === 0 ? (
                      <p className="text-xs text-muted-foreground py-2 text-center">
                        Nenhum registro nos últimos 30 dias.
                      </p>
                    ) : (
                      historicoPontos.map((p) => {
                        const dataNorm = normalizarDataPonto(p.data)
                        const conf = mapConfirmacoes[dataNorm]
                        const estaConfirmado = Boolean(conf && conf.confirmado)
                        const temDivergencia = Boolean(conf && conf.divergencia_apontada)

                        return (
                          <div
                            key={p.id}
                            className={`rounded-xl border p-3 text-xs shadow-2xs space-y-2 transition ${
                              estaConfirmado
                                ? 'border-emerald-200 bg-emerald-50/40'
                                : temDivergencia
                                  ? 'border-amber-300 bg-amber-50/40'
                                  : 'border-border/70 bg-white'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-semibold text-gray-900">
                                  {formatarDataExtensoPlanilha(dataNorm)}
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
                                  {formatarMinutosEmHHMM(
                                    p.horas != null && p.horas > 0
                                      ? Math.round(p.horas * 60)
                                      : 0,
                                  )}
                                </ closed>
                                <div className="text-[11px] text-emerald-700 font-semibold">
                                  {p.saida ? 'Registrado' : 'Em aberto'}
                                </div>
                              </div>
                              </div>
                            </div>

                            {/* BARRA DE CONFIRMAÇÃO DO COLABORADOR */}
                            <div className="pt-2 border-t border-border/40 flex items-center justify-between gap-2">
                              {estaConfirmado ? (
                                <Badge
                                  variant="outline"
                                  className="border-emerald-300 bg-emerald-100/70 text-emerald-800 gap-1 text-[11px]"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                  Dia conferido e confirmado
                                </Badge>
                              ) : temDivergencia ? (
                                <div className="flex-1">
                                  <Badge
                                    variant="outline"
                                    className="border-amber-400 bg-amber-100 text-amber-900 gap-1 text-[10px]"
                                  >
                                    <AlertCircle className="h-3 w-3 text-amber-700" />
                                    Divergência apontada
                                  </Badge>
                                  {conf.motivo_divergencia && (
                                    <p className="text-[10px] text-amber-800 mt-1 italic">
                                      "{conf.motivo_divergencia}"
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <span className="text-[11px] text-muted-foreground">
                                  Conferiu este horário?
                                </span>
                              )}

                              <div className="flex items-center gap-1.5 shrink-0">
                                {!estaConfirmado && (
                                  <Button
                                    size="sm"
                                    onClick={() => handleConfirmarDia(dataNorm)}
                                    disabled={salvandoConfirmacao}
                                    className="h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-semibold gap-1 shadow-2xs"
                                  >
                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                    Confirmar
                                  </Button>
                                )}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleAbrirDivergencia(dataNorm)}
                                  className="h-7 text-xs text-amber-800 hover:bg-amber-100/60"
                                >
                                  {temDivergencia ? 'Editar divergência' : 'Apontar divergência'}
                                </Button>
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

      {/* MODAL DE APONTAMENTO DE DIVERGÊNCIA PELO FUNCIONÁRIO */}
      <Dialog
        open={Boolean(modalDivergenciaData)}
        onOpenChange={(aberto) => !aberto && setModalDivergenciaData(null)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-600" />
              Apontar Divergência de Horas
            </DialogTitle>
            <DialogDescription className="text-xs">
              {modalDivergenciaData
                ? `Data: ${formatarDataDDMMAAAA(modalDivergenciaData)}. Descreva o que está incorreto para ajuste no período vigente.`
                : ''}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="font-semibold text-gray-800">
                O que precisa ser corrigido neste dia?
              </Label>
              <Textarea
                value={motivoDivergenciaTexto}
                onChange={(e) => setMotivoDivergenciaTexto(e.target.value)}
                placeholder="Ex: Saí às 17:30 em vez de 16:30; faltou contabilizar 1 hora extra..."
                rows={4}
                className="text-xs bg-white"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              A conferência roda pelo servidor com o seu token de sessão — o administrador fará o
              ajuste neste mesmo período antes do fechamento.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalDivergenciaData(null)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSalvarDivergencia}
              disabled={salvandoConfirmacao}
              className="bg-[#DF5830] hover:bg-[#c94b26] text-white text-xs font-bold"
            >
              Salvar Apontamento
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL DE DIVERGÊNCIA DO VALOR DA FOLHA PAGA (REGRA 4 INVERTIDA) */}
      <Dialog
        state={modalDivergenciaFolhaAberta}
        onOpenChange={(aberto) => !aberto && setModalDivergenciaFolhaAberta(false)}
      >
        <DialogContent className="sm:max-w-md bg-white">
          <DialogHeader>
            <DialogTitle className="text-base font-bold text-gray-900 flex items to-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              Apontar Divergência no Pagamento
            </DialogTitle>
            <DialogDescription className="text-xs">
              {folhaPendenteConferencia ? (
                <span>
                  Período: {formatarDataDivergenciaDIA(folhaPendenteConferencia.periodo_inicio)} a{' '}
                  {formatarDataDDMMAAAA(folhaPendenteConferencia.periodo_fim)} • Valor Pago:{' '}
                  <strong>{formatCurrency(folhaPendenteConferencia.a_receber)}</strong>
                </span>
              ) : (
                'Descreva a divergência observada no valor pago.'
              )}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <div className="space-y-1.5">
              <Label className="font-semibold text-gray-800">
                Por que o valor não está condizente com os dias trabalhados?
              </Label>
              <Textarea
                value={motivoDivergenciaFolha}
                onChange={(e) => setMotivoDivergenciaFolha(e.target.value)}
                placeholder="Ex: Recebi R$ 350,00 mas pelos 5 dias trabalhados e horas extras o valor combinado era R$ 420,00..."
                rows={4}
                className="text-xs bg-white"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Seu apontamento será encaminhado ao administrador. Conforme as regras da empresa, o
              ajuste financeiro correspondente será lançado na folha em aberto.
            </p>
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalDivergenciaFolhaAberta(false)}
              className="text-xs"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              onClick={handleSalvarDivergenciaPagamento}
              disabled={salvandoConferenciaFolha}
              className="bg-[#DF5830] hover:bg-[#c94b26] text-white text-xs file-bold"
            >
              Enviar Divergência
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
