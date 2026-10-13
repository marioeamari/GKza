import * as XLSX from 'xlsx'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { KitTema, TriagemPedidoEspecial } from '@/types/separacaoKits'

export interface ItemLinhaImportada {
  linhaOriginal: string
  numeroPedido: string
  shopeeOrderId?: string
  sku: string
  produtoNome: string
  quantidade: number
  precoUnitario?: number
  variacao?: string
  clienteNome?: string
  pedidoEspecial?: string
  temPedidoEspecial: boolean
  triagemPedidoEspecial: TriagemPedidoEspecial

  // Dedução e rastreamento de quantidade
  quantidadePlanilhaOriginal?: number
  quantidadeDeduzidaPorKit?: number
  origemDeducaoQuantidade?: 'catalogo' | 'sku' | 'produto_nome' | 'planilha'

  // Código de Rastreio (Shopee / Transportadora)
  codigoRastreio?: string

  // Matching de produto e kit
  produtoEncontrado?: PrecProdutoRecord | null
  temaId?: string
  temaMatched?: boolean
  reconhecido: boolean
  isKitOuCombo: boolean
  motivoNaoReconhecido?: string

  // Subitens empacotados (quando originário de product_info)
  itensEmpacotados?: Array<{
    nome: string
    variacao?: string
    precoUnitario?: number
    quantidade: number
    sku?: string
    parentSku?: string
  }>

  // Erro estrutural ou ilegibilidade
  problema?: string

  // Metadados opcionais trazidos da planilha da Shopee
  statusEnvio?: string
  observacaoComprador?: string
  notaVendedor?: string
}

export interface MapeamentoColunasShopee {
  numeroPedido?: string
  sku?: string
  produtoNome?: string
  quantidade?: string
  variacao?: string
  clienteNome?: string
  pedidoEspecial?: string
  statusEnvio?: string
  codigoRastreio?: string
  productInfo?: string
  sellerNote?: string
}

export interface DetalheMapeamentoColunas {
  colunasDetectadas: string[]
  mapeamento: MapeamentoColunasShopee
  confianca: {
    numeroPedido: boolean
    sku: boolean
    produtoNome: boolean
    quantidade: boolean
  }
}

export interface ResultadoParseShopee {
  itens: ItemLinhaImportada[]
  totalLinhas: number
  reconhecidosCount: number
  genericosCount: number
  pedidosEspeciaisCount: number
  problemasCount: number
  origem: 'colagem' | 'planilha_xlsx'
  formatoDetectado?: 'padrao_colunas' | 'lista_empacotamento_product_info'
  detalheMapeamento?: DetalheMapeamentoColunas
  nomeArquivo?: string
}

/**
 * Normaliza strings para comparação flexível (remove acentos, espaços extras, minúsculas, pontuação)
 */
