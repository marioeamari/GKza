import { resolvePocketBaseBaseUrl } from './pocketbaseBaseUrl'
import type { TriagemProdutoInput } from './triagemModelo'

/** Campos do produto exigidos por urlImagemProdutoTriagem (entrada enxuta). */
export type TriagemImagemInput = Pick<
  TriagemProdutoInput,
  | 'id'
  | 'imagem'
  | 'origem_id'
  | 'tipo'
  | 'imagem_produtos'
  | 'fornecedor_produto_id'
  | 'fornecedor_produto_imagem'
> &
  Pick<TriagemProdutoInput, 'nome' | 'sku' | 'created'>

/**
 * Regra gravada (protocolo acordado, v0.0.314): o arquivo FÍSICO da foto vive no
 * registro onde o upload aconteceu; o espelho prec_produtos só carrega o nome.
 * A coleção dona do arquivo varia por tipo:
 *   1. kit/combo → o upload acontece no PRÓPRIO espelho prec_produtos
 *      (KitDialog/ComboDialog mandam FormData com o arquivo) — serve de lá.
 *   2. espelho legado (sem origem_id) → também tem arquivo próprio em
 *      prec_produtos — serve de lá.
 *   3. espelho com origem_id (espelho de Produto Composto) → o arquivo pode
 *      estar em `produtos` (upload do ProdutoCompostoDialog, nome REAL chega
 *      em `imagem_produtos`) ou, na maioria dos atuais, no catálogo de
 *      fornecedor `fornecedores_produtos` (relação fornecedor_produto; o nome
 *      REAL chega em `fornecedor_produto_imagem` — o nome no espelho é
 *      fabricado e NÃO bate com o filename real, por isso nunca o usamos aqui).
 * Campos imagem_produtos / fornecedor_produto_id / fornecedor_produto_imagem
 * são injetados por services/triagem.ts (somente leitura).
 *
 * O nome REAL do arquivo chega em fornecedor_produto_imagem (injetado por
 * services/triagem.ts via expand 'fornecedor_produto'), então a URL sai
 * completa — sem parâmetro fallback= (não há handler onError nos <img>).
 */
export function urlImagemProdutoTriagem(produto: TriagemImagemInput): string | undefined {
  if (!produto) return undefined
  // Resolvido aqui (não no import) para os testes poderem stubar a env.
  const base = resolvePocketBaseBaseUrl()
  if (!base) return undefined
  const thumb = '100x100'

  const montar = (colecao: string, id: string, filename: string): string =>
    `${base}/api/files/${colecao}/${id}/${filename}?thumb=${thumb}`

  // blob:/data: (preview local do diálogo de cadastro) passam direto
  if (
    produto.imagem &&
    (produto.imagem.startsWith('blob:') || produto.imagem.startsWith('data:'))
  ) {
    return produto.imagem
  }

  const isKitCombo = produto.tipo === 'kit' || produto.tipo === 'combo'

  // 1) kit/combo e 2) espelho legado: arquivo no próprio espelho prec_produtos
  if (isKitCombo || !produto.origem_id) {
    if (!produto.imagem) return undefined
    return montar('prec_produtos', produto.id, produto.imagem)
  }

  // 3) espelho de Produto Composto (origem_id): arquivo no cadastro de origem
  //    3a. upload direto no Produto Composto (produtos.imagem, nome real)
  if (produto.imagem_produtos && produto.origem_id) {
    return montar('produtos', produto.origem_id, produto.imagem_produtos)
  }
  //    3b. foto herdada do catálogo de fornecedor (fornecedores_produtos.imagem):
  //        o nome REAL chega injetado em fornecedor_produto_imagem
  const fpId = produto.fornecedor_produto_id || ''
  if (fpId && produto.fornecedor_produto_imagem) {
    return montar('fornecedores_produtos', fpId, produto.fornecedor_produto_imagem)
  }
  //    3c. último recurso: upload antigo feito direto no espelho
  if (produto.imagem) {
    return montar('prec_produtos', produto.id, produto.imagem)
  }
  return undefined
}
