import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CalendarDays,
  FileText,
  Filter,
  LoaderCircle,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

import { LancamentoDialog } from '@/components/LancamentoDialog'
import { EmptyState, LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PermissionButton } from '@/components/PermissionButton'
import { StatusBadge } from '@/components/StatusBadge'
import { TitularBadge } from '@/components/TitularBadge'
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
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { FaturaCardGroupRow } from '@/components/cartao/FaturaCardGroupRow'
import { PagarFaturaDialog } from '@/components/cartao/PagarFaturaDialog'
import { apiMessage } from '@/lib/api-error'
import { calcularFaturaCartao, type FaturaCartaoGroup } from '@/lib/cartao-fatura'
import { escapeFilter, formatCurrency, formatDate, monthParam } from '@/lib/format'
import { getFileUrl } from '@/lib/pocketbase/files'
import { can } from '@/lib/permissions'
import { cadastrosService } from '@/services/cadastros'
import { financeService } from '@/services/finance'
import type { Categoria, Conta, Empresa, Lancamento, Pessoa } from '@/types/domain'

const dateKey = (value: string) => value.slice(0, 10)

export default function Lancamentos() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { activeContext } = useAppContext()
  const [params, setParams] = useSearchParams()

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
  const [faturaToPay, setFaturaToPay] = useState<FaturaCartaoGroup | null>(null)
  const [payFaturaOpen, setPayFaturaOpen] = useState(false)
  const loaderRef = useRef<HTMLDivElement>(null)

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

    if (activeContext.contaIds.length > 0) {
      const contaClauses = activeContext.contaIds.map((id) => `conta = '${id}'`)
      // Rede de segurança: contas sem nenhum grupo vinculado não podem ficar invisíveis
      if (activeContext.linkedContaIds.length > 0) {
        const linkedClauses = activeContext.linkedContaIds
          .map((id) => `conta != '${id}'`)
          .join(' && ')
        contaClauses.push(`(${linkedClauses})`)
      }
      filters.push(`(${contaClauses.join(' || ')})`)
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

    loadLancamentos(1)
  }, [loadLancamentos])

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
    if (!node || page >= totalPages) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && window.innerWidth < 1024 && !loadingMore)
          loadLancamentos(page + 1, true)
      },
      { rootMargin: '200px' },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [loadLancamentos, loadingMore, page, totalPages])

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    next.delete('editar')
    setParams(next, { replace: true })
  }

  const openNew = () => {
    setEditing(null)
    setDialog(true)
  }

  const deleteRecord = async () => {
    if (!deleting) return
    try {
      // Se for pagamento de fatura, estornar o vínculo com as compras do cartão
      if (deleting.is_pagamento_fatura && deleting.cartao_fatura_conta && deleting.competencia) {
        await financeService.estornarPagamentoFaturaCartao({
          pagamentoLancamentoId: deleting.id,
          cartaoContaId: deleting.cartao_fatura_conta,
          competencia: deleting.competencia,
        })
      } else {
        await financeService.deleteLancamento(deleting.id)
      }
      setRecords((current) => current.filter((item) => item.id !== deleting.id))
      loadLancamentos(1)
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

  const handlePagarFatura = (fatura: FaturaCartaoGroup) => {
    setFaturaToPay(fatura)
    setPayFaturaOpen(true)
  }

  const handleEstornarFatura = async (fatura: FaturaCartaoGroup) => {
    try {
      await financeService.estornarPagamentoFaturaCartao({
        pagamentoLancamentoId: fatura.pagamentoLancamentoId || '',
        cartaoContaId: fatura.conta.id,
        competencia: fatura.competencia,
      })
      toast({
        title: 'Baixa desfeita com sucesso',
        description: `A fatura voltou para o status pendente e o estorno foi aplicado.`,
      })
      loadLancamentos(1)
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao desfazer baixa',
        description: apiMessage(err),
      })
    }
  }

  // Mapa de contas por ID para consulta rápida
  const contasMap = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas])

  /**
   * Separação de Lançamentos:
   * 1. Compras em contas do tipo "cartao" são agrupadas por Fatura (conta + competência da fatura)
   * 2. Demais lançamentos (bancários, caixa, pagamentos de fatura) são agrupados pela data do evento
   */
  const { faturasGrouped, regularGroups } = useMemo(() => {
    const faturasMap = new Map<string, FaturaCartaoGroup>()
    const regularMap: Record<string, Lancamento[]> = {}

    for (const item of records) {
      const contaObj = item.expand?.conta || contasMap.get(item.conta)
      const isCartao = contaObj?.tipo === 'cartao'

      if (isCartao) {
        // Compra no cartão -> calcula ciclo e agrupa por fatura
        const ciclo = calcularFaturaCartao(contaObj, item.data)
        const comp = item.competencia || ciclo.competencia
        const groupKey = `${item.conta}_${comp}`

        if (!faturasMap.has(groupKey)) {
          faturasMap.set(groupKey, {
            id: groupKey,
            conta: contaObj,
            competencia: comp,
            dataFechamento: ciclo.dataFechamento,
            dataVencimento: ciclo.dataVencimento,
            totalFatura: 0,
            paga: true,
            pagamentoLancamentoId: item.fatura_pagamento_id,
            itens: [],
          })
        }

        const fatura = faturasMap.get(groupKey)!
        fatura.itens.push(item)
        fatura.totalFatura += item.valor
        if (!item.fatura_paga && item.status !== 'pago') {
          fatura.paga = false
        }
        if (item.fatura_pagamento_id) {
          fatura.pagamentoLancamentoId = item.fatura_pagamento_id
        }
      } else {
        // Lançamento normal de caixa / banco
        const k = dateKey(item.data)
        ;(regularMap[k] ||= []).push(item)
      }
    }

    return {
      faturasGrouped: Array.from(faturasMap.values()).sort((a, b) =>
        b.dataFechamento.localeCompare(a.dataFechamento),
      ),
      regularGroups: regularMap,
    }
  }, [records, contasMap])

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
        description={`Todas as entradas e saídas do caixa no contexto ${activeContext.label}.`}
        action={
          <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={openNew}>
            <Plus className="mr-2 h-4 w-4" />
            Novo lançamento
          </PermissionButton>
        }
      />

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
        {[...params.keys()].some((key) => key !== 'editar') && (
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
          {/* Se houver Faturas de Cartão de Crédito agrupadas, exibi-las em destaque no topo */}
          {faturasGrouped.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Faturas de Cartão de Crédito ({faturasGrouped.length})
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Baixa consolidada por ciclo de fechamento
                </span>
              </div>
              <div className="space-y-3">
                {faturasGrouped.map((fatura) => (
                  <FaturaCardGroupRow
                    key={fatura.id}
                    fatura={fatura}
                    canWrite={can(user?.role, 'writeFinance')}
                    canDelete={can(user?.role, 'deleteFinance')}
                    onPagarFatura={handlePagarFatura}
                    onEstornarFatura={handleEstornarFatura}
                    onEditItem={(item) => {
                      setEditing(item)
                      setDialog(true)
                    }}
                    onDeleteItem={(item) => setDeleting(item)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Lançamentos do dia a dia (Caixa, Bancos e Pagamentos de Faturas) */}
          {Object.entries(regularGroups).map(([date, items], groupIndex) => {
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
                        <span className="block truncate text-sm font-bold flex items-center gap-1.5">
                          {item.descricao}
                          {item.is_pagamento_fatura && (
                            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                              Pagamento de Fatura
                            </span>
                          )}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                          {item.expand?.conta?.nome || 'Conta'}
                          <span>•</span>
                          {item.expand?.categoria?.nome || 'Categoria'}
                          <TitularBadge lancamento={item} />
                          {item.comprovante && (
                            <a
                              href={getFileUrl('lancamentos', item.id, item.comprovante)}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(e) => e.stopPropagation()}
                              className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
                              title="Ver comprovante"
                            >
                              <FileText className="h-3 w-3" />
                              Comprovante
                            </a>
                          )}
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
                {loadingMore && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}Carregar mais
              </Button>
            )}
            {loadingMore && (
              <LoaderCircle className="h-5 w-5 animate-spin text-primary lg:hidden" />
            )}
          </div>
        </div>
      )}

      {/* Diálogo de Baixa de Fatura Inteira */}
      <PagarFaturaDialog
        open={payFaturaOpen}
        onOpenChange={setPayFaturaOpen}
        fatura={faturaToPay}
        contas={contas}
        categorias={categorias}
        onSuccess={() => {
          loadLancamentos(1)
        }}
      />

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
    </>
  )
}
