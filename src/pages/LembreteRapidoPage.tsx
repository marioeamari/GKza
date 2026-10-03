import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Bell,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  History,
  LoaderCircle,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
  Flame,
  ArrowLeft,
} from 'lucide-react'

import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/contexts/AppContext'
import { lembretesService } from '@/services/lembretes'
import { getLocalDateStr } from '@/lib/format'
import { apiMessage } from '@/lib/api-error'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { LembreteRapido, LembreteRapidoPrioridade } from '@/types/domain'
import { usePwaNotifications, isLembreteVencidoOuNoMomento } from '@/hooks/use-pwa-notifications'

const LAST_CONTEXT_KEY = 'gkza_despesa_rapida_last_context_id'

export default function LembreteRapidoPage() {
  const { user } = useAuth()
  const { grupos, activeContext, setContextGroup, setContextAll, matchesContext } = useAppContext()

  // Contexto
  const [contextoId, setContextoId] = useState<string>('all')

  // Formulário Lembrete Rápido
  const [titulo, setTitulo] = useState('')
  const [detalhe, setDetalhe] = useState('')
  const [dataLimite, setDataLimite] = useState(() => getLocalDateStr(new Date()))
  const [horaLimite, setHoraLimite] = useState(() => {
    const d = new Date(Date.now() + 60 * 60 * 1000)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  })
  const [prioridade, setPrioridade] = useState<LembreteRapidoPrioridade>('normal')
  const [repetirAteConcluir, setRepetirAteConcluir] = useState(true)

  // Feedback e estados
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  // Lista de lembretes
  const [lembretes, setLembretes] = useState<LembreteRapido[]>([])
  const [loadingLembretes, setLoadingLembretes] = useState(true)
  const [listaAberta, setListaAberta] = useState(true)
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null)

  // Hook de Notificações PWA
  const { permission, requestPermission } = usePwaNotifications(lembretes)
  const [dismissNotificationBanner, setDismissNotificationBanner] = useState(false)

  // Carrega lembretes
  const loadLembretes = async () => {
    setLoadingLembretes(true)
    try {
      const data = await lembretesService.listLembretes(undefined, '-created')
      setLembretes(data)
    } catch (err) {
      console.warn('Erro ao carregar lembretes:', err)
    } finally {
      setLoadingLembretes(false)
    }
  }

  useEffect(() => {
    loadLembretes()
  }, [])

  // Recupera último contexto usado compartilhado com a Despesa Rápida
  useEffect(() => {
    try {
      const savedContextId = localStorage.getItem(LAST_CONTEXT_KEY)
      if (
        savedContextId &&
        (savedContextId === 'all' || grupos.some((g) => g.id === savedContextId))
      ) {
        setContextoId(savedContextId)
        return
      }
    } catch {
      /* ignore */
    }

    if (activeContext.groupId) {
      setContextoId(activeContext.groupId)
    } else {
      setContextoId('all')
    }
  }, [grupos, activeContext.groupId])

  // Troca de contexto
  const handleSelectContexto = (id: string) => {
    setContextoId(id)
    try {
      localStorage.setItem(LAST_CONTEXT_KEY, id)
    } catch {
      /* ignore */
    }
    if (id === 'all') {
      setContextAll()
    } else {
      setContextGroup(id)
    }
  }

  const currentGrupo = grupos.find((g) => g.id === contextoId)
  const contextoLabel = currentGrupo ? currentGrupo.nome : 'Todos os cadastros (Geral)'
  const contextoCor = currentGrupo?.cor || '#DF5830'

  // Filtragem dos lembretes pelo contexto ativo
  const lembretesFiltrados = useMemo(() => {
    return lembretes.filter((item) => {
      // Se não tiver vínculo direto de pessoa/empresa, considera geral e exibe
      if (!item.pessoa && !item.empresa && !item.contexto_tipo) {
        return true
      }
      return matchesContext({
        contexto_tipo: item.contexto_tipo,
        pessoa: item.pessoa,
        empresa: item.empresa,
      })
    })
  }, [lembretes, matchesContext])

  const lembretesPendentes = useMemo(() => {
    return lembretesFiltrados
      .filter((l) => l.status === 'pendente')
      .sort((a, b) => {
        // Ordena por vencimento (data e hora) e urgência
        if (a.prioridade !== b.prioridade) {
          return a.prioridade === 'urgente' ? -1 : 1
        }
        const dataA = `${a.data_limite.slice(0, 10)} ${a.hora_limite || '23:59'}`
        const dataB = `${b.data_limite.slice(0, 10)} ${b.hora_limite || '23:59'}`
        return dataA.localeCompare(dataB)
      })
  }, [lembretesFiltrados])

  const lembretesConcluidosHoje = useMemo(() => {
    const hojeStr = getLocalDateStr(new Date())
    return lembretesFiltrados
      .filter(
        (l) => l.status === 'concluido' && (l.concluido_em?.startsWith(hojeStr) || !l.concluido_em),
      )
      .slice(0, 5)
  }, [lembretesFiltrados])

  // Reset do formulário
  const handleNovoLembrete = () => {
    setTitulo('')
    setDetalhe('')
    setDataLimite(getLocalDateStr(new Date()))
    const d = new Date(Date.now() + 60 * 60 * 1000)
    setHoraLimite(
      `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
    )
    setPrioridade('normal')
    setRepetirAteConcluir(true)
    setSuccessMessage(null)
    setErrorMessage(null)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  // Criação do Lembrete Rápido
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMessage(null)
    setSuccessMessage(null)

    if (!titulo.trim()) {
      setErrorMessage('Por favor, informe o que você precisa fazer.')
      return
    }
    if (!dataLimite) {
      setErrorMessage('Informe a data limite do lembrete.')
      return
    }

    setSubmitting(true)
    try {
      let pessoaRef = ''
      let empresaRef = ''
      let ctxTipo: 'pessoal' | 'empresa' | undefined = undefined

      if (currentGrupo) {
        if (currentGrupo.empresas.length > 0) {
          empresaRef = currentGrupo.empresas[0].id
          ctxTipo = 'empresa'
        } else if (currentGrupo.pessoas.length > 0) {
          pessoaRef = currentGrupo.pessoas[0].id
          ctxTipo = 'pessoal'
        }
      }

      await lembretesService.createLembrete({
        titulo: titulo.trim(),
        detalhe: detalhe.trim(),
        data_limite: dataLimite,
        hora_limite: horaLimite || undefined,
        prioridade,
        repetir_ate_concluir: repetirAteConcluir,
        contexto_tipo: ctxTipo,
        pessoa: pessoaRef || undefined,
        empresa: empresaRef || undefined,
        contexto_nome: contextoLabel,
        origem: 'pwa',
        usuario: user?.id,
      })

      setSuccessMessage('Lembrete criado com sucesso.')
      handleNovoLembrete()
      loadLembretes()
    } catch (err: any) {
      console.error('Falha ao criar lembrete rápido:', err)
      setErrorMessage(
        apiMessage(
          err,
          'Não foi possível salvar o lembrete. Verifique sua conexão e tente novamente.',
        ),
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Concluir lembrete
  const handleConcluir = async (id: string) => {
    setActionLoadingId(id)
    try {
      await lembretesService.concluirLembrete(id)
      setLembretes((prev) =>
        prev.map((item) =>
          item.id === id
            ? { ...item, status: 'concluido', concluido_em: new Date().toISOString() }
            : item,
        ),
      )
    } catch (err) {
      setErrorMessage(apiMessage(err, 'Erro ao concluir lembrete.'))
    } finally {
      setActionLoadingId(null)
    }
  }

  // Excluir lembrete
  const handleExcluir = async (id: string) => {
    if (!confirm('Deseja realmente excluir este lembrete?')) return
    setActionLoadingId(id)
    try {
      await lembretesService.deleteLembrete(id)
      setLembretes((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      setErrorMessage(apiMessage(err, 'Erro ao excluir lembrete.'))
    } finally {
      setActionLoadingId(null)
    }
  }

  // Pedir permissão de notificações
  const handlePermitirNotificacoes = async () => {
    const res = await requestPermission()
    if (res === 'granted') {
      setDismissNotificationBanner(true)
    }
  }

  return (
    <div className="min-h-screen bg-[#FBF8F5] text-stone-900 pb-[calc(4rem+env(safe-area-inset-bottom))] pt-[env(safe-area-inset-top)] antialiased selection:bg-[#DF5830]/20 selection:text-[#DF5830]">
      {/* Moldura centralizada mobile */}
      <div className="mx-auto w-full max-w-md min-h-screen bg-white sm:shadow-2xl sm:border-x sm:border-stone-200/80 flex flex-col justify-between">
        {/* CABEÇALHO */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200/80 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <Button
                asChild
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-stone-600 hover:text-stone-900 rounded-lg shrink-0"
              >
                <Link to="/m" title="Voltar ao Hub">
                  <ArrowLeft className="h-5 w-5" />
                </Link>
              </Button>
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#DF5830] to-[#b83f1d] text-white shadow-sm">
                <Clock className="h-5 w-5 fill-white/20" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-black tracking-tight leading-none text-stone-900 truncate">
                  Lembrete Rápido
                </h1>
                <p className="text-[11px] font-semibold text-stone-500 leading-none mt-1">
                  Sub-app móvel GKza
                </p>
              </div>
            </div>

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg shrink-0"
              title="Abrir ERP"
            >
              <Link to="/agenda">Ver Agenda</Link>
            </Button>
          </div>

          {/* SELETOR DE CONTEXTO NO TOPO */}
          <div className="mt-2.5 pt-2 border-t border-stone-100">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider text-stone-400">
                Contexto:
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold bg-stone-100 text-stone-800 hover:bg-stone-200/70 transition shadow-2xs max-w-[260px] truncate"
                  >
                    <span
                      className="h-2 w-2 rounded-full shrink-0"
                      style={{ backgroundColor: contextoCor }}
                    />
                    <span className="truncate">{contextoLabel}</span>
                    <ChevronDown className="h-3.5 w-3.5 text-stone-500 shrink-0" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 p-1.5 shadow-lg">
                  <DropdownMenuLabel className="text-[10px] uppercase font-bold text-stone-400 px-2 py-1">
                    Trocar Contexto
                  </DropdownMenuLabel>
                  <DropdownMenuItem
                    onClick={() => handleSelectContexto('all')}
                    className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-2 flex items-center justify-between"
                  >
                    <span className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full bg-[#DF5830]" />
                      Todos (Geral)
                    </span>
                    {contextoId === 'all' && <Check className="h-3.5 w-3.5 text-[#DF5830]" />}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  {grupos.map((g) => (
                    <DropdownMenuItem
                      key={g.id}
                      onClick={() => handleSelectContexto(g.id)}
                      className="text-xs font-semibold cursor-pointer rounded-lg px-2.5 py-2 flex items-center justify-between"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: g.cor || '#DF5830' }}
                        />
                        <span className="truncate">{g.nome}</span>
                      </span>
                      {contextoId === g.id && <Check className="h-3.5 w-3.5 text-[#DF5830]" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </header>

        {/* CONTEÚDO PRINCIPAL */}
        <main className="flex-1 px-4 py-4 space-y-4">
          {/* BANNER DE NOTIFICAÇÕES SE NÃO CONCEDIDAS */}
          {permission === 'default' && !dismissNotificationBanner && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 shadow-xs animate-in fade-in-50">
              <div className="flex items-start gap-2.5">
                <BellRing className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-950">Ativar avisos de lembretes?</p>
                  <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                    O GKza avisa quando um lembrete atingir a hora limite para você não esquecer
                    tarefas rápidas na rua.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handlePermitirNotificacoes}
                      className="h-7 px-2.5 text-xs font-extrabold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs rounded-lg"
                    >
                      Ativar notificações
                    </Button>
                    <button
                      type="button"
                      onClick={() => setDismissNotificationBanner(true)}
                      className="text-[11px] font-semibold text-amber-800/80 hover:text-amber-950 px-2 py-1"
                    >
                      Agora não
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mensagem de Sucesso */}
          {successMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-4 shadow-sm animate-in fade-in-50">
              <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-2xs">
                  <CheckCircle2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-extrabold text-emerald-950">{successMessage}</h3>
                  <p className="text-xs text-emerald-800/90 mt-0.5 leading-relaxed">
                    O sistema manterá você avisado até a conclusão desta tarefa.
                  </p>
                  <div className="mt-3 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handleNovoLembrete}
                      className="h-8 px-3 text-xs font-extrabold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs rounded-lg"
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Novo lembrete
                    </Button>
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs font-semibold border-emerald-300 text-emerald-900 hover:bg-emerald-100 rounded-lg"
                    >
                      <Link to="/m">Ir ao Hub</Link>
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mensagem de Erro */}
          {errorMessage && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3.5 shadow-sm animate-in fade-in-50">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-destructive">{errorMessage}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setErrorMessage(null)}
                  className="text-destructive/70 hover:text-destructive"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* FORMULÁRIO */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 1. O QUE FAZER */}
            <div className="space-y-1.5">
              <Label
                htmlFor="titulo"
                className="text-xs font-black uppercase tracking-wider text-stone-600"
              >
                1. O que fazer *
              </Label>
              <Input
                id="titulo"
                placeholder="Ex.: Ir no mercado e comprar água, Pagar boleto da luz..."
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                required
                className="h-12 text-base rounded-xl border-stone-200 bg-stone-50/50 focus:bg-white focus:border-[#DF5830] transition font-medium"
              />

              {/* Sugestões rápidas de tarefas do dia */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[10px] font-bold text-stone-400">Sugestões:</span>
                {[
                  'Comprar água no mercado',
                  'Passar na farmácia',
                  'Cobrar fornecedor',
                  'Abastecer carro',
                ].map((sug) => (
                  <button
                    key={sug}
                    type="button"
                    onClick={() => setTitulo(sug)}
                    className="rounded-full bg-stone-100 hover:bg-stone-200/80 px-2.5 py-0.5 text-[11px] font-semibold text-stone-700 transition"
                  >
                    {sug}
                  </button>
                ))}
              </div>
            </div>

            {/* 2. DETALHE (OPCIONAL) */}
            <div className="space-y-1.5">
              <Label
                htmlFor="detalhe"
                className="text-xs font-black uppercase tracking-wider text-stone-600"
              >
                2. Detalhe / Observação (Opcional)
              </Label>
              <Textarea
                id="detalhe"
                placeholder="Ex.: Levar galão vazio de 20L, marca Crystal de preferência..."
                value={detalhe}
                onChange={(e) => setDetalhe(e.target.value)}
                rows={2}
                className="text-sm rounded-xl border-stone-200 bg-stone-50/50 focus:bg-white focus:border-[#DF5830] transition resize-none"
              />
            </div>

            {/* 3. DATA E HORA LIMITE */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label
                  htmlFor="dataLimite"
                  className="text-xs font-black uppercase tracking-wider text-stone-600"
                >
                  3. Quando realizar *
                </Label>
                <div className="relative">
                  <Input
                    id="dataLimite"
                    type="date"
                    value={dataLimite}
                    onChange={(e) => setDataLimite(e.target.value)}
                    required
                    className="h-12 rounded-xl border-stone-200 bg-stone-50/50 text-xs font-bold text-stone-800 focus:bg-white focus:border-[#DF5830]"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label
                  htmlFor="horaLimite"
                  className="text-xs font-black uppercase tracking-wider text-stone-600"
                >
                  4. Hora limite
                </Label>
                <div className="relative">
                  <Input
                    id="horaLimite"
                    type="time"
                    value={horaLimite}
                    onChange={(e) => setHoraLimite(e.target.value)}
                    className="h-12 rounded-xl border-stone-200 bg-stone-50/50 text-xs font-bold text-stone-800 focus:bg-white focus:border-[#DF5830]"
                  />
                </div>
              </div>
            </div>

            {/* Atalhos de data rápida */}
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-stone-400">Atalhos:</span>
              <button
                type="button"
                onClick={() => {
                  setDataLimite(getLocalDateStr(new Date()))
                }}
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold transition border ${
                  dataLimite === getLocalDateStr(new Date())
                    ? 'border-[#DF5830] bg-[#DF5830]/10 text-[#DF5830]'
                    : 'border-stone-200 bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                Hoje
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date()
                  d.setDate(d.getDate() + 1)
                  setDataLimite(getLocalDateStr(d))
                }}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold transition border border-stone-200 bg-stone-100 text-stone-700 hover:bg-stone-200"
              >
                Amanhã
              </button>
              <button
                type="button"
                onClick={() => {
                  const now = new Date()
                  now.setHours(now.getHours() + 1)
                  setHoraLimite(
                    `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
                  )
                }}
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold transition border border-stone-200 bg-stone-100 text-stone-700 hover:bg-stone-200"
              >
                +1h
              </button>
            </div>

            {/* 5. PRIORIDADE (NORMAL / URGENTE) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-black uppercase tracking-wider text-stone-600">
                5. Prioridade
              </Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setPrioridade('normal')}
                  className={`flex items-center justify-center gap-2 h-11 px-3 rounded-xl text-xs font-bold transition border ${
                    prioridade === 'normal'
                      ? 'border-stone-400 bg-stone-100 text-stone-900 shadow-2xs font-extrabold'
                      : 'border-stone-200 bg-stone-50/60 text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  <Clock className="h-4 w-4 opacity-70" />
                  Normal
                </button>
                <button
                  type="button"
                  onClick={() => setPrioridade('urgente')}
                  className={`flex items-center justify-center gap-2 h-11 px-3 rounded-xl text-xs font-bold transition border ${
                    prioridade === 'urgente'
                      ? 'border-red-500 bg-red-50 text-red-700 shadow-2xs font-extrabold'
                      : 'border-stone-200 bg-stone-50/60 text-stone-500 hover:bg-stone-100'
                  }`}
                >
                  <Flame className="h-4 w-4 text-red-600" />
                  Urgente 🚨
                </button>
              </div>
            </div>

            {/* 6. REPETIR ATÉ CONCLUIR */}
            <div className="rounded-xl border border-stone-200 bg-stone-50/60 p-3 flex items-start gap-3">
              <Checkbox
                id="repetir"
                checked={repetirAteConcluir}
                onCheckedChange={(c) => setRepetirAteConcluir(Boolean(c))}
                className="mt-0.5 data-[state=checked]:bg-[#DF5830] data-[state=checked]:border-[#DF5830]"
              />
              <div className="min-w-0 flex-1 leading-tight">
                <label
                  htmlFor="repetir"
                  className="text-xs font-bold text-stone-900 cursor-pointer select-none"
                >
                  Repetir até concluir
                </label>
                <p className="text-[11px] text-stone-500 mt-0.5">
                  Continua avisando e permanece na lista nos dias seguintes até você marcar como
                  feito.
                </p>
              </div>
            </div>

            {/* BOTÃO CRIAR LEMBRETE */}
            <div className="pt-2">
              <Button
                type="submit"
                disabled={submitting}
                className="h-14 w-full rounded-2xl bg-gradient-to-r from-[#DF5830] to-[#b83f1d] hover:from-[#c94924] hover:to-[#a33617] text-white text-base font-black tracking-wide shadow-lg shadow-orange-500/20 active:scale-[0.99] transition"
              >
                {submitting ? (
                  <>
                    <LoaderCircle className="mr-2 h-5 w-5 animate-spin" />
                    Salvando lembrete...
                  </>
                ) : (
                  <>
                    <Clock className="mr-2 h-5 w-5 fill-white/20" />
                    CRIAR LEMBRETE
                  </>
                )}
              </Button>
            </div>
          </form>

          {/* LISTA RECOLHÍVEL DE LEMBRETES */}
          <section className="pt-4 border-t border-stone-200/80 space-y-2.5">
            <button
              type="button"
              onClick={() => setListaAberta(!listaAberta)}
              className="flex w-full items-center justify-between text-left py-1 text-xs font-black uppercase tracking-wider text-stone-500 hover:text-stone-800 transition"
            >
              <span className="flex items-center gap-1.5">
                <History className="h-3.5 w-3.5" />
                Lembretes do Contexto ({lembretesPendentes.length} pendentes)
              </span>
              <ChevronDown
                className={`h-4 w-4 transition-transform duration-200 ${
                  listaAberta ? 'rotate-180' : ''
                }`}
              />
            </button>

            {listaAberta && (
              <div className="space-y-2">
                {loadingLembretes ? (
                  <div className="flex items-center justify-center py-6 text-xs text-stone-400">
                    <LoaderCircle className="mr-2 h-4 w-4 animate-spin text-[#DF5830]" />
                    Carregando lembretes...
                  </div>
                ) : lembretesPendentes.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/50 p-6 text-center">
                    <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-500 mb-1" />
                    <p className="text-xs font-extrabold text-stone-800">Tudo em dia!</p>
                    <p className="text-[11px] text-stone-500 mt-0.5">
                      Nenhum lembrete pendente para este contexto.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {lembretesPendentes.map((item) => {
                      const vencido = isLembreteVencidoOuNoMomento(item)
                      const isUrgente = item.prioridade === 'urgente'

                      return (
                        <div
                          key={item.id}
                          className={`rounded-xl border p-3 shadow-2xs transition ${
                            vencido
                              ? 'border-orange-300 bg-orange-50/60'
                              : isUrgente
                                ? 'border-red-200 bg-red-50/40'
                                : 'border-stone-200/80 bg-white hover:border-stone-300'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <h4 className="text-xs font-black text-stone-900 leading-snug break-words">
                                  {item.titulo}
                                </h4>
                                {isUrgente && (
                                  <Badge className="h-4 px-1.5 text-[9px] font-black bg-red-600 text-white rounded">
                                    URGENTE
                                  </Badge>
                                )}
                                {vencido && (
                                  <Badge
                                    variant="outline"
                                    className="h-4 px-1.5 text-[9px] font-bold border-orange-400 text-orange-700 bg-orange-100/60 rounded"
                                  >
                                    Vencido / Agora
                                  </Badge>
                                )}
                              </div>

                              {item.detalhe && (
                                <p className="text-[11px] text-stone-600 mt-1 leading-relaxed">
                                  {item.detalhe}
                                </p>
                              )}

                              <div className="flex items-center gap-3 text-[10px] font-semibold text-stone-400 mt-1.5">
                                <span className="flex items-center gap-1 text-stone-600">
                                  <Calendar className="h-3 w-3" />
                                  {item.data_limite.slice(0, 10).split('-').reverse().join('/')}
                                </span>
                                {item.hora_limite && (
                                  <span className="flex items-center gap-1 text-stone-600">
                                    <Clock className="h-3 w-3" />
                                    {item.hora_limite}
                                  </span>
                                )}
                                {item.repetir_ate_concluir && (
                                  <span className="text-[#DF5830] font-bold">Reinsiste</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              <Button
                                size="sm"
                                disabled={actionLoadingId === item.id}
                                onClick={() => handleConcluir(item.id)}
                                className="h-8 px-2.5 text-[11px] font-black bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg shadow-2xs"
                                title="Marcar como concluído"
                              >
                                {actionLoadingId === item.id ? (
                                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <>
                                    <Check className="mr-1 h-3.5 w-3.5" />
                                    Concluir
                                  </>
                                )}
                              </Button>

                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={actionLoadingId === item.id}
                                onClick={() => handleExcluir(item.id)}
                                className="h-8 w-8 p-0 text-stone-400 hover:text-destructive hover:bg-destructive/10 rounded-lg"
                                title="Excluir lembrete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {/* Concluídos Hoje */}
                {lembretesConcluidosHoje.length > 0 && (
                  <div className="pt-3 border-t border-stone-100">
                    <p className="text-[10px] font-black uppercase tracking-wider text-stone-400 mb-1.5">
                      Concluídos hoje ({lembretesConcluidosHoje.length})
                    </p>
                    <div className="space-y-1">
                      {lembretesConcluidosHoje.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-[11px] text-stone-500 py-1 px-2 rounded-lg bg-stone-50/60 line-through opacity-75"
                        >
                          <span className="truncate">{c.titulo}</span>
                          <span className="text-[10px] text-emerald-600 font-bold shrink-0 ml-2">
                            ✓ Feito
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </main>

        {/* RODAPÉ DO SUB-APP */}
        <footer className="border-t border-stone-200/80 bg-stone-50/80 px-4 py-2.5 text-center">
          <div className="flex items-center justify-center gap-4 text-xs font-bold text-stone-500">
            <Link to="/m" className="hover:text-stone-900 transition flex items-center gap-1">
              📱 Hub Início
            </Link>
            <span>•</span>
            <Link
              to="/despesa-rapida"
              className="hover:text-stone-900 transition flex items-center gap-1"
            >
              💵 Despesa Rápida
            </Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
