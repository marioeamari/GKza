import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  normalizarCodigoSku,
  normalizarCabecalho,
  parseNumeroBling,
  detectarChaveColuna,
  SINONIMOS_COLUNAS_BLING,
  encontrarProdutoPorApelido,
  lerPlanilhaBling,
  processarRelatorioBling,
  adicionarApelidoCanal,
  removerApelidoCanal,
  LinhaBlingBruta,
} from './blingVendasParser'
import type { PrecProdutoRecord } from '@/types/precificacao'

describe('blingVendasParser - Normalização e Detecção', () => {
  it('normalizarCodigoSku deve remover acentos, espaços extras e deixar em minúsculas', () => {
    expect(normalizarCodigoSku('  B197-Azul  ')).toBe('b197-azul')
    expect(normalizarCodigoSku('RPatrulha-20')).toBe('rpatrulha-20')
    expect(normalizarCodigoSku('Toalha Estrela D’Água')).toBe('toalha estrela d’agua')
    expect(normalizarCodigoSku(null)).toBe('')
    expect(normalizarCodigoSku(undefined)).toBe('')
  })

  it('normalizarCabecalho deve limpar caracteres especiais', () => {
    expect(normalizarCabecalho('Valor total FCP ST')).toBe('valor total fcp st')
    expect(normalizarCabecalho('QuantidadeICMS')).toBe('quantidadeicms')
    expect(normalizarCabecalho('Código')).toBe('codigo')
  })

  it('parseNumeroBling deve converter formatos numéricos e brasileiros de moeda', () => {
    expect(parseNumeroBling(123.45)).toBe(123.45)
    expect(parseNumeroBling('1250,50')).toBe(1250.5)
    expect(parseNumeroBling('R$ 1.250,50')).toBe(1250.5)
    expect(parseNumeroBling('10')).toBe(10)
    expect(parseNumeroBling('')).toBe(0)
    expect(parseNumeroBling(null)).toBe(0)
  })

  it('detectarChaveColuna deve encontrar colunas pelo nome e sinônimos do Bling', () => {
    const colunas = [
      'Código',
      'Valor total FCP ST',
      'Frete',
      'QuantidadeICMS',
      'IPI',
      'ISSQN',
      'COFINS',
      'ST',
      'II',
      'PIS',
      'CFOP',
      'Grupo',
      'NCM',
      'Percentual',
    ]

    expect(detectarChaveColuna(colunas, SINONIMOS_COLUNAS_BLING.codigo)).toBe('Código')
    expect(detectarChaveColuna(colunas, SINONIMOS_COLUNAS_BLING.quantidade)).toBe('QuantidadeICMS')
    expect(detectarChaveColuna(colunas, SINONIMOS_COLUNAS_BLING.valorTotal)).toBe(
      'Valor total FCP ST',
    )
    expect(detectarChaveColuna(colunas, SINONIMOS_COLUNAS_BLING.frete)).toBe('Frete')
  })
})

