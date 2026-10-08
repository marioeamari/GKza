import pb from '@/lib/pocketbase/client'
import {
  calcularFaixaSemanaProducao,
  formatarRangeDatas,
  getSegundaFeiraSemana,
  ordenarDatasIso,
} from '@/lib/producao'

export interface ProducaoRegistroRecord {
  id: string
  fornecedor?: string
  fornecedor_nome?: string
  data_inicio_compra: string
  data_fim_compra: string
  data_inicio_saques: string
  data_fim_saques: string
  label_compra?: string
  label_saques?: string
  imposto: number
  observacoes?: string
  datas_grade?: string[]
  created: string
  updated: string
}

export interface ProducaoProdutoRecord {
  id: string
  registro?: string
  semana?: string
  nome: string
  custo_unitario: number
  ordem: number
  codigo_referencia?: string
  created: string
  updated: string
}

export interface ProducaoDiaItemRecord {
  id: string
  registro?: string
  semana?: string
  data: string
  produto: string
  quantidade: number
  created: string
  updated: string
}

export interface ProducaoSaqueItemRecord {
  id: string
  grupo: string
  descricao: string
  valor: number
  ordem: number
  created: string
  updated: string
}

export interface ProducaoSaqueGrupoRecord {
  id: string
  registro?: string
  semana?: string
  titulo: string
  marketplace_referencia?: string
  ordem: number
  itens?: ProducaoSaqueItemRecord[]
  created: string
  updated: string
}

export interface RegistroProducaoCompleto {
  registro: ProducaoRegistroRecord
  produtos: ProducaoProdutoRecord[]
  diasItens: ProducaoDiaItemRecord[]
  gruposSaques: (ProducaoSaqueGrupoRecord & { itens: ProducaoSaqueItemRecord[] })[]
}

// Mantido para compatibilidade com importações legadas
export type ProducaoSemanaRecord = ProducaoRegistroRecord
export type SemanaProducaoCompleta = RegistroProducaoCompleto

export interface FornecedorReferencia {
  id: string
  nome: string
  razao_social?: string
}

export interface FornecedorProdutoReferencia {
  id: string
  fornecedor_id: string
  descricao: string
  sku_fornecedor?: string
  preco_custo_unitario: number
}

/**
 * Grupos padrão de marketplaces sugeridos
 */
export const GRUPOS_PADRAO_SAQUES = [
  { titulo: 'Saque Shopee-SHPP(Sicred)', marketplace_referencia: 'Shopee' },
  { titulo: 'Saque Shein-ModaMundial(Sicred)', marketplace_referencia: 'Shein' },
  { titulo: 'Saque Kawai(NuSoft)', marketplace_referencia: 'Kwai' },
  { titulo: 'Saque TikTok-Bytedance(Sicred)', marketplace_referencia: 'TikTok' },
]

