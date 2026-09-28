import { useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Filter,
  Percent,
  Search,
  ShieldAlert,
  TrendingDown,
  TrendingUp,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { formatCurrency, formatDate } from '@/lib/format'
import type { Marketplace, MarketplaceConta, Venda } from '@/types/domain'
import type {
  PrecCanalModalidadeRecord,
  PrecCanalRecord,
  PrecTaxaRecord,
} from '@/types/precificacao'

export interface AuditoriaLinha {
  venda: Venda
  conta?: MarketplaceConta
  marketplace?: Marketplace
  canalPrecificacao?: PrecCanalRecord
  taxasDoCanal: PrecTaxaRecord[]
  comissaoReal: number
  comissaoRealPct: number
  comissaoEsperada: number
  comissaoEsperadaPct: number
  diferenca: number // comissaoReal - comissaoEsperada (se > 0, cobrou a mais)
  taxaNomeEsperada: string
  statusDivergencia: 'correto' | 'divergente_mais' | 'divergente_menos' | 'sem_canal'
}

interface AuditoriaTaxasTabProps {
  sales: Venda[]
  accounts: MarketplaceConta[]
  marketplaces: Marketplace[]
  canais: PrecCanalRecord[]
  modalidades: PrecCanalModalidadeRecord[]
  taxas: PrecTaxaRecord[]
}

export function AuditoriaTaxasTab({
  sales,
  accounts,
  marketplaces,
  canais,
  modalidades,
  taxas,
}: AuditoriaTaxasTabProps) {
  const [selectedCanalFilter, setSelectedCanalFilter] = useState('all')
  const [divergenciaFilter, setDivergenciaFilter] = useState<'all' | 'divergentes' | 'corretos'>(
    'all',
  )
  const [busca, setBusca] = useState('')

  // Mapa de marketplaceId -> PrecCanalRecord
  const canalPorMarketplace = useMemo(() => {
    const map = new Map<string, PrecCanalRecord>()
    for (const canal of canais) {
      if (canal.marketplace) {
        map.set(canal.marketplace, canal)
      } else {
        // Tentar fallback por nome idêntico (ex.: Shopee -> shopee)
        const matchedMp = marketplaces.find(
          (m) =>
            m.nome.trim().toLowerCase() === canal.nome.trim().toLowerCase() ||
            m.slug.toLowerCase() === canal.nome.trim().toLowerCase(),
        )
        if (matchedMp && !map.has(matchedMp.id)) {
          map.set(matchedMp.id, canal)
        }
      }
    }
    return map
  }, [canais, marketplaces])

  const linhasAuditoria: AuditoriaLinha[] = useMemo(() => {
    return sales.map((sale) => {
      const conta = accounts.find((a) => a.id === sale.marketplace_conta)
      const mp = conta?.expand?.marketplace || marketplaces.find((m) => m.id === conta?.marketplace)
      const canal = mp ? canalPorMarketplace.get(mp.id) : undefined

      // Buscar taxas cadastradas neste canal
      const canalTaxas = canal ? taxas.filter((t) => t.canal === canal.id) : []

      // Encontrar alíquota esperada de comissão
      // Pode vir da taxa percentual cadastrada em prec_taxas ou do percentual padrão do canal
      let comissaoEsperadaPct = 0
      let taxaNomeEsperada = 'Padrão da Conta'

      const taxaComissao = canalTaxas.find(
        (t) =>
          t.tipo_valor === 'percentual' &&
          (t.tipo_regra === 'comissao' ||
            t.nome.toLowerCase().includes('comiss') ||
            t.nome.toLowerCase().includes('taxa fixa')),
      )

      if (taxaComissao) {
        comissaoEsperadaPct = taxaComissao.valor || 0
        taxaNomeEsperada = `${canal?.nome}: ${taxaComissao.nome} (${comissaoEsperadaPct}%)`
      } else if (conta?.comissao_percentual) {
        comissaoEsperadaPct = conta.comissao_percentual
        taxaNomeEsperada = `Comissão conta (${comissaoEsperadaPct}%)`
      }

      const valorBruto = sale.valor_bruto || 0
      const comissaoReal = sale.comissao || 0
      const comissaoRealPct =
        valorBruto > 0 ? Math.round((comissaoReal / valorBruto) * 1000) / 10 : 0

      // Calcular comissão esperada
      let comissaoEsperada = Math.round(valorBruto * (comissaoEsperadaPct / 100) * 100) / 100

      // Adicionar taxas fixas por pedido se houver no canal de precificação
      const taxasFixas = canalTaxas.filter((t) => t.tipo_valor === 'fixo')
      const totalTaxaFixaEsperada = taxasFixas.reduce((acc, t) => acc + (t.valor || 0), 0)
      if (totalTaxaFixaEsperada > 0) {
        comissaoEsperada += totalTaxaFixaEsperada
      }

      const diff = Math.round((comissaoReal - comissaoEsperada) * 100) / 100

      let statusDivergencia: AuditoriaLinha['statusDivergencia'] = 'correto'
      if (!canal) {
        statusDivergencia = 'sem_canal'
      } else if (Math.abs(diff) > 0.05) {
        statusDivergencia = diff > 0 ? 'divergente_mais' : 'divergente_menos'
      }

      return {
        venda: sale,
        conta,
        marketplace: mp,
        canalPrecificacao: canal,
        taxasDoCanal: canalTaxas,
        comissaoReal,
        comissaoRealPct,
        comissaoEsperada,
        comissaoEsperadaPct,
        diferenca: diff,
        taxaNomeEsperada,
        statusDivergencia,
      }
    })
  }, [sales, accounts, marketplaces, canalPorMarketplace, taxas])

  // Filtragem
  const filtradas = useMemo(() => {
    return linhasAuditoria.filter((item) => {
      if (selectedCanalFilter !== 'all') {
        if (selectedCanalFilter === 'sem_canal' && item.canalPrecificacao) return false
        if (
          selectedCanalFilter !== 'sem_canal' &&
          item.canalPrecificacao?.id !== selectedCanalFilter
        ) {
          return false
        }
      }

      if (divergenciaFilter === 'divergentes') {
        if (item.statusDivergencia === 'correto') return false
      } else if (divergenciaFilter === 'corretos') {
        if (item.statusDivergencia !== 'correto') return false
      }

      if (busca.trim()) {
        const q = busca.toLowerCase()
        const pid = (item.venda.pedido_id || '').toLowerCase()
        const mpNome = (item.marketplace?.nome || '').toLowerCase()
        const contaNome = (item.conta?.apelido || '').toLowerCase()
        if (!pid.includes(q) && !mpNome.includes(q) && !contaNome.includes(q)) return false
      }

      return true
    })
  }, [linhasAuditoria, selectedCanalFilter, divergenciaFilter, busca])

  // Métricas de resumo
  const resumo = useMemo(() => {
    const totalVendas = linhasAuditoria.length
    const divergentesMais = linhasAuditoria.filter((l) => l.statusDivergencia === 'divergente_mais')
    const divergentesMenos = linhasAuditoria.filter(
      (l) => l.statusDivergencia === 'divergente_menos',
    )
    const semCanal = linhasAuditoria.filter((l) => l.statusDivergencia === 'sem_canal')
    const totalCorretas = linhasAuditoria.filter((l) => l.statusDivergencia === 'correto').length

    const totalCobradoReal = linhasAuditoria.reduce((acc, l) => acc + l.comissaoReal, 0)
    const totalEsperado = linhasAuditoria.reduce((acc, l) => acc + l.comissaoEsperada, 0)
    const diferencaLiquida = Math.round((totalCobradoReal - totalEsperado) * 100) / 100

    return {
      totalVendas,
      totalDivergentes: divergentesMais.length + divergentesMenos.length,
      divergentesMais: divergentesMais.length,
      divergentesMenos: divergentesMenos.length,
      semCanal: semCanal.length,
      totalCorretas,
      totalCobradoReal,
      totalEsperado,
      diferencaLiquida,
    }
  }, [linhasAuditoria])

  return (
    <div className="space-y-6">
      {/* Cards de Resumo */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="shadow-soft border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground flex items-center justify-between">
              <span>Auditoria Geral</span>
              <ShieldAlert className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-foreground">
              {resumo.totalDivergentes}{' '}
              <span className="text-xs font-normal text-muted-foreground">
                de {resumo.totalVendas} vendas
              </span>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {resumo.totalCorretas} vendas dentro da taxa cadastrada
            </p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground flex items-center justify-between">
              <span>Comissão Real Cobrada</span>
              <Percent className="h-4 w-4 text-amber-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-amber-700">
              {formatCurrency(resumo.totalCobradoReal)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">Descontada nas vendas registradas</p>
          </CardContent>
        </Card>

        <Card className="shadow-soft border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground flex items-center justify-between">
              <span>Comissão Teórica Precificada</span>
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold font-mono text-emerald-700">
              {formatCurrency(resumo.totalEsperado)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Conforme taxas ativas de /precificacao
            </p>
          </CardContent>
        </Card>

        <Card
          className={`shadow-soft border ${
            resumo.diferencaLiquida > 0
              ? 'border-red-200 bg-red-50/40'
              : resumo.diferencaLiquida < 0
                ? 'border-emerald-200 bg-emerald-50/40'
                : 'border-border'
          }`}
        >
          <CardHeader className="pb-2">
            <CardTitle className="text-xs uppercase font-bold text-muted-foreground flex items-center justify-between">
              <span>Diferença Acumulada</span>
              {resumo.diferencaLiquida > 0 ? (
                <TrendingUp className="h-4 w-4 text-red-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-emerald-600" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold font-mono ${
                resumo.diferencaLiquida > 0
                  ? 'text-red-600'
                  : resumo.diferencaLiquida < 0
                    ? 'text-emerald-700'
                    : 'text-foreground'
              }`}
            >
              {resumo.diferencaLiquida > 0 ? '+' : ''}
              {formatCurrency(resumo.diferencaLiquida)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {resumo.diferencaLiquida > 0
                ? 'Praça cobrou a mais que o precificado'
                : resumo.diferencaLiquida < 0
                  ? 'Praça cobrou a menos que o precificado'
                  : 'Total perfeitamente alinhado'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Alerta de canais sem vínculo */}
      {resumo.semCanal > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 space-y-1">
            <strong>
              Existem vendas em marketplaces sem canal de precificação vinculado ({resumo.semCanal})
            </strong>
            <p className="text-amber-800">
              Vincule seus canais de precificação aos marketplaces em{' '}
              <Link to="/precificacao/canais" className="underline font-bold text-amber-950">
                /precificacao/canais
              </Link>{' '}
              para que a taxa teórica exata de cada praça seja auditada aqui automaticamente.
            </p>
          </div>
        </div>
      )}

      {/* Barra de Filtros */}
      <div className="grid gap-3 rounded-2xl border border-border bg-white p-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por pedido, conta ou praça..."
            className="pl-9 h-9 text-xs"
          />
        </div>

        <Select value={selectedCanalFilter} onValueChange={setSelectedCanalFilter}>
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Canal de precificação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os canais de precificação</SelectItem>
            {canais.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.nome} {c.expand?.marketplace ? `(🔗 ${c.expand.marketplace.nome})` : ''}
              </SelectItem>
            ))}
            <SelectItem value="sem_canal">Marketplaces sem canal vinculado</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={divergenciaFilter}
          onValueChange={(v) => setDivergenciaFilter(v as typeof divergenciaFilter)}
        >
          <SelectTrigger className="h-9 text-xs">
            <SelectValue placeholder="Status da divergência" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as situações</SelectItem>
            <SelectItem value="divergentes">Apenas divergências (taxa não bate)</SelectItem>
            <SelectItem value="corretos">Apenas corretos (bate com a precificação)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Tabela de Auditoria */}
      <div className="hidden overflow-hidden rounded-2xl border border-border bg-white shadow-soft lg:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>Venda / Pedido</th>
              <th>Marketplace & Conta</th>
              <th>Canal Precificação</th>
              <th>Valor Bruto</th>
              <th>Comissão Real Cobrada</th>
              <th>Comissão Esperada (Taxa)</th>
              <th>Diferença</th>
              <th>Diagnóstico</th>
            </tr>
          </thead>
          <tbody>
            {filtradas.map((item) => {
              const { venda, conta, marketplace, canalPrecificacao, statusDivergencia, diferenca } =
                item
              return (
                <tr key={venda.id}>
                  <td>
                    <strong>{venda.pedido_id}</strong>
                    <span className="block text-[11px] text-muted-foreground">
                      {formatDate(venda.data)}
                    </span>
                    {Array.isArray(venda.itens) && venda.itens.length > 0 && (
                      <span className="text-[10px] text-muted-foreground block">
                        {venda.itens.length} {venda.itens.length === 1 ? 'item' : 'itens'}
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="space-y-0.5">
                      <Badge
                        style={{
                          background: `${marketplace?.cor || '#DF5830'}25`,
                          color: '#211A14',
                        }}
                      >
                        {marketplace?.nome || 'Marketplace'}
                      </Badge>
                      <span className="block text-[11px] text-muted-foreground">
                        {conta?.apelido}
                      </span>
                    </div>
                  </td>
                  <td>
                    {canalPrecificacao ? (
                      <div className="space-y-0.5">
                        <span className="font-semibold text-xs text-foreground flex items-center gap-1.5">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: canalPrecificacao.cor || '#DF5830' }}
                          />
                          {canalPrecificacao.nome}
                        </span>
                        <span className="text-[10px] text-muted-foreground block truncate max-w-[180px]">
                          {item.taxaNomeEsperada}
                        </span>
                      </div>
                    ) : (
                      <span className="text-xs text-amber-700 italic">Sem canal vinculado</span>
                    )}
                  </td>
                  <td className="font-mono text-sm">{formatCurrency(venda.valor_bruto)}</td>
                  <td>
                    <div className="font-mono font-bold text-sm text-foreground">
                      {formatCurrency(item.comissaoReal)}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {item.comissaoRealPct.toFixed(1)}% do bruto
                    </span>
                  </td>
                  <td>
                    <div className="font-mono font-bold text-sm text-primary">
                      {formatCurrency(item.comissaoEsperada)}
                    </div>
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {item.comissaoEsperadaPct.toFixed(1)}% esperado
                    </span>
                  </td>
                  <td>
                    <div
                      className={`font-mono font-bold text-sm ${
                        diferenca > 0
                          ? 'text-red-600'
                          : diferenca < 0
                            ? 'text-emerald-600'
                            : 'text-muted-foreground'
                      }`}
                    >
                      {diferenca > 0 ? `+${formatCurrency(diferenca)}` : formatCurrency(diferenca)}
                    </div>
                    {item.venda.valor_bruto > 0 && Math.abs(diferenca) > 0.05 && (
                      <span className="text-[10px] text-muted-foreground block font-mono">
                        {(item.comissaoRealPct - item.comissaoEsperadaPct).toFixed(1)}% p.p.
                      </span>
                    )}
                  </td>
                  <td>
                    {statusDivergencia === 'correto' && (
                      <Badge
                        variant="outline"
                        className="bg-emerald-50 text-emerald-700 border-emerald-300 text-[10px]"
                      >
                        ✓ Bate com a taxa
                      </Badge>
                    )}
                    {statusDivergencia === 'divergente_mais' && (
                      <Badge
                        variant="destructive"
                        className="bg-red-50 text-red-700 border-red-300 text-[10px]"
                      >
                        ⚠ Cobrou a mais ({formatCurrency(diferenca)})
                      </Badge>
                    )}
                    {statusDivergencia === 'divergente_menos' && (
                      <Badge
                        variant="secondary"
                        className="bg-blue-50 text-blue-700 border-blue-300 text-[10px]"
                      >
                        ↓ Cobrou a menos ({formatCurrency(Math.abs(diferenca))})
                      </Badge>
                    )}
                    {statusDivergencia === 'sem_canal' && (
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-300 text-[10px]"
                      >
                        Não vinculado
                      </Badge>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Versão Mobile (Cards) */}
      <div className="space-y-3 lg:hidden">
        {filtradas.map((item) => (
          <article
            key={item.venda.id}
            className="rounded-2xl border border-border bg-white p-4 shadow-soft space-y-3"
          >
            <div className="flex items-start justify-between">
              <div>
                <strong>{item.venda.pedido_id}</strong>
                <p className="text-xs text-muted-foreground">
                  {formatDate(item.venda.data)} · {item.conta?.apelido}
                </p>
              </div>
              <Badge
                style={{
                  background: `${item.marketplace?.cor || '#DF5830'}25`,
                  color: '#211A14',
                }}
              >
                {item.marketplace?.nome}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs border-t border-border pt-2">
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Bruto</span>
                <strong className="font-mono">{formatCurrency(item.venda.valor_bruto)}</strong>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">Canal</span>
                <span className="font-semibold text-foreground truncate block">
                  {item.canalPrecificacao?.nome || 'Sem canal'}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">
                  Comissão Real
                </span>
                <strong className="font-mono text-red-600">
                  {formatCurrency(item.comissaoReal)} ({item.comissaoRealPct.toFixed(1)}%)
                </strong>
              </div>
              <div>
                <span className="text-muted-foreground block text-[10px] uppercase">
                  Comissão Esperada
                </span>
                <strong className="font-mono text-primary">
                  {formatCurrency(item.comissaoEsperada)} ({item.comissaoEsperadaPct.toFixed(1)}%)
                </strong>
              </div>
            </div>

            <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
              <span className="font-semibold text-muted-foreground">Diferença:</span>
              <span
                className={`font-mono font-bold ${
                  item.diferenca > 0
                    ? 'text-red-600'
                    : item.diferenca < 0
                      ? 'text-emerald-600'
                      : 'text-muted-foreground'
                }`}
              >
                {item.diferenca > 0
                  ? `+${formatCurrency(item.diferenca)}`
                  : formatCurrency(item.diferenca)}
              </span>
            </div>
          </article>
        ))}
      </div>

      {!filtradas.length && (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center text-sm text-muted-foreground">
          Nenhuma auditoria encontrada com os filtros selecionados.
        </div>
      )}
    </div>
  )
}
