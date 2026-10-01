import React, { useMemo } from 'react'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from 'recharts'
import { Scale, Building, Store, Package, Calendar, Layers, ArrowRight } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatCurrency } from '@/lib/format'
import type { Lancamento, Empresa, Marketplace, MarketplaceConta, Venda } from '@/types/domain'

interface TabComparativosProps {
  receitaMesAtual: number
  receitaMesAnterior: number
  despesaMesAtual: number
  despesaMesAnterior: number
  lancamentos: Lancamento[]
  empresas: Empresa[]
  marketplaces: Marketplace[]
  contasMarketplace: MarketplaceConta[]
  vendas: Venda[]
}

export function TabComparativos({
  receitaMesAtual,
  receitaMesAnterior,
  despesaMesAtual,
  despesaMesAnterior,
  lancamentos,
  empresas,
  marketplaces,
  contasMarketplace,
  vendas,
}: TabComparativosProps) {
  // Comparativo Mês Atual vs Mês Anterior
  const compMensalData = useMemo(() => {
    return [
      {
        indicador: 'Receitas',
        Atual: receitaMesAtual,
        Anterior: receitaMesAnterior,
      },
      {
        indicador: 'Despesas',
        Atual: despesaMesAtual,
        Anterior: despesaMesAnterior,
      },
      {
        indicador: 'Resultado Líquido',
        Atual: receitaMesAtual - despesaMesAtual,
        Anterior: receitaMesAnterior - despesaMesAnterior,
      },
    ]
  }, [receitaMesAtual, receitaMesAnterior, despesaMesAtual, despesaMesAnterior])

  // Comparativo Empresa vs Empresa
  const compEmpresas = useMemo(() => {
    const map = new Map<string, { nome: string; receitas: number; despesas: number }>()

    for (const e of empresas) {
      map.set(e.id, { nome: e.nome_fantasia, receitas: 0, despesas: 0 })
    }

    for (const l of lancamentos) {
      if (!l.empresa || l.status !== 'pago') continue
      const entry = map.get(l.empresa)
      if (entry) {
        if (l.tipo === 'receita') entry.receitas += l.valor
        else entry.despesas += l.valor
      }
    }

    return Array.from(map.values()).filter((e) => e.receitas > 0 || e.despesas > 0)
  }, [empresas, lancamentos])

  return (
    <div className="space-y-4">
      {/* Comparativo Mês Atual vs Mês Anterior */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <Scale className="h-5 w-5 text-primary" />
            Comparativo Período Atual vs Período Anterior
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Evolução de faturamento, custos e lucratividade operacional
          </p>
        </CardHeader>
        <CardContent>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={compMensalData} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDE6DD" />
                <XAxis dataKey="indicador" tick={{ fontSize: 12, fill: '#8A8078' }} />
                <YAxis
                  tick={{ fontSize: 11, fill: '#8A8078' }}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                />
                <Tooltip
                  formatter={(val: unknown) => [
                    formatCurrency(typeof val === 'number' ? val : 0),
                    '',
                  ]}
                />
                <Legend />
                <Bar dataKey="Atual" name="Período Atual" fill="#DF5830" radius={[4, 4, 0, 0]} />
                <Bar
                  dataKey="Anterior"
                  name="Período Anterior"
                  fill="#8A8078"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Comparativo Empresa vs Empresa */}
      {compEmpresas.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <Building className="h-5 w-5 text-primary" />
              Comparativo entre Empresas / CNPJs
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Receitas e despesas liquidadas por entidade jurídica
            </p>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={compEmpresas} margin={{ top: 15, right: 20, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDE6DD" />
                  <XAxis dataKey="nome" tick={{ fontSize: 12, fill: '#8A8078' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#8A8078' }}
                    tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <Tooltip
                    formatter={(val: unknown) => [
                      formatCurrency(typeof val === 'number' ? val : 0),
                      '',
                    ]}
                  />
                  <Legend />
                  <Bar dataKey="receitas" name="Receitas" fill="#1E6F5C" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="despesas" name="Despesas" fill="#DF5830" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
