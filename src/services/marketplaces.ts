import pb from '@/lib/pocketbase/client'
import type { Marketplace, MarketplaceConta, Repasse, Venda } from '@/types/domain'

export const marketplacesService = {
  listMarketplaces: () => pb.collection<Marketplace>('marketplaces').getFullList({ sort: 'nome' }),
  saveMarketplace: (data: { nome: string; slug: string; cor?: string }, id?: string) =>
    id
      ? pb.collection<Marketplace>('marketplaces').update(id, data)
      : pb.collection<Marketplace>('marketplaces').create(data),
  ensureMarketplace: async (input: {
    nome: string
    cor: string
    slug?: string
  }): Promise<Marketplace> => {
    const nomeLimpo = input.nome.trim()
    const gerarSlug = (str: string) =>
      str
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'marketplace'

    const slugBase = input.slug?.trim() || gerarSlug(nomeLimpo)

    try {
      const existente = await pb
        .collection<Marketplace>('marketplaces')
        .getFirstListItem(`slug = "${slugBase}" || nome = "${nomeLimpo}"`)
      if (existente) {
        if (input.cor && existente.cor !== input.cor) {
          try {
            return await pb
              .collection<Marketplace>('marketplaces')
              .update(existente.id, { cor: input.cor })
          } catch {
            /* intentionally ignored */
          }
        }
        return existente
      }
    } catch (_) {
      // cria novo
    }

    return pb.collection<Marketplace>('marketplaces').create({
      nome: nomeLimpo,
      slug: slugBase,
      cor: input.cor || '#DF5830',
    })
  },
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
  confirmRepasse: (id: string, data_realizada: string) =>
    pb
      .collection<Repasse>('repasses')
      .update(
        id,
        { status: 'realizado', data_realizada },
        { expand: 'marketplace_conta.marketplace,marketplace_conta.conta,lancamento' },
      ),
  deleteRepasse: (id: string) => pb.collection('repasses').delete(id),
}
