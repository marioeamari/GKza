import pb from '@/lib/pocketbase/client'
import type {
  InsumoRecord,
  InsumoCategoriaRecord,
  InsumoTipo,
  InsumoDimensaoTipo,
} from '@/types/domain'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'

/**
 * Formata o texto de dimensões para exibição nos cards e caixas de insumos
 * 2D: L x A cm (ex: 20 × 30 cm)
 * 3D: C x L x A cm (ex: 30 × 20 × 10 cm)
 */
export function formatarDimensaoInsumo(item: {
  dimensao_tipo?: InsumoDimensaoTipo | string
  dimensao_comprimento_cm?: number | null
  dimensao_largura_cm?: number | null
  dimensao_altura_cm?: number | null
}): string {
  const tipo = (item.dimensao_tipo || 'nenhuma').toLowerCase()
  if (tipo === '2d') {
    const l = item.dimensao_largura_cm ?? 0
    const a = item.dimensao_altura_cm ?? 0
    if (!l && !a) return '2D'
    return `2D: ${l} × ${a} cm`
  }
  if (tipo === '3d') {
    const c = item.dimensao_comprimento_cm ?? 0
    const l = item.dimensao_largura_cm ?? 0
    const a = item.dimensao_altura_cm ?? 0
    if (!c && !l && !a) return '3D'
    return `3D: ${c} × ${l} × ${a} cm`
  }
  return 'Sem dimensão'
}

/**
 * Verifica se um insumo ou categoria pertence ao grupo "Embalagem"
 */
