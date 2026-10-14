/**
 * Parser do Relatório de Vendas do Bling (.xls / .xlsx) para o módulo /lucro
 *
 * Colunas identificadas pelo relatório Bling:
 * - Código (obrigatório para identificar o item/apelido)
 * - Quantidade (ou QuantidadeICMS, Qtd, etc.)
 * - Valor total FCP ST (ou Valor total, Total, etc.)
 * - Frete, ICMS, IPI, ISSQN, COFINS, ST, II, PIS, CFOP, Grupo, NCM, Percentual
 *
 * Regras cruciais:
 * (1) DICTIONÁRIO DE APELIDOS SKU: usa `sku_por_canal` de `prec_produtos` mapeando:
 *     código do Bling -> produto EXATO do sistema, no nível tema/modelo
 *     (ex.: B197 -> a toalha do tema X; B122 -> a toalha do tema Y;
 *      são produtos diferentes com mesmo preço de venda, NUNCA agrupar em categoria genérica;
 *      RPatrulha-20 -> Kit-20-R-Patrulha).
 * (2) IMPORTAÇÃO: usuário escolhe o canal (prec_canais) e sobe o arquivo;
 *     sistema agrupa quantidades e valores por produto mapeado e pré-preenche a grade
 *     daquele canal no período. Editável à mão, sem sobrescrever valores já lançados manualmente
 *     sem confirmação.
 * (3) FILA 'A CLASSIFICAR': códigos sem match listados para o usuário apontar o produto —
 *     a escolha grava o apelido definitivamente (nunca adivinhar).
 * (4) Relatório pós-importação: X produtos classificados, Y unidades somadas, Z códigos aguardando classificação;
 *     reimportar o mesmo período/canal atualiza em vez de duplicar.
 */

import * as XLSX from 'xlsx'
import type { PrecProdutoRecord } from '@/types/precificacao'

export interface LinhaBlingBruta {
  codigo: string
  quantidade: number
  valorTotal: number
  frete?: number
  grupo?: string
  ncm?: string
  percentual?: number
  linhaOriginal: Record<string, unknown>
}

export interface ItemClassificadoBling {
  codigoBling: string
  produtoId: string
  produtoNome: string
  produtoSku: string
  quantidade: number
  valorTotal: number
  freteTotal: number
  apelidoOrigem: 'sku_direto' | 'sku_por_canal' | 'novo_apelido'
}

export interface ItemNaoClassificadoBling {
  codigoBling: string
  quantidade: number
  valorTotal: number
  freteTotal: number
  exemplosLinhas?: number
}

export interface ResultadoParseBling {
  sucesso: boolean
  nomeArquivo?: string
  totalLinhasLidas: number
  classificados: ItemClassificadoBling[]
  agrupadosPorProduto: Record<
    string,
    {
      produtoId: string
      produtoNome: string
      produtoSku: string
      quantidadeTotal: number
      valorTotal: number
      codigosBling: string[]
    }
  >
  aClassificar: ItemNaoClassificadoBling[]
  resumo: {
    totalProdutosClassificados: number
    totalUnidadesClassificadas: number
    totalValorClassificado: number
    totalCodigosNaoClassificados: number
    totalUnidadesNaoClassificadas: number
    totalValorNaoClassificado: number
  }
  erros?: string[]
}

/**
 * Normaliza textos para correspondência de códigos SKU / apelidos
 * Mantém letras, dígitos, hífens e underscores intactos, remove acentos e espaços extras
 */
export function normalizarCodigoSku(str: string | number | null | undefined): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
}

/**
 * Normaliza cabeçalho para detecção de colunas
 */
export function normalizarCabecalho(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Converte valor textual de moeda/número para float
 * Suporta "R$ 1.250,50", "1250,50", "1250.50", números nativos, etc.
 */
export function parseNumeroBling(val: unknown): number {
  if (typeof val === 'number') {
    return isNaN(val) ? 0 : val
  }
  if (!val) return 0
  const str = String(val).trim()
  if (!str) return 0

  // Se já for numérico puro simples
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    return parseFloat(str) || 0
  }

  // Remove R$, espaços
  let limpo = str.replace(/[R$\s]/g, '')

  // Se possui ponto e vírgula: formato BR "1.234,56"
  if (limpo.includes('.') && limpo.includes(',')) {
    limpo = limpo.replace(/\./g, '').replace(',', '.')
  } else if (limpo.includes(',')) {
    // Formato "1234,56"
    limpo = limpo.replace(',', '.')
  }

  const num = parseFloat(limpo)
  return isNaN(num) ? 0 : num
}

