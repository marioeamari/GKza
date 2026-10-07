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

/**
 * 1. Payload de triagem de compra avulsa de cartão:
 * - Lança SOMENTE lançamento pago (status: 'pago')
 * - Competência e vencimento calculados exclusivamente via calcularCompetenciaEVencimento
 * - dizimo: false SEMPRE como default
 * - Nunca gera compromisso nem ocorrência
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

  return {
    descricao: params.descricao.trim(),
    valor: Number(params.valor),
    tipo: 'despesa',
    data: `${dataCompraStr} 12:00:00`,
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
