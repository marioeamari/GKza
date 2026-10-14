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
    it('lista produtos com precificação aprovada filtrados pelo canal fornecido', async () => {
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
          filter: 'canal="canal_shopee" && status="aprovada"',
        }),
      )
      expect(produtosCanal).toHaveLength(1)
      expect(produtosCanal[0].produto_id).toBe('prod_1')
      expect(produtosCanal[0].produto_nome).toBe('Toalha de Banho Döhler Azul')
      expect(produtosCanal[0].preco_aprovado).toBe(29.9)

      spyGetFullList.mockRestore()
    })
  })
})
