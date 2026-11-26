import { getFileUrl } from '@/lib/pocketbase/files'
import type { TriagemProdutoInput } from '@/lib/triagemModelo'

/**
 * Regra (protocolo acordado): a foto do produto comercial é o campo file
 * `imagem` do registro de `produtos` (Produto Composto), onde o upload acontece.
 * O espelho em `prec_produtos` carrega o NOME do arquivo em `imagem` para os
 * espelhos legados sem origem; quando o espelho tem `origem_id`, a URL é
 * resolvida pelo registro de origem em `produtos` (é lá que o arquivo físico
 * existe). A Triagem é somente leitura: apenas exibe.
 *
 * Retorna undefined quando não há foto — o card mostra placeholder com a
 * inicial do SKU; nunca devolve URL quebrada nem string vazia.
 */
export function urlImagemProdutoTriagem(
  produto: Pick<TriagemProdutoInput, 'id' | 'imagem' | 'base_origem'> & { origem_id?: string },
): string | undefined {
  if (!produto?.imagem) return undefined

  // 1. Espelho com origem: arquivo físico vive no registro de `produtos`
  const origemId = (produto as { origem_id?: string }).origem_id || produto.id
  if (origemId) {
    const url = getFileUrl('produtos', origemId, produto.imagem, { thumb: '100x100' })
    if (url) return url
  }
  return undefined
}
