/**
 * Serviço de Leitura do Módulo de Lucro (/lucro)
 * SOMENTE LEITURA — Não grava nem altera nenhum registro em precificações, despesas ou repositório.
 */

import pb from '@/lib/pocketbase/client'
import type { ProdutoLucro, CanalLojaLucro, DespesaGrupoItem } from '@/lib/lucro'
import { extrairRendaLiquidaDePrecificacao } from '@/lib/lucro'

// Tipos auxiliares de coleções consultadas
interface PrecProdutoPB {
  id: string
  nome: string
  sku: string
  marca?: string
  categoria?: string
  tipo?: string
  qtd_por_kit?: number
  empresa?: string
  status?: string
  expand?: {
    empresa?: {
      id: string
      nome_fantasia?: string
      razao_social?: string
      cnpj?: string
    }
  }
}

export interface PrecificacaoAprovadaItem {
  id: string
  produto_id: string
  produto_nome: string
  produto_sku?: string
  produto_marca?: string
  produto_categoria?: string
  qtd_por_kit?: number
  empresa_nome?: string
  empresa_cnpj?: string
  canal_id: string
  canal_nome: string
  marketplace_nome?: string
  preco_venda: number
  lucro_liquido_unitario: number
  margem_liquida_percentual: number
}

interface PrecCanalPB {
  id: string
  nome: string
  tipo?: 'site_proprio' | 'marketplace'
  marketplace?: string
  cor?: string
  ativo: boolean
  ordem?: number
  expand?: {
    marketplace?: {
      id: string
      nome: string
      slug?: string
      cor?: string
    }
  }
}

interface PrecPrecificacaoPB {
  id: string
  produto: string
  canal: string
  status: string
  preco_aprovado?: number
  preco_venda_calculado?: number
  lucro_liquido_calculado?: number
  margem_liquida_calculada?: number
  resultado?: Record<string, unknown>
  resultado_json?: Record<string, unknown>
  aprovado_em?: string
  expand?: {
    produto?: {
      id: string
      nome?: string
      sku?: string
      marca?: string
      categoria?: string
      qtd_por_kit?: number
      empresa?: string
      expand?: {
        empresa?: {
          id: string
          nome_fantasia?: string
          razao_social?: string
          cnpj?: string
        }
      }
    }
    canal?: {
      id: string
      nome?: string
      marketplace?: string
      cor?: string
      expand?: {
        marketplace?: {
          id: string
          nome: string
          cor?: string
        }
      }
    }
  }
}

interface TagPB {
  id: string
  nome: string
  cor?: string
}

interface ContextoGrupoPB {
  id: string
  nome: string
  cor?: string
  ordem?: number
}

interface DespesaOcorrenciaPB {
  id: string
  competencia: string
  valor_pago?: number
  valor_previsto?: number
  status: string
  direcionamento?: string
  compromisso?: string
  expand?: {
    compromisso?: {
      id: string
      descricao?: string
      tag?: string
      direcionamento?: string
      expand?: {
        tag?: {
          id: string
          nome: string
          cor?: string
        }
      }
    }
  }
}

