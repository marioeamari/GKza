import { calcularCompetenciaEVencimento, calcularVencimentoFatura } from '@/lib/cartao-fatura'
import type {
  Conta,
  DespesaCompromisso,
  DespesaOcorrencia,
  Lancamento,
  TitularTipo,
} from '@/types/domain'

export type CartaoContaParam = Conta | (Partial<Conta> & { [key: string]: unknown })

export interface BuildTriagemCartaoParams {
  descricao: string
  valor: number
  dataCompra: string // 'YYYY-MM-DD' ou ISO string
  contaId: string
  conta: CartaoContaParam
  categoriaId?: string
  titularTipo?: TitularTipo
  titularEmpresaId?: string
  titularPessoaId?: string
  observacoes?: string
}

export interface TriagemCartaoLancamentoPayload {
  descricao: string
  valor: number
  tipo: 'despesa'
  data: string // 'YYYY-MM-DD 12:00:00'
  competencia: string
  status: 'pago'
  conta: string
  categoria: string
  empresa: string
  pessoa: string
  observacoes: string
  dizimo: false
}

export interface BuildDespesaCanonicaParams {
  descricao: string
  valor: number
  dataCompra: string // 'YYYY-MM-DD' ou ISO
  contaId: string
  conta?: CartaoContaParam | null
  metodoEhCredito?: boolean
  metodo_pagamento?: string
  categoriaId?: string
  fornecedor?: string
  titularTipo?: TitularTipo
  titularEmpresaId?: string
  titularPessoaId?: string
  observacoes?: string
  origemTexto?: string
  dizimo?: boolean
  tipo_dizimo?: string
  dizimo_percentual?: number
  direcionamento?: string
}

export interface DespesaCanonicaPayloads {
  compromisso: Partial<DespesaCompromisso>
  ocorrencia: Partial<DespesaOcorrencia>
  lancamento: Partial<Lancamento>
  competencia: string
  dataVencimentoStr: string
}

/**
 * REGRA PERMANENTE DE ENTRADA UNIFICADA:
 * "Independente de onde a despesa é gerada (Telegram, triagem PWA, Despesa Rápida ou /despesa),
 * tem que ser o mesmo tipo de registro, tanto de origem quanto de finalidade. Não deve haver distinção.
 * O que varia são os campos vindo sendo preenchidos. Toda despesa gera o modelo canônico:
 * despesas_compromisso (regra 'avulso' para avulsas) + despesas_ocorrencias (na competência calculada pela
 * regra única) + lancamentos vinculado à ocorrência."
 *
 * buildDespesaAvulsaCanonica calcula o trio de registros consistentes:
 * - Não-cartão: competência = mês da compra; data_pagamento = data da compra.
 * - Cartão de crédito: competência via ciclo da fatura (compra até fechamento = mês corrente, após = mês seguinte);
 *   data_pagamento / data_vencimento = vencimento da fatura da competência.
 */
