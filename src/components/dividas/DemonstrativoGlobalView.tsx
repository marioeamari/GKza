import { useState, useMemo } from 'react'
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
import {
  Globe,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ShieldAlert,
  CalendarDays,
  CircleDollarSign,
  TrendingUp,
  Inbox,
  AlertCircle,
} from 'lucide-react'
import { formatCurrency, formatDate } from '@/lib/format'
import {
  consolidarDemonstrativoGlobal,
  calcularTotalMensalPrevisto,
  formatarRotuloMesAno,
  navegarMesCompetencia,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
} from '@/lib/dividas'

interface DemonstrativoGlobalViewProps {
  dividas: DividaRecord[]
  parcelasPorDivida: Map<string, ParcelaRecord[]>
  receitasPorDivida: Map<string, ReceitaRecord[]>
  despesasPorDivida?: Map<string, import('@/lib/dividas').DespesaAvulsaRecord[]>
}

export function DemonstrativoGlobalView({
  dividas,
  parcelasPorDivida,
  receitasPorDivida,
  despesasPorDivida = new Map(),
}: DemonstrativoGlobalViewProps) {
  const mesAtualIso = useMemo(() => new Date().toISOString().slice(0, 7), [])
  const [mesNavegacao, setMesNavegacao] = useState<string>(mesAtualIso)

  const global = useMemo(
    () =>
      consolidarDemonstrativoGlobal(
        dividas,
        parcelasPorDivida,
        receitasPorDivida,
        despesasPorDivida,
      ),
    [dividas, parcelasPorDivida, receitasPorDivida, despesasPorDivida],
  )

  const dadosMensalPrevisto = useMemo(
    () =>
      calcularTotalMensalPrevisto({
        mesAno: mesNavegacao,
        dividas,
        parcelasPorDivida,
        receitasPorDivida,
        despesasPorDivida,
      }),
    [mesNavegacao, dividas, parcelasPorDivida, receitasPorDivida, despesasPorDivida],
  )

  const handleMesAnterior = () => {
    setMesNavegacao((prev) => navegarMesCompetencia(prev, -1))
  }

  const handleMesSeguinte = () => {
    setMesNavegacao((prev) => navegarMesCompetencia(prev, 1))
  }

  const handleMesHoje = () => {
    setMesNavegacao(mesAtualIso)
  }

  const rotuloMesAtual = formatarRotuloMesAno(mesNavegacao)
  const isMesHoje = mesNavegacao === mesAtualIso
  const semMovimentoNoMes =
    dadosMensalPrevisto.quantidade_parcelas === 0 &&
    dadosMensalPrevisto.quantidade_receitas === 0 &&
    dadosMensalPrevisto.quantidade_despesas === 0

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
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-1">
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
              Total Quitado (Parcelas)
            </span>
            <div className="text-lg font-black text-emerald-600 mt-0.5">
              {formatCurrency(global.total_pago_consolidado)}
            </div>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-lg border border-border/60">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Saldo Devedor
            </span>
            <div className="text-lg font-black text-primary mt-0.5">
              {formatCurrency(global.saldo_devedor_consolidado)}
            </div>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-lg border border-border/60">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Despesas Avulsas
            </span>
            <div className="text-lg font-black text-rose-600 mt-0.5">
              {formatCurrency(global.total_despesas_consolidado)}
            </div>
          </div>
          <div className="p-3 bg-slate-50/70 rounded-lg border border-border/60">
            <span className="text-[11px] font-semibold text-muted-foreground uppercase">
              Receitas Geradas
            </span>
            <div className="text-lg font-black text-emerald-700 mt-0.5">
              {formatCurrency(global.total_receitas_consolidado)}
            </div>
          </div>
        </div>
      </div>

      {/* BLOCO: TOTAL MENSAL PREVISTO COM NAVEGAÇÃO ENTRE MESES */}
      <div className="rounded-xl border border-primary/20 bg-linear-to-b from-primary/5 via-white to-white p-4 sm:p-5 shadow-xs space-y-4">
        {/* BARRA DE NAVEGAÇÃO DE MÊS */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/70 pb-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <CalendarDays className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-bold text-foreground">
                  Total Mensal Previsto
                </h4>
                {isMesHoje && (
                  <Badge
                    variant="outline"
                    className="text-[10px] font-semibold py-0 px-2 text-primary border-primary/30"
                  >
                    Mês Atual
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                Navegue entre os meses para saber o quanto arrecadar das máquinas para honrar os
                compromissos.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-start sm:self-center bg-white border border-border rounded-lg p-1 shadow-2xs">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMesAnterior}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Mês Anterior"
              aria-label="Mês Anterior"
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <div className="px-3 min-w-[150px] text-center font-bold text-sm text-foreground select-none">
              {rotuloMesAtual}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={handleMesSeguinte}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
              title="Mês Seguinte"
              aria-label="Mês Seguinte"
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            {!isMesHoje && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMesHoje}
                className="h-7 px-2 text-xs text-muted-foreground ml-1"
              >
                Hoje
              </Button>
            )}
          </div>
        </div>

        {/* ESTADO VAZIO: NENHUMA PARCELA NEM RECEITA NO MÊS */}
        {semMovimentoNoMes ? (
          <div className="rounded-xl border border-dashed border-border/80 bg-slate-50/50 p-6 text-center space-y-2">
            <Inbox className="w-8 h-8 text-slate-300 mx-auto" />
            <h5 className="text-sm font-semibold text-foreground">
              Sem parcelas previstas neste mês
            </h5>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Nenhuma dívida de máquina possui vencimento ou receita registrada em {rotuloMesAtual}.
              Use as setas para navegar para outros meses.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {/* CARDS DE DESTAQUE DO MÊS */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              {/* CARD 1: PARCELAS DO MÊS (TOTAL E ABERTO) */}
              <div className="rounded-xl border border-slate-200 bg-white p-3.5 shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                    Parcelas a Vencer
                  </span>
                  <CircleDollarSign className="w-4 h-4 text-slate-500" />
                </div>
                <div className="text-xl font-black text-slate-900">
                  {formatCurrency(dadosMensalPrevisto.total_parcelas_aberto)}
                </div>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-slate-100">
                  <span>{dadosMensalPrevisto.quantidade_parcelas_aberto} parcela(s) em aberto</span>
                  {dadosMensalPrevisto.total_parcelas_pagas > 0 && (
                    <span className="text-emerald-600 font-medium">
                      +{formatCurrency(dadosMensalPrevisto.total_parcelas_pagas)} pagas
                    </span>
                  )}
                </div>
              </div>

              {/* CARD 2: DESPESAS AVULSAS DO MÊS */}
              <div className="rounded-xl border border-rose-200 bg-white p-3.5 shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-rose-800">
                    Despesas Avulsas
                  </span>
                  <CircleDollarSign className="w-4 h-4 text-rose-500" />
                </div>
                <div className="text-xl font-black text-rose-600">
                  {formatCurrency(dadosMensalPrevisto.total_despesas_mes)}
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-slate-100">
                  <span>
                    {dadosMensalPrevisto.quantidade_despesas} despesa(s) avulsa(s) (fretes, etc.)
                  </span>
                </div>
              </div>

              {/* CARD 3: RECEITAS PREVISTAS/REGISTRADAS DAS MÁQUINAS NO MÊS */}
              <div className="rounded-xl border border-emerald-200 bg-white p-3.5 shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                    Receitas das Máquinas
                  </span>
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                </div>
                <div className="text-xl font-black text-emerald-700">
                  {formatCurrency(dadosMensalPrevisto.total_receitas_mes)}
                </div>
                <div className="text-[11px] text-muted-foreground pt-1 border-t border-slate-100">
                  {dadosMensalPrevisto.quantidade_receitas > 0 ? (
                    <span>{dadosMensalPrevisto.quantidade_receitas} lançamento(s) de receita</span>
                  ) : (
                    <span className="text-amber-700">Nenhuma receita no mês</span>
                  )}
                </div>
              </div>

              {/* CARD 4: RESULTADO - QUANTO FALTA ARRECADAR */}
              <div
                className={`rounded-xl border p-3.5 shadow-2xs space-y-1 ${
                  dadosMensalPrevisto.falta_arrecadar > 0
                    ? 'border-amber-200 bg-amber-50/50'
                    : 'border-emerald-200 bg-emerald-50/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[11px] font-bold uppercase tracking-wider ${
                      dadosMensalPrevisto.falta_arrecadar > 0
                        ? 'text-amber-900'
                        : 'text-emerald-900'
                    }`}
                  >
                    Quanto Falta Arrecadar
                  </span>
                  {dadosMensalPrevisto.falta_arrecadar > 0 ? (
                    <AlertCircle className="w-4 h-4 text-amber-600" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  )}
                </div>
                <div
                  className={`text-xl font-black ${
                    dadosMensalPrevisto.falta_arrecadar > 0 ? 'text-amber-900' : 'text-emerald-700'
                  }`}
                >
                  {formatCurrency(dadosMensalPrevisto.falta_arrecadar)}
                </div>
                <div
                  className={`text-[11px] font-medium pt-1 border-t ${
                    dadosMensalPrevisto.falta_arrecadar > 0
                      ? 'border-amber-200/70 text-amber-800'
                      : 'border-emerald-200/70 text-emerald-800'
                  }`}
                >
                  {dadosMensalPrevisto.falta_arrecadar > 0
                    ? 'Meta para cobrir parcelas + despesas'
                    : dadosMensalPrevisto.superavit > 0
                      ? `Superávit de ${formatCurrency(dadosMensalPrevisto.superavit)}`
                      : 'Compromissos do mês cobertos'}
                </div>
              </div>
            </div>

            {/* TABELA DE COMPOSIÇÃO DETALHADA DO MÊS */}
            <div className="bg-white rounded-lg border border-border/80 overflow-hidden">
              <div className="px-3.5 py-2.5 bg-slate-50 border-b border-border/70 flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  Composição das Parcelas de {rotuloMesAtual}
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Total Previsto: {formatCurrency(dadosMensalPrevisto.total_parcelas_mes)}
                </span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader className="bg-slate-50/50">
                    <TableRow>
                      <TableHead className="text-xs">Vencimento</TableHead>
                      <TableHead className="text-xs">Máquina</TableHead>
                      <TableHead className="text-xs text-center">Parcela</TableHead>
                      <TableHead className="text-xs text-right">Valor</TableHead>
                      <TableHead className="text-xs text-center w-32">Situação</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dadosMensalPrevisto.parcelas.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="text-center py-4 text-xs text-muted-foreground"
                        >
                          Nenhuma parcela de dívida com vencimento neste mês.
                        </TableCell>
                      </TableRow>
                    ) : (
                      dadosMensalPrevisto.parcelas.map((p) => (
                        <TableRow key={`${p.divida_id}_${p.parcela_id}`}>
                          <TableCell className="text-xs font-semibold text-foreground">
                            {formatDate(p.data_vencimento)}
                          </TableCell>
                          <TableCell className="text-xs font-medium text-slate-800">
                            {p.divida_nome}
                          </TableCell>
                          <TableCell className="text-center text-xs font-medium text-muted-foreground">
                            #{p.numero}
                          </TableCell>
                          <TableCell className="text-right text-xs font-bold text-foreground">
                            {formatCurrency(p.valor)}
                          </TableCell>
                          <TableCell className="text-center">
                            {p.paga ? (
                              <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 text-[10px] py-0">
                                Paga
                              </Badge>
                            ) : p.status === 'atrasada' ? (
                              <Badge className="bg-rose-100 text-rose-800 hover:bg-rose-100 border-0 text-[10px] py-0">
                                Atrasada
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="text-[10px] py-0 text-slate-700 border-slate-300"
                              >
                                A Vencer
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
        )}
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
