import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarClock,
  CircleDollarSign,
  Plus,
  ReceiptText,
  WalletCards,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { DashboardFaturasCard } from '@/components/cartao/DashboardFaturasCard'
import { PagarFaturaDialog } from '@/components/cartao/PagarFaturaDialog'
import { CashFlowChart } from '@/components/charts/CashFlowChart'
import { MarketplaceChart } from '@/components/charts/MarketplaceChart'
import { LancamentoDialog } from '@/components/LancamentoDialog'
import { LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PeriodSelector } from '@/components/PeriodSelector'
import { PermissionButton } from '@/components/PermissionButton'
import { StatusBadge } from '@/components/StatusBadge'
import { Trend } from '@/components/Trend'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useCountUp } from '@/hooks/use-count-up'
import { useFinanceData } from '@/hooks/use-finance-data'
import { useRealtime } from '@/hooks/use-realtime'
import { apiMessage } from '@/lib/api-error'
import { calcularFaturaCartao, type FaturaCartaoGroup } from '@/lib/cartao-fatura'
import {
  addDays,
  formatCurrency,
  formatDate,
  getPeriodRange,
  isWithin,
  parseDate,
} from '@/lib/format'
import { can } from '@/lib/permissions'
import { marketplacesService } from '@/services/marketplaces'
import type { Marketplace, MarketplaceConta, PeriodRange, Repasse, Venda } from '@/types/domain'

const delta = (current: number, previous: number) =>
  previous === 0 ? (current > 0 ? 100 : 0) : ((current - previous) / Math.abs(previous)) * 100