export function buildDespesaAvulsaCanonica(
  params: BuildDespesaCanonicaParams,
): DespesaCanonicaPayloads {
  const dataCompraStr = params.dataCompra.slice(0, 10)
  const contaObj = params.conta as Conta | undefined
  const rawFech = Number((contaObj as any)?.dia_fechamento)
  const diaFechamentoNum = !isNaN(rawFech) && rawFech > 0 ? rawFech : 0
  const isTipoCartao = contaObj?.tipo === 'cartao'
  const contaSuportaCredito = Boolean(
    contaObj &&
    diaFechamentoNum > 0 &&
    (isTipoCartao ||
      (Array.isArray(contaObj?.tipos_pagamento) && contaObj?.tipos_pagamento.includes('credito')) ||
      (typeof (contaObj as any)?.tipos_pagamento === 'string' &&
        (contaObj as any).tipos_pagamento.includes('credito'))),
  )
  // Regra: a escolha entre "mês da compra" e "ciclo da fatura" lê o método do compromisso.
  // Crédito SOMENTE quando o método for crédito E a conta suportar crédito com dia_fechamento > 0.
  // Se metodoEhCredito for omitido/indefinido e conta tiver suporte a crédito, mantém true por retrocompatibilidade;
  // se metodoEhCredito for explicitamente booleano (ex: false para Pix, Débito, etc.), ele prevalece.
  const ehCredito =
    params.metodoEhCredito !== undefined
      ? Boolean(params.metodoEhCredito && contaSuportaCredito)
      : contaSuportaCredito

  const rawVenc = Number((contaObj as any)?.dia_vencimento)
  const diaVencimentoNum = !isNaN(rawVenc) && rawVenc > 0 ? rawVenc : undefined

  const compVenc = calcularCompetenciaEVencimento({
    dataCompra: dataCompraStr,
    conta: contaObj,
    metodoEhCredito: ehCredito,
    diaVencimento: diaVencimentoNum,
  })

  const titularTipo = params.titularTipo || (params.titularEmpresaId ? 'cnpj' : 'cpf')
  const empresaId = titularTipo === 'cnpj' ? params.titularEmpresaId || '' : ''
  const pessoaId =
    titularTipo === 'cpf' ? params.titularPessoaId || '' : params.titularPessoaId || ''

  const dataVencimentoStr = compVenc.dataVencimento.slice(0, 10)
  const dataPagamentoEfetiva = ehCredito ? dataVencimentoStr : dataCompraStr
  const secao = ehCredito ? 'cartoes_credito' : 'contas_mensais_pix_boleto'

  const obs =
    params.observacoes ||
    (params.origemTexto
      ? `${params.origemTexto} (competência ${compVenc.competencia})`
      : `Despesa avulsa (competência ${compVenc.competencia})`)

  const dizimoAtivo = params.dizimo ?? false
  const dizimoPercentualFinal =
    params.dizimo_percentual !== undefined ? params.dizimo_percentual : dizimoAtivo ? 100 : 0
  const tipoDizimoFinal = dizimoAtivo && params.tipo_dizimo ? params.tipo_dizimo : ''
  const direcionamentoFinal = params.direcionamento?.trim() || ''
  const metodoPagamentoFinal =
    params.metodo_pagamento !== undefined && params.metodo_pagamento !== null
      ? params.metodo_pagamento
      : ehCredito
        ? 'r9qdfpwfe5143oe'
        : ''

  const compromisso: Partial<DespesaCompromisso> = {
    descricao: params.descricao.trim(),
    fornecedor: params.fornecedor?.trim() || '',
    categoria: params.categoriaId || '',
    secao,
    regra_repeticao: 'avulso',
    tipo_valor: 'fixo',
    modalidade_parcelamento: 'a_vista',
    total_parcelas: 1,
    parcela_inicial: 1,
    valor_estimado: Number(params.valor),
    dia_vencimento: diaVencimentoNum || parseInt(dataVencimentoStr.slice(8, 10), 10) || 10,
    regra_vencimento_texto: 'Único',
    data_inicio: `${dataCompraStr} 00:00:00.000Z`,
    conta_padrao: params.contaId,
    metodo_pagamento: metodoPagamentoFinal,
    titular_tipo: titularTipo,
    titular_pessoa: pessoaId,
    titular_empresa: empresaId,
    contexto_tipo: titularTipo === 'cnpj' ? 'empresa' : 'pessoal',
    empresa: empresaId,
    pessoa: pessoaId,
    dizimo: dizimoAtivo,
    tipo_dizimo: tipoDizimoFinal,
    dizimo_percentual: dizimoPercentualFinal,
    direcionamento: direcionamentoFinal,
    ativo: true,
    precisa_revisao: false,
    observacoes: obs,
  }

  const ocorrencia: Partial<DespesaOcorrencia> = {
    contexto_tipo: titularTipo === 'cnpj' ? 'empresa' : 'pessoal',
    empresa: empresaId || null,
    secao,
    conta: params.contaId,
    competencia: compVenc.competencia,
    numero_parcela: 0,
    total_parcelas: 0,
    data_vencimento: compVenc.dataVencimentoIso,
    data_pagamento: `${dataPagamentoEfetiva} 12:00:00`,
    valor_previsto: Number(params.valor),
    valor_pago: Number(params.valor),
    valor_estimado_original: Number(params.valor),
    valor_ajustado_manualmente: false,
    status: 'paga',
    dizimo: dizimoAtivo,
    tipo_dizimo: tipoDizimoFinal || undefined,
    dizimo_percentual: dizimoPercentualFinal,
    direcionamento: direcionamentoFinal || undefined,
    observacoes: obs,
  }

  const lancamento: Partial<Lancamento> = {
    descricao: params.descricao.trim(),
    valor: Number(params.valor),
    tipo: 'despesa',
    data: `${dataPagamentoEfetiva} 12:00:00`,
    competencia: compVenc.competencia,
    status: 'pago',
    conta: params.contaId,
    categoria: params.categoriaId || '',
    empresa: empresaId,
    pessoa: pessoaId,
    observacoes: obs,
  }

  return {
    compromisso,
    ocorrencia,
    lancamento,
    competencia: compVenc.competencia,
    dataVencimentoStr,
  }
}

