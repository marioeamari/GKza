/**
 * Regras de Negócio e Cálculos do Módulo de Lucro (/lucro)
 * Relatório de Lucro por Canais de Venda — SOMENTE LEITURA
 *
 * Módulo isolado: consome produtos de prec_produtos (repositório aprovado),
 * prec_canais, prec_precificacoes (status='aprovada'), prec_kits e despesas_ocorrencias / despesas_compromisso.
 * NÃO grava nem altera registros em nenhum desses módulos.
 */

export interface ProdutoLucro {
  id: string
  nome: string
  sku: string
  marca?: string
  categoria?: string
  tipo?: string
  qtd_por_kit?: number
  empresa_id?: string
  empresa_nome?: string
  empresa_cnpj?: string
  modalidade_id?: string
  modalidade_nome?: string
  ordem?: number
}

export interface CanalLojaLucro {
  id: string
  nome: string
  tipo?: 'site_proprio' | 'marketplace'
  marketplace_id?: string
  marketplace_nome: string
  marketplace_cor?: string
  ordem?: number
}

export interface MarketplaceGrupoLojas {
  id: string
  nome: string
  cor: string
  lojas: CanalLojaLucro[]
}

export interface RendaLiquidaPrecificacao {
  produto_id: string
  canal_id: string
  renda_liquida_unitaria: number
  tem_aprovacao: boolean
  motivo_bloqueio?: string
}

// Célula da grade de inserção
export interface CelulaLucroCalculada {
  produto_id: string
  canal_id: string
  quantidade: number
  renda_liquida_unitaria: number
  tem_aprovacao: boolean
  lucro_total: number
  incluso_na_somatoria: boolean
  requer_ajuste_precificacao: boolean
}

// Resumo da Linha do Produto na Grade
export interface LinhaProdutoGradeLucro {
  produto: ProdutoLucro
  celulasPorCanal: Record<string, CelulaLucroCalculada>
  totalQuantidade: number
  totalLucro: number
  temItensSemAprovacao: boolean
}

// Totais da Grade da Aba 1
export interface ResumoGradeLucroMes {
  linhas: LinhaProdutoGradeLucro[]
  totaisPorLoja: Record<string, { quantidade: number; lucro: number }>
  totaisPorMarketplace: Record<string, { quantidade: number; lucro: number }>
  totalGeralQuantidade: number
  totalGeralLucro: number
  totalAlertasSemAprovacao: number
}

// Aba 2: Balanço
export interface DespesaGrupoItem {
  grupo_id: string
  grupo_nome: string
  cor?: string
  total: number
  itens: Array<{
    id: string
    descricao: string
    valor: number
    data?: string // Data de competência / pagamento efetiva (YYYY-MM-DD)
    tag_nome?: string
    destino?: string
  }>
}

export interface BalancoMesResultado {
  lucroLiquido: number
  totalDespesasTags: number
  balanco: number // lucro - despesas
  isNegativo: boolean
  grupos: DespesaGrupoItem[]
}

// Fechamento Semanal de Domingo a Sábado dentro do mês
export interface SemanaMesInfo {
  numero: number // 1, 2, 3...
  rotulo: string // ex: "Semana 1 (01/09 a 05/09 - qui a sáb)"
  rotuloCurto: string // ex: "Semana 1 (01 a 05/09)"
  dataInicio: string // YYYY-MM-DD
  dataFim: string // YYYY-MM-DD
  diasCount: number
  diasIso: string[] // lista de todos os dias YYYY-MM-DD desta semana
}

export interface BalancoSemanalItem {
  semana: SemanaMesInfo
  lucroSemana: number
  despesasSemana: number
  balanco: number // lucro - despesas
  isNegativo: boolean
  gruposDespesas: DespesaGrupoItem[]
}

export interface BalancoSemanalResultado {
  semanas: BalancoSemanalItem[]
  totalLucroMes: number
  totalDespesasMes: number
  balancoMes: number
  isNegativoMes: boolean
}

