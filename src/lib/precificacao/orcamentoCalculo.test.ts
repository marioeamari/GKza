import { describe, it, expect } from 'vitest'
import {
  calcularTotaisPorCanal,
  gerarTextoWhatsappOrcamento,
  formatarMoedaBR,
  criarLinkWhatsapp,
  normalizarCanaisComparadosIds,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
} from './orcamentoCalculo'

describe('Módulo de Orçamentos - Regras de Cálculo e Formatação', () => {
  it('formata moeda no padrão brasileiro R$ X,XX', () => {
    expect(formatarMoedaBR(622.5)).toBe('R$ 622,50')
    expect(formatarMoedaBR(23.87)).toBe('R$ 23,87')
    expect(formatarMoedaBR(745.89)).toBe('R$ 745,89')
    expect(formatarMoedaBR(0)).toBe('R$ 0,00')
  })

  it('calcula total por canal = soma dos subtotais dos itens + soma dos fretes dos itens', () => {
    const canais = [
      { id: 'canal_shopee', nome: 'Shopee' },
      { id: 'canal_site', nome: 'Site' },
    ]

    const itens = [
      {
        modelo_nome: 'Banho',
        quantidade: 25,
        precos_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            preco_unitario: 24.9, // 25 * 24.9 = 622.50
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            preco_unitario: 19.9, // 25 * 19.9 = 497.50
          },
        },
        fretes_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            valor_frete: 23.87,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            valor_frete: 33.91,
          },
        },
      },
      {
        modelo_nome: 'Rosto',
        quantidade: 25,
        precos_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            preco_unitario: 3.596, // 25 * 3.596 = 89.90
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            preco_unitario: 3.196, // 25 * 3.196 = 79.90
          },
        },
        fretes_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            valor_frete: 9.62,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            valor_frete: 21.96,
          },
        },
      },
    ]

    const totais = calcularTotaisPorCanal(canais, itens)

    // Canal Shopee:
    // Itens: 622.50 + 89.90 = 712.40
    // Fretes: 23.87 + 9.62 = 33.49
    // Total Geral: 712.40 + 33.49 = 745.89
    expect(totais.canal_shopee.total_itens).toBe(712.4)
    expect(totais.canal_shopee.total_fretes).toBe(33.49)
    expect(totais.canal_shopee.total_geral).toBe(745.89)

    // Canal Site:
    // Itens: 497.50 + 79.90 = 577.40
    // Fretes: 33.91 + 21.96 = 55.87
    // Total Geral: 577.40 + 55.87 = 633.27
    expect(totais.canal_site.total_itens).toBe(577.4)
    expect(totais.canal_site.total_fretes).toBe(55.87)
    expect(totais.canal_site.total_geral).toBe(633.27)
  })

  it('gera texto de WhatsApp idêntico ao exemplo real do usuário com a mesma pontuação e seções', () => {
    const canais = [
      { id: 'canal_shopee', nome: 'Shopee' },
      { id: 'canal_site', nome: 'Site' },
    ]

    const itens = [
      {
        modelo_nome: 'Banho',
        quantidade: 25,
        precos_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            preco_unitario: 24.9,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            preco_unitario: 19.9,
          },
        },
        fretes_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            valor_frete: 23.87,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            valor_frete: 33.91,
          },
        },
      },
      {
        modelo_nome: 'Rosto',
        quantidade: 25,
        precos_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            preco_unitario: 3.596,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            preco_unitario: 3.196,
          },
        },
        fretes_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            valor_frete: 9.62,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            valor_frete: 21.96,
          },
        },
      },
    ]

    const texto = gerarTextoWhatsappOrcamento({
      titulo: 'Combo 25 unidades Toalhas de Banho e Rosto Tema BLUEY cor AZUL',
      canais,
      itens,
    })

    // Verifica elementos-chave e padrão exigido pelo usuário:
    // "Combo 25 unidades Toalhas de Banho e Rosto Tema BLUEY cor AZUL
    // #Shopee:
    // * 25 unidades Banho R$ 622,50
    // * Frete: R$ 23,87
    // * 25 unidades Rosto R$ 89,90
    // * Frete: R$ 9,62
    // * Total: R$ 745,89
    // #Site:
    // * 25 unidades Banho R$ 497,50
    // * Frete: R$ 33,91
    // * 25 unidades Rosto R$ 79,90
    // * Frete: R$ 21,96
    // * Total: R$ 633,27"

    expect(texto).toContain('Combo 25 unidades Toalhas de Banho e Rosto Tema BLUEY cor AZUL')
    expect(texto).toContain('#Shopee:')
    expect(texto).toContain('* 25 unidades Banho R$ 622,50')
    expect(texto).toContain('* Frete: R$ 23,87')
    expect(texto).toContain('* 25 unidades Rosto R$ 89,90')
    expect(texto).toContain('* Frete: R$ 9,62')
    expect(texto).toContain('* Total: R$ 745,89')

    expect(texto).toContain('#Site:')
    expect(texto).toContain('* 25 unidades Banho R$ 497,50')
    expect(texto).toContain('* Frete: R$ 33,91')
    expect(texto).toContain('* 25 unidades Rosto R$ 79,90')
    expect(texto).toContain('* Frete: R$ 21,96')
    expect(texto).toContain('* Total: R$ 633,27')
  })

  it('gera link wa.me com telefone sanitizado e codificação correta', () => {
    const texto = 'Olá, segue cotação'
    const linkComDDI = criarLinkWhatsapp('(18) 99807-4841', texto)
    expect(linkComDDI).toBe(
      'https://wa.me/5518998074841?text=Ol%C3%A1%2C%20segue%20cota%C3%A7%C3%A3o',
    )

    const linkSemNumero = criarLinkWhatsapp('', texto)
    expect(linkSemNumero).toBe('https://wa.me/?text=Ol%C3%A1%2C%20segue%20cota%C3%A7%C3%A3o')
  })

  describe('Normalização de canais e orçamentos (blindagem contra TypeError: canais.map is not a function)', () => {
    it('normaliza canais_comparados em diferentes formatos (string única, lista, JSON string, undefined)', () => {
      expect(normalizarCanaisComparadosIds(undefined)).toEqual([])
      expect(normalizarCanaisComparadosIds(null)).toEqual([])
      expect(normalizarCanaisComparadosIds('')).toEqual([])
      expect(normalizarCanaisComparadosIds('nnnk28chx9llzmm')).toEqual(['nnnk28chx9llzmm'])
      expect(normalizarCanaisComparadosIds('id1, id2, id3')).toEqual(['id1', 'id2', 'id3'])
      expect(normalizarCanaisComparadosIds('["id1", "id2"]')).toEqual(['id1', 'id2'])
      expect(normalizarCanaisComparadosIds(['id1', 'id2'])).toEqual(['id1', 'id2'])
      expect(normalizarCanaisComparadosIds([{ id: 'id1' }, { id: 'id2' }])).toEqual(['id1', 'id2'])
    })

    it('normaliza canais expandidos quando vem como objeto único (PocketBase maxSelect: 1), nulo ou undefined', () => {
      // Cenário exato do erro: canais chega como objeto em vez de array
      const objetoUnico = { id: 'c1', nome: 'Shopee' }
      const normalizadoDeObjeto = normalizarCanaisExpandidos(objetoUnico)
      expect(Array.isArray(normalizadoDeObjeto)).toBe(true)
      expect(normalizadoDeObjeto).toEqual([{ id: 'c1', nome: 'Shopee' }])
      // Garante que .map() funciona sem quebrar
      expect(normalizadoDeObjeto.map((c) => c.nome)).toEqual(['Shopee'])

      // Cenário undefined ou null
      expect(normalizarCanaisExpandidos(undefined)).toEqual([])
      expect(normalizarCanaisExpandidos(null)).toEqual([])
      expect(normalizarCanaisExpandidos([]).map((c) => c.nome)).toEqual([])

      // Cenário com array válido
      const arrayValido = [
        { id: 'c1', nome: 'Shopee' },
        { id: 'c2', nome: 'Site' },
      ]
      expect(normalizarCanaisExpandidos(arrayValido)).toEqual(arrayValido)
    })

    it('normaliza um registro completo de orcamento sem quebrar renderizadores', () => {
      const orcamentoCru = {
        id: 'orc1',
        codigo: 'ORC-001',
        cliente_nome: 'Cliente Teste',
        status: 'rascunho',
        canais_comparados: 'c1', // string em vez de array
        expand: {
          canais_comparados: { id: 'c1', nome: 'Shopee' }, // objeto único em vez de array!
          itens: undefined, // undefined em vez de array
        },
        totais_por_canal: '{"c1": {"canal_id":"c1","canal_nome":"Shopee","total_geral":100}}', // string JSON
      }

      const orcNormalizado = normalizarOrcamentoRecord(orcamentoCru)

      // Verificações essenciais
      expect(Array.isArray(orcNormalizado.canais_comparados)).toBe(true)
      expect(orcNormalizado.canais_comparados).toEqual(['c1'])

      expect(Array.isArray(orcNormalizado.expand?.canais_comparados)).toBe(true)
      expect(orcNormalizado.expand?.canais_comparados?.map((c) => c.nome)).toEqual(['Shopee'])

      expect(Array.isArray(orcNormalizado.expand?.itens)).toBe(true)
      expect(orcNormalizado.expand?.itens?.map((it) => it.modelo_nome)).toEqual([])

      expect(typeof orcNormalizado.totais_por_canal).toBe('object')
      expect(orcNormalizado.totais_por_canal?.c1?.total_geral).toBe(100)

      // Teste do gerador de texto com entradas que poderiam ser indefinidas
      const texto = gerarTextoWhatsappOrcamento({
        titulo: 'Teste',
        canais: normalizarCanaisExpandidos(orcNormalizado.expand?.canais_comparados),
        itens: (orcNormalizado.expand?.itens as any) || [],
      })
      expect(texto).toContain('#Shopee:')
    })

    it('calcularTotaisPorCanal e gerarTextoWhatsappOrcamento aceitam entradas não-array com segurança', () => {
      expect(calcularTotaisPorCanal(undefined as any, undefined as any)).toEqual({})
      expect(
        gerarTextoWhatsappOrcamento({
          canais: undefined as any,
          itens: undefined as any,
        }),
      ).toBe('Combo 0 unidades Itens')
    })
  })
})
