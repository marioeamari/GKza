import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  ArrowDownLeft,
  ArrowUpDown,
  ArrowUpRight,
  CreditCard,
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
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { formatCurrency, toPocketBaseDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { financeService } from '@/services/finance'
import type { Categoria, Conta, Lancamento, TransactionType } from '@/types/domain'

const colors = ['#DF5830', '#1E6F5C', '#2B5BA8', '#4C3A8C', '#B7791F', '#A8556A', '#61737E']
const labels = {
  bancaria: 'Conta bancária',
  caixa: 'Caixa',
  cartao: 'Cartão',
  marketplace: 'Marketplace',
}
const icons = { bancaria: Landmark, caixa: PiggyBank, cartao: CreditCard, marketplace: Wallet }
const initial = {
  nome: '',
  tipo: 'bancaria' as Conta['tipo'],
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
  const { activeContext } = useAppContext()
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Conta | null>(null)
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Estado da movimentação manual de saldo
  const [movementAccount, setMovementAccount] = useState<Conta | null>(null)
  const [movementForm, setMovementForm] = useState<MovementForm>(initialMovement)
  const [movementErrors, setMovementErrors] = useState<Record<string, string>>({})
  const [savingMovement, setSavingMovement] = useState(false)

  const [showArchived, setShowArchived] = useState(false)
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
  const open = (account?: Conta) => {
    setEditing(account || null)
    setForm(
      account
        ? {
            nome: account.nome,
            tipo: account.tipo,
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
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) return setErrors({ nome: 'Informe o nome da conta.' })
    setSaving(true)
    try {
      await financeService.saveConta(form, editing?.id)
      toast({ title: 'Conta salva', description: 'As informações da conta foram atualizadas.' })
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
  const AccountCard = ({ account, index }: { account: Conta; index: number }) => {
    const Icon = icons[account.tipo]
    const isInActiveGroup = !activeContext.isAll && activeContext.contaIds.includes(account.id)

    return (
      <article
        className={`card-hover rise-in flex flex-col justify-between overflow-hidden rounded-2xl border bg-white shadow-soft transition ${
          isInActiveGroup ? 'border-primary ring-2 ring-primary/20' : 'border-border'
        }`}
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div>
          <div className="h-1.5" style={{ background: account.cor || '#DF5830' }} />
          <div className="p-5 pb-0">
            <div className="flex items-start justify-between">
              <span
                className="grid h-10 w-10 place-items-center rounded-xl"
                style={{
                  background: `${account.cor || '#DF5830'}18`,
                  color: account.cor || '#DF5830',
                }}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div className="flex items-center gap-1">
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
              <Badge variant="outline">{labels[account.tipo]}</Badge>
              {account.tipo === 'cartao' && account.bandeira && (
                <Badge variant="secondary" className="text-[10px]">
                  {account.bandeira}
                </Badge>
              )}
              {account.tipo === 'cartao' && account.dia_vencimento && (
                <span className="text-[11px] text-muted-foreground">
                  Vence dia {account.dia_vencimento}
                </span>
              )}
            </div>
            <p className="micro-label mt-5">Saldo atual</p>
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
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {active.map((a, i) => (
            <AccountCard key={a.id} account={a} index={i} />
          ))}
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
              <Label>Tipo</Label>
              <Select
                value={form.tipo}
                onValueChange={(tipo) => setForm({ ...form, tipo: tipo as Conta['tipo'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(labels).map(([v, l]) => (
                    <SelectItem value={v} key={v}>
                      {l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Saldo inicial</Label>
              <MoneyInput
                value={form.saldo_inicial}
                onChange={(saldo_inicial) => setForm({ ...form, saldo_inicial })}
              />
              <p className="text-xs text-muted-foreground">
                Use o saldo da conta antes do primeiro lançamento.
              </p>
            </div>

            {form.tipo === 'cartao' && (
              <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-secondary/30 p-3">
                <div className="space-y-1">
                  <Label className="text-xs">Dia Fechamento</Label>
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
                  <Label className="text-xs">Dia Vencimento</Label>
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
