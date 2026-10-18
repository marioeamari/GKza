import { describe, it, expect } from 'vitest'
import {
  normalizarTiposFornecedor,
  rotuloTiposFornecedor,
  fornecedorTemTipo,
  fornecedorOfereceRevenda,
  fornecedorOfereceInsumos,
  fornecedorOfereceServicos,
  filtrarItensParaSeletorPrecificacao,
  filtrarItensParaSeletorComposicao,
  filtrarProdutosCompostosPorFornecedor,
  transformarFornecedorProdutoEmProdutoBase,
  transformarInsumoEmProdutoBase,
} from './classificacao-fornecedores'
import { calcularCustosProdutoComposto } from '@/services/produtos'
import { congelarSnapshotReceita } from '@/services/insumos'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'
import type { ProdutoCompostoRecord } from '@/types/domain'

describe('classificacao-fornecedores: tipos e badges do fornecedor', () => {
  it('normaliza array nulo/vazio para [revenda] como fallback seguro', () => {
    expect(normalizarTiposFornecedor(undefined)).toEqual(['revenda'])
    expect(normalizarTiposFornecedor(null)).toEqual(['revenda'])
    expect(normalizarTiposFornecedor([])).toEqual(['revenda'])
  })

  it('normaliza strings legacy separadas por vírgula ou JSON string', () => {
    expect(normalizarTiposFornecedor('revenda,insumos')).toEqual(['revenda', 'insumos'])
    expect(normalizarTiposFornecedor('["servicos","insumos"]')).toEqual(['servicos', 'insumos'])
  })

  it('valida predicates de conveniência', () => {
    const multi = { tipos: ['revenda', 'insumos'] }
    expect(fornecedorOfereceRevenda(multi)).toBe(true)
    expect(fornecedorOfereceInsumos(multi)).toBe(true)
    expect(fornecedorOfereceServicos(multi)).toBe(false)
    expect(fornecedorTemTipo(multi, 'revenda')).toBe(true)
    expect(rotuloTiposFornecedor(multi.tipos)).toBe('Revenda, Insumos')
  })
})

