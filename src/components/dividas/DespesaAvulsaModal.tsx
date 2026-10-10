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
import { toast } from '@/hooks/use-toast'
import { dividasService } from '@/services/dividas'
import { getLocalDateStr } from '@/lib/format'
import type { DespesaAvulsaRecord } from '@/lib/dividas'
import { ReceiptText } from 'lucide-react'

interface DespesaAvulsaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dividaId: string
  dividaNome: string
  despesaParaEditar?: DespesaAvulsaRecord | null
  onSuccess: () => void
}

export function DespesaAvulsaModal({
  open,
  onOpenChange,
  dividaId,
  dividaNome,
  despesaParaEditar,
  onSuccess,
}: DespesaAvulsaModalProps) {
  const [salvando, setSalvando] = useState(false)

  const [data, setData] = useState(
    despesaParaEditar ? despesaParaEditar.data.slice(0, 10) : getLocalDateStr(),
  )
  const [valor, setValor] = useState<string>(
    despesaParaEditar ? String(despesaParaEditar.valor) : '',
  )
  const [descricao, setDescricao] = useState(despesaParaEditar?.descricao || '')
  const [origem, setOrigem] = useState(despesaParaEditar?.origem || '')
  const [observacoes, setObservacoes] = useState(despesaParaEditar?.observacoes || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valNum = Number(valor)
    if (!valNum || valNum <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor maior que zero para a despesa avulsa.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      if (despesaParaEditar) {
        await dividasService.updateDespesa(despesaParaEditar.id, {
          data,
          valor: valNum,
          descricao: descricao.trim() || undefined,
          origem: origem.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        })
        toast({ title: 'Despesa avulsa atualizada com sucesso!' })
      } else {
        await dividasService.createDespesa({
          divida: dividaId,
          data,
          valor: valNum,
          descricao: descricao.trim() || undefined,
          origem: origem.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        })
        toast({ title: 'Despesa avulsa vinculada à máquina com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao salvar despesa avulsa:', err)
      toast({
        title: 'Erro ao salvar despesa',
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
          <DialogTitle className="flex items-center gap-2">
            <ReceiptText className="w-5 h-5 text-rose-600" />
            {despesaParaEditar ? 'Editar Despesa Avulsa' : 'Adicionar Despesa Avulsa da Máquina'}
          </DialogTitle>
          <DialogDescription>
            Despesa avulsa da máquina <strong>{dividaNome}</strong> (ex: frete, montagem,
            instalação). Consome o caixa da dívida sem alterar as parcelas contratadas e sem gerar
            lançamento no financeiro.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="desp-data">Data do Pagamento *</Label>
              <Input
                id="desp-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desp-valor">Valor Pago (R$) *</Label>
              <Input
                id="desp-valor"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0,00"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desp-desc">Descrição da Despesa</Label>
            <Input
              id="desp-desc"
              placeholder="Ex: Frete da máquina não embutido nas parcelas"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desp-origem">Fornecedor / Transportadora</Label>
            <Input
              id="desp-origem"
              placeholder="Ex: Transportadora Rodonaves / Mecânica Silva"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desp-obs">Observações Adicionais</Label>
            <Input
              id="desp-obs"
              placeholder="Ex: Pagamento feito via Pix direto pelo comprador"
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
              className="bg-rose-600 hover:bg-rose-700 text-white font-semibold"
            >
              {salvando ? 'Salvando...' : 'Gravar Despesa'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
