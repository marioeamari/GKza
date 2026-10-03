import { useEffect, useState, useMemo } from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Bell,
  BellRing,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  ExternalLink,
  Flame,
  Plus,
  RefreshCw,
  Sparkles,
  Zap,
  ArrowRight,
  Inbox,
  AlertCircle,
  Calendar,
  Pencil,
} from 'lucide-react'

import pb from '@/lib/pocketbase/client'
import { useAuth } from '@/contexts/AuthContext'
import { useAppContext } from '@/contexts/AppContext'
import { lembretesService } from '@/services/lembretes'
import { getLocalDateStr } from '@/lib/format'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { LembreteRapido, TelegramRegistroPendente } from '@/types/domain'
import { usePwaNotifications, isLembreteVencidoOuNoMomento } from '@/hooks/use-pwa-notifications'

const LAST_CONTEXT_KEY = 'gkza_despesa_rapida_last_context_id'

export default function MobileHubPage() {
  const location = useLocation()
  const { user } = useAuth()
  const { grupos, activeContext, setContextGroup, setContextAll, matchesContext } = useAppContext()

  // Feedback flash vindo de redirecionamentos
  const [flashMessage, setFlashMessage] = useState<string | null>(() => {
    return (location.state as any)?.flash || null
  })

  // Contexto
  const [contextoId, setContextoId] = useState<string>('all')

  // Lembretes & Triagem
  const [lembretes, setLembretes] = useState<LembreteRapido[]>([])
  const [pendentesPwaHoje, setPendentesPwaHoje] = useState<TelegramRegistroPendente[]>([])
  const [loading, setLoading] = useState(true)

  // Notificações
  const { permission, requestPermission } = usePwaNotifications(lembretes)
  const [dismissNotificationBanner, setDismissNotificationBanner] = useState(false)

  // Carrega dados do Hub
  const loadHubData = async () => {
    setLoading(true)
    try {
      const hojeStr = getLocalDateStr(new Date())

      const [lembretesList, pendentesList] = await Promise.all([
        lembretesService
          .listLembretes(undefined, 'data_limite,hora_limite')
          .catch(() => [] as LembreteRapido[]),
        pb
          .collection<TelegramRegistroPendente>('telegram_registros_pendentes')
          .getList(1, 100, {
            sort: '-created',
            filter: `origem_tipo = 'pwa' && status = 'pendente'`,
          })
          .catch(() => ({ items: [] as TelegramRegistroPendente[] })),
      ])

      setLembretes(lembretesList)
      setPendentesPwaHoje(pendentesList.items)
    } catch (err) {
      console.warn('Erro ao carregar dados do Hub móvel:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadHubData()
  }, [])

  // Recupera último contexto usado (memória compartilhada)
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

  // Filtragem de lembretes pelo contexto ativo
  const lembretesFiltrados = useMemo(() => {
    return lembretes.filter((item) => {
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
    return lembretesFiltrados.filter((l) => l.status === 'pendente')
  }, [lembretesFiltrados])

  const lembretesUrgentesOuVencidos = useMemo(() => {
    return lembretesPendentes.filter(
      (l) => l.prioridade === 'urgente' || isLembreteVencidoOuNoMomento(l),
    )
  }, [lembretesPendentes])

  // Lembretes de hoje
  const lembretesDeHoje = useMemo(() => {
    const hojeStr = getLocalDateStr(new Date())
    return lembretesPendentes.filter((l) => {
      const itemData = l.data_limite ? l.data_limite.slice(0, 10) : ''
      // Se for de hoje ou se for anterior e tiver "repetir_ate_concluir"
      return itemData === hojeStr || (itemData < hojeStr && l.repetir_ate_concluir)
    })
  }, [lembretesPendentes])

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
        {/* CABEÇALHO DO HUB MÓVEL */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-stone-200/80 px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#DF5830] to-[#b83f1d] text-white shadow-sm">
                <Sparkles className="h-5 w-5 fill-white/20" />
              </div>
              <div className="min-w-0">
                <h1 className="text-base font-black tracking-tight leading-none text-stone-900 truncate">
                  GKza Acesso Rápido
                </h1>
                <p className="text-[11px] font-semibold text-stone-500 leading-none mt-1">
                  Sub-app móvel v2
                </p>
              </div>
            </div>

            {/* Atalho para o ERP completo */}
            <Button
              asChild
              variant="ghost"
              size="sm"
              className="h-8 px-2.5 text-xs font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-lg shrink-0"
              title="Abrir ERP no modo completo"
            >
              <Link to="/">Voltar ao ERP</Link>
            </Button>
          </div>

          {/* SELETOR DE CONTEXTO */}
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

        {/* CONTEÚDO DO HUB */}
        <main className="flex-1 px-4 py-5 space-y-5">
          {/* FLASH MESSAGE DE SUCESSO PÓS-CRIAÇÃO/EDIÇÃO */}
          {flashMessage && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 p-3.5 shadow-xs flex items-center justify-between gap-2 animate-in fade-in-50">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
                <p className="text-xs font-bold text-emerald-950 truncate">{flashMessage}</p>
              </div>
              <button
                type="button"
                onClick={() => setFlashMessage(null)}
                className="text-emerald-700 hover:text-emerald-950 text-xs font-black p-1"
              >
                ✕
              </button>
            </div>
          )}

          {/* BANNER NOTIFICAÇÃO PWA SE NÃO PERMITIDA */}
          {permission === 'default' && !dismissNotificationBanner && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-3.5 shadow-xs animate-in fade-in-50">
              <div className="flex items-start gap-2.5">
                <BellRing className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-bold text-amber-950">Ativar avisos de lembretes?</p>
                  <p className="text-[11px] text-amber-800/90 mt-0.5 leading-relaxed">
                    Receba notificações pontuais no celular quando uma tarefa rápida atingir o
                    horário limite.
                  </p>
                  <div className="mt-2.5 flex items-center gap-2">
                    <Button
                      size="sm"
                      onClick={handlePermitirNotificacoes}
                      className="h-7 px-2.5 text-xs font-extrabold bg-amber-600 hover:bg-amber-700 text-white shadow-2xs rounded-lg"
                    >
                      Permitir avisos
                    </Button>
                    <button
                      type="button"
                      onClick={() => setDismissNotificationBanner(true)}
                      className="text-[11px] font-semibold text-amber-800/80 hover:text-amber-950 px-2 py-1"
                    >
                      Depois
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* FRASE DE BOAS-VINDAS / INTENÇÃO */}
          <div>
            <h2 className="text-lg font-black tracking-tight text-stone-900">
              O que você precisa registrar agora?
            </h2>
            <p className="text-xs text-stone-500 font-medium mt-0.5">
              Escolha uma captura ultra-rápida de um toque:
            </p>
          </div>

          {/* OS DOIS BOTÕES GRANDES DE ACESSO RÁPIDO */}
          <div className="grid grid-cols-1 gap-3.5">
            {/* BOTÃO 1: DESPESA RÁPIDA */}
            <Link
              to="/despesa-rapida"
              className="group relative overflow-hidden rounded-2xl border-2 border-orange-200 bg-gradient-to-br from-white via-orange-50/40 to-orange-100/30 p-4 shadow-sm hover:border-[#DF5830] hover:shadow-md transition active:scale-[0.99] flex items-center justify-between"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#DF5830] to-[#b83f1d] text-white shadow-md shadow-orange-500/20 group-hover:scale-105 transition">
                  <Zap className="h-7 w-7 fill-white" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-stone-900 group-hover:text-[#DF5830] transition">
                      💵 Despesa Rápida
                    </h3>
                  </div>
                  <p className="text-xs text-stone-500 font-medium leading-snug mt-0.5">
                    Gasto na rua, comprovante ou foto direto para a Triagem
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-stone-400 group-hover:text-[#DF5830] group-hover:translate-x-0.5 transition shrink-0 ml-2" />
            </Link>

            {/* BOTÃO 2: LEMBRETE RÁPIDO */}
            <Link
              to="/lembrete-rapido"
              className="group relative overflow-hidden rounded-2xl border-2 border-stone-200 bg-gradient-to-br from-white via-stone-50/60 to-stone-100/40 p-4 shadow-sm hover:border-[#DF5830] hover:shadow-md transition active:scale-[0.99] flex items-center justify-between"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-stone-800 to-stone-900 text-white shadow-md shadow-stone-800/20 group-hover:scale-105 transition">
                  <Clock className="h-7 w-7 fill-white/20" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-black text-stone-900 group-hover:text-[#DF5830] transition">
                      ⏰ Lembrete Rápido
                    </h3>
                    {lembretesUrgentesOuVencidos.length > 0 && (
                      <Badge className="h-4 px-1.5 text-[9px] font-black bg-red-600 text-white rounded">
                        {lembretesUrgentesOuVencidos.length} urgente(s)
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-stone-500 font-medium leading-snug mt-0.5">
                    Tarefa rápida para o dia que o sistema lembra até você fazer
                  </p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-stone-400 group-hover:text-[#DF5830] group-hover:translate-x-0.5 transition shrink-0 ml-2" />
            </Link>
          </div>

          {/* RESUMO DE HOJE (PILARES CLICÁVEIS) */}
          <div className="space-y-2.5 pt-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-stone-400">
                Resumo do Dia · {contextoLabel}
              </span>
              <button
                type="button"
                onClick={loadHubData}
                disabled={loading}
                className="text-[11px] font-bold text-stone-500 hover:text-stone-800 inline-flex items-center gap-1"
              >
                <RefreshCw className={`h-3 w-3 ${loading ? 'animate-spin' : ''}`} />
                Atualizar
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Card 1: Lembretes pendentes hoje */}
              <Link
                to="/lembrete-rapido"
                className="rounded-2xl border border-stone-200/90 bg-stone-50/70 p-3.5 hover:bg-stone-100/80 transition flex flex-col justify-between shadow-2xs group"
              >
                <div className="flex items-center justify-between">
                  <Clock className="h-4 w-4 text-[#DF5830]" />
                  <span className="text-lg font-black text-stone-900 group-hover:text-[#DF5830] transition">
                    {lembretesDeHoje.length}
                  </span>
                </div>
                <div className="mt-2">
                  <p className="text-xs font-bold text-stone-800">Lembretes para hoje</p>
                  <p className="text-[10px] text-stone-500">
                    {lembretesPendentes.length} pendentes no total
                  </p>
                </div>
              </Link>

              {/* Card 2: Pendências de Triagem PWA */}
              <Link
                to="/despesa-rapida"
                className="rounded-2xl border border-stone-200/90 bg-stone-50/70 p-3.5 hover:bg-stone-100/80 transition flex flex-col justify-between shadow-2xs group"
              >
                <div className="flex items-center justify-between">
                  <Inbox className="h-4 w-4 text-orange-600" />
                  <span className="text-lg font-black text-stone-900 group-hover:text-[#DF5830] transition">
                    {pendentesPwaHoje.length}
                  </span>
                </div>
                <div className="mt-2">
                  <p className="text-xs font-bold text-stone-800">Triagem do PWA</p>
                  <p className="text-[10px] text-stone-500">Despesas aguardando</p>
                </div>
              </Link>
            </div>

            {/* Prévia dos próximos lembretes se houver */}
            {lembretesPendentes.length > 0 && (
              <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-stone-800 flex items-center gap-1.5">
                    <Calendar className="h-3.5 w-3.5 text-stone-400" />
                    Próximos lembretes:
                  </span>
                  <Link
                    to="/lembrete-rapido"
                    className="text-[11px] font-bold text-[#DF5830] hover:underline"
                  >
                    Ver todos ({lembretesPendentes.length})
                  </Link>
                </div>
                <div className="space-y-1.5">
                  {lembretesPendentes.slice(0, 3).map((item) => {
                    const vencido = isLembreteVencidoOuNoMomento(item)
                    return (
                      <div
                        key={item.id}
                        className="flex items-center justify-between p-2 rounded-xl bg-stone-50 hover:bg-stone-100 transition text-xs gap-2"
                      >
                        <Link to="/lembrete-rapido" className="min-w-0 flex-1 truncate pr-1">
                          <span className="font-bold text-stone-900 truncate block">
                            {item.titulo}
                          </span>
                          <span className="text-[10px] text-stone-500 flex items-center gap-1">
                            {item.hora_limite ? `às ${item.hora_limite}` : 'ao longo do dia'}
                            {item.prioridade === 'urgente' && ' • URGENTE'}
                          </span>
                        </Link>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {vencido ? (
                            <Badge
                              variant="outline"
                              className="text-[9px] font-bold border-orange-400 text-orange-700 bg-orange-100/50 shrink-0"
                            >
                              Agora
                            </Badge>
                          ) : (
                            <span className="text-[10px] font-semibold text-stone-400 shrink-0">
                              Pendente
                            </span>
                          )}
                          <Button
                            asChild
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-[11px] font-bold text-stone-600 hover:text-[#DF5830] hover:bg-orange-50 rounded-lg"
                            title="Editar este lembrete"
                          >
                            <Link to={`/lembrete-rapido?editar=${item.id}`}>
                              <Pencil className="mr-1 h-3 w-3" />
                              Editar
                            </Link>
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>
        </main>

        {/* RODAPÉ DO HUB */}
        <footer className="border-t border-stone-200/80 bg-stone-50/80 px-4 py-3 text-center">
          <p className="text-[11px] font-medium text-stone-500">
            ERP GKza • Sub-app móvel instalado via PWA
          </p>
          <div className="mt-1 flex items-center justify-center gap-3 text-xs font-bold text-[#DF5830]">
            <Link to="/agenda" className="hover:underline">
              Agenda Completa
            </Link>
            <span>•</span>
            <Link to="/pendentes" className="hover:underline">
              Triagem Financeira
            </Link>
          </div>
        </footer>
      </div>
    </div>
  )
}
