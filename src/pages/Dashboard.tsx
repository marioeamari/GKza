import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Calendar,
  CircleDollarSign,
  Download,
  Filter,
  Layers,
  LayoutGrid,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  SlidersHorizontal,
  Wallet,
  Building,
  User,
  ShoppingBag,
  Store,
  Package,
  PiggyBank,
  Target,
  ShieldAlert,
  Sparkles,
  CheckCircle2,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { DashboardFaturasCard } from '@/components/cartao/DashboardFaturasCard'
import { PagarFaturaDialog } from '@/components/cartao/PagarFaturaDialog'
import { LancamentoDialog } from '@/components/LancamentoDialog'
import { LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PermissionButton } from '@/components/PermissionButton'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useAppContext } from '@/contexts/AppContext'
import { useAuth } from '@/contexts/AuthContext'
import { useModernDashboardData } from '@/hooks/use-modern-dashboard-data'
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

// Subcomponentes modulares modernos
import { ModernKpiCard } from '@/components/dashboard/ModernKpiCard'
import {
  ModernDecisoesAlertas,
  type DecisaoItem,
} from '@/components/dashboard/ModernDecisoesAlertas'
import {
  ModernIndicadoresTendencia,
  type TendenciaItem,
} from '@/components/dashboard/ModernIndicadoresTendencia'
import {
  ModernVisaoExecutiva,
  type VisaoExecutivaData,
} from '@/components/dashboard/ModernVisaoExecutiva'
import { TabFluxoCaixa } from '@/components/dashboard/TabFluxoCaixa'
import { TabReceitas } from '@/components/dashboard/TabReceitas'
import { TabDespesas } from '@/components/dashboard/TabDespesas'
import { TabMarketplaces } from '@/components/dashboard/TabMarketplaces'
import { TabProdutosRentabilidade } from '@/components/dashboard/TabProdutosRentabilidade'
import { TabPatrimonio } from '@/components/dashboard/TabPatrimonio'
import { TabMetas } from '@/components/dashboard/TabMetas'
import { TabComparativos } from '@/components/dashboard/TabComparativos'
import { TabPessoal } from '@/components/dashboard/TabPessoal'
import { TabOrcamento } from '@/components/dashboard/TabOrcamento'