describe('blingVendasParser - Dicionário de Apelidos SKU e Match Exato', () => {
  const catalogoMock: PrecProdutoRecord[] = [
    {
      id: 'prod_toalha_tema_x',
      sku: 'TOALHA-TEMA-X',
      nome: 'Toalha de Praia Tema Patrulha Canina',
      tipo: 'fabricacao_propria',
      status: 'ativo',
      sku_por_canal: [
        { canal: 'canal_shopee', sku_externo: 'B197' },
        { canal: 'todos', sku_externo: 'RPatrulha-20' },
      ],
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'prod_toalha_tema_y',
      sku: 'TOALHA-TEMA-Y',
      nome: 'Toalha de Praia Tema Princesas',
      tipo: 'fabricacao_propria',
      status: 'ativo',
      sku_por_canal: [{ canal: 'canal_shopee', sku_externo: 'B122' }],
      created: '2026-01-01',
      updated: '2026-01-01',
    },
    {
      id: 'prod_kit_20_patrulha',
      sku: 'Kit-20-R-Patrulha',
      nome: 'Kit 20 Rosto Patrulha',
      tipo: 'kit',
      status: 'ativo',
      sku_por_canal: [],
      created: '2026-01-01',
      updated: '2026-01-01',
    },
  ]

  it('deve casar apelido Bling B197 com a toalha do Tema X (e NUNCA com tema genérico)', () => {
    const match = encontrarProdutoPorApelido('B197', catalogoMock, 'canal_shopee')
    expect(match).not.toBeNull()
    expect(match?.produto.id).toBe('prod_toalha_tema_x')
    expect(match?.origem).toBe('sku_por_canal')
  })

  it('deve casar apelido Bling B122 com a toalha do Tema Y', () => {
    const match = encontrarProdutoPorApelido('B122', catalogoMock, 'canal_shopee')
    expect(match).not.toBeNull()
    expect(match?.produto.id).toBe('prod_toalha_tema_y')
    expect(match?.origem).toBe('sku_por_canal')
  })

  it('deve casar RPatrulha-20 com prod_toalha_tema_x através do canal global', () => {
    const match = encontrarProdutoPorApelido('RPatrulha-20', catalogoMock, 'canal_magalu')
    expect(match).not.toBeNull()
    expect(match?.produto.id).toBe('prod_toalha_tema_x')
  })

  it('deve casar Kit-20-R-Patrulha diretamente pelo SKU do produto', () => {
    const match = encontrarProdutoPorApelido('Kit-20-R-Patrulha', catalogoMock, 'canal_shopee')
    expect(match).not.toBeNull()
    expect(match?.produto.id).toBe('prod_kit_20_patrulha')
    expect(match?.origem).toBe('sku_direto')
  })

  it('deve retornar null para código sem match para alimentar fila A Classificar', () => {
    const match = encontrarProdutoPorApelido('CODIGO-INEXISTENTE-999', catalogoMock, 'canal_shopee')
    expect(match).toBeNull()
  })
})

