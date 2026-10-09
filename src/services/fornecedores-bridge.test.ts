import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fornecedoresService } from '@/services/fornecedores'
import pb from '@/lib/pocketbase/client'

describe('Ponte Fornecedores -> Precificação (prec_produtos)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('não deve espelhar se fornecedor não for encontrado em fornecedores (ex: estabelecimento)', async () => {
    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'fornecedores_produtos') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'fp_1',
            fornecedor: 'est_invalido',
            descricao: 'Carne Moída',
          }),
        } as any
      }
      if (col === 'fornecedores') {
        return {
          getOne: vi.fn().mockRejectedValue(new Error('not found')),
        } as any
      }
      return {} as any
    })

    const result = await fornecedoresService.syncProdutoComPrecificacao('fp_1')
    expect(result).toBeNull()
  })

  it('deve criar novo espelho em prec_produtos quando não existir espelho prévio', async () => {
    const mockFp = {
      id: 'fp_eduardo_1',
      fornecedor: 'forn_eduardo',
      descricao: 'Toalha Luxo Banho',
      sku_fornecedor: 'TB-LUXO',
      preco_custo_unitario: 15.5,
      preco_ultima_compra: 14.0,
      marca: 'Eduardo',
      categoria: 'Banho',
      unidade: 'un',
      peso_g: 350,
      comprimento_cm: 30,
      largura_cm: 20,
      altura_cm: 5,
      ativo: true,
      imagem: 'foto_toalha.png',
    }

    const mockCreatedPrec = {
      id: 'prec_novo_1',
      sku: 'TB-LUXO',
      nome: 'Toalha Luxo Banho',
      tipo: 'revenda',
      custo_aquisicao_unitario: 15.5,
      fornecedor: 'forn_eduardo',
      fornecedor_produto: 'fp_eduardo_1',
    }

    const createMock = vi.fn().mockResolvedValue(mockCreatedPrec)

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'fornecedores_produtos') {
        return {
          getOne: vi.fn().mockResolvedValue(mockFp),
        } as any
      }
      if (col === 'fornecedores') {
        return {
          getOne: vi.fn().mockResolvedValue({ id: 'forn_eduardo', nome_fantasia: 'Eduardo' }),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }), // sem espelho prévio e sem colisão de sku
          create: createMock,
          update: vi.fn(),
        } as any
      }
      if (col === 'empresas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [{ id: 'empresa_1' }] }),
        } as any
      }
      return {} as any
    })

    const result = await fornecedoresService.syncProdutoComPrecificacao('fp_eduardo_1')
    expect(createMock).toHaveBeenCalled()
    const payloadPassado = createMock.mock.calls[0][0]
    expect(payloadPassado.sku).toBe('TB-LUXO')
    expect(payloadPassado.nome).toBe('Toalha Luxo Banho')
    expect(payloadPassado.tipo).toBe('revenda')
    expect(payloadPassado.custo_aquisicao_unitario).toBe(15.5)
    expect(payloadPassado.fornecedor_produto).toBe('fp_eduardo_1')
    expect(result).toEqual(mockCreatedPrec)
  })

  it('deve atualizar espelho existente de prec_produtos preservando dados e atualizando custo', async () => {
    const mockFp = {
      id: 'fp_eduardo_2',
      fornecedor: 'forn_eduardo',
      descricao: 'Toalha Banho Atualizada',
      sku_fornecedor: 'TB-ATUAL',
      preco_custo_unitario: 18.0,
      ativo: true,
    }

    const mockExistentePrec = {
      id: 'prec_existente_2',
      sku: 'TB-ATUAL',
      fornecedor_produto: 'fp_eduardo_2',
    }

    const updateMock = vi.fn().mockResolvedValue({
      ...mockExistentePrec,
      nome: 'Toalha Banho Atualizada',
      custo_aquisicao_unitario: 18.0,
    })

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'fornecedores_produtos') {
        return {
          getOne: vi.fn().mockResolvedValue(mockFp),
        } as any
      }
      if (col === 'fornecedores') {
        return {
          getOne: vi.fn().mockResolvedValue({ id: 'forn_eduardo', nome_fantasia: 'Eduardo' }),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [mockExistentePrec] }),
          update: updateMock,
          create: vi.fn(),
        } as any
      }
      return {} as any
    })

    const result = await fornecedoresService.syncProdutoComPrecificacao('fp_eduardo_2')
    expect(updateMock).toHaveBeenCalledWith(
      'prec_existente_2',
      expect.objectContaining({
        nome: 'Toalha Banho Atualizada',
        custo_aquisicao_unitario: 18.0,
        tipo: 'revenda',
      }),
    )
    expect(result?.id).toBe('prec_existente_2')
  })

  it('deve gerar SKU com prefixo REV- quando sku_fornecedor estiver em branco', async () => {
    const mockFp = {
      id: 'fp_sem_sku_123',
      fornecedor: 'forn_eduardo',
      descricao: 'Pano Sem Sku',
      sku_fornecedor: '  ',
      preco_custo_unitario: 5.0,
      ativo: true,
    }

    const createMock = vi.fn().mockResolvedValue({
      id: 'prec_sem_sku',
      sku: 'REV-FP_SEM_SKU_123',
    })

    vi.spyOn(pb, 'collection').mockImplementation((col: string) => {
      if (col === 'fornecedores_produtos') {
        return {
          getOne: vi.fn().mockResolvedValue(mockFp),
        } as any
      }
      if (col === 'fornecedores') {
        return {
          getOne: vi.fn().mockResolvedValue({ id: 'forn_eduardo', nome_fantasia: 'Eduardo' }),
        } as any
      }
      if (col === 'prec_produtos') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }),
          create: createMock,
        } as any
      }
      if (col === 'empresas') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [] }),
        } as any
      }
      return {} as any
    })

    await fornecedoresService.syncProdutoComPrecificacao('fp_sem_sku_123')
    expect(createMock).toHaveBeenCalled()
    const payload = createMock.mock.calls[0][0]
    expect(payload.sku).toBe('REV-FP_SEM_SKU_123')
  })
})
