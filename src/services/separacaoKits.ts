import pb from '@/lib/pocketbase/client'
import type {
  KitTema,
  KitModelo,
  KitRegra,
  KitPedido,
  KitHistoricoSeparacao,
  ItemSeparacaoCalculada,
} from '@/types/separacaoKits'

export const separacaoKitsService = {
  // --- TEMAS ---
  async getTemas(options: { apenasAtivos?: boolean } = {}): Promise<KitTema[]> {
    const filter = options.apenasAtivos ? 'ativo = true' : ''
    return pb.collection('kit_temas').getFullList<KitTema>({
      filter,
      sort: 'ordem,nome',
    })
  },

  async getTemaById(id: string): Promise<KitTema> {
    return pb.collection('kit_temas').getOne<KitTema>(id)
  },

  async createTema(data: Partial<KitTema>): Promise<KitTema> {
    return pb.collection('kit_temas').create<KitTema>(data)
  },

  async updateTema(id: string, data: Partial<KitTema>): Promise<KitTema> {
    return pb.collection('kit_temas').update<KitTema>(id, data)
  },

  async deleteTema(id: string): Promise<boolean> {
    return pb.collection('kit_temas').delete(id)
  },

  // --- MODELOS ---
  async getModelos(temaId?: string, apenasAtivos = false): Promise<KitModelo[]> {
    const filters: string[] = []
    if (temaId) filters.push(`tema = "${temaId}"`)
    if (apenasAtivos) filters.push('ativo = true')

    return pb.collection('kit_modelos').getFullList<KitModelo>({
      filter: filters.join(' && '),
      sort: 'ordem,codigo',
      expand: 'tema',
    })
  },

  async createModelo(data: FormData | Partial<KitModelo>): Promise<KitModelo> {
    return pb.collection('kit_modelos').create<KitModelo>(data)
  },

  async updateModelo(id: string, data: FormData | Partial<KitModelo>): Promise<KitModelo> {
    return pb.collection('kit_modelos').update<KitModelo>(id, data)
  },

  async deleteModelo(id: string): Promise<boolean> {
    return pb.collection('kit_modelos').delete(id)
  },

  async reordenarModelos(itens: { id: string; ordem: number }[]): Promise<void> {
    // Atualiza a ordem dos modelos para manter o critério de distribuição de excedentes
    for (const item of itens) {
      await pb.collection('kit_modelos').update(item.id, { ordem: item.ordem })
    }
  },

  // --- REGRAS ---
  async getRegras(temaId?: string): Promise<KitRegra[]> {
    const filter = temaId ? `tema = "${temaId}"` : ''
    return pb.collection('kit_regras').getFullList<KitRegra>({
      filter,
      sort: 'tipo,quantidade_kit',
      expand: 'tema',
    })
  },

  async createRegra(data: Partial<KitRegra>): Promise<KitRegra> {
    return pb.collection('kit_regras').create<KitRegra>(data)
  },

  async updateRegra(id: string, data: Partial<KitRegra>): Promise<KitRegra> {
    return pb.collection('kit_regras').update<KitRegra>(id, data)
  },

  async deleteRegra(id: string): Promise<boolean> {
    return pb.collection('kit_regras').delete(id)
  },

  // --- PEDIDOS ---
  async getPedidos(
    options: {
      status?: string
      search?: string
      apenasPersonalizados?: boolean
    } = {},
  ): Promise<KitPedido[]> {
    const filters: string[] = []

    if (options.status && options.status !== 'todos') {
      filters.push(`status_separacao = "${options.status}"`)
    }
    if (options.apenasPersonalizados) {
      filters.push('tipo_composicao = "personalizada"')
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim()
      filters.push(
        `(numero_pedido ~ "${q}" || sku ~ "${q}" || produto_nome ~ "${q}" || cliente_nome ~ "${q}")`,
      )
    }

    return pb.collection('kit_pedidos').getFullList<KitPedido>({
      filter: filters.join(' && '),
      sort: '-created',
      expand: 'tema,separador_atual',
    })
  },

  async getPedidoByNumeroOuSku(termo: string): Promise<KitPedido | null> {
    const clean = termo.trim()
    if (!clean) return null

    try {
      // 1. Tenta por número exato
      const porNum = await pb
        .collection('kit_pedidos')
        .getFirstListItem<KitPedido>(`numero_pedido = "${clean}"`, {
          expand: 'tema,separador_atual',
        })
      if (porNum) return porNum
    } catch {
      /* intentionally ignored */
    }

    try {
      // 2. Tenta por número aproximado ou SKU
      const porFiltro = await pb
        .collection('kit_pedidos')
        .getFirstListItem<KitPedido>(
          `numero_pedido ~ "${clean}" || sku = "${clean}" || sku ~ "${clean}"`,
          { expand: 'tema,separador_atual' },
        )
      return porFiltro
    } catch (_) {
      return null
    }
  },

  async getPedidoById(id: string): Promise<KitPedido> {
    return pb.collection('kit_pedidos').getOne<KitPedido>(id, {
      expand: 'tema,separador_atual',
    })
  },

  async createPedido(data: Partial<KitPedido>): Promise<KitPedido> {
    return pb.collection('kit_pedidos').create<KitPedido>(data)
  },

  async updatePedido(id: string, data: Partial<KitPedido>): Promise<KitPedido> {
    return pb.collection('kit_pedidos').update<KitPedido>(id, data)
  },

  async deletePedido(id: string): Promise<boolean> {
    return pb.collection('kit_pedidos').delete(id)
  },

  // --- HISTÓRICO DE SEPARAÇÃO ---
  async getHistorico(limit = 100): Promise<KitHistoricoSeparacao[]> {
    return pb
      .collection('kit_historico_separacao')
      .getList<KitHistoricoSeparacao>(1, limit, {
        sort: '-created',
      })
      .then((res) => res.items)
  },

  async registrarInicioSeparacao(
    pedido: KitPedido,
    userId?: string,
    userName?: string,
  ): Promise<KitHistoricoSeparacao> {
    // Altera status do pedido para 'em_separacao'
    try {
      await pb.collection('kit_pedidos').update(pedido.id, {
        status_separacao: 'em_separacao',
        separador_atual: userId || null,
      })
    } catch {
      /* intentionally ignored */
    }

    const rec = await pb.collection('kit_historico_separacao').create<KitHistoricoSeparacao>({
      pedido: pedido.id,
      numero_pedido: pedido.numero_pedido,
      marketplace: pedido.marketplace || '',
      produto_nome: pedido.produto_nome,
      sku: pedido.sku || '',
      tema: pedido.tema,
      tema_nome: pedido.expand?.tema?.nome || '',
      quantidade_total: pedido.quantidade_total,
      tipo_composicao: pedido.tipo_composicao,
      composicao_utilizada: pedido.composicao_personalizada || [],
      funcionario: userId || null,
      funcionario_nome: userName || 'Funcionário Expedição',
      data_inicio: new Date().toISOString(),
      status: 'em_separacao',
    })
    return rec
  },

  async finalizarSeparacao(params: {
    pedidoId?: string
    numeroPedido: string
    marketplace?: string
    produtoNome?: string
    sku?: string
    temaId?: string
    temaNome?: string
    quantidadeTotal: number
    tipoComposicao: 'padrao' | 'personalizada'
    regraOrigem: 'personalizada' | 'manual' | 'automatica'
    composicaoUtilizada: ItemSeparacaoCalculada[]
    funcionarioId?: string
    funcionarioNome?: string
    dataInicio?: string
    observacoes?: string
  }): Promise<KitHistoricoSeparacao> {
    // Se houver pedidoId, marca o pedido como 'finalizado'
    if (params.pedidoId) {
      try {
        await pb.collection('kit_pedidos').update(params.pedidoId, {
          status_separacao: 'finalizado',
        })
      } catch {
        /* intentionally ignored */
      }
    }

    const agora = new Date().toISOString()

    const rec = await pb.collection('kit_historico_separacao').create<KitHistoricoSeparacao>({
      pedido: params.pedidoId || null,
      numero_pedido: params.numeroPedido,
      marketplace: params.marketplace || '',
      produto_nome: params.produtoNome || 'Kit de Personagens',
      sku: params.sku || '',
      tema: params.temaId || null,
      tema_nome: params.temaNome || '',
      quantidade_total: params.quantidadeTotal,
      tipo_composicao: params.tipoComposicao,
      regra_origem: params.regraOrigem,
      composicao_utilizada: params.composicaoUtilizada,
      funcionario: params.funcionarioId || null,
      funcionario_nome: params.funcionarioNome || 'Funcionário Expedição',
      data_inicio: params.dataInicio || agora,
      data_fim: agora,
      status: 'finalizado',
      observacoes: params.observacoes || '',
    })

    return rec
  },
}