export default function Dashboard() {
  const { user } = useAuth()
  const { activeContext } = useAppContext()
  const { contas, categorias, lancamentos, loading, error, refresh } = useFinanceData()
  const [params, setParams] = useSearchParams()
  const periodKey = (
    ['current', 'previous', '90days'].includes(params.get('periodo') || '')
      ? params.get('periodo')
      : 'current'
  ) as PeriodRange['key']
  const period = useMemo(() => getPeriodRange(periodKey), [periodKey])
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([])
  const [marketplaceContas, setMarketplaceContas] = useState<MarketplaceConta[]>([])
  const [vendas, setVendas] = useState<Venda[]>([])
  const [repasses, setRepasses] = useState<Repasse[]>([])
  const [dialog, setDialog] = useState(false)
  const [marketLoading, setMarketLoading] = useState(true)
  const [faturaToPay, setFaturaToPay] = useState<FaturaCartaoGroup | null>(null)
  const [payFaturaOpen, setPayFaturaOpen] = useState(false)

  const loadMarketplace = useCallback(async () => {
    try {
      const [mp, stores, sales, payouts] = await Promise.all([
        marketplacesService.listMarketplaces(),
        marketplacesService.listContas(),
        marketplacesService.listVendas(),
        marketplacesService.listRepasses(),
      ])
      setMarketplaces(mp)
      setMarketplaceContas(stores)
      setVendas(sales)
      setRepasses(payouts)
    } finally {
      setMarketLoading(false)
    }
  }, [])
  useEffect(() => {
    loadMarketplace()
  }, [loadMarketplace])
  useRealtime('lancamentos', refresh)
  useRealtime('vendas', loadMarketplace)
  useRealtime('repasses', loadMarketplace)

  // Filtragem dos dados financeiros de acordo com o contexto ativo
  const filteredContas = useMemo(() => {
    if (activeContext.isAll) return contas
    if (activeContext.contaIds.length > 0) {
      return contas.filter((c) => activeContext.contaIds.includes(c.id))
    }
    // Se o contexto não tem contas específicas (ex.: grupo de Filhas ou só empresas),
    // mantém as contas que pertencem aos membros ou retorna vazio se não houver
    return contas.filter((c) => {
      if (activeContext.empresaIds.length > 0) {
        return false // PJ isolado sem contas adicionadas
      }
      return true
    })
  }, [contas, activeContext])

  const filteredLancamentos = useMemo(() => {
    if (activeContext.isAll) return lancamentos
    return lancamentos.filter((item) => {
      // Se lançamento aponta para uma conta do grupo
      if (item.conta && activeContext.contaIds.includes(item.conta)) return true
      // Se não há filtro estrito de contas no grupo, não exclui arbitrariamente
      if (activeContext.contaIds.length === 0 && activeContext.hasPessoas) return true
      return false
    })
  }, [lancamentos, activeContext])

  const filteredVendas = useMemo(() => {
    if (activeContext.isAll) return vendas
    // Vendas pertencem a marketplace_contas, que são PJ / empresas
    if (activeContext.hasEmpresas) {
      return vendas
    }
    // Contexto exclusivamente pessoal ("Casa", "Filhas") não mistura vendas de marketplace PJ
    return []
  }, [vendas, activeContext])

  const filteredRepasses = useMemo(() => {
    if (activeContext.isAll) return repasses
    if (activeContext.hasEmpresas) {
      return repasses
    }
    return []
  }, [repasses, activeContext])

  const contasMap = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas])

  // Lançamentos efetivos de caixa (não inclui compras individuais em cartão de crédito,
  // pois a saída de caixa só ocorre no pagamento da fatura)
  const effectiveCashLancamentos = useMemo(() => {
    return filteredLancamentos.filter((item) => {
      const contaObj = item.expand?.conta || contasMap.get(item.conta)
      if (contaObj?.tipo === 'cartao') {
        return false // A compra no cartão não movimenta caixa até a fatura ser paga
      }
      return true
    })
  }, [filteredLancamentos, contasMap])

  const paid = effectiveCashLancamentos.filter((item) => item.status === 'pago')
  const consolidated =
    filteredContas
      .filter((item) => item.ativa && item.tipo !== 'cartao')
      .reduce((sum, account) => sum + account.saldo_inicial, 0) +
    paid.reduce((sum, item) => sum + (item.tipo === 'receita' ? item.valor : -item.valor), 0)
  const animatedBalance = useCountUp(consolidated)
  const inPeriod = effectiveCashLancamentos.filter((item) =>
    isWithin(item.data, period.start, period.end),
  )
  const previous = effectiveCashLancamentos.filter((item) =>
    isWithin(item.data, period.previousStart, period.previousEnd),
  )
  const revenues = inPeriod
    .filter((item) => item.tipo === 'receita' && item.status === 'pago')
    .reduce((sum, item) => sum + item.valor, 0)
  const expenses = inPeriod
    .filter((item) => item.tipo === 'despesa' && item.status === 'pago')
    .reduce((sum, item) => sum + item.valor, 0)
  const previousRevenue = previous
    .filter((item) => item.tipo === 'receita' && item.status === 'pago')
    .reduce((sum, item) => sum + item.valor, 0)
  const previousExpense = previous
    .filter((item) => item.tipo === 'despesa' && item.status === 'pago')
    .reduce((sum, item) => sum + item.valor, 0)
  const beforePeriod =
    filteredContas
      .filter((item) => item.ativa && item.tipo !== 'cartao')
      .reduce((sum, account) => sum + account.saldo_inicial, 0) +
    paid
      .filter((item) => parseDate(item.data) < period.start)
      .reduce((sum, item) => sum + (item.tipo === 'receita' ? item.valor : -item.valor), 0)
  const periodSales = filteredVendas.filter((item) => isWithin(item.data, period.start, period.end))
  const nextPayouts = filteredRepasses
    .filter((item) => item.status === 'previsto')
    .sort((a, b) => a.data_prevista.localeCompare(b.data_prevista))
    .slice(0, 4)
  const latest = filteredLancamentos.slice(0, 5)

  // Agrupamento de faturas de cartão no dashboard
  const faturasCartao = useMemo(() => {
    const faturasMap = new Map<string, FaturaCartaoGroup>()

    for (const item of filteredLancamentos) {
      const contaObj = item.expand?.conta || contasMap.get(item.conta)
      if (contaObj?.tipo === 'cartao') {
        const ciclo = calcularFaturaCartao(contaObj, item.data)
        const comp = item.competencia || ciclo.competencia
        const groupKey = `${item.conta}_${comp}`

        if (!faturasMap.has(groupKey)) {
          faturasMap.set(groupKey, {
            id: groupKey,
            conta: contaObj,
            competencia: comp,
            dataFechamento: ciclo.dataFechamento,
            dataVencimento: ciclo.dataVencimento,
            totalFatura: 0,
            paga: true,
            pagamentoLancamentoId: item.fatura_pagamento_id,
            itens: [],
          })
        }

        const fatura = faturasMap.get(groupKey)!
        fatura.itens.push(item)
        fatura.totalFatura += item.valor
        if (!item.fatura_paga && item.status !== 'pago') {
          fatura.paga = false
        }
      }
    }

    return Array.from(faturasMap.values()).sort((a, b) =>
      b.dataFechamento.localeCompare(a.dataFechamento),
    )
  }, [filteredLancamentos, contasMap])

  if (loading || marketLoading) return <LoadingState label="Montando seu panorama financeiro..." />
  if (error)
    return (
      <div className="rounded-2xl bg-destructive/10 p-5 text-sm text-destructive">
        {apiMessage(error)}
      </div>
    )
  return (
    <>
      <PageHeader
        title="Visão financeira"
        description={`Olá, ${user?.name?.split(' ')[0] || 'bem-vindo'}. Aqui está o ritmo do seu negócio.`}
        action={
          <div className="hidden sm:block">
            <PermissionButton
              allowed={can(user?.role, 'writeFinance')}
              onClick={() => setDialog(true)}
            >
              <Plus className="mr-2 h-4 w-4" />
              Novo lançamento
            </PermissionButton>
          </div>
        }
      />
      <div className="mb-5">
        <PeriodSelector
          value={periodKey}
          onChange={(value) => setParams(value === 'current' ? {} : { periodo: value })}
        />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="rise-in overflow-hidden lg:col-span-8">
          <CardContent className="relative p-5 sm:p-6">
            <div className="absolute -right-12 -top-16 h-48 w-48 rounded-full bg-primary/10" />
            <div className="relative">
              <div className="flex items-start justify-between">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
                  <WalletCards className="h-5 w-5" />
                </span>
                <Button variant="ghost" size="sm" asChild className="text-primary">
                  <Link to="/contas">
                    Ver contas <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
              <p className="micro-label mt-8">Saldo consolidado</p>
              <p className="mt-2 text-[32px] font-extrabold tracking-tight tabular-nums sm:text-[38px]">
                {formatCurrency(animatedBalance)}
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                Saldo atual de {filteredContas.filter((item) => item.ativa).length} contas{' '}
                {!activeContext.isAll && `no contexto "${activeContext.label}"`}
              </p>
            </div>
          </CardContent>
        </Card>
        {/* Cartão de Faturas de Cartão de Crédito */}
        {faturasCartao.length > 0 && (
          <DashboardFaturasCard
            faturas={faturasCartao}
            canWrite={can(user?.role, 'writeFinance')}
            onPagarFatura={(fat) => {
              setFaturaToPay(fat)
              setPayFaturaOpen(true)
            }}
          />
        )}

        <div className="grid grid-cols-2 gap-4 lg:col-span-4 lg:grid-cols-1">
          <Card className="rise-in rise-delay-1">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="micro-label">Receitas</p>
                <span className="rounded-lg bg-success/10 p-2 text-success">
                  <ArrowUpRight className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-xl font-extrabold tabular-nums text-success sm:text-2xl">
                {formatCurrency(revenues)}
              </p>
              <div className="mt-2 hidden sm:block">
                <Trend value={delta(revenues, previousRevenue)} />
              </div>
            </CardContent>
          </Card>
          <Card className="rise-in rise-delay-2">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-center justify-between">
                <p className="micro-label">Despesas</p>
                <span className="rounded-lg bg-primary/10 p-2 text-primary">
                  <ArrowDownRight className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-3 text-xl font-extrabold tabular-nums text-primary sm:text-2xl">
                {formatCurrency(expenses)}
              </p>
              <div className="mt-2 hidden sm:block">
                <Trend value={delta(expenses, previousExpense)} invert />
              </div>
            </CardContent>
          </Card>
        </div>
        <Card className="rise-in rise-delay-2 lg:col-span-7">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Fluxo de caixa</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">
                Entradas, saídas e saldo acumulado
              </p>
            </div>
            <div className="hidden items-center gap-3 text-[10px] font-bold text-muted-foreground sm:flex">
              <span>
                <i className="mr-1 inline-block h-2 w-2 rounded-full bg-success" />
                Receitas
              </span>
              <span>
                <i className="mr-1 inline-block h-2 w-2 rounded-full bg-primary" />
                Despesas
              </span>
              <span>
                <i className="mr-1 inline-block h-0.5 w-3 bg-info" />
                Saldo
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <CashFlowChart
              data={effectiveCashLancamentos}
              start={period.start}
              end={period.end}
              openingBalance={beforePeriod}
            />
          </CardContent>
        </Card>
        <Card className="rise-in rise-delay-3 lg:col-span-5">
          <CardHeader>
            <CardTitle>Vendas por marketplace</CardTitle>
            <p className="text-xs text-muted-foreground">Volume bruto e comissões no período</p>
          </CardHeader>
          <CardContent>
            <MarketplaceChart
              vendas={periodSales}
              contas={marketplaceContas}
              marketplaces={marketplaces}
            />
          </CardContent>
        </Card>
        <Card className="rise-in rise-delay-3 lg:col-span-7">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle>Últimos lançamentos</CardTitle>
            <Button variant="ghost" size="sm" asChild>
              <Link to="/lancamentos">
                Ver todos <ArrowRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="space-y-1">
            {latest.length ? (
              latest.map((item) => (
                <Link
                  to={`/lancamentos?editar=${item.id}`}
                  key={item.id}
                  className="flex items-center gap-3 rounded-xl px-2 py-3 transition hover:bg-secondary/60"
                >
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-xl ${item.tipo === 'receita' ? 'bg-success/10 text-success' : 'bg-primary/10 text-primary'}`}
                  >
                    <ReceiptText className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold">{item.descricao}</span>
                    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <i
                        className="h-2 w-2 rounded-full"
                        style={{ background: item.expand?.categoria?.cor || '#8A8078' }}
                      />
                      {item.expand?.categoria?.nome || 'Sem categoria'} · {formatDate(item.data)}
                    </span>
                  </span>
                  <span
                    className={`text-sm font-extrabold tabular-nums ${item.tipo === 'receita' ? 'text-success' : 'text-primary'}`}
                  >
                    {item.tipo === 'receita' ? '+' : '−'} {formatCurrency(item.valor)}
                  </span>
                </Link>
              ))
            ) : (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhum lançamento registrado.
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="rise-in rise-delay-4 lg:col-span-5">
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle>Repasses a receber</CardTitle>
              <p className="mt-1 text-xs text-muted-foreground">Próximos créditos dos canais</p>
            </div>
            <CalendarClock className="h-5 w-5 text-warning" />
          </CardHeader>
          <CardContent className="space-y-2">
            {nextPayouts.length ? (
              nextPayouts.map((item) => {
                const days = Math.ceil(
                  (parseDate(item.data_prevista).getTime() - new Date().setHours(0, 0, 0, 0)) /
                    86400000,
                )
                const account = item.expand?.marketplace_conta
                const mp = account?.expand?.marketplace
                return (
                  <Link
                    to="/marketplaces?tab=repasses"
                    key={item.id}
                    className={`flex items-center gap-3 rounded-xl border p-3 transition hover:shadow-sm ${days < 0 ? 'border-destructive/30 bg-destructive/5' : 'border-border'}`}
                  >
                    <span
                      className="h-9 w-1 rounded-full"
                      style={{ background: mp?.cor || '#DF5830' }}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">
                        {account?.apelido || 'Marketplace'}
                      </span>
                      <span
                        className={
                          days < 0
                            ? 'text-xs font-bold text-destructive'
                            : 'text-xs text-muted-foreground'
                        }
                      >
                        {days < 0
                          ? `${Math.abs(days)} dias em atraso`
                          : days === 0
                            ? 'Vence hoje'
                            : `Em ${days} dias`}{' '}
                        · {formatDate(item.data_prevista)}
                      </span>
                    </span>
                    <span className="text-sm font-extrabold tabular-nums">
                      {formatCurrency(item.valor)}
                    </span>
                  </Link>
                )
              })
            ) : (
              <div className="py-10 text-center">
                <CircleDollarSign className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">Nenhum repasse previsto.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {can(user?.role, 'writeFinance') && (
        <Button
          size="icon"
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-5 z-20 h-14 w-14 rounded-full shadow-brand sm:hidden"
          onClick={() => setDialog(true)}
          aria-label="Novo lançamento"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}
      <LancamentoDialog
        open={dialog}
        onOpenChange={setDialog}
        contas={contas}
        categorias={categorias}
        onSaved={refresh}
      />

      <PagarFaturaDialog
        open={payFaturaOpen}
        onOpenChange={setPayFaturaOpen}
        fatura={faturaToPay}
        contas={contas}
        categorias={categorias}
        onSuccess={refresh}
      />
    </>
  )
}
