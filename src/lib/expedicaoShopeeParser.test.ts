import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  normalizarTexto,
  buildShopeeChatUrl,
  buildShopeeOrderUrl,
  encontrarProdutoCatalogo,
  inferirTemaKit,
  deduzirQuantidadeKit,
  detectarColuna,
  inferirMapeamentoColunas,
  processarLinhaMapeada,
  parseShopeeColagem,
  parseShopeePlanilha,
  SINONIMOS_COLUNAS_SHOPEE,
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

  it('normaliza texto removendo acentos, pontuação e espaços múltiplos', () => {
    expect(normalizarTexto('  Mônica & Irmãos (Oficial)  ')).toBe('monica irmaos oficial')
    expect(normalizarTexto('Nº do Pedido / ID:')).toBe('no do pedido id')
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

  describe('Dedução inteligente de quantidade do kit', () => {
    it('deduz pelo catálogo prec_produtos quando possui qtd_por_kit', () => {
      const prod = catalogoMock[0] // qtd_por_kit = 40
      const ded = deduzirQuantidadeKit('qualquer-sku', 'Nome Qualquer', prod)
      expect(ded.quantidade).toBe(40)
      expect(ded.origem).toBe('catalogo')
    })

    it('deduz casos reais do usuário pelo SKU com sufixo', () => {
      // Caso real do usuário: RMickeyMinnie-20
      const d1 = deduzirQuantidadeKit('RMickeyMinnie-20', 'Toalhas Variadas')
      expect(d1.quantidade).toBe(20)
      expect(d1.origem).toBe('sku')

      const d2 = deduzirQuantidadeKit('KIT-MONICA-30', 'Toalha Mônica')
      expect(d2.quantidade).toBe(30)
      expect(d2.origem).toBe('sku')

      const d3 = deduzirQuantidadeKit('SKU_40', 'Produto X')
      expect(d3.quantidade).toBe(40)
      expect(d3.origem).toBe('sku')
    })

    it('deduz casos reais pelo nome do produto e variação', () => {
      // Caso real do usuário: "20 Toalhas de Rosto e Mão Mickey Mouse Minnie Mouse"
      const d1 = deduzirQuantidadeKit(
        'GENERICO',
        '20 Toalhas de Rosto e Mão Personalizada Mickey Mouse Minnie Mouse Surtidas Infantil Menino Menina',
      )
      expect(d1.quantidade).toBe(20)
      expect(d1.origem).toBe('produto_nome')

      // Casos do usuário: "31 Rosto", "40 Rosto"
      const d2 = deduzirQuantidadeKit('', '31 Rosto Toalhas Personalizadas')
      expect(d2.quantidade).toBe(31)
      expect(d2.origem).toBe('produto_nome')

      const d3 = deduzirQuantidadeKit('', '40 Rosto')
      expect(d3.quantidade).toBe(40)
      expect(d3.origem).toBe('produto_nome')

      // Outros padrões comuns de kit
      const d4 = deduzirQuantidadeKit('', 'Kit com 50 unidades de toalhas')
      expect(d4.quantidade).toBe(50)
      expect(d4.origem).toBe('produto_nome')

      const d5 = deduzirQuantidadeKit('', 'Pacote 15 peças Infantil')
      expect(d5.quantidade).toBe(15)
      expect(d5.origem).toBe('produto_nome')
    })

    it('multiplica quantidade de kits comprados pela quantidade de peças deduzida', () => {
      // 2 kits de RMickeyMinnie-20 = 40 unidades
      const linha = processarLinhaMapeada(
        {
          ID: 'PED-MULT-01',
          SKU: 'RMickeyMinnie-20',
          Produto: 'Toalhas Mickey',
          Qtd: '2',
        },
        {
          numeroPedido: 'ID',
          sku: 'SKU',
          produtoNome: 'Produto',
          quantidade: 'Qtd',
        },
        catalogoMock,
        temasMock,
        0,
      )

      expect(linha?.quantidadePlanilhaOriginal).toBe(2)
      expect(linha?.quantidadeDeduzidaPorKit).toBe(20)
      expect(linha?.quantidade).toBe(40)
      expect(linha?.origemDeducaoQuantidade).toBe('sku')
    })
  })

  describe('Detecção dinâmica de cabeçalhos e sinônimos da Shopee BR', () => {
    it('detecta coluna com acentos, pontuação e variações de caixa', () => {
      const cabecalhos = [
        'Nº do Pedido',
        'Número de Referência do SKU',
        'Nome do Produto',
        'Nome da Variação',
        'Quantidade',
        'Nome de usuário do comprador',
        'Observação do Comprador',
        'Código de Rastreamento',
      ]

      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.numeroPedido)).toBe('Nº do Pedido')
      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.sku)).toBe(
        'Número de Referência do SKU',
      )
      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.produtoNome)).toBe(
        'Nome do Produto',
      )
      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.variacao)).toBe('Nome da Variação')
      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.quantidade)).toBe('Quantidade')
      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.clienteNome)).toBe(
        'Nome de usuário do comprador',
      )
      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.pedidoEspecial)).toBe(
        'Observação do Comprador',
      )
      expect(detectarColuna(cabecalhos, SINONIMOS_COLUNAS_SHOPEE.codigoRastreio)).toBe(
        'Código de Rastreamento',
      )
    })

    it('infere mapeamento com alta confiança quando cabeçalhos padrão estão presentes', () => {
      const cabecalhos = [
        'ID do pedido',
        'SKU',
        'Nome do produto',
        'Variação',
        'Quantidade',
        'Comprador',
      ]
      const info = inferirMapeamentoColunas(cabecalhos)
      expect(info.confianca.numeroPedido).toBe(true)
      expect(info.confianca.sku).toBe(true)
      expect(info.confianca.produtoNome).toBe(true)
      expect(info.confianca.quantidade).toBe(true)
      expect(info.mapeamento.numeroPedido).toBe('ID do pedido')
      expect(info.mapeamento.sku).toBe('SKU')
    })
  })

  describe('parseShopeePlanilha (.xlsx real / simulado)', () => {
    it('lê arquivo .xlsx exportado da Shopee ("Pedidos a Enviar") com colunas reais em português', () => {
      // Simula uma planilha real gerada com XLSX
      const dadosPlanilha = [
        [
          'ID do pedido',
          'Status do pedido',
          'Número de referência do SKU',
          'Nome do produto',
          'Nome da variação',
          'Quantidade',
          'Nome de usuário do comprador',
          'Observação do comprador',
          'Código de Rastreio',
        ],
        [
          '241014SHP001',
          'A Enviar',
          'KIT-40-BLeve',
          'Kit 40 Toalha Leve de Praia',
          'Sortido 5 Modelos',
          '1', // Deal Quantity = 1 da Shopee, mas é kit de 40!
          'marina_silva',
          'Cliente pediu modelos 1 e 2 no chat',
          'BR241014RASTREIO01',
        ],
        [
          '241014SHP002',
          'A Enviar',
          'SHP-MON-30',
          'Kit Toalha Mônica 30 un',
          'Padrão',
          '30',
          'joao_souza',
          '',
        ],
        [
          '241014SHP003',
          'A Enviar',
          'DESCONHECIDO-99',
          'Toalha Personalizada Infantil',
          'Azul',
          '2',
          'carlos_lima',
          '',
        ],
      ]

      const ws = XLSX.utils.aoa_to_sheet(dadosPlanilha)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'orders')
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

      const res = parseShopeePlanilha(buffer, catalogoMock, temasMock, {
        nomeArquivo: 'Order.toship.20261010.xlsx',
      })

      expect(res.origem).toBe('planilha_xlsx')
      expect(res.nomeArquivo).toBe('Order.toship.20261010.xlsx')
      expect(res.totalLinhas).toBe(3)
      expect(res.reconhecidosCount).toBe(2)
      expect(res.genericosCount).toBe(1)
      expect(res.pedidosEspeciaisCount).toBe(1)

      // Item 1
      const item1 = res.itens[0]
      expect(item1.numeroPedido).toBe('241014SHP001')
      expect(item1.sku).toBe('KIT-40-BLeve')
      expect(item1.produtoNome).toBe('Kit 40 Toalha Leve de Praia')
      // Corrigido para 40 peças mesmo a planilha trazendo Deal Quantity = 1
      expect(item1.quantidade).toBe(40)
      expect(item1.codigoRastreio).toBe('BR241014RASTREIO01')
      expect(item1.clienteNome).toBe('marina_silva')
      expect(item1.temPedidoEspecial).toBe(true)
      expect(item1.pedidoEspecial).toContain('Cliente pediu modelos 1 e 2 no chat')
      expect(item1.triagemPedidoEspecial).toBe('pendente_analise')
      expect(item1.reconhecido).toBe(true)
      expect(item1.isKitOuCombo).toBe(true)

      // Item 2 (SKU de canal)
      const item2 = res.itens[1]
      expect(item2.numeroPedido).toBe('241014SHP002')
      expect(item2.reconhecido).toBe(true)
      expect(item2.produtoEncontrado?.id).toBe('prod3')
      expect(item2.temaId).toBe('tema-monica')

      // Item 3 (genérico)
      const item3 = res.itens[2]
      expect(item3.numeroPedido).toBe('241014SHP003')
      expect(item3.reconhecido).toBe(false)
      expect(item3.motivoNaoReconhecido).toBeDefined()
    })

    it('permite override manual de mapeamento caso o usuário ajuste colunas na prévia', () => {
      // Planilha com nomes exóticos/diferentes de colunas
      const dadosPlanilha = [
        ['CodVenda', 'ItemSKU', 'Descricao', 'QtdComprada', 'UsuarioShopee'],
        ['PED-999', 'KIT-40-BLeve', 'Kit Toalha Leve', '50', 'cliente_teste'],
      ]

      const ws = XLSX.utils.aoa_to_sheet(dadosPlanilha)
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'orders')
      const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

      // Fornece mapeamento manual customizado
      const res = parseShopeePlanilha(buffer, catalogoMock, temasMock, {
        mapeamentoCustomizado: {
          numeroPedido: 'CodVenda',
          sku: 'ItemSKU',
          produtoNome: 'Descricao',
          quantidade: 'QtdComprada',
          clienteNome: 'UsuarioShopee',
        },
      })

      expect(res.totalLinhas).toBe(1)
      const item = res.itens[0]
      expect(item.numeroPedido).toBe('PED-999')
      expect(item.sku).toBe('KIT-40-BLeve')
      expect(item.quantidade).toBe(50)
      expect(item.clienteNome).toBe('cliente_teste')
      expect(item.reconhecido).toBe(true)
    })
  })

  describe('parseShopeeColagem (compatibilidade regressiva mantida)', () => {
    it('parseia texto TSV com pedido especial e detecção de kits', () => {
      const textoColado = `ID do Pedido\tSKU\tNome do Produto\tVariação\tQuantidade\tCliente\tMensagem do Cliente
241014ABCD99\tKIT-40-BLeve\tKit 40 Toalha Leve de Praia\tSortido\t40\tAna Silva\tCliente pediu modelo 01 e 03 no chat
241014XYZ888\tSHP-MON-30\tKit Toalha Mônica\tPadrão\t30\tBeatriz\t
241014ZZZ111\tDESCONHECIDO\tToalha de Bebê Estampada\tAzul\t5\tCarlos\t`

      const parsed = parseShopeeColagem(textoColado, catalogoMock, temasMock)

      expect(parsed.totalLinhas).toBe(3)
      expect(parsed.reconhecidosCount).toBe(2)
      expect(parsed.genericosCount).toBe(1)
      expect(parsed.pedidosEspeciaisCount).toBe(1)

      const item1 = parsed.itens[0]
      expect(item1.numeroPedido).toBe('241014ABCD99')
      expect(item1.reconhecido).toBe(true)
      expect(item1.isKitOuCombo).toBe(true)
      expect(item1.temPedidoEspecial).toBe(true)
      expect(item1.pedidoEspecial).toContain('Cliente pediu modelo 01 e 03 no chat')
    })
  })
})
