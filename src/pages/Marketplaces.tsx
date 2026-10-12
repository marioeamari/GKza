import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Banknote,
  Clock3,
  Coins,
  ExternalLink,
  Layers,
  Pencil,
  Percent,
  Plus,
  Receipt,
  ShieldAlert,
  Sparkles,
  Store,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { AuditoriaTaxasTab } from '@/components/marketplaces/AuditoriaTaxasTab'
import { ConfirmPayoutDialog } from '@/components/marketplaces/ConfirmPayoutDialog'
import { MarketplaceAccountDialog } from '@/components/marketplaces/MarketplaceAccountDialog'
import { PayoutDialog } from '@/components/marketplaces/PayoutDialog'
import { LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PeriodSelector } from '@/components/PeriodSelector'
import { PermissionButton } from '@/components/PermissionButton'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useRealtime } from '@/hooks/use-realtime'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { formatCurrency, formatDate, getPeriodRange, isWithin, parseDate } from '@/lib/format'
import { can } from '@/lib/permissions'
import { financeService } from '@/services/finance'
import { marketplacesService } from '@/services/marketplaces'
import { precificacaoService } from '@/services/precificacao'
import type {
  Conta,
  Marketplace,
  MarketplaceConta,
  PeriodRange,
  Repasse,
  Venda,
} from '@/types/domain'
import type {
  PrecCanalModalidadeRecord,
  PrecCanalRecord,
  PrecTaxaRecord,
} from '@/types/precificacao'

