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
import type { ReceitaRecord } from '@/lib/dividas'
import { TrendingUp } from 'lucide-react'

interface ReceitaModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  dividaId: string
  dividaNome: string
  receitaParaEditar?: ReceitaRecord | null
  onSuccess: () => void
}

export function ReceitaModal({
  open,
  onOpenChange,
  dividaId,
  dividaNome,
  receitaParaEditar,
  onSuccess,
}: ReceitaModalProps) {
  const [salvando, setSalvando] = useState(false)

  const [data, setData] = useState(
    receitaParaEditar ? receitaParaEditar.data.slice(0, 10) : getLocalDateStr(),
  )
  const [valor, setValor] = useState<string>(
    receitaParaEditar ? String(receitaParaEditar.valor) : '',
  )
  const [descricao, setDescricao] = useState(receitaParaEditar?.descricao || '')
  const [origem, setOrigem] = useState(receitaParaEditar?.origem || '')
  const [observacoes, setObservacoes] = useState(receitaParaEditar?.observacoes || '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    const valNum = Number(valor)
    if (!valNum || valNum <= 0 || !descricao.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: 'Informe uma descrição e um valor válido para a receita.',
        variant: 'destructive',
      })
      return
    }

    setSalvando(true)
    try {
      if (receitaParaEditar) {
        await dividasService.updateReceita(receitaParaEditar.id, {
          data,
          valor: valNum,
          descricao: descricao.trim(),
          origem: origem.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        })
        toast({ title: 'Receita da máquina atualizada com sucesso!' })
      } else {
        await dividasService.createReceita({
          divida: dividaId,
          data,
          valor: valNum,
          descricao: descricao.trim(),
          origem: origem.trim() || undefined,
          observacoes: observacoes.trim() || undefined,
        })
        toast({ title: 'Receita vinculada à máquina com sucesso!' })
      }

      onSuccess()
      onOpenChange(false)
    } catch (err: any) {
      console.error('Erro ao salvar receita:', err)
      toast({
        title: 'Erro ao salvar receita',
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
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            {receitaParaEditar ? 'Editar Receita da Máquina' : 'Lançar Receita Gerada pela Máquina'}
          </DialogTitle>
          <DialogDescription>
            Receita associada à máquina <strong>{dividaNome}</strong> para cálculo de amortização
            própria e caixa.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3.5 pt-1">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rec-data">Data da Receita *</Label>
              <Input
                id="rec-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rec-valor">Valor Gerado (R$) *</Label>
              <Input
                id="rec-valor"
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
            <Label htmlFor="rec-desc">Descrição do Serviço / Produção *</Label>
            <Input
              id="rec-desc"
              placeholder="Ex: Usinagem lote 500 peças para Cliente X"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-origem">Origem / Cliente / Pedido</Label>
            <Input
              id="rec-origem"
              placeholder="Ex: Pedido #1294 / Indústria Metal"
              value={origem}
              onChange={(e) => setOrigem(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="rec-obs">Observações Adicionais</Label>
            <Input
              id="rec-obs"
              placeholder="Notas sobre custos operacionais, horas de máquina, etc."
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
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold"
            >
              {salvando ? 'Salvando...' : 'Gravar Receita'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