// Aba 3: Saídas Unitárias e Kits/unid.
export interface LinhaSaidaUnitarioItem {
  produto_id: string
  produto_nome: string
  empresa_id: string
  empresa_nome: string
  empresa_cnpj?: string
  kits_vendidos: number
  qtd_por_kit: number
  unidades_totais: number // kits_vendidos × qtd_por_kit
}

export interface EmpresaSaidasConsolidada {
  empresa_id: string
  empresa_nome: string
  empresa_cnpj?: string
  itens: LinhaSaidaUnitarioItem[]
  totalKits: number
  totalUnidades: number
}

export interface ResumoAbaSaidasResultado {
  empresas: EmpresaSaidasConsolidada[]
  totalGeralKits: number
  totalGeralUnidades: number
}

/**
 * Arredonda valor para 2 casas decimais evitando ruído de ponto flutuante
 */
export function arredondarMoeda(valor: number): number {
  if (!Number.isFinite(valor)) return 0
  return Math.round((valor + Number.EPSILON) * 100) / 100
}

/**
 * Extrai a renda líquida unitária de uma precificação APROVADA
 * A renda líquida é o lucro líquido unitário aprovado para o canal
 */
export function extrairRendaLiquidaDePrecificacao(precificacao: any): number {
  if (!precificacao) return 0
  const resultado = precificacao.resultado || {}
  const lucroLiq =
    resultado.lucro_liquido ??
    resultado.renda_liquida ??
    resultado.lucro ??
    precificacao.preco_aprovado ??
    0
  return arredondarMoeda(Number(lucroLiq) || 0)
}

/**
 * Calcula a célula da grade de lucro:
 * cada célula = Qtd inserida manualmente × Renda Líq unitária da precificação APROVADA.
 * Se o par produto+canal NÃO tiver precificação aprovada:
 * - Alerta visual ativado
 * - NÃO entra na somatória (lucro total = 0 na soma, mesmo com quantidade)
 * - Destaca o produto que precisa de ajuste de precificação
 */
export function calcularCelulaLucro(
  produtoId: string,
  canalId: string,
  quantidadeInserida: number,
  rendaLiquidaInfo?: { renda_liquida_unitaria: number; tem_aprovacao: boolean } | null,
): CelulaLucroCalculada {
  const qtd = Math.max(0, Number(quantidadeInserida) || 0)
  const temAprovacao = Boolean(rendaLiquidaInfo && rendaLiquidaInfo.tem_aprovacao)
  const rendaUnit = temAprovacao ? Number(rendaLiquidaInfo?.renda_liquida_unitaria) || 0 : 0

  const incluso = temAprovacao
  const lucroBruto = qtd * rendaUnit
  const lucroEfetivo = incluso ? arredondarMoeda(lucroBruto) : 0
  const requerAjuste = qtd > 0 && !temAprovacao

  return {
    produto_id: produtoId,
    canal_id: canalId,
    quantidade: qtd,
    renda_liquida_unitaria: rendaUnit,
    tem_aprovacao: temAprovacao,
    lucro_total: lucroEfetivo,
    incluso_na_somatoria: incluso,
    requer_ajuste_precificacao: requerAjuste,
  }
}

/**
 * Consolida a grade completa de Lucro Líquido para o mês ou período selecionado
 */