/**
 * Sinônimos das colunas do relatório do Bling
 */
export const SINONIMOS_COLUNAS_BLING = {
  codigo: ['codigo', 'cod', 'codigo do produto', 'cod produto', 'sku', 'referencia', 'codigo item'],
  quantidade: ['quantidade', 'quantidadeicms', 'qtd', 'quant', 'quantidade total', 'unidades'],
  valorTotal: [
    'valor total fcp st',
    'valor total',
    'total',
    'valor total liquido',
    'total fcp st',
    'valor venda',
    'preco total',
    'total do produto',
  ],
  frete: ['frete', 'valor frete', 'vlr frete'],
  grupo: ['grupo', 'familia', 'categoria'],
  ncm: ['ncm', 'cod ncm'],
  percentual: ['percentual', 'aliquota', 'perc'],
} as const

/**
 * Localiza o índice ou chave da coluna pelo nome / sinônimo
 */
export function detectarChaveColuna(
  chaves: string[],
  sinonimos: readonly string[],
): string | undefined {
  // 1. Match exato normalizado
  for (const sin of sinonimos) {
    const sinNorm = normalizarCabecalho(sin)
    const match = chaves.find((c) => normalizarCabecalho(c) === sinNorm)
    if (match) return match
  }
  // 2. Match que começa ou contém o sinônimo
  for (const sin of sinonimos) {
    const sinNorm = normalizarCabecalho(sin)
    if (sinNorm.length < 3) continue
    const match = chaves.find((c) => {
      const cNorm = normalizarCabecalho(c)
      return cNorm === sinNorm || cNorm.startsWith(sinNorm) || cNorm.includes(sinNorm)
    })
    if (match) return match
  }
  return undefined
}

/**
 * Faz o match exato de um código do Bling contra a lista de produtos do sistema:
 * Regra: NUNCA agrupar em categoria genérica. Apenas match no nível tema/modelo exato!
 *
 * Prioridade:
 * 1. Match no dicionário de apelidos `sku_por_canal` do canal informado:
 *    item.canal === canalId (ou canal === canalNome) e item.sku_externo === codigoBling
 * 2. Match no `sku_por_canal` de qualquer canal (caso o apelido já tenha sido registrado globalmente)
 * 3. Match no `sku` próprio do produto (`prec_produtos.sku`)
 *
 * Retorna o produto exato ou null (vai para a fila 'A Classificar').
 */
export function encontrarProdutoPorApelido(
  codigoBling: string,
  catalogoProdutos: PrecProdutoRecord[],
  canalId?: string,
  canalNome?: string,
): { produto: PrecProdutoRecord; origem: 'sku_direto' | 'sku_por_canal' } | null {
  const codNorm = normalizarCodigoSku(codigoBling)
  if (!codNorm) return null

  const canalIdNorm = canalId ? normalizarCodigoSku(canalId) : ''
  const canalNomeNorm = canalNome ? normalizarCodigoSku(canalNome) : ''

  // Função auxiliar para verificar se algum dos códigos contidos em sku_externo bate com codNorm
  // Compatibilidade com dados antigos que possam ter gravado vírgula/ponto-e-vírgula em uma string única
  const itemCasaCodigo = (skuExternoRaw: string | undefined): boolean => {
    if (!skuExternoRaw) return false
    const codigos = extrairCodigosIndividuais(skuExternoRaw)
    return codigos.some((c) => normalizarCodigoSku(c) === codNorm)
  }

  // (1) Prioridade: Apelido no canal específico
  if (canalIdNorm || canalNomeNorm) {
    for (const prod of catalogoProdutos) {
      if (Array.isArray(prod.sku_por_canal)) {
        const achouNoCanal = prod.sku_por_canal.some((sc) => {
          if (!sc || !itemCasaCodigo(sc.sku_externo)) return false

          const scCanalNorm = normalizarCodigoSku(sc.canal)
          return (
            !scCanalNorm ||
            scCanalNorm === 'todos' ||
            scCanalNorm === 'global' ||
            (canalIdNorm && scCanalNorm === canalIdNorm) ||
            (canalNomeNorm && scCanalNorm === canalNomeNorm)
          )
        })
        if (achouNoCanal) {
          return { produto: prod, origem: 'sku_por_canal' }
        }
      }
    }
  }

  // (2) Apelido registrado em sku_por_canal em qualquer canal
  for (const prod of catalogoProdutos) {
    if (Array.isArray(prod.sku_por_canal)) {
      const achouEmQualquer = prod.sku_por_canal.some((sc) => {
        return sc && itemCasaCodigo(sc.sku_externo)
      })
      if (achouEmQualquer) {
        return { produto: prod, origem: 'sku_por_canal' }
      }
    }
  }

  // (3) Match direto no próprio SKU do produto do sistema
  for (const prod of catalogoProdutos) {
    if (prod.sku && normalizarCodigoSku(prod.sku) === codNorm) {
      return { produto: prod, origem: 'sku_direto' }
    }
  }

  return null
}

