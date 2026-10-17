import { FornecedorTipo } from '@/types/domain'

/**
 * Módulo de classificação e filtragem de fornecedores.
 *
 * Valores possíveis para 'tipos':
 * - 'revenda': Fornecedores de produtos prontos para revenda
 * - 'insumos': Fornecedores de matérias-primas / insumos físicos
 * - 'servicos': Prestadores de serviços terceirizados (costura, estamparia, etc.)
 */

export const FORNECEDOR_TIPO_CONFIG: Record<
  FornecedorTipo,
  { label: string; badgeClass: string; bgSoft: string; border: string; text: string }
> = {
  revenda: {
    label: 'Revenda',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 hover:bg-blue-100',
    bgSoft: 'bg-blue-50/70',
    border: 'border-blue-200',
    text: 'text-blue-700',
  },
  insumos: {
    label: 'Insumos',
    badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
    bgSoft: 'bg-emerald-50/70',
    border: 'border-emerald-200',
    text: 'text-emerald-700',
  },
  servicos: {
    label: 'Serviços',
    badgeClass: 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100',
    bgSoft: 'bg-purple-50/70',
    border: 'border-purple-200',
    text: 'text-purple-700',
  },
}

export const FORNECEDOR_TIPOS_LISTA: FornecedorTipo[] = ['revenda', 'insumos', 'servicos']

/**
 * Normaliza os tipos de um fornecedor para um array válido.
 * Se vazio ou ausente, faz fallback seguro para ['revenda'].
 */
export function normalizarTiposFornecedor(tipos?: string[] | null): FornecedorTipo[] {
  if (!tipos || !Array.isArray(tipos) || tipos.length === 0) {
    return ['revenda']
  }
  const validos = tipos.filter(
    (t): t is FornecedorTipo => t === 'revenda' || t === 'insumos' || t === 'servicos',
  )
  return validos.length > 0 ? validos : ['revenda']
}

/**
 * Verifica se um fornecedor atende ao filtro de tipo selecionado ('todos' ou um FornecedorTipo específico).
 */
export function fornecedorCorrespondeTipo(
  fornecedor: { tipos?: string[] | null },
  filtro: 'todos' | FornecedorTipo,
): boolean {
  if (filtro === 'todos') return true
  const tipos = normalizarTiposFornecedor(fornecedor.tipos)
  return tipos.includes(filtro)
}

/**
 * Regra do protocolo (C):
 * O seletor de produtos para precificação deve listar EXCLUSIVAMENTE itens de `fornecedores_produtos`.
 * Itens do catálogo de `insumos` NUNCA entram na lista de produtos de precificação.
 */
export function filtrarItensParaSeletorPrecificacao<
  T extends { _collection?: string; tipo?: string },
>(itens: T[]): T[] {
  return itens.filter((item) => {
    // Se possui coleção identificada, deve ser fornecedores_produtos
    if (item._collection && item._collection !== 'fornecedores_produtos') {
      return false
    }
    return true
  })
}

/**
 * Regra do protocolo (C):
 * O seletor de insumos da composição deve listar EXCLUSIVAMENTE itens do catálogo `insumos` (insumo/servico).
 * Produtos de revenda ou registros de `fornecedores_produtos` NUNCA entram no seletor de insumos.
 */
export function filtrarItensParaSeletorComposicao<
  T extends { _collection?: string; tipo?: string },
>(itens: T[]): T[] {
  return itens.filter((item) => {
    if (item._collection && item._collection !== 'insumos') {
      return false
    }
    // Produtos de revenda não são insumos de composição
    if (item.tipo === 'revenda') {
      return false
    }
    return true
  })
}
