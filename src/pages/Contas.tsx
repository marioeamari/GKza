import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  Calendar,
  CreditCard,
  GripVertical,
  Landmark,
  LoaderCircle,
  Pencil,
  PiggyBank,
  Plus,
  Save,
  Wallet,
} from 'lucide-react'

import { EmptyState, LoadingState } from '@/components/LoadingState'
import { MoneyInput } from '@/components/MoneyInput'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { formatCurrency, toPocketBaseDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { ContaContextoWarning } from '@/components/ContaContextoWarning'
import { contextoService } from '@/services/contexto'
import { financeService } from '@/services/finance'
import type {
  Categoria,
  Conta,
  ContaNatureza,
  ContaTipoPagamento,
  Lancamento,
  TransactionType,
} from '@/types/domain'

const colors = ['#DF5830', '#1E6F5C', '#2B5BA8', '#4C3A8C', '#B7791F', '#A8556A', '#61737E']
const labels = {
  bancaria: 'Conta bancária',
  caixa: 'Caixa',
  cartao: 'Cartão',
  marketplace: 'Marketplace',
}
const icons = { bancaria: Landmark, caixa: PiggyBank, cartao: CreditCard, marketplace: Wallet }

export const tiposPagamentoOpcoes: { id: ContaTipoPagamento; label: string }[] = [
  { id: 'credito', label: 'Crédito' },
  { id: 'debito', label: 'Débito' },
  { id: 'transferencia', label: 'Transferência' },
  { id: 'boletos', label: 'Boletos' },
  { id: 'pix', label: 'Pix' },
]

const initial = {
  nome: '',
  tipo: 'bancaria' as Conta['tipo'],
  natureza: 'fisica' as ContaNatureza,
  tipos_pagamento: ['debito', 'transferencia', 'boletos', 'pix'] as ContaTipoPagamento[],
  saldo_inicial: 0,
  cor: '#DF5830',
  ativa: true,
  dia_fechamento: 1,
  dia_vencimento: 10,
  bandeira: '',
}

interface MovementForm {
  tipo: TransactionType
  valor: number
  descricao: string
  categoria: string
  data: string
}

const initialMovement: MovementForm = {
  tipo: 'receita',
  valor: 0,
  descricao: '',
  categoria: '',
  data: new Date().toISOString().slice(0, 10),
}

export default function Contas() {
  const { user } = useAuth()
  const { toast } = useToast()
  const { activeContext, grupos, refreshGrupos } = useAppContext()
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Conta | null>(null)
  const [selectedGrupoIds, setSelectedGrupoIds] = useState<string[]>([])
  const [loadingAccountGroups, setLoadingAccountGroups] = useState(false)
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Estado da movimentação manual de saldo
  const [movementAccount, setMovementAccount] = useState<Conta | null>(null)
  const [movementForm, setMovementForm] = useState<MovementForm>(initialMovement)
  const [movementErrors, setMovementErrors] = useState<Record<string, string>>({})
  const [savingMovement, setSavingMovement] = useState(false)

  const [showArchived, setShowArchived] = useState(false)
  const [draggedContaId, setDraggedContaId] = useState<string | null>(null)
  const [dragOverContaId, setDragOverContaId] = useState<string | null>(null)
  const [isReordering, setIsReordering] = useState(false)

  const handleDragStart = (id: string) => {
    setDraggedContaId(id)
  }

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault()
    if (draggedContaId && draggedContaId !== targetId) {
      setDragOverContaId(targetId)
    }
  }

  const handleDragLeave = () => {
    setDragOverContaId(null)
  }

  const handleDrop = async (targetId: string) => {
    if (!draggedContaId || draggedContaId === targetId) {
      setDraggedContaId(null)
      setDragOverContaId(null)
      return
    }

    // Apenas reordena as contas ativas
    const activeContas = contas.filter((c) => c.ativa)
    const fromIndex = activeContas.findIndex((c) => c.id === draggedContaId)
    const toIndex = activeContas.findIndex((c) => c.id === targetId)

    if (fromIndex === -1 || toIndex === -1) {
      setDraggedContaId(null)
      setDragOverContaId(null)
      return
    }

    const reorderedActive = [...activeContas]
    const [moved] = reorderedActive.splice(fromIndex, 1)
    reorderedActive.splice(toIndex, 0, moved)

    // Atualiza estado otimista imediato
    const archivedContas = contas.filter((c) => !c.ativa)
    const updatedAllContas = [
      ...reorderedActive.map((item, idx) => ({ ...item, ordem: idx + 1 })),
      ...archivedContas,
    ]
    setContas(updatedAllContas)
    setDraggedContaId(null)
    setDragOverContaId(null)
    setIsReordering(true)

    try {
      await financeService.reordenarContas(reorderedActive.map((c) => c.id))
      toast({
        title: 'Ordem das contas atualizada',
        description: 'A nova sequência será respeitada em Lançamentos, Despesas e Contas.',
      })
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar reordenação',
        description: apiMessage(err),
      })
      await load()
    } finally {
      setIsReordering(false)
    }
  }

  const load = async () => {
    try {
      const [a, b, c] = await Promise.all([
        financeService.listContas(),
        financeService.listCategorias(),
        financeService.listLancamentos(),
      ])
      setContas(a)
      setCategorias(b)
      setLancamentos(c)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar contas',
        description: apiMessage(e),
      })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])
  const balances = useMemo(
    () =>
      Object.fromEntries(
        contas.map((account) => [
          account.id,
          account.saldo_inicial +
            lancamentos
              .filter((item) => item.conta === account.id && item.status === 'pago')
              .reduce((sum, item) => sum + (item.tipo === 'receita' ? item.valor : -item.valor), 0),
        ]),
      ),
    [contas, lancamentos],
  )
  const open = async (account?: Conta) => {
    setEditing(account || null)
    setForm(
      account
        ? {
            nome: account.nome,
            tipo: account.tipo,
            natureza: account.natureza || 'fisica',
            tipos_pagamento:
              account.tipos_pagamento && account.tipos_pagamento.length > 0
                ? account.tipos_pagamento
                : account.tipo === 'cartao'
                  ? ['credito']
                  : ['debito', 'transferencia', 'boletos', 'pix'],
            saldo_inicial: account.saldo_inicial,
            cor: account.cor || '#DF5830',
            ativa: account.ativa,
            dia_fechamento: account.dia_fechamento || 1,
            dia_vencimento: account.dia_vencimento || 10,
            bandeira: account.bandeira || '',
          }
        : initial,
    )
    setErrors({})
    setDialog(true)

    if (account) {
      setLoadingAccountGroups(true)
      try {
        const membros = await contextoService.listMembrosByConta(account.id)
        setSelectedGrupoIds(membros.map((m) => m.grupo))
      } catch (err) {
        console.warn('Erro ao carregar grupos da conta:', err)
        setSelectedGrupoIds([])
      } finally {
        setLoadingAccountGroups(false)
      }
    } else {
      // Nova conta: se estiver em um contexto específico, pré-seleciona ele;
      // se estiver em "Todos", pré-seleciona o grupo Casa por padrão
      const grupoCasa = grupos.find((g) => g.nome.toLowerCase() === 'casa')
      if (!activeContext.isAll && activeContext.groupId) {
        setSelectedGrupoIds([activeContext.groupId])
      } else if (grupoCasa) {
        setSelectedGrupoIds([grupoCasa.id])
      } else {
        setSelectedGrupoIds(grupos.slice(0, 1).map((g) => g.id))
      }
      setLoadingAccountGroups(false)
    }
  }

  const toggleGrupoSelection = (grupoId: string) => {
    setSelectedGrupoIds((prev) =>
      prev.includes(grupoId) ? prev.filter((id) => id !== grupoId) : [...prev, grupoId],
    )
  }

  const toggleTipoPagamento = (tipoId: ContaTipoPagamento) => {
    setForm((prev) => {
      const exists = prev.tipos_pagamento.includes(tipoId)
      const next = exists
        ? prev.tipos_pagamento.filter((t) => t !== tipoId)
        : [...prev.tipos_pagamento, tipoId]
      return { ...prev, tipos_pagamento: next }
    })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) return setErrors({ nome: 'Informe o nome da conta.' })
    setSaving(true)
    try {
      const savedConta = await financeService.saveConta(form, editing?.id)
      const targetContaId = editing?.id || savedConta.id

      // Sincroniza vínculos de grupos de contexto para a conta
      if (targetContaId) {
        try {
          // Se for nova conta e o usuário desmarcou tudo, aplica por padrão o grupo "Casa" para nunca nascer órfã
          let gruposToSync = selectedGrupoIds
          if (!editing && gruposToSync.length === 0) {
            const grupoCasa = grupos.find((g) => g.nome.toLowerCase() === 'casa')
            if (grupoCasa) {
              gruposToSync = [grupoCasa.id]
            }
          }
          await contextoService.syncContaGrupos(targetContaId, gruposToSync)
          await refreshGrupos()
        } catch (err) {
          console.warn('Erro ao sincronizar grupos da conta:', err)
        }
      }

      toast({
        title: 'Conta salva',
        description: 'As informações e os vínculos da conta foram atualizados.',
      })
      setDialog(false)
      await load()
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  const openMovement = (account: Conta) => {
    setMovementAccount(account)
    // Categoria padrão de acordo com o tipo inicial 'receita'
    const defaultCat = categorias.find((c) => c.tipo === 'receita')?.id || ''
    setMovementForm({
      tipo: 'receita',
      valor: 0,
      descricao: '',
      categoria: defaultCat,
      data: new Date().toISOString().slice(0, 10),
    })
    setMovementErrors({})
  }

  const handleMovementTypeChange = (tipo: TransactionType) => {
    // Ao alternar tipo, ajusta categoria correspondente caso a atual não seja do tipo
    const validCat = categorias.find((c) => c.tipo === tipo)?.id || ''
    setMovementForm((prev) => ({
      ...prev,
      tipo,
      categoria: categorias.some((c) => c.id === prev.categoria && c.tipo === tipo)
        ? prev.categoria
        : validCat,
    }))
  }

  const saveMovement = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!movementAccount) return

    const errs: Record<string, string> = {}
    if (movementForm.valor <= 0) {
      errs.valor = 'Informe um valor maior que zero.'
    }
    if (!movementForm.descricao.trim()) {
      errs.descricao = 'Informe uma descrição para a movimentação.'
    }

    // Se houver categorias do tipo correspondente e nenhuma estiver selecionada, seleciona a primeira
    let catId = movementForm.categoria
    const availableCategories = categorias.filter((c) => c.tipo === movementForm.tipo)
    if (!catId && availableCategories.length > 0) {
      catId = availableCategories[0].id
    }

    setMovementErrors(errs)
    if (Object.keys(errs).length > 0) return

    setSavingMovement(true)
    try {
      await financeService.saveLancamento({
        descricao: movementForm.descricao.trim(),
        valor: movementForm.valor,
        tipo: movementForm.tipo,
        status: 'pago',
        conta: movementAccount.id,
        categoria: catId || undefined,
        data: toPocketBaseDate(movementForm.data),
        observacoes: `Movimentação registrada em /contas para ${movementAccount.nome}`,
      })

      toast({
        title: 'Movimentação realizada',
        description: `Saldo da conta ${movementAccount.nome} atualizado com sucesso.`,
      })

      setMovementAccount(null)
      await load()
    } catch (error) {
      setMovementErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSavingMovement(false)
    }
  }
  const AccountCard = ({
    account,
    index,
    isDraggable = false,
  }: {
    account: Conta
    index: number
    isDraggable?: boolean
  }) => {
    const Icon = icons[account.tipo]
    const isInActiveGroup = !activeContext.isAll && activeContext.contaIds.includes(account.id)
    const accountGroups = useMemo(
      () => grupos.filter((g) => g.contas.some((c) => c.id === account.id)),
      [account.id],
    )
    const isBeingDragged = draggedContaId === account.id
    const isOver = dragOverContaId === account.id

    return (
      <article
        draggable={isDraggable}
        onDragStart={() => isDraggable && handleDragStart(account.id)}
        onDragOver={(e) => isDraggable && handleDragOver(e, account.id)}
        onDragLeave={handleDragLeave}
        onDrop={() => isDraggable && handleDrop(account.id)}
        className={`card-hover rise-in flex flex-col justify-between overflow-hidden rounded-2xl border bg-white shadow-soft transition select-none ${
          isBeingDragged ? 'opacity-40 scale-95 border-dashed border-primary' : ''
        } ${
          isOver
            ? 'border-primary ring-2 ring-primary/40 bg-primary/5 translate-y-[-2px]'
            : isInActiveGroup
              ? 'border-primary ring-2 ring-primary/20'
              : 'border-border'
        }`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div>
          <div className="h-1.5" style={{ background: account.cor || '#DF5830' }} />
          <div className="p-5 pb-0">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2">
                {isDraggable && (
                  <button
                    type="button"
                    className="cursor-grab active:cursor-grabbing p-1 -ml-1 text-muted-foreground/60 hover:text-foreground transition rounded-md hover:bg-secondary"
                    title="Arraste para reordenar a posição desta conta"
                  >
                    <GripVertical className="h-5 w-5" />
                  </button>
                )}
                <span
                  className="grid h-10 w-10 place-items-center rounded-xl"
                  style={{
                    background: `${account.cor || '#DF5830'}18`,
                    color: account.cor || '#DF5830',
                  }}
                >
                  <Icon className="h-5 w-5" />
                </span>
              </div>
              <div className="flex items-center gap-1">
                {account.ordem && (
                  <span
                    className="text-[10px] font-bold text-muted-foreground px-1.5 py-0.5 rounded bg-secondary"
                    title={`Posição / ordem de exibição: #${account.ordem}`}
                  >
                    #{account.ordem}
                  </span>
                )}
                {!account.ativa && <Badge variant="secondary">Arquivada</Badge>}
                {isInActiveGroup && (
                  <Badge className="bg-primary/10 text-primary border-primary/20 text-[10px]">
                    No contexto ativo
                  </Badge>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 px-2.5 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => open(account)}
                  title="Editar dados da conta"
                >
                  <Pencil className="mr-1.5 h-3.5 w-3.5" />
                  Editar
                </Button>
              </div>
            </div>
            <h2 className="mt-4 text-[16px] font-bold text-foreground">{account.nome}</h2>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <Badge
                variant="secondary"
                className={`text-[10px] font-semibold ${
                  account.natureza === 'juridica'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                }`}
              >
                {account.natureza === 'juridica' ? 'Pessoa Jurídica' : 'Pessoa Física'}
              </Badge>
              {account.tipos_pagamento && account.tipos_pagamento.length > 0 ? (
                account.tipos_pagamento.map((t) => {
                  const opt = tiposPagamentoOpcoes.find((o) => o.id === t)
                  return (
                    <Badge
                      key={t}
                      variant="outline"
                      className="text-[10px] font-medium bg-secondary/40"
                    >
                      {opt?.label || t}
                    </Badge>
                  )
                })
              ) : (
                <span className="text-[11px] text-muted-foreground italic">
                  Sem tipos de pagamento definidos
                </span>
              )}
              {account.tipos_pagamento?.includes('credito') && account.bandeira && (
                <Badge variant="secondary" className="text-[10px]">
                  {account.bandeira}
                </Badge>
              )}
              {account.tipos_pagamento?.includes('credito') && account.dia_fechamento && (
                <span className="text-[11px] text-muted-foreground">
                  Fecha dia {account.dia_fechamento}
                </span>
              )}
              {account.tipos_pagamento?.includes('credito') && account.dia_vencimento && (
                <span className="text-[11px] font-medium text-foreground flex items-center gap-0.5">
                  <Calendar className="h-3 w-3 text-primary" />
                  Vence dia {account.dia_vencimento}
                </span>
              )}
            </div>

            {/* Grupos de contexto vinculados */}
            <div className="mt-3 flex flex-wrap items-center gap-1">
              {accountGroups.length > 0 ? (
                accountGroups.map((g) => (
                  <span
                    key={g.id}
                    className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${g.cor || '#DF5830'}15`,
                      color: g.cor || '#DF5830',
                    }}
                  >
                    <span
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ backgroundColor: g.cor || '#DF5830' }}
                    />
                    {g.nome}
                  </span>
                ))
              ) : (
                <span className="text-[11px] italic text-muted-foreground">
                  Sem grupo vinculado (invisível nos filtros de contexto)
                </span>
              )}
            </div>

            <p className="micro-label mt-4">Saldo atual</p>
            <p
              className={`mt-1 text-2xl font-extrabold tabular-nums ${(balances[account.id] || 0) < 0 ? 'text-destructive' : 'text-foreground'}`}
            >
              {formatCurrency(balances[account.id] || 0)}
            </p>
          </div>
        </div>

        <div className="p-5 pt-5">
          <Button
            className="w-full bg-primary text-white shadow-sm hover:bg-primary/90 font-medium"
            onClick={() => openMovement(account)}
          >
            <ArrowUpDown className="mr-2 h-4 w-4" />
            Movimentar
          </Button>
        </div>
      </article>
    )
  }
  if (loading) return <LoadingState />
  const active = contas.filter((a) => a.ativa),
    archived = contas.filter((a) => !a.ativa)
  return (
    <>
      <PageHeader
        title="Contas"
        description="Acompanhe seus saldos e centralize as movimentações."
        action={
          <Button
            className="bg-primary text-white shadow-sm hover:bg-primary/90"
            onClick={() => open()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Nova conta
          </Button>
        }
      />

      {contas.length === 0 ? (
        <EmptyState
          title="Nenhuma conta cadastrada"
          description="Crie sua primeira conta bancária, caixa ou cartão para gerenciar seus saldos."
          action={
            <Button
              className="bg-primary text-white shadow-sm hover:bg-primary/90"
              onClick={() => open()}
            >
              <Plus className="mr-2 h-4 w-4" />
              Criar primeira conta
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {active.length > 1 && (
            <div className="flex items-center justify-between text-xs text-muted-foreground px-1">
              <span className="flex items-center gap-1.5 font-medium">
                <GripVertical className="h-4 w-4 text-primary" />
                Arraste qualquer conta pelo ícone para reorganizar as posições de exibição.
              </span>
              {isReordering && (
                <span className="inline-flex items-center gap-1 text-primary font-bold">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> Salvando nova ordem...
                </span>
              )}
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {active.map((a, i) => (
              <AccountCard key={a.id} account={a} index={i} isDraggable={active.length > 1} />
            ))}
          </div>
        </div>
      )}
      {archived.length > 0 && (
        <section className="mt-8">
          <button
            className="flex w-full items-center justify-between rounded-xl border border-border bg-white px-4 py-3 text-sm font-bold"
            onClick={() => setShowArchived(!showArchived)}
          >
            <span className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-muted-foreground" />
              Contas arquivadas ({archived.length})
            </span>
            <span>{showArchived ? '−' : '+'}</span>
          </button>
          {showArchived && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {archived.map((a, i) => (
                <AccountCard key={a.id} account={a} index={i} />
              ))}
            </div>
          )}
        </section>
      )}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar conta' : 'Nova conta'}</DialogTitle>
            <DialogDescription>Defina como esta conta aparece nos seus saldos.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Banco PJ"
              />
              {errors.nome && <p className="field-error">{errors.nome}</p>}
            </div>
            <div className="space-y-2">
              <Label>Natureza</Label>
              <Select
                value={form.natureza}
                onValueChange={(natureza) =>
                  setForm({ ...form, natureza: natureza as ContaNatureza })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fisica">Física (CPF)</SelectItem>
                  <SelectItem value="juridica">Jurídica (CNPJ)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Múltiplas escolhas de tipos de pagamento aceitos */}
            <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3.5">
              <div>
                <Label className="text-xs font-bold text-foreground">
                  Tipos de pagamento aceitos nesta conta
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Selecione as formas de pagamento disponíveis (ex.: Débito, Transferência, Boletos,
                  Pix ou Crédito).
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 sm:grid-cols-3">
                {tiposPagamentoOpcoes.map((opcao) => {
                  const checked = form.tipos_pagamento.includes(opcao.id)
                  return (
                    <label
                      key={opcao.id}
                      className={`flex cursor-pointer items-center gap-2 rounded-lg border p-2 text-xs transition select-none ${
                        checked
                          ? 'border-primary bg-primary/10 text-primary font-semibold shadow-2xs'
                          : 'border-border bg-white text-muted-foreground hover:bg-secondary/40'
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleTipoPagamento(opcao.id)}
                      />
                      <span>{opcao.label}</span>
                    </label>
                  )
                })}
              </div>
            </div>
            <div className="space-y-2">
              <Label>Saldo inicial (caixa disponível)</Label>
              <MoneyInput
                value={form.saldo_inicial}
                onChange={(saldo_inicial) => setForm({ ...form, saldo_inicial })}
              />
              <p className="text-xs text-muted-foreground">
                Saldo de partida da conta e caixa disponível para pagamentos (débito, transferência,
                boletos e Pix).
              </p>
            </div>

            {form.tipos_pagamento.includes('credito') && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dia Fechamento da Fatura</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dia_fechamento}
                    onChange={(e) =>
                      setForm({ ...form, dia_fechamento: parseInt(e.target.value, 10) || 1 })
                    }
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Dia Vencimento da Fatura</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={form.dia_vencimento}
                    onChange={(e) =>
                      setForm({ ...form, dia_vencimento: parseInt(e.target.value, 10) || 10 })
                    }
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Bandeira / Emissor (opcional)</Label>
                  <Input
                    placeholder="Ex.: Mastercard, Visa, Elo..."
                    value={form.bandeira}
                    onChange={(e) => setForm({ ...form, bandeira: e.target.value })}
                  />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={`Cor ${c}`}
                    className={`h-9 w-9 rounded-full border-4 transition ${form.cor === c ? 'border-foreground scale-110' : 'border-white ring-1 ring-border'}`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, cor: c })}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <Label>Conta ativa</Label>
                <p className="text-xs text-muted-foreground">Contas inativas ficam arquivadas.</p>
              </div>
              <Switch
                checked={form.ativa}
                onCheckedChange={(ativa) => setForm({ ...form, ativa })}
              />
            </div>

            {/* Grupos de Contexto (para evitar contas órfãs invisíveis em /lancamentos) */}
            <div className="space-y-2 rounded-xl border border-border bg-secondary/20 p-3.5">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-bold text-foreground">Grupos de Contexto</Label>
                  <p className="text-[11px] text-muted-foreground">
                    Selecione onde os lançamentos desta conta devem aparecer.
                  </p>
                </div>
                {selectedGrupoIds.length === 0 && (
                  <Badge
                    variant="outline"
                    className="text-[10px] text-amber-600 border-amber-300 bg-amber-50"
                  >
                    Sem grupo
                  </Badge>
                )}
              </div>

              {loadingAccountGroups ? (
                <div className="flex items-center gap-2 py-2 text-xs text-muted-foreground">
                  <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
                  Carregando grupos...
                </div>
              ) : grupos.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  Nenhum grupo de contexto configurado.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                  {grupos.map((g) => {
                    const checked = selectedGrupoIds.includes(g.id)
                    return (
                      <label
                        key={g.id}
                        className={`flex cursor-pointer items-center gap-2.5 rounded-lg border p-2 text-xs transition select-none ${
                          checked
                            ? 'border-primary bg-primary/5 text-foreground font-medium'
                            : 'border-border bg-white text-muted-foreground hover:bg-secondary/40'
                        }`}
                      >
                        <Checkbox
                          checked={checked}
                          onCheckedChange={() => toggleGrupoSelection(g.id)}
                        />
                        <span
                          className="h-2 w-2 rounded-full shrink-0"
                          style={{ backgroundColor: g.cor || '#DF5830' }}
                        />
                        <span className="truncate">{g.nome}</span>
                      </label>
                    )
                  })}
                </div>
              )}
              {selectedGrupoIds.length === 0 && (
                <p className="text-[11px] text-amber-600">
                  Aviso: se nenhum grupo for selecionado, os lançamentos desta conta só aparecerão
                  quando a visão for "Todos".
                </p>
              )}
            </div>
            {errors.form && <p className="field-error">{errors.form}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(false)}>
                Cancelar
              </Button>
              <Button disabled={saving}>
                {saving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      {/* Dialog dedicado de Movimentação de Saldo */}
      <Dialog
        open={!!movementAccount}
        onOpenChange={(open) => {
          if (!open) {
            setMovementAccount(null)
            setMovementErrors({})
          }
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <ArrowUpDown className="h-4 w-4" />
              </span>
              Movimentar saldo
            </DialogTitle>
            <DialogDescription>
              {movementAccount && (
                <>
                  Registrar entrada ou saída na conta{' '}
                  <strong className="font-semibold text-foreground">{movementAccount.nome}</strong>.
                  O saldo será atualizado imediatamente.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={saveMovement} className="space-y-4">
            {movementAccount && <ContaContextoWarning conta={movementAccount} className="mb-2" />}
            {/* Seletor Tipo: Entrada (receita) ou Saída (despesa) */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Tipo de movimentação</Label>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-secondary/60 p-1">
                <button
                  type="button"
                  onClick={() => handleMovementTypeChange('receita')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition ${
                    movementForm.tipo === 'receita'
                      ? 'bg-success text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ArrowDownLeft className="h-4 w-4" />
                  Entrada (+ Saldo)
                </button>
                <button
                  type="button"
                  onClick={() => handleMovementTypeChange('despesa')}
                  className={`flex items-center justify-center gap-2 rounded-lg py-2 text-xs font-bold transition ${
                    movementForm.tipo === 'despesa'
                      ? 'bg-primary text-white shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <ArrowUpRight className="h-4 w-4" />
                  Saída (− Saldo)
                </button>
              </div>
            </div>

            {/* Valor */}
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold">Valor</Label>
              <MoneyInput
                value={movementForm.valor}
                onChange={(valor) => setMovementForm({ ...movementForm, valor })}
              />
              {movementErrors.valor && <p className="field-error">{movementErrors.valor}</p>}
            </div>

            {/* Descrição */}
            <div className="space-y-1.5">
              <Label htmlFor="mov-descricao" className="text-xs font-semibold">
                Descrição
              </Label>
              <Input
                id="mov-descricao"
                value={movementForm.descricao}
                onChange={(e) => setMovementForm({ ...movementForm, descricao: e.target.value })}
                placeholder={
                  movementForm.tipo === 'receita'
                    ? 'Ex.: Depósito inicial, aporte, transferência recebida'
                    : 'Ex.: Retirada, pagamento avulso, taxa bancária'
                }
              />
              {movementErrors.descricao && (
                <p className="field-error">{movementErrors.descricao}</p>
              )}
            </div>

            {/* Categoria (se houver cadastradas) */}
            {categorias.filter((c) => c.tipo === movementForm.tipo).length > 0 && (
              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Categoria (opcional)</Label>
                <Select
                  value={movementForm.categoria}
                  onValueChange={(categoria) => setMovementForm({ ...movementForm, categoria })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias
                      .filter((c) => c.tipo === movementForm.tipo)
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Data */}
            <div className="space-y-1.5">
              <Label htmlFor="mov-data" className="text-xs font-semibold">
                Data
              </Label>
              <Input
                id="mov-data"
                type="date"
                value={movementForm.data}
                onChange={(e) => setMovementForm({ ...movementForm, data: e.target.value })}
              />
            </div>

            {/* Resumo do impacto no saldo */}
            {movementAccount && (
              <div className="rounded-xl border border-border bg-secondary/30 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Saldo atual:</span>
                  <span className="font-semibold tabular-nums">
                    {formatCurrency(balances[movementAccount.id] || 0)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between border-t border-border/50 pt-1">
                  <span className="text-muted-foreground">Novo saldo após movimentação:</span>
                  <span
                    className={`font-bold tabular-nums ${
                      (balances[movementAccount.id] || 0) +
                        (movementForm.tipo === 'receita'
                          ? movementForm.valor
                          : -movementForm.valor) <
                      0
                        ? 'text-destructive'
                        : 'text-foreground'
                    }`}
                  >
                    {formatCurrency(
                      (balances[movementAccount.id] || 0) +
                        (movementForm.tipo === 'receita'
                          ? movementForm.valor
                          : -movementForm.valor),
                    )}
                  </span>
                </div>
              </div>
            )}

            {movementErrors.form && (
              <p className="field-error rounded-lg bg-destructive/10 p-2.5">
                {movementErrors.form}
              </p>
            )}

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setMovementAccount(null)}
                disabled={savingMovement}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingMovement}
                className="bg-primary text-white hover:bg-primary/90"
              >
                {savingMovement ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Confirmar movimentação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