export function normalizarTexto(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Constrói as URLs de atalho da Shopee
 */
export function buildShopeeChatUrl(orderId: string): string {
  const clean = (orderId || '').trim()
  if (!clean) return 'https://seller.shopee.com.br/webchat/conversations'
  return `https://seller.shopee.com.br/webchat/conversations?search=${encodeURIComponent(clean)}`
}

export function buildShopeeOrderUrl(orderId: string): string {
  const clean = (orderId || '').trim()
  if (!clean) return 'https://seller.shopee.com.br/portal/sale/order/list'
  return `https://seller.shopee.com.br/portal/sale/order/list?list_type=1&search=${encodeURIComponent(clean)}`
}

/**
 * Tenta fazer o match de um item contra o catálogo prec_produtos:
 * 1. Match por SKU exato ou normalizado
 * 2. Match por SKU_POR_CANAL (se houver correspondência com Shopee)
 * 3. Match por Nome aproximado (ex: "Kit 40 Toalha Leve de Praia" ou "Toalha Leve")
 */
export function encontrarProdutoCatalogo(
  sku: string,
  nome: string,
  catalogo: PrecProdutoRecord[],
): PrecProdutoRecord | null {
  const skuNorm = normalizarTexto(sku)
  const nomeNorm = normalizarTexto(nome)

  if (skuNorm) {
    // 1. SKU exato ou normalizado em prec_produtos.sku
    const porSku = catalogo.find((p) => normalizarTexto(p.sku) === skuNorm)
    if (porSku) return porSku

    // 2. SKU nos skus por canal
    const porCanal = catalogo.find((p) => {
      if (!Array.isArray(p.sku_por_canal)) return false
      return p.sku_por_canal.some((sc) => normalizarTexto(sc.sku_externo) === skuNorm)
    })
    if (porCanal) return porCanal
  }

  // 3. Match por nome se o nome tiver pelo menos 3 caracteres
  if (nomeNorm && nomeNorm.length >= 3) {
    // Nome exato
    const porNomeExato = catalogo.find((p) => normalizarTexto(p.nome) === nomeNorm)
    if (porNomeExato) return porNomeExato

    // Nome de produto do catálogo contido no texto ou vice-versa
    const porInclusao = catalogo.find((p) => {
      const pNome = normalizarTexto(p.nome)
      return pNome.length >= 5 && (nomeNorm.includes(pNome) || pNome.includes(nomeNorm))
    })
    if (porInclusao) return porInclusao
  }

  return null
}

/**
 * Encontra o tema de kit correspondente (ex: Mickey, Mônica, etc., ou primeiro tema disponível)
 */
export function inferirTemaKit(produtoNome: string, sku: string, temas: KitTema[]): string {
  const texto = normalizarTexto(`${produtoNome} ${sku}`)

  for (const tema of temas) {
    const tNome = normalizarTexto(tema.nome)
    if (texto.includes(tNome)) {
      return tema.id
    }
    // Palavras-chave dos temas
    if (
      tNome.includes('monica') &&
      (texto.includes('monica') || texto.includes('cebolinha') || texto.includes('cascao'))
    ) {
      return tema.id
    }
    if (
      tNome.includes('mickey') &&
      (texto.includes('mickey') || texto.includes('minnie') || texto.includes('disney'))
    ) {
      return tema.id
    }
    if (tNome.includes('sonic') && texto.includes('sonic')) {
      return tema.id
    }
    if (tNome.includes('pokemon') && (texto.includes('pokemon') || texto.includes('pikachu'))) {
      return tema.id
    }
  }

  // Fallback: primeiro tema ativo ou primeiro tema
  const ativo = temas.find((t) => t.ativo)
  return ativo?.id || temas[0]?.id || ''
}

// ============================================================================
// DICIONÁRIO DE SINÔNIMOS DO EXPORT DO SELLER CENTRE DA SHOPEE (BR / EN)
// Ponto central de calibração quando o usuário plugar um arquivo novo
// ============================================================================
export const SINONIMOS_COLUNAS_SHOPEE = {
  numeroPedido: [
    'order sn',
    'ordersn',
    'order_sn',
    'id do pedido',
    'id de pedido',
    'no do pedido',
    'n do pedido',
    'numero do pedido',
    'pedido',
    'order id',
    'order no',
    'order number',
    'id',
  ],
  productInfo: [
    'product info',
    'product_info',
    'informacoes do produto',
    'informacao do produto',
    'info do produto',
    'dados do produto',
    'product information',
  ],
  sellerNote: [
    'seller note',
    'seller_note',
    'nota do vendedor',
    'observacao do vendedor',
    'seller remark',
    'seller comment',
  ],
  sku: [
    'numero de referencia do sku',
    'no de referencia do sku',
    'referencia do produto',
    'numero de referencia',
    'codigo sku',
    'sku de variacao',
    'sku da variacao',
    'sku do produto',
    'sku de produto',
    'parent sku',
    'sku reference no',
    'parent sku reference no',
    'item sku',
    'variation sku',
    'sku',
  ],
  produtoNome: [
    'nome do produto',
    'nome de produto',
    'nome do item',
    'titulo do produto',
    'descricao do produto',
    'item name',
    'product name',
    'product title',
    'produto',
  ],
  variacao: [
    'nome da variacao',
    'nome de variacao',
    'variacao',
    'opcao de variacao',
    'variation name',
    'variation',
    'model',
    'modelo',
  ],
  quantidade: [
    'quantidade',
    'qtd',
    'quant',
    'quantidade total',
    'unidades',
    'quantity',
    'deal quantity',
    'qty',
  ],
  clienteNome: [
    'nome de usuario do comprador',
    'nome do comprador',
    'nome do destinatario',
    'destinatario',
    'usuario do comprador',
    'comprador',
    'cliente',
    'buyer username',
    'buyer name',
    'recipient name',
  ],
  pedidoEspecial: [
    'remark from buyer',
    'remark_from_buyer',
    'observacao do comprador',
    'nota do comprador',
    'mensagem do comprador',
    'comentario do comprador',
    'nota',
    'observacao',
    'buyer note',
    'buyer remark',
    'buyer comment',
    'note',
    'remark',
  ],
  statusEnvio: [
    'status de envio',
    'status do pedido',
    'status de pedido',
    'status',
    'order status',
    'shipping status',
    'tracking status',
  ],
  codigoRastreio: [
    'tracking number',
    'tracking_number',
    'tracking no',
    'tracking code',
    'tracking #',
    'tracking',
    'codigo de rastreamento',
    'codigo de rastreio',
    'numero de rastreamento',
    'numero de rastreio',
    'n de rastreamento',
    'no de rastreamento',
    'rastreamento',
    'rastreio',
    'cod rastreio',
    'waybill no',
    'waybill number',
    'awb',
    'numero de envio',
  ],
} as const

/**
 * Encontra qual cabeçalho da planilha bate com a lista de sinônimos conhecidos
 */
export function detectarColuna(
  cabecalhos: string[],
  sinonimos: readonly string[],
): string | undefined {
  // 1. Match exato normalizado
  for (const sin of sinonimos) {
    const sinNorm = normalizarTexto(sin)
    const match = cabecalhos.find((c) => normalizarTexto(c) === sinNorm)
    if (match) return match
  }

  // 2. Match parcial / inclusão forte
  for (const sin of sinonimos) {
    const sinNorm = normalizarTexto(sin)
    if (sinNorm.length < 3) continue
    const match = cabecalhos.find((c) => {
      const cNorm = normalizarTexto(c)
      return cNorm === sinNorm || cNorm.startsWith(sinNorm) || cNorm.includes(sinNorm)
    })
    if (match) return match
  }

  return undefined
}

/**
 * Infere o mapeamento de colunas automaticamente a partir dos cabeçalhos encontrados na planilha
 */
export function inferirMapeamentoColunas(cabecalhos: string[]): DetalheMapeamentoColunas {
  const mapeamento: MapeamentoColunasShopee = {
    numeroPedido: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.numeroPedido),
    sku: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.sku),
    produtoNome: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.produtoNome),
    variacao: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.variacao),
    quantidade: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.quantidade),
    clienteNome: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.clienteNome),
    pedidoEspecial: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.pedidoEspecial),
    statusEnvio: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.statusEnvio),
    codigoRastreio: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.codigoRastreio),
    productInfo: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.productInfo),
    sellerNote: detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.sellerNote),
  }

  const isPackingList = Boolean(mapeamento.productInfo)

  return {
    colunasDetectadas: cabecalhos,
    mapeamento,
    confianca: {
      numeroPedido: Boolean(mapeamento.numeroPedido),
      sku: Boolean(mapeamento.sku || isPackingList),
      produtoNome: Boolean(mapeamento.produtoNome || isPackingList),
      quantidade: Boolean(mapeamento.quantidade || isPackingList),
    },
  }
}

