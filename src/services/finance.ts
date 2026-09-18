import type { RecordListOptions, RecordOptions } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import type { Categoria, Conta, Lancamento } from '@/types/domain'

const listAll = <T>(collection: string, options?: RecordListOptions) =>
  pb.collection<T>(collection).getFullList({ ...options })

export const financeService = {
  listLancamentos: (options?: RecordListOptions) =>
    listAll<Lancamento>('lancamentos', {
      sort: '-data,-created',
      expand: 'conta,categoria,empresa,pessoa',
      ...options,
    }),
  pageLancamentos: (page: number, perPage = 25, options?: RecordListOptions) =>
    pb.collection<Lancamento>('lancamentos').getList(page, perPage, {
      sort: '-data,-created',
      expand: 'conta,categoria,empresa,pessoa',
      ...options,
    }),
  saveLancamento: (data: Partial<Lancamento>, id?: string, options?: RecordOptions) =>
    id
      ? pb.collection<Lancamento>('lancamentos').update(id, data, options)
      : pb.collection<Lancamento>('lancamentos').create(data, options),
  deleteLancamento: (id: string) => pb.collection('lancamentos').delete(id),
  listContas: () => listAll<Conta>('contas', { sort: '-ativa,nome' }),
  saveConta: (data: Partial<Conta>, id?: string) =>
    id
      ? pb.collection<Conta>('contas').update(id, data)
      : pb.collection<Conta>('contas').create(data),
  deleteConta: (id: string) => pb.collection('contas').delete(id),
  listCategorias: () => listAll<Categoria>('categorias', { sort: 'tipo,nome' }),
  saveCategoria: (data: Partial<Categoria>, id?: string) =>
    id
      ? pb.collection<Categoria>('categorias').update(id, data)
      : pb.collection<Categoria>('categorias').create(data),
  deleteCategoria: (id: string) => pb.collection('categorias').delete(id),
}
