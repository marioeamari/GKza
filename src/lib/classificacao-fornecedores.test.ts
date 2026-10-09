import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  classificarFornecedoresEEstabelecimentos,
  type FornecedorRaw,
} from './classificacao-fornecedores'
import { estabelecimentosService } from '@/services/estabelecimentos'
import pb from '@/lib/pocketbase/client'

describe('Regra de classificação: Fornecedores vs Estabelecimentos', () => {
  const mockFornecedores: FornecedorRaw[] = [
    { id: 'hm0ebfctv6gnpal', nome_fantasia: 'Eduardo Toalhas', razao_social: 'Eduardo Toalhas ME' },
    {
      id: '6osobnalrpcv6b1',
      nome_fantasia: 'Armazém Alecrim',
      razao_social: 'Armazém Alecrim Ltda',
    },
    { id: '9bdkezq7du2rv1m', nome_fantasia: 'Multi Carnes', razao_social: 'Multi Carnes' },
    { id: 'jnwehxso7jszcdn', nome_fantasia: 'Maytá', razao_social: 'Maytá Alimentos' },
    {
      id: 'qst2tsitj391kx3',
      nome_fantasia: 'Sabor da casa',
      razao_social: 'Sabor da Casa Restaurante',
    },
    { id: '7q2obp75wkj4ipg', nome_fantasia: 'Muffat', razao_social: 'Muffato Supermercados' },
    { id: 'urmu8koky7n8k8u', nome_fantasia: 'Parque', razao_social: 'Parque Hortifruti' },
  ]

  it('deve manter fornecedor com produtos de revenda em fornecedores (ex: Eduardo Toalhas)', () => {
    const fornecedorIdsComProdutos = new Set(['hm0ebfctv6gnpal'])
    const nomesCitadosEmDespesas = new Set(['muffat', 'parque'])

    const result = classificarFornecedoresEEstabelecimentos({
      fornecedores: mockFornecedores,
      fornecedorIdsComProdutos,
      nomesCitadosEmDespesas,
    })

    // hm0ebfctv6gnpal deve ficar em fornecedores
    expect(result.permanecemEmFornecedores.some((f) => f.id === 'hm0ebfctv6gnpal')).toBe(true)
    expect(result.removidosDeFornecedores.includes('hm0ebfctv6gnpal')).toBe(false)
  })

  it('deve migrar os 6 fornecedores sem produtos de revenda para estabelecimentos e removê-los de fornecedores', () => {
    const fornecedorIdsComProdutos = new Set(['hm0ebfctv6gnpal'])
    const nomesCitadosEmDespesas = new Set(['muffat', 'parque', 'sabor da casa'])

    const result = classificarFornecedoresEEstabelecimentos({
      fornecedores: mockFornecedores,
      fornecedorIdsComProdutos,
      nomesCitadosEmDespesas,
    })

    const migradosIds = result.migramParaEstabelecimentos.map((e) => e.id)
    expect(migradosIds).toContain('6osobnalrpcv6b1') // Armazém Alecrim
    expect(migradosIds).toContain('9bdkezq7du2rv1m') // Multi Carnes
    expect(migradosIds).toContain('jnwehxso7jszcdn') // Maytá
    expect(migradosIds).toContain('qst2tsitj391kx3') // Sabor da casa
    expect(migradosIds).toContain('7q2obp75wkj4ipg') // Muffat
    expect(migradosIds).toContain('urmu8koky7n8k8u') // Parque

    // Todos os 6 devem estar na lista de remoção de fornecedores
    expect(result.removidosDeFornecedores).toEqual(
      expect.arrayContaining([
        '6osobnalrpcv6b1',
        '9bdkezq7du2rv1m',
        'jnwehxso7jszcdn',
        'qst2tsitj391kx3',
        '7q2obp75wkj4ipg',
        'urmu8koky7n8k8u',
      ]),
    )
    expect(result.removidosDeFornecedores.includes('hm0ebfctv6gnpal')).toBe(false)
  })

  it('deve duplicar quando um fornecedor tem produtos de revenda E consta em despesas de consumo', () => {
    const fornecedorIdsComProdutos = new Set(['hm0ebfctv6gnpal'])
    // Eduardo Toalhas citado em despesas de consumo
    const nomesCitadosEmDespesas = new Set(['eduardo toalhas'])

    const result = classificarFornecedoresEEstabelecimentos({
      fornecedores: mockFornecedores,
      fornecedorIdsComProdutos,
      nomesCitadosEmDespesas,
    })

    // Deve estar duplicado em ambos
    expect(result.duplicadosEmAmbos.some((d) => d.id === 'hm0ebfctv6gnpal')).toBe(true)
    expect(result.permanecemEmFornecedores.some((f) => f.id === 'hm0ebfctv6gnpal')).toBe(true)
    expect(result.migramParaEstabelecimentos.some((e) => e.id === 'hm0ebfctv6gnpal')).toBe(true)
    // NÃO deve ser removido de fornecedores
    expect(result.removidosDeFornecedores.includes('hm0ebfctv6gnpal')).toBe(false)
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
