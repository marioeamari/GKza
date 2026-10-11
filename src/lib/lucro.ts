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
  ordem?: number
}

export interface CanalLojaLucro {
  id: string
  nome: string // Ex: "Kza Mari", "Wee Kids"
  marketplace_id?: string
  marketplace_nome: string // Ex: "Shopee", "SHEIN", "Kwai", "Magalu", "TikTok", "Mercado Livre", "TEMU", "www.site.com.br"
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

  // Cores de marca padrão para os principais marketplaces
  const coresPadrao: Record<string, string> = {
    shopee: '#EE4D2D',
    shein: '#111111',
    kwai: '#FF5E00',
    magalu: '#0086FF',
    tiktok: '#000000',
    'mercado livre': '#FFE600',
    temu: '#FF5722',
    'site próprio': '#0284C7',
    site: '#0284C7',
    outros: '#6B7280',
  }

  for (const loja of lojas) {
    const nomeMkt = (loja.marketplace_nome || 'Outros').trim()
    const chave = nomeMkt.toLowerCase()

    let cor = loja.marketplace_cor
    if (!cor) {
      for (const [k, c] of Object.entries(coresPadrao)) {
        if (chave.includes(k)) {
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

    gruposMap.get(chave)!.lojas.push(loja)
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