/**
 * Lê o buffer do arquivo .xls ou .xlsx via SheetJS e extrai as linhas normalizadas
 */
export function lerPlanilhaBling(dadosBinarios: ArrayBuffer | Uint8Array): LinhaBlingBruta[] {
  const workbook = XLSX.read(dadosBinarios, { type: 'array' })
  const primeiraAba = workbook.SheetNames[0]
  if (!primeiraAba) return []

  const worksheet = workbook.Sheets[primeiraAba]
  if (!worksheet) return []

  // Converte a aba para matriz de células (linhas x colunas)
  const matriz: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  if (matriz.length < 2) return []

  // 1. Identifica a linha de cabeçalho
  // Em relatórios do Bling, a primeira linha com "Código" ou "Codigo" costuma ser o cabeçalho
  let headerIndex = 0
  for (let i = 0; i < Math.min(10, matriz.length); i++) {
    const row = (matriz[i] || []).map((c) => normalizarCabecalho(String(c || '')))
    if (row.some((cell) => cell.includes('codigo') || cell === 'cod' || cell === 'sku')) {
      headerIndex = i
      break
    }
  }

  const cabecalhosOriginais = (matriz[headerIndex] || []).map((c) => String(c || '').trim())
  const colCodigo = detectarChaveColuna(cabecalhosOriginais, SINONIMOS_COLUNAS_BLING.codigo)
  const colQtd = detectarChaveColuna(cabecalhosOriginais, SINONIMOS_COLUNAS_BLING.quantidade)
  const colValorTotal = detectarChaveColuna(cabecalhosOriginais, SINONIMOS_COLUNAS_BLING.valorTotal)
  const colFrete = detectarChaveColuna(cabecalhosOriginais, SINONIMOS_COLUNAS_BLING.frete)
  const colGrupo = detectarChaveColuna(cabecalhosOriginais, SINONIMOS_COLUNAS_BLING.grupo)
  const colNcm = detectarChaveColuna(cabecalhosOriginais, SINONIMOS_COLUNAS_BLING.ncm)
  const colPercentual = detectarChaveColuna(cabecalhosOriginais, SINONIMOS_COLUNAS_BLING.percentual)

  const idxCodigo = colCodigo ? cabecalhosOriginais.indexOf(colCodigo) : 0
  const idxQtd = colQtd ? cabecalhosOriginais.indexOf(colQtd) : -1
  const idxValorTotal = colValorTotal ? cabecalhosOriginais.indexOf(colValorTotal) : -1
  const idxFrete = colFrete ? cabecalhosOriginais.indexOf(colFrete) : -1
  const idxGrupo = colGrupo ? cabecalhosOriginais.indexOf(colGrupo) : -1
  const idxNcm = colNcm ? cabecalhosOriginais.indexOf(colNcm) : -1
  const idxPercentual = colPercentual ? cabecalhosOriginais.indexOf(colPercentual) : -1

  const linhasBrutas: LinhaBlingBruta[] = []

  for (let i = headerIndex + 1; i < matriz.length; i++) {
    const row = matriz[i]
    if (!row || !Array.isArray(row)) continue

    const codRaw = row[idxCodigo]
    const codigoStr = String(codRaw || '').trim()
    if (!codigoStr) continue // pula linha vazia

    // Pula linhas de totalização ou rodapé comuns em relatórios Bling
    const codNorm = normalizarCabecalho(codigoStr)
    if (
      codNorm.startsWith('total') ||
      codNorm.startsWith('resumo') ||
      codNorm.startsWith('subtotal') ||
      codNorm === 'valor'
    ) {
      continue
    }

    const qtd = idxQtd >= 0 ? parseNumeroBling(row[idxQtd]) : 1
    const valorTotal = idxValorTotal >= 0 ? parseNumeroBling(row[idxValorTotal]) : 0
    const frete = idxFrete >= 0 ? parseNumeroBling(row[idxFrete]) : 0
    const grupo = idxGrupo >= 0 ? String(row[idxGrupo] || '').trim() : undefined
    const ncm = idxNcm >= 0 ? String(row[idxNcm] || '').trim() : undefined
    const percentual = idxPercentual >= 0 ? parseNumeroBling(row[idxPercentual]) : undefined

    // Linha original como objeto para depuração
    const linhaOriginal: Record<string, unknown> = {}
    cabecalhosOriginais.forEach((colName, cIdx) => {
      if (colName) linhaOriginal[colName] = row[cIdx]
    })

    linhasBrutas.push({
      codigo: codigoStr,
      quantidade: Math.max(0, qtd),
      valorTotal: Math.max(0, valorTotal),
      frete: Math.max(0, frete),
      grupo,
      ncm,
      percentual,
      linhaOriginal,
    })
  }

  return linhasBrutas
}

