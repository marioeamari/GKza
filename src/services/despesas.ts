import type { RecordListOptions, RecordOptions } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import type {
  Conta,
  ContextoTipo,
  DespesaCompromisso,
  DespesaOcorrencia,
  MetodoPagamento,
  SecaoDespesa,
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
      expand:
        'empresa,pessoa,titular_pessoa,titular_empresa,categoria,tag,tipo_despesa,metodo_pagamento,conta_padrao,tipo_dizimo',
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
        'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,compromisso.titular_pessoa,compromisso.titular_empresa,compromisso.conta_padrao,conta,tipo_dizimo,lancamento',
      ...options,
    }),
  saveOcorrencia: (data: Partial<DespesaOcorrencia>, id?: string, options?: RecordOptions) =>
    id
      ? pb.collection<DespesaOcorrencia>('despesas_ocorrencias').update(id, data, options)
      : pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create(data, options),
  deleteOcorrencia: async (id: string) => {
    // Busca a ocorrência para verificar se há lançamento financeiro vinculado
    try {
      const oc = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').getOne(id)
      if (oc.lancamento) {
        try {
          await pb.collection('lancamentos').delete(oc.lancamento)
        } catch (e) {
          console.warn('Lançamento vinculado já havia sido removido ou não encontrado:', e)
        }
      }
    } catch (e) {
      console.warn('Ocorrência não encontrada antes de excluir:', e)
    }
    return pb.collection('despesas_ocorrencias').delete(id)
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

    let lancamentoId: string | null = null
    let lancamento: any = null

    if (isCartao && contaObj) {
      // Para cartão de crédito: a despesa entra na fatura do cartão referente ao ciclo.
      // O lançamento financeiro é criado como pendente de fatura (sem saída imediata de caixa)
      // até que a fatura inteira seja baixada/paga.
      const { calcularFaturaCartao } = await import('@/lib/cartao-fatura')
      const ciclo = calcularFaturaCartao(contaObj, params.dataPagamento)

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
      lancamentoId = lancamento.id
    } else {
      // 1. Criar lançamento de despesa convencional com saída de caixa
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
      lancamentoId = lancamento.id
    }

    // 2. Atualizar ocorrência (permitindo ajustar valor real da ocorrência sem afetar as demais)
    const ocorrAtual = await pb
      .collection<DespesaOcorrencia>('despesas_ocorrencias')
      .getOne(params.ocorrenciaId)
    const diferencaValor = params.valorPago !== ocorrAtual.valor_previsto

    // Se a ocorrência foi paga com data retroativa diferente de sua competência original,
    // atualizamos a competência se for uma assinatura ou ajuste manual correspondente
    const compDataPag = params.dataPagamento.slice(0, 7)
    const updatesOcorr: Partial<DespesaOcorrencia> = {
      status: 'paga',
      valor_pago: params.valorPago,
      valor_previsto: params.valorPago, // valor real da ocorrência atualizado sem mudar as demais
      valor_ajustado_manualmente: diferencaValor,
      data_pagamento: `${params.dataPagamento} 12:00:00`,
      conta: params.contaId,
      lancamento: lancamentoId,
    }

    // Se a ocorrência era de competência diferente e for assinatura anual ou sem parcelamento rígido
    if (
      ocorrAtual.secao === 'assinaturas_anuais' &&
      compDataPag &&
      compDataPag !== ocorrAtual.competencia
    ) {
      updatesOcorr.competencia = compDataPag
    }

    const ocorr = await pb
      .collection<DespesaOcorrencia>('despesas_ocorrencias')
      .update(params.ocorrenciaId, updatesOcorr, {
        expand:
          'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
      })

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
    descricao: string
    secao?: SecaoDespesa
    contextoTipo?: ContextoTipo
    dizimo?: boolean
    tipoDizimoId?: string
  }) => {
    const compStr = params.dataPagamento.slice(0, 7) // 'YYYY-MM'

    // 1. Criar lançamento financeiro
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
      observacoes: params.observacoes || 'Pagamento registrado diretamente de compromisso',
    })

    // 2. Criar ocorrência já como 'paga'
    const ocorrencia = await pb.collection<DespesaOcorrencia>('despesas_ocorrencias').create(
      {
        compromisso: params.compromissoId,
        contexto_tipo: params.contextoTipo || 'pessoal',
        empresa: params.empresaId || null,
        secao: params.secao || 'assinaturas_anuais',
        conta: params.contaId,
        competencia: compStr,
        data_vencimento: `${params.dataPagamento} 12:00:00.000Z`,
        data_pagamento: `${params.dataPagamento} 12:00:00`,
        valor_previsto: params.valorPago,
        valor_pago: params.valorPago,
        valor_estimado_original: params.valorPago,
        valor_ajustado_manualmente: false,
        status: 'paga',
        lancamento: lancamento.id,
        dizimo: params.dizimo || false,
        tipo_dizimo: params.tipoDizimoId || null,
        observacoes: params.observacoes || null,
      },
      {
        expand:
          'compromisso,compromisso.tag,compromisso.categoria,compromisso.tipo_despesa,compromisso.metodo_pagamento,conta,tipo_dizimo,lancamento',
      },
    )

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

    for (const oc of ocorrenciasPrevistas) {
      const updates: Partial<DespesaOcorrencia> = {}

      // Só atualiza o valor se a ocorrência não tiver sido ajustada manualmente
      if (!oc.valor_ajustado_manualmente) {
        updates.valor_previsto = novoValorUnitario
        updates.valor_estimado_original = novoValorUnitario
      }

      // Sincroniza dados estruturais com o compromisso atualizado
      if (compromisso.conta_padrao && oc.conta !== compromisso.conta_padrao) {
        updates.conta = compromisso.conta_padrao
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
        compromisso.link_pagamento !== undefined &&
        oc.link_pagamento !== compromisso.link_pagamento
      ) {
        updates.link_pagamento = compromisso.link_pagamento || null
      }

      // Se houver dia_vencimento e a ocorrência tiver competência, verifica se a data de vencimento precisa alinhar
      if (diaVencimentoCompromisso && oc.competencia && oc.competencia.includes('-')) {
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
  ) => {
    const isParcelado =
      compromisso.modalidade_parcelamento === 'parcelado' ||
      compromisso.regra_repeticao === 'parcelado'
    const isAvulso = compromisso.regra_repeticao === 'avulso'
    const isAnual = compromisso.regra_repeticao === 'anual'

    const valorUnitario =
      compromisso.valor_parcela && compromisso.valor_parcela > 0
        ? compromisso.valor_parcela
        : compromisso.valor_estimado

    // 1. Pagamento Avulso / Pontual (à vista, uma única ocorrência na data de início)
    if (isAvulso) {
      const startDate = new Date(compromisso.data_inicio)
      const compStr = `${startDate.getUTCFullYear()}-${(startDate.getUTCMonth() + 1).toString().padStart(2, '0')}`
      const existing = await pb.collection('despesas_ocorrencias').getList(1, 1, {
        filter: `compromisso = '${compromisso.id}'`,
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
          valor_estimado_original: compromisso.valor_estimado,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || 'Pagamento único / avulso',
        })
      }
      return
    }

    // 2. Pagamento Parcelado em N vezes (com fim definido)
    if (isParcelado) {
      const total = compromisso.total_parcelas || 1
      const inicial = compromisso.parcela_inicial || 1
      const startDate = new Date(compromisso.data_inicio)
      const day = compromisso.dia_vencimento || startDate.getUTCDate() || 10

      for (let p = inicial; p <= total; p++) {
        const offset = p - inicial
        const ano = startDate.getUTCFullYear()
        const mes = startDate.getUTCMonth() + offset
        const dueDate = despesasService.calcularDataVencimentoNoMes(ano, mes, day)
        const compStr = `${dueDate.getUTCFullYear()}-${(dueDate.getUTCMonth() + 1).toString().padStart(2, '0')}`

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
            valor_previsto: valorUnitario,
            valor_estimado_original: valorUnitario,
            valor_ajustado_manualmente: false,
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
          data_vencimento: dueDate.toISOString(),
          valor_previsto: compromisso.valor_estimado,
          valor_estimado_original: compromisso.valor_estimado,
          valor_ajustado_manualmente: false,
          status: 'prevista',
          dizimo: compromisso.dizimo || false,
          tipo_dizimo: compromisso.tipo_dizimo || null,
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || 'Assinatura anual',
        })
      }
      return
    }

    // 4. Regra Mensal Recorrente (contínua até ser encerrada)
    // Extrai o mês e ano de início de forma robusta e independente de fuso
    const startCompStr = (() => {
      if (compromisso.data_inicio) {
        // Se vier como 'YYYY-MM-DD...' ou ISO
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
            const y = now.getUTCFullYear()
            const m = now.getUTCMonth()
            const list: string[] = []
            // Gera a partir do mês atual até 3 meses à frente (nunca retroativo com i = -1)
            for (let i = 0; i <= 3; i++) {
              const d = new Date(Date.UTC(y, m + i, 1))
              list.push(
                `${d.getUTCFullYear()}-${(d.getUTCMonth() + 1).toString().padStart(2, '0')}`,
              )
            }
            return list
          })()

    const day = compromisso.dia_vencimento || 10

    for (const compStr of meses) {
      // NUNCA gerar ocorrência anterior ao mês/competência de data_inicio do compromisso
      if (compStr < startCompStr) {
        continue
      }

      const existing = await pb.collection('despesas_ocorrencias').getList(1, 1, {
        filter: `compromisso = '${compromisso.id}' && competencia = '${compStr}'`,
      })
      if (existing.totalItems === 0) {
        const [yStr, mStr] = compStr.split('-')
        const y = parseInt(yStr, 10)
        const m = parseInt(mStr, 10) - 1
        const dueDate = despesasService.calcularDataVencimentoNoMes(y, m, day)

        await pb.collection('despesas_ocorrencias').create({
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
          link_pagamento: compromisso.link_pagamento || null,
          observacoes: compromisso.observacoes || null,
        })
      }
    }
  },
}
