import { Link } from 'react-router-dom'

import { formatCurrency } from '@/lib/format'
import type { Marketplace, MarketplaceConta, Venda } from '@/types/domain'

export function MarketplaceChart({
  vendas,
  contas,
  marketplaces,
}: {
  vendas: Venda[]
  contas: MarketplaceConta[]
  marketplaces: Marketplace[]
}) {
  const totals = marketplaces
    .map((marketplace) => {
      const accountIds = contas
        .filter((item) => item.marketplace === marketplace.id)
        .map((item) => item.id)
      const selected = vendas.filter((item) => accountIds.includes(item.marketplace_conta))
      return {
        marketplace,
        bruto: selected.reduce((sum, item) => sum + item.valor_bruto, 0),
        comissao: selected.reduce((sum, item) => sum + item.comissao, 0),
      }
    })
    .filter((item) => item.bruto > 0)
    .sort((a, b) => b.bruto - a.bruto)
  const max = Math.max(...totals.map((item) => item.bruto), 1)
  if (!totals.length)
    return (
      <div className="grid h-52 place-items-center text-sm text-muted-foreground">
        Nenhuma venda no período.
      </div>
    )
  return (
    <div className="space-y-5 py-3">
      {totals.map(({ marketplace, bruto, comissao }) => (
        <Link
          to={`/marketplaces?tab=vendas&marketplace=${marketplace.slug}`}
          key={marketplace.id}
          className="group block rounded-xl p-2 transition hover:bg-secondary/50"
        >
          <div className="mb-2 flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-bold">
              <span
                className="h-3 w-3 rounded-full ring-2 ring-white"
                style={{ background: marketplace.cor }}
              />
              {marketplace.nome}
            </span>
            <span className="tabular-nums text-sm font-extrabold">{formatCurrency(bruto)}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-secondary">
            <div
              className="h-full rounded-full transition-all duration-500 group-hover:brightness-95"
              style={{ width: `${Math.max(6, (bruto / max) * 100)}%`, background: marketplace.cor }}
            />
          </div>
          <p className="mt-1.5 text-right text-[11px] font-semibold text-muted-foreground">
            {formatCurrency(comissao)} em comissões
          </p>
        </Link>
      ))}
    </div>
  )
}