/**
 * Deduz a quantidade de peças por kit a partir do catálogo, SKU ou nome do produto / variação.
 * Casos reais mapeados:
 * - 'RMickeyMinnie-20' -> 20
 * - '31 Rosto' -> 31
 * - '40 Rosto' -> 40
 * - '20 Toalhas de Rosto e Mão Mickey Mouse Minnie Mouse' -> 20
 * - 'Kit 30 Toalhas Turma da Mônica' -> 30
 * - 'Pacote com 50 unidades' -> 50
 * - 'Combo 10 un' -> 10
 */
export function deduzirQuantidadeKit(
  sku: string,
  produtoNome: string,
  produtoCatalogo?: PrecProdutoRecord | null,
  variacao?: string,
): { quantidade: number; origem: 'catalogo' | 'sku' | 'produto_nome' | null } {
  // 1. Prioridade máxima: Produto reconhecido no catálogo com qtd_por_kit > 0
  if (
    produtoCatalogo &&
    typeof produtoCatalogo.qtd_por_kit === 'number' &&
    produtoCatalogo.qtd_por_kit > 0
  ) {
    return {
      quantidade: Math.round(produtoCatalogo.qtd_por_kit),
      origem: 'catalogo',
    }
  }

  // 2. Extração pelo SKU:
  // Padrões como: RMickeyMinnie-20, KIT-MONICA-30, SKU-40, RMickey-20, BLeve-20, KIT30, KIT_50
  const skuLimpo = (sku || '').trim()
  if (skuLimpo) {
    // 2a. Sufixo com hífen ou underscore: -20, _40, -10
    const matchSufixo = skuLimpo.match(/[-_](\d{1,4})$/i)
    if (matchSufixo && matchSufixo[1]) {
      const q = parseInt(matchSufixo[1], 10)
      if (q > 0) return { quantidade: q, origem: 'sku' }
    }

    // 2b. 'KIT' ou 'K' seguido diretamente de dígitos: KIT30, KIT-30, K20
    const matchKit = skuLimpo.match(/\bKIT[-_]?(\d{1,4})\b/i)
    if (matchKit && matchKit[1]) {
      const q = parseInt(matchKit[1], 10)
      if (q > 0) return { quantidade: q, origem: 'sku' }
    }

    // 2c. Número isolado dentro do SKU cercado por letras ou delimitadores
    // Ex: RMickeyMinnie20, Rosto20, etc. (se for >= 2 dígitos e <= 3 dígitos)
    const matchNumSku = skuLimpo.match(/[a-zA-Z]([1-9]\d{1,2})$/)
    if (matchNumSku && matchNumSku[1]) {
      const q = parseInt(matchNumSku[1], 10)
      if (q > 0) return { quantidade: q, origem: 'sku' }
    }
  }

  // 3. Extração pelo Nome do Produto e Variação:
  // Casos:
  // - "20 Toalhas de Rosto e Mão..." -> 20
  // - "31 Rosto", "40 Rosto" -> 31, 40
  // - "Kit 30 Toalhas..." -> 30
  // - "Pacote 50 un" -> 50
  const textosParaVerificar = [produtoNome || '', variacao || '']

  for (const texto of textosParaVerificar) {
    const textoLimpo = texto.trim()
    if (!textoLimpo) continue

    // 3a. Início de string com número seguido de palavra indicativa de produto/kit
    // Ex: "20 Toalhas...", "31 Rosto", "40 Rosto", "10 Panos..."
    const matchInicio = textoLimpo.match(
      /^(\d{1,4})\s+(?:toalhas?|rosto|lavabo|banho|pecas?|pçs?|unidades?|itens|modelos?)\b/i,
    )
    if (matchInicio && matchInicio[1]) {
      const q = parseInt(matchInicio[1], 10)
      if (q > 0) return { quantidade: q, origem: 'produto_nome' }
    }

    // 3b. "Kit [de|com]? N ..." ou "Combo [de|com]? N ..." ou "Pacote [de|com]? N ..." ou "Jogo [de|com]? N ..."
    const matchKitNome = textoLimpo.match(
      /\b(?:kit|combo|pacote|jogo|conjunto)\s+(?:de\s+|com\s+)?(\d{1,4})\b/i,
    )
    if (matchKitNome && matchKitNome[1]) {
      const q = parseInt(matchKitNome[1], 10)
      if (q > 0) return { quantidade: q, origem: 'produto_nome' }
    }

    // 3c. Número seguido de "un", "und", "unidades", "peças", "pçs", "toalhas"
    // Ex: "40 un", "30 toalhas", "20 peças"
    const matchUnidades = textoLimpo.match(
      /\b(\d{1,4})\s*(?:un\b|und\b|unidades?\b|pecas?\b|pçs?\b|toalhas?\b)/i,
    )
    if (matchUnidades && matchUnidades[1]) {
      const q = parseInt(matchUnidades[1], 10)
      if (q > 0) return { quantidade: q, origem: 'produto_nome' }
    }

    // 3d. Padrão "N Rosto", "N Lavabo", "N Banho" em qualquer ponto da string
    const matchNRosto = textoLimpo.match(/\b(\d{1,4})\s*(?:rosto|lavabo|banho)\b/i)
    if (matchNRosto && matchNRosto[1]) {
      const q = parseInt(matchNRosto[1], 10)
      if (q > 0) return { quantidade: q, origem: 'produto_nome' }
    }
  }

  return { quantidade: 0, origem: null }
}

export interface ItemProductInfoDesmontado {
  index?: number
  productName: string
  variationName: string
  price: number
  quantity: number
  sku: string
  parentSku: string
  rawBlock: string
}

/**
 * Desmonta e extrai itens da string empacotada product_info da Shopee:
 * Padrão: "[N] Product Name: ...; Variation Name: ...; Price: R$ ...; Quantity: N; SKU Reference No.: ...; Parent SKU Reference No.: ...;"
 * Suporta múltiplos itens [1], [2] em sequência.
 */
