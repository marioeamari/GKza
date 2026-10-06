import React, { useEffect, useState, useMemo } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar, CheckCircle2, Clock, CreditCard, Sparkles, AlertCircle } from 'lucide-react'
import { formatCurrency, formatDate, getLocalDateStr } from '@/lib/format'
import { simularCronogramaParcelas, type ItemCronogramaParcela } from '@/lib/cartao-fatura'
import type { Conta, DespesaCompromisso, DespesaOcorrencia } from '@/types/domain'
import pb from '@/lib/pocketbase/client'

export interface CronogramaParcelasDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  compromisso: DespesaCompromisso | null
  conta?: Conta
  ocorrenciaContexto?: DespesaOcorrencia
}

export function CronogramaParcelasDialog({
  open,
  onOpenChange,
  compromisso,
  conta,
  ocorrenciaContexto,
}: CronogramaParcelasDialogProps) {
  const [loading, setLoading] = useState(false)
  const [ocorrenciasDoBanco, setOcorrenciasDoBanco] = useState<DespesaOcorrencia[]>([])

  useEffect(() => {
    if (!open || !compromisso?.id) {
      setOcorrenciasDoBanco([])
      return
    }

    let isMounted = true
    setLoading(true)

    pb.collection<DespesaOcorrencia>('despesas_ocorrencias')
      .getFullList({
        filter: `compromisso = '${compromisso.id}'`,
        sort: 'numero_parcela,competencia',
      })
      .then((records) => {
        if (isMounted) {
          setOcorrenciasDoBanco(records)
        }
      })
      .catch((err) => {
        console.warn('[CronogramaParcelasDialog] Erro ao carregar ocorrências:', err)
        if (isMounted && ocorrenciaContexto) {
          setOcorrenciasDoBanco([ocorrenciaContexto])
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false)
        }
      })

    return () => {
      isMounted = false
    }
  }, [open, compromisso?.id, ocorrenciaContexto])

  const totalParcelas = Math.max(1, compromisso?.total_parcelas || 1)
  const valorParcela =
    compromisso?.valor_parcela && compromisso.valor_parcela > 0
      ? compromisso.valor_parcela
      : compromisso?.valor_estimado || 0
  const totalGeral = valorParcela * totalParcelas

  const dataCompraStr = compromisso?.data_inicio
    ? compromisso.data_inicio.slice(0, 10)
    : compromisso?.created
      ? compromisso.created.slice(0, 10)
      : ''

  const isCartao =
    conta?.tipo === 'cartao' ||
    (conta?.tipos_pagamento && conta.tipos_pagamento.includes('credito')) ||
    compromisso?.secao === 'cartoes_credito'

  const cronograma: ItemCronogramaParcela[] = useMemo(() => {
    if (!compromisso) return []
    const today = getLocalDateStr(new Date())

    return simularCronogramaParcelas({
      compromisso,
      conta,
      ocorrenciasReais: ocorrenciasDoBanco,
      dataReferenciaHoje: today,
    })
  }, [compromisso, conta, ocorrenciasDoBanco])

  const pagasCount = cronograma.filter((it) => it.status === 'paga').length
  const totalPago = cronograma
    .filter((it) => it.status === 'paga')
    .reduce((acc, it) => acc + (it.valorPago ?? it.valor), 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto p-4 sm:p-6 bg-card">
        <DialogHeader className="pb-2 border-b border-border">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#DF5830]/10 text-[#DF5830]">
              <Calendar className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-lg font-bold text-foreground">
                Cronograma de Parcelas
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Simulação e acompanhamento das datas e faturas dos pagamentos.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Resumo do Compromisso */}
        <div className="rounded-xl border border-border/80 bg-secondary/30 p-3 sm:p-4 mt-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-extrabold text-foreground">
                  {compromisso?.descricao || 'Despesa Parcelada'}
                </span>
                {isCartao && (
                  <Badge
                    variant="outline"
                    className="border-[#DF5830]/40 bg-[#DF5830]/10 text-[#DF5830] text-[10px] font-bold flex items-center gap-1"
                  >
                    <CreditCard className="h-3 w-3" /> Ciclo de Fatura Cartão
                  </Badge>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                {dataCompraStr && (
                  <span>
                    Compra: <strong className="text-foreground">{formatDate(dataCompraStr)}</strong>
                  </span>
                )}
                {conta && (
                  <span>
                    Conta:{' '}
                    <strong className="text-foreground">
                      {conta.nome}
                      {conta.dia_fechamento ? ` (fecha dia ${conta.dia_fechamento})` : ''}
                    </strong>
                  </span>
                )}
                <span>
                  Parcelas:{' '}
                  <strong className="text-foreground">
                    {pagasCount}/{totalParcelas} pagas
                  </strong>
                </span>
              </div>
            </div>

            {/* Totalizadores numéricos */}
            <div className="flex items-center gap-4 self-end sm:self-auto text-right">
              <div>
                <p className="text-[10px] uppercase font-bold text-muted-foreground">
                  Valor da Parcela
                </p>
                <p className="text-sm font-extrabold text-foreground tabular-nums">
                  {formatCurrency(valorParcela)}
                </p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div>
                <p className="text-[10px] uppercase font-bold text-[#DF5830]">Total Geral</p>
                <p className="text-base font-black text-[#DF5830] tabular-nums">
                  {formatCurrency(totalGeral)}
                </p>
              </div>
            </div>
          </div>

          {/* Barra de progresso de quitação */}
          <div className="mt-3 pt-3 border-t border-border/50 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              Total já quitado:{' '}
              <strong className="text-success">{formatCurrency(totalPago)}</strong>
            </span>
            <span>
              Saldo restante:{' '}
              <strong className="text-foreground">
                {formatCurrency(Math.max(0, totalGeral - totalPago))}
              </strong>
            </span>
          </div>
        </div>

        {/* Tabela de Parcelas */}
        <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card">
          <Table>
            <TableHeader className="bg-secondary/40">
              <TableRow>
                <TableHead className="w-16 font-bold text-xs">Parcela</TableHead>
                <TableHead className="font-bold text-xs">Ciclo / Competência</TableHead>
                <TableHead className="font-bold text-xs">Vencimento</TableHead>
                <TableHead className="font-bold text-xs text-right">Valor</TableHead>
                <TableHead className="font-bold text-xs text-center">Status</TableHead>
                <TableHead className="font-bold text-xs">Pagamento</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cronograma.map((item) => {
                const [y, m] = item.competencia.split('-')
                const mesNome =
                  y && m
                    ? new Date(parseInt(y, 10), parseInt(m, 10) - 1, 1).toLocaleDateString(
                        'pt-BR',
                        { month: 'short', year: 'numeric' },
                      )
                    : item.competencia

                return (
                  <TableRow
                    key={item.numeroParcela}
                    className={`transition hover:bg-secondary/30 ${
                      item.status === 'atrasada'
                        ? 'bg-destructive/[0.04]'
                        : item.status === 'paga'
                          ? 'bg-success/[0.02]'
                          : ''
                    }`}
                  >
                    {/* Parcela N/total */}
                    <TableCell className="font-mono font-bold text-xs">
                      {item.numeroParcela}/{item.totalParcelas}
                    </TableCell>

                    {/* Competência / Ciclo da fatura */}
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <span className="font-mono text-xs font-semibold text-foreground">
                          {item.competencia}
                        </span>
                        <span className="text-[11px] capitalize text-muted-foreground">
                          ({mesNome})
                        </span>
                        {item.isSimulada && (
                          <Badge
                            variant="secondary"
                            className="text-[9px] px-1 py-0 h-4 font-normal text-muted-foreground"
                            title="Projeção futura calculada pelas regras do ciclo"
                          >
                            <Sparkles className="h-2.5 w-2.5 mr-0.5 text-primary" /> Simulada
                          </Badge>
                        )}
                      </div>
                    </TableCell>

                    {/* Vencimento */}
                    <TableCell>
                      <span className="text-xs font-medium text-foreground">
                        {formatDate(item.dataVencimento)}
                      </span>
                    </TableCell>

                    {/* Valor da Parcela */}
                    <TableCell className="text-right font-mono text-xs font-bold tabular-nums">
                      {formatCurrency(item.valor)}
                    </TableCell>

                    {/* Status */}
                    <TableCell className="text-center">
                      {item.status === 'paga' ? (
                        <Badge className="bg-success/15 text-success hover:bg-success/20 text-[10px] font-bold border-0">
                          <CheckCircle2 className="mr-1 h-3 w-3" /> Paga
                        </Badge>
                      ) : item.status === 'atrasada' ? (
                        <Badge
                          variant="destructive"
                          className="text-[10px] font-bold uppercase tracking-wide"
                        >
                          <AlertCircle className="mr-1 h-3 w-3" /> Atrasada
                        </Badge>
                      ) : (
                        <Badge
                          variant="outline"
                          className="border-primary/30 bg-primary/5 text-primary text-[10px] font-semibold"
                        >
                          <Clock className="mr-1 h-3 w-3" /> Prevista
                        </Badge>
                      )}
                    </TableCell>

                    {/* Data de Pagamento se quitada */}
                    <TableCell className="text-xs text-muted-foreground">
                      {item.dataPagamento ? (
                        <span className="text-success font-medium">
                          {formatDate(item.dataPagamento)}
                          {item.valorPago && item.valorPago !== item.valor ? (
                            <span className="block text-[10px] text-muted-foreground">
                              ({formatCurrency(item.valorPago)})
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="text-muted-foreground/60">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}

              {cronograma.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-6 text-xs text-muted-foreground">
                    {loading ? 'Carregando dados das parcelas...' : 'Nenhuma parcela disponível.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Rodapé com Fechar */}
        <div className="flex items-center justify-between pt-2 border-t border-border mt-3">
          <p className="text-[11px] text-muted-foreground">
            {isCartao
              ? 'As parcelas seguem a data de fechamento e vencimento da fatura do cartão vinculado.'
              : 'As parcelas seguem o intervalo mensal conforme a data de compra original.'}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            className="text-xs"
          >
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
