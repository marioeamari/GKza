import { ClientResponseError, type RecordListOptions, type RecordOptions } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import { calcularFaturaCartao } from '@/lib/cartao-fatura'
import type {
  Conta,
  ContaTipoPagamento,
  ContextoTipo,
  DespesaCompromisso,
  DespesaOcorrencia,
  MetodoPagamento,
  SecaoDespesa,
  TagItem,
  TipoDespesa,
  TipoDizimo,
  ConfigCalculo,
  TipoCalculoDizimo,
} from '@/types/domain'
import { CONTA_TIPOS_PAGAMENTO_FALLBACK } from '@/types/domain'

/**
 * Verifica se a conta aceita pagamentos via Crédito (baseado exclusivamente em tipos_pagamento)
 */
export const contaAceitaCredito = (conta?: Conta | null): boolean => {
  if (!conta) return false
  const tipos =
    conta.tipos_pagamento && conta.tipos_pagamento.length > 0
      ? conta.tipos_pagamento
      : CONTA_TIPOS_PAGAMENTO_FALLBACK[conta.tipo] || []
  return tipos.includes('credito')
}

/**
 * Identifica se um método de pagamento corresponde à modalidade Crédito.
 * Aceita objeto MetodoPagamento, ID do método (com metodosList opcional para lookup) ou string com código/nome.
 * Identifica crédito por:
 * - código 'Credito' ou 'cartao_credito' (case insensitive)
 * - nome contendo 'crédito' ou 'credito' (excluindo 'débito' / 'debito')
 * - tipo 'cartao' ou 'credito' desde que o nome/código NÃO contenha débito
 */
export const isMetodoCredito = (
  metodo?: MetodoPagamento | string | null,
  metodosList?: MetodoPagamento[],
): boolean => {
  if (!metodo) return false

  let metodoObj: MetodoPagamento | undefined

  if (typeof metodo === 'object') {
    metodoObj = metodo
  } else if (typeof metodo === 'string') {
    if (metodosList && metodosList.length > 0) {
      metodoObj = metodosList.find((m) => m.id === metodo || m.codigo === metodo)
    }
  }

  const codigo = (metodoObj ? metodoObj.codigo : typeof metodo === 'string' ? metodo : '') || ''
  const nome = (metodoObj ? metodoObj.nome : typeof metodo === 'string' ? metodo : '') || ''
  const tipo = (metodoObj ? metodoObj.tipo : '') || ''

  const cLower = codigo.toLowerCase().trim()
  const nLower = nome.toLowerCase().trim()
  const tLower = tipo.toLowerCase().trim()

  // Se explicitamente falar em débito, nunca é crédito
  if (nLower.includes('débito') || nLower.includes('debito') || cLower.includes('debito')) {
    return false
  }

  // Código conhecido
  if (
    cLower === 'credito' ||
    cLower === 'cartao_credito' ||
    cLower === 'cartao-credito' ||
    cLower === 'cartaocredito'
  ) {
    return true
  }

  // Nome contém crédito/credito
  if (nLower.includes('crédito') || nLower.includes('credito')) {
    return true
  }

  // Tipo 'cartao' sem débito (e que não seja pix/boleto/transferencia/dinheiro)
  if (tLower === 'cartao' || tLower === 'credito') {
    return true
  }

  return false
}