describe('blingVendasParser - Agrupamento e Reimportação', () => {
  const catalogoMock: PrecProdutoRecord[] = [
    {
      id: 'prod_x',
      sku: 'SKU-X',
      nome: 'Toalha Tema X',
      tipo: 'fabricacao_propria',
      status: 'ativo',
      sku_por_canal: [{ canal: 'canal_1', sku_externo: 'B197' }],
      created: '',
      updated: '',
    },
    {
      id: 'prod_y',
      sku: 'SKU-Y',
      nome: 'Toalha Tema Y',
      tipo: 'fabricacao_propria',
      status: 'ativo',
      sku_por_canal: [{ canal: 'canal_1', sku_externo: 'B122' }],
      created: '',
      updated: '',
    },
  ]

  it('processarRelatorioBling deve agrupar quantidades e somar valores no nível produto exato', () => {
    const linhas: LinhaBlingBruta[] = [
      {
        codigo: 'B197',
        quantidade: 10,
        valorTotal: 500,
        linhaOriginal: {},
      },
      {
        codigo: 'B197', // Mesma mercadoria em outro pedido do Bling
        quantidade: 15,
        valorTotal: 750,
        linhaOriginal: {},
      },
      {
        codigo: 'B122',
        quantidade: 5,
        valorTotal: 250,
        linhaOriginal: {},
      },
      {
        codigo: 'CODIGO-NOVO-DESCONHECIDO', // Vai para A Classificar
        quantidade: 3,
        valorTotal: 150,
        linhaOriginal: {},
      },
    ]

    const resultado = processarRelatorioBling(linhas, catalogoMock, 'canal_1')

    expect(resultado.sucesso).toBe(true)
    expect(resultado.totalLinhasLidas).toBe(4)
    // 2 produtos distintos classificados
    expect(resultado.resumo.totalProdutosClassificados).toBe(2)
    // 10 + 15 = 25 unidades do produto X
    expect(resultado.agrupadosPorProduto['prod_x'].quantidadeTotal).toBe(25)
    expect(resultado.agrupadosPorProduto['prod_x'].valorTotal).toBe(1250)
    // 5 unidades do produto Y
    expect(resultado.agrupadosPorProduto['prod_y'].quantidadeTotal).toBe(5)
    expect(resultado.agrupadosPorProduto['prod_y'].valorTotal).toBe(250)
    // Total unidades classificadas = 30
    expect(resultado.resumo.totalUnidadesClassificadas).toBe(30)
    // Fila A Classificar: 1 código pendente
    expect(resultado.aClassificar.length).toBe(1)
    expect(resultado.aClassificar[0].codigoBling).toBe('CODIGO-NOVO-DESCONHECIDO')
    expect(resultado.aClassificar[0].quantidade).toBe(3)
  })

  it('gravar novo apelido deve resolver o código que estava em A Classificar', () => {
    // Simula a ação do usuário na fila: apontar CODIGO-NOVO-DESCONHECIDO para prod_y
    const apelidosAtuais = catalogoMock[1].sku_por_canal
    const novosApelidos = adicionarApelidoCanal(
      apelidosAtuais,
      'canal_1',
      'CODIGO-NOVO-DESCONHECIDO',
    )
    catalogoMock[1].sku_por_canal = novosApelidos

    // Reprocessamento imediato
    const linhas: LinhaBlingBruta[] = [
      {
        codigo: 'CODIGO-NOVO-DESCONHECIDO',
        quantidade: 3,
        valorTotal: 150,
        linhaOriginal: {},
      },
    ]

    const resultadoReprocessado = processarRelatorioBling(linhas, catalogoMock, 'canal_1')
    expect(resultadoReprocessado.aClassificar.length).toBe(0)
    expect(resultadoReprocessado.agrupadosPorProduto['prod_y'].quantidadeTotal).toBe(3)
  })

  it('gerenciador de apelidos: adicionar e remover apelidos por canal sem duplicatas', () => {
    let lista: Array<{ canal: string; sku_externo: string }> = []
    lista = adicionarApelidoCanal(lista, 'shopee', 'B197')
    expect(lista).toHaveLength(1)

    // Tentar adicionar duplicata
    lista = adicionarApelidoCanal(lista, 'shopee', 'B197')
    expect(lista).toHaveLength(1)

    // Adicionar outro canal
    lista = adicionarApelidoCanal(lista, 'mercado_livre', 'B197')
    expect(lista).toHaveLength(2)

    // Remover
    lista = removerApelidoCanal(lista, 'shopee', 'B197')
    expect(lista).toHaveLength(1)
    expect(lista[0].canal).toBe('mercado_livre')
  })

  it('deve separar texto com vírgula "B122, B197" em códigos individuais ao adicionar', () => {
    let lista: Array<{ canal: string; sku_externo: string }> = []
    lista = adicionarApelidoCanal(lista, 'shopee', 'B122, B197')
    expect(lista).toHaveLength(2)
    expect(lista[0]).toEqual({ canal: 'shopee', sku_externo: 'B122' })
    expect(lista[1]).toEqual({ canal: 'shopee', sku_externo: 'B197' })

    // Se tentar adicionar novamente com pontuação mista, não duplica
    lista = adicionarApelidoCanal(lista, 'shopee', 'B197; B122')
    expect(lista).toHaveLength(2)
  })

  it('compatibilidade retroativa: registro legado com string "B122, B197" deve casar ambos os códigos B122 e B197', () => {
    const catalogoLegado: PrecProdutoRecord[] = [
      {
        id: 'lsilkiq8w2apfre',
        sku: 'BLeve',
        nome: 'Toalha Leve de Praia',
        tipo: 'revenda',
        status: 'ativo',
        sku_por_canal: [{ canal: 'nnnk28chx9llzmm', sku_externo: 'B122, B197' }],
        created: '',
        updated: '',
      },
    ]

    const matchB122 = encontrarProdutoPorApelido('B122', catalogoLegado, 'nnnk28chx9llzmm')
    expect(matchB122).not.toBeNull()
    expect(matchB122?.produto.id).toBe('lsilkiq8w2apfre')

    const matchB197 = encontrarProdutoPorApelido('B197', catalogoLegado, 'nnnk28chx9llzmm')
    expect(matchB197).not.toBeNull()
    expect(matchB197?.produto.id).toBe('lsilkiq8w2apfre')
  })

  it('reimportação da planilha traz B197=166un e B122=67un classificados sem passar pela fila', () => {
    const produtoBLeve: PrecProdutoRecord = {
      id: 'lsilkiq8w2apfre',
      sku: 'BLeve',
      nome: 'Toalha Leve de Praia',
      tipo: 'revenda',
      status: 'ativo',
      sku_por_canal: [
        { canal: 'nnnk28chx9llzmm', sku_externo: 'B122' },
        { canal: 'nnnk28chx9llzmm', sku_externo: 'B197' },
      ],
      created: '',
      updated: '',
    }

    const linhas: LinhaBlingBruta[] = [
      {
        codigo: 'B197',
        quantidade: 166,
        valorTotal: 166 * 24.9,
        linhaOriginal: {},
      },
      {
        codigo: 'B122',
        quantidade: 67,
        valorTotal: 67 * 24.9,
        linhaOriginal: {},
      },
    ]

    const resultado = processarRelatorioBling(linhas, [produtoBLeve], 'nnnk28chx9llzmm')

    // Deve casar todos direto sem alimentar fila 'aClassificar'
    expect(resultado.aClassificar).toHaveLength(0)
    expect(resultado.resumo.totalCodigosNaoClassificados).toBe(0)
    expect(resultado.resumo.totalProdutosClassificados).toBe(1)
    expect(resultado.resumo.totalUnidadesClassificadas).toBe(233) // 166 + 67
    expect(resultado.agrupadosPorProduto['lsilkiq8w2apfre'].quantidadeTotal).toBe(233)
    expect(resultado.agrupadosPorProduto['lsilkiq8w2apfre'].codigosBling).toEqual(
      expect.arrayContaining(['B197', 'B122']),
    )
  })
})

