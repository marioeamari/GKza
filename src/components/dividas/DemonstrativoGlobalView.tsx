import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Globe, AlertTriangle, CheckCircle2, Layers, ArrowRight, ShieldAlert } from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  consolidarDemonstrativoGlobal,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
} from '@/lib/dividas'

interface DemonstrativoGlobalViewProps {
  dividas: DividaRecord[]
  parcelasPorDivida: Map<string, ParcelaRecord[]>
  receitasPorDivida: Map<string, ReceitaRecord[]>
}

export function DemonstrativoGlobalView({
  dividas,
  parcelasPorDivida,
  receitasPorDivida,
}: DemonstrativoGlobalViewProps) {
  const global = consolidarDemonstrativoGlobal(dividas, parcelasPorDivida, receitasPorDivida)

  return (
    <div className="space-y-5">
      {/* CARD DE ALERTA: QUAL PARCELA DE QUAL DÍVIDA FICA DESCOBERTA PRIMEIRO */}
      <div className="rounded-xl border border-border bg-white p-4 shadow-xs space-y-4">
        <div className="flex items-center justify-between border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            <div>
              <h3 className="text-base font-bold text-foreground">
                Demonstrativo Global Consolidado
              </h3>
              <p className="text-xs text-muted-foreground">
                Visão consolidada no tempo: cada máquina opera estritamente com seu próprio caixa
                isolado (sem caixa compartilhado).
              </p>
            </div>
          </div>
        </div>

        {/* ALERTA DA PRIMEIRA DESCOBERTA GLOBAL */}
        {global.primeira_descoberta_global ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
              </div>
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-rose-800">
                  Primeira Parcela com Caixa Descoberto no Tempo Geral
                </span>
                <div className="text-sm font-semibold text-rose-950 mt-0.5">
                  Máquina:{' '}
                  <strong className="text-rose-900 underline">
                    {global.primeira_descoberta_global.divida_nome}
                  </strong>{' '}
                  — Parcela #{global.primeira_descoberta_global.numero} de{' '}
                  {formatCurrency(global.primeira_descoberta_global.valor)}
                </div>
                <div className="text-xs text-rose-700">
                  Vencimento previsto em{' '}
                  {formatDate(global.primeira_descoberta_global.data_vencimento)}.
                </div>
              </div>
            </div>
            <Badge className="bg-rose-600 text-white border-0 text-xs py-1 px-2.5">
              Requer Atenção de Caixa
            </Badge>
          </div>
        ) : (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                Situação Global Equilibrada
              </span>
              <p className="text-xs text-emerald-900 mt-0.5">
                Nenhuma parcela futura das máquinas encontra-se descoberta de caixa em suas
                projeções atuais.
              </p>
            </div>
          </div>
        )}

        {/* INDICADORES CONSOLIDADOS */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="p-3 bg-slate-50/70 rounded-lg border border-border/60">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Total em Máquinas
            </span>
            <div className="text-lg font-black text-foreground mt-0.5">
              {formatCurrency(global.valor_total_consolidado)}
            </div>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-lg border border-border/60">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Total Quitado
            </span>
            <div className="text-lg font-black text-emerald-600 mt-0.5">
              {formatCurrency(global.total_pago_consolidado)}
            </div>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-lg border border-border/60">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Saldo Devedor Total
            </span>
            <div className="text-lg font-black text-primary mt-0.5">
              {formatCurrency(global.saldo_devedor_consolidado)}
            </div>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-lg border border-border/60">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Receitas Geradas Totais
            </span>
            <div className="text-lg font-black text-emerald-700 mt-0.5">
              {formatCurrency(global.total_receitas_consolidado)}
            </div>
          </div>
        </div>
      </div>

      {/* CRONOGRAMA UNIFICADO ORDENADO POR DATA DE VENCIMENTO */}
      <div className="bg-white rounded-xl border border-border shadow-xs overflow-hidden">
        <div className="p-4 border-b border-border/70 flex justify-between items-center">
          <div>
            <h4 className="text-sm font-bold text-foreground">
              Linha do Tempo Unificada de Vencimentos (Todas as Máquinas)
            </h4>
            <p className="text-xs text-muted-foreground">
              Ordenação temporal de todas as parcelas pendentes com indicador de cobertura do caixa
              de cada máquina.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader className="bg-slate-50/80">
              <TableRow>
                <TableHead>Vencimento</TableHead>
                <TableHead>Máquina / Ativo</TableHead>
                <TableHead className="text-center">Parcela</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="text-center w-40">Caixa da Máquina Cobre?</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {global.cronograma_unificado.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-sm text-muted-foreground">
                    Nenhuma parcela pendente encontrada em nenhuma das máquinas.
                  </TableCell>
                </TableRow>
              ) : (
                global.cronograma_unificado.map((item) => (
                  <TableRow
                    key={`${item.divida_id}_${item.parcela_id}`}
                    className={!item.coberta_pela_maquina ? 'bg-rose-50/30' : undefined}
                  >
                    <TableCell className="text-xs font-semibold text-foreground">
                      {formatDate(item.data_vencimento)}
                    </TableCell>
                    <TableCell className="text-xs font-bold text-slate-800">
                      {item.divida_nome}
                    </TableCell>
                    <TableCell className="text-center text-xs font-medium text-muted-foreground">
                      #{item.numero}
                    </TableCell>
                    <TableCell className="text-right text-xs font-bold">
                      {formatCurrency(item.valor)}
                    </TableCell>
                    <TableCell className="text-center">
                      {item.coberta_pela_maquina ? (
                        <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 text-[11px] gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" /> Coberta
                        </Badge>
                      ) : (
                        <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-0 text-[11px] gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-600" /> Descoberta
                        </Badge>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  )
}
