import { describe, it, expect, vi, beforeEach } from 'vitest'
import { produtosCompostosService } from '@/services/produtos'
import pb from '@/lib/pocketbase/client'

describe('Deduplicação de Produtos Compostos no Sync para Precificação (prec_produtos)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('deve atualizar o espelho legado existente em vez de criar duplicata quando houver correspondência por fornecedor_produto', async () => {
    // Caso real Rosto Folha:
    // Produto composto 'x9j4lsdwsfl6lcn' tem base_origem 'kfznx7npy8v0qmb'
    // base_origem expandida tem origem_colecao='fornecedores_produtos' e origem_id='99luu3zq46iwhiu'
    // O espelho legado em prec_produtos é 'pqvbxzrg1v5mj4r' com SKU 'REV-99LUU3ZQ46IWHIU' e fornecedor_produto='99luu3zq46iwhiu'
    const mockProdutoComposto = {
      id: 'x9j4lsdwsfl6lcn',
      nome: 'Rosto Folha',
      classificacao: 'revenda' as const,
      base_origem: 'kfznx7npy8v0qmb',
      sku: 'R-Folha',
      custo_aquisicao: 4.3,
      custo_composicao: 0.17,
      custo_embalagem: 0.12, // Duplicado que deve ser zerado pelo cálculo
      custo_etiqueta: 0,
      custo_total: 4.47,
      composicao: [
        {
          codigo: 'C0',
          descricao: 'Saco Plastico Preto 21x40',
          qtd: 1,
          custo_unitario: 0.12,
          categoria_nome: 'Embalagem',
          categoria_custo: 'insumo',
        },
        {
          codigo: 'C1',
          descricao: 'Etiqueta Envio',
          qtd: 1,
          custo_unitario: 0.05,
          categoria_nome: 'Etiqueta',
          categoria_custo: 'insumo',
        },
      ],
      empresas: ['c8v8eg0errmelt6'],
      expand: {
        base_origem: {
          id: 'kfznx7npy8v0qmb',
          nome: 'Rosto Folha',
          tipo: 'revenda',
          fornecedor: 'hm0ebfctv6gnpal',
          origem_colecao: 'fornecedores_produtos',
          origem_id: '99luu3zq46iwhiu',
        },
      },
    }

    const mockEspelhoLegadoPrec = {
      id: 'pqvbxzrg1v5mj4r',
      sku: 'REV-99LUU3ZQ46IWHIU',
      nome: 'Rosto Folha',
      fornecedor_produto: '99luu3zq46iwhiu',
      fornecedor: 'hm0ebfctv6gnpal',
      custo_aquisicao_unitario: 4.3,
    }

    const updateMock = vi.fn().mockResolvedValue({
      ...mockEspelhoLegadoPrec,
      sku: 'R-Folha',
      origem_id: 'x9j4lsdwsfl6lcn',
      base_origem: 'kfznx7npy8v0qmb',
    })
    const createMock = vi.fn()

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'produtos') {
        return {
          getOne: vi.fn().mockResolvedValue(mockProdutoComposto),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockImplementation((_page: number, _perPage: number, options?: any) => {
            const filter = options?.filter || ''
            // 1. busca por origem_id: não acha inicialmente
            if (filter.includes('origem_id = "x9j4lsdwsfl6lcn"')) {
              return Promise.resolve({ items: [] })
            }
            // 2. busca por base_origem: não acha inicialmente
            if (filter.includes('base_origem = "kfznx7npy8v0qmb"')) {
              return Promise.resolve({ items: [] })
            }
            // 3. busca por fornecedor_produto: ENCONTRA o espelho legado!
            if (filter.includes('fornecedor_produto = "99luu3zq46iwhiu"')) {
              return Promise.resolve({ items: [mockEspelhoLegadoPrec] })
            }
            // 4. busca por sku:
            if (filter.includes('sku = "R-Folha"')) {
              return Promise.resolve({ items: [] })
            }
            return Promise.resolve({ items: [] })
          }),
          update: updateMock,
          create: createMock,
        } as any
      }
      return {} as any
    })

    const resultado = await produtosCompostosService.syncComPrecificacao('x9j4lsdwsfl6lcn')

    // Deve atualizar o registro existente 'pqvbxzrg1v5mj4r' e NUNCA chamar create
    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith(
      'pqvbxzrg1v5mj4r',
      expect.objectContaining({
        nome: 'Rosto Folha',
        sku: 'R-Folha',
        origem_id: 'x9j4lsdwsfl6lcn',
        base_origem: 'kfznx7npy8v0qmb',
        custo_aquisicao_unitario: 4.3,
        custo_adicional_embalagem: 0, // Dupla contagem eliminada!
      }),
    )
    expect(resultado.id).toBe('pqvbxzrg1v5mj4r')
  })

  it('deve priorizar match por origem_id quando já sincronizado anteriormente', async () => {
    const mockProduto = {
      id: 'prod_abc_1',
      nome: 'Toalha Banho Teste',
      classificacao: 'fabricacao_propria' as const,
      sku: 'TB-TESTE',
      custo_aquisicao: 0,
      custo_composicao: 10,
      custo_embalagem: 0,
      custo_etiqueta: 0,
      composicao: [],
    }

    const mockPrecJaSincronizado = {
      id: 'prec_existente_abc',
      origem_id: 'prod_abc_1',
      sku: 'TB-TESTE',
    }

    const updateMock = vi.fn().mockResolvedValue(mockPrecJaSincronizado)
    const createMock = vi.fn()

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'produtos') {
        return {
          getOne: vi.fn().mockResolvedValue(mockProduto),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockImplementation((_page: number, _perPage: number, options?: any) => {
            const filter = options?.filter || ''
            if (filter.includes('origem_id = "prod_abc_1"')) {
              return Promise.resolve({ items: [mockPrecJaSincronizado] })
            }
            return Promise.resolve({ items: [] })
          }),
          update: updateMock,
          create: createMock,
        } as any
      }
      return {} as any
    })

    const resultado = await produtosCompostosService.syncComPrecificacao('prod_abc_1')

    expect(createMock).not.toHaveBeenCalled()
    expect(updateMock).toHaveBeenCalledWith('prec_existente_abc', expect.anything())
    expect(resultado.id).toBe('prec_existente_abc')
  })

  it('excluir composto sem histórico aprovado deve remover a sombra em prec_produtos na mesma operação', async () => {
    const deleteCompostoMock = vi.fn().mockResolvedValue(true)
    const deletePrecMock = vi.fn().mockResolvedValue(true)
    const updatePrecMock = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'produtos') {
        return {
          delete: deleteCompostoMock,
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [{ id: 'sombra_sem_aprovados', origem_id: 'prod_excluido_1', status: 'ativo' }],
          }),
          delete: deletePrecMock,
          update: updatePrecMock,
        } as any
      }
      if (col === 'prec_precificacoes') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      if (col === 'prec_matriz_classificacoes') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      return {} as any
    })

    const result = await produtosCompostosService.delete('prod_excluido_1')

    expect(result).toBe(true)
    expect(deletePrecMock).toHaveBeenCalledWith('sombra_sem_aprovados')
    expect(updatePrecMock).not.toHaveBeenCalled()
    expect(deleteCompostoMock).toHaveBeenCalledWith('prod_excluido_1')
  })

  it('excluir composto COM cenários aprovados deve desativar (status=inativo) a sombra para preservar histórico', async () => {
    const deleteCompostoMock = vi.fn().mockResolvedValue(true)
    const deletePrecMock = vi.fn().mockResolvedValue(true)
    const updatePrecMock = vi.fn().mockResolvedValue({})

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'produtos') {
        return {
          delete: deleteCompostoMock,
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [{ id: 'sombra_com_aprovados', origem_id: 'prod_excluido_2', status: 'ativo' }],
          }),
          delete: deletePrecMock,
          update: updatePrecMock,
        } as any
      }
      if (col === 'prec_precificacoes') {
        return {
          getList: vi.fn().mockResolvedValue({
            items: [{ id: 'prec_aprovada_1', status: 'aprovada', preco_aprovado: 29.9 }],
            totalItems: 1,
          }),
        } as any
      }
      if (col === 'prec_matriz_classificacoes') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      return {} as any
    })

    const result = await produtosCompostosService.delete('prod_excluido_2')

    expect(result).toBe(true)
    // NÃO deve deletar para não perder histórico/cascade
    expect(deletePrecMock).not.toHaveBeenCalled()
    // DEVE desativar imediatamente
    expect(updatePrecMock).toHaveBeenCalledWith('sombra_com_aprovados', { status: 'inativo' })
    expect(deleteCompostoMock).toHaveBeenCalledWith('prod_excluido_2')
  })

  it('sync e podarOrfaosPrecificacao removem sombras de produtos deletados mas NÃO tocam em produtos_base', async () => {
    const deletePrecMock = vi.fn().mockResolvedValue(true)
    const updatePrecMock = vi.fn().mockResolvedValue({})
    const deleteProdutosBaseMock = vi.fn().mockResolvedValue(true)

    const sombrasNoBanco = [
      { id: 'prec_orfao_1', origem_id: 'prod_deletado_antigo', status: 'ativo' },
      { id: 'prec_vivo_1', origem_id: 'prod_vivo_999', status: 'ativo' },
    ]

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'produtos') {
        return {
          getFullList: vi.fn().mockResolvedValue([{ id: 'prod_vivo_999' }]),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getFullList: vi.fn().mockResolvedValue(sombrasNoBanco),
          delete: deletePrecMock,
          update: updatePrecMock,
        } as any
      }
      if (col === 'produtos_base') {
        return {
          delete: deleteProdutosBaseMock,
        } as any
      }
      if (col === 'prec_precificacoes') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      if (col === 'prec_matriz_classificacoes') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      return {} as any
    })

    const resultadoPoda = await produtosCompostosService.podarOrfaosPrecificacao()

    // Órfão prod_deletado_antigo foi podado
    expect(resultadoPoda.removidos).toBe(1)
    expect(deletePrecMock).toHaveBeenCalledWith('prec_orfao_1')
    // Produto vivo não foi tocado
    expect(deletePrecMock).not.toHaveBeenCalledWith('prec_vivo_1')
    // produtos_base de aquisição/revenda NUNCA é tocado pela poda
    expect(deleteProdutosBaseMock).not.toHaveBeenCalled()
  })

  it('quando um produto é recriado após ter sido inativado, sync reativa o espelho preservando cenários anteriores', async () => {
    const mockProdutoRecriado = {
      id: 'prod_recriado_1',
      nome: 'Rosto Folha',
      classificacao: 'revenda' as const,
      base_origem: 'base_folha_1',
      sku: 'R-Folha',
      custo_aquisicao: 4.3,
      custo_composicao: 0,
      custo_embalagem: 0,
      custo_etiqueta: 0,
      custo_total: 4.3,
      composicao: [],
      status: 'ativo' as const,
    }

    const mockEspelhoInativoComCenarios = {
      id: 'prec_inativo_folha',
      sku: 'R-Folha',
      nome: 'Rosto Folha',
      origem_id: 'prod_recriado_1',
      base_origem: 'base_folha_1',
      status: 'inativo',
    }

    const updateMock = vi.fn().mockImplementation((id: string, payload: any) => {
      return Promise.resolve({ ...mockEspelhoInativoComCenarios, ...payload })
    })

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'produtos') {
        return {
          getOne: vi.fn().mockResolvedValue(mockProdutoRecriado),
          getFullList: vi.fn().mockResolvedValue([{ id: 'prod_recriado_1' }]),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getFullList: vi.fn().mockResolvedValue([mockEspelhoInativoComCenarios]),
          getList: vi.fn().mockImplementation((_p: number, _pp: number, opts: any) => {
            if (opts?.filter?.includes('origem_id = "prod_recriado_1"')) {
              return Promise.resolve({ items: [mockEspelhoInativoComCenarios] })
            }
            return Promise.resolve({ items: [] })
          }),
          update: updateMock,
          create: vi.fn(),
          delete: vi.fn(),
        } as any
      }
      return {} as any
    })

    const res = await produtosCompostosService.syncComPrecificacao('prod_recriado_1')

    // Deve atualizar o espelho inativo existente, reativando-o (status: 'ativo')
    expect(updateMock).toHaveBeenCalledWith(
      'prec_inativo_folha',
      expect.objectContaining({
        status: 'ativo',
        origem_id: 'prod_recriado_1',
        sku: 'R-Folha',
      }),
    )
    expect(res?.status).toBe('ativo')
  })

  it('syncComPrecificacao propaga perda_pct do produto composto para prec_produtos', async () => {
    const mockProdutoComPerda = {
      id: 'prod_perda_global_1',
      nome: 'Produto Com Perda Global',
      classificacao: 'fabricacao_propria' as const,
      sku: 'PROD-PERDA-10',
      custo_aquisicao: 0,
      custo_composicao: 10,
      custo_embalagem: 0,
      custo_etiqueta: 0,
      perda_pct: 12.5,
      composicao: [
        {
          codigo: 'C0',
          descricao: 'Matéria-prima',
          qtd: 1,
          custo_unitario: 10,
          categoria_custo: 'insumo',
        },
      ],
      status: 'ativo' as const,
    }

    const mockPrecItem = {
      id: 'prec_perda_1',
      origem_id: 'prod_perda_global_1',
      sku: 'PROD-PERDA-10',
      perda_pct: 0,
    }

    const updateMock = vi.fn().mockImplementation((id: string, payload: any) => {
      return Promise.resolve({ ...mockPrecItem, ...payload })
    })

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'produtos') {
        return {
          getOne: vi.fn().mockResolvedValue(mockProdutoComPerda),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockImplementation((_p: number, _pp: number, opts: any) => {
            if (opts?.filter?.includes('origem_id = "prod_perda_global_1"')) {
              return Promise.resolve({ items: [mockPrecItem] })
            }
            return Promise.resolve({ items: [] })
          }),
          update: updateMock,
          create: vi.fn(),
        } as any
      }
      return {} as any
    })

    const res = await produtosCompostosService.syncComPrecificacao('prod_perda_global_1')

    expect(updateMock).toHaveBeenCalledWith(
      'prec_perda_1',
      expect.objectContaining({
        perda_pct: 12.5,
      }),
    )
    expect(res?.perda_pct).toBe(12.5)
  })
})
