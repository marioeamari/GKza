import type { RecordListOptions } from 'pocketbase'
import pb from '@/lib/pocketbase/client'
import { despesasService } from '@/services/despesas'
import type {
  DespesaCompromisso,
  Lancamento,
  ModalidadeParcelamento,
  RegraRepeticao,
  SecaoDespesa,
  TelegramRegistroPendente,
  TipoValorDespesa,
  TitularTipo,
} from '@/types/domain'

export interface TriagemLancamentoInput {
  descricao: string
  valor: number
  tipo: 'receita' | 'despesa'
  data: string
  conta: string
  categoria: string
  empresa?: string
  pessoa?: string
  observacoes?: string
}

export interface TriagemDespesaInput {
  descricao: string
  fornecedor?: string
  secao: SecaoDespesa
  regra_repeticao: RegraRepeticao
  categoria?: string
  tag?: string // Destino da despesa / Centro de custo
  tipo_despesa?: string
  metodo_pagamento?: string
  conta_padrao?: string
  pessoa?: string
  empresa?: string
  contexto_tipo?: 'pessoal' | 'empresa'
  titular_tipo?: TitularTipo
  titular_pessoa?: string
  titular_empresa?: string
  tipo_valor?: TipoValorDespesa
  modalidade_parcelamento?: ModalidadeParcelamento
  total_parcelas?: number
  parcela_inicial?: number
  valor_parcela?: number
  dia_vencimento?: number
  regra_vencimento_texto?: string
  data_inicio: string
  data_fim_calculada?: string
  valor_estimado: number
  link_pagamento?: string
  dizimo?: boolean
  tipo_dizimo?: string
  ativo?: boolean
  observacoes?: string
}