export function calcularGradeLucroMes(
  produtos: ProdutoLucro[],
  lojas: CanalLojaLucro[],
  quantidades: Record<string, Record<string, number>>, // [produto_id][canal_id] => qtd
  rendasLiquidas: Record<
    string,
    Record<string, { renda_liquida_unitaria: number; tem_aprovacao: boolean }>
  >, // [produto_id][canal_id]
): ResumoGradeLucroMes {
  const totaisPorLoja: Record<string, { quantidade: number; lucro: number }> = {}
  const totaisPorMarketplace: Record<string, { quantidade: number; lucro: number }> = {}

  for (const loja of lojas) {
    totaisPorLoja[loja.id] = { quantidade: 0, lucro: 0 }
    const mkt = loja.marketplace_nome || 'Outros'
    if (!totaisPorMarketplace[mkt]) {
      totaisPorMarketplace[mkt] = { quantidade: 0, lucro: 0 }
    }
  }

  let totalGeralQuantidade = 0
  let totalGeralLucro = 0
  let totalAlertasSemAprovacao = 0

  const linhas: LinhaProdutoGradeLucro[] = produtos.map((prod) => {
    const celulasPorCanal: Record<string, CelulaLucroCalculada> = {}
    let totalQtdLinha = 0
    let totalLucroLinha = 0
    let linhaTemItensSemAprovacao = false

    for (const loja of lojas) {
      const qtd = quantidades[prod.id]?.[loja.id] || 0
      const rendaInfo = rendasLiquidas[prod.id]?.[loja.id]

      const celula = calcularCelulaLucro(prod.id, loja.id, qtd, rendaInfo)
      celulasPorCanal[loja.id] = celula

      totalQtdLinha += celula.quantidade
      if (celula.incluso_na_somatoria) {
        totalLucroLinha += celula.lucro_total
      }

      if (celula.requer_ajuste_precificacao) {
        linhaTemItensSemAprovacao = true
        totalAlertasSemAprovacao++
      }

      // Acumula na loja
      const accLoja = totaisPorLoja[loja.id]
      if (accLoja) {
        accLoja.quantidade += celula.quantidade
        if (celula.incluso_na_somatoria) {
          accLoja.lucro += celula.lucro_total
        }
      }

      // Acumula no marketplace
      const mkt = loja.marketplace_nome || 'Outros'
      const accMkt = totaisPorMarketplace[mkt]
      if (accMkt) {
        accMkt.quantidade += celula.quantidade
        if (celula.incluso_na_somatoria) {
          accMkt.lucro += celula.lucro_total
        }
      }
    }

    totalGeralQuantidade += totalQtdLinha
    totalGeralLucro += totalLucroLinha

    return {
      produto: prod,
      celulasPorCanal,
      totalQuantidade: totalQtdLinha,
      totalLucro: arredondarMoeda(totalLucroLinha),
      temItensSemAprovacao: linhaTemItensSemAprovacao,
    }
  })

  // Arredondamentos finais
  for (const k of Object.keys(totaisPorLoja)) {
    totaisPorLoja[k].lucro = arredondarMoeda(totaisPorLoja[k].lucro)
  }
  for (const k of Object.keys(totaisPorMarketplace)) {
    totaisPorMarketplace[k].lucro = arredondarMoeda(totaisPorMarketplace[k].lucro)
  }

  return {
    linhas,
    totaisPorLoja,
    totaisPorMarketplace,
    totalGeralQuantidade,
    totalGeralLucro: arredondarMoeda(totalGeralLucro),
    totalAlertasSemAprovacao,
  }
}

/**
 * Agrupa lojas por Marketplace com faixa colorida de marca para o cabeçalho
 */