const listAll = async <T>(collection: string, options?: RecordListOptions): Promise<T[]> => {
  return pb.collection<T>(collection).getFullList<T>({ batch: 200, ...options })
}

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

  // Configurações de Cálculos (Dízimo, Oferta, Primícias)
  listConfigCalculos: () => listAll<ConfigCalculo>('config_calculos', { sort: 'tipo' }),
  getConfigCalculo: async (tipo: TipoCalculoDizimo): Promise<ConfigCalculo | null> => {
    try {
      const records = await pb.collection<ConfigCalculo>('config_calculos').getList(1, 1, {
        filter: `tipo = '${tipo}'`,
      })
      return records.items[0] || null
    } catch {
      return null
    }
  },
  saveConfigCalculo: async (
    tipo: TipoCalculoDizimo,
    data: { percentual?: number; descricao?: string },
  ) => {
    const existing = await despesasService.getConfigCalculo(tipo)
    if (existing) {
      return pb.collection<ConfigCalculo>('config_calculos').update(existing.id, data)
    }
    return pb.collection<ConfigCalculo>('config_calculos').create({ tipo, ...data })
  },

  // Compromissos
  listCompromissos: (options?: RecordListOptions) =>
    listAll<DespesaCompromisso>('despesas_compromisso', {
      sort: '-ativo,descricao',
      expand:
        'empresa,pessoa,titular_pessoa,titular_empresa,categoria,tag,tipo_despesa,metodo_pagamento,conta_padrao,tipo_dizimo',
      ...options,
    }),
  saveCompromisso: (
    data: Partial<DespesaCompromisso> | FormData,
    id?: string,
    options?: RecordOptions,
  ) => {
    // Se for FormData, sanitiza regra_repeticao se necessário
    if (data instanceof FormData) {
      const regra = data.get('regra_repeticao')
      const mod = data.get('modalidade_parcelamento')
      if (regra === 'parcelado' || mod === 'parcelado') {
        data.set('regra_repeticao', 'mensal')
      }
      return id
        ? pb.collection<DespesaCompromisso>('despesas_compromisso').update(id, data, options)
        : pb.collection<DespesaCompromisso>('despesas_compromisso').create(data, options)
    }

    // Sanitização de segurança: a collection despesas_compromisso só aceita 'mensal' | 'anual' | 'avulso'
    // no campo regra_repeticao. Se vier 'parcelado' ou se modalidade_parcelamento for 'parcelado',
    // regra_repeticao deve ser 'mensal'.
    const sanitizedData = { ...data }
    if (
      sanitizedData.regra_repeticao === ('parcelado' as any) ||
      sanitizedData.modalidade_parcelamento === 'parcelado'
    ) {
      sanitizedData.regra_repeticao = 'mensal'
    }
    return id
      ? pb.collection<DespesaCompromisso>('despesas_compromisso').update(id, sanitizedData, options)
      : pb.collection<DespesaCompromisso>('despesas_compromisso').create(sanitizedData, options)
  },
  deleteCompromisso: async (id: string) => {
    try {
      return await pb.collection('despesas_compromisso').delete(id)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) {
        // Idempotência: o registro já não existe mais no backend (excluído anteriormente ou por cascata)
        return true
      }
      throw err
    }
  },

  /**
   * Altera o status ativo de um compromisso (desativar ou reativar).
   * Opcionalmente, ao desativar, exclui em lote todas as ocorrências com status 'prevista' (não pagas),
   * preservando rigorosamente as ocorrências já pagas e lançamentos associados.
   */
  setCompromissoAtivo: async (params: {
    compromissoId: string
    ativo: boolean
    excluirPrevistas?: boolean
  }) => {
    const { compromissoId, ativo, excluirPrevistas = false } = params

    // 1. Atualiza o status ativo do compromisso
    const compromissoAtualizado = await pb
      .collection<DespesaCompromisso>('despesas_compromisso')
      .update(compromissoId, { ativo })

    let ocorrenciasExcluidas = 0

    // 2. Se for desativação e o usuário optou por excluir ocorrências previstas futuras
    if (!ativo && excluirPrevistas) {
      try {
        const ocorrenciasPrevistas = await listAll<DespesaOcorrencia>('despesas_ocorrencias', {
          filter: `compromisso = '${compromissoId}' && status = 'prevista'`,
        })

        // Exclusão sequencial das previstas (sem tocar em pagas)
        for (const oc of ocorrenciasPrevistas) {
          if (oc.status === 'prevista' && !oc.data_pagamento) {
            try {
              await pb.collection('despesas_ocorrencias').delete(oc.id)
            } catch (delErr) {
              if (delErr instanceof ClientResponseError && delErr.status === 404) {
                // Já excluído, ignora
              } else {
                throw delErr
              }
            }
            ocorrenciasExcluidas++
          }
        }
      } catch (err) {
        console.warn(
          `[setCompromissoAtivo] Falha ao excluir ocorrências previstas do compromisso ${compromissoId}:`,
          err,
        )
      }
    }

    return { compromisso: compromissoAtualizado, ocorrenciasExcluidas }
  },

  // Ocorrências
  listOcorrencias: (options?: RecordListOptions) =>
    listAll<DespesaOcorrencia>('despesas_ocorrencias', {
      sort: 'data_vencimento',
      expand:
        'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,compromisso.titular_pessoa,compromisso.titular_empresa,compromisso.conta_padrao,conta,tipo_dizimo,lancamento',
      ...options,
    }),
  saveOcorrencia: (data: Partial<DespesaOcorrencia>, id?: string, options?: RecordOptions) =>
    id
      ? pb.collection<DespesaOcorrencia>('despesas_ocorrencias').update(id, data, options)
      : pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create(data, options),
  atualizarOcorrencia: (id: string, data: Partial<DespesaOcorrencia>, options?: RecordOptions) =>
    pb.collection<DespesaOcorrencia>('despesas_ocorrencias').update(id, data, options),
  deleteOcorrencia: async (id: string) => {
    // Busca a ocorrência para verificar se há lançamento financeiro vinculado
    try {
      const oc = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').getOne(id)
      if (oc.lancamento) {
        try {
          await pb.collection('lancamentos').delete(oc.lancamento)
        } catch (e) {
          if (e instanceof ClientResponseError && e.status === 404) {
            // Lançamento já não existe
          } else {
            console.warn('Lançamento vinculado já havia sido removido ou não encontrado:', e)
          }
        }
      }
    } catch (e) {
      if (e instanceof ClientResponseError && e.status === 404) {
        // A própria ocorrência não existe mais
        return true
      }
      console.warn('Ocorrência não encontrada antes de excluir:', e)
    }

    try {
      return await pb.collection('despesas_ocorrencias').delete(id)
    } catch (err) {
      if (err instanceof ClientResponseError && err.status === 404) {
        // Idempotência: ocorrência já excluída
        return true
      }
      throw err
    }
  },

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
    comprovanteArquivo?: File | null
    descricao: string
  }) => {
    // Verifica se a conta escolhida para baixa é do tipo 'cartao'
    let isCartao = false
    let contaObj: Conta | null = null
    try {
      contaObj = await pb.collection<Conta>('contas').getOne(params.contaId)
      isCartao = contaObj.tipo === 'cartao'
    } catch {
      /* intentionally ignored */
    }

    // Busca dados prévios da ocorrência para conferir o método de pagamento
    const ocorrAtual = await pb
      .collection<DespesaOcorrencia>('despesas_ocorrencias')
      .getOne(params.ocorrenciaId)

    const metodoCompId =
      typeof ocorrAtual.compromisso === 'object' && ocorrAtual.compromisso !== null
        ? (ocorrAtual.compromisso as any).metodo_pagamento
        : null
    // REGRA v0.0.128: APENAS o método Crédito entra no ciclo da fatura do cartão
    const metodoEfetivoEhCredito = isCartao && isMetodoCredito(metodoCompId)

    let lancamentoId: string | null = null
    let lancamento: any = null

    // Montagem dos dados do lançamento (usando FormData se houver comprovante)
    if (metodoEfetivoEhCredito && contaObj) {
      // Para cartão de crédito: a despesa entra na fatura do cartão referente ao ciclo.
      // O lançamento financeiro é criado como pendente de fatura (sem saída imediata de caixa)
      // até que a fatura inteira seja baixada/paga.
      const ciclo = calcularFaturaCartao(contaObj, params.dataPagamento)

      if (params.comprovanteArquivo) {
        const fd = new FormData()
        fd.append('descricao', params.descricao)
        fd.append('valor', String(params.valorPago))
        fd.append('tipo', 'despesa')
        fd.append('data', `${params.dataPagamento} 12:00:00`)
        fd.append('status', 'pendente')
        fd.append('conta', params.contaId)
        if (params.categoriaId) fd.append('categoria', params.categoriaId)
        if (params.empresaId) fd.append('empresa', params.empresaId)
        if (params.pessoaId) fd.append('pessoa', params.pessoaId)
        fd.append('competencia', ciclo.competencia)
        fd.append('fatura_paga', 'false')
        fd.append(
          'observacoes',
          params.observacoes ||
            `Despesa no cartão ${contaObj.nome} (integrada à fatura de ${ciclo.competencia})`,
        )
        fd.append('comprovante', params.comprovanteArquivo)
        lancamento = await pb.collection('lancamentos').create(fd)
      } else {
        lancamento = await pb.collection('lancamentos').create({
          descricao: params.descricao,
          valor: params.valorPago,
          tipo: 'despesa',
          data: `${params.dataPagamento} 12:00:00`,
          status: 'pendente',
          conta: params.contaId,
          categoria: params.categoriaId || null,
          empresa: params.empresaId || null,
          pessoa: params.pessoaId || null,
          competencia: ciclo.competencia,
          fatura_paga: false,
          observacoes:
            params.observacoes ||
            `Despesa no cartão ${contaObj.nome} (integrada à fatura de ${ciclo.competencia})`,
        })
      }
      lancamentoId = lancamento.id
    } else {
      // 1. Criar lançamento de despesa convencional com saída de caixa
      if (params.comprovanteArquivo) {
        const fd = new FormData()
        fd.append('descricao', params.descricao)
        fd.append('valor', String(params.valorPago))
        fd.append('tipo', 'despesa')
        fd.append('data', `${params.dataPagamento} 12:00:00`)
        fd.append('status', 'pago')
        fd.append('conta', params.contaId)
        if (params.categoriaId) fd.append('categoria', params.categoriaId)
        if (params.empresaId) fd.append('empresa', params.empresaId)
        if (params.pessoaId) fd.append('pessoa', params.pessoaId)
        fd.append('competencia', params.dataPagamento.slice(0, 7))
        fd.append('observacoes', params.observacoes || 'Baixa automática de despesa recorrente')
        fd.append('comprovante', params.comprovanteArquivo)
        lancamento = await pb.collection('lancamentos').create(fd)
      } else {
        lancamento = await pb.collection('lancamentos').create({
          descricao: params.descricao,
          valor: params.valorPago,
          tipo: 'despesa',
          data: `${params.dataPagamento} 12:00:00`,
          status: 'pago',
          conta: params.contaId,
          categoria: params.categoriaId || null,
          empresa: params.empresaId || null,
          pessoa: params.pessoaId || null,
          competencia: params.dataPagamento.slice(0, 7),
          observacoes: params.observacoes || 'Baixa automática de despesa recorrente',
        })
      }
      lancamentoId = lancamento.id
    }

    // 2. Atualizar ocorrência (permitindo ajustar valor real da ocorrência sem afetar as demais)
    const diferencaValor = params.valorPago !== ocorrAtual.valor_previsto

    // Se a ocorrência foi paga com data retroativa diferente de sua competência original,
    // atualizamos a competência se for uma assinatura ou ajuste manual correspondente
    const compDataPag = params.dataPagamento.slice(0, 7)

    // Se a conta for tipo cartão E a despesa for de método crédito, calcula o ciclo da fatura para a dataPagamento informada.
    // REGRA v0.0.128: APENAS compras/despesas no método Crédito seguem o ciclo da fatura do cartão.
    // Pix, Débito, Transferência, Boletos e Dinheiro mantêm competência = mês da despesa (compDataPag).
    let cardCicloCompetencia: string | null = null
    let cardCicloVencimentoIso: string | null = null

    if (metodoEfetivoEhCredito && contaObj) {
      const ciclo = calcularFaturaCartao(contaObj, params.dataPagamento)
      if (ciclo.competencia !== ocorrAtual.competencia) {
        // Verifica se já não existe outra ocorrência para o mesmo compromisso ocupando essa competência
        const compromissoId =
          typeof ocorrAtual.compromisso === 'object' && ocorrAtual.compromisso !== null
            ? (ocorrAtual.compromisso as any).id
            : ocorrAtual.compromisso

        let ocupada = false
        if (compromissoId) {
          try {
            const conflito = await pb.collection('despesas_ocorrencias').getList(1, 1, {
              filter: `compromisso = '${compromissoId}' && competencia = '${ciclo.competencia}' && id != '${params.ocorrenciaId}'`,
            })
            if (conflito.totalItems > 0) {
              ocupada = true
            }
          } catch {
            /* ignore */
          }
        }

        if (!ocupada) {
          cardCicloCompetencia = ciclo.competencia
          cardCicloVencimentoIso = `${ciclo.dataVencimento}T12:00:00.000Z`
        }
      }
    }

    // REGRA DE PRODUTO (vencimento retroativo para NÃO crédito):
    // Para métodos de pagamento imediato (tudo que NÃO é crédito), o vencimento de uma
    // ocorrência paga nunca pode ser posterior ao mês do pagamento.
    // Se a data_vencimento atual for de mês posterior ao pagamento, recalcular o vencimento
    // no mês do pagamento usando o dia_vencimento do compromisso vinculado (clamp ao último dia do mês).
    let naoCreditoVencimentoAjustadoIso: string | null = null
    if (!metodoEfetivoEhCredito) {
      const mesVencAtual = (ocorrAtual.data_vencimento || '').slice(0, 7)
      if (mesVencAtual && mesVencAtual > compDataPag) {
        const [pAnoStr, pMesStr] = compDataPag.split('-')
        const pAno = parseInt(pAnoStr, 10)
        const pMesZero = parseInt(pMesStr, 10) - 1

        let diaCompromisso = 10
        if (typeof ocorrAtual.compromisso === 'object' && ocorrAtual.compromisso !== null) {
          diaCompromisso = (ocorrAtual.compromisso as any).dia_vencimento || 10
        } else if (ocorrAtual.compromisso) {
          try {
            const c = await pb
              .collection<DespesaCompromisso>('despesas_compromisso')
              .getOne(ocorrAtual.compromisso)
            diaCompromisso = c.dia_vencimento || 10
          } catch {
            /* ignore */
          }
        }

        const dataVenc = despesasService.calcularDataVencimentoNoMes(pAno, pMesZero, diaCompromisso)
        naoCreditoVencimentoAjustadoIso = dataVenc.toISOString()
      }
    }

    let ocorr: DespesaOcorrencia
    if (params.comprovanteArquivo) {
      const fdOcorr = new FormData()
      fdOcorr.append('status', 'paga')
      fdOcorr.append('valor_pago', String(params.valorPago))
      fdOcorr.append('valor_previsto', String(params.valorPago))
      fdOcorr.append('valor_ajustado_manualmente', String(diferencaValor))
      fdOcorr.append('data_pagamento', `${params.dataPagamento} 12:00:00`)
      fdOcorr.append('conta', params.contaId)
      if (lancamentoId) fdOcorr.append('lancamento', lancamentoId)
      if (cardCicloCompetencia && cardCicloVencimentoIso) {
        fdOcorr.append('competencia', cardCicloCompetencia)
        fdOcorr.append('data_vencimento', cardCicloVencimentoIso)
      } else {
        if (
          compDataPag &&
          compDataPag !== ocorrAtual.competencia &&
          (ocorrAtual.secao === 'assinaturas_anuais' || !metodoEfetivoEhCredito)
        ) {
          fdOcorr.append('competencia', compDataPag)
        }
        if (naoCreditoVencimentoAjustadoIso) {
          fdOcorr.append('data_vencimento', naoCreditoVencimentoAjustadoIso)
        }
      }
      fdOcorr.append('comprovante_pagamento', params.comprovanteArquivo)

      ocorr = await pb
        .collection<DespesaOcorrencia>('despesas_ocorrencias')
        .update(params.ocorrenciaId, fdOcorr, {
          expand:
            'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
        })
    } else {
      const updatesOcorr: Partial<DespesaOcorrencia> = {
        status: 'paga',
        valor_pago: params.valorPago,
        valor_previsto: params.valorPago, // valor real da ocorrência atualizado sem mudar as demais
        valor_ajustado_manualmente: diferencaValor,
        data_pagamento: `${params.dataPagamento} 12:00:00`,
        conta: params.contaId,
        lancamento: lancamentoId,
      }

      if (cardCicloCompetencia && cardCicloVencimentoIso) {
        updatesOcorr.competencia = cardCicloCompetencia
        updatesOcorr.data_vencimento = cardCicloVencimentoIso
      } else {
        if (
          compDataPag &&
          compDataPag !== ocorrAtual.competencia &&
          (ocorrAtual.secao === 'assinaturas_anuais' || !metodoEfetivoEhCredito)
        ) {
          updatesOcorr.competencia = compDataPag
        }
        if (naoCreditoVencimentoAjustadoIso) {
          updatesOcorr.data_vencimento = naoCreditoVencimentoAjustadoIso
        }
      }

      ocorr = await pb
        .collection<DespesaOcorrencia>('despesas_ocorrencias')
        .update(params.ocorrenciaId, updatesOcorr, {
          expand:
            'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
        })
    }

    return { lancamento, ocorrencia: ocorr }
  },

  /**
   * Registra um pagamento (retroativo ou pontual) para um compromisso (especialmente anual),
   * criando diretamente a ocorrência com status 'paga' e o respectivo lançamento financeiro.
   */
  registrarPagamentoCompromisso: async (params: {
    compromissoId: string
    valorPago: number
    dataPagamento: string // 'YYYY-MM-DD'
    contaId: string
    categoriaId?: string
    empresaId?: string
    pessoaId?: string
    observacoes?: string
    comprovanteArquivo?: File | null
    descricao: string
    secao?: SecaoDespesa
    contextoTipo?: ContextoTipo
    dizimo?: boolean
    tipoDizimoId?: string
    direcionamento?: string
  }) => {
    const compStr = params.dataPagamento.slice(0, 7) // 'YYYY-MM'

    // 1. Criar lançamento financeiro
    let lancamento: any
    if (params.comprovanteArquivo) {
      const fdLanc = new FormData()
      fdLanc.append('descricao', params.descricao)
      fdLanc.append('valor', String(params.valorPago))
      fdLanc.append('tipo', 'despesa')
      fdLanc.append('data', `${params.dataPagamento} 12:00:00`)
      fdLanc.append('status', 'pago')
      fdLanc.append('conta', params.contaId)
      if (params.categoriaId) fdLanc.append('categoria', params.categoriaId)
      if (params.empresaId) fdLanc.append('empresa', params.empresaId)
      if (params.pessoaId) fdLanc.append('pessoa', params.pessoaId)
      fdLanc.append(
        'observacoes',
        params.observacoes || 'Pagamento registrado diretamente de compromisso',
      )
      fdLanc.append('comprovante', params.comprovanteArquivo)
      lancamento = await pb.collection('lancamentos').create(fdLanc)
    } else {
      lancamento = await pb.collection('lancamentos').create({
        descricao: params.descricao,
        valor: params.valorPago,
        tipo: 'despesa',
        data: `${params.dataPagamento} 12:00:00`,
        status: 'pago',
        conta: params.contaId,
        categoria: params.categoriaId || null,
        empresa: params.empresaId || null,
        pessoa: params.pessoaId || null,
        observacoes: params.observacoes || 'Pagamento registrado diretamente de compromisso',
      })
    }

    // 2. Criar ocorrência já como 'paga'
    // REGRA DE PRODUTO: para métodos de pagamento imediato (tudo que NÃO é crédito),
    // o vencimento nunca pode ser posterior ao mês do pagamento.
    // Se o compromisso tem dia_vencimento, usamos o dia_vencimento no mês do pagamento (clamp ao último dia do mês).
    // Caso contrário (ou fallback), usamos a própria data do pagamento.
    let vencimentoRegistradoIso = `${params.dataPagamento} 12:00:00.000Z`
    try {
      const compRecord = await pb
        .collection<DespesaCompromisso>('despesas_compromisso')
        .getOne(params.compromissoId)
      const diaComp = compRecord.dia_vencimento || 10
      const [pAnoStr, pMesStr] = compStr.split('-')
      const pAno = parseInt(pAnoStr, 10)
      const pMesZero = parseInt(pMesStr, 10) - 1
      const dataVenc = despesasService.calcularDataVencimentoNoMes(pAno, pMesZero, diaComp)
      vencimentoRegistradoIso = dataVenc.toISOString()
    } catch {
      /* fallback para params.dataPagamento */
    }

    let ocorrencia: DespesaOcorrencia
    if (params.comprovanteArquivo) {
      const fdOcorr = new FormData()
      fdOcorr.append('compromisso', params.compromissoId)
      fdOcorr.append('contexto_tipo', params.contextoTipo || 'pessoal')
      if (params.empresaId) fdOcorr.append('empresa', params.empresaId)
      fdOcorr.append('secao', params.secao || 'assinaturas_anuais')
      fdOcorr.append('conta', params.contaId)
      fdOcorr.append('competencia', compStr)
      fdOcorr.append('data_vencimento', vencimentoRegistradoIso)
      fdOcorr.append('data_pagamento', `${params.dataPagamento} 12:00:00`)
      fdOcorr.append('valor_previsto', String(params.valorPago))
      fdOcorr.append('valor_pago', String(params.valorPago))
      fdOcorr.append('valor_estimado_original', String(params.valorPago))
      fdOcorr.append('valor_ajustado_manualmente', 'false')
      fdOcorr.append('status', 'paga')
      fdOcorr.append('lancamento', lancamento.id)
      fdOcorr.append('dizimo', String(params.dizimo || false))
      if (params.tipoDizimoId) fdOcorr.append('tipo_dizimo', params.tipoDizimoId)
      if (params.direcionamento) fdOcorr.append('direcionamento', params.direcionamento)
      if (params.observacoes) fdOcorr.append('observacoes', params.observacoes)
      fdOcorr.append('comprovante_pagamento', params.comprovanteArquivo)

      ocorrencia = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create(fdOcorr, {
        expand:
          'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
      })
    } else {
      ocorrencia = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create(
        {
          compromisso: params.compromissoId,
          contexto_tipo: params.contextoTipo || 'pessoal',
          empresa: params.empresaId || null,
          secao: params.secao || 'assinaturas_anuais',
          conta: params.contaId,
          competencia: compStr,
          data_vencimento: vencimentoRegistradoIso,
          data_pagamento: `${params.dataPagamento} 12:00:00`,
          valor_previsto: params.valorPago,
          valor_pago: params.valorPago,
          valor_estimado_original: params.valorPago,
          valor_ajustado_manualmente: false,
          status: 'paga',
          lancamento: lancamento.id,
          dizimo: params.dizimo || false,
          tipo_dizimo: params.tipoDizimoId || null,
          direcionamento: params.direcionamento || null,
          observacoes: params.observacoes || null,
        },
        {
          expand:
            'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,compromisso.titular_pessoa,compromisso.titular_empresa,compromisso.conta_padrao,conta,tipo_dizimo,lancamento',
        },
      )
    }

    return { lancamento, ocorrencia }
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
   * Helper para calcular a data de vencimento tratando explicitamente meses mais curtos (dias 29, 30 e 31).
   * Ex: dia 31 em fevereiro cai no último dia de fevereiro (28 ou 29).
   */
  calcularDataVencimentoNoMes: (ano: number, mesZeroIndex: number, diaDesejado: number): Date => {
    // Último dia do mês alvo: new Date(Date.UTC(ano, mesZeroIndex + 1, 0)).getUTCDate()
    const ultimoDiaDoMes = new Date(Date.UTC(ano, mesZeroIndex + 1, 0)).getUTCDate()
    const diaReal = Math.min(diaDesejado, ultimoDiaDoMes)
    return new Date(Date.UTC(ano, mesZeroIndex, diaReal, 12, 0, 0))
  },

  /**
   * Helper para obter a conta do tipo cartão/crédito vinculada a um compromisso,
   * checando primeiro compromisso.conta_padrao e, secundariamente, via compromisso.metodo_pagamento.
   * Considera conta de crédito quando contaAceitaCredito(c) && !!c.dia_fechamento.
   */
  obterContaCartaoCompromisso: async (
    compromisso: Pick<DespesaCompromisso, 'conta_padrao' | 'metodo_pagamento'>,
  ): Promise<Conta | null> => {
    // REGRA NOVA: O ciclo da fatura só se aplica quando o método do compromisso é Crédito.
    // Se o método estiver definido e não for crédito (ex: Pix, Débito, Boleto, Transferência),
    // a despesa NÃO entra no ciclo da fatura nem vira cartão_credito.
    if (!compromisso.metodo_pagamento) {
      return null
    }

    let metodoObj: MetodoPagamento | null = null
    try {
      metodoObj = await pb
        .collection<MetodoPagamento>('metodos_pagamento')
        .getOne(compromisso.metodo_pagamento, { expand: 'conta_padrao' })
    } catch {
      /* ignore */
    }

    if (!isMetodoCredito(metodoObj || compromisso.metodo_pagamento)) {
      return null
    }

    const isContaCredito = (c: Conta | null | undefined): boolean => {
      return !!c && contaAceitaCredito(c) && !!c.dia_fechamento
    }

    if (compromisso.conta_padrao) {
      try {
        const c = await pb.collection<Conta>('contas').getOne(compromisso.conta_padrao)
        if (isContaCredito(c)) {
          return c
        }
      } catch {
        /* ignore */
      }
    }

    if (metodoObj) {
      if (metodoObj.expand?.conta_padrao && isContaCredito(metodoObj.expand.conta_padrao)) {
        return metodoObj.expand.conta_padrao
      }
      if (metodoObj.conta_padrao) {
        try {
          const c = await pb.collection<Conta>('contas').getOne(metodoObj.conta_padrao)
          if (isContaCredito(c)) {
            return c
          }
        } catch {
          /* ignore */
        }
      }
    }

    return null
  },

  /**
   * Gerador automático de ocorrências para um compromisso recém-criado ou para uma competência específica
   */
  /**
   * Atualiza as ocorrências pendentes (status 'prevista') de um compromisso quando ele é editado.
   * Regras:
   * 1. Apenas ocorrências com status 'prevista' são atualizadas. Ocorrências já pagas (status 'paga')
   *    não são alteradas retroativamente (histórico preservado).
   * 2. Ocorrências onde o usuário ajustou o valor manualmente (valor_ajustado_manualmente === true)
   *    NÃO são sobrescritas, preservando ajustes pontuais (ex: contas de luz/gás/valor variável).
   * 3. Sincroniza valor_previsto e valor_estimado_original para o novo valor unitário:
   *    - Para parcelados: compromisso.valor_parcela se definido e > 0, senão compromisso.valor_estimado.
   *    - Para não parcelados: compromisso.valor_estimado.
   * 4. Sincroniza metadados gerais em aberto (conta_padrao, secao, empresa, contexto_tipo, dizimo,
   *    tipo_dizimo, link_pagamento) e, se o dia de vencimento mudou, recalcula as datas de vencimento
   *    das ocorrências previstas.
   */
  sincronizarOcorrenciasCompromisso: async (compromisso: DespesaCompromisso) => {
    const isParcelado =
      compromisso.modalidade_parcelamento === 'parcelado' ||
      compromisso.regra_repeticao === 'parcelado'

    const novoValorUnitario =
      isParcelado && compromisso.valor_parcela && compromisso.valor_parcela > 0
        ? compromisso.valor_parcela
        : compromisso.valor_estimado

    // Busca todas as ocorrências deste compromisso que ainda estão previstas
    const ocorrenciasPrevistas = await listAll<DespesaOcorrencia>('despesas_ocorrencias', {
      filter: `compromisso = '${compromisso.id}' && status = 'prevista'`,
    })

    const diaVencimentoCompromisso = compromisso.dia_vencimento

    // Identifica se há conta de cartão associada (direta ou por método de pagamento)
    const contaCartaoObj = await despesasService.obterContaCartaoCompromisso(compromisso)
    const contaEfetivaId = compromisso.conta_padrao || (contaCartaoObj ? contaCartaoObj.id : null)

    // Se for cartão de crédito e tiver data_inicio, verifica se existe ocorrência (prevista OU paga)
    // para o ciclo inicial da fatura; se faltar, cria-a de forma idempotente.
    if (contaCartaoObj && compromisso.data_inicio) {
      const dataInicioStr = compromisso.data_inicio.slice(0, 10)
      const cicloInicial = calcularFaturaCartao(contaCartaoObj, dataInicioStr)
      const jaExisteInicial = await pb.collection('despesas_ocorrencias').getList(1, 1, {
        filter: `compromisso = '${compromisso.id}' && competencia = '${cicloInicial.competencia}'`,
      })

      if (jaExisteInicial.totalItems === 0) {
        const dueDateIso = `${cicloInicial.dataVencimento}T12:00:00.000Z`
        await pb.collection('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: contaEfetivaId,
          competencia: cicloInicial.competencia,
          data_vencimento: dueDateIso,
          valor_previsto: novoValorUnitario,
          valor_estimado_original: novoValorUnitario,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          direcionamento: compromisso.direcionamento || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || null,
          numero_parcela: isParcelado ? compromisso.parcela_inicial || 1 : 0,
          total_parcelas: isParcelado ? compromisso.total_parcelas || 1 : 0,
        })
      }
    }

    for (const oc of ocorrenciasPrevistas) {
      const updates: Partial<DespesaOcorrencia> = {}

      // Só atualiza o valor se a ocorrência não tiver sido ajustada manualmente
      if (!oc.valor_ajustado_manualmente) {
        updates.valor_previsto = novoValorUnitario
        updates.valor_estimado_original = novoValorUnitario
      }

      // Sincroniza dados estruturais com o compromisso atualizado
      const contaEfetivaId = compromisso.conta_padrao || (contaCartaoObj ? contaCartaoObj.id : null)
      if (contaEfetivaId && oc.conta !== contaEfetivaId) {
        updates.conta = contaEfetivaId
      }
      if (compromisso.secao && oc.secao !== compromisso.secao) {
        updates.secao = compromisso.secao
      }
      if (oc.contexto_tipo !== compromisso.contexto_tipo) {
        updates.contexto_tipo = compromisso.contexto_tipo
      }
      if (compromisso.empresa && oc.empresa !== compromisso.empresa) {
        updates.empresa = compromisso.empresa
      }
      if (oc.dizimo !== compromisso.dizimo) {
        updates.dizimo = compromisso.dizimo || false
      }
      if (oc.tipo_dizimo !== (compromisso.tipo_dizimo || null)) {
        updates.tipo_dizimo = compromisso.tipo_dizimo || null
      }
      if (oc.direcionamento !== (compromisso.direcionamento || null)) {
        updates.direcionamento = compromisso.direcionamento || null
      }
      if (
        compromisso.link_pagamento !== undefined &&
        oc.link_pagamento !== compromisso.link_pagamento
      ) {
        updates.link_pagamento = compromisso.link_pagamento || null
      }

      // Se for despesa de cartão de crédito, o vencimento e competência seguem o ciclo da fatura
      if (contaCartaoObj) {
        const dataCompraStr = compromisso.data_inicio
          ? compromisso.data_inicio.slice(0, 10)
          : compromisso.created
            ? compromisso.created.slice(0, 10)
            : new Date().toISOString().slice(0, 10)

        const [anoStr, mesStr, diaStr] = dataCompraStr.split('-')
        const cAno = parseInt(anoStr, 10)
        const cMesZero = parseInt(mesStr, 10) - 1
        const cDia = parseInt(diaStr, 10)

        const pNum = oc.numero_parcela && oc.numero_parcela > 0 ? oc.numero_parcela : 1
        const pInicial = compromisso.parcela_inicial || 1
        const offset = isParcelado ? pNum - pInicial : 0

        const parcelaDate = despesasService.calcularDataVencimentoNoMes(
          cAno,
          cMesZero + offset,
          cDia,
        )
        const parcelaDataIso = `${parcelaDate.getUTCFullYear()}-${String(
          parcelaDate.getUTCMonth() + 1,
        ).padStart(2, '0')}-${String(parcelaDate.getUTCDate()).padStart(2, '0')}`

        const ciclo = calcularFaturaCartao(contaCartaoObj, parcelaDataIso)
        const expectedDueIso = `${ciclo.dataVencimento}T12:00:00.000Z`

        if (oc.competencia !== ciclo.competencia) {
          updates.competencia = ciclo.competencia
        }
        const currentDueStr = oc.data_vencimento ? oc.data_vencimento.slice(0, 10) : ''
        if (currentDueStr !== ciclo.dataVencimento) {
          updates.data_vencimento = expectedDueIso
        }
      } else if (diaVencimentoCompromisso && oc.competencia && oc.competencia.includes('-')) {
        // Se houver dia_vencimento e a ocorrência tiver competência, verifica se a data de vencimento precisa alinhar
        const [yStr, mStr] = oc.competencia.split('-')
        const y = parseInt(yStr, 10)
        const m = parseInt(mStr, 10) - 1
        if (!isNaN(y) && !isNaN(m)) {
          const expectedDate = despesasService.calcularDataVencimentoNoMes(
            y,
            m,
            diaVencimentoCompromisso,
          )
          const expectedIso = expectedDate.toISOString()
          // Compara apenas YYYY-MM-DD
          const currentDueStr = oc.data_vencimento ? oc.data_vencimento.slice(0, 10) : ''
          const expectedDueStr = expectedIso.slice(0, 10)
          if (currentDueStr !== expectedDueStr) {
            updates.data_vencimento = expectedIso
          }
        }
      }

      if (Object.keys(updates).length > 0) {
        await pb.collection('despesas_ocorrencias').update(oc.id, updates)
      }
    }
  },

  gerarOcorrenciasParaCompromisso: async (
    compromisso: DespesaCompromisso,
    targetCompetencias?: string[],
    cachedOcorrencias?: DespesaOcorrencia[],
  ) => {
    // Helper para verificar se já existe ocorrência em memória ou via PocketBase
    const hasExistingOcorrencia = async (matcher: {
      competencia?: string
      numero_parcela?: number
      onlyCompromisso?: boolean
    }): Promise<boolean> => {
      if (cachedOcorrencias !== undefined) {
        return cachedOcorrencias.some((oc) => {
          const compId =
            typeof oc.compromisso === 'object' && oc.compromisso
              ? (oc.compromisso as any).id
              : oc.compromisso
          if (compId !== compromisso.id) return false
          if (matcher.onlyCompromisso) return true
          if (matcher.competencia !== undefined && oc.competencia !== matcher.competencia) {
            return false
          }
          if (
            matcher.numero_parcela !== undefined &&
            oc.numero_parcela !== matcher.numero_parcela
          ) {
            return false
          }
          return true
        })
      }

      let filter = `compromisso = '${compromisso.id}'`
      if (matcher.competencia !== undefined) {
        filter += ` && competencia = '${matcher.competencia}'`
      }
      if (matcher.numero_parcela !== undefined) {
        filter += ` && numero_parcela = ${matcher.numero_parcela}`
      }
      try {
        const existing = await pb.collection('despesas_ocorrencias').getList(1, 1, { filter })
        return existing.totalItems > 0
      } catch (err: any) {
        if (err instanceof ClientResponseError && err.status === 429) {
          console.warn(
            `[gerarOcorrenciasParaCompromisso] 429 detectado ao checar ocorrências do compromisso ${compromisso.id}`,
          )
        }
        throw err
      }
    }
    const isParcelado =
      compromisso.modalidade_parcelamento === 'parcelado' ||
      compromisso.regra_repeticao === 'parcelado'
    const isAvulso = compromisso.regra_repeticao === 'avulso'
    const isAnual = compromisso.regra_repeticao === 'anual'

    const valorUnitario =
      compromisso.valor_parcela && compromisso.valor_parcela > 0
        ? compromisso.valor_parcela
        : compromisso.valor_estimado

    // Verifica se a conta vinculada é cartão de crédito para alinhar ao ciclo da fatura
    // (checando conta_padrao e metodo_pagamento)
    const contaCartaoObj = await despesasService.obterContaCartaoCompromisso(compromisso)
    const contaIdEfetiva = compromisso.conta_padrao || (contaCartaoObj ? contaCartaoObj.id : null)

    // 1. Pagamento Avulso / Pontual (à vista, uma única ocorrência)
    if (isAvulso) {
      const dataCompraStr = compromisso.data_inicio
        ? compromisso.data_inicio.slice(0, 10)
        : compromisso.created
          ? compromisso.created.slice(0, 10)
          : new Date().toISOString().slice(0, 10)

      let compStr: string
      let dueDateIso: string

      if (contaCartaoObj) {
        // Alinhado ao ciclo da fatura do cartão
        const ciclo = calcularFaturaCartao(contaCartaoObj, dataCompraStr)
        compStr = ciclo.competencia
        dueDateIso = `${ciclo.dataVencimento}T12:00:00.000Z`
      } else {
        const rawDate = compromisso.data_inicio || compromisso.created
        const startDate = rawDate ? new Date(rawDate) : new Date()
        compStr = `${startDate.getUTCFullYear()}-${(startDate.getUTCMonth() + 1).toString().padStart(2, '0')}`
        dueDateIso = startDate.toISOString()
      }

      const exists = await hasExistingOcorrencia({ onlyCompromisso: true })
      if (!exists) {
        const newRecord = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: contaIdEfetiva,
          competencia: compStr,
          data_vencimento: dueDateIso,
          valor_previsto: compromisso.valor_estimado,
          valor_estimado_original: compromisso.valor_estimado,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          direcionamento: compromisso.direcionamento || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || 'Pagamento único / avulso',
        })
        if (cachedOcorrencias) {
          cachedOcorrencias.push(newRecord)
        }
      }
      return
    }

    // 2. Pagamento Parcelado em N vezes (com fim definido)
    if (isParcelado) {
      const total = compromisso.total_parcelas || 1
      const inicial = compromisso.parcela_inicial || 1
      const dataCompraStr = compromisso.data_inicio
        ? compromisso.data_inicio.slice(0, 10)
        : compromisso.created
          ? compromisso.created.slice(0, 10)
          : new Date().toISOString().slice(0, 10)

      if (contaCartaoObj) {
        // Para cartão: cada parcela avança um mês em relação à compra e calcula o ciclo da fatura
        const [anoStr, mesStr, diaStr] = dataCompraStr.split('-')
        const cAno = parseInt(anoStr, 10)
        const cMesZero = parseInt(mesStr, 10) - 1
        const cDia = parseInt(diaStr, 10)

        for (let p = inicial; p <= total; p++) {
          const offset = p - inicial
          const parcelaDate = despesasService.calcularDataVencimentoNoMes(
            cAno,
            cMesZero + offset,
            cDia,
          )
          const pYear = parcelaDate.getUTCFullYear()
          const pMonth = parcelaDate.getUTCMonth()
          const pDay = parcelaDate.getUTCDate()
          const parcelaDataIso = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-${String(pDay).padStart(2, '0')}`

          const ciclo = calcularFaturaCartao(contaCartaoObj, parcelaDataIso)
          const compStr = ciclo.competencia
          const dueDateIso = `${ciclo.dataVencimento}T12:00:00.000Z`

          const exists = await hasExistingOcorrencia({ numero_parcela: p })

          if (!exists) {
            const newRecord = await pb
              .collection<DespesaOcorrencia>('despesas_ocorrencias')
              .create({
                compromisso: compromisso.id,
                contexto_tipo: compromisso.contexto_tipo,
                empresa: compromisso.empresa || null,
                secao: compromisso.secao,
                conta: contaIdEfetiva,
                competencia: compStr,
                numero_parcela: p,
                total_parcelas: total,
                data_vencimento: dueDateIso,
                valor_previsto: valorUnitario,
                valor_estimado_original: valorUnitario,
                valor_ajustado_manualmente: false,
                status: 'prevista',
                dizimo: compromisso.dizimo || false,
                tipo_dizimo: compromisso.tipo_dizimo || null,
                direcionamento: compromisso.direcionamento || null,
                link_pagamento: compromisso.link_pagamento || null,
                observacoes: `Parcela ${p}/${total}`,
              })
            if (cachedOcorrencias) {
              cachedOcorrencias.push(newRecord)
            }
          }
        }
      } else {
        // Contas não-cartão: lógica padrão com dia_vencimento
        const rawDate = compromisso.data_inicio || compromisso.created
        const startDate = rawDate ? new Date(rawDate) : new Date()
        const day = compromisso.dia_vencimento || startDate.getUTCDate() || 10

        for (let p = inicial; p <= total; p++) {
          const offset = p - inicial
          const ano = startDate.getUTCFullYear()
          const mes = startDate.getUTCMonth() + offset
          const dueDate = despesasService.calcularDataVencimentoNoMes(ano, mes, day)
          const compStr = `${dueDate.getUTCFullYear()}-${(dueDate.getUTCMonth() + 1).toString().padStart(2, '0')}`

          const exists = await hasExistingOcorrencia({ numero_parcela: p })

          if (!exists) {
            const newRecord = await pb
              .collection<DespesaOcorrencia>('despesas_ocorrencias')
              .create({
                compromisso: compromisso.id,
                contexto_tipo: compromisso.contexto_tipo,
                empresa: compromisso.empresa || null,
                secao: compromisso.secao,
                conta: compromisso.conta_padrao || null,
                competencia: compStr,
                numero_parcela: p,
                total_parcelas: total,
                data_vencimento: dueDate.toISOString(),
                valor_previsto: valorUnitario,
                valor_estimado_original: valorUnitario,
                valor_ajustado_manualmente: false,
                status: 'prevista',
                dizimo: compromisso.dizimo || false,
                tipo_dizimo: compromisso.tipo_dizimo || null,
                direcionamento: compromisso.direcionamento || null,
                link_pagamento: compromisso.link_pagamento || null,
                observacoes: `Parcela ${p}/${total}`,
              })
            if (cachedOcorrencias) {
              cachedOcorrencias.push(newRecord)
            }
          }
        }
      }
      return
    }

    // 3. Pagamento Anual
    if (isAnual) {
      const now = new Date()
      const hoje = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
      )
      const rawStart = new Date(compromisso.data_inicio)
      const dayDesejado = compromisso.dia_vencimento || rawStart.getUTCDate() || 10
      const mesOriginal = rawStart.getUTCMonth()

      // Se a data de início (ou vencimento no ano de início) já passou em relação a hoje,
      // avança para o próximo ano em que a data seja >= hoje (ou data futura correspondente).
      let targetYear = rawStart.getUTCFullYear()
      let dueDate = despesasService.calcularDataVencimentoNoMes(
        targetYear,
        mesOriginal,
        dayDesejado,
      )

      // Se targetCompetencias foram passadas explicitamente, use a primeira compatível
      if (targetCompetencias && targetCompetencias.length > 0) {
        const [yStr, mStr] = targetCompetencias[0].split('-')
        targetYear = parseInt(yStr, 10)
        const targetMes = parseInt(mStr, 10) - 1
        dueDate = despesasService.calcularDataVencimentoNoMes(targetYear, targetMes, dayDesejado)
      } else {
        while (dueDate.getTime() < hoje.getTime()) {
          targetYear += 1
          dueDate = despesasService.calcularDataVencimentoNoMes(
            targetYear,
            mesOriginal,
            dayDesejado,
          )
        }
      }

      const compStr = `${dueDate.getUTCFullYear()}-${(dueDate.getUTCMonth() + 1).toString().padStart(2, '0')}`
      const exists = await hasExistingOcorrencia({ competencia: compStr })
      if (!exists) {
        const newRecord = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: compromisso.conta_padrao || null,
          competencia: compStr,
          data_vencimento: dueDate.toISOString(),
          valor_previsto: compromisso.valor_estimado,
          valor_estimado_original: compromisso.valor_estimado,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          direcionamento: compromisso.direcionamento || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || 'Assinatura anual',
        })
        if (cachedOcorrencias) {
          cachedOcorrencias.push(newRecord)
        }
      }
      return
    }

    // 4. Regra Mensal Recorrente (contínua até ser encerrada)
    if (contaCartaoObj) {
      // Compromissos recorrentes de cartão de crédito:
      // O ciclo da fatura inicial é calculado a partir de data_inicio (ou created / now).
      const dataInicioStr = compromisso.data_inicio
        ? compromisso.data_inicio.slice(0, 10)
        : compromisso.created
          ? compromisso.created.slice(0, 10)
          : new Date().toISOString().slice(0, 10)

      const cicloInicial = calcularFaturaCartao(contaCartaoObj, dataInicioStr)
      const startCompStr = cicloInicial.competencia

      const meses =
        targetCompetencias && targetCompetencias.length > 0
          ? targetCompetencias
          : (() => {
              const now = new Date()
              const endYear = now.getUTCFullYear()
              const endMonth = now.getUTCMonth() + 3 // mês atual + 3
              const targetEnd = new Date(Date.UTC(endYear, endMonth, 1))

              const [sYStr, sMStr] = startCompStr.split('-')
              let currYear = parseInt(sYStr, 10)
              let currMonth = parseInt(sMStr, 10) - 1

              const list: string[] = []
              let cursor = new Date(Date.UTC(currYear, currMonth, 1))
              while (cursor.getTime() <= targetEnd.getTime()) {
                const cY = cursor.getUTCFullYear()
                const cM = cursor.getUTCMonth()
                const compFormatted = `${cY}-${String(cM + 1).padStart(2, '0')}`
                if (!list.includes(compFormatted)) {
                  list.push(compFormatted)
                }
                currMonth += 1
                cursor = new Date(Date.UTC(currYear, currMonth, 1))
              }
              return list
            })()

      for (const compStr of meses) {
        if (compStr < startCompStr) {
          continue
        }

        const exists = await hasExistingOcorrencia({ competencia: compStr })
        if (!exists) {
          // Calcula data_vencimento do ciclo do cartão para a competência alvo
          // Cria uma data representativa no ciclo da competência (ex: dia 1 da competência)
          const [cYearStr, cMonthStr] = compStr.split('-')
          const cYear = parseInt(cYearStr, 10)
          const cMonth = parseInt(cMonthStr, 10) - 1
          const cicloComp = calcularFaturaCartao(
            contaCartaoObj,
            `${cYear}-${String(cMonth + 1).padStart(2, '0')}-01`,
          )
          const dueDateIso = `${cicloComp.dataVencimento}T12:00:00.000Z`

          const newRecord = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create({
            compromisso: compromisso.id,
            contexto_tipo: compromisso.contexto_tipo,
            empresa: compromisso.empresa || null,
            secao: compromisso.secao,
            conta: contaIdEfetiva,
            competencia: compStr,
            data_vencimento: dueDateIso,
            valor_previsto: valorUnitario,
            valor_estimado_original: valorUnitario,
            valor_ajustado_manualmente: false,
            status: 'prevista',
            dizimo: compromisso.dizimo || false,
            tipo_dizimo: compromisso.tipo_dizimo || null,
            direcionamento: compromisso.direcionamento || null,
            link_pagamento: compromisso.link_pagamento || null,
            observacoes: compromisso.observacoes || null,
            numero_parcela: 0,
            total_parcelas: 0,
          })
          if (cachedOcorrencias) {
            cachedOcorrencias.push(newRecord)
          }
        }
      }
      return
    }

    // Regra mensal não-cartão (comportamento original)
    // Extrai o mês e ano de início de forma robusta e independente de fuso
    const startCompStr = (() => {
      if (compromisso.data_inicio) {
        const str = String(compromisso.data_inicio).trim()
        if (str.length >= 7 && str[4] === '-') {
          return str.slice(0, 7)
        }
        const d = new Date(str)
        if (!isNaN(d.getTime())) {
          return `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
        }
      }
      const now = new Date()
      return `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`
    })()

    const meses =
      targetCompetencias && targetCompetencias.length > 0
        ? targetCompetencias
        : (() => {
            const now = new Date()
            const endYear = now.getUTCFullYear()
            const endMonth = now.getUTCMonth() + 3 // mês atual + 3
            const targetEnd = new Date(Date.UTC(endYear, endMonth, 1))

            const [sYStr, sMStr] = startCompStr.split('-')
            let currYear = parseInt(sYStr, 10)
            let currMonth = parseInt(sMStr, 10) - 1

            const list: string[] = []
            let cursor = new Date(Date.UTC(currYear, currMonth, 1))
            while (cursor.getTime() <= targetEnd.getTime()) {
              const cY = cursor.getUTCFullYear()
              const cM = cursor.getUTCMonth()
              const compFormatted = `${cY}-${String(cM + 1).padStart(2, '0')}`
              if (!list.includes(compFormatted)) {
                list.push(compFormatted)
              }
              currMonth += 1
              cursor = new Date(Date.UTC(currYear, currMonth, 1))
            }
            return list
          })()

    const day = compromisso.dia_vencimento || 10

    for (const compStr of meses) {
      // NUNCA gerar ocorrência anterior ao mês/competência de data_inicio do compromisso
      if (compStr < startCompStr) {
        continue
      }

      const exists = await hasExistingOcorrencia({ competencia: compStr })
      if (!exists) {
        const [yStr, mStr] = compStr.split('-')
        const y = parseInt(yStr, 10)
        const m = parseInt(mStr, 10) - 1
        const dueDate = despesasService.calcularDataVencimentoNoMes(y, m, day)

        const newRecord = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: compromisso.conta_padrao || null,
          competencia: compStr,
          data_vencimento: dueDate.toISOString(),
          valor_previsto: compromisso.valor_estimado,
          valor_estimado_original: compromisso.valor_estimado,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          direcionamento: compromisso.direcionamento || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || null,
        })
        if (cachedOcorrencias) {
          cachedOcorrencias.push(newRecord)
        }
      }
    }
  },

  /**
   * Sincroniza em lote os compromissos para uma ou mais competências,
   * eliminando consultas N+1 ao consultar de uma só vez as ocorrências da competência
   * e processando em lotes controlados com pausa para respeitar limites do backend.
   */
  gerarOcorrenciasParaCompromissosLote: async (params: {
    compromissos: DespesaCompromisso[]
    competencias: string[]
    batchSize?: number
    batchDelayMs?: number
    incluirMesesFuturos?: boolean
  }) => {
    const {
      compromissos,
      competencias,
      batchSize = 4,
      batchDelayMs = 150,
      incluirMesesFuturos = true,
    } = params
    const ativos = compromissos.filter((c) => c.ativo !== false)
    if (ativos.length === 0) return

    // Monta a lista completa de competências a verificar/preencher:
    // competências requisitadas + até 3 meses à frente para blindagem contínua dos compromissos recorrentes
    const todasCompetenciasSet = new Set<string>(competencias)
    if (incluirMesesFuturos) {
      const baseComp = competencias[0] || new Date().toISOString().slice(0, 7)
      const [bYStr, bMStr] = baseComp.split('-')
      const bY = parseInt(bYStr, 10)
      const bM = parseInt(bMStr, 10) - 1
      for (let offset = 0; offset <= 3; offset++) {
        const d = new Date(Date.UTC(bY, bM + offset, 1))
        const compFutura = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
        todasCompetenciasSet.add(compFutura)
      }
    }
    const todasCompetencias = Array.from(todasCompetenciasSet).sort()

    // 1. Consulta única em lote (bulk) eliminando a causa raiz N+1 e evitando 429
    const filterCompetencias =
      todasCompetencias.length === 1
        ? `competencia = '${todasCompetencias[0]}'`
        : `(${todasCompetencias.map((comp) => `competencia = '${comp}'`).join(' || ')})`

    let ocorrenciasExistentes: DespesaOcorrencia[] = []
    try {
      ocorrenciasExistentes = await listAll<DespesaOcorrencia>('despesas_ocorrencias', {
        filter: filterCompetencias,
      })
    } catch (e) {
      console.warn(
        '[gerarOcorrenciasParaCompromissosLote] Falha ao consultar ocorrências em lote, fallback dinâmico ativo:',
        e,
      )
    }

    // 2. Processamento em lotes (throttling) com verificação em memória
    for (let i = 0; i < ativos.length; i += batchSize) {
      const chunk = ativos.slice(i, i + batchSize)
      await Promise.all(
        chunk.map((comp) =>
          despesasService.gerarOcorrenciasParaCompromisso(
            comp,
            todasCompetencias,
            ocorrenciasExistentes,
          ),
        ),
      )
      if (i + batchSize < ativos.length && batchDelayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, batchDelayMs))
      }
    }
  },

  /**
   * Obtém os tipos de pagamento ativos de uma conta, aplicando fallbacks se não preenchido
   */
  getTiposPagamentoConta: (conta?: Conta | null): ContaTipoPagamento[] => {
    if (!conta) return ['debito', 'transferencia', 'boletos', 'pix']
    if (conta.tipos_pagamento && conta.tipos_pagamento.length > 0) {
      return conta.tipos_pagamento
    }
    return (
      CONTA_TIPOS_PAGAMENTO_FALLBACK[conta.tipo] || ['debito', 'transferencia', 'boletos', 'pix']
    )
  },

  /**
   * Mapeia o método de pagamento da despesa para uma das chaves de ContaTipoPagamento
   */
  mapearMetodoParaTipoPagamento: (
    metodo: MetodoPagamento | string | null | undefined,
    tiposDisponiveis: ContaTipoPagamento[],
  ): ContaTipoPagamento => {
    let tipoStr = ''
    let nomeStr = ''
    let codigoStr = ''

    if (metodo && typeof metodo === 'object') {
      tipoStr = (metodo.tipo || '').toLowerCase()
      nomeStr = (metodo.nome || '').toLowerCase()
      codigoStr = (metodo.codigo || '').toLowerCase()
    } else if (typeof metodo === 'string') {
      nomeStr = metodo.toLowerCase()
      codigoStr = metodo.toLowerCase()
    }

    const matchCandidate = (cand: ContaTipoPagamento): boolean => {
      return tiposDisponiveis.includes(cand)
    }

    // 1. Detecção de Cartão / Crédito
    if (
      tipoStr === 'cartao' ||
      nomeStr.includes('crédito') ||
      nomeStr.includes('credito') ||
      codigoStr.includes('credito')
    ) {
      if (matchCandidate('credito')) return 'credito'
    }

    // 2. Débito
    if (nomeStr.includes('débito') || nomeStr.includes('debito') || codigoStr.includes('debito')) {
      if (matchCandidate('debito')) return 'debito'
    }

    // 3. Pix
    if (tipoStr === 'pix' || nomeStr.includes('pix') || codigoStr.includes('pix')) {
      if (matchCandidate('pix')) return 'pix'
    }

    // 4. Boleto
    if (tipoStr === 'boleto' || nomeStr.includes('boleto') || codigoStr.includes('boleto')) {
      if (matchCandidate('boletos')) return 'boletos'
    }

    // 5. Transferência
    if (
      tipoStr === 'transferencia' ||
      nomeStr.includes('transferência') ||
      nomeStr.includes('transferencia') ||
      nomeStr.includes('ted') ||
      nomeStr.includes('doc') ||
      codigoStr.includes('transferencia')
    ) {
      if (matchCandidate('transferencia')) return 'transferencia'
    }

    // Fallback: primeiro tipo da conta ou débito
    return tiposDisponiveis[0] || 'debito'
  },

  /**
   * Determina se uma ocorrência é pagamento em dinheiro vivo
   */
  isDespesaDinheiro: (
    oc: DespesaOcorrencia,
    compromisso?: DespesaCompromisso | null,
    metodosPagamentoMap?: Map<string, MetodoPagamento>,
  ): boolean => {
    const comp = compromisso || oc.expand?.compromisso
    const metodoObj =
      comp?.expand?.metodo_pagamento ||
      (comp?.metodo_pagamento && metodosPagamentoMap
        ? metodosPagamentoMap.get(comp.metodo_pagamento)
        : null)

    const metodoTipo = (metodoObj?.tipo || '').toLowerCase()
    const metodoNome = (metodoObj?.nome || '').toLowerCase()

    if (
      metodoTipo === 'dinheiro' ||
      metodoNome.includes('dinheiro') ||
      metodoNome.includes('espécie')
    ) {
      return true
    }

    // Se a conta for tipo 'caixa' e o método for dinheiro ou sem outro método específico de banco
    const conta = oc.expand?.conta || comp?.expand?.conta_padrao
    if (
      conta?.tipo === 'caixa' &&
      (metodoTipo === 'dinheiro' || !metodoObj || metodoTipo === 'outro')
    ) {
      return true
    }

    return false
  },

  /**
   * Agrupa as ocorrências de despesas para exibição em /despesas.
   * Nova arquitetura (lista única de contas):
   * - Elimina a bifurcação cartoes/contasNaoCartao.
   * - Gera lista única `contas` de todas as contas ativas ordenadas por conta.ordem (desempate por nome).
   * - Abas de cada conta = exatamente os itens de tipos_pagamento da conta.
   * - Despesas anuais (seção 'assinaturas_anuais' / regra anual) alocadas dentro do grupo da conta na aba do método.
   * - Mantém apenas os grupos 'dinheiro' e 'semConta'.
   * - Fornece propriedades legadas vazias (cartoes, contasNaoCartao, assinaturas) para compatibilidade retroativa.
   */
  agruparDespesasParaVisualizacao: (params: {
    ocorrencias: DespesaOcorrencia[]
    contas: Conta[]
    compromissos: DespesaCompromisso[]
    metodosPagamento: MetodoPagamento[]
    sortFn?: (list: DespesaOcorrencia[]) => DespesaOcorrencia[]
  }) => {
    const { ocorrencias, contas, compromissos, metodosPagamento, sortFn } = params
    const sorter = sortFn || ((l: DespesaOcorrencia[]) => l)

    const contasMap = new Map<string, Conta>(contas.map((c) => [c.id, c]))
    const compromissosMap = new Map<string, DespesaCompromisso>(compromissos.map((c) => [c.id, c]))
    const metodosMap = new Map<string, MetodoPagamento>(metodosPagamento.map((m) => [m.id, m]))

    // Grupos resultantes
    const ocorrenciasDinheiro: DespesaOcorrencia[] = []
    const ocorrenciasSemConta: DespesaOcorrencia[] = []

    // Agrupamento unificado de Contas: map de contaId -> { conta, ocorrencias, abas: Map<ContaTipoPagamento, DespesaOcorrencia[]> }
    const contasGrupoMap = new Map<
      string,
      {
        conta: Conta
        ocorrencias: DespesaOcorrencia[]
        abas: Map<ContaTipoPagamento, DespesaOcorrencia[]>
      }
    >()

    // Função interna para obter ou criar o grupo de conta
    const getOrCreateContaGrupo = (conta: Conta) => {
      let entry = contasGrupoMap.get(conta.id)
      if (!entry) {
        const tipos = despesasService.getTiposPagamentoConta(conta)
        const abas = new Map<ContaTipoPagamento, DespesaOcorrencia[]>()
        tipos.forEach((t) => abas.set(t, []))
        entry = { conta, ocorrencias: [], abas }
        contasGrupoMap.set(conta.id, entry)
      }
      return entry
    }

    // Inicializa todas as contas ativas conhecidas para sempre terem sua posição na lista única
    contas
      .filter((c) => c.ativa)
      .forEach((c) => {
        getOrCreateContaGrupo(c)
      })

    // Processamento de cada ocorrência
    for (const oc of ocorrencias) {
      const comp =
        oc.expand?.compromisso || (oc.compromisso ? compromissosMap.get(oc.compromisso) : undefined)

      // Regra 1: Pagamentos em dinheiro (espécie)
      if (despesasService.isDespesaDinheiro(oc, comp, metodosMap)) {
        ocorrenciasDinheiro.push(oc)
        continue
      }

      // Identificar a conta da ocorrência
      const contaId = oc.conta || comp?.conta_padrao
      let contaObj = contaId ? contasMap.get(contaId) : undefined
      if (!contaObj && oc.expand?.conta) {
        contaObj = oc.expand.conta
      } else if (!contaObj && comp?.expand?.conta_padrao) {
        contaObj = comp.expand.conta_padrao
      }

      // Regra 2: Conta identificada
      if (contaObj) {
        // Se a conta for inativa (arquivada), as ocorrências vão para semConta
        if (contaObj.ativa === false) {
          ocorrenciasSemConta.push(oc)
          continue
        }

        const grupo = getOrCreateContaGrupo(contaObj)
        grupo.ocorrencias.push(oc)

        const tipos = despesasService.getTiposPagamentoConta(contaObj)
        const metodoObj =
          comp?.expand?.metodo_pagamento ||
          (comp?.metodo_pagamento ? metodosMap.get(comp.metodo_pagamento) : null)

        const tipoAlocado = despesasService.mapearMetodoParaTipoPagamento(metodoObj, tipos)
        if (!grupo.abas.has(tipoAlocado)) {
          grupo.abas.set(tipoAlocado, [])
        }
        grupo.abas.get(tipoAlocado)!.push(oc)
        continue
      }

      // Regra 3: Sem conta definida (órfã / sem conta vinculada)
      ocorrenciasSemConta.push(oc)
    }

    // Formatar a lista única de contas
    const contasList = Array.from(contasGrupoMap.values())
      .map((entry) => {
        let totalOcorrencias = 0
        const abasObj: { tipo: ContaTipoPagamento; ocorrencias: DespesaOcorrencia[] }[] = []

        // Abas seguem estritamente os tipos de pagamento configurados na conta
        const tipos = despesasService.getTiposPagamentoConta(entry.conta)
        tipos.forEach((t) => {
          const ocs = entry.abas.get(t) || []
          totalOcorrencias += ocs.length
          abasObj.push({
            tipo: t,
            ocorrencias: sorter(ocs),
          })
        })

        // Se houver algum tipo no map que não constava na lista de tipos (caso dinâmico), inclui também
        entry.abas.forEach((ocs, t) => {
          if (!tipos.includes(t)) {
            totalOcorrencias += ocs.length
            abasObj.push({
              tipo: t,
              ocorrencias: sorter(ocs),
            })
          }
        })

        return {
          conta: entry.conta,
          totalOcorrencias,
          ocorrencias: sorter(entry.ocorrencias),
          abas: abasObj,
        }
      })
      .filter((g) => g.conta.ativa || g.totalOcorrencias > 0)
      .sort((a, b) => {
        const ordemA = a.conta.ordem ?? 999999
        const ordemB = b.conta.ordem ?? 999999
        if (ordemA !== ordemB) return ordemA - ordemB
        return a.conta.nome.localeCompare(b.conta.nome, 'pt-BR', { sensitivity: 'base' })
      })

    return {
      contas: contasList,
      // Retrocompatibilidade temporária com tipagens legadas
      cartoes: [] as any[],
      contasNaoCartao: contasList,
      assinaturas: [] as DespesaOcorrencia[],
      dinheiro: sorter(ocorrenciasDinheiro),
      semConta: sorter(ocorrenciasSemConta),
    }
  },
}
