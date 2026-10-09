import pb from '@/lib/pocketbase/client'
import type { Estabelecimento } from '@/types/domain'

export const estabelecimentosService = {
  listEstabelecimentos: (filtroAtivo = false) => {
    const options: { sort: string; filter?: string } = { sort: 'nome' }
    if (filtroAtivo) {
      options.filter = 'ativa = true'
    }
    return pb.collection<Estabelecimento>('estabelecimentos').getFullList(options)
  },

  getEstabelecimento: (id: string) => pb.collection<Estabelecimento>('estabelecimentos').getOne(id),

  saveEstabelecimento: (data: Partial<Estabelecimento>, id?: string) =>
    id
      ? pb.collection<Estabelecimento>('estabelecimentos').update(id, data)
      : pb.collection<Estabelecimento>('estabelecimentos').create(data),

  deleteEstabelecimento: (id: string) => pb.collection('estabelecimentos').delete(id),
}
