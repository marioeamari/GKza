import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  FolderKanban,
  CheckCircle2,
  Clock,
  Plus,
  ArrowRight,
  ArrowLeft,
  Calendar,
  AlertCircle,
  Edit2,
  Trash2,
  Target,
  ListTodo,
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  ChevronsDownUp,
  AlertTriangle,
} from 'lucide-react'
import { Checkbox } from '@/components/ui/checkbox'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { ContextBadge } from '@/components/ContextBadge'
import { ProjetoDialog } from '@/components/projetos/ProjetoDialog'
import { TarefaDialog } from '@/components/projetos/TarefaDialog'
import { MetaDialog } from '@/components/projetos/MetaDialog'
import { EventoDialog } from '@/components/agenda/EventoDialog'
import { projetosTarefasService } from '@/services/projetosTarefas'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { can } from '@/lib/permissions'
import { useToast } from '@/hooks/use-toast'
import { getLocalDateStr } from '@/lib/format'
import {
  getTarefaPendenciasResumo,
  loadPersistedExpandedTarefas,
  savePersistedExpandedTarefas,
} from '@/lib/projetosTarefasRules'
import type { Projeto, Tarefa, MetaMeta, TarefaEtapa } from '@/types/domain'

export default function ProjetosTarefas() {
  const { matchesContext } = useAppContext()
  const { user } = useAuth()
  const { toast } = useToast()

  const [activeTab, setActiveTab] = useState<'quadro' | 'projetos' | 'metas'>('quadro')

  const [projetos, setProjetos] = useState<Projeto[]>([])
  const [tarefas, setTarefas] = useState<Tarefa[]>([])
  const [metas, setMetas] = useState<MetaMeta[]>([])
  const [loading, setLoading] = useState(true)

  // Filtro de projeto no quadro Kanban
  const [selectedProjetoFilter, setSelectedProjetoFilter] = useState<string>('todos')

  // Modais
  const [projDialogOpen, setProjDialogOpen] = useState(false)
  const [editingProjeto, setEditingProjeto] = useState<Projeto | null>(null)

  const [tarefaDialogOpen, setTarefaDialogOpen] = useState(false)
  const [editingTarefa, setEditingTarefa] = useState<Tarefa | null>(null)
  const [targetEtapaNovaTarefa, setTargetEtapaNovaTarefa] = useState<TarefaEtapa>('a_fazer')

  const [metaDialogOpen, setMetaDialogOpen] = useState(false)
  const [editingMeta, setEditingMeta] = useState<MetaMeta | null>(null)

  // Agendar tarefa na agenda
  const [agendaDialogOpen, setAgendaDialogOpen] = useState(false)
  const [agendandoTitulo, setAgendandoTitulo] = useState('')
  const [agendandoData, setAgendandoData] = useState('')

  // Estado persistido de quais tarefas estão expandidas no comportamento ACCORDION
  // Padrão: todas colapsadas (apenas título visível em linha compacta)
  const [expandedTarefaIds, setExpandedTarefaIds] = useState<Set<string>>(() =>
    loadPersistedExpandedTarefas(),
  )

  // Salva no localStorage sempre que o conjunto de tarefas expandidas mudar
  useEffect(() => {
    savePersistedExpandedTarefas(expandedTarefaIds)
  }, [expandedTarefaIds])

  const toggleTarefaExpanded = useCallback((tarefaId: string, e?: React.SyntheticEvent) => {
    e?.stopPropagation()
    setExpandedTarefaIds((prev) => {
      const next = new Set(prev)
      if (next.has(tarefaId)) {
        next.delete(tarefaId)
      } else {
        next.add(tarefaId)
      }
      return next
    })
  }, [])

  const expandAllTarefas = useCallback((tarefaList: Tarefa[]) => {
    setExpandedTarefaIds((prev) => {
      const next = new Set(prev)
      tarefaList.forEach((t) => next.add(t.id))
      return next
    })
  }, [])

  const collapseAllTarefas = useCallback((tarefaList?: Tarefa[]) => {
    setExpandedTarefaIds((prev) => {
      if (!tarefaList || tarefaList.length === 0) {
        return new Set<string>()
      }
      const next = new Set(prev)
      tarefaList.forEach((t) => next.delete(t.id))
      return next
    })
  }, [])

  // Estado para controlar quais tarefas têm checklist expandida internamente
  const [expandedChecklistMap, setExpandedChecklistMap] = useState<Record<string, boolean>>({})

  const toggleChecklistExpanded = (tarefaId: string, e?: React.MouseEvent) => {
    e?.stopPropagation()
    setExpandedChecklistMap((prev) => ({
      ...prev,
      [tarefaId]: prev[tarefaId] === undefined ? true : !prev[tarefaId],
    }))
  }

  // Toggle rápido de item da checklist diretamente no card do Kanban com persistência imediata
  const handleToggleChecklistItemDirect = async (
    tarefaId: string,
    itemId: string,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation()
    if (!can(user?.role, 'writeFinance')) {
      toast({ title: 'Sem permissão para alterar tarefa', variant: 'destructive' })
      return
    }

    const currentTarefa = tarefas.find((t) => t.id === tarefaId)
    if (!currentTarefa || !currentTarefa.checklist) return

    const updatedChecklist = currentTarefa.checklist.map((item) =>
      item.id === itemId ? { ...item, feito: !item.feito } : item,
    )

    // Otimistic update
    setTarefas((prev) =>
      prev.map((t) => (t.id === tarefaId ? { ...t, checklist: updatedChecklist } : t)),
    )

    try {
      await projetosTarefasService.updateTarefa(tarefaId, {
        checklist: updatedChecklist,
      })
    } catch {
      toast({ title: 'Erro ao atualizar checklist da tarefa', variant: 'destructive' })
      loadAll()
    }
  }

  const loadAll = useCallback(async () => {
    setLoading(true)
    try {
      const [projList, tarList, metaList] = await Promise.all([
        projetosTarefasService.listProjetos(),
        projetosTarefasService.listTarefas(),
        projetosTarefasService.listMetas(),
      ])
      setProjetos(projList)
      setTarefas(tarList)
      setMetas(metaList)
    } catch (err) {
      console.warn('Erro ao carregar dados:', err)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  // Filtro de contexto em todos os dados
  const filteredProjetos = useMemo(() => {
    return projetos.filter((p) =>
      matchesContext({
        contexto_tipo: p.contexto_tipo,
        pessoa: p.pessoa,
        empresa: p.empresa,
      }),
    )
  }, [projetos, matchesContext])

  const filteredTarefas = useMemo(() => {
    return tarefas.filter((t) => {
      const matchCtx = matchesContext({
        contexto_tipo: t.contexto_tipo,
        pessoa: t.pessoa,
        empresa: t.empresa,
      })
      if (!matchCtx) return false
      if (selectedProjetoFilter === 'todos') return true
      if (selectedProjetoFilter === 'avulsas') return !t.projeto
      return t.projeto === selectedProjetoFilter
    })
  }, [tarefas, matchesContext, selectedProjetoFilter])

  const filteredMetas = useMemo(() => {
    return metas.filter((m) =>
      matchesContext({
        contexto_tipo: m.contexto_tipo,
        pessoa: m.pessoa,
        empresa: m.empresa,
      }),
    )
  }, [metas, matchesContext])

  // Colunas do Kanban
  const colAFazer = useMemo(
    () => filteredTarefas.filter((t) => t.etapa === 'a_fazer'),
    [filteredTarefas],
  )
  const colEmProgresso = useMemo(
    () => filteredTarefas.filter((t) => t.etapa === 'em_progresso'),
    [filteredTarefas],
  )
  const colConcluida = useMemo(
    () => filteredTarefas.filter((t) => t.etapa === 'concluida'),
    [filteredTarefas],
  )

  // Ações de mover etapa da tarefa
  const handleMoveEtapa = async (tarefaId: string, novaEtapa: TarefaEtapa) => {
    if (!can(user?.role, 'writeFinance')) {
      toast({ title: 'Sem permissão', variant: 'destructive' })
      return
    }

    try {
      // Otimistic update
      setTarefas((prev) => prev.map((t) => (t.id === tarefaId ? { ...t, etapa: novaEtapa } : t)))
      await projetosTarefasService.updateEtapa(tarefaId, novaEtapa)
    } catch {
      toast({ title: 'Erro ao mover tarefa', variant: 'destructive' })
      loadAll()
    }
  }

  // Suporte a HTML5 Drag and Drop no desktop
  const handleDragStart = (e: React.DragEvent, tarefaId: string) => {
    e.dataTransfer.setData('text/plain', tarefaId)
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
  }

  const handleDrop = (e: React.DragEvent, targetEtapa: TarefaEtapa) => {
    e.preventDefault()
    const tarefaId = e.dataTransfer.getData('text/plain')
    if (tarefaId) {
      handleMoveEtapa(tarefaId, targetEtapa)
    }
  }

  const handleDeleteTarefa = async (id: string) => {
    if (!can(user?.role, 'deleteFinance')) {
      toast({ title: 'Acesso negado', variant: 'destructive' })
      return
    }
    if (!confirm('Excluir esta tarefa?')) return

    try {
      await projetosTarefasService.deleteTarefa(id)
      setTarefas((prev) => prev.filter((t) => t.id !== id))
      toast({ title: 'Tarefa removida.' })
    } catch {
      toast({ title: 'Erro ao remover tarefa', variant: 'destructive' })
    }
  }

  const handleDeleteProjeto = async (id: string) => {
    if (!can(user?.role, 'deleteFinance')) {
      toast({ title: 'Acesso negado', variant: 'destructive' })
      return
    }
    if (!confirm('Deseja excluir este projeto? As tarefas associadas continuarão existindo.'))
      return

    try {
      await projetosTarefasService.deleteProjeto(id)
      setProjetos((prev) => prev.filter((p) => p.id !== id))
      toast({ title: 'Projeto removido.' })
    } catch {
      toast({ title: 'Erro ao remover projeto', variant: 'destructive' })
    }
  }

  const handleDeleteMeta = async (id: string) => {
    if (!can(user?.role, 'deleteFinance')) {
      toast({ title: 'Acesso negado', variant: 'destructive' })
      return
    }
    if (!confirm('Excluir esta meta?')) return

    try {
      await projetosTarefasService.deleteMeta(id)
      setMetas((prev) => prev.filter((m) => m.id !== id))
      toast({ title: 'Meta removida.' })
    } catch {
      toast({ title: 'Erro ao remover meta', variant: 'destructive' })
    }
  }

  // Agendar tarefa na agenda
  const handleAgendarTarefa = (tarefa: Tarefa) => {
    setAgendandoTitulo(`Executar: ${tarefa.titulo}`)
    setAgendandoData(tarefa.prazo ? tarefa.prazo.slice(0, 10) : getLocalDateStr())
    setAgendaDialogOpen(true)
  }

  // Cálculo de progresso de uma meta
  const getMetaProgress = (meta: MetaMeta) => {
    if (meta.tipo_progresso === 'manual') {
      return {
        percentual: meta.progresso_manual || 0,
        tipo: 'manual',
        label: `${meta.progresso_manual || 0}% (informado manualmente)`,
      }
    }

    // Calculado a partir de tarefas do projeto associado
    if (meta.projeto) {
      const projTarefas = tarefas.filter((t) => t.projeto === meta.projeto)
      if (projTarefas.length === 0) {
        return { percentual: 0, tipo: 'tarefas', label: '0% (sem tarefas cadastradas)' }
      }
      const concluidas = projTarefas.filter((t) => t.etapa === 'concluida').length
      const perc = Math.round((concluidas / projTarefas.length) * 100)
      return {
        percentual: perc,
        tipo: 'tarefas',
        label: `${perc}% (${concluidas}/${projTarefas.length} tarefas concluídas)`,
      }
    }

    return { percentual: 0, tipo: 'tarefas', label: '0% (vincule um projeto)' }
  }

  const renderTarefaCard = (tarefa: Tarefa) => {
    const isExpanded = expandedTarefaIds.has(tarefa.id)
    const resumo = getTarefaPendenciasResumo(tarefa)

    const totalCheck = tarefa.checklist?.length || 0
    const feitosCheck = tarefa.checklist?.filter((c) => c.feito).length || 0
    const isChecklistExpanded =
      expandedChecklistMap[tarefa.id] !== undefined
        ? expandedChecklistMap[tarefa.id]
        : totalCheck > 0

    const prioridadeColors = {
      baixa: 'bg-slate-100 text-slate-700 border-slate-200',
      media: 'bg-blue-50 text-blue-700 border-blue-200',
      alta: 'bg-amber-50 text-amber-700 border-amber-200',
      urgente: 'bg-rose-50 text-rose-700 border-rose-200',
    }

    const contentId = `tarefa-content-${tarefa.id}`

    return (
      <div
        key={tarefa.id}
        draggable
        onDragStart={(e) => handleDragStart(e, tarefa.id)}
        className={`rounded-xl border bg-white shadow-xs transition-all duration-200 select-none ${
          isExpanded
            ? 'border-primary/40 shadow-sm'
            : 'border-border hover:border-primary/40 hover:shadow-xs'
        }`}
      >
        {/* CABEÇALHO DO ACCORDION: Linha compacta com apenas o TÍTULO (padrão colapsado) */}
        <div
          role="button"
          tabIndex={0}
          aria-expanded={isExpanded}
          aria-controls={contentId}
          aria-label={`Tarefa: ${tarefa.titulo}. ${isExpanded ? 'Expandida' : 'Recolhida'}`}
          onClick={(e) => toggleTarefaExpanded(tarefa.id, e)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              toggleTarefaExpanded(tarefa.id, e)
            }
          }}
          className={`w-full flex items-center justify-between gap-2 p-3 text-left cursor-pointer transition-colors group rounded-xl ${
            isExpanded
              ? 'bg-muted/20 border-b border-border/40 rounded-b-none'
              : 'hover:bg-muted/10'
          }`}
        >
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {/* Botão Chevron Accordion */}
            <span
              className={`flex items-center justify-center h-6 w-6 rounded-md border text-muted-foreground transition-all shrink-0 mt-0.5 ${
                isExpanded
                  ? 'bg-primary text-white border-primary rotate-180 shadow-xs'
                  : 'bg-background border-border/80 group-hover:border-primary group-hover:text-primary'
              }`}
              title={isExpanded ? 'Recolher tarefa' : 'Expandir tarefa'}
              aria-hidden="true"
            >
              <ChevronDown className="h-3.5 w-3.5 transition-transform duration-200" />
            </span>

            {/* Título da Tarefa (sem truncamento/ellipsis: quebra em quantas linhas forem necessárias) */}
            <h4
              className={`text-sm leading-snug break-words whitespace-normal transition-colors flex-1 min-w-0 ${
                isExpanded
                  ? 'font-bold text-primary'
                  : 'font-medium text-foreground group-hover:text-primary'
              } ${tarefa.etapa === 'concluida' ? 'line-through text-muted-foreground/75' : ''}`}
              title={tarefa.titulo}
            >
              {tarefa.titulo}
            </h4>
          </div>

          {/* INDICADORES COMPACTOS DE PENDÊNCIAS / ALERTAS (discretos e informativos) */}
          <div
            className="flex items-center gap-1.5 shrink-0 pt-0.5 self-start"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Indicador de subtarefas / checklist pendentes */}
            {resumo.hasChecklist && (
              <span
                className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                  resumo.pendentesChecklist === 0
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}
                title={
                  resumo.pendentesChecklist === 0
                    ? 'Todas as subtarefas concluídas'
                    : `${resumo.pendentesChecklist} de ${resumo.totalChecklist} subtarefas pendentes`
                }
              >
                <CheckCircle2 className="h-3 w-3" />
                <span>
                  {resumo.feitosChecklist}/{resumo.totalChecklist}
                </span>
              </span>
            )}

            {/* Alerta discreto de vencimento (atrasada ou vence hoje) */}
            {resumo.isAtrasada && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse"
                title="Tarefa atrasada"
              >
                <AlertTriangle className="h-3 w-3 text-rose-600" />
                <span className="hidden sm:inline">Atrasada</span>
              </span>
            )}

            {resumo.isHoje && (
              <span
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200"
                title="Prazo vence hoje"
              >
                <Clock className="h-3 w-3 text-amber-600" />
                <span className="hidden sm:inline">Hoje</span>
              </span>
            )}

            {/* Prioridade discreta quando alta/urgente (sem poluir se baixa/media) */}
            {resumo.prioridadeCritica && !isExpanded && (
              <Badge
                variant="outline"
                className={`text-[9px] uppercase font-bold py-0 px-1 shrink-0 ${
                  prioridadeColors[tarefa.prioridade]
                }`}
              >
                {tarefa.prioridade}
              </Badge>
            )}
          </div>
        </div>

        {/* CORPO DO ACCORDION: Exibido apenas quando expandido */}
        {isExpanded && (
          <div
            id={contentId}
            className="p-3.5 space-y-3 border-t border-border/30 bg-card/40 rounded-b-xl animate-in fade-in-50 duration-200"
          >
            {/* Descrição completa */}
            {tarefa.descricao ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {tarefa.descricao}
              </p>
            ) : (
              <p className="text-[11px] text-muted-foreground/60 italic">
                Sem descrição detalhada.
              </p>
            )}

            {/* Badges de contexto, projeto e prioridade */}
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              <Badge
                variant="outline"
                className={`text-[10px] uppercase font-bold py-0.5 px-1.5 shrink-0 ${
                  prioridadeColors[tarefa.prioridade]
                }`}
              >
                {tarefa.prioridade}
              </Badge>
              <ContextBadge
                tipo={tarefa.contexto_tipo}
                pessoa={tarefa.expand?.pessoa}
                empresa={tarefa.expand?.empresa}
              />
              {tarefa.expand?.projeto && (
                <Badge variant="secondary" className="text-[10px] bg-muted truncate max-w-[150px]">
                  {tarefa.expand.projeto.nome}
                </Badge>
              )}
            </div>

            {/* Checklist com itens marcáveis direto no card */}
            {totalCheck > 0 && (
              <div
                className="pt-2 border-t border-border/50 space-y-1.5"
                onClick={(e) => e.stopPropagation()}
              >
                <div
                  className="flex items-center justify-between text-[11px] text-muted-foreground cursor-pointer hover:text-foreground select-none"
                  onClick={(e) => toggleChecklistExpanded(tarefa.id, e)}
                  title="Expandir/recolher subtarefas"
                >
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2
                      className={`h-3.5 w-3.5 ${
                        feitosCheck === totalCheck ? 'text-emerald-500' : 'text-primary'
                      }`}
                    />
                    <span className="font-medium">
                      Subtarefas ({feitosCheck}/{totalCheck})
                    </span>
                  </div>
                  <span className="flex items-center text-[10px] text-muted-foreground hover:text-primary">
                    {isChecklistExpanded ? (
                      <ChevronUp className="h-3.5 w-3.5" />
                    ) : (
                      <ChevronDown className="h-3.5 w-3.5" />
                    )}
                  </span>
                </div>

                {isChecklistExpanded && (
                  <div className="space-y-1 pl-0.5 pt-0.5">
                    {tarefa.checklist?.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-start gap-2 text-xs py-0.5 group/item cursor-pointer"
                        onClick={(e) => handleToggleChecklistItemDirect(tarefa.id, item.id, e)}
                      >
                        <Checkbox
                          checked={item.feito}
                          className="mt-0.5 data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                          onCheckedChange={() =>
                            handleToggleChecklistItemDirect(tarefa.id, item.id)
                          }
                          onClick={(e) => e.stopPropagation()}
                        />
                        <span
                          className={`text-[11px] leading-tight select-none ${
                            item.feito
                              ? 'line-through text-muted-foreground/70'
                              : 'text-foreground/90 font-normal'
                          }`}
                        >
                          {item.texto}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Prazo e responsável */}
            <div className="flex items-center justify-between pt-2 border-t border-border/60 text-[11px] text-muted-foreground">
              {tarefa.prazo ? (
                <span
                  className={`flex items-center gap-1 font-medium ${
                    resumo.isAtrasada ? 'text-rose-600' : 'text-muted-foreground'
                  }`}
                >
                  <Clock className="h-3 w-3" />
                  Prazo: {new Date(tarefa.prazo).toLocaleDateString('pt-BR')}
                </span>
              ) : (
                <span className="text-muted-foreground/60">Sem prazo definido</span>
              )}
              {tarefa.expand?.responsavel && (
                <span className="font-medium text-foreground truncate max-w-[120px]">
                  {tarefa.expand.responsavel.name}
                </span>
              )}
            </div>

            {/* BOTÕES DE CONTROLE, MOVIMENTAÇÃO E AÇÕES */}
            <div
              className="flex items-center justify-between pt-1 border-t border-border/40"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-1">
                {tarefa.etapa !== 'a_fazer' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px] text-muted-foreground hover:text-foreground"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMoveEtapa(
                        tarefa.id,
                        tarefa.etapa === 'concluida' ? 'em_progresso' : 'a_fazer',
                      )
                    }}
                    title="Mover para etapa anterior"
                  >
                    <ArrowLeft className="h-3 w-3 mr-0.5" />
                    Voltar
                  </Button>
                )}
                {tarefa.etapa !== 'concluida' && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-1.5 text-[10px] text-primary hover:bg-primary/10 font-semibold"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleMoveEtapa(
                        tarefa.id,
                        tarefa.etapa === 'a_fazer' ? 'em_progresso' : 'concluida',
                      )
                    }}
                    title="Avançar etapa"
                  >
                    Avançar
                    <ArrowRight className="h-3 w-3 ml-0.5" />
                  </Button>
                )}
              </div>

              <div className="flex items-center gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-[10px] text-muted-foreground hover:text-foreground gap-1"
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingTarefa(tarefa)
                    setTarefaDialogOpen(true)
                  }}
                >
                  <Edit2 className="h-3 w-3" />
                  Editar
                </Button>
                {can(user?.role, 'deleteFinance') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 text-destructive hover:bg-destructive/10"
                    title="Excluir tarefa"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleDeleteTarefa(tarefa.id)
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projetos, Tarefas & Metas"
        description="Organize demandas em quadro Kanban, acompanhe projetos e meça o alcance de metas financeiras e operacionais."
      >
        <div className="flex flex-wrap items-center gap-2">
          {can(user?.role, 'writeFinance') && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingProjeto(null)
                  setProjDialogOpen(true)
                }}
                className="text-xs gap-1.5"
              >
                <FolderKanban className="h-3.5 w-3.5 text-primary" />
                Novo Projeto
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingMeta(null)
                  setMetaDialogOpen(true)
                }}
                className="text-xs gap-1.5"
              >
                <Target className="h-3.5 w-3.5 text-primary" />
                Nova Meta
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  setEditingTarefa(null)
                  setTargetEtapaNovaTarefa('a_fazer')
                  setTarefaDialogOpen(true)
                }}
                className="text-xs bg-primary hover:bg-primary/90 text-white gap-1.5"
              >
                <Plus className="h-3.5 w-3.5" />
                Nova Tarefa
              </Button>
            </>
          )}
        </div>
      </PageHeader>

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'quadro' | 'projetos' | 'metas')}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-2.5 rounded-xl border border-border">
          <TabsList className="h-9">
            <TabsTrigger value="quadro" className="text-xs gap-1.5 px-3">
              <ListTodo className="h-3.5 w-3.5" />
              Quadro de Tarefas
            </TabsTrigger>
            <TabsTrigger value="projetos" className="text-xs gap-1.5 px-3">
              <FolderKanban className="h-3.5 w-3.5" />
              Projetos ({filteredProjetos.length})
            </TabsTrigger>
            <TabsTrigger value="metas" className="text-xs gap-1.5 px-3">
              <Target className="h-3.5 w-3.5" />
              Metas ({filteredMetas.length})
            </TabsTrigger>
          </TabsList>

          {activeTab === 'quadro' && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Controles Accordion Global: Expandir Tudo / Recolher Tudo */}
              <div className="flex items-center gap-1 border-r border-border/70 pr-2 mr-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => expandAllTarefas(filteredTarefas)}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-primary gap-1"
                  title="Expandir todas as tarefas visíveis"
                >
                  <ChevronsUpDown className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Expandir tudo</span>
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => collapseAllTarefas(filteredTarefas)}
                  className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground gap-1"
                  title="Recolher todas as tarefas para exibir apenas o título"
                >
                  <ChevronsDownUp className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">Recolher tudo</span>
                </Button>
              </div>

              <span className="text-xs text-muted-foreground whitespace-nowrap">Filtrar por:</span>
              <select
                value={selectedProjetoFilter}
                onChange={(e) => setSelectedProjetoFilter(e.target.value)}
                className="h-8 text-xs rounded-lg border border-border bg-white px-2 py-1 text-foreground"
              >
                <option value="todos">Todos os Projetos & Demandas</option>
                <option value="avulsas">Apenas Demandas Avulsas</option>
                {filteredProjetos.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* 1. ABA QUADRO KANBAN DE TAREFAS */}
        <TabsContent value="quadro" className="mt-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* COLUNA: A FAZER */}
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'a_fazer')}
              className="bg-muted/40 rounded-xl p-3 border border-border flex flex-col min-h-[500px]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-amber-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    A Fazer
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {colAFazer.length}
                  </Badge>
                </div>
                {can(user?.role, 'writeFinance') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingTarefa(null)
                      setTargetEtapaNovaTarefa('a_fazer')
                      setTarefaDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-3 mt-3 flex-1 overflow-y-auto">
                {colAFazer.map((tarefa) => renderTarefaCard(tarefa))}
                {colAFazer.length === 0 && (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    Nenhuma tarefa nesta etapa
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA: EM PROGRESSO */}
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'em_progresso')}
              className="bg-muted/40 rounded-xl p-3 border border-border flex flex-col min-h-[500px]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-blue-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Em Progresso
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {colEmProgresso.length}
                  </Badge>
                </div>
                {can(user?.role, 'writeFinance') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingTarefa(null)
                      setTargetEtapaNovaTarefa('em_progresso')
                      setTarefaDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-3 mt-3 flex-1 overflow-y-auto">
                {colEmProgresso.map((tarefa) => renderTarefaCard(tarefa))}
                {colEmProgresso.length === 0 && (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    Nenhuma tarefa em andamento
                  </div>
                )}
              </div>
            </div>

            {/* COLUNA: CONCLUÍDA */}
            <div
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'concluida')}
              className="bg-muted/40 rounded-xl p-3 border border-border flex flex-col min-h-[500px]"
            >
              <div className="flex items-center justify-between pb-3 border-b border-border/80">
                <div className="flex items-center gap-2">
                  <div className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-foreground">
                    Concluída
                  </h3>
                  <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                    {colConcluida.length}
                  </Badge>
                </div>
                {can(user?.role, 'writeFinance') && (
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    onClick={() => {
                      setEditingTarefa(null)
                      setTargetEtapaNovaTarefa('concluida')
                      setTarefaDialogOpen(true)
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </Button>
                )}
              </div>

              <div className="space-y-3 mt-3 flex-1 overflow-y-auto">
                {colConcluida.map((tarefa) => renderTarefaCard(tarefa))}
                {colConcluida.length === 0 && (
                  <div className="py-12 text-center text-xs text-muted-foreground">
                    Nenhuma tarefa concluída ainda
                  </div>
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* 2. ABA PROJETOS */}
        <TabsContent value="projetos" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredProjetos.map((proj) => {
              const projTarefas = tarefas.filter((t) => t.projeto === proj.id)
              const concluidas = projTarefas.filter((t) => t.etapa === 'concluida').length
              const perc =
                projTarefas.length > 0 ? Math.round((concluidas / projTarefas.length) * 100) : 0

              return (
                <Card
                  key={proj.id}
                  className="border-border/80 hover:shadow-xs transition-shadow flex flex-col justify-between"
                  style={{ borderTop: `4px solid ${proj.cor || '#DF5830'}` }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base font-bold">{proj.nome}</CardTitle>
                      <ContextBadge
                        tipo={proj.contexto_tipo}
                        pessoa={proj.expand?.pessoa}
                        empresa={proj.expand?.empresa}
                      />
                    </div>
                    {proj.objetivo && (
                      <CardDescription className="line-clamp-2 text-xs">
                        {proj.objetivo}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4 pt-2">
                    {/* Progresso de tarefas */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Progresso do Projeto:</span>
                        <span className="font-semibold text-foreground">{perc}%</span>
                      </div>
                      <Progress value={perc} className="h-2" />
                      <div className="flex justify-between text-[11px] text-muted-foreground">
                        <span>{projTarefas.length} tarefas cadastradas</span>
                        <span>{concluidas} concluídas</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between text-xs text-muted-foreground pt-2 border-t border-border">
                      {proj.prazo ? (
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          Prazo: {new Date(proj.prazo).toLocaleDateString('pt-BR')}
                        </span>
                      ) : (
                        <span>Sem prazo fixo</span>
                      )}

                      <Badge variant="outline" className="text-[10px] capitalize">
                        {proj.status.replace('_', ' ')}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-end gap-1 pt-2">
                      {can(user?.role, 'writeFinance') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingProjeto(proj)
                            setProjDialogOpen(true)
                          }}
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                      )}
                      {can(user?.role, 'deleteFinance') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteProjeto(proj.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Excluir
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {filteredProjetos.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhum projeto cadastrado no contexto ativo.
            </div>
          )}
        </TabsContent>

        {/* 3. ABA METAS */}
        <TabsContent value="metas" className="mt-4 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredMetas.map((meta) => {
              const prog = getMetaProgress(meta)

              return (
                <Card
                  key={meta.id}
                  className="border-border/80 hover:shadow-xs transition-shadow flex flex-col justify-between"
                  style={{ borderLeft: `4px solid ${meta.cor || '#DF5830'}` }}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base font-bold">{meta.titulo}</CardTitle>
                        {meta.alvo_descricao && (
                          <p className="text-xs font-semibold text-primary mt-0.5">
                            Alvo: {meta.alvo_descricao}
                          </p>
                        )}
                      </div>
                      <ContextBadge
                        tipo={meta.contexto_tipo}
                        pessoa={meta.expand?.pessoa}
                        empresa={meta.expand?.empresa}
                      />
                    </div>
                    {meta.descricao && (
                      <CardDescription className="line-clamp-2 text-xs mt-1">
                        {meta.descricao}
                      </CardDescription>
                    )}
                  </CardHeader>

                  <CardContent className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-foreground">Progresso:</span>
                        <span className="font-bold text-primary">{prog.percentual}%</span>
                      </div>
                      <Progress value={prog.percentual} className="h-2.5" />
                      <p className="text-[11px] text-muted-foreground">{prog.label}</p>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-border text-xs text-muted-foreground">
                      {meta.prazo ? (
                        <span>Prazo: {new Date(meta.prazo).toLocaleDateString('pt-BR')}</span>
                      ) : (
                        <span>Sem prazo</span>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] ${
                          meta.tipo_progresso === 'tarefas'
                            ? 'bg-blue-50 text-blue-700 border-blue-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}
                      >
                        {meta.tipo_progresso === 'tarefas' ? 'Via Tarefas' : 'Manual'}
                      </Badge>
                    </div>

                    <div className="flex items-center justify-end gap-1 pt-1">
                      {can(user?.role, 'writeFinance') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingMeta(meta)
                            setMetaDialogOpen(true)
                          }}
                        >
                          <Edit2 className="h-3 w-3 mr-1" />
                          Editar
                        </Button>
                      )}
                      {can(user?.role, 'deleteFinance') && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs text-destructive hover:bg-destructive/10"
                          onClick={() => handleDeleteMeta(meta.id)}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Excluir
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>

          {filteredMetas.length === 0 && (
            <div className="text-center py-12 text-sm text-muted-foreground">
              Nenhuma meta cadastrada no contexto ativo.
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIÁLOGOS */}
      <ProjetoDialog
        open={projDialogOpen}
        onOpenChange={setProjDialogOpen}
        projeto={editingProjeto}
        onSuccess={loadAll}
      />

      <TarefaDialog
        open={tarefaDialogOpen}
        onOpenChange={setTarefaDialogOpen}
        tarefa={editingTarefa}
        defaultEtapa={targetEtapaNovaTarefa}
        defaultProjetoId={
          selectedProjetoFilter !== 'todos' && selectedProjetoFilter !== 'avulsas'
            ? selectedProjetoFilter
            : undefined
        }
        onSuccess={loadAll}
        onAgendarNaAgenda={handleAgendarTarefa}
      />

      <MetaDialog
        open={metaDialogOpen}
        onOpenChange={setMetaDialogOpen}
        meta={editingMeta}
        onSuccess={loadAll}
      />

      <EventoDialog
        open={agendaDialogOpen}
        onOpenChange={setAgendaDialogOpen}
        initialTitulo={agendandoTitulo}
        initialDate={agendandoData}
        onSuccess={() => {
          toast({ title: 'Tarefa agendada na sua Agenda com sucesso!' })
        }}
      />
    </div>
  )
}
