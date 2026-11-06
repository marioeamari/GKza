import type { Conta, Lancamento } from '@/types/domain'

/**
 * Representa os detalhes de ciclo de uma fatura de cartão de crédito.
 */
export interface CartaoFaturaCiclo {
  conta: Conta
  competencia: string // 'YYYY-MM' do fechamento da fatura
  dataInicioCiclo: string // 'YYYY-MM-DD'
  dataFechamento: string // 'YYYY-MM-DD'
  dataVencimento: string // 'YYYY-MM-DD' (data em que o pagamento vence)
  descricaoFatura: string // Ex: "Fatura de Setembro/2026 — NuBank"
}

/**
 * Informações agrupadas de uma fatura para listagem e pagamento.
 */
export type StatusFaturaCiclo = 'nao_pago' | 'parcialmente_pago' | 'pago'

export interface EstadoCicloFatura {
  status: StatusFaturaCiclo
  totalFatura: number
  totalPago: number
  valorRestante: number
  excedente: number
  percentualPago: number
  dataUltimoPagamento?: string
  pagamentosCount: number
}

/**
 * Informações agrupadas de uma fatura para listagem e pagamento.
 */
export interface FaturaCartaoGroup {
  id: string // chave única do grupo: `${contaId}_${competencia}`
  conta: Conta
  competencia: string // 'YYYY-MM'
  dataFechamento: string
  dataVencimento: string
  totalFatura: number
  paga: boolean
  pagamentoLancamentoId?: string
  itens: Lancamento[]
  estadoCiclo?: EstadoCicloFatura
}

/**
 * Extrai dia, mês (0-indexado) e ano de uma data UTC ou ISO 'YYYY-MM-DD' de forma segura.
 */
function parseDateParts(dateStr: string): { year: number; month: number; day: number } {
  if (!dateStr) {
    const now = new Date()
    return { year: now.getFullYear(), month: now.getMonth(), day: now.getDate() }
  }

  const clean = dateStr.slice(0, 10)
  const [yStr, mStr, dStr] = clean.split('-')
  const year = parseInt(yStr, 10)
  const month = parseInt(mStr, 10) - 1 // 0-based
  const day = parseInt(dStr, 10)

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    const d = new Date(dateStr)
    return { year: d.getFullYear(), month: d.getMonth(), day: d.getDate() }
  }

  return { year, month, day }
}

/**
 * Retorna o último dia de um dado ano/mês (0-indexed).
 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate()
}

/**
 * Formata ano e mês (0-based) em 'YYYY-MM'.
 */
