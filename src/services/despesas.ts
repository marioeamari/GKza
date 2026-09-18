import type { RecordListOptions, RecordOptions } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import type {
  DespesaCompromisso,
  DespesaOcorrencia,
  MetodoPagamento,
  TagItem,
  TipoDespesa,
  TipoDizimo,
} from '@/types/domain'

const listAll = <T>(collection: string, options?: RecordListOptions) =>
  pb.collection<T>(collection).getFullList({ ...options })

export const despesasService = {
  // Tags
  listTags: () => listAll<TagItem>('tags', { sort: 'nome' }),
  saveTag: (data: Partial<TagItem>, id?: string) =>
    id
      ? pb.collection<TagItem>('tags').update(id, data)
      : pb.collection<TagItem>('tags').create(data),
  deleteTag: (id: string) => pb.collection('tags').delete(id),

  // Tipos de Despesa
  listTiposDespesa: () => listAll<TipoDespesa>('tipos_despesa', { sort: 'nome' }),
  saveTipoDespesa: (data: Partial<TipoDespesa>, id?: string) =>
    id
      ? pb.collection<TipoDespesa>('tipos_despesa').update(id, data)
      : pb.collection<TipoDespesa>('tipos_despesa').create(data),
  deleteTipoDespesa: (id: string) => pb.collection('tipos_despesa').delete(id),

  // Métodos de Pagamento
  listMetodosPagamento: () =>
    listAll<MetodoPagamento>('metodos_pagamento', { sort: 'nome', expand: 'conta_padrao' }),
  saveMetodoPagamento: (data: Partial<MetodoPagamento>, id?: string) =>
    id
      ? pb.collection<MetodoPagamento>('metodos_pagamento').update(id, data)
      : pb.collection<MetodoPagamento>('metodos_pagamento').create(data),
  deleteMetodoPagamento: (id: string) => pb.collection('metodos_pagamento').delete(id),

  // Tipos de Dízimo
  listTiposDizimo: () => listAll<TipoDizimo>('tipos_dizimo', { sort: 'nome' }),
  saveTipoDizimo: (data: Partial<TipoDizimo>, id?: string) =>
    id
      ? pb.collection<TipoDizimo>('tipos_dizimo').update(id, data)
      : pb.collection<TipoDizimo>('tipos_dizimo').create(data),
  deleteTipoDizimo: (id: string) => pb.collection('tipos_dizimo').delete(id),

  // Compromissos
  listCompromissos: (options?: RecordListOptions) =>
    listAll<DespesaCompromisso>('despesas_compromisso', {
      sort: '-ativo,descricao',
      expand: 'empresa,pessoa,categoria,tag,tipo_despesa,metodo_pagamento,conta_padrao,tipo_dizimo',
      ...options,
    }),
  saveCompromisso: (data: Partial<DespesaCompromisso>, id?: string, options?: RecordOptions) =>
    id
      ? pb.collection<DespesaCompromisso>('despesas_compromisso').update(id, data, options)
      : pb.collection<DespesaCompromisso>('despesas_compromisso').create(data, options),
  deleteCompromisso: (id: string) => pb.collection('despesas_compromisso').delete(id),

  // Ocorrências
  listOcorrencias: (options?: RecordListOptions) =>
    listAll<DespesaOcorrencia>('despesas_ocorrencias', {
      sort: 'data_vencimento',
      expand:
        'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
      ...options,
    }),
  saveOcorrencia: (data: Partial<DespesaOcorrencia>, id?: string, options?: RecordOptions) =>
    id
      ? pb.collection<DespesaOcorrencia>('despesas_ocorrencias').update(id, data, options)
      : pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create(data, options),
  deleteOcorrencia: (id: string) => pb.collection('despesas_ocorrencias').delete(id),

  /**
   * Baixa uma ocorrência:
   * 1. Atualiza a ocorrência para 'paga' com data_pagamento e valor_pago
   * 2. Cria lançamento financeiro no caixa/banco correspondente
   * 3. Vincula o ID do lançamento na ocorrência
   */
  baixarOcorrencia: async (params: {
    ocorrenciaId: string
    valorPago: number
    dataPagamento: string // 'YYYY-MM-DD'
    contaId: string
    categoriaId?: string
    empresaId?: string
    pessoaId?: string
    observacoes?: string
    descricao: string
  }) => {
    // 1. Criar lançamento de despesa
    const lancamento = await pb.collection('lancamentos').create({
      descricao: params.descricao,
      valor: params.valorPago,
      tipo: 'despesa',
      data: `${params.dataPagamento} 12:00:00`,
      status: 'pago',
      conta: params.contaId,
      categoria: params.categoriaId || null,
      empresa: params.empresaId || null,
      pessoa: params.pessoaId || null,
      observacoes: params.observacoes || 'Baixa automática de despesa recorrente',
    })

    // 2. Atualizar ocorrência
    const ocorr = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').update(
      params.ocorrenciaId,
      {
        status: 'paga',
        valor_pago: params.valorPago,
        data_pagamento: `${params.dataPagamento} 12:00:00`,
        conta: params.contaId,
        lancamento: lancamento.id,
      },
      {
        expand:
          'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
      },
    )

    return { lancamento, ocorrencia: ocorr }
  },

  /**
   * Cancelar/estornar baixa da ocorrência:
   * 1. Remove lançamento financeiro vinculado (se existir)
   * 2. Volta ocorrência para 'prevista'
   */
  estornarBaixa: async (ocorrencia: DespesaOcorrencia) => {
    if (ocorrencia.lancamento) {
      try {
        await pb.collection('lancamentos').delete(ocorrencia.lancamento)
      } catch (e) {
        console.warn('Lançamento já havia sido removido ou não encontrado:', e)
      }
    }

    return pb.collection<DespesaOcorrencia>('despesas_ocorrencias').update(
      ocorrencia.id,
      {
        status: 'prevista',
        valor_pago: 0,
        data_pagamento: null,
        lancamento: null,
      },
      {
        expand:
          'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
      },
    )
  },

  /**
   * Gerador automático de ocorrências para um compromisso recém-criado ou para uma competência específica
   */
  gerarOcorrenciasParaCompromisso: async (
    compromisso: DespesaCompromisso,
    targetCompetencias?: string[],
  ) => {
    const meses =
      targetCompetencias && targetCompetencias.length > 0
        ? targetCompetencias
        : (() => {
            const now = new Date()
            const y = now.getUTCFullYear()
            const m = now.getUTCMonth()
            const list: string[] = []
            for (let i = -1; i <= 3; i++) {
              const d = new Date(Date.UTC(y, m + i, 1))
              list.push(
                `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`,
              )
            }
            return list
          })()

    if (compromisso.regra_repeticao === 'parcelado') {
      const total = compromisso.total_parcelas || 1
      const inicial = compromisso.parcela_inicial || 1
      const startDate = new Date(compromisso.data_inicio)
      const day = compromisso.dia_vencimento || startDate.getUTCDate() || 10

      for (let p = inicial; p <= total; p++) {
        const offset = p - inicial
        const d = new Date(
          Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth() + offset, 1),
        )
        const compStr = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
        const dueDate = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), day, 12, 0, 0))

        const existing = await pb.collection('despesas_ocorrencias').getList(1, 1, {
          filter: `compromisso = '${compromisso.id}' && numero_parcela = ${p}`,
        })

        if (existing.totalItems === 0) {
          await pb.collection('despesas_ocorrencias').create({
            compromisso: compromisso.id,
            contexto_tipo: compromisso.contexto_tipo,
            empresa: compromisso.empresa || null,
            secao: compromisso.secao,
            conta: compromisso.conta_padrao || null,
            competencia: compStr,
            numero_parcela: p,
            total_parcelas: total,
            data_vencimento: dueDate.toISOString(),
            valor_previsto: compromisso.valor_estimado,
            status: 'prevista',
            dizimo: compromisso.dizimo || false,
            tipo_dizimo: compromisso.tipo_dizimo || null,
            link_pagamento: compromisso.link_pagamento || null,
            observacoes: `Parcela ${p}/${total}`,
          })
        }
      }
      return
    }

    if (compromisso.regra_repeticao === 'anual') {
      const startDate = new Date(compromisso.data_inicio)
      const compStr = `${startDate.getUTCFullYear()}-${(startDate.getUTCMonth() + 1).toString().padStart(2, '0')}`
      const existing = await pb.collection('despesas_ocorrencias').getList(1, 1, {
        filter: `compromisso = '${compromisso.id}' && competencia = '${compStr}'`,
      })
      if (existing.totalItems === 0) {
        await pb.collection('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: compromisso.conta_padrao || null,
          competencia: compStr,
          data_vencimento: startDate.toISOString(),
          valor_previsto: compromisso.valor_estimado,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || 'Assinatura anual',
        })
      }
      return
    }

    // Regra mensal: criar para cada mês da lista
    const day = compromisso.dia_vencimento || 10
    for (const compStr of meses) {
      const existing = await pb.collection('despesas_ocorrencias').getList(1, 1, {
        filter: `compromisso = '${compromisso.id}' && competencia = '${compStr}'`,
      })
      if (existing.totalItems === 0) {
        const [yStr, mStr] = compStr.split('-')
        const y = parseInt(yStr, 10)
        const m = parseInt(mStr, 10) - 1
        const dueDate = new Date(Date.UTC(y, m, day, 12, 0, 0))

        await pb.collection('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: compromisso.conta_padrao || null,
          competencia: compStr,
          data_vencimento: dueDate.toISOString(),
          valor_previsto: compromisso.valor_estimado,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || null,
        })
      }
    }
  },
}