export default function Dashboard() {
  const { user } = useAuth()
  const { activeContext } = useAppContext()
  const [params, setParams] = useSearchParams()

  const data = useModernDashboardData()
  const {
    contas,
    categorias,
    lancamentos,
    compromissos,
    ocorrencias,
    marketplaces,
    marketplaceContas,
    vendas,
    repasses,
    empresas,
    pessoas,
    tags,
    produtos,
    precificacoes,
    metas,
    pendentes,
    loading,
    error,
    refresh,
  } = data

  // Configuração de abas ativas
  const activeTab = params.get('tab') || 'visao-geral'
  const handleTabChange = (val: string) => {
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev)
        if (val === 'visao-geral') {
          next.delete('tab')
        } else {
          next.set('tab', val)
        }
        return next
      },
      { replace: true },
    )
  }

  // Filtros Globais
  // 1. Contexto Tipo: 'todos' | 'pessoal' | 'empresa'
  const [filtroContextoTipo, setFiltroContextoTipo] = useState<'todos' | 'pessoal' | 'empresa'>(
    'todos',
  )
  // 2. Empresa / CNPJ específico
  const [filtroEmpresaId, setFiltroEmpresaId] = useState<string>('todas')
  // 3. Conta Bancária
  const [filtroContaId, setFiltroContaId] = useState<string>('todas')
  // 4. Período
  const periodKey = (params.get('periodo') || 'current') as 'current' | 'previous' | '90days'
  const period = useMemo(() => getPeriodRange(periodKey), [periodKey])
  // 5. Regime: 'caixa' | 'competencia'
  const [regime, setRegime] = useState<'caixa' | 'competencia'>('caixa')

  // Diálogos
  const [dialogLancamento, setDialogLancamento] = useState(false)
  const [faturaToPay, setFaturaToPay] = useState<FaturaCartaoGroup | null>(null)
  const [payFaturaOpen, setPayFaturaOpen] = useState(false)

  // Realtime updates
  useRealtime('lancamentos', refresh)
  useRealtime('vendas', refresh)
  useRealtime('repasses', refresh)
  useRealtime('despesas_ocorrencias', refresh)

  // Mapas auxiliares
  const contasMap = useMemo(() => new Map(contas.map((c) => [c.id, c])), [contas])
  const empresasMap = useMemo(() => new Map(empresas.map((e) => [e.id, e])), [empresas])

  // Filtragem dos lançamentos com base nos filtros globais
  const filteredLancamentos = useMemo(() => {
    return lancamentos.filter((item) => {
      // 1. Contexto do AppContext (seletor de grupo de contexto ativo)
      if (!activeContext.isAll) {
        if (item.conta && !activeContext.contaIds.includes(item.conta)) {
          if (activeContext.linkedContaIds.includes(item.conta)) return false
        }
        if (activeContext.contaIds.length === 0 && !activeContext.hasPessoas) {
          return false
        }
      }

      // 2. Filtro Local Contexto Tipo (Consolidado / Pessoal CPF / Empresa CNPJ)
      if (filtroContextoTipo === 'pessoal' && item.empresa) return false
      if (filtroContextoTipo === 'empresa' && !item.empresa) return false

      // 3. Filtro Empresa específica
      if (filtroEmpresaId !== 'todas' && item.empresa !== filtroEmpresaId) {
        return false
      }

      // 4. Filtro Conta bancária
      if (filtroContaId !== 'todas' && item.conta !== filtroContaId) {
        return false
      }

      return true
    })
  }, [lancamentos, activeContext, filtroContextoTipo, filtroEmpresaId, filtroContaId])

  // Lançamentos efetivos de caixa (não inclui compras pontuais em cartão de crédito
  // se o regime for caixa, pois a movimentação bancária só ocorre no pagamento da fatura)
  const effectiveLancamentos = useMemo(() => {
    if (regime === 'competencia') {
      return filteredLancamentos
    }
    return filteredLancamentos.filter((item) => {
      const contaObj = item.expand?.conta || contasMap.get(item.conta)
      if (contaObj?.tipo === 'cartao') {
        return false
      }
      return true
    })
  }, [filteredLancamentos, contasMap, regime])

  // Lançamentos no período atual e período anterior
  const inPeriod = useMemo(() => {
    return effectiveLancamentos.filter((item) => {
      const d = parseDate(item.data)
      return isWithin(item.data, period.start, period.end)
    })
  }, [effectiveLancamentos, period])

  const previousPeriod = useMemo(() => {
    return effectiveLancamentos.filter((item) => {
      return isWithin(item.data, period.previousStart, period.previousEnd)
    })
  }, [effectiveLancamentos, period])

  // Cálculos financeiros principais
  const paidInPeriod = inPeriod.filter((item) => item.status === 'pago')
  const previousPaid = previousPeriod.filter((item) => item.status === 'pago')

  const receitaMes = paidInPeriod
    .filter((item) => item.tipo === 'receita')
    .reduce((sum, item) => sum + item.valor, 0)

  const despesaMes = paidInPeriod
    .filter((item) => item.tipo === 'despesa')
    .reduce((sum, item) => sum + item.valor, 0)

  const receitaAnterior = previousPaid
    .filter((item) => item.tipo === 'receita')
    .reduce((sum, item) => sum + item.valor, 0)

  const despesaAnterior = previousPaid
    .filter((item) => item.tipo === 'despesa')
    .reduce((sum, item) => sum + item.valor, 0)

  const resultadoMes = receitaMes - despesaMes
  const margemLiquidaPct = receitaMes > 0 ? (resultadoMes / receitaMes) * 100 : 0

  // Saldo atual consolidado das contas
  const saldoConsolidado = useMemo(() => {
    const contasValidas = contas.filter((c) => {
      if (!c.ativa || c.tipo === 'cartao') return false
      if (filtroContaId !== 'todas' && c.id !== filtroContaId) return false
      if (!activeContext.isAll && !activeContext.contaIds.includes(c.id)) {
        if (activeContext.linkedContaIds.includes(c.id)) return false
      }
      return true
    })

    const saldoInicial = contasValidas.reduce((sum, c) => sum + (c.saldo_inicial || 0), 0)
    const paidGeral = effectiveLancamentos.filter((l) => l.status === 'pago')
    const mov = paidGeral.reduce(
      (sum, item) => sum + (item.tipo === 'receita' ? item.valor : -item.valor),
      0,
    )

    return saldoInicial + mov
  }, [contas, effectiveLancamentos, filtroContaId, activeContext])

  // Ocorrências a pagar e repasses a receber
  const ocorrenciasFiltradas = useMemo(() => {
    return ocorrencias.filter((o) => {
      if (filtroContextoTipo === 'pessoal' && o.contexto_tipo !== 'pessoal') return false
      if (filtroContextoTipo === 'empresa' && o.contexto_tipo !== 'empresa') return false
      if (filtroEmpresaId !== 'todas' && o.empresa !== filtroEmpresaId) return false
      return true
    })
  }, [ocorrencias, filtroContextoTipo, filtroEmpresaId])

  const ocorrenciasPrevistas = ocorrenciasFiltradas.filter((o) => o.status === 'prevista')
  const totalAPagar = ocorrenciasPrevistas.reduce((sum, o) => sum + (o.valor_previsto || 0), 0)

  const repassesFiltrados = useMemo(() => {
    return repasses.filter((r) => {
      if (filtroContextoTipo === 'pessoal') return false // repasse de marketplace é PJ
      return true
    })
  }, [repasses, filtroContextoTipo])

  const repassesPrevistos = repassesFiltrados.filter((r) => r.status === 'previsto')
  const totalAReceber = repassesPrevistos.reduce((sum, r) => sum + (r.valor || 0), 0)

  // Vendas do período
  const periodSales = useMemo(() => {
    if (filtroContextoTipo === 'pessoal') return []
    return vendas.filter((v) => isWithin(v.data, period.start, period.end))
  }, [vendas, period, filtroContextoTipo])

  // Agrupamento de Faturas de Cartão de Crédito
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

  // Motor Inteligente de Decisões Necessárias & Alertas
  const decisoes = useMemo(() => {
    const list: DecisaoItem[] = []
    const hoje = new Date()
    hoje.setHours(0, 0, 0, 0)

    // 1. Caixa projetado negativo ou muito baixo
    const saldoProjetado30d = saldoConsolidado + totalAReceber - totalAPagar
    if (saldoProjetado30d < 0) {
      list.push({
        id: 'caixa-negativo',
        titulo: 'Alerta de Déficit de Caixa nos Próximos 30 Dias',
        descricao: `Com os compromissos agendados (${formatCurrency(totalAPagar)}) superando os repasses previstos (${formatCurrency(totalAReceber)}), o saldo projetado ficará negativo em ${formatCurrency(saldoProjetado30d)}.`,
        prioridade: 'critica',
        categoria: 'caixa',
        valor: Math.abs(saldoProjetado30d),
        acaoTexto: 'Ver Fluxo de Caixa',
        acaoLink: '/dashboard?tab=fluxo-caixa',
      })
    }

    // 2. Contas vencidas não baixadas
    const vencidas = ocorrenciasPrevistas.filter((o) => {
      const dv = parseDate(o.data_vencimento)
      return dv < hoje
    })

    if (vencidas.length > 0) {
      const somaVencidas = vencidas.reduce((s, o) => s + (o.valor_previsto || 0), 0)
      list.push({
        id: 'contas-vencidas',
        titulo: `${vencidas.length} Conta(s) com Vencimento Atrasado`,
        descricao: `Existem obrigações em atraso no valor total de ${formatCurrency(somaVencidas)}. Realize o pagamento ou concilie a baixa para evitar multas.`,
        prioridade: 'critica',
        categoria: 'contas',
        valor: somaVencidas,
        acaoTexto: 'Ir para Despesas',
        acaoLink: '/despesas?status=prevista',
      })
    }

    // 3. Contas próximas do vencimento (próximos 3 dias)
    const em3Dias = new Date(hoje.getTime() + 3 * 86400000)
    const prestesAVencer = ocorrenciasPrevistas.filter((o) => {
      const dv = parseDate(o.data_vencimento)
      return dv >= hoje && dv <= em3Dias
    })

    if (prestesAVencer.length > 0) {
      const soma = prestesAVencer.reduce((s, o) => s + (o.valor_previsto || 0), 0)
      list.push({
        id: 'contas-vencendo',
        titulo: `${prestesAVencer.length} Conta(s) Vencendo nos Próximos 3 Dias`,
        descricao: `Obrigações imediatas que totalizam ${formatCurrency(soma)}. Prepare o saldo nas contas bancárias pagadoras.`,
        prioridade: 'alta',
        categoria: 'contas',
        valor: soma,
        acaoTexto: 'Revisar Vencimentos',
        acaoLink: '/despesas?status=prevista',
      })
    }

    // 4. Repasses de canais atrasados
    const repassesAtrasados = repassesPrevistos.filter((r) => {
      const dp = parseDate(r.data_prevista)
      return dp < hoje
    })

    if (repassesAtrasados.length > 0) {
      const somaRep = repassesAtrasados.reduce((s, r) => s + r.valor, 0)
      list.push({
        id: 'repasses-atrasados',
        titulo: `${repassesAtrasados.length} Repasse(s) de Canais com Data Ultrapassada`,
        descricao: `Créditos previstos que ainda não constam como realizados totalizando ${formatCurrency(somaRep)}.`,
        prioridade: 'alta',
        categoria: 'vendas',
        valor: somaRep,
        acaoTexto: 'Auditar Repasses',
        acaoLink: '/marketplaces?tab=repasses',
      })
    }

    // 5. Registros pendentes de triagem / Telegram / Open Finance
    if (pendentes.length > 0) {
      list.push({
        id: 'triagem-pendente',
        titulo: `${pendentes.length} Registro(s) Pendente(s) na Triagem`,
        descricao:
          'Comprovantes enviados por Telegram ou importados do banco aguardam classificação e aprovação.',
        prioridade: 'media',
        categoria: 'triagem',
        acaoTexto: 'Ir para Triagem',
        acaoLink: '/pendentes',
      })
    }

    // 6. Produtos com margem negativa ou crítica na precificação
    const produtosCriticos = precificacoes.filter((p) => {
      if (p.status !== 'aprovada') return false
      const res = p.resultado as any
      const m = res?.margem_liquida_pct ?? res?.margem_pct ?? 0
      return m < 2
    })

    if (produtosCriticos.length > 0) {
      list.push({
        id: 'produtos-margem-baixa',
        titulo: `${produtosCriticos.length} Produto(s) com Margem de Contribuição Crítica`,
        descricao:
          'Identificados produtos comercializados com margem próxima a zero ou no prejuízo após taxas de canal.',
        prioridade: 'alta',
        categoria: 'produtos',
        acaoTexto: 'Revisar Precificação',
        acaoLink: '/precificacao/comparar',
      })
    }

    return list
  }, [
    saldoConsolidado,
    totalAReceber,
    totalAPagar,
    ocorrenciasPrevistas,
    repassesPrevistos,
    pendentes,
    precificacoes,
  ])

  // Indicadores de Tendência & Projeção
  const tendencias: TendenciaItem[] = useMemo(() => {
    const hoje = new Date()
    const diasNoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).getDate()
    const diaAtual = Math.max(hoje.getDate(), 1)
    const fatorProjecao = diasNoMes / diaAtual

    return [
      {
        id: 'rec',
        indicador: 'Receita Total',
        atual: receitaMes,
        anterior: receitaAnterior,
        isCurrency: true,
        projecaoFimMes: receitaMes * fatorProjecao,
      },
      {
        id: 'desp',
        indicador: 'Despesas Gerais',
        atual: despesaMes,
        anterior: despesaAnterior,
        isCurrency: true,
        invertDirection: true,
        projecaoFimMes: despesaMes * fatorProjecao,
      },
      {
        id: 'lucro',
        indicador: 'Resultado Líquido',
        atual: resultadoMes,
        anterior: receitaAnterior - despesaAnterior,
        isCurrency: true,
        projecaoFimMes: resultadoMes * fatorProjecao,
      },
      {
        id: 'margem',
        indicador: 'Margem Líquida',
        atual: margemLiquidaPct,
        anterior:
          receitaAnterior > 0 ? ((receitaAnterior - despesaAnterior) / receitaAnterior) * 100 : 0,
        unidade: '%',
        isCurrency: false,
      },
    ]
  }, [receitaMes, receitaAnterior, despesaMes, despesaAnterior, resultadoMes, margemLiquidaPct])

  // Dados para a Visão Executiva
  const visaoExecutivaData: VisaoExecutivaData = useMemo(() => {
    // Busca meta de faturamento se existir
    const metaFat = metas.find(
      (m) =>
        m.status === 'em_andamento' &&
        (m.titulo.toLowerCase().includes('faturament') || m.titulo.toLowerCase().includes('venda')),
    )

    let metaInfo = undefined
    if (metaFat) {
      const match = metaFat.alvo_descricao?.match(/[\d.,]+/)
      const alvo = match ? parseFloat(match[0].replace(/\./g, '').replace(',', '.')) : 50000
      metaInfo = {
        alvo: alvo || 50000,
        realizado: receitaMes,
        pct: alvo ? (receitaMes / alvo) * 100 : 0,
      }
    }

    return {
      saldoTotal: saldoConsolidado,
      saldoDisponivel: saldoConsolidado,
      receitaMes,
      receitaAnterior,
      despesaMes,
      despesaAnterior,
      resultadoMes,
      margemLiquidaPct,
      totalAPagar,
      totalAReceber,
      caixaProjetado30d: saldoConsolidado + totalAReceber - totalAPagar,
      metaFaturamento: metaInfo,
    }
  }, [
    saldoConsolidado,
    receitaMes,
    receitaAnterior,
    despesaMes,
    despesaAnterior,
    resultadoMes,
    margemLiquidaPct,
    totalAPagar,
    totalAReceber,
    metas,
  ])

  // Exportar dados em CSV
  const handleExportCSV = useCallback(() => {
    const rows = [
      ['Data', 'Tipo', 'Descricao', 'Valor', 'Status', 'Conta', 'Categoria'],
      ...filteredLancamentos.map((l) => [
        l.data.slice(0, 10),
        l.tipo,
        `"${(l.descricao || '').replace(/"/g, '""')}"`,
        l.valor.toFixed(2),
        l.status,
        `"${(l.expand?.conta?.nome || '').replace(/"/g, '""')}"`,
        `"${(l.expand?.categoria?.nome || '').replace(/"/g, '""')}"`,
      ]),
    ]

    const csvContent =
      'data:text/csv;charset=utf-8,\uFEFF' + rows.map((e) => e.join(';')).join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute(
      'download',
      `dashboard-financeiro-${new Date().toISOString().slice(0, 10)}.csv`,
    )
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }, [filteredLancamentos])

  if (loading) return <LoadingState label="Atualizando indicadores do ERP GKza..." />
  if (error) {
    return (
      <div className="rounded-2xl bg-destructive/10 p-5 text-sm text-destructive">
        {apiMessage(error)}
      </div>
    )
  }

  return (
    <div className="space-y-6 pb-16">
      {/* Cabeçalho Principal */}
      <PageHeader
        title="Dashboard Estratégico"
        description={`Gestão financeira, marketplaces, margens e fluxo de caixa · ${activeContext.label}`}
        action={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCSV}
              className="hidden sm:inline-flex text-xs font-semibold"
            >
              <Download className="mr-1.5 h-3.5 w-3.5" /> Exportar CSV
            </Button>

            <Button
              variant="outline"
              size="sm"
              onClick={() => refresh()}
              className="text-xs font-semibold"
            >
              <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Atualizar
            </Button>

            <PermissionButton
              allowed={can(user?.role, 'writeFinance')}
              onClick={() => setDialogLancamento(true)}
              className="text-xs font-semibold"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Novo lançamento
            </PermissionButton>
          </div>
        }
      />

      {/* Barra de Filtros Globais Unificados */}
      <Card className="border-border/70 bg-card shadow-xs">
        <CardContent className="p-3 sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-xs font-bold text-muted-foreground flex items-center gap-1">
                <SlidersHorizontal className="h-3.5 w-3.5" /> Filtros:
              </span>

              {/* Filtro Contexto Tipo */}
              <Select
                value={filtroContextoTipo}
                onValueChange={(val: any) => setFiltroContextoTipo(val)}
              >
                <SelectTrigger className="h-8 text-xs w-[140px]">
                  <SelectValue placeholder="Contexto" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Consolidado</SelectItem>
                  <SelectItem value="pessoal">Pessoal (CPF)</SelectItem>
                  <SelectItem value="empresa">Empresarial (CNPJ)</SelectItem>
                </SelectContent>
              </Select>

              {/* Filtro Empresa */}
              {filtroContextoTipo !== 'pessoal' && empresas.length > 0 && (
                <Select value={filtroEmpresaId} onValueChange={setFiltroEmpresaId}>
                  <SelectTrigger className="h-8 text-xs w-[160px]">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas as Empresas</SelectItem>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}

              {/* Filtro Conta Bancária */}
              <Select value={filtroContaId} onValueChange={setFiltroContaId}>
                <SelectTrigger className="h-8 text-xs w-[150px]">
                  <SelectValue placeholder="Conta" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Contas</SelectItem>
                  {contas
                    .filter((c) => c.ativa)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>

              {/* Regime de Apuração */}
              <div className="flex items-center rounded-lg border border-border bg-secondary/50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setRegime('caixa')}
                  className={`rounded-md px-2 py-1 font-semibold transition ${
                    regime === 'caixa'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Regime Caixa
                </button>
                <button
                  type="button"
                  onClick={() => setRegime('competencia')}
                  className={`rounded-md px-2 py-1 font-semibold transition ${
                    regime === 'competencia'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Competência
                </button>
              </div>
            </div>

            {/* Seletor de Período Temporal */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-muted-foreground font-medium">Período:</span>
              <div className="flex items-center rounded-lg border border-border bg-secondary/50 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    setParams((p) => {
                      const n = new URLSearchParams(p)
                      n.delete('periodo')
                      return n
                    })
                  }
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    periodKey === 'current'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Mês Atual
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setParams((p) => {
                      const n = new URLSearchParams(p)
                      n.set('periodo', 'previous')
                      return n
                    })
                  }
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    periodKey === 'previous'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Mês Anterior
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setParams((p) => {
                      const n = new URLSearchParams(p)
                      n.set('periodo', '90days')
                      return n
                    })
                  }
                  className={`rounded-md px-2.5 py-1 font-semibold transition ${
                    periodKey === '90days'
                      ? 'bg-white text-primary shadow-xs font-bold'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  90 Dias
                </button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Navegação por Abas das 12 Seções */}
      <Tabs value={activeTab} onValueChange={handleTabChange} className="w-full space-y-5">
        <div className="overflow-x-auto pb-1 scrollbar-none">
          <TabsList className="h-10 w-max bg-secondary/60 p-1 rounded-xl">
            <TabsTrigger value="visao-geral" className="text-xs font-semibold px-3 rounded-lg">
              <LayoutGrid className="mr-1.5 h-3.5 w-3.5" /> Visão Geral
            </TabsTrigger>
            <TabsTrigger value="financeiro" className="text-xs font-semibold px-3 rounded-lg">
              <Wallet className="mr-1.5 h-3.5 w-3.5" /> Financeiro
            </TabsTrigger>
            <TabsTrigger value="fluxo-caixa" className="text-xs font-semibold px-3 rounded-lg">
              <Layers className="mr-1.5 h-3.5 w-3.5" /> Fluxo de Caixa
            </TabsTrigger>
            <TabsTrigger value="receitas" className="text-xs font-semibold px-3 rounded-lg">
              <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" /> Receitas
            </TabsTrigger>
            <TabsTrigger value="despesas" className="text-xs font-semibold px-3 rounded-lg">
              <ArrowDownRight className="mr-1.5 h-3.5 w-3.5" /> Despesas
            </TabsTrigger>
            <TabsTrigger value="marketplaces" className="text-xs font-semibold px-3 rounded-lg">
              <Store className="mr-1.5 h-3.5 w-3.5" /> Marketplaces & Vendas
            </TabsTrigger>
            <TabsTrigger value="produtos" className="text-xs font-semibold px-3 rounded-lg">
              <Package className="mr-1.5 h-3.5 w-3.5" /> Produtos & Margem
            </TabsTrigger>
            <TabsTrigger value="patrimonio" className="text-xs font-semibold px-3 rounded-lg">
              <PiggyBank className="mr-1.5 h-3.5 w-3.5" /> Patrimônio
            </TabsTrigger>
            <TabsTrigger value="orcamento" className="text-xs font-semibold px-3 rounded-lg">
              <CircleDollarSign className="mr-1.5 h-3.5 w-3.5" /> Orçamento
            </TabsTrigger>
            <TabsTrigger value="pessoal" className="text-xs font-semibold px-3 rounded-lg">
              <User className="mr-1.5 h-3.5 w-3.5" /> Pessoal (CPF)
            </TabsTrigger>
            <TabsTrigger value="metas" className="text-xs font-semibold px-3 rounded-lg">
              <Target className="mr-1.5 h-3.5 w-3.5" /> Metas
            </TabsTrigger>
            <TabsTrigger value="comparativos" className="text-xs font-semibold px-3 rounded-lg">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Comparativos
            </TabsTrigger>
          </TabsList>
        </div>

        {/* 1. ABA: VISÃO GERAL */}
        <TabsContent value="visao-geral" className="space-y-6 focus:outline-none">
          {/* Bloco 16: Visão Executiva Integrada */}
          <ModernVisaoExecutiva data={visaoExecutivaData} contextLabel={activeContext.label} />

          {/* Bloco 17 & 14: Decisões Necessárias & Alertas Operacionais */}
          <ModernDecisoesAlertas decisoes={decisoes} />

          {/* Bloco 15: Indicadores de Tendência */}
          <ModernIndicadoresTendencia itens={tendencias} />

          {/* Faturas de Cartão de Crédito Integradas */}
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

          {/* Prévias Rápidas do Fluxo e Atividades */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
            {/* Próximos Repasses de Canais */}
            <Card className="lg:col-span-6">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-bold">Repasses dos Marketplaces</CardTitle>
                  <p className="text-xs text-muted-foreground">Créditos bancários previstos</p>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-xs">
                  <Link to="/marketplaces?tab=repasses">
                    Ver todos <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {repassesPrevistos.length > 0 ? (
                  repassesPrevistos.slice(0, 4).map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 hover:bg-secondary/40 transition"
                    >
                      <div className="min-w-0 flex-1 truncate pr-2">
                        <span className="text-xs font-bold text-foreground block truncate">
                          {item.expand?.marketplace_conta?.apelido || 'Marketplace'}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Previsto: {formatDate(item.data_prevista)}
                        </span>
                      </div>
                      <span className="text-xs font-extrabold tabular-nums text-foreground shrink-0">
                        {formatCurrency(item.valor)}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="py-8 text-center text-xs text-muted-foreground">
                    Nenhum repasse de canal agendado.
                  </p>
                )}
              </CardContent>
            </Card>

            {/* Últimos Lançamentos Realizados */}
            <Card className="lg:col-span-6">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <div>
                  <CardTitle className="text-base font-bold">Últimos Lançamentos</CardTitle>
                  <p className="text-xs text-muted-foreground">Movimentações recentes no sistema</p>
                </div>
                <Button variant="ghost" size="sm" asChild className="text-xs">
                  <Link to="/lancamentos">
                    Ver todos <ArrowRight className="ml-1 h-3.5 w-3.5" />
                  </Link>
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {filteredLancamentos.slice(0, 4).map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-2.5 rounded-xl border border-border/70 hover:bg-secondary/40 transition"
                  >
                    <div className="min-w-0 flex-1 truncate pr-2">
                      <span className="text-xs font-bold text-foreground block truncate">
                        {item.descricao}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {formatDate(item.data)} · {item.expand?.conta?.nome || 'Conta'}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-extrabold tabular-nums shrink-0 ${
                        item.tipo === 'receita' ? 'text-emerald-700' : 'text-primary'
                      }`}
                    >
                      {item.tipo === 'receita' ? '+' : '−'} {formatCurrency(item.valor)}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* 2. ABA: FINANCEIRO */}
        <TabsContent value="financeiro" className="space-y-6 focus:outline-none">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <ModernKpiCard
              title="Saldo Consolidado"
              value={saldoConsolidado}
              icon={Wallet}
              to="/contas"
              colorClass="text-foreground"
              bgLightClass="bg-secondary"
            />
            <ModernKpiCard
              title="Total a Receber"
              value={totalAReceber}
              icon={ArrowUpRight}
              to="/marketplaces?tab=repasses"
              colorClass="text-emerald-700"
              bgLightClass="bg-emerald-50"
            />
            <ModernKpiCard
              title="Total a Pagar"
              value={totalAPagar}
              icon={ArrowDownRight}
              to="/despesas?status=prevista"
              colorClass="text-amber-700"
              bgLightClass="bg-amber-50"
            />
            <ModernKpiCard
              title="Disponibilidade Futura"
              value={saldoConsolidado + totalAReceber - totalAPagar}
              icon={PiggyBank}
              colorClass={
                saldoConsolidado + totalAReceber - totalAPagar >= 0
                  ? 'text-indigo-700'
                  : 'text-rose-700'
              }
              bgLightClass={
                saldoConsolidado + totalAReceber - totalAPagar >= 0 ? 'bg-indigo-50' : 'bg-rose-50'
              }
            />
          </div>

          <TabFluxoCaixa
            saldoAtual={saldoConsolidado}
            lancamentosRealizados={effectiveLancamentos}
            ocorrenciasPendentes={ocorrenciasPrevistas}
            repassesPrevistos={repassesPrevistos}
            periodStart={period.start}
            periodEnd={period.end}
          />
        </TabsContent>

        {/* 3. ABA: FLUXO DE CAIXA */}
        <TabsContent value="fluxo-caixa" className="focus:outline-none">
          <TabFluxoCaixa
            saldoAtual={saldoConsolidado}
            lancamentosRealizados={effectiveLancamentos}
            ocorrenciasPendentes={ocorrenciasPrevistas}
            repassesPrevistos={repassesPrevistos}
            periodStart={period.start}
            periodEnd={period.end}
          />
        </TabsContent>

        {/* 4. ABA: RECEITAS */}
        <TabsContent value="receitas" className="focus:outline-none">
          <TabReceitas
            lancamentos={filteredLancamentos}
            categorias={categorias}
            empresas={empresas}
            vendas={vendas}
            repasses={repasses}
          />
        </TabsContent>

        {/* 5. ABA: DESPESAS */}
        <TabsContent value="despesas" className="focus:outline-none">
          <TabDespesas
            lancamentos={filteredLancamentos}
            categorias={categorias}
            compromissos={compromissos}
            ocorrencias={ocorrenciasFiltradas}
            tags={tags}
          />
        </TabsContent>

        {/* 6. ABA: MARKETPLACES */}
        <TabsContent value="marketplaces" className="focus:outline-none">
          <TabMarketplaces
            vendas={periodSales}
            repasses={repassesFiltrados}
            marketplaces={marketplaces}
            contasMarketplace={marketplaceContas}
          />
        </TabsContent>

        {/* 7. ABA: PRODUTOS & RENTABILIDADE */}
        <TabsContent value="produtos" className="focus:outline-none">
          <TabProdutosRentabilidade
            produtos={produtos}
            precificacoes={precificacoes}
            vendas={vendas}
          />
        </TabsContent>

        {/* 8. ABA: PATRIMÔNIO */}
        <TabsContent value="patrimonio" className="focus:outline-none">
          <TabPatrimonio
            contas={contas}
            lancamentos={effectiveLancamentos}
            compromissos={compromissos}
            ocorrencias={ocorrenciasFiltradas}
          />
        </TabsContent>

        {/* 9. ABA: ORÇAMENTO */}
        <TabsContent value="orcamento" className="focus:outline-none">
          <TabOrcamento
            lancamentosRealizados={effectiveLancamentos}
            categorias={categorias}
            compromissos={compromissos}
          />
        </TabsContent>

        {/* 10. ABA: PESSOAL */}
        <TabsContent value="pessoal" className="focus:outline-none">
          <TabPessoal
            lancamentos={filteredLancamentos}
            contas={contas}
            categorias={categorias}
            compromissos={compromissos}
            ocorrencias={ocorrenciasFiltradas}
            pessoas={pessoas}
          />
        </TabsContent>

        {/* 11. ABA: METAS */}
        <TabsContent value="metas" className="focus:outline-none">
          <TabMetas metas={metas} />
        </TabsContent>

        {/* 12. ABA: COMPARATIVOS */}
        <TabsContent value="comparativos" className="focus:outline-none">
          <TabComparativos
            receitaMesAtual={receitaMes}
            receitaMesAnterior={receitaAnterior}
            despesaMesAtual={despesaMes}
            despesaMesAnterior={despesaAnterior}
            lancamentos={filteredLancamentos}
            empresas={empresas}
            marketplaces={marketplaces}
            contasMarketplace={marketplaceContas}
            vendas={vendas}
          />
        </TabsContent>
      </Tabs>

      {/* Botão Flutuante Mobile para Novo Lançamento */}
      {can(user?.role, 'writeFinance') && (
        <Button
          size="icon"
          className="fixed bottom-[calc(84px+env(safe-area-inset-bottom))] right-5 z-20 h-14 w-14 rounded-full shadow-brand sm:hidden"
          onClick={() => setDialogLancamento(true)}
          aria-label="Novo lançamento"
        >
          <Plus className="h-6 w-6" />
        </Button>
      )}

      {/* Diálogos */}
      <LancamentoDialog
        open={dialogLancamento}
        onOpenChange={setDialogLancamento}
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
    </div>
  )
}