/**
 * @deprecated Mantido para compatibilidade com testes legados existentes.
 * O fluxo canônico utiliza buildDespesaAvulsaCanonica garantindo compromisso + ocorrência + lançamento.
 */
export function buildTriagemCartaoPayload(
  params: BuildTriagemCartaoParams,
): TriagemCartaoLancamentoPayload {
  const dataCompraStr = params.dataCompra.slice(0, 10)
  const rawVenc = Number((params.conta as any)?.dia_vencimento)
  const diaVencimentoNum = !isNaN(rawVenc) && rawVenc > 0 ? rawVenc : undefined

  const compVenc = calcularCompetenciaEVencimento({
    dataCompra: dataCompraStr,
    conta: params.conta as Conta,
    metodoEhCredito: true,
    diaVencimento: diaVencimentoNum,
  })

  const titularTipo = params.titularTipo || (params.titularEmpresaId ? 'cnpj' : 'cpf')
  const empresaId = titularTipo === 'cnpj' ? params.titularEmpresaId || '' : ''
  const pessoaId =
    titularTipo === 'cpf' ? params.titularPessoaId || '' : params.titularPessoaId || ''

  const obs =
    params.observacoes ||
    `Compra cartão Telegram (competência ${compVenc.competencia}, venc. fatura ${compVenc.dataVencimento})`

  const dataVencimentoStr = compVenc.dataVencimento.slice(0, 10)

  return {
    descricao: params.descricao.trim(),
    valor: Number(params.valor),
    tipo: 'despesa',
    data: `${dataVencimentoStr} 12:00:00`,
    competencia: compVenc.competencia,
    status: 'pago',
    conta: params.contaId,
    categoria: params.categoriaId || '',
    empresa: empresaId,
    pessoa: pessoaId,
    observacoes: obs,
    dizimo: false,
  }
}

export interface VerificarPodeGerarParams {
  competenciaAlvo: string // 'YYYY-MM'
  competenciaCorrente?: string // 'YYYY-MM' (default mês atual de Brasília/local)
  ocorrenciasExistentes?: Array<
    Pick<
      DespesaOcorrencia,
      | 'id'
      | 'competencia'
      | 'numero_parcela'
      | 'status'
      | 'data_pagamento'
      | 'lancamento'
      | 'valor_pago'
    >
  >
  numeroParcela?: number
  ocorrenciasExcluidasIds?: string[] | Set<string>
  targetIdOuChave?: string
  isCompromissoAvulso?: boolean
  hasAnyOcorrencia?: boolean
}

