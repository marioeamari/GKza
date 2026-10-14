import { describe, it, expect } from 'vitest'
import {
  calcularTotaisPorCanal,
  gerarTextoWhatsappOrcamento,
  formatarMoedaBR,
  criarLinkWhatsapp,
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
})
