import { useEffect, useMemo, useState } from 'react'
import {
  Archive,
  CreditCard,
  Landmark,
  LoaderCircle,
  Pencil,
  PiggyBank,
  Plus,
  Save,
  Wallet,
} from 'lucide-react'

import { LancamentoDialog } from '@/components/LancamentoDialog'
import { LoadingState } from '@/components/LoadingState'
import { MoneyInput } from '@/components/MoneyInput'
import { PageHeader } from '@/components/PageHeader'
import { PermissionButton } from '@/components/PermissionButton'
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
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { formatCurrency } from '@/lib/format'
import { can } from '@/lib/permissions'
import { financeService } from '@/services/finance'
import type { Categoria, Conta, Lancamento } from '@/types/domain'

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

export default function Contas() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [contas, setContas] = useState<Conta[]>([])
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([])
  const [loading, setLoading] = useState(true)
  const [dialog, setDialog] = useState(false)
  const [editing, setEditing] = useState<Conta | null>(null)
  const [form, setForm] = useState(initial)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [movement, setMovement] = useState<Conta | null>(null)
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
  const AccountCard = ({ account, index }: { account: Conta; index: number }) => {
    const Icon = icons[account.tipo]
    return (
      <article
        className="card-hover rise-in overflow-hidden rounded-2xl border border-border bg-white shadow-soft"
        style={{ animationDelay: `${index * 50}ms` }}
      >
        <div className="h-1.5" style={{ background: account.cor || '#DF5830' }} />
        <div className="p-5">
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
            <div className="flex gap-1">
              {!account.ativa && <Badge variant="secondary">Arquivada</Badge>}
              {can(user?.role, 'writeFinance') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => open(account)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
          <h2 className="mt-5 text-[15px] font-bold">{account.nome}</h2>
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
          <p className="micro-label mt-6">Saldo atual</p>
          <p
            className={`mt-1 text-2xl font-extrabold tabular-nums ${(balances[account.id] || 0) < 0 ? 'text-destructive' : 'text-foreground'}`}
          >
            {formatCurrency(balances[account.id] || 0)}
          </p>
          <PermissionButton
            allowed={can(user?.role, 'writeFinance')}
            variant="outline"
            className="mt-5 w-full"
            onClick={() => setMovement(account)}
          >
            Movimentar
          </PermissionButton>
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
          <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={() => open()}>
            <Plus className="mr-2 h-4 w-4" />
            Nova conta
          </PermissionButton>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {active.map((a, i) => (
          <AccountCard key={a.id} account={a} index={i} />
        ))}
      </div>
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
      <LancamentoDialog
        open={!!movement}
        onOpenChange={(open) => !open && setMovement(null)}
        contas={contas}
        categorias={categorias}
        presetConta={movement?.id}
        onSaved={load}
      />
    </>
  )
}
