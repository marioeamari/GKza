import { useState, useEffect, useMemo, useCallback } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  FolderKanban,
  Plus,
  Sparkles,
  Target,
  ListTodo,
  TrendingUp,
  Building2,
  User,
  ArrowRight,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { ContextBadge } from '@/components/ContextBadge'
import { habitosService } from '@/services/habitos'
import { agendaService } from '@/services/agenda'
import { projetosTarefasService } from '@/services/projetosTarefas'
import { useAppContext } from '@/contexts/AppContext'
import { getLocalDateStr } from '@/lib/format'
import type {
  MetaHabito,
  MetaHabitoRegistro,
  AgendaEvento,
  Projeto,
  Tarefa,
  MetaMeta,
} from '@/types/domain'

export default function MetasAgendaHub() {
  const { matchesContext, activeContext, grupos } = useAppContext()

  const [habitos, setHabitos] = useState<MetaHabito[]>([])
  const [registros, setRegistros] = useState<MetaHabitoRegistro[]>([])
  const [eventos, setEventos] = useState<AgendaEvento[]>([])
  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [metas, setMetas] = useState<MetaMeta[]>([])
  const [loading, setLoading] = useState(true)

  const todayStr = useMemo(() => getLocalDateStr(), [])
  const hojeDayOfWeek = new Date().getDay()

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [habList, regList, evList, projList, tarList, metaList] = await Promise.all([
        habitosService.listHabitos(),
        habitosService.listRegistros({ data: todayStr }),
        agendaService.listEventos(),
        projetosTarefasService.listProjetos(),
        projetosTarefasService.listTarefas(),
        projetosTarefasService.listMetas(),
      ])

      setHabitos(habList)
      setRegistros(regList)
      setEventos(evList)
      setProjetos(projList)
      setTarefas(tarList)
      setMetas(metaList)
    } catch (err) {
      console.warn('Erro ao carregar dados do hub:', err)
    } finally {
      setLoading(false)
    }
  }, [todayStr])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtro de contexto ativo
  const filteredHabitos = useMemo(
    () =>
      habitos.filter((h) =>
        matchesContext({
          contexto_tipo: h.contexto_tipo,
          pessoa: h.pessoa,
          empresa: h.empresa,
        }),
      ),
    [habitos, matchesContext],
  )

  const filteredEventos = useMemo(
    () =>
      eventos.filter((ev) =>
        matchesContext({
          contexto_tipo: ev.contexto_tipo,
          pessoa: ev.pessoa,
          empresa: ev.empresa,
        }),
      ),
    [eventos, matchesContext],
  )

  const filteredProjetos = useMemo(
    () =>
      projetos.filter((p) =>
        matchesContext({
          contexto_tipo: p.contexto_tipo,
          pessoa: p.pessoa,
          empresa: p.empresa,
        }),
      ),
    [projetos, matchesContext],
  )

  const filteredTarefas = useMemo(
    () =>
      tarefas.filter((t) =>
        matchesContext({
          contexto_tipo: t.contexto_tipo,
          pessoa: t.pessoa,
          empresa: t.empresa,
        }),
      ),
    [tarefas, matchesContext],
  )

  const filteredMetas = useMemo(
    () =>
      metas.filter((m) =>
        matchesContext({
          contexto_tipo: m.contexto_tipo,
          pessoa: m.pessoa,
          empresa: m.empresa,
        }),
      ),
    [metas, matchesContext],
  )

  // Mapeia registros de hoje por hábito
  const regMapToday = useMemo(() => {
    const map = new Map<string, MetaHabitoRegistro>()
    registros.forEach((r) => map.set(r.habito, r))
    return map
  }, [registros])

  // Hábitos de hoje pendentes vs cumpridos
  const habitosHoje = useMemo(() => {
    return filteredHabitos.filter((h) => {
      if (!h.ativo) return false
      const dtIni = h.data_inicio ? h.data_inicio.split('T')[0] : ''
      if (dtIni && dtIni > todayStr) return false
      return (h.dias_semana || []).includes(hojeDayOfWeek)
    })
  }, [filteredHabitos, hojeDayOfWeek, todayStr])

  const habitosFeitosHoje = useMemo(() => {
    return habitosHoje.filter((h) => regMapToday.get(h.id)?.status === 'feito')
  }, [habitosHoje, regMapToday])

  // Tarefas para hoje ou atrasadas
  const tarefasHojePendentes = useMemo(() => {
    return filteredTarefas.filter((t) => {
      if (t.etapa === 'concluida') return false
      if (!t.prazo) return true
      const pStr = t.prazo.split('T')[0]
      return pStr <= todayStr
    })
  }, [filteredTarefas, todayStr])

  // Próximos compromissos (próximos 7 dias)
  const proximosEventos = useMemo(() => {
    return filteredEventos
      .filter((ev) => {
        if (ev.status === 'cancelado') return false
        if (!ev.data_inicio) return false
        const dStr =
          ev.data_inicio.includes('T') || ev.data_inicio.includes(' ')
            ? getLocalDateStr(new Date(ev.data_inicio))
            : ev.data_inicio.slice(0, 10)
        return dStr >= todayStr
      })
      .slice(0, 5)
  }, [filteredEventos, todayStr])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Metas, Rotinas & Agenda"
        description="Painel integrado de compromissos, tarefas do dia, hábitos recorrentes, projetos e metas estratégicas."
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" asChild className="text-xs">
            <Link to="/habitos">
              <Sparkles className="h-3.5 w-3.5 mr-1.5 text-primary" />
              Hábitos & Rotinas
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild className="text-xs">
            <Link to="/agenda">
              <CalendarDays className="h-3.5 w-3.5 mr-1.5 text-primary" />
              Ver Agenda
            </Link>
          </Button>
          <Button size="sm" asChild className="text-xs bg-primary hover:bg-primary/90 text-white">
            <Link to="/projetos">
              <ListTodo className="h-3.5 w-3.5 mr-1.5" />
              Quadro de Tarefas
            </Link>
          </Button>
        </div>
      </PageHeader>

      {/* CARDS DE RESUMO DO DIA */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* HÁBITOS DE HOJE */}
        <Card className="border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Hábitos de Hoje</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-foreground">
                  {habitosFeitosHoje.length}/{habitosHoje.length}
                </h3>
                <span className="text-xs text-muted-foreground">cumpridos</span>
              </div>
              <Progress
                value={
                  habitosHoje.length > 0
                    ? Math.round((habitosFeitosHoje.length / habitosHoje.length) * 100)
                    : 0
                }
                className="h-1.5 mt-2 w-28"
              />
            </div>
            <div className="h-10 w-10 rounded-xl bg-primary/10 grid place-items-center text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* TAREFAS PENDENTES DE HOJE */}
        <Card className="border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Tarefas para Hoje</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-foreground">
                  {tarefasHojePendentes.length}
                </h3>
                <span className="text-xs text-muted-foreground">a executar</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">
                {filteredTarefas.filter((t) => t.etapa === 'concluida').length} concluídas no total
              </p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-blue-50 grid place-items-center text-blue-600">
              <ListTodo className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* COMPROMISSOS PRÓXIMOS */}
        <Card className="border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Próximos Compromissos</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-foreground">{proximosEventos.length}</h3>
                <span className="text-xs text-muted-foreground">na agenda</span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">reuniões & lembretes</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-emerald-50 grid place-items-center text-emerald-600">
              <CalendarDays className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        {/* PROJETOS E METAS */}
        <Card className="border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Projetos & Metas</p>
              <div className="flex items-baseline gap-2 mt-1">
                <h3 className="text-2xl font-bold text-foreground">{filteredProjetos.length}</h3>
                <span className="text-xs text-muted-foreground">
                  proj. / {filteredMetas.length} metas
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground mt-1">em andamento</p>
            </div>
            <div className="h-10 w-10 rounded-xl bg-amber-50 grid place-items-center text-amber-600">
              <Target className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* VISÃO GERAL DIVIDIDA: TAREFAS DE HOJE & AGENDA */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* TAREFAS DO DIA */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <ListTodo className="h-4 w-4 text-primary" />
                Tarefas Prioritárias do Dia
              </CardTitle>
              <CardDescription>Pendências para o dia de hoje ou sem prazo</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs h-8">
              <Link to="/projetos">
                Ver todas <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {tarefasHojePendentes.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhuma tarefa prioritária pendente para hoje!
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {tarefasHojePendentes.slice(0, 5).map((tar) => (
                  <div key={tar.id} className="py-2.5 flex items-center justify-between gap-3">
                    <div className="space-y-1">
                      <h4 className="text-xs font-semibold text-foreground">{tar.titulo}</h4>
                      <div className="flex items-center gap-1.5">
                        <ContextBadge
                          tipo={tar.contexto_tipo}
                          pessoa={tar.expand?.pessoa}
                          empresa={tar.expand?.empresa}
                        />
                        <Badge
                          variant="outline"
                          className="text-[10px] uppercase font-bold py-0 px-1"
                        >
                          {tar.prioridade}
                        </Badge>
                      </div>
                    </div>

                    <div className="text-right text-[11px] text-muted-foreground shrink-0">
                      {tar.prazo ? (
                        <span>{new Date(tar.prazo).toLocaleDateString('pt-BR')}</span>
                      ) : (
                        <span>Sem prazo</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* PRÓXIMOS COMPROMISSOS DA AGENDA */}
        <Card className="border-border/60">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-primary" />
                Agenda de Compromissos
              </CardTitle>
              <CardDescription>Próximas reuniões e compromissos sincronizados</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs h-8">
              <Link to="/agenda">
                Abrir Agenda <ArrowRight className="h-3 w-3 ml-1" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {proximosEventos.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                Nenhum compromisso marcado para os próximos dias.
              </div>
            ) : (
              <div className="divide-y divide-border/60">
                {proximosEventos.map((ev) => {
                  const dIni = new Date(ev.data_inicio)
                  const dtFormat = dIni.toLocaleDateString('pt-BR', {
                    day: '2-digit',
                    month: 'short',
                  })
                  const hrFormat = ev.dia_inteiro
                    ? 'Dia todo'
                    : `${String(dIni.getHours()).padStart(2, '0')}:${String(dIni.getMinutes()).padStart(2, '0')}`

                  return (
                    <div key={ev.id} className="py-2.5 flex items-center justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <div
                          className="h-8 w-8 rounded-lg grid place-items-center text-xs font-bold shrink-0"
                          style={{
                            backgroundColor: `${ev.cor || '#DF5830'}20`,
                            color: ev.cor || '#DF5830',
                          }}
                        >
                          <Clock className="h-3.5 w-3.5" />
                        </div>
                        <div>
                          <h4 className="text-xs font-semibold text-foreground">{ev.titulo}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <ContextBadge
                              tipo={ev.contexto_tipo}
                              pessoa={ev.expand?.pessoa}
                              empresa={ev.expand?.empresa}
                            />
                            {ev.origem === 'google' && (
                              <Badge
                                variant="outline"
                                className="text-[10px] bg-blue-50 text-blue-700 border-blue-200 py-0 px-1.5"
                              >
                                Google
                              </Badge>
                            )}
                            {ev.local && (
                              <span className="text-[11px] text-muted-foreground truncate max-w-[140px]">
                                · {ev.local}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right text-[11px] font-medium text-foreground shrink-0">
                        <div>{dtFormat}</div>
                        <div className="text-muted-foreground font-normal">{hrFormat}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO: VISÃO GERAL AGRUPADA POR CONTEXTO (PESSOAL / CNPJs) */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Visão Geral Consolidada por Contexto
          </CardTitle>
          <CardDescription>
            Separação clara entre os registros pessoais (CPF) e as operações empresariais (CNPJs).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2">
            {/* CONTEXTO PESSOAL */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/20 space-y-3">
              <div className="flex items-center justify-between border-b border-blue-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-blue-100 text-blue-700 grid place-items-center font-bold">
                    <User className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground">Pessoal & Família (CPF)</h4>
                    <p className="text-[11px] text-muted-foreground">
                      Rotinas, saúde e metas pessoais
                    </p>
                  </div>
                </div>
                <Badge variant="outline" className="bg-blue-100/50 text-blue-700 border-blue-300">
                  Pessoal
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Hábitos</span>
                  <span className="font-bold text-foreground text-sm">
                    {habitos.filter((h) => h.contexto_tipo === 'pessoal').length}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Tarefas</span>
                  <span className="font-bold text-foreground text-sm">
                    {
                      tarefas.filter(
                        (t) => t.contexto_tipo === 'pessoal' && t.etapa !== 'concluida',
                      ).length
                    }
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Metas</span>
                  <span className="font-bold text-foreground text-sm">
                    {metas.filter((m) => m.contexto_tipo === 'pessoal').length}
                  </span>
                </div>
              </div>
            </div>

            {/* CONTEXTO EMPRESAS / CNPJs */}
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 space-y-3">
              <div className="flex items-center justify-between border-b border-emerald-200/80 pb-2">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-emerald-100 text-emerald-700 grid place-items-center font-bold">
                    <Building2 className="h-4 w-4" />
                  </div>
                  <div>
                    <h4 className="font-bold text-sm text-foreground">
                      Empresas & Negócios (CNPJ)
                    </h4>
                    <p className="text-[11px] text-muted-foreground">
                      Marketplaces, fluxo e gestão PJ
                    </p>
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className="bg-emerald-100/50 text-emerald-700 border-emerald-300"
                >
                  Empresarial
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="p-2 bg-white rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Rotinas PJ</span>
                  <span className="font-bold text-foreground text-sm">
                    {habitos.filter((h) => h.contexto_tipo === 'empresa').length}
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Tarefas PJ</span>
                  <span className="font-bold text-foreground text-sm">
                    {
                      tarefas.filter(
                        (t) => t.contexto_tipo === 'empresa' && t.etapa !== 'concluida',
                      ).length
                    }
                  </span>
                </div>
                <div className="p-2 bg-white rounded-lg border border-border">
                  <span className="text-muted-foreground block text-[10px]">Projetos PJ</span>
                  <span className="font-bold text-foreground text-sm">
                    {projetos.filter((p) => p.contexto_tipo === 'empresa').length}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
