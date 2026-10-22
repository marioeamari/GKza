import { describe, it, expect } from 'vitest'
import {
  calcularTotaisPorCanal,
  calcularMontanteConsolidadoPorCanal,
  gerarTextoWhatsappOrcamento,
  formatarMoedaBR,
  criarLinkWhatsapp,
  normalizarCanaisComparadosIds,
  normalizarCanaisExpandidos,
  normalizarOrcamentoRecord,
  converterUnitarioParaCheio,
  converterCheioParaUnitario,
  calcularDescontoIndividualItem,
  formatarDataBR,
  calcularSubtotalProdutosCanal,
  calcularTotalItemComFreteCanal,
  calcularOpcoesFreteComTotais,
  formatarLinhaOpcaoFrete,
} from './orcamentoCalculo'
import { OrcamentoFreteOpcao } from '@/types/orcamento'
import { gerarHTMLParaImpressaoPDF } from './orcamentoPdf'
import { orcamentosService } from '@/services/orcamentos'

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

  it('trava regras de Modos de Frete (pago pelo cliente vs frete grátis)', () => {
    const canais = [
      { id: 'canal_shopee', nome: 'Shopee', tipo: 'marketplace' },
      { id: 'canal_site', nome: 'Site', tipo: 'site_proprio' },
    ]

    // Item 1 com frete pago pelo cliente (soma no total do cliente, NÃO entra no custo)
    // Item 2 com frete grátis (a loja paga: ENTRA no custo, reduz lucro, NÃO soma no total do cliente)
    const itens = [
      {
        quantidade: 10,
        precos_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            preco_unitario: 24.9,
            preco_cheio: 249.0,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            preco_unitario: 19.9,
            preco_cheio: 199.0,
          },
        },
        fretes_canais: {
          canal_shopee: {
            canal_id: 'canal_shopee',
            canal_nome: 'Shopee',
            valor_frete: 30.0,
            modo_frete: 'pago_pelo_cliente' as const,
          },
          canal_site: {
            canal_id: 'canal_site',
            canal_nome: 'Site',
            valor_frete: 25.0,
            modo_frete: 'frete_gratis' as const,
          },
        },
      },
    ]

    const totais = calcularTotaisPorCanal(canais, itens)

    // Shopee (pago pelo cliente): total_itens = 249, total_fretes = 30, total_geral = 279
    expect(totais.canal_shopee.total_itens).toBe(249)
    expect(totais.canal_shopee.total_fretes).toBe(30)
    expect(totais.canal_shopee.total_geral).toBe(279)

    // Site (frete grátis): total_itens = 199, total_fretes = 0 (não soma no cliente), total_geral = 199
    expect(totais.canal_site.total_itens).toBe(199)
    expect(totais.canal_site.total_fretes).toBe(0)
    expect(totais.canal_site.total_geral).toBe(199)

    // No Montante Consolidado:
    // Custo base de produto = 100 (simulado)
    const mapaPrec = {
      prec1: {
        resultado: { custo_total_produto: 10, total_taxas_retidas_canal: 0 },
      },
    }
    const itensComPrec = [
      {
        ...itens[0],
        precos_canais: {
          canal_shopee: { ...itens[0].precos_canais.canal_shopee, precificacao_id: 'prec1' },
          canal_site: { ...itens[0].precos_canais.canal_site, precificacao_id: 'prec1' },
        },
      },
    ]

    const montantes = calcularMontanteConsolidadoPorCanal({
      canais,
      itens: itensComPrec,
      mapaPrecificacoesAprovadas: mapaPrec,
      aliquotaDas: 0,
      aliquotaIcms: 0,
    })

    const shopeeM = montantes.find((m) => m.canalId === 'canal_shopee')!
    const siteM = montantes.find((m) => m.canalId === 'canal_site')!

    // Shopee: frete pago pelo cliente soma no faturamentoTotal (249 + 30 = 279)
    // Custo de produto permanece 100 (10 * 10 un)
    expect(shopeeM.faturamentoTotal).toBe(279)
    expect(shopeeM.custoTotalProdutos).toBe(100)

    // Site: frete grátis NÃO soma no faturamentoTotal (199 + 0 = 199)
    // Custo de produto aumenta com o frete da loja: 100 + 25 = 125
    expect(siteM.faturamentoTotal).toBe(199)
    expect(siteM.custoTotalProdutos).toBe(125)
    // Lucro do site = faturamento itens (199) - taxas (0 site) - custos (125) = 74
    expect(siteM.lucroLiquidoTotal).toBe(74)
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

  describe('Itens Cadastrados e Personalizados com Montante Consolidado', () => {
    it('calcula o montante consolidado somando itens cadastrados e personalizados', () => {
      const canais = [
        { id: 'canal_shopee', nome: 'Shopee', tipo: 'marketplace' },
        { id: 'canal_site', nome: 'Site', tipo: 'site_proprio' },
      ]

      const itens = [
        // Item 1: Cadastrado
        {
          quantidade: 25,
          precos_canais: {
            canal_shopee: {
              canal_id: 'canal_shopee',
              canal_nome: 'Shopee',
              preco_unitario: 24.9,
              preco_cheio: 622.5,
            },
            canal_site: {
              canal_id: 'canal_site',
              canal_nome: 'Site',
              preco_unitario: 19.9,
              preco_cheio: 497.5,
            },
          },
          fretes_canais: {
            canal_shopee: { canal_id: 'canal_shopee', canal_nome: 'Shopee', valor_frete: 23.87 },
            canal_site: { canal_id: 'canal_site', canal_nome: 'Site', valor_frete: 33.91 },
          },
        },
        // Item 2: Personalizado
        {
          quantidade: 10,
          precos_canais: {
            canal_shopee: {
              canal_id: 'canal_shopee',
              canal_nome: 'Shopee',
              preco_unitario: 35.0,
              preco_cheio: 350.0,
            },
            canal_site: {
              canal_id: 'canal_site',
              canal_nome: 'Site',
              preco_unitario: 30.0,
              preco_cheio: 300.0,
            },
          },
          fretes_canais: {
            canal_shopee: { canal_id: 'canal_shopee', canal_nome: 'Shopee', valor_frete: 10.0 },
            canal_site: { canal_id: 'canal_site', canal_nome: 'Site', valor_frete: 15.0 },
          },
        },
      ]

      const montantes = calcularMontanteConsolidadoPorCanal({
        canais,
        itens,
      })

      expect(montantes).toHaveLength(2)

      const shopee = montantes.find((m) => m.canalId === 'canal_shopee')!
      expect(shopee.totalItens).toBe(972.5)
      expect(shopee.totalFretes).toBe(33.87)
      expect(shopee.faturamentoTotal).toBe(1006.37)
      expect(shopee.lucroLiquidoTotal).toBeGreaterThan(0)

      const site = montantes.find((m) => m.canalId === 'canal_site')!
      expect(site.totalItens).toBe(797.5)
      expect(site.totalFretes).toBe(48.91)
      expect(site.faturamentoTotal).toBe(846.41)
    })

    it('inclui descrições de itens personalizados no texto de WhatsApp', () => {
      const texto = gerarTextoWhatsappOrcamento({
        titulo: 'Cotação Especial',
        canais: [{ id: 'shopee', nome: 'Shopee' }],
        itens: [
          {
            modelo_nome: 'Toalha Banho',
            quantidade: 20,
            precos_canais: {
              shopee: {
                canal_id: 'shopee',
                canal_nome: 'Shopee',
                preco_unitario: 25.0,
                preco_cheio: 500.0,
              },
            },
          },
          {
            modelo_nome: 'Toalha de Batizado Bordada',
            descricao: 'Bordado dourado personalizado',
            quantidade: 5,
            precos_canais: {
              shopee: {
                canal_id: 'shopee',
                canal_nome: 'Shopee',
                preco_unitario: 40.0,
                preco_cheio: 200.0,
              },
            },
          },
        ],
      })

      expect(texto).toContain('* 20 unidades Toalha Banho R$ 500,00')
      expect(texto).toContain(
        '* 5 unidades Toalha de Batizado Bordada R$ 200,00 (Bordado dourado personalizado)',
      )
      expect(texto).toContain('* Total: R$ 700,00')
    })
  })

  describe('Regra (D): Conversão Preço Unitário <-> Preço Cheio em tempo real', () => {
    it('calcula Preço Cheio a partir de Preço Unitário e Quantidade', () => {
      // Exemplo: 25 unidades a R$ 24,90 unitário = R$ 622,50
      expect(converterUnitarioParaCheio(24.9, 25)).toBe(622.5)
      // 25 unidades a R$ 3,596 = R$ 89,90
      expect(converterUnitarioParaCheio(3.596, 25)).toBe(89.9)
      // 1 unidade a R$ 150 = R$ 150
      expect(converterUnitarioParaCheio(150, 1)).toBe(150)
      // Quantidade zero ou unitário zero
      expect(converterUnitarioParaCheio(0, 25)).toBe(0)
      expect(converterUnitarioParaCheio(24.9, 0)).toBe(0)
    })

    it('calcula Preço Unitário a partir de Preço Cheio e Quantidade', () => {
      // Exemplo inverso: R$ 622,50 para 25 unidades = R$ 24,90 unitário
      expect(converterCheioParaUnitario(622.5, 25)).toBe(24.9)
      // R$ 89,90 para 25 unidades = R$ 3,60 unitário
      expect(converterCheioParaUnitario(89.9, 25)).toBe(3.6)
      // R$ 100 para 3 unidades = R$ 33,33 unitário
      expect(converterCheioParaUnitario(100, 3)).toBe(33.33)
      // Trata quantidade zero sem crash (NaN/Infinity)
      expect(converterCheioParaUnitario(622.5, 0)).toBe(0)
    })
  })

  describe('Regra (A): Resgate de nomes de canais via totais_por_canal quando expand vier vazio', () => {
    it('usa os nomes de canal salvos em totais_por_canal se prec_canais não puder ser expandido (anônimo)', () => {
      const totaisSalvos = {
        canal_shopee_id: {
          canal_id: 'canal_shopee_id',
          canal_nome: 'Shopee Oficial',
          total_itens: 622.5,
          total_fretes: 23.87,
          total_geral: 646.37,
        },
        canal_site_id: {
          canal_id: 'canal_site_id',
          canal_nome: 'Loja GKza Virtual',
          total_itens: 497.5,
          total_fretes: 33.91,
          total_geral: 531.41,
        },
      }

      // Expand vazio (cenário de usuário anônimo / link público sem permissão em prec_canais)
      const canaisSemExpand = normalizarCanaisExpandidos([], totaisSalvos)
      expect(canaisSemExpand).toHaveLength(2)
      expect(canaisSemExpand).toEqual([
        { id: 'canal_shopee_id', nome: 'Shopee Oficial' },
        { id: 'canal_site_id', nome: 'Loja GKza Virtual' },
      ])
    })
  })

  describe('Formatação de data para o padrão brasileiro (dd/mm/aaaa)', () => {
    it('formata strings ISO e objetos Date com segurança', () => {
      expect(formatarDataBR('2026-10-14')).toBe('14/10/2026')
      expect(formatarDataBR('2026-10-14T00:00:00.000Z')).toBe('14/10/2026')
      expect(formatarDataBR('2026-10-14 12:00:00.000Z')).toBe('14/10/2026')
      expect(formatarDataBR('14/10/2026')).toBe('14/10/2026')
      expect(formatarDataBR(undefined)).toBe('-')
      expect(formatarDataBR(null)).toBe('-')
      expect(formatarDataBR('')).toBe('-')
    })
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
      // Múltiplos formatos mistos / espaços extras
      expect(normalizarCanaisComparadosIds('  id_shopee ,  id_site  ')).toEqual([
        'id_shopee',
        'id_site',
      ])
      expect(normalizarCanaisComparadosIds(['  c1 ', '', null as any, 'c2  '])).toEqual([
        'c1',
        'c2',
      ])
    })

    it('testa rigorosamente as regras dos modos de frete pago_pelo_cliente vs frete_gratis', () => {
      const canais = [
        { id: 'c_shopee', nome: 'Shopee', tipo: 'marketplace' },
        { id: 'c_site', nome: 'Site Loja', tipo: 'site_proprio' },
      ]

      const itens = [
        {
          modelo_nome: 'Toalha Especial',
          quantidade: 10,
          precos_canais: {
            c_shopee: {
              canal_id: 'c_shopee',
              canal_nome: 'Shopee',
              preco_unitario: 20,
              preco_cheio: 200,
            },
            c_site: {
              canal_id: 'c_site',
              canal_nome: 'Site Loja',
              preco_unitario: 20,
              preco_cheio: 200,
            },
          },
          fretes_canais: {
            // Shopee: frete pago pelo cliente -> soma no total do cliente (faturamento), custo de produto não é afetado
            c_shopee: {
              canal_id: 'c_shopee',
              canal_nome: 'Shopee',
              valor_frete: 35,
              modo_frete: 'pago_pelo_cliente' as const,
            },
            // Site: frete grátis -> não soma no total do cliente, loja banca o frete (entra no custo do produto, reduz lucro e margem)
            c_site: {
              canal_id: 'c_site',
              canal_nome: 'Site Loja',
              valor_frete: 25,
              modo_frete: 'frete_gratis' as const,
            },
          },
          produtos_canais: {
            c_shopee: { precificacao_id: 'p1' },
            c_site: { precificacao_id: 'p1' },
          },
        },
      ]

      // 1. calcularTotaisPorCanal
      const totais = calcularTotaisPorCanal(canais, itens)

      // Shopee: pago_pelo_cliente -> total_fretes = 35, total_geral = 200 + 35 = 235
      expect(totais.c_shopee.total_itens).toBe(200)
      expect(totais.c_shopee.total_fretes).toBe(35)
      expect(totais.c_shopee.total_geral).toBe(235)

      // Site: frete_gratis -> total_fretes = 0 (cliente não paga), total_geral = 200
      expect(totais.c_site.total_itens).toBe(200)
      expect(totais.c_site.total_fretes).toBe(0)
      expect(totais.c_site.total_geral).toBe(200)

      // 2. calcularMontanteConsolidadoPorCanal
      // Simulando precificação com custo unitário = 8 por unidade (10 un = 80 custo base)
      const mapaPrecificacoes = {
        p1: {
          resultado: { custo_total_produto: 8, total_taxas_retidas_canal: 0 },
        },
      }

      const montantes = calcularMontanteConsolidadoPorCanal({
        canais,
        itens,
        mapaPrecificacoesAprovadas: mapaPrecificacoes,
        aliquotaDas: 0,
        aliquotaIcms: 0,
      })

      const montanteShopee = montantes.find((m) => m.canalId === 'c_shopee')!
      const montanteSite = montantes.find((m) => m.canalId === 'c_site')!

      // Shopee (pago_pelo_cliente):
      // Faturamento inclui o frete do cliente: 200 + 35 = 235
      expect(montanteShopee.faturamentoTotal).toBe(235)
      // Custo do produto é puramente o custo base (10 un * 8 = 80), frete NÃO entra no custo
      expect(montanteShopee.custoTotalProdutos).toBe(80)

      // Site (frete_gratis):
      // Faturamento NÃO inclui frete (cliente paga só os itens): 200
      expect(montanteSite.faturamentoTotal).toBe(200)
      // Frete grátis da loja ENTRA no custo do produto: custo base (80) + frete (25) = 105
      expect(montanteSite.custoTotalProdutos).toBe(105)
      // Lucro líquido do site cai exatamente pelo valor do frete: 200 - 105 = 95
      expect(montanteSite.lucroLiquidoTotal).toBe(95)
      // Margem consolidada = 95 / 200 = 47.5%
      expect(montanteSite.margemConsolidadaPct).toBe(47.5)

      // 3. gerarTextoWhatsappOrcamento exibe 'Grátis' para frete_gratis e o valor para pago_pelo_cliente
      const textoZap = gerarTextoWhatsappOrcamento({
        titulo: 'Cotação Frete',
        canais,
        itens,
      })
      expect(textoZap).toContain('#Shopee:')
      expect(textoZap).toContain('* Frete: R$ 35,00 (pago pelo cliente)')
      expect(textoZap).toContain('* Total: R$ 235,00')

      expect(textoZap).toContain('#Site Loja:')
      expect(textoZap).toContain('* Frete: Grátis')
      expect(textoZap).toContain('* Total: R$ 200,00')
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

    it('item Kit-30 com composição 10+10+10 fecha com quantidade do item e formata sub-lista no WhatsApp', () => {
      const canais = [{ id: 'c1', nome: 'Site KzaMari' }]
      const itemKit = {
        modelo_nome: 'Kit-30-BLeve',
        quantidade: 30,
        composicao: [
          {
            id: '1',
            tipo: 'cadastrado',
            tema_nome: 'Mônica',
            modelo_nome: 'Banho',
            quantidade: 10,
          },
          {
            id: '2',
            tipo: 'cadastrado',
            tema_nome: 'Cebolinha',
            modelo_nome: 'Rosto',
            quantidade: 10,
          },
          { id: '3', tipo: 'personalizado', descricao: 'Bordado Nome Alice', quantidade: 10 },
        ],
        precos_canais: {
          c1: { canal_id: 'c1', canal_nome: 'Site KzaMari', preco_unitario: 15, preco_cheio: 450 },
        },
      }

      // Soma da composição
      const soma = itemKit.composicao.reduce((acc, c) => acc + c.quantidade, 0)
      expect(soma).toBe(30)
      expect(soma).toBe(itemKit.quantidade)

      const textoZap = gerarTextoWhatsappOrcamento({
        titulo: 'Cotação Kit 30',
        canais,
        itens: [itemKit as any],
      })

      // O produto comprado continua em destaque com preço
      expect(textoZap).toContain('* 30 unidades Kit-30-BLeve R$ 450,00')
      // A composição interna aparece como detalhe para expedição sem preço
      expect(textoZap).toContain('- 10x Banho [Mônica]')
      expect(textoZap).toContain('- 10x Rosto [Cebolinha]')
      expect(textoZap).toContain('- 10x Bordado Nome Alice')
    })

    it('personalizado aceita texto e imagem na composição sem alertar preço', () => {
      const itemPersonalizado = {
        modelo_nome: 'Kit Toalha Casamento',
        quantidade: 2,
        composicao: [
          {
            id: 'c1',
            tipo: 'personalizado' as const,
            descricao: 'Brasão Dourado',
            imagem_anexo: 'foto_brasao.png',
            quantidade: 2,
          },
        ],
      }
      expect(itemPersonalizado.composicao[0].imagem_anexo).toBe('foto_brasao.png')
      expect(itemPersonalizado.composicao[0].descricao).toBe('Brasão Dourado')
    })

    describe('Regra (B) - Desconto Percentual Individual por Linha de Canal do Item', () => {
      it('orçamento sem desconto = valores atuais (regressão zero)', () => {
        const canais = [
          { id: 'c1', nome: 'Shopee' },
          { id: 'c2', nome: 'Mercado Livre' },
        ]
        const itemSemDesconto = {
          modelo_nome: 'BLeve Toalha',
          quantidade: 10,
          precos_canais: {
            c1: { canal_id: 'c1', canal_nome: 'Shopee', preco_unitario: 20, preco_cheio: 200 },
            c2: {
              canal_id: 'c2',
              canal_nome: 'Mercado Livre',
              preco_unitario: 25,
              preco_cheio: 250,
            },
          },
        }

        const totais = calcularTotaisPorCanal(canais, [itemSemDesconto as any])
        expect(totais.c1.total_itens).toBe(200)
        expect(totais.c1.total_geral).toBe(200)
        expect(totais.c2.total_itens).toBe(250)
        expect(totais.c2.total_geral).toBe(250)

        const descCalc = calcularDescontoIndividualItem({
          precoUnitario: 20,
          quantidade: 10,
          precoCheioBase: 200,
          descontoPct: 0,
          precoAprovadoReferencia: 20,
        })
        expect(descCalc.descontoPct).toBe(0)
        expect(descCalc.valorDescontoTotal).toBe(0)
        expect(descCalc.precoFinalTotal).toBe(200)
        expect(descCalc.precoFinalUnitario).toBe(20)
        expect(descCalc.alertaMargem).toBe(false)
      })

      it('desconto individual em um canal NÃO afeta as outras linhas/canais nem outros itens', () => {
        const canais = [
          { id: 'shopee', nome: 'Shopee' },
          { id: 'site', nome: 'Site' },
        ]
        const item1 = {
          id: 'it1',
          modelo_nome: 'Toalha Banho',
          quantidade: 2,
          precos_canais: {
            shopee: {
              canal_id: 'shopee',
              canal_nome: 'Shopee',
              preco_unitario: 50,
              preco_cheio: 100,
              desconto_pct: 10, // 10% de desconto nesta linha
              valor_desconto: 10,
              preco_final: 90,
            },
            site: {
              canal_id: 'site',
              canal_nome: 'Site',
              preco_unitario: 50,
              preco_cheio: 100,
              // Site NÃO tem desconto
            },
          },
        }
        const item2 = {
          id: 'it2',
          modelo_nome: 'Toalha Rosto',
          quantidade: 1,
          precos_canais: {
            shopee: {
              canal_id: 'shopee',
              canal_nome: 'Shopee',
              preco_unitario: 30,
              preco_cheio: 30,
              // Item 2 na Shopee NÃO tem desconto
            },
            site: {
              canal_id: 'site',
              canal_nome: 'Site',
              preco_unitario: 30,
              preco_cheio: 30,
            },
          },
        }

        const totais = calcularTotaisPorCanal(canais, [item1 as any, item2 as any])

        // Shopee: item1 (90 com desconto) + item2 (30 sem desconto) = 120
        expect(totais.shopee.total_itens).toBe(120)
        expect(totais.shopee.total_geral).toBe(120)

        // Site: item1 (100 sem desconto) + item2 (30 sem desconto) = 130
        expect(totais.site.total_itens).toBe(130)
        expect(totais.site.total_geral).toBe(130)
      })

      it('calcula desconto % sobre o preço do canal, exibe valor R$ do desconto e preço final', () => {
        // Ex: preço unitário R$ 40,00 x 5 un = R$ 200,00 base. Desconto de 15%
        const res = calcularDescontoIndividualItem({
          precoUnitario: 40,
          quantidade: 5,
          precoCheioBase: 200,
          descontoPct: 15,
          precoAprovadoReferencia: 38,
        })

        expect(res.descontoPct).toBe(15)
        expect(res.valorDescontoTotal).toBe(30) // 15% de 200 = 30
        expect(res.precoFinalTotal).toBe(170) // 200 - 30 = 170
        expect(res.precoFinalUnitario).toBe(34) // 170 / 5 = 34
        // Como precoFinalUnitario (34) < precoAprovadoReferencia (38), alertaMargem = true
        expect(res.alertaMargem).toBe(true)
      })

      it('alerta visual de margem fica false se o preço final continuar >= ao preço aprovado', () => {
        const res = calcularDescontoIndividualItem({
          precoUnitario: 50,
          quantidade: 2,
          precoCheioBase: 100,
          descontoPct: 5, // 5% de 100 = 5
          precoAprovadoReferencia: 45, // unitário final = 47.50 >= 45
        })

        expect(res.descontoPct).toBe(5)
        expect(res.valorDescontoTotal).toBe(5)
        expect(res.precoFinalTotal).toBe(95)
        expect(res.precoFinalUnitario).toBe(47.5)
        expect(res.alertaMargem).toBe(false)
      })
    })

    describe('Regra (C) - Todas as modalidades aprovadas aparecem sem duplicação', () => {
      it('agruparCenariosAprovadosPorProdutoEModalidade lista todas as modalidades do produto+canal (ex: BLeve Shopee Half, MEI, S/N)', () => {
        // Simulação dos registros reais do PocketBase para produto BLeve no canal Shopee
        const cenariosDb = [
          {
            id: 'prec_half',
            canal: 'shopee_id',
            produto: 'bleve_id',
            preco_aprovado: 28.5,
            status: 'aprovada',
            aprovado_em: '2025-02-01 10:00:00',
            expand: {
              produto: { id: 'bleve_id', nome: 'BLeve Toalha', sku: 'BLEVE-01' },
              modalidade: { id: 'mod_half', nome: 'Half' },
            },
          },
          {
            id: 'prec_mei',
            canal: 'shopee_id',
            produto: 'bleve_id',
            preco_aprovado: 32.0,
            status: 'aprovada',
            aprovado_em: '2025-02-02 11:00:00',
            expand: {
              produto: { id: 'bleve_id', nome: 'BLeve Toalha', sku: 'BLEVE-01' },
              modalidade: { id: 'mod_mei', nome: 'MEI' },
            },
          },
          {
            id: 'prec_sn',
            canal: 'shopee_id',
            produto: 'bleve_id',
            preco_aprovado: 35.0,
            status: 'aprovada',
            aprovado_em: '2025-02-03 12:00:00',
            expand: {
              produto: { id: 'bleve_id', nome: 'BLeve Toalha', sku: 'BLEVE-01' },
              modalidade: { id: 'mod_sn', nome: 'S/N' },
            },
          },
        ]

        const resultado =
          orcamentosService.agruparCenariosAprovadosPorProdutoEModalidade(cenariosDb)

        expect(resultado.length).toBe(3)
        const modalidades = resultado.map((r) => r.modalidade_nome)
        expect(modalidades).toContain('Half')
        expect(modalidades).toContain('MEI')
        expect(modalidades).toContain('S/N')

        const precHalf = resultado.find((r) => r.modalidade_nome === 'Half')
        expect(precHalf?.preco_aprovado).toBe(28.5)
        expect(precHalf?.modalidade_id).toBe('mod_half')

        const precMei = resultado.find((r) => r.modalidade_nome === 'MEI')
        expect(precMei?.preco_aprovado).toBe(32.0)
        expect(precMei?.modalidade_id).toBe('mod_mei')

        const precSn = resultado.find((r) => r.modalidade_nome === 'S/N')
        expect(precSn?.preco_aprovado).toBe(35.0)
        expect(precSn?.modalidade_id).toBe('mod_sn')
      })

      it('modalidades duplicadas nunca aparecem na lista; status aprovada tem prioridade sobre desatualizada', () => {
        const cenariosComDuplicatas = [
          // Cenário antigo desatualizado para modalidade MEI
          {
            id: 'prec_mei_antiga',
            canal: 'shopee_id',
            produto: 'bleve_id',
            preco_aprovado: 29.0,
            status: 'desatualizada',
            aprovado_em: '2025-01-01 10:00:00',
            expand: {
              produto: { id: 'bleve_id', nome: 'BLeve Toalha', sku: 'BLEVE-01' },
              modalidade: { id: 'mod_mei', nome: 'MEI' },
            },
          },
          // Cenário recente aprovado para mesma modalidade MEI
          {
            id: 'prec_mei_nova',
            canal: 'shopee_id',
            produto: 'bleve_id',
            preco_aprovado: 32.0,
            status: 'aprovada',
            aprovado_em: '2025-02-15 10:00:00',
            expand: {
              produto: { id: 'bleve_id', nome: 'BLeve Toalha', sku: 'BLEVE-01' },
              modalidade: { id: 'mod_mei', nome: 'MEI' },
            },
          },
        ]

        const resultado =
          orcamentosService.agruparCenariosAprovadosPorProdutoEModalidade(cenariosComDuplicatas)

        // Não pode haver 2 MEI para o mesmo produto
        expect(resultado.length).toBe(1)
        expect(resultado[0].precificacao_id).toBe('prec_mei_nova')
        expect(resultado[0].preco_aprovado).toBe(32.0)
        expect(resultado[0].status_precificacao).toBe('aprovada')
        expect(resultado[0].desatualizada).toBe(false)
      })
    })

    describe('Regra (A) - Imagens do tema e modelo no PDF e link do cliente', () => {
      it('PDF renderiza destaque do tema/modelo e imagens nas seções dos itens', () => {
        const orcamentoMock = {
          id: 'orc123',
          codigo: 'ORC-2025-001',
          cliente_nome: 'Empresa Teste',
          data_orcamento: '2025-05-10',
          status: 'aprovado' as const,
          tema_nome: 'Tema Safari',
          expand: {
            tema: {
              id: 'tema_1',
              nome: 'Tema Safari',
              foto: 'safari_header.jpg',
            },
            canais_comparados: [{ id: 'c1', nome: 'Shopee' }],
            itens: [
              {
                id: 'it1',
                orcamento: 'orc123',
                modelo_nome: 'Kit Safari 30 un',
                quantidade: 30,
                foto_url: 'https://img.usecurling.com/p/200/200?q=safari',
                composicao: [
                  {
                    id: 'c1',
                    tipo: 'cadastrado' as const,
                    modelo_nome: 'Toalhinha Leão',
                    tema_nome: 'Safari',
                    quantidade: 15,
                    foto_url: 'https://img.usecurling.com/p/200/200?q=lion',
                  },
                  {
                    id: 'c2',
                    tipo: 'cadastrado' as const,
                    modelo_nome: 'Toalhinha Girafa',
                    tema_nome: 'Safari',
                    quantidade: 15,
                    foto_url: 'https://img.usecurling.com/p/200/200?q=giraffe',
                  },
                ],
                precos_canais: {
                  c1: {
                    canal_id: 'c1',
                    canal_nome: 'Shopee',
                    preco_unitario: 10,
                    preco_cheio: 300,
                  },
                },
                fretes_canais: {},
              },
            ],
          },
          totais_por_canal: {
            c1: {
              canal_id: 'c1',
              canal_nome: 'Shopee',
              total_itens: 300,
              total_fretes: 0,
              total_geral: 300,
            },
          },
        }

        const html = gerarHTMLParaImpressaoPDF(orcamentoMock as any)

        // Primeira imagem em destaque no cabeçalho do PDF
        expect(html).toContain('Destaque Tema/Modelo')
        expect(html).toContain('safari_header.jpg')
        expect(html).toContain('Tema Selecionado: Tema Safari')

        // Imagens do item e da composição junto à seção do item
        expect(html).toContain('https://img.usecurling.com/p/200/200?q=safari')
        expect(html).toContain('https://img.usecurling.com/p/200/200?q=lion')
        expect(html).toContain('https://img.usecurling.com/p/200/200?q=giraffe')
      })

      it('PDF renderiza destaque do primeiro item quando o orçamento não tem tema_expandido', () => {
        const orcamentoMock = {
          id: 'orc999',
          codigo: 'ORC-2025-999',
          cliente_nome: 'Cliente Direto',
          data_orcamento: '2025-05-10',
          status: 'aprovado' as const,
          titulo: 'Cotação Direta Toalhas',
          expand: {
            canais_comparados: [{ id: 'c1', nome: 'Site' }],
            itens: [
              {
                id: 'it1',
                orcamento: 'orc999',
                modelo_nome: 'Toalha Especial',
                quantidade: 10,
                foto_url: 'https://img.usecurling.com/p/200/200?q=towel',
                precos_canais: {
                  c1: { canal_id: 'c1', preco_unitario: 20, preco_cheio: 200 },
                },
                fretes_canais: {},
              },
            ],
          },
        }

        const html = gerarHTMLParaImpressaoPDF(orcamentoMock as any)
        expect(html).toContain('Destaque Tema/Modelo')
        expect(html).toContain('https://img.usecurling.com/p/200/200?q=towel')
      })

      it('orçamento sem desconto produz valores exatamente iguais aos atuais (regressão zero)', () => {
        const canais = [{ id: 'shopee', nome: 'Shopee' }]
        const itemSemDesconto = {
          id: 'it1',
          modelo_nome: 'Toalha Normal',
          quantidade: 5,
          precos_canais: {
            shopee: {
              canal_id: 'shopee',
              preco_unitario: 24.9,
              preco_cheio: 124.5,
              // sem desconto_pct
            },
          },
          fretes_canais: {
            shopee: {
              canal_id: 'shopee',
              valor_frete: 15,
              modo_frete: 'pago_pelo_cliente',
            },
          },
        }

        const totais = calcularTotaisPorCanal(canais, [itemSemDesconto as any])
        expect(totais.shopee.total_itens).toBe(124.5)
        expect(totais.shopee.total_fretes).toBe(15)
        expect(totais.shopee.total_geral).toBe(139.5)
      })
    })

    describe('Novas Regras de Frete discriminado & Valor Final Total (Protocolo acordado)', () => {
      it('calcula o valor final total de um item somando produtos + frete pago pelo cliente', () => {
        const itemCalc = calcularTotalItemComFreteCanal({
          canalId: 'site',
          quantidade: 10,
          precoObj: {
            canal_id: 'site',
            canal_nome: 'Site',
            preco_unitario: 25,
            preco_cheio: 250,
            preco_final: 225, // com 10% desconto
            desconto_pct: 10,
          },
          freteObj: {
            canal_id: 'site',
            canal_nome: 'Site',
            valor_frete: 30,
            modo_frete: 'pago_pelo_cliente',
          },
        })

        expect(itemCalc.subtotalProdutos).toBe(225)
        expect(itemCalc.valorFreteCliente).toBe(30)
        expect(itemCalc.totalCliente).toBe(255) // 225 + 30
      })

      it('não soma o frete ao total do cliente quando for frete_gratis', () => {
        const itemCalc = calcularTotalItemComFreteCanal({
          canalId: 'site',
          quantidade: 10,
          precoObj: {
            canal_id: 'site',
            canal_nome: 'Site',
            preco_unitario: 25,
            preco_cheio: 250,
            preco_final: 250,
          },
          freteObj: {
            canal_id: 'site',
            canal_nome: 'Site',
            valor_frete: 30,
            modo_frete: 'frete_gratis',
          },
        })

        expect(itemCalc.subtotalProdutos).toBe(250)
        expect(itemCalc.valorFreteCliente).toBe(0)
        expect(itemCalc.totalCliente).toBe(250)
      })

      it('calcula a soma dos produtos de um canal com múltiplos itens', () => {
        const itens = [
          {
            quantidade: 2,
            precos_canais: {
              canal_a: {
                canal_id: 'canal_a',
                canal_nome: 'Canal A',
                preco_unitario: 50,
                preco_final: 100,
              },
            },
          },
          {
            quantidade: 3,
            precos_canais: {
              canal_a: {
                canal_id: 'canal_a',
                canal_nome: 'Canal A',
                preco_unitario: 20,
                preco_final: 60,
              },
            },
          },
        ]
        const subtotal = calcularSubtotalProdutosCanal('canal_a', itens)
        expect(subtotal).toBe(160)
      })

      it('calcula opções ilimitadas de frete com total automático individual (produtos + frete)', () => {
        const valorProdutos = 622.5
        const opcoesFrete: OrcamentoFreteOpcao[] = [
          { transportadora: 'Correios Sedex', prazo: '2 dias', valor: 30 },
          { transportadora: 'Correios PAC', prazo: '5 dias', valor: 20 },
          { transportadora: 'J&L', prazo: '4 dias', valor: 25 },
        ]

        const resultados = calcularOpcoesFreteComTotais(valorProdutos, opcoesFrete)
        expect(resultados).toHaveLength(3)
        expect(resultados[0].totalComFrete).toBe(652.5) // 622.50 + 30
        expect(resultados[1].totalComFrete).toBe(642.5) // 622.50 + 20
        expect(resultados[2].totalComFrete).toBe(647.5) // 622.50 + 25

        const linha0 = formatarLinhaOpcaoFrete(opcoesFrete[0], valorProdutos)
        expect(linha0).toContain('Frete Correios Sedex — 2 dias')
        expect(linha0).toContain('Total')
        expect(linha0).toContain('652,50')
      })

      it('regressão zero: orçamento sem frete mantém total exatamente igual à soma dos produtos', () => {
        const valorProdutos = 500
        const resultadosVazios = calcularOpcoesFreteComTotais(valorProdutos, [])
        expect(resultadosVazios).toHaveLength(0)

        const canais = [{ id: 'site', nome: 'Site' }]
        const itemSemFrete = {
          id: 'it1',
          quantidade: 10,
          precos_canais: {
            site: { canal_id: 'site', preco_unitario: 50, preco_cheio: 500 },
          },
          fretes_canais: {},
        }
        const totais = calcularTotaisPorCanal(canais, [itemSemFrete as any])
        expect(totais.site.total_itens).toBe(500)
        expect(totais.site.total_fretes).toBe(0)
        expect(totais.site.total_geral).toBe(500)
      })

      it('frete não interfere no desconto/margem do canal', () => {
        const desconto = calcularDescontoIndividualItem({
          precoCheioBase: 200,
          precoUnitario: 20,
          quantidade: 10,
          descontoPct: 15,
        })
        expect(desconto.valorDescontoTotal).toBe(30)
        expect(desconto.precoFinalTotal).toBe(170)

        // Adicionar frete não altera preco_final nem valor_desconto
        const itemCalc = calcularTotalItemComFreteCanal({
          canalId: 'shopee',
          quantidade: 10,
          precoObj: {
            canal_id: 'shopee',
            canal_nome: 'Shopee',
            preco_unitario: 20,
            preco_cheio: 200,
            preco_final: desconto.precoFinalTotal,
            valor_desconto: desconto.valorDescontoTotal,
            desconto_pct: 15,
          },
          freteObj: {
            canal_id: 'shopee',
            canal_nome: 'Shopee',
            valor_frete: 45,
            modo_frete: 'pago_pelo_cliente',
          },
        })
        expect(itemCalc.subtotalProdutos).toBe(170)
        expect(itemCalc.valorFreteCliente).toBe(45)
        expect(itemCalc.totalCliente).toBe(215)
      })

      it('normalizarOrcamentoRecord deserializa fretes JSON em lista de objetos de frete', () => {
        const raw = {
          id: 'orc_test',
          codigo: 'ORC-001',
          fretes: [
            { transportadora: 'Correios Sedex', prazo: '2 dias', valor: '30.00' },
            { transportadora: 'J&L', prazo: '4 dias', valor: 25 },
          ],
        }
        const normalizado = normalizarOrcamentoRecord(raw)
        expect(normalizado.fretes).toHaveLength(2)
        expect(normalizado.fretes![0].transportadora).toBe('Correios Sedex')
        expect(normalizado.fretes![0].prazo).toBe('2 dias')
        expect(normalizado.fretes![0].valor).toBe(30)
        expect(normalizado.fretes![1].valor).toBe(25)
      })

      it('PDF renderiza a seção de Opções de Frete quando houver fretes cadastrados', () => {
        const orcamentoMock = {
          id: 'orc_frete',
          codigo: 'ORC-2025-FRETE',
          cliente_nome: 'Cliente Frete',
          data_orcamento: '2025-05-10',
          fretes: [
            { transportadora: 'Correios Sedex', prazo: '2 dias', valor: 30 },
            { transportadora: 'Correios PAC', prazo: '5 dias', valor: 20 },
            { transportadora: 'J&L', prazo: '4 dias', valor: 25 },
          ],
          expand: {
            canais_comparados: [{ id: 'site', nome: 'Site' }],
            itens: [
              {
                id: 'it1',
                modelo_nome: 'Produto A',
                quantidade: 1,
                precos_canais: {
                  site: { canal_id: 'site', preco_unitario: 100, preco_cheio: 100 },
                },
              },
            ],
          },
          totais_por_canal: {
            site: {
              canal_id: 'site',
              canal_nome: 'Site',
              total_itens: 100,
              total_fretes: 0,
              total_geral: 100,
            },
          },
        }

        const html = gerarHTMLParaImpressaoPDF(orcamentoMock as any)
        expect(html).toContain('Opções de Frete & Entrega (Escolha do Cliente)')
        expect(html).toContain('Frete Correios Sedex (2 dias)')
        expect(html).toContain('Frete Correios PAC (5 dias)')
        expect(html).toContain('Frete J&amp;L (4 dias)')
        expect(html).toContain('R$&nbsp;130,00') // 100 + 30
        expect(html).toContain('R$&nbsp;120,00') // 100 + 20
        expect(html).toContain('R$&nbsp;125,00') // 100 + 25
      })
    })
  })
})
