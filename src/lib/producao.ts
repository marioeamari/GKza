/**
 * Regras de Negócio e Cálculos do Módulo de Produção
 * Controle semanal de fornecimento de produtos por fornecedor e saques de marketplaces.
 *
 * Módulo ISOLADO do financeiro (sem leitura/escrita em lancamentos, contas, despesas, ocorrencias).
 */

export interface ProdutoPadraoProducao {
  nome: string
  custo_padrao: number
  ordem: number
}

/**
 * 18 produtos padrão extraídos do modelo de planilha do usuário
 */
export const PRODUTOS_PADRAO_PRODUCAO: ProdutoPadraoProducao[] = [
  { nome: 'Toalha Banhão Quadriculada', custo_padrao: 14.2, ordem: 1 },
  { nome: 'Toalha Banhão Bola', custo_padrao: 14.2, ordem: 2 },
  { nome: 'Fronha e Lençol', custo_padrao: 13.5, ordem: 3 },
  { nome: 'Banho Ouro', custo_padrao: 12.5, ordem: 4 },
  { nome: 'Banho Folha', custo_padrao: 12.5, ordem: 5 },
  { nome: 'Banho Esmeralda', custo_padrao: 12.5, ordem: 6 },
  { nome: 'Banho Bola', custo_padrao: 12.5, ordem: 7 },
  { nome: 'Toalha Leve', custo_padrao: 10.0, ordem: 8 },
  { nome: 'Toalha Pesada', custo_padrao: 10.0, ordem: 9 },
  { nome: 'Banho Floral', custo_padrao: 8.5, ordem: 10 },
  { nome: 'Banho Lunna', custo_padrao: 8.5, ordem: 11 },
  { nome: 'Banho Allure', custo_padrao: 7.5, ordem: 12 },
  { nome: 'Banho Isa', custo_padrao: 6.5, ordem: 13 },
  { nome: 'Rosto Folha', custo_padrao: 4.3, ordem: 14 },
  { nome: 'Rosto Esmeralda', custo_padrao: 4.3, ordem: 15 },
  { nome: 'Pano Atoalhado', custo_padrao: 2.35, ordem: 16 },
  { nome: 'Toalha Pequena', custo_padrao: 2.0, ordem: 17 },
  { nome: 'Pano Baiana', custo_padrao: 1.95, ordem: 18 },
]

export interface ItemDiaProducao {
  produto_id: string
  quantidade: number
  custo_unitario?: number
}

export interface LinhaGradeFornecedor {
  produto_id: string
  nome: string
  custo_unitario: number
  quantidade_total: number
  custo_total: number
}

export interface ResumoGradeFornecedor {
  linhas: LinhaGradeFornecedor[]
  quantidade_total_geral: number
  custo_total_fornecedor: number
}

export interface ItemSaqueProducao {
  id?: string
  descricao: string
  valor: number
}

export interface GrupoSaqueProducao {
  id?: string
  titulo: string
  itens: ItemSaqueProducao[]
}

export interface GrupoSaqueCalculado {
  id?: string
  titulo: string
  itens: ItemSaqueProducao[]
  total_grupo: number
}

export interface ResumoSaquesCalculado {
  grupos: GrupoSaqueCalculado[]
  total_saques_geral: number
}

export interface FechamentoSemanaProducao {
  total_fornecedor: number
  total_saques: number
  impostos: number
  saldo_semana: number // total_saques - impostos - total_fornecedor
  is_negativo: boolean
}

export interface FaixaSemanaProducao {
  semana_ano: string // ex: "2026-W35"
  data_inicio_fornecedor: string // YYYY-MM-DD (segunda-feira)
  data_fim_fornecedor: string // YYYY-MM-DD (sexta-feira)
  data_inicio_saques: string // YYYY-MM-DD (domingo posterior)
  data_fim_saques: string // YYYY-MM-DD (sábado seguinte)
  label_fornecedor: string
  label_saques: string
  rotulo_completo: string
}

/**
 * Arredonda para 2 casas decimais evitando erros de precisão flutuante
 */
