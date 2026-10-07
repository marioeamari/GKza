import { ClientResponseError, type RecordListOptions, type RecordOptions } from 'pocketbase'

import pb from '@/lib/pocketbase/client'
import { alocarPagamentoFaturaFifo } from '@/lib/despesas-pipeline'
import type { Categoria, Conta, Lancamento } from '@/types/domain'

const listAll = <T>(collection: string, options?: RecordListOptions) =>
  pb.collection<T>(collection).getFullList({ ...options })

export const financeService = {
  listLancamentos: (options?: RecordListOptions) =>
    listAll<Lancamento>('lancamentos', {
      sort: '-data,-created',
      expand:
        'conta,categoria,empresa,pessoa,cartao_fatura_conta,despesas_ocorrencias_via_lancamento.compromisso',
      ...options,
    }),
  pageLancamentos: (page: number, perPage = 25, options?: RecordListOptions) =>
    pb.collection<Lancamento>('lancamentos').getList(page, perPage, {
      sort: '-data,-created',
      expand:
        'conta,categoria,empresa,pessoa,cartao_fatura_conta,despesas_ocorrencias_via_lancamento.compromisso',
      ...options,
    }),
  saveLancamento: (data: Partial<Lancamento> | FormData, id?: string, options?: RecordOptions) =>
    id
      ? pb.collection<Lancamento>('lancamentos').update(id, data, options)
      : pb.collection<Lancamento>('lancamentos').create(data, options),
  deleteLancamento: (id: string) => pb.collection('lancamentos').delete(id),

  /**
   * Pagar Fatura de Cartão (Quitação Total ou Parcial com Baixa Cronológica):
   * 1. Cria um lançamento de despesa na conta pagadora (saída de caixa) na data do pagamento.
   * 2. Quando itens Detalhados (com data e valor) são fornecidos ou quando valorPago < total,
   *    ordena cronologicamente (mais antigas primeiro) e quita até esgotar o valor pago.
   *    Caso contrário, quita todos os itensIds fornecidos.
   * 3. Marca os itens quitados com fatura_paga = true, fatura_pagamento_id e status = 'pago'.
   * 4. Preserva a idempotência HTTP 404: se o item já foi excluído, segue em frente sem falhar.
   */
  pagarFaturaCartao: async (params: {
    cartaoContaId: string
    competencia: string // 'YYYY-MM'
    valorPago: number
    dataPagamento: string // 'YYYY-MM-DD'
    contaPagadoraId: string
    descricaoFatura: string
    categoriaId?: string
    observacoes?: string
    itensIds?: string[]
    itens?: Array<{ id: string; valor?: number; data?: string; created?: string }>
  }) => {
    // Determinar os itens a serem quitados
    let itensParaQuitarIds: string[] = []

    if (params.itens && params.itens.length > 0) {
      // Ordenação cronológica: mais antigas primeiro
      const itensOrdenados = [...params.itens].sort((a, b) => {
        const dataA = (a.data || a.created || '').slice(0, 10)
        const dataB = (b.data || b.created || '').slice(0, 10)
        if (dataA !== dataB) return dataA.localeCompare(dataB)
        const valA = Number(a.valor) || 0
        const valB = Number(b.valor) || 0
        return valA - valB
      })

      const fifoRes = alocarPagamentoFaturaFifo(
        itensOrdenados.map((it) => ({
          id: it.id,
          valor: Number(it.valor) || 0,
          data: it.data,
          created: it.created,
        })),
        params.valorPago,
      )
      itensParaQuitarIds = fifoRes.itensQuitadosIds
    } else if (params.itensIds && params.itensIds.length > 0) {
      itensParaQuitarIds = [...params.itensIds]
    }

    const obsTexto =
      params.observacoes ||
      `Quitação de ${itensParaQuitarIds.length} compra(s) do ciclo ${params.competencia}`

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
      observacoes: obsTexto,
    })

    // 2. Atualizar as compras do cartão quitadas nesta fatura
    for (const itemId of itensParaQuitarIds) {
      try {
        await pb.collection('lancamentos').update(itemId, {
          fatura_paga: true,
          fatura_pagamento_id: lancamentoPagamento.id,
          status: 'pago',
        })
      } catch (err: any) {
        // Idempotência: se o item já foi excluído do banco (HTTP 404), trata como sucesso/ignora
        // e não interrompe a quitação da fatura nem deixa erro estourar na tela.
        if (
          (err instanceof ClientResponseError && err.status === 404) ||
          err?.status === 404 ||
          err?.response?.status === 404
        ) {
          console.info(
            `Item ${itemId} da fatura já não existe no banco (404) — ignorando como sucesso idempotente.`,
          )
          continue
        }
        console.warn(`Erro ao atualizar item ${itemId} da fatura:`, err)
        throw err
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
      } catch (err: any) {
        if (
          (err instanceof ClientResponseError && err.status === 404) ||
          err?.status === 404 ||
          err?.response?.status === 404
        ) {
          continue
        }
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

  listContas: () => listAll<Conta>('contas', { sort: 'ordem,-ativa,nome' }),
  reordenarContas: async (idsOrdenados: string[]) => {
    await Promise.all(
      idsOrdenados.map((id, index) => pb.collection('contas').update(id, { ordem: index + 1 })),
    )
  },
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
