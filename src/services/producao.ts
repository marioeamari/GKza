import pb from '@/lib/pocketbase/client'
import {
  PRODUTOS_PADRAO_PRODUCAO,
  calcularFaixaSemanaProducao,
  gerarCincoDiasUteis,
  getSegundaFeiraSemana,
  getSemanaAnoIdentificador,
} from '@/lib/producao'

export interface ProducaoSemanaRecord {
  id: string
  semana_ano: string
  segunda_feira: string
  data_inicio_fornecedor: string
  data_fim_fornecedor: string
  data_inicio_saques: string
  data_fim_saques: string
  dias_offset_saques: number
  imposto: number
  observacoes: string
  despesa_vinculo_id?: string
  created: string
  updated: string
}

export interface ProducaoProdutoRecord {
  id: string
  semana: string
  nome: string
  custo_unitario: number
  ordem: number
  codigo_referencia?: string
  created: string
  updated: string
}

export interface ProducaoDiaItemRecord {
  id: string
  semana: string
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
  semana: string
  titulo: string
  marketplace_referencia?: string
  ordem: number
  itens?: ProducaoSaqueItemRecord[]
  created: string
  updated: string
}

export interface SemanaProducaoCompleta {
  semana: ProducaoSemanaRecord
  produtos: ProducaoProdutoRecord[]
  diasItens: ProducaoDiaItemRecord[]
  gruposSaques: (ProducaoSaqueGrupoRecord & { itens: ProducaoSaqueItemRecord[] })[]
}

/**
 * Grupos padrão de marketplaces sugeridos do modelo da planilha
 */
export const GRUPOS_PADRAO_SAQUES = [
  { titulo: 'Saque Shopee-SHPP(Sicred)', marketplace_referencia: 'Shopee' },
  { titulo: 'Saque Shein-ModaMundial(Sicred)', marketplace_referencia: 'Shein' },
  { titulo: 'Saque Kawai(NuSoft)', marketplace_referencia: 'Kwai' },
  { titulo: 'Saque TikTok-Bytedance(Sicred)', marketplace_referencia: 'TikTok' },
]