export function desmontarProductInfo(productInfoStr: string): ItemProductInfoDesmontado[] {
  const texto = (productInfoStr || '').trim()
  if (!texto) return []

  // Divide o texto pelos marcadores de bloco [1], [2], [3], etc.
  // Regex procura por `\[\d+\]` ou divide em blocos
  const blocos: string[] = []
  const blockRegex = /\[\d+\][\s\S]*?(?=(?:\[\d+\]|$))/g
  let match: RegExpExecArray | null

  while ((match = blockRegex.exec(texto)) !== null) {
    if (match[0].trim()) {
      blocos.push(match[0].trim())
    }
  }

  // Fallback caso a string não tenha o marcador [1], [2] explícito
  if (blocos.length === 0 && texto.includes('Product Name:')) {
    blocos.push(texto)
  }

  const itens: ItemProductInfoDesmontado[] = []

  for (const bloco of blocos) {
    // Extrai o índice do item se houver [1]
    const indexMatch = bloco.match(/^\[(\d+)\]/)
    const index = indexMatch ? parseInt(indexMatch[1], 10) : undefined

    // Helper para extrair campo por chave
    // Chaves padrão: Product Name, Variation Name, Price, Quantity, SKU Reference No., Parent SKU Reference No.
    const extrairCampo = (campo: string): string => {
      // Regex que busca "NomeDoCampo:\s*(.*?)(?:;\s*[A-Z][a-zA-Z\s#\.]+:|$|;)"
      // O padrão da Shopee usa ponto-e-vírgula ";" como separador
      const regex = new RegExp(`${campo}\\s*:\\s*([^;]+)(?:;|$)`, 'i')
      const m = bloco.match(regex)
      return m && m[1] ? m[1].trim() : ''
    }

    const productName = extrairCampo('Product Name')
    const variationName = extrairCampo('Variation Name')
    const rawPrice = extrairCampo('Price')
    const rawQty = extrairCampo('Quantity')
    const sku = extrairCampo('SKU Reference No\\.') || extrairCampo('SKU Reference No')
    const parentSku =
      extrairCampo('Parent SKU Reference No\\.') || extrairCampo('Parent SKU Reference No')

    // Converte Price: "R$ 29,90" ou "29.90" para float
    let price = 0
    if (rawPrice) {
      const numPriceStr = rawPrice.replace(/[^\d.,]/g, '').replace(',', '.')
      const p = parseFloat(numPriceStr)
      if (!isNaN(p)) price = p
    }

    // Converte Quantity
    const q = parseInt(rawQty, 10)
    const quantity = !isNaN(q) && q > 0 ? q : 1

    if (productName || sku || parentSku) {
      itens.push({
        index,
        productName,
        variationName,
        price,
        quantity,
        sku,
        parentSku,
        rawBlock: bloco,
      })
    }
  }

  return itens
}

/**
 * Casa o SKU (ou parentSku/produtoNome) com kit_temas e kit_modelos existentes.
 * Retorna o temaId encontrado e flag de matching.
 * Se não houver match, tenta retornar o tema 'A Vincular' (ou primeiro tema com match=false).
 */
export function casarSkuComTemaEModelo(
  sku: string,
  produtoNome: string,
  temas: KitTema[],
  modelos: Array<{ id: string; codigo?: string; nome?: string; tema?: string }> = [],
): { temaId: string; temaMatched: boolean; modeloId?: string } {
  const skuNorm = normalizarTexto(sku)
  const skuLimpo = (sku || '').trim().toLowerCase()

  // 1. Tentar casar exatamente com o código ou nome de um modelo em kit_modelos
  if (skuLimpo && modelos.length > 0) {
    // 1a. Match por código do modelo (ex: M01, R18, S01, P01)
    const modPorCodigo = modelos.find((m) => {
      const c = (m.codigo || '').trim().toLowerCase()
      if (!c) return false
      return skuLimpo === c || skuLimpo.startsWith(`${c}-`) || skuLimpo.includes(c)
    })
    if (modPorCodigo && modPorCodigo.tema) {
      const temaExistente = temas.find((t) => t.id === modPorCodigo.tema)
      if (temaExistente) {
        return { temaId: temaExistente.id, temaMatched: true, modeloId: modPorCodigo.id }
      }
    }

    // 1b. Match por nome do modelo (ex: 'Mônica', 'Pikachu', 'Mickey Safari')
    const modPorNome = modelos.find((m) => {
      const n = normalizarTexto(m.nome || '')
      if (n.length < 3) return false
      return skuNorm.includes(n) || n.includes(skuNorm)
    })
    if (modPorNome && modPorNome.tema) {
      const temaExistente = temas.find((t) => t.id === modPorNome.tema)
      if (temaExistente) {
        return { temaId: temaExistente.id, temaMatched: true, modeloId: modPorNome.id }
      }
    }
  }

  // 2. Tentar casar com os nomes dos temas (excluindo o tema de fallback 'A Vincular')
  const temasReais = temas.filter((t) => normalizarTexto(t.nome) !== 'a vincular')
  const textoParaMatch = normalizarTexto(`${sku} ${produtoNome}`)

  for (const tema of temasReais) {
    const tNome = normalizarTexto(tema.nome)
    if (tNome.length >= 3 && textoParaMatch.includes(tNome)) {
      return { temaId: tema.id, temaMatched: true }
    }
    // Palavras-chave dos temas clássicos
    if (
      tNome.includes('monica') &&
      (textoParaMatch.includes('monica') ||
        textoParaMatch.includes('cebolinha') ||
        textoParaMatch.includes('cascao') ||
        textoParaMatch.includes('magali'))
    ) {
      return { temaId: tema.id, temaMatched: true }
    }
    if (
      tNome.includes('mickey') &&
      (textoParaMatch.includes('mickey') ||
        textoParaMatch.includes('minnie') ||
        textoParaMatch.includes('disney'))
    ) {
      return { temaId: tema.id, temaMatched: true }
    }
    if (tNome.includes('sonic') && textoParaMatch.includes('sonic')) {
      return { temaId: tema.id, temaMatched: true }
    }
    if (
      tNome.includes('pokemon') &&
      (textoParaMatch.includes('pokemon') || textoParaMatch.includes('pikachu'))
    ) {
      return { temaId: tema.id, temaMatched: true }
    }
  }

  // 3. SEM MATCH: vincular ao tema 'A Vincular'
  const temaAVincular = temas.find((t) => normalizarTexto(t.nome) === 'a vincular')
  if (temaAVincular) {
    return { temaId: temaAVincular.id, temaMatched: false }
  }

  // Fallback se 'A Vincular' não existir no banco por qualquer motivo
  const ativo = temas.find((t) => t.ativo)
  return { temaId: ativo?.id || temas[0]?.id || '', temaMatched: false }
}

