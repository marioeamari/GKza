import { describe, it, expect } from 'vitest'
import {
  calcularCustoBaseProduto,
  calcularDemonstrativo,
  resolverPrecoParaMeta,
  round2,
} from './calculo'

describe('Motor de Cálculo de Precificação - ERP GKza', () => {
  it('(1) deve calcular custo de fabricação própria com perda', () => {
    const custo = calcularCustoBaseProduto({
      sku: 'TESTE-FAB',
      nome: 'Toalhas Banho Infantil',
      tipo: 'fabricacao_propria',
      composicao: [{ codigo: 'C0', descricao: 'Toalha de Banho', qtd: 1, custo_unitario: 10.0 }],
      custo_adicional_embalagem: 0.1,
      custo_etiqueta: 0.05,
      perda_pct: 10,
    })

    // C0 = 10,00 * 1.10 = 11,00 + 0,10 + 0,05 = 11,15
    expect(custo.custo_total).toBe(11.15)
  })

  it('(1b) deve calcular custo de produto de revenda com despesas de compra', () => {
    const custo = calcularCustoBaseProduto({
      sku: 'TESTE-REV',
      nome: 'Produto Revenda',
      tipo: 'revenda',
      custo_aquisicao_unitario: 15.0,
      despesas_compra: [
        { descricao: 'Frete de entrada', valor: 2.5 },
        { descricao: 'Seguro', valor: 0.5 },
      ],
      custo_adicional_embalagem: 0.5,
    })

    // 15 + 2.5 + 0.5 + 0.5 = 18.50
    expect(custo.custo_total).toBe(18.5)
  })

  it('(2) deve calcular kit com múltiplos itens agregados', () => {
    const custo = calcularCustoBaseProduto({
      sku: 'KIT-3UN',
      nome: 'Kit 3 Toalhas',
      tipo: 'kit',
      kit_itens: [{ nome: 'Toalha Azul', qtd_efetiva: 3, custo_unitario: 10.0 }],
      kit_custos_adicionais: [{ descricao: 'Fita e Laço', valor: 1.2 }],
      custo_adicional_embalagem: 0.8,
    })

    // 3 * 10 = 30 + 1.2 + 0.8 = 32.00
    expect(custo.custo_total).toBe(32.0)
  })

  it('(3) mesmo preço anunciado em canais diferentes deve produzir lucros diferentes', () => {
    const produto = {
      sku: 'BLeve?',
      nome: 'Toalhas(leve) Banho Infantil',
      tipo: 'fabricacao_propria' as const,
      composicao: [{ codigo: 'C0', descricao: 'Toalha', qtd: 1, custo_unitario: 10.0 }],
      custo_adicional_embalagem: 0.1,
      custo_etiqueta: 0.05,
      perda_pct: 10,
    }

    // Canal 1: Shopee (18% + 2% + R$ 4,00)
    const demShopee = calcularDemonstrativo({
      produto,
      preco_anunciado: 24.9,
      taxas: [
        {
          id: '1',
          nome: 'Comissão Shopee',
          base_calculo: 'preco_anunciado',
          tipo_valor: 'percentual',
          valor: 18.0,
          responsavel: 'marketplace',
          tipo_regra: 'comissao',
          financiado_por: 'marketplace',
        },
        {
          id: '2',
          nome: 'Taxa Transação',
          base_calculo: 'preco_anunciado',
          tipo_valor: 'percentual',
          valor: 2.0,
          responsavel: 'marketplace',
          tipo_regra: 'transacao',
          financiado_por: 'marketplace',
        },
        {
          id: '3',
          nome: 'Taxa Fixa',
          base_calculo: 'prestacao_fixa',
          tipo_valor: 'fixo',
          valor: 4.0,
          responsavel: 'marketplace',
          tipo_regra: 'tarifa_fixa',
          financiado_por: 'marketplace',
        },
      ],
      tributos: {
        aliquota_das_pct: 6.95,
        aliquota_icms_pct: 2.23,
      },
    })

    // Canal 2: Site Próprio Pix (1%)
    const demSite = calcularDemonstrativo({
      produto,
      preco_anunciado: 24.9,
      taxas: [
        {
          id: '4',
          nome: 'Taxa Gateway Pix',
          base_calculo: 'preco_pago_cliente',
          tipo_valor: 'percentual',
          valor: 1.0,
          responsavel: 'marketplace',
          tipo_regra: 'pagamento',
          financiado_por: 'marketplace',
        },
      ],
      tributos: {
        aliquota_das_pct: 6.95,
        aliquota_icms_pct: 2.23,
      },
    })

    expect(demSite.lucro_liquido).toBeGreaterThan(demShopee.lucro_liquido)
    expect(demSite.valor_receber_canal).toBeGreaterThan(demShopee.valor_receber_canal)
  })

  it('(4) meta de lucro igual deve convergir para preços calculados específicos por canal', () => {
    const produto = {
      sku: 'SKU-META',
      nome: 'Produto Meta',
      tipo: 'fabricacao_propria' as const,
      composicao: [{ descricao: 'Item', qtd: 1, custo_unitario: 10.0 }],
    }

    const cenarioShopee = {
      produto,
      preco_anunciado: 20.0,
      taxas: [
        {
          id: '1',
          nome: 'Comissão',
          base_calculo: 'preco_anunciado' as const,
          tipo_valor: 'percentual' as const,
          valor: 20.0,
          responsavel: 'marketplace' as const,
          tipo_regra: 'comissao' as const,
          financiado_por: 'marketplace' as const,
        },
      ],
    }

    const cenarioSite = {
      produto,
      preco_anunciado: 20.0,
      taxas: [
        {
          id: '2',
          nome: 'Taxa Pix',
          base_calculo: 'preco_pago_cliente' as const,
          tipo_valor: 'percentual' as const,
          valor: 2.0,
          responsavel: 'marketplace' as const,
          tipo_regra: 'pagamento' as const,
          financiado_por: 'marketplace' as const,
        },
      ],
    }

    const solShopee = resolverPrecoParaMeta(cenarioShopee, 'lucro_reais', 10.0)
    const solSite = resolverPrecoParaMeta(cenarioSite, 'lucro_reais', 10.0)

    expect(solShopee.convergiu).toBe(true)
    expect(solSite.convergiu).toBe(true)

    // O canal com mais taxas precisa de um preço maior para dar o mesmo lucro de R$ 10
    expect(solShopee.preco_sugerido).toBeGreaterThan(solSite.preco_sugerido)
    expect(round2(solShopee.demonstrativo.lucro_liquido)).toBeCloseTo(10.0, 1)
    expect(round2(solSite.demonstrativo.lucro_liquido)).toBeCloseTo(10.0, 1)
  })

  it('(5) taxa fixa com condição de faixa de preço (ex: Mercado Livre < R$ 79)', () => {
    const produto = {
      sku: 'SKU-FAIXA',
      nome: 'Produto Faixa',
      tipo: 'fabricacao_propria' as const,
      composicao: [{ descricao: 'Item', qtd: 1, custo_unitario: 5.0 }],
    }

    const taxaFaixa = {
      id: 'ml_fixa',
      nome: 'Taxa Fixa < R$ 79',
      base_calculo: 'faixa_preco' as const,
      tipo_valor: 'fixo' as const,
      valor: 6.0,
      condicao: { faixa_preco_max: 79 },
      responsavel: 'marketplace' as const,
      tipo_regra: 'tarifa_fixa' as const,
      financiado_por: 'marketplace' as const,
    }

    // Preço 50 (aplica taxa de R$ 6,00)
    const demMenor79 = calcularDemonstrativo({
      produto,
      preco_anunciado: 50.0,
      taxas: [taxaFaixa],
    })
    const linhaMenor = demMenor79.linhas_taxas.find((t) => t.taxa_id === 'ml_fixa')
    expect(linhaMenor?.aplicada).toBe(true)
    expect(linhaMenor?.valor_calculado).toBe(6.0)

    // Preço 89 (NÃO aplica taxa de R$ 6,00 pois ultrapassou R$ 79)
    const demMaior79 = calcularDemonstrativo({
      produto,
      preco_anunciado: 89.0,
      taxas: [taxaFaixa],
    })
    const linhaMaior = demMaior79.linhas_taxas.find((t) => t.taxa_id === 'ml_fixa')
    expect(linhaMaior?.aplicada).toBe(false)
  })
})
