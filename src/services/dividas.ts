/**
 * Serviço de acesso aos dados de Dívidas de Máquinas (PocketBase).
 * TOTALMENTE ISOLADO do financeiro existente:
 * - Não toca em lancamentos, despesas_compromisso, despesas_ocorrencias, contas ou dizimos.
 * - Campo futuro `lancamento_id` presente nas coleções mas inativo por ora.
 */

import pb from '@/lib/pocketbase/client'
import type { DividaRecord, ParcelaRecord, ReceitaRecord, DespesaAvulsaRecord } from '@/lib/dividas'

export interface CreateDividaInput {
  nome: string
  credor: string
  valor_total: number
  data_contratacao: string
  taxa_juros?: number
  taxa_juros_tipo?: 'mensal' | 'anual' | 'total'
  numero_parcelas?: number
  status?: 'ativa' | 'quitada' | 'renegociada'
  saldo_inicial_caixa?: number
  observacoes?: string
}

export interface UpdateDividaInput extends Partial<CreateDividaInput> {
  ativo?: boolean
}

export interface CreateParcelaInput {
  divida: string
  numero: number
  data_vencimento: string
  valor: number
  status?: 'pendente' | 'paga' | 'atrasada'
  data_pagamento?: string
  valor_pago?: number
  is_entrada?: boolean
  observacoes?: string
  lancamento_id?: string
}

export interface UpdateParcelaInput extends Partial<CreateParcelaInput> {}

export interface CreateReceitaInput {
  divida: string
  data: string
  valor: number
  descricao: string
  origem?: string
  observacoes?: string
  lancamento_id?: string
}

export interface UpdateReceitaInput extends Partial<CreateReceitaInput> {}

export interface CreateDespesaAvulsaInput {
  divida: string
  data: string
  valor: number
  descricao?: string
  origem?: string
  observacoes?: string
  lancamento_id?: string
}

export interface UpdateDespesaAvulsaInput extends Partial<CreateDespesaAvulsaInput> {}