describe('blingVendasParser - Leitura de Planilha Real via SheetJS', () => {
  it('deve gerar e ler uma planilha binária XLSX com as colunas reais do Bling', () => {
    // Cria uma planilha sintética em memória com a mesma estrutura fornecida pelo Bling
    const dados = [
      [
        'Código',
        'Valor total FCP ST',
        'Frete',
        'QuantidadeICMS',
        'IPI',
        'ISSQN',
        'COFINS',
        'ST',
        'II',
        'PIS',
        'CFOP',
        'Grupo',
        'NCM',
        'Percentual',
      ],
      [
        'B197',
        '500,00',
        '25,00',
        '10',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '5102',
        'Toalhas',
        '6302.60.00',
        '0,00',
      ],
      [
        'B122',
        '250,50',
        '12,50',
        '5',
        '0',
        '0',
        '0',
        '0',
        '0',
        '0',
        '5102',
        'Toalhas',
        '6302.60.00',
        '0,00',
      ],
      ['Total', '750,50', '37,50', '15', '0', '0', '0', '0', '0', '0', '', '', '', ''],
    ]

    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.aoa_to_sheet(dados)
    XLSX.utils.book_append_sheet(wb, ws, 'Vendas Bling')
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' })

    const linhasLidas = lerPlanilhaBling(buffer)

    // Deve ignorar a linha de rodapé "Total" e ler as 2 linhas de dados
    expect(linhasLidas).toHaveLength(2)
    expect(linhasLidas[0].codigo).toBe('B197')
    expect(linhasLidas[0].quantidade).toBe(10)
    expect(linhasLidas[0].valorTotal).toBe(500)
    expect(linhasLidas[0].frete).toBe(25)

    expect(linhasLidas[1].codigo).toBe('B122')
    expect(linhasLidas[1].quantidade).toBe(5)
    expect(linhasLidas[1].valorTotal).toBe(250.5)
  })
})