export function isInsumoEmbalagem(insumo: {
  categoria_nome?: string
  expand?: { categoria?: { nome?: string } }
}): boolean {
  const catNome = (insumo.categoria_nome || insumo.expand?.categoria?.nome || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
  return catNome.includes('embalagem')
}

/**
 * Regra de autopreenchimento de Embalagem Adicional:
 * - Só altera quando o usuário NÃO editou manualmente o campo (ou quando valor atual for igual ao default/vazio)
 * - Retorna o novo valor e o texto de tipo+dimensão para exibição na caixa
 */
export function aplicarAutoPreenchimentoEmbalagem(params: {
  insumo: InsumoRecord
  valorEmbalagemAtual: string | number
  editadoManualmente: boolean
}): {
  novoValor: number | null
  tipoEDimensaoTexto: string
  deveAtualizar: boolean
} {
  const { insumo, valorEmbalagemAtual, editadoManualmente } = params
  const isEmbalagem = isInsumoEmbalagem(insumo)
  const dimensaoTexto = formatarDimensaoInsumo(insumo)
  const tipoEDimensaoTexto = `${insumo.tipo === 'servico' ? 'Serviço' : 'Insumo'} • ${dimensaoTexto}`

  if (!isEmbalagem) {
    return {
      novoValor: null,
      tipoEDimensaoTexto,
      deveAtualizar: false,
    }
  }

  const valorUnit = Number(insumo.valor_unitario) || 0
  const valorAtualNum = Number(String(valorEmbalagemAtual).replace(',', '.')) || 0

  // Se o usuário editou manualmente de forma deliberada (flag true) e o valor é diferente, NÃO sobrescreve
  if (editadoManualmente && valorAtualNum > 0) {
    return {
      novoValor: valorAtualNum,
      tipoEDimensaoTexto,
      deveAtualizar: false,
    }
  }

  return {
    novoValor: valorUnit,
    tipoEDimensaoTexto,
    deveAtualizar: true,
  }
}

/**
 * Cria snapshot imutável para rastreabilidade de origem da receita na execução
 * (grava fornecedor, custo unitário e data do momento)
 */
export function criarSnapshotItemReceita(
  item: ItemComposicaoCusto,
  dataMomento: string = new Date().toISOString(),
): ItemComposicaoCusto {
  return {
    ...item,
    snapshot_data: item.snapshot_data || dataMomento,
    snapshot_valor_unitario:
      item.snapshot_valor_unitario !== undefined
        ? item.snapshot_valor_unitario
        : item.custo_unitario,
    snapshot_fornecedor_nome:
      item.snapshot_fornecedor_nome !== undefined
        ? item.snapshot_fornecedor_nome
        : item.fornecedor_nome || item.fornecedor || 'Origem não informada',
  }
}

/**
 * Cria lista de snapshots para todas as linhas de composição da receita
 */
export function congelarSnapshotReceita(
  composicao?: ItemComposicaoCusto[],
  dataMomento: string = new Date().toISOString(),
): ItemComposicaoCusto[] {
  if (!Array.isArray(composicao)) return []
  return composicao.map((item) => criarSnapshotItemReceita(item, dataMomento))
}

export const insumosService = {
  // -------------------------------------------------------------
  // Insumos Categorias
  // -------------------------------------------------------------
  async listCategorias(): Promise<InsumoCategoriaRecord[]> {
    const { withRetry } = await import('@/lib/pocketbase/retry')
    return withRetry(
      () =>
        pb.collection('insumos_categorias').getFullList<InsumoCategoriaRecord>({
          sort: 'ordem,nome',
        }),
      { label: 'insumosService.listCategorias' },
    )
  },

  async createCategoria(data: {
    nome: string
    cor?: string
    ordem?: number
    ativo?: boolean
  }): Promise<InsumoCategoriaRecord> {
    return pb.collection('insumos_categorias').create<InsumoCategoriaRecord>({
      ...data,
      ativo: data.ativo ?? true,
    })
  },

  async updateCategoria(
    id: string,
    data: Partial<{
      nome: string
      cor?: string
      ordem?: number
      ativo?: boolean
    }>,
  ): Promise<InsumoCategoriaRecord> {
    return pb.collection('insumos_categorias').update<InsumoCategoriaRecord>(id, data)
  },

  async deleteCategoria(id: string): Promise<boolean> {
    return pb.collection('insumos_categorias').delete(id)
  },

  // -------------------------------------------------------------
  // Insumos
  // -------------------------------------------------------------
  async listInsumos(filtro?: {
    tipo?: InsumoTipo
    categoriaId?: string
    apenasAtivos?: boolean
    busca?: string
  }): Promise<InsumoRecord[]> {
    const parts: string[] = []
    if (filtro?.tipo) parts.push(`tipo="${filtro.tipo}"`)
    if (filtro?.categoriaId) parts.push(`categoria="${filtro.categoriaId}"`)
    if (filtro?.apenasAtivos) parts.push('ativo=true')
    if (filtro?.busca && filtro.busca.trim()) {
      const q = filtro.busca.trim().replace(/"/g, '')
      parts.push(`(nome ~ "${q}" || observacoes ~ "${q}")`)
    }

    const { withRetry } = await import('@/lib/pocketbase/retry')
    return withRetry(
      () =>
        pb.collection('insumos').getFullList<InsumoRecord>({
          filter: parts.length > 0 ? parts.join(' && ') : undefined,
          sort: 'nome',
          expand: 'categoria,fornecedor',
        }),
      { label: 'insumosService.listInsumos' },
    )
  },

  async getInsumo(id: string): Promise<InsumoRecord> {
    return pb.collection('insumos').getOne<InsumoRecord>(id, {
      expand: 'categoria,fornecedor',
    })
  },

  async createInsumo(data: {
    nome: string
    categoria?: string
    tipo: InsumoTipo
    dimensao_tipo?: InsumoDimensaoTipo
    dimensao_largura_cm?: number
    dimensao_altura_cm?: number
    dimensao_comprimento_cm?: number
    unidade?: string
    valor_unitario?: number
    fornecedor?: string
    observacoes?: string
    ativo?: boolean
  }): Promise<InsumoRecord> {
    return pb.collection('insumos').create<InsumoRecord>({
      ...data,
      ativo: data.ativo ?? true,
    })
  },

  async updateInsumo(
    id: string,
    data: Partial<{
      nome: string
      categoria?: string
      tipo: InsumoTipo
      dimensao_tipo?: InsumoDimensaoTipo
      dimensao_largura_cm?: number
      dimensao_altura_cm?: number
      dimensao_comprimento_cm?: number
      unidade?: string
      valor_unitario?: number
      fornecedor?: string
      observacoes?: string
      ativo?: boolean
    }>,
  ): Promise<InsumoRecord> {
    return pb.collection('insumos').update<InsumoRecord>(id, data)
  },

  async deleteInsumo(id: string): Promise<boolean> {
    return pb.collection('insumos').delete(id)
  },
}