/**
 * 2. Barreira pura de geração de ocorrências:
 * Retorna false se:
 * - Competência é estritamente passada em relação à competência corrente / corte
 * - Já existe ocorrência paga na competência (ou número de parcela) -> "Paga vence prevista"
 * - Ocorrência foi excluída de propósito (anti-ressurreição)
 * - Para avulso: já existe qualquer ocorrência criada
 */
export function verificarPodeGerarOcorrencia(params: VerificarPodeGerarParams): boolean {
  const {
    competenciaAlvo,
    competenciaCorrente,
    ocorrenciasExistentes = [],
    numeroParcela,
    ocorrenciasExcluidasIds,
    targetIdOuChave,
    isCompromissoAvulso,
    hasAnyOcorrencia,
  } = params

  // 1. Barreira temporal: nada retroativo em relação à competência limite/corrente
  if (competenciaCorrente && competenciaAlvo < competenciaCorrente) {
    return false
  }

  // 2. Barreira anti-ressurreição: se foi excluída de propósito
  if (targetIdOuChave && ocorrenciasExcluidasIds) {
    if (ocorrenciasExcluidasIds instanceof Set) {
      if (ocorrenciasExcluidasIds.has(targetIdOuChave)) return false
    } else if (Array.isArray(ocorrenciasExcluidasIds)) {
      if (ocorrenciasExcluidasIds.includes(targetIdOuChave)) return false
    }
  }

  // 3. Compromisso avulso não pode ter duplicata se já existe ocorrência
  if (isCompromissoAvulso && hasAnyOcorrencia) {
    return false
  }

  // 4. Barreira "Paga vence prevista" / existência prévia
  for (const oc of ocorrenciasExistentes) {
    const mesmaComp = oc.competencia === competenciaAlvo
    const mesmaParcela =
      numeroParcela !== undefined && oc.numero_parcela !== undefined
        ? oc.numero_parcela === numeroParcela
        : true

    if (mesmaComp && mesmaParcela) {
      const isPaga =
        oc.status === 'paga' ||
        Boolean(oc.data_pagamento) ||
        Boolean(oc.lancamento) ||
        (oc.valor_pago !== undefined && oc.valor_pago !== null && oc.valor_pago > 0)

      if (isPaga) {
        return false
      }
      // Se já existe ocorrência ativa (mesmo prevista) para a mesma competência/parcela, não duplica
      return false
    }
  }

  return true
}

export type CompromissoDuplicavel = Record<string, any>

export type LancamentoDuplicavel = Record<string, any>

export interface PrepararDuplicacaoCompromissoOptions {
  sufixoCopia?: boolean // default true
  novaDataInicio?: string
}

/**
 * 3a. Sanitização pura para duplicação de compromisso:
 * - Remove id, created, updated, collectionId, collectionName, expand
 * - Remove anexos (anexo_conta)
 * - Reseta status para ativo: true, precisa_revisao: false, motivo_revisao: ''
 * - Adiciona sufixo '(cópia)' na descrição se configurado
 */
export function prepararDuplicacaoCompromisso(
  compromisso: CompromissoDuplicavel,
  options?: PrepararDuplicacaoCompromissoOptions,
): Partial<DespesaCompromisso> {
  const sufixoCopia = options?.sufixoCopia ?? true

  let descricao = (compromisso.descricao || '').trim()
  if (sufixoCopia && descricao) {
    descricao = descricao.includes('(cópia)') ? descricao : `${descricao} (cópia)`
  }

  const {
    id: _id,
    created: _created,
    updated: _updated,
    collectionId: _cId,
    collectionName: _cName,
    expand: _expand,
    anexo_conta: _anexo,
    ...rest
  } = compromisso

  return {
    ...rest,
    descricao,
    data_inicio: options?.novaDataInicio || rest.data_inicio,
    ativo: true,
    precisa_revisao: false,
    motivo_revisao: '',
    anexo_conta: undefined,
  }
}

