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
 * Regra acordada do protocolo ERP GKza:
 * O seletor de produtos para precificação/orçamentos deve listar EXCLUSIVAMENTE PRODUTOS COMPOSTOS
 * (`produtos` ou registros do motor de precificação sincronizados de produtos compostos).
 * Itens de `produtos_base` (revenda, insumos, serviços isolados) NUNCA entram no seletor de precificação!
 */
export function filtrarItensParaSeletorPrecificacao<
  T extends { _collection?: string; tipo?: string; classificacao?: string },
>(itens: T[]): T[] {
  return itens.filter((item) => {
    // Se tiver coleção identificada, NUNCA permite coleções de base/insumo direta
    if (
      item._collection &&
      (item._collection === 'produtos_base' || item._collection === 'insumos')
    ) {
      return false
    }
    return true
  })
}

/**
 * Regra acordada de composição:
 * O seletor de itens para a composição deve listar itens de `produtos_base` (ou catálogo de insumos)
 * destinados a formar o custo analítico do produto.
 */
export function filtrarItensParaSeletorComposicao<
  T extends { _collection?: string; tipo?: string },
>(itens: T[]): T[] {
  return itens.filter((item) => {
    // Itens de produtos compostos não entram como linha de produtos_base
    if (item._collection && item._collection === 'produtos') {
      return false
    }
    return true
  })
}
