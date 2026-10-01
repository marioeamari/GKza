import React, { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from 'recharts'
import {
  ArrowUpRight,
  TrendingUp,
  Store,
  Layers,
  Repeat,
  CalendarCheck,
  CheckCircle2,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type { Lancamento, Categoria, Empresa, Venda, Repasse } from '@/types/domain'

interface TabReceitasProps {
  lancamentos: Lancamento[]
  categorias: Categoria[]
  empresas: Empresa[]
  vendas: Venda[]
  repasses: Repasse[]
}

const COLORS = ['#1E6F5C', '#2B5BA8', '#DF5830', '#8A05BE', '#D97706', '#059669', '#6366F1']

export function TabReceitas({
  lancamentos,
  categorias,
  empresas,
  vendas,
  repasses,
}: TabReceitasProps) {
  const receitas = useMemo(() => {
    return lancamentos.filter((l) => l.tipo === 'receita')
  }, [lancamentos])

  const receitasPagas = useMemo(() => {
    return receitas.filter((l) => l.status === 'pago')
  }, [receitas])

  const totalReceita = useMemo(() => {
    return receitasPagas.reduce((sum, l) => sum + l.valor, 0)
  }, [receitasPagas])

  const aReceber = useMemo(() => {
    return receitas.filter((l) => l.status === 'pendente').reduce((sum, l) => sum + l.valor, 0)
  }, [receitas])

  const repassesPrevistosTotal = useMemo(() => {
    return repasses.filter((r) => r.status === 'previsto').reduce((sum, r) => sum + r.valor, 0)
  }, [repasses])

  // Agrupamento por Categoria
  const porCategoria = useMemo(() => {
    const map = new Map<string, number>()
    const catMap = new Map(categorias.map((c) => [c.id, c.nome]))

    for (const r of receitasPagas) {
      const nome = (r.categoria && catMap.get(r.categoria)) || 'Outras Receitas'
      map.set(nome, (map.get(nome) || 0) + r.valor)
    }

    return Array.from(map.entries())
      .map(([nome, valor]) => ({
        nome,
        valor,
        pct: totalReceita > 0 ? (valor / totalReceita) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
  }, [receitasPagas, categorias, totalReceita])

  // Agrupamento por Empresa
  const porEmpresa = useMemo(() => {
    const map = new Map<string, number>()
    const empMap = new Map(empresas.map((e) => [e.id, e.nome_fantasia]))

    for (const r of receitasPagas) {
      const nome = (r.empresa && empMap.get(r.empresa)) || 'Pessoa Física / Sem Empresa'
      map.set(nome, (map.get(nome) || 0) + r.valor)
    }

    return Array.from(map.entries())
      .map(([nome, valor]) => ({
        nome,
        valor,
        pct: totalReceita > 0 ? (valor / totalReceita) * 100 : 0,
      }))
      .sort((a, b) => b.valor - a.valor)
  }, [receitasPagas, empresas, totalReceita])

  return (
    <div className="space-y-4">
      {/* KPIs da Receita */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Receita Total Realizada"
          value={totalReceita}
          icon={ArrowUpRight}
          to="/lancamentos?tipo=receita"
          colorClass="text-emerald-700"
          bgLightClass="bg-emerald-50"
          subtitle="Entradas liquidadas no período"
        />

        <ModernKpiCard
          title="Contas a Receber (Lançamentos)"
          value={aReceber}
          icon={CalendarCheck}
          to="/lancamentos?tipo=receita&status=pendente"
          colorClass="text-sky-700"
          bgLightClass="bg-sky-50"
          subtitle="Títulos pendentes de recebimento"
        />

        <ModernKpiCard
          title="Repasses a Receber (Canais)"
          value={repassesPrevistosTotal}
          icon={Store}
          to="/marketplaces?tab=repasses"
          colorClass="text-indigo-700"
          bgLightClass="bg-indigo-50"
          subtitle="Previsão dos marketplaces"
        />

        <ModernKpiCard
          title="Total Previsto + Realizado"
          value={totalReceita + aReceber + repassesPrevistosTotal}
          icon={TrendingUp}
          colorClass="text-foreground"
          bgLightClass="bg-secondary"
          subtitle="Faturamento potencial do ciclo"
        />
      </div>

      {/* Gráficos de Composição de Receita */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Receita por Categoria */}
        <Card className="lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Receitas por Categoria</CardTitle>
            <p className="text-xs text-muted-foreground">Distribuição das fontes de faturamento</p>
          </CardHeader>
          <CardContent>
            {porCategoria.length > 0 ? (
              <div className="space-y-3">
                <div className="h-56 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={porCategoria}
                        dataKey="valor"
                        nameKey="nome"
                        cx="50%"
                        cy="50%"
                        outerRadius={75}
                        innerRadius={45}
                        paddingAngle={2}
                      >
                        {porCategoria.map((entry, index) => (
                          <Cell key={entry.nome} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(val: unknown) => [
                          formatCurrency(typeof val === 'number' ? val : 0),
                          '',
                        ]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {porCategoria.map((cat, i) => (
                    <div
                      key={cat.nome}
                      className="flex items-center justify-between text-xs py-1 border-b border-border/40 last:border-0"
                    >
                      <span className="flex items-center gap-2 truncate">
                        <i
                          className="h-2.5 w-2.5 rounded-full shrink-0"
                          style={{ background: COLORS[i % COLORS.length] }}
                        />
                        <span className="font-medium truncate">{cat.nome}</span>
                      </span>
                      <span className="font-bold tabular-nums shrink-0 ml-2">
                        {formatCurrency(cat.valor)}{' '}
                        <span className="text-[10px] text-muted-foreground font-normal">
                          ({cat.pct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Nenhuma receita registrada neste período.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Receita por Empresa */}
        <Card className="lg:col-span-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold">Receita por Empresa / CNPJ</CardTitle>
            <p className="text-xs text-muted-foreground">Contribuição de cada entidade jurídica</p>
          </CardHeader>
          <CardContent>
            {porEmpresa.length > 0 ? (
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={porEmpresa}
                    layout="vertical"
                    margin={{ top: 5, right: 20, left: 30, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EDE6DD" />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 11, fill: '#8A8078' }}
                      tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                    />
                    <YAxis
                      type="category"
                      dataKey="nome"
                      tick={{ fontSize: 11, fill: '#8A8078' }}
                      width={100}
                    />
                    <Tooltip
                      formatter={(val: unknown) => [
                        formatCurrency(typeof val === 'number' ? val : 0),
                        'Receita',
                      ]}
                    />
                    <Bar dataKey="valor" fill="#1E6F5C" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <p className="py-12 text-center text-xs text-muted-foreground">
                Sem receitas vinculadas a empresas no período.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