export function agruparLojasPorMarketplace(lojas: CanalLojaLucro[]): MarketplaceGrupoLojas[] {
  const gruposMap = new Map<string, MarketplaceGrupoLojas>()

  // Cores de marca padrão para os marketplaces conhecidos caso não venham do cadastro
  const coresPadrao: Record<string, string> = {
    shopee: '#EE4D2D',
    shein: '#111111',
    kwai: '#FF5E00',
    magalu: '#0086FF',
    tiktok: '#000000',
    'mercado livre': '#FFE600',
    mercadolivre: '#FFE600',
    amazon: '#FF9900',
    temu: '#FF5722',
    'site próprio': '#0284C7',
    site: '#0284C7',
    outros: '#6B7280',
  }

  for (const loja of lojas) {
    const nomeMkt = (loja.marketplace_nome || 'Canais').trim()
    // Identificador único do grupo: id do marketplace ou slug/nome minúsculo
    const chave = (loja.marketplace_id || nomeMkt).toLowerCase()

    let cor = loja.marketplace_cor
    if (!cor) {
      for (const [k, c] of Object.entries(coresPadrao)) {
        if (chave.includes(k) || nomeMkt.toLowerCase().includes(k)) {
          cor = c
          break
        }
      }
    }
    if (!cor) cor = '#475569'

    if (!gruposMap.has(chave)) {
      gruposMap.set(chave, {
        id: loja.marketplace_id || chave,
        nome: nomeMkt,
        cor,
        lojas: [],
      })
    }

    const grp = gruposMap.get(chave)!
    // Mantém a cor mais específica se estiver disponível
    if (loja.marketplace_cor && grp.cor === '#475569') {
      grp.cor = loja.marketplace_cor
    }
    grp.lojas.push(loja)
  }

  return Array.from(gruposMap.values())
}

/**
 * Calcula a aba Balanço:
 * Balanço = Lucro Líquido do mês (soma da aba 1) − Total Tags (despesas do mês agrupadas por Destino/contexto)
 * Negativo fica em destaque (ex: 6.334,31 − 16.235,70 = −9.901,39)
 */
export function calcularBalancoMes(
  lucroLiquidoMes: number,
  gruposDespesas: DespesaGrupoItem[],
): BalancoMesResultado {
  const lucro = arredondarMoeda(lucroLiquidoMes)
  const totalDespesas = arredondarMoeda(
    gruposDespesas.reduce((acc, g) => acc + (Number(g.total) || 0), 0),
  )
  const balanco = arredondarMoeda(lucro - totalDespesas)

  return {
    lucroLiquido: lucro,
    totalDespesasTags: totalDespesas,
    balanco,
    isNegativo: balanco < 0,
    grupos: gruposDespesas,
  }
}

/**
 * Nomes abreviados dos dias da semana (0 = dom, 1 = seg, ..., 6 = sáb)
 */
export const DIAS_SEMANA_ABREV = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

/**
 * Gera as semanas fechadas de domingo a sábado AUTOMATICAMENTE dentro do mês selecionado.
 * Regra acordada:
 * - A semana 1 começa no dia 01 do mês e termina no primeiro sábado (ex: começa na quinta => qui a sáb, 3 dias).
 * - As semanas seguintes vão de domingo a sábado.
 * - A última semana termina no último dia do mês (podendo ficar curta).
 * - As semanas NUNCA atravessam a fronteira do mês.
 *
 * @param competencia Formato 'YYYY-MM' (ex: '2026-09')
 */
