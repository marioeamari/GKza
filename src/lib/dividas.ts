/**
 * MÓDULO DIVIDAS - Funções Puras de Cálculo e Projeção
 *
 * Totalmente isolado do financeiro (lancamentos, contas, despesas, dizimos).
 *
 * Contratos principais:
 * 1. Simulação de cronograma de parcelas (iguais ou irregulares).
 * 2. Renegociação recalculando restante a partir da parcela X preservando pagas.
 * 3. Saldo devedor e saldos restantes após cada parcela.
 * 4. Receitas por máquina: cobertura de parcelas pagas (pela receita vs bolso) e Payback.
 * 5. Projeção de Caixa por Máquina: receitas + saldo inicial vs parcelas no tempo,
 *    marcando última parcela coberta e data da primeira falta de caixa.
 * 6. Demonstrativo Global: consolidação ordenada no tempo de todas as parcelas/máquinas,
 *    identificando qual parcela de qual dívida fica descoberta primeiro.
 */

export type DividaStatus = 'ativa' | 'quitada' | 'renegociada'
export type ParcelaStatus = 'pendente' | 'paga' | 'atrasada'

export interface DividaRecord {
  id: string
  nome: string
  credor: string
  valor_total: number
  data_contratacao: string
  taxa_juros?: number
  taxa_juros_tipo?: 'mensal' | 'anual' | 'total'
  numero_parcelas?: number
  status: DividaStatus
  saldo_inicial_caixa?: number
  observacoes?: string
  ativo?: boolean
  created?: string
  updated?: string
}

export interface ParcelaRecord {
  id: string
  divida: string
  numero: number
  data_vencimento: string
  valor: number
  status: ParcelaStatus
  data_pagamento?: string
  valor_pago?: number
  is_entrada?: boolean
  observacoes?: string
  lancamento_id?: string
  created?: string
  updated?: string
}

export interface ReceitaRecord {
  id: string
  divida: string
  data: string
  valor: number
  descricao: string
  origem?: string
  observacoes?: string
  lancamento_id?: string
  created?: string
  updated?: string
}

export interface DespesaAvulsaRecord {
  id: string
  divida: string
  data: string
  valor: number
  descricao?: string
  origem?: string
  observacoes?: string
  lancamento_id?: string
  created?: string
  updated?: string
}

export interface ParcelaComSaldo extends ParcelaRecord {
  saldo_restante_apos: number
}

export interface ResumoDivida {
  valor_total: number
  total_pago: number
  saldo_devedor: number
  percentual_quitado: number
  total_parcelas: number
  parcelas_pagas: number
  parcelas_pendentes: number
  parcelas_atrasadas: number
  proxima_parcela?: ParcelaRecord
}

export interface ResumoPayback {
  total_investimento: number
  total_receitas: number
  total_pago: number
  saldo_devedor: number
  /** Quanto das parcelas pagas foi coberto por receitas geradas pela máquina */
  pago_coberto_receitas: number
  /** Quanto das parcelas pagas veio do bolso (não coberto por receitas) */
  pago_coberto_bolso: number
  percentual_payback_investimento: number
  percentual_cobertura_pago: number
  payback_alcancado: boolean
  deficit_para_payback: number
  /** Projeção estimada de meses para atingir payback com base na média mensal de receitas */
  meses_estimados_payback?: number
}

export interface LinhaProjecaoCaixa {
  mes_ano: string // YYYY-MM
  saldo_inicial_mes: number
  receitas_mes: number
  despesas_mes: number
  parcelas_mes: number
  saldo_final_mes: number
  parcelas_detalhe: {
    id: string
    numero: number
    valor: number
    data_vencimento: string
    status: ParcelaStatus
    coberta: boolean
  }[]
  coberto: boolean
}

export interface ProjecaoCaixaMaquina {
  divida_id: string
  divida_nome: string
  saldo_inicial_configurado: number
  total_receitas_historicas: number
  total_despesas_historicas: number
  total_pago_historico: number
  caixa_atual_disponivel: number
  linhas_mensais: LinhaProjecaoCaixa[]
  /** Última parcela futura que o caixa projetado consegue honrar integralmente */
  ultima_parcela_coberta?: {
    id: string
    numero: number
    data_vencimento: string
    valor: number
  }
  /** Primeira parcela futura que NÃO terá saldo suficiente */
  primeira_parcela_descoberta?: {
    id: string
    numero: number
    data_vencimento: string
    valor: number
    saldo_faltante: number
  }
  mes_esgotamento_caixa?: string
}

export interface DemonstrativoGlobalItem {
  divida_id: string
  divida_nome: string
  parcela_id: string
  numero: number
  data_vencimento: string
  valor: number
  status: ParcelaStatus
  caixa_maquina_projetado_apos: number
  coberta_pela_maquina: boolean
  valor_descoberto: number
}

export interface ItemParcelaMensalPrevisto {
  divida_id: string
  divida_nome: string
  parcela_id: string
  numero: number
  data_vencimento: string
  valor: number
  status: ParcelaStatus
  paga: boolean
  valor_pago?: number
  data_pagamento?: string
}

