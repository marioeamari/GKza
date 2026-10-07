import { useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Plus,
  RefreshCw,
  Trash2,
  Pencil,
  RotateCcw,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import { calcularCronogramaComSaldo, type DividaRecord, type ParcelaRecord } from '@/lib/dividas'
import { dividasService } from '@/services/dividas'
import { toast } from '@/hooks/use-toast'
import { ParcelaModal } from './ParcelaModal'
import { RenegociacaoModal } from './RenegociacaoModal'

interface CronogramaParcelasProps {
  divida: DividaRecord
  parcelas: ParcelaRecord[]
  onRefresh: () => void
}

export function CronogramaParcelas({ divida, parcelas, onRefresh }: CronogramaParcelasProps) {
  const [modalNovaParcela, setModalNovaParcela] = useState(false)
  const [modalEditarParcela, setModalEditarParcela] = useState<ParcelaRecord | null>(null)
  const [modalRenegociar, setModalRenegociar] = useState(false)
  const [processandoId, setProcessandoId] = useState<string | null>(null)

  const cronogramaComSaldo = calcularCronogramaComSaldo(divida.valor_total, parcelas)

  // Ação manual de marcar como paga / pendente (isolada do financeiro)
  const handleAlternarPagamento = async (parcela: ParcelaRecord) => {
    setProcessandoId(parcela.id)
    try {
      const estaPaga = parcela.status === 'paga'
      await dividasService.marcarPagamentoManual(parcela.id, !estaPaga)
      toast({
        title: estaPaga ? 'Pagamento estornado' : 'Pagamento marcado manualmente',
        description: estaPaga
          ? `Parcela #${parcela.numero} voltou ao status pendente.`
          : `Parcela #${parcela.numero} marcada como paga. Nada baixado no financeiro.`,
      })
      onRefresh()
    } catch (err: any) {
      toast({
        title: 'Erro ao alterar status',
        description: err?.message,
        variant: 'destructive',
      })
    } finally {
      setProcessandoId(null)
    }
  }

  const handleExcluirParcela = async (id: string, numero: number) => {
    if (
      !confirm(`Deseja realmente excluir a parcela #${numero}? O saldo restante será recalculado.`)
    ) {
      return
    }
    try {
      await dividasService.deleteParcela(id)
      toast({ title: `Parcela #${numero} excluída!` })
      onRefresh()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir parcela',
        description: err?.message,
        variant: 'destructive',
      })
    }
  }

  const proximoNumero = parcelas.reduce((max, p) => Math.max(max, p.numero), 0) + 1

  return (
    <div className="space-y-4">
      {/* BARRA SUPERIOR DE AÇÕES */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-white p-3.5 rounded-xl border border-border shadow-xs">
        <div>
          <h3 className="text-base font-bold text-foreground">
            Cronograma de Parcelas & Amortização
          </h3>
          <p className="text-xs text-muted-foreground">
            Valores fixos ou irregulares. Marcação de pagamento exclusivamente{' '}
            <strong>MANUAL</strong> (sem reflexo no financeiro).
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setModalRenegociar(true)}
            className="text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
          >
            <RefreshCw className="w-3.5 h-3.5" /> Renegociar Restante
          </Button>
          <Button
            size="sm"
            onClick={() => setModalNovaParcela(true)}
            className="text-xs gap-1.5 bg-primary hover:bg-primary/90 text-white font-semibold"
          >
            <Plus className="w-3.5 h-3.5" /> Nova Parcela
          </Button>
        </div>
      </div>

      {/* TABELA DO CRONOGRAMA */}
      <div className="rounded-xl border border-border bg-white shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead className="w-14 text-center">#</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead className="text-right">Valor Previsto</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Pagamento</TableHead>
                <TableHead className="text-right">Saldo Devedor Após</TableHead>
                <TableHead className="text-center w-36">Ações Manuais</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {cronogramaComSaldo.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-sm text-muted-foreground">
                    Nenhuma parcela cadastrada para esta dívida.
                  </TableCell>
                </TableRow>
              ) : (
                cronogramaComSaldo.map((p) => {
                  const isPaga = p.status === 'paga'
                  const isAtrasada = p.status === 'atrasada'
                  return (
                    <TableRow key={p.id} className={isPaga ? 'bg-emerald-50/30' : undefined}>
                      <TableCell className="text-center font-bold text-xs text-muted-foreground">
                        {p.is_entrada ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] px-1 py-0 bg-blue-50 text-blue-700 border-blue-200"
                          >
                            Entrada
                          </Badge>
                        ) : (
                          `#${p.numero}`
                        )}
                      </TableCell>
                      <TableCell className="text-xs font-medium">
                        {formatDate(p.data_vencimento)}
                      </TableCell>
                      <TableCell className="text-right text-xs font-semibold">
                        {formatCurrency(p.valor)}
                      </TableCell>
                      <TableCell>
                        {isPaga ? (
                          <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 text-[11px] gap-1">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Paga
                          </Badge>
                        ) : isAtrasada ? (
                          <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-0 text-[11px] gap-1">
                            <AlertTriangle className="w-3 h-3 text-rose-600" /> Atrasada
                          </Badge>
                        ) : (
                          <Badge variant="secondary" className="text-[11px] gap-1 text-slate-700">
                            <Clock className="w-3 h-3 text-slate-500" /> Pendente
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {isPaga ? (
                          <div>
                            <span className="font-medium text-emerald-800">
                              {p.data_pagamento ? formatDate(p.data_pagamento) : 'Pago'}
                            </span>
                            {p.valor_pago !== undefined && p.valor_pago !== p.valor && (
                              <span className="block text-[10px] text-muted-foreground">
                                Pago: {formatCurrency(p.valor_pago)}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right text-xs font-bold text-slate-700">
                        {formatCurrency(p.saldo_restante_apos)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                size="sm"
                                variant={isPaga ? 'outline' : 'default'}
                                disabled={processandoId === p.id}
                                onClick={() => handleAlternarPagamento(p)}
                                className={
                                  isPaga
                                    ? 'h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground'
                                    : 'h-7 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-medium'
                                }
                              >
                                {isPaga ? (
                                  <>
                                    <RotateCcw className="w-3 h-3 mr-1" /> Estornar
                                  </>
                                ) : (
                                  <>
                                    <CheckCircle2 className="w-3 h-3 mr-1" /> Pagar
                                  </>
                                )}
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="text-xs">
                              {isPaga
                                ? 'Desmarcar pagamento manual'
                                : 'Registrar pagamento MANUAL desta parcela'}
                            </TooltipContent>
                          </Tooltip>

                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setModalEditarParcela(p)}
                            className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          >
                            <Pencil className="w-3 h-3" />
                          </Button>

                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => handleExcluirParcela(p.id, p.numero)}
                            className="h-7 w-7 text-destructive hover:bg-destructive/10"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* MODAL ADICIONAR PARCELA */}
      {modalNovaParcela && (
        <ParcelaModal
          open={modalNovaParcela}
          onOpenChange={setModalNovaParcela}
          dividaId={divida.id}
          proximoNumero={proximoNumero}
          onSuccess={onRefresh}
        />
      )}

      {/* MODAL EDITAR PARCELA */}
      {modalEditarParcela && (
        <ParcelaModal
          open={Boolean(modalEditarParcela)}
          onOpenChange={(op) => !op && setModalEditarParcela(null)}
          dividaId={divida.id}
          parcelaParaEditar={modalEditarParcela}
          onSuccess={onRefresh}
        />
      )}

      {/* MODAL RENEGOCIAR */}
      {modalRenegociar && (
        <RenegociacaoModal
          open={modalRenegociar}
          onOpenChange={setModalRenegociar}
          divida={divida}
          parcelas={parcelas}
          onSuccess={onRefresh}
        />
      )}
    </div>
  )
}
