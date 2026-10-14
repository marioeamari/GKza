import pb from '@/lib/pocketbase/client'
import { OrcamentoRecord, OrcamentoItemRecord, CreateOrcamentoInput } from '@/types/orcamento'
import { PrecCanalRecord } from '@/types/precificacao'
import {
  calcularTotaisPorCanal,
  normalizarOrcamentoRecord,
  normalizarCanaisComparadosIds,
} from '@/lib/precificacao/orcamentoCalculo'

function gerarTokenAleatorio(tamanho = 32): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < tamanho; i++) {
    token += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return token
}

function gerarCodigoOrcamento(): string {
  const agora = new Date()
  const ano = agora.getFullYear().toString().slice(-2)
  const mes = String(agora.getMonth() + 1).padStart(2, '0')
  const random = Math.random().toString(36).substring(2, 6).toUpperCase()
  return `ORC-${ano}${mes}-${random}`
}

export const orcamentosService = {
  /**
   * Lista orçamentos autenticado com ordenação recente
   */
  async listOrcamentos(filtro?: string): Promise<OrcamentoRecord[]> {
    const rawList = await pb.collection('orcamentos').getFullList<OrcamentoRecord>({
      filter: filtro || '',
      sort: '-created',
      expand: 'cliente,cliente_pessoa,canais_comparados,tema',
    })

    return (rawList || []).map((orc) => normalizarOrcamentoRecord(orc))
  },

  /**
   * Busca um orçamento pelo ID (autenticado) com itens expandidos
   */
  async getOrcamento(id: string): Promise<OrcamentoRecord> {
    const orcRaw = await pb.collection('orcamentos').getOne<OrcamentoRecord>(id, {
      expand: 'cliente,cliente_pessoa,canais_comparados,tema',
    })

    const itensRaw = await pb.collection('orcamento_itens').getFullList<OrcamentoItemRecord>({
      filter: `orcamento="${id}"`,
      sort: 'ordem,created',
      expand: 'modelo',
    })

    const orcNormalizado = normalizarOrcamentoRecord({
      ...orcRaw,
      expand: {
        ...orcRaw?.expand,
        itens: itensRaw || [],
      },
    })

    // Se expand.canais_comparados estiver vazio ou incompleto mas canais_comparados tiver IDs,
    // busca os canais na coleção prec_canais para garantir que a lista de canais venha preenchida
    const canaisExpandidos = orcNormalizado.expand?.canais_comparados || []
    const canaisIds = orcNormalizado.canais_comparados || []
    if (canaisIds.length > 0 && canaisExpandidos.length < canaisIds.length) {
      try {
        const canaisFiltro = canaisIds.map((cId) => `id="${cId}"`).join(' || ')
        const canaisDb = await pb.collection('prec_canais').getFullList<PrecCanalRecord>({
          filter: canaisFiltro,
        })
        if (canaisDb && canaisDb.length > 0) {
          orcNormalizado.expand = {
            ...orcNormalizado.expand,
            canais_comparados: canaisDb,
          }
        }
      } catch (err) {
        console.warn('Não foi possível complementar canais de orçamento:', err)
      }
    }

    return orcNormalizado
  },

  /**
   * Busca orçamento pelo token público (SEM autenticação)
   * Usa viewRule pública de orcamentos e orcamento_itens passando token como query param
   */
  async getOrcamentoPublico(token: string): Promise<OrcamentoRecord> {
    if (!token || !token.trim()) {
      throw new Error('Token de orçamento não informado')
    }

    // Busca o registro pelo token via query param
    const orcamentos = await pb.collection('orcamentos').getList<OrcamentoRecord>(1, 1, {
      filter: `public_token="${token}" && link_publico_ativo=true`,
      query: { token },
      expand: 'canais_comparados,tema',
    })

    if (!orcamentos.items || orcamentos.items.length === 0) {
      throw new Error('Orçamento não encontrado ou link expirado/desativado.')
    }

    const orc = orcamentos.items[0]

    // Busca os itens do orçamento passando o token como query param
    const itens = await pb.collection('orcamento_itens').getFullList<OrcamentoItemRecord>({
      filter: `orcamento="${orc.id}"`,
      sort: 'ordem,created',
      query: { token },
      expand: 'modelo',
    })

    const orcNormalizado = normalizarOrcamentoRecord({
      ...orc,
      expand: {
        ...orc?.expand,
        itens: itens || [],
      },
    })

    // Para a página pública, se os canais não vieram expandidos por restrição de prec_canais,
    // usamos os nomes já salvos em totais_por_canal (canal_id/canal_nome) sem requisição extra
    const canaisExpandidos = orcNormalizado.expand?.canais_comparados || []
    const canaisIds = orcNormalizado.canais_comparados || []
    if (canaisIds.length > 0 && canaisExpandidos.length === 0 && orcNormalizado.totais_por_canal) {
      const canaisDosTotais: PrecCanalRecord[] = Object.entries(
        orcNormalizado.totais_por_canal,
      ).map(
        ([cId, tot]) =>
          ({
            id: tot.canal_id || cId,
            nome: tot.canal_nome || 'Canal',
            tipo: 'marketplace',
            ativo: true,
          }) as PrecCanalRecord,
      )
      orcNormalizado.expand = {
        ...orcNormalizado.expand,
        canais_comparados: canaisDosTotais,
      }
    }

    return orcNormalizado
  },

  /**
   * Cria um orçamento completo com seus itens
   */
  async createOrcamento(input: CreateOrcamentoInput): Promise<OrcamentoRecord> {
    const publicToken = gerarTokenAleatorio(32)
    const codigo = input.codigo || gerarCodigoOrcamento()

    const canaisComparadosIds = normalizarCanaisComparadosIds(input.canais_comparados)

    // Resgata os canais para calcular os totais
    let canaisParaTotais: Array<{ id: string; nome: string }> = []
    if (canaisComparadosIds.length > 0) {
      const canaisDb = await pb.collection('prec_canais').getFullList({
        filter: canaisComparadosIds.map((c) => `id="${c}"`).join(' || '),
      })
      canaisParaTotais = canaisDb.map((c) => ({ id: c.id, nome: c.nome }))
    }

    const totais = calcularTotaisPorCanal(canaisParaTotais, input.itens)

    const orcData = {
      codigo,
      titulo: input.titulo || '',
      cliente: input.cliente || null,
      cliente_pessoa: input.cliente_pessoa || null,
      cliente_nome: input.cliente_nome,
      cliente_whatsapp: input.cliente_whatsapp || '',
      data_orcamento: input.data_orcamento,
      validade_dias: input.validade_dias || 7,
      validade_data: input.validade_data || null,
      status: input.status || 'rascunho',
      canais_comparados: canaisComparadosIds,
      tema: input.tema || null,
      tema_nome: input.tema_nome || '',
      cor: input.cor || '',
      observacoes: input.observacoes || '',
      public_token: publicToken,
      link_publico_ativo: true,
      totais_por_canal: totais,
    }

    const createdOrc = await pb.collection('orcamentos').create<OrcamentoRecord>(orcData)

    // Cria os itens
    const itensCriados: OrcamentoItemRecord[] = []
    for (let i = 0; i < input.itens.length; i++) {
      const it = input.itens[i]
      const itemRecord = await pb.collection('orcamento_itens').create<OrcamentoItemRecord>({
        orcamento: createdOrc.id,
        modelo: it.modelo || null,
        modelo_nome: it.modelo_nome,
        modelo_codigo: it.modelo_codigo || '',
        quantidade: it.quantidade,
        precos_canais: it.precos_canais || {},
        fretes_canais: it.fretes_canais || {},
        produtos_canais: it.produtos_canais || {},
        ordem: it.ordem ?? i,
      })
      itensCriados.push(itemRecord)
    }

    return {
      ...createdOrc,
      expand: {
        itens: itensCriados,
      },
    }
  },

  /**
   * Atualiza um orçamento e sincroniza seus itens
   */
  async updateOrcamento(
    id: string,
    input: Partial<CreateOrcamentoInput>,
  ): Promise<OrcamentoRecord> {
    let canaisParaTotais: Array<{ id: string; nome: string }> = []
    const canaisComparadosIds =
      input.canais_comparados !== undefined
        ? normalizarCanaisComparadosIds(input.canais_comparados)
        : undefined

    if (canaisComparadosIds && canaisComparadosIds.length > 0) {
      const canaisDb = await pb.collection('prec_canais').getFullList({
        filter: canaisComparadosIds.map((c) => `id="${c}"`).join(' || '),
      })
      canaisParaTotais = canaisDb.map((c) => ({ id: c.id, nome: c.nome }))
    }

    const totais = input.itens ? calcularTotaisPorCanal(canaisParaTotais, input.itens) : undefined

    const updateData: Record<string, unknown> = {}
    if (input.titulo !== undefined) updateData.titulo = input.titulo
    if (input.cliente !== undefined) updateData.cliente = input.cliente || null
    if (input.cliente_pessoa !== undefined) updateData.cliente_pessoa = input.cliente_pessoa || null
    if (input.cliente_nome !== undefined) updateData.cliente_nome = input.cliente_nome
    if (input.cliente_whatsapp !== undefined) updateData.cliente_whatsapp = input.cliente_whatsapp
    if (input.data_orcamento !== undefined) updateData.data_orcamento = input.data_orcamento
    if (input.validade_dias !== undefined) updateData.validade_dias = input.validade_dias
    if (input.validade_data !== undefined) updateData.validade_data = input.validade_data || null
    if (input.status !== undefined) updateData.status = input.status
    if (canaisComparadosIds !== undefined) updateData.canais_comparados = canaisComparadosIds
    if (input.tema !== undefined) updateData.tema = input.tema || null
    if (input.tema_nome !== undefined) updateData.tema_nome = input.tema_nome
    if (input.cor !== undefined) updateData.cor = input.cor
    if (input.observacoes !== undefined) updateData.observacoes = input.observacoes
    if (totais !== undefined) updateData.totais_por_canal = totais

    const updatedOrc = await pb.collection('orcamentos').update<OrcamentoRecord>(id, updateData)

    // Sincroniza itens caso fornecidos
    if (input.itens) {
      const itensExistentes = await pb
        .collection('orcamento_itens')
        .getFullList<OrcamentoItemRecord>({
          filter: `orcamento="${id}"`,
        })
      const itensNovosIds = new Set(input.itens.map((i) => i.id).filter(Boolean))

      // Remove os excluídos
      for (const ex of itensExistentes) {
        if (!itensNovosIds.has(ex.id)) {
          await pb.collection('orcamento_itens').delete(ex.id)
        }
      }

      // Atualiza ou cria
      for (let i = 0; i < input.itens.length; i++) {
        const it = input.itens[i]
        if (it.id && itensExistentes.some((ex) => ex.id === it.id)) {
          await pb.collection('orcamento_itens').update(it.id, {
            modelo: it.modelo || null,
            modelo_nome: it.modelo_nome,
            modelo_codigo: it.modelo_codigo || '',
            quantidade: it.quantidade,
            precos_canais: it.precos_canais || {},
            fretes_canais: it.fretes_canais || {},
            produtos_canais: it.produtos_canais || {},
            ordem: it.ordem ?? i,
          })
        } else {
          await pb.collection('orcamento_itens').create({
            orcamento: id,
            modelo: it.modelo || null,
            modelo_nome: it.modelo_nome,
            modelo_codigo: it.modelo_codigo || '',
            quantidade: it.quantidade,
            precos_canais: it.precos_canais || {},
            fretes_canais: it.fretes_canais || {},
            produtos_canais: it.produtos_canais || {},
            ordem: it.ordem ?? i,
          })
        }
      }
    }

    return this.getOrcamento(id)
  },

  /**
   * Regenera o token do link público para revogar acessos anteriores
   */
  async regenerarTokenPublico(id: string): Promise<{ public_token: string }> {
    const novoToken = gerarTokenAleatorio(32)
    await pb.collection('orcamentos').update(id, {
      public_token: novoToken,
      link_publico_ativo: true,
    })
    return { public_token: novoToken }
  },

  /**
   * Alterna o estado de ativação do link público
   */
  async toggleLinkPublico(id: string, ativo: boolean): Promise<boolean> {
    await pb.collection('orcamentos').update(id, {
      link_publico_ativo: ativo,
    })
    return ativo
  },

  /**
   * Deleta um orçamento
   */
  async deleteOrcamento(id: string): Promise<void> {
    await pb.collection('orcamentos').delete(id)
  },

  /**
   * Busca todas as precificações APROVADAS de um canal específico (/precificacao/aprovados),
   * retornando os produtos disponíveis com seu preço unitário aprovado naquele canal.
   */
  async listarProdutosAprovadosPorCanal(canalId: string): Promise<
    Array<{
      precificacao_id: string
      produto_id: string
      produto_nome: string
      produto_sku?: string
      preco_aprovado: number
      modalidade_nome?: string
    }>
  > {
    if (!canalId) return []
    try {
      const records = await pb.collection('prec_precificacoes').getFullList({
        filter: `canal="${canalId}" && status="aprovada"`,
        sort: '-aprovado_em,-created',
        expand: 'produto,modalidade',
      })

      const mapPorProduto = new Map<
        string,
        {
          precificacao_id: string
          produto_id: string
          produto_nome: string
          produto_sku?: string
          preco_aprovado: number
          modalidade_nome?: string
        }
      >()

      for (const r of records) {
        const prod = (r as any).expand?.produto
        if (!prod || !prod.id) continue
        if (!mapPorProduto.has(prod.id)) {
          mapPorProduto.set(prod.id, {
            precificacao_id: r.id,
            produto_id: prod.id,
            produto_nome: prod.nome || prod.sku || 'Produto Sem Nome',
            produto_sku: prod.sku,
            preco_aprovado: Number(r.preco_aprovado) || 0,
            modalidade_nome: (r as any).expand?.modalidade?.nome,
          })
        }
      }

      return Array.from(mapPorProduto.values())
    } catch (err) {
      console.warn('Erro ao listar produtos aprovados do canal:', err)
      return []
    }
  },

  /**
   * Busca o preço de um produto aprovado específico em um canal
   */
  async getPrecoProdutoAprovadoCanal(
    produtoId: string,
    canalId: string,
  ): Promise<{
    preco: number | null
    precificacaoId?: string
    produtoNome?: string
    produtoSku?: string
  }> {
    try {
      if (!produtoId || !canalId) return { preco: null }
      const precs = await pb.collection('prec_precificacoes').getFullList({
        filter: `produto="${produtoId}" && canal="${canalId}" && status="aprovada"`,
        sort: '-aprovado_em,-created',
        expand: 'produto',
      })
      if (!precs || precs.length === 0) return { preco: null }
      const p = precs[0]
      const prod = (p as any).expand?.produto
      return {
        preco: Number(p.preco_aprovado) || 0,
        precificacaoId: p.id,
        produtoNome: prod?.nome,
        produtoSku: prod?.sku,
      }
    } catch {
      return { preco: null }
    }
  },
}
