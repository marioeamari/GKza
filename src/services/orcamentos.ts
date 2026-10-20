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
      expand: 'modelo,tema',
    })

    const itensComposicao = (itensRaw || []).map((it: any) => {
      let composicaoArray: any[] = []
      if (Array.isArray(it.composicao)) {
        composicaoArray = it.composicao
      } else if (typeof it.composicao === 'string' && it.composicao.trim()) {
        try {
          const parsed = JSON.parse(it.composicao)
          if (Array.isArray(parsed)) composicaoArray = parsed
        } catch {
          composicaoArray = []
        }
      }

      let composicaoReceitaArray: any[] = []
      if (Array.isArray(it.composicao_receita)) {
        composicaoReceitaArray = it.composicao_receita
      } else if (typeof it.composicao_receita === 'string' && it.composicao_receita.trim()) {
        try {
          const parsed = JSON.parse(it.composicao_receita)
          if (Array.isArray(parsed)) composicaoReceitaArray = parsed
        } catch {
          composicaoReceitaArray = []
        }
      }

      return {
        ...it,
        composicao: composicaoArray,
        composicao_receita: composicaoReceitaArray,
      }
    })

    const orcNormalizado = normalizarOrcamentoRecord({
      ...orcRaw,
      expand: {
        ...orcRaw?.expand,
        itens: itensComposicao,
      },
    })
    // Se expand.canais_comparados estiver vazio ou incompleto mas canais_comparados ou totais_por_canal tiver IDs,
    // busca os canais na coleção prec_canais para garantir que a lista de canais venha preenchida
    const canaisExpandidos = orcNormalizado.expand?.canais_comparados || []
    const canaisIds = orcNormalizado.canais_comparados || []
    const chavesTotais = orcNormalizado.totais_por_canal
      ? Object.keys(orcNormalizado.totais_por_canal)
      : []
    const todosIds = Array.from(new Set([...canaisIds, ...chavesTotais]))

    if (todosIds.length > 0 && canaisExpandidos.length < todosIds.length) {
      try {
        const canaisFiltro = todosIds.map((cId) => `id="${cId}"`).join(' || ')
        const canaisDb = await pb.collection('prec_canais').getFullList<PrecCanalRecord>({
          filter: canaisFiltro,
        })
        if (canaisDb && canaisDb.length > 0) {
          orcNormalizado.expand = {
            ...orcNormalizado.expand,
            canais_comparados: canaisDb,
          }
          if (canaisIds.length < canaisDb.length) {
            orcNormalizado.canais_comparados = canaisDb.map((c) => c.id)
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
      expand: 'modelo,tema',
    })

    const itensComposicao = (itens || []).map((it: any) => {
      let composicaoArray: any[] = []
      if (Array.isArray(it.composicao)) {
        composicaoArray = it.composicao
      } else if (typeof it.composicao === 'string' && it.composicao.trim()) {
        try {
          const parsed = JSON.parse(it.composicao)
          if (Array.isArray(parsed)) composicaoArray = parsed
        } catch {
          composicaoArray = []
        }
      }

      let composicaoReceitaArray: any[] = []
      if (Array.isArray(it.composicao_receita)) {
        composicaoReceitaArray = it.composicao_receita
      } else if (typeof it.composicao_receita === 'string' && it.composicao_receita.trim()) {
        try {
          const parsed = JSON.parse(it.composicao_receita)
          if (Array.isArray(parsed)) composicaoReceitaArray = parsed
        } catch {
          composicaoReceitaArray = []
        }
      }

      return {
        ...it,
        composicao: composicaoArray,
        composicao_receita: composicaoReceitaArray,
      }
    })

    const orcNormalizado = normalizarOrcamentoRecord({
      ...orc,
      expand: {
        ...orc?.expand,
        itens: itensComposicao,
      },
    })
    // Para a página pública, se os canais não vieram expandidos por restrição de prec_canais,
    // usamos os nomes já salvos em totais_por_canal (canal_id/canal_nome) sem requisição extra
    const canaisExpandidos = orcNormalizado.expand?.canais_comparados || []
    const canaisIds = orcNormalizado.canais_comparados || []
    if (
      orcNormalizado.totais_por_canal &&
      (canaisExpandidos.length === 0 ||
        canaisExpandidos.length < Object.keys(orcNormalizado.totais_por_canal).length)
    ) {
      const canaisDosTotais: PrecCanalRecord[] = Object.entries(
        orcNormalizado.totais_por_canal,
      ).map(
        ([cId, tot]) =>
          ({
            id: tot.canal_id || cId,
            nome:
              tot.canal_nome ||
              (cId.toLowerCase().includes('site') ? 'Site Loja Integrada KzaMari' : 'Canal'),
            tipo:
              cId.toLowerCase().includes('site') || tot?.canal_nome?.toLowerCase().includes('site')
                ? 'site_proprio'
                : 'marketplace',
            ativo: true,
          }) as PrecCanalRecord,
      )
      orcNormalizado.expand = {
        ...orcNormalizado.expand,
        canais_comparados: canaisDosTotais,
      }
      if (canaisIds.length < canaisDosTotais.length) {
        orcNormalizado.canais_comparados = canaisDosTotais.map((c) => c.id)
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
      const tipoItem = it.tipo_item || (it.modelo || it.tema ? 'cadastrado' : 'personalizado')
      const formData = new FormData()
      formData.append('orcamento', createdOrc.id)
      formData.append('tipo_item', tipoItem)
      formData.append('modelo_nome', it.modelo_nome)
      formData.append('modelo_codigo', it.modelo_codigo || '')
      formData.append('descricao', it.descricao || '')
      formData.append('quantidade', String(it.quantidade))
      formData.append('ordem', String(it.ordem ?? i))
      formData.append('precos_canais', JSON.stringify(it.precos_canais || {}))
      formData.append('fretes_canais', JSON.stringify(it.fretes_canais || {}))
      formData.append('produtos_canais', JSON.stringify(it.produtos_canais || {}))
      formData.append('composicao', JSON.stringify(it.composicao || []))
      formData.append('composicao_receita', JSON.stringify(it.composicao_receita || []))

      if (it.modelo) formData.append('modelo', it.modelo)
      if (it.tema) formData.append('tema', it.tema)
      if (it.tema_nome) formData.append('tema_nome', it.tema_nome)
      if (it.cor) formData.append('cor', it.cor)
      if (it.foto_url) formData.append('foto_url', it.foto_url)

      if (it.imagem_anexo instanceof File) {
        formData.append('imagem_anexo', it.imagem_anexo)
      } else if (typeof it.imagem_anexo === 'string' && it.imagem_anexo) {
        formData.append('imagem_anexo', it.imagem_anexo)
      }

      const itemRecord = await pb
        .collection('orcamento_itens')
        .create<OrcamentoItemRecord>(formData)
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
        const tipoItem = it.tipo_item || (it.modelo || it.tema ? 'cadastrado' : 'personalizado')
        const formData = new FormData()
        formData.append('orcamento', id)
        formData.append('tipo_item', tipoItem)
        formData.append('modelo_nome', it.modelo_nome)
        formData.append('modelo_codigo', it.modelo_codigo || '')
        formData.append('descricao', it.descricao || '')
        formData.append('quantidade', String(it.quantidade))
        formData.append('ordem', String(it.ordem ?? i))
        formData.append('precos_canais', JSON.stringify(it.precos_canais || {}))
        formData.append('fretes_canais', JSON.stringify(it.fretes_canais || {}))
        formData.append('produtos_canais', JSON.stringify(it.produtos_canais || {}))
        formData.append('composicao', JSON.stringify(it.composicao || []))
        formData.append('composicao_receita', JSON.stringify(it.composicao_receita || []))

        if (it.modelo) formData.append('modelo', it.modelo)
        else formData.append('modelo', '')

        if (it.tema) formData.append('tema', it.tema)
        else formData.append('tema', '')

        formData.append('tema_nome', it.tema_nome || '')
        formData.append('cor', it.cor || '')
        formData.append('foto_url', it.foto_url || '')

        if (it.imagem_anexo instanceof File) {
          formData.append('imagem_anexo', it.imagem_anexo)
        } else if (typeof it.imagem_anexo === 'string' && it.imagem_anexo) {
          formData.append('imagem_anexo', it.imagem_anexo)
        }

        if (it.id && itensExistentes.some((ex) => ex.id === it.id)) {
          await pb.collection('orcamento_itens').update(it.id, formData)
        } else {
          await pb.collection('orcamento_itens').create(formData)
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
   * Agrupa cenários aprovados por Produto + Modalidade garantindo que:
   * (C) Todas as modalidades referente ao produto aprovado no repositório apareçam
   * (ex.: BLeve Shopee Half, MEI e S/N como entradas separadas).
   *
   * Critérios:
   * - status 'aprovada' tem prioridade sobre 'desatualizada'
   * - desempate pelo cenário mais recente
   * - chave única ${produto_id}__${modalidade_id || 'padrao'} para nunca duplicar
   */
  agruparCenariosAprovadosPorProdutoEModalidade(records: any[]): Array<{
    precificacao_id: string
    produto_id: string
    produto_nome: string
    produto_sku?: string
    preco_aprovado: number
    modalidade_id?: string
    modalidade_nome?: string
    precificacao_record?: any
    status_precificacao?: 'aprovada' | 'desatualizada' | string
    desatualizada?: boolean
  }> {
    if (!Array.isArray(records) || records.length === 0) return []

    const parseTime = (val?: string) => (val ? new Date(val).getTime() : 0)

    const ordenados = [...records].sort((a: any, b: any) => {
      const aAprovada = a.status === 'aprovada' ? 1 : 0
      const bAprovada = b.status === 'aprovada' ? 1 : 0
      if (aAprovada !== bAprovada) {
        return bAprovada - aAprovada
      }
      const timeA = Math.max(parseTime(a.aprovado_em), parseTime(a.updated), parseTime(a.created))
      const timeB = Math.max(parseTime(b.aprovado_em), parseTime(b.updated), parseTime(b.created))
      return timeB - timeA
    })

    const mapPorProdutoModalidade = new Map<
      string,
      {
        precificacao_id: string
        produto_id: string
        produto_nome: string
        produto_sku?: string
        preco_aprovado: number
        modalidade_id?: string
        modalidade_nome?: string
        precificacao_record?: any
        status_precificacao?: 'aprovada' | 'desatualizada' | string
        desatualizada?: boolean
      }
    >()

    for (const r of ordenados) {
      const prod =
        r.expand?.produto || (r.produto && typeof r.produto === 'object' ? r.produto : null)
      const prodId = prod?.id || (typeof r.produto === 'string' ? r.produto : '')
      if (!prodId) continue

      const preco = Number(r.preco_aprovado) || 0
      if (preco <= 0) continue

      const mod =
        r.expand?.modalidade ||
        (r.modalidade && typeof r.modalidade === 'object' ? r.modalidade : null)
      const modId = mod?.id || (typeof r.modalidade === 'string' ? r.modalidade : '') || 'padrao'
      const modNome = mod?.nome || r.modalidade_nome || ''

      const chave = `${prodId}__${modId}`

      if (!mapPorProdutoModalidade.has(chave)) {
        const statusPrec = r.status || 'aprovada'
        const isDesatualizada = statusPrec === 'desatualizada'
        const prodNome = prod?.nome || prod?.sku || r.produto_nome || 'Produto Sem Nome'
        const prodSku = prod?.sku || r.produto_sku

        mapPorProdutoModalidade.set(chave, {
          precificacao_id: r.id,
          produto_id: prodId,
          produto_nome: prodNome,
          produto_sku: prodSku,
          preco_aprovado: preco,
          modalidade_id: modId !== 'padrao' ? modId : undefined,
          modalidade_nome: modNome || undefined,
          precificacao_record: r,
          status_precificacao: statusPrec,
          desatualizada: isDesatualizada,
        })
      }
    }

    return Array.from(mapPorProdutoModalidade.values())
  },

  /**
   * Busca produtos com cenários precificados do canal alinhado com /precificacao/aprovados.
   * Regra (C): A lista contém TODAS as modalidades referentes ao produto aprovado no repositório.
   */
  async listarProdutosAprovadosPorCanal(canalId: string): Promise<
    Array<{
      precificacao_id: string
      produto_id: string
      produto_nome: string
      produto_sku?: string
      preco_aprovado: number
      modalidade_id?: string
      modalidade_nome?: string
      precificacao_record?: any
      status_precificacao?: 'aprovada' | 'desatualizada' | string
      desatualizada?: boolean
    }>
  > {
    if (!canalId) return []
    try {
      const records = await pb.collection('prec_precificacoes').getFullList({
        filter: `canal="${canalId}" && preco_aprovado > 0 && (status="aprovada" || status="desatualizada")`,
        sort: '-aprovado_em,-updated,-created',
        expand: 'produto,modalidade',
      })

      return orcamentosService.agruparCenariosAprovadosPorProdutoEModalidade(records)
    } catch (err) {
      console.warn('Erro ao listar produtos aprovados do canal:', err)
      return []
    }
  },

  /**
   * Busca o registro detalhado de uma precificação aprovada pelo ID (ou por produto + canal)
   */
  async getPrecificacaoAprovadaDetalhada(
    precificacaoId?: string,
    produtoId?: string,
    canalId?: string,
  ): Promise<any | null> {
    try {
      if (precificacaoId) {
        return await pb.collection('prec_precificacoes').getOne(precificacaoId, {
          expand: 'produto,canal,modalidade',
        })
      }
      if (produtoId && canalId) {
        const precs = await pb.collection('prec_precificacoes').getFullList({
          filter: `produto="${produtoId}" && canal="${canalId}" && preco_aprovado > 0 && (status="aprovada" || status="desatualizada")`,
          sort: '-aprovado_em,-updated,-created',
          expand: 'produto,canal,modalidade',
        })
        if (!precs || precs.length === 0) return null

        const parseTime = (val?: string) => (val ? new Date(val).getTime() : 0)
        const ordenados = [...precs].sort((a: any, b: any) => {
          const aAprovada = a.status === 'aprovada' ? 1 : 0
          const bAprovada = b.status === 'aprovada' ? 1 : 0
          if (aAprovada !== bAprovada) return bAprovada - aAprovada
          const timeA = Math.max(
            parseTime(a.aprovado_em),
            parseTime(a.updated),
            parseTime(a.created),
          )
          const timeB = Math.max(
            parseTime(b.aprovado_em),
            parseTime(b.updated),
            parseTime(b.created),
          )
          return timeB - timeA
        })
        return ordenados[0] || null
      }
      return null
    } catch {
      return null
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
    status_precificacao?: string
    desatualizada?: boolean
  }> {
    try {
      if (!produtoId || !canalId) return { preco: null }
      const precs = await pb.collection('prec_precificacoes').getFullList({
        filter: `produto="${produtoId}" && canal="${canalId}" && preco_aprovado > 0 && (status="aprovada" || status="desatualizada")`,
        sort: '-aprovado_em,-updated,-created',
        expand: 'produto',
      })
      if (!precs || precs.length === 0) return { preco: null }

      const parseTime = (val?: string) => (val ? new Date(val).getTime() : 0)
      const ordenados = [...precs].sort((a: any, b: any) => {
        const aAprovada = a.status === 'aprovada' ? 1 : 0
        const bAprovada = b.status === 'aprovada' ? 1 : 0
        if (aAprovada !== bAprovada) return bAprovada - aAprovada
        const timeA = Math.max(parseTime(a.aprovado_em), parseTime(a.updated), parseTime(a.created))
        const timeB = Math.max(parseTime(b.aprovado_em), parseTime(b.updated), parseTime(b.created))
        return timeB - timeA
      })

      const p = ordenados[0]
      const prod = (p as any).expand?.produto
      return {
        preco: Number(p.preco_aprovado) || 0,
        precificacaoId: p.id,
        produtoNome: prod?.nome,
        produtoSku: prod?.sku,
        status_precificacao: p.status,
        desatualizada: p.status === 'desatualizada',
      }
    } catch {
      return { preco: null }
    }
  },
}
