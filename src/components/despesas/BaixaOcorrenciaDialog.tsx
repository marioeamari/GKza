import { useEffect, useState } from 'react'
import { CheckCircle2, LoaderCircle } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { getAvisoFaturaCartao } from '@/lib/cartao-fatura'
import { formatCurrency, formatDate } from '@/lib/format'
import { despesasService } from '@/services/despesas'
import type { Conta, DespesaCompromisso, DespesaOcorrencia } from '@/types/domain'

interface BaixaOcorrenciaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  ocorrencia?: DespesaOcorrencia | null
  compromisso?: DespesaCompromisso | null
  contas: Conta[]
  onSuccess?: () => void
}

export function BaixaOcorrenciaDialog({
  open,
  onOpenChange,
  ocorrencia,
  compromisso,
  contas,
  onSuccess,
}: BaixaOcorrenciaDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [valorPago, setValorPago] = useState<number>(0)
  const [dataPagamento, setDataPagamento] = useState<string>('')
  const [contaId, setContaId] = useState<string>('')
  const [observacoes, setObservacoes] = useState<string>('')

  // Pode receber ocorrencia existente OU compromisso direto (para registrar pagamento retroativo)
  const comp = ocorrencia?.expand?.compromisso || compromisso
  const title = comp?.descricao || ocorrencia?.observacoes || 'Despesa'

  const selectedContaObj = contas.find((c) => c.id === contaId)
  const isContaCartao = selectedContaObj?.tipo === 'cartao'
  const avisoCartao = isContaCartao ? getAvisoFaturaCartao(selectedContaObj, dataPagamento) : null

  useEffect(() => {
    if (open) {
      if (ocorrencia) {
        setValorPago(ocorrencia.valor_pago || ocorrencia.valor_previsto || 0)
        setDataPagamento(
          ocorrencia.data_pagamento
            ? ocorrencia.data_pagamento.slice(0, 10)
            : new Date().toISOString().slice(0, 10),
        )
        const defaultConta =
          ocorrencia.conta ||
          ocorrencia.expand?.compromisso?.conta_padrao ||
          contas.find((c) => c.ativa && c.tipo !== 'cartao')?.id ||
          contas[0]?.id ||
          ''
        setContaId(defaultConta)
        setObservacoes(ocorrencia.observacoes || '')
      } else if (compromisso) {
        setValorPago(compromisso.valor_estimado || compromisso.valor_parcela || 0)
        setDataPagamento(new Date().toISOString().slice(0, 10))
        const defaultConta =
          compromisso.conta_padrao ||
          contas.find((c) => c.ativa && c.tipo !== 'cartao')?.id ||
          contas[0]?.id ||
          ''
        setContaId(defaultConta)
        setObservacoes(compromisso.observacoes || '')
      }
    }
  }, [ocorrencia, compromisso, contas, open])

  if (!ocorrencia && !compromisso) return null

  const handleBaixar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (valorPago <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'Informe o valor pago real (maior que zero).',
      })
      return
    }
    if (!contaId) {
      toast({
        variant: 'destructive',
        title: 'Selecione a conta',
        description: 'Escolha de qual conta saiu o recurso financeiro.',
      })
      return
    }
    if (!dataPagamento) {
      toast({
        variant: 'destructive',
        title: 'Data necessária',
        description: 'Informe a data real de pagamento.',
      })
      return
    }

    setSubmitting(true)
    try {
      if (ocorrencia) {
        await despesasService.baixarOcorrencia({
          ocorrenciaId: ocorrencia.id,
          valorPago,
          dataPagamento,
          contaId,
          categoriaId: comp?.categoria,
          empresaId: ocorrencia.empresa,
          pessoaId: comp?.pessoa,
          observacoes,
          descricao: `${comp?.descricao || 'Despesa'}${
            ocorrencia.numero_parcela
              ? ` (${ocorrencia.numero_parcela}/${ocorrencia.total_parcelas})`
              : ''
          }`,
        })
      } else if (compromisso) {
        await despesasService.registrarPagamentoCompromisso({
          compromissoId: compromisso.id,
          valorPago,
          dataPagamento,
          contaId,
          categoriaId: compromisso.categoria,
          empresaId: compromisso.empresa,
          pessoaId: compromisso.pessoa,
          observacoes,
          descricao: compromisso.descricao || 'Despesa',
          secao: compromisso.secao,
          contextoTipo: compromisso.contexto_tipo,
          dizimo: compromisso.dizimo,
          tipoDizimoId: compromisso.tipo_dizimo,
        })
      }

      if (isContaCartao) {
        toast({
          title: 'Compra registrada no cartão!',
          description: `Valor de ${formatCurrency(valorPago)} integrado à fatura do cartão. A saída real do caixa ocorrerá no pagamento da fatura.`,
        })
      } else {
        toast({
          title: 'Pagamento registrado com sucesso!',
          description: `Lançamento de ${formatCurrency(valorPago)} gerado no fluxo de caixa na data informada.`,
        })
      }
      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao baixar despesa',
        description: apiMessage(err),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-success" />
            Confirmar baixa de pagamento
          </DialogTitle>
          <DialogDescription>
            Ao confirmar, a ocorrência passa para "paga" e gera um lançamento automático no caixa da
            conta escolhida.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleBaixar} className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs space-y-1">
            <div className="flex justify-between font-bold text-foreground">
              <span className="font-bold">{title}</span>
              <span>
                Previsto:{' '}
                {formatCurrency(
                  ocorrencia?.valor_previsto ??
                    compromisso?.valor_estimado ??
                    compromisso?.valor_parcela ??
                    0,
                )}
              </span>
            </div>
            {comp?.fornecedor && (
              <p className="text-muted-foreground">Fornecedor: {comp.fornecedor}</p>
            )}
            {ocorrencia && (
              <p className="text-muted-foreground">
                Vencimento original: {formatDate(ocorrencia.data_vencimento)}
                {ocorrencia.numero_parcela &&
                  ` · Parcela ${ocorrencia.numero_parcela}/${ocorrencia.total_parcelas}`}
              </p>
            )}
            {compromisso && !ocorrencia && (
              <p className="text-muted-foreground text-[11px]">
                Registrando pagamento retroativo/avulso para este compromisso anual.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Valor pago real</Label>
            <MoneyInput value={valorPago} onChange={setValorPago} />
          </div>

          <div className="space-y-2">
            <Label>Data efetiva de pagamento</Label>
            <Input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              required
            />
          </div>

          <div className="space-y-2">
            <Label>Conta debitada / Origem do recurso</Label>
            <Select value={contaId} onValueChange={setContaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta de saída" />
              </SelectTrigger>
              <SelectContent>
                {contas
                  .filter((c) => c.ativa || c.id === contaId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} ({c.tipo})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {avisoCartao && (
              <p className="rounded-lg bg-primary/10 p-2 text-xs font-semibold text-primary">
                {avisoCartao}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Observação do pagamento (opcional)</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex.: Pago via Pix com desconto, comprovante nº..."
            />
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="bg-success hover:bg-success/90">
              {submitting ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar baixa e debitar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