function formatYearMonth(year: number, month: number): string {
  // Trata rolagem de mês (ex: mês 12 -> ano seguinte, mês -1 -> ano anterior)
  const normalized = new Date(Date.UTC(year, month, 1))
  const y = normalized.getUTCFullYear()
  const m = String(normalized.getUTCMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Calcula a competência da fatura e os ciclos para uma transação de cartão de crédito.
 * Regra:
 * Se o dia da compra <= dia_fechamento da conta:
 *   pertence à fatura que fecha neste mesmo mês no dia_fechamento.
 *   Competência = 'YYYY-MM' da data da compra.
 * Se o dia da compra > dia_fechamento da conta:
 *   o ciclo deste mês já fechou, portanto entra na fatura que fecha no mês seguinte.
 *   Competência = 'YYYY-MM' do mês seguinte.
 *
 * Data de Vencimento da fatura:
 *   Geralmente vence em dia_vencimento do mês em que vence a fatura.
 *   Se dia_vencimento >= dia_fechamento, vence no mesmo mês do fechamento.
 *   Se dia_vencimento < dia_fechamento, vence no mês seguinte ao fechamento.
 */
export function calcularFaturaCartao(conta: Conta, dataTransacao: string): CartaoFaturaCiclo {
  const rawFech = Number((conta as any)?.dia_fechamento)
  const diaFechamento = !isNaN(rawFech) && rawFech > 0 ? rawFech : 10
  const rawVenc = Number((conta as any)?.dia_vencimento)
  const diaVencimento = !isNaN(rawVenc) && rawVenc > 0 ? rawVenc : 20

  const { year, month, day } = parseDateParts(dataTransacao)

  let fechamentoYear = year
  let fechamentoMonth = month

  if (day > diaFechamento) {
    // Passou do fechamento -> cai na fatura do mês seguinte
    fechamentoMonth += 1
  }

  // Normaliza ano e mês de fechamento
  const compStr = formatYearMonth(fechamentoYear, fechamentoMonth)
  const [fYearStr, fMonthStr] = compStr.split('-')
  const fYear = parseInt(fYearStr, 10)
  const fMonth = parseInt(fMonthStr, 10) - 1

  // Data de fechamento real (ajustando para meses mais curtos se diaFechamento > dias do mês)
  const maxDiasFechamento = getDaysInMonth(fYear, fMonth)
  const realDiaFechamento = Math.min(diaFechamento, maxDiasFechamento)
  const dataFechamento = `${fYear}-${String(fMonth + 1).padStart(2, '0')}-${String(realDiaFechamento).padStart(2, '0')}`

  // Data de início do ciclo (dia seguinte ao fechamento anterior)
  const prevMonthNorm = new Date(Date.UTC(fYear, fMonth - 1, 1))
  const pYear = prevMonthNorm.getUTCFullYear()
  const pMonth = prevMonthNorm.getUTCMonth()
  const maxDiasPrev = getDaysInMonth(pYear, pMonth)
  const realDiaFechamentoPrev = Math.min(diaFechamento, maxDiasPrev)
  // Ciclo inicia no dia subsequente ao fechamento do mês anterior
  const startDay = Math.min(realDiaFechamentoPrev + 1, maxDiasPrev)
  const dataInicioCiclo = `${pYear}-${String(pMonth + 1).padStart(2, '0')}-${String(startDay).padStart(2, '0')}`

  // Data de vencimento da fatura
  // Se dia_vencimento >= dia_fechamento: vence no mesmo mês do fechamento (ex: fecha 13, vence 20 do mesmo mês)
  // Se dia_vencimento < dia_fechamento: vence no mês seguinte ao fechamento (ex: fecha 25, vence dia 05 do mês seguinte)
  let vencYear = fYear
  let vencMonth = fMonth
  if (diaVencimento < diaFechamento) {
    vencMonth += 1
  }
  const vencComp = formatYearMonth(vencYear, vencMonth)
  const [vYearStr, vMonthStr] = vencComp.split('-')
  const vYear = parseInt(vYearStr, 10)
  const vMonth = parseInt(vMonthStr, 10) - 1
  const maxDiasVenc = getDaysInMonth(vYear, vMonth)
  const realDiaVencimento = Math.min(diaVencimento, maxDiasVenc)
  const dataVencimento = `${vYear}-${String(vMonth + 1).padStart(2, '0')}-${String(realDiaVencimento).padStart(2, '0')}`

  // Descrição amigável
  const dateObj = new Date(fYear, fMonth, 1)
  const mesExtenso = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mesCapitalizado = mesExtenso.charAt(0).toUpperCase() + mesExtenso.slice(1)
  const descricaoFatura = `Fatura de ${mesCapitalizado} — ${conta.nome}`

  return {
    conta,
    competencia: compStr,
    dataInicioCiclo,
    dataFechamento,
    dataVencimento,
    descricaoFatura,
  }
}

/**
 * Retorna texto explicativo para ser exibido no formulário de compra:
 * Ex: "Este gasto entra na fatura de Setembro/2026 (vence 20/09)"
 */
/**
 * Adiciona um número de meses (offset) a uma competência 'YYYY-MM', retornando a nova competência 'YYYY-MM'.
 */
export function adicionarMesesCompetencia(competencia: string, offsetMeses: number): string {
  const [yStr, mStr] = competencia.split('-')
  const y = parseInt(yStr, 10)
  const m = parseInt(mStr, 10) - 1
  return formatYearMonth(y, m + offsetMeses)
}

/**
 * Calcula a data de vencimento da fatura para uma determinada competência e conta tipo cartão.
 * A competência representa o mês de fechamento da fatura ('YYYY-MM').
 * Se dia_vencimento >= dia_fechamento, vence no mesmo mês da competência.
 * Se dia_vencimento < dia_fechamento, vence no mês seguinte.
 */
export function calcularVencimentoFatura(conta: Conta, competencia: string): string {
  const rawFech = Number((conta as any)?.dia_fechamento)
  const diaFechamento = !isNaN(rawFech) && rawFech > 0 ? rawFech : 10
  const rawVenc = Number((conta as any)?.dia_vencimento)
  const diaVencimento = !isNaN(rawVenc) && rawVenc > 0 ? rawVenc : 20

  const [yStr, mStr] = competencia.split('-')
  const fYear = parseInt(yStr, 10)
  const fMonth = parseInt(mStr, 10) - 1

  let vencYear = fYear
  let vencMonth = fMonth
  if (diaVencimento < diaFechamento) {
    vencMonth += 1
  }

  const vencComp = formatYearMonth(vencYear, vencMonth)
  const [vYearStr, vMonthStr] = vencComp.split('-')
  const vYear = parseInt(vYearStr, 10)
  const vMonth = parseInt(vMonthStr, 10) - 1
  const maxDiasVenc = getDaysInMonth(vYear, vMonth)
  const realDiaVencimento = Math.min(diaVencimento, maxDiasVenc)
  return `${vYear}-${String(vMonth + 1).padStart(2, '0')}-${String(realDiaVencimento).padStart(2, '0')}`
}

export interface ParcelaCicloSimulada {
  numeroParcela: number
  totalParcelas: number
  competencia: string
  dataVencimento: string // 'YYYY-MM-DD'
  dataVencimentoIso: string // 'YYYY-MM-DDTHH:mm:ss.000Z'
}

export type StatusItemCronograma = 'paga' | 'prevista' | 'atrasada' | 'anterior_ao_controle'

export interface ItemCronogramaParcela {
  numeroParcela: number
  totalParcelas: number
  competencia: string
  cicloDescricao?: string
  dataVencimento: string // 'YYYY-MM-DD' ou formatada
  dataVencimentoIso: string
  valor: number
  status: StatusItemCronograma
  dataPagamento?: string
  valorPago?: number
  ocorrenciaId?: string
  isSimulada: boolean
  isAnteriorAoControle?: boolean
}

/**
 * Simula o cronograma completo das N parcelas de um compromisso parcelado,
 * integrando ocorrências reais já existentes no banco e preenchendo as parcelas
 * futuras/faltantes com a regra de ciclo da fatura (cartão) ou mensal simples (não-cartão).
 */
export function simularCronogramaParcelas(params: {
  compromisso: {
    id?: string
    descricao?: string
    data_inicio?: string
    created?: string
    total_parcelas?: number
    parcela_inicial?: number
    valor_parcela?: number
    valor_estimado?: number
    dia_vencimento?: number
    modalidade_parcelamento?: string
    regra_repeticao?: string
  }
  conta?: Conta
  ocorrenciasReais?: Array<{
    id?: string
    numero_parcela?: number
    total_parcelas?: number
    competencia?: string
    data_vencimento?: string
    data_pagamento?: string
    valor_previsto?: number
    valor_pago?: number
    status?: string
  }>
  dataReferenciaHoje?: string // 'YYYY-MM-DD'
}): ItemCronogramaParcela[] {
  const { compromisso, conta, ocorrenciasReais = [], dataReferenciaHoje = '' } = params
  const total = Math.max(1, compromisso.total_parcelas || 1)
  const inicial = Math.max(1, compromisso.parcela_inicial || 1)
  const valorUnitario =
    compromisso.valor_parcela && compromisso.valor_parcela > 0
      ? compromisso.valor_parcela
      : compromisso.valor_estimado || 0

  const dataCompraStr = compromisso.data_inicio
    ? compromisso.data_inicio.slice(0, 10)
    : compromisso.created
      ? compromisso.created.slice(0, 10)
      : '2026-09-01'

  const isCartao =
    conta &&
    (conta.tipo === 'cartao' ||
      (conta.tipos_pagamento && conta.tipos_pagamento.includes('credito')))

  // Mapa de ocorrências reais por número de parcela
  const reaisMap = new Map<number, (typeof ocorrenciasReais)[0]>()
  for (const oc of ocorrenciasReais) {
    if (oc.numero_parcela && oc.numero_parcela > 0) {
      reaisMap.set(oc.numero_parcela, oc)
    }
  }

  const itens: ItemCronogramaParcela[] = []

  // Componentes de data base para não-cartão
  const [anoStr, mesStr, diaStr] = dataCompraStr.split('-')
  const cAno = parseInt(anoStr, 10) || 2026
  const cMesZero = (parseInt(mesStr, 10) || 1) - 1
  const diaVencComp = compromisso.dia_vencimento || parseInt(diaStr, 10) || 10

  // Exibe TODAS as parcelas de 1 até total, incluindo as anteriores à parcela_inicial
  // (ex.: quando o parcelamento começou a ser controlado a partir da parcela 3 de 4)
  for (let p = 1; p <= total; p++) {
    const real = reaisMap.get(p)
    const ehAnteriorAoControle = p < inicial && !real

    if (real) {
      const isPaga = real.status === 'paga' || real.status === 'pago'
      const dueStr = real.data_vencimento ? real.data_vencimento.slice(0, 10) : ''
      const isAtrasada =
        !isPaga && dataReferenciaHoje !== '' && dueStr !== '' && dueStr < dataReferenciaHoje

      itens.push({
        numeroParcela: p,
        totalParcelas: total,
        competencia: real.competencia || '',
        dataVencimento: dueStr,
        dataVencimentoIso: real.data_vencimento || `${dueStr}T12:00:00.000Z`,
        valor: Number(real.valor_previsto ?? valorUnitario),
        status: isPaga ? 'paga' : isAtrasada ? 'atrasada' : 'prevista',
        dataPagamento: real.data_pagamento ? real.data_pagamento.slice(0, 10) : undefined,
        valorPago: real.valor_pago !== undefined ? Number(real.valor_pago) : undefined,
        ocorrenciaId: real.id,
        isSimulada: false,
        isAnteriorAoControle: false,
      })
    } else {
      // Parcela calculada usando a regra única de competência e vencimento
      const res = calcularCompetenciaEVencimento({
        dataCompra: dataCompraStr,
        conta,
        metodoEhCredito: isCartao,
        diaVencimento: diaVencComp,
        numeroParcela: p,
        totalParcelas: total,
      })
      const isAtrasada =
        !ehAnteriorAoControle &&
        dataReferenciaHoje !== '' &&
        res.dataVencimento !== '' &&
        res.dataVencimento < dataReferenciaHoje

      itens.push({
        numeroParcela: p,
        totalParcelas: total,
        competencia: res.competencia,
        dataVencimento: res.dataVencimento,
        dataVencimentoIso: res.dataVencimentoIso,
        valor: valorUnitario,
        status: ehAnteriorAoControle
          ? 'anterior_ao_controle'
          : isAtrasada
            ? 'atrasada'
            : 'prevista',
        isSimulada: true,
        isAnteriorAoControle: ehAnteriorAoControle,
      })
    }
  }

  return itens
}

/**
 * Calcula a competência e data de vencimento de uma parcela N de uma compra parcelada no cartão de crédito.
 * Regra:
 * - Parcela 1 vai para o ciclo da fatura em que a data de compra cai:
 *   se dia_compra > dia_fechamento, fatura do mês seguinte; se <=, fatura do próprio mês.
 * - Parcela N (N >= 1) avança (N - 1) ciclos a partir do ciclo inicial da parcela 1.
 * - Vencimento da parcela = vencimento da fatura do ciclo correspondente (dia_vencimento da conta).
 */
/**
 * REGRA VIGENTE DO CRONOGRAMA DE PARCELAS EM CARTÃO (0.0.286, borda corrigida na 0.0.289):
 * O vencimento de cada parcela N é o vencimento da fatura do ciclo da COMPRA da parcela N
 * (mês da data_inicio + N - 1, ajustado pelo dia_fechamento da conta).
 * Garantias: a sequência de vencimentos é estritamente crescente — nunca dois vencimentos
 * iguais e nunca mês pulado; o dia de vencimento é clampado ao último dia do mês.
 * Borda 0.0.289 (caso TORO): cada parcela é recomputada INDEPENDENTEMENTE do ciclo da
 * SUA compra; nenhum ajuste local de sequência se propaga às parcelas seguintes. Antes,
 * um offsetExtra acumulado na guarda (disparado pela compra da parcela N cair após o
 * fechamento) deslocava permanentemente as parcelas seguintes, duplicando um mês e
 * pulando o outro — ex.: TORO 19/09/2026, fech 16, venc 23, 4x produzia
 * 23/10, 23/10, 23/12, 23/01 em vez de 23/10, 23/11, 23/12, 23/01/2027.
 */
export function gerarCronogramaParcelasCartao(params: {
  conta: Conta
  dataCompra: string
  totalParcelas: number
}): ParcelaCicloSimulada[] {
  const { conta, dataCompra } = params
  const total = Math.max(1, Math.floor(Number(params.totalParcelas) || 1))

  // Cada parcela N = fatura do ciclo da compra da parcela N (data_compra + N - 1,
  // ajustado pelo fechamento). Como cada compra avança exatamente 1 mês, a série de
  // vencimentos é estritamente crescente POR CONSTRUÇÃO — nenhuma guarda acumulada.
  const itens: ParcelaCicloSimulada[] = []
  for (let p = 1; p <= total; p++) {
    itens.push(calcularCicloParcelaCartao(conta, dataCompra, p, total))
  }
  return itens
}

/**
 * Data de fim de um parcelamento em cartão = vencimento da ÚLTIMA parcela do cronograma
 * (nunca o mês simples da data de compra, que ignora o ciclo da fatura).
 */
export function calcularDataFimParceladoCartao(params: {
  conta: Conta
  dataCompra: string
  totalParcelas: number
}): string {
  const cronograma = gerarCronogramaParcelasCartao(params)
  return cronograma[cronograma.length - 1].dataVencimento
}

export function calcularCicloParcelaCartao(
  conta: Conta,
  dataCompraStr: string,
  numeroParcela: number,
  totalParcelas: number = 1,
): ParcelaCicloSimulada {
  const cicloInicial = calcularFaturaCartao(conta, dataCompraStr)
  const offset = Math.max(0, numeroParcela - 1)
  const competencia = adicionarMesesCompetencia(cicloInicial.competencia, offset)
  const dataVencimento = calcularVencimentoFatura(conta, competencia)
  const dataVencimentoIso = `${dataVencimento}T12:00:00.000Z`

  return {
    numeroParcela,
    totalParcelas,
    competencia,
    dataVencimento,
    dataVencimentoIso,
  }
}

/**
 * REGRA ÚNICA DE COMPETÊNCIA E VENCIMENTO (ERP GKza):
 * A base de orientação é SEMPRE a "Data da compra" (data_inicio).
 *
 * 1. Não-cartão (débito, transferência bancária, boletos, pix, dinheiro, contas bancárias/caixa):
 *    - Competência = mês da data da compra. Se a compra foi em 01/09 ou 30/09, competência = '2026-09'.
 *    - Vencimento = dia_vencimento informado dentro do mês da competência (com clamp para meses curtos).
 *
 * 2. Crédito (conta tipo "cartao" com dia_fechamento e dia_vencimento):
 *    - Competência = ciclo da fatura definido por dia_fechamento/dia_vencimento da conta.
 *      Compra <= dia_fechamento -> fatura do mês corrente ('YYYY-MM').
 *      Compra > dia_fechamento -> fatura do mês seguinte.
 *    - Vencimento = dia_vencimento da fatura do ciclo correspondente (calcularVencimentoFatura).
 *
 * 3. Parcelas e recorrências:
 *    - Para parcela N (N >= 1), calcula a data de compra da parcela avançando (N - 1) meses a partir da
 *      data da compra original, e então aplica a regra 1 ou 2 de competência e vencimento.
 */
export interface CompetenciaVencimentoResultado {
  competencia: string // 'YYYY-MM'
  dataVencimento: string // 'YYYY-MM-DD'
  dataVencimentoIso: string // 'YYYY-MM-DDTHH:mm:ss.000Z'
  isCartaoCredito: boolean
}

export function calcularCompetenciaEVencimento(params: {
  dataCompra: string // 'YYYY-MM-DD' ou ISO
  conta?: Conta | null
  metodoEhCredito?: boolean
  diaVencimento?: number // dia de vencimento desejado para não-cartão
  numeroParcela?: number // default 1
  totalParcelas?: number // default 1
}): CompetenciaVencimentoResultado {
  const {
    dataCompra,
    conta,
    metodoEhCredito,
    diaVencimento,
    numeroParcela = 1,
    totalParcelas = 1,
  } = params

  const cleanDate = (dataCompra || '').slice(0, 10)
  const { year: cAno, month: cMesZero, day: cDia } = parseDateParts(cleanDate)

  // Coerção robusta de dia_fechamento e dia_vencimento (trata string "16", number, undefined, NaN)
  const rawFech = Number((conta as any)?.dia_fechamento)
  const diaFechamentoNum = !isNaN(rawFech) && rawFech > 0 ? rawFech : 0

  // Verifica se é conta do tipo cartão ou aceita crédito.
  // Se a conta for explicitamente do tipo 'cartao', ou aceitar crédito em tipos_pagamento:
  const isTipoCartao = conta?.tipo === 'cartao'
  const aceitaCredito = Boolean(
    conta &&
    (isTipoCartao ||
      (Array.isArray(conta.tipos_pagamento) && conta.tipos_pagamento.includes('credito')) ||
      (typeof (conta as any).tipos_pagamento === 'string' &&
        (conta as any).tipos_pagamento.includes('credito'))),
  )

  const isContaCartao = Boolean(conta && aceitaCredito && diaFechamentoNum > 0)

  const ehCredito = isContaCartao && (metodoEhCredito === undefined ? true : metodoEhCredito)

  const offsetParcela = Math.max(0, numeroParcela - 1)

  if (ehCredito && conta) {
    // Para cartão de crédito:
    // Cronograma canônico: parcela N = ciclo da fatura da compra da parcela N
    // (mês da data_inicio + N - 1, ajustado pelo dia_fechamento), sem duplicar
    // vencimentos nem pular meses na sequência.
    const total = Math.max(Number(totalParcelas) || 1, numeroParcela)
    const cronograma = gerarCronogramaParcelasCartao({
      conta,
      dataCompra: cleanDate,
      totalParcelas: total,
    })
    const parcela = cronograma[offsetParcela] || cronograma[cronograma.length - 1]

    return {
      competencia: parcela.competencia,
      dataVencimento: parcela.dataVencimento,
      dataVencimentoIso: parcela.dataVencimentoIso,
      isCartaoCredito: true,
    }
  }

  // Não-cartão (débito, transferência, boletos, pix, etc.):
  // Compra em mês cMesZero + offsetParcela
  const normDate = new Date(Date.UTC(cAno, cMesZero + offsetParcela, 1))
  const pAno = normDate.getUTCFullYear()
  const pMesZero = normDate.getUTCMonth()
  const competencia = formatYearMonth(pAno, pMesZero)

  const maxDias = getDaysInMonth(pAno, pMesZero)
  const diaDesejado = diaVencimento && diaVencimento > 0 ? diaVencimento : cDia || 10
  const realDia = Math.min(diaDesejado, maxDias)

  const dataVencimento = `${pAno}-${String(pMesZero + 1).padStart(2, '0')}-${String(realDia).padStart(2, '0')}`
  const dataVencimentoIso = `${dataVencimento}T12:00:00.000Z`

  return {
    competencia,
    dataVencimento,
    dataVencimentoIso,
    isCartaoCredito: false,
  }
}

/**
 * Formata o texto do selo da fatura do cartão para exibição na linha da ocorrência.
 * O selo reflete SEMPRE a competência e o vencimento da própria ocorrência clicada/exibida.
 * Exemplo: "Fatura de Novembro de 2026 · vence 10/12"
 */
export function formatarSeloFaturaOcorrencia(params: {
  conta?: Conta | null
  metodoEhCredito?: boolean
  competencia?: string
  dataVencimento?: string
  dataPagamento?: string
  dataCompraFallback?: string
}): string | null {
  const {
    conta,
    metodoEhCredito = true,
    competencia,
    dataVencimento,
    dataPagamento,
    dataCompraFallback,
  } = params

  if (!conta || conta.tipo !== 'cartao' || !metodoEhCredito) return null

  // 1. Prioridade: competência da própria ocorrência
  const compStr = competencia?.trim()
  if (compStr && compStr.length >= 7) {
    const [cyStr, cmStr] = compStr.split('-')
    const cYear = parseInt(cyStr, 10)
    const cMonth = parseInt(cmStr, 10) - 1
    if (!isNaN(cYear) && !isNaN(cMonth) && cMonth >= 0 && cMonth <= 11) {
      const dateObj = new Date(cYear, cMonth, 1)
      const mesAno = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
      const mesCap = mesAno.charAt(0).toUpperCase() + mesAno.slice(1)

      let diaMesVenc = ''
      if (dataVencimento) {
        const [vy, vm, vd] = dataVencimento.slice(0, 10).split('-')
        if (vd && vm) {
          diaMesVenc = `${vd}/${vm}`
        }
      }
      if (!diaMesVenc) {
        const vencCalculado = calcularVencimentoFatura(conta, compStr.slice(0, 7))
        const [, vm, vd] = vencCalculado.split('-')
        diaMesVenc = `${vd}/${vm}`
      }

      return `Fatura de ${mesCap} · vence ${diaMesVenc}`
    }
  }

  // 2. Fallback: calcula o ciclo a partir da data da transação/compra
  const dataRef =
    dataPagamento?.slice(0, 10) ||
    dataVencimento?.slice(0, 10) ||
    dataCompraFallback?.slice(0, 10) ||
    '2026-09-01'
  const ciclo = calcularFaturaCartao(conta, dataRef)
  const dateObj = new Date(ciclo.dataFechamento + 'T12:00:00')
  const mesAno = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const mesCap = mesAno.charAt(0).toUpperCase() + mesAno.slice(1)
  const [vy, vm, vd] = ciclo.dataVencimento.split('-')
  return `Fatura de ${mesCap} · vence ${vd}/${vm}`
}

/**
 * Determina a exibição de datas nos cards de despesas conforme a modalidade de pagamento.
 *
 * Regras acordadas:
 * 1. Crédito (compras no crédito):
 *    - Primário (destaque): Data da compra ("Compra: xx/xx/xxxx")
 *    - Secundário (discreto, menor, sem destaque): Vencimento da fatura / data de pagamento projetada ("Fatura: vence 23/10" ou "Fatura quitada: xx/xx/xxxx")
 * 2. Demais métodos (débito, Pix, dinheiro, boleto, etc.):
 *    - Compra e pagamento mantêm o padrão com destaque / peso normal:
 *      - Compra: xx/xx/xxxx
 *      - Pago em: xx/xx/xxxx (quando paga)
 *      - Venc: xx/xx/xxxx (quando pendente)
 */
export function getAvisoFaturaCartao(
  conta: Conta | undefined,
  dataTransacao: string,
): string | null {
  if (!conta) return null
  const rawFech = Number((conta as any).dia_fechamento)
  if (isNaN(rawFech) || rawFech <= 0) return null
  const aceitaCredito =
    conta.tipo === 'cartao' ||
    (Array.isArray(conta.tipos_pagamento) && conta.tipos_pagamento.includes('credito')) ||
    (typeof (conta as any).tipos_pagamento === 'string' &&
      (conta as any).tipos_pagamento.includes('credito'))
  if (!aceitaCredito) return null
  const fatura = calcularFaturaCartao(conta, dataTransacao)
  const dateObj = new Date(fatura.dataFechamento + 'T12:00:00')
  const mesAno = dateObj.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  const [vy, vm, vd] = fatura.dataVencimento.split('-')
  const diaMesVenc = `${vd}/${vm}`
  return `Este gasto entra na fatura de ${mesAno} (vence ${diaMesVenc})`
}

/**
 * Interface mínima aceita para itens de pagamento do ciclo (lançamentos de pagamento).
 */
export interface PagamentoFaturaItem {
  id?: string
  valor?: number
  data?: string
  created?: string
  is_pagamento_fatura?: boolean
  cartao_fatura_conta?: string
  competencia?: string
  [key: string]: unknown
}

/**
 * Interface mínima aceita para ocorrências/itens da fatura.
 */
export interface OcorrenciaFaturaItem {
  id?: string
  valor_previsto?: number
  valor_pago?: number
  valor?: number
  status?: string
  [key: string]: unknown
}

export interface CalcularEstadoCicloFaturaInput {
  totalFatura?: number
  ocorrencias?: OcorrenciaFaturaItem[]
  pagamentos?: PagamentoFaturaItem[]
}

/**
 * Calcula de forma DERIVADA e PURA o estado financeiro do ciclo de uma fatura de cartão.
 *
 * Regras:
 * 1. totalFatura: usa o parâmetro se fornecido e > 0, senão soma valor_previsto || valor das ocorrências.
 * 2. totalPago: soma de todos os pagamentos (is_pagamento_fatura) aplicáveis ao ciclo. Se não houver pagamentos
 *    mas houver ocorrências com status 'paga', soma os valores das ocorrências pagas como fallback retrocompatível.
 * 3. valorRestante: max(0, totalFatura - totalPago). Nunca negativo.
 * 4. excedente: max(0, totalPago - totalFatura).
 * 5. status:
 *    - totalFatura <= 0 -> 'nao_pago' (ou 'pago' se totalPago > 0)
 *    - totalPago >= totalFatura - 0.009 -> 'pago'
 *    - totalPago > 0.009 -> 'parcialmente_pago'
 *    - senão -> 'nao_pago'
 * 6. percentualPago: entre 0 e 100 (arredondado ou com decimais)
 * 7. dataUltimoPagamento: data do pagamento mais recente formatável ('YYYY-MM-DD' ou ISO)
 * 8. pagamentosCount: quantidade de pagamentos somados
 */
export function calcularEstadoCicloFatura(
  input: CalcularEstadoCicloFaturaInput,
): EstadoCicloFatura {
  const { totalFatura: rawTotalFatura, ocorrencias = [], pagamentos = [] } = input

  // 1. Calcula o total da fatura
  let totalFatura = Number(rawTotalFatura) || 0
  if (totalFatura <= 0 && ocorrencias.length > 0) {
    totalFatura = ocorrencias.reduce((acc, oc) => {
      const v = Number(oc.valor_previsto ?? oc.valor ?? 0)
      return acc + (isNaN(v) ? 0 : v)
    }, 0)
  }

  // Arredonda para 2 casas
  totalFatura = Math.round(totalFatura * 100) / 100

  // 2. Pagamentos do ciclo
  let totalPago = 0
  let dataMaisRecente: string | undefined = undefined
  let countPagamentos = 0

  if (pagamentos.length > 0) {
    for (const pag of pagamentos) {
      const val = Number(pag.valor) || 0
      if (val > 0) {
        totalPago += val
        countPagamentos += 1
        const d = (pag.data || pag.created || '').slice(0, 10)
        if (d && (!dataMaisRecente || d > dataMaisRecente)) {
          dataMaisRecente = d
        }
      }
    }
  } else if (ocorrencias.length > 0) {
    // Fallback: se nenhum lançamento is_pagamento_fatura foi passado,
    // verifica se as ocorrências têm status 'paga'
    for (const oc of ocorrencias) {
      if (oc.status === 'paga' || oc.status === 'pago') {
        const val = Number(oc.valor_pago ?? oc.valor_previsto ?? oc.valor ?? 0)
        if (val > 0) {
          totalPago += val
          countPagamentos += 1
          const d = ((oc as any).data_pagamento || (oc as any).data || '').slice(0, 10)
          if (d && (!dataMaisRecente || d > dataMaisRecente)) {
            dataMaisRecente = d
          }
        }
      }
    }
  }

  totalPago = Math.round(totalPago * 100) / 100

  // 3. Cálculos derivados
  const diferenca = totalFatura - totalPago
  const valorRestante = Math.max(0, Math.round(diferenca * 100) / 100)
  const excedente =
    totalPago > totalFatura + 0.009 ? Math.round((totalPago - totalFatura) * 100) / 100 : 0

  let status: StatusFaturaCiclo = 'nao_pago'
  if (totalFatura > 0) {
    if (totalPago >= totalFatura - 0.009) {
      status = 'pago'
    } else if (totalPago > 0.009) {
      status = 'parcialmente_pago'
    } else {
      status = 'nao_pago'
    }
  } else if (totalPago > 0) {
    status = 'pago'
  }

  const percentualPago =
    totalFatura > 0
      ? Math.min(100, Math.max(0, Math.round((totalPago / totalFatura) * 1000) / 10))
      : totalPago > 0
        ? 100
        : 0

  return {
    status,
    totalFatura,
    totalPago,
    valorRestante,
    excedente,
    percentualPago,
    dataUltimoPagamento: dataMaisRecente,
    pagamentosCount: countPagamentos,
  }
}
