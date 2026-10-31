/**
 * Regras do Módulo de Funcionários (GKza ERP)
 *
 * REGRA VIGENTE / CONTRATO ARITMÉTICO (Planilha Oficial):
 * 1. Base Salarial:
 *    - Base Salarial Padrão: R$ 1.760,00
 *    - Dias no Mês: 22
 *    - Base de Horas de Trabalho diárias: 8
 *    - Valor da Hora: 1760 / 22 / 8 = R$ 10,00 (pode ser customizado/editado por funcionário).
 *    - Hora de almoço conta como trabalhada (quando ativada a flag, padrão true).
 *
 * 2. Conversão de Horas:
 *    - Entrada e Saída em HH:mm.
 *    - Total de horas no dia = diferença entre Saída e Entrada (descontando pausas se houver).
 *    - Formato HH:MM e Decimal com 2 casas:
 *        03:15 -> 3,25
 *        01:45 -> 1,75
 *        01:40 -> 1,67 (1 + 40/60 = 1,6666... arredondado para 1,67)
 *        02:45 -> 2,75
 *        01:20 -> 1,33 (1 + 20/60 = 1,3333...)
 *        00:30 -> 0,50
 *        03:00 -> 3,00
 *        02:40 -> 2,67
 *        02:13 -> 2,22 (2 + 13/60 = 2,2166... -> 2,22)
 *        00:43 -> 0,72 (43/60 = 0,7166... -> 0,72)
 *        01:10 -> 1,17 (1 + 10/60 = 1,1666... -> 1,17)
 *        02:00 -> 2,00
 *
 * 3. $ Total do Dia:
 *    - $ do dia = Horas Decimais * Valor da Hora (ex: 3,25 * 10 = R$ 32,50; 0,72 * 10 = R$ 7,17 na planilha quando feito com centavos exatos).
 *    - Total Monetário Trabalhado do Período = Soma dos $ Totais dos Dias (ex.: Folha 1 = 112,50; Folha 2 = 117,67).
 *
 * 4. Descontos Semanais / do Período:
 *    - Dívidas com percentual: ex.: Notebook = 60% do ganho total do período.
 *      Ex.: Folha 1 (ganho 112,50): 112,50 * 60% = R$ 67,50.
 *      Ex.: Folha 2 (ganho 117,67): 117,67 * 60% = R$ 70,60.
 *    - O desconto diminui o saldo da dívida:
 *      Notebook: saldo inicial 880,70 -> abatimento 67,50 (em folha seguinte o saldo vira 880,70 - 70,60 = 810,10).
 *    - Saldo Negativo Anterior: arrastado da folha imediatamente anterior (Folha 1: 412,14; Folha 2: 467,14).
 *    - Outras despesas / vales: valores integrais (100% de desconto no período, ex.: Vale 100,00).
 *    - Dívida Semanal = Soma de todos os descontos (Folha 1: 67,50 + 412,14 + 100,00 = 579,64; Folha 2: 70,60 + 467,14 = 537,74).
 *
 * 5. A Receber:
 *    - A Receber = Dívida Semanal - Ganho do Período (exibido em vermelho / destaque quando negativo ou quando funcionário deve à empresa).
 *      Folha 1: 579,64 - 112,50 = R$ -467,14 (em termos de repasse, o funcionário tem saldo devedor de R$ 467,14).
 *      Folha 2: 537,74 - 117,67 = R$ -420,07 (saldo devedor de R$ 420,07).
 *    - Quando não quitado integralmente, esse saldo vira o Saldo Negativo da folha seguinte!
 *
 * 6. REGRAS DO CICLO DE FOLHA GKZA (REFORMULAÇÃO):
 *    (1) ESPELHO DA FOLHA: mostra APENAS períodos em aberto. Períodos cobertos por folha quitada
 *        vivem exclusivamente no Histórico de Fechamentos. Rodapé sempre "Aguardando fechamento" (âmbar).
 *    (2) HISTÓRICO DE FECHAMENTOS: datas no fuso correto dd/mm/aaaa sem deslocamento.
 *        Banner verde "✅ Quitada em dd/mm" e botão "Ver histórico do período" com detalhamento completo.
 *    (3) SEM REABERTURA: folha quitada é IMUTÁVEL. Nenhuma reabertura ou edição retroativa.
 *        Divergências com pagamentos passados viram despesa/vale no período EM ABERTO com descritivo
 *        (ex: "Divergência do período dd/mm–dd/mm").
 *    (4) FLUXO DE PAGAMENTO PRIMEIRO, CONFIRMAÇÃO DO COLABORADOR DEPOIS:
 *        O fechamento e a baixa do pagamento NÃO ficam bloqueados pela confirmação dos dias pelo funcionário.
 *        O administrador pode realizar o pagamento mesmo com dias pendentes.
 *        Ao confirmar o pagamento, o funcionário recebe notificação de "pagamento realizado".
 *        Após o pagamento, o funcionário confirma no espelho que o valor está condizente com os dias
 *        trabalhados e com o valor recebido, ou aponta divergência para ajuste.
 *        A folha paga ainda não confirmada pelo colaborador fica rastreável com badge:
 *        "Aguardando confirmação do colaborador".
 */

