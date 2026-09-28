import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock3,
  ExternalLink,
  Pencil,
  Plus,
  Receipt,
  ShieldAlert,
  Store,
  Trash2,
  TrendingUp,
} from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'

import { AuditoriaTaxasTab } from '@/components/marketplaces/AuditoriaTaxasTab'
import { ConfirmPayoutDialog } from '@/components/marketplaces/ConfirmPayoutDialog'
import { MarketplaceAccountDialog } from '@/components/marketplaces/MarketplaceAccountDialog'
import { PayoutDialog } from '@/components/marketplaces/PayoutDialog'
import { SaleDialog } from '@/components/marketplaces/SaleDialog'
import { LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PeriodSelector } from '@/components/PeriodSelector'
import { PermissionButton } from '@/components/PermissionButton'
import { StatusBadge } from '@/components/StatusBadge'
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
    tab = params.get('tab') || 'contas',
    periodKey = (params.get('periodo') || 'current') as PeriodRange['key'],
    period = getPeriodRange(
      ['current', 'previous', '90days'].includes(periodKey) ? periodKey : 'current',
    )
  const [marketplaces, setMarketplaces] = useState<Marketplace[]>([]),
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
    [saleDialog, setSaleDialog] = useState(false),
    [editingSale, setEditingSale] = useState<Venda | null>(null),
    [payoutDialog, setPayoutDialog] = useState(false),
    [confirmPayout, setConfirmPayout] = useState<Repasse | null>(null),
    [deleteTarget, setDeleteTarget] = useState<{
      type: 'sale' | 'account' | 'payout'
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
      if (deleteTarget.type === 'sale') await marketplacesService.deleteVenda(deleteTarget.id)
      else if (deleteTarget.type === 'account')
        await marketplacesService.deleteConta(deleteTarget.id)
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
  if (loading) return <LoadingState label="Conciliando marketplaces..." />
  const action =
    tab === 'contas'
      ? () => {
          setEditingAccount(null)
          setAccountDialog(true)
        }
      : tab === 'vendas' || tab === 'auditoria'
        ? () => {
            setEditingSale(null)
            setSaleDialog(true)
          }
        : () => setPayoutDialog(true)
  const actionLabel =
    tab === 'contas'
      ? 'Nova conta'
      : tab === 'vendas' || tab === 'auditoria'
        ? 'Registrar venda'
        : 'Novo repasse'
  return (
    <>
      <PageHeader
        title="Marketplaces"
        description="Concilie vendas, comissões e repasses em um só lugar com auditoria direta contra a precificação."
        action={
          <PermissionButton allowed={can(user?.role, 'writeMarketplace')} onClick={action}>
            <Plus className="mr-2 h-4 w-4" />
            {actionLabel}
          </PermissionButton>
        }
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
          <TabsList className="grid w-full grid-cols-4 sm:w-auto">
            <TabsTrigger value="contas">Contas</TabsTrigger>
            <TabsTrigger value="vendas">Vendas</TabsTrigger>
            <TabsTrigger value="repasses">Repasses</TabsTrigger>
            <TabsTrigger value="auditoria" className="gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-primary" />
              Auditoria de Taxas
            </TabsTrigger>
          </TabsList>
        </Tabs>
        {tab !== 'contas' && (
          <PeriodSelector
            value={period.key}
            onChange={(v) => setParam('periodo', v === 'current' ? '' : v)}
          />
        )}
      </div>
      <Tabs value={tab} onValueChange={(v) => setParam('tab', v)}>
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
                        <small className="micro-label block">Bruto</small>
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
        <TabsContent value="vendas" className="mt-0">
          <div className="mb-4 grid gap-2 rounded-2xl border border-border bg-white p-3 sm:grid-cols-3">
            <Select value={selectedSlug || 'all'} onValueChange={(v) => setParam('marketplace', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Marketplace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os marketplaces</SelectItem>
                {marketplaces.map((m) => (
                  <SelectItem key={m.id} value={m.slug}>
                    {m.nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedAccount || 'all'} onValueChange={(v) => setParam('conta', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Conta" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as contas</SelectItem>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.apelido}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={selectedStatus || 'all'} onValueChange={(v) => setParam('status', v)}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os status</SelectItem>
                <SelectItem value="pendente">Pendente</SelectItem>
                <SelectItem value="paga">Paga</SelectItem>
                <SelectItem value="repassada">Repassada</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="hidden overflow-hidden rounded-2xl border border-border bg-white shadow-soft lg:block">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Pedido</th>
                  <th>Marketplace</th>
                  <th>Data</th>
                  <th>Bruto</th>
                  <th>Comissão + taxas</th>
                  <th>Líquido</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filteredSales.map((s) => {
                  const acc = accounts.find((a) => a.id === s.marketplace_conta),
                    mp = acc?.expand?.marketplace
                  return (
                    <tr key={s.id}>
                      <td>
                        <strong>{s.pedido_id}</strong>
                        {Array.isArray(s.itens) && s.itens.length > 0 && (
                          <div className="mt-1 space-y-0.5">
                            <span className="text-[10px] font-medium text-muted-foreground block">
                              {s.itens.length} {s.itens.length === 1 ? 'item' : 'itens'}:
                            </span>
                            <div className="max-w-xs space-y-0.5">
                              {s.itens.slice(0, 2).map((it, idx) => (
                                <p key={idx} className="text-[11px] text-foreground truncate">
                                  • {it.quantidade}x {it.descricao || 'Item'}
                                </p>
                              ))}
                              {s.itens.length > 2 && (
                                <p className="text-[10px] text-muted-foreground italic">
                                  + {s.itens.length - 2} outro(s)...
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                        {s.lancamento && (
                          <Link
                            to={`/lancamentos?editar=${s.lancamento}`}
                            className="mt-1 block text-[10px] font-bold text-success"
                          >
                            <ExternalLink className="mr-1 inline h-3 w-3" />
                            Lançamento criado
                          </Link>
                        )}
                      </td>
                      <td>
                        <Badge style={{ background: `${mp?.cor}25`, color: '#211A14' }}>
                          {mp?.nome}
                        </Badge>
                      </td>
                      <td>{formatDate(s.data)}</td>
                      <td>{formatCurrency(s.valor_bruto)}</td>
                      <td className="text-primary">{formatCurrency(s.comissao + s.taxas)}</td>
                      <td className="font-bold text-success">{formatCurrency(s.valor_liquido)}</td>
                      <td>
                        <StatusBadge status={s.status} />
                      </td>
                      <td>
                        <div className="flex justify-end gap-1">
                          {s.status === 'pendente' && can(user?.role, 'writeMarketplace') && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                try {
                                  await marketplacesService.saveVenda({ status: 'paga' }, s.id)
                                  toast({ title: 'Venda marcada como paga' })
                                  setTimeout(load, 350)
                                } catch (e) {
                                  toast({
                                    variant: 'destructive',
                                    title: 'Falha ao atualizar',
                                    description: apiMessage(e),
                                  })
                                }
                              }}
                            >
                              Marcar paga
                            </Button>
                          )}
                          {can(user?.role, 'writeMarketplace') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                setEditingSale(s)
                                setSaleDialog(true)
                              }}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {can(user?.role, 'deleteFinance') && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() =>
                                setDeleteTarget({ type: 'sale', id: s.id, label: s.pedido_id })
                              }
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <div className="space-y-3 lg:hidden">
            {filteredSales.map((s) => {
              const acc = accounts.find((a) => a.id === s.marketplace_conta),
                mp = acc?.expand?.marketplace
              return (
                <article
                  key={s.id}
                  className="rounded-2xl border border-border bg-white p-4 shadow-soft"
                  onClick={() => {
                    if (can(user?.role, 'writeMarketplace')) {
                      setEditingSale(s)
                      setSaleDialog(true)
                    }
                  }}
                >
                  <div className="flex items-start justify-between">
                    <span>
                      <strong>{s.pedido_id}</strong>
                      <Badge
                        className="ml-2"
                        style={{ background: `${mp?.cor}30`, color: '#211A14' }}
                      >
                        {mp?.nome}
                      </Badge>
                      {Array.isArray(s.itens) && s.itens.length > 0 && (
                        <span className="ml-2 text-[11px] text-muted-foreground">
                          ({s.itens.length} {s.itens.length === 1 ? 'item' : 'itens'})
                        </span>
                      )}
                    </span>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {formatDate(s.data)} · {acc?.apelido}
                  </p>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <span>
                      <small className="micro-label block">Valor bruto</small>
                      <strong className="tabular-nums">{formatCurrency(s.valor_bruto)}</strong>
                    </span>
                    <span className="text-right">
                      <small className="micro-label block">Valor líquido</small>
                      <strong className="tabular-nums text-success">
                        {formatCurrency(s.valor_liquido)}
                      </strong>
                    </span>
                    <span>
                      <small className="micro-label block">Comissão</small>
                      <span className="text-sm tabular-nums">{formatCurrency(s.comissao)}</span>
                    </span>
                    <span className="text-right">
                      <small className="micro-label block">Taxas</small>
                      <span className="text-sm tabular-nums">{formatCurrency(s.taxas)}</span>
                    </span>
                  </div>
                  {s.status === 'pendente' && can(user?.role, 'writeMarketplace') && (
                    <Button
                      size="sm"
                      className="mt-4 w-full"
                      onClick={async (e) => {
                        e.stopPropagation()
                        await marketplacesService.saveVenda({ status: 'paga' }, s.id)
                        setTimeout(load, 300)
                      }}
                    >
                      <CheckCircle2 className="mr-2 h-4 w-4" />
                      Marcar como paga
                    </Button>
                  )}
                  {s.lancamento && (
                    <Link
                      to={`/lancamentos?editar=${s.lancamento}`}
                      className="mt-3 block text-xs font-bold text-success"
                    >
                      <ExternalLink className="mr-1 inline h-3 w-3" />
                      Lançamento criado
                    </Link>
                  )}
                </article>
              )
            })}
          </div>
          {!filteredSales.length && (
            <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
              Nenhuma venda encontrada neste período.
            </div>
          )}
        </TabsContent>
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
      <SaleDialog
        open={saleDialog}
        onOpenChange={setSaleDialog}
        record={editingSale}
        contas={accounts}
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
