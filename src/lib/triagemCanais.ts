/**
 * Fileira de canais de venda dos cards da Triagem (0.0.325, reescrita 0.0.326).
 *
 * Regra gravada (protocolo acordado):
 * - um círculo por canal de `prec_canais` com `ativo` verdadeiro, na ordem em
 *   que a coleção foi carregada;
 * - a CLASSIFICAÇÃO não é recalculada aqui: o mapa vem de
 *   `precificacaoService.getMapaProdutosAprovadosPorCanal()` (chave
 *   `${produtoId}__${canalId}`), que já aplica o critério vigente da Matriz /
 *   Aprovados (preco_aprovado > 0, status 'aprovada' ou 'desatualizada',
 *   prioridade para 'aprovada', desempate pelo mais recente);
 * - classificado = círculo na cor original do canal; não classificado = círculo
 *   cinza (visual de inativo). O tooltip diz o preço aprovado ou "sem preço".
 */

export interface CanalLite {
  id: string
  nome: string
  cor?: string
  ativo?: boolean
}

/** Subconjunto do mapa de getMapaProdutosAprovadosPorCanal que esta lib usa. */
export interface PrecoAprovadoCanal {
  preco_aprovado: number
}

export type MapaPrecoPorProdCanal = Record<string, PrecoAprovadoCanal>

export interface CanalIcone {
  canalId: string
  nome: string
  cor: string
  inicial: string
  classificado: boolean
  precoAprovado?: number
  rotuloTooltip: string
}

const COR_FALLBACK = '#6b7280'

function formatarBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

/** Chave do mapa de getMapaProdutosAprovadosPorCanal para produto × canal. */
export function chaveProdutoCanal(produtoId: string, canalId: string): string {
  return `${produtoId}__${canalId}`
}

/** Fileira de ícones (um por canal ativo) de um produto, lendo o mapa oficial. */
export function canaisDoProduto(
  produtoId: string,
  mapa: MapaPrecoPorProdCanal,
  canais: CanalLite[],
): CanalIcone[] {
  return canais
    .filter((c) => c.ativo)
    .map((c) => {
      const entrada = mapa[chaveProdutoCanal(produtoId, c.id)]
      const precoAprovado = entrada?.preco_aprovado
      const classificado = Boolean(precoAprovado && precoAprovado > 0)
      const rotuloTooltip = classificado
        ? `${c.nome} — ${formatarBRL(precoAprovado ?? 0)} aprovado`
        : `${c.nome} — sem preço aprovado`
      return {
        canalId: c.id,
        nome: c.nome,
        cor: c.cor || COR_FALLBACK,
        inicial: (c.nome.trim().charAt(0) || '?').toUpperCase(),
        classificado,
        precoAprovado: classificado ? precoAprovado : undefined,
        rotuloTooltip,
      }
    })
}

/** Mapa produto → fileira de ícones, para todos os produtos da Triagem. */
export function iconesCanaisPorProduto(
  produtoIds: string[],
  mapa: MapaPrecoPorProdCanal,
  canais: CanalLite[],
): Map<string, CanalIcone[]> {
  return new Map(produtoIds.map((id) => [id, canaisDoProduto(id, mapa, canais)]))
}