import { getLocalDateStr, dateOnly } from './format'

export interface PausaPonto {
  inicio: string // 'HH:mm'
  fim?: string // 'HH:mm'
}

export interface PontoItemCalculado {
  id?: string
  data: string // 'YYYY-MM-DD'
  diaSemanaFormatado: string // 'terça-feira, 08 de setembro'
  entrada: string // '13:50'
  saida: string // '17:05'
  pausas?: PausaPonto[]
  minutosTrabalhados: number
  horasFormatadas: string // '03:15'
  horasDecimais: number // 3.25
  valorTotalDia: number // 32.50
  origem: 'estacao_qr' | 'fora_do_local' | 'manual' | 'admin'
  estacao?: string
  localAproximado?: string
  editadoPor?: string
  observacao?: string
}

export interface DividaDescontoCalculado {
  dividaId: string
  descricao: string
  percentual: number // ex: 60 para 60%
  saldoAtual: number // ex: 880.70
  valorAbatido: number // ex: 67.50
  novoSaldoProjetado: number // ex: 813.20 ou 810.10
}

export interface DescontoAvulsoItem {
  id?: string
  descricao: string
  valor: number
  origemDivergencia?: boolean
  periodoReferencia?: string
}

export interface FolhaQuitadaPeriodo {
  id: string
  periodo_inicio: string
  periodo_fim: string
  quitada: boolean
}

export interface ConfirmacaoDataStatus {
  data: string // YYYY-MM-DD
  confirmado: boolean
  confirmadoEm?: string
  divergenciaApontada?: boolean
  motivoDivergencia?: string
}

export interface ValidacaoFechamentoFolha {
  podeFechar: boolean // Sempre true para o admin poder realizar o pagamento mesmo com dias pendentes
  totalDiasTrabalhados: number
  totalDiasConfirmados: number
  diasPendentes: string[]
  temPendencias: boolean
  statusBadge: 'todos_confirmados' | 'aguardando_confirmacao_colaborador' | 'sem_dias'
  avisoPendencia?: string
  motivoBloqueio?: string // Mantido para compatibilidade, vazio quando liberado
}

export type StatusConferenciaColaborador = 'pendente' | 'confirmado' | 'divergente'

export interface ConferenciaPagamentoColaboradorParams {
  folhaId: string
  status: 'confirmado' | 'divergente'
  motivoDivergencia?: string
  dataHoraIso?: string
}

export interface EspelhoFolhaCalculado {
  periodoInicio: string
  periodoFim: string
  valorHora: number
  pontos: PontoItemCalculado[]
  totalMinutos: number
  totalHorasDecimais: number
  totalMonetarioTrabalhado: number // Ganho total (ex: 112.50 ou 117.67)
  descontosDividas: DividaDescontoCalculado[]
  saldoNegativoAnterior: number // ex: 412.14
  outrosDescontos: DescontoAvulsoItem[]
  totalDescontos: number // Dívida Semanal (ex: 579.64 ou 537.74)
  aReceber: number // Diferença: totalDescontos - totalMonetarioTrabalhado (exibido como -467.14 quando devedor)
  saldoLiquidoEmpregado: number // totalMonetarioTrabalhado - totalDescontos (ex: -467.14)
  estaNegativo: boolean
}

