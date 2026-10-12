import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import {
  TrendingDown,
  TrendingUp,
  Receipt,
  Wallet,
  Layers,
  AlertCircle,
  CalendarDays,
  Calendar,
  CheckCircle2,
} from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { BalancoMesResultado, BalancoSemanalResultado } from '@/lib/lucro'

interface TabBalancoProps {
  balancoData: BalancoMesResultado
  balancoSemanalData?: BalancoSemanalResultado
  nomePeriodo: string
}

export const TabBalanco: React.FC<TabBalancoProps> = ({
  balancoData,
  balancoSemanalData,
  nomePeriodo,
}) => {
  const { lucroLiquido, totalDespesasTags, balanco, isNegativo, grupos } = balancoData

  return (
    <div className="space-y-6">
      {/* =================================================================== */}
      {/* SEÇÃO 1: BALANÇO DO MÊS (TOTALIZANTE CONFERINDO COM AS SEMANAS)    */}
      {/* =================================================================== */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-purple-700" />
            <h3 className="text-sm font-bold text-foreground">
              Balanço do Mês (Totalizante Geral — {nomePeriodo})
            </h3>
          </div>
          <span className="text-[11px] text-muted-foreground font-mono">
            Soma das semanas = Total do Mês
          </span>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* CARD 1: LUCRO LÍQUIDO (SOMA DA ABA 1 NO MÊS) */}
          <Card className="border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-white shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
                <span>Lucro Líquido do Mês</span>
                <TrendingUp className="h-4 w-4 text-emerald-600" />
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Soma de todas as semanas do mês na grade
              </p>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-700">
                {formatCurrency(lucroLiquido)}
              </div>
            </CardContent>
          </Card>

          {/* CARD 2: TOTAL DESPESAS DO MÊS */}
          <Card className="border border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white shadow-xs">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center justify-between">
                <span>Total Despesas do Mês</span>
                <Receipt className="h-4 w-4 text-slate-600" />
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Despesas de competência/pagamento no mês
              </p>
            </CardHeader>
            <CardContent>
              <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-800">
                {formatCurrency(totalDespesasTags)}
              </div>
            </CardContent>
          </Card>

          {/* CARD 3: BALANÇO DO MÊS (NEGATIVO EM DESTAQUE) */}
          <Card
            className={`border-2 shadow-sm transition-all ${
              isNegativo
                ? 'border-red-400 bg-gradient-to-br from-red-50 to-white'
                : 'border-emerald-400 bg-gradient-to-br from-emerald-50 to-white'
            }`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-bold uppercase tracking-wider flex items-center justify-between">
                <span className={isNegativo ? 'text-red-900 font-extrabold' : 'text-emerald-900'}>
                  Balanço do Mês (Lucro − Despesas)
                </span>
                <Badge
                  variant={isNegativo ? 'destructive' : 'default'}
                  className="font-mono text-[10px]"
                >
                  {isNegativo ? 'Déficit' : 'Superávit'}
                </Badge>
              </CardTitle>
              <p className="text-[11px] text-muted-foreground">
                Saldo totalizador mensal consolidado
              </p>
            </CardHeader>
            <CardContent>
              <div
                className={`text-2xl sm:text-3xl font-black font-mono tracking-tight flex items-baseline gap-1 ${
                  isNegativo ? 'text-red-600' : 'text-emerald-600'
                }`}
              >
                <span>{isNegativo ? '- ' : '+ '}</span>
                <span>{formatCurrency(Math.abs(balanco))}</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* =================================================================== */}
      {/* SEÇÃO 2: BALANÇO SEMANAL (LISTA DAS SEMANAS DO MÊS)                 */}
      {/* =================================================================== */}
      {balancoSemanalData && balancoSemanalData.semanas.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-purple-700" />
                Balanço Semanal por Fechamento ({nomePeriodo})
              </h3>
              <p className="text-xs text-muted-foreground">
                Para cada semana do mês: Lucro da semana (grade semanal) − Despesas da semana
                (despesas reais com competência/pagamento na semana). Negativo em destaque.
              </p>
            </div>
            <Badge
              variant="outline"
              className="text-xs font-mono bg-purple-50 text-purple-900 border-purple-200"
            >
              {balancoSemanalData.semanas.length} semanas no mês
            </Badge>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {balancoSemanalData.semanas.map((itemSemana) => {
              const sem = itemSemana.semana
              const neg = itemSemana.isNegativo

              return (
                <Card
                  key={`balanco-semana-${sem.numero}`}
                  className={`border shadow-xs overflow-hidden transition ${
                    neg ? 'border-red-300/80 bg-red-50/15' : 'border-border/80 bg-white'
                  }`}
                >
                  <CardHeader className="py-3 px-4 border-b bg-slate-50/80">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-purple-100 text-purple-800 text-xs font-bold">
                          {sem.numero}
                        </span>
                        <div>
                          <CardTitle className="text-xs font-bold text-foreground">
                            {sem.rotulo}
                          </CardTitle>
                          <span className="text-[10px] text-muted-foreground font-mono">
                            {sem.diasCount} {sem.diasCount === 1 ? 'dia' : 'dias'} (
                            {sem.dataInicio.split('-').slice(1).reverse().join('/')} até{' '}
                            {sem.dataFim.split('-').slice(1).reverse().join('/')})
                          </span>
                        </div>
                      </div>

                      <Badge
                        variant={neg ? 'destructive' : 'default'}
                        className={`font-mono text-xs ${
                          neg ? 'bg-red-600 text-white' : 'bg-emerald-700 text-white'
                        }`}
                      >
                        {neg ? 'Déficit' : 'Superávit'}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="p-4 space-y-3">
                    {/* Linha das métricas da semana */}
                    <div className="grid grid-cols-3 gap-2 p-2.5 rounded-lg bg-slate-50 border text-xs">
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Lucro Grade
                        </span>
                        <span className="font-mono font-bold text-emerald-700 text-sm">
                          {formatCurrency(itemSemana.lucroSemana)}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Despesas
                        </span>
                        <span className="font-mono font-bold text-slate-800 text-sm">
                          {formatCurrency(itemSemana.despesasSemana)}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-semibold text-muted-foreground block">
                          Balanço
                        </span>
                        <span
                          className={`font-mono font-extrabold text-sm ${
                            neg ? 'text-red-600' : 'text-emerald-700'
                          }`}
                        >
                          {neg ? '- ' : '+ '}
                          {formatCurrency(Math.abs(itemSemana.balanco))}
                        </span>
                      </div>
                    </div>

                    {/* Detalhe das despesas agrupadas por destino na semana */}
                    <div className="space-y-1.5 pt-1">
                      <span className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1">
                        <Layers className="h-3 w-3 text-primary" />
                        Despesas por Destino na Semana {sem.numero}:
                      </span>
                      {itemSemana.gruposDespesas.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground italic py-1">
                          Nenhuma despesa registrada nesta semana.
                        </p>
                      ) : (
                        <div className="divide-y divide-border/40 border rounded-md bg-white text-xs">
                          {itemSemana.gruposDespesas.map((grp) => (
                            <div
                              key={`semana-${sem.numero}-grp-${grp.grupo_id}`}
                              className="flex items-center justify-between px-3 py-1.5"
                            >
                              <div className="flex items-center gap-1.5">
                                <span
                                  className="h-2 w-2 rounded-full shrink-0"
                                  style={{ backgroundColor: grp.cor || '#64748B' }}
                                />
                                <span className="font-medium text-foreground text-[11px]">
                                  {grp.grupo_nome}
                                </span>
                                <span className="text-[10px] text-muted-foreground">
                                  ({grp.itens.length})
                                </span>
                              </div>
                              <span className="font-mono font-semibold text-slate-800 text-[11px]">
                                {formatCurrency(grp.total)}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* SEÇÃO 3: DETALHAMENTO MENSAL DAS DESPESAS POR DESTINO               */}
      {/* =================================================================== */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Composição Mensal das Despesas por Destino / Centro de Custo ({nomePeriodo})
            </h3>
            <p className="text-xs text-muted-foreground">
              Despesas reais do mês agrupadas pelos destinos cadastrados em /despesas ('Destino da
              despesa / Centro de custo')
            </p>
          </div>
        </div>

        {grupos.length === 0 ? (
          <Card className="border border-dashed p-8 text-center text-muted-foreground text-xs">
            Nenhuma despesa com tag encontrada para a competência {nomePeriodo}.
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {grupos.map((grupo, gIdx) => {
              // Agrupa subtotais por tag/destino dentro do grupo
              const subTotaisTag: Record<string, { nome: string; total: number; count: number }> =
                {}
              for (const it of grupo.itens) {
                const tagNome = it.tag_nome || it.destino || 'Outros'
                if (!subTotaisTag[tagNome]) {
                  subTotaisTag[tagNome] = { nome: tagNome, total: 0, count: 0 }
                }
                subTotaisTag[tagNome].total += it.valor
                subTotaisTag[tagNome].count++
              }

              const grupoKey = grupo.grupo_id
                ? `grupo-balanco-${grupo.grupo_id}`
                : `grupo-balanco-idx-${gIdx}`

              return (
                <Card
                  key={grupoKey}
                  className="border border-border/80 bg-white shadow-xs overflow-hidden"
                >
                  <CardHeader
                    className="py-3 px-4 border-b border-border/60"
                    style={{
                      borderTop: `4px solid ${grupo.cor || '#2563EB'}`,
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{ backgroundColor: grupo.cor || '#2563EB' }}
                        />
                        <CardTitle className="text-sm font-bold text-foreground">
                          {grupo.grupo_nome}
                        </CardTitle>
                      </div>
                      <span className="font-mono text-sm font-extrabold text-foreground">
                        {formatCurrency(grupo.total)}
                      </span>
                    </div>
                  </CardHeader>

                  <CardContent className="p-0">
                    <div className="divide-y divide-border/40 text-xs">
                      {Object.values(subTotaisTag).length === 0 ? (
                        <div className="py-4 text-center text-muted-foreground text-[11px]">
                          Sem lançamentos neste grupo.
                        </div>
                      ) : (
                        Object.values(subTotaisTag)
                          .sort((a, b) => b.total - a.total)
                          .map((sub, sIdx) => (
                            <div
                              key={`subtag-${grupo.grupo_id || gIdx}-${sub.nome || sIdx}`}
                              className="flex items-center justify-between px-4 py-2 hover:bg-slate-50/50 transition-colors"
                            >
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">{sub.nome}</span>
                                <Badge
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0 font-normal text-muted-foreground"
                                >
                                  {sub.count} {sub.count === 1 ? 'item' : 'itens'}
                                </Badge>
                              </div>
                              <span className="font-mono font-semibold text-slate-800">
                                {formatCurrency(sub.total)}
                              </span>
                            </div>
                          ))
                      )}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