/**
 * Transforma uma linha de dados (objeto ou array) em um ItemLinhaImportada com as regras de kit.
 * Suporta o formato empacotado `product_info` da Lista de Empacotamento Shopee e o formato clássico.
 */
export function processarLinhaMapeada(
  linhaData: Record<string, any>,
  mapeamento: MapeamentoColunasShopee,
  catalogoProdutos: PrecProdutoRecord[],
  temas: KitTema[],
  indexOuOrigem: string | number,
  modelos: Array<{ id: string; codigo?: string; nome?: string; tema?: string }> = [],
): ItemLinhaImportada | null {
  const getVal = (col?: string): string => {
    if (!col) return ''
    const val = linhaData[col]
    if (val === undefined || val === null) return ''
    return String(val).trim()
  }

  let numeroPedido = getVal(mapeamento.numeroPedido)
  let sku = getVal(mapeamento.sku)
  let produtoNome = getVal(mapeamento.produtoNome)
  let variacao = getVal(mapeamento.variacao)
  const clienteNome = getVal(mapeamento.clienteNome)
  let pedidoEspecial = getVal(mapeamento.pedidoEspecial)
  const statusEnvio = getVal(mapeamento.statusEnvio)
  const codigoRastreio = getVal(mapeamento.codigoRastreio)
  const productInfo = getVal(mapeamento.productInfo)
  const sellerNote = getVal(mapeamento.sellerNote)

  // Combina remark_from_buyer e seller_note para observações gerais
  const observacoesLista: string[] = []
  if (pedidoEspecial) observacoesLista.push(`Observação do comprador: ${pedidoEspecial}`)
  if (sellerNote) observacoesLista.push(`Nota do vendedor: ${sellerNote}`)
  const observacoesCombinadas = observacoesLista.join(' | ')

  let quantidadeLinhaValida = 1
  let precoUnitario: number | undefined = undefined
  let itensEmpacotados: ItemLinhaImportada['itensEmpacotados'] = undefined
  let problemaLinha: string | undefined = undefined

  // SE FOR O FORMATO PRODUCT_INFO (Lista de Empacotamento - Entrega Padrão da Shopee)
  if (productInfo) {
    const desmontados = desmontarProductInfo(productInfo)
    if (desmontados.length === 0) {
      problemaLinha = 'product_info ilegível ou vazio'
      produtoNome = produtoNome || 'Item Shopee (product_info ilegível)'
    } else {
      // Extrai os dados dos blocos
      itensEmpacotados = desmontados.map((d) => ({
        nome: d.productName,
        variacao: d.variationName,
        precoUnitario: d.price,
        quantidade: d.quantity,
        sku: d.sku,
        parentSku: d.parentSku,
      }))

      // Quantidade total soma as quantidades de todos os blocos do pedido
      quantidadeLinhaValida = desmontados.reduce((acc, d) => acc + (d.quantity || 1), 0)

      // Primeiro bloco define o nome, sku e preço do pedido principal
      const primeiro = desmontados[0]
      if (!produtoNome) {
        if (desmontados.length === 1) {
          produtoNome = primeiro.productName || 'Item Shopee'
        } else {
          produtoNome = `${primeiro.productName} (+ ${desmontados.length - 1} item/itens)`
        }
      }
      if (!sku) {
        sku = primeiro.sku || primeiro.parentSku || ''
      }
      if (!variacao && primeiro.variationName) {
        variacao = primeiro.variationName
      }
      if (primeiro.price > 0) {
        precoUnitario = primeiro.price
      }
    }
  } else {
    const rawQtd = getVal(mapeamento.quantidade)
    const quantidadePlanilha = parseInt(rawQtd, 10)
    quantidadeLinhaValida =
      !isNaN(quantidadePlanilha) && quantidadePlanilha > 0 ? quantidadePlanilha : 1
  }

  // Se a linha estiver totalmente em branco, ignora
  if (
    !numeroPedido &&
    !sku &&
    !produtoNome &&
    !clienteNome &&
    !codigoRastreio &&
    !productInfo &&
    !sellerNote
  ) {
    return null
  }

  // Se o número de pedido não estiver preenchido mas houver outros dados, gera provisório
  if (!numeroPedido) {
    numeroPedido = `SHP-${Math.floor(10000000 + Math.random() * 90000000)}`
  }

  if (!produtoNome) {
    produtoNome = sku ? `Produto ${sku}` : 'Item Shopee'
  }

  // Procura no texto da variação, observação ou nome se há indicação de pedido especial / escolha no chat
  const indicativoChatRegex =
    /(?:chat|especial|escolha|cliente pediu|solicitou|personalizado|modelos?|cores?|estampas?|sortid[oa])/i

  if (!pedidoEspecial) {
    if (indicativoChatRegex.test(variacao)) {
      pedidoEspecial = `Variação do cliente: ${variacao}`
    } else if (
      indicativoChatRegex.test(produtoNome) &&
      /chat|especial|personalizado/i.test(produtoNome)
    ) {
      pedidoEspecial = `Observação do anúncio: ${produtoNome}`
    }
  }

  const temPedidoEspecial = Boolean(pedidoEspecial && pedidoEspecial.trim().length > 0)
  const triagemPedidoEspecial: TriagemPedidoEspecial = temPedidoEspecial
    ? 'pendente_analise'
    : 'sem_pedido_especial'

  // Matching contra prec_produtos
  const produtoEncontrado = encontrarProdutoCatalogo(sku, produtoNome, catalogoProdutos)
  const reconhecido = Boolean(produtoEncontrado)

  // DEDUÇÃO INTELIGENTE DE QUANTIDADE DO KIT
  // O export da Shopee costuma registrar "Deal Quantity = 1" (1 kit comprado),
  // mesmo quando o kit tem 20, 30, 40 ou 50 peças.
  const deducao = deduzirQuantidadeKit(sku, produtoNome, produtoEncontrado, variacao)
  let quantidadeFinal = quantidadeLinhaValida
  let quantidadeDeduzidaPorKit: number | undefined = undefined
  let origemDeducao: 'catalogo' | 'sku' | 'produto_nome' | 'planilha' = 'planilha'

  if (deducao.quantidade > 1) {
    quantidadeDeduzidaPorKit = deducao.quantidade
    origemDeducao = deducao.origem || 'planilha'
    // Se a planilha trouxe 1 kit (ou multiplos kits N), multiplicamos pela qtd de peças do kit
    quantidadeFinal = quantidadeLinhaValida * deducao.quantidade
  } else if (quantidadeLinhaValida > 1) {
    quantidadeFinal = quantidadeLinhaValida
    origemDeducao = 'planilha'
  }

  const isKitOuCombo = produtoEncontrado
    ? produtoEncontrado.tipo === 'kit' || produtoEncontrado.tipo === 'combo'
    : /kit|combo|conjunto|pacote|jogo/i.test(produtoNome) || quantidadeFinal > 1

  // Inferência / Casamento de tema e modelo com suporte a 'A Vincular'
  const matchResultado = casarSkuComTemaEModelo(
    produtoEncontrado?.sku || sku,
    produtoEncontrado?.nome || produtoNome,
    temas,
    modelos,
  )
  const temaId = matchResultado.temaId
  const temaMatched = matchResultado.temaMatched

  const linhaOriginal =
    typeof indexOuOrigem === 'string'
      ? indexOuOrigem
      : `Linha ${indexOuOrigem + 1}: ${numeroPedido} | ${sku} | ${produtoNome} | ${quantidadeFinal} un`

  return {
    linhaOriginal,
    numeroPedido: numeroPedido.trim(),
    shopeeOrderId: numeroPedido.trim(),
    sku: (produtoEncontrado?.sku || sku).trim(),
    produtoNome: (produtoEncontrado?.nome || produtoNome).trim(),
    quantidade: quantidadeFinal > 0 ? quantidadeFinal : 1,
    quantidadePlanilhaOriginal: quantidadeLinhaValida,
    quantidadeDeduzidaPorKit,
    origemDeducaoQuantidade: origemDeducao,
    codigoRastreio: codigoRastreio ? codigoRastreio.trim() : undefined,
    precoUnitario,
    variacao: variacao.trim(),
    clienteNome: clienteNome.trim(),
    pedidoEspecial: pedidoEspecial.trim(),
    temPedidoEspecial,
    triagemPedidoEspecial,
    produtoEncontrado,
    temaId,
    temaMatched,
    reconhecido,
    isKitOuCombo,
    itensEmpacotados,
    problema: problemaLinha,
    statusEnvio: statusEnvio || undefined,
    observacaoComprador: observacoesCombinadas || pedidoEspecial || undefined,
    notaVendedor: sellerNote || undefined,
    motivoNaoReconhecido: reconhecido
      ? undefined
      : 'SKU e nome não constam no catálogo unificado prec_produtos (entrará como genérico).',
  }
}

