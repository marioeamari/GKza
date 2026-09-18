import pb from '@/lib/pocketbase/client'
import type { Marketplace, MarketplaceConta, Repasse, Venda } from '@/types/domain'

export const marketplacesService = {
  listMarketplaces: () => pb.collection<Marketplace>('marketplaces').getFullList({ sort: 'nome' }),
  listContas: () =>
    pb
      .collection<MarketplaceConta>('marketplace_contas')
      .getFullList({ sort: '-ativa,apelido', expand: 'marketplace,conta' }),
  saveConta: (data: Partial<MarketplaceConta>, id?: string) =>
    id
      ? pb
          .collection<MarketplaceConta>('marketplace_contas')
          .update(id, data, { expand: 'marketplace,conta' })
      : pb
          .collection<MarketplaceConta>('marketplace_contas')
          .create(data, { expand: 'marketplace,conta' }),
  deleteConta: (id: string) => pb.collection('marketplace_contas').delete(id),
  listVendas: () =>
    pb.collection<Venda>('vendas').getFullList({
      sort: '-data,-created',
      expand: 'marketplace_conta.marketplace,marketplace_conta.conta,lancamento',
    }),
  saveVenda: (data: Partial<Venda>, id?: string) =>
    id
      ? pb.collection<Venda>('vendas').update(id, data, {
          expand: 'marketplace_conta.marketplace,marketplace_conta.conta,lancamento',
        })
      : pb.collection<Venda>('vendas').create(data, {
          expand: 'marketplace_conta.marketplace,marketplace_conta.conta,lancamento',
        }),
  deleteVenda: (id: string) => pb.collection('vendas').delete(id),
  listRepasses: () =>
    pb.collection<Repasse>('repasses').getFullList({
      sort: '-data_prevista',
      expand: 'marketplace_conta.marketplace,marketplace_conta.conta,lancamento',
    }),
  saveRepasse: (data: Partial<Repasse>, id?: string) =>
    id
      ? pb.collection<Repasse>('repasses').update(id, data, {
          expand: 'marketplace_conta.marketplace,marketplace_conta.conta,lancamento',
        })
      : pb.collection<Repasse>('repasses').create(data, {
          expand: 'marketplace_conta.marketplace,marketplace_conta.conta,lancamento',
        }),
  deleteRepasse: (id: string) => pb.collection('repasses').delete(id),
}
