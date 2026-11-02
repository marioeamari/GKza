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

  describe('Trava contra roubo de espelho entre produtos compostos que compartilham a mesma base_origem', () => {
    it('(a) sync de dois produtos compostos da mesma base_origem produz DOIS espelhos distintos, cada um com o origem_id do próprio produto', async () => {
      // Dois produtos compostos distintos que apontam para a mesma base_origem
      const prodA = {
        id: 'prod_composto_A',
        nome: 'Toalha A - Básica',
        classificacao: 'revenda' as const,
        base_origem: 'base_compartilhada_1',
        sku: 'SKU-A',
        custo_aquisicao: 10,
        custo_composicao: 0.2,
        custo_embalagem: 0,
        custo_etiqueta: 0.05,
        custo_total: 10.25,
        composicao: [],
        status: 'ativo' as const,
      }

      const prodB = {
        id: 'prod_composto_B',
        nome: 'Toalha B - Bordada',
        classificacao: 'revenda' as const,
        base_origem: 'base_compartilhada_1', // mesma base!
        sku: 'SKU-B',
        custo_aquisicao: 10,
        custo_composicao: 0.5,
        custo_embalagem: 0,
        custo_etiqueta: 0.05,
        custo_total: 10.55,
        composicao: [],
        status: 'ativo' as const,
      }

      // Banco em memória simulando prec_produtos
      const bancoPrec: any[] = []

      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'produtos') {
          return {
            getOne: vi.fn().mockImplementation((id: string) => {
              if (id === 'prod_composto_A') return Promise.resolve(prodA)
              if (id === 'prod_composto_B') return Promise.resolve(prodB)
              return Promise.reject(new Error('not found'))
            }),
            getFullList: vi.fn().mockResolvedValue([{ id: prodA.id }, { id: prodB.id }]),
          } as any
        }
        if (col === 'prec_produtos') {
          return {
            getFullList: vi.fn().mockResolvedValue(bancoPrec),
            getList: vi
              .fn()
              .mockImplementation((_page: number, _perPage: number, options?: any) => {
                const filter: string = options?.filter || ''

                // 1. Busca por origem_id
                const matchOrigem = filter.match(/origem_id = "([^"]+)"/)
                if (matchOrigem && !filter.includes('origem_id = ""')) {
                  const idProcurado = matchOrigem[1]
                  const items = bancoPrec.filter((item) => item.origem_id === idProcurado)
                  return Promise.resolve({ items })
                }

                // 2. Busca por base_origem em espelho legado (origem_id = "")
                const matchBase = filter.match(/base_origem = "([^"]+)"/)
                if (matchBase && filter.includes('(origem_id = "" || origem_id = null)')) {
                  const baseId = matchBase[1]
                  const items = bancoPrec.filter(
                    (item) =>
                      item.base_origem === baseId && (!item.origem_id || item.origem_id === ''),
                  )
                  return Promise.resolve({ items })
                }

                // 3. Busca por sku em espelho legado
                const matchSku = filter.match(/sku = "([^"]+)"/)
                if (matchSku && filter.includes('(origem_id = "" || origem_id = null)')) {
                  const sku = matchSku[1]
                  const items = bancoPrec.filter(
                    (item) => item.sku === sku && (!item.origem_id || item.origem_id === ''),
                  )
                  return Promise.resolve({ items })
                }

                return Promise.resolve({ items: [] })
              }),
            create: vi.fn().mockImplementation((payload: any) => {
              const rec = { id: `prec_${bancoPrec.length + 1}`, ...payload }
              bancoPrec.push(rec)
              return Promise.resolve(rec)
            }),
            update: vi.fn().mockImplementation((id: string, payload: any) => {
              const idx = bancoPrec.findIndex((item) => item.id === id)
              if (idx >= 0) {
                bancoPrec[idx] = { ...bancoPrec[idx], ...payload }
                return Promise.resolve(bancoPrec[idx])
              }
              return Promise.resolve({ id, ...payload })
            }),
            delete: vi.fn(),
          } as any
        }
        return {} as any
      })

      // Sync do produto A
      const espelhoA = await produtosCompostosService.syncComPrecificacao('prod_composto_A')
      // Sync do produto B
      const espelhoB = await produtosCompostosService.syncComPrecificacao('prod_composto_B')

      // Devem ser dois espelhos com IDs distintos
      expect(espelhoA.id).not.toBe(espelhoB.id)
      expect(bancoPrec).toHaveLength(2)

      // Cada um possui o origem_id do próprio produto
      expect(espelhoA.origem_id).toBe('prod_composto_A')
      expect(espelhoB.origem_id).toBe('prod_composto_B')
      expect(espelhoA.sku).toBe('SKU-A')
      expect(espelhoB.sku).toBe('SKU-B')
      expect(espelhoA.nome).toBe('Toalha A - Básica')
      expect(espelhoB.nome).toBe('Toalha B - Bordada')
    })

    it('(b) espelho com origem_id de outro produto nunca é adotado nem sobrescrito', async () => {
      // Produto B tentando sincronizar
      const prodB = {
        id: 'prod_B',
        nome: 'Produto B',
        classificacao: 'revenda' as const,
        base_origem: 'base_compartilhada',
        sku: 'SKU-B',
        status: 'ativo' as const,
      }

      // Espelho que pertence ao Produto A (com a mesma base_origem)
      const espelhoDoProdA = {
        id: 'prec_produto_A',
        origem_id: 'prod_A', // Pertence a prod_A!
        base_origem: 'base_compartilhada',
        nome: 'Produto A',
        sku: 'SKU-A',
      }

      const createMock = vi
        .fn()
        .mockImplementation((payload: any) =>
          Promise.resolve({ id: 'prec_produto_B_novo', ...payload }),
        )
      const updateMock = vi.fn()

      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'produtos') {
          return {
            getOne: vi.fn().mockResolvedValue(prodB),
            getFullList: vi.fn().mockResolvedValue([{ id: 'prod_A' }, { id: 'prod_B' }]),
          } as any
        }
        if (col === 'prec_produtos') {
          return {
            getFullList: vi.fn().mockResolvedValue([espelhoDoProdA]),
            getList: vi.fn().mockImplementation((_p: number, _pp: number, opts: any) => {
              const filter: string = opts?.filter || ''
              // Busca por origem_id = "prod_B": não existe
              if (filter.includes('origem_id = "prod_B"')) {
                return Promise.resolve({ items: [] })
              }
              // Busca por base_origem em espelhos legados: não há legados (o que tem pertence a prod_A)
              if (filter.includes('(origem_id = "" || origem_id = null)')) {
                return Promise.resolve({ items: [] })
              }
              return Promise.resolve({ items: [] })
            }),
            create: createMock,
            update: updateMock,
            delete: vi.fn(),
          } as any
        }
        return {} as any
      })

      const res = await produtosCompostosService.syncComPrecificacao('prod_B')

      // O espelho do prod_A NÃO pode ter sido sobrescrito/atualizado
      expect(updateMock).not.toHaveBeenCalledWith('prec_produto_A', expect.anything())
      // Um novo espelho deve ter sido criado
      expect(createMock).toHaveBeenCalledWith(
        expect.objectContaining({
          origem_id: 'prod_B',
          nome: 'Produto B',
          sku: 'SKU-B',
          base_origem: 'base_compartilhada',
        }),
      )
      expect(res.id).toBe('prec_produto_B_novo')
    })

    it('(c) espelho legado sem origem_id continua sendo adotado e atualizado (compatibilidade)', async () => {
      const prodLegado = {
        id: 'prod_novo_legado',
        nome: 'Toalha Banho Legada',
        classificacao: 'revenda' as const,
        base_origem: 'base_legada_123',
        sku: 'TB-LEGADA',
        status: 'ativo' as const,
      }

      // Espelho existente no banco que veio de migração antiga sem origem_id
      const espelhoLegadoSemOrigem = {
        id: 'prec_legado_sem_origem',
        origem_id: '', // VAZIO = legado
        base_origem: 'base_legada_123',
        nome: 'Toalha Banho Legada',
        sku: 'TB-LEGADA',
      }

      const updateMock = vi
        .fn()
        .mockImplementation((id: string, payload: any) => Promise.resolve({ id, ...payload }))
      const createMock = vi.fn()

      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'produtos') {
          return {
            getOne: vi.fn().mockResolvedValue(prodLegado),
            getFullList: vi.fn().mockResolvedValue([{ id: 'prod_novo_legado' }]),
          } as any
        }
        if (col === 'prec_produtos') {
          return {
            getFullList: vi.fn().mockResolvedValue([espelhoLegadoSemOrigem]),
            getList: vi.fn().mockImplementation((_p: number, _pp: number, opts: any) => {
              const filter: string = opts?.filter || ''
              if (filter.includes('origem_id = "prod_novo_legado"')) {
                return Promise.resolve({ items: [] })
              }
              // Encontra o espelho legado sem dono pela base_origem
              if (
                filter.includes('base_origem = "base_legada_123"') &&
                filter.includes('(origem_id = "" || origem_id = null)')
              ) {
                return Promise.resolve({ items: [espelhoLegadoSemOrigem] })
              }
              return Promise.resolve({ items: [] })
            }),
            create: createMock,
            update: updateMock,
            delete: vi.fn(),
          } as any
        }
        return {} as any
      })

      const res = await produtosCompostosService.syncComPrecificacao('prod_novo_legado')

      // Deve adotar o espelho legado e atualizá-lo com origem_id = 'prod_novo_legado'
      expect(createMock).not.toHaveBeenCalled()
      expect(updateMock).toHaveBeenCalledWith(
        'prec_legado_sem_origem',
        expect.objectContaining({
          origem_id: 'prod_novo_legado',
          sku: 'TB-LEGADA',
          nome: 'Toalha Banho Legada',
        }),
      )
      expect(res.id).toBe('prec_legado_sem_origem')
    })

    it('(d) caso de referência real: BPesada-Personalizada e BPesada-Person-Nome (mesma base g1pw2ows7124njb) produzem e mantêm dois espelhos independentes', async () => {
      // Dados reais do banco
      const bPesadaPersonalizada = {
        id: 'jaeqbj9cmmmpbiu',
        nome: 'BPesada-Personalizada',
        classificacao: 'revenda' as const,
        base_origem: 'g1pw2ows7124njb',
        sku: 'BLeve-person',
        custo_aquisicao: 12,
        custo_composicao: 0.19,
        custo_embalagem: 0,
        custo_etiqueta: 0,
        custo_total: 12.19,
        dimensao_comprimento_cm: 1,
        dimensao_largura_cm: 30,
        dimensao_altura_cm: 30,
        peso_g: 280,
        perda_pct: 10,
        status: 'ativo' as const,
        empresas: ['c8v8eg0errmelt6'],
        expand: {
          base_origem: {
            id: 'g1pw2ows7124njb',
            fornecedor: 'hm0ebfctv6gnpal',
          },
        },
      }

      const bPesadaPersonNome = {
        id: 'tfwi29b1526asxr',
        nome: 'BPesada-Person-Nome',
        classificacao: 'revenda' as const,
        base_origem: 'g1pw2ows7124njb',
        sku: 'BLeve-person-nome',
        custo_aquisicao: 12,
        custo_composicao: 0.18,
        custo_embalagem: 0,
        custo_etiqueta: 0,
        custo_total: 12.18,
        dimensao_comprimento_cm: 30,
        dimensao_largura_cm: 35,
        dimensao_altura_cm: 1,
        peso_g: 280,
        perda_pct: 3,
        status: 'ativo' as const,
        empresas: ['c8v8eg0errmelt6'],
        expand: {
          base_origem: {
            id: 'g1pw2ows7124njb',
            fornecedor: 'hm0ebfctv6gnpal',
          },
        },
      }

      // Estado inicial do banco: apenas o espelho yi1fmrmowpygv4g que estava com Person-Nome
      const registrosPrecProdutos: any[] = [
        {
          id: 'yi1fmrmowpygv4g',
          origem_id: 'tfwi29b1526asxr',
          nome: 'BPesada-Person-Nome',
          sku: 'BLeve-person-nome',
          base_origem: 'g1pw2ows7124njb',
          perda_pct: 3,
        },
      ]

      vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
        if (col === 'produtos') {
          return {
            getOne: vi.fn().mockImplementation((id: string) => {
              if (id === 'jaeqbj9cmmmpbiu') return Promise.resolve(bPesadaPersonalizada)
              if (id === 'tfwi29b1526asxr') return Promise.resolve(bPesadaPersonNome)
              return Promise.reject(new Error('not found'))
            }),
            getFullList: vi
              .fn()
              .mockResolvedValue([{ id: 'jaeqbj9cmmmpbiu' }, { id: 'tfwi29b1526asxr' }]),
          } as any
        }
        if (col === 'prec_produtos') {
          return {
            getFullList: vi.fn().mockResolvedValue(registrosPrecProdutos),
            getList: vi.fn().mockImplementation((_p: number, _pp: number, opts: any) => {
              const filter: string = opts?.filter || ''
              // 1. busca por origem_id
              const matchOrigem = filter.match(/origem_id = "([^"]+)"/)
              if (matchOrigem && !filter.includes('origem_id = ""')) {
                const found = registrosPrecProdutos.filter((r) => r.origem_id === matchOrigem[1])
                return Promise.resolve({ items: found })
              }
              // 2. busca por base_origem em espelho legado (origem_id = "")
              const matchBase = filter.match(/base_origem = "([^"]+)"/)
              if (matchBase && filter.includes('(origem_id = "" || origem_id = null)')) {
                const found = registrosPrecProdutos.filter(
                  (r) => r.base_origem === matchBase[1] && (!r.origem_id || r.origem_id === ''),
                )
                return Promise.resolve({ items: found })
              }
              // 3. busca por sku em espelho legado
              const matchSku = filter.match(/sku = "([^"]+)"/)
              if (matchSku && filter.includes('(origem_id = "" || origem_id = null)')) {
                const found = registrosPrecProdutos.filter(
                  (r) => r.sku === matchSku[1] && (!r.origem_id || r.origem_id === ''),
                )
                return Promise.resolve({ items: found })
              }
              return Promise.resolve({ items: [] })
            }),
            create: vi.fn().mockImplementation((payload: any) => {
              const criado = { id: 'prec_criado_personalizada', ...payload }
              registrosPrecProdutos.push(criado)
              return Promise.resolve(criado)
            }),
            update: vi.fn().mockImplementation((id: string, payload: any) => {
              const idx = registrosPrecProdutos.findIndex((r) => r.id === id)
              if (idx >= 0) {
                registrosPrecProdutos[idx] = { ...registrosPrecProdutos[idx], ...payload }
                return Promise.resolve(registrosPrecProdutos[idx])
              }
              return Promise.resolve({ id, ...payload })
            }),
            delete: vi.fn(),
          } as any
        }
        return {} as any
      })

      // Sync da BPesada-Personalizada (que antes era 'roubada' ou roubava o espelho de Person-Nome)
      const resPersonalizada = await produtosCompostosService.syncComPrecificacao('jaeqbj9cmmmpbiu')

      // Sync subsequente da BPesada-Person-Nome
      const resPersonNome = await produtosCompostosService.syncComPrecificacao('tfwi29b1526asxr')

      // Deve ter criado um espelho novo para a Personalizada, sem tocar nem sobrescrever o da Person-Nome
      expect(registrosPrecProdutos).toHaveLength(2)
      expect(resPersonalizada.id).not.toBe(resPersonNome.id)

      // Personalizada com seus dados
      expect(resPersonalizada.origem_id).toBe('jaeqbj9cmmmpbiu')
      expect(resPersonalizada.nome).toBe('BPesada-Personalizada')
      expect(resPersonalizada.sku).toBe('BLeve-person')
      expect(resPersonalizada.perda_pct).toBe(10)

      // Person-Nome com seus dados
      expect(resPersonNome.origem_id).toBe('tfwi29b1526asxr')
      expect(resPersonNome.nome).toBe('BPesada-Person-Nome')
      expect(resPersonNome.sku).toBe('BLeve-person-nome')
      expect(resPersonNome.perda_pct).toBe(3)

      // Nenhum ping-pong: sincronizar novamente a Personalizada mantém cada um no seu espelho
      const resPersonalizadaDeNovo =
        await produtosCompostosService.syncComPrecificacao('jaeqbj9cmmmpbiu')
      expect(resPersonalizadaDeNovo.id).toBe(resPersonalizada.id)
      expect(resPersonalizadaDeNovo.origem_id).toBe('jaeqbj9cmmmpbiu')

      const resPersonNomeDeNovo =
        await produtosCompostosService.syncComPrecificacao('tfwi29b1526asxr')
      expect(resPersonNomeDeNovo.id).toBe(resPersonNome.id)
      expect(resPersonNomeDeNovo.origem_id).toBe('tfwi29b1526asxr')
    })
  })
})
