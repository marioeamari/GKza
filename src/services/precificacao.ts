import pb from '@/lib/pocketbase/client'
import {
  PrecCanalModalidadeRecord,
  PrecCanalRecord,
  PrecCategoriaProdutoRecord,
  PrecKitRecord,
  PrecMatrizClassificacaoRecord,
  PrecMatrizLegendaRecord,
  PrecPerfilTributarioRecord,
  PrecPrecificacaoRecord,
  PrecProdutoRecord,
  PrecTaxaRecord,
} from '@/types/precificacao'

/**
 * Utilitária pura que descarta por padrão qualquer registro cujo tipo não seja
 * exatamente 'kit' ou 'combo' (incluindo '', null, undefined e valores desconhecidos).
 */
export function filtrarApenasKitsECombos(
  produtos: Array<Partial<PrecProdutoRecord> | null | undefined>,
): PrecProdutoRecord[] {
  if (!Array.isArray(produtos)) return []
  return produtos.filter(
    (p): p is PrecProdutoRecord => Boolean(p) && (p?.tipo === 'kit' || p?.tipo === 'combo'),
  )
}

export const precificacaoService = {
  // PRODUTOS
  async listProdutos(filter?: string): Promise<PrecProdutoRecord[]> {
    return pb.collection('prec_produtos').getFullList<PrecProdutoRecord>({
      filter: filter || '',
      sort: '-created',
      expand: 'empresa,fornecedor,fornecedor_produto',
    })
  },

  /**
   * Lista apenas produtos do tipo 'kit' ou 'combo' para Gestão de Kits & Combos (/precificacao/produtos)
   */
  async listKitsECombos(): Promise<PrecProdutoRecord[]> {
    return pb.collection('prec_produtos').getFullList<PrecProdutoRecord>({
      filter: 'tipo = "kit" || tipo = "combo"',
      sort: '-created',
      expand: 'empresa,fornecedor,fornecedor_produto',
    })
  },

  async listProdutosPorEmpresa(empresaId: string): Promise<PrecProdutoRecord[]> {
    return pb.collection('prec_produtos').getFullList<PrecProdutoRecord>({
      filter: `empresa = "${empresaId}" && tipo = "fabricacao_propria"`,
      sort: '-created',
      expand: 'empresa,fornecedor,fornecedor_produto',
    })
  },

  async listProdutosPorFornecedor(fornecedorId: string): Promise<PrecProdutoRecord[]> {
    return pb.collection('prec_produtos').getFullList<PrecProdutoRecord>({
      filter: `fornecedor = "${fornecedorId}" && tipo = "revenda"`,
      sort: '-created',
      expand: 'empresa,fornecedor,fornecedor_produto',
    })
  },

  async getProduto(id: string): Promise<PrecProdutoRecord> {
    return pb.collection('prec_produtos').getOne<PrecProdutoRecord>(id, {
      expand: 'empresa,fornecedor,fornecedor_produto',
    })
  },

  async createProduto(data: FormData | Partial<PrecProdutoRecord>): Promise<PrecProdutoRecord> {
    // Se for objeto simples (não FormData), garante que o campo imagem não seja enviado como string herdada
    if (!(data instanceof FormData) && typeof data.imagem === 'string') {
      const sanitized = { ...data }
      delete sanitized.imagem
      return pb.collection('prec_produtos').create<PrecProdutoRecord>(sanitized)
    }
    return pb.collection('prec_produtos').create<PrecProdutoRecord>(data)
  },

  /**
   * Determina se o payload de atualização de um produto altera campos que afetam custo,
   * taxas ou precificação. Campos puramente de identificação e cadastro
   * (como sku_por_canal/apelidos, nome, marca, categoria, codigo_barras, unidade, imagem)
   * NÃO devem invalidar precificações aprovadas.
   */
  afetaCustoOuPrecificacao(data: FormData | Partial<PrecProdutoRecord>): boolean {
    const camposDeCusto: Array<keyof PrecProdutoRecord> = [
      'tipo',
      'custo_aquisicao_unitario',
      'composicao',
      'perda_pct',
      'custo_adicional_embalagem',
      'custo_etiqueta',
      'despesas_compra',
      'qtd_por_kit',
      'qtd_produzida',
      'peso_g',
      'dimensao_comprimento_cm',
      'dimensao_largura_cm',
      'dimensao_altura_cm',
      'fornecedor',
      'fornecedor_produto',
    ]

    if (data instanceof FormData) {
      return camposDeCusto.some((campo) => data.has(campo))
    }

    const chavesEnviadas = Object.keys(data) as Array<keyof PrecProdutoRecord>
    return chavesEnviadas.some(
      (campo) => camposDeCusto.includes(campo) && data[campo] !== undefined,
    )
  },

  async updateProduto(
    id: string,
    data: FormData | Partial<PrecProdutoRecord>,
    opcoes?: { marcarDesatualizada?: boolean },
  ): Promise<PrecProdutoRecord> {
    let payload = data
    if (!(data instanceof FormData) && typeof data.imagem === 'string') {
      const sanitized = { ...data }
      delete sanitized.imagem
      payload = sanitized
    }
    const updated = await pb.collection('prec_produtos').update<PrecProdutoRecord>(id, payload)

    // Só marca precificações deste produto como desatualizadas se houver alteração
    // em campos que afetam custo ou se for explicitamente solicitado via opcoes.marcarDesatualizada
    const deveInvalidar =
      opcoes?.marcarDesatualizada ?? precificacaoService.afetaCustoOuPrecificacao(data)

    if (deveInvalidar) {
      await precificacaoService.marcarPrecificacoesComoDesatualizadas({ produtoId: id })
    }

    return updated
  },

  /**
   * Copia o arquivo de imagem de um registro de fornecedores_produtos para um registro de prec_produtos
   */
  async copiarImagemDeFornecedorProduto(
    precProdutoId: string,
    fornecedorProduto: { id: string; imagem?: string },
  ): Promise<PrecProdutoRecord | null> {
    if (!fornecedorProduto.imagem || !fornecedorProduto.id) return null

    try {
      const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
      const fileUrl = `${baseUrl}/api/files/fornecedores_produtos/${fornecedorProduto.id}/${fornecedorProduto.imagem}`

      const headers: Record<string, string> = {}
      if (pb.authStore.token) {
        headers['Authorization'] = pb.authStore.token
      }

      const response = await fetch(fileUrl, { headers })
      if (!response.ok) {
        console.warn(
          `[precificacaoService] Falha ao baixar imagem do fornecedor (${response.status}): ${fileUrl}`,
        )
        return null
      }

      const blob = await response.blob()
      // Extrair extensão ou nome do arquivo original
      const filename = fornecedorProduto.imagem.split('/').pop() || 'imagem_herdada.png'
      const file = new File([blob], filename, { type: blob.type || 'image/png' })

      const formData = new FormData()
      formData.append('imagem', file)

      return await pb.collection('prec_produtos').update<PrecProdutoRecord>(precProdutoId, formData)
    } catch (err) {
      console.warn(
        '[precificacaoService] Erro ao copiar imagem do fornecedor para prec_produtos:',
        err,
      )
      return null
    }
  },

  async deleteProduto(id: string): Promise<boolean> {
    // 1. Se houver prec_kits associado a este produto como produto_pai, removemos explicitamente antes
    try {
      const kitRecord = await precificacaoService.getKitByProdutoPai(id)
      if (kitRecord) {
        await pb.collection('prec_kits').delete(kitRecord.id)
      }
    } catch (err) {
      console.warn('[precificacaoService] Erro ao limpar kit associado:', err)
    }

    // 2. Remove o produto em si (seus prec_precificacoes possuem cascadeDelete no PB)
    return pb.collection('prec_produtos').delete(id)
  },

  getProdutoImageUrl(record: { id: string; imagem?: string }, thumb?: string): string {
    if (!record.imagem) return ''
    if (record.imagem.startsWith('blob:') || record.imagem.startsWith('data:')) {
      return record.imagem
    }
    const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
    const query = thumb ? `?thumb=${thumb}` : ''
    return `${baseUrl}/api/files/prec_produtos/${record.id}/${record.imagem}${query}`
  },

  // KITS
  async getKitByProdutoPai(produtoPaiId: string): Promise<PrecKitRecord | null> {
    const records = await pb.collection('prec_kits').getList<PrecKitRecord>(1, 1, {
      filter: `produto_pai = "${produtoPaiId}"`,
    })
    return records.items[0] || null
  },

  async saveKit(
    produtoPaiId: string,
    itens: PrecKitRecord['itens'],
    custosAdicionais: PrecKitRecord['custos_adicionais'],
  ): Promise<PrecKitRecord> {
    const existing = await precificacaoService.getKitByProdutoPai(produtoPaiId)
    if (existing) {
      return pb.collection('prec_kits').update<PrecKitRecord>(existing.id, {
        itens,
        custos_adicionais: custosAdicionais,
      })
    }
    return pb.collection('prec_kits').create<PrecKitRecord>({
      produto_pai: produtoPaiId,
      itens,
      custos_adicionais: custosAdicionais,
    })
  },

  // CANAIS
  async listCanais(apenasAtivos = false): Promise<PrecCanalRecord[]> {
    const filter = apenasAtivos ? 'ativo = true' : ''
    return pb.collection('prec_canais').getFullList<PrecCanalRecord>({
      filter,
      sort: 'ordem,nome',
      expand: 'marketplace',
    })
  },

  async findCanalByNome(nome: string): Promise<PrecCanalRecord | null> {
    try {
      const cleanNome = nome.trim()
      const records = await pb.collection('prec_canais').getList<PrecCanalRecord>(1, 1, {
        filter: `nome = "${cleanNome.replace(/"/g, '\\"')}"`,
      })
      return records.items[0] || null
    } catch {
      return null
    }
  },

  async createCanal(
    data: Partial<PrecCanalRecord>,
  ): Promise<{ canal: PrecCanalRecord; reativado?: boolean }> {
    const nome = (data.nome || '').trim()

    // 1. Verifica se já existe canal com este nome
    const existente = await precificacaoService.findCanalByNome(nome)
    if (existente) {
      if (!existente.ativo) {
        // Canal existia mas estava inativo: reativamos com os novos dados fornecidos
        const atualizado = await pb
          .collection('prec_canais')
          .update<PrecCanalRecord>(existente.id, {
            ...data,
            nome,
            ativo: true,
          })
        return { canal: atualizado, reativado: true }
      }
      // Se já está ativo, lança erro com mensagem clara
      const erro = new Error(`Já existe um canal ativo cadastrado com o nome "${nome}".`)
      erro.name = 'CanalDuplicadoError'
      throw erro
    }

    try {
      const created = await pb.collection('prec_canais').create<PrecCanalRecord>({
        ...data,
        nome,
      })
      return { canal: created, reativado: false }
    } catch (err: unknown) {
      // Se por concorrência estourou a unique constraint idx_prec_canais_nome
      const errObj = err as { data?: Record<string, { code?: string; message?: string }> }
      if (errObj?.data?.nome?.code === 'validation_not_unique') {
        // Tenta buscar se o registro concorrente está inativo para reativar
        const conc = await precificacaoService.findCanalByNome(nome)
        if (conc && !conc.ativo) {
          const atualizado = await pb.collection('prec_canais').update<PrecCanalRecord>(conc.id, {
            ...data,
            nome,
            ativo: true,
          })
          return { canal: atualizado, reativado: true }
        }
        const erro = new Error(`Já existe um canal cadastrado com o nome "${nome}".`)
        erro.name = 'CanalDuplicadoError'
        throw erro
      }
      throw err
    }
  },

  async updateCanal(id: string, data: Partial<PrecCanalRecord>): Promise<PrecCanalRecord> {
    return pb.collection('prec_canais').update<PrecCanalRecord>(id, data)
  },

  async deleteCanal(id: string): Promise<boolean> {
    return pb.collection('prec_canais').delete(id)
  },

  /**
   * Conta os vínculos dependentes de um canal
   */
  async countVinculosCanal(id: string): Promise<{
    taxas: number
    modalidades: number
    precificacoes: number
  }> {
    const [taxas, modalidades, precificacoes] = await Promise.all([
      pb.collection('prec_taxas').getList(1, 1, { filter: `canal = "${id}"` }),
      pb.collection('prec_canal_modalidades').getList(1, 1, { filter: `canal = "${id}"` }),
      pb.collection('prec_precificacoes').getList(1, 1, { filter: `canal = "${id}"` }),
    ])

    return {
      taxas: taxas.totalItems,
      modalidades: modalidades.totalItems,
      precificacoes: precificacoes.totalItems,
    }
  },

  /**
   * Conta os vínculos dependentes de uma modalidade
   */
  async countVinculosModalidade(id: string): Promise<{
    taxas: number
    precificacoes: number
  }> {
    const [taxas, precificacoes] = await Promise.all([
      pb.collection('prec_taxas').getList(1, 1, { filter: `modalidade = "${id}"` }),
      pb.collection('prec_precificacoes').getList(1, 1, { filter: `modalidade = "${id}"` }),
    ])

    return {
      taxas: taxas.totalItems,
      precificacoes: precificacoes.totalItems,
    }
  },

  /**
   * Exclusão em cascata segura de um canal e suas dependências:
   * 1. Remove precificações vinculadas a este canal
   * 2. Remove taxas vinculadas a este canal
   * 3. Remove modalidades vinculadas a este canal
   * 4. Remove o canal
   */
  async deleteCanalComVinculos(id: string): Promise<{
    taxasRemovidas: number
    modalidadesRemovidas: number
    precificacoesRemovidas: number
  }> {
    // 1. Precificações
    const precs = await pb.collection('prec_precificacoes').getFullList<PrecPrecificacaoRecord>({
      filter: `canal = "${id}"`,
    })
    for (const p of precs) {
      await pb.collection('prec_precificacoes').delete(p.id)
    }

    // 2. Taxas
    const txs = await pb.collection('prec_taxas').getFullList<PrecTaxaRecord>({
      filter: `canal = "${id}"`,
    })
    for (const t of txs) {
      await pb.collection('prec_taxas').delete(t.id)
    }

    // 3. Modalidades
    const mods = await pb
      .collection('prec_canal_modalidades')
      .getFullList<PrecCanalModalidadeRecord>({
        filter: `canal = "${id}"`,
      })
    for (const m of mods) {
      await pb.collection('prec_canal_modalidades').delete(m.id)
    }

    // 4. Canal
    await pb.collection('prec_canais').delete(id)

    return {
      taxasRemovidas: txs.length,
      modalidadesRemovidas: mods.length,
      precificacoesRemovidas: precs.length,
    }
  },

  /**
   * Exclusão de modalidade tratando vínculos de taxas e precificações que apontam para ela
   */
  async deleteModalidadeComVinculos(id: string): Promise<{
    taxasAfetadas: number
    precificacoesRemovidas: number
  }> {
    // 1. Precificações com essa modalidade específica
    const precs = await pb.collection('prec_precificacoes').getFullList<PrecPrecificacaoRecord>({
      filter: `modalidade = "${id}"`,
    })
    for (const p of precs) {
      await pb.collection('prec_precificacoes').delete(p.id)
    }

    // 2. Taxas vinculadas à modalidade
    const txs = await pb.collection('prec_taxas').getFullList<PrecTaxaRecord>({
      filter: `modalidade = "${id}"`,
    })
    for (const t of txs) {
      await pb.collection('prec_taxas').delete(t.id)
    }

    // 3. Modalidade
    await pb.collection('prec_canal_modalidades').delete(id)

    return {
      taxasAfetadas: txs.length,
      precificacoesRemovidas: precs.length,
    }
  },

  // MODALIDADES
  async listModalidades(canalId?: string): Promise<PrecCanalModalidadeRecord[]> {
    const filter = canalId ? `canal = "${canalId}"` : ''
    return pb.collection('prec_canal_modalidades').getFullList<PrecCanalModalidadeRecord>({
      filter,
      sort: 'nome',
      expand: 'canal',
    })
  },

  async createModalidade(
    data: Partial<PrecCanalModalidadeRecord>,
  ): Promise<PrecCanalModalidadeRecord> {
    return pb.collection('prec_canal_modalidades').create<PrecCanalModalidadeRecord>(data)
  },

  async updateModalidade(
    id: string,
    data: Partial<PrecCanalModalidadeRecord>,
  ): Promise<PrecCanalModalidadeRecord> {
    return pb.collection('prec_canal_modalidades').update<PrecCanalModalidadeRecord>(id, data)
  },

  async deleteModalidade(id: string): Promise<boolean> {
    return pb.collection('prec_canal_modalidades').delete(id)
  },

  // TAXAS
  async listTaxas(canalId?: string): Promise<PrecTaxaRecord[]> {
    const filter = canalId ? `canal = "${canalId}"` : ''
    return pb.collection('prec_taxas').getFullList<PrecTaxaRecord>({
      filter,
      sort: 'created',
      expand: 'canal,modalidade',
    })
  },

  async createTaxa(data: Partial<PrecTaxaRecord>): Promise<PrecTaxaRecord> {
    const res = await pb.collection('prec_taxas').create<PrecTaxaRecord>(data)
    if (data.canal) {
      await precificacaoService.marcarPrecificacoesComoDesatualizadas({ canalId: data.canal })
    }
    return res
  },

  async updateTaxa(id: string, data: Partial<PrecTaxaRecord>): Promise<PrecTaxaRecord> {
    const res = await pb.collection('prec_taxas').update<PrecTaxaRecord>(id, data)
    if (res.canal) {
      await precificacaoService.marcarPrecificacoesComoDesatualizadas({ canalId: res.canal })
    }
    return res
  },

  async conferirTaxa(id: string): Promise<PrecTaxaRecord> {
    const hoje = new Date().toISOString().split('T')[0]
    return pb.collection('prec_taxas').update<PrecTaxaRecord>(id, {
      status_conferencia: 'conferido',
      data_conferencia: hoje,
    })
  },

  async deleteTaxa(id: string): Promise<boolean> {
    return pb.collection('prec_taxas').delete(id)
  },

  // PERFIS TRIBUTÁRIOS
  async listPerfisTributarios(empresaId?: string): Promise<PrecPerfilTributarioRecord[]> {
    const filter = empresaId ? `empresa = "${empresaId}" || escopo = "operacao"` : ''
    return pb.collection('prec_perfis_tributarios').getFullList<PrecPerfilTributarioRecord>({
      filter,
      sort: '-created',
    })
  },

  async savePerfilTributario(
    data: Partial<PrecPerfilTributarioRecord>,
  ): Promise<PrecPerfilTributarioRecord> {
    if (data.id) {
      return pb
        .collection('prec_perfis_tributarios')
        .update<PrecPerfilTributarioRecord>(data.id, data)
    }
    return pb.collection('prec_perfis_tributarios').create<PrecPerfilTributarioRecord>(data)
  },

  // PRECIFICAÇÕES E CENÁRIOS
  async listPrecificacoes(filter?: string): Promise<PrecPrecificacaoRecord[]> {
    return pb.collection('prec_precificacoes').getFullList<PrecPrecificacaoRecord>({
      filter: filter || '',
      sort: '-updated',
      expand: 'produto,canal,modalidade,empresa,aprovado_por',
    })
  },

  async saveCenarioPrecificacao(data: {
    id?: string
    produto: string
    empresa?: string
    canal: string
    modalidade?: string
    versao?: number
    premissas: PrecPrecificacaoRecord['premissas']
    resultado: Record<string, unknown>
    status: 'rascunho' | 'aprovada' | 'desatualizada'
    custo_snapshot?: PrecPrecificacaoRecord['custo_snapshot']
    taxas_snapshot?: PrecPrecificacaoRecord['taxas_snapshot']
    preco_aprovado?: number
    aprovado_por?: string
    aprovado_em?: string
  }): Promise<PrecPrecificacaoRecord> {
    if (data.id) {
      return pb.collection('prec_precificacoes').update<PrecPrecificacaoRecord>(data.id, {
        ...data,
      })
    }

    const modFilter = data.modalidade ? `modalidade = "${data.modalidade}"` : 'modalidade = ""'

    // Se estiver aprovando, podemos atualizar o aprovado existente daquele canal/modalidade
    if (data.status === 'aprovada') {
      const existingAprovada = await pb
        .collection('prec_precificacoes')
        .getList<PrecPrecificacaoRecord>(1, 1, {
          filter: `produto = "${data.produto}" && canal = "${data.canal}" && ${modFilter} && status = "aprovada"`,
          sort: '-updated',
        })

      if (existingAprovada.items.length > 0) {
        const atual = existingAprovada.items[0]
        return pb.collection('prec_precificacoes').update<PrecPrecificacaoRecord>(atual.id, {
          versao: (atual.versao || 1) + 1,
          premissas: data.premissas,
          resultado: data.resultado,
          status: 'aprovada',
          custo_snapshot: data.custo_snapshot,
          taxas_snapshot: data.taxas_snapshot,
          preco_aprovado: data.preco_aprovado,
          aprovado_por: data.aprovado_por,
          aprovado_em: data.aprovado_em || new Date().toISOString(),
        })
      }
    }

    // Para rascunhos (ou primeiro aprovado), cria um novo registro preservando o histórico de salvos
    // Buscar a versão máxima para calcular a próxima versão
    let proximaVersao = 1
    try {
      const ultimos = await pb
        .collection('prec_precificacoes')
        .getList<PrecPrecificacaoRecord>(1, 1, {
          filter: `produto = "${data.produto}" && canal = "${data.canal}" && ${modFilter}`,
          sort: '-versao',
        })
      if (ultimos.items.length > 0 && ultimos.items[0].versao) {
        proximaVersao = ultimos.items[0].versao + 1
      }
    } catch {
      // fallback
    }

    return pb.collection('prec_precificacoes').create<PrecPrecificacaoRecord>({
      ...data,
      versao: data.versao || proximaVersao,
    })
  },

  async aprovarPreco(
    cenarioId: string,
    preco: number,
    userId: string,
  ): Promise<PrecPrecificacaoRecord> {
    const hoje = new Date().toISOString()
    // Buscar a precificação sendo aprovada para obter produto, canal e modalidade
    try {
      const atual = await pb
        .collection('prec_precificacoes')
        .getOne<PrecPrecificacaoRecord>(cenarioId)
      if (atual) {
        const modFilter = atual.modalidade
          ? `modalidade = "${atual.modalidade}"`
          : 'modalidade = ""'
        // Buscar outros aprovados desse mesmo produto/canal/modalidade e marcar como desatualizada ou manter histórico
        const outrosAprovados = await pb
          .collection('prec_precificacoes')
          .getFullList<PrecPrecificacaoRecord>({
            filter: `id != "${cenarioId}" && produto = "${atual.produto}" && canal = "${atual.canal}" && ${modFilter} && status = "aprovada"`,
          })
        for (const out of outrosAprovados) {
          await pb.collection('prec_precificacoes').update(out.id, {
            status: 'desatualizada',
          })
        }
      }
    } catch (e) {
      console.warn('Erro ao verificar outros aprovados anteriores:', e)
    }

    return pb.collection('prec_precificacoes').update<PrecPrecificacaoRecord>(cenarioId, {
      status: 'aprovada',
      preco_aprovado: preco,
      aprovado_por: userId,
      aprovado_em: hoje,
    })
  },

  async retirarAprovacao(cenarioId: string): Promise<PrecPrecificacaoRecord> {
    return pb.collection('prec_precificacoes').update<PrecPrecificacaoRecord>(cenarioId, {
      status: 'rascunho',
      preco_aprovado: 0,
      aprovado_por: '',
      aprovado_em: '',
    })
  },

  /**
   * Exclui um cenário de precificação (rascunho/salvo).
   * Verifica vínculos antes de deletar (por exemplo se o cenário está aprovado ou vinculado a vendas).
   */
  async excluirCenario(cenarioId: string): Promise<boolean> {
    // 1. Buscar o cenário para validar status
    const cenario = await pb
      .collection('prec_precificacoes')
      .getOne<PrecPrecificacaoRecord>(cenarioId)

    // Se estiver aprovado com preço homologado ativo, alertar o usuário para retirar aprovação antes
    if (cenario.status === 'aprovada' || (cenario.preco_aprovado && cenario.preco_aprovado > 0)) {
      throw new Error(
        'Este cenário possui preço aprovado e ativo. Para excluí-lo, primeiro retire a aprovação.',
      )
    }

    // 2. Deleta o registro da coleção
    await pb.collection('prec_precificacoes').delete(cenarioId)
    return true
  },

  /**
   * Marca precificações como 'desatualizada' quando custos ou taxas são modificados
   */
  async marcarPrecificacoesComoDesatualizadas({
    produtoId,
    canalId,
  }: {
    produtoId?: string
    canalId?: string
  }): Promise<void> {
    try {
      const filterParts: string[] = ["status = 'aprovada'"]
      if (produtoId) filterParts.push(`produto = "${produtoId}"`)
      if (canalId) filterParts.push(`canal = "${canalId}"`)

      const records = await pb
        .collection('prec_precificacoes')
        .getFullList<PrecPrecificacaoRecord>({
          filter: filterParts.join(' && '),
        })

      for (const rec of records) {
        await pb.collection('prec_precificacoes').update(rec.id, {
          status: 'desatualizada',
        })
      }
    } catch (err) {
      console.warn('Erro ao atualizar status para desatualizada:', err)
    }
  },

  // ==========================================
  // CATEGORIAS DE PRODUTOS
  // ==========================================
  async listCategoriasProduto(apenasAtivas = false): Promise<PrecCategoriaProdutoRecord[]> {
    try {
      const filter = apenasAtivas ? 'ativo = true' : ''
      return await pb
        .collection('prec_categorias_produto')
        .getFullList<PrecCategoriaProdutoRecord>({
          filter: filter || undefined,
          sort: 'ordem,nome',
        })
    } catch (err) {
      console.warn('Erro ao listar prec_categorias_produto:', err)
      return []
    }
  },

  async createCategoriaProduto(
    dados: Partial<PrecCategoriaProdutoRecord>,
  ): Promise<PrecCategoriaProdutoRecord> {
    return await pb.collection('prec_categorias_produto').create<PrecCategoriaProdutoRecord>({
      ativo: true,
      ordem: 10,
      ...dados,
    })
  },

  async updateCategoriaProduto(
    id: string,
    dados: Partial<PrecCategoriaProdutoRecord>,
  ): Promise<PrecCategoriaProdutoRecord> {
    return await pb
      .collection('prec_categorias_produto')
      .update<PrecCategoriaProdutoRecord>(id, dados)
  },

  async deleteCategoriaProduto(id: string): Promise<boolean> {
    await pb.collection('prec_categorias_produto').delete(id)
    return true
  },

  // ==========================================
  // MATRIZ DE CANAIS: LEGENDAS
  // ==========================================
  async listMatrizLegendas(apenasAtivas = false): Promise<PrecMatrizLegendaRecord[]> {
    try {
      const filter = apenasAtivas ? 'ativo = true' : ''
      return await pb.collection('prec_matriz_legendas').getFullList<PrecMatrizLegendaRecord>({
        filter: filter || undefined,
        sort: 'ordem,nome',
      })
    } catch (err) {
      console.warn('Erro ao listar prec_matriz_legendas:', err)
      return []
    }
  },

  async createMatrizLegenda(
    dados: Partial<PrecMatrizLegendaRecord>,
  ): Promise<PrecMatrizLegendaRecord> {
    return await pb.collection('prec_matriz_legendas').create<PrecMatrizLegendaRecord>({
      ativo: true,
      ordem: 10,
      cor_texto: '#FFFFFF',
      ...dados,
    })
  },

  async updateMatrizLegenda(
    id: string,
    dados: Partial<PrecMatrizLegendaRecord>,
  ): Promise<PrecMatrizLegendaRecord> {
    return await pb.collection('prec_matriz_legendas').update<PrecMatrizLegendaRecord>(id, dados)
  },

  async deleteMatrizLegenda(id: string): Promise<boolean> {
    await pb.collection('prec_matriz_legendas').delete(id)
    return true
  },

  // ==========================================
  // MATRIZ DE CANAIS: CLASSIFICAÇÕES PRODUTO + CANAL
  // ==========================================
  async listMatrizClassificacoes(): Promise<PrecMatrizClassificacaoRecord[]> {
    try {
      return await pb
        .collection('prec_matriz_classificacoes')
        .getFullList<PrecMatrizClassificacaoRecord>({
          expand: 'legenda,modalidade',
        })
    } catch (err) {
      console.warn('Erro ao listar prec_matriz_classificacoes:', err)
      return []
    }
  },

  /**
   * Define, troca ou limpa a classificação e/ou modalidade de um produto em um canal.
   * Se legendaId for nulo/vazio, remove o vínculo (célula vazia / não cadastrado).
   * modalidadeId pode ser informado para travar a exibição em uma modalidade específica,
   * ou null / '' para voltar à regra vigente dinâmica (automática pelo canal).
   */
  async setMatrizClassificacao({
    produtoId,
    canalId,
    legendaId,
    modalidadeId,
    observacao,
  }: {
    produtoId: string
    canalId: string
    legendaId: string | null
    modalidadeId?: string | null
    observacao?: string
  }): Promise<PrecMatrizClassificacaoRecord | null> {
    // 1. Procurar registro existente para este par (produto, canal)
    const existing = await pb
      .collection('prec_matriz_classificacoes')
      .getFullList<PrecMatrizClassificacaoRecord>({
        filter: `produto = "${produtoId}" && canal = "${canalId}"`,
      })

    // Se legendaId é null ou vazio, excluir se houver
    if (!legendaId) {
      for (const rec of existing) {
        await pb.collection('prec_matriz_classificacoes').delete(rec.id)
      }
      return null
    }

    const payload: Partial<PrecMatrizClassificacaoRecord> = {
      legenda: legendaId,
    }
    if (modalidadeId !== undefined) {
      payload.modalidade = modalidadeId || ''
    }
    if (observacao !== undefined) {
      payload.observacao = observacao
    }

    if (existing.length > 0) {
      const rec = existing[0]
      const updated = await pb
        .collection('prec_matriz_classificacoes')
        .update<PrecMatrizClassificacaoRecord>(rec.id, payload, {
          expand: 'legenda,modalidade',
        })
      // Se houvesse duplicata por inconsistência histórica, limpar extras
      if (existing.length > 1) {
        for (let i = 1; i < existing.length; i++) {
          await pb.collection('prec_matriz_classificacoes').delete(existing[i].id)
        }
      }
      return updated
    }

    return await pb.collection('prec_matriz_classificacoes').create<PrecMatrizClassificacaoRecord>(
      {
        produto: produtoId,
        canal: canalId,
        legenda: legendaId,
        modalidade: modalidadeId || '',
        observacao: observacao || '',
      },
      { expand: 'legenda,modalidade' },
    )
  },

  /**
   * Helper que retorna mapa de produtos aprovados com cenário vigente por canal
   * e todas as modalidades com preço aprovado disponíveis por produto×canal.
   * Mesma regra estrita de /precificacao/aprovados e orçamentos:
   * preco_aprovado > 0, prioridade para status='aprovada' sobre 'desatualizada',
   * desempate pelo mais recente.
   */
  async getMapaProdutosAprovadosPorCanal(): Promise<{
    produtos: PrecProdutoRecord[]
    mapaPrecoPorProdCanal: Record<
      string,
      {
        preco_aprovado: number
        status: string
        precificacao_id: string
        canal_id: string
        lucro_liquido?: number
        modalidade_id?: string
        modalidade_nome?: string
        modalidades_disponiveis?: Array<{
          modalidade_id: string
          modalidade_nome: string
          preco_aprovado: number
          status: string
          precificacao_id: string
          lucro_liquido?: number
          aprovado_em?: string
          updated?: string
          created?: string
        }>
      }
    >
  }> {
    const [produtos, precs, modalidades] = await Promise.all([
      this.listProdutos(),
      this.listPrecificacoes(),
      this.listModalidades(),
    ])

    const mapaModalidades = new Map<string, string>()
    for (const m of modalidades || []) {
      if (m.id && m.nome) {
        mapaModalidades.set(m.id, m.nome)
      }
    }

    const parseTime = (val?: string) => (val ? new Date(val).getTime() : 0)

    // Filtra cenários com preco_aprovado > 0 e status in ('aprovada', 'desatualizada')
    const validPrecs = (precs || []).filter(
      (p) =>
        p.preco_aprovado !== undefined &&
        p.preco_aprovado > 0 &&
        (p.status === 'aprovada' || p.status === 'desatualizada'),
    )

    // Agrupar todas as precificações válidas por chave produto__canal
    const gruposProdCanal = new Map<string, typeof validPrecs>()
    for (const p of validPrecs) {
      if (!p.produto || !p.canal) continue
      const key = `${p.produto}__${p.canal}`
      const arr = gruposProdCanal.get(key) || []
      arr.push(p)
      gruposProdCanal.set(key, arr)
    }

    const sortFn = (a: (typeof validPrecs)[0], b: (typeof validPrecs)[0]) => {
      const aAprovada = a.status === 'aprovada' ? 1 : 0
      const bAprovada = b.status === 'aprovada' ? 1 : 0
      if (aAprovada !== bAprovada) return bAprovada - aAprovada
      const timeA = Math.max(parseTime(a.aprovado_em), parseTime(a.updated), parseTime(a.created))
      const timeB = Math.max(parseTime(b.aprovado_em), parseTime(b.updated), parseTime(b.created))
      return timeB - timeA
    }

    // Montar mapa: chave = `${produtoId}__${canalId}`
    const mapaPrecoPorProdCanal: Record<
      string,
      {
        preco_aprovado: number
        status: string
        precificacao_id: string
        canal_id: string
        lucro_liquido?: number
        modalidade_id?: string
        modalidade_nome?: string
        modalidades_disponiveis?: Array<{
          modalidade_id: string
          modalidade_nome: string
          preco_aprovado: number
          status: string
          precificacao_id: string
          lucro_liquido?: number
          aprovado_em?: string
          updated?: string
          created?: string
        }>
      }
    > = {}

    const prodIdsComAprovado = new Set<string>()

    for (const [key, itens] of gruposProdCanal.entries()) {
      // Ordenar: aprovada > mais recente
      itens.sort(sortFn)
      const vigente = itens[0]
      if (!vigente) continue

      prodIdsComAprovado.add(vigente.produto)

      // Agrupar por modalidade única para listar todas as modalidades com preço aprovado
      const porModalidade = new Map<string, (typeof validPrecs)[0]>()
      for (const item of itens) {
        const modId = item.modalidade || '__padrao__'
        if (!porModalidade.has(modId)) {
          porModalidade.set(modId, item)
        }
      }

      const modalidadesDisponiveis: Array<{
        modalidade_id: string
        modalidade_nome: string
        preco_aprovado: number
        status: string
        precificacao_id: string
        lucro_liquido?: number
        aprovado_em?: string
        updated?: string
        created?: string
      }> = []

      for (const [modId, item] of porModalidade.entries()) {
        const modNome =
          item.expand?.modalidade?.nome ||
          (modId !== '__padrao__' ? mapaModalidades.get(modId) : '') ||
          'Padrão'
        const resItem = (item.resultado || {}) as Record<string, unknown>
        const lucroItem =
          resItem.lucro_liquido !== undefined &&
          resItem.lucro_liquido !== null &&
          !isNaN(Number(resItem.lucro_liquido))
            ? Number(resItem.lucro_liquido)
            : undefined

        modalidadesDisponiveis.push({
          modalidade_id: modId === '__padrao__' ? '' : modId,
          modalidade_nome: modNome,
          preco_aprovado: Number(item.preco_aprovado) || 0,
          status: item.status,
          precificacao_id: item.id,
          lucro_liquido: lucroItem,
          aprovado_em: item.aprovado_em,
          updated: item.updated,
          created: item.created,
        })
      }

      const vigenteModNome =
        vigente.expand?.modalidade?.nome ||
        (vigente.modalidade ? mapaModalidades.get(vigente.modalidade) : undefined)

      const resVigente = (vigente.resultado || {}) as Record<string, unknown>
      const lucroVigente =
        resVigente.lucro_liquido !== undefined &&
        resVigente.lucro_liquido !== null &&
        !isNaN(Number(resVigente.lucro_liquido))
          ? Number(resVigente.lucro_liquido)
          : undefined

      mapaPrecoPorProdCanal[key] = {
        preco_aprovado: Number(vigente.preco_aprovado) || 0,
        status: vigente.status,
        precificacao_id: vigente.id,
        canal_id: vigente.canal,
        lucro_liquido: lucroVigente,
        modalidade_id: vigente.modalidade || undefined,
        modalidade_nome: vigenteModNome,
        modalidades_disponiveis: modalidadesDisponiveis,
      }
    }

    // Produtos que pertencem ao repositório de aprovados (têm ao menos 1 precificação aprovada em qualquer canal)
    const produtosAprovados = (produtos || []).filter((prod) => prodIdsComAprovado.has(prod.id))

    return {
      produtos: produtosAprovados,
      mapaPrecoPorProdCanal,
    }
  },
}