export interface PrepararDuplicacaoLancamentoOptions {
  sufixoCopia?: boolean
  novaData?: string
}

/**
 * 3b. Sanitização pura para duplicação de lançamento:
 * - Remove id, created, updated, collectionId, collectionName, expand
 * - Remove vínculos com faturas (fatura_paga, fatura_pagamento_id, is_pagamento_fatura, cartao_fatura_conta)
 * - Remove comprovante anexado
 * - Reseta status de pagamento para pendente se não especificado
 */
export function prepararDuplicacaoLancamento(
  lancamento: LancamentoDuplicavel,
  options?: PrepararDuplicacaoLancamentoOptions,
): Partial<Lancamento> {
  const sufixoCopia = options?.sufixoCopia ?? true

  let descricao = (lancamento.descricao || '').trim()
  if (sufixoCopia && descricao) {
    descricao = descricao.includes('(cópia)') ? descricao : `${descricao} (cópia)`
  }

  const {
    id: _id,
    created: _created,
    updated: _updated,
    collectionId: _cId,
    collectionName: _cName,
    expand: _expand,
    comprovante: _comprovante,
    fatura_paga: _fp,
    fatura_pagamento_id: _fpid,
    is_pagamento_fatura: _ipf,
    cartao_fatura_conta: _cfc,
    ...rest
  } = lancamento

  return {
    ...rest,
    descricao,
    data: options?.novaData || rest.data,
    fatura_paga: false,
    fatura_pagamento_id: undefined,
    is_pagamento_fatura: false,
    cartao_fatura_conta: undefined,
    comprovante: undefined,
  }
}

export interface ItemFaturaFifo {
  id: string
  valor: number
  data?: string
  created?: string
  data_vencimento?: string
}

export interface AlocacaoFifoResultado {
  itensQuitadosIds: string[]
  itensRestantesIds: string[]
  valorAlocado: number
  valorSobra: number
  isTotal: boolean
  cicloFechado: boolean
}

/**
 * 4. Rateio FIFO de pagamento de fatura:
 * - Ordenação cronológica por vencimento/data da mais antiga para a mais recente (e desempate por valor)
 * - Rateio FIFO sobre ocorrências/compras ordenadas
 * - Quita ocorrências até esgotar o valor pago
 * - Se valorPago >= total: quitação total, todos os itens quitados e ciclo fechado (isTotal = true, cicloFechado = true)
 * - Se valorPago < total: parcial, quitando somente as que cabem na ordem cronológica
 */
export function alocarPagamentoFaturaFifo(
  itens: ItemFaturaFifo[],
  valorPago: number,
): AlocacaoFifoResultado {
  if (!itens || itens.length === 0) {
    return {
      itensQuitadosIds: [],
      itensRestantesIds: [],
      valorAlocado: 0,
      valorSobra: valorPago,
      isTotal: true,
      cicloFechado: true,
    }
  }

  // Ordenação cronológica: mais antigas primeiro
  const ordenados = [...itens].sort((a, b) => {
    const dataA = (a.data_vencimento || a.data || a.created || '').slice(0, 10)
    const dataB = (b.data_vencimento || b.data || b.created || '').slice(0, 10)
    if (dataA !== dataB) return dataA.localeCompare(dataB)
    const valA = Number(a.valor) || 0
    const valB = Number(b.valor) || 0
    return valA - valB
  })

  const totalItens = ordenados.reduce((acc, it) => acc + (Number(it.valor) || 0), 0)
  const isTotal = valorPago >= totalItens - 0.009

  if (isTotal) {
    return {
      itensQuitadosIds: ordenados.map((it) => it.id),
      itensRestantesIds: [],
      valorAlocado: totalItens,
      valorSobra: Math.max(0, valorPago - totalItens),
      isTotal: true,
      cicloFechado: true,
    }
  }

  const quitados: string[] = []
  const restantes: string[] = []
  let acumulado = 0

  for (const item of ordenados) {
    const itemVal = Number(item.valor) || 0
    if (acumulado + itemVal <= valorPago + 0.009) {
      quitados.push(item.id)
      acumulado += itemVal
    } else {
      restantes.push(item.id)
    }
  }

  return {
    itensQuitadosIds: quitados,
    itensRestantesIds: restantes,
    valorAlocado: acumulado,
    valorSobra: Math.max(0, valorPago - acumulado),
    isTotal: false,
    cicloFechado: false,
  }
}