export function gerarSemanasDoMes(competencia: string): SemanaMesInfo[] {
  const partes = competencia.split('-')
  if (partes.length < 2) return []

  const ano = parseInt(partes[0], 10)
  const mes = parseInt(partes[1], 10) // 1 a 12
  if (isNaN(ano) || isNaN(mes) || mes < 1 || mes > 12) return []

  // Último dia do mês: dia 0 do mês seguinte
  const ultimoDiaNum = new Date(ano, mes, 0).getDate()

  const semanas: SemanaMesInfo[] = []
  let diaAtual = 1
  let numeroSemana = 1

  const format2 = (n: number) => String(n).padStart(2, '0')

  while (diaAtual <= ultimoDiaNum) {
    const diaInicio = diaAtual
    const dtInicio = new Date(ano, mes - 1, diaInicio, 12, 0, 0)
    const diaSemanaInicio = dtInicio.getDay() // 0 = dom, 6 = sáb

    // Quantos dias até o sábado (6)?
    // Se diaSemanaInicio = 6 (sábado), diasAteSabado = 0
    // Se diaSemanaInicio = 4 (quinta), diasAteSabado = 6 - 4 = 2 (qui, sex, sáb)
    const diasAteSabado = 6 - diaSemanaInicio
    let diaFim = diaInicio + diasAteSabado
    if (diaFim > ultimoDiaNum) {
      diaFim = ultimoDiaNum
    }

    const dtFim = new Date(ano, mes - 1, diaFim, 12, 0, 0)
    const diaSemanaFim = dtFim.getDay()

    const dtInicioIso = `${ano}-${format2(mes)}-${format2(diaInicio)}`
    const dtFimIso = `${ano}-${format2(mes)}-${format2(diaFim)}`

    const diasIso: string[] = []
    for (let d = diaInicio; d <= diaFim; d++) {
      diasIso.push(`${ano}-${format2(mes)}-${format2(d)}`)
    }

    const siglaInicio = DIAS_SEMANA_ABREV[diaSemanaInicio]
    const siglaFim = DIAS_SEMANA_ABREV[diaSemanaFim]

    const rotuloExtenso =
      diaInicio === diaFim
        ? `Semana ${numeroSemana} (${format2(diaInicio)}/${format2(mes)} - ${siglaInicio})`
        : `Semana ${numeroSemana} (${format2(diaInicio)}/${format2(mes)} a ${format2(diaFim)}/${format2(mes)} - ${siglaInicio} a ${siglaFim})`

    const rotuloCurto =
      diaInicio === diaFim
        ? `Semana ${numeroSemana} (${format2(diaInicio)}/${format2(mes)})`
        : `Semana ${numeroSemana} (${format2(diaInicio)} a ${format2(diaFim)}/${format2(mes)})`

    semanas.push({
      numero: numeroSemana,
      rotulo: rotuloExtenso,
      rotuloCurto,
      dataInicio: dtInicioIso,
      dataFim: dtFimIso,
      diasCount: diaFim - diaInicio + 1,
      diasIso,
    })

    diaAtual = diaFim + 1
    numeroSemana++
  }

  return semanas
}

/**
 * Normaliza uma data para 'YYYY-MM-DD' extraindo ano, mês e dia
 */
export function extrairDataIso(dataStr?: string | null): string {
  if (!dataStr) return ''
  // Se for ISO com T ou espaço: "2026-09-05 12:00:00.000Z" => "2026-09-05"
  const limpo = dataStr.trim()
  if (limpo.length >= 10 && limpo[4] === '-' && limpo[7] === '-') {
    return limpo.substring(0, 10)
  }
  return ''
}

/**
 * Filtra grupos de despesas cujos itens pertençam ao intervalo de datas de uma semana.
 * Utiliza o campo `data` de cada item (data_pagamento ou data_vencimento na competência).
 * Preserva os mesmos grupos/destinos de custo cadastrados em /despesas.
 */
export function filtrarDespesasPorSemana(
  gruposDespesasMes: DespesaGrupoItem[],
  semana: SemanaMesInfo,
): DespesaGrupoItem[] {
  const dtInicio = semana.dataInicio
  const dtFim = semana.dataFim

  const gruposFiltrados: DespesaGrupoItem[] = []

  for (const grupo of gruposDespesasMes) {
    const itensSemana = grupo.itens.filter((it) => {
      const dataIso = extrairDataIso(it.data)
      if (!dataIso) return false
      return dataIso >= dtInicio && dataIso <= dtFim
    })

    if (itensSemana.length > 0) {
      const totalSemana = arredondarMoeda(
        itensSemana.reduce((acc, it) => acc + (Number(it.valor) || 0), 0),
      )
      gruposFiltrados.push({
        grupo_id: grupo.grupo_id,
        grupo_nome: grupo.grupo_nome,
        cor: grupo.cor,
        total: totalSemana,
        itens: itensSemana,
      })
    }
  }

  return gruposFiltrados
}

/**
 * Calcula o Balanço Semanal completo para todas as semanas do mês:
 * Para cada semana:
 *   Lucro da semana = soma da grade daquela semana
 *   Despesas da semana = despesas com competência/pagamento na semana
 *   Balanço da semana = Lucro - Despesas
 * Mantém também o Balanço do mês como totalizante (soma das semanas = total do mês)
 */
