import pb from '@/lib/pocketbase/client'
import { withRetry } from '@/lib/pocketbase/retry'
import type {
  ProdutoBaseRecord,
  ProdutoBaseTipo,
  ProdutoCompostoRecord,
  ProdutoCompostoClassificacao,
} from '@/types/domain'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'

/**
 * Regra pura de cálculo de custos para Produto Composto:
 * - revenda: custo_total = aquisição (base_origem) + composição (linhas analíticas) + embalagem + etiqueta
 * - fabricacao_propria: custo_total = composição + embalagem + etiqueta (aquisição = 0)
 */
export function calcularCustosProdutoComposto(params: {
  classificacao: ProdutoCompostoClassificacao
  custo_aquisicao?: number
  composicao?: ItemComposicaoCusto[]
  custo_embalagem?: number
  custo_etiqueta?: number
  perda_pct?: number
}): {
  custo_aquisicao: number
  custo_composicao: number
  custo_embalagem: number
  custo_etiqueta: number
  custo_total: number
} {
  const isRevenda = params.classificacao === 'revenda'
  const aquisicao = isRevenda ? Math.max(0, Number(params.custo_aquisicao) || 0) : 0
  const etiqueta = Math.max(0, Number(params.custo_etiqueta) || 0)

  let somaComposicao = 0
  let temLinhaEmbalagem = false
  let temPerdaNaLinha = false

  if (Array.isArray(params.composicao)) {
    for (const item of params.composicao) {
      const q = Number(item.qtd) || 0
      const u = Number(item.custo_unitario) || 0
      const perdaItemPct = Number(item.perda_pct) || 0
      if (perdaItemPct > 0) {
        temPerdaNaLinha = true
      }
      const perda = perdaItemPct / 100
      somaComposicao += q * (1 + perda) * u

      const catCusto = (item.categoria_custo || '').toLowerCase()
      const catNome = (item.categoria_nome || '').toLowerCase()
      const desc = (item.descricao || '').toLowerCase()
      if (
        catCusto === 'embalagem' ||
        catNome === 'embalagem' ||
        catCusto.includes('embalagem') ||
        catNome.includes('embalagem') ||
        desc.includes('saco plastico') ||
        desc.includes('saco plástico') ||
        desc.includes('embalagem')
      ) {
        temLinhaEmbalagem = true
      }
    }
  }

  // Regra contra Dupla Contagem:
  // Se a composição já inclui linha de categoria Embalagem, o custo_total NÃO deve somar
  // novamente o campo custo_embalagem (custo_total = custo_aquisicao + custo_composicao + etiqueta).
  // Se for legado sem linha de embalagem, o campo entra normalmente.
  const embalagemEfetiva = temLinhaEmbalagem ? 0 : Math.max(0, Number(params.custo_embalagem) || 0)

  // Precedência da perda: perda global do produto só incide quando NENHUMA linha tem perda própria
  const perdaGlobalPct = Number(params.perda_pct) || 0
  if (!temPerdaNaLinha && perdaGlobalPct > 0) {
    if (isRevenda) {
      // Em revenda, se houver composição ela recebe a perda ou a base de aquisição
      somaComposicao = somaComposicao * (1 + perdaGlobalPct / 100)
    } else {
      somaComposicao = somaComposicao * (1 + perdaGlobalPct / 100)
    }
  }

  const custo_composicao = Math.round((somaComposicao + Number.EPSILON) * 100) / 100
  let custoDiretoTotal = aquisicao + custo_composicao
  // Para revenda onde o custo direto é puramente aquisição sem perda na linha mas com perda global:
  if (
    isRevenda &&
    !temPerdaNaLinha &&
    perdaGlobalPct > 0 &&
    (!params.composicao || params.composicao.length === 0)
  ) {
    custoDiretoTotal = aquisicao * (1 + perdaGlobalPct / 100)
  }

  const custo_total =
    Math.round((custoDiretoTotal + embalagemEfetiva + etiqueta + Number.EPSILON) * 100) / 100

  return {
    custo_aquisicao: aquisicao,
    custo_composicao,
    custo_embalagem: embalagemEfetiva,
    custo_etiqueta: etiqueta,
    custo_total,
  }
}

