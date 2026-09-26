import { describe, it, expect } from 'vitest'
import {
  calcularCustoBaseProduto,
  calcularDemonstrativo,
  formatarResumoCondicao,
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

  it('(5b) taxa com faixa de preço mudando de patamar (Shopee < R$ 80 taxa X%, ≥ R$ 80 taxa Y%)', () => {
    const produto = {
      sku: 'SKU-SHOPEE-COND',
      nome: 'Produto Shopee Patamar',
      tipo: 'revenda' as const,
      custo_aquisicao_unitario: 30.0,
    }

    const taxaAbaixo80 = {
      id: 'shopee_abaixo_80',
      nome: 'Comissão Shopee (< R$ 80)',
      base_calculo: 'preco_anunciado' as const,
      tipo_valor: 'percentual' as const,
      valor: 20.0,
      condicao: { faixa_preco_max: 79.99 },
      responsavel: 'marketplace' as const,
      tipo_regra: 'comissao' as const,
      financiado_por: 'marketplace' as const,
    }

    const taxaAcima80 = {
      id: 'shopee_acima_80',
      nome: 'Comissão Shopee (≥ R$ 80)',
      base_calculo: 'preco_anunciado' as const,
      tipo_valor: 'percentual' as const,
      valor: 16.0,
      condicao: { faixa_preco_min: 80.0 },
      responsavel: 'marketplace' as const,
      tipo_regra: 'comissao' as const,
      financiado_por: 'marketplace' as const,
    }

    const taxasShopee = [taxaAbaixo80, taxaAcima80]

    // Cenário 1: Preço anunciado R$ 60,00 -> entra taxa de 20%, taxa de 16% fica desativada
    const dem60 = calcularDemonstrativo({
      produto,
      preco_anunciado: 60.0,
      taxas: taxasShopee,
    })
    const lAbaixo = dem60.linhas_taxas.find((t) => t.taxa_id === 'shopee_abaixo_80')
    const lAcima = dem60.linhas_taxas.find((t) => t.taxa_id === 'shopee_acima_80')
    expect(lAbaixo?.aplicada).toBe(true)
    expect(lAbaixo?.valor_calculado).toBe(12.0) // 20% de 60
    expect(lAcima?.aplicada).toBe(false)

    // Cenário 2: Preço anunciado R$ 100,00 -> entra taxa de 16%, taxa de 20% fica desativada
    const dem100 = calcularDemonstrativo({
      produto,
      preco_anunciado: 100.0,
      taxas: taxasShopee,
    })
    const lAbaixo100 = dem100.linhas_taxas.find((t) => t.taxa_id === 'shopee_abaixo_80')
    const lAcima100 = dem100.linhas_taxas.find((t) => t.taxa_id === 'shopee_acima_80')
    expect(lAbaixo100?.aplicada).toBe(false)
    expect(lAcima100?.aplicada).toBe(true)
    expect(lAcima100?.valor_calculado).toBe(16.0) // 16% de 100

    // Cenário 3: No cálculo reverso com bisseção, o patamar é reavaliado a cada iteração
    // Se o custo é R$ 30, o ponto de equilíbrio cairá abaixo de R$ 80 (usando a alíquota de 20%)
    const solEq = resolverPrecoParaMeta(
      {
        produto,
        preco_anunciado: 50.0,
        taxas: taxasShopee,
      },
      'equilibrio',
      0,
    )
    expect(solEq.convergiu).toBe(true)
    expect(solEq.preco_sugerido).toBeLessThan(80.0)
    // Preço no equilíbrio: 30 / (1 - 0.20) = 37.50
    expect(solEq.preco_sugerido).toBeCloseTo(37.5, 1)

    // Se o produto tiver custo mais alto (ex: R$ 80), o equilíbrio deve cair acima de R$ 80 (usando 16%)
    const solEqAlto = resolverPrecoParaMeta(
      {
        produto: { ...produto, custo_aquisicao_unitario: 80.0 },
        preco_anunciado: 120.0,
        taxas: taxasShopee,
      },
      'equilibrio',
      0,
    )
    expect(solEqAlto.convergiu).toBe(true)
    expect(solEqAlto.preco_sugerido).toBeGreaterThanOrEqual(80.0)
    // 80 / (1 - 0.16) = 95.24
    expect(solEqAlto.preco_sugerido).toBeCloseTo(95.24, 1)
  })

  it('(5c) taxa por peso e volume estilo SHEIN (patamar acima de 5 kg)', () => {
    const produtoLeve = {
      sku: 'SKU-LEVE',
      nome: 'Produto Leve 2kg',
      tipo: 'revenda' as const,
      peso_g: 2000, // 2 kg
      custo_aquisicao_unitario: 50.0,
    }

    const produtoPesado = {
      sku: 'SKU-PESADO',
      nome: 'Produto Pesado 7kg',
      tipo: 'revenda' as const,
      peso_g: 7000, // 7 kg
      dimensao_comprimento_cm: 30,
      dimensao_largura_cm: 20,
      dimensao_altura_cm: 25, // volume: 15.000 cm³
      custo_aquisicao_unitario: 50.0,
    }

    const taxaFreteAte5kg = {
      id: 'shein_frete_ate_5kg',
      nome: 'Taxa Logística SHEIN (até 5kg)',
      base_calculo: 'prestacao_fixa' as const,
      tipo_valor: 'fixo' as const,
      valor: 8.0,
      condicao: { peso_max_kg: 5.0 },
      responsavel: 'marketplace' as const,
      tipo_regra: 'frete' as const,
      financiado_por: 'marketplace' as const,
    }

    const taxaFreteAcima5kg = {
      id: 'shein_frete_acima_5kg',
      nome: 'Taxa Logística SHEIN (> 5kg)',
      base_calculo: 'prestacao_fixa' as const,
      tipo_valor: 'fixo' as const,
      valor: 22.0,
      condicao: { peso_min_kg: 5.001 },
      responsavel: 'marketplace' as const,
      tipo_regra: 'frete' as const,
      financiado_por: 'marketplace' as const,
    }

    const taxasShein = [taxaFreteAte5kg, taxaFreteAcima5kg]

    // Produto leve 2kg: aplica até 5kg
    const demLeve = calcularDemonstrativo({
      produto: produtoLeve,
      preco_anunciado: 100.0,
      taxas: taxasShein,
    })
    expect(demLeve.linhas_taxas.find((t) => t.taxa_id === 'shein_frete_ate_5kg')?.aplicada).toBe(
      true,
    )
    expect(demLeve.linhas_taxas.find((t) => t.taxa_id === 'shein_frete_acima_5kg')?.aplicada).toBe(
      false,
    )
    expect(demLeve.total_taxas_retidas_canal).toBe(8.0)

    // Produto pesado 7kg: aplica acima 5kg
    const demPesado = calcularDemonstrativo({
      produto: produtoPesado,
      preco_anunciado: 100.0,
      taxas: taxasShein,
    })
    expect(demPesado.linhas_taxas.find((t) => t.taxa_id === 'shein_frete_ate_5kg')?.aplicada).toBe(
      false,
    )
    expect(
      demPesado.linhas_taxas.find((t) => t.taxa_id === 'shein_frete_acima_5kg')?.aplicada,
    ).toBe(true)
    expect(demPesado.total_taxas_retidas_canal).toBe(22.0)
  })

  it('(5d) regra sem condição continua a aplicar sempre', () => {
    const produto = {
      sku: 'SKU-LIVRE',
      nome: 'Produto Sem Restrição',
      tipo: 'revenda' as const,
      peso_g: 1500,
      custo_aquisicao_unitario: 20.0,
    }

    const taxaPadrao = {
      id: 'taxa_livre',
      nome: 'Comissão Geral 10%',
      base_calculo: 'preco_anunciado' as const,
      tipo_valor: 'percentual' as const,
      valor: 10.0,
      responsavel: 'marketplace' as const,
      tipo_regra: 'comissao' as const,
      financiado_por: 'marketplace' as const,
    }

    const dem = calcularDemonstrativo({
      produto,
      preco_anunciado: 50.0,
      taxas: [taxaPadrao],
    })

    const l = dem.linhas_taxas.find((t) => t.taxa_id === 'taxa_livre')
    expect(l?.aplicada).toBe(true)
    expect(l?.valor_calculado).toBe(5.0)
    expect(l?.condicao_resumo).toBeUndefined()
  })

  it('(5e) formatarResumoCondicao formata legivelmente as condições combinadas', () => {
    const resumo1 = formatarResumoCondicao({
      faixa_preco_max: 80,
    })
    expect(resumo1).toBe('Preço: < R$ 80.00')

    const resumo2 = formatarResumoCondicao({
      faixa_preco_min: 80,
      peso_min_kg: 5,
    })
    expect(resumo2).toContain('Preço: ≥ R$ 80.00')
    expect(resumo2).toContain('Peso: ≥ 5kg')

    const resumo3 = formatarResumoCondicao({
      volume_min_cm3: 1000,
      volume_max_cm3: 5000,
      categoria: 'Cama e Banho',
    })
    expect(resumo3).toContain('Volume: 1000 a 5000 cm³')
    expect(resumo3).toContain('Categoria: Cama e Banho')
  })

  it('(6) calcularDemonstrativo calcula ponto_equilibrio sem estourar a pilha de recursão', () => {
    const produto = {
      sku: 'SKU-RECURSAO',
      nome: 'Produto Teste Recursão',
      tipo: 'fabricacao_propria' as const,
      composicao: [{ descricao: 'Item', qtd: 1, custo_unitario: 10.0 }],
    }

    const cenario = {
      produto,
      preco_anunciado: 25.0,
      taxas: [
        {
          id: 'comissao',
          nome: 'Comissão',
          base_calculo: 'preco_anunciado' as const,
          tipo_valor: 'percentual' as const,
          valor: 15.0,
          responsavel: 'marketplace' as const,
          tipo_regra: 'comissao' as const,
          financiado_por: 'marketplace' as const,
        },
      ],
    }

    const dem = calcularDemonstrativo(cenario)
    expect(dem.ponto_equilibrio).toBeGreaterThan(0)
    expect(Number.isFinite(dem.ponto_equilibrio)).toBe(true)

    // O ponto de equilíbrio calculado deve resultar em lucro aproximadamente 0
    const demEq = calcularDemonstrativo({
      ...cenario,
      preco_anunciado: dem.ponto_equilibrio,
    })
    expect(Math.abs(demEq.lucro_liquido)).toBeLessThanOrEqual(0.05)
  })
})