export const dividasService = {
  // --- DÍVIDAS ---
  async listDividas(): Promise<DividaRecord[]> {
    const records = await pb.collection('dividas').getFullList<DividaRecord>({
      sort: '-created',
    })
    return records
  },

  async getDivida(id: string): Promise<DividaRecord> {
    return await pb.collection('dividas').getOne<DividaRecord>(id)
  },

  async createDivida(input: CreateDividaInput): Promise<DividaRecord> {
    return await pb.collection('dividas').create<DividaRecord>({
      ...input,
      status: input.status || 'ativa',
      saldo_inicial_caixa: input.saldo_inicial_caixa || 0,
      ativo: true,
    })
  },

  async updateDivida(id: string, input: UpdateDividaInput): Promise<DividaRecord> {
    return await pb.collection('dividas').update<DividaRecord>(id, input)
  },

  async deleteDivida(id: string): Promise<boolean> {
    return await pb.collection('dividas').delete(id)
  },

  // --- PARCELAS ---
  async listParcelas(dividaId?: string): Promise<ParcelaRecord[]> {
    const filter = dividaId ? `divida = '${dividaId}'` : ''
    return await pb.collection('dividas_parcelas').getFullList<ParcelaRecord>({
      filter: filter || undefined,
      sort: 'numero,data_vencimento',
    })
  },

  async createParcela(input: CreateParcelaInput): Promise<ParcelaRecord> {
    return await pb.collection('dividas_parcelas').create<ParcelaRecord>({
      ...input,
      status: input.status || 'pendente',
      is_entrada: Boolean(input.is_entrada),
    })
  },

  async createParcelasLote(parcelas: CreateParcelaInput[]): Promise<ParcelaRecord[]> {
    const results: ParcelaRecord[] = []
    for (const p of parcelas) {
      const created = await this.createParcela(p)
      results.push(created)
    }
    return results
  },

  async updateParcela(id: string, input: UpdateParcelaInput): Promise<ParcelaRecord> {
    return await pb.collection('dividas_parcelas').update<ParcelaRecord>(id, input)
  },

  async marcarPagamentoManual(
    id: string,
    paga: boolean,
    dados?: { data_pagamento?: string; valor_pago?: number; valor_previsto?: number },
  ): Promise<ParcelaRecord> {
    if (paga) {
      let valorFinal = dados?.valor_pago
      // Se não foi explicitamente informado um valor pago positivo, busca o valor previsto
      if (valorFinal === undefined || valorFinal === null || valorFinal <= 0) {
        if (dados?.valor_previsto && dados.valor_previsto > 0) {
          valorFinal = dados.valor_previsto
        } else {
          // Fallback seguro: busca o registro atual para pegar o valor previsto
          try {
            const atual = await pb.collection('dividas_parcelas').getOne<ParcelaRecord>(id)
            valorFinal = atual.valor
          } catch {
            valorFinal = dados?.valor_previsto || 0
          }
        }
      }

      return await pb.collection('dividas_parcelas').update<ParcelaRecord>(id, {
        status: 'paga',
        data_pagamento: dados?.data_pagamento || new Date().toISOString().slice(0, 10),
        valor_pago: valorFinal,
      })
    } else {
      return await pb.collection('dividas_parcelas').update<ParcelaRecord>(id, {
        status: 'pendente',
        data_pagamento: null,
        valor_pago: null,
      })
    }
  },

  async deleteParcela(id: string): Promise<boolean> {
    return await pb.collection('dividas_parcelas').delete(id)
  },

  // Substituição de cronograma (usado em renegociação ou redefinição)
  async substituirCronogramaRestante(
    dividaId: string,
    parcelasParaExcluirIds: string[],
    novasParcelas: CreateParcelaInput[],
  ): Promise<void> {
    for (const id of parcelasParaExcluirIds) {
      try {
        await pb.collection('dividas_parcelas').delete(id)
      } catch (err) {
        console.warn(`Falha ao excluir parcela ${id}:`, err)
      }
    }
    for (const np of novasParcelas) {
      await pb.collection('dividas_parcelas').create({
        ...np,
        divida: dividaId,
        status: np.status || 'pendente',
      })
    }
  },

  // --- RECEITAS POR MÁQUINA ---
  async listReceitas(dividaId?: string): Promise<ReceitaRecord[]> {
    const filter = dividaId ? `divida = '${dividaId}'` : ''
    return await pb.collection('dividas_receitas').getFullList<ReceitaRecord>({
      filter: filter || undefined,
      sort: '-data',
    })
  },

  async createReceita(input: CreateReceitaInput): Promise<ReceitaRecord> {
    return await pb.collection('dividas_receitas').create<ReceitaRecord>(input)
  },

  async updateReceita(id: string, input: UpdateReceitaInput): Promise<ReceitaRecord> {
    return await pb.collection('dividas_receitas').update<ReceitaRecord>(id, input)
  },

  async deleteReceita(id: string): Promise<boolean> {
    return await pb.collection('dividas_receitas').delete(id)
  },

  // --- DESPESAS AVULSAS POR MÁQUINA ---
  async listDespesas(dividaId?: string): Promise<DespesaAvulsaRecord[]> {
    const filter = dividaId ? `divida = '${dividaId}'` : ''
    return await pb.collection('dividas_despesas').getFullList<DespesaAvulsaRecord>({
      filter: filter || undefined,
      sort: '-data',
    })
  },

  async createDespesa(input: CreateDespesaAvulsaInput): Promise<DespesaAvulsaRecord> {
    return await pb.collection('dividas_despesas').create<DespesaAvulsaRecord>(input)
  },

  async updateDespesa(id: string, input: UpdateDespesaAvulsaInput): Promise<DespesaAvulsaRecord> {
    return await pb.collection('dividas_despesas').update<DespesaAvulsaRecord>(id, input)
  },

  async deleteDespesa(id: string): Promise<boolean> {
    return await pb.collection('dividas_despesas').delete(id)
  },
}
