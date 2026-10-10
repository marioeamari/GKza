import type { PrecProdutoRecord } from '@/types/precificacao'
import type { KitTema, KitPedido, TriagemPedidoEspecial } from '@/types/separacaoKits'

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

  // Matching
  produtoEncontrado?: PrecProdutoRecord | null
  temaId?: string
  reconhecido: boolean
  isKitOuCombo: boolean
  motivoNaoReconhecido?: string
}

export interface ResultadoParseShopee {
  itens: ItemLinhaImportada[]
  totalLinhas: number
  reconhecidosCount: number
  genericosCount: number
  pedidosEspeciaisCount: number
}

/**
 * Normaliza strings para comparação flexível (remove acentos, espaços extras, minúsculas)
 */
export function normalizarTexto(str: string): string {
  return (str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
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

/**
 * Analisa e extrai dados de texto colado da Shopee (CSV, TSV, tabela copiada ou texto com delimitadores)
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

  const itens: ItemLinhaImportada[] = []

  for (const linha of linhas) {
    // Ignora cabeçalhos comuns da exportação do Seller Centre
    const linhaNorm = normalizarTexto(linha)
    if (
      linhaNorm.startsWith('id do pedido') ||
      linhaNorm.startsWith('numero do pedido') ||
      linhaNorm.startsWith('order id') ||
      linhaNorm.startsWith('pedido;') ||
      linhaNorm.startsWith('order_sn') ||
      linhaNorm.startsWith('id;')
    ) {
      continue
    }

    // Detecta separador: Tab (\t), Ponto e vírgula (;), Vírgula (,) ou Pipe (|)
    let colunas: string[] = []
    if (linha.includes('\t')) {
      colunas = linha.split('\t').map((c) => c.trim())
    } else if (linha.includes(';')) {
      colunas = linha.split(';').map((c) => c.trim())
    } else if (linha.includes('|')) {
      colunas = linha.split('|').map((c) => c.trim())
    } else if (linha.includes(',')) {
      // Vírgula simples (sem aspas compostas)
      colunas = linha.split(',').map((c) => c.trim())
    } else {
      // Linha única espaçada
      colunas = [linha]
    }

    let numeroPedido = ''
    let sku = ''
    let produtoNome = ''
    let quantidade = 1
    let variacao = ''
    let clienteNome = ''
    let pedidoEspecial = ''

    // Se temos colunas separadas
    if (colunas.length >= 2) {
      // Coluna 0 geralmente é ID do pedido ou número
      numeroPedido = colunas[0] || ''

      // Se a coluna 0 não parecer um ID e a 1 for, inverte
      if (!numeroPedido && colunas[1]) {
        numeroPedido = colunas[1]
      }

      if (colunas.length === 2) {
        // Ex: ID | Nome do produto ou SKU
        produtoNome = colunas[1]
      } else if (colunas.length === 3) {
        // Ex: ID | SKU/Nome | Quantidade
        const numQtd = parseInt(colunas[2], 10)
        if (!isNaN(numQtd) && numQtd > 0) {
          produtoNome = colunas[1]
          quantidade = numQtd
        } else {
          sku = colunas[1]
          produtoNome = colunas[2]
        }
      } else if (colunas.length === 4) {
        // Ex: ID | SKU | Nome | Qtd
        sku = colunas[1]
        produtoNome = colunas[2]
        quantidade = parseInt(colunas[3], 10) || 1
      } else if (colunas.length === 5) {
        // Ex: ID | SKU | Nome | Variação | Qtd  OU  ID | Nome | Variação | Qtd | PedidoEspecial
        sku = colunas[1]
        produtoNome = colunas[2]
        variacao = colunas[3]
        quantidade = parseInt(colunas[4], 10) || 1
      } else {
        // 6 ou mais colunas: ID | SKU | Nome | Variação | Qtd | Cliente | PedidoEspecial/Obs
        numeroPedido = colunas[0]
        sku = colunas[1]
        produtoNome = colunas[2]
        variacao = colunas[3]
        quantidade = parseInt(colunas[4], 10) || 1
        clienteNome = colunas[5] || ''
        pedidoEspecial = colunas[6] || colunas.slice(6).join(' ') || ''
      }
    } else {
      // Formato livre numa única linha: tenta extrair ID, SKU e Qtd por regex
      const textoLinha = colunas[0]

      // Detecta ID do pedido tipo Shopee (ex: 240101ABCD1234, BR24000123456, ou números grandes)
      const idMatch = textoLinha.match(/\b([A-Z0-9]{12,20}|[0-9]{8,15})\b/i)
      if (idMatch) {
        numeroPedido = idMatch[1]
      }

      // Detecta quantidade (ex: "30x", "30 un", "qtd: 30", ou número isolado)
      const qtdMatch = textoLinha.match(
        /(?:qtd|quantidade|quant|x|\b)\s*[:=]?\s*(\d{1,4})\s*(?:un|und|unidades|pecas|pçs|\b)/i,
      )
      if (qtdMatch && qtdMatch[1]) {
        quantidade = parseInt(qtdMatch[1], 10) || 1
      }

      // Resto da linha como nome/produto
      let limpo = textoLinha
      if (numeroPedido) limpo = limpo.replace(numeroPedido, '')
      produtoNome = limpo.replace(/[;|\t,]+/g, ' ').trim()
    }

    // Se número do pedido ainda estiver vazio, gera um provisório rastreável
    if (!numeroPedido) {
      numeroPedido = `SHP-${Math.floor(10000000 + Math.random() * 90000000)}`
    }

    if (!produtoNome) {
      produtoNome = sku ? `Produto ${sku}` : 'Item Shopee'
    }

    // Procura no texto da variação ou da linha se há indicação de pedido especial / escolha no chat
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
  }
}
