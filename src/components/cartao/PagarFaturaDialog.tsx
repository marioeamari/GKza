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

interface PagarFaturaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  fatura: FaturaCartaoGroup | null
  contas: Conta[]
  categorias: Categoria[]
  onSuccess?: () => void
}

export function PagarFaturaDialog({
  open,
  onOpenChange,
  fatura,
  contas,
  categorias,
  onSuccess,
}: PagarFaturaDialogProps) {
  const { toast } = useToast()
  const [submitting, setSubmitting] = useState(false)
  const [valorPago, setValorPago] = useState<number>(0)
  const [dataPagamento, setDataPagamento] = useState<string>('')
  const [contaPagadoraId, setContaPagadoraId] = useState<string>('')
  const [categoriaId, setCategoriaId] = useState<string>('')

  useEffect(() => {
    if (open && fatura) {
      setValorPago(fatura.totalFatura)
      // Sugere a data de vencimento da fatura ou hoje
      const hoje = new Date().toISOString().slice(0, 10)
      const dataSugerida =
        fatura.dataVencimento && fatura.dataVencimento <= hoje ? fatura.dataVencimento : hoje
      setDataPagamento(dataSugerida)

      // Seleciona a primeira conta bancária ou de caixa ativa
      const contaPadrao =
        contas.find((c) => c.ativa && c.tipo !== 'cartao')?.id || contas[0]?.id || ''
      setContaPagadoraId(contaPadrao)

      // Sugere categoria de Utilitários ou outra despesa
      const cat =
        categorias.find(
          (c) =>
            c.tipo === 'despesa' &&
            (c.nome.toLowerCase().includes('cart') || c.nome.toLowerCase().includes('utilit')),
        )?.id ||
        categorias.find((c) => c.tipo === 'despesa')?.id ||
        ''
      setCategoriaId(cat)
    }
  }, [open, fatura, contas, categorias])

  if (!fatura) return null

  const handlePagar = async (e: React.FormEvent) => {
    e.preventDefault()

    if (valorPago <= 0) {
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
        description: 'Escolha de qual conta bancária ou caixa saiu o dinheiro.',
      })
      return
    }

    if (!dataPagamento) {
      toast({
        variant: 'destructive',
        title: 'Data obrigatória',
        description: 'Informe a data efetiva em que a fatura foi paga.',
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
        valorPago,
        dataPagamento,
        contaPagadoraId,
        descricaoFatura,
        categoriaId: categoriaId || undefined,
        itensIds: fatura.itens.map((item) => item.id),
      })

      toast({
        title: 'Fatura paga com sucesso!',
        description: `Saída de ${formatCurrency(valorPago)} registrada no caixa na data ${formatDate(dataPagamento)}.`,
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

  const contasPagadoras = contas.filter((c) => c.tipo !== 'cartao')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Pagar fatura de cartão de crédito
          </DialogTitle>
          <DialogDescription>
            O valor sairá da sua conta bancária/caixa na data do pagamento, quitando todas as
            compras deste ciclo de fatura.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handlePagar} className="space-y-4">
          <div className="rounded-xl border border-border bg-secondary/30 p-3.5 text-xs space-y-1">
            <div className="flex justify-between font-bold text-foreground">
              <span>{fatura.conta.nome}</span>
              <span className="text-primary font-extrabold">
                {formatCurrency(fatura.totalFatura)}
              </span>
            </div>
            <p className="text-muted-foreground">
              Ciclo de fechamento: {formatDate(fatura.dataFechamento)} · Vencimento:{' '}
              {formatDate(fatura.dataVencimento)}
            </p>
            <p className="text-muted-foreground text-[11px]">
              {fatura.itens.length} compra(s) agrupada(s) nesta fatura.
            </p>
          </div>

          <div className="space-y-2">
            <Label>Valor pago da fatura</Label>
            <MoneyInput value={valorPago} onChange={setValorPago} />
            {valorPago !== fatura.totalFatura && (
              <p className="text-[11px] text-amber-600">
                Valor diverge do total das compras ({formatCurrency(fatura.totalFatura)}). O valor
                acima é o que sairá do seu caixa.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label>Data efetiva do pagamento</Label>
            <Input
              type="date"
              value={dataPagamento}
              onChange={(e) => setDataPagamento(e.target.value)}
              required
            />
            <p className="text-[11px] text-muted-foreground">
              Data em que o dinheiro saiu da conta corrente (o caixa só sentirá impacto nesta data).
            </p>
          </div>

          <div className="space-y-2">
            <Label>Conta bancária pagadora (saída de caixa)</Label>
            <Select value={contaPagadoraId} onValueChange={setContaPagadoraId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione a conta que pagou a fatura" />
              </SelectTrigger>
              <SelectContent>
                {contasPagadoras
                  .filter((c) => c.ativa || c.id === contaPagadoraId)
                  .map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} ({c.tipo})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {contaPagadoraId && (
              <ContaContextoWarning contaId={contaPagadoraId} contas={contas} className="mt-1.5" />
            )}
          </div>

          <div className="space-y-2">
            <Label>Categoria financeira (opcional)</Label>
            <Select value={categoriaId} onValueChange={setCategoriaId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria" />
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

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={submitting} className="bg-primary hover:bg-primary/90">
              {submitting ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <CheckCircle2 className="mr-2 h-4 w-4" />
              )}
              Confirmar pagamento da fatura
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
