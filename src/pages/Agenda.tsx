import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  RotateCcw,
  Trash2,
  Edit2,
  CalendarRange,
  Repeat,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Switch } from '@/components/ui/switch'
import { ContextBadge } from '@/components/ContextBadge'
import { EventoDialog } from '@/components/agenda/EventoDialog'
import { agendaService } from '@/services/agenda'
import { googleCalendarService } from '@/services/googleCalendar'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { can } from '@/lib/permissions'
import { useToast } from '@/hooks/use-toast'
import { getLocalDateStr } from '@/lib/format'
import type { AgendaEvento } from '@/types/domain'

type ViewMode = 'mes' | 'semana' | 'dia' | 'lista'

export default function Agenda() {
  const { matchesContext, activeContext } = useAppContext()
  const { user } = useAuth()
  const { toast } = useToast()

  const [eventos, setEventos] = useState<AgendaEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('mes')
  const [currentDate, setCurrentDate] = useState(() => new Date())
  const [exibirPessoaisGoogle, setExibirPessoaisGoogle] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingEvento, setEditingEvento] = useState<AgendaEvento | null>(null)
  const [syncingGoogle, setSyncingGoogle] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const list = await agendaService.listEventos()
      setEventos(list)
    } catch (err) {
      console.warn('Erro ao carregar eventos da agenda:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Sincronizar manualmente com Google Calendar
  const handleSyncGoogle = async () => {
    setSyncingGoogle(true)
    try {
      const status = await googleCalendarService.getStatus()
      if (!status.is_connected) {
        toast({
          title: 'Google Calendar não conectado',
          description:
            'Conecte sua conta em Configurações → Google Calendar → Conectar com Google Calendar.',
        })
        return
      }

      const res = await googleCalendarService.syncNow()
      toast({
        title: 'Sincronização Google concluída!',
        description: `${res.imported} importados, ${res.exported} exportados.`,
      })
      loadData()
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tente novamente.'
      if (message.includes('não conectada')) {
        toast({
          title: 'Google Calendar não conectado',
          description:
            'Conecte sua conta em Configurações → Google Calendar → Conectar com Google Calendar.',
        })
      } else {
        toast({
          title: 'Sincronização pendente',
          description: message.includes('Credenciais')
            ? 'Credenciais OAuth do Google Calendar ainda não cadastradas.'
            : message,
          variant: 'destructive',
        })
      }
    } finally {
      setSyncingGoogle(false)
    }
  }

  // Determina se o contexto ativo é puramente empresarial (só empresas, sem pessoas)
  const isContextoEmpresarial = useMemo(() => {
    return !activeContext.isAll && activeContext.hasEmpresas && !activeContext.hasPessoas
  }, [activeContext])

  // Filtragem pelo contexto de visualização ativo
  // Eventos do Google e compromissos gerais (sem pessoa e sem empresa) são tratados como eventos globais do usuário.
  // Em contextos puramente empresariais, eles aparecem por padrão e podem ser alternados pelo toggle.
  const filteredEventos = useMemo(() => {
    return eventos.filter((ev) => {
      const isGoogle = ev.origem === 'google'
      const isGeral = !ev.pessoa && !ev.empresa

      // Se for contexto puramente empresarial e for evento Google ou geral
      if (isContextoEmpresarial && (isGoogle || isGeral)) {
        return exibirPessoaisGoogle
      }

      // Se não for contexto empresarial puramente restrito, Google e gerais aparecem sempre
      if (isGoogle || isGeral) {
        return true
      }

      // Regra padrão de contexto por pessoa/empresa/contexto_tipo
      return matchesContext({
        contexto_tipo: ev.contexto_tipo,
        pessoa: ev.pessoa,
        empresa: ev.empresa,
      })
    })
  }, [eventos, matchesContext, isContextoEmpresarial, exibirPessoaisGoogle])

  const handleDelete = async (id: string) => {
    if (!can(user?.role, 'deleteFinance')) {
      toast({ title: 'Acesso negado', variant: 'destructive' })
      return
    }
    if (!confirm('Deseja realmente cancelar/excluir este compromisso?')) return

    try {
      await agendaService.deleteEvento(id)
      setEventos((prev) => prev.filter((e) => e.id !== id))
      toast({ title: 'Compromisso removido.' })
    } catch {
      toast({ title: 'Erro ao remover compromisso', variant: 'destructive' })
    }
  }

  // Navegação de datas conforme a visualização
  const handlePrev = () => {
    const d = new Date(currentDate)
    if (viewMode === 'mes') d.setMonth(d.getMonth() - 1)
    else if (viewMode === 'semana') d.setDate(d.getDate() - 7)
    else d.setDate(d.getDate() - 1)
    setCurrentDate(d)
  }

  const handleNext = () => {
    const d = new Date(currentDate)
    if (viewMode === 'mes') d.setMonth(d.getMonth() + 1)
    else if (viewMode === 'semana') d.setDate(d.getDate() + 7)
    else d.setDate(d.getDate() + 1)
    setCurrentDate(d)
  }

  const handleToday = () => {
    setCurrentDate(new Date())
  }

  // Formata o título da data baseado na view
  const headerDateLabel = useMemo(() => {
    if (viewMode === 'mes') {
      return currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
    }
    if (viewMode === 'semana') {
      // Início e fim da semana (Domingo a Sábado)
      const start = new Date(currentDate)
      start.setDate(currentDate.getDate() - currentDate.getDay())
      const end = new Date(start)
      end.setDate(start.getDate() + 6)
      return `${start.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} - ${end.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`
    }
    if (viewMode === 'dia') {
      return currentDate.toLocaleDateString('pt-BR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    }
    return 'Próximos Compromissos'
  }, [currentDate, viewMode])

  // Helpers para manipulação consistente de datas 'YYYY-MM-DD' (fuso America/Sao_Paulo)
  const addDaysToStr = useCallback((dateStr: string, days: number): string => {
    const [y, m, d] = dateStr.split('-').map(Number)
    const dt = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0))
    return getLocalDateStr(dt)
  }, [])

  const getDayNumberFromStr = useCallback((dateStr: string): number => {
    return parseInt(dateStr.slice(8, 10), 10)
  }, [])

  // --- VISUALIZAÇÃO EM MÊS ---
  // Padronizado com getLocalDateStr (America/Sao_Paulo) para sincronizar com os eventosPorDia
  const daysInMonth = useMemo(() => {
    const currStr = getLocalDateStr(currentDate)
    const currYear = parseInt(currStr.slice(0, 4), 10)
    const currMonth = parseInt(currStr.slice(5, 7), 10)

    // Primeiro dia do mês corrente às 12h UTC para navegação estável
    const firstOfMonthUtc = new Date(Date.UTC(currYear, currMonth - 1, 1, 12, 0, 0))
    const firstDayIndex = firstOfMonthUtc.getUTCDay() // 0 = Dom ... 6 = Sáb

    // Data de início da grade: voltar firstDayIndex dias a partir do dia 1
    const startDateUtc = new Date(Date.UTC(currYear, currMonth - 1, 1 - firstDayIndex, 12, 0, 0))

    const days: { dateStr: string; dayNumber: number; inMonth: boolean }[] = []
    for (let i = 0; i < 42; i++) {
      const cellDateUtc = new Date(
        Date.UTC(
          startDateUtc.getUTCFullYear(),
          startDateUtc.getUTCMonth(),
          startDateUtc.getUTCDate() + i,
          12,
          0,
          0,
        ),
      )
      const dateStr = getLocalDateStr(cellDateUtc)
      const cellMonth = parseInt(dateStr.slice(5, 7), 10)
      const inMonth = cellMonth === currMonth
      const dayNumber = getDayNumberFromStr(dateStr)

      days.push({
        dateStr,
        dayNumber,
        inMonth,
      })
    }

    // Se a última semana inteira (índices 35..41) pertencer ao próximo mês, podemos manter 35 ou 42.
    // Reduz para 35 se a 6ª linha for totalmente fora do mês
    const lastRowAllOutside = days.slice(35).every((d) => !d.inMonth)
    return lastRowAllOutside ? days.slice(0, 35) : days
  }, [currentDate, getDayNumberFromStr])

  // --- VISUALIZAÇÃO EM SEMANA ---
  // Padronizado com getLocalDateStr (America/Sao_Paulo)
  const weekDays = useMemo(() => {
    const currStr = getLocalDateStr(currentDate)
    const [y, m, d] = currStr.split('-').map(Number)
    const currUtc = new Date(Date.UTC(y, m - 1, d, 12, 0, 0))
    const dayOfWeek = currUtc.getUTCDay() // 0 = Dom ... 6 = Sáb
    const startUtc = new Date(Date.UTC(y, m - 1, d - dayOfWeek, 12, 0, 0))

    const dayNames = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

    return Array.from({ length: 7 }, (_, i) => {
      const cellUtc = new Date(
        Date.UTC(
          startUtc.getUTCFullYear(),
          startUtc.getUTCMonth(),
          startUtc.getUTCDate() + i,
          12,
          0,
          0,
        ),
      )
      const dateStr = getLocalDateStr(cellUtc)
      return {
        date: cellUtc,
        dateStr,
        dayNumber: getDayNumberFromStr(dateStr),
        dayName: dayNames[i],
      }
    })
  }, [currentDate, getDayNumberFromStr])

  // Intervalo visível atual para projeção de recorrências
  const visibleRange = useMemo(() => {
    if (viewMode === 'mes') {
      if (daysInMonth.length === 0) {
        const t = getLocalDateStr(currentDate)
        return { startStr: t, endStr: t }
      }
      return {
        startStr: daysInMonth[0].dateStr,
        endStr: daysInMonth[daysInMonth.length - 1].dateStr,
      }
    }
    if (viewMode === 'semana') {
      if (weekDays.length === 0) {
        const t = getLocalDateStr(currentDate)
        return { startStr: t, endStr: t }
      }
      return {
        startStr: weekDays[0].dateStr,
        endStr: weekDays[6].dateStr,
      }
    }
    if (viewMode === 'dia') {
      const d = getLocalDateStr(currentDate)
      return { startStr: d, endStr: d }
    }
    // Para modo lista: projeta no horizonte dos próximos 90 dias a partir da data de referência
    const startStr = getLocalDateStr(currentDate)
    const endStr = addDaysToStr(startStr, 90)
    return { startStr, endStr }
  }, [viewMode, daysInMonth, weekDays, currentDate, addDaysToStr])

  // Mapeia eventos projetados por dia YYYY-MM-DD respeitando o fuso America/Sao_Paulo
  // Suporta projeção de eventos com recorrência ('diaria', 'semanal', 'mensal', 'anual')
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, AgendaEvento[]>()
    const { startStr, endStr } = visibleRange

    filteredEventos.forEach((ev) => {
      if (!ev.data_inicio || ev.status === 'cancelado') return

      const baseStartStr =
        ev.data_inicio.includes('T') || ev.data_inicio.includes(' ')
          ? getLocalDateStr(new Date(ev.data_inicio))
          : ev.data_inicio.slice(0, 10)

      // Time original para reconstruir data_inicio em instâncias projetadas
      let timeSuffix = 'T09:00:00.000Z'
      if (ev.data_inicio.includes('T')) {
        timeSuffix = 'T' + ev.data_inicio.split('T')[1]
      } else if (ev.data_inicio.includes(' ')) {
        timeSuffix = 'T' + ev.data_inicio.split(' ')[1]
      }

      const rec = ev.recorrencia && ev.recorrencia !== 'nenhuma' ? ev.recorrencia : null

      if (!rec) {
        // Evento pontual simples
        const current = map.get(baseStartStr) || []
        current.push(ev)
        map.set(baseStartStr, current)
        return
      }

      // Evento com recorrência: projetar ocorrências no intervalo [startStr, endStr]
      // Não projeta antes da data de início original
      const maxRangeEnd = endStr
      if (baseStartStr > maxRangeEnd) return

      // Parse da data base
      const [bY, bM, bD] = baseStartStr.split('-').map(Number)
      const [sY, sM, sD] = startStr.split('-').map(Number)
      const [eY, eM, eD] = maxRangeEnd.split('-').map(Number)

      const baseDateUtc = new Date(Date.UTC(bY, bM - 1, bD, 12, 0, 0))
      const rangeStartUtc = new Date(Date.UTC(sY, sM - 1, sD, 12, 0, 0))
      const rangeEndUtc = new Date(Date.UTC(eY, eM - 1, eD, 12, 0, 0))

      const addInstance = (targetDateStr: string) => {
        const isOccurrenceOriginal = targetDateStr === baseStartStr
        const instance: AgendaEvento = isOccurrenceOriginal
          ? ev
          : {
              ...ev,
              id: `${ev.id}_${targetDateStr}`,
              data_inicio: `${targetDateStr}${timeSuffix}`,
              data_fim: ev.data_fim ? `${targetDateStr}${timeSuffix}` : undefined,
            }
        const current = map.get(targetDateStr) || []
        current.push(instance)
        map.set(targetDateStr, current)
      }

      if (rec === 'diaria') {
        const cur = new Date(baseDateUtc < rangeStartUtc ? rangeStartUtc : baseDateUtc)
        while (cur <= rangeEndUtc) {
          const dStr = getLocalDateStr(cur)
          if (dStr >= baseStartStr) {
            addInstance(dStr)
          }
          cur.setUTCDate(cur.getUTCDate() + 1)
        }
      } else if (rec === 'semanal') {
        // Alinhamento de semanas: calcular distância em dias desde baseDateUtc
        const diffDays = Math.floor((rangeStartUtc.getTime() - baseDateUtc.getTime()) / 86400000)
        let stepMultiplier = 0
        if (diffDays > 0) {
          stepMultiplier = Math.floor(diffDays / 7)
        }
        const cur = new Date(Date.UTC(bY, bM - 1, bD + stepMultiplier * 7, 12, 0, 0))
        while (cur < rangeStartUtc) {
          cur.setUTCDate(cur.getUTCDate() + 7)
        }
        while (cur <= rangeEndUtc) {
          const dStr = getLocalDateStr(cur)
          if (dStr >= baseStartStr) {
            addInstance(dStr)
          }
          cur.setUTCDate(cur.getUTCDate() + 7)
        }
      } else if (rec === 'mensal') {
        let curYear = bY
        let curMonth = bM // 1..12
        let curUtc = new Date(Date.UTC(curYear, curMonth - 1, bD, 12, 0, 0))

        // Avançar se estiver antes do início do intervalo visível
        while (curUtc < rangeStartUtc) {
          curMonth++
          if (curMonth > 12) {
            curMonth = 1
            curYear++
          }
          curUtc = new Date(Date.UTC(curYear, curMonth - 1, bD, 12, 0, 0))
        }

        while (curUtc <= rangeEndUtc) {
          const dStr = getLocalDateStr(curUtc)
          if (dStr >= baseStartStr) {
            addInstance(dStr)
          }
          curMonth++
          if (curMonth > 12) {
            curMonth = 1
            curYear++
          }
          curUtc = new Date(Date.UTC(curYear, curMonth - 1, bD, 12, 0, 0))
        }
      } else if (rec === 'anual') {
        let curYear = bY
        let curUtc = new Date(Date.UTC(curYear, bM - 1, bD, 12, 0, 0))

        while (curUtc < rangeStartUtc) {
          curYear++
          curUtc = new Date(Date.UTC(curYear, bM - 1, bD, 12, 0, 0))
        }

        while (curUtc <= rangeEndUtc) {
          const dStr = getLocalDateStr(curUtc)
          if (dStr >= baseStartStr) {
            addInstance(dStr)
          }
          curYear++
          curUtc = new Date(Date.UTC(curYear, bM - 1, bD, 12, 0, 0))
        }
      }
    })

    return map
  }, [filteredEventos, visibleRange])

  // Lista plana de eventos para a view 'lista', já considerando ocorrências projetadas e ordenadas
  const eventosLista = useMemo(() => {
    const list: AgendaEvento[] = []
    const dates = Array.from(eventosPorDia.keys()).sort()
    dates.forEach((dStr) => {
      const items = eventosPorDia.get(dStr) || []
      list.push(...items)
    })
    return list
  }, [eventosPorDia])

  const todayStr = getLocalDateStr()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Agenda de Compromissos"
        description="Reuniões, consultas e compromissos com sincronização Google Calendar e isolamento por contexto."
      >
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSyncGoogle}
            disabled={syncingGoogle}
            className="text-xs gap-1.5"
            title="Sincronizar com Google Calendar"
          >
            <RotateCcw className={`h-3.5 w-3.5 ${syncingGoogle ? 'animate-spin' : ''}`} />
            Sincronizar Google
          </Button>

          {can(user?.role, 'writeFinance') && (
            <Button
              onClick={() => {
                setEditingEvento(null)
                setDialogOpen(true)
              }}
              className="bg-primary hover:bg-primary/90 text-white gap-2"
            >
              <Plus className="h-4 w-4" />
              Novo Compromisso
            </Button>
          )}
        </div>
      </PageHeader>

      {/* BANNER / TOGGLE DE COMPROMISSOS PESSOAIS E GOOGLE EM CONTEXTO EMPRESARIAL */}
      {isContextoEmpresarial && (
        <div className="flex items-center justify-between bg-blue-50/70 border border-blue-200/80 rounded-xl px-4 py-2.5 text-xs text-blue-900">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-blue-950">Contexto PJ ativo:</span>
            <span>Exibir compromissos pessoais e Google Calendar</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-blue-800">
              {exibirPessoaisGoogle ? 'Visíveis' : 'Ocultos'}
            </span>
            <Switch
              checked={exibirPessoaisGoogle}
              onCheckedChange={setExibirPessoaisGoogle}
              aria-label="Exibir compromissos pessoais/Google"
            />
          </div>
        </div>
      )}

      {/* CONTROLES DA AGENDA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-border">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={handleToday} className="text-xs h-8">
            Hoje
          </Button>
          <div className="flex items-center">
            <Button variant="ghost" size="icon" onClick={handlePrev} className="h-8 w-8">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={handleNext} className="h-8 w-8">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
          <span className="text-sm font-semibold capitalize min-w-[170px]">{headerDateLabel}</span>
        </div>

        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as ViewMode)}>
          <TabsList className="h-8">
            <TabsTrigger value="mes" className="text-xs h-7 px-2.5">
              Mês
            </TabsTrigger>
            <TabsTrigger value="semana" className="text-xs h-7 px-2.5">
              Semana
            </TabsTrigger>
            <TabsTrigger value="dia" className="text-xs h-7 px-2.5">
              Dia
            </TabsTrigger>
            <TabsTrigger value="lista" className="text-xs h-7 px-2.5">
              Lista
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* RENDERIZAÇÃO CONFORME A VIEW ESCOLHIDA */}
      {loading ? (
        <div className="py-12 text-center text-sm text-muted-foreground">
          Carregando compromissos da agenda...
        </div>
      ) : (
        <>
          {/* 1. MÊS */}
          {viewMode === 'mes' && (
            <Card className="border-border/60 overflow-hidden">
              <CardContent className="p-0">
                <div className="grid grid-cols-7 border-b border-border bg-muted/30 text-center text-xs font-semibold py-2 text-muted-foreground">
                  <div>Dom</div>
                  <div>Seg</div>
                  <div>Ter</div>
                  <div>Qua</div>
                  <div>Qui</div>
                  <div>Sex</div>
                  <div>Sáb</div>
                </div>

                <div className="grid grid-cols-7 border-collapse">
                  {daysInMonth.map((d, index) => {
                    const isHoje = d.dateStr === todayStr
                    const evList = eventosPorDia.get(d.dateStr) || []

                    return (
                      <div
                        key={index}
                        className={`min-h-[95px] p-1.5 border-b border-r border-border/50 transition-colors flex flex-col justify-between ${
                          !d.inMonth ? 'bg-muted/10 opacity-50' : 'bg-card'
                        } ${isHoje ? 'bg-primary/5' : ''}`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span
                            className={`text-xs font-semibold h-5 w-5 rounded-full flex items-center justify-center ${
                              isHoje ? 'bg-primary text-white' : 'text-foreground'
                            }`}
                          >
                            {d.dayNumber}
                          </span>
                          {evList.length > 0 && (
                            <span className="text-[10px] text-muted-foreground font-medium">
                              {evList.length}
                            </span>
                          )}
                        </div>

                        <div className="space-y-1 flex-1 overflow-y-auto max-h-[80px]">
                          {evList.slice(0, 3).map((ev) => {
                            const origId = ev.id.includes('_') ? ev.id.split('_')[0] : ev.id
                            const baseEvent = eventos.find((e) => e.id === origId) || ev
                            return (
                              <button
                                key={ev.id}
                                type="button"
                                onClick={() => {
                                  setEditingEvento(baseEvent)
                                  setDialogOpen(true)
                                }}
                                className="w-full text-left truncate text-[11px] px-1.5 py-0.5 rounded font-medium transition-opacity hover:opacity-80 flex items-center gap-1"
                                style={{
                                  backgroundColor: `${ev.cor || (ev.origem === 'google' ? '#2563EB' : '#DF5830')}15`,
                                  borderLeft: `3px solid ${ev.cor || (ev.origem === 'google' ? '#2563EB' : '#DF5830')}`,
                                  color: ev.cor || (ev.origem === 'google' ? '#1D4ED8' : '#DF5830'),
                                }}
                                title={`${ev.origem === 'google' ? '[Google Calendar] ' : ''}${ev.titulo}${ev.local ? ' - ' + ev.local : ''}`}
                              >
                                {ev.origem === 'google' && (
                                  <span className="inline-flex items-center text-[9px] font-bold px-1 rounded bg-blue-100 text-blue-700 shrink-0">
                                    G
                                  </span>
                                )}
                                <span className="truncate">{ev.titulo}</span>
                              </button>
                            )
                          })}
                          {evList.length > 3 && (
                            <span className="text-[10px] text-muted-foreground block text-center">
                              +{evList.length - 3} mais
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 2. SEMANA */}
          {viewMode === 'semana' && (
            <Card className="border-border/60">
              <CardContent className="p-0">
                <div className="grid grid-cols-7 border-b border-border bg-muted/20">
                  {weekDays.map((wd) => {
                    const isHoje = wd.dateStr === todayStr
                    return (
                      <div
                        key={wd.dateStr}
                        className={`p-3 text-center border-r border-border/50 ${
                          isHoje ? 'bg-primary/10' : ''
                        }`}
                      >
                        <span className="block text-xs text-muted-foreground uppercase">
                          {wd.dayName}
                        </span>
                        <span
                          className={`inline-block mt-0.5 text-base font-bold h-7 w-7 rounded-full leading-7 ${
                            isHoje ? 'bg-primary text-white' : 'text-foreground'
                          }`}
                        >
                          {wd.dayNumber}
                        </span>
                      </div>
                    )
                  })}
                </div>

                <div className="grid grid-cols-7 min-h-[350px]">
                  {weekDays.map((wd) => {
                    const evList = eventosPorDia.get(wd.dateStr) || []
                    return (
                      <div
                        key={wd.dateStr}
                        className="p-2 border-r border-border/50 space-y-2 flex flex-col"
                      >
                        {evList.map((ev) => {
                          const dIni = new Date(ev.data_inicio)
                          const timeStr = ev.dia_inteiro
                            ? 'Dia todo'
                            : `${String(dIni.getHours()).padStart(2, '0')}:${String(dIni.getMinutes()).padStart(2, '0')}`

                          return (
                            <div
                              key={ev.id}
                              onClick={() => {
                                const origId = ev.id.includes('_') ? ev.id.split('_')[0] : ev.id
                                const baseEvent = eventos.find((e) => e.id === origId) || ev
                                setEditingEvento(baseEvent)
                                setDialogOpen(true)
                              }}
                              className="p-2 rounded-lg border border-border bg-white text-xs cursor-pointer hover:shadow-xs transition-shadow space-y-1"
                              style={{ borderLeft: `3px solid ${ev.cor || '#DF5830'}` }}
                            >
                              <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {timeStr}
                                {ev.recorrencia && ev.recorrencia !== 'nenhuma' && (
                                  <span
                                    title={`Recorrência: ${ev.recorrencia}`}
                                    className="inline-flex items-center"
                                  >
                                    <Repeat className="h-2.5 w-2.5 ml-0.5 text-muted-foreground" />
                                  </span>
                                )}
                              </span>
                              <h5 className="font-semibold text-foreground line-clamp-2">
                                {ev.titulo}
                              </h5>
                              <div className="flex flex-wrap items-center gap-1.5">
                                <ContextBadge
                                  tipo={ev.contexto_tipo}
                                  pessoa={ev.expand?.pessoa}
                                  empresa={ev.expand?.empresa}
                                />
                                {ev.origem === 'google' && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-blue-50/80 text-blue-700 border-blue-200 py-0 px-1.5 flex items-center gap-1"
                                  >
                                    <span className="font-bold text-[9px] bg-blue-600 text-white rounded px-0.5 leading-none">
                                      G
                                    </span>
                                    Google
                                  </Badge>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 3. DIA */}
          {viewMode === 'dia' && (
            <Card className="border-border/60">
              <CardContent className="p-6 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-border">
                  <h3 className="font-semibold text-foreground">
                    Compromissos do Dia ({headerDateLabel})
                  </h3>
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingEvento(null)
                      setDialogOpen(true)
                    }}
                    className="h-8 text-xs bg-primary hover:bg-primary/90 text-white"
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Adicionar no Dia
                  </Button>
                </div>

                {(() => {
                  const dStr = getLocalDateStr(currentDate)
                  const list = eventosPorDia.get(dStr) || []
                  if (list.length === 0) {
                    return (
                      <div className="text-center py-12 text-sm text-muted-foreground">
                        Nenhum compromisso marcado para este dia.
                      </div>
                    )
                  }

                  return (
                    <div className="divide-y divide-border">
                      {list.map((ev) => {
                        const dIni = new Date(ev.data_inicio)
                        const hora = ev.dia_inteiro
                          ? 'Dia todo'
                          : `${String(dIni.getHours()).padStart(2, '0')}:${String(dIni.getMinutes()).padStart(2, '0')}`

                        return (
                          <div
                            key={ev.id}
                            className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className="h-10 w-10 rounded-lg grid place-items-center font-bold text-xs shrink-0"
                                style={{
                                  backgroundColor: `${ev.cor || '#DF5830'}20`,
                                  color: ev.cor || '#DF5830',
                                }}
                              >
                                <Clock className="h-4 w-4" />
                              </div>
                              <div>
                                <div className="flex items-center gap-2">
                                  <h4 className="font-bold text-foreground text-sm">{ev.titulo}</h4>
                                  <ContextBadge
                                    tipo={ev.contexto_tipo}
                                    pessoa={ev.expand?.pessoa}
                                    empresa={ev.expand?.empresa}
                                  />
                                  {ev.origem === 'google' && (
                                    <Badge
                                      variant="outline"
                                      className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1"
                                    >
                                      <span className="font-bold text-[9px] bg-blue-600 text-white rounded px-1 leading-none">
                                        G
                                      </span>
                                      Google Calendar
                                    </Badge>
                                  )}
                                  {ev.recorrencia && ev.recorrencia !== 'nenhuma' && (
                                    <Badge variant="secondary" className="text-[10px] capitalize">
                                      {ev.recorrencia}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span>{hora}</span>
                                  {ev.local && (
                                    <span className="flex items-center gap-1">
                                      <MapPin className="h-3 w-3" />
                                      {ev.local}
                                    </span>
                                  )}
                                </div>
                                {ev.descricao && (
                                  <p className="text-xs text-muted-foreground mt-1">
                                    {ev.descricao}
                                  </p>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-end sm:self-center">
                              {can(user?.role, 'writeFinance') && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                  onClick={() => {
                                    const origId = ev.id.includes('_') ? ev.id.split('_')[0] : ev.id
                                    const baseEvent = eventos.find((e) => e.id === origId) || ev
                                    setEditingEvento(baseEvent)
                                    setDialogOpen(true)
                                  }}
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              )}
                              {can(user?.role, 'deleteFinance') && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                  onClick={() => {
                                    const origId = ev.id.includes('_') ? ev.id.split('_')[0] : ev.id
                                    handleDelete(origId)
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )
                })()}
              </CardContent>
            </Card>
          )}

          {/* 4. LISTA DOS PRÓXIMOS COMPROMISSOS */}
          {viewMode === 'lista' && (
            <Card className="border-border/60">
              <CardContent className="p-6">
                {eventosLista.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    Nenhum compromisso cadastrado para o contexto ativo.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {eventosLista.map((ev) => {
                      const dIni = new Date(ev.data_inicio)
                      const dataFormatada = dIni.toLocaleDateString('pt-BR', {
                        weekday: 'short',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })
                      const hora = ev.dia_inteiro
                        ? 'Dia todo'
                        : `${String(dIni.getHours()).padStart(2, '0')}:${String(dIni.getMinutes()).padStart(2, '0')}`

                      // Para exclusão/edição, se for ocorrência projetada, extrai o ID original da base
                      const originalId = ev.id.includes('_') ? ev.id.split('_')[0] : ev.id

                      return (
                        <div
                          key={ev.id}
                          className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="h-10 w-10 rounded-lg grid place-items-center font-bold text-xs shrink-0"
                              style={{
                                backgroundColor: `${ev.cor || '#DF5830'}20`,
                                color: ev.cor || '#DF5830',
                              }}
                            >
                              <CalendarRange className="h-4 w-4" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <h4 className="font-bold text-foreground text-sm">{ev.titulo}</h4>
                                <ContextBadge
                                  tipo={ev.contexto_tipo}
                                  pessoa={ev.expand?.pessoa}
                                  empresa={ev.expand?.empresa}
                                />
                                {ev.origem === 'google' && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 flex items-center gap-1"
                                  >
                                    <span className="font-bold text-[9px] bg-blue-600 text-white rounded px-1 leading-none">
                                      G
                                    </span>
                                    Google Calendar
                                  </Badge>
                                )}
                                {ev.recorrencia && ev.recorrencia !== 'nenhuma' && (
                                  <Badge variant="secondary" className="text-[10px] capitalize">
                                    {ev.recorrencia}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span className="font-medium text-foreground">{dataFormatada}</span>
                                <span>às {hora}</span>
                                {ev.local && (
                                  <span className="flex items-center gap-1">
                                    <MapPin className="h-3 w-3" />
                                    {ev.local}
                                  </span>
                                )}
                              </div>
                              {ev.descricao && (
                                <p className="text-xs text-muted-foreground mt-1">{ev.descricao}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            {can(user?.role, 'writeFinance') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  // Abre o registro original para edição
                                  const baseEvent = eventos.find((e) => e.id === originalId) || ev
                                  setEditingEvento(baseEvent)
                                  setDialogOpen(true)
                                }}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            )}
                            {can(user?.role, 'deleteFinance') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(originalId)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      <EventoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        evento={editingEvento}
        onSuccess={loadData}
      />
    </div>
  )
}