/**
 * Interface mínima esperada para ordenação de ocorrências de despesas
 */
export interface DespesaOcorrenciaOrdenavel {
  id: string
  status?: string
  data_vencimento?: string | null
  data_pagamento?: string | null
  data_compra?: string | null
  created?: string | null
  valor_previsto?: number | null
  valor_pago?: number | null
  observacoes?: string | null
  expand?: {
    compromisso?: {
      descricao?: string | null
      data_inicio?: string | null
    } | null
  } | null
}

export type ModoOrdenacaoDespesa = 'urgente' | 'recente'

/**
 * Ordena ocorrências de despesas de forma pura, cronológica e determinística.
 *
 * Regras:
 * 1. Separa não pagas (previstas) das já pagas (pagas sempre após as pendentes).
 * 2. Critério prioritário: DATA (vencimento para pendentes, data_pagamento || data_vencimento para pagas).
 *    - 'urgente':
 *        * Pendentes vencidas e que vencem hoje (<= today) no topo em ordem cronológica (mais antiga primeiro).
 *        * Pendentes futuras (> today) a seguir em ordem cronológica crescente (mais próxima primeiro).
 *    - 'recente':
 *        * Pendentes futuras no topo em ordem decrescente (mais distante primeiro).
 *        * Vencidas/hoje a seguir em ordem decrescente.
 *    - Pagas:
 *        * Em 'urgente': cronológica crescente (mais antiga paga primeiro).
 *        * Em 'recente': cronológica decrescente (mais recente primeiro).
 * 3. Desempate estável e determinístico (SEM ordenação alfabética prévia):
 *    - Se as datas forem iguais: valor decrescente (maior valor primeiro).
 *    - Se valores forem iguais: ID estável (localeCompare).
 */
