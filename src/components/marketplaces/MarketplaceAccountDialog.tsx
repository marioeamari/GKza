import { useEffect, useState } from 'react'
import { LoaderCircle, Save } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { marketplacesService } from '@/services/marketplaces'
import type { Conta, Marketplace, MarketplaceConta } from '@/types/domain'

export function MarketplaceAccountDialog({
  open,
  onOpenChange,
  record,
  marketplaces,
  contas,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  record: MarketplaceConta | null
  marketplaces: Marketplace[]
  contas: Conta[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({
      apelido: '',
      marketplace: '',
      conta: '',
      comissao_percentual: 0,
      ativa: true,
    }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState(false)
  const { toast } = useToast()
  useEffect(() => {
    if (open) {
      setForm(
        record
          ? {
              apelido: record.apelido,
              marketplace: record.marketplace,
              conta: record.conta,
              comissao_percentual: record.comissao_percentual,
              ativa: record.ativa,
            }
          : {
              apelido: '',
              marketplace: marketplaces[0]?.id || '',
              conta: contas.find((c) => c.ativa)?.id || '',
              comissao_percentual: 0,
              ativa: true,
            },
      )
      setErrors({})
    }
  }, [open, record, marketplaces, contas])
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.apelido.trim()) next.apelido = 'Informe o apelido da loja.'
    if (!form.marketplace) next.marketplace = 'Selecione o marketplace.'
    if (!form.conta) next.conta = 'Selecione a conta financeira.'
    if (form.comissao_percentual < 0 || form.comissao_percentual > 100)
      next.comissao_percentual = 'Use um percentual entre 0 e 100.'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await marketplacesService.saveConta(form, record?.id)
      toast({ title: 'Conta de marketplace salva' })
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
          <DialogTitle>{record ? 'Editar conta' : 'Nova conta de marketplace'}</DialogTitle>
          <DialogDescription>Conecte uma loja à conta onde os repasses entram.</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={save}>
          <div className="space-y-2">
            <Label>Apelido da loja</Label>
            <Input
              value={form.apelido}
              onChange={(e) => setForm({ ...form, apelido: e.target.value })}
              placeholder="Ex.: Loja Mercado Livre"
            />
            {errors.apelido && <p className="field-error">{errors.apelido}</p>}
          </div>
          <div className="space-y-2">
            <Label>Marketplace</Label>
            <Select
              value={form.marketplace}
              onValueChange={(marketplace) => setForm({ ...form, marketplace })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {marketplaces.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.marketplace && <p className="field-error">{errors.marketplace}</p>}
          </div>
          <div className="space-y-2">
            <Label>Conta financeira</Label>
            <Select value={form.conta} onValueChange={(conta) => setForm({ ...form, conta })}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {contas
                  .filter((c) => c.ativa || c.id === form.conta)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.conta && <p className="field-error">{errors.conta}</p>}
          </div>
          <div className="space-y-2">
            <Label>Comissão padrão (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={form.comissao_percentual}
              onChange={(e) => setForm({ ...form, comissao_percentual: Number(e.target.value) })}
            />
            {errors.comissao_percentual && (
              <p className="field-error">{errors.comissao_percentual}</p>
            )}
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <Label>Conta ativa</Label>
              <p className="text-xs text-muted-foreground">Disponível para novas vendas.</p>
            </div>
            <Switch checked={form.ativa} onCheckedChange={(ativa) => setForm({ ...form, ativa })} />
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
              Salvar conta
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
