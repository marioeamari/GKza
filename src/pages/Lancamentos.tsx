import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  CheckCircle2,
  Clock,
  ExternalLink,
  Filter,
  Inbox,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Send,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { AprovarPendenteDialog } from '@/components/AprovarPendenteDialog'
import { LancamentoDialog } from '@/components/LancamentoDialog'
import { EmptyState, LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PermissionButton } from '@/components/PermissionButton'
import { StatusBadge } from '@/components/StatusBadge'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { escapeFilter, formatCurrency, formatDate, monthParam } from '@/lib/format'
import { can } from '@/lib/permissions'
import { cadastrosService } from '@/services/cadastros'
import { financeService } from '@/services/finance'
import { telegramPendentesService } from '@/services/telegramPendentes'
import type {
  Categoria,
  Conta,
  Empresa,
  Lancamento,
  Pessoa,
  TelegramRegistroPendente,
} from '@/types/domain'

const dateKey = (value: string) => value.slice(0, 10)

export default function Lancamentos() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { activeContext } = useAppContext()
  const [params, setParams] = useSearchParams()

  // Aba selecionada: 'todos' ou 'pendentes' (via query param ?aba=pendentes)
  const activeTab = params.get('aba') === 'pendentes' ? 'pendentes' : 'todos'

  const [records, setRecords] = useState<Lancamento[]>([])
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [pessoas, setPessoas] = useState<Pessoa[]>([])
  const [page, setPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Lancamento | null>(null)
  const [deleting, setDeleting] = useState<Lancamento | null>(null)
  const [mobileFilters, setMobileFilters] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)

  // Estado da aba "Pendentes"
  const [pendentes, setPendentes] = useState<TelegramRegistroPendente[]>([])
  const [loadingPendentes, setLoadingPendentes] = useState(false)
  const [pendentesCount, setPendentesCount] = useState(0)
  const [itemParaAprovar, setItemParaAprovar] = useState<TelegramRegistroPendente | null>(null)
  const [aprovarDialog, setAprovarDialog] = useState(false)
  const [itemParaDescartar, setItemParaDescartar] = useState<TelegramRegistroPendente | null>(null)

  const filter = useMemo(() => {
    const filters: string[] = []
    const search = params.get('busca')
    const tipo = params.get('tipo')
    const status = params.get('status')
    const month = params.get('mes')
    const conta = params.get('conta')
    const categoria = params.get('categoria')
    if (search) filters.push(`descricao ~ '${escapeFilter(search)}'`)
    if (tipo) filters.push(`tipo = '${tipo}'`)
    if (status) filters.push(`status = '${status}'`)
    if (month) filters.push(`data >= '${month}-01 00:00:00' && data < '${month}-32 00:00:00'`)
    if (conta) filters.push(`conta = '${conta}'`)
    if (categoria) filters.push(`categoria = '${categoria}'`)

    // Filtro pelo contexto ativo (se não for "Todos")
    if (!activeContext.isAll && activeContext.contaIds.length > 0) {
      const contaClauses = activeContext.contaIds.map((id) => `conta = '${id}'`).join(' || ')
      filters.push(`(${contaClauses})`)
    }

    return filters.join(' && ')
  }, [params, activeContext])

  const loadLancamentos = useCallback(
    async (targetPage = 1, append = false) => {
      if (append) setLoadingMore(true)
      else setLoading(true)
      try {
        const result = await financeService.pageLancamentos(
          targetPage,
          25,
          filter ? { filter } : undefined,
        )
        setRecords((current) => (append ? [...current, ...result.items] : result.items))
        setPage(result.page)
        setTotalPages(result.totalPages)
      } catch (error) {
        toast({
          variant: 'destructive',
          title: 'Falha ao carregar lançamentos',
          description: apiMessage(error),
        })
      } finally {
        setLoading(false)
        setLoadingMore(false)
      }
    },
    [filter, toast],
  )

  const loadPendentes = useCallback(async () => {
    setLoadingPendentes(true)
    try {
      const items = await telegramPendentesService.listPendentes()
      setPendentes(items)
      setPendentesCount(items.length)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar registros pendentes',
        description: apiMessage(error),
      })
    } finally {
      setLoadingPendentes(false)
    }
  }, [toast])

  const refreshCounters = useCallback(() => {
    telegramPendentesService.countPendentes().then((count) => setPendentesCount(count))
  }, [])

  useEffect(() => {
    Promise.all([
      financeService.listContas(),
      financeService.listCategorias(),
      cadastrosService.listEmpresas(),
      cadastrosService.listPessoas(),
    ])
      .then(([a, b, c, d]) => {
        setContas(a)
        setCategorias(b)
        setEmpresas(c)
        setPessoas(d)
      })
      .catch(() => {})

    refreshCounters()
  }, [refreshCounters])

  useEffect(() => {
    if (activeTab === 'todos') {
      loadLancamentos(1)
    } else {
      loadPendentes()
    }
  }, [activeTab, loadLancamentos, loadPendentes])

  useEffect(() => {
    const editId = params.get('editar')
    if (editId && records.length) {
      const found = records.find((item) => item.id === editId)
      if (found) {
        setEditing(found)
        setDialog(true)
      }
    }
  }, [params, records])

  useEffect(() => {
    const node = loaderRef.current
    if (!node || page >= totalPages || activeTab !== 'todos') return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && window.innerWidth < 1024 && !loadingMore)
          loadLancamentos(page + 1, true)
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadLancamentos, loadingMore, page, totalPages, activeTab])

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    next.delete('editar')
    setParams(next, { replace: true })
  }

  const handleTabChange = (tab: string) => {
    const next = new URLSearchParams(params)
    if (tab === 'pendentes') {
      next.set('aba', 'pendentes')
    } else {
      next.delete('aba')
    }
    setParams(next, { replace: true })
  }

  const openNew = () => {
    setEditing(null)
    setDialog(true)
  }

  const deleteRecord = async () => {
    if (!deleting) return
    try {
      await financeService.deleteLancamento(deleting.id)
      setRecords((current) => current.filter((item) => item.id !== deleting.id))
      toast({ title: 'Lançamento excluído' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir',
        description: apiMessage(error),
      })
    } finally {
      setDeleting(null)
    }
  }

  const handleDescartarPendente = async () => {
    if (!itemParaDescartar) return
    try {
      await telegramPendentesService.descartarPendente(itemParaDescartar.id)
      setPendentes((current) => current.filter((i) => i.id !== itemParaDescartar.id))
      setPendentesCount((prev) => Math.max(0, prev - 1))
      toast({ title: 'Registro pendente descartado' })
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao descartar',
        description: apiMessage(error),
      })
    } finally {
      setItemParaDescartar(null)
    }
  }

  const handleApprovedSuccess = () => {
    loadPendentes()
    refreshCounters()
    if (activeTab === 'todos') {
      loadLancamentos(1)
    }
  }

  const groups = useMemo(
    () =>
      records.reduce<Record<string, Lancamento[]>>((result, item) => {
        ;(result[dateKey(item.data)] ||= []).push(item)
        return result
      }, {}),
    [records],
  )

  const filterControls = (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      <Select value={params.get('tipo') || 'all'} onValueChange={(v) => setFilter('tipo', v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os tipos</SelectItem>
          <SelectItem value="receita">Receitas</SelectItem>
          <SelectItem value="despesa">Despesas</SelectItem>
        </SelectContent>
      </Select>
      <Select value={params.get('status') || 'all'} onValueChange={(v) => setFilter('status', v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todos os status</SelectItem>
          <SelectItem value="pendente">Pendentes</SelectItem>
          <SelectItem value="pago">Pagos</SelectItem>
        </SelectContent>
      </Select>
      <Input
        type="month"
        value={params.get('mes') || ''}
        onChange={(e) => setFilter('mes', e.target.value)}
        max={monthParam(new Date(2100, 0, 1))}
      />
      <Select value={params.get('conta') || 'all'} onValueChange={(v) => setFilter('conta', v)}>
        <SelectTrigger>
          <SelectValue placeholder="Conta" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as contas</SelectItem>
          {contas.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={params.get('categoria') || 'all'}
        onValueChange={(v) => setFilter('categoria', v)}
      >
        <SelectTrigger>
          <SelectValue placeholder="Categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Todas as categorias</SelectItem>
          {categorias.map((item) => (
            <SelectItem key={item.id} value={item.id}>
              {item.nome}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )

  return (
    <>
      <PageHeader
        title="Lançamentos"
        description={`Todas as entradas, saídas e aprovações no contexto ${activeContext.label}.`}
        action={
          <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo lançamento
          </PermissionButton>
        }
      />

      {/* Navegação entre Abas: Lançamentos Oficiais vs Pendentes Telegram */}
      <div className="mb-4">
        <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md bg-white border border-border shadow-soft p-1 h-auto">
            <TabsTrigger
              value="todos"
              className="py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-white transition"
            >
              Lançamentos do Caixa
            </TabsTrigger>
            <TabsTrigger
              value="pendentes"
              className="py-2.5 font-bold data-[state=active]:bg-primary data-[state=active]:text-white transition relative"
            >
              <div className="flex items-center gap-1.5">
                <Send className="h-3.5 w-3.5" />
                <span>Pendentes</span>
                {pendentesCount > 0 && (
                  <Badge
                    variant="secondary"
                    className="ml-1 h-5 px-1.5 text-[11px] font-extrabold bg-amber-500 text-white border-0"
                  >
                    {pendentesCount}
                  </Badge>
                )}
              </div>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      {/* ABA 1: Lançamentos Oficiais */}
      {activeTab === 'todos' && (
        <>
          <div className="sticky top-16 z-20 -mx-4 mb-5 border-y border-border bg-background/95 px-4 py-3 backdrop-blur lg:top-0 lg:mx-0 lg:rounded-2xl lg:border lg:bg-white lg:p-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="pl-10"
                  value={params.get('busca') || ''}
                  onChange={(e) => setFilter('busca', e.target.value)}
                  placeholder="Buscar por descrição..."
                />
              </div>
              <Button
                variant={mobileFilters ? 'default' : 'outline'}
                size="icon"
                className="lg:hidden"
                onClick={() => setMobileFilters(!mobileFilters)}
              >
                <Filter className="h-4 w-4" />
              </Button>
            </div>
            <div className={`${mobileFilters ? 'mt-3 block' : 'hidden'} lg:mt-3 lg:block`}>
              {filterControls}
            </div>
            {[...params.keys()].some((key) => key !== 'editar' && key !== 'aba') && (
              <button
                onClick={() => {
                  const next = new URLSearchParams()
                  setParams(next)
                }}
                className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-primary"
              >
                <X className="h-3.5 w-3.5" />
                Limpar filtros
              </button>
            )}
          </div>

          {loading ? (
            <LoadingState />
          ) : records.length === 0 ? (
            <EmptyState
              title="Nenhum lançamento encontrado"
              description="Ajuste os filtros ou registre a primeira movimentação deste período."
              action={
                <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={openNew}>
                  Criar lançamento
                </PermissionButton>
              }
            />
          ) : (
            <div className="space-y-6">
              {Object.entries(groups).map(([date, items], groupIndex) => {
                const total = items.reduce(
                  (sum, item) => sum + (item.tipo === 'receita' ? item.valor : -item.valor),
                  0,
                )
                return (
                  <section
                    key={date}
                    className="rise-in"
                    style={{ animationDelay: `${Math.min(groupIndex, 6) * 50}ms` }}
                  >
                    <header className="mb-2 flex items-center justify-between px-1">
                      <span className="flex items-center gap-2 text-sm font-extrabold">
                        <CalendarDays className="h-4 w-4 text-muted-foreground" />
                        {formatDate(date, { weekday: 'long', day: '2-digit', month: 'long' })}
                      </span>
                      <span
                        className={`text-xs font-bold tabular-nums ${total >= 0 ? 'text-success' : 'text-primary'}`}
                      >
                        {total >= 0 ? '+' : '−'} {formatCurrency(Math.abs(total))}
                      </span>
                    </header>
                    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft">
                      {items.map((item) => (
                        <div
                          key={item.id}
                          className="group flex cursor-pointer items-center gap-3 border-b border-border p-3 transition last:border-0 hover:bg-secondary/40 sm:p-4"
                          onClick={() => {
                            if (can(user?.role, 'writeFinance')) {
                              setEditing(item)
                              setDialog(true)
                            }
                          }}
                        >
                          <span
                            className="h-10 w-1 shrink-0 rounded-full"
                            style={{ background: item.expand?.categoria?.cor || '#8A8078' }}
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-bold">
                              {item.descricao}
                            </span>
                            <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                              {item.expand?.conta?.nome || 'Conta'}
                              <span>•</span>
                              {item.expand?.categoria?.nome || 'Categoria'}
                              <span className="sm:hidden">
                                <StatusBadge status={item.status} />
                              </span>
                            </span>
                          </span>
                          <span className="hidden sm:block">
                            <StatusBadge status={item.status} />
                          </span>
                          <span
                            className={`min-w-[110px] text-right text-sm font-extrabold tabular-nums ${item.tipo === 'receita' ? 'text-success' : 'text-primary'}`}
                          >
                            {item.tipo === 'receita' ? '+' : '−'} {formatCurrency(item.valor)}
                          </span>
                          {can(user?.role, 'writeFinance') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="hidden h-8 w-8 sm:group-hover:inline-flex"
                              onClick={(e) => {
                                e.stopPropagation()
                                setEditing(item)
                                setDialog(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {can(user?.role, 'deleteFinance') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="hidden h-8 w-8 text-destructive sm:group-hover:inline-flex"
                              onClick={(e) => {
                                e.stopPropagation()
                                setDeleting(item)
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )
              })}
              <div ref={loaderRef} className="flex justify-center py-4">
                {page < totalPages && (
                  <Button
                    variant="outline"
                    className="hidden lg:inline-flex"
                    disabled={loadingMore}
                    onClick={() => loadLancamentos(page + 1, true)}
                  >
                    {loadingMore && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Carregar
                    mais
                  </Button>
                )}
                {loadingMore && (
                  <LoaderCircle className="h-5 w-5 animate-spin text-primary lg:hidden" />
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* ABA 2: Pendentes Telegram */}
      {activeTab === 'pendentes' && (
        <div className="space-y-4">
          <div className="rounded-2xl border border-border bg-white p-4 shadow-soft">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-extrabold flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  Comprovantes recebidos pelo Telegram
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Registros confirmados no bot aguardando sua conferência e aprovação para entrar no
                  caixa.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={loadPendentes}
                disabled={loadingPendentes}
                className="font-bold text-xs"
              >
                {loadingPendentes ? (
                  <LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Clock className="mr-1.5 h-3.5 w-3.5" />
                )}
                Atualizar lista
              </Button>
            </div>
          </div>

          {loadingPendentes ? (
            <LoadingState />
          ) : pendentes.length === 0 ? (
            <EmptyState
              title="Nenhum registro pendente"
              description="Quando você enviar um comprovante no Telegram e clicar em ✅ Confirmar, ele aparecerá aqui para você aprovar."
              action={
                <Button
                  variant="outline"
                  onClick={() => handleTabChange('todos')}
                  className="font-bold"
                >
                  <Inbox className="mr-2 h-4 w-4" />
                  Ver Lançamentos do Caixa
                </Button>
              }
            />
          ) : (
            <div className="space-y-3">
              {pendentes.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-border bg-white p-4 sm:p-5 shadow-soft hover:border-primary/40 transition flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2 flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-extrabold ${
                          item.tipo === 'receita'
                            ? 'bg-success/10 text-success'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {item.tipo === 'receita' ? '🟢 Receita' : '🔴 Despesa'}
                      </span>
                      <span className="text-sm font-extrabold text-foreground truncate">
                        {item.descricao}
                      </span>
                      {item.contexto_nome && (
                        <Badge variant="outline" className="text-xs bg-secondary/50">
                          {item.contexto_nome}
                        </Badge>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>
                        <strong className="text-foreground">Data:</strong> {formatDate(item.data)}
                      </span>
                      <span>
                        <strong className="text-foreground">Conta:</strong>{' '}
                        {item.expand?.conta?.nome || 'A definir'}
                      </span>
                      <span>
                        <strong className="text-foreground">Categoria:</strong>{' '}
                        {item.expand?.categoria?.nome || 'A definir'}
                      </span>
                      <span>
                        <strong className="text-foreground">Recebido:</strong>{' '}
                        {formatDate(item.created, {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {item.comprovante_texto && (
                      <p className="text-[11px] text-muted-foreground line-clamp-1 italic bg-secondary/30 px-2 py-1 rounded">
                        "{item.comprovante_texto}"
                      </p>
                    )}
                  </div>

                  <div className="flex items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-border">
                    <div className="text-left md:text-right">
                      <span className="block text-[11px] uppercase tracking-wider text-muted-foreground font-bold">
                        Valor
                      </span>
                      <span
                        className={`text-lg font-black tabular-nums ${
                          item.tipo === 'receita' ? 'text-success' : 'text-primary'
                        }`}
                      >
                        {formatCurrency(item.valor)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs text-destructive hover:bg-destructive/10 hover:text-destructive font-bold h-9 px-3"
                        onClick={() => setItemParaDescartar(item)}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Descartar
                      </Button>

                      <Button
                        size="sm"
                        className="text-xs bg-primary hover:bg-primary/90 text-white font-extrabold h-9 px-4 shadow-sm"
                        onClick={() => {
                          setItemParaAprovar(item)
                          setAprovarDialog(true)
                        }}
                      >
                        <CheckCircle2 className="mr-1.5 h-4 w-4" />
                        Aprovar e lançar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Diálogo de criação/edição padrão de lançamentos */}
      <LancamentoDialog
        open={dialog}
        onOpenChange={(open) => {
          setDialog(open)
          if (!open) {
            setEditing(null)
            const next = new URLSearchParams(params)
            next.delete('editar')
            setParams(next, { replace: true })
          }
        }}
        contas={contas}
        categorias={categorias}
        empresas={empresas}
        pessoas={pessoas}
        lancamento={editing}
        onSaved={() => loadLancamentos(1)}
      />

      {/* Diálogo de conferência e aprovação do Registro Pendente vindo do Telegram */}
      <AprovarPendenteDialog
        open={aprovarDialog}
        onOpenChange={(open) => {
          setAprovarDialog(open)
          if (!open) setItemParaAprovar(null)
        }}
        item={itemParaAprovar}
        contas={contas}
        categorias={categorias}
        empresas={empresas}
        pessoas={pessoas}
        onApproved={handleApprovedSuccess}
      />

      {/* Confirmação de exclusão de lançamento oficial */}
      <AlertDialog open={!!deleting} onOpenChange={(open) => !open && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir lançamento?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove “{deleting?.descricao}” e recalcula os saldos. Não é possível
              desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteRecord}
              className="bg-destructive hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirmação de descarte de registro pendente */}
      <AlertDialog
        open={!!itemParaDescartar}
        onOpenChange={(open) => !open && setItemParaDescartar(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar comprovante pendente?</AlertDialogTitle>
            <AlertDialogDescription>
              O comprovante “{itemParaDescartar?.descricao}” no valor de{' '}
              {itemParaDescartar && formatCurrency(itemParaDescartar.valor)} não será lançado no
              caixa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDescartarPendente}
              className="bg-destructive hover:bg-destructive/90"
            >
              Sim, descartar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
