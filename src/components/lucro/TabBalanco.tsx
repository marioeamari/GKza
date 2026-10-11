import React from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { TrendingDown, TrendingUp, Receipt, Wallet, Layers, AlertCircle } from 'lucide-react'
import { formatCurrency } from '@/lib/format'
import type { BalancoMesResultado } from '@/lib/lucro'

interface TabBalancoProps {
  balancoData: BalancoMesResultado
  nomePeriodo: string
}

export const TabBalanco: React.FC<TabBalancoProps> = ({ balancoData, nomePeriodo }) => {
  const { lucroLiquido, totalDespesasTags, balanco, isNegativo, grupos } = balancoData

  return (
    <div className="space-y-6">
      {/* =================================================================== */}
      {/* CARTÕES RESUMO DO BALANÇO                                           */}
      {/* =================================================================== */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* CARD 1: LUCRO LÍQUIDO (SOMA DA ABA 1) */}
        <Card className="border border-emerald-200/80 bg-gradient-to-br from-emerald-50/60 to-white shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-emerald-800 flex items-center justify-between">
              <span>Lucro Líquido ({nomePeriodo})</span>
              <TrendingUp className="h-4 w-4 text-emerald-600" />
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Soma total de lucro aprovado da grade de canais
            </p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-emerald-700">
              {formatCurrency(lucroLiquido)}
            </div>
          </CardContent>
        </Card>

        {/* CARD 2: TOTAL TAGS (DESPESAS) */}
        <Card className="border border-slate-200/80 bg-gradient-to-br from-slate-50/60 to-white shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center justify-between">
              <span>Total Tags (Despesas)</span>
              <Receipt className="h-4 w-4 text-slate-600" />
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Despesas do financeiro agrupadas por destino / tags
            </p>
          </CardHeader>
          <CardContent>
            <div className="text-2xl sm:text-3xl font-black font-mono tracking-tight text-slate-800">
              {formatCurrency(totalDespesasTags)}
            </div>
          </CardContent>
        </Card>

        {/* CARD 3: BALANÇO = LUCRO − DESPESAS (NEGATIVO EM DESTAQUE) */}
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
                Balanço (Lucro − Despesas)
              </span>
              <Badge
                variant={isNegativo ? 'destructive' : 'default'}
                className="font-mono text-[10px]"
              >
                {isNegativo ? 'Déficit' : 'Superávit'}
              </Badge>
            </CardTitle>
            <p className="text-[11px] text-muted-foreground">
              Saldo final de competência do período
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

      {/* =================================================================== */}
      {/* DETALHAMENTO DAS DESPESAS POR GRUPO DE CONTEXTO                    */}
      {/* =================================================================== */}
      <div className="space-y-4">
        <div className="flex items-center justify-between border-b pb-2">
          <div>
            <h3 className="text-sm font-bold text-foreground flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Composição das Despesas por Destino / Centro de Custo ({nomePeriodo})
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
            {grupos.map((grupo) => {
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

              return (
                <Card
                  key={grupo.grupo_id}
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
                          .map((sub) => (
                            <div
                              key={sub.nome}
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
