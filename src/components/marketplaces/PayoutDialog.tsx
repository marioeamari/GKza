import { useEffect, useState } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
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
import { dateOnly, toPocketBaseDate } from '@/lib/format'
import { marketplacesService } from '@/services/marketplaces'
import type { MarketplaceConta, Repasse } from '@/types/domain'

export function PayoutDialog({
  open,
  onOpenChange,
  contas,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  contas: MarketplaceConta[]
  onSaved: () => void
}) {
  const now = new Date(),
    first = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
  const [form, setForm] = useState({
      marketplace_conta: '',
      periodo_inicio: first,
      periodo_fim: new Date().toISOString().slice(0, 10),
      valor: 0,
      data_prevista: new Date(now.getTime() + 7 * 86400000).toISOString().slice(0, 10),
    }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState(false)
  const { toast } = useToast()
  useEffect(() => {
    if (open) {
      setForm({
        marketplace_conta: contas.find((c) => c.ativa)?.id || '',
        periodo_inicio: first,
        periodo_fim: new Date().toISOString().slice(0, 10),
        valor: 0,
        data_prevista: new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
      })
      setErrors({})
    }
  }, [open, contas, first])
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.marketplace_conta) next.marketplace_conta = 'Selecione uma conta.'
    if (form.valor <= 0) next.valor = 'Informe o valor do repasse.'
    if (form.periodo_fim < form.periodo_inicio)
      next.periodo_fim = 'A data final deve ser posterior à inicial.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await marketplacesService.saveRepasse({
        ...form,
        periodo_inicio: toPocketBaseDate(form.periodo_inicio),
        periodo_fim: toPocketBaseDate(form.periodo_fim),
        data_prevista: toPocketBaseDate(form.data_prevista),
        status: 'previsto',
      } as Partial<Repasse>)
      toast({ title: 'Repasse previsto' })
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Novo repasse</DialogTitle>
          <DialogDescription>
            Registre o valor e a previsão informados pelo marketplace.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="space-y-2">
            <Label>Conta</Label>
            <Select
              value={form.marketplace_conta}
              onValueChange={(marketplace_conta) => setForm({ ...form, marketplace_conta })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {contas
                  .filter((c) => c.ativa)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.apelido}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.marketplace_conta && <p className="field-error">{errors.marketplace_conta}</p>}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Início do período</Label>
              <Input
                type="date"
                value={form.periodo_inicio}
                onChange={(e) => setForm({ ...form, periodo_inicio: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Fim do período</Label>
              <Input
                type="date"
                value={form.periodo_fim}
                onChange={(e) => setForm({ ...form, periodo_fim: e.target.value })}
              />
              {errors.periodo_fim && <p className="field-error">{errors.periodo_fim}</p>}
            </div>
          </div>
          <div className="space-y-2">
            <Label>Valor</Label>
            <MoneyInput value={form.valor} onChange={(valor) => setForm({ ...form, valor })} />
            {errors.valor && <p className="field-error">{errors.valor}</p>}
          </div>
          <div className="space-y-2">
            <Label>Data prevista</Label>
            <Input
              type="date"
              value={form.data_prevista}
              onChange={(e) => setForm({ ...form, data_prevista: e.target.value })}
            />
          </div>
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
              Salvar previsão
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
