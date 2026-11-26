import { getFileUrl } from '@/lib/pocketbase/files'
import type { TriagemProdutoInput } from '@/lib/triagemModelo'

/**
 * Regra (protocolo acordado): a foto do produto comercial é o campo file
 * `imagem` do registro de `produtos` (Produto Composto), onde o upload acontece.
 * O espelho em `prec_produtos` carrega apenas o NOME do arquivo; quando o
 * espelho tem `origem_id`, a URL é resolvida pelo registro de origem em
 * `produtos` (é lá que o arquivo físico existe). Fallback para o próprio id
 * (espelhos legados que carregavam o arquivo). A Triagem é somente leitura:
 * apenas exibe.
 *
 * Retorna undefined quando não há foto — o card mostra placeholder com a
 * inicial do SKU; nunca devolve URL quebrada nem string vazia.
 */
export function urlImagemProdutoTriagem(
  produto: Pick<TriagemProdutoInput, 'id' | 'imagem' | 'origem_id'>,
): string | undefined {
  if (!produto?.imagem) return undefined

  // Espelho com origem: arquivo físico vive no registro de `produtos`.
  // Legado (sem origem_id): o próprio espelho carregava o arquivo — usa o próprio id.
  const origemId = produto.origem_id || produto.id
  return getFileUrl('produtos', origemId, produto.imagem, { thumb: '100x100' }) || undefined
}
