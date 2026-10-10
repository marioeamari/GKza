import * as XLSX from 'xlsx'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { KitTema, TriagemPedidoEspecial } from '@/types/separacaoKits'

export interface ItemLinhaImportada {
  linhaOriginal: string
  numeroPedido: string
  sku: string
  produtoNome: string
  quantidade: number
  variacao?: string
  clienteNome?: string
  pedidoEspecial?: string
  temPedidoEspecial: boolean
  triagemPedidoEspecial: TriagemPedidoEspecial

  // Matching de produto e kit
  produtoEncontrado?: PrecProdutoRecord | null
  temaId?: string
  reconhecido: boolean
  isKitOuCombo: boolean
  motivoNaoReconhecido?: string

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
  origem: 'colagem' | 'planilha_xlsx'
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
    'id do pedido',
    'id de pedido',
    'no do pedido',
    'n do pedido',
    'numero do pedido',
    'pedido',
    'order id',
    'order sn',
    'ordersn',
    'order no',
    'order number',
    'id',
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
  }

  return {
    colunasDetectadas: cabecalhos,
    mapeamento,
    confianca: {
      numeroPedido: Boolean(mapeamento.numeroPedido),
      sku: Boolean(mapeamento.sku),
      produtoNome: Boolean(mapeamento.produtoNome),
      quantidade: Boolean(mapeamento.quantidade),
    },
  }
}

/**
 * Transforma uma linha de dados (objeto ou array) em um ItemLinhaImportada com as regras de kit
 */
export function processarLinhaMapeada(
  linhaData: Record<string, any>,
  mapeamento: MapeamentoColunasShopee,
  catalogoProdutos: PrecProdutoRecord[],
  temas: KitTema[],
  indexOuOrigem: string | number,
): ItemLinhaImportada | null {
  const getVal = (col?: string): string => {
    if (!col) return ''
    const val = linhaData[col]
    if (val === undefined || val === null) return ''
    return String(val).trim()
  }

  let numeroPedido = getVal(mapeamento.numeroPedido)
  const sku = getVal(mapeamento.sku)
  let produtoNome = getVal(mapeamento.produtoNome)
  const variacao = getVal(mapeamento.variacao)
  const clienteNome = getVal(mapeamento.clienteNome)
  let pedidoEspecial = getVal(mapeamento.pedidoEspecial)
  const statusEnvio = getVal(mapeamento.statusEnvio)

  const rawQtd = getVal(mapeamento.quantidade)
  let quantidade = parseInt(rawQtd, 10)
  if (isNaN(quantidade) || quantidade <= 0) {
    quantidade = 1
  }

  // Se a linha estiver totalmente em branco, ignora
  if (!numeroPedido && !sku && !produtoNome && !clienteNome) {
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
  const isKitOuCombo = produtoEncontrado
    ? produtoEncontrado.tipo === 'kit' || produtoEncontrado.tipo === 'combo'
    : /kit|combo|conjunto|pacote|jogo/i.test(produtoNome) || quantidade > 1

  // Inferência de tema de kit
  const temaId = inferirTemaKit(
    produtoEncontrado?.nome || produtoNome,
    produtoEncontrado?.sku || sku,
    temas,
  )

  const linhaOriginal =
    typeof indexOuOrigem === 'string'
      ? indexOuOrigem
      : `Linha ${indexOuOrigem + 1}: ${numeroPedido} | ${sku} | ${produtoNome} | ${quantidade} un`

  return {
    linhaOriginal,
    numeroPedido: numeroPedido.trim(),
    sku: (produtoEncontrado?.sku || sku).trim(),
    produtoNome: (produtoEncontrado?.nome || produtoNome).trim(),
    quantidade: quantidade > 0 ? quantidade : 1,
    variacao: variacao.trim(),
    clienteNome: clienteNome.trim(),
    pedidoEspecial: pedidoEspecial.trim(),
    temPedidoEspecial,
    triagemPedidoEspecial,
    produtoEncontrado,
    temaId,
    reconhecido,
    isKitOuCombo,
    statusEnvio: statusEnvio || undefined,
    observacaoComprador: pedidoEspecial || undefined,
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
  },
): ResultadoParseShopee {
  const workbook = XLSX.read(dadosBinarios, { type: 'array' })

  if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
    throw new Error('A planilha fornecida está vazia ou não contém abas válidas.')
  }

  // Usa a primeira aba (padrão de export do Seller Centre da Shopee: "orders" ou nome padrão)
  const primeiraAbaNome = workbook.SheetNames[0]
  const worksheet = workbook.Sheets[primeiraAbaNome]

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
    )

    if (itemProcessado) {
      itens.push(itemProcessado)
    }
  }

  const reconhecidosCount = itens.filter((i) => i.reconhecido).length
  const genericosCount = itens.length - reconhecidosCount
  const pedidosEspeciaisCount = itens.filter((i) => i.temPedidoEspecial).length

  return {
    itens,
    totalLinhas: itens.length,
    reconhecidosCount,
    genericosCount,
    pedidosEspeciaisCount,
    origem: 'planilha_xlsx',
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
    let quantidade = 1
    let variacao = ''
    let clienteNome = ''
    let pedidoEspecial = ''

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
          quantidade = numQtd
        } else {
          sku = colunas[1]
          produtoNome = colunas[2]
        }
      } else if (colunas.length === 4) {
        sku = colunas[1]
        produtoNome = colunas[2]
        quantidade = parseInt(colunas[3], 10) || 1
      } else if (colunas.length === 5) {
        sku = colunas[1]
        produtoNome = colunas[2]
        variacao = colunas[3]
        quantidade = parseInt(colunas[4], 10) || 1
      } else {
        numeroPedido = colunas[0]
        sku = colunas[1]
        produtoNome = colunas[2]
        variacao = colunas[3]
        quantidade = parseInt(colunas[4], 10) || 1
        clienteNome = colunas[5] || ''
        pedidoEspecial = colunas[6] || colunas.slice(6).join(' ') || ''
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
        quantidade = parseInt(qtdMatch[1], 10) || 1
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
    const isKitOuCombo = produtoEncontrado
      ? produtoEncontrado.tipo === 'kit' || produtoEncontrado.tipo === 'combo'
      : /kit|combo|conjunto|pacote|jogo/i.test(produtoNome) || quantidade > 1

    const temaId = inferirTemaKit(
      produtoEncontrado?.nome || produtoNome,
      produtoEncontrado?.sku || sku,
      temas,
    )

    itens.push({
      linhaOriginal: linha,
      numeroPedido: numeroPedido.trim(),
      sku: (produtoEncontrado?.sku || sku).trim(),
      produtoNome: (produtoEncontrado?.nome || produtoNome).trim(),
      quantidade: quantidade > 0 ? quantidade : 1,
      variacao: variacao.trim(),
      clienteNome: clienteNome.trim(),
      pedidoEspecial: pedidoEspecial.trim(),
      temPedidoEspecial,
      triagemPedidoEspecial,
      produtoEncontrado,
      temaId,
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

  return {
    itens,
    totalLinhas: itens.length,
    reconhecidosCount,
    genericosCount,
    pedidosEspeciaisCount,
    origem: 'colagem',
    detalheMapeamento: mapeamentoCustom,
  }
}