/**
 * Validação pura do token rotativo diário de uma estação.
 * Regra acordada:
 * - Apenas estações ativas são aceitas
 * - O token deve coincidir com o `token_diario` vigente E ter validade compatível com hoje
 * - Tokens de ontem / expirados são estritamente rejeitados
 */
export function validarTokenDiarioEstacao(
  estacao:
    | {
        ativa?: boolean
        token?: string
        token_diario?: string
        token_diario_validade?: string
      }
    | null
    | undefined,
  tokenFornecido: string,
  hojeReferencia?: string, // YYYY-MM-DD
): { valido: boolean; motivo?: string } {
  if (!estacao) {
    return { valido: false, motivo: 'Estação não encontrada' }
  }

  if (!estacao.ativa) {
    return { valido: false, motivo: 'Estação inativa' }
  }

  if (!tokenFornecido) {
    return { valido: false, motivo: 'Token não fornecido' }
  }

  const hoje = hojeReferencia || getLocalDateStr()

  // Se o token fornecido for o token_diario
  if (estacao.token_diario && estacao.token_diario === tokenFornecido) {
    const validade = estacao.token_diario_validade ? dateOnly(estacao.token_diario_validade) : ''
    if (validade === hoje) {
      return { valido: true }
    }
    return { valido: false, motivo: 'Token diário expirado (pertence a outra data)' }
  }

  // Se o token fornecido for o token fixo antigo:
  // Só aceito se a estação ainda NÃO tem token_diario gerado (compatibilidade na primeira leitura)
  if (estacao.token && estacao.token === tokenFornecido) {
    if (!estacao.token_diario) {
      return { valido: true, motivo: 'Compatibilidade: primeira leitura sem token diário prévio' }
    }
    return {
      valido: false,
      motivo: 'Link expirado: esta estação já opera com link rotativo diário',
    }
  }

  return { valido: false, motivo: 'Token não confere com esta estação' }
}

/**
 * Utilitário de regeneração de token diário criptográfico (client/server helper).
 * NÃO usa Math.random — usa crypto.randomUUID ou Web Crypto API.
 */