export function calcularBalancoSemanal(
  semanas: SemanaMesInfo[],
  lucroPorSemana: Record<number, number>, // semana.numero => lucro líquido da grade
  gruposDespesasMes: DespesaGrupoItem[],
): BalancoSemanalResultado {
  let totalLucroMes = 0
  let totalDespesasMes = 0

  const itensSemana: BalancoSemanalItem[] = semanas.map((sem) => {
    const lucroSem = arredondarMoeda(lucroPorSemana[sem.numero] || 0)
    const despesasGrupoSem = filtrarDespesasPorSemana(gruposDespesasMes, sem)
    const despesasSem = arredondarMoeda(
      despesasGrupoSem.reduce((acc, g) => acc + (Number(g.total) || 0), 0),
    )
    const balancoSem = arredondarMoeda(lucroSem - despesasSem)

    totalLucroMes += lucroSem
    totalDespesasMes += despesasSem

    return {
      semana: sem,
      lucroSemana: lucroSem,
      despesasSemana: despesasSem,
      balanco: balancoSem,
      isNegativo: balancoSem < 0,
      gruposDespesas: despesasGrupoSem,
    }
  })

  totalLucroMes = arredondarMoeda(totalLucroMes)
  totalDespesasMes = arredondarMoeda(totalDespesasMes)
  const balancoMes = arredondarMoeda(totalLucroMes - totalDespesasMes)

  return {
    semanas: itensSemana,
    totalLucroMes,
    totalDespesasMes,
    balancoMes,
    isNegativoMes: balancoMes < 0,
  }
}

/**
 * Calcula a aba Saídas Unitárias e Kits/unid.:
 * Contagem MENSAL por produto, separada por empresa/CNPJ (empresa vinculada no repositório)
 * Colunas: Kits (kits vendidos) e Unid. (kits × qtd_por_kit do catálogo prec_produtos).
 * Se o produto não for kit ou qtd_por_kit <= 0, considera 1 unidade por kit.
 */
export function calcularSaidasUnitarias(
  produtos: ProdutoLucro[],
  quantidadesTotaisPorProduto: Record<string, number>, // soma de todas as lojas no mês
): ResumoAbaSaidasResultado {
  const empresasMap = new Map<string, EmpresaSaidasConsolidada>()

  let totalGeralKits = 0
  let totalGeralUnidades = 0

  for (const prod of produtos) {
    const kits = Math.max(0, Number(quantidadesTotaisPorProduto[prod.id]) || 0)
    // Se o produto não tiver vendas no mês, pode ser listado com 0 ou omitido dependendo da flag
    const qtdPorKit =
      typeof prod.qtd_por_kit === 'number' && prod.qtd_por_kit > 0 ? prod.qtd_por_kit : 1
    const unidades = kits * qtdPorKit

    totalGeralKits += kits
    totalGeralUnidades += unidades

    const empId = prod.empresa_id || 'sem_empresa'
    const empNome = prod.empresa_nome || 'Sem Empresa Vinculada'
    const empCnpj = prod.empresa_cnpj || ''

    if (!empresasMap.has(empId)) {
      empresasMap.set(empId, {
        empresa_id: empId,
        empresa_nome: empNome,
        empresa_cnpj: empCnpj,
        itens: [],
        totalKits: 0,
        totalUnidades: 0,
      })
    }

    const empObj = empresasMap.get(empId)!
    empObj.itens.push({
      produto_id: prod.id,
      produto_nome: prod.nome,
      empresa_id: empId,
      empresa_nome: empNome,
      empresa_cnpj: empCnpj,
      kits_vendidos: kits,
      qtd_por_kit: qtdPorKit,
      unidades_totais: unidades,
    })
    empObj.totalKits += kits
    empObj.totalUnidades += unidades
  }

  return {
    empresas: Array.from(empresasMap.values()),
    totalGeralKits,
    totalGeralUnidades,
  }
}
