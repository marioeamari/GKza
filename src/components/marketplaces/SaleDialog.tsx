import { useEffect, useMemo, useState } from 'react'
import { Calculator, LoaderCircle, Save } from 'lucide-react'
import { MoneyInput } from '@/components/MoneyInput'
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
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { dateOnly, formatCurrency, toPocketBaseDate } from '@/lib/format'
import { marketplacesService } from '@/services/marketplaces'
import type { MarketplaceConta, SaleStatus, Venda } from '@/types/domain'

export function SaleDialog({
  open,
  onOpenChange,
  record,
  contas,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  record: Venda | null
  contas: MarketplaceConta[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({
      pedido_id: '',
      marketplace_conta: '',
      data: new Date().toISOString().slice(0, 10),
      valor_bruto: 0,
      comissao: 0,
      taxas: 0,
      status: 'pendente' as SaleStatus,
    }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const liquid = Math.max(
    0,
    Math.round((form.valor_bruto - form.comissao - form.taxas) * 100) / 100,
  )
  useEffect(() => {
    if (open) {
      setForm(
        record
          ? {
              pedido_id: record.pedido_id,
              marketplace_conta: record.marketplace_conta,
              data: dateOnly(record.data),
              valor_bruto: record.valor_bruto,
              comissao: record.comissao,
              taxas: record.taxas,
              status: record.status,
            }
          : {
              pedido_id: '',
              marketplace_conta: contas.find((c) => c.ativa)?.id || '',
              data: new Date().toISOString().slice(0, 10),
              valor_bruto: 0,
              comissao: 0,
              taxas: 0,
              status: 'pendente',
            },
      )
      setErrors({})
    }
  }, [open, record, contas])
  const selected = useMemo(
    () => contas.find((c) => c.id === form.marketplace_conta),
    [contas, form.marketplace_conta],
  )
  const setGross = (valor_bruto: number) =>
    setForm({
      ...form,
      valor_bruto,
      comissao: Math.round(valor_bruto * (selected?.comissao_percentual || 0)) / 100,
    })
  const setAccount = (marketplace_conta: string) => {
    const c = contas.find((a) => a.id === marketplace_conta)
    setForm({
      ...form,
      marketplace_conta,
      comissao: Math.round(form.valor_bruto * (c?.comissao_percentual || 0)) / 100,
    })
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.pedido_id.trim()) next.pedido_id = 'Informe o código do pedido.'
    if (!form.marketplace_conta) next.marketplace_conta = 'Selecione a conta.'
    if (form.valor_bruto <= 0) next.valor_bruto = 'Informe o valor bruto.'
    if (form.comissao + form.taxas > form.valor_bruto)
      next.valor_bruto = 'Comissão e taxas não podem superar o valor bruto.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await marketplacesService.saveVenda(
        { ...form, data: toPocketBaseDate(form.data), valor_liquido: liquid },
        record?.id,
      )
      toast({
        title: 'Venda salva',
        description:
          form.status === 'paga'
            ? 'O lançamento financeiro será criado automaticamente.'
            : 'Os valores foram conciliados.',
      })
      onOpenChange(false)
      onSaved()
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{record ? 'Editar venda' : 'Registrar venda'}</DialogTitle>
          <DialogDescription>
            A comissão é sugerida pela conta e pode ser ajustada.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Pedido</Label>
              <Input
                value={form.pedido_id}
                onChange={(e) => setForm({ ...form, pedido_id: e.target.value })}
                placeholder="Ex.: MLB-123456"
              />
              {errors.pedido_id && <p className="field-error">{errors.pedido_id}</p>}
            </div>
            <div className="space-y-2">
              <Label>Data</Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
              />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Conta de marketplace</Label>
              <Select value={form.marketplace_conta} onValueChange={setAccount}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {contas
                    .filter((c) => c.ativa || c.id === form.marketplace_conta)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.apelido} · {c.comissao_percentual}%
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.marketplace_conta && (
                <p className="field-error">{errors.marketplace_conta}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label>Valor bruto</Label>
              <MoneyInput value={form.valor_bruto} onChange={setGross} />
            </div>
            <div className="space-y-2">
              <Label>Comissão</Label>
              <MoneyInput
                value={form.comissao}
                onChange={(comissao) => setForm({ ...form, comissao })}
              />
              <p className="text-[11px] text-muted-foreground">
                Sugestão: {selected?.comissao_percentual || 0}%
              </p>
            </div>
            <div className="space-y-2">
              <Label>Outras taxas</Label>
              <MoneyInput value={form.taxas} onChange={(taxas) => setForm({ ...form, taxas })} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status: status as SaleStatus })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="repassada">Repassada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl bg-success-subtle p-4">
            <span className="flex items-center gap-2 text-sm font-bold text-success">
              <Calculator className="h-4 w-4" />
              Valor líquido
            </span>
            <strong className="text-xl tabular-nums text-success">{formatCurrency(liquid)}</strong>
          </div>
          {errors.valor_bruto && <p className="field-error">{errors.valor_bruto}</p>}
          {errors.form && <p className="field-error">{errors.form}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={saving}>
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