/**
 * Processa as linhas do Bling confrontando com o Catálogo de Produtos e Dicionário de Apelidos
 */
export function processarRelatorioBling(
  linhas: LinhaBlingBruta[],
  catalogoProdutos: PrecProdutoRecord[],
  canalId?: string,
  canalNome?: string,
  nomeArquivo?: string,
): ResultadoParseBling {
  const classificados: ItemClassificadoBling[] = []
  const agrupadosPorProduto: ResultadoParseBling['agrupadosPorProduto'] = {}
  const mapaAClassificar = new Map<string, ItemNaoClassificadoBling>()

  let totalUnidadesClassificadas = 0
  let totalValorClassificado = 0
  let totalUnidadesNaoClassificadas = 0
  let totalValorNaoClassificado = 0

  for (const lin of linhas) {
    const match = encontrarProdutoPorApelido(lin.codigo, catalogoProdutos, canalId, canalNome)

    if (match) {
      const { produto, origem } = match

      classificados.push({
        codigoBling: lin.codigo,
        produtoId: produto.id,
        produtoNome: produto.nome,
        produtoSku: produto.sku,
        quantidade: lin.quantidade,
        valorTotal: lin.valorTotal,
        freteTotal: lin.frete || 0,
        apelidoOrigem: origem,
      })

      // Acumula no agrupador por produto exato (chave única por produtoId)
      if (!agrupadosPorProduto[produto.id]) {
        agrupadosPorProduto[produto.id] = {
          produtoId: produto.id,
          produtoNome: produto.nome,
          produtoSku: produto.sku,
          quantidadeTotal: 0,
          valorTotal: 0,
          codigosBling: [],
        }
      }

      const itemAgrupado = agrupadosPorProduto[produto.id]
      itemAgrupado.quantidadeTotal =
        Math.round((itemAgrupado.quantidadeTotal + lin.quantidade) * 100) / 100
      itemAgrupado.valorTotal = Math.round((itemAgrupado.valorTotal + lin.valorTotal) * 100) / 100

      if (!itemAgrupado.codigosBling.includes(lin.codigo)) {
        itemAgrupado.codigosBling.push(lin.codigo)
      }

      totalUnidadesClassificadas += lin.quantidade
      totalValorClassificado += lin.valorTotal
    } else {
      // Vai para a Fila 'A Classificar' agrupado por código Bling sem match
      const codNorm = normalizarCodigoSku(lin.codigo)
      if (!mapaAClassificar.has(codNorm)) {
        mapaAClassificar.set(codNorm, {
          codigoBling: lin.codigo,
          quantidade: 0,
          valorTotal: 0,
          freteTotal: 0,
          exemplosLinhas: 0,
        })
      }

      const itemNC = mapaAClassificar.get(codNorm)!
      itemNC.quantidade = Math.round((itemNC.quantidade + lin.quantidade) * 100) / 100
      itemNC.valorTotal = Math.round((itemNC.valorTotal + lin.valorTotal) * 100) / 100
      itemNC.freteTotal = Math.round((itemNC.freteTotal + (lin.frete || 0)) * 100) / 100
      itemNC.exemplosLinhas = (itemNC.exemplosLinhas || 0) + 1

      totalUnidadesNaoClassificadas += lin.quantidade
      totalValorNaoClassificado += lin.valorTotal
    }
  }

  const aClassificar = Array.from(mapaAClassificar.values()).sort(
    (a, b) => b.quantidade - a.quantidade,
  )

  return {
    sucesso: true,
    nomeArquivo,
    totalLinhasLidas: linhas.length,
    classificados,
    agrupadosPorProduto,
    aClassificar,
    resumo: {
      totalProdutosClassificados: Object.keys(agrupadosPorProduto).length,
      totalUnidadesClassificadas: Math.round(totalUnidadesClassificadas * 100) / 100,
      totalValorClassificado: Math.round(totalValorClassificado * 100) / 100,
      totalCodigosNaoClassificados: aClassificar.length,
      totalUnidadesNaoClassificadas: Math.round(totalUnidadesNaoClassificadas * 100) / 100,
      totalValorNaoClassificado: Math.round(totalValorNaoClassificado * 100) / 100,
    },
  }
}