export function gerarTokenDiarioCriptografico(prefixo = 'ponto_'): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefixo}${crypto.randomUUID().replace(/-/g, '')}`
  }
  // Fallback seguro usando getRandomValues
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(16)
    crypto.getRandomValues(bytes)
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    return `${prefixo}${hex}`
  }
  throw new Error('Ambiente sem suporte a gerador criptográfico seguro.')
}

/**
 * Normaliza qualquer formato de data retornado do PocketBase ou input HTML para YYYY-MM-DD
 * Ex: '2026-10-10 00:00:00.000Z' -> '2026-10-10'
 * Ex: '2026-10-10T12:00:00.000Z' -> '2026-10-10'
 * Ex: '2026-10-10' -> '2026-10-10'
 */
export function normalizarDataPonto(dataStr: string | null | undefined): string {
  if (!dataStr) return ''
  return dataStr.trim().slice(0, 10)
}

/**
 * Monta o filtro PocketBase seguro para consultas por data de ponto.
 * Como o PocketBase armazena campos tipo date como ISO string ('YYYY-MM-DD 00:00:00.000Z'),
 * para comparar uma data específica YYYY-MM-DD usamos a faixa do dia completo ou operador ~.
 */
export function buildFiltroPontoData(dataYYYYMMDD: string): string {
  const limpa = normalizarDataPonto(dataYYYYMMDD)
  if (!limpa) return ''
  return `(data >= "${limpa} 00:00:00" && data <= "${limpa} 23:59:59")`
}

export interface PontoExistenteSimplificado {
  id: string
  funcionario: string
  data: string
  entrada: string
  saida?: string
}

/**
 * Regra de proteção contra entrada duplicada no mesmo dia.
 * Retorna se o colaborador pode registrar uma nova entrada.
 *
 * Regras acordadas:
 * 1. Se já existe ponto com entrada aberta (sem saída) no mesmo dia: BLOQUEADO.
 * 2. Se já existe ponto completo (entrada e saída registradas) no mesmo dia: BLOQUEADO
 *    (sem entrada duplicada no mesmo dia; se precisar de novo expediente, deve ser editado pelo admin).
 */
export function validarPodeRegistrarEntrada(
  pontosDoDia: PontoExistenteSimplificado[],
  dataHojeYYYYMMDD: string,
): { pode: boolean; motivo?: string; pontoAberto?: PontoExistenteSimplificado } {
  const diaNormalizado = normalizarDataPonto(dataHojeYYYYMMDD)
  const pontosDesteDia = pontosDoDia.filter((p) => normalizarDataPonto(p.data) === diaNormalizado)

  const pontoAberto = pontosDesteDia.find((p) => !p.saida || p.saida.trim() === '')
  if (pontoAberto) {
    return {
      pode: false,
      motivo: `Já existe uma entrada aberta às ${pontoAberto.entrada} para este colaborador hoje. Registre a saída ou pausa antes de nova entrada.`,
      pontoAberto,
    }
  }

  if (pontosDesteDia.length > 0) {
    const ultimoPonto = pontosDesteDia[0]
    return {
      pode: false,
      motivo: `O ponto de hoje já foi registrado e finalizado (Entrada: ${ultimoPonto.entrada}, Saída: ${ultimoPonto.saida}). Para correções, use a edição administrativa.`,
    }
  }

  return { pode: true }
}

/**
 * Calcula o valor da hora a partir da base
 */
export function calcularValorHoraBase(
  salarioBase: number = 1760,
  diasMes: number = 22,
  horasDia: number = 8,
): number {
  if (diasMes <= 0 || horasDia <= 0) return 10
  const valor = salarioBase / diasMes / horasDia
  return Math.round(valor * 100) / 100
}

/**
 * Converte minutos em formato HH:MM
 */
export function formatarMinutosEmHHMM(minutosTotais: number): string {
  if (minutosTotais < 0) minutosTotais = 0
  const h = Math.floor(minutosTotais / 60)
  const m = Math.round(minutosTotais % 60)
  const hh = String(h).padStart(2, '0')
  const mm = String(m).padStart(2, '0')
  return `${hh}:${mm}`
}

/**
 * Converte minutos em horas decimais com 2 casas
 * Ex: 195 min (03:15) -> 3.25
 * Ex: 43 min (00:43) -> 0.72 (43/60 = 0.71666... -> 0.72)
 * Ex: 100 min (01:40) -> 1.67 (100/60 = 1.6666... -> 1.67)
 */
export function converterMinutosEmHorasDecimais(minutos: number): number {
  if (minutos <= 0) return 0
  return Math.round((minutos / 60) * 100) / 100
}

/**
 * Calcula a diferença de minutos entre duas strings 'HH:mm'
 */
export function diferencaMinutos(horaInicio: string, horaFim: string): number {
  if (!horaInicio || !horaFim) return 0
  const [h1, m1] = horaInicio.split(':').map(Number)
  const [h2, m2] = horaFim.split(':').map(Number)
  if (isNaN(h1) || isNaN(m1) || isNaN(h2) || isNaN(m2)) return 0
  const total1 = h1 * 60 + m1
  const total2 = h2 * 60 + m2
  return Math.max(0, total2 - total1)
}

/**
 * Calcula os minutos trabalhados no ponto considerando possíveis pausas
 */
export function calcularMinutosPonto(
  entrada: string,
  saida: string,
  pausas?: PausaPonto[],
  horaAlmocoConta: boolean = true,
): number {
  if (!entrada || !saida) return 0
  let minutosTotais = diferencaMinutos(entrada, saida)

  // Se pausas existirem e NÃO for hora de almoço que conta
  if (pausas && pausas.length > 0 && !horaAlmocoConta) {
    for (const p of pausas) {
      if (p.inicio && p.fim) {
        const minPausa = diferencaMinutos(p.inicio, p.fim)
        minutosTotais = Math.max(0, minutosTotais - minPausa)
      }
    }
  }

  return minutosTotais
}

/**
 * Formata data no padrão da planilha: 'terça-feira, 08 de setembro'
 */
export function formatarDataExtensoPlanilha(dataStr: string): string {
  try {
    const [ano, mes, dia] = dataStr.split('T')[0].split('-').map(Number)
    const date = new Date(ano, mes - 1, dia)
    const diaSemana = date.toLocaleDateString('pt-BR', { weekday: 'long' })
    const diaNum = String(dia).padStart(2, '0')
    const mesNome = date.toLocaleDateString('pt-BR', { month: 'long' })
    return `${diaSemana}, ${diaNum} de ${mesNome}`
  } catch (_) {
    return dataStr
  }
}

/**
 * Calcula a linha do dia do espelho de ponto
 */
export function calcularLinhaPonto(
  data: string,
  entrada: string,
  saida: string,
  valorHora: number,
  pausas?: PausaPonto[],
  horaAlmocoConta: boolean = true,
): {
  minutosTrabalhados: number
  horasFormatadas: string
  horasDecimais: number
  valorTotalDia: number
} {
  const minutos = calcularMinutosPonto(entrada, saida, pausas, horaAlmocoConta)
  const horasFormatadas = formatarMinutosEmHHMM(minutos)
  const horasDecimais = converterMinutosEmHorasDecimais(minutos)
  // Arredondamento do valor do dia a 2 casas
  const valorTotalDia = Math.round(horasDecimais * valorHora * 100) / 100

  return {
    minutosTrabalhados: minutos,
    horasFormatadas,
    horasDecimais,
    valorTotalDia,
  }
}

/**
 * Calcula o espelho completo da folha exatamente com a aritmética da planilha
 */
export function calcularEspelhoFolha(params: {
  periodoInicio: string
  periodoFim: string
  valorHora: number
  horaAlmocoConta?: boolean
  pontosBrutos: Array<{
    id?: string
    data: string
    entrada: string
    saida: string
    pausas?: PausaPonto[]
    origem?: 'estacao_qr' | 'fora_do_local' | 'manual' | 'admin'
    estacao?: string
    localAproximado?: string
    editadoPor?: string
    observacao?: string
  }>
  dividas: Array<{
    id: string
    descricao: string
    percentualAbatimento: number // ex: 60
    saldoAtual: number // ex: 880.70
    ativa: boolean
  }>
  saldoNegativoAnterior?: number // ex: 412.14
  outrosDescontos?: DescontoAvulsoItem[] // ex: Vale 100.00
}): EspelhoFolhaCalculado {
  const {
    periodoInicio,
    periodoFim,
    valorHora,
    horaAlmocoConta = true,
    pontosBrutos,
    dividas,
    saldoNegativoAnterior = 0,
    outrosDescontos = [],
  } = params

  // 1. Processar cada ponto
  const pontosCalculados: PontoItemCalculado[] = pontosBrutos
    .slice()
    .sort((a, b) => a.data.localeCompare(b.data))
    .map((p) => {
      const { minutosTrabalhados, horasFormatadas, horasDecimais, valorTotalDia } =
        calcularLinhaPonto(p.data, p.entrada, p.saida, valorHora, p.pausas, horaAlmocoConta)

      return {
        id: p.id,
        data: p.data,
        diaSemanaFormatado: formatarDataExtensoPlanilha(p.data),
        entrada: p.entrada,
        saida: p.saida,
        pausas: p.pausas,
        minutosTrabalhados,
        horasFormatadas,
        horasDecimais,
        valorTotalDia,
        origem: p.origem || 'estacao_qr',
        estacao: p.estacao,
        localAproximado: p.localAproximado,
        editadoPor: p.editadoPor,
        observacao: p.observacao,
      }
    })

  // 2. Total Monetário Trabalhado = Soma dos $ Totais dos Dias
  const totalMinutos = pontosCalculados.reduce((acc, cur) => acc + cur.minutosTrabalhados, 0)
  const totalHorasDecimais =
    Math.round(pontosCalculados.reduce((acc, cur) => acc + cur.horasDecimais, 0) * 100) / 100
  const totalMonetarioTrabalhado =
    Math.round(pontosCalculados.reduce((acc, cur) => acc + cur.valorTotalDia, 0) * 100) / 100

  // 3. Descontos de Dívidas por percentual sobre o Total Monetário Trabalhado
  const descontosDividas: DividaDescontoCalculado[] = dividas
    .filter((d) => d.ativa && d.saldoAtual > 0)
    .map((d) => {
      const pct = d.percentualAbatimento / 100
      let valorAbatido = Math.round(totalMonetarioTrabalhado * pct * 100) / 100
      // O abatimento não pode ser superior ao saldo atual da dívida
      if (valorAbatido > d.saldoAtual) {
        valorAbatido = d.saldoAtual
      }
      const novoSaldo = Math.max(0, Math.round((d.saldoAtual - valorAbatido) * 100) / 100)

      return {
        dividaId: d.id,
        descricao: d.descricao,
        percentual: d.percentualAbatimento,
        saldoAtual: d.saldoAtual,
        valorAbatido,
        novoSaldoProjetado: novoSaldo,
      }
    })

  // 4. Soma dos descontos = Dívida Semanal
  const somaAbatimentosDividas = descontosDividas.reduce((acc, cur) => acc + cur.valorAbatido, 0)
  const somaOutros = outrosDescontos.reduce((acc, cur) => acc + cur.valor, 0)
  const totalDescontos =
    Math.round((somaAbatimentosDividas + saldoNegativoAnterior + somaOutros) * 100) / 100

  // 5. A Receber:
  // Conforme o print da planilha:
  // Dívida Semanal: R$ 579,64 | Total Monetário: R$ 112,50 -> A receber: -R$ 467,14
  // Dívida Semanal: R$ 537,74 | Total Monetário: R$ 117,67 -> A receber: -R$ 420,07
  // Saldo Líquido = Ganho - Descontos = 112.50 - 579.64 = -467.14
  const saldoLiquidoEmpregado = Math.round((totalMonetarioTrabalhado - totalDescontos) * 100) / 100
  // O print destaca em vermelho "-R$ 467,14" como valor devedor / a receber
  const aReceber = saldoLiquidoEmpregado
  const estaNegativo = saldoLiquidoEmpregado < 0

  return {
    periodoInicio,
    periodoFim,
    valorHora,
    pontos: pontosCalculados,
    totalMinutos,
    totalHorasDecimais,
    totalMonetarioTrabalhado,
    descontosDividas,
    saldoNegativoAnterior,
    outrosDescontos,
    totalDescontos,
    aReceber,
    saldoLiquidoEmpregado,
    estaNegativo,
  }
}

/**
 * Verifica se um dia/data (YYYY-MM-DD) está dentro de algum período coberto por folha quitada.
 */
export function isDataCobertaPorFolhaQuitada(
  dataYYYYMMDD: string,
  folhasQuitadas: FolhaQuitadaPeriodo[],
): boolean {
  const data = normalizarDataPonto(dataYYYYMMDD)
  if (!data) return false

  return folhasQuitadas.some((f) => {
    if (!f.quitada) return false
    const ini = normalizarDataPonto(f.periodo_inicio)
    const fim = normalizarDataPonto(f.periodo_fim)
    return data >= ini && data <= fim
  })
}

/**
 * Filtra pontos para manter APENAS pontos de períodos abertos (não quitados).
 * Regra (1): Espelho da Folha mostra APENAS períodos abertos.
 */
export function filtrarPontosPeriodoAberto<T extends { data: string }>(
  pontos: T[],
  folhasQuitadas: FolhaQuitadaPeriodo[],
): T[] {
  return pontos.filter((p) => !isDataCobertaPorFolhaQuitada(p.data, folhasQuitadas))
}

/**
 * Valida se um período (inicio - fim) sobrepõe alguma folha quitada existente.
 * Regra (1) e (3): Períodos quitados não podem reaparecer no espelho nem serem reabertos.
 */
export function isPeriodoSobrepostoAFolhaQuitada(
  inicioYYYYMMDD: string,
  fimYYYYMMDD: string,
  folhasQuitadas: FolhaQuitadaPeriodo[],
): boolean {
  const ini = normalizarDataPonto(inicioYYYYMMDD)
  const fim = normalizarDataPonto(fimYYYYMMDD)
  if (!ini || !fim) return false

  return folhasQuitadas.some((f) => {
    if (!f.quitada) return false
    const fIni = normalizarDataPonto(f.periodo_inicio)
    const fFim = normalizarDataPonto(f.periodo_fim)
    // Sobreposição: ini <= fFim && fim >= fIni
    return ini <= fFim && fim >= fIni
  })
}

/**
 * Encontra o início do próximo período em aberto para um funcionário.
 * Se houver folhas quitadas, o próximo período aberto começa no dia seguinte ao término da folha quitada mais recente.
 */
export function calcularProximoPeriodoAberto(
  folhasQuitadas: FolhaQuitadaPeriodo[],
  hojeRef = getLocalDateStr(),
): { inicio: string; fim: string } {
  const quitadasOrdenadas = folhasQuitadas
    .filter((f) => f.quitada)
    .slice()
    .sort((a, b) =>
      normalizarDataPonto(b.periodo_fim).localeCompare(normalizarDataPonto(a.periodo_fim)),
    )

  if (quitadasOrdenadas.length === 0) {
    // 7 dias atrás até hoje
    const [y, m, d] = hojeRef.split('-').map(Number)
    const dt = new Date(y, m - 1, d)
    dt.setDate(dt.getDate() - 7)
    return {
      inicio: getLocalDateStr(dt),
      fim: hojeRef,
    }
  }

  const ultima = quitadasOrdenadas[0]
  const fimUltima = normalizarDataPonto(ultima.periodo_fim)
  const [uy, um, ud] = fimUltima.split('-').map(Number)
  const dtInicio = new Date(uy, um - 1, ud)
  dtInicio.setDate(dtInicio.getDate() + 1)
  const inicio = getLocalDateStr(dtInicio)

  // O fim pode ser hoje ou 7 dias após o início se hoje for anterior
  const fim = hojeRef >= inicio ? hojeRef : inicio

  return { inicio, fim }
}

/**
 * Regra (4) Atualizada:
 * O fechamento e a baixa do pagamento NÃO ficam bloqueados pela confirmação dos dias pelo funcionário.
 * Permite que o admin realize o pagamento mesmo com dias pendentes (podeFechar = true).
 * Mantém rastreabilidade: identifica dias pendentes e gera status/aviso para exibição de badge
 * visual ("Aguardando confirmação do colaborador") e envio de notificação.
 */
export function validarConfirmacoesFechamento(params: {
  pontosTrabalhados: Array<{ data: string; entrada: string; saida?: string }>
  confirmacoesPorData: Record<string, { confirmado: boolean; divergenciaApontada?: boolean }>
}): ValidacaoFechamentoFolha {
  // Apenas datas com expediente trabalhado (saída registrada ou entrada efetiva)
  const datasTrabalhadasUnicas = Array.from(
    new Set(
      params.pontosTrabalhados
        .filter((p) => Boolean(p.entrada && p.entrada.trim() !== ''))
        .map((p) => normalizarDataPonto(p.data)),
    ),
  ).sort()

  const totalDiasTrabalhados = datasTrabalhadasUnicas.length

  if (totalDiasTrabalhados === 0) {
    return {
      podeFechar: true,
      totalDiasTrabalhados: 0,
      totalDiasConfirmados: 0,
      diasPendentes: [],
      temPendencias: false,
      statusBadge: 'sem_dias',
    }
  }

  const diasConfirmados: string[] = []
  const diasPendentes: string[] = []

  for (const data of datasTrabalhadasUnicas) {
    const conf = params.confirmacoesPorData[data]
    if (conf && conf.confirmado) {
      diasConfirmados.push(data)
    } else {
      diasPendentes.push(data)
    }
  }

  const totalDiasConfirmados = diasConfirmados.length
  const temPendencias = totalDiasConfirmados < totalDiasTrabalhados

  let avisoPendencia: string | undefined
  if (temPendencias) {
    avisoPendencia = `Aguardando confirmação do colaborador — ${totalDiasConfirmados} de ${totalDiasTrabalhados} ${
      totalDiasTrabalhados === 1 ? 'dia confirmado' : 'dias confirmados'
    }`
  }

  return {
    podeFechar: true, // Pagamento primeiro: o admin NÃO é bloqueado
    totalDiasTrabalhados,
    totalDiasConfirmados,
    diasPendentes,
    temPendencias,
    statusBadge: temPendencias ? 'aguardando_confirmacao_colaborador' : 'todos_confirmados',
    avisoPendencia,
  }
}

/**
 * Mensagem padronizada da notificação enviada ao colaborador ao confirmar o pagamento da folha.
 */
export function montarMensagemNotificacaoPagamento(params: {
  nomeFuncionario: string
  periodoInicio: string
  periodoFim: string
  valorPago: number
  totalDiasTrabalhados: number
  temDiasPendentes: boolean
}): { titulo: string; mensagem: string; textoNotificacao: string } {
  const pIni = formatarDataDDMM(params.periodoInicio)
  const pFim = formatarDataDDMM(params.periodoFim)
  const valorFmt = `R$ ${params.valorPago.toFixed(2).replace('.', ',')}`

  const titulo = 'Pagamento realizado'
  const mensagem = `Olá, ${params.nomeFuncionario}! Seu pagamento referente ao período de ${pIni} a ${pFim} no valor de ${valorFmt} foi realizado. Acesse seu espelho de ponto para conferir se o valor está condizente com os dias trabalhados e com o valor recebido.`

  const textoNotificacao = params.temDiasPendentes
    ? `${mensagem} Há dias trabalhados pendentes de confirmação.`
    : mensagem

  return {
    titulo,
    mensagem,
    textoNotificacao,
  }
}

/**
 * Regra (3): Converte apontamento de divergência de folha passada em item de desconto/vale para o período aberto.
 */
export function criarDescontoDivergenciaPassada(params: {
  periodoPassadoInicio: string
  periodoPassadoFim: string
  valor: number
  motivo?: string
}): DescontoAvulsoItem {
  const pIni = formatarDataDDMM(params.periodoPassadoInicio)
  const pFim = formatarDataDDMM(params.periodoPassadoFim)
  const sufixoMotivo = params.motivo ? ` (${params.motivo})` : ''

  return {
    id: `div_${Date.now()}`,
    descricao: `Divergência do período ${pIni}–${pFim}${sufixoMotivo}`,
    valor: Math.abs(params.valor),
    origemDivergencia: true,
    periodoReferencia: `${params.periodoPassadoInicio} a ${params.periodoPassadoFim}`,
  }
}

/**
 * Formata data YYYY-MM-DD para dd/mm estrito sem deslocamento de timezone
 */
export function formatarDataDDMM(dataStr: string): string {
  const limpa = normalizarDataPonto(dataStr)
  if (!limpa || limpa.length < 10) return dataStr || ''
  const [, m, d] = limpa.split('-')
  return `${d}/${m}`
}

/**
 * Formata data YYYY-MM-DD para dd/mm/aaaa estrito sem deslocamento de timezone
 */
export function formatarDataDDMMAAAA(dataStr: string): string {
  const limpa = normalizarDataPonto(dataStr)
  if (!limpa || limpa.length < 10) return dataStr || ''
  const [y, m, d] = limpa.split('-')
  return `${d}/${m}/${y}`
}
