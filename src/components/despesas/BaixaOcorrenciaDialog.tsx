import { useEffect, useState } from 'react'
import { CheckCircle2, Info, LoaderCircle } from 'lucide-react'

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
import { Badge } from '@/components/ui/badge'
import { apiMessage } from '@/lib/api-error'
import { calcularFaturaCartao, getAvisoFaturaCartao } from '@/lib/cartao-fatura'
import { formatCurrency, formatDate, getLocalDateStr } from '@/lib/format'
import { despesasService, isMetodoCredito } from '@/services/despesas'
import { ContaContextoWarning } from '@/components/ContaContextoWarning'
import { AnexoUploadField } from '@/components/despesas/AnexoUploadField'
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
  const [comprovanteArquivo, setComprovanteArquivo] = useState<File | null>(null)
  const [dizimoPercentual, setDizimoPercentual] = useState<number>(100)

  // Pode receber ocorrencia existente OU compromisso direto (para registrar pagamento retroativo)
  const comp = ocorrencia?.expand?.compromisso || compromisso
  const title = comp?.descricao || ocorrencia?.observacoes || 'Despesa'

  const selectedContaObj = contas.find((c) => c.id === contaId)
  const metodoPagamentoComp = comp?.expand?.metodo_pagamento || comp?.metodo_pagamento
  const metodoEhCredito = isMetodoCredito(metodoPagamentoComp)
  const isContaCartao = selectedContaObj?.tipo === 'cartao' && metodoEhCredito
  const faturaCiclo =
    isContaCartao && selectedContaObj && dataPagamento
      ? calcularFaturaCartao(selectedContaObj, dataPagamento)
      : null
  const avisoCartao = isContaCartao ? getAvisoFaturaCartao(selectedContaObj, dataPagamento) : null

  useEffect(() => {
    if (open) {
      setComprovanteArquivo(null)
      if (ocorrencia) {
        setValorPago(ocorrencia.valor_pago || ocorrencia.valor_previsto || 0)
        // Pré-carregar data de pagamento com HOJE por padrão (não a data da compra/vencimento antigo),
        // preservando data_pagamento apenas se a ocorrência já tiver sido baixada/paga anteriormente.
        const dataInicial =
          ocorrencia.status === 'paga' && ocorrencia.data_pagamento
            ? ocorrencia.data_pagamento.slice(0, 10)
            : getLocalDateStr()
        setDataPagamento(dataInicial)
        const linkedConta = ocorrencia.conta || ocorrencia.expand?.compromisso?.conta_padrao
        const defaultConta =
          linkedConta ||
          contas.find((c) => c.ativa && c.tipo !== 'cartao')?.id ||
          contas.find((c) => c.ativa)?.id ||
          ''
        setContaId(defaultConta)
        setObservacoes(ocorrencia.observacoes || '')
        const pct =
          ocorrencia.dizimo_percentual !== undefined && ocorrencia.dizimo_percentual !== null
            ? Number(ocorrencia.dizimo_percentual)
            : comp?.dizimo_percentual !== undefined && comp?.dizimo_percentual !== null
              ? Number(comp.dizimo_percentual)
              : 100
        setDizimoPercentual(pct)
      } else if (compromisso) {
        setValorPago(compromisso.valor_estimado || compromisso.valor_parcela || 0)
        const dataInicial = getLocalDateStr()
        setDataPagamento(dataInicial)
        const linkedConta = compromisso.conta_padrao
        const defaultConta =
          linkedConta ||
          contas.find((c) => c.ativa && c.tipo !== 'cartao')?.id ||
          contas.find((c) => c.ativa)?.id ||
          ''
        setContaId(defaultConta)
        setObservacoes(compromisso.observacoes || '')
        const pct =
          compromisso.dizimo_percentual !== undefined && compromisso.dizimo_percentual !== null
            ? Number(compromisso.dizimo_percentual)
            : 100
        setDizimoPercentual(pct)
      }
    }
  }, [ocorrencia, compromisso, comp, contas, open])

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
      // Resolução robusta da categoria da despesa (string id, objeto expandido, ou compromisso/ocorrência)
      const rawCategoria =
        comp?.categoria ??
        comp?.expand?.categoria ??
        (compromisso as any)?.categoria ??
        (compromisso as any)?.expand?.categoria ??
        (ocorrencia as any)?.expand?.compromisso?.categoria ??
        (ocorrencia as any)?.expand?.compromisso?.expand?.categoria

      const categoriaIdResolvida =
        typeof rawCategoria === 'string' ? rawCategoria : (rawCategoria as any)?.id || undefined

      if (ocorrencia) {
        await despesasService.baixarOcorrencia({
          ocorrenciaId: ocorrencia.id,
          valorPago,
          dataPagamento,
          contaId,
          categoriaId: categoriaIdResolvida,
          empresaId: ocorrencia.empresa,
          pessoaId: comp?.pessoa,
          observacoes,
          comprovanteArquivo,
          dizimoPercentual,
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
          categoriaId: categoriaIdResolvida,
          empresaId: compromisso.empresa,
          pessoaId: compromisso.pessoa,
          observacoes,
          comprovanteArquivo,
          descricao: compromisso.descricao || 'Despesa',
          secao: compromisso.secao,
          contextoTipo: compromisso.contexto_tipo,
          dizimo: compromisso.dizimo,
          tipoDizimoId: compromisso.tipo_dizimo,
          dizimoPercentual,
        })
      }

      if (isContaCartao) {
        let cicloToastInfo = ''
        if (faturaCiclo) {
          const dateObj = new Date(faturaCiclo.dataFechamento + 'T12:00:00')
          const mesAno = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
          const [vy, vm, vd] = faturaCiclo.dataVencimento.split('-')
          cicloToastInfo = ` à fatura de ${mesAno} (vence ${vd}/${vm})`
        }
        toast({
          title: 'Compra registrada no cartão!',
          description: cicloToastInfo
            ? `Compra vinculada${cicloToastInfo}. A saída real do caixa ocorrerá no pagamento da fatura.`
            : `Valor de ${formatCurrency(valorPago)} integrado à fatura do cartão. A saída real do caixa ocorrerá no pagamento da fatura.`,
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
            {isContaCartao && faturaCiclo && (
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="border-primary/40 bg-primary/10 text-primary font-bold text-xs px-2.5 py-1"
                  >
                    Fatura de{' '}
                    {(() => {
                      const dateObj = new Date(faturaCiclo.dataFechamento + 'T12:00:00')
                      const mesAno = dateObj.toLocaleDateString('pt-BR', {
                        month: 'short',
                        year: 'numeric',
                      })
                      const [vy, vm, vd] = faturaCiclo.dataVencimento.split('-')
                      return `${mesAno.charAt(0).toUpperCase() + mesAno.slice(1)} · vence ${vd}/${vm}`
                    })()}
                  </Badge>
                </div>
                {avisoCartao && (
                  <p className="rounded-lg bg-primary/10 p-2 text-xs font-semibold text-primary">
                    {avisoCartao}
                  </p>
                )}
              </div>
            )}

            {contaId && (
              <ContaContextoWarning contaId={contaId} contas={contas} className="mt-1.5" />
            )}
          </div>

          {/* Alerta e ajuste de percentual de dízimo */}
          <div className="rounded-xl border border-border/70 bg-secondary/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Label className="text-xs font-semibold text-foreground">
                  Percentual de dízimo deste pagamento:
                </Label>
                <span className="text-xs font-bold text-primary">{dizimoPercentual}%</span>
              </div>
              {dizimoPercentual !== 100 && (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-amber-500/10 text-amber-700 border-amber-300"
                >
                  {dizimoPercentual === 0 ? 'Não incide (0%)' : `Exceção: ${dizimoPercentual}%`}
                </Badge>
              )}
            </div>

            {dizimoPercentual !== 100 && (
              <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-500/10 p-2 rounded-lg border border-amber-200">
                <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-600" />
                <span>
                  Esta despesa tem percentual de dízimo diferente de 100% ({dizimoPercentual}%). Na
                  base do dízimo deste mês entrará{' '}
                  <strong>{formatCurrency((valorPago * dizimoPercentual) / 100)}</strong>.
                </span>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-1 pt-1">
              {[100, 75, 50, 25, 0].map((pct) => (
                <Button
                  key={pct}
                  type="button"
                  size="sm"
                  variant={dizimoPercentual === pct ? 'default' : 'outline'}
                  className={`h-6 px-2 text-[11px] font-semibold ${
                    dizimoPercentual === pct
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-background'
                  }`}
                  onClick={() => setDizimoPercentual(pct)}
                >
                  {pct}%
                </Button>
              ))}
              <div className="flex items-center gap-1 ml-auto">
                <span className="text-[11px] text-muted-foreground">Custom:</span>
                <Input
                  type="number"
                  min={0}
                  max={100}
                  value={dizimoPercentual}
                  onChange={(e) => {
                    const val = Math.max(0, Math.min(100, Number(e.target.value) || 0))
                    setDizimoPercentual(val)
                  }}
                  className="h-6 w-14 text-xs text-right font-semibold"
                />
                <span className="text-[11px] text-muted-foreground">%</span>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Observação do pagamento (opcional)</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Ex.: Pago via Pix com desconto, comprovante nº..."
            />
          </div>

          <div className="pt-1 border-t border-stone-100">
            <AnexoUploadField
              label="Comprovante de pagamento (opcional)"
              helperText="Anexe um .PDF ou tire uma foto/escolha da galeria o comprovante de pagamento."
              selectedFile={comprovanteArquivo}
              onFileSelect={setComprovanteArquivo}
              currentFileName={ocorrencia?.comprovante_pagamento}
              collectionNameOrId="despesas_ocorrencias"
              recordId={ocorrencia?.id}
              disabled={submitting}
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
