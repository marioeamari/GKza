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
  const diaFechamento = conta.dia_fechamento || 10
  const diaVencimento = conta.dia_vencimento || 20

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
export function getAvisoFaturaCartao(
  conta: Conta | undefined,
  dataTransacao: string,
): string | null {
  if (!conta) return null
  const aceitaCredito =
    (conta.tipos_pagamento && conta.tipos_pagamento.includes('credito')) || conta.tipo === 'cartao'
  if (!aceitaCredito || !conta.dia_fechamento) return null
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