/**
 * Lê uma planilha .xlsx / .xls / .csv em formato ArrayBuffer ou Uint8Array e converte
 * em itens de expedição com mapeamento automático de colunas.
 * Suporta override manual de mapeamento.
 */
export function parseShopeePlanilha(
  dadosBinarios: ArrayBuffer | Uint8Array,
  catalogoProdutos: PrecProdutoRecord[],
  temas: KitTema[],
  opcoes?: {
    nomeArquivo?: string
    mapeamentoCustomizado?: MapeamentoColunasShopee
    modelos?: Array<{ id: string; codigo?: string; nome?: string; tema?: string }>
  },
): ResultadoParseShopee {
  const workbook = XLSX.read(dadosBinarios, { type: 'array' })

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('A planilha fornecida está vazia ou não contém abas válidas.')
  }

  // Procura por aba com nome 'orders' (case-insensitive) ou usa a primeira
  const abaOrders = workbook.SheetNames.find((n) => n.trim().toLowerCase() === 'orders')
  const abaNomeParaUsar = abaOrders || workbook.SheetNames[0]
  const worksheet = workbook.Sheets[abaNomeParaUsar]

  // Converte para matriz de objetos (onde as chaves são os nomes das colunas da 1ª linha com dados)
  // Alguns exports trazem linhas introdutórias ou títulos: localizamos a linha que contém o cabeçalho
  const linhasMatriz: any[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
    blankrows: false,
  })

  if (!linhasMatriz || linhasMatriz.length === 0) {
    throw new Error('Nenhum dado encontrado na planilha selecionada.')
  }

  // Procura o índice da linha de cabeçalho
  let headerRowIndex = 0
  for (let i = 0; i < Math.min(linhasMatriz.length, 10); i++) {
    const row = linhasMatriz[i]
    if (Array.isArray(row)) {
      const rowTexto = row.map((cell) => normalizarTexto(String(cell || ''))).join(' ')
      if (
        rowTexto.includes('pedido') ||
        rowTexto.includes('order') ||
        rowTexto.includes('sku') ||
        rowTexto.includes('produto')
      ) {
        headerRowIndex = i
        break
      }
    }
  }

  const cabecalhosOriginais = (linhasMatriz[headerRowIndex] || []).map((c) =>
    String(c || '').trim(),
  )
  const detalheMap = inferirMapeamentoColunas(cabecalhosOriginais)

  // Aplica override se o usuário revisou manualmente
  const mapeamentoFinal: MapeamentoColunasShopee = {
    ...detalheMap.mapeamento,
    ...(opcoes?.mapeamentoCustomizado || {}),
  }

  detalheMap.mapeamento = mapeamentoFinal
  detalheMap.confianca = {
    numeroPedido: Boolean(mapeamentoFinal.numeroPedido),
    sku: Boolean(mapeamentoFinal.sku),
    produtoNome: Boolean(mapeamentoFinal.produtoNome),
    quantidade: Boolean(mapeamentoFinal.quantidade),
  }

  const itens: ItemLinhaImportada[] = []

  for (let r = headerRowIndex + 1; r < linhasMatriz.length; r++) {
    const rowArray = linhasMatriz[r]
    if (!rowArray || rowArray.length === 0) continue

    // Monta o objeto linhaData indexado pelos nomes das colunas
    const linhaData: Record<string, any> = {}
    cabecalhosOriginais.forEach((colNome, colIdx) => {
      if (colNome) {
        linhaData[colNome] = rowArray[colIdx]
      }
    })

    const itemProcessado = processarLinhaMapeada(
      linhaData,
      mapeamentoFinal,
      catalogoProdutos,
      temas,
      r,
      opcoes?.modelos,
    )

    if (itemProcessado) {
      itens.push(itemProcessado)
    }
  }

  const reconhecidosCount = itens.filter((i) => i.reconhecido).length
  const genericosCount = itens.length - reconhecidosCount
  const pedidosEspeciaisCount = itens.filter((i) => i.temPedidoEspecial).length
  const problemasCount = itens.filter((i) => Boolean(i.problema)).length
  const formatoDetectado = mapeamentoFinal.productInfo
    ? 'lista_empacotamento_product_info'
    : 'padrao_colunas'

  return {
    itens,
    totalLinhas: itens.length,
    reconhecidosCount,
    genericosCount,
    pedidosEspeciaisCount,
    problemasCount,
    origem: 'planilha_xlsx',
    formatoDetectado,
    detalheMapeamento: detalheMap,
    nomeArquivo: opcoes?.nomeArquivo,
  }
}

