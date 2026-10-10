import { describe, it, expect } from 'vitest'
import {
  normalizarTexto,
  buildShopeeChatUrl,
  buildShopeeOrderUrl,
  encontrarProdutoCatalogo,
  inferirTemaKit,
  parseShopeeColagem,
} from './expedicaoShopeeParser'
import type { PrecProdutoRecord } from '@/types/precificacao'
import type { KitTema } from '@/types/separacaoKits'

describe('expedicaoShopeeParser', () => {
  const catalogoMock: PrecProdutoRecord[] = [
    {
      id: 'prod1',
      created: '',
      updated: '',
      sku: 'KIT-40-BLeve',
      nome: 'Kit 40 Toalha Leve de Praia',
      tipo: 'kit',
      status: 'ativo',
      qtd_por_kit: 40,
    },
    {
      id: 'prod2',
      created: '',
      updated: '',
      sku: 'ComboBLeveBBanhao',
      nome: 'Combo Toalha Leve de Praia + Toalha Banhão',
      tipo: 'combo',
      status: 'ativo',
    },
    {
      id: 'prod3',
      created: '',
      updated: '',
      sku: 'KIT-TOALHA-MONICA-30',
      nome: 'Kit Toalha de Rosto Turma da Mônica 30 un',
      tipo: 'kit',
      status: 'ativo',
      sku_por_canal: [{ canal: 'shopee', sku_externo: 'SHP-MON-30' }],
    },
    {
      id: 'prod4',
      created: '',
      updated: '',
      sku: 'BBanhao',
      nome: 'Toalha Banhão',
      tipo: 'revenda',
      status: 'ativo',
    },
  ]

  const temasMock: KitTema[] = [
    { id: 'tema-monica', nome: 'Turma da Mônica', ativo: true, ordem: 1 },
    { id: 'tema-mickey', nome: 'Mickey & Minnie', ativo: true, ordem: 2 },
    { id: 'tema-sonic', nome: 'Sonic', ativo: true, ordem: 3 },
  ]

  it('normaliza texto removendo acentos e espaços múltiplos', () => {
    expect(normalizarTexto('  Mônica & Irmãos  ')).toBe('monica & irmaos')
    expect(normalizarTexto('BANHÃO')).toBe('banhao')
  })

  it('constrói as URLs de Webchat com busca e Seller Centre', () => {
    expect(buildShopeeChatUrl('241014123456')).toBe(
      'https://seller.shopee.com.br/webchat/conversations?search=241014123456',
    )
    expect(buildShopeeChatUrl('')).toBe('https://seller.shopee.com.br/webchat/conversations')

    expect(buildShopeeOrderUrl('241014123456')).toBe(
      'https://seller.shopee.com.br/portal/sale/order/list?list_type=1&search=241014123456',
    )
  })

  it('encontra produto por SKU exato, canal ou nome aproximado', () => {
    // 1. SKU exato
    const p1 = encontrarProdutoCatalogo('KIT-40-BLeve', '', catalogoMock)
    expect(p1?.id).toBe('prod1')

    // 2. SKU no canal externo
    const p2 = encontrarProdutoCatalogo('SHP-MON-30', '', catalogoMock)
    expect(p2?.id).toBe('prod3')

    // 3. Nome aproximado
    const p3 = encontrarProdutoCatalogo('', 'Kit 40 Toalha Leve', catalogoMock)
    expect(p3?.id).toBe('prod1')

    // 4. Inexistente retorna null
    const p4 = encontrarProdutoCatalogo('INEXISTENTE-123', 'Outro produto aleatório', catalogoMock)
    expect(p4).toBeNull()
  })

  it('infere tema do kit com base no nome e palavras-chave', () => {
    expect(inferirTemaKit('Kit Toalha Cebolinha', '', temasMock)).toBe('tema-monica')
    expect(inferirTemaKit('Kit Toalha Minnie Rosa', '', temasMock)).toBe('tema-mickey')
    expect(inferirTemaKit('Kit Toalha Sonic Veloz', '', temasMock)).toBe('tema-sonic')
    // Fallback
    expect(inferirTemaKit('Produto sem tema', '', temasMock)).toBe('tema-monica')
  })

  it('parseia texto TSV/colagem com pedido especial e detecção de kits', () => {
    const textoColado = `ID do Pedido\tSKU\tNome do Produto\tVariação\tQuantidade\tCliente\tMensagem do Cliente
241014ABCD99\tKIT-40-BLeve\tKit 40 Toalha Leve de Praia\tSortido\t40\tAna Silva\tCliente pediu modelo 01 e 03 no chat
241014XYZ888\tSHP-MON-30\tKit Toalha Mônica\tPadrão\t30\tBeatriz\t
241014ZZZ111\tDESCONHECIDO\tToalha de Bebê Estampada\tAzul\t5\tCarlos\t`

    const parsed = parseShopeeColagem(textoColado, catalogoMock, temasMock)

    expect(parsed.totalLinhas).toBe(3)
    expect(parsed.reconhecidosCount).toBe(2)
    expect(parsed.genericosCount).toBe(1)
    expect(parsed.pedidosEspeciaisCount).toBe(1)

    // Primeiro item: reconhecido como kit do catálogo, com pedido especial
    const item1 = parsed.itens[0]
    expect(item1.numeroPedido).toBe('241014ABCD99')
    expect(item1.reconhecido).toBe(true)
    expect(item1.isKitOuCombo).toBe(true)
    expect(item1.temPedidoEspecial).toBe(true)
    expect(item1.pedidoEspecial).toContain('Cliente pediu modelo 01 e 03 no chat')
    expect(item1.triagemPedidoEspecial).toBe('pendente_analise')

    // Terceiro item: não reconhecido, vira genérico
    const item3 = parsed.itens[2]
    expect(item3.reconhecido).toBe(false)
    expect(item3.motivoNaoReconhecido).toBeDefined()
  })

  it('lida com colagem com ponto e vírgula e variação indicativa de chat', () => {
    const csv = `241015999;KIT-40-BLeve;Kit 40 Toalha Leve;escolha do cliente no chat modelo 2;40`
    const parsed = parseShopeeColagem(csv, catalogoMock, temasMock)

    expect(parsed.totalLinhas).toBe(1)
    const item = parsed.itens[0]
    expect(item.numeroPedido).toBe('241015999')
    expect(item.temPedidoEspecial).toBe(true)
    expect(item.pedidoEspecial).toContain('escolha do cliente no chat modelo 2')
  })
})