export function arredondarMoeda(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * Regra: Custo de linha = quantidade × custo_unitario (0 se quantidade <= 0)
 */
export function calcularCustoLinha(quantidade: number, custoUnitario: number): number {
  const qtd = Math.max(0, Number(quantidade) || 0)
  const custo = Math.max(0, Number(custoUnitario) || 0)
  return arredondarMoeda(qtd * custo)
}

/**
 * Calcula o custo total de um bloco diário com base nos itens e produtos
 */
export function calcularTotalDia(
  itensDia: { produto_id: string; quantidade: number }[],
  custoPorProduto: Record<string, number>,
): number {
  let total = 0
  for (const item of itensDia) {
    const custo = custoPorProduto[item.produto_id] ?? 0
    total += calcularCustoLinha(item.quantidade, custo)
  }
  return arredondarMoeda(total)
}

/**
 * Calcula a grade semanal consolidada do fornecedor e o total geral
 */
export function calcularGradeSemanalFornecedor(
  produtos: { id: string; nome: string; custo_unitario: number; ordem?: number }[],
  diasItens: { data: string; produto_id: string; quantidade: number }[],
): ResumoGradeFornecedor {
  const qtdPorProduto: Record<string, number> = {}

  for (const item of diasItens) {
    const pid = item.produto_id
    qtdPorProduto[pid] = (qtdPorProduto[pid] || 0) + (Number(item.quantidade) || 0)
  }

  let quantidade_total_geral = 0
  let custo_total_fornecedor = 0

  const sortedProdutos = [...produtos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0))

  const linhas: LinhaGradeFornecedor[] = sortedProdutos.map((p) => {
    const qtdTotal = qtdPorProduto[p.id] || 0
    const custoUnit = Number(p.custo_unitario) || 0
    const custoTotal = calcularCustoLinha(qtdTotal, custoUnit)

    quantidade_total_geral += qtdTotal
    custo_total_fornecedor += custoTotal

    return {
      produto_id: p.id,
      nome: p.nome,
      custo_unitario: custoUnit,
      quantidade_total: qtdTotal,
      custo_total: custoTotal,
    }
  })

  return {
    linhas,
    quantidade_total_geral,
    custo_total_fornecedor: arredondarMoeda(custo_total_fornecedor),
  }
}

/**
 * Regra: Total por grupo de saques
 */
export function calcularTotalGrupoSaque(itens: ItemSaqueProducao[]): number {
  if (!Array.isArray(itens)) return 0
  const soma = itens.reduce((acc, item) => acc + Math.max(0, Number(item.valor) || 0), 0)
  return arredondarMoeda(soma)
}

/**
 * Regra: Total saques geral agrupado
 */
export function calcularResumoSaques(grupos: GrupoSaqueProducao[]): ResumoSaquesCalculado {
  let total_saques_geral = 0

  const gruposCalculados: GrupoSaqueCalculado[] = (grupos || []).map((g) => {
    const total_grupo = calcularTotalGrupoSaque(g.itens)
    total_saques_geral += total_grupo
    return {
      ...g,
      total_grupo,
    }
  })

  return {
    grupos: gruposCalculados,
    total_saques_geral: arredondarMoeda(total_saques_geral),
  }
}

/**
 * Regra: Fechamento da semana
 * Fechamento = Total Saques − Impostos − Total Fornecedor
 */
export function calcularFechamentoSemana(
  totalFornecedor: number,
  totalSaques: number,
  impostos: number,
): FechamentoSemanaProducao {
  const forn = arredondarMoeda(Math.max(0, Number(totalFornecedor) || 0))
  const saq = arredondarMoeda(Math.max(0, Number(totalSaques) || 0))
  const imp = arredondarMoeda(Math.max(0, Number(impostos) || 0))

  const saldo_semana = arredondarMoeda(saq - imp - forn)

  return {
    total_fornecedor: forn,
    total_saques: saq,
    impostos: imp,
    saldo_semana,
    is_negativo: saldo_semana < 0,
  }
}

/**
 * Formata data no formato DD/MM
 */
export function formatarDiaMes(dataIso: string): string {
  const parts = dataIso.split('-')
  if (parts.length < 3) return dataIso
  return `${parts[2]}/${parts[1]}`
}

/**
 * Converte Date para string YYYY-MM-DD em horário local
 */
export function toIsoDate(d: Date): string {
  const ano = d.getFullYear()
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const dia = String(d.getDate()).padStart(2, '0')
  return `${ano}-${mes}-${dia}`
}

/**
 * Adiciona dias a uma data em formato YYYY-MM-DD
 */