export const produtosBaseService = {
  async list(filtro?: {
    fornecedorId?: string
    tipo?: ProdutoBaseTipo
    categoriaId?: string
    apenasAtivos?: boolean
    busca?: string
  }): Promise<ProdutoBaseRecord[]> {
    const parts: string[] = []
    if (filtro?.fornecedorId) parts.push(`fornecedor = "${filtro.fornecedorId}"`)
    if (filtro?.tipo) parts.push(`tipo = "${filtro.tipo}"`)
    if (filtro?.categoriaId) parts.push(`categoria = "${filtro.categoriaId}"`)
    if (filtro?.apenasAtivos) parts.push('ativo = true')
    if (filtro?.busca && filtro.busca.trim()) {
      const q = filtro.busca.trim().replace(/"/g, '')
      parts.push(`(nome ~ "${q}" || sku ~ "${q}" || observacoes ~ "${q}")`)
    }

    return withRetry(
      () =>
        pb.collection('produtos_base').getFullList<ProdutoBaseRecord>({
          filter: parts.length > 0 ? parts.join(' && ') : undefined,
          sort: 'nome',
          expand: 'fornecedor,categoria',
        }),
      { label: 'produtosBaseService.list' },
    )
  },

  async getById(id: string): Promise<ProdutoBaseRecord> {
    return pb.collection('produtos_base').getOne<ProdutoBaseRecord>(id, {
      expand: 'fornecedor,categoria',
    })
  },

  async create(data: Partial<ProdutoBaseRecord> | FormData): Promise<ProdutoBaseRecord> {
    return pb.collection('produtos_base').create<ProdutoBaseRecord>(data)
  },

  async update(
    id: string,
    data: Partial<ProdutoBaseRecord> | FormData,
  ): Promise<ProdutoBaseRecord> {
    return pb.collection('produtos_base').update<ProdutoBaseRecord>(id, data)
  },

  async delete(id: string): Promise<boolean> {
    return pb.collection('produtos_base').delete(id)
  },

  getImageUrl(record: { id: string; imagem?: string }, thumb?: string): string {
    if (!record.imagem) return ''
    const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
    const query = thumb ? `?thumb=${thumb}` : ''
    return `${baseUrl}/api/files/produtos_base/${record.id}/${record.imagem}${query}`
  },
}

export const produtosCompostosService = {
  async list(filtro?: {
    empresaId?: string
    classificacao?: ProdutoCompostoClassificacao
    busca?: string
  }): Promise<ProdutoCompostoRecord[]> {
    const parts: string[] = []
    if (filtro?.classificacao) parts.push(`classificacao = "${filtro.classificacao}"`)
    if (filtro?.empresaId) parts.push(`empresas ~ "${filtro.empresaId}"`)
    if (filtro?.busca && filtro.busca.trim()) {
      const q = filtro.busca.trim().replace(/"/g, '')
      parts.push(`(nome ~ "${q}" || sku ~ "${q}")`)
    }

    return withRetry(
      () =>
        pb.collection('produtos').getFullList<ProdutoCompostoRecord>({
          filter: parts.length > 0 ? parts.join(' && ') : undefined,
          sort: 'nome',
          expand: 'base_origem,base_origem.fornecedor,empresas',
        }),
      { label: 'produtosCompostosService.list' },
    )
  },

  async getById(id: string): Promise<ProdutoCompostoRecord> {
    return pb.collection('produtos').getOne<ProdutoCompostoRecord>(id, {
      expand: 'base_origem,base_origem.fornecedor,empresas',
    })
  },

  async save(data: Partial<ProdutoCompostoRecord>, id?: string): Promise<ProdutoCompostoRecord> {
    const custos = calcularCustosProdutoComposto({
      classificacao: (data.classificacao || 'revenda') as ProdutoCompostoClassificacao,
      custo_aquisicao: data.custo_aquisicao,
      composicao: data.composicao,
      custo_embalagem: data.custo_embalagem,
      custo_etiqueta: data.custo_etiqueta,
      perda_pct: data.perda_pct,
    })

    const payload = {
      ...data,
      custo_aquisicao: custos.custo_aquisicao,
      custo_composicao: custos.custo_composicao,
      custo_embalagem: custos.custo_embalagem, // já zerado se composição tiver embalagem
      custo_etiqueta: custos.custo_etiqueta,
      custo_total: custos.custo_total,
    }

    let recordSalvo: ProdutoCompostoRecord
    if (id) {
      recordSalvo = await pb.collection('produtos').update<ProdutoCompostoRecord>(id, payload)
    } else {
      recordSalvo = await pb.collection('produtos').create<ProdutoCompostoRecord>(payload)
    }

    // Sincroniza espelho com prec_produtos automaticamente
    try {
      await this.syncComPrecificacao(recordSalvo.id)
    } catch (e) {
      console.warn('[produtosCompostosService] Aviso ao sincronizar com prec_produtos:', e)
    }

    return recordSalvo
  },

  async delete(id: string): Promise<boolean> {
    // Ao excluir/desativar um produto composto, sincronizar o registro correspondente
    // em prec_produtos imediatamente na mesma operação:
    // Se possuir cenários de precificação aprovados ou vínculos de canal, desativa (status='inativo')
    // para preservar o histórico e links caso seja recriado depois; caso contrário, remove.
    try {
      const precs = await pb.collection('prec_produtos').getList(1, 50, {
        filter: `origem_id = "${id}"`,
      })
      for (const prec of precs.items) {
        let temAprovadosOuVinculos = false
        try {
          const [precsAprovadas, matriz] = await Promise.all([
            pb.collection('prec_precificacoes').getList(1, 1, {
              filter: `produto = "${prec.id}" && (status = "aprovada" || preco_aprovado > 0)`,
            }),
            pb.collection('prec_matriz_classificacoes').getList(1, 1, {
              filter: `produto = "${prec.id}"`,
            }),
          ])
          temAprovadosOuVinculos = precsAprovadas.totalItems > 0 || matriz.totalItems > 0
        } catch (e) {
          console.warn(
            '[produtosCompostosService.delete] Erro ao verificar vínculos de precificação:',
            e,
          )
        }

        if (temAprovadosOuVinculos) {
          if (prec.status !== 'inativo') {
            await pb.collection('prec_produtos').update(prec.id, { status: 'inativo' })
          }
        } else {
          await pb.collection('prec_produtos').delete(prec.id)
        }
      }
    } catch (e) {
      console.warn(
        '[produtosCompostosService.delete] Erro ao tratar prec_produtos correspondente:',
        e,
      )
    }

    return pb.collection('produtos').delete(id)
  },

  /**
   * Poda registros órfãos em prec_produtos (origem_id sem correspondente em produtos).
   * Registros com histórico aprovado ou vínculos de canal são desativados (status='inativo');
   * sem vínculos são removidos. produtos_base de catálogo permanece intocado.
   */
  async podarOrfaosPrecificacao(): Promise<{ removidos: number; desativados: number }> {
    let removidos = 0
    let desativados = 0
    try {
      const precs = await pb.collection('prec_produtos').getFullList({
        filter: 'origem_id != ""',
      })
      if (!precs || precs.length === 0) return { removidos, desativados }

      const produtosVivos = await pb.collection('produtos').getFullList({ fields: 'id' })
      const idsVivosSet = new Set(produtosVivos.map((p) => p.id))

      for (const prec of precs) {
        if (!prec.origem_id || idsVivosSet.has(prec.origem_id)) continue

        // É uma sombra órfã: verificar histórico aprovado e vínculos
        let temAprovadosOuVinculos = false
        try {
          const [precsAprovadas, matriz] = await Promise.all([
            pb.collection('prec_precificacoes').getList(1, 1, {
              filter: `produto = "${prec.id}" && (status = "aprovada" || preco_aprovado > 0)`,
            }),
            pb.collection('prec_matriz_classificacoes').getList(1, 1, {
              filter: `produto = "${prec.id}"`,
            }),
          ])
          temAprovadosOuVinculos = precsAprovadas.totalItems > 0 || matriz.totalItems > 0
        } catch {
          /* intentionally ignored */
        }

        if (temAprovadosOuVinculos) {
          if (prec.status !== 'inativo') {
            await pb.collection('prec_produtos').update(prec.id, { status: 'inativo' })
            desativados++
          }
        } else {
          await pb.collection('prec_produtos').delete(prec.id)
          removidos++
        }
      }
    } catch (e) {
      console.warn('[produtosCompostosService.podarOrfaosPrecificacao] Falha na poda:', e)
    }
    return { removidos, desativados }
  },

  /**
   * Sincroniza o Produto composto com `prec_produtos` (onde a Precificação lê)
   * A precificação SEMPRE lê o Produto Composto (após Composição), NUNCA o produtos_base isolado.
   * Deduplica por:
   * 1. origem_id = produtoId
   * 2. base_origem = prod.base_origem
   * 3. fornecedor_produto (quando base_origem veio de fornecedores_produtos)
   * 4. sku exato
   * 5. nome idêntico (quando não há outro match)
   * Além disso, executa poda preventiva de sombras órfãs.
   */
  async syncComPrecificacao(produtoId: string) {
    // Poda preventiva de sombras órfãs
    try {
      await this.podarOrfaosPrecificacao()
    } catch (e) {
      console.warn('[syncComPrecificacao] Falha na poda automática de órfãos:', e)
    }

    const prod = await this.getById(produtoId)
    if (!prod) return null

    const skuDesejado = (prod.sku || '').trim() || `PROD-${prod.id.slice(0, 8).toUpperCase()}`

    let precExistente: any = null
    try {
      // 1. Busca por origem_id do produto composto
      const porOrigem = await pb.collection('prec_produtos').getList(1, 1, {
        filter: `origem_id = "${prod.id}"`,
      })
      if (porOrigem.items.length > 0) {
        precExistente = porOrigem.items[0]
      }

      // 2. Busca por base_origem do produto composto
      if (!precExistente && prod.base_origem) {
        const porBase = await pb.collection('prec_produtos').getList(1, 1, {
          filter: `base_origem = "${prod.base_origem}"`,
        })
        if (porBase.items.length > 0) {
          precExistente = porBase.items[0]
        }
      }

      // 3. Se base_origem veio de fornecedores_produtos, busca por fornecedor_produto (legado)
      if (
        !precExistente &&
        prod.expand?.base_origem?.origem_colecao === 'fornecedores_produtos' &&
        prod.expand.base_origem.origem_id
      ) {
        const porFp = await pb.collection('prec_produtos').getList(1, 1, {
          filter: `fornecedor_produto = "${prod.expand.base_origem.origem_id}"`,
        })
        if (porFp.items.length > 0) {
          precExistente = porFp.items[0]
        }
      }

      // 4. Busca espelho pelo SKU desejado
      if (!precExistente) {
        const porSku = await pb.collection('prec_produtos').getList(1, 1, {
          filter: `sku = "${skuDesejado.replace(/"/g, '\\"')}"`,
        })
        if (porSku.items.length > 0) {
          precExistente = porSku.items[0]
        }
      }

      // 5. Busca por nome idêntico
      if (!precExistente && prod.nome) {
        const porNome = await pb.collection('prec_produtos').getList(1, 1, {
          filter: `nome = "${prod.nome.replace(/"/g, '\\"')}"`,
        })
        if (porNome.items.length > 0) {
          precExistente = porNome.items[0]
        }
      }
    } catch (e) {
      console.warn('[syncComPrecificacao] Falha na consulta de espelho existente:', e)
    }

    const custos = calcularCustosProdutoComposto({
      classificacao: prod.classificacao,
      custo_aquisicao: prod.custo_aquisicao,
      composicao: prod.composicao,
      custo_embalagem: prod.custo_embalagem,
      custo_etiqueta: prod.custo_etiqueta,
      perda_pct: prod.perda_pct,
    })

    const payload: Record<string, any> = {
      nome: prod.nome,
      tipo: prod.classificacao, // 'revenda' ou 'fabricacao_propria'
      sku: skuDesejado,
      custo_aquisicao_unitario: Number(prod.custo_aquisicao) || 0,
      custo_adicional_embalagem: custos.custo_embalagem,
      custo_etiqueta: Number(prod.custo_etiqueta) || 0,
      perda_pct: Number(prod.perda_pct) || 0,
      unidade: prod.unidade || 'un',
      dimensao_comprimento_cm: Number(prod.dimensao_comprimento_cm) || 0,
      dimensao_largura_cm: Number(prod.dimensao_largura_cm) || 0,
      dimensao_altura_cm: Number(prod.dimensao_altura_cm) || 0,
      peso_g: Number(prod.peso_g) || 0,
      status: prod.status || 'ativo',
      composicao: prod.composicao || [],
      origem_id: prod.id,
    }

    if (prod.base_origem) {
      payload.base_origem = prod.base_origem
    }

    // Se tiver empresa vinculada, preenche a primeira
    if (prod.empresas && prod.empresas.length > 0) {
      payload.empresa = prod.empresas[0]
    }

    // Se tiver base_origem com fornecedor, preenche
    if (prod.expand?.base_origem?.fornecedor) {
      payload.fornecedor = prod.expand.base_origem.fornecedor
    }
    if (
      prod.expand?.base_origem?.origem_colecao === 'fornecedores_produtos' &&
      prod.expand.base_origem.origem_id
    ) {
      payload.fornecedor_produto = prod.expand.base_origem.origem_id
    }

    let precSalvo: any = null
    if (precExistente) {
      precSalvo = await pb.collection('prec_produtos').update(precExistente.id, payload)
    } else {
      precSalvo = await pb.collection('prec_produtos').create(payload)
    }

    return precSalvo
  },

  getImageUrl(record: { id: string; imagem?: string }, thumb?: string): string {
    if (!record.imagem) return ''
    const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
    const query = thumb ? `?thumb=${thumb}` : ''
    return `${baseUrl}/api/files/produtos/${record.id}/${record.imagem}${query}`
  },
}
