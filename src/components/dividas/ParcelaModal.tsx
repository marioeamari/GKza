import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { toast } from '@/hooks/use-toast'
import { dividasService } from '@/services/dividas'
import { formatCurrency, getLocalDateStr } from '@/lib/format'
import type { ParcelaRecord, ParcelaStatus } from '@/lib/dividas'

interface ParcelaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dividaId: string
  parcelaParaEditar?: ParcelaRecord | null
  proximoNumero?: number
  onSuccess: () => void
}

export function ParcelaModal({
  open,
  onOpenChange,
  dividaId,
  parcelaParaEditar,
  proximoNumero = 1,
  onSuccess,
}: ParcelaModalProps) {
  const [salvando, setSalvando] = useState(false)

  const [numero, setNumero] = useState<number>(
    parcelaParaEditar ? parcelaParaEditar.numero : proximoNumero,
  )
  const [dataVencimento, setDataVencimento] = useState(
    parcelaParaEditar ? parcelaParaEditar.data_vencimento.slice(0, 10) : getLocalDateStr(),
  )
  const [valor, setValor] = useState<string>(
    parcelaParaEditar ? String(parcelaParaEditar.valor) : '',
  )
  const [status, setStatus] = useState<ParcelaStatus>(
    parcelaParaEditar ? parcelaParaEditar.status : 'pendente',
  )
  const [dataPagamento, setDataPagamento] = useState<string>(
    parcelaParaEditar?.data_pagamento
      ? parcelaParaEditar.data_pagamento.slice(0, 10)
      : parcelaParaEditar?.data_vencimento
        ? parcelaParaEditar.data_vencimento.slice(0, 10)
        : getLocalDateStr(),
  )
  const [valorPago, setValorPago] = useState<string>(
    parcelaParaEditar?.valor_pago !== undefined &&
      parcelaParaEditar?.valor_pago !== null &&
      parcelaParaEditar.valor_pago > 0
      ? String(parcelaParaEditar.valor_pago)
      : parcelaParaEditar?.valor
        ? String(parcelaParaEditar.valor)
        : '',
  )
  const [observacoes, setObservacoes] = useState(parcelaParaEditar?.observacoes || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valNum = Number(valor)
    if (!valNum || valNum <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor maior que zero para a parcela.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      if (parcelaParaEditar) {
        await dividasService.updateParcela(parcelaParaEditar.id, {
          numero,
          data_vencimento: dataVencimento,
          valor: valNum,
          status,
          data_pagamento: status === 'paga' ? dataPagamento || dataVencimento : undefined,
          valor_pago:
            status === 'paga'
              ? valorPago && Number(valorPago) > 0
                ? Number(valorPago)
                : valNum
              : undefined,
          observacoes: observacoes.trim() || undefined,
        })
        toast({ title: 'Parcela atualizada com sucesso!' })
      } else {
        await dividasService.createParcela({
          divida: dividaId,
          numero,
          data_vencimento: dataVencimento,
          valor: valNum,
          status,
          data_pagamento: status === 'paga' ? dataPagamento || dataVencimento : undefined,
          valor_pago:
            status === 'paga'
              ? valorPago && Number(valorPago) > 0
                ? Number(valorPago)
                : valNum
              : undefined,
          observacoes: observacoes.trim() || undefined,
        })
        toast({ title: 'Parcela adicionada com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao salvar parcela:', err)
      toast({
        title: 'Erro ao salvar parcela',
        description: err?.message || 'Falha na operação.',
        variant: 'destructive',
      })
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {parcelaParaEditar
              ? `Editar Parcela #${parcelaParaEditar.numero}`
              : 'Adicionar Parcela Individual'}
          </DialogTitle>
          <DialogDescription>
            Ajuste valores irregulares, datas ou registro manual de quitação.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="parc-num">Número da Parcela</Label>
              <Input
                id="parc-num"
                type="number"
                min="0"
                value={numero}
                onChange={(e) => setNumero(Number(e.target.value))}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parc-venc">Vencimento *</Label>
              <Input
                id="parc-venc"
                type="date"
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="parc-valor">Valor Previsto (R$) *</Label>
              <Input
                id="parc-valor"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="parc-status">Status</Label>
              <Select value={status} onValueChange={(val: any) => setStatus(val)}>
                <SelectTrigger id="parc-status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="atrasada">Atrasada</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {status === 'paga' && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-3">
              <div className="text-xs font-semibold text-emerald-800">
                Registro Manual de Pagamento
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label htmlFor="parc-datapag" className="text-xs">
                    Data de Pagamento
                  </Label>
                  <Input
                    id="parc-datapag"
                    type="date"
                    value={dataPagamento || dataVencimento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="parc-valorpago" className="text-xs">
                    Valor Pago (R$)
                  </Label>
                  <Input
                    id="parc-valorpago"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={valor ? formatCurrency(Number(valor)) : '0,00'}
                    value={valorPago}
                    onChange={(e) => setValorPago(e.target.value)}
                    className="h-8 text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="parc-obs">Observações</Label>
            <Input
              id="parc-obs"
              placeholder="Ex: Parcela balão, intermediária, etc."
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={salvando}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={salvando}
              className="bg-primary hover:bg-primary/90 text-white font-semibold"
            >
              {salvando ? 'Salvando...' : 'Salvar Parcela'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