export interface ItemReceitaMensalPrevisto {
  divida_id: string
  divida_nome: string
  receita_id: string
  data: string
  valor: number
  descricao: string
}

export interface ItemDespesaMensalPrevisto {
  divida_id: string
  divida_nome: string
  despesa_id: string
  data: string
  valor: number
  descricao?: string
}

export interface TotalMensalPrevistoDemonstrativo {
  mes_ano: string // 'YYYY-MM'
  total_parcelas_mes: number // soma de todas as parcelas com vencimento no mês
  total_parcelas_aberto: number // parcelas pendentes ou atrasadas (não pagas)
  total_parcelas_pagas: number // parcelas pagas no mês
  total_receitas_mes: number // receitas registradas no mês
  total_despesas_mes: number // despesas avulsas registradas no mês
  falta_arrecadar: number // max(0, (parcelas em aberto + despesas) - receitas do mês)
  superavit: number // max(0, receitas do mês - (parcelas em aberto + despesas))
  quantidade_parcelas: number
  quantidade_parcelas_aberto: number
  quantidade_parcelas_pagas: number
  quantidade_receitas: number
  quantidade_despesas: number
  parcelas: ItemParcelaMensalPrevisto[]
  receitas: ItemReceitaMensalPrevisto[]
  despesas: ItemDespesaMensalPrevisto[]
}

export interface DemonstrativoGlobal {
  total_dividas: number
  valor_total_consolidado: number
  total_pago_consolidado: number
  saldo_devedor_consolidado: number
  total_receitas_consolidado: number
  total_despesas_consolidado: number
  cronograma_unificado: DemonstrativoGlobalItem[]
  primeira_descoberta_global?: DemonstrativoGlobalItem
}

/**
 * Adiciona meses a uma data YYYY-MM-DD preservando o dia desejado (ou ajustando ao último dia do mês).
 */
export function adicionarMeses(dataIso: string, meses: number): string {
  const [ano, mes, dia] = dataIso.slice(0, 10).split('-').map(Number)
  const dOriginal = dia || 1
  const novaData = new Date(ano, mes - 1 + meses, 1, 12)
  const anoResult = novaData.getFullYear()
  const mesResult = novaData.getMonth() + 1
  const ultimoDiaMes = new Date(anoResult, mesResult, 0, 12).getDate()
  const diaFinal = Math.min(dOriginal, ultimoDiaMes)
  return `${anoResult}-${String(mesResult).padStart(2, '0')}-${String(diaFinal).padStart(2, '0')}`
}

/**
 * Arredonda valor para 2 casas decimais.
 */