export function adicionarDias(dataIso: string, dias: number): string {
  const [y, m, d] = dataIso.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  dt.setDate(dt.getDate() + dias)
  return toIsoDate(dt)
}

/**
 * Obtém a segunda-feira da semana de uma data ISO fornecida
 */
export function getSegundaFeiraSemana(dataIso?: string): string {
  let dt: Date
  if (dataIso) {
    const [y, m, d] = dataIso.split('-').map(Number)
    dt = new Date(y, m - 1, d)
  } else {
    dt = new Date()
  }

  const diaSemana = dt.getDay() // 0 = Domingo, 1 = Segunda, ..., 6 = Sábado
  // Diferença até segunda-feira (1):
  // se domingo (0) -> recua 6 dias
  // se segunda (1) -> recua 0
  // se terça (2) -> recua 1
  const diff = diaSemana === 0 ? -6 : 1 - diaSemana
  dt.setDate(dt.getDate() + diff)
  return toIsoDate(dt)
}

/**
 * Calcula o identificador de semana ISO (ex: "2026-W35")
 */
export function getSemanaAnoIdentificador(segundaFeiraIso: string): string {
  const [y, m, d] = segundaFeiraIso.split('-').map(Number)
  const target = new Date(y, m - 1, d)
  // Quarta-feira da mesma semana ISO
  target.setDate(target.getDate() + 2)
  const ano = target.getFullYear()

  const primeiroJan = new Date(ano, 0, 1)
  const diasAte = Math.floor((target.getTime() - primeiroJan.getTime()) / (24 * 60 * 60 * 1000))
  const numeroSemana = Math.ceil((diasAte + primeiroJan.getDay() + 1) / 7)

  return `${ano}-W${String(numeroSemana).padStart(2, '0')}`
}

/**
 * Calcula a faixa de datas completa da semana de produção
 * Fornecedor: Seg a Sex
 * Saques: Domingo seguinte a Sábado posterior (offset padrão +6 dias da segunda = domingo seguinte)
 */
export function calcularFaixaSemanaProducao(
  segundaFeiraIso: string,
  diasOffsetSaques: number = 6,
): FaixaSemanaProducao {
  const seg = segundaFeiraIso
  const sex = adicionarDias(seg, 4)

  const domSaques = adicionarDias(seg, diasOffsetSaques)
  const sabSaques = adicionarDias(domSaques, 6)

  const segFormatada = formatarDiaMes(seg)
  const sexFormatada = formatarDiaMes(sex)
  const domFormatada = formatarDiaMes(domSaques)
  const sabFormatada = formatarDiaMes(sabSaques)

  const label_fornecedor = `seg ${segFormatada} a sex ${sexFormatada}`
  const label_saques = `dom ${domFormatada} a sáb ${sabFormatada}`
  const rotulo_completo = `${label_fornecedor} »»» ${label_saques}`

  return {
    semana_ano: getSemanaAnoIdentificador(seg),
    data_inicio_fornecedor: seg,
    data_fim_fornecedor: sex,
    data_inicio_saques: domSaques,
    data_fim_saques: sabSaques,
    label_fornecedor,
    label_saques,
    rotulo_completo,
  }
}

/**
 * Nomes dos dias da semana úteis (Segunda a Sexta) com formatação em pt-BR
 */
export const DIAS_SEMANA_NOMES = [
  'segunda-feira',
  'terça-feira',
  'quarta-feira',
  'quinta-feira',
  'sexta-feira',
]

/**
 * Gera os 5 dias úteis de uma semana a partir da segunda-feira
 */
export function gerarCincoDiasUteis(segundaFeiraIso: string): { data: string; nome_dia: string }[] {
  return [0, 1, 2, 3, 4].map((offset) => {
    const data = adicionarDias(segundaFeiraIso, offset)
    return {
      data,
      nome_dia: DIAS_SEMANA_NOMES[offset],
    }
  })
}

/**
 * Formata cabeçalho do bloco diário como no modelo: "segunda-feira, 24 de agosto/26"
 */
export function formatarCabecalhoDia(dataIso: string, nomeDia: string): string {
  const [y, m, d] = dataIso.split('-').map(Number)
  const meses = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ]
  const mesNome = meses[m - 1] || ''
  const anoAbrev = String(y).slice(-2)
  return `${nomeDia}, ${d} de ${mesNome}/${anoAbrev}`
}