export const producaoService = {
  /**
   * Lista todos os registros de pagamento de fornecedor ordenados pelos mais recentes
   */
  async listarRegistros(): Promise<ProducaoRegistroRecord[]> {
    return pb.collection('producao_registros').getFullList<ProducaoRegistroRecord>({
      sort: '-data_inicio_compra,-created',
    })
  },

  /**
   * Carrega um registro completo por ID
   */
  async carregarRegistroCompleto(registroId: string): Promise<RegistroProducaoCompleto> {
    const registro = await pb
      .collection('producao_registros')
      .getOne<ProducaoRegistroRecord>(registroId)

    const produtos = await pb.collection('producao_produtos').getFullList<ProducaoProdutoRecord>({
      filter: `registro = "${registroId}"`,
      sort: 'ordem,created',
    })

    const diasItens = await pb
      .collection('producao_dias_itens')
      .getFullList<ProducaoDiaItemRecord>({
        filter: `registro = "${registroId}"`,
      })

    const grupos = await pb
      .collection('producao_saques_grupos')
      .getFullList<ProducaoSaqueGrupoRecord>({
        filter: `registro = "${registroId}"`,
        sort: 'ordem,created',
      })

    const gruposComItens: (ProducaoSaqueGrupoRecord & { itens: ProducaoSaqueItemRecord[] })[] = []

    for (const g of grupos) {
      const itens = await pb
        .collection('producao_saques_itens')
        .getFullList<ProducaoSaqueItemRecord>({
          filter: `grupo = "${g.id}"`,
          sort: 'ordem,created',
        })
      gruposComItens.push({
        ...g,
        itens,
      })
    }

    return {
      registro,
      produtos,
      diasItens,
      gruposSaques: gruposComItens,
    }
  },

  /**
   * Cria um novo Registro de Pagamento de Fornecedor
   */
  async criarRegistro(dados: {
    fornecedorId?: string
    fornecedorNome?: string
    dataInicioCompra: string
    dataFimCompra: string
    dataInicioSaques: string
    dataFimSaques: string
    imposto?: number
    observacoes?: string
    datasIniciaisGrade?: string[]
  }): Promise<RegistroProducaoCompleto> {
    const labelCompra = formatarRangeDatas(dados.dataInicioCompra, dados.dataFimCompra)
    const labelSaques = formatarRangeDatas(dados.dataInicioSaques, dados.dataFimSaques)

    const registroCriado = await pb
      .collection('producao_registros')
      .create<ProducaoRegistroRecord>({
        fornecedor: dados.fornecedorId || undefined,
        fornecedor_nome: dados.fornecedorNome || '',
        data_inicio_compra: dados.dataInicioCompra,
        data_fim_compra: dados.dataFimCompra,
        data_inicio_saques: dados.dataInicioSaques,
        data_fim_saques: dados.dataFimSaques,
        label_compra: labelCompra,
        label_saques: labelSaques,
        imposto: dados.imposto || 0,
        observacoes: dados.observacoes || '',
        datas_grade: dados.datasIniciaisGrade || [],
      })

    // Semeia grupos padrão de saques para o registro
    for (let i = 0; i < GRUPOS_PADRAO_SAQUES.length; i++) {
      const gDef = GRUPOS_PADRAO_SAQUES[i]
      const grupo = await pb.collection('producao_saques_grupos').create({
        registro: registroCriado.id,
        titulo: gDef.titulo,
        marketplace_referencia: gDef.marketplace_referencia,
        ordem: i + 1,
      })

      // Linha inicial vazia
      await pb.collection('producao_saques_itens').create({
        grupo: grupo.id,
        descricao: 'Auto Saque',
        valor: 0,
        ordem: 1,
      })
    }

    return this.carregarRegistroCompleto(registroCriado.id)
  },

  /**
   * Atualiza dados de cabeçalho do registro (fornecedor, datas, imposto, datas_grade)
   */
  async atualizarRegistro(
    registroId: string,
    dados: Partial<ProducaoRegistroRecord>,
  ): Promise<ProducaoRegistroRecord> {
    const payload: Record<string, unknown> = { ...dados }

    // Atualiza labels se datas mudaram
    if (dados.data_inicio_compra && dados.data_fim_compra) {
      payload.label_compra = formatarRangeDatas(dados.data_inicio_compra, dados.data_fim_compra)
    }
    if (dados.data_inicio_saques && dados.data_fim_saques) {
      payload.label_saques = formatarRangeDatas(dados.data_inicio_saques, dados.data_fim_saques)
    }

    return pb.collection('producao_registros').update<ProducaoRegistroRecord>(registroId, payload)
  },

  /**
   * Exclui um registro de pagamento e todos os seus itens vinculados
   */
  async excluirRegistro(registroId: string): Promise<void> {
    await pb.collection('producao_registros').delete(registroId)
  },

  /**
   * Adiciona ou remove uma data real na grade dinâmica do registro
   */
  async adicionarDataNaGrade(registroId: string, novaDataIso: string): Promise<string[]> {
    const reg = await pb.collection('producao_registros').getOne<ProducaoRegistroRecord>(registroId)
    const datasAtuais = Array.isArray(reg.datas_grade) ? reg.datas_grade : []
    const novasDatas = ordenarDatasIso([...datasAtuais, novaDataIso])
    await pb.collection('producao_registros').update(registroId, { datas_grade: novasDatas })
    return novasDatas
  },

  async removerDataDaGrade(registroId: string, dataIsoParaRemover: string): Promise<string[]> {
    const reg = await pb.collection('producao_registros').getOne<ProducaoRegistroRecord>(registroId)
    const datasAtuais = Array.isArray(reg.datas_grade) ? reg.datas_grade : []
    const novasDatas = datasAtuais.filter((d) => d.slice(0, 10) !== dataIsoParaRemover.slice(0, 10))
    await pb.collection('producao_registros').update(registroId, { datas_grade: novasDatas })

    // Limpa também os itens daquela data neste registro
    try {
      const itensParaExcluir = await pb
        .collection('producao_dias_itens')
        .getFullList<ProducaoDiaItemRecord>({
          filter: `registro = "${registroId}" && data ~ "${dataIsoParaRemover.slice(0, 10)}"`,
        })
      for (const item of itensParaExcluir) {
        await pb.collection('producao_dias_itens').delete(item.id)
      }
    } catch {
      /* intentionally ignored */
    }

    return novasDatas
  },

  /**
   * Adiciona produtos do catálogo do fornecedor selecionado para a grade do registro
   */
  async adicionarProdutosDoCatalogo(
    registroId: string,
    produtosCatalogo: { nome: string; custo_unitario: number; codigo_referencia?: string }[],
  ): Promise<ProducaoProdutoRecord[]> {
    const produtosExistentes = await pb
      .collection('producao_produtos')
      .getFullList<ProducaoProdutoRecord>({
        filter: `registro = "${registroId}"`,
      })

    const nomesExistentes = new Set(produtosExistentes.map((p) => p.nome.toLowerCase().trim()))
    let ordemAtual = produtosExistentes.length

    for (const item of produtosCatalogo) {
      if (!nomesExistentes.has(item.nome.toLowerCase().trim())) {
        ordemAtual++
        await pb.collection('producao_produtos').create({
          registro: registroId,
          nome: item.nome,
          custo_unitario: Math.max(0, Number(item.custo_unitario) || 0),
          ordem: ordemAtual,
          codigo_referencia: item.codigo_referencia || '',
        })
      }
    }

    return pb.collection('producao_produtos').getFullList<ProducaoProdutoRecord>({
      filter: `registro = "${registroId}"`,
      sort: 'ordem,created',
    })
  },

  /**
   * Cadastra ou atualiza um produto avulso no registro
   */
  async salvarProduto(
    registroId: string,
    produto: { id?: string; nome: string; custo_unitario: number; ordem?: number },
  ): Promise<ProducaoProdutoRecord> {
    if (produto.id) {
      return pb.collection('producao_produtos').update<ProducaoProdutoRecord>(produto.id, {
        nome: produto.nome,
        custo_unitario: produto.custo_unitario,
        ordem: produto.ordem ?? 0,
      })
    }
    return pb.collection('producao_produtos').create<ProducaoProdutoRecord>({
      registro: registroId,
      nome: produto.nome,
      custo_unitario: produto.custo_unitario,
      ordem: produto.ordem ?? 999,
    })
  },

  /**
   * Exclui produto da grade do registro
   */
  async excluirProduto(produtoId: string): Promise<void> {
    await pb.collection('producao_produtos').delete(produtoId)
  },

  /**
   * Atualiza ou grava a quantidade de um produto em um determinado dia dentro do registro
   */
  async salvarQuantidadeDia(
    registroId: string,
    dataIso: string,
    produtoId: string,
    quantidade: number,
  ): Promise<ProducaoDiaItemRecord> {
    const qtd = Math.max(0, Number(quantidade) || 0)
    const dataLimpa = dataIso.slice(0, 10)

    try {
      const existente = await pb
        .collection('producao_dias_itens')
        .getFirstListItem<ProducaoDiaItemRecord>(
          `registro = "${registroId}" && data ~ "${dataLimpa}" && produto = "${produtoId}"`,
        )

      return pb.collection('producao_dias_itens').update<ProducaoDiaItemRecord>(existente.id, {
        quantidade: qtd,
      })
    } catch {
      return pb.collection('producao_dias_itens').create<ProducaoDiaItemRecord>({
        registro: registroId,
        data: dataLimpa,
        produto: produtoId,
        quantidade: qtd,
      })
    }
  },

  /**
   * Cria novo grupo de saques no registro
   */
  async criarGrupoSaque(
    registroId: string,
    titulo: string,
    marketplaceReferencia?: string,
  ): Promise<ProducaoSaqueGrupoRecord> {
    const grupos = await pb.collection('producao_saques_grupos').getFullList({
      filter: `registro = "${registroId}"`,
    })
    const ordem = grupos.length + 1

    const grupo = await pb.collection('producao_saques_grupos').create<ProducaoSaqueGrupoRecord>({
      registro: registroId,
      titulo,
      marketplace_referencia: marketplaceReferencia || '',
      ordem,
    })

    // Adiciona uma linha inicial
    await pb.collection('producao_saques_itens').create({
      grupo: grupo.id,
      descricao: 'Auto Saque',
      valor: 0,
      ordem: 1,
    })

    return grupo
  },

  /**
   * Atualiza título do grupo de saques
   */
  async atualizarGrupoSaque(grupoId: string, titulo: string): Promise<ProducaoSaqueGrupoRecord> {
    return pb.collection('producao_saques_grupos').update<ProducaoSaqueGrupoRecord>(grupoId, {
      titulo,
    })
  },

  /**
   * Exclui grupo de saques e seus itens
   */
  async excluirGrupoSaque(grupoId: string): Promise<void> {
    await pb.collection('producao_saques_grupos').delete(grupoId)
  },

  /**
   * Adiciona item de saque a um grupo
   */
  async adicionarItemSaque(
    grupoId: string,
    descricao: string = 'Auto Saque',
    valor: number = 0,
  ): Promise<ProducaoSaqueItemRecord> {
    const itens = await pb.collection('producao_saques_itens').getFullList({
      filter: `grupo = "${grupoId}"`,
    })
    const ordem = itens.length + 1

    return pb.collection('producao_saques_itens').create<ProducaoSaqueItemRecord>({
      grupo: grupoId,
      descricao,
      valor: Math.max(0, Number(valor) || 0),
      ordem,
    })
  },

  /**
   * Atualiza item de saque
   */
  async salvarItemSaque(
    itemId: string,
    dados: Partial<Pick<ProducaoSaqueItemRecord, 'descricao' | 'valor'>>,
  ): Promise<ProducaoSaqueItemRecord> {
    return pb.collection('producao_saques_itens').update<ProducaoSaqueItemRecord>(itemId, dados)
  },

  /**
   * Exclui linha de saque
   */
  async excluirItemSaque(itemId: string): Promise<void> {
    await pb.collection('producao_saques_itens').delete(itemId)
  },

  /**
   * Lista fornecedores cadastrados no ERP (/fornecedores) apenas como REFERÊNCIA (somente leitura)
   */
  async listarFornecedoresReferencia(): Promise<FornecedorReferencia[]> {
    try {
      const records = await pb.collection('fornecedores').getFullList<{
        id: string
        nome_fantasia?: string
        razao_social?: string
      }>({
        sort: 'nome_fantasia,razao_social',
      })

      return records.map((r) => ({
        id: r.id,
        nome: r.nome_fantasia || r.razao_social || 'Fornecedor sem nome',
        razao_social: r.razao_social,
      }))
    } catch {
      return []
    }
  },

  /**
   * Lista os produtos do catálogo de um determinado fornecedor (somente leitura)
   */
  async listarProdutosDoFornecedor(fornecedorId: string): Promise<FornecedorProdutoReferencia[]> {
    if (!fornecedorId) return []
    try {
      const records = await pb.collection('fornecedores_produtos').getFullList<{
        id: string
        fornecedor: string
        descricao: string
        sku_fornecedor?: string
        preco_custo_unitario?: number
        ativo?: boolean
      }>({
        filter: `fornecedor = "${fornecedorId}" && ativo = true`,
        sort: 'descricao',
      })

      return records.map((p) => ({
        id: p.id,
        fornecedor_id: p.fornecedor,
        descricao: p.descricao,
        sku_fornecedor: p.sku_fornecedor,
        preco_custo_unitario: Number(p.preco_custo_unitario) || 0,
      }))
    } catch {
      return []
    }
  },

  /**
   * Lista marketplaces do sistema como REFERÊNCIA apenas (leitura)
   */
  async listarMarketplacesReferencia(): Promise<string[]> {
    try {
      const mkts = await pb.collection('marketplaces').getFullList<{ nome: string }>({
        sort: 'nome',
      })
      const sugestoesPadrao = [
        'Shopee',
        'Shein',
        'Kwai',
        'TikTok',
        'Mercado Livre',
        'Amazon',
        'Magalu',
      ]
      const nomes = new Set([...mkts.map((m) => m.nome), ...sugestoesPadrao])
      return Array.from(nomes)
    } catch {
      return ['Shopee', 'Shein', 'Kwai', 'TikTok', 'Mercado Livre', 'Amazon']
    }
  },

  /**
   * Compatibilidade: Obtém ou cria registro padrão para a semana caso seja chamado por rotas legadas
   */
  async getOrCreateSemana(segundaFeiraIso?: string): Promise<RegistroProducaoCompleto> {
    const registros = await this.listarRegistros()
    if (registros.length > 0) {
      return this.carregarRegistroCompleto(registros[0].id)
    }

    const seg = getSegundaFeiraSemana(segundaFeiraIso)
    const faixa = calcularFaixaSemanaProducao(seg, 6)

    // Fornecedor padrão se existir
    const forns = await this.listarFornecedoresReferencia()
    const forn = forns[0]

    return this.criarRegistro({
      fornecedorId: forn?.id,
      fornecedorNome: forn?.nome,
      dataInicioCompra: faixa.data_inicio_fornecedor,
      dataFimCompra: faixa.data_fim_fornecedor,
      dataInicioSaques: faixa.data_inicio_saques,
      dataFimSaques: faixa.data_fim_saques,
      datasIniciaisGrade: [faixa.data_inicio_fornecedor, faixa.data_fim_fornecedor],
    })
  },
}
