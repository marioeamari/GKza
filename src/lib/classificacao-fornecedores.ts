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
export function normalizarTiposFornecedor(tipos?: string[] | string | null): FornecedorTipo[] {
  if (!tipos) {
    return ['revenda']
  }

  let lista: string[] = []
  if (Array.isArray(tipos)) {
    lista = tipos
  } else if (typeof tipos === 'string') {
    const raw = tipos.trim()
    if (raw.startsWith('[') && raw.endsWith(']')) {
      try {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) lista = parsed.map(String)
      } catch {
        lista = raw.split(',')
      }
    } else {
      lista = raw.split(',')
    }
  }

  const validos = lista
    .map((t) => t.trim())
    .filter((t): t is FornecedorTipo => t === 'revenda' || t === 'insumos' || t === 'servicos')
  return validos.length > 0 ? validos : ['revenda']
}

export function rotuloTiposFornecedor(tipos?: string[] | string | null): string {
  const norm = normalizarTiposFornecedor(tipos)
  return norm.map((t) => FORNECEDOR_TIPO_CONFIG[t]?.label || t).join(', ')
}

export function fornecedorTemTipo(
  fornecedor: { tipos?: string[] | string | null },
  tipo: FornecedorTipo,
): boolean {
  return normalizarTiposFornecedor(fornecedor.tipos).includes(tipo)
}

export function fornecedorOfereceRevenda(fornecedor: {
  tipos?: string[] | string | null
}): boolean {
  return fornecedorTemTipo(fornecedor, 'revenda')
}

export function fornecedorOfereceInsumos(fornecedor: {
  tipos?: string[] | string | null
}): boolean {
  return fornecedorTemTipo(fornecedor, 'insumos')
}

export function fornecedorOfereceServicos(fornecedor: {
  tipos?: string[] | string | null
}): boolean {
  return fornecedorTemTipo(fornecedor, 'servicos')
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

/**
 * Regra acordada do protocolo ERP GKza - Ficha do Fornecedor:
 * Filtra produtos compostos que contenham algum item de origem do fornecedor:
 * (a) base_origem seja de um produto base pertencente a esse fornecedor, OU
 * (b) expand.base_origem.fornecedor seja igual ao id do fornecedor, OU
 * (c) alguma linha da composição analítica referencie fornecedor_id do fornecedor ou insumo_id pertencente aos produtos base dele.
 */
export function filtrarProdutosCompostosPorFornecedor<
  T extends {
    base_origem?: string
    expand?: { base_origem?: { fornecedor?: string } }
    composicao?: Array<{ fornecedor_id?: string; insumo_id?: string }>
  },
>(params: {
  compostos: T[]
  fornecedorId: string
  produtosBaseIdsDoFornecedor?: string[] | Set<string>
}): T[] {
  const { compostos, fornecedorId, produtosBaseIdsDoFornecedor } = params
  const baseIdsSet =
    produtosBaseIdsDoFornecedor instanceof Set
      ? produtosBaseIdsDoFornecedor
      : new Set(produtosBaseIdsDoFornecedor || [])

  return compostos.filter((c) => {
    if (c.base_origem && baseIdsSet.has(c.base_origem)) return true
    if (c.expand?.base_origem?.fornecedor === fornecedorId) return true
    if (Array.isArray(c.composicao)) {
      return c.composicao.some(
        (item) =>
          item.fornecedor_id === fornecedorId || (item.insumo_id && baseIdsSet.has(item.insumo_id)),
      )
    }
    return false
  })
}

/**
 * Função pura de transformação do backfill: fornecedores_produtos -> produtos_base (tipo revenda)
 * Preserva sku, ncm, código de barras, dimensão, peso e custo unitário.
 */
export function transformarFornecedorProdutoEmProdutoBase(fp: {
  id: string
  descricao?: string
  fornecedor: string
  sku_fornecedor?: string
  ncm?: string
  codigo_barras?: string
  unidade?: string
  preco_custo_unitario?: number | string
  preco_ultima_compra?: number | string
  comprimento_cm?: number | string
  largura_cm?: number | string
  altura_cm?: number | string
  peso_g?: number | string
  ativo?: boolean
  observacoes?: string
}) {
  const custo = Number(fp.preco_custo_unitario) || Number(fp.preco_ultima_compra) || 0

  return {
    nome: fp.descricao || 'Produto Base Revenda',
    tipo: 'revenda' as const,
    fornecedor: fp.fornecedor,
    sku: fp.sku_fornecedor || '',
    ncm: fp.ncm || '',
    codigo_barras: fp.codigo_barras || '',
    unidade: fp.unidade || 'un',
    custo_unitario: custo,
    dimensao_tipo: '3d' as const,
    dimensao_comprimento_cm: Number(fp.comprimento_cm) || 0,
    dimensao_largura_cm: Number(fp.largura_cm) || 0,
    dimensao_altura_cm: Number(fp.altura_cm) || 0,
    peso_g: Number(fp.peso_g) || 0,
    origem_colecao: 'fornecedores_produtos',
    origem_id: fp.id,
    ativo: fp.ativo !== false,
    observacoes: fp.observacoes || '',
  }
}

/**
 * Função pura de transformação do backfill: insumos -> produtos_base
 * Preserva dimensões, unidade, valor unitário e tipo (insumo ou serviço).
 */
export function transformarInsumoEmProdutoBase(ins: {
  id: string
  nome?: string
  tipo?: string
  fornecedor: string
  unidade?: string
  valor_unitario?: number | string
  dimensao_tipo?: string
  dimensao_comprimento_cm?: number | string
  dimensao_largura_cm?: number | string
  dimensao_altura_cm?: number | string
  ativo?: boolean
  observacoes?: string
}) {
  const tipo = ins.tipo === 'servico' ? ('servico' as const) : ('insumo' as const)

  return {
    nome: ins.nome || 'Insumo Base',
    tipo,
    fornecedor: ins.fornecedor,
    unidade: ins.unidade || 'un',
    custo_unitario: Number(ins.valor_unitario) || 0,
    dimensao_tipo: ins.dimensao_tipo || 'nenhuma',
    dimensao_comprimento_cm: Number(ins.dimensao_comprimento_cm) || 0,
    dimensao_largura_cm: Number(ins.dimensao_largura_cm) || 0,
    dimensao_altura_cm: Number(ins.dimensao_altura_cm) || 0,
    origem_colecao: 'insumos',
    origem_id: ins.id,
    ativo: ins.ativo !== false,
    observacoes: ins.observacoes || '',
  }
}
