import { ClientResponseError, type RecordListOptions, type RecordOptions } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import {
  calcularFaturaCartao,
  calcularCicloParcelaCartao,
  calcularCompetenciaEVencimento,
  calcularVencimentoFatura,
} from '@/lib/cartao-fatura'
import type {
  Conta,
  ContaTipoPagamento,
  ContextoTipo,
  DespesaCompromisso,
  DespesaOcorrencia,
  Lancamento,
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
  if (conta.tipo === 'cartao') return true
  const rawTipos = conta.tipos_pagamento
  const tipos =
    Array.isArray(rawTipos) && rawTipos.length > 0
      ? rawTipos
      : typeof rawTipos === 'string'
        ? [rawTipos]
        : CONTA_TIPOS_PAGAMENTO_FALLBACK[conta.tipo] || []
  return tipos.some((t) => String(t).toLowerCase().includes('credito'))
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
    dizimoPercentual?: number
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

    // Busca dados prévios da ocorrência para conferir o compromisso e método de pagamento
    const ocorrAtual = await pb
      .collection<DespesaOcorrencia>('despesas_ocorrencias')
      .getOne(params.ocorrenciaId)

    // Busca o registro completo do compromisso para obter data_inicio, regra, parcelas e dia_vencimento
    let compRecord: DespesaCompromisso | null = null
    const compId =
      typeof ocorrAtual.compromisso === 'object' && ocorrAtual.compromisso !== null
        ? (ocorrAtual.compromisso as any).id
        : ocorrAtual.compromisso
    if (compId) {
      try {
        compRecord = await pb.collection<DespesaCompromisso>('despesas_compromisso').getOne(compId)
      } catch {
        /* ignore */
      }
    }

    const metodoCompId =
      compRecord?.metodo_pagamento ||
      (typeof ocorrAtual.compromisso === 'object' && ocorrAtual.compromisso !== null
        ? (ocorrAtual.compromisso as any).metodo_pagamento
        : null)

    // Se a conta for tipo 'cartao', ou aceitar crédito com método crédito (ou método ausente)
    const contaAceitaCred = contaObj ? contaAceitaCredito(contaObj) : false
    const metodoEfetivoEhCredito =
      Boolean(contaObj) &&
      (contaObj?.tipo === 'cartao' ||
        (contaAceitaCred && (metodoCompId ? isMetodoCredito(metodoCompId) : true)))

    // Determina a data da compra original (prioriza compromisso.data_inicio, cai para params.dataPagamento)
    const dataCompraBase = compRecord?.data_inicio
      ? compRecord.data_inicio.slice(0, 10)
      : params.dataPagamento

    const numParcela =
      ocorrAtual.numero_parcela && ocorrAtual.numero_parcela > 0
        ? ocorrAtual.numero_parcela
        : compRecord?.parcela_inicial || 1
    const totParcelas =
      ocorrAtual.total_parcelas && ocorrAtual.total_parcelas > 0
        ? ocorrAtual.total_parcelas
        : compRecord?.total_parcelas || 1

    // REGRA ÚNICA DE COMPETÊNCIA E VENCIMENTO:
    // Utiliza calcularCompetenciaEVencimento para garantir consistência total entre compra,
    // fechamento do cartão, competência e vencimento.
    const resRegraUnica = calcularCompetenciaEVencimento({
      dataCompra: dataCompraBase,
      conta: contaObj,
      metodoEhCredito: metodoEfetivoEhCredito,
      diaVencimento: compRecord?.dia_vencimento,
      numeroParcela: numParcela,
      totalParcelas: totParcelas,
    })

    const competenciaFinal = resRegraUnica.competencia
    const vencimentoFinalIso = resRegraUnica.dataVencimentoIso

    let lancamentoId: string | null = null
    let lancamento: any = null

    // Montagem dos dados do lançamento (usando FormData se houver comprovante)
    if (metodoEfetivoEhCredito && contaObj) {
      // Para cartão de crédito: a despesa entra na fatura do cartão referente ao ciclo.
      // O lançamento financeiro é criado como pendente de fatura (sem saída imediata de caixa)
      // até que a fatura inteira seja baixada/paga. O lançamento assume a competência da fatura.
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
        fd.append('competencia', competenciaFinal)
        fd.append('fatura_paga', 'false')
        fd.append(
          'observacoes',
          params.observacoes ||
            `Despesa no cartão ${contaObj.nome} (integrada à fatura de ${competenciaFinal})`,
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
          competencia: competenciaFinal,
          fatura_paga: false,
          observacoes:
            params.observacoes ||
            `Despesa no cartão ${contaObj.nome} (integrada à fatura de ${competenciaFinal})`,
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
        fd.append('competencia', competenciaFinal)
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
          competencia: competenciaFinal,
          observacoes: params.observacoes || 'Baixa automática de despesa recorrente',
        })
      }
      lancamentoId = lancamento.id
    }

    // 2. Atualizar ocorrência (permitindo ajustar valor real da ocorrência sem afetar as demais)
    const diferencaValor = params.valorPago !== ocorrAtual.valor_previsto

    let ocorr: DespesaOcorrencia
    if (params.comprovanteArquivo) {
      const fdOcorr = new FormData()
      fdOcorr.append('status', 'paga')
      fdOcorr.append('valor_pago', String(params.valorPago))
      fdOcorr.append('valor_previsto', String(params.valorPago))
      fdOcorr.append('valor_ajustado_manualmente', String(diferencaValor))
      fdOcorr.append('data_pagamento', `${params.dataPagamento} 12:00:00`)
      fdOcorr.append('conta', params.contaId)
      if (params.dizimoPercentual !== undefined) {
        fdOcorr.append('dizimo_percentual', String(params.dizimoPercentual))
      }
      if (lancamentoId) fdOcorr.append('lancamento', lancamentoId)
      fdOcorr.append('competencia', competenciaFinal)
      fdOcorr.append('data_vencimento', vencimentoFinalIso)
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
        competencia: competenciaFinal,
        data_vencimento: vencimentoFinalIso,
        ...(params.dizimoPercentual !== undefined
          ? { dizimo_percentual: params.dizimoPercentual }
          : {}),
        lancamento: lancamentoId,
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
    dizimoPercentual?: number
  }) => {
    let compRecord: DespesaCompromisso | null = null
    try {
      compRecord = await pb
        .collection<DespesaCompromisso>('despesas_compromisso')
        .getOne(params.compromissoId)
    } catch {
      /* ignore */
    }

    let isCartao = false
    let contaObj: Conta | null = null
    try {
      contaObj = await pb.collection<Conta>('contas').getOne(params.contaId)
      isCartao = contaObj.tipo === 'cartao'
    } catch {
      /* ignore */
    }

    const contaAceitaCred = contaObj ? contaAceitaCredito(contaObj) : false
    const metodoCompId = compRecord?.metodo_pagamento
    const metodoEfetivoEhCredito =
      Boolean(contaObj) &&
      (contaObj?.tipo === 'cartao' ||
        (contaAceitaCred && (metodoCompId ? isMetodoCredito(metodoCompId) : true)))

    // Data da compra base: se o compromisso possuir data_inicio, usamos como referência de compra
    const dataCompraBase = compRecord?.data_inicio
      ? compRecord.data_inicio.slice(0, 10)
      : params.dataPagamento

    const numParcela = compRecord?.parcela_inicial || 1
    const totParcelas = compRecord?.total_parcelas || 1

    const resRegraUnica = calcularCompetenciaEVencimento({
      dataCompra: dataCompraBase,
      conta: contaObj,
      metodoEhCredito: metodoEfetivoEhCredito,
      diaVencimento: compRecord?.dia_vencimento,
      numeroParcela: numParcela,
      totalParcelas: totParcelas,
    })

    const competenciaEfetiva = resRegraUnica.competencia
    let vencimentoRegistradoIso = resRegraUnica.dataVencimentoIso

    if (!metodoEfetivoEhCredito && compRecord) {
      const diaComp = compRecord.dia_vencimento || 10
      const [pAnoStr, pMesStr] = competenciaEfetiva.split('-')
      const pAno = parseInt(pAnoStr, 10)
      const pMesZero = parseInt(pMesStr, 10) - 1
      const dataVenc = despesasService.calcularDataVencimentoNoMes(pAno, pMesZero, diaComp)
      vencimentoRegistradoIso = dataVenc.toISOString()
    }

    // 1. Criar lançamento financeiro
    let lancamento: any
    if (metodoEfetivoEhCredito && contaObj) {
      if (params.comprovanteArquivo) {
        const fdLanc = new FormData()
        fdLanc.append('descricao', params.descricao)
        fdLanc.append('valor', String(params.valorPago))
        fdLanc.append('tipo', 'despesa')
        fdLanc.append('data', `${params.dataPagamento} 12:00:00`)
        fdLanc.append('status', 'pendente')
        fdLanc.append('conta', params.contaId)
        if (params.categoriaId) fdLanc.append('categoria', params.categoriaId)
        if (params.empresaId) fdLanc.append('empresa', params.empresaId)
        if (params.pessoaId) fdLanc.append('pessoa', params.pessoaId)
        fdLanc.append('competencia', competenciaEfetiva)
        fdLanc.append('fatura_paga', 'false')
        fdLanc.append(
          'observacoes',
          params.observacoes ||
            `Despesa no cartão ${contaObj.nome} (integrada à fatura de ${competenciaEfetiva})`,
        )
        fdLanc.append('comprovante', params.comprovanteArquivo)
        lancamento = await pb.collection('lancamentos').create(fdLanc)
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
          competencia: competenciaEfetiva,
          fatura_paga: false,
          observacoes:
            params.observacoes ||
            `Despesa no cartão ${contaObj.nome} (integrada à fatura de ${competenciaEfetiva})`,
        })
      }
    } else {
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
        fdLanc.append('competencia', competenciaEfetiva)
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
          competencia: competenciaEfetiva,
          observacoes: params.observacoes || 'Pagamento registrado diretamente de compromisso',
        })
      }
    }

    let ocorrencia: DespesaOcorrencia
    if (params.comprovanteArquivo) {
      const fdOcorr = new FormData()
      fdOcorr.append('compromisso', params.compromissoId)
      fdOcorr.append('contexto_tipo', params.contextoTipo || 'pessoal')
      if (params.empresaId) fdOcorr.append('empresa', params.empresaId)
      fdOcorr.append('secao', params.secao || 'assinaturas_anuais')
      fdOcorr.append('conta', params.contaId)
      fdOcorr.append('competencia', competenciaEfetiva)
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
      if (params.dizimoPercentual !== undefined) {
        fdOcorr.append('dizimo_percentual', String(params.dizimoPercentual))
      }
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
          competencia: competenciaEfetiva,
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
          dizimo_percentual: params.dizimoPercentual !== undefined ? params.dizimoPercentual : 100,
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
    const isContaCredito = (c: Conta | null | undefined): boolean => {
      if (!c) return false
      const rawFech = Number((c as any).dia_fechamento)
      const temFechamento = !isNaN(rawFech) && rawFech > 0
      return temFechamento && (c.tipo === 'cartao' || contaAceitaCredito(c))
    }

    // 1. Busca conta padrão se informada
    let contaPadraoObj: Conta | null = null
    if (compromisso.conta_padrao) {
      try {
        contaPadraoObj = await pb.collection<Conta>('contas').getOne(compromisso.conta_padrao)
      } catch {
        /* ignore */
      }
    }

    // 2. Busca método de pagamento se informado
    let metodoObj: MetodoPagamento | null = null
    if (compromisso.metodo_pagamento) {
      try {
        metodoObj = await pb
          .collection<MetodoPagamento>('metodos_pagamento')
          .getOne(compromisso.metodo_pagamento, { expand: 'conta_padrao' })
      } catch {
        /* ignore */
      }
    }

    // Se houver método de pagamento explícito E ele NÃO for crédito (ex: Pix, Débito, Boleto),
    // a despesa NÃO entra no ciclo da fatura mesmo que a conta seja cartão.
    if (compromisso.metodo_pagamento || metodoObj) {
      const metodoEhCredito = isMetodoCredito(metodoObj || compromisso.metodo_pagamento)
      if (!metodoEhCredito) {
        return null
      }
    }

    // 3. Se a conta padrão é uma conta de cartão com dia_fechamento, retorna-a imediatamente
    if (contaPadraoObj && isContaCredito(contaPadraoObj)) {
      return contaPadraoObj
    }

    // 4. Fallback secundário: conta padrão expandida a partir do método de pagamento
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
    const isAvulso = compromisso.regra_repeticao === 'avulso'

    const novoValorUnitario =
      isParcelado && compromisso.valor_parcela && compromisso.valor_parcela > 0
        ? compromisso.valor_parcela
        : compromisso.valor_estimado

    // Busca TODAS as ocorrências deste compromisso (previstas, pagas, etc.)
    // REQUISITO DO USUÁRIO: Ao editar a data de compra de um compromisso, as ocorrências já geradas
    // (e seus lançamentos vinculados) DEVEM ser recalculadas pela função única de competência,
    // preservando status de pagamento (paga/parcial), valor pago e anexos.
    const todasOcorrencias = await listAll<DespesaOcorrencia>('despesas_ocorrencias', {
      filter: `compromisso = '${compromisso.id}'`,
    })

    const diaVencimentoCompromisso = compromisso.dia_vencimento

    // Identifica se há conta de cartão associada (direta ou por método de pagamento)
    const contaCartaoObj = await despesasService.obterContaCartaoCompromisso(compromisso)
    const contaEfetivaId = compromisso.conta_padrao || (contaCartaoObj ? contaCartaoObj.id : null)

    // Se for cartão de crédito e tiver data_inicio, verifica se existe ocorrência (prevista OU paga)
    // para o ciclo inicial da fatura; se faltar, cria-a de forma estritamente idempotente.
    if (contaCartaoObj && compromisso.data_inicio) {
      const dataInicioStr = compromisso.data_inicio.slice(0, 10)
      const numParcelaCheck = isParcelado ? compromisso.parcela_inicial || 1 : 0

      // Usa a regra única de competência
      const resInicial = calcularCompetenciaEVencimento({
        dataCompra: dataInicioStr,
        conta: contaCartaoObj,
        metodoEhCredito: true,
        diaVencimento: diaVencimentoCompromisso,
        numeroParcela: isParcelado ? numParcelaCheck : 1,
        totalParcelas: isParcelado ? compromisso.total_parcelas || 1 : 1,
      })

      const jaExisteInicial = todasOcorrencias.some(
        (oc) =>
          oc.competencia === resInicial.competencia &&
          (numParcelaCheck === 0 || oc.numero_parcela === numParcelaCheck),
      )

      if (!jaExisteInicial && todasOcorrencias.length === 0) {
        await pb.collection('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: contaEfetivaId,
          competencia: resInicial.competencia,
          data_vencimento: resInicial.dataVencimentoIso,
          valor_previsto: novoValorUnitario,
          valor_estimado_original: novoValorUnitario,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          dizimo_percentual:
            compromisso.dizimo_percentual !== undefined ? compromisso.dizimo_percentual : 100,
          direcionamento: compromisso.direcionamento || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || null,
          numero_parcela: numParcelaCheck,
          total_parcelas: isParcelado ? compromisso.total_parcelas || 1 : 0,
        })
      }
    }

    const dataCompraBase = compromisso.data_inicio
      ? compromisso.data_inicio.slice(0, 10)
      : compromisso.created
        ? compromisso.created.slice(0, 10)
        : new Date().toISOString().slice(0, 10)

    for (const oc of todasOcorrencias) {
      const updates: Partial<DespesaOcorrencia> = {}
      const isPrevista = oc.status === 'prevista'

      // Só atualiza o valor previsto se a ocorrência estiver prevista e não tiver sido ajustada manualmente
      if (isPrevista && !oc.valor_ajustado_manualmente) {
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
      if (
        compromisso.dizimo_percentual !== undefined &&
        oc.dizimo_percentual !== compromisso.dizimo_percentual
      ) {
        updates.dizimo_percentual = compromisso.dizimo_percentual
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

      // Aplica a REGRA ÚNICA para competência e vencimento em TODAS as ocorrências (previstas e pagas)
      let novaCompetencia: string | undefined
      let novaDataVencimentoIso: string | undefined

      if (isParcelado) {
        const pNum = oc.numero_parcela && oc.numero_parcela > 0 ? oc.numero_parcela : 1
        const res = calcularCompetenciaEVencimento({
          dataCompra: dataCompraBase,
          conta: contaCartaoObj,
          metodoEhCredito: !!contaCartaoObj,
          diaVencimento: diaVencimentoCompromisso,
          numeroParcela: pNum,
          totalParcelas: compromisso.total_parcelas || 1,
        })
        novaCompetencia = res.competencia
        novaDataVencimentoIso = res.dataVencimentoIso
      } else if (isAvulso) {
        const res = calcularCompetenciaEVencimento({
          dataCompra: dataCompraBase,
          conta: contaCartaoObj,
          metodoEhCredito: !!contaCartaoObj,
          diaVencimento: diaVencimentoCompromisso,
          numeroParcela: 1,
          totalParcelas: 1,
        })
        novaCompetencia = res.competencia
        novaDataVencimentoIso = res.dataVencimentoIso
      } else if (contaCartaoObj) {
        // Recorrente no cartão: a competência da ocorrência deve ter seu vencimento
        // alinhado ao dia_vencimento do ciclo da fatura
        if (oc.competencia && oc.competencia.includes('-')) {
          const expectedVenc = calcularVencimentoFatura(contaCartaoObj, oc.competencia)
          novaDataVencimentoIso = `${expectedVenc}T12:00:00.000Z`
        }
      } else if (diaVencimentoCompromisso && oc.competencia && oc.competencia.includes('-')) {
        // Recorrente não-cartão
        const [yStr, mStr] = oc.competencia.split('-')
        const y = parseInt(yStr, 10)
        const m = parseInt(mStr, 10) - 1
        if (!isNaN(y) && !isNaN(m)) {
          const expectedDate = despesasService.calcularDataVencimentoNoMes(
            y,
            m,
            diaVencimentoCompromisso,
          )
          novaDataVencimentoIso = expectedDate.toISOString()
        }
      }

      if (novaCompetencia && oc.competencia !== novaCompetencia) {
        updates.competencia = novaCompetencia
      }
      if (novaDataVencimentoIso) {
        const currentDueStr = oc.data_vencimento ? oc.data_vencimento.slice(0, 10) : ''
        const newDueStr = novaDataVencimentoIso.slice(0, 10)
        if (currentDueStr !== newDueStr) {
          updates.data_vencimento = novaDataVencimentoIso
        }
      }

      const competenciaEfetiva = novaCompetencia || oc.competencia

      // Se houver atualizações na ocorrência, persiste mantendo status, valor_pago e data_pagamento intactos
      if (Object.keys(updates).length > 0) {
        await pb.collection('despesas_ocorrencias').update(oc.id, updates)
      }

      // RECALCULO DO LANÇAMENTO VINCULADO:
      // Se a ocorrência possuir lançamento vinculado, realinha a competência do lançamento
      // e alinha a data à nova realidade da compra/ciclo, preservando valor, status e comprovantes.
      const lancamentoId =
        typeof oc.lancamento === 'object' && oc.lancamento !== null
          ? (oc.lancamento as any).id
          : oc.lancamento

      if (lancamentoId) {
        try {
          const lancAtual = await pb.collection<Lancamento>('lancamentos').getOne(lancamentoId)
          const updatesLanc: Partial<Lancamento> = {}

          if (competenciaEfetiva && lancAtual.competencia !== competenciaEfetiva) {
            updatesLanc.competencia = competenciaEfetiva
          }

          // Para compras no cartão de crédito, alinha a data do lançamento à data da compra atualizada do compromisso
          if (contaCartaoObj && compromisso.data_inicio) {
            const novaDataStr = `${dataCompraBase} 12:00:00`
            const lancDataCurrentStr = (lancAtual.data || '').slice(0, 10)
            if (lancDataCurrentStr !== dataCompraBase) {
              updatesLanc.data = novaDataStr
            }
          }

          if (Object.keys(updatesLanc).length > 0) {
            await pb.collection('lancamentos').update(lancamentoId, updatesLanc)
          }
        } catch (errLanc) {
          console.warn(
            `[sincronizarOcorrenciasCompromisso] Falha ao sincronizar lançamento vinculado ${lancamentoId}:`,
            errLanc,
          )
        }
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

      const res = calcularCompetenciaEVencimento({
        dataCompra: dataCompraStr,
        conta: contaCartaoObj,
        metodoEhCredito: !!contaCartaoObj,
        diaVencimento: compromisso.dia_vencimento,
        numeroParcela: 1,
        totalParcelas: 1,
      })

      let compStr = res.competencia
      let dueDateIso = res.dataVencimentoIso

      // Limite inferior no mês/ciclo de criação (anti-retroatividade para novas gerações)
      if (contaCartaoObj && compromisso.created) {
        const cicloCreated = calcularFaturaCartao(contaCartaoObj, compromisso.created.slice(0, 10))
        if (compStr < cicloCreated.competencia) {
          compStr = cicloCreated.competencia
          dueDateIso = `${cicloCreated.dataVencimento}T12:00:00.000Z`
        }
      } else if (!contaCartaoObj && compromisso.created && compromisso.created.length >= 7) {
        const compCreated = compromisso.created.slice(0, 7)
        if (compStr < compCreated) {
          compStr = compCreated
          const [cYStr, cMStr] = compCreated.split('-')
          const day = compromisso.dia_vencimento || parseInt(dataCompraStr.slice(8, 10), 10) || 10
          dueDateIso = despesasService
            .calcularDataVencimentoNoMes(parseInt(cYStr, 10), parseInt(cMStr, 10) - 1, day)
            .toISOString()
        }
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
          dizimo_percentual:
            compromisso.dizimo_percentual !== undefined ? compromisso.dizimo_percentual : 100,
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

      for (let p = inicial; p <= total; p++) {
        const res = calcularCompetenciaEVencimento({
          dataCompra: dataCompraStr,
          conta: contaCartaoObj,
          metodoEhCredito: !!contaCartaoObj,
          diaVencimento: compromisso.dia_vencimento,
          numeroParcela: p,
          totalParcelas: total,
        })

        const exists = await hasExistingOcorrencia({ numero_parcela: p })

        if (!exists) {
          const newRecord = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create({
            compromisso: compromisso.id,
            contexto_tipo: compromisso.contexto_tipo,
            empresa: compromisso.empresa || null,
            secao: compromisso.secao,
            conta: contaIdEfetiva,
            competencia: res.competencia,
            numero_parcela: p,
            total_parcelas: total,
            data_vencimento: res.dataVencimentoIso,
            valor_previsto: valorUnitario,
            valor_estimado_original: valorUnitario,
            valor_ajustado_manualmente: false,
            status: 'prevista',
            dizimo: compromisso.dizimo || false,
            tipo_dizimo: compromisso.tipo_dizimo || null,
            dizimo_percentual:
              compromisso.dizimo_percentual !== undefined ? compromisso.dizimo_percentual : 100,
            direcionamento: compromisso.direcionamento || null,
            link_pagamento: compromisso.link_pagamento || null,
            observacoes: `Parcela ${p}/${total}`,
          })
          if (cachedOcorrencias) {
            cachedOcorrencias.push(newRecord)
          }
        }
      }
      return
    }

    // 3. Pagamento Anual
    if (isAnual) {
      const now = new Date()
      const rawStart = new Date(compromisso.data_inicio)
      const mesOriginal = rawStart.getUTCMonth()
      const diaOriginal = rawStart.getUTCDate() || 10

      // Limite inferior estrito: nunca gerar ocorrência com competência < mês de criação do compromisso.
      const compCreatedMonth =
        compromisso.created && compromisso.created.length >= 7
          ? compromisso.created.slice(0, 7)
          : `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`

      let targetYear = rawStart.getUTCFullYear()
      let dataCompraAnual = `${targetYear}-${String(mesOriginal + 1).padStart(2, '0')}-${String(diaOriginal).padStart(2, '0')}`
      let res = calcularCompetenciaEVencimento({
        dataCompra: dataCompraAnual,
        conta: contaCartaoObj,
        metodoEhCredito: !!contaCartaoObj,
        diaVencimento: compromisso.dia_vencimento,
        numeroParcela: 1,
        totalParcelas: 1,
      })

      // Se a data inicial do compromisso anual for anterior ao mês de criação, avança para o próximo ciclo válido
      while (res.competencia < compCreatedMonth) {
        targetYear += 1
        dataCompraAnual = `${targetYear}-${String(mesOriginal + 1).padStart(2, '0')}-${String(diaOriginal).padStart(2, '0')}`
        res = calcularCompetenciaEVencimento({
          dataCompra: dataCompraAnual,
          conta: contaCartaoObj,
          metodoEhCredito: !!contaCartaoObj,
          diaVencimento: compromisso.dia_vencimento,
          numeroParcela: 1,
          totalParcelas: 1,
        })
      }

      // Se targetCompetencias foram passadas explicitamente e houver alguma válida >= compCreatedMonth, respeita
      if (targetCompetencias && targetCompetencias.length > 0) {
        const valids = targetCompetencias.filter((tc) => tc >= compCreatedMonth)
        if (valids.length > 0) {
          const [yStr, mStr] = valids[0].split('-')
          targetYear = parseInt(yStr, 10)
          const targetM = parseInt(mStr, 10)
          dataCompraAnual = `${targetYear}-${String(targetM).padStart(2, '0')}-${String(diaOriginal).padStart(2, '0')}`
          res = calcularCompetenciaEVencimento({
            dataCompra: dataCompraAnual,
            conta: contaCartaoObj,
            metodoEhCredito: !!contaCartaoObj,
            diaVencimento: compromisso.dia_vencimento,
            numeroParcela: 1,
            totalParcelas: 1,
          })
        }
      }

      const compStr = res.competencia
      const exists = await hasExistingOcorrencia({ competencia: compStr })
      if (!exists) {
        const newRecord = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create({
          compromisso: compromisso.id,
          contexto_tipo: compromisso.contexto_tipo,
          empresa: compromisso.empresa || null,
          secao: compromisso.secao,
          conta: contaIdEfetiva,
          competencia: compStr,
          data_vencimento: res.dataVencimentoIso,
          valor_previsto: compromisso.valor_estimado,
          valor_estimado_original: compromisso.valor_estimado,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          dizimo_percentual:
            compromisso.dizimo_percentual !== undefined ? compromisso.dizimo_percentual : 100,
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
      // O ciclo da fatura inicial é calculado a partir de data_inicio usando a regra única
      const dataInicioStr = compromisso.data_inicio
        ? compromisso.data_inicio.slice(0, 10)
        : compromisso.created
          ? compromisso.created.slice(0, 10)
          : new Date().toISOString().slice(0, 10)

      const resInicial = calcularCompetenciaEVencimento({
        dataCompra: dataInicioStr,
        conta: contaCartaoObj,
        metodoEhCredito: true,
        diaVencimento: compromisso.dia_vencimento,
        numeroParcela: 1,
        totalParcelas: 1,
      })
      let minCompStr = resInicial.competencia

      if (compromisso.created) {
        const cicloCreated = calcularFaturaCartao(contaCartaoObj, compromisso.created.slice(0, 10))
        if (cicloCreated.competencia > minCompStr) {
          minCompStr = cicloCreated.competencia
        }
      }

      const startCompStr = minCompStr

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
          // Vencimento da fatura do ciclo no cartão
          const vencimentoFatura = calcularVencimentoFatura(contaCartaoObj, compStr)
          const dueDateIso = `${vencimentoFatura}T12:00:00.000Z`

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
            dizimo_percentual:
              compromisso.dizimo_percentual !== undefined ? compromisso.dizimo_percentual : 100,
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
    // Extrai o mês e ano de início de forma robusta e independente de fuso,
    // garantindo que nunca seja anterior ao mês de criação do compromisso.
    const startCompStr = (() => {
      let candidate = ''
      if (compromisso.data_inicio) {
        const str = String(compromisso.data_inicio).trim()
        if (str.length >= 7 && str[4] === '-') {
          candidate = str.slice(0, 7)
        } else {
          const d = new Date(str)
          if (!isNaN(d.getTime())) {
            candidate = `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`
          }
        }
      }
      if (!candidate) {
        const now = new Date()
        candidate = `${now.getUTCFullYear()}-${(now.getUTCMonth() + 1).toString().padStart(2, '0')}`
      }

      if (compromisso.created && compromisso.created.length >= 7) {
        const createdMonth = compromisso.created.slice(0, 7)
        if (candidate < createdMonth) {
          return createdMonth
        }
      }
      return candidate
    })()

    const meses = (() => {
      // Determina a competência final desejada:
      // se targetCompetencias foi informada, cobre continuamente do startCompStr até a maior competência pedida.
      // Se não, cobre continuamente do startCompStr até o mês atual + 3.
      const [sYStr, sMStr] = startCompStr.split('-')
      const startYear = parseInt(sYStr, 10)
      const startMonth = parseInt(sMStr, 10) - 1

      let targetEndYear: number
      let targetEndMonth: number

      if (targetCompetencias && targetCompetencias.length > 0) {
        // Encontra a maior competência da lista requisitada
        const sortedTargets = [...targetCompetencias].sort()
        const maxTarget = sortedTargets[sortedTargets.length - 1]
        const [maxYStr, maxMStr] = maxTarget.split('-')
        targetEndYear = parseInt(maxYStr, 10)
        targetEndMonth = parseInt(maxMStr, 10) - 1
      } else {
        const now = new Date()
        targetEndYear = now.getUTCFullYear()
        targetEndMonth = now.getUTCMonth() + 3 // mês atual + 3
      }

      const targetEndDate = new Date(Date.UTC(targetEndYear, targetEndMonth, 1))
      const list: string[] = []
      let cursor = new Date(Date.UTC(startYear, startMonth, 1))

      while (cursor.getTime() <= targetEndDate.getTime()) {
        const cY = cursor.getUTCFullYear()
        const cM = cursor.getUTCMonth()
        const compFormatted = `${cY}-${String(cM + 1).padStart(2, '0')}`
        if (!list.includes(compFormatted)) {
          list.push(compFormatted)
        }
        cursor = new Date(Date.UTC(cY, cM + 1, 1))
      }

      // Se houver alguma competência adicional específica em targetCompetencias que exceda ou difira, inclui-a também
      if (targetCompetencias && targetCompetencias.length > 0) {
        for (const tComp of targetCompetencias) {
          if (tComp >= startCompStr && !list.includes(tComp)) {
            list.push(tComp)
          }
        }
        list.sort()
      }

      return list
    })()

    const day = compromisso.dia_vencimento || 10

    for (const compStr of meses) {
      // NUNCA gerar ocorrência anterior ao mês/competência de data_inicio do compromisso
      // e nunca pular meses cujo dia_vencimento <= dia_atual:
      // a ocorrência de competência vencida nasce como status 'prevista' e aparecerá nas atrasadas.
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
          dizimo_percentual:
            compromisso.dizimo_percentual !== undefined ? compromisso.dizimo_percentual : 100,
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
