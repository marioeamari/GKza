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

  /**
   * Pagar Fatura Inteira:
   * 1. Cria um lançamento de despesa na conta pagadora (bancária/caixa) na data do pagamento.
   * 2. Marca todas as compras daquele ciclo de fatura como fatura_paga = true e vincula ao pagamento.
   */
  pagarFaturaCartao: async (params: {
    cartaoContaId: string
    competencia: string // 'YYYY-MM'
    valorPago: number
    dataPagamento: string // 'YYYY-MM-DD'
    contaPagadoraId: string
    descricaoFatura: string
    categoriaId?: string
    itensIds: string[]
  }) => {
    // 1. Criar lançamento de saída de caixa na conta pagadora
    const lancamentoPagamento = await pb.collection<Lancamento>('lancamentos').create({
      descricao: `Pagamento: ${params.descricaoFatura}`,
      valor: params.valorPago,
      tipo: 'despesa',
      data: `${params.dataPagamento} 12:00:00`,
      status: 'pago',
      conta: params.contaPagadoraId,
      categoria: params.categoriaId || null,
      is_pagamento_fatura: true,
      cartao_fatura_conta: params.cartaoContaId,
      competencia: params.competencia,
      observacoes: `Quitação consolidada de ${params.itensIds.length} compra(s) do ciclo ${params.competencia}`,
    })

    // 2. Atualizar as compras do cartão como vinculadas e pagas por esta fatura
    for (const itemId of params.itensIds) {
      try {
        await pb.collection('lancamentos').update(itemId, {
          fatura_paga: true,
          fatura_pagamento_id: lancamentoPagamento.id,
          status: 'pago',
        })
      } catch (err) {
        console.warn(`Erro ao atualizar item ${itemId} da fatura:`, err)
      }
    }

    return lancamentoPagamento
  },

  /**
   * Desfazer pagamento da fatura:
   * 1. Remove o lançamento de pagamento da conta bancária/caixa (estorna o dinheiro pro caixa)
   * 2. Desmarca fatura_paga dos itens vinculados a esta fatura
   */
  estornarPagamentoFaturaCartao: async (params: {
    pagamentoLancamentoId: string
    cartaoContaId: string
    competencia: string
  }) => {
    // 1. Desmarcar as compras vinculadas
    const itens = await pb.collection<Lancamento>('lancamentos').getFullList({
      filter: `conta = '${params.cartaoContaId}' && (fatura_pagamento_id = '${params.pagamentoLancamentoId}' || competencia = '${params.competencia}')`,
    })

    for (const item of itens) {
      try {
        await pb.collection('lancamentos').update(item.id, {
          fatura_paga: false,
          fatura_pagamento_id: null,
          status: 'pendente',
        })
      } catch (err) {
        console.warn(`Erro ao desmarcar item ${item.id} da fatura:`, err)
      }
    }

    // 2. Excluir o lançamento de pagamento se existir
    if (params.pagamentoLancamentoId) {
      try {
        await pb.collection('lancamentos').delete(params.pagamentoLancamentoId)
      } catch (err) {
        console.warn(`Lançamento de pagamento já havia sido removido:`, err)
      }
    }
  },

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
