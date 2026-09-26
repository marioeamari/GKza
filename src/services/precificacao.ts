import pb from '@/lib/pocketbase/client'
import {
  PrecCanalModalidadeRecord,
  PrecCanalRecord,
  PrecKitRecord,
  PrecPerfilTributarioRecord,
  PrecPrecificacaoRecord,
  PrecProdutoRecord,
  PrecTaxaRecord,
} from '@/types/precificacao'

export const precificacaoService = {
  // PRODUTOS
  async listProdutos(filter?: string): Promise<PrecProdutoRecord[]> {
    return pb.collection('prec_produtos').getFullList<PrecProdutoRecord>({
      filter: filter || '',
      sort: '-created',
      expand: 'empresa,fornecedor,fornecedor_produto',
    })
  },

  async getProduto(id: string): Promise<PrecProdutoRecord> {
    return pb.collection('prec_produtos').getOne<PrecProdutoRecord>(id, {
      expand: 'empresa',
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

  async updateProduto(
    id: string,
    data: FormData | Partial<PrecProdutoRecord>,
  ): Promise<PrecProdutoRecord> {
    let payload = data
    if (!(data instanceof FormData) && typeof data.imagem === 'string') {
      const sanitized = { ...data }
      delete sanitized.imagem
      payload = sanitized
    }
    const updated = await pb.collection('prec_produtos').update<PrecProdutoRecord>(id, payload)
    // Marca precificações deste produto como desatualizadas por mudança de custo/produto
    await precificacaoService.marcarPrecificacoesComoDesatualizadas({ produtoId: id })
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
  }): Promise<PrecPrecificacaoRecord> {
    if (data.id) {
      return pb.collection('prec_precificacoes').update<PrecPrecificacaoRecord>(data.id, {
        ...data,
      })
    }

    // Procura se já existe rascunho para este canal + produto
    const modFilter = data.modalidade ? `modalidade = "${data.modalidade}"` : 'modalidade = ""'
    const existing = await pb
      .collection('prec_precificacoes')
      .getList<PrecPrecificacaoRecord>(1, 1, {
        filter: `produto = "${data.produto}" && canal = "${data.canal}" && ${modFilter}`,
      })

    if (existing.items.length > 0) {
      const atual = existing.items[0]
      return pb.collection('prec_precificacoes').update<PrecPrecificacaoRecord>(atual.id, {
        versao: (atual.versao || 1) + 1,
        premissas: data.premissas,
        resultado: data.resultado,
        status: data.status,
        custo_snapshot: data.custo_snapshot,
        taxas_snapshot: data.taxas_snapshot,
      })
    }

    return pb.collection('prec_precificacoes').create<PrecPrecificacaoRecord>({
      ...data,
      versao: data.versao || 1,
    })
  },

  async aprovarPreco(
    cenarioId: string,
    preco: number,
    userId: string,
  ): Promise<PrecPrecificacaoRecord> {
    const hoje = new Date().toISOString()
    return pb.collection('prec_precificacoes').update<PrecPrecificacaoRecord>(cenarioId, {
      status: 'aprovada',
      preco_aprovado: preco,
      aprovado_por: userId,
      aprovado_em: hoje,
    })
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
}
