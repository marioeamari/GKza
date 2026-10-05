import { useEffect, useState } from 'react'
import { CheckCircle2, CreditCard, LoaderCircle } from 'lucide-react'

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
import { apiMessage } from '@/lib/api-error'
import type { FaturaCartaoGroup } from '@/lib/cartao-fatura'
import { formatCurrency, formatDate } from '@/lib/format'
import { financeService } from '@/services/finance'
import { ContaContextoWarning } from '@/components/ContaContextoWarning'
import type { Categoria, Conta } from '@/types/domain'

export type ModoPagamentoFatura = 'quitar_ciclo' | 'pagamento_completo'

interface PagarFaturaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fatura: FaturaCartaoGroup | null
  contas: Conta[]
  categorias: Categoria[]
  modo?: ModoPagamentoFatura
  onSuccess?: () => void
}

export function PagarFaturaDialog({
  open,
  onOpenChange,
  fatura,
  contas,
  categorias,
  modo = 'pagamento_completo',
  onSuccess,
}: PagarFaturaDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [valorPago, setValorPago] = useState<number>(0)
  const [dataPagamento, setDataPagamento] = useState<string>('')
  const [contaPagadoraId, setContaPagadoraId] = useState<string>('')
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [observacao, setObservacao] = useState<string>('')

  const isQuitarCiclo = modo === 'quitar_ciclo'

  useEffect(() => {
    if (open && fatura) {
      setValorPago(fatura.totalFatura)
      setObservacao('')

      // Sugere a data de vencimento da fatura ou hoje
      const hoje = new Date().toISOString().slice(0, 10)
      const dataSugerida =
        fatura.dataVencimento && fatura.dataVencimento <= hoje ? fatura.dataVencimento : hoje
      setDataPagamento(dataSugerida)

      // Conta pagadora universal: seleciona a primeira conta ativa (qualquer tipo)
      const contaPadrao = contas.find((c) => c.ativa)?.id || contas[0]?.id || ''
      setContaPagadoraId(contaPadrao)

      // Sugere categoria de despesa relacionada a cartão ou utilitários
      const cat =
        categorias.find(
          (c) =>
            c.tipo === 'despesa' &&
            (c.nome.toLowerCase().includes('cart') ||
              c.nome.toLowerCase().includes('fatura') ||
              c.nome.toLowerCase().includes('utilit')),
        )?.id ||
        categorias.find((c) => c.tipo === 'despesa')?.id ||
        ''
      setCategoriaId(cat)
    }
  }, [open, fatura, contas, categorias, modo])

  if (!fatura) return null

  // Contas pagadoras universais: qualquer conta ativa pode pagar (bancária, caixa, cartão, marketplace)
  const contasPagadoras = contas.filter((c) => c.ativa || c.id === contaPagadoraId)
  const semContasAtivas = contasPagadoras.length === 0

  const handlePagar = async (e: React.FormEvent) => {
    e.preventDefault()

    const valorEfetivo = isQuitarCiclo ? fatura.totalFatura : valorPago

    if (valorEfetivo <= 0) {
      toast({
        variant: 'destructive',
        title: 'Valor inválido',
        description: 'Informe o valor real pago da fatura.',
      })
      return
    }

    if (!contaPagadoraId) {
      toast({
        variant: 'destructive',
        title: 'Selecione a conta pagadora',
        description: 'Escolha de qual conta saiu o recurso para o pagamento.',
      })
      return
    }

    if (!dataPagamento) {
      toast({
        variant: 'destructive',
        title: 'Data obrigatória',
        description: 'Informe a data efetiva em que o pagamento foi realizado.',
      })
      return
    }

    setSubmitting(true)
    try {
      const dateObj = new Date(fatura.dataFechamento + 'T12:00:00')
      const mesExtenso = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      const descricaoFatura = `Fatura ${mesExtenso} — ${fatura.conta.nome}`

      await financeService.pagarFaturaCartao({
        cartaoContaId: fatura.conta.id,
        competencia: fatura.competencia,
        valorPago: valorEfetivo,
        dataPagamento,
        contaPagadoraId,
        descricaoFatura,
        categoriaId: categoriaId || undefined,
        observacoes: observacao.trim() || undefined,
        itens: fatura.itens.map((it) => ({
          id: it.id,
          valor: it.valor,
          data: it.data,
          created: it.created,
        })),
        itensIds: fatura.itens.map((it) => it.id),
      })

      const diferenca = fatura.totalFatura - valorEfetivo
      const isParcial = !isQuitarCiclo && diferenca > 0.009

      toast({
        title: isParcial ? 'Pagamento parcial registrado!' : 'Fatura quitada com sucesso!',
        description: isParcial
          ? `Pagamento de ${formatCurrency(valorEfetivo)} registrado na data ${formatDate(dataPagamento)}. Restam ${formatCurrency(diferenca)} em aberto no ciclo.`
          : `Saída de ${formatCurrency(valorEfetivo)} registrada no caixa na data ${formatDate(dataPagamento)}.`,
      })

      onOpenChange(false)
      onSuccess?.()
    } catch (err) {
      toast({
        variant: 'destructive',
        title: 'Erro ao pagar fatura',
        description: apiMessage(err),
      })
    } finally {
      setSubmitting(false)
    }
  }

  const diferencaValor = fatura.totalFatura - valorPago
  const isPagamentoParcial = !isQuitarCiclo && diferencaValor > 0.009
  const isPagamentoMaior = !isQuitarCiclo && diferencaValor < -0.009

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            {isQuitarCiclo ? 'Quitar ciclo da fatura' : 'Gerar pagamento da fatura'}
          </DialogTitle>
          <DialogDescription>
            {isQuitarCiclo
              ? 'Quitação total das compras deste ciclo de fatura com saída no caixa da conta pagadora.'
              : 'Gere o pagamento total ou parcial da fatura. Pagamentos parciais quitam as compras mais antigas primeiro.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handlePagar} className="space-y-4">
          {/* Card Resumo do Ciclo */}
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs space-y-1">
            <div className="flex justify-between items-center font-bold text-foreground">
              <span className="truncate pr-2">{fatura.conta.nome}</span>
              <span className="text-primary font-extrabold text-sm whitespace-nowrap">
                {formatCurrency(fatura.totalFatura)}
              </span>
            </div>
            <p className="text-muted-foreground">
              Fechamento: <strong>{formatDate(fatura.dataFechamento)}</strong> · Vencimento:{' '}
              <strong>{formatDate(fatura.dataVencimento)}</strong>
            </p>
            <p className="text-muted-foreground text-[11px]">
              {fatura.itens.length}{' '}
              {fatura.itens.length === 1 ? 'compra agrupada' : 'compras agrupadas'} neste ciclo (
              {fatura.competencia}).
            </p>
          </div>

          {/* MODO QUITAR CICLO: valor travado */}
          {isQuitarCiclo ? (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs flex items-center justify-between">
              <div>
                <p className="text-muted-foreground text-[11px]">Valor total a quitar</p>
                <p className="text-lg font-extrabold text-primary tabular-nums">
                  {formatCurrency(fatura.totalFatura)}
                </p>
              </div>
              <span className="text-[11px] font-semibold text-primary uppercase bg-primary/10 px-2 py-1 rounded-md">
                Quitação Total
              </span>
            </div>
          ) : (
            /* MODO COMPLETO: valor editável */
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <Label htmlFor="valor-pago-fatura">Valor pago da fatura</Label>
                {valorPago !== fatura.totalFatura && (
                  <button
                    type="button"
                    onClick={() => setValorPago(fatura.totalFatura)}
                    className="text-[11px] font-semibold text-primary hover:underline"
                  >
                    Restaurar total ({formatCurrency(fatura.totalFatura)})
                  </button>
                )}
              </div>
              <MoneyInput id="valor-pago-fatura" value={valorPago} onChange={setValorPago} />

              {isPagamentoParcial && (
                <div className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 space-y-0.5">
                  <p className="font-bold">
                    Pagamento parcial: restará {formatCurrency(diferencaValor)} em aberto.
                  </p>
                  <p className="text-[11px] text-amber-800">
                    As compras do ciclo serão quitadas em ordem cronológica (mais antigas primeiro)
                    até esgotar o valor pago.
                  </p>
                </div>
              )}

              {isPagamentoMaior && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-2.5 text-xs text-blue-900">
                  <p className="font-semibold">
                    Valor informado ({formatCurrency(valorPago)}) é maior que o total da fatura (
                    {formatCurrency(fatura.totalFatura)}).
                  </p>
                  <p className="text-[11px] text-blue-800">
                    Todas as compras deste ciclo serão quitadas e a saída total de caixa será
                    registrada.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Data efetiva do pagamento */}
          <div className="space-y-1.5">
            <Label htmlFor="data-pagamento-fatura">Data efetiva do pagamento</Label>
            <Input
              id="data-pagamento-fatura"
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Data em que o dinheiro saiu da conta pagadora (impacto real no caixa nesta data).
            </p>
          </div>

          {/* Conta pagadora universal */}
          <div className="space-y-1.5">
            <Label>Conta pagadora (saída de caixa)</Label>
            {semContasAtivas ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
                Nenhuma conta ativa disponível como pagadora — cadastre ou ative em /contas.
              </div>
            ) : (
              <Select value={contaPagadoraId} onValueChange={setContaPagadoraId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a conta que pagou a fatura" />
                </SelectTrigger>
                <SelectContent>
                  {contasPagadoras.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} ({c.tipo}) {!c.ativa ? '— inativa' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {contaPagadoraId && (
              <ContaContextoWarning contaId={contaPagadoraId} contas={contas} className="mt-1" />
            )}
            <p className="text-[11px] text-muted-foreground">
              Qualquer conta ativa pode ser usada (bancária, caixa ou cartão com saldo em caixa).
            </p>
          </div>

          {/* Campos exclusivos do modo completo: Categoria e Observações */}
          {!isQuitarCiclo && (
            <>
              <div className="space-y-1.5">
                <Label>Categoria financeira (opcional)</Label>
                <Select value={categoriaId} onValueChange={setCategoriaId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione uma categoria de despesa" />
                  </SelectTrigger>
                  <SelectContent>
                    {categorias
                      .filter((c) => c.tipo === 'despesa')
                      .map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.nome}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="obs-pagamento-fatura">Observação (opcional)</Label>
                <Input
                  id="obs-pagamento-fatura"
                  placeholder="Ex.: Pago via débito em conta, Pix ou boleto"
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                />
              </div>
            </>
          )}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={submitting || semContasAtivas}
              className="bg-primary hover:bg-primary/90 text-white"
            >
              {submitting ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              {isQuitarCiclo ? 'Quitar fatura' : 'Confirmar pagamento da fatura'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