export function arredondarMoeda(valor: number): number {
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * Calcula saldo devedor e resumo geral de uma dívida a partir de suas parcelas.
 */
export function calcularResumoDivida(
  divida: Pick<DividaRecord, 'valor_total'>,
  parcelas: ParcelaRecord[],
  hojeIso = new Date().toISOString().slice(0, 10),
): ResumoDivida {
  const valorTotal = arredondarMoeda(divida.valor_total || 0)

  let totalPago = 0
  let parcelasPagas = 0
  let parcelasPendentes = 0
  let parcelasAtrasadas = 0

  const parcelasOrdenadas = [...parcelas].sort((a, b) => {
    if (a.numero !== b.numero) return a.numero - b.numero
    return a.data_vencimento.localeCompare(b.data_vencimento)
  })

  let proximaParcela: ParcelaRecord | undefined

  for (const p of parcelasOrdenadas) {
    if (p.status === 'paga') {
      parcelasPagas++
      // Parcela paga deve considerar valor_pago se > 0; se estiver 0 ou nulo, aplica fallback seguro para o valor previsto
      const pago =
        p.valor_pago !== undefined && p.valor_pago !== null && p.valor_pago > 0
          ? p.valor_pago
          : p.valor
      totalPago += pago
    } else {
      const isAtrasada = p.status === 'atrasada' || p.data_vencimento < hojeIso
      if (isAtrasada) {
        parcelasAtrasadas++
      } else {
        parcelasPendentes++
      }
      if (!proximaParcela) {
        proximaParcela = p
      }
    }
  }

  totalPago = arredondarMoeda(totalPago)
  const saldoDevedor = arredondarMoeda(Math.max(0, valorTotal - totalPago))
  const percentualQuitado =
    valorTotal > 0 ? arredondarMoeda(Math.min(100, (totalPago / valorTotal) * 100)) : 100

  return {
    valor_total: valorTotal,
    total_pago: totalPago,
    saldo_devedor: saldoDevedor,
    percentual_quitado: percentualQuitado,
    total_parcelas: parcelas.length,
    parcelas_pagas: parcelasPagas,
    parcelas_pendentes: parcelasPendentes,
    parcelas_atrasadas: parcelasAtrasadas,
    proxima_parcela: proximaParcela,
  }
}

/**
 * Calcula a listagem de parcelas com o saldo devedor restante APÓS cada parcela.
 * As parcelas são ordenadas pelo número (ou vencimento).
 * O saldo decresce conforme cada parcela é quitada ou prevista no cronograma total.
 */
export function calcularCronogramaComSaldo(
  valorTotalDivida: number,
  parcelas: ParcelaRecord[],
): ParcelaComSaldo[] {
  const ordenadas = [...parcelas].sort((a, b) => {
    if (a.numero !== b.numero) return a.numero - b.numero
    return a.data_vencimento.localeCompare(b.data_vencimento)
  })

  let saldo = arredondarMoeda(valorTotalDivida)
  const resultado: ParcelaComSaldo[] = []

  for (const p of ordenadas) {
    const abatimento =
      p.status === 'paga' && p.valor_pago !== undefined && p.valor_pago !== null && p.valor_pago > 0
        ? p.valor_pago
        : p.valor
    saldo = arredondarMoeda(Math.max(0, saldo - abatimento))
    resultado.push({
      ...p,
      saldo_restante_apos: saldo,
    })
  }

  return resultado
}

/**
 * Parâmetros para geração ou simulação de parcelas restantes.
 */
export interface SimularParcelasParams {
  dividaId: string
  montanteRestante: number
  quantidadeParcelas: number
  primeiroVencimento: string
  numeroInicial?: number // Padrão: 1
  valoresCustomizados?: number[] // Se informado, usa cada valor específico
}

/**
 * Gera um cronograma de parcelas (iguais ou irregulares) sobre o montante restante.
 * Trata centavos na última parcela para que a soma exata bata com o montante.
 */
export function simularParcelasRestantes(
  params: SimularParcelasParams,
): Omit<ParcelaRecord, 'id'>[] {
  const {
    dividaId,
    montanteRestante,
    quantidadeParcelas,
    primeiroVencimento,
    numeroInicial = 1,
    valoresCustomizados,
  } = params

  if (quantidadeParcelas <= 0 || montanteRestante <= 0) {
    return []
  }

  const resultado: Omit<ParcelaRecord, 'id'>[] = []

  if (valoresCustomizados && valoresCustomizados.length === quantidadeParcelas) {
    for (let i = 0; i < quantidadeParcelas; i++) {
      const num = numeroInicial + i
      const vencimento = adicionarMeses(primeiroVencimento, i)
      const val = arredondarMoeda(valoresCustomizados[i] || 0)
      resultado.push({
        divida: dividaId,
        numero: num,
        data_vencimento: vencimento,
        valor: val,
        status: 'pendente',
      })
    }
    return resultado
  }

  // Divisão padrão: calcula base e distribui centavos na última parcela
  const valorBase = Math.floor((montanteRestante / quantidadeParcelas) * 100) / 100
  let acumulado = 0

  for (let i = 0; i < quantidadeParcelas; i++) {
    const num = numeroInicial + i
    const vencimento = adicionarMeses(primeiroVencimento, i)
    let val: number

    if (i === quantidadeParcelas - 1) {
      val = arredondarMoeda(montanteRestante - acumulado)
    } else {
      val = valorBase
      acumulado = arredondarMoeda(acumulado + val)
    }

    resultado.push({
      divida: dividaId,
      numero: num,
      data_vencimento: vencimento,
      valor: val,
      status: 'pendente',
    })
  }

  return resultado
}

/**
 * RENEGOCIAÇÃO:
 * Recalcula o cronograma a partir da parcela de número X (ou a partir das não-pagas),
 * PRESERVANDO o histórico das parcelas que já estão pagas (com suas datas e valores pagos).
 */
export interface RenegociarParams {
  divida: DividaRecord
  parcelasAtuais: ParcelaRecord[]
  aPartirDoNumero: number
  novoMontanteRestante: number
  novaQuantidadeParcelas: number
  primeiroNovoVencimento: string
  valoresCustomizados?: number[]
}

export function renegociarCronograma(params: RenegociarParams): ParcelaRecord[] {
  const {
    divida,
    parcelasAtuais,
    aPartirDoNumero,
    novoMontanteRestante,
    novaQuantidadeParcelas,
    primeiroNovoVencimento,
    valoresCustomizados,
  } = params

  // 1. Preservar parcelas pagas e/ou parcelas anteriores ao número de corte
  const preservadas = parcelasAtuais
    .filter((p) => p.status === 'paga' || p.numero < aPartirDoNumero)
    .sort((a, b) => a.numero - b.numero)

  // 2. Determinar o próximo número sequencial
  const maiorNumeroPreservado = preservadas.reduce((max, p) => Math.max(max, p.numero), 0)
  const numeroInicialNovas = Math.max(aPartirDoNumero, maiorNumeroPreservado + 1)

  // 3. Simular as novas parcelas
  const novas = simularParcelasRestantes({
    dividaId: divida.id,
    montanteRestante: novoMontanteRestante,
    quantidadeParcelas: novaQuantidadeParcelas,
    primeiroVencimento: primeiroNovoVencimento,
    numeroInicial: numeroInicialNovas,
    valoresCustomizados,
  })

  // Converte as novas gerando IDs temporários caso necessário
  const novasCompletas: ParcelaRecord[] = novas.map((p, idx) => ({
    ...p,
    id: `temp_reneg_${numeroInicialNovas + idx}`,
  }))

  return [...preservadas, ...novasCompletas]
}

/**
 * RECEITAS POR MÁQUINA & PAYBACK:
 * Calcula quanto a máquina já pagou de si mesma e quanto veio do bolso,
 * além do percentual de amortização do investimento total.
 */
export function calcularPaybackMaquina(
  divida: Pick<DividaRecord, 'valor_total'>,
  parcelas: ParcelaRecord[],
  receitas: ReceitaRecord[],
  despesas: DespesaAvulsaRecord[] = [],
): ResumoPayback {
  const totalInvestimento = arredondarMoeda(divida.valor_total || 0)

  // Total de receitas geradas pela máquina
  const totalReceitas = arredondarMoeda(receitas.reduce((acc, r) => acc + (r.valor || 0), 0))

  // Total de parcelas efetivamente quitadas
  const totalPago = arredondarMoeda(
    parcelas
      .filter((p) => p.status === 'paga')
      .reduce(
        (acc, p) =>
          acc +
          (p.valor_pago !== undefined && p.valor_pago !== null && p.valor_pago > 0
            ? p.valor_pago
            : p.valor),
        0,
      ),
  )

  const saldoDevedor = arredondarMoeda(Math.max(0, totalInvestimento - totalPago))

  // Quanto do que foi pago veio das receitas geradas pela máquina vs bolso
  // Se a máquina gerou R$ 15.000 e já pagamos R$ 20.000, R$ 15.000 foi coberto por receitas e R$ 5.000 veio do bolso.
  // Se a máquina gerou R$ 30.000 e pagamos R$ 20.000, 100% dos R$ 20.000 foi coberto por receitas.
  const pagoCobertoReceitas = arredondarMoeda(Math.min(totalPago, totalReceitas))
  const pagoCobertoBolso = arredondarMoeda(Math.max(0, totalPago - pagoCobertoReceitas))

  const percentualPaybackInvestimento =
    totalInvestimento > 0
      ? arredondarMoeda(Math.min(100, (totalReceitas / totalInvestimento) * 100))
      : 100

  const percentualCoberturaPago =
    totalPago > 0 ? arredondarMoeda(Math.min(100, (pagoCobertoReceitas / totalPago) * 100)) : 100

  const paybackAlcancado = totalReceitas >= totalInvestimento
  const deficitParaPayback = arredondarMoeda(Math.max(0, totalInvestimento - totalReceitas))

  // Estimativa de meses para payback com base nas receitas históricas
  let mesesEstimadosPayback: number | undefined
  if (!paybackAlcancado && totalReceitas > 0 && receitas.length > 0) {
    const datas = receitas.map((r) => r.data.slice(0, 10)).sort()
    const primeiraData = datas[0]
    const ultimaData = datas[datas.length - 1]
    const d1 = new Date(primeiraData)
    const d2 = new Date(ultimaData)
    const diffMeses = Math.max(
      1,
      (d2.getFullYear() - d1.getFullYear()) * 12 + (d2.getMonth() - d1.getMonth()) + 1,
    )
    const mediaReceitaMensal = totalReceitas / diffMeses
    if (mediaReceitaMensal > 0) {
      mesesEstimadosPayback = Math.ceil(deficitParaPayback / mediaReceitaMensal)
    }
  }

  return {
    total_investimento: totalInvestimento,
    total_receitas: totalReceitas,
    total_pago: totalPago,
    saldo_devedor: saldoDevedor,
    pago_coberto_receitas: pagoCobertoReceitas,
    pago_coberto_bolso: pagoCobertoBolso,
    percentual_payback_investimento: percentualPaybackInvestimento,
    percentual_cobertura_pago: percentualCoberturaPago,
    payback_alcancado: paybackAlcancado,
    deficit_para_payback: deficitParaPayback,
    meses_estimados_payback: mesesEstimadosPayback,
  }
}

/**
 * CAIXA POR MÁQUINA & PROJEÇÃO MÊS A MÊS:
 * Simula a evolução do caixa da máquina:
 * - Saldo inicial configurado para a dívida
 * - Receitas históricas e futuras já registradas
 * - Menos parcelas já pagas = Caixa atual disponível
 * - Para os meses futuros: acumula receitas do mês vs parcelas a vencer
 * - Determina até qual parcela o caixa cobre e quando começará a faltar.
 */
export function projetarCaixaPorMaquina(
  divida: DividaRecord,
  parcelas: ParcelaRecord[],
  receitas: ReceitaRecord[],
  despesas: DespesaAvulsaRecord[] = [],
  hojeIso = new Date().toISOString().slice(0, 10),
): ProjecaoCaixaMaquina {
  const saldoInicialConfigurado = arredondarMoeda(divida.saldo_inicial_caixa || 0)

  // 1. Calcular o caixa disponível hoje
  // Caixa = Saldo Inicial + Total Receitas Realizadas - Total Despesas Avulsas Realizadas - Total Parcelas Pagas
  const totalReceitasHistoricas = arredondarMoeda(
    receitas
      .filter((r) => r.data.slice(0, 10) <= hojeIso)
      .reduce((acc, r) => acc + (r.valor || 0), 0),
  )

  const totalDespesasHistoricas = arredondarMoeda(
    despesas
      .filter((d) => d.data.slice(0, 10) <= hojeIso)
      .reduce((acc, d) => acc + (d.valor || 0), 0),
  )

  const totalPagoHistorico = arredondarMoeda(
    parcelas
      .filter((p) => p.status === 'paga')
      .reduce(
        (acc, p) =>
          acc +
          (p.valor_pago !== undefined && p.valor_pago !== null && p.valor_pago > 0
            ? p.valor_pago
            : p.valor),
        0,
      ),
  )

  const caixaAtualDisponivel = arredondarMoeda(
    saldoInicialConfigurado +
      totalReceitasHistoricas -
      totalDespesasHistoricas -
      totalPagoHistorico,
  )

  // 2. Agrupar receitas/despesas futuras (data > hoje) e parcelas pendentes/atrasadas por mês
  const parcelasPendentes = parcelas
    .filter((p) => p.status !== 'paga')
    .sort((a, b) => {
      if (a.data_vencimento !== b.data_vencimento) {
        return a.data_vencimento.localeCompare(b.data_vencimento)
      }
      return a.numero - b.numero
    })

  // Coleta todos os meses relevantes (a partir do mês atual até o vencimento da última parcela)
  const mesesSet = new Set<string>()
  const mesAtual = hojeIso.slice(0, 7)
  mesesSet.add(mesAtual)

  for (const p of parcelasPendentes) {
    const m = p.data_vencimento.slice(0, 7)
    if (m >= mesAtual) {
      mesesSet.add(m)
    }
  }

  for (const r of receitas) {
    const m = r.data.slice(0, 7)
    if (m >= mesAtual) {
      mesesSet.add(m)
    }
  }

  for (const d of despesas) {
    const m = d.data.slice(0, 7)
    if (m >= mesAtual) {
      mesesSet.add(m)
    }
  }

  const mesesOrdenados = Array.from(mesesSet).sort()

  // Se tiver parcelas anteriores ao mês atual atrasadas, elas impactam no mês corrente
  let saldoCaixaSimulado = caixaAtualDisponivel
  const linhasMensais: LinhaProjecaoCaixa[] = []

  let ultimaParcelaCoberta: ProjecaoCaixaMaquina['ultima_parcela_coberta']
  let primeiraParcelaDescoberta: ProjecaoCaixaMaquina['primeira_parcela_descoberta']
  let mesEsgotamento: string | undefined

  // Processamento cronológico de cada parcela pendente
  // Também vamos rastrear para marcar individualmente cada parcela como coberta ou não
  const coberturaPorParcelaId = new Map<string, boolean>()

  let simuladorCaixaParcela = caixaAtualDisponivel

  // Para cada parcela pendente na ordem de vencimento:
  // ela é coberta se no momento do vencimento o caixa (acumulado com receitas até a data) for >= valor
  for (const p of parcelasPendentes) {
    // Adiciona receitas que entram até a data de vencimento da parcela (que ainda não foram somadas)
    // Para simplificar a simulação de projeção:
    // Se o caixa acumulado até então for suficiente para pagar o valor da parcela:
    if (simuladorCaixaParcela >= p.valor) {
      simuladorCaixaParcela = arredondarMoeda(simuladorCaixaParcela - p.valor)
      coberturaPorParcelaId.set(p.id, true)
      ultimaParcelaCoberta = {
        id: p.id,
        numero: p.numero,
        data_vencimento: p.data_vencimento,
        valor: p.valor,
      }
    } else {
      coberturaPorParcelaId.set(p.id, false)
      if (!primeiraParcelaDescoberta) {
        primeiraParcelaDescoberta = {
          id: p.id,
          numero: p.numero,
          data_vencimento: p.data_vencimento,
          valor: p.valor,
          saldo_faltante: arredondarMoeda(p.valor - Math.max(0, simuladorCaixaParcela)),
        }
        mesEsgotamento = p.data_vencimento.slice(0, 7)
      }
      simuladorCaixaParcela = arredondarMoeda(simuladorCaixaParcela - p.valor)
    }
  }

  // Monta as linhas da tabela mês a mês
  for (const mes of mesesOrdenados) {
    const receitasDoMes = arredondarMoeda(
      receitas
        .filter(
          (r) => r.data.slice(0, 7) === mes && (mes > mesAtual || r.data.slice(0, 10) > hojeIso),
        )
        .reduce((acc, r) => acc + (r.valor || 0), 0),
    )

    const despesasDoMes = arredondarMoeda(
      despesas
        .filter(
          (d) => d.data.slice(0, 7) === mes && (mes > mesAtual || d.data.slice(0, 10) > hojeIso),
        )
        .reduce((acc, d) => acc + (d.valor || 0), 0),
    )

    // Parcelas que vencem neste mês (se for o mês atual, inclui também as em atraso de meses anteriores)
    const parcelasDoMes = parcelasPendentes.filter((p) => {
      const pMes = p.data_vencimento.slice(0, 7)
      if (mes === mesAtual) {
        return pMes <= mesAtual
      }
      return pMes === mes
    })

    const valorParcelasDoMes = arredondarMoeda(parcelasDoMes.reduce((acc, p) => acc + p.valor, 0))

    const saldoInicialMes = saldoCaixaSimulado
    const saldoFinalMes = arredondarMoeda(
      saldoInicialMes + receitasDoMes - despesasDoMes - valorParcelasDoMes,
    )
    saldoCaixaSimulado = saldoFinalMes

    linhasMensais.push({
      mes_ano: mes,
      saldo_inicial_mes: saldoInicialMes,
      receitas_mes: receitasDoMes,
      despesas_mes: despesasDoMes,
      parcelas_mes: valorParcelasDoMes,
      saldo_final_mes: saldoFinalMes,
      parcelas_detalhe: parcelasDoMes.map((p) => ({
        id: p.id,
        numero: p.numero,
        valor: p.valor,
        data_vencimento: p.data_vencimento,
        status: p.status,
        coberta: coverageOrFallback(coberturaPorParcelaId, p.id),
      })),
      coberto: saldoFinalMes >= 0,
    })
  }

  return {
    divida_id: divida.id,
    divida_nome: divida.nome,
    saldo_inicial_configurado: saldoInicialConfigurado,
    total_receitas_historicas: totalReceitasHistoricas,
    total_despesas_historicas: totalDespesasHistoricas,
    total_pago_historico: totalPagoHistorico,
    caixa_atual_disponivel: caixaAtualDisponivel,
    linhas_mensais: linhasMensais,
    ultima_parcela_coberta: ultimaParcelaCoberta,
    primeira_parcela_descoberta: primeiraParcelaDescoberta,
    mes_esgotamento_caixa: mesEsgotamento,
  }
}

function coverageOrFallback(map: Map<string, boolean>, id: string): boolean {
  return map.get(id) ?? false
}

/**
 * DEMONSTRATIVO GLOBAL (Visão Consolidada):
 * "deixe um demonstrativo global. O demonstrativo global consolida todas as dívidas/parcelas
 * ordenadas por data mostrando qual parcela de qual dívida fica descoberta primeiro
 * (visão consolidada apenas, sem caixa compartilhado)."
 *
 * Cada dívida mantém estritamente seu próprio caixa isolado.
 * O demonstrativo unifica o cronograma das dívidas e mostra a linha do tempo,
 * indicando a primeira parcela no tempo global que fica descoberta.
 */
export function consolidarDemonstrativoGlobal(
  dividas: DividaRecord[],
  parcelasPorDivida: Map<string, ParcelaRecord[]>,
  receitasPorDivida: Map<string, ReceitaRecord[]>,
  despesasPorDivida: Map<string, DespesaAvulsaRecord[]> = new Map(),
  hojeIso = new Date().toISOString().slice(0, 10),
): DemonstrativoGlobal {
  let valorTotalConsolidado = 0
  let totalPagoConsolidado = 0
  let totalReceitasConsolidado = 0
  let totalDespesasConsolidado = 0

  const cronogramaUnificado: DemonstrativoGlobalItem[] = []
  const projecoesMap = new Map<string, ProjecaoCaixaMaquina>()

  for (const div of dividas) {
    const pars = parcelasPorDivida.get(div.id) || []
    const recs = receitasPorDivida.get(div.id) || []
    const desps = despesasPorDivida.get(div.id) || []

    const resumo = calcularResumoDivida(div, pars, hojeIso)
    valorTotalConsolidado += resumo.valor_total
    totalPagoConsolidado += resumo.total_pago

    const recTotal = recs.reduce((acc, r) => acc + (r.valor || 0), 0)
    totalReceitasConsolidado += recTotal

    const despTotal = desps.reduce((acc, d) => acc + (d.valor || 0), 0)
    totalDespesasConsolidado += despTotal

    const projecao = projetarCaixaPorMaquina(div, pars, recs, desps, hojeIso)
    projecoesMap.set(div.id, projecao)

    // Agrega todas as parcelas pendentes daquela dívida com a indicação de cobertura individual
    const parsPendentes = pars.filter((p) => p.status !== 'paga')

    // Mapeia cobertura calculada na projeção
    const cobertaMap = new Map<string, boolean>()
    for (const linha of projecao.linhas_mensais) {
      for (const item of linha.parcelas_detalhe) {
        cobertaMap.set(item.id, item.coberta)
      }
    }

    for (const p of parsPendentes) {
      const coberta = cobertaMap.get(p.id) ?? false
      cronogramaUnificado.push({
        divida_id: div.id,
        divida_nome: div.nome,
        parcela_id: p.id,
        numero: p.numero,
        data_vencimento: p.data_vencimento,
        valor: p.valor,
        status: p.status,
        caixa_maquina_projetado_apos: 0, // calculado abaixo
        coberta_pela_maquina: coberta,
        valor_descoberto: coberta ? 0 : p.valor,
      })
    }
  }

  // Ordena cronograma unificado por data de vencimento
  cronogramaUnificado.sort((a, b) => {
    if (a.data_vencimento !== b.data_vencimento) {
      return a.data_vencimento.localeCompare(b.data_vencimento)
    }
    return a.divida_nome.localeCompare(b.divida_nome)
  })

  // Identifica a primeira parcela global descoberta
  const primeiraDescoberta = cronogramaUnificado.find((item) => !item.coberta_pela_maquina)

  const saldoDevedorConsolidado = arredondarMoeda(
    Math.max(0, valorTotalConsolidado - totalPagoConsolidado),
  )

  return {
    total_dividas: dividas.length,
    valor_total_consolidado: arredondarMoeda(valorTotalConsolidado),
    total_pago_consolidado: arredondarMoeda(totalPagoConsolidado),
    saldo_devedor_consolidado: saldoDevedorConsolidado,
    total_receitas_consolidado: arredondarMoeda(totalReceitasConsolidado),
    total_despesas_consolidado: arredondarMoeda(totalDespesasConsolidado),
    cronograma_unificado: cronogramaUnificado,
    primeira_descoberta_global: primeiraDescoberta,
  }
}

/**
 * Retorna uma competência 'YYYY-MM' deslocada em N meses a partir de uma competência base.
 * Exemplo: navegarMesCompetencia('2026-10', 1) => '2026-11'
 *          navegarMesCompetencia('2026-01', -1) => '2025-12'
 */
export function navegarMesCompetencia(mesAno: string, offsetMeses: number): string {
  const [anoStr, mesStr] = (mesAno || '').slice(0, 7).split('-')
  const ano = parseInt(anoStr, 10) || new Date().getFullYear()
  const mesZero = (parseInt(mesStr, 10) || 1) - 1
  const novaData = new Date(Date.UTC(ano, mesZero + offsetMeses, 1))
  const anoResult = novaData.getUTCFullYear()
  const mesResult = novaData.getUTCMonth() + 1
  return `${anoResult}-${String(mesResult).padStart(2, '0')}`
}

/**
 * Formata 'YYYY-MM' para rótulo legível em Português.
 * Exemplo: '2026-10' => 'Outubro de 2026'
 */
export function formatarRotuloMesAno(mesAno: string): string {
  const [anoStr, mesStr] = (mesAno || '').slice(0, 7).split('-')
  const ano = parseInt(anoStr, 10)
  const mesNum = parseInt(mesStr, 10)
  if (isNaN(ano) || isNaN(mesNum) || mesNum < 1 || mesNum > 12) {
    return mesAno
  }
  const meses = [
    'Janeiro',
    'Fevereiro',
    'Março',
    'Abril',
    'Maio',
    'Junho',
    'Julho',
    'Agosto',
    'Setembro',
    'Outubro',
    'Novembro',
    'Dezembro',
  ]
  return `${meses[mesNum - 1]} de ${ano}`
}

/**
 * TOTAL MENSAL PREVISTO (Demonstrativo Global):
 *
 * Agregação pura para um determinado mês 'YYYY-MM' em todas as dívidas ativas:
 * 1. Soma parcelas com vencimento naquele mês:
 *    - total_parcelas_mes: total geral previsto no mês (pagas + pendentes/atrasadas).
 *    - total_parcelas_aberto: apenas parcelas não pagas (o que de fato precisa ser arrecadado).
 *    - total_parcelas_pagas: o que já foi liquidado no mês.
 * 2. Total de receitas previstas/registradas das máquinas com data naquele mês.
 * 3. Resultado líquido:
 *    - falta_arrecadar = max(0, total_parcelas_aberto - total_receitas_mes).
 *    - superavit = max(0, total_receitas_mes - total_parcelas_aberto).
 *
 * Considera apenas dívidas ativas (ou todas se apenasAtivas = false).
 */
export function calcularTotalMensalPrevisto(params: {
  mesAno: string // 'YYYY-MM'
  dividas: DividaRecord[]
  parcelasPorDivida: Map<string, ParcelaRecord[]>
  receitasPorDivida: Map<string, ReceitaRecord[]>
  despesasPorDivida?: Map<string, DespesaAvulsaRecord[]>
  apenasAtivas?: boolean // default true
}): TotalMensalPrevistoDemonstrativo {
  const {
    mesAno,
    dividas,
    parcelasPorDivida,
    receitasPorDivida,
    despesasPorDivida = new Map(),
    apenasAtivas = true,
  } = params
  const mesAlvo = (mesAno || '').slice(0, 7)

  const dividasFiltradas = dividas.filter((d) => {
    if (!apenasAtivas) return true
    return d.status === 'ativa' && d.ativo !== false
  })

  let totalParcelasMes = 0
  let totalParcelasAberto = 0
  let totalParcelasPagas = 0
  let totalReceitasMes = 0
  let totalDespesasMes = 0

  let countParcelasAberto = 0
  let countParcelasPagas = 0

  const parcelasDoMes: ItemParcelaMensalPrevisto[] = []
  const receitasDoMes: ItemReceitaMensalPrevisto[] = []
  const despesasDoMes: ItemDespesaMensalPrevisto[] = []

  for (const div of dividasFiltradas) {
    const parcelas = parcelasPorDivida.get(div.id) || []
    const receitas = receitasPorDivida.get(div.id) || []
    const despesas = despesasPorDivida.get(div.id) || []

    for (const p of parcelas) {
      const pMes = (p.data_vencimento || '').slice(0, 7)
      if (pMes === mesAlvo) {
        const isPaga = p.status === 'paga'
        const val = arredondarMoeda(p.valor || 0)
        totalParcelasMes += val

        const valorPagoEfetivo =
          isPaga && p.valor_pago !== undefined && p.valor_pago !== null && p.valor_pago > 0
            ? p.valor_pago
            : val

        if (isPaga) {
          totalParcelasPagas += valorPagoEfetivo
          countParcelasPagas += 1
        } else {
          totalParcelasAberto += val
          countParcelasAberto += 1
        }

        parcelasDoMes.push({
          divida_id: div.id,
          divida_nome: div.nome,
          parcela_id: p.id,
          numero: p.numero,
          data_vencimento: p.data_vencimento,
          valor: val,
          status: p.status,
          paga: isPaga,
          valor_pago: isPaga ? valorPagoEfetivo : p.valor_pago,
          data_pagamento: p.data_pagamento,
        })
      }
    }

    for (const r of receitas) {
      const rMes = (r.data || '').slice(0, 7)
      if (rMes === mesAlvo) {
        const val = arredondarMoeda(r.valor || 0)
        totalReceitasMes += val

        receitasDoMes.push({
          divida_id: div.id,
          divida_nome: div.nome,
          receita_id: r.id,
          data: r.data,
          valor: val,
          descricao: r.descricao,
        })
      }
    }

    for (const d of despesas) {
      const dMes = (d.data || '').slice(0, 7)
      if (dMes === mesAlvo) {
        const val = arredondarMoeda(d.valor || 0)
        totalDespesasMes += val

        despesasDoMes.push({
          divida_id: div.id,
          divida_nome: div.nome,
          despesa_id: d.id,
          data: d.data,
          valor: val,
          descricao: d.descricao,
        })
      }
    }
  }

  // Ordenações
  parcelasDoMes.sort((a, b) => {
    if (a.data_vencimento !== b.data_vencimento) {
      return a.data_vencimento.localeCompare(b.data_vencimento)
    }
    return a.divida_nome.localeCompare(b.divida_nome)
  })

  receitasDoMes.sort((a, b) => {
    if (a.data !== b.data) {
      return a.data.localeCompare(b.data)
    }
    return a.divida_nome.localeCompare(b.divida_nome)
  })

  despesasDoMes.sort((a, b) => {
    if (a.data !== b.data) {
      return a.data.localeCompare(b.data)
    }
    return a.divida_nome.localeCompare(b.divida_nome)
  })

  totalParcelasMes = arredondarMoeda(totalParcelasMes)
  totalParcelasAberto = arredondarMoeda(totalParcelasAberto)
  totalParcelasPagas = arredondarMoeda(totalParcelasPagas)
  totalReceitasMes = arredondarMoeda(totalReceitasMes)
  totalDespesasMes = arredondarMoeda(totalDespesasMes)

  // Necessidade do mês = Parcelas em aberto + Despesas avulsas
  const totalCompromissosAberto = totalParcelasAberto + totalDespesasMes
  const faltaArrecadar = arredondarMoeda(Math.max(0, totalCompromissosAberto - totalReceitasMes))
  const superavit = arredondarMoeda(Math.max(0, totalReceitasMes - totalCompromissosAberto))

  return {
    mes_ano: mesAlvo,
    total_parcelas_mes: totalParcelasMes,
    total_parcelas_aberto: totalParcelasAberto,
    total_parcelas_pagas: totalParcelasPagas,
    total_receitas_mes: totalReceitasMes,
    total_despesas_mes: totalDespesasMes,
    falta_arrecadar: faltaArrecadar,
    superavit: superavit,
    quantidade_parcelas: parcelasDoMes.length,
    quantidade_parcelas_aberto: countParcelasAberto,
    quantidade_parcelas_pagas: countParcelasPagas,
    quantidade_receitas: receitasDoMes.length,
    quantidade_despesas: despesasDoMes.length,
    parcelas: parcelasDoMes,
    receitas: receitasDoMes,
    despesas: despesasDoMes,
  }
}
