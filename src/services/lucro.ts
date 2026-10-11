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

interface PrecCanalPB {
  id: string
  nome: string
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
  resultado?: Record<string, unknown>
  aprovado_em?: string
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
        return {
          id: c.id,
          nome: c.nome,
          marketplace_id: c.marketplace,
          marketplace_nome: mktExpand?.nome || c.nome,
          marketplace_cor: mktExpand?.cor || c.cor,
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
   * Busca despesas do mês (competência YYYY-MM) agrupadas por Destino (tag 'destino' ou compromisso.tag),
   * mapeando para os grupos de contexto conhecidos (WeeKids, KzaMari, GrupoKza, Família Mari / Pessoal)
   */
  async carregarDespesasMes(competencia: string): Promise<DespesaGrupoItem[]> {
    try {
      const [ocorrencias, gruposContexto, tags] = await Promise.all([
        pb.collection<DespesaOcorrenciaPB>('despesas_ocorrencias').getFullList({
          filter: `competencia = '${competencia}' && status != 'cancelada'`,
          expand: 'compromisso.tag,compromisso',
        }),
        pb.collection<ContextoGrupoPB>('contexto_grupos').getFullList({
          sort: 'ordem,nome',
        }),
        pb.collection<TagPB>('tags').getFullList({
          sort: 'nome',
        }),
      ])

      // Mapa para localizar tag por id
      const tagMap = new Map<string, TagPB>()
      tags.forEach((t) => tagMap.set(t.id, t))

      // Mapeamento de grupos de contexto conhecidos
      // GrupoKza (com WeeKids, KzaMari, etc.) e Família Mari (com Eu, Eu/Casa, Rafa, etc.)
      // Grupos padrão conforme layout do usuário:
      const gruposDefinidos: Record<string, { nome: string; cor: string; tags: string[] }> = {
        grupokza: {
          nome: 'GrupoKza',
          cor: '#4C3A8C',
          tags: [
            'weekids',
            'weekids - site',
            'weekids - mkt.plcs',
            'kzamari',
            'kzamari - site',
            'kzamari - mkt.plcs',
            'kzamari+weekids',
            'grupokza',
            'gkza - barracão',
            'empresa',
            'geral',
          ],
        },
        familiamari: {
          nome: 'Família Mari',
          cor: '#2B5BA8',
          tags: [
            'cpf/cnpj',
            'eu',
            'eu/casa',
            'casa',
            'fer',
            'fernanda',
            'rafa',
            'lara',
            'mãe',
            'mae',
            'pessoal',
          ],
        },
      }

      // Agrupador de resultados
      const acumuladorPorGrupo: Record<
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
      > = {
        grupokza: {
          grupo_id: 'grupokza',
          grupo_nome: 'GrupoKza',
          cor: '#4C3A8C',
          total: 0,
          itens: [],
        },
        familiamari: {
          grupo_id: 'familiamari',
          grupo_nome: 'Família Mari',
          cor: '#2B5BA8',
          total: 0,
          itens: [],
        },
        outros: {
          grupo_id: 'outros',
          grupo_nome: 'Outros Destinos',
          cor: '#64748B',
          total: 0,
          itens: [],
        },
      }

      for (const oc of ocorrencias) {
        const valor = Number(oc.valor_pago || oc.valor_previsto || 0)
        if (valor <= 0) continue

        const comp = oc.expand?.compromisso
        const tagObj = comp?.expand?.tag || (comp?.tag ? tagMap.get(comp.tag) : undefined)
        const tagNome = tagObj?.nome || oc.direcionamento || comp?.direcionamento || 'Sem Tag'
        const tagKey = tagNome.toLowerCase().trim()

        // Determina grupo de destino
        let chaveGrupo = 'outros'
        if (gruposDefinidos.grupokza.tags.some((t) => tagKey.includes(t) || t.includes(tagKey))) {
          chaveGrupo = 'grupokza'
        } else if (
          gruposDefinidos.familiamari.tags.some((t) => tagKey.includes(t) || t.includes(tagKey))
        ) {
          chaveGrupo = 'familiamari'
        }

        const grupoDest = acumuladorPorGrupo[chaveGrupo]
        grupoDest.total += valor
        grupoDest.itens.push({
          id: oc.id,
          descricao: comp?.descricao || 'Despesa',
          valor,
          tag_nome: tagNome,
          destino: tagNome,
        })
      }

      // Constrói lista de grupos com subtotais por destino (tag)
      return Object.values(acumuladorPorGrupo).filter((g) => g.total > 0 || g.grupo_id !== 'outros')
    } catch (err) {
      console.error('lucroService.carregarDespesasMes falhou:', err)
      return []
    }
  },
}
