import { describe, it, expect, vi } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { orcamentosService } from './orcamentos'
import { clientesOrcamentoService } from './clientesOrcamento'
import { ClienteOrcamentoRecord } from '@/types/orcamento'

describe('Ajustes no Módulo de Orçamentos - Regras e Integração de Serviços', () => {
  describe('(A) Link Público deslogado e nomes de canais via totais salvos', () => {
    it('getOrcamentoPublico busca orçamento filtrando token e normaliza canais salvos em totais_por_canal se expand vier vazio', async () => {
      const mockOrcamento = {
        id: 'orc_pub_123',
        codigo: 'ORC-2025-001',
        titulo: 'Orçamento Teste Toalhas',
        cliente_nome: 'Consumidor Final',
        link_publico_ativo: true,
        public_token: 'token_valido_xyz',
        canais_comparados: ['c_shopee', 'c_site'],
        totais_por_canal: {
          c_shopee: {
            canal_id: 'c_shopee',
            canal_nome: 'Shopee Brasil',
            total_itens: 500,
            total_fretes: 25,
            total_geral: 525,
          },
          c_site: {
            canal_id: 'c_site',
            canal_nome: 'Site Próprio GKza',
            total_itens: 450,
            total_fretes: 30,
            total_geral: 480,
          },
        },
        expand: {
          // prec_canais não expandido para anônimos
          canais_comparados: [],
          itens: [
            {
              id: 'it_1',
              modelo_nome: 'Toalha de Banho',
              quantidade: 20,
              precos_canais: {
                c_shopee: { canal_id: 'c_shopee', canal_nome: 'Shopee Brasil', preco_unitario: 25 },
                c_site: {
                  canal_id: 'c_site',
                  canal_nome: 'Site Próprio GKza',
                  preco_unitario: 22.5,
                },
              },
              fretes_canais: {
                c_shopee: { canal_id: 'c_shopee', canal_nome: 'Shopee Brasil', valor_frete: 25 },
                c_site: { canal_id: 'c_site', canal_nome: 'Site Próprio GKza', valor_frete: 30 },
              },
            },
          ],
        },
      }

      // Mock de pb.collection('orcamentos').getList
      const spyGetList = vi.spyOn(pb.collection('orcamentos'), 'getList').mockResolvedValueOnce({
        items: [mockOrcamento],
        page: 1,
        perPage: 1,
        totalItems: 1,
        totalPages: 1,
      } as any)

      const resultado = await orcamentosService.getOrcamentoPublico('token_valido_xyz')

      expect(spyGetList).toHaveBeenCalledWith(
        1,
        1,
        expect.objectContaining({
          filter: 'public_token = "token_valido_xyz" && link_publico_ativo = true',
          token: 'token_valido_xyz',
        }),
      )

      expect(resultado).not.toBeNull()
      expect(resultado?.titulo).toBe('Orçamento Teste Toalhas')
      // Verifica se resgatou os canais e seus nomes a partir de totais_por_canal
      expect(resultado?.expand?.canais_comparados).toHaveLength(2)
      expect(resultado?.expand?.canais_comparados?.[0].nome).toBe('Shopee Brasil')
      expect(resultado?.expand?.canais_comparados?.[1].nome).toBe('Site Próprio GKza')

      spyGetList.mockRestore()
    })

    it('retorna null se token for inválido, link estiver desativado ou orçamento não for encontrado', async () => {
      const spyGetList = vi.spyOn(pb.collection('orcamentos'), 'getList').mockResolvedValueOnce({
        items: [],
        page: 1,
        perPage: 1,
        totalItems: 0,
        totalPages: 0,
      } as any)

      const resultado = await orcamentosService.getOrcamentoPublico('token_inexistente')
      expect(resultado).toBeNull()

      spyGetList.mockRestore()
    })
  })

  describe('(B) Clientes próprios de orçamentos (PF e PJ)', () => {
    it('cria cliente PF com CPF formatado', async () => {
      const mockCriado: ClienteOrcamentoRecord = {
        id: 'cl_pf_1',
        nome: 'Maria Silva',
        tipo: 'pessoa_fisica',
        documento: '123.456.789-00',
        whatsapp: '(11) 98765-4321',
      }

      const spyCreate = vi
        .spyOn(pb.collection('clientes'), 'create')
        .mockResolvedValueOnce(mockCriado as any)

      const salvo = await clientesOrcamentoService.createCliente({
        nome: 'Maria Silva',
        tipo: 'pessoa_fisica',
        documento: '123.456.789-00',
        whatsapp: '(11) 98765-4321',
      })

      expect(spyCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Maria Silva',
          tipo: 'pessoa_fisica',
          documento: '123.456.789-00',
        }),
      )
      expect(salvo.id).toBe('cl_pf_1')
      expect(salvo.tipo).toBe('pessoa_fisica')

      spyCreate.mockRestore()
    })

    it('cria cliente PJ com Razão Social e CNPJ', async () => {
      const mockCriadoPJ: ClienteOrcamentoRecord = {
        id: 'cl_pj_1',
        nome: 'Hotel GKza LTDA',
        tipo: 'pessoa_juridica',
        documento: '12.345.678/0001-90',
        whatsapp: '(11) 99999-8888',
        email: 'compras@hotelgkza.com',
      }

      const spyCreate = vi
        .spyOn(pb.collection('clientes'), 'create')
        .mockResolvedValueOnce(mockCriadoPJ as any)

      const salvo = await clientesOrcamentoService.createCliente({
        nome: 'Hotel GKza LTDA',
        tipo: 'pessoa_juridica',
        documento: '12.345.678/0001-90',
        whatsapp: '(11) 99999-8888',
        email: 'compras@hotelgkza.com',
      })

      expect(spyCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          nome: 'Hotel GKza LTDA',
          tipo: 'pessoa_juridica',
          documento: '12.345.678/0001-90',
        }),
      )
      expect(salvo.id).toBe('cl_pj_1')
      expect(salvo.tipo).toBe('pessoa_juridica')

      spyCreate.mockRestore()
    })
  })

  describe('(C) Produto Vinculado com precificação aprovada por canal', () => {
    it('retorna filtro correto buscando status aprovada OU desatualizada com preco_aprovado > 0', async () => {
      const mockPrecificacoes = [
        {
          id: 'prec_aprov_1',
          canal: 'canal_shopee',
          preco_aprovado: 29.9,
          status: 'aprovada',
          expand: {
            produto: {
              id: 'prod_1',
              nome: 'Toalha de Banho Döhler Azul',
              sku: 'BANHO-AZUL-DOHLER',
            },
          },
        },
      ]

      const spyGetFullList = vi
        .spyOn(pb.collection('prec_precificacoes'), 'getFullList')
        .mockResolvedValueOnce(mockPrecificacoes as any)

      const produtosCanal = await orcamentosService.listarProdutosAprovadosPorCanal('canal_shopee')

      expect(spyGetFullList).toHaveBeenCalledWith(
        expect.objectContaining({
          filter:
            'canal="canal_shopee" && preco_aprovado > 0 && (status="aprovada" || status="desatualizada")',
          sort: '-aprovado_em,-updated,-created',
        }),
      )
      expect(produtosCanal).toHaveLength(1)
      expect(produtosCanal[0].produto_id).toBe('prod_1')
      expect(produtosCanal[0].produto_nome).toBe('Toalha de Banho Döhler Azul')
      expect(produtosCanal[0].preco_aprovado).toBe(29.9)
      expect(produtosCanal[0].desatualizada).toBe(false)
      expect(produtosCanal[0].status_precificacao).toBe('aprovada')

      spyGetFullList.mockRestore()
    })

    it('(1) produto apenas com cenário "desatualizada" aparece no seletor, com flag desatualizada', async () => {
      const mockPrecificacoes = [
        {
          id: 'prec_desat_1',
          canal: 'canal_site',
          preco_aprovado: 49.9,
          status: 'desatualizada',
          aprovado_em: '2026-10-01T10:00:00Z',
          expand: {
            produto: {
              id: 'prod_desat',
              nome: 'Kit Fraldas Ursinho',
              sku: 'KIT-FRALDAS-URS',
            },
          },
        },
      ]

      const spyGetFullList = vi
        .spyOn(pb.collection('prec_precificacoes'), 'getFullList')
        .mockResolvedValueOnce(mockPrecificacoes as any)

      const produtosCanal = await orcamentosService.listarProdutosAprovadosPorCanal('canal_site')

      expect(produtosCanal).toHaveLength(1)
      expect(produtosCanal[0].produto_id).toBe('prod_desat')
      expect(produtosCanal[0].preco_aprovado).toBe(49.9)
      expect(produtosCanal[0].desatualizada).toBe(true)
      expect(produtosCanal[0].status_precificacao).toBe('desatualizada')

      spyGetFullList.mockRestore()
    })

    it('(2) produto com cenário "aprovada" aparece sem aviso e tem prioridade quando tem os dois status', async () => {
      const mockPrecificacoes = [
        {
          id: 'prec_desat',
          canal: 'canal_shopee',
          preco_aprovado: 35.0,
          status: 'desatualizada',
          aprovado_em: '2026-10-14T10:00:00Z',
          updated: '2026-10-15T10:00:00Z',
          expand: {
            produto: {
              id: 'prod_misto',
              nome: 'Manta Microfibra',
              sku: 'MANTA-MIC-01',
            },
          },
        },
        {
          id: 'prec_aprov',
          canal: 'canal_shopee',
          preco_aprovado: 39.9,
          status: 'aprovada',
          aprovado_em: '2026-10-10T10:00:00Z',
          updated: '2026-10-10T10:00:00Z',
          expand: {
            produto: {
              id: 'prod_misto',
              nome: 'Manta Microfibra',
              sku: 'MANTA-MIC-01',
            },
          },
        },
      ]

      const spyGetFullList = vi
        .spyOn(pb.collection('prec_precificacoes'), 'getFullList')
        .mockResolvedValueOnce(mockPrecificacoes as any)

      const produtosCanal = await orcamentosService.listarProdutosAprovadosPorCanal('canal_shopee')

      expect(produtosCanal).toHaveLength(1)
      expect(produtosCanal[0].produto_id).toBe('prod_misto')
      expect(produtosCanal[0].precificacao_id).toBe('prec_aprov')
      expect(produtosCanal[0].preco_aprovado).toBe(39.9)
      expect(produtosCanal[0].desatualizada).toBe(false)
      expect(produtosCanal[0].status_precificacao).toBe('aprovada')

      spyGetFullList.mockRestore()
    })

    it('(3) canal sem nenhum cenário com preco_aprovado > 0 continua sem retornar produtos', async () => {
      const spyGetFullList = vi
        .spyOn(pb.collection('prec_precificacoes'), 'getFullList')
        .mockResolvedValueOnce([] as any)

      const produtosCanal = await orcamentosService.listarProdutosAprovadosPorCanal('canal_vazio')

      expect(produtosCanal).toEqual([])

      spyGetFullList.mockRestore()
    })

    it('(4) o preço usado é o do cenário mais recente conforme ordenação quando há múltiplos no mesmo status', async () => {
      const mockPrecificacoes = [
        {
          id: 'prec_antiga',
          canal: 'canal_site',
          preco_aprovado: 25.0,
          status: 'desatualizada',
          aprovado_em: '2026-09-01T10:00:00Z',
          updated: '2026-09-01T10:00:00Z',
          created: '2026-09-01T10:00:00Z',
          expand: {
            produto: {
              id: 'prod_multi',
              nome: 'Babador Impermeável',
              sku: 'BAB-IMP',
            },
          },
        },
        {
          id: 'prec_recente',
          canal: 'canal_site',
          preco_aprovado: 29.9,
          status: 'desatualizada',
          aprovado_em: '2026-10-12T10:00:00Z',
          updated: '2026-10-14T10:00:00Z',
          created: '2026-10-12T10:00:00Z',
          expand: {
            produto: {
              id: 'prod_multi',
              nome: 'Babador Impermeável',
              sku: 'BAB-IMP',
            },
          },
        },
      ]

      const spyGetFullList = vi
        .spyOn(pb.collection('prec_precificacoes'), 'getFullList')
        .mockResolvedValueOnce(mockPrecificacoes as any)

      const produtosCanal = await orcamentosService.listarProdutosAprovadosPorCanal('canal_site')

      expect(produtosCanal).toHaveLength(1)
      expect(produtosCanal[0].produto_id).toBe('prod_multi')
      expect(produtosCanal[0].precificacao_id).toBe('prec_recente')
      expect(produtosCanal[0].preco_aprovado).toBe(29.9)

      spyGetFullList.mockRestore()
    })

    it('retorna cada modalidade do canal como uma opção única e selecionável (chave precificacao_id)', async () => {
      // Simula o caso real do banco: Produto BLeve (lsilkiq8w2apfre) no canal Shopee com modalidades Half, MEI e S/N
      const mockPrecificacoes = [
        {
          id: 'prec_bleve_half',
          produto: 'lsilkiq8w2apfre',
          canal: 'nnnk28chx9llzmm',
          modalidade: 'mod_half',
          status: 'aprovada',
          preco_aprovado: 24.9,
          updated: '2026-04-01T10:00:00.000Z',
          expand: {
            produto: { id: 'lsilkiq8w2apfre', nome: 'BLeve', sku: 'BLEVE-01' },
            modalidade: { id: 'mod_half', nome: 'Half' },
          },
        },
        {
          id: 'prec_bleve_mei',
          produto: 'lsilkiq8w2apfre',
          canal: 'nnnk28chx9llzmm',
          modalidade: 'mod_mei',
          status: 'aprovada',
          preco_aprovado: 24.9,
          updated: '2026-04-01T11:00:00.000Z',
          expand: {
            produto: { id: 'lsilkiq8w2apfre', nome: 'BLeve', sku: 'BLEVE-01' },
            modalidade: { id: 'mod_mei', nome: 'MEI' },
          },
        },
        {
          id: 'prec_bleve_sn',
          produto: 'lsilkiq8w2apfre',
          canal: 'nnnk28chx9llzmm',
          modalidade: 'mod_sn',
          status: 'desatualizada',
          preco_aprovado: 19.9,
          updated: '2026-03-15T10:00:00.000Z',
          expand: {
            produto: { id: 'lsilkiq8w2apfre', nome: 'BLeve', sku: 'BLEVE-01' },
            modalidade: { id: 'mod_sn', nome: 'S/N' },
          },
        },
      ]

      const spyGetFullList = vi
        .spyOn(pb.collection('prec_precificacoes'), 'getFullList')
        .mockResolvedValueOnce(mockPrecificacoes as any)

      const produtos = await orcamentosService.listarProdutosAprovadosPorCanal('nnnk28chx9llzmm')

      // Devem existir 3 opções distintas para o produto BLeve, uma para cada modalidade
      expect(produtos).toHaveLength(3)

      const meiOpt = produtos.find((p) => p.modalidade_nome === 'MEI')
      expect(meiOpt).toBeDefined()
      expect(meiOpt?.precificacao_id).toBe('prec_bleve_mei')
      expect(meiOpt?.preco_aprovado).toBe(24.9)
      expect(meiOpt?.desatualizada).toBe(false)

      const halfOpt = produtos.find((p) => p.modalidade_nome === 'Half')
      expect(halfOpt).toBeDefined()
      expect(halfOpt?.precificacao_id).toBe('prec_bleve_half')
      expect(halfOpt?.preco_aprovado).toBe(24.9)

      const snOpt = produtos.find((p) => p.modalidade_nome === 'S/N')
      expect(snOpt).toBeDefined()
      expect(snOpt?.precificacao_id).toBe('prec_bleve_sn')
      expect(snOpt?.preco_aprovado).toBe(19.9)
      expect(snOpt?.desatualizada).toBe(true)

      // Teste de desempate: se houver duas 'Half', mantém a mais prioritária/recente
      spyGetFullList.mockRestore()
    })
  })

  describe('(D) Itens do Orçamento com Composição Interna (Expedição)', () => {
    it('cria orçamento salvando composicao serializada em JSON para os itens', async () => {
      const spyCreateOrc = vi
        .spyOn(pb.collection('orcamentos'), 'create')
        .mockResolvedValueOnce({ id: 'orc_novo_1', codigo: 'ORC-2026-001' } as any)

      let formDataSalvo: FormData | null = null
      const spyCreateItem = vi
        .spyOn(pb.collection('orcamento_itens'), 'create')
        .mockImplementationOnce(async (data: any) => {
          formDataSalvo = data
          return { id: 'it_criado_1' } as any
        })

      await orcamentosService.createOrcamento({
        cliente_nome: 'Cliente Kit 30',
        data_orcamento: '2026-10-15',
        itens: [
          {
            modelo_nome: 'Kit 30 Toalhas',
            quantidade: 30,
            precos_canais: {
              c1: { canal_id: 'c1', canal_nome: 'Site', preco_unitario: 10, preco_cheio: 300 },
            },
            fretes_canais: {},
            composicao: [
              {
                id: 'comp_1',
                tipo: 'cadastrado',
                tema_nome: 'Mickey',
                modelo_nome: 'Banho',
                quantidade: 15,
              },
              {
                id: 'comp_2',
                tipo: 'cadastrado',
                tema_nome: 'Minnie',
                modelo_nome: 'Rosto',
                quantidade: 15,
              },
            ],
          },
        ],
      })

      expect(spyCreateOrc).toHaveBeenCalled()
      expect(spyCreateItem).toHaveBeenCalled()
      expect(formDataSalvo).not.toBeNull()

      const composicaoStr = (formDataSalvo as any).get('composicao')
      expect(composicaoStr).toBeTruthy()
      const parsed = JSON.parse(composicaoStr)
      expect(parsed).toHaveLength(2)
      expect(parsed[0].tema_nome).toBe('Mickey')
      expect(parsed[1].tema_nome).toBe('Minnie')

      spyCreateOrc.mockRestore()
      spyCreateItem.mockRestore()
    })
  })
})
