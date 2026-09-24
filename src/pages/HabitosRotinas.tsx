import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  Calendar as CalendarIcon,
  CheckCircle2,
  XCircle,
  MinusCircle,
  Plus,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  Clock,
  Edit2,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ContextBadge } from '@/components/ContextBadge'
import { HabitoDialog } from '@/components/habitos/HabitoDialog'
import { habitosService } from '@/services/habitos'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { can } from '@/lib/permissions'
import { useToast } from '@/hooks/use-toast'
import type { MetaHabito, MetaHabitoRegistro, HabitoStatusRegistro } from '@/types/domain'

export default function HabitosRotinas() {
  const { matchesContext } = useAppContext()
  const { user } = useAuth()
  const { toast } = useToast()

  const [habitos, setHabitos] = useState<MetaHabito[]>([])
  const [registros, setRegistros] = useState<MetaHabitoRegistro[]>([])
  const [loading, setLoading] = useState(true)

  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingHabito, setEditingHabito] = useState<MetaHabito | null>(null)

  // Mês de navegação (visualização mensal)
  const [currentDate, setCurrentDate] = useState(() => new Date())

  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const anoMes = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`
      const [habList, regList] = await Promise.all([
        habitosService.listHabitos(),
        habitosService.listRegistros({ anoMes }),
      ])
      setHabitos(habList)
      setRegistros(regList)
    } catch (err) {
      console.warn('Erro ao carregar hábitos:', err)
    } finally {
      setLoading(false)
    }
  }, [currentDate])

  useEffect(() => {
    loadData()
  }, [loadData])

  // Filtra hábitos pelo contexto ativo
  const filteredHabitos = useMemo(() => {
    return habitos.filter((h) =>
      matchesContext({
        contexto_tipo: h.contexto_tipo,
        pessoa: h.pessoa,
        empresa: h.empresa,
      }),
    )
  }, [habitos, matchesContext])

  // Mapeia registros por chave `habitoId_data`
  const regMap = useMemo(() => {
    const map = new Map<string, MetaHabitoRegistro>()
    registros.forEach((r) => {
      map.set(`${r.habito}_${r.data}`, r)
    })
    return map
  }, [registros])

  // Hábito marcado para hoje
  const hojeDayOfWeek = new Date().getDay() // 0 a 6
  const habitosDeHoje = useMemo(() => {
    return filteredHabitos.filter((h) => {
      if (!h.ativo) return false
      // Verifica se a data de início é <= hoje
      const dtIni = h.data_inicio ? h.data_inicio.split('T')[0] : ''
      if (dtIni && dtIni > todayStr) return false
      // Verifica se o dia da semana atual está programado
      const dias = h.dias_semana || []
      return dias.includes(hojeDayOfWeek)
    })
  }, [filteredHabitos, hojeDayOfWeek, todayStr])

  const handleSetStatus = async (
    habitoId: string,
    dataStr: string,
    status: HabitoStatusRegistro,
  ) => {
    if (!can(user?.role, 'writeFinance')) {
      toast({
        title: 'Acesso negado',
        description: 'Sem permissão para alterar registros.',
        variant: 'destructive',
      })
      return
    }

    try {
      // Otimistic update
      const key = `${habitoId}_${dataStr}`
      const prev = regMap.get(key)
      const isSame = prev?.status === status

      // Se clicar no mesmo status, cancela / remove
      const newStatus = isSame ? 'dispensado' : status

      const updated = await habitosService.setRegistro(habitoId, dataStr, newStatus)
      setRegistros((current) => {
        const without = current.filter((r) => !(r.habito === habitoId && r.data === dataStr))
        return [...without, updated]
      })

      toast({
        title: `Hábito marcado como ${newStatus === 'feito' ? 'Feito' : newStatus === 'nao_feito' ? 'Não Feito' : 'Dispensado'}`,
      })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Tente novamente.'
      toast({ title: 'Erro ao registrar hábito', description: message, variant: 'destructive' })
    }
  }

  const handleDeleteHabito = async (id: string) => {
    if (!can(user?.role, 'deleteFinance')) {
      toast({
        title: 'Acesso negado',
        description: 'Apenas administradores e gestores podem excluir hábitos.',
        variant: 'destructive',
      })
      return
    }
    if (
      !confirm(
        'Deseja realmente excluir este hábito? O histórico de registros continuará protegido.',
      )
    )
      return

    try {
      await habitosService.deleteHabito(id)
      setHabitos((prev) => prev.filter((h) => h.id !== id))
      toast({ title: 'Hábito removido com sucesso.' })
    } catch {
      toast({ title: 'Erro ao excluir hábito', variant: 'destructive' })
    }
  }

  // Gera dias do mês para a grade mensal
  const ano = currentDate.getFullYear()
  const mesIndex = currentDate.getMonth()
  const totalDiasNoMes = new Date(ano, mesIndex + 1, 0).getDate()
  const diasDoMes = useMemo(() => {
    return Array.from({ length: totalDiasNoMes }, (_, i) => i + 1)
  }, [totalDiasNoMes])

  // Navegação de mês
  const prevMonth = () => {
    setCurrentDate(new Date(ano, mesIndex - 1, 1))
  }
  const nextMonth = () => {
    setCurrentDate(new Date(ano, mesIndex + 1, 1))
  }

  const nomeMes = currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })

  // Estatísticas do mês considerando SOMENTE os dias em que o hábito estava programado
  const statsMes = useMemo(() => {
    let previstos = 0
    let feitos = 0
    let naoFeitos = 0
    let dispensados = 0

    const todayDate = new Date()

    filteredHabitos.forEach((h) => {
      if (!h.ativo) return
      const diasProg = h.dias_semana || []
      const dtIni = h.data_inicio ? h.data_inicio.split('T')[0] : ''

      diasDoMes.forEach((dia) => {
        const diaDate = new Date(ano, mesIndex, dia)
        const diaStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`

        // Não contabilizar dias futuros como previstos além de hoje
        if (diaDate > todayDate) return
        if (dtIni && diaStr < dtIni) return

        const dayOfWeek = diaDate.getDay()
        if (diasProg.includes(dayOfWeek)) {
          previstos++
          const reg = regMap.get(`${h.id}_${diaStr}`)
          if (reg?.status === 'feito') feitos++
          else if (reg?.status === 'nao_feito') naoFeitos++
          else if (reg?.status === 'dispensado') dispensados++
        }
      })
    })

    // Taxa de sucesso exclui dispensados do denominador ou os deduz
    const baseCalculo = previstos - dispensados
    const taxa = baseCalculo > 0 ? Math.round((feitos / baseCalculo) * 100) : 0

    return { previstos, feitos, naoFeitos, dispensados, taxa }
  }, [filteredHabitos, diasDoMes, ano, mesIndex, regMap])

  return (
    <div className="space-y-6">
      <PageHeader
        title="Hábitos & Rotinas"
        description="Acompanhe sua disciplina diária, registre execuções e visualize seu progresso mensal."
      >
        {can(user?.role, 'writeFinance') && (
          <Button
            onClick={() => {
              setEditingHabito(null)
              setDialogOpen(true)
            }}
            className="bg-primary hover:bg-primary/90 text-white gap-2"
          >
            <Plus className="h-4 w-4" />
            Novo Hábito
          </Button>
        )}
      </PageHeader>

      {/* SEÇÃO 1: ITENS DE HOJE */}
      <Card className="border-border/60 shadow-xs">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <CardTitle className="text-lg flex items-center gap-2">
                <CalendarIcon className="h-5 w-5 text-primary" />
                Hábitos & Rotinas de Hoje
              </CardTitle>
              <CardDescription>
                {new Date().toLocaleDateString('pt-BR', {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </CardDescription>
            </div>
            <Badge variant="outline" className="font-semibold bg-muted/50">
              {habitosDeHoje.length} programado(s)
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {habitosDeHoje.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground text-sm">
              Nenhum hábito programado para hoje no contexto selecionado.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {habitosDeHoje.map((habito) => {
                const reg = regMap.get(`${habito.id}_${todayStr}`)
                const status = reg?.status

                return (
                  <div
                    key={habito.id}
                    className="p-3.5 rounded-xl border border-border/80 bg-card flex flex-col justify-between gap-3 transition-all hover:border-primary/40"
                    style={{ borderLeftColor: habito.cor || '#DF5830', borderLeftWidth: 4 }}
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-semibold text-foreground text-sm leading-snug">
                          {habito.nome}
                        </h4>
                        <ContextBadge
                          tipo={habito.contexto_tipo}
                          pessoa={habito.expand?.pessoa}
                          empresa={habito.expand?.empresa}
                        />
                      </div>
                      {habito.descricao && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {habito.descricao}
                        </p>
                      )}
                      {habito.horario && (
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-2">
                          <Clock className="h-3 w-3" />
                          <span>{habito.horario}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border/60">
                      <span className="text-[11px] font-medium text-muted-foreground">
                        {status === 'feito' ? (
                          <span className="text-emerald-600 font-semibold">Cumprido hoje</span>
                        ) : status === 'nao_feito' ? (
                          <span className="text-rose-600 font-semibold">Não realizado</span>
                        ) : status === 'dispensado' ? (
                          <span className="text-amber-600 font-semibold">Dispensado</span>
                        ) : (
                          'Pendente'
                        )}
                      </span>

                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant={status === 'feito' ? 'default' : 'outline'}
                          onClick={() => handleSetStatus(habito.id, todayStr, 'feito')}
                          className={`h-8 px-2.5 text-xs ${
                            status === 'feito'
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                              : 'text-emerald-700 hover:bg-emerald-50'
                          }`}
                        >
                          <CheckCircle2 className="h-3.5 w-3.5 mr-1" />
                          Feito
                        </Button>

                        <Button
                          size="sm"
                          variant={status === 'nao_feito' ? 'default' : 'outline'}
                          onClick={() => handleSetStatus(habito.id, todayStr, 'nao_feito')}
                          className={`h-8 px-2 text-xs ${
                            status === 'nao_feito'
                              ? 'bg-rose-600 hover:bg-rose-700 text-white'
                              : 'text-rose-700 hover:bg-rose-50'
                          }`}
                        >
                          <XCircle className="h-3.5 w-3.5" />
                        </Button>

                        <Button
                          size="sm"
                          variant={status === 'dispensado' ? 'default' : 'outline'}
                          onClick={() => handleSetStatus(habito.id, todayStr, 'dispensado')}
                          className={`h-8 px-2 text-xs ${
                            status === 'dispensado'
                              ? 'bg-amber-600 hover:bg-amber-700 text-white'
                              : 'text-amber-700 hover:bg-amber-50'
                          }`}
                          title="Dispensar hoje"
                        >
                          <MinusCircle className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* SEÇÃO 2: PROGRESSO E ESTATÍSTICAS DO MÊS */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/60">
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground font-medium">Taxa de Sucesso</p>
              <h3 className="text-2xl font-bold text-foreground mt-1">{statsMes.taxa}%</h3>
              <p className="text-[11px] text-muted-foreground mt-0.5">dos dias programados</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-primary/10 grid place-items-center text-primary">
              <TrendingUp className="h-5 w-5" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Dias Previstos</p>
            <h3 className="text-2xl font-bold text-foreground mt-1">{statsMes.previstos}</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">considerando programação</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Cumpridos (Feitos)</p>
            <h3 className="text-2xl font-bold text-emerald-600 mt-1">{statsMes.feitos}</h3>
            <p className="text-[11px] text-emerald-600/80 mt-0.5">registros marcados</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Não Feitos</p>
            <h3 className="text-2xl font-bold text-rose-600 mt-1">{statsMes.naoFeitos}</h3>
            <p className="text-[11px] text-rose-600/80 mt-0.5">dias falhados</p>
          </CardContent>
        </Card>

        <Card className="border-border/60">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground font-medium">Dispensados</p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">{statsMes.dispensados}</h3>
            <p className="text-[11px] text-amber-600/80 mt-0.5">exceções justificadas</p>
          </CardContent>
        </Card>
      </div>

      {/* SEÇÃO 3: GRADE MENSAL DE ACOMPANHAMENTO (CALENDÁRIO) */}
      <Card className="border-border/60">
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <CardTitle className="text-lg">Grade Mensal de Cumprimento</CardTitle>
              <CardDescription>
                Histórico dia a dia. Clique em qualquer célula para marcar ou alterar o status.
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={prevMonth} className="h-8 w-8">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm font-semibold capitalize min-w-[140px] text-center">
                {nomeMes}
              </span>
              <Button variant="outline" size="icon" onClick={nextMonth} className="h-8 w-8">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Carregando histórico do mês...
            </div>
          ) : filteredHabitos.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              Nenhum hábito cadastrado para este contexto.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-muted-foreground">
                    <th className="text-left font-medium py-2 px-3 min-w-[200px] sticky left-0 bg-card z-10">
                      Hábito / Contexto
                    </th>
                    {diasDoMes.map((dia) => {
                      const dDate = new Date(ano, mesIndex, dia)
                      const dWeek = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'][dDate.getDay()]
                      const isHoje =
                        dia === new Date().getDate() &&
                        mesIndex === new Date().getMonth() &&
                        ano === new Date().getFullYear()

                      return (
                        <th
                          key={dia}
                          className={`text-center font-medium p-1 w-7 min-w-7 ${
                            isHoje ? 'bg-primary/10 text-primary font-bold rounded-t' : ''
                          }`}
                        >
                          <span className="block text-[10px] text-muted-foreground">{dWeek}</span>
                          <span>{dia}</span>
                        </th>
                      )
                    })}
                    <th className="text-center font-medium py-2 px-2 min-w-[60px]">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredHabitos.map((habito) => {
                    const dtIni = habito.data_inicio ? habito.data_inicio.split('T')[0] : ''
                    const diasProg = habito.dias_semana || []

                    return (
                      <tr
                        key={habito.id}
                        className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                      >
                        <td className="py-2.5 px-3 sticky left-0 bg-card z-10">
                          <div className="flex flex-col gap-1">
                            <span className="font-semibold text-foreground truncate max-w-[190px]">
                              {habito.nome}
                            </span>
                            <div className="flex items-center gap-1.5">
                              <ContextBadge
                                tipo={habito.contexto_tipo}
                                pessoa={habito.expand?.pessoa}
                                empresa={habito.expand?.empresa}
                              />
                              {habito.horario && (
                                <span className="text-[10px] text-muted-foreground">
                                  {habito.horario}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>

                        {diasDoMes.map((dia) => {
                          const diaDate = new Date(ano, mesIndex, dia)
                          const diaStr = `${ano}-${String(mesIndex + 1).padStart(2, '0')}-${String(dia).padStart(2, '0')}`
                          const dayOfWeek = diaDate.getDay()
                          const isProgramado = diasProg.includes(dayOfWeek)
                          const isBeforeStart = dtIni ? diaStr < dtIni : false

                          const reg = regMap.get(`${habito.id}_${diaStr}`)
                          const status = reg?.status

                          // Estilo da célula
                          let bg = 'bg-muted/20 text-muted-foreground/30'
                          let icon = null

                          if (isProgramado && !isBeforeStart) {
                            if (status === 'feito') {
                              bg = 'bg-emerald-500 text-white font-bold'
                              icon = '✓'
                            } else if (status === 'nao_feito') {
                              bg = 'bg-rose-500 text-white font-bold'
                              icon = '✕'
                            } else if (status === 'dispensado') {
                              bg = 'bg-amber-400 text-white font-bold'
                              icon = '—'
                            } else {
                              bg =
                                'bg-white border border-dashed border-border text-transparent hover:border-primary'
                            }
                          }

                          return (
                            <td key={dia} className="p-1 text-center">
                              <button
                                type="button"
                                disabled={!isProgramado || isBeforeStart}
                                onClick={() => {
                                  // Alterna status: pendente -> feito -> nao_feito -> dispensado -> pendente
                                  const nextStatus: HabitoStatusRegistro =
                                    status === 'feito'
                                      ? 'nao_feito'
                                      : status === 'nao_feito'
                                        ? 'dispensado'
                                        : 'feito'
                                  handleSetStatus(habito.id, diaStr, nextStatus)
                                }}
                                className={`h-6 w-6 rounded flex items-center justify-center mx-auto text-[10px] transition-transform ${bg} ${
                                  isProgramado && !isBeforeStart
                                    ? 'cursor-pointer hover:scale-110'
                                    : 'cursor-not-allowed opacity-40'
                                }`}
                                title={`${diaStr}: ${status || (isProgramado ? 'Pendente' : 'Não programado')}`}
                              >
                                {icon}
                              </button>
                            </td>
                          )
                        })}

                        <td className="py-2.5 px-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {can(user?.role, 'writeFinance') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                                onClick={() => {
                                  setEditingHabito(habito)
                                  setDialogOpen(true)
                                }}
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {can(user?.role, 'deleteFinance') && (
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive hover:bg-destructive/10"
                                onClick={() => handleDeleteHabito(habito.id)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <HabitoDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        habito={editingHabito}
        onSuccess={loadData}
      />
    </div>
  )
}
