import { useState } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'
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
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { toPocketBaseDate } from '@/lib/format'
import { marketplacesService } from '@/services/marketplaces'
import type { Repasse } from '@/types/domain'

export function ConfirmPayoutDialog({
  record,
  onOpenChange,
  onSaved,
}: {
  record: Repasse | null
  onOpenChange: (v: boolean) => void
  onSaved: () => void
}) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10)),
    [saving, setSaving] = useState(false)
  const { toast } = useToast()
  const confirm = async () => {
    if (!record) return
    setSaving(true)
    try {
      await marketplacesService.saveRepasse(
        { status: 'realizado', data_realizada: toPocketBaseDate(date) },
        record.id,
      )
      toast({
        title: 'Repasse confirmado',
        description: 'O lançamento de receita foi criado automaticamente.',
      })
      onOpenChange(false)
      onSaved()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível confirmar',
        description: apiMessage(e),
      })
    } finally {
      setSaving(false)
    }
  }
  return (
    <Dialog open={!!record} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmar repasse</DialogTitle>
          <DialogDescription>
            Informe quando o valor entrou na conta. Esta ação gera uma receita automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label>Data realizada</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={saving}>
            {saving ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
