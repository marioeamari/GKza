import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  normalizarTiposFornecedor,
  fornecedorCorrespondeTipo,
  filtrarItensParaSeletorPrecificacao,
  filtrarItensParaSeletorComposicao,
  FORNECEDOR_TIPO_CONFIG,
  FORNECEDOR_TIPOS_LISTA,
} from './classificacao-fornecedores'
import { estabelecimentosService } from '@/services/estabelecimentos'
import pb from '@/lib/pocketbase/client'

describe('Regras de classificação e filtragem de Fornecedores', () => {
  describe('normalizarTiposFornecedor', () => {
    it('deve fazer fallback para ["revenda"] quando tipos for nulo, indefinido ou array vazio', () => {
      expect(normalizarTiposFornecedor(null)).toEqual(['revenda'])
      expect(normalizarTiposFornecedor(undefined)).toEqual(['revenda'])
      expect(normalizarTiposFornecedor([])).toEqual(['revenda'])
    })

    it('deve filtrar valores inválidos e manter apenas tipos válidos', () => {
      expect(normalizarTiposFornecedor(['invalido', 'outro'] as any)).toEqual(['revenda'])
      expect(normalizarTiposFornecedor(['revenda', 'invalido'] as any)).toEqual(['revenda'])
      expect(normalizarTiposFornecedor(['insumos', 'servicos'])).toEqual(['insumos', 'servicos'])
    })

    it('deve preservar combinações válidas múltiplas', () => {
      expect(normalizarTiposFornecedor(['revenda', 'insumos', 'servicos'])).toEqual([
        'revenda',
        'insumos',
        'servicos',
      ])
    })
  })

  describe('fornecedorCorrespondeTipo', () => {
    it('filtro "todos" deve retornar true para qualquer fornecedor', () => {
      expect(fornecedorCorrespondeTipo({ tipos: ['revenda'] }, 'todos')).toBe(true)
      expect(fornecedorCorrespondeTipo({ tipos: ['insumos'] }, 'todos')).toBe(true)
      expect(fornecedorCorrespondeTipo({ tipos: null }, 'todos')).toBe(true)
    })

    it('deve retornar true somente se o fornecedor possuir o tipo especificado (com fallback se nulo)', () => {
      // Fornecedor sem tipos cai no fallback ['revenda']
      expect(fornecedorCorrespondeTipo({ tipos: null }, 'revenda')).toBe(true)
      expect(fornecedorCorrespondeTipo({ tipos: null }, 'insumos')).toBe(false)

      // Fornecedor de insumos e serviços
      const fornInsumoServico = { tipos: ['insumos', 'servicos'] }
      expect(fornecedorCorrespondeTipo(fornInsumoServico, 'insumos')).toBe(true)
      expect(fornecedorCorrespondeTipo(fornInsumoServico, 'servicos')).toBe(true)
      expect(fornecedorCorrespondeTipo(fornInsumoServico, 'revenda')).toBe(false)
    })
  })

  describe('FORNECEDOR_TIPO_CONFIG e FORNECEDOR_TIPOS_LISTA', () => {
    it('deve possuir configuração visual completa para cada tipo válido', () => {
      expect(FORNECEDOR_TIPOS_LISTA).toEqual(['revenda', 'insumos', 'servicos'])
      FORNECEDOR_TIPOS_LISTA.forEach((tipo) => {
        const cfg = FORNECEDOR_TIPO_CONFIG[tipo]
        expect(cfg).toBeDefined()
        expect(cfg.label).toBeTruthy()
        expect(cfg.badgeClass).toBeTruthy()
        expect(cfg.bgSoft).toBeTruthy()
        expect(cfg.border).toBeTruthy()
        expect(cfg.text).toBeTruthy()
      })
    })
  })

  describe('filtrarItensParaSeletor (isolamento entre precificação e composição)', () => {
    const itensMistos = [
      { id: '1', nome: 'Toalha de Banho', _collection: 'fornecedores_produtos', tipo: 'revenda' },
      { id: '2', nome: 'Fita de Cetim', _collection: 'insumos', tipo: 'insumo' },
      { id: '3', nome: 'Serviço Estamparia', _collection: 'insumos', tipo: 'servico' },
      { id: '4', nome: 'Item Desconhecido', _collection: 'outra_colecao', tipo: 'revenda' },
    ]

    it('filtrarItensParaSeletorPrecificacao deve listar EXCLUSIVAMENTE itens de fornecedores_produtos', () => {
      const res = filtrarItensParaSeletorPrecificacao(itensMistos)
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('1')
      expect(res[0]._collection).toBe('fornecedores_produtos')
    })

    it('filtrarItensParaSeletorComposicao deve listar EXCLUSIVAMENTE itens de insumos (sem revenda)', () => {
      const res = filtrarItensParaSeletorComposicao(itensMistos)
      expect(res).toHaveLength(2)
      expect(res.map((i) => i.id)).toEqual(['2', '3'])
      expect(res.every((i) => i._collection === 'insumos')).toBe(true)
    })
  })
})

