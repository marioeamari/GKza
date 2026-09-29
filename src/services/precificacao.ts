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

  async listProdutosPorEmpresa(empresaId: string): Promise<PrecProdutoRecord[]> {
    return pb.collection('prec_produtos').getFullList<PrecProdutoRecord>({
      filter: `empresa = "${empresaId}"`,
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
}
