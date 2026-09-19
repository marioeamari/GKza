import type { RecordListOptions } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import type { Lancamento, TelegramRegistroPendente } from '@/types/domain'

export const telegramPendentesService = {
  listPendentes: (options?: RecordListOptions) =>
    pb.collection<TelegramRegistroPendente>('telegram_registros_pendentes').getFullList({
      sort: '-created',
      filter: "status = 'pendente'",
      expand: 'conta,categoria,empresa,pessoa',
      ...options,
    }),

  pagePendentes: (page = 1, perPage = 20, options?: RecordListOptions) =>
    pb.collection<TelegramRegistroPendente>('telegram_registros_pendentes').getList(page, perPage, {
      sort: '-created',
      expand: 'conta,categoria,empresa,pessoa',
      ...options,
    }),

  countPendentes: async () => {
    try {
      const res = await pb
        .collection('telegram_registros_pendentes')
        .getList(1, 1, { filter: "status = 'pendente'" })
      return res.totalItems
    } catch {
      return 0
    }
  },

  updatePendente: (id: string, data: Partial<TelegramRegistroPendente>) =>
    pb.collection<TelegramRegistroPendente>('telegram_registros_pendentes').update(id, data),

  descartarPendente: (id: string) =>
    pb.collection<TelegramRegistroPendente>('telegram_registros_pendentes').update(id, {
      status: 'descartado',
    }),

  deletePendente: (id: string) => pb.collection('telegram_registros_pendentes').delete(id),

  checkDuplicates: async (valor: number, tipo: string, data: string) => {
    try {
      const dateOnly = data.slice(0, 10)
      const filter = `valor = ${valor} && tipo = '${tipo}' && data >= '${dateOnly} 00:00:00' && data <= '${dateOnly} 23:59:59'`
      const dupes = await pb.collection<Lancamento>('lancamentos').getList(1, 5, {
        filter,
        sort: '-created',
        expand: 'conta,categoria',
      })
      return dupes.items
    } catch {
      return []
    }
  },

  aprovarELancar: async (
    pendenteId: string,
    lancamentoData: {
      descricao: string
      valor: number
      tipo: 'receita' | 'despesa'
      data: string
      conta: string
      categoria: string
      empresa?: string
      pessoa?: string
      observacoes?: string
    },
  ) => {
    // 1. Criar o lançamento oficial
    const lancamento = await pb.collection<Lancamento>('lancamentos').create({
      descricao: lancamentoData.descricao,
      valor: lancamentoData.valor,
      tipo: lancamentoData.tipo,
      data: lancamentoData.data,
      status: 'pago',
      conta: lancamentoData.conta,
      categoria: lancamentoData.categoria,
      empresa: lancamentoData.empresa || '',
      pessoa: lancamentoData.pessoa || '',
      observacoes: lancamentoData.observacoes || 'Importado via Telegram (aprovado no sistema)',
    })

    // 2. Marcar o registro pendente como aprovado e vincular o lançamento gerado
    await pb.collection('telegram_registros_pendentes').update(pendenteId, {
      status: 'aprovado',
      lancamento_gerado: lancamento.id,
      conta: lancamentoData.conta,
      categoria: lancamentoData.categoria,
      descricao: lancamentoData.descricao,
      valor: lancamentoData.valor,
      data: lancamentoData.data,
      empresa: lancamentoData.empresa || '',
      pessoa: lancamentoData.pessoa || '',
    })

    return lancamento
  },
}
