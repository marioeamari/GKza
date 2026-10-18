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
})
