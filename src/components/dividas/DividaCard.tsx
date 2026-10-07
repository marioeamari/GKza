import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Banknote, Calendar, Clock, CheckCircle2, ChevronRight, TrendingUp } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  calcularResumoDivida,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
} from '@/lib/dividas'

interface DividaCardProps {
  divida: DividaRecord
  parcelas: ParcelaRecord[]
  receitas: ReceitaRecord[]
  isSelected?: boolean
  onClick?: () => void
}

export function DividaCard({ divida, parcelas, receitas, isSelected, onClick }: DividaCardProps) {
  const resumo = calcularResumoDivida(divida, parcelas)
  const totalReceitas = receitas.reduce((acc, r) => acc + (r.valor || 0), 0)

  return (
    <Card
      onClick={onClick}
      className={`cursor-pointer transition-all hover:shadow-md border ${
        isSelected
          ? 'border-primary ring-2 ring-primary/20 bg-orange-50/20'
          : 'border-border/80 bg-white hover:border-border'
      }`}
    >
      <CardContent className="p-4 space-y-3.5">
        {/* CABEÇALHO DO CARTÃO */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap">
              <h3 className="font-bold text-sm text-foreground truncate">{divida.nome}</h3>
              {divida.status === 'quitada' ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] px-1.5 py-0">
                  Quitada
                </Badge>
              ) : divida.status === 'renegociada' ? (
                <Badge className="bg-blue-100 text-blue-800 border-0 text-[10px] px-1.5 py-0">
                  Renegociada
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] px-1.5 py-0">
                  Ativa
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {divida.credor} • Contratada em {formatDate(divida.data_contratacao)}
            </p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
        </div>

        {/* VALORES PRINCIPAIS */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
          <div>
            <span className="text-muted-foreground block text-[11px]">Saldo Devedor</span>
            <span className="font-extrabold text-sm text-primary">
              {formatCurrency(resumo.saldo_devedor)}
            </span>
          </div>
          <div className="text-right">
            <span className="text-muted-foreground block text-[11px]">Total Pago</span>
            <span className="font-bold text-sm text-emerald-600">
              {formatCurrency(resumo.total_pago)}
            </span>
          </div>
        </div>

        {/* PROGRESSO QUITAÇÃO */}
        <div className="space-y-1">
          <div className="flex justify-between text-[11px] text-muted-foreground">
            <span>Amortização</span>
            <span className="font-bold text-foreground">
              {resumo.percentual_quitado}% ({resumo.parcelas_pagas}/{resumo.total_parcelas}{' '}
              parcelas)
            </span>
          </div>
          <Progress value={resumo.percentual_quitado} className="h-1.5 bg-slate-100" />
        </div>

        {/* RODAPÉ DO CARTÃO: PRÓXIMA PARCELA & RECEITAS */}
        <div className="pt-2 border-t border-border/60 flex items-center justify-between text-[11px] text-muted-foreground">
          {resumo.proxima_parcela ? (
            <div className="flex items-center gap-1 truncate">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="truncate">
                Próx: <strong>{formatDate(resumo.proxima_parcela.data_vencimento)}</strong> (
                {formatCurrency(resumo.proxima_parcela.valor)})
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1 text-emerald-700 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Sem parcelas pendentes</span>
            </div>
          )}

          {totalReceitas > 0 && (
            <div className="flex items-center gap-1 text-emerald-700 font-medium shrink-0">
              <TrendingUp className="w-3.5 h-3.5" />
              <span>{formatCurrency(totalReceitas)}</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
