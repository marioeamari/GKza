import { useState } from 'react'
import { CheckCircle2, ChevronDown, ChevronRight, CreditCard, Undo2 } from 'lucide-react'
import { Link } from 'react-router-dom'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { FaturaCartaoGroup } from '@/lib/cartao-fatura'
import { formatCurrency, formatDate } from '@/lib/format'

interface DashboardFaturasCardProps {
  faturas: FaturaCartaoGroup[]
  onPagarFatura?: (fatura: FaturaCartaoGroup) => void
  canWrite?: boolean
}

export function DashboardFaturasCard({
  faturas,
  onPagarFatura,
  canWrite,
}: DashboardFaturasCardProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null)

  if (!faturas.length) return null

  return (
    <Card className="rise-in rise-delay-2 lg:col-span-12">
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Faturas de Cartão de Crédito
          </CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">
            Acompanhamento de ciclos e vencimentos consolidados (o dinheiro só sai do caixa no
            pagamento da fatura)
          </p>
        </div>
        <Button variant="ghost" size="sm" asChild>
          <Link to="/lancamentos">Ver lançamentos</Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {faturas.map((fatura) => {
            const dateObj = new Date(fatura.dataFechamento + 'T12:00:00')
            const mesExtenso = dateObj.toLocaleDateString('pt-BR', {
              month: 'long',
              year: 'numeric',
            })
            const mesCap = mesExtenso.charAt(0).toUpperCase() + mesExtenso.slice(1)
            const isExpanded = expandedId === fatura.id

            return (
              <div
                key={fatura.id}
                className="rounded-2xl border border-border bg-white p-4 shadow-soft transition hover:shadow-md flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="grid h-9 w-9 place-items-center rounded-xl text-white font-bold text-xs"
                        style={{ background: fatura.conta.cor || '#8A05BE' }}
                      >
                        <CreditCard className="h-4 w-4" />
                      </span>
                      <div>
                        <h4 className="text-sm font-extrabold text-foreground">
                          {fatura.conta.nome}
                        </h4>
                        <p className="text-xs text-muted-foreground">Fatura de {mesCap}</p>
                      </div>
                    </div>
                    {fatura.paga ? (
                      <Badge className="bg-success/15 text-success border-success/30 text-[10px]">
                        Paga
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-amber-400 bg-amber-50 text-amber-700 text-[10px]"
                      >
                        Aberta
                      </Badge>
                    )}
                  </div>

                  <div className="mt-4">
                    <p className="micro-label">Valor total</p>
                    <p
                      className={`text-2xl font-extrabold tabular-nums ${
                        fatura.paga ? 'text-success' : 'text-primary'
                      }`}
                    >
                      {formatCurrency(fatura.totalFatura)}
                    </p>
                  </div>

                  <div className="mt-3 space-y-1 text-xs text-muted-foreground border-t pt-2.5">
                    <div className="flex justify-between">
                      <span>Fechamento da fatura:</span>
                      <span className="font-semibold text-foreground">
                        {formatDate(fatura.dataFechamento)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Vencimento do boleto:</span>
                      <span className="font-bold text-foreground">
                        {formatDate(fatura.dataVencimento)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span>Total de despesas:</span>
                      <span>{fatura.itens.length} compra(s)</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-2 border-t flex items-center justify-between gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground px-2"
                    onClick={() => setExpandedId(isExpanded ? null : fatura.id)}
                  >
                    {isExpanded ? (
                      <>
                        <ChevronDown className="mr-1 h-3.5 w-3.5" /> Ocultar itens
                      </>
                    ) : (
                      <>
                        <ChevronRight className="mr-1 h-3.5 w-3.5" /> Ver itens (
                        {fatura.itens.length})
                      </>
                    )}
                  </Button>

                  {canWrite && !fatura.paga && onPagarFatura && (
                    <Button
                      size="sm"
                      className="h-8 bg-primary hover:bg-primary/90 text-xs font-bold text-white shadow-xs"
                      onClick={() => onPagarFatura(fatura)}
                    >
                      <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Pagar fatura
                    </Button>
                  )}
                </div>

                {isExpanded && (
                  <div className="mt-3 border-t pt-2 space-y-1.5 max-h-48 overflow-y-auto">
                    {fatura.itens.map((it) => (
                      <div
                        key={it.id}
                        className="flex items-center justify-between text-xs py-1 px-1.5 rounded hover:bg-secondary/40"
                      >
                        <div className="min-w-0 flex-1 truncate pr-2">
                          <span className="font-medium text-foreground block truncate">
                            {it.descricao}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            {formatDate(it.data)}
                          </span>
                        </div>
                        <span className="font-extrabold tabular-nums shrink-0">
                          {formatCurrency(it.valor)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </CardContent>
    </Card>
  )
}
