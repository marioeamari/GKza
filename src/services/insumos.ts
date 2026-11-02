import pb from '@/lib/pocketbase/client'
import type {
  InsumoRecord,
  InsumoCategoriaRecord,
  InsumoTipoRecord,
  InsumoTipo,
  InsumoDimensaoTipo,
  ProdutoBaseTipo,
} from '@/types/domain'
import { PRODUTO_BASE_TIPOS_PADRAO, resolverTipoCompativelProdutoBase } from '@/types/domain'

export { PRODUTO_BASE_TIPOS_PADRAO, resolverTipoCompativelProdutoBase }
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
  // Insumos Tipos de Custo / Insumo
  // -------------------------------------------------------------
  async listTipos(): Promise<InsumoTipoRecord[]> {
    const { withRetry } = await import('@/lib/pocketbase/retry')
    return withRetry(
      () =>
        pb.collection('insumos_tipos').getFullList<InsumoTipoRecord>({
          sort: 'ordem,nome',
        }),
      { label: 'insumosService.listTipos' },
    )
  },

  async createTipo(data: {
    nome: string
    codigo?: string
    cor?: string
    ordem?: number
    ativo?: boolean
  }): Promise<InsumoTipoRecord> {
    const nomeLimpo = data.nome.trim()
    const codigoLimpo =
      data.codigo?.trim() ||
      nomeLimpo
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')

    return pb.collection('insumos_tipos').create<InsumoTipoRecord>({
      ...data,
      nome: nomeLimpo,
      codigo: codigoLimpo,
      ativo: data.ativo ?? true,
    })
  },

  async updateTipo(
    id: string,
    data: Partial<{
      nome: string
      codigo?: string
      cor?: string
      ordem?: number
      ativo?: boolean
    }>,
  ): Promise<InsumoTipoRecord> {
    const payload: Record<string, any> = { ...data }
    if (data.nome !== undefined) payload.nome = data.nome.trim()
    if (data.codigo !== undefined) payload.codigo = data.codigo.trim()
    return pb.collection('insumos_tipos').update<InsumoTipoRecord>(id, payload)
  },

  async countProdutosBaseUsandoTipo(tipoId: string, tipoCodigo?: string): Promise<number> {
    try {
      const filters: string[] = [`tipo_ref = "${tipoId}"`]
      if (tipoCodigo) {
        filters.push(`tipo = "${tipoCodigo}"`)
      }
      const res = await pb.collection('produtos_base').getList(1, 1, {
        filter: filters.join(' || '),
      })
      return res.totalItems
    } catch {
      return 0
    }
  },

  async deleteTipo(id: string): Promise<boolean> {
    return pb.collection('insumos_tipos').delete(id)
  },

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
  // Insumos (Unificado com produtos_base — nenhuma escrita na coleção legada)
  // -------------------------------------------------------------
  async listInsumos(filtro?: {
    tipo?: InsumoTipo
    categoriaId?: string
    apenasAtivos?: boolean
    busca?: string
  }): Promise<InsumoRecord[]> {
    const parts: string[] = []
    if (filtro?.tipo) {
      if (filtro.tipo === 'servico') {
        parts.push(`tipo = "servico"`)
      } else {
        parts.push(`tipo != "revenda" && tipo != "servico"`)
      }
    }
    if (filtro?.categoriaId) parts.push(`categoria = "${filtro.categoriaId}"`)
    if (filtro?.apenasAtivos) parts.push('ativo = true')
    if (filtro?.busca && filtro.busca.trim()) {
      const q = filtro.busca.trim().replace(/"/g, '')
      parts.push(`(nome ~ "${q}" || observacoes ~ "${q}" || sku ~ "${q}")`)
    }

    const { withRetry } = await import('@/lib/pocketbase/retry')
    const list = await withRetry(
      () =>
        pb.collection('produtos_base').getFullList<any>({
          filter: parts.length > 0 ? parts.join(' && ') : undefined,
          sort: 'nome',
          expand: 'categoria,fornecedor',
        }),
      { label: 'insumosService.listInsumos' },
    )

    // Converte ProdutoBaseRecord para InsumoRecord compatível
    return list.map((pbRec) => ({
      ...pbRec,
      valor_unitario: pbRec.custo_unitario ?? 0,
      tipo: pbRec.tipo === 'servico' ? 'servico' : 'insumo',
    })) as InsumoRecord[]
  },

  async getInsumo(id: string): Promise<InsumoRecord> {
    const pbRec = await pb.collection('produtos_base').getOne<any>(id, {
      expand: 'categoria,fornecedor',
    })
    return {
      ...pbRec,
      valor_unitario: pbRec.custo_unitario ?? 0,
      tipo: pbRec.tipo === 'servico' ? 'servico' : 'insumo',
    } as InsumoRecord
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
    // Grava EXCLUSIVAMENTE em produtos_base
    let fallbackFornId = data.fornecedor
    if (!fallbackFornId) {
      try {
        const primeiroForn = await pb.collection('fornecedores').getList(1, 1, { sort: 'created' })
        if (primeiroForn.items.length > 0) {
          fallbackFornId = primeiroForn.items[0].id
        }
      } catch {
        /* intentionally ignored */
      }
    }

    const payloadPb = {
      nome: data.nome.trim(),
      tipo: data.tipo === 'servico' ? 'servico' : 'insumo',
      categoria: data.categoria || undefined,
      fornecedor: fallbackFornId || '',
      unidade: data.unidade || 'un',
      custo_unitario: Number(data.valor_unitario) || 0,
      dimensao_tipo: data.dimensao_tipo || 'nenhuma',
      dimensao_largura_cm: Number(data.dimensao_largura_cm) || 0,
      dimensao_altura_cm: Number(data.dimensao_altura_cm) || 0,
      dimensao_comprimento_cm: Number(data.dimensao_comprimento_cm) || 0,
      observacoes: data.observacoes || '',
      ativo: data.ativo ?? true,
    }

    const created = await pb.collection('produtos_base').create<any>(payloadPb)
    return {
      ...created,
      valor_unitario: created.custo_unitario ?? 0,
      tipo: created.tipo === 'servico' ? 'servico' : 'insumo',
    } as InsumoRecord
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
    const payloadPb: Record<string, any> = {}
    if (data.nome !== undefined) payloadPb.nome = data.nome
    if (data.tipo !== undefined) payloadPb.tipo = data.tipo === 'servico' ? 'servico' : 'insumo'
    if (data.categoria !== undefined) payloadPb.categoria = data.categoria || null
    if (data.fornecedor !== undefined) payloadPb.fornecedor = data.fornecedor
    if (data.unidade !== undefined) payloadPb.unidade = data.unidade
    if (data.valor_unitario !== undefined)
      payloadPb.custo_unitario = Number(data.valor_unitario) || 0
    if (data.dimensao_tipo !== undefined) payloadPb.dimensao_tipo = data.dimensao_tipo
    if (data.dimensao_largura_cm !== undefined)
      payloadPb.dimensao_largura_cm = Number(data.dimensao_largura_cm) || 0
    if (data.dimensao_altura_cm !== undefined)
      payloadPb.dimensao_altura_cm = Number(data.dimensao_altura_cm) || 0
    if (data.dimensao_comprimento_cm !== undefined)
      payloadPb.dimensao_comprimento_cm = Number(data.dimensao_comprimento_cm) || 0
    if (data.observacoes !== undefined) payloadPb.observacoes = data.observacoes
    if (data.ativo !== undefined) payloadPb.ativo = data.ativo

    const updated = await pb.collection('produtos_base').update<any>(id, payloadPb)
    return {
      ...updated,
      valor_unitario: updated.custo_unitario ?? 0,
      tipo: updated.tipo === 'servico' ? 'servico' : 'insumo',
    } as InsumoRecord
  },

  async deleteInsumo(id: string): Promise<boolean> {
    return pb.collection('produtos_base').delete(id)
  },
}
