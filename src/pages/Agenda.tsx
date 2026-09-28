import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Clock,
  MapPin,
  Plus,
  RotateCcw,
  Trash2,
  Edit2,
  CalendarRange,
  ListFilter,
  CheckCircle2,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
  const { matchesContext } = useAppContext()
  const { user } = useAuth()
  const { toast } = useToast()

  const [eventos, setEventos] = useState<AgendaEvento[]>([])
  const [loading, setLoading] = useState(true)
  const [viewMode, setViewMode] = useState<ViewMode>('mes')
  const [currentDate, setCurrentDate] = useState(() => new Date())

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

  // Filtragem pelo contexto de visualização ativo
  const filteredEventos = useMemo(() => {
    return eventos.filter((ev) =>
      matchesContext({
        contexto_tipo: ev.contexto_tipo,
        pessoa: ev.pessoa,
        empresa: ev.empresa,
      }),
    )
  }, [eventos, matchesContext])

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

  // --- VISUALIZAÇÃO EM MÊS ---
  const daysInMonth = useMemo(() => {
    const y = currentDate.getFullYear()
    const m = currentDate.getMonth()
    const firstDayIndex = new Date(y, m, 1).getDay() // 0 = Dom
    const lastDate = new Date(y, m + 1, 0).getDate()

    const days: { dateStr: string; dayNumber: number; inMonth: boolean }[] = []

    // Dias do mês anterior
    const prevLastDate = new Date(y, m, 0).getDate()
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dNum = prevLastDate - i
      const prevM = m === 0 ? 12 : m
      const prevY = m === 0 ? y - 1 : y
      days.push({
        dateStr: `${prevY}-${String(prevM).padStart(2, '0')}-${String(dNum).padStart(2, '0')}`,
        dayNumber: dNum,
        inMonth: false,
      })
    }

    // Dias do mês atual
    for (let i = 1; i <= lastDate; i++) {
      days.push({
        dateStr: `${y}-${String(m + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        dayNumber: i,
        inMonth: true,
      })
    }

    // Completar até 35 ou 42 para fechar grade
    const remaining = 42 - days.length
    if (remaining < 7) {
      for (let i = 1; i <= remaining; i++) {
        const nextM = m + 2 > 12 ? 1 : m + 2
        const nextY = m + 2 > 12 ? y + 1 : y
        days.push({
          dateStr: `${nextY}-${String(nextM).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
          dayNumber: i,
          inMonth: false,
        })
      }
    }

    return days
  }, [currentDate])

  // --- VISUALIZAÇÃO EM SEMANA ---
  const weekDays = useMemo(() => {
    const start = new Date(currentDate)
    start.setDate(currentDate.getDate() - currentDate.getDay())
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(start)
      d.setDate(start.getDate() + i)
      return {
        date: d,
        dateStr: getLocalDateStr(d),
        dayNumber: d.getDate(),
        dayName: ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d.getDay()],
      }
    })
  }, [currentDate])

  // Mapeia eventos por dia YYYY-MM-DD respeitando o fuso America/Sao_Paulo
  const eventosPorDia = useMemo(() => {
    const map = new Map<string, AgendaEvento[]>()
    filteredEventos.forEach((ev) => {
      if (!ev.data_inicio) return
      const dStr =
        ev.data_inicio.includes('T') || ev.data_inicio.includes(' ')
          ? getLocalDateStr(new Date(ev.data_inicio))
          : ev.data_inicio.slice(0, 10)
      const current = map.get(dStr) || []
      current.push(ev)
      map.set(dStr, current)
    })
    return map
  }, [filteredEventos])

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
                          {evList.slice(0, 3).map((ev) => (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={() => {
                                setEditingEvento(ev)
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
                          ))}
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
                                setEditingEvento(ev)
                                setDialogOpen(true)
                              }}
                              className="p-2 rounded-lg border border-border bg-white text-xs cursor-pointer hover:shadow-xs transition-shadow space-y-1"
                              style={{ borderLeft: `3px solid ${ev.cor || '#DF5830'}` }}
                            >
                              <span className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {timeStr}
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
                                    className="text-[10px] bg-blue-50/80 text-blue-700 border-blue-200 py-0 px-1.5"
                                  >
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
                                      className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                                    >
                                      Google Calendar
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
                                    setEditingEvento(ev)
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
                                  onClick={() => handleDelete(ev.id)}
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
                {filteredEventos.length === 0 ? (
                  <div className="text-center py-12 text-sm text-muted-foreground">
                    Nenhum compromisso cadastrado para o contexto ativo.
                  </div>
                ) : (
                  <div className="divide-y divide-border">
                    {filteredEventos.map((ev) => {
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
                                    className="text-[10px] bg-blue-50 text-blue-700 border-blue-200"
                                  >
                                    Google Calendar
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
                                  setEditingEvento(ev)
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
                                onClick={() => handleDelete(ev.id)}
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
