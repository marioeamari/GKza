import React, { useMemo } from 'react'
import {
  Wallet,
  CreditCard,
  Building,
  ArrowRight,
  TrendingUp,
  ShieldCheck,
  PiggyBank,
  CheckCircle2,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type { Conta, DespesaCompromisso, DespesaOcorrencia, Lancamento } from '@/types/domain'

interface TabPatrimonioProps {
  contas: Conta[]
  lancamentos: Lancamento[]
  compromissos: DespesaCompromisso[]
  ocorrencias: DespesaOcorrencia[]
}

export function TabPatrimonio({
  contas,
  lancamentos,
  compromissos,
  ocorrencias,
}: TabPatrimonioProps) {
  // Saldo total por tipo de conta (bancária, caixa, cartão, marketplace)
  const saldosContas = useMemo(() => {
    const contasAtivas = contas.filter((c) => c.ativa)
    const paid = lancamentos.filter((l) => l.status === 'pago')

    let saldoBancos = 0
    let saldoCaixa = 0
    let limiteOuFaturaCartao = 0

    const listagem = contasAtivas.map((c) => {
      const lancsDaConta = paid.filter((l) => l.conta === c.id)
      const mov = lancsDaConta.reduce(
        (sum, item) => sum + (item.tipo === 'receita' ? item.valor : -item.valor),
        0,
      )
      const saldoFinal = (c.saldo_inicial || 0) + mov

      if (c.tipo === 'bancaria') saldoBancos += saldoFinal
      else if (c.tipo === 'caixa') saldoCaixa += saldoFinal
      else if (c.tipo === 'cartao') limiteOuFaturaCartao += Math.abs(saldoFinal)

      return {
        ...c,
        saldoFinal,
      }
    })

    const totalLiquidez = saldoBancos + saldoCaixa

    return {
      totalLiquidez,
      saldoBancos,
      saldoCaixa,
      listagem,
    }
  }, [contas, lancamentos])

  // Passivos (compromissos futuros e parcelamentos em aberto)
  const passivos = useMemo(() => {
    const parcelamentosAtivos = compromissos.filter(
      (c) =>
        c.ativo && (c.modalidade_parcelamento === 'parcelado' || c.regra_repeticao === 'parcelado'),
    )

    // Ocorrências futuras não pagas
    const ocorrenciasFuturas = ocorrencias.filter((o) => o.status === 'prevista')
    const totalCompromissosFuturos = ocorrenciasFuturas.reduce(
      (sum, o) => sum + (o.valor_previsto || 0),
      0,
    )

    return {
      parcelamentosAtivos: parcelamentosAtivos.length,
      totalCompromissosFuturos,
    }
  }, [compromissos, ocorrencias])

  const patrimonioLiquidoFinanceiro = saldosContas.totalLiquidez - passivos.totalCompromissosFuturos

  return (
    <div className="space-y-4">
      {/* KPIs de Patrimônio & Liquidez */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Saldo em Contas e Caixa"
          value={saldosContas.totalLiquidez}
          icon={Wallet}
          to="/contas"
          colorClass="text-emerald-700"
          bgLightClass="bg-emerald-50"
          subtitle="Disponibilidade imediata (Ativos)"
        />

        <ModernKpiCard
          title="Compromissos Futuros (Passivos)"
          value={passivos.totalCompromissosFuturos}
          icon={CreditCard}
          to="/despesas?status=prevista"
          colorClass="text-rose-700"
          bgLightClass="bg-rose-50"
          subtitle="Ocorrências previstas no fluxo"
        />

        <ModernKpiCard
          title="Patrimônio Líquido Financeiro"
          value={patrimonioLiquidoFinanceiro}
          icon={ShieldCheck}
          to="/contas"
          colorClass={patrimonioLiquidoFinanceiro >= 0 ? 'text-indigo-700' : 'text-rose-700'}
          bgLightClass={patrimonioLiquidoFinanceiro >= 0 ? 'bg-indigo-50' : 'bg-rose-50'}
          subtitle="Liquidez menos compromissos"
        />

        <ModernKpiCard
          title="Parcelamentos em Aberto"
          value={passivos.parcelamentosAtivos}
          isCurrency={false}
          icon={PiggyBank}
          to="/despesas"
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle="Contratos parcelados ativos"
        />
      </div>

      {/* Detalhamento de Contas e Posição */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <Card className="lg:col-span-8">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold">Posição Consolidada por Conta</CardTitle>
              <p className="text-xs text-muted-foreground">
                Saldos atuais calculados a partir das movimentações
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/contas">
                Ver contas <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent>
            {saldosContas.listagem.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {saldosContas.listagem.map((conta) => (
                  <div
                    key={conta.id}
                    className="p-3.5 rounded-xl border border-border/70 hover:bg-secondary/30 transition flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-2">
                      <span
                        className="grid h-8 w-8 place-items-center rounded-lg text-white font-bold text-xs shrink-0"
                        style={{ background: conta.cor || '#DF5830' }}
                      >
                        {conta.tipo === 'cartao' ? (
                          <CreditCard className="h-4 w-4" />
                        ) : (
                          <Wallet className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0 truncate">
                        <span className="text-xs font-bold text-foreground block truncate">
                          {conta.nome}
                        </span>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          {conta.tipo} {conta.bandeira ? `· ${conta.bandeira}` : ''}
                        </span>
                      </div>
                    </div>

                    <span
                      className={`text-sm font-extrabold tabular-nums shrink-0 ${
                        conta.saldoFinal >= 0 ? 'text-foreground' : 'text-rose-600'
                      }`}
                    >
                      {formatCurrency(conta.saldoFinal)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Nenhuma conta bancária ou caixa ativo.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Resumo de Ativos vs Passivos */}
        <Card className="lg:col-span-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Composição Patrimonial</CardTitle>
            <p className="text-xs text-muted-foreground">Balanço simplificado de liquidez</p>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50/20">
              <span className="text-xs font-semibold text-emerald-800 uppercase block">
                Ativos Líquidos
              </span>
              <p className="text-xl font-extrabold tabular-nums text-emerald-800 mt-0.5">
                {formatCurrency(saldosContas.totalLiquidez)}
              </p>
              <div className="mt-2 text-[11px] text-muted-foreground space-y-0.5 border-t border-emerald-200/50 pt-1.5">
                <div className="flex justify-between">
                  <span>Bancos:</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(saldosContas.saldoBancos)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>Caixas físicos:</span>
                  <span className="font-medium text-foreground">
                    {formatCurrency(saldosContas.saldoCaixa)}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl border border-rose-200 bg-rose-50/20">
              <span className="text-xs font-semibold text-rose-800 uppercase block">
                Passivos de Curto Prazo
              </span>
              <p className="text-xl font-extrabold tabular-nums text-rose-800 mt-0.5">
                {formatCurrency(passivos.totalCompromissosFuturos)}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Contas a pagar e parcelas com vencimento agendado
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