export function ordenarDespesasPorData<T extends DespesaOcorrenciaOrdenavel>(
  ocorrencias: T[],
  modo: ModoOrdenacaoDespesa = 'urgente',
  hojeStr?: string,
): T[] {
  const copy = [...ocorrencias]
  const today = hojeStr || new Date().toISOString().slice(0, 10)

  return copy.sort((a, b) => {
    const isPagaA = a.status === 'paga'
    const isPagaB = b.status === 'paga'

    // 1. Pagas sempre após pendentes
    if (isPagaA !== isPagaB) {
      return isPagaA ? 1 : -1
    }

    // Se ambas são pagas:
    if (isPagaA && isPagaB) {
      const dtA = (a.data_pagamento || a.data_vencimento || '').slice(0, 10)
      const dtB = (b.data_pagamento || b.data_vencimento || '').slice(0, 10)
      const cmpData = modo === 'recente' ? dtB.localeCompare(dtA) : dtA.localeCompare(dtB)
      if (cmpData !== 0) return cmpData

      // Desempate: data_compra -> valor decrescente -> ID
      const compraA = extrairDataCompraOcorrencia(a)
      const compraB = extrairDataCompraOcorrencia(b)
      const cmpCompra = compraB.localeCompare(compraA)
      if (cmpCompra !== 0) return cmpCompra

      const valA = Number(a.valor_pago ?? a.valor_previsto ?? 0)
      const valB = Number(b.valor_pago ?? b.valor_previsto ?? 0)
      const valDiff = valB - valA
      if (valDiff !== 0) return valDiff

      return (a.id || '').localeCompare(b.id || '')
    }

    // Se ambas são pendentes:
    const dueA = a.data_vencimento ? a.data_vencimento.slice(0, 10) : '9999-99-99'
    const dueB = b.data_vencimento ? b.data_vencimento.slice(0, 10) : '9999-99-99'

    const isUrgenteA = dueA <= today
    const isUrgenteB = dueB <= today

    if (modo === 'urgente') {
      // Vencidas / hoje no topo
      if (isUrgenteA && !isUrgenteB) return -1
      if (!isUrgenteA && isUrgenteB) return 1

      // Ambas vencidas/hoje OU ambas futuras: ordem crescente de vencimento (mais antiga/mais próxima primeiro)
      const cmp = dueA.localeCompare(dueB)
      if (cmp !== 0) return cmp
    } else {
      // 'recente': Mais tarde primeiro — datas mais distantes (futuras) no topo; vencidas/hoje ao final das pendentes
      if (!isUrgenteA && isUrgenteB) return -1
      if (isUrgenteA && !isUrgenteB) return 1

      // Ambas futuras OU ambas vencidas/hoje: ordem decrescente de vencimento (data mais distante primeiro)
      const cmp = dueB.localeCompare(dueA)
      if (cmp !== 0) return cmp
    }

    // Quando data_vencimento empatar (comum no crédito, mesma fatura):
    // Desempatar por data_compra -> valor (decrescente) -> id
    const compraA = extrairDataCompraOcorrencia(a)
    const compraB = extrairDataCompraOcorrencia(b)
    const cmpCompra = compraB.localeCompare(compraA)
    if (cmpCompra !== 0) return cmpCompra

    // Desempate estável: valor decrescente -> ID (sem alfabético)
    const valA = Number(a.valor_previsto ?? 0)
    const valB = Number(b.valor_previsto ?? 0)
    const valDiff = valB - valA
    if (valDiff !== 0) return valDiff

    return (a.id || '').localeCompare(b.id || '')
  })
}

/**
 * Extrai a data da compra com a cadeia de fallback:
 * data_compra -> expand?.compromisso?.data_inicio -> data_vencimento -> created -> '9999-12-31'
 * Retorna sempre em formato 'YYYY-MM-DD' (slice(0, 10)).
 */
function extrairDataCompraOcorrencia(item: DespesaOcorrenciaOrdenavel): string {
  const raw =
    item.data_compra ||
    item.expand?.compromisso?.data_inicio ||
    item.data_vencimento ||
    item.created ||
    '9999-12-31'
  return String(raw).slice(0, 10)
}

/**
 * Ordena ocorrências de cartão de crédito pela data da compra:
 * - 'recente': compras mais novas primeiro (decrescente de data_compra).
 * - 'antiga': compras mais antigas primeiro (crescente de data_compra).
 * Desempate: valor decrescente -> id estável (localeCompare).
 *
 * Fallback da data de compra:
 * item.data_compra -> item.expand?.compromisso?.data_inicio -> item.data_vencimento -> item.created -> '9999-12-31'
 */
export function ordenarDespesasCreditoPorCompra<T extends DespesaOcorrenciaOrdenavel>(
  itens: T[],
  ordem: 'recente' | 'antiga',
): T[] {
  const copy = [...itens]

  return copy.sort((a, b) => {
    const dataA = extrairDataCompraOcorrencia(a)
    const dataB = extrairDataCompraOcorrencia(b)

    const cmpData = ordem === 'recente' ? dataB.localeCompare(dataA) : dataA.localeCompare(dataB)
    if (cmpData !== 0) return cmpData

    // Desempate: valor decrescente
    const valA = Number(a.valor_pago ?? a.valor_previsto ?? 0)
    const valB = Number(b.valor_pago ?? b.valor_previsto ?? 0)
    const valDiff = valB - valA
    if (valDiff !== 0) return valDiff

    // Desempate: id estável
    return (a.id || '').localeCompare(b.id || '')
  })
}