export const lucroService = {
  /**
   * Busca os produtos do catálogo (prec_produtos) ativos/aprovados do repositório
   */
  async listarProdutos(): Promise<ProdutoLucro[]> {
    try {
      const records = await pb.collection<PrecProdutoPB>('prec_produtos').getFullList({
        filter: 'status != "inativo"',
        sort: 'categoria,nome',
        expand: 'empresa',
      })

      return records.map((r, idx) => ({
        id: r.id,
        nome: r.nome || r.sku,
        sku: r.sku,
        marca: r.marca,
        categoria: r.categoria,
        tipo: r.tipo,
        qtd_por_kit: Number(r.qtd_por_kit) || 1,
        empresa_id: r.empresa,
        empresa_nome:
          r.expand?.empresa?.nome_fantasia || r.expand?.empresa?.razao_social || 'Sem Empresa',
        empresa_cnpj: r.expand?.empresa?.cnpj,
        ordem: idx,
      }))
    } catch (err) {
      console.error('lucroService.listarProdutos falhou:', err)
      return []
    }
  },

  /**
   * Busca as lojas/canais de venda cadastrados (prec_canais)
   */
  async listarCanais(): Promise<CanalLojaLucro[]> {
    try {
      const records = await pb.collection<PrecCanalPB>('prec_canais').getFullList({
        filter: 'ativo = true',
        sort: 'ordem,nome',
        expand: 'marketplace',
      })

      return records.map((c, idx) => {
        const mktExpand = c.expand?.marketplace
        // Se for canal próprio ou não tiver marketplace associado, rotula de forma clara
        const marketplaceNome =
          mktExpand?.nome || (c.tipo === 'site_proprio' ? 'Site Próprio' : c.nome)
        const marketplaceCor = mktExpand?.cor || c.cor || '#0284C7'

        return {
          id: c.id,
          nome: c.nome,
          tipo: c.tipo,
          marketplace_id: c.marketplace || (c.tipo === 'site_proprio' ? 'site_proprio' : c.id),
          marketplace_nome: marketplaceNome,
          marketplace_cor: marketplaceCor,
          ordem: c.ordem ?? idx,
        }
      })
    } catch (err) {
      console.error('lucroService.listarCanais falhou:', err)
      return []
    }
  },

  /**
   * Carrega todas as precificações APROVADAS (status='aprovada')
   * Mapeadas por [produto_id][canal_id] => { renda_liquida_unitaria, tem_aprovacao }
   */
  async carregarRendasLiquidasAprovadas(): Promise<
    Record<string, Record<string, { renda_liquida_unitaria: number; tem_aprovacao: boolean }>>
  > {
    const mapa: Record<
      string,
      Record<string, { renda_liquida_unitaria: number; tem_aprovacao: boolean }>
    > = {}

    try {
      const precs = await pb.collection<PrecPrecificacaoPB>('prec_precificacoes').getFullList({
        filter: 'status = "aprovada"',
      })

      for (const p of precs) {
        if (!p.produto || !p.canal) continue
        if (!mapa[p.produto]) {
          mapa[p.produto] = {}
        }
        const rendaLiq = extrairRendaLiquidaDePrecificacao(p)
        mapa[p.produto][p.canal] = {
          renda_liquida_unitaria: rendaLiq,
          tem_aprovacao: true,
        }
      }
    } catch (err) {
      console.error('lucroService.carregarRendasLiquidasAprovadas falhou:', err)
    }

    return mapa
  },

  /**
   * Busca despesas reais do mês (competência YYYY-MM) agrupadas diretamente pelos Destinos
   * cadastrados em /despesas ('Destino da despesa / Centro de custo' = coleção tags e direcionamentos).
   * Dinâmico do banco: agrupa por cada tag real existente (ex: Eu, Eu/Casa, Rafa, Empresa, etc.)
   */
  /**
   * Busca todas as precificações APROVADAS com detalhes do produto e canal,
   * para alimentar a busca e seleção do popup 'Adicionar Produto' (apenas pares produto+canal precificados).
   */
  async listarPrecificacoesAprovadasDetalhado(): Promise<PrecificacaoAprovadaItem[]> {
    try {
      const records = await pb.collection<PrecPrecificacaoPB>('prec_precificacoes').getFullList({
        filter: 'status = "aprovada"',
        expand: 'produto.empresa,canal.marketplace',
      })

      return records.map((p) => {
        const prod = p.expand?.produto
        const canal = p.expand?.canal
        const mkt = canal?.expand?.marketplace
        const empresa = prod?.expand?.empresa
        const resultado = p.resultado_json || {}

        return {
          id: p.id,
          produto_id: p.produto,
          produto_nome: prod?.nome || prod?.sku || 'Produto Sem Nome',
          produto_sku: prod?.sku,
          produto_marca: prod?.marca,
          produto_categoria: prod?.categoria,
          qtd_por_kit: prod?.qtd_por_kit,
          empresa_nome: empresa?.nome_fantasia || empresa?.razao_social,
          empresa_cnpj: empresa?.cnpj,
          canal_id: p.canal,
          canal_nome: canal?.nome || 'Canal',
          marketplace_nome: mkt?.nome || canal?.nome,
          preco_venda: Number(resultado.preco_venda || p.preco_venda_calculado || 0),
          lucro_liquido_unitario: Number(
            resultado.lucro_liquido_unitario || p.lucro_liquido_calculado || 0,
          ),
          margem_liquida_percentual: Number(
            resultado.margem_liquida_percentual || p.margem_liquida_calculada || 0,
          ),
        }
      })
    } catch (err) {
      console.error('lucroService.listarPrecificacoesAprovadasDetalhado falhou:', err)
      return []
    }
  },

  async carregarDespesasMes(competencia: string): Promise<DespesaGrupoItem[]> {
    try {
      const [ocorrencias, tags] = await Promise.all([
        pb.collection<DespesaOcorrenciaPB>('despesas_ocorrencias').getFullList({
          filter: `competencia = '${competencia}' && status != 'cancelada'`,
          expand: 'compromisso.tag,compromisso',
        }),
        pb.collection<TagPB>('tags').getFullList({
          sort: 'nome',
        }),
      ])

      const tagMap = new Map<string, TagPB>()
      tags.forEach((t) => tagMap.set(t.id, t))

      // Mapa para agrupar por Destino real cadastrado
      const mapaDestinos = new Map<
        string,
        {
          grupo_id: string
          grupo_nome: string
          cor: string
          total: number
          itens: Array<{
            id: string
            descricao: string
            valor: number
            tag_nome?: string
            destino?: string
          }>
        }
      >()

      for (const oc of ocorrencias) {
        // Regra de valor: utiliza valor_pago se baixada, ou valor_previsto
        const valor = Number(oc.valor_pago || oc.valor_previsto || 0)
        if (valor <= 0) continue

        const comp = oc.expand?.compromisso
        const tagObj = comp?.expand?.tag || (comp?.tag ? tagMap.get(comp.tag) : undefined)
        const tagNome =
          tagObj?.nome || oc.direcionamento || comp?.direcionamento || 'Sem Destino Definido'
        const tagId = tagObj?.id || tagNome.toLowerCase().trim()
        const tagCor = tagObj?.cor || '#64748B'

        if (!mapaDestinos.has(tagId)) {
          mapaDestinos.set(tagId, {
            grupo_id: tagId,
            grupo_nome: tagNome,
            cor: tagCor,
            total: 0,
            itens: [],
          })
        }

        const grupo = mapaDestinos.get(tagId)!
        grupo.total = Math.round((grupo.total + valor + Number.EPSILON) * 100) / 100
        grupo.itens.push({
          id: oc.id,
          descricao: comp?.descricao || 'Despesa',
          valor,
          tag_nome: tagNome,
          destino: tagNome,
        })
      }

      // Ordena por maior valor total
      return Array.from(mapaDestinos.values()).sort((a, b) => b.total - a.total)
    } catch (err) {
      console.error('lucroService.carregarDespesasMes falhou:', err)
      return []
    }
  },
}