export default function Marketplaces() {
  const { user } = useAuth(),
    { toast } = useToast()
  const [params, setParams] = useSearchParams(),
    rawTab = params.get('tab') || 'catalogo',
    // Aba "vendas" removida: redireciona para "catalogo" caso chegue na URL
    tab = rawTab === 'vendas' ? 'catalogo' : rawTab,
    periodKey = (params.get('periodo') || 'current') as PeriodRange['key'],
    period = getPeriodRange(
      ['current', 'previous', '90days'].includes(periodKey) ? periodKey : 'current',
    )
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]),
    [selectedMarketplaceId, setSelectedMarketplaceId] = useState<string>(''),
    [accounts, setAccounts] = useState<MarketplaceConta[]>([]),
    [financial, setFinancial] = useState<Conta[]>([]),
    [precCanais, setPrecCanais] = useState<PrecCanalRecord[]>([]),
    [precModalidades, setPrecModalidades] = useState<PrecCanalModalidadeRecord[]>([]),
    [precTaxas, setPrecTaxas] = useState<PrecTaxaRecord[]>([]),
    [sales, setSales] = useState<Venda[]>([]),
    [payouts, setPayouts] = useState<Repasse[]>([]),
    [loading, setLoading] = useState(true)
  const [accountDialog, setAccountDialog] = useState(false),
    [editingAccount, setEditingAccount] = useState<MarketplaceConta | null>(null),
    [payoutDialog, setPayoutDialog] = useState(false),
    [confirmPayout, setConfirmPayout] = useState<Repasse | null>(null),
    [deleteTarget, setDeleteTarget] = useState<{
      type: 'account' | 'payout'
      id: string
      label: string
    } | null>(null)
  const load = useCallback(async () => {
    try {
      const [a, b, c, d, e, chans, mods, txs] = await Promise.all([
        marketplacesService.listMarketplaces(),
        marketplacesService.listContas(),
        financeService.listContas(),
        marketplacesService.listVendas(),
        marketplacesService.listRepasses(),
        precificacaoService.listCanais(),
        precificacaoService.listModalidades(),
        precificacaoService.listTaxas(),
      ])
      setMarketplaces(a)
      setAccounts(b)
      setFinancial(c)
      setSales(d)
      setPayouts(e)
      setPrecCanais(chans)
      setPrecModalidades(mods)
      setPrecTaxas(txs)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar marketplaces',
        description: apiMessage(error),
      })
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => {
    load()
  }, [load])
  useRealtime('vendas', load)
  useRealtime('repasses', load)
  useRealtime('prec_canais', load)
  useRealtime('prec_taxas', load)
  const setParam = (key: string, value: string) => {
    const next = new URLSearchParams(params)
    if (value && value !== 'all') next.set(key, value)
    else next.delete(key)
    setParams(next, { replace: true })
  }
  const inPeriod = sales.filter((s) => isWithin(s.data, period.start, period.end))
  const selectedSlug = params.get('marketplace'),
    selectedAccount = params.get('conta'),
    selectedStatus = params.get('status')
  const filteredSales = inPeriod.filter((s) => {
    const acc = accounts.find((a) => a.id === s.marketplace_conta),
      mp = acc?.expand?.marketplace
    return (
      (!selectedSlug || mp?.slug === selectedSlug) &&
      (!selectedAccount || s.marketplace_conta === selectedAccount) &&
      (!selectedStatus || s.status === selectedStatus)
    )
  })
  const remove = async () => {
    if (!deleteTarget) return
    try {
      if (deleteTarget.type === 'account') await marketplacesService.deleteConta(deleteTarget.id)
      else await marketplacesService.deleteRepasse(deleteTarget.id)
      toast({ title: 'Registro excluído' })
      load()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir',
        description: apiMessage(e),
      })
    } finally {
      setDeleteTarget(null)
    }
  }

  // Seleção padrão do marketplace na ficha de consulta
  const activeMarketplace = useMemo(() => {
    if (!marketplaces.length) return null
    if (selectedMarketplaceId) {
      return marketplaces.find((m) => m.id === selectedMarketplaceId) || marketplaces[0]
    }
    return marketplaces[0]
  }, [marketplaces, selectedMarketplaceId])

  // Detalhes do marketplace ativo: canais vinculados, modalidades e taxas
  const canaisDoMarketplace = useMemo(() => {
    if (!activeMarketplace) return []
    return precCanais.filter((c) => c.marketplace === activeMarketplace.id)
  }, [activeMarketplace, precCanais])

  const canalIds = useMemo(
    () => new Set(canaisDoMarketplace.map((c) => c.id)),
    [canaisDoMarketplace],
  )

  const modalidadesDoMarketplace = useMemo(() => {
    return precModalidades.filter((m) => canalIds.has(m.canal))
  }, [precModalidades, canalIds])

  const taxasDoMarketplace = useMemo(() => {
    return precTaxas.filter((t) => canalIds.has(t.canal))
  }, [precTaxas, canalIds])

  const contasDoMarketplace = useMemo(() => {
    if (!activeMarketplace) return []
    return accounts.filter((a) => a.marketplace === activeMarketplace.id)
  }, [activeMarketplace, accounts])

  const action =
    tab === 'contas'
      ? () => {
          setEditingAccount(null)
          setAccountDialog(true)
        }
      : tab === 'repasses'
        ? () => setPayoutDialog(true)
        : undefined

  const actionLabel =
    tab === 'contas' ? 'Nova conta de repasse' : tab === 'repasses' ? 'Novo repasse' : undefined

  if (loading) return <LoadingState label="Conciliando marketplaces..." />

  return (
    <>
      <PageHeader
        title="Marketplaces"
        description="Ficha central de consulta do catálogo de marketplaces, canais vinculados, modalidades, taxas e conciliação de repasses financeiros."
        action={
          action ? (
            <PermissionButton allowed={can(user?.role, 'writeMarketplace')} onClick={action}>
              <Plus className="mr-2 h-4 w-4" />
              {actionLabel}
            </PermissionButton>
          ) : (
            <Button asChild variant="outline">
              <Link to="/precificacao/canais">
                <Store className="mr-2 h-4 w-4 text-primary" />
                Gerenciar canais no catálogo
              </Link>
            </Button>
          )
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
          <TabsList className="grid w-full grid-cols-4 sm:w-auto">
            <TabsTrigger value="catalogo" className="gap-1.5">
              <Store className="h-3.5 w-3.5" />
              Ficha do Catálogo
            </TabsTrigger>
            <TabsTrigger value="contas">Contas de Repasse</TabsTrigger>
            <TabsTrigger value="repasses">Repasses</TabsTrigger>
            <TabsTrigger value="auditoria" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-primary" />
              Auditoria de Taxas
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {tab === 'repasses' && (
          <PeriodSelector
            value={period.key}
            onChange={(v) => setParam('periodo', v === 'current' ? '' : v)}
          />
        )}
      </div>

      <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
        {/* ABA 1: FICHA DE CONSULTA DO MARKETPLACE (SEM CRIAÇÃO - PORTA ÚNICA É /precificacao/canais) */}
        <TabsContent value="catalogo" className="mt-0 space-y-6">
          <Card className="border-border shadow-soft overflow-hidden">
            <div className="border-b border-border bg-slate-50/70 p-4 sm:p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div
                    className="grid h-12 w-12 place-items-center rounded-2xl shadow-sm border border-black/5"
                    style={{ backgroundColor: activeMarketplace?.cor || '#DF5830' }}
                  >
                    <Store className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-bold tracking-tight">
                        {activeMarketplace?.nome || 'Selecione um Marketplace'}
                      </h2>
                      {activeMarketplace && (
                        <Badge variant="outline" className="text-xs font-mono">
                          slug: {activeMarketplace.slug}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Catálogo centralizado. Criação e edição estrutural acontecem na Porta Única.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto">
                  <Select
                    value={activeMarketplace?.id || ''}
                    onValueChange={(id) => setSelectedMarketplaceId(id)}
                  >
                    <SelectTrigger className="w-full sm:w-[220px]">
                      <SelectValue placeholder="Escolher marketplace..." />
                    </SelectTrigger>
                    <SelectContent>
                      {marketplaces.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full inline-block"
                              style={{ backgroundColor: m.cor || '#DF5830' }}
                            />
                            <span>{m.nome}</span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button asChild variant="outline" size="sm" className="whitespace-nowrap">
                    <Link to="/precificacao/canais">
                      <ExternalLink className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      Cadastrar novo canal
                    </Link>
                  </Button>
                </div>
              </div>
            </div>

            <CardContent className="p-5 sm:p-6 space-y-6">
              {/* SEÇÃO 1: CANAIS CADASTRADOS VINCULADOS */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Canais Cadastrados Vinculados ({canaisDoMarketplace.length})
                    </h3>
                  </div>
                  <Link
                    to="/precificacao/canais"
                    className="text-xs font-semibold text-primary hover:underline flex items-center"
                  >
                    Gerenciar canais <ArrowRight className="ml-1 h-3 w-3" />
                  </Link>
                </div>

                {canaisDoMarketplace.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {canaisDoMarketplace.map((canal) => (
                      <div
                        key={canal.id}
                        className="rounded-xl border border-border p-4 bg-white shadow-xs space-y-2"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span
                              className="h-3 w-3 rounded-full"
                              style={{ backgroundColor: canal.cor || '#DF5830' }}
                            />
                            <strong className="text-sm">{canal.nome}</strong>
                          </div>
                          <Badge
                            variant={canal.ativo ? 'default' : 'secondary'}
                            className="text-[10px]"
                          >
                            {canal.ativo ? 'Ativo' : 'Inativo'}
                          </Badge>
                        </div>
                        <div className="flex items-center justify-between text-xs text-muted-foreground pt-1 border-t border-border/50">
                          <span>
                            Tipo: <strong className="text-foreground">{canal.tipo}</strong>
                          </span>
                          <span>
                            Vigência:{' '}
                            <strong className="text-foreground">
                              {canal.vigencia || 'Vigente'}
                            </strong>
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Nenhum canal de precificação vinculado a este marketplace no momento.{' '}
                    <Link to="/precificacao/canais" className="text-primary font-bold underline">
                      Vincular agora na porta única de canais.
                    </Link>
                  </div>
                )}
              </div>

              {/* SEÇÃO 2: MODALIDADES DOS CANAIS */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Modalidades de Operação ({modalidadesDoMarketplace.length})
                    </h3>
                  </div>
                </div>

                {modalidadesDoMarketplace.length > 0 ? (
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {modalidadesDoMarketplace.map((mod) => {
                      const canalDono = canaisDoMarketplace.find((c) => c.id === mod.canal)
                      return (
                        <div
                          key={mod.id}
                          className="rounded-xl border border-border p-3.5 bg-slate-50/50 space-y-1.5"
                        >
                          <div className="flex items-center justify-between">
                            <strong className="text-sm">{mod.nome}</strong>
                            <Badge variant="outline" className="text-[10px]">
                              {mod.prazo_recebimento_dias !== undefined
                                ? `${mod.prazo_recebimento_dias}d`
                                : 'Padrão'}
                            </Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Canal:{' '}
                            <strong className="text-foreground">
                              {canalDono?.nome || 'Canal'}
                            </strong>
                          </p>
                          {mod.prazo_recebimento_dias !== undefined && (
                            <p className="text-[11px] text-muted-foreground">
                              Prazo de recebimento: {mod.prazo_recebimento_dias} dias
                            </p>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
                    Nenhuma modalidade configurada para os canais deste marketplace.
                  </div>
                )}
              </div>

              {/* SEÇÃO 3: REGRAS DE TAXAS & COMISSÕES (PRECIFICAÇÃO + REPASSES) */}
              <div className="space-y-3 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Percent className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">
                      Regras de Taxas & Comissões (Precificação & Contas de Repasse)
                    </h3>
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  {/* Taxas cadastradas na precificação */}
                  <div className="rounded-xl border border-border p-4 bg-white space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Coins className="h-3.5 w-3.5 text-primary" />
                        Taxas da Precificação
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {taxasDoMarketplace.length} regra(s)
                      </span>
                    </div>

                    {taxasDoMarketplace.length > 0 ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {taxasDoMarketplace.map((tx) => {
                          const canalDono = canaisDoMarketplace.find((c) => c.id === tx.canal)
                          return (
                            <div
                              key={tx.id}
                              className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-border/50"
                            >
                              <div>
                                <span className="font-semibold block">{tx.nome}</span>
                                <span className="text-[10px] text-muted-foreground">
                                  {canalDono?.nome} · {tx.tipo_regra}
                                </span>
                              </div>
                              <Badge variant="secondary" className="font-mono text-xs">
                                {tx.tipo_valor === 'percentual'
                                  ? `${tx.valor.toFixed(2).replace('.', ',')}%`
                                  : formatCurrency(tx.valor)}
                              </Badge>
                            </div>
                          )
                        })}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-3 text-center">
                        Nenhuma taxa específica configurada para este canal na precificação.
                      </p>
                    )}
                  </div>

                  {/* Comissões das Contas Financeiras de Repasse */}
                  <div className="rounded-xl border border-border p-4 bg-white space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <span className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <Banknote className="h-3.5 w-3.5 text-success" />
                        Comissões Cadastradas nas Contas de Repasse
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {contasDoMarketplace.length} conta(s)
                      </span>
                    </div>

                    {contasDoMarketplace.length > 0 ? (
                      <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                        {contasDoMarketplace.map((acc) => (
                          <div
                            key={acc.id}
                            className="flex items-center justify-between text-xs p-2 rounded-lg bg-slate-50 border border-border/50"
                          >
                            <div>
                              <span className="font-semibold block">{acc.apelido}</span>
                              <span className="text-[10px] text-muted-foreground">
                                Destino: {acc.expand?.conta?.nome || 'Conta bancária'}
                              </span>
                            </div>
                            <Badge className="bg-primary/10 text-primary hover:bg-primary/20 font-mono text-xs">
                              {acc.comissao_percentual.toFixed(2).replace('.', ',')}% comissão
                            </Badge>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-muted-foreground italic py-3 text-center">
                        Nenhuma conta financeira de repasse vinculada a este marketplace.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2: CONTAS DE REPASSE */}
        <TabsContent value="contas" className="mt-0">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {accounts.map((account, index) => {
              const mp = account.expand?.marketplace,
                total = inPeriod.filter((s) => s.marketplace_conta === account.id),
                gross = total.reduce((n, s) => n + s.valor_bruto, 0),
                commission = total.reduce((n, s) => n + s.comissao + s.taxas, 0),
                liquid = total.reduce((n, s) => n + s.valor_liquido, 0)
              return (
                <Card
                  key={account.id}
                  className="card-hover rise-in overflow-hidden"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div
                    className="flex h-16 items-center justify-between px-5"
                    style={{
                      background: `linear-gradient(115deg,${mp?.cor || '#DF5830'}30,${mp?.cor || '#DF5830'}10)`,
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-white shadow-sm">
                        <Store className="h-5 w-5" style={{ color: mp?.cor || '#DF5830' }} />
                      </span>
                      <span>
                        <span className="block text-xs font-bold text-muted-foreground">
                          {mp?.nome}
                        </span>
                        <strong className="text-sm">{account.apelido}</strong>
                      </span>
                    </div>
                    {can(user?.role, 'writeMarketplace') && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setEditingAccount(account)
                          setAccountDialog(true)
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <CardContent className="p-5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Conta de destino</span>
                      <Link to="/contas" className="font-bold text-primary">
                        {account.expand?.conta?.nome}
                        <ArrowRight className="ml-1 inline h-3 w-3" />
                      </Link>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Comissão padrão</span>
                      <Badge variant="secondary">
                        {account.comissao_percentual.toFixed(2).replace('.', ',')}%
                      </Badge>
                    </div>
                    <div className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
                      <span>
                        <small className="micro-label block">Bruto concil.</small>
                        <strong className="mt-1 block text-sm tabular-nums">
                          {formatCurrency(gross)}
                        </strong>
                      </span>
                      <span>
                        <small className="micro-label block">Comissões</small>
                        <strong className="mt-1 block text-sm tabular-nums text-primary">
                          {formatCurrency(commission)}
                        </strong>
                      </span>
                      <span>
                        <small className="micro-label block">Líquido</small>
                        <strong className="mt-1 block text-sm tabular-nums text-success">
                          {formatCurrency(liquid)}
                        </strong>
                      </span>
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </TabsContent>

        {/* ABA 3: REPASSES FINANCEIROS REAIS */}
        <TabsContent value="repasses" className="mt-0">
          <div className="grid gap-5 lg:grid-cols-2">
            {(['previsto', 'realizado'] as const).map((status) => (
              <section
                key={status}
                className="rounded-2xl border border-border bg-white shadow-soft"
              >
                <header className="flex items-center gap-3 border-b border-border p-5">
                  <span
                    className={`grid h-9 w-9 place-items-center rounded-xl ${status === 'previsto' ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}
                  >
                    {status === 'previsto' ? (
                      <Clock3 className="h-5 w-5" />
                    ) : (
                      <Banknote className="h-5 w-5" />
                    )}
                  </span>
                  <div>
                    <h2 className="font-bold">
                      {status === 'previsto' ? 'Previstos' : 'Realizados'}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      {payouts.filter((p) => p.status === status).length} repasses
                    </p>
                  </div>
                </header>
                <div className="divide-y divide-border">
                  {payouts
                    .filter((p) => p.status === status)
                    .map((p) => {
                      const acc = p.expand?.marketplace_conta,
                        mp = acc?.expand?.marketplace,
                        days = Math.ceil(
                          (parseDate(p.data_prevista).getTime() - new Date().setHours(0, 0, 0, 0)) /
                            86400000,
                        )

                      // Validação com canal vinculado
                      const canalVinculado = precCanais.find((c) => c.marketplace === mp?.id)
                      const taxaDoCanal = precTaxas.find(
                        (t) =>
                          t.canal === canalVinculado?.id &&
                          t.tipo_valor === 'percentual' &&
                          (t.tipo_regra === 'comissao' || t.nome.toLowerCase().includes('comiss')),
                      )
                      const taxaEsperadaPct =
                        taxaDoCanal?.valor !== undefined
                          ? taxaDoCanal.valor
                          : acc?.comissao_percentual || 0

                      const dInicio = new Date(p.periodo_inicio)
                      const dFim = new Date(p.periodo_fim)
                      const vendasPeriodo = sales.filter(
                        (s) =>
                          s.marketplace_conta === p.marketplace_conta &&
                          isWithin(s.data, dInicio, dFim),
                      )
                      const brutoPeriodo = vendasPeriodo.reduce(
                        (n, s) => n + (s.valor_bruto || 0),
                        0,
                      )
                      const esperadoPeriodo = Math.max(
                        0,
                        Math.round(brutoPeriodo * (1 - taxaEsperadaPct / 100) * 100) / 100,
                      )
                      const diffRepasse = Math.round((p.valor - esperadoPeriodo) * 100) / 100

                      return (
                        <article
                          key={p.id}
                          className={`p-4 ${status === 'previsto' && days < 0 ? 'bg-destructive/5' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <span
                              className="mt-1 h-10 w-1 rounded-full"
                              style={{ background: mp?.cor || '#DF5830' }}
                            />
                            <span className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <strong className="text-sm">{acc?.apelido}</strong>
                                {canalVinculado && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] h-4.5 px-1.5 border-primary/30 text-primary bg-primary/5"
                                  >
                                    🔗 {canalVinculado.nome} ({taxaEsperadaPct}%)
                                  </Badge>
                                )}
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {formatDate(p.periodo_inicio)} a {formatDate(p.periodo_fim)}
                              </p>
                              <p
                                className={`mt-1 text-xs font-bold ${days < 0 && status === 'previsto' ? 'text-destructive' : 'text-muted-foreground'}`}
                              >
                                {status === 'realizado'
                                  ? `Recebido em ${formatDate(p.data_realizada)}`
                                  : days < 0
                                    ? `${Math.abs(days)} dias em atraso`
                                    : days === 0
                                      ? 'Vence hoje'
                                      : `Previsto em ${days} dias`}
                              </p>

                              {/* Conciliação inline no card do repasse */}
                              {vendasPeriodo.length > 0 && (
                                <div className="mt-2 text-[11px] rounded-md bg-secondary/30 p-2 flex items-center justify-between">
                                  <span className="text-muted-foreground">
                                    Vendas: {formatCurrency(brutoPeriodo)} (esperado:{' '}
                                    {formatCurrency(esperadoPeriodo)})
                                  </span>
                                  {Math.abs(diffRepasse) <= 0.5 ? (
                                    <Badge className="bg-emerald-600 text-[10px] text-white h-4.5">
                                      ✓ Comissão bate
                                    </Badge>
                                  ) : diffRepasse < 0 ? (
                                    <Badge
                                      variant="destructive"
                                      className="text-[10px] bg-red-600 text-white h-4.5"
                                    >
                                      Faltando {formatCurrency(Math.abs(diffRepasse))}
                                    </Badge>
                                  ) : (
                                    <Badge className="bg-blue-600 text-[10px] text-white h-4.5">
                                      +{formatCurrency(diffRepasse)} a mais
                                    </Badge>
                                  )}
                                </div>
                              )}
                            </span>
                            <strong className="text-sm tabular-nums">
                              {formatCurrency(p.valor)}
                            </strong>
                          </div>
                          {status === 'previsto' && (
                            <PermissionButton
                              allowed={can(user?.role, 'writeMarketplace')}
                              size="sm"
                              className="mt-3 w-full"
                              onClick={() => setConfirmPayout(p)}
                            >
                              Confirmar repasse
                            </PermissionButton>
                          )}
                          {p.lancamento && (
                            <Link
                              to={`/lancamentos?editar=${p.lancamento}`}
                              className="mt-3 block text-xs font-bold text-success"
                            >
                              <Receipt className="mr-1 inline h-3 w-3" />
                              Lançamento criado
                            </Link>
                          )}
                        </article>
                      )
                    })}
                  {!payouts.some((p) => p.status === status) && (
                    <p className="p-10 text-center text-sm text-muted-foreground">
                      Nenhum repasse {status}.
                    </p>
                  )}
                </div>
              </section>
            ))}
          </div>
        </TabsContent>

        {/* ABA 4: AUDITORIA DE TAXAS */}
        <TabsContent value="auditoria" className="mt-0">
          <AuditoriaTaxasTab
            sales={filteredSales}
            accounts={accounts}
            marketplaces={marketplaces}
            canais={precCanais}
            modalidades={precModalidades}
            taxas={precTaxas}
          />
        </TabsContent>
      </Tabs>

      <MarketplaceAccountDialog
        open={accountDialog}
        onOpenChange={setAccountDialog}
        record={editingAccount}
        marketplaces={marketplaces}
        contas={financial}
        onSaved={load}
      />
      <PayoutDialog
        open={payoutDialog}
        onOpenChange={setPayoutDialog}
        contas={accounts}
        onSaved={load}
      />
      <ConfirmPayoutDialog
        record={confirmPayout}
        onOpenChange={(v) => !v && setConfirmPayout(null)}
        onSaved={load}
      />
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir registro?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleteTarget?.label}” será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