describe('estabelecimentosService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('listEstabelecimentos chama getFullList na colecao estabelecimentos com ordenação por nome', async () => {
    const mockList = [
      { id: '1', nome: 'Muffat', ativa: true },
      { id: '2', nome: 'Parque', ativa: true },
    ]

    const getFullListMock = vi.fn().mockResolvedValue(mockList)
    vi.spyOn(pb, 'collection').mockReturnValue({
      getFullList: getFullListMock,
    } as any)

    const result = await estabelecimentosService.listEstabelecimentos()
    expect(pb.collection).toHaveBeenCalledWith('estabelecimentos')
    expect(getFullListMock).toHaveBeenCalledWith({ sort: 'nome' })
    expect(result).toEqual(mockList)
  })

  it('listEstabelecimentos com filtroAtivo inclui filtro ativa = true', async () => {
    const getFullListMock = vi.fn().mockResolvedValue([])
    vi.spyOn(pb, 'collection').mockReturnValue({
      getFullList: getFullListMock,
    } as any)

    await estabelecimentosService.listEstabelecimentos(true)
    expect(getFullListMock).toHaveBeenCalledWith({ sort: 'nome', filter: 'ativa = true' })
  })

  it('saveEstabelecimento cria quando id nao fornecido', async () => {
    const createMock = vi.fn().mockResolvedValue({ id: 'new_id', nome: 'Mercado Novo' })
    vi.spyOn(pb, 'collection').mockReturnValue({
      create: createMock,
    } as any)

    const result = await estabelecimentosService.saveEstabelecimento({ nome: 'Mercado Novo' })
    expect(createMock).toHaveBeenCalledWith({ nome: 'Mercado Novo' })
    expect(result.id).toBe('new_id')
  })

  it('saveEstabelecimento atualiza quando id fornecido', async () => {
    const updateMock = vi.fn().mockResolvedValue({ id: 'est_1', nome: 'Mercado Atualizado' })
    vi.spyOn(pb, 'collection').mockReturnValue({
      update: updateMock,
    } as any)

    const result = await estabelecimentosService.saveEstabelecimento(
      { nome: 'Mercado Atualizado' },
      'est_1',
    )
    expect(updateMock).toHaveBeenCalledWith('est_1', { nome: 'Mercado Atualizado' })
    expect(result.id).toBe('est_1')
  })

  it('deleteEstabelecimento deleta registro por id', async () => {
    const deleteMock = vi.fn().mockResolvedValue(true)
    vi.spyOn(pb, 'collection').mockReturnValue({
      delete: deleteMock,
    } as any)

    const result = await estabelecimentosService.deleteEstabelecimento('est_1')
    expect(deleteMock).toHaveBeenCalledWith('est_1')
    expect(result).toBe(true)
  })
})
