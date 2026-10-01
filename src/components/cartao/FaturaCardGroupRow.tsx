import { useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  CheckCircle2,
  Undo2,
  Calendar,
  FileText,
  Pencil,
  Trash2,
} from 'lucide-react'
import { pb } from '@/lib/pocketbase/client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { TitularBadge } from '@/components/TitularBadge'
import { calcularFaturaCartao, type FaturaCartaoGroup } from '@/lib/cartao-fatura'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Lancamento } from '@/types/domain'

interface FaturaCardGroupRowProps {
  fatura: FaturaCartaoGroup
  canWrite: boolean
  canDelete: boolean
  onPagarFatura: (fatura: FaturaCartaoGroup) => void
  onEstornarFatura: (fatura: FaturaCartaoGroup) => void
  onEditItem: (item: Lancamento) => void
  onDeleteItem: (item: Lancamento) => void
}

export function FaturaCardGroupRow({
  fatura,
  canWrite,
  canDelete,
  onPagarFatura,
  onEstornarFatura,
  onEditItem,
  onDeleteItem,
}: FaturaCardGroupRowProps) {
  const [expanded, setExpanded] = useState(false)

  const dateObj = new Date(fatura.dataFechamento + 'T12:00:00')
  const mesExtenso = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mesCapitalizado = mesExtenso.charAt(0).toUpperCase() + mesExtenso.slice(1)
  const tituloFatura = `Fatura de ${mesCapitalizado} — ${fatura.conta.nome}`

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-white shadow-soft transition-all">
      {/* Header do Grupo de Fatura */}
      <div
        className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between cursor-pointer hover:bg-secondary/30 transition"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-lg bg-secondary text-muted-foreground hover:text-foreground shrink-0"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded(!expanded)
            }}
          >
            {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>

          <span
            className="grid h-10 w-10 place-items-center rounded-xl text-white shrink-0 shadow-xs"
            style={{ background: fatura.conta.cor || '#8A05BE' }}
          >
            <CreditCard className="h-5 w-5" />
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-extrabold text-foreground truncate">
                {tituloFatura}
              </span>
              {fatura.paga ? (
                <Badge className="bg-success/15 text-success border-success/30 text-[10px] font-bold">
                  <CheckCircle2 className="mr-1 h-3 w-3" /> Fatura Paga
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-amber-400 bg-amber-50 text-amber-700 text-[10px] font-bold"
                >
                  Fatura Aberta / Pendente
                </Badge>
              )}
              {fatura.conta.bandeira && (
                <Badge variant="outline" className="text-[10px]">
                  {fatura.conta.bandeira}
                </Badge>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
              <span>{fatura.itens.length} compras no ciclo</span>
              <span>•</span>
              <span>Fechamento: {formatDate(fatura.dataFechamento)}</span>
              <span>•</span>
              <span className="font-semibold text-foreground flex items-center gap-1">
                <Calendar className="h-3 w-3 text-muted-foreground" />
                Vencimento: {formatDate(fatura.dataVencimento)}
              </span>
            </div>
          </div>
        </div>

        {/* Total e Ações da Fatura */}
        <div className="flex items-center justify-between sm:justify-end gap-3 border-t sm:border-0 pt-2 sm:pt-0">
          <div className="text-right">
            <p className="micro-label">Total da fatura</p>
            <p
              className={`text-base font-extrabold tabular-nums ${
                fatura.paga ? 'text-success' : 'text-primary'
              }`}
            >
              − {formatCurrency(fatura.totalFatura)}
            </p>
          </div>

          <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
            {canWrite && (
              <>
                {fatura.paga ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs text-muted-foreground hover:text-foreground"
                    onClick={() => onEstornarFatura(fatura)}
                    title="Desfazer pagamento da fatura (estorna o dinheiro pro caixa)"
                  >
                    <Undo2 className="mr-1 h-3.5 w-3.5" /> Desfazer baixa
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    className="h-8 bg-primary hover:bg-primary/90 text-xs font-bold text-white shadow-xs"
                    onClick={() => onPagarFatura(fatura)}
                    title="Dar baixa na fatura inteira debitando de uma conta corrente"
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pagar fatura
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Compras Individuais Expandidas (SEM botão de baixa individual!) */}
      {expanded && (
        <div className="border-t border-border bg-secondary/15 divide-y divide-border">
          <div className="px-4 py-2 bg-secondary/40 text-[11px] font-semibold text-muted-foreground flex items-center justify-between">
            <span>
              Compras detalhadas desta fatura (baixa individual desabilitada pelo modelo de
              competência)
            </span>
            <span>Total: {formatCurrency(fatura.totalFatura)}</span>
          </div>

          {fatura.itens.map((item) => {
            const ciclo = calcularFaturaCartao(fatura.conta, item.data)
            const cicloDateObj = new Date(ciclo.dataFechamento + 'T12:00:00')
            const cicloMesAno = cicloDateObj.toLocaleDateString('pt-BR', {
              month: 'long',
              year: 'numeric',
            })
            const cicloMesCap = cicloMesAno.charAt(0).toUpperCase() + cicloMesAno.slice(1)
            const [vy, vm, vd] = ciclo.dataVencimento.split('-')
            const cicloBadgeText = `Fatura de ${cicloMesCap} · vence ${vd}/${vm}`

            return (
              <div
                key={item.id}
                className="flex items-center justify-between gap-3 p-3 pl-12 text-xs transition hover:bg-secondary/40"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-foreground truncate">{item.descricao}</span>
                    <Badge
                      variant="outline"
                      className="border-primary/40 bg-primary/10 text-primary font-bold text-[10px] px-2 py-0.5"
                    >
                      {cicloBadgeText}
                    </Badge>
                    <TitularBadge lancamento={item} />
                  </div>
                  <span className="text-[11px] text-muted-foreground flex flex-wrap items-center gap-2 mt-0.5">
                    <span>Data da compra: {formatDate(item.data)}</span>
                    {item.expand?.categoria?.nome && (
                      <>
                        <span>•</span>
                        <span className="font-medium text-foreground">
                          {item.expand.categoria.nome}
                        </span>
                      </>
                    )}
                    {item.comprovante && (
                      <>
                        <span>•</span>
                        <a
                          href={pb.files.getURL(
                            { id: item.id, collectionName: 'lancamentos' } as any,
                            item.comprovante,
                          )}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="inline-flex items-center gap-1 font-semibold text-[#DF5830] hover:underline"
                          title="Ver comprovante"
                        >
                          <FileText className="h-3 w-3" />
                          Comprovante
                        </a>
                      </>
                    )}
                    {item.observacoes && (
                      <>
                        <span>•</span>
                        <span className="italic truncate max-w-[200px]">{item.observacoes}</span>
                      </>
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-extrabold tabular-nums text-foreground">
                    − {formatCurrency(item.valor)}
                  </span>

                  {canWrite && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                      onClick={() => onEditItem(item)}
                      title="Editar compra"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                  )}

                  {canDelete && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => onDeleteItem(item)}
                      title="Excluir compra"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