/**
 * Adiciona um apelido de SKU por canal à lista existente de um produto
 * Evita duplicatas do mesmo apelido no mesmo canal
 */
/**
 * Quebra uma string de apelidos (que pode conter vírgula, ponto-e-vírgula ou múltiplos códigos)
 * em códigos individuais normalizados por trim.
 */
export function extrairCodigosIndividuais(texto: string | number | null | undefined): string[] {
  if (texto === null || texto === undefined) return []
  return String(texto)
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean)
}

/**
 * Adiciona um ou mais apelidos de SKU por canal à lista existente de um produto.
 * Se skuExterno contiver múltiplos códigos separados por vírgula ou ponto-e-vírgula,
 * separa em códigos individuais e grava uma entrada por código.
 * Impede duplicatas do mesmo apelido no mesmo canal com base em normalizarCodigoSku.
 */
export function adicionarApelidoCanal(
  listaAtual: PrecProdutoRecord['sku_por_canal'],
  canalId: string,
  skuExterno: string,
): Array<{ canal: string; sku_externo: string }> {
  const limpoCanal = (canalId || '').trim() || 'todos'
  const partes = extrairCodigosIndividuais(skuExterno)
  if (partes.length === 0) return Array.isArray(listaAtual) ? [...listaAtual] : []

  const lista = Array.isArray(listaAtual) ? [...listaAtual] : []
  const canalNorm = normalizarCodigoSku(limpoCanal)

  for (const parte of partes) {
    const skuNorm = normalizarCodigoSku(parte)
    if (!skuNorm) continue

    const jaExiste = lista.some(
      (item) =>
        normalizarCodigoSku(item.sku_externo) === skuNorm &&
        normalizarCodigoSku(item.canal) === canalNorm,
    )

    if (!jaExiste) {
      lista.push({ canal: limpoCanal, sku_externo: parte })
    }
  }

  return lista
}

/**
 * Remove um apelido de SKU por canal
 */
export function removerApelidoCanal(
  listaAtual: PrecProdutoRecord['sku_por_canal'],
  canalId: string,
  skuExterno: string,
): Array<{ canal: string; sku_externo: string }> {
  if (!Array.isArray(listaAtual)) return []
  const skuNorm = normalizarCodigoSku(skuExterno)
  const canalNorm = normalizarCodigoSku(canalId)

  return listaAtual.filter(
    (item) =>
      !(
        normalizarCodigoSku(item.sku_externo) === skuNorm &&
        normalizarCodigoSku(item.canal) === canalNorm
      ),
  )
}