describe('Regras Acordadas do ERP GKza — Reestruturação Produtos/Fornecedores', () => {
  // --------------------------------------------------------------------------
  // REGRA 1: Seletor de precificação/orçamento lista apenas produtos compostos,
  // nunca produtos_base / insumos isolados.
  // --------------------------------------------------------------------------
  describe('Regra 1: filtrarItensParaSeletorPrecificacao', () => {
    it('filtra catálogo para aceitar apenas entidade produtos (compostos), barrando produtos_base e insumos', () => {
      const catalogoMisto = [
        { id: 'p1', nome: 'Toalha Allure Banhão', _collection: 'produtos' },
        { id: 'pb1', nome: 'Tecido Algodão Egípcio', _collection: 'produtos_base' },
        { id: 'pb2', nome: 'Linha Costura 120', _collection: 'produtos_base', tipo: 'insumo' },
        { id: 'ins1', nome: 'Etiqueta Bordada Antiga', _collection: 'insumos' },
        { id: 'fp1', nome: 'Toalha Bruta Legada', _collection: 'fornecedores_produtos' },
        { id: 'p2', nome: 'Kit 4 Toalhas Lavabo', _collection: 'produtos' },
      ]

      const resultado = filtrarItensParaSeletorPrecificacao(catalogoMisto)

      expect(resultado).toHaveLength(2)
      expect(resultado.map((r) => r.id)).toEqual(['p1', 'p2'])
      expect(resultado.every((r) => r._collection === 'produtos')).toBe(true)
    })

    it('em itens de teste com coleções separadas, rejeita produtos_base e insumos', () => {
      const itens = [
        { id: 'pb3', nome: 'Base Revenda', _collection: 'produtos_base' },
        { id: 'pb4', nome: 'Base Insumo', _collection: 'insumos' },
        { id: 'p3', nome: 'Produto Composto A', _collection: 'produtos' },
      ]

      const resultado = filtrarItensParaSeletorPrecificacao(itens)
      expect(resultado).toHaveLength(1)
      expect(resultado[0].id).toBe('p3')
    })
  })

  // --------------------------------------------------------------------------
  // REGRA 2: Cálculo analítico de custos:
  // - revenda: custo_total = aquisição(base_origem) + composição + embalagem + etiqueta
  // - fabricação própria: custo_total = composição + embalagem + etiqueta (aquisição = 0)
  // --------------------------------------------------------------------------
  describe('Regra 2: calcularCustosProdutoComposto (revenda vs fabricação própria)', () => {
    const composicaoExemplo: ItemComposicaoCusto[] = [
      {
        id: 'c1',
        insumo_id: 'base-linha',
        descricao: 'Linha Costura 120',
        qtd: 2,
        custo_unitario: 1.5,
      },
      {
        id: 'c2',
        insumo_id: 'base-tag',
        descricao: 'Tag personalizada',
        qtd: 1,
        custo_unitario: 2.25,
      },
    ] // Soma = 2*1.5 + 1*2.25 = 5.25

    it('calcula custo_total para revenda somando aquisição base + composição + embalagem + etiqueta', () => {
      const custos = calcularCustosProdutoComposto({
        classificacao: 'revenda',
        custo_aquisicao: 42.5,
        composicao: composicaoExemplo,
        custo_embalagem: 3.5,
        custo_etiqueta: 1.25,
      })

      expect(custos.custo_aquisicao).toBe(42.5)
      expect(custos.custo_composicao).toBe(5.25)
      expect(custos.custo_embalagem).toBe(3.5)
      expect(custos.custo_etiqueta).toBe(1.25)
      // 42.50 + 5.25 + 3.50 + 1.25 = 52.50
      expect(custos.custo_total).toBe(52.5)
    })

    it('calcula custo_total para fabricação própria forçando aquisição a 0', () => {
      const custos = calcularCustosProdutoComposto({
        classificacao: 'fabricacao_propria',
        custo_aquisicao: 999.99, // Mesmo se fornecido por engano, deve ser ignorado
        composicao: composicaoExemplo,
        custo_embalagem: 4.0,
        custo_etiqueta: 2.0,
      })

      expect(custos.custo_aquisicao).toBe(0)
      expect(custos.custo_composicao).toBe(5.25)
      expect(custos.custo_embalagem).toBe(4.0)
      expect(custos.custo_etiqueta).toBe(2.0)
      // 0 + 5.25 + 4.00 + 2.00 = 11.25
      expect(custos.custo_total).toBe(11.25)
    })
  })

  // --------------------------------------------------------------------------
  // REGRA 3: Produto vinculado a 2 empresas não duplica receita
  // O vínculo é por array de IDs (multi-relação), preservando uma única receita centralizada.
  // --------------------------------------------------------------------------
  describe('Regra 3: Produto vinculado a múltiplas empresas por relação, sem duplicar receita', () => {
    it('um único produto composto atende múltiplas empresas mantendo a mesma composição de receita', () => {
      const produtoComposto: ProdutoCompostoRecord = {
        id: 'prod-toalha-allure',
        collectionId: 'col_produtos',
        collectionName: 'produtos',
        nome: 'Toalha de Banho Allure Banhão',
        classificacao: 'fabricacao_propria',
        empresas: ['empresa-gkza-1', 'empresa-bleve-2'], // Vínculo multi-relação
        base_origem: '',
        custo_aquisicao: 0,
        custo_composicao: 32.5,
        custo_embalagem: 2.5,
        custo_etiqueta: 1.0,
        custo_total: 36.0,
        composicao: [
          {
            id: 'item-1',
            insumo_id: 'tecido-fio-penteado',
            descricao: 'Tecido Fio Penteado 500g',
            qtd: 1.2,
            custo_unitario: 25.0,
          },
          {
            id: 'item-2',
            insumo_id: 'linha-poliester',
            descricao: 'Linha Poliéster',
            qtd: 1,
            custo_unitario: 2.5,
          },
        ],
        status: 'ativo',
        created: '2025-01-01',
        updated: '2025-01-01',
      }

      // Ambas as empresas enxergam a mesma receita
      expect(produtoComposto.empresas).toContain('empresa-gkza-1')
      expect(produtoComposto.empresas).toContain('empresa-bleve-2')
      expect(produtoComposto.empresas).toHaveLength(2)

      // A receita não foi clonada; a composição existe 1 única vez na entidade produto
      expect(produtoComposto.composicao).toHaveLength(2)
      expect(produtoComposto.custo_total).toBe(36.0)
    })
  })

  // --------------------------------------------------------------------------
  // REGRA 4: Migração idempotente / preservação de dados legados:
  // Testar as funções de transformação pura do backfill (0132):
  // - fornecedores_produtos -> produtos_base (tipo revenda preservando sku/ncm/custo/dimensões)
  // - insumos -> produtos_base (preservando dimensões/unidade/valor/tipo)
  // --------------------------------------------------------------------------
  describe('Regra 4: Transformações de preservação do backfill (0132)', () => {
    it('transforma fornecedores_produtos em produtos_base tipo revenda preservando sku, ncm, barras e dimensões', () => {
      const legadoFp = {
        id: 'fp-100',
        descricao: 'Toalha Dohler Prisma Branca',
        fornecedor: 'forn-dohler',
        sku_fornecedor: 'DOH-PRI-BCO',
        ncm: '63026000',
        codigo_barras: '7891234567890',
        unidade: 'un',
        preco_custo_unitario: 38.9,
        preco_ultima_compra: 40.0,
        comprimento_cm: 140,
        largura_cm: 70,
        altura_cm: 2,
        peso_g: 450,
        ativo: true,
        observacoes: 'Produto de giro rápido',
      }

      const pb = transformarFornecedorProdutoEmProdutoBase(legadoFp)

      expect(pb.nome).toBe('Toalha Dohler Prisma Branca')
      expect(pb.tipo).toBe('revenda')
      expect(pb.fornecedor).toBe('forn-dohler')
      expect(pb.sku).toBe('DOH-PRI-BCO')
      expect(pb.ncm).toBe('63026000')
      expect(pb.codigo_barras).toBe('7891234567890')
      expect(pb.unidade).toBe('un')
      expect(pb.custo_unitario).toBe(38.9)
      expect(pb.dimensao_tipo).toBe('3d')
      expect(pb.dimensao_comprimento_cm).toBe(140)
      expect(pb.dimensao_largura_cm).toBe(70)
      expect(pb.dimensao_altura_cm).toBe(2)
      expect(pb.peso_g).toBe(450)
      expect(pb.origem_colecao).toBe('fornecedores_produtos')
      expect(pb.origem_id).toBe('fp-100')
      expect(pb.ativo).toBe(true)
    })

    it('transforma insumo em produtos_base preservando dimensões, tipo e valor_unitario', () => {
      const legadoInsumo = {
        id: 'ins-200',
        nome: 'Tecido Gorgurinho Estampado',
        tipo: 'insumo',
        fornecedor: 'forn-santana',
        unidade: 'm',
        valor_unitario: 18.5,
        dimensao_tipo: '2d',
        dimensao_comprimento_cm: 100,
        dimensao_largura_cm: 150,
        dimensao_altura_cm: 0,
        ativo: true,
        observacoes: 'Rolo com 50 metros',
      }

      const pb = transformarInsumoEmProdutoBase(legadoInsumo)

      expect(pb.nome).toBe('Tecido Gorgurinho Estampado')
      expect(pb.tipo).toBe('insumo')
      expect(pb.fornecedor).toBe('forn-santana')
      expect(pb.unidade).toBe('m')
      expect(pb.custo_unitario).toBe(18.5)
      expect(pb.dimensao_tipo).toBe('2d')
      expect(pb.dimensao_comprimento_cm).toBe(100)
      expect(pb.dimensao_largura_cm).toBe(150)
      expect(pb.origem_colecao).toBe('insumos')
      expect(pb.origem_id).toBe('ins-200')
      expect(pb.ativo).toBe(true)
    })

    it('transforma insumo do tipo servico em produtos_base com tipo servico', () => {
      const legadoServico = {
        id: 'ins-300',
        nome: 'Corte e Costura Bainha',
        tipo: 'servico',
        fornecedor: 'faccao-silva',
        unidade: 'un',
        valor_unitario: 4.5,
      }

      const pb = transformarInsumoEmProdutoBase(legadoServico)
      expect(pb.tipo).toBe('servico')
      expect(pb.custo_unitario).toBe(4.5)
      expect(pb.fornecedor).toBe('faccao-silva')
    })
  })

  // --------------------------------------------------------------------------
  // REGRA 5: Snapshot de orçamento congelado não muda quando produto/base é editado depois.
  // --------------------------------------------------------------------------
  describe('Regra 5: Imutabilidade do snapshot de orçamento congelado', () => {
    it('garante que a composição congelada no orçamento resiste a alterações posteriores do catálogo de produtos/base', () => {
      const composicaoOriginal: ItemComposicaoCusto[] = [
        {
          id: 'item-base-1',
          insumo_id: 'pb-tecido-luxo',
          descricao: 'Tecido Luxo 400 Fios',
          fornecedor_nome: 'Fornecedor A',
          qtd: 2,
          custo_unitario: 30.0,
        },
      ]

      const dataCongelamento = '2025-01-15T12:00:00.000Z'
      const snapshotCongelado = congelarSnapshotReceita(composicaoOriginal, dataCongelamento)

      expect(snapshotCongelado).toHaveLength(1)
      expect(snapshotCongelado[0].custo_unitario).toBe(30.0)
      expect(snapshotCongelado[0].snapshot_data).toBe(dataCongelamento)
      expect(snapshotCongelado[0].snapshot_valor_unitario).toBe(30.0)

      // Simulação: Fornecedor reajusta o custo unitário e altera descrição no catálogo vivo
      composicaoOriginal[0].custo_unitario = 95.0
      composicaoOriginal[0].descricao = 'Tecido Luxo 400 Fios (REAJUSTADO 200%)'

      // O snapshot congelado no orçamento histórico DEVE permanecer imutável com os valores originais
      expect(snapshotCongelado[0].custo_unitario).toBe(30.0)
      expect(snapshotCongelado[0].snapshot_valor_unitario).toBe(30.0)
      expect(snapshotCongelado[0].descricao).toBe('Tecido Luxo 400 Fios')
    })
  })

  // --------------------------------------------------------------------------
  // REGRA 6: Listas read-only da ficha do fornecedor:
  // - Produtos base vinculados a ele
  // - Produtos compostos que contêm algum item de origem dele (base_origem ou composição)
  // --------------------------------------------------------------------------
  describe('Regra 6: Listas read-only da ficha do fornecedor (filtrarProdutosCompostosPorFornecedor)', () => {
    const fornecedorAlvoId = 'forn-textil-sul'

    const compostos: ProdutoCompostoRecord[] = [
      {
        id: 'comp-1',
        collectionId: 'col_produtos',
        collectionName: 'produtos',
        nome: 'Toalha Banho Revenda Sul',
        classificacao: 'revenda',
        base_origem: 'pb-toalha-bruta-sul', // Vinculado via base_origem pertencente ao fornecedor
        custo_aquisicao: 20,
        custo_composicao: 0,
        custo_embalagem: 0,
        custo_etiqueta: 0,
        custo_total: 20,
        composicao: [],
        status: 'ativo',
        created: '',
        updated: '',
      },
      {
        id: 'comp-2',
        collectionId: 'col_produtos',
        collectionName: 'produtos',
        nome: 'Almofada Artesanal com Zíper Sul',
        classificacao: 'fabricacao_propria',
        base_origem: '',
        custo_aquisicao: 0,
        custo_composicao: 15,
        custo_embalagem: 0,
        custo_etiqueta: 0,
        custo_total: 15,
        composicao: [
          {
            descricao: 'Zíper Invisível',
            insumo_id: 'pb-ziper-invisivel-sul', // Insumo pertencente ao fornecedor
            qtd: 1,
            custo_unitario: 2.5,
          },
        ],
        status: 'ativo',
        created: '',
        updated: '',
      },
      {
        id: 'comp-3',
        collectionId: 'col_produtos',
        collectionName: 'produtos',
        nome: 'Jogo de Cama Outro Fornecedor',
        classificacao: 'revenda',
        base_origem: 'pb-outro-fornecedor',
        custo_aquisicao: 50,
        custo_composicao: 0,
        custo_embalagem: 0,
        custo_etiqueta: 0,
        custo_total: 50,
        composicao: [],
        status: 'ativo',
        created: '',
        updated: '',
      },
      {
        id: 'comp-4',
        collectionId: 'col_produtos',
        collectionName: 'produtos',
        nome: 'Manta Fleece com Serviço do Fornecedor',
        classificacao: 'fabricacao_propria',
        base_origem: '',
        custo_aquisicao: 0,
        custo_composicao: 8,
        custo_embalagem: 0,
        custo_etiqueta: 0,
        custo_total: 8,
        composicao: [
          {
            descricao: 'Serviço de Overlock',
            fornecedor_id: fornecedorAlvoId, // Vinculado diretamente pelo fornecedor_id na linha
            qtd: 1,
            custo_unitario: 8.0,
          },
        ],
        status: 'ativo',
        created: '',
        updated: '',
      },
    ]

    const basesDoFornecedorIds = ['pb-toalha-bruta-sul', 'pb-ziper-invisivel-sul']

    it('encontra produtos compostos que usam produto_base como base_origem ou insumo na composição', () => {
      const filtrados = filtrarProdutosCompostosPorFornecedor({
        compostos,
        fornecedorId: fornecedorAlvoId,
        produtosBaseIdsDoFornecedor: basesDoFornecedorIds,
      })

      const idsEncontrados = filtrados.map((c) => c.id)
      expect(idsEncontrados).toContain('comp-1') // Via base_origem
      expect(idsEncontrados).toContain('comp-2') // Via insumo_id na composição
      expect(idsEncontrados).toContain('comp-4') // Via fornecedor_id na composição
      expect(idsEncontrados).not.toContain('comp-3') // De outro fornecedor
      expect(filtrados).toHaveLength(3)
    })
  })
})
