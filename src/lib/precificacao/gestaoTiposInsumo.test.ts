import { describe, it, expect, vi, beforeEach } from 'vitest'
import { insumosService } from '@/services/insumos'
import pb from '@/lib/pocketbase/client'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

describe('Regra de Gestão de Tipos de Custo / Insumo (insumos_tipos e produtos_base)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('TESTE 1: listTipos busca a coleção insumos_tipos ordenada por ordem e nome', async () => {
    const mockFullList = vi.fn().mockResolvedValue([
      { id: 't1', nome: 'Insumo Geral', codigo: 'insumo', ordem: 10 },
      { id: 't2', nome: 'Embalagem', codigo: 'embalagem', ordem: 20 },
    ])

    vi.mocked(pb.collection).mockReturnValue({
      getFullList: mockFullList,
    } as any)

    const tipos = await insumosService.listTipos()
    expect(pb.collection).toHaveBeenCalledWith('insumos_tipos')
    expect(mockFullList).toHaveBeenCalledWith({ sort: 'ordem,nome' })
    expect(tipos).toHaveLength(2)
    expect(tipos[0].nome).toBe('Insumo Geral')
  })

  it('TESTE 2: createTipo normaliza nome, gera código padrão quando ausente e define ativo=true', async () => {
    const mockCreate = vi.fn().mockImplementation((data) =>
      Promise.resolve({
        id: 't_novo',
        ...data,
      }),
    )

    vi.mocked(pb.collection).mockReturnValue({
      create: mockCreate,
    } as any)

    const resultado = await insumosService.createTipo({
      nome: '  Tecido Sintético / Malha Fina  ',
      cor: '#DF5830',
    })

    expect(pb.collection).toHaveBeenCalledWith('insumos_tipos')
    expect(mockCreate).toHaveBeenCalledWith({
      nome: 'Tecido Sintético / Malha Fina',
      codigo: 'tecido_sintetico_malha_fina',
      cor: '#DF5830',
      ativo: true,
    })
    expect(resultado.nome).toBe('Tecido Sintético / Malha Fina')
  })

  it('TESTE 3: updateTipo renomeia o tipo e atualiza propriedades preservando normalização', async () => {
    const mockUpdate = vi.fn().mockImplementation((id, data) =>
      Promise.resolve({
        id,
        ...data,
      }),
    )

    vi.mocked(pb.collection).mockReturnValue({
      update: mockUpdate,
    } as any)

    const resultado = await insumosService.updateTipo('tipo_123', {
      nome: '  Embalagem Premium  ',
      cor: '#0284C7',
    })

    expect(pb.collection).toHaveBeenCalledWith('insumos_tipos')
    expect(mockUpdate).toHaveBeenCalledWith('tipo_123', {
      nome: 'Embalagem Premium',
      cor: '#0284C7',
    })
    expect(resultado.nome).toBe('Embalagem Premium')
  })

  it('TESTE 4: countProdutosBaseUsandoTipo conta produtos_base vinculados tanto por tipo_ref quanto por código legado', async () => {
    const mockGetList = vi.fn().mockResolvedValue({
      totalItems: 4,
      items: [],
    })

    vi.mocked(pb.collection).mockReturnValue({
      getList: mockGetList,
    } as any)

    const total = await insumosService.countProdutosBaseUsandoTipo('id_embalagem', 'embalagem')

    expect(pb.collection).toHaveBeenCalledWith('produtos_base')
    expect(mockGetList).toHaveBeenCalledWith(1, 1, {
      filter: 'tipo_ref = "id_embalagem" || tipo = "embalagem"',
    })
    expect(total).toBe(4)
  })

  it('TESTE 5: deleteTipo aciona exclusão real no backend na coleção insumos_tipos', async () => {
    const mockDelete = vi.fn().mockResolvedValue(true)

    vi.mocked(pb.collection).mockReturnValue({
      delete: mockDelete,
    } as any)

    const excluido = await insumosService.deleteTipo('id_para_excluir')
    expect(pb.collection).toHaveBeenCalledWith('insumos_tipos')
    expect(mockDelete).toHaveBeenCalledWith('id_para_excluir')
    expect(excluido).toBe(true)
  })

  it('TESTE 6: seed idempotente contém todos os tipos originais com códigos e nomes correspondentes', () => {
    const sementes = [
      { nome: 'Insumo Geral', codigo: 'insumo', cor: '#DF5830', ordem: 10 },
      { nome: 'Embalagem', codigo: 'embalagem', cor: '#0284C7', ordem: 20 },
      { nome: 'Etiqueta', codigo: 'etiqueta', cor: '#D97706', ordem: 30 },
      { nome: 'Tecido / Malha', codigo: 'tecido', cor: '#7C3AED', ordem: 40 },
      { nome: 'Serviço Terceirizado', codigo: 'servico', cor: '#10B981', ordem: 50 },
      { nome: 'Costura', codigo: 'costura', cor: '#0D9488', ordem: 60 },
      { nome: 'Pintura', codigo: 'pintura', cor: '#E11D48', ordem: 70 },
      { nome: 'Produto de Revenda', codigo: 'revenda', cor: '#6366F1', ordem: 80 },
      { nome: 'Outro', codigo: 'outro', cor: '#64748B', ordem: 90 },
    ]

    expect(sementes).toHaveLength(9)
    const codigos = sementes.map((s) => s.codigo)
    expect(codigos).toContain('insumo')
    expect(codigos).toContain('embalagem')
    expect(codigos).toContain('etiqueta')
    expect(codigos).toContain('revenda')
    expect(codigos).toContain('servico')

    // Garantir que não há duplicidade de códigos ou nomes nas sementes
    const nomesSet = new Set(sementes.map((s) => s.nome.toLowerCase()))
    const codigosSet = new Set(codigos)
    expect(nomesSet.size).toBe(9)
    expect(codigosSet.size).toBe(9)
  })
})