export const telegramPendentesService = {
  listPendentes: (options?: RecordListOptions) =>
    pb.collection<TelegramRegistroPendente>('telegram_registros_pendentes').getFullList({
      sort: '-created',
      filter: "status = 'pendente'",
      expand:
        'conta,categoria,empresa,pessoa,fornecedor,metodo_pagamento,lancamento_gerado,compromisso_gerado',
      ...options,
    }),

  pagePendentes: (page = 1, perPage = 20, options?: RecordListOptions) =>
    pb.collection<TelegramRegistroPendente>('telegram_registros_pendentes').getList(page, perPage, {
      sort: '-created',
      expand:
        'conta,categoria,empresa,pessoa,fornecedor,metodo_pagamento,lancamento_gerado,compromisso_gerado',
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

  // 1. Destino: Apenas Lançamento no Caixa Real
  triarComoLancamento: async (pendenteId: string, input: TriagemLancamentoInput) => {
    const lancamento = await pb.collection<Lancamento>('lancamentos').create({
      descricao: input.descricao,
      valor: input.valor,
      tipo: input.tipo,
      data: input.data,
      status: 'pago',
      conta: input.conta,
      categoria: input.categoria,
      empresa: input.empresa || '',
      pessoa: input.pessoa || '',
      observacoes: input.observacoes || 'Importado via Telegram (triagem lançamento)',
    })

    await pb.collection('telegram_registros_pendentes').update(pendenteId, {
      status: 'aprovado',
      lancamento_gerado: lancamento.id,
      conta: input.conta,
      categoria: input.categoria,
      descricao: input.descricao,
      valor: input.valor,
      data: input.data,
      empresa: input.empresa || '',
      pessoa: input.pessoa || '',
    })

    return lancamento
  },

  // 2. Destino: Apenas Despesa (Compromisso Recorrente em /despesas)
  triarComoDespesa: async (pendenteId: string, input: TriagemDespesaInput) => {
    const isParcelado =
      input.modalidade_parcelamento === 'parcelado' || input.regra_repeticao === 'parcelado'
    const totalParcelasNum = isParcelado ? Math.max(1, Number(input.total_parcelas) || 1) : 1
    const parcelaInicialNum = isParcelado ? Math.max(1, Number(input.parcela_inicial) || 1) : 1
    const titularTipo = input.titular_tipo || (input.empresa ? 'cnpj' : 'cpf')

    const payload: Partial<DespesaCompromisso> = {
      descricao: input.descricao.trim(),
      fornecedor: input.fornecedor?.trim() || (null as unknown as string),
      categoria: input.categoria || (null as unknown as string),
      tag: input.tag || (null as unknown as string),
      secao: input.secao,

      titular_tipo: titularTipo,
      titular_pessoa:
        titularTipo === 'cpf' && (input.titular_pessoa || input.pessoa)
          ? input.titular_pessoa || input.pessoa
          : (null as unknown as string),
      titular_empresa:
        titularTipo === 'cnpj' && (input.titular_empresa || input.empresa)
          ? input.titular_empresa || input.empresa
          : (null as unknown as string),

      contexto_tipo: titularTipo === 'cnpj' ? 'empresa' : 'pessoal',
      empresa:
        titularTipo === 'cnpj' && (input.titular_empresa || input.empresa)
          ? input.titular_empresa || input.empresa
          : (null as unknown as string),
      pessoa:
        input.pessoa ||
        (titularTipo === 'cpf' ? input.titular_pessoa : null) ||
        (null as unknown as string),

      // Se parcelado, regra_repeticao no PB é 'mensal'
      regra_repeticao: isParcelado ? 'mensal' : input.regra_repeticao,
      tipo_valor: input.tipo_valor || 'fixo',
      modalidade_parcelamento:
        input.modalidade_parcelamento || (isParcelado ? 'parcelado' : 'a_vista'),
      total_parcelas: totalParcelasNum,
      parcela_inicial: parcelaInicialNum,
      valor_parcela: isParcelado ? Number(input.valor_estimado) : (null as unknown as number),
      dia_vencimento:
        input.regra_repeticao === 'avulso'
          ? parseInt(input.data_inicio.slice(8, 10), 10) || 10
          : Number(input.dia_vencimento) || 10,
      regra_vencimento_texto:
        input.regra_vencimento_texto ||
        (input.regra_repeticao === 'avulso'
          ? 'Único'
          : isParcelado
            ? `${input.dia_vencimento || 10}/m (${totalParcelasNum}x)`
            : `${input.dia_vencimento || 10}/m`),
      data_inicio: `${input.data_inicio} 00:00:00.000Z`,
      data_fim_calculada: input.data_fim_calculada || (null as unknown as string),
      valor_estimado: Number(input.valor_estimado),

      conta_padrao: input.conta_padrao || (null as unknown as string),
      metodo_pagamento: input.metodo_pagamento || (null as unknown as string),
      link_pagamento: input.link_pagamento || (null as unknown as string),
      dizimo: input.dizimo || false,
      tipo_dizimo:
        input.dizimo && input.tipo_dizimo ? input.tipo_dizimo : (null as unknown as string),
      ativo: input.ativo !== false,
      observacoes: input.observacoes || (null as unknown as string),
    }

    const compromisso = await despesasService.saveCompromisso(payload)
    await despesasService.gerarOcorrenciasParaCompromisso(compromisso)

    // Atualiza o registro pendente
    await pb.collection('telegram_registros_pendentes').update(pendenteId, {
      status: 'aprovado',
      compromisso_gerado: compromisso.id,
      conta: input.conta_padrao || '',
      categoria: input.categoria || '',
      descricao: input.descricao,
      valor: input.valor_estimado,
      empresa: input.empresa || input.titular_empresa || '',
      pessoa: input.pessoa || input.titular_pessoa || '',
    })

    return compromisso
  },

  // 3. Destino: Ambos (Cria o Lançamento do Caixa E o Compromisso Recorrente)
  triarComoAmbos: async (
    pendenteId: string,
    lancamentoInput: TriagemLancamentoInput,
    despesaInput: TriagemDespesaInput,
  ) => {
    // A. Cria o compromisso e suas ocorrências
    const isParcelado =
      despesaInput.modalidade_parcelamento === 'parcelado' ||
      despesaInput.regra_repeticao === 'parcelado'
    const totalParcelasNum = isParcelado ? Math.max(1, Number(despesaInput.total_parcelas) || 1) : 1
    const parcelaInicialNum = isParcelado
      ? Math.max(1, Number(despesaInput.parcela_inicial) || 1)
      : 1
    const titularTipo = despesaInput.titular_tipo || (despesaInput.empresa ? 'cnpj' : 'cpf')

    const payloadCompromisso: Partial<DespesaCompromisso> = {
      descricao: despesaInput.descricao.trim(),
      fornecedor: despesaInput.fornecedor?.trim() || (null as unknown as string),
      categoria: despesaInput.categoria || (null as unknown as string),
      tag: despesaInput.tag || (null as unknown as string),
      secao: despesaInput.secao,

      titular_tipo: titularTipo,
      titular_pessoa:
        titularTipo === 'cpf' && (despesaInput.titular_pessoa || despesaInput.pessoa)
          ? despesaInput.titular_pessoa || despesaInput.pessoa
          : (null as unknown as string),
      titular_empresa:
        titularTipo === 'cnpj' && (despesaInput.titular_empresa || despesaInput.empresa)
          ? despesaInput.titular_empresa || despesaInput.empresa
          : (null as unknown as string),

      contexto_tipo: titularTipo === 'cnpj' ? 'empresa' : 'pessoal',
      empresa:
        titularTipo === 'cnpj' && (despesaInput.titular_empresa || despesaInput.empresa)
          ? despesaInput.titular_empresa || despesaInput.empresa
          : (null as unknown as string),
      pessoa:
        despesaInput.pessoa ||
        (titularTipo === 'cpf' ? despesaInput.titular_pessoa : null) ||
        (null as unknown as string),

      // Se parcelado, regra_repeticao no PB é 'mensal'
      regra_repeticao: isParcelado ? 'mensal' : despesaInput.regra_repeticao,
      tipo_valor: despesaInput.tipo_valor || 'fixo',
      modalidade_parcelamento:
        despesaInput.modalidade_parcelamento || (isParcelado ? 'parcelado' : 'a_vista'),
      total_parcelas: totalParcelasNum,
      parcela_inicial: parcelaInicialNum,
      valor_parcela: isParcelado
        ? Number(despesaInput.valor_estimado)
        : (null as unknown as number),
      dia_vencimento:
        despesaInput.regra_repeticao === 'avulso'
          ? parseInt(despesaInput.data_inicio.slice(8, 10), 10) || 10
          : Number(despesaInput.dia_vencimento) || 10,
      regra_vencimento_texto:
        despesaInput.regra_vencimento_texto ||
        (despesaInput.regra_repeticao === 'avulso'
          ? 'Único'
          : isParcelado
            ? `${despesaInput.dia_vencimento || 10}/m (${totalParcelasNum}x)`
            : `${despesaInput.dia_vencimento || 10}/m`),
      data_inicio: `${despesaInput.data_inicio} 00:00:00.000Z`,
      data_fim_calculada: despesaInput.data_fim_calculada || (null as unknown as string),
      valor_estimado: Number(despesaInput.valor_estimado),

      conta_padrao: despesaInput.conta_padrao || (null as unknown as string),
      metodo_pagamento: despesaInput.metodo_pagamento || (null as unknown as string),
      link_pagamento: despesaInput.link_pagamento || (null as unknown as string),
      dizimo: despesaInput.dizimo || false,
      tipo_dizimo:
        despesaInput.dizimo && despesaInput.tipo_dizimo
          ? despesaInput.tipo_dizimo
          : (null as unknown as string),
      ativo: despesaInput.ativo !== false,
      observacoes: despesaInput.observacoes || (null as unknown as string),
    }

    const compromisso = await despesasService.saveCompromisso(payloadCompromisso)
    await despesasService.gerarOcorrenciasParaCompromisso(compromisso)

    // B. Cria o lançamento no caixa oficial
    const lancamento = await pb.collection<Lancamento>('lancamentos').create({
      descricao: lancamentoInput.descricao,
      valor: lancamentoInput.valor,
      tipo: lancamentoInput.tipo,
      data: lancamentoInput.data,
      status: 'pago',
      conta: lancamentoInput.conta,
      categoria: lancamentoInput.categoria,
      empresa: lancamentoInput.empresa || '',
      pessoa: lancamentoInput.pessoa || '',
      observacoes:
        lancamentoInput.observacoes ||
        `Importado via Telegram (compromisso: ${compromisso.descricao})`,
    })

    // C. Atualiza o registro pendente vinculando ambos
    await pb.collection('telegram_registros_pendentes').update(pendenteId, {
      status: 'aprovado',
      lancamento_gerado: lancamento.id,
      compromisso_gerado: compromisso.id,
      conta: lancamentoInput.conta,
      categoria: lancamentoInput.categoria,
      descricao: lancamentoInput.descricao,
      valor: lancamentoInput.valor,
      data: lancamentoInput.data,
      empresa: lancamentoInput.empresa || '',
      pessoa: lancamentoInput.pessoa || '',
    })

    return { lancamento, compromisso }
  },

  // Método legado compatível para chamadas anteriores
  aprovarELancar: async (pendenteId: string, lancamentoData: TriagemLancamentoInput) => {
    return telegramPendentesService.triarComoLancamento(pendenteId, lancamentoData)
  },
}
