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
      filters.push('(tipo_composicao = "personalizada" || tem_pedido_especial = true)')
    }
    if (options.search && options.search.trim()) {
      const q = options.search.trim()
      filters.push(
        `(numero_pedido ~ "${q}" || sku ~ "${q}" || produto_nome ~ "${q}" || cliente_nome ~ "${q}" || shopee_order_id ~ "${q}" || pedido_especial ~ "${q}" || codigo_rastreio ~ "${q}")`,
      )
    }

    return pb.collection('kit_pedidos').getFullList<KitPedido>({
      filter: filters.join(' && '),
      sort: '-created',
      expand: 'tema,produto_referencia,separador_atual,marketplace',
    })
  },

  async getPedidoByNumeroOuSku(termo: string): Promise<KitPedido | null> {
    const clean = termo.trim()
    if (!clean) return null

    try {
      // 1. Tenta por número exato ou shopee_order_id exato
      const porNum = await pb
        .collection('kit_pedidos')
        .getFirstListItem<KitPedido>(`numero_pedido = "${clean}" || shopee_order_id = "${clean}"`, {
          expand: 'tema,produto_referencia,separador_atual,marketplace',
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
          `numero_pedido ~ "${clean}" || shopee_order_id ~ "${clean}" || sku = "${clean}" || sku ~ "${clean}"`,
          { expand: 'tema,produto_referencia,separador_atual,marketplace' },
        )
      return porFiltro
    } catch (_) {
      return null
    }
  },

  async getPedidoByCodigoRastreio(codigoRastreio: string): Promise<KitPedido | null> {
    const clean = codigoRastreio.trim()
    if (!clean) return null

    try {
      // Busca exata por código de rastreio (requisito do usuário: busca exata por ele)
      const porRastreio = await pb
        .collection('kit_pedidos')
        .getFirstListItem<KitPedido>(`codigo_rastreio = "${clean}"`, {
          expand: 'tema,produto_referencia,separador_atual,marketplace',
        })
      return porRastreio
    } catch {
      // Fallback tolerante caso venha com pequenas variações de espaços
      try {
        const porRastreioAprox = await pb
          .collection('kit_pedidos')
          .getFirstListItem<KitPedido>(`codigo_rastreio ~ "${clean}"`, {
            expand: 'tema,produto_referencia,separador_atual,marketplace',
          })
        return porRastreioAprox
      } catch {
        return null
      }
    }
  },

  async deletePedidosEmMassa(ids: string[]): Promise<{ sucesso: number; falhas: number }> {
    let sucesso = 0
    let falhas = 0
    for (const id of ids) {
      try {
        await pb.collection('kit_pedidos').delete(id)
        sucesso++
      } catch (e) {
        console.error(`Erro ao excluir pedido ${id}:`, e)
        falhas++
      }
    }
    return { sucesso, falhas }
  },

  async recalcularQuantidadesPedidos(catalogoProdutos: any[] = []): Promise<{
    atualizados: number
    inalterados: number
  }> {
    const { deduzirQuantidadeKit } = await import('@/lib/expedicaoShopeeParser')
    const pedidos = await pb.collection('kit_pedidos').getFullList<KitPedido>({
      expand: 'produto_referencia',
    })

    let atualizados = 0
    let inalterados = 0

    for (const pedido of pedidos) {
      const prodRef =
        pedido.expand?.produto_referencia ||
        catalogoProdutos.find((p) => p.sku === pedido.sku || p.id === pedido.produto_referencia)
      const ded = deduzirQuantidadeKit(
        pedido.sku || '',
        pedido.produto_nome,
        prodRef,
        pedido.variacao_anuncio,
      )

      if (ded.quantidade > 1 && pedido.quantidade_total !== ded.quantidade) {
        try {
          await pb.collection('kit_pedidos').update(pedido.id, {
            quantidade_total: ded.quantidade,
          })
          atualizados++
        } catch (err) {
          console.error(`Erro ao recalcular quantidade do pedido ${pedido.numero_pedido}:`, err)
          inalterados++
        }
      } else {
        inalterados++
      }
    }

    return { atualizados, inalterados }
  },

  async getPedidoById(id: string): Promise<KitPedido> {
    return pb.collection('kit_pedidos').getOne<KitPedido>(id, {
      expand: 'tema,separador_atual,marketplace',
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
        expand: 'marketplace,pedido,tema',
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
    pedidoEspecial?: string
    shopeeOrderId?: string
    codigoRastreio?: string
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
      pedido_especial: params.pedidoEspecial || '',
      shopee_order_id: params.shopeeOrderId || '',
      codigo_rastreio: params.codigoRastreio || '',
    })

    return rec
  },
}