/**
 * Analisa e extrai dados de texto colado da Shopee (CSV, TSV, tabela copiada ou texto com delimitadores).
 * Mantido e melhorado para suportar cabeçalhos dinâmicos idênticos aos da planilha.
 */
export function parseShopeeColagem(
  texto: string,
  catalogoProdutos: PrecProdutoRecord[],
  temas: KitTema[],
  modelos: Array<{ id: string; codigo?: string; nome?: string; tema?: string }> = [],
): ResultadoParseShopee {
  const linhas = (texto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)

  if (linhas.length === 0) {
    return {
      itens: [],
      totalLinhas: 0,
      reconhecidosCount: 0,
      genericosCount: 0,
      pedidosEspeciaisCount: 0,
      problemasCount: 0,
      origem: 'colagem',
    }
  }

  // Verifica se a primeira linha é um cabeçalho reconhecível
  const primeiraLinha = linhas[0]
  let separador: string | null = null
  if (primeiraLinha.includes('\t')) separador = '\t'
  else if (primeiraLinha.includes(';')) separador = ';'
  else if (primeiraLinha.includes('|')) separador = '|'
  else if (primeiraLinha.includes(',')) separador = ','

  let startIndex = 0
  let mapeamentoCustom: DetalheMapeamentoColunas | undefined = undefined

  if (separador) {
    const possiveisCabecalhos = primeiraLinha.split(separador).map((c) => c.trim())
    const det = inferirMapeamentoColunas(possiveisCabecalhos)
    // Se encontrou ao menos 2 colunas-chave (ex: numeroPedido ou produtoNome ou sku)
    if (det.mapeamento.numeroPedido || det.mapeamento.produtoNome || det.mapeamento.sku) {
      startIndex = 1
      mapeamentoCustom = det
    }
  }

  const itens: ItemLinhaImportada[] = []

  for (let i = startIndex; i < linhas.length; i++) {
    const linha = linhas[i]

    // Se temos mapeamento baseado no cabeçalho detectado na linha 0
    if (separador && mapeamentoCustom && mapeamentoCustom.colunasDetectadas.length > 0) {
      const valores = linha.split(separador).map((c) => c.trim())
      const linhaData: Record<string, any> = {}
      mapeamentoCustom.colunasDetectadas.forEach((col, idx) => {
        linhaData[col] = valores[idx] || ''
      })

      const processado = processarLinhaMapeada(
        linhaData,
        mapeamentoCustom.mapeamento,
        catalogoProdutos,
        temas,
        i,
        modelos,
      )
      if (processado) {
        itens.push(processado)
        continue
      }
    }

    // Fallback: modo posicional livre clássico
    let colunas: string[] = []
    if (linha.includes('\t')) {
      colunas = linha.split('\t').map((c) => c.trim())
    } else if (linha.includes(';')) {
      colunas = linha.split(';').map((c) => c.trim())
    } else if (linha.includes('|')) {
      colunas = linha.split('|').map((c) => c.trim())
    } else if (linha.includes(',')) {
      colunas = linha.split(',').map((c) => c.trim())
    } else {
      colunas = [linha]
    }

    let numeroPedido = ''
    let sku = ''
    let produtoNome = ''
    let quantidadeLinha = 1
    let variacao = ''
    let clienteNome = ''
    let pedidoEspecial = ''
    let codigoRastreio = ''

    if (colunas.length >= 2) {
      numeroPedido = colunas[0] || ''
      if (!numeroPedido && colunas[1]) {
        numeroPedido = colunas[1]
      }

      if (colunas.length === 2) {
        produtoNome = colunas[1]
      } else if (colunas.length === 3) {
        const numQtd = parseInt(colunas[2], 10)
        if (!isNaN(numQtd) && numQtd > 0) {
          produtoNome = colunas[1]
          quantidadeLinha = numQtd
        } else {
          sku = colunas[1]
          produtoNome = colunas[2]
        }
      } else if (colunas.length === 4) {
        sku = colunas[1]
        produtoNome = colunas[2]
        quantidadeLinha = parseInt(colunas[3], 10) || 1
      } else if (colunas.length === 5) {
        sku = colunas[1]
        produtoNome = colunas[2]
        variacao = colunas[3]
        quantidadeLinha = parseInt(colunas[4], 10) || 1
      } else {
        numeroPedido = colunas[0]
        sku = colunas[1]
        produtoNome = colunas[2]
        variacao = colunas[3]
        quantidadeLinha = parseInt(colunas[4], 10) || 1
        clienteNome = colunas[5] || ''
        pedidoEspecial = colunas[6] || ''
        if (colunas[7]) {
          codigoRastreio = colunas[7]
        }
      }
    } else {
      const textoLinha = colunas[0]
      const idMatch = textoLinha.match(/\b([A-Z0-9]{12,20}|[0-9]{8,15})\b/i)
      if (idMatch) {
        numeroPedido = idMatch[1]
      }
      const qtdMatch = textoLinha.match(
        /(?:qtd|quantidade|quant|x|\b)\s*[:=]?\s*(\d{1,4})\s*(?:un|und|unidades|pecas|pçs|\b)/i,
      )
      if (qtdMatch && qtdMatch[1]) {
        quantidadeLinha = parseInt(qtdMatch[1], 10) || 1
      }
      let limpo = textoLinha
      if (numeroPedido) limpo = limpo.replace(numeroPedido, '')
      produtoNome = limpo.replace(/[;|\t,]+/g, ' ').trim()
    }

    if (!numeroPedido) {
      numeroPedido = `SHP-${Math.floor(10000000 + Math.random() * 90000000)}`
    }
    if (!produtoNome) {
      produtoNome = sku ? `Produto ${sku}` : 'Item Shopee'
    }

    const indicativoChatRegex =
      /(?:chat|especial|escolha|cliente pediu|solicitou|personalizado|modelos?|cores?|estampas?)/i
    if (
      !pedidoEspecial &&
      (indicativoChatRegex.test(variacao) || indicativoChatRegex.test(produtoNome))
    ) {
      pedidoEspecial = variacao ? `Variação do cliente: ${variacao}` : ''
    }

    const temPedidoEspecial = Boolean(pedidoEspecial && pedidoEspecial.trim().length > 0)
    const triagemPedidoEspecial: TriagemPedidoEspecial = temPedidoEspecial
      ? 'pendente_analise'
      : 'sem_pedido_especial'

    const produtoEncontrado = encontrarProdutoCatalogo(sku, produtoNome, catalogoProdutos)
    const reconhecido = Boolean(produtoEncontrado)

    const deducao = deduzirQuantidadeKit(sku, produtoNome, produtoEncontrado, variacao)
    let quantidadeFinal = quantidadeLinha
    let quantidadeDeduzidaPorKit: number | undefined = undefined
    let origemDeducao: 'catalogo' | 'sku' | 'produto_nome' | 'planilha' = 'planilha'

    if (deducao.quantidade > 1) {
      quantidadeDeduzidaPorKit = deducao.quantidade
      origemDeducao = deducao.origem || 'planilha'
      quantidadeFinal = quantidadeLinha * deducao.quantidade
    } else if (quantidadeLinha > 1) {
      quantidadeFinal = quantidadeLinha
      origemDeducao = 'planilha'
    }

    const isKitOuCombo = produtoEncontrado
      ? produtoEncontrado.tipo === 'kit' || produtoEncontrado.tipo === 'combo'
      : /kit|combo|conjunto|pacote|jogo/i.test(produtoNome) || quantidadeFinal > 1

    const matchResultado = casarSkuComTemaEModelo(
      produtoEncontrado?.sku || sku,
      produtoEncontrado?.nome || produtoNome,
      temas,
      modelos,
    )

    itens.push({
      linhaOriginal: linha,
      numeroPedido: numeroPedido.trim(),
      shopeeOrderId: numeroPedido.trim(),
      sku: (produtoEncontrado?.sku || sku).trim(),
      produtoNome: (produtoEncontrado?.nome || produtoNome).trim(),
      quantidade: quantidadeFinal > 0 ? quantidadeFinal : 1,
      quantidadePlanilhaOriginal: quantidadeLinha,
      quantidadeDeduzidaPorKit,
      origemDeducaoQuantidade: origemDeducao,
      codigoRastreio: codigoRastreio ? codigoRastreio.trim() : undefined,
      variacao: variacao.trim(),
      clienteNome: clienteNome.trim(),
      pedidoEspecial: pedidoEspecial.trim(),
      temPedidoEspecial,
      triagemPedidoEspecial,
      produtoEncontrado,
      temaId: matchResultado.temaId,
      temaMatched: matchResultado.temaMatched,
      reconhecido,
      isKitOuCombo,
      motivoNaoReconhecido: reconhecido
        ? undefined
        : 'SKU e nome não constam no catálogo unificado prec_produtos (entrará como genérico).',
    })
  }

  const reconhecidosCount = itens.filter((i) => i.reconhecido).length
  const genericosCount = itens.length - reconhecidosCount
  const pedidosEspeciaisCount = itens.filter((i) => i.temPedidoEspecial).length
  const problemasCount = itens.filter((i) => Boolean(i.problema)).length

  return {
    itens,
    totalLinhas: itens.length,
    reconhecidosCount,
    genericosCount,
    pedidosEspeciaisCount,
    problemasCount,
    origem: 'colagem',
    detalheMapeamento: mapeamentoCustom,
  }
}
