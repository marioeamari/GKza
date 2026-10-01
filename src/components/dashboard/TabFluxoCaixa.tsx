import React, { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
  AreaChart,
  Area,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  HelpCircle,
  ArrowRight,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency, formatShortDate, parseDate } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type { Lancamento, DespesaOcorrencia, Repasse } from '@/types/domain'

interface TabFluxoCaixaProps {
  saldoAtual: number
  lancamentosRealizados: Lancamento[]
  ocorrenciasPendentes: DespesaOcorrencia[]
  repassesPrevistos: Repasse[]
  periodStart: Date
  periodEnd: Date
}

export function TabFluxoCaixa({
  saldoAtual,
  lancamentosRealizados,
  ocorrenciasPendentes,
  repassesPrevistos,
  periodStart,
  periodEnd,
}: TabFluxoCaixaProps) {
  // Projeção futura para 7, 30, 60 e 90 dias
  const projecoes = useMemo(() => {
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    const calcularParaDias = (dias: number) => {
      const limite = new Date(hoje.getTime() + dias * 86400000)

      const entradas = repassesPrevistos
        .filter((r) => {
          if (r.status !== 'previsto') return false
          const d = parseDate(r.data_prevista)
          return d >= hoje && d <= limite
        })
        .reduce((sum, r) => sum + r.valor, 0)

      const saidas = ocorrenciasPendentes
        .filter((o) => {
          if (o.status !== 'prevista') return false
          const d = parseDate(o.data_vencimento)
          return d >= hoje && d <= limite
        })
        .reduce((sum, o) => sum + (o.valor_previsto || 0), 0)

      const saldoProjetado = saldoAtual + entradas - saidas

      return {
        dias,
        entradas,
        saidas,
        saldoProjetado,
      }
    }

    const p7 = calcularParaDias(7)
    const p30 = calcularParaDias(30)
    const p60 = calcularParaDias(60)
    const p90 = calcularParaDias(90)

    // Menor saldo diário projetado nos próximos 90 dias
    let menorSaldo = saldoAtual
    let necessidadeCaixa = 0

    // Simulação dia a dia até 90 dias
    let saldoSimulado = saldoAtual
    for (let d = 1; d <= 90; d++) {
      const diaAlvo = new Date(hoje.getTime() + d * 86400000)
      const diaIso = diaAlvo.toISOString().slice(0, 10)

      const rep = repassesPrevistos
        .filter((r) => r.status === 'previsto' && r.data_prevista.slice(0, 10) === diaIso)
        .reduce((s, r) => s + r.valor, 0)

      const desp = ocorrenciasPendentes
        .filter((o) => o.status === 'prevista' && o.data_vencimento.slice(0, 10) === diaIso)
        .reduce((s, o) => s + (o.valor_previsto || 0), 0)

      saldoSimulado += rep - desp
      if (saldoSimulado < menorSaldo) {
        menorSaldo = saldoSimulado
      }
    }

    if (menorSaldo < 0) {
      necessidadeCaixa = Math.abs(menorSaldo)
    }

    return {
      p7,
      p30,
      p60,
      p90,
      menorSaldo,
      necessidadeCaixa,
    }
  }, [saldoAtual, repassesPrevistos, ocorrenciasPendentes])

  // Gráfico diário histórico e projetado dos próximos 30 dias
  const timelineData = useMemo(() => {
    const pontos: Array<{
      dia: string
      dataIso: string
      realizadoEntradas: number
      realizadoSaidas: number
      previstoEntradas: number
      previstoSaidas: number
      saldoAcumulado: number
    }> = []

    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    // Últimos 14 dias + próximos 16 dias
    let runningSaldo = saldoAtual

    // Para o histórico recente (últimos 14 dias)
    const diasHistorico = 14
    for (let i = diasHistorico; i >= 1; i--) {
      const dt = new Date(hoje.getTime() - i * 86400000)
      const iso = dt.toISOString().slice(0, 10)

      const ent = lancamentosRealizados
        .filter((l) => l.tipo === 'receita' && l.status === 'pago' && l.data.slice(0, 10) === iso)
        .reduce((s, l) => s + l.valor, 0)

      const sai = lancamentosRealizados
        .filter((l) => l.tipo === 'despesa' && l.status === 'pago' && l.data.slice(0, 10) === iso)
        .reduce((s, l) => s + l.valor, 0)

      pontos.push({
        dia: formatShortDate(dt),
        dataIso: iso,
        realizadoEntradas: ent,
        realizadoSaidas: sai,
        previstoEntradas: 0,
        previstoSaidas: 0,
        saldoAcumulado: 0, // calculado na visualização
      })
    }

    // Hoje e próximos 16 dias
    let projSaldo = saldoAtual
    for (let i = 0; i <= 16; i++) {
      const dt = new Date(hoje.getTime() + i * 86400000)
      const iso = dt.toISOString().slice(0, 10)

      const entPrev = repassesPrevistos
        .filter((r) => r.status === 'previsto' && r.data_prevista.slice(0, 10) === iso)
        .reduce((s, r) => s + r.valor, 0)

      const saiPrev = ocorrenciasPendentes
        .filter((o) => o.status === 'prevista' && o.data_vencimento.slice(0, 10) === iso)
        .reduce((s, o) => s + (o.valor_previsto || 0), 0)

      projSaldo += entPrev - saiPrev

      pontos.push({
        dia: i === 0 ? 'Hoje' : formatShortDate(dt),
        dataIso: iso,
        realizadoEntradas: 0,
        realizadoSaidas: 0,
        previstoEntradas: entPrev,
        previstoSaidas: saiPrev,
        saldoAcumulado: projSaldo,
      })
    }

    return pontos
  }, [saldoAtual, lancamentosRealizados, repassesPrevistos, ocorrenciasPendentes])

  return (
    <div className="space-y-4">
      {/* Cards de Previsão 7, 30, 60, 90 dias */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Previsão 7 Dias"
          value={projecoes.p7.saldoProjetado}
          subtitle={`+${formatCurrency(projecoes.p7.entradas)} | -${formatCurrency(projecoes.p7.saidas)}`}
          colorClass={projecoes.p7.saldoProjetado >= 0 ? 'text-emerald-700' : 'text-rose-700'}
          bgLightClass={projecoes.p7.saldoProjetado >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}
        />

        <ModernKpiCard
          title="Previsão 30 Dias"
          value={projecoes.p30.saldoProjetado}
          subtitle={`+${formatCurrency(projecoes.p30.entradas)} | -${formatCurrency(projecoes.p30.saidas)}`}
          colorClass={projecoes.p30.saldoProjetado >= 0 ? 'text-emerald-700' : 'text-rose-700'}
          bgLightClass={projecoes.p30.saldoProjetado >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}
        />

        <ModernKpiCard
          title="Previsão 60 Dias"
          value={projecoes.p60.saldoProjetado}
          subtitle={`+${formatCurrency(projecoes.p60.entradas)} | -${formatCurrency(projecoes.p60.saidas)}`}
          colorClass={projecoes.p60.saldoProjetado >= 0 ? 'text-emerald-700' : 'text-rose-700'}
          bgLightClass={projecoes.p60.saldoProjetado >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}
        />

        <ModernKpiCard
          title="Previsão 90 Dias"
          value={projecoes.p90.saldoProjetado}
          subtitle={`+${formatCurrency(projecoes.p90.entradas)} | -${formatCurrency(projecoes.p90.saidas)}`}
          colorClass={projecoes.p90.saldoProjetado >= 0 ? 'text-emerald-700' : 'text-rose-700'}
          bgLightClass={projecoes.p90.saldoProjetado >= 0 ? 'bg-emerald-50' : 'bg-rose-50'}
        />
      </div>

      {/* Alerta de Menor Saldo ou Necessidade de Caixa */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Card
          className={
            projecoes.menorSaldo < 0
              ? 'border-rose-300 bg-rose-50/30'
              : 'border-emerald-200/60 bg-emerald-50/20'
          }
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Menor Saldo Projetado (Próximos 90d)
              </p>
              <p
                className={`text-2xl font-extrabold tabular-nums mt-1 ${
                  projecoes.menorSaldo < 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatCurrency(projecoes.menorSaldo)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Ponto de maior estresse de liquidez previsto no ciclo
              </p>
            </div>
            {projecoes.menorSaldo < 0 ? (
              <AlertCircle className="h-8 w-8 text-rose-600 shrink-0" />
            ) : (
              <TrendingUp className="h-8 w-8 text-emerald-600 shrink-0" />
            )}
          </CardContent>
        </Card>

        <Card
          className={
            projecoes.necessidadeCaixa > 0
              ? 'border-amber-300 bg-amber-50/30'
              : 'border-border bg-card'
          }
        >
          <CardContent className="p-4 flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold uppercase text-muted-foreground">
                Necessidade de Caixa Prevista
              </p>
              <p
                className={`text-2xl font-extrabold tabular-nums mt-1 ${
                  projecoes.necessidadeCaixa > 0 ? 'text-amber-700' : 'text-foreground'
                }`}
              >
                {formatCurrency(projecoes.necessidadeCaixa)}
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {projecoes.necessidadeCaixa > 0
                  ? 'Aporte ou antecipação necessária para cobrir vencimentos'
                  : 'Nenhum déficit de caixa previsto nos próximos 90 dias'}
              </p>
            </div>
            <Calendar className="h-8 w-8 text-muted-foreground/40 shrink-0" />
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de Evolução e Projeção */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold">
            Fluxo Diário: Realizado vs Projetado
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Histórico recente de entradas/saídas e projeção de saldo para os próximos dias
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={timelineData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorSaldo" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#2B5BA8" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#2B5BA8" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDE6DD" />
                <XAxis dataKey="dia" tick={{ fontSize: 11, fill: '#8A8078' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#8A8078' }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  formatter={(val: unknown) => [
                    formatCurrency(typeof val === 'number' ? val : 0),
                    '',
                  ]}
                  labelStyle={{ fontWeight: 'bold' }}
                />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="saldoAcumulado"
                  name="Saldo Projetado"
                  stroke="#2B5BA8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorSaldo)"
                />
                <Bar
                  dataKey="realizadoEntradas"
                  name="Entradas Realizadas"
                  fill="#1E6F5C"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="realizadoSaidas"
                  name="Saídas Realizadas"
                  fill="#DF5830"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="previstoEntradas"
                  name="Repasses Previstos"
                  fill="#6366f1"
                  radius={[3, 3, 0, 0]}
                />
                <Bar
                  dataKey="previstoSaidas"
                  name="Contas a Pagar"
                  fill="#f59e0b"
                  radius={[3, 3, 0, 0]}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
