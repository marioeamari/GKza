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
  formatarDataBR,
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
  })
})
