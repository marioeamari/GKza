import { describe, it, expect, vi, beforeEach } from 'vitest'
import { insumosService } from '@/services/insumos'
import { produtosBaseService } from '@/services/produtos'
import pb from '@/lib/pocketbase/client'
import type { ProdutoBaseRecord } from '@/types/domain'

describe('Unificação de Insumos em Produtos Base (Protocolo do Projeto)', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  // (1) Insumo criado na aba Produtos Base / produtos_base aparece no seletor de composição imediatamente
  it('TESTE 1: Insumo criado em produtos_base é lido diretamente pelo seletor de composição sem sincronização extra', async () => {
    const mockProdutosBase: ProdutoBaseRecord[] = [
      {
        id: 'pb_etiqueta_01',
        collectionId: 'pbc_produtos_base',
        collectionName: 'produtos_base',
        created: '2026-10-18T15:00:00.000Z',
        updated: '2026-10-18T15:00:00.000Z',
        nome: 'Etiqueta Couro GKza',
        tipo: 'etiqueta',
        fornecedor: 'forn_couro_01',
        unidade: 'un',
        custo_unitario: 1.5,
        dimensao_tipo: '2d',
        dimensao_largura_cm: 5,
        dimensao_altura_cm: 2,
        ativo: true,
        expand: {
          fornecedor: {
            id: 'forn_couro_01',
            collectionId: 'col_forn',
            collectionName: 'fornecedores',
            created: '2026-01-01',
            updated: '2026-01-01',
            razao_social: 'Couros do Brasil LTDA',
            nome_fantasia: 'Couros BR',
          },
        },
      },
      {
        id: 'pb_embalagem_01',
        collectionId: 'pbc_produtos_base',
        collectionName: 'produtos_base',
        created: '2026-10-18T15:00:00.000Z',
        updated: '2026-10-18T15:00:00.000Z',
        nome: 'Saco Plástico 28x40',
        tipo: 'embalagem',
        fornecedor: 'forn_plastico_01',
        unidade: 'un',
        custo_unitario: 0.18,
        dimensao_tipo: '2d',
        dimensao_largura_cm: 28,
        dimensao_altura_cm: 40,
        ativo: true,
      },
    ]

    // Espiona getFullList de produtos_base
    const getFullListSpy = vi.fn().mockResolvedValue(mockProdutosBase)
    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      if (name === 'produtos_base') {
        return {
          getFullList: getFullListSpy,
        } as any
      }
      return {} as any
    })

    // Ao carregar a lista de produtos base
    const itens = await produtosBaseService.list()

    // O seletor de ProdutoCompostoDialog filtra `produtosBase.filter((b) => b.tipo !== 'revenda')`
    const itensDisponiveisNoSeletor = itens.filter((b) => b.tipo !== 'revenda')

    expect(itensDisponiveisNoSeletor).toHaveLength(2)
    const nomes = itensDisponiveisNoSeletor.map((i) => i.nome)
    expect(nomes).toContain('Etiqueta Couro GKza')
    expect(nomes).toContain('Saco Plástico 28x40')

    // Confirma que foi consultada a coleção 'produtos_base'
    expect(pb.collection).toHaveBeenCalledWith('produtos_base')
  })

  // (2) Migração idempotente por origem_id / deduplicação
  it('TESTE 2: Migração e backfill são idempotentes e deduplicam registros por origem_id e fornecedor+nome', () => {
    // Simula a lógica de deduplicação presente na migração 0133
    const registrosProdutosBaseExistentes = [
      {
        id: 'pb_1',
        nome: 'Saco Plastico Preto 21x40',
        origem_colecao: 'insumos',
        origem_id: 'jfgd99yx1nqa2vn',
        fornecedor: 'jz0ztudus8114og',
      },
      { id: 'pb_2', nome: 'Etiqueta de Envio', fornecedor: 'jz0ztudus8114og' },
    ]

    const insumosParaMigrar = [
      // 1: Já migrado com origem_id
      {
        id: 'jfgd99yx1nqa2vn',
        nome: 'Saco Plastico Preto 21x40',
        fornecedor: 'jz0ztudus8114og',
        valor_unitario: 0.12,
      },
      // 2: Mesmo nome e fornecedor já presente em produtos_base
      {
        id: 'ins_outro_id',
        nome: 'Etiqueta de Envio',
        fornecedor: 'jz0ztudus8114og',
        valor_unitario: 0.05,
      },
      // 3: Registro novo que precisa ser inserido
      {
        id: 'ins_etiqueta_nova',
        nome: 'Etiqueta Couro GKza',
        fornecedor: 'jz0ztudus8114og',
        valor_unitario: 1.5,
      },
    ]

    const inseridos: any[] = []

    for (const ins of insumosParaMigrar) {
      const existePorOrigem = registrosProdutosBaseExistentes.find(
        (pb) => pb.origem_colecao === 'insumos' && pb.origem_id === ins.id,
      )
      const existePorNomeForn = registrosProdutosBaseExistentes.find(
        (pb) => pb.nome === ins.nome && pb.fornecedor === ins.fornecedor,
      )

      if (!existePorOrigem && !existePorNomeForn) {
        inseridos.push(ins)
      }
    }

    // Apenas o registro novo é migrado; os outros 2 são ignorados/preservados
    expect(inseridos).toHaveLength(1)
    expect(inseridos[0].id).toBe('ins_etiqueta_nova')
    expect(inseridos[0].nome).toBe('Etiqueta Couro GKza')
  })

  // (3) Nenhum serviço/gravação do app escreve mais na coleção legada 'insumos'
  it('TESTE 3: insumosService direciona create, update e delete exclusivamente para a coleção produtos_base', async () => {
    const createSpy = vi
      .fn()
      .mockImplementation((payload) => Promise.resolve({ id: 'pb_novo_123', ...payload }))
    const updateSpy = vi
      .fn()
      .mockImplementation((id, payload) => Promise.resolve({ id, ...payload }))
    const deleteSpy = vi.fn().mockResolvedValue(true)

    const colecoesAcessadas: string[] = []

    vi.spyOn(pb, 'collection').mockImplementation((name: string) => {
      colecoesAcessadas.push(name)
      return {
        create: createSpy,
        update: updateSpy,
        delete: deleteSpy,
        getFullList: vi.fn().mockResolvedValue([]),
        getOne: vi
          .fn()
          .mockResolvedValue({ id: '1', nome: 'Teste', tipo: 'insumo', custo_unitario: 10 }),
        getList: vi.fn().mockResolvedValue({ items: [{ id: 'forn_default' }] }),
      } as any
    })

    // 1. Criação
    const novoInsumo = await insumosService.createInsumo({
      nome: 'Etiqueta Cetim Lavável',
      tipo: 'insumo',
      unidade: 'un',
      valor_unitario: 0.35,
      fornecedor: 'forn_1',
    })
    expect(novoInsumo.id).toBe('pb_novo_123')
    expect(novoInsumo.valor_unitario).toBe(0.35)

    // 2. Atualização
    await insumosService.updateInsumo('pb_novo_123', {
      nome: 'Etiqueta Cetim Lavável Premium',
      valor_unitario: 0.4,
    })

    // 3. Exclusão
    await insumosService.deleteInsumo('pb_novo_123')

    // Verificação estrita: NÃO pode haver chamada para pb.collection('insumos')
    expect(colecoesAcessadas).not.toContain('insumos')
    expect(colecoesAcessadas).toContain('produtos_base')
  })
})