export interface InfoBadgeDizimo {
  ativo: boolean
  percentual: number
  percentualTexto: string
  classificacao?: string
  direcionamento?: string
  rotuloBadge: string
}

/**
 * Utilitário de formatação do badge de dízimo para despesas/ocorrências.
 * Lê percentual (default 100%), classificação ('pessoal'|'empresa'|'prolabore' etc.) e direcionamento (ex: 'Igreja Central').
 */
export function formatarBadgeDizimoDespesa(item: {
  dizimo?: boolean
  dizimo_ativo?: boolean
  dizimo_percentual?: number | null
  dizimo_classificacao?: string | null
  contexto_tipo?: string | null
  direcionamento?: string | null
  dizimo_direcionamento?: string | null
  tipo_dizimo?: string | null
  expand?: {
    compromisso?: any
    tipo_dizimo?: { nome?: string; [key: string]: any }
    [key: string]: any
  }
}): InfoBadgeDizimo | null {
  const comp = item?.expand?.compromisso
  const ativo = Boolean(item?.dizimo ?? item?.dizimo_ativo ?? comp?.dizimo ?? comp?.dizimo_ativo)

  if (!ativo) return null

  const rawPercentual =
    item?.dizimo_percentual !== undefined && item?.dizimo_percentual !== null
      ? Number(item.dizimo_percentual)
      : comp?.dizimo_percentual !== undefined && comp?.dizimo_percentual !== null
        ? Number(comp.dizimo_percentual)
        : 100

  const percentual = isNaN(rawPercentual) || rawPercentual === 0 ? 100 : rawPercentual
  const percentualTexto = `Dízimo ${percentual}%`

  const rawClassif =
    item?.dizimo_classificacao ||
    comp?.dizimo_classificacao ||
    item?.contexto_tipo ||
    comp?.contexto_tipo ||
    item?.expand?.tipo_dizimo?.nome ||
    comp?.expand?.tipo_dizimo?.nome

  const classificacao = rawClassif ? String(rawClassif).trim() : undefined

  const rawDirecionamento =
    item?.direcionamento ||
    item?.dizimo_direcionamento ||
    comp?.direcionamento ||
    comp?.dizimo_direcionamento

  const direcionamento = rawDirecionamento ? String(rawDirecionamento).trim() : undefined

  const partes = [percentualTexto]
  if (classificacao) {
    partes.push(classificacao)
  }
  if (direcionamento) {
    partes.push(direcionamento)
  }

  return {
    ativo: true,
    percentual,
    percentualTexto,
    classificacao,
    direcionamento,
    rotuloBadge: partes.join(' · '),
  }
}

/**
 * Extrai com segurança o nome do método de pagamento da ocorrência ou compromisso.
 */
export function extrairNomeMetodoPagamento(item: {
  metodo_pagamento?: any
  expand?: {
    metodo_pagamento?: { nome?: string; [key: string]: any }
    compromisso?: {
      metodo_pagamento?: any
      expand?: {
        metodo_pagamento?: { nome?: string; [key: string]: any }
        [key: string]: any
      }
      [key: string]: any
    }
    [key: string]: any
  }
}): string | undefined {
  const expandMetodo =
    item?.expand?.metodo_pagamento?.nome ||
    item?.expand?.compromisso?.expand?.metodo_pagamento?.nome

  if (expandMetodo) return expandMetodo.trim()

  const directObj =
    typeof item?.metodo_pagamento === 'object' && item?.metodo_pagamento !== null
      ? item.metodo_pagamento?.nome
      : typeof item?.expand?.compromisso?.metodo_pagamento === 'object' &&
          item?.expand?.compromisso?.metodo_pagamento !== null
        ? item.expand.compromisso.metodo_pagamento?.nome
        : undefined

  if (directObj) return String(directObj).trim()

  return undefined
}
