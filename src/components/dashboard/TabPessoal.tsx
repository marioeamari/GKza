import React, { useMemo } from 'react'
import {
  User,
  CreditCard,
  Wallet,
  PiggyBank,
  TrendingDown,
  Layers,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import { ModernKpiCard } from './ModernKpiCard'
import type {
  Lancamento,
  Conta,
  Categoria,
  DespesaCompromisso,
  DespesaOcorrencia,
  Pessoa,
} from '@/types/domain'

interface TabPessoalProps {
  lancamentos: Lancamento[]
  contas: Conta[]
  categorias: Categoria[]
  compromissos: DespesaCompromisso[]
  ocorrencias: DespesaOcorrencia[]
  pessoas: Pessoa[]
}

export function TabPessoal({
  lancamentos,
  contas,
  categorias,
  compromissos,
  ocorrencias,
  pessoas,
}: TabPessoalProps) {
  // Filtra lançamentos pessoais (com pessoa vinculada ou contexto pessoal)
  const lancamentosPessoais = useMemo(() => {
    return lancamentos.filter((l) => {
      if (l.pessoa) return true
      if (!l.empresa) return true // se não tiver empresa, é PF
      return false
    })
  }, [lancamentos])

  const receitasPF = useMemo(() => {
    return lancamentosPessoais
      .filter((l) => l.tipo === 'receita' && l.status === 'pago')
      .reduce((sum, l) => sum + l.valor, 0)
  }, [lancamentosPessoais])

  const despesasPF = useMemo(() => {
    return lancamentosPessoais
      .filter((l) => l.tipo === 'despesa' && l.status === 'pago')
      .reduce((sum, l) => sum + l.valor, 0)
  }, [lancamentosPessoais])

  const saldoPF = receitasPF - despesasPF

  // Compromissos pessoais
  const compromissosPF = useMemo(() => {
    return compromissos.filter((c) => c.contexto_tipo === 'pessoal' || c.titular_tipo === 'cpf')
  }, [compromissos])

  const fixasPF = useMemo(() => {
    return compromissosPF
      .filter((c) => c.ativo && c.tipo_valor !== 'variavel')
      .reduce((sum, c) => sum + (c.valor_parcela || c.valor_estimado || 0), 0)
  }, [compromissosPF])

  const parcelamentosPF = useMemo(() => {
    return compromissosPF
      .filter(
        (c) =>
          c.ativo &&
          (c.modalidade_parcelamento === 'parcelado' || c.regra_repeticao === 'parcelado'),
      )
      .reduce((sum, c) => sum + (c.valor_parcela || c.valor_estimado || 0), 0)
  }, [compromissosPF])

  // Comprometimento da renda pessoal (% de despesas fixas sobre a receita)
  const comprometimentoRendaPct = receitasPF > 0 ? (despesasPF / receitasPF) * 100 : 0

  return (
    <div className="space-y-4">
      {/* KPIs Pessoais */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <ModernKpiCard
          title="Receitas Pessoais (PF)"
          value={receitasPF}
          icon={Wallet}
          to="/lancamentos?tipo=receita"
          colorClass="text-emerald-700"
          bgLightClass="bg-emerald-50"
          subtitle="Ganhos e pró-labore no período"
        />

        <ModernKpiCard
          title="Despesas Pessoais (PF)"
          value={despesasPF}
          icon={TrendingDown}
          to="/despesas"
          colorClass="text-primary"
          bgLightClass="bg-primary/10"
          subtitle="Gastos familiares e pessoais"
        />

        <ModernKpiCard
          title="Saldo Líquido Pessoal"
          value={saldoPF}
          icon={ShieldCheck}
          colorClass={saldoPF >= 0 ? 'text-indigo-700' : 'text-rose-700'}
          bgLightClass={saldoPF >= 0 ? 'bg-indigo-50' : 'bg-rose-50'}
          subtitle="Superávit / Déficit do mês"
        />

        <ModernKpiCard
          title="Comprometimento da Renda"
          value={`${comprometimentoRendaPct.toFixed(1)}%`}
          isCurrency={false}
          icon={PiggyBank}
          colorClass={comprometimentoRendaPct > 70 ? 'text-amber-700' : 'text-emerald-700'}
          bgLightClass={comprometimentoRendaPct > 70 ? 'bg-amber-50' : 'bg-emerald-50'}
          subtitle={
            comprometimentoRendaPct > 70
              ? 'Nível elevado de despesas sobre a renda'
              : 'Nível saudável de comprometimento'
          }
        />
      </div>

      {/* Grid de Gastos Fixos e Parcelamentos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold">Gastos Fixos Pessoais</CardTitle>
              <p className="text-xs text-muted-foreground">
                Mensalidades escolares, assinaturas e utilidades domésticas
              </p>
            </div>
            <span className="text-sm font-extrabold text-foreground tabular-nums">
              {formatCurrency(fixasPF)}/mês
            </span>
          </CardHeader>
          <CardContent>
            {compromissosPF.length > 0 ? (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {compromissosPF.slice(0, 5).map((comp) => (
                  <div
                    key={comp.id}
                    className="flex items-center justify-between p-2 rounded-lg border border-border/60 text-xs"
                  >
                    <div className="min-w-0 flex-1 truncate pr-2">
                      <span className="font-bold text-foreground block truncate">
                        {comp.descricao}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {comp.fornecedor || 'Favorecido não informado'}
                      </span>
                    </div>
                    <span className="font-extrabold text-foreground tabular-nums shrink-0">
                      {formatCurrency(comp.valor_parcela || comp.valor_estimado)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-8 text-center text-xs text-muted-foreground">
                Nenhum compromisso pessoal cadastrado.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div>
              <CardTitle className="text-base font-bold">Parcelamentos & Cartões</CardTitle>
              <p className="text-xs text-muted-foreground">
                Compromissos parcelados em andamento na pessoa física
              </p>
            </div>
            <span className="text-sm font-extrabold text-primary tabular-nums">
              {formatCurrency(parcelamentosPF)}/mês
            </span>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">
                Os parcelamentos de cartões de crédito e financiamentos pessoais entram
                automaticamente na conciliação de faturas do sistema.
              </p>
              <div className="pt-3 border-t border-border/50 flex justify-end">
                <Button variant="outline" size="sm" asChild className="text-xs">
                  <Link to="/despesas">
                    Ver todos os compromissos <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