export const producaoService = {
  /**
   * Obtém ou cria uma semana de produção sob demanda
   */
  async getOrCreateSemana(
    segundaFeiraIso: string,
    offsetDias: number = 6,
  ): Promise<SemanaProducaoCompleta> {
    const segundaFeira = getSegundaFeiraSemana(segundaFeiraIso)
    const semanaAno = getSemanaAnoIdentificador(segundaFeira)

    let semanaRecord: ProducaoSemanaRecord

    try {
      semanaRecord = await pb
        .collection('producao_semanas')
        .getFirstListItem<ProducaoSemanaRecord>(`semana_ano = "${semanaAno}"`)
    } catch {
      // Criar nova semana sob demanda
      const faixa = calcularFaixaSemanaProducao(segundaFeira, offsetDias)
      semanaRecord = await pb.collection('producao_semanas').create<ProducaoSemanaRecord>({
        semana_ano: semanaAno,
        segunda_feira: segundaFeira,
        data_inicio_fornecedor: faixa.data_inicio_fornecedor,
        data_fim_fornecedor: faixa.data_fim_fornecedor,
        data_inicio_saques: faixa.data_inicio_saques,
        data_fim_saques: faixa.data_fim_saques,
        dias_offset_saques: offsetDias,
        imposto: 0,
        observacoes: '',
      })

      // Tenta copiar produtos da semana anterior mais recente; se não houver, semeia os 18 produtos padrão
      let produtosBase = PRODUTOS_PADRAO_PRODUCAO.map((p) => ({
        nome: p.nome,
        custo_unitario: p.custo_padrao,
        ordem: p.ordem,
      }))

      try {
        const semanasAnteriores = await pb
          .collection('producao_semanas')
          .getList<ProducaoSemanaRecord>(1, 1, {
            filter: `segunda_feira < "${segundaFeira}"`,
            sort: '-segunda_feira',
          })

        if (semanasAnteriores.items.length > 0) {
          const ultimaSemanaId = semanasAnteriores.items[0].id
          const produtosAnteriores = await pb
            .collection('producao_produtos')
            .getFullList<ProducaoProdutoRecord>({
              filter: `semana = "${ultimaSemanaId}"`,
              sort: 'ordem',
            })

          if (produtosAnteriores.length > 0) {
            produtosBase = produtosAnteriores.map((p) => ({
              nome: p.nome,
              custo_unitario: p.custo_unitario,
              ordem: p.ordem,
            }))
          }
        }
      } catch {
        // Usa produtos padrão
      }

      // Cria os produtos para a nova semana
      for (const p of produtosBase) {
        await pb.collection('producao_produtos').create({
          semana: semanaRecord.id,
          nome: p.nome,
          custo_unitario: p.custo_unitario,
          ordem: p.ordem,
        })
      }

      // Cria os grupos de saques padrão com 2 itens vazios cada
      for (let i = 0; i < GRUPOS_PADRAO_SAQUES.length; i++) {
        const gDef = GRUPOS_PADRAO_SAQUES[i]
        const grupo = await pb.collection('producao_saques_grupos').create({
          semana: semanaRecord.id,
          titulo: gDef.titulo,
          marketplace_referencia: gDef.marketplace_referencia,
          ordem: i + 1,
        })

        // Linhas iniciais de saque
        await pb.collection('producao_saques_itens').create({
          grupo: grupo.id,
          descricao: 'Auto Saque',
          valor: 0,
          ordem: 1,
        })
      }
    }

    return this.carregarSemanaCompleta(semanaRecord.id)
  },

  /**
   * Carrega todos os dados de uma semana
   */
  async carregarSemanaCompleta(semanaId: string): Promise<SemanaProducaoCompleta> {
    const semana = await pb.collection('producao_semanas').getOne<ProducaoSemanaRecord>(semanaId)

    const produtos = await pb.collection('producao_produtos').getFullList<ProducaoProdutoRecord>({
      filter: `semana = "${semanaId}"`,
      sort: 'ordem',
    })

    const diasItens = await pb
      .collection('producao_dias_itens')
      .getFullList<ProducaoDiaItemRecord>({
        filter: `semana = "${semanaId}"`,
      })

    const grupos = await pb
      .collection('producao_saques_grupos')
      .getFullList<ProducaoSaqueGrupoRecord>({
        filter: `semana = "${semanaId}"`,
        sort: 'ordem',
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
      semana,
      produtos,
      diasItens,
      gruposSaques: gruposComItens,
    }
  },

  /**
   * Atualiza dados básicos da semana (imposto, offset de dias, observações)
   */
  async atualizarSemana(
    semanaId: string,
    data: Partial<Pick<ProducaoSemanaRecord, 'imposto' | 'dias_offset_saques' | 'observacoes'>>,
  ): Promise<ProducaoSemanaRecord> {
    if (data.dias_offset_saques !== undefined) {
      const semana = await pb.collection('producao_semanas').getOne<ProducaoSemanaRecord>(semanaId)
      const faixa = calcularFaixaSemanaProducao(semana.segunda_feira, data.dias_offset_saques)
      return pb.collection('producao_semanas').update<ProducaoSemanaRecord>(semanaId, {
        ...data,
        data_inicio_saques: faixa.data_inicio_saques,
        data_fim_saques: faixa.data_fim_saques,
      })
    }
    return pb.collection('producao_semanas').update<ProducaoSemanaRecord>(semanaId, data)
  },

  /**
   * Atualiza ou cadastra produto da semana
   */
  async salvarProduto(
    semanaId: string,
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
      semana: semanaId,
      nome: produto.nome,
      custo_unitario: produto.custo_unitario,
      ordem: produto.ordem ?? 999,
    })
  },

  /**
   * Exclui produto da semana
   */
  async excluirProduto(produtoId: string): Promise<void> {
    await pb.collection('producao_produtos').delete(produtoId)
  },

  /**
   * Recarrega os 18 produtos padrão na semana atual
   */
  async carregarProdutosPadraoNaSemana(semanaId: string): Promise<ProducaoProdutoRecord[]> {
    const produtosExistentes = await pb
      .collection('producao_produtos')
      .getFullList<ProducaoProdutoRecord>({
        filter: `semana = "${semanaId}"`,
      })

    const nomesExistentes = new Set(produtosExistentes.map((p) => p.nome.toLowerCase().trim()))

    for (const p of PRODUTOS_PADRAO_PRODUCAO) {
      if (!nomesExistentes.has(p.nome.toLowerCase().trim())) {
        await pb.collection('producao_produtos').create({
          semana: semanaId,
          nome: p.nome,
          custo_unitario: p.custo_padrao,
          ordem: p.ordem,
        })
      }
    }

    return pb.collection('producao_produtos').getFullList<ProducaoProdutoRecord>({
      filter: `semana = "${semanaId}"`,
      sort: 'ordem',
    })
  },

  /**
   * Atualiza ou grava a quantidade de um produto em um determinado dia
   */
  async salvarQuantidadeDia(
    semanaId: string,
    dataIso: string,
    produtoId: string,
    quantidade: number,
  ): Promise<ProducaoDiaItemRecord> {
    const qtd = Math.max(0, Number(quantidade) || 0)

    try {
      const existente = await pb
        .collection('producao_dias_itens')
        .getFirstListItem<ProducaoDiaItemRecord>(
          `semana = "${semanaId}" && data = "${dataIso}" && produto = "${produtoId}"`,
        )

      return pb.collection('producao_dias_itens').update<ProducaoDiaItemRecord>(existente.id, {
        quantidade: qtd,
      })
    } catch {
      return pb.collection('producao_dias_itens').create<ProducaoDiaItemRecord>({
        semana: semanaId,
        data: dataIso,
        produto: produtoId,
        quantidade: qtd,
      })
    }
  },

  /**
   * Cria novo grupo de saques
   */
  async criarGrupoSaque(
    semanaId: string,
    titulo: string,
    marketplaceReferencia?: string,
  ): Promise<ProducaoSaqueGrupoRecord> {
    const grupos = await pb.collection('producao_saques_grupos').getFullList({
      filter: `semana = "${semanaId}"`,
    })
    const ordem = grupos.length + 1

    const grupo = await pb.collection('producao_saques_grupos').create<ProducaoSaqueGrupoRecord>({
      semana: semanaId,
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
   * Exclui grupo de saques e seus itens (cascade delete)
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
   * Lista marketplaces do sistema como REFERÊNCIA apenas (leitura), sem vincular a contas
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
}
