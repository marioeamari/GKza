import { describe, it, expect } from 'vitest'
import {
  avaliarCondicaoTaxa,
  calcularCustoBaseProduto,
  calcularDemonstrativo,
  calcularPrecoUnitarioCliente,
  calcularTotalUnidadesProduto,
  formatarResumoCondicao,
  normalizarTextoCategoria,
  resolverPrecoParaMeta,
  resolverTributosModalidade,
  round2,
  verificarCorrespondenciaCategoria,
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

  it('(1c) motor de custos de revenda unificado: aquisição + despesas_compra + embalagem + etiqueta + composição', () => {
    const custoRevendaCompleto = calcularCustoBaseProduto({
      sku: 'REV-COMPLETO',
      nome: 'Produto de Revenda com Composição',
      tipo: 'revenda',
      custo_aquisicao_unitario: 20.0,
      despesas_compra: [{ descricao: 'Frete proporcional', valor: 3.0 }],
      custo_adicional_embalagem: 1.5,
      custo_etiqueta: 0.5,
      composicao: [
        { codigo: 'C0', descricao: 'Caixa Especial Reforçada', qtd: 1, custo_unitario: 2.5 },
        { codigo: 'C1', descricao: 'Laço de Fita Cetim', qtd: 2, custo_unitario: 0.75 },
      ],
    })

    // Custo direto = Aquisição (20.00) + Composição (2.50 + 1.50 = 4.00) + Despesas (3.00) = 27.00
    // Embalagem = 1.50, Etiqueta = 0.50
    // Custo total = 27.00 + 1.50 + 0.50 = 29.00
    expect(custoRevendaCompleto.custo_direto).toBe(27.0)
    expect(custoRevendaCompleto.custo_embalagem).toBe(1.5)
    expect(custoRevendaCompleto.custo_etiqueta).toBe(0.5)
    expect(custoRevendaCompleto.custo_total).toBe(29.0)
  })

  it('(1d) caso real Rosto Folha: se composição já possui embalagem, custo_total não duplica custo_adicional_embalagem (4.30 + 0.12 + 0.05 = 4.47, nunca 4.59)', () => {
    const custoRostoFolha = calcularCustoBaseProduto({
      sku: 'R-Folha',
      nome: 'Rosto Folha',
      tipo: 'revenda',
      custo_aquisicao_unitario: 4.3,
      custo_adicional_embalagem: 0.12, // legado duplicado
      custo_etiqueta: 0,
      composicao: [
        {
          codigo: 'C0',
          descricao: 'Saco Plastico Preto 21x40',
          qtd: 1,
          custo_unitario: 0.12,
          categoria_nome: 'Embalagem',
          categoria_custo: 'insumo',
        },
        {
          codigo: 'C1',
          descricao: 'Etiqueta Envio',
          qtd: 1,
          custo_unitario: 0.05,
          categoria_nome: 'Etiqueta',
          categoria_custo: 'insumo',
        },
      ],
    })

    // Aquisição 4.30 + Composição (0.12 + 0.05 = 0.17). Embalagem legada não duplica!
    expect(custoRostoFolha.custo_direto).toBe(4.47)
    expect(custoRostoFolha.custo_embalagem).toBe(0) // Dupla contagem eliminada
    expect(custoRostoFolha.custo_total).toBe(4.47)
    expect(custoRostoFolha.custo_total).not.toBe(4.59)
    expect(custoRostoFolha.detalhes).toEqual(
      expect.arrayContaining([
        'Aquisição: R$ 4.30',
        'Composição (Saco Plastico Preto 21x40): Qtd 1 x R$ 0.12 = R$ 0.12',
        'Composição (Etiqueta Envio): Qtd 1 x R$ 0.05 = R$ 0.05',
      ]),
    )
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

  describe('Correspondência resiliente de categorias nas regras de taxas', () => {
    it('deve normalizar acentos, caixa alta e pontuações', () => {
      expect(normalizarTextoCategoria('Cama, Mesa e Banhão!')).toBe('cama mesa e banhao')
      expect(normalizarTextoCategoria('  ELETRÔNICOS / INFORMÁTICA  ')).toBe(
        'eletronicos informatica',
      )
    })

    it('deve casar categoria com termos múltiplos separados por vírgula em qualquer direção', () => {
      // Condição SHEIN: "cama, mesa e banho"
      // Produto com categoria "Banho Banhão"
      const res1 = verificarCorrespondenciaCategoria('Banho Banhão', 'cama, mesa e banho')
      expect(res1.casou).toBe(true)

      // Produto com categoria "cama, mesa e banho" vs condição "Mesa"
      const res2 = verificarCorrespondenciaCategoria('cama, mesa e banho', 'Mesa')
      expect(res2.casou).toBe(true)

      // Produto com acentuação: "Toalhas de Banho" vs condição "cama, mesa e banho"
      const res3 = verificarCorrespondenciaCategoria('Toalhas de Banho', 'cama, mesa e banho')
      expect(res3.casou).toBe(true)

      // Produto "Praia" vs "cama, mesa e banho" -> não casa
      const res4 = verificarCorrespondenciaCategoria('Praia', 'cama, mesa e banho')
      expect(res4.casou).toBe(false)
      expect(res4.motivo).toContain('Categoria do produto (Praia) diferente de cama, mesa e banho')
    })

    it('categoria vazia no produto NÃO casa com condição preenchida e traz motivo claro', () => {
      const resVazio = verificarCorrespondenciaCategoria('', 'cama, mesa e banho')
      expect(resVazio.casou).toBe(false)
      expect(resVazio.motivo).toBe(
        'Categoria do produto não definida (condição: cama, mesa e banho)',
      )

      const resUndefined = verificarCorrespondenciaCategoria(undefined, 'cama, mesa e banho')
      expect(resUndefined.casou).toBe(false)
      expect(resUndefined.motivo).toBe(
        'Categoria do produto não definida (condição: cama, mesa e banho)',
      )
    })

    it('avaliarCondicaoTaxa integra a verificação e expõe motivo na linha da taxa desconsiderada', () => {
      const prodSemCategoria = {
        sku: 'TESTE-SEM-CAT',
        nome: 'Toalha Sem Categoria',
        tipo: 'revenda' as const,
        categoria: '',
      }

      const avaliacao = avaliarCondicaoTaxa(
        { categoria: 'cama, mesa e banho' },
        50.0,
        prodSemCategoria,
      )

      expect(avaliacao.aplicavel).toBe(false)
      expect(avaliacao.motivoNaoAplicavel).toBe(
        'Categoria do produto não definida (condição: cama, mesa e banho)',
      )

      const dem = calcularDemonstrativo({
        produto: prodSemCategoria,
        preco_anunciado: 50.0,
        taxas: [
          {
            id: 'exezqec68sm6kjc',
            nome: 'Comissão SHEIN',
            base_calculo: 'preco_anunciado',
            tipo_valor: 'percentual',
            valor: 18.0,
            condicao: { categoria: 'cama, mesa e banho' },
            responsavel: 'marketplace',
            tipo_regra: 'comissao',
            financiado_por: 'marketplace',
          },
        ],
      })

      const l = dem.linhas_taxas.find((t) => t.taxa_id === 'exezqec68sm6kjc')
      expect(l?.aplicada).toBe(false)
      expect(l?.motivo_nao_aplicada).toBe(
        'Categoria do produto não definida (condição: cama, mesa e banho)',
      )
      expect(dem.total_taxas_retidas_canal).toBe(0)
    })
  })

  describe('Preço Unitário ao Cliente (calcularTotalUnidadesProduto e calcularPrecoUnitarioCliente)', () => {
    it('deve somar as quantidades dos kit_itens em kits e combos', () => {
      // Kit com múltiplos itens de toalhas
      const kitMultiplosItens = {
        tipo: 'kit' as const,
        kit_itens: [
          { nome: 'Toalha Azul', qtd_efetiva: 25 },
          { nome: 'Toalha Branca', qtd_efetiva: 15 },
        ],
      }
      expect(calcularTotalUnidadesProduto(kitMultiplosItens)).toBe(40)

      // Combo de produtos variados
      const combo = {
        tipo: 'combo' as const,
        kit_itens: [
          { nome: 'Body', qtd_efetiva: 3 },
          { nome: 'Calça', qtd_efetiva: 2 },
        ],
      }
      expect(calcularTotalUnidadesProduto(combo)).toBe(5)
    })

    it('deve usar fallback de qtd_por_kit se kit não tiver kit_itens detalhados', () => {
      const kitSemItens = {
        tipo: 'kit' as const,
        qtd_por_kit: 10,
        kit_itens: [],
      }
      expect(calcularTotalUnidadesProduto(kitSemItens)).toBe(10)
    })

    it('deve usar unidades de produto avulso se definido (ex.: qtd_por_kit cadastrada)', () => {
      const avulsoComUnidades = {
        tipo: 'revenda' as const,
        qtd_por_kit: 6,
      }
      expect(calcularTotalUnidadesProduto(avulsoComUnidades)).toBe(6)
    })

    it('deve assumir 1 se produto avulso não tiver unidades definidas ou for zero/nulo', () => {
      const avulsoSemUnidades = {
        tipo: 'fabricacao_propria' as const,
      }
      expect(calcularTotalUnidadesProduto(avulsoSemUnidades)).toBe(1)

      const avulsoZero = {
        tipo: 'revenda' as const,
        qtd_por_kit: 0,
      }
      expect(calcularTotalUnidadesProduto(avulsoZero)).toBe(1)

      expect(calcularTotalUnidadesProduto(null)).toBe(1)
      expect(calcularTotalUnidadesProduto(undefined)).toBe(1)
    })

    it('deve calcular corretamente o caso real do usuário (R$ 199,20 ÷ 10 = R$ 19,92)', () => {
      // Exemplo do usuário: produto unitário R$ 24,90, kit de 10, com 20% de desconto
      // R$ 249,00 - 20% (R$ 49,80) = R$ 199,20
      // Preço pago cliente = 199.20 ÷ 10 = 19.92
      const precoPagoCliente = 199.2
      const totalUnidades = 10
      const precoUnitario = calcularPrecoUnitarioCliente(precoPagoCliente, totalUnidades)

      expect(precoUnitario).toBe(19.92)
    })

    it('deve calcular caso da toalha de 40 unidades (R$ 796,80 ÷ 40 = R$ 19,92)', () => {
      const precoPagoCliente = 796.8
      const totalUnidades = 40
      const precoUnitario = calcularPrecoUnitarioCliente(precoPagoCliente, totalUnidades)

      expect(precoUnitario).toBe(19.92)
    })

    it('deve proteger contra divisão por zero e unidades inválidas', () => {
      expect(calcularPrecoUnitarioCliente(199.2, 0)).toBe(199.2)
      expect(calcularPrecoUnitarioCliente(199.2, -5)).toBe(199.2)
      expect(calcularPrecoUnitarioCliente(0, 10)).toBe(0)
    })

    it('integração: calcularDemonstrativo com descontos e cálculo do unitário cliente', () => {
      const dem = calcularDemonstrativo({
        produto: {
          sku: 'KIT-10-TOALHA',
          nome: 'Kit 10 Toalhas',
          tipo: 'kit',
          kit_itens: [{ nome: 'Toalha', qtd_efetiva: 10, custo_unitario: 10 }],
        },
        preco_anunciado: 249.0,
        descontos: [
          {
            nome: 'Desconto Cliente 20%',
            tipo: 'percentual',
            valor: 20,
            financiado_por: 'vendedor',
          },
        ],
        taxas: [],
      })

      // preco_anunciado = 249.00
      // total_descontos = 49.80
      // preco_pago_cliente = 199.20
      expect(dem.preco_pago_cliente).toBe(199.2)

      const unidades = calcularTotalUnidadesProduto({
        tipo: 'kit',
        kit_itens: [{ qtd_efetiva: 10 }],
      })
      expect(unidades).toBe(10)

      const precoUnit = calcularPrecoUnitarioCliente(dem.preco_pago_cliente, unidades)
      expect(precoUnit).toBe(19.92)
    })
  })

  describe('Tributação por Modalidade do Canal', () => {
    it('modalidade MEI calcula com as alíquotas da própria modalidade (DAS 0% + ICMS 0% + rateio fixo)', () => {
      const modalidadeMei = {
        id: 'mod_mei',
        nome: 'MEI',
        tributos_config: {
          habilitado: true,
          regime_tributario: 'mei' as const,
          aliquota_das_pct: 0,
          aliquota_icms_pct: 0,
          das_imposto_total_mes: 76.5,
          pedidos_estimados_mes: 3000,
        },
      }
      const canal = { id: 'c_shopee', nome: 'Shopee' }

      const resolvido = resolverTributosModalidade({
        modalidade: modalidadeMei,
        canal,
      })

      expect(resolvido.usandoFallbackGlobal).toBe(false)
      expect(resolvido.fonteDescricao).toBe('MEI — Shopee')
      expect(resolvido.tributos.aliquota_das_pct).toBe(0)
      expect(resolvido.tributos.aliquota_icms_pct).toBe(0)

      const dem = calcularDemonstrativo({
        preco_anunciado: 24.9,
        produto: {
          sku: 'SKU-MEI',
          nome: 'Produto MEI',
          tipo: 'revenda' as const,
          custo_aquisicao_unitario: 10,
        },
        taxas: [],
        tributos: resolvido.tributos,
      })

      expect(dem.imposto_das).toBe(0)
      expect(dem.imposto_icms).toBe(0)
      expect(dem.rateio_fixo_imposto_mes).toBe(0.03) // 76.5 / 3000 = 0.0255 -> 0.03
      expect(dem.total_tributos).toBe(0.03)
      expect(dem.fonte_tributos).toBe('MEI — Shopee')
      expect(dem.usando_global_fallback).toBe(false)
    })

    it('modalidade Full / Simples Nacional calcula com alíquotas próprias (DAS 6.95% + ICMS 2.23%)', () => {
      const modalidadeSimples = {
        id: 'mod_full',
        nome: 'Full',
        tributos_config: {
          habilitado: true,
          regime_tributario: 'simples_nacional' as const,
          aliquota_das_pct: 6.95,
          aliquota_icms_pct: 2.23,
          das_imposto_total_mes: 0,
          pedidos_estimados_mes: 1000,
        },
      }
      const canal = { id: 'c_ml', nome: 'Mercado Livre' }

      const resolvido = resolverTributosModalidade({
        modalidade: modalidadeSimples,
        canal,
      })

      expect(resolvido.usandoFallbackGlobal).toBe(false)
      expect(resolvido.fonteDescricao).toBe('Simples Nacional — Mercado Livre')
      expect(resolvido.tributos.aliquota_das_pct).toBe(6.95)
      expect(resolvido.tributos.aliquota_icms_pct).toBe(2.23)

      const dem = calcularDemonstrativo({
        preco_anunciado: 24.9,
        produto: {
          sku: 'SKU-FULL',
          nome: 'Produto Full',
          tipo: 'revenda' as const,
          custo_aquisicao_unitario: 10,
        },
        taxas: [],
        tributos: resolvido.tributos,
      })

      expect(dem.imposto_das).toBe(1.73) // 24.90 * 6.95% = 1.73055
      expect(dem.imposto_icms).toBe(0.56) // 24.90 * 2.23% = 0.55527
      expect(dem.total_tributos).toBe(2.29) // 1.73055 + 0.55527 = 2.28582 -> 2.29
      expect(dem.fonte_tributos).toBe('Simples Nacional — Mercado Livre')
      expect(dem.usando_global_fallback).toBe(false)
    })

    it('alternar modalidade recalcula tributos, custo e margem líquida de forma independente', () => {
      const canal = { id: 'c_shopee', nome: 'Shopee' }
      const modMei = {
        id: 'mod_mei',
        nome: 'MEI',
        tributos_config: {
          habilitado: true,
          regime_tributario: 'mei' as const,
          aliquota_das_pct: 0,
          aliquota_icms_pct: 0,
          das_imposto_total_mes: 76.5,
          pedidos_estimados_mes: 3000,
        },
      }
      const modSimples = {
        id: 'mod_simples',
        nome: 'Simples Nacional',
        tributos_config: {
          habilitado: true,
          regime_tributario: 'simples_nacional' as const,
          aliquota_das_pct: 6.95,
          aliquota_icms_pct: 2.23,
          das_imposto_total_mes: 0,
        },
      }

      const tributosMei = resolverTributosModalidade({ modalidade: modMei, canal }).tributos
      const tributosSimples = resolverTributosModalidade({ modalidade: modSimples, canal }).tributos

      const demMei = calcularDemonstrativo({
        preco_anunciado: 100,
        produto: { sku: 'P1', nome: 'P1', tipo: 'revenda' as const, custo_aquisicao_unitario: 50 },
        taxas: [],
        tributos: tributosMei,
      })

      const demSimples = calcularDemonstrativo({
        preco_anunciado: 100,
        produto: { sku: 'P1', nome: 'P1', tipo: 'revenda' as const, custo_aquisicao_unitario: 50 },
        taxas: [],
        tributos: tributosSimples,
      })

      // No MEI: tributos = rateio R$ 0.03
      expect(demMei.total_tributos).toBe(0.03)
      // No Simples: 6.95 + 2.23 = 9.18
      expect(demSimples.total_tributos).toBe(9.18)

      // Margem no MEI deve ser consideravelmente maior devido à isenção percentual
      expect(demMei.lucro_liquido).toBeGreaterThan(demSimples.lucro_liquido)
      expect(demMei.margem_liquida_pct).toBeGreaterThan(demSimples.margem_liquida_pct)
    })

    it('modalidade sem configuração zera tributos (sem fallback global nem perfil)', () => {
      const modalidadeSemConfig = {
        id: 'mod_antiga',
        nome: 'Sem Config',
        tributos_config: null,
      }
      const canal = { id: 'c_site', nome: 'Site' }

      // Mesmo passando globalFallback fictício, a nova regra ignora e retorna tributo 0
      const resolvido = resolverTributosModalidade({
        modalidade: modalidadeSemConfig,
        canal,
        globalFallback: {
          aliquotaDas: 6.95,
          aliquotaIcms: 2.23,
          fonteNome: 'Global',
        },
      })

      expect(resolvido.usandoFallbackGlobal).toBe(false)
      expect(resolvido.fonteDescricao).toBe('Sem tributos cadastrados')
      expect(resolvido.tributos.aliquota_das_pct).toBe(0)
      expect(resolvido.tributos.aliquota_icms_pct).toBe(0)
      expect(resolvido.tributos.das_imposto_total_mes).toBe(0)
      expect(resolvido.tributos.pedidos_estimados_mes).toBe(0)
      expect(resolvido.tributos.usando_global_fallback).toBe(false)

      const dem = calcularDemonstrativo({
        preco_anunciado: 50,
        produto: {
          sku: 'P_SEM_TRIB',
          nome: 'Produto',
          tipo: 'revenda' as const,
          custo_aquisicao_unitario: 20,
        },
        taxas: [],
        tributos: resolvido.tributos,
      })

      expect(dem.total_tributos).toBe(0)
      expect(dem.imposto_das).toBe(0)
      expect(dem.imposto_icms).toBe(0)
      expect(dem.rateio_fixo_imposto_mes).toBe(0)
      expect(dem.lucro_liquido).toBe(30) // 50 - 20 (sem imposto, margem pura)
      expect(dem.margem_liquida_pct).toBe(60) // 30 / 50 = 60%
      expect(dem.fonte_tributos).toBe('Sem tributos cadastrados')
      expect(dem.usando_global_fallback).toBe(false)
    })

    it('régua da modalidade é a única fonte e modalidade com tributos_config desabilitado zera tributos', () => {
      const modDesabilitada = {
        id: 'mod_desab',
        nome: 'Desabilitada',
        tributos_config: {
          habilitado: false,
          aliquota_das_pct: 10,
          aliquota_icms_pct: 5,
        },
      }
      const canal = { id: 'c_mercado', nome: 'Mercado' }

      const resolvido = resolverTributosModalidade({
        modalidade: modDesabilitada,
        canal,
      })

      expect(resolvido.tributos.aliquota_das_pct).toBe(0)
      expect(resolvido.tributos.aliquota_icms_pct).toBe(0)
      expect(resolvido.fonteDescricao).toBe('Sem tributos cadastrados')
      expect(resolvido.usandoFallbackGlobal).toBe(false)
    })
  })

  describe('Regras de % de Perda (perda_pct linha vs global)', () => {
    // Caso 1: Linha com perda 10% em qtd 1 e custo 10 → subtotal 11,00
    it('Caso 1: Linha com perda 10% em qtd 1 e custo 10 -> subtotal 11,00', () => {
      const produto = {
        sku: 'P_PERDA_LINHA',
        nome: 'Produto Composto Linha Perda',
        tipo: 'fabricacao_propria' as const,
        composicao: [
          {
            id: 'c1',
            codigo: 'C1',
            descricao: 'Insumo 1',
            qtd: 1,
            custo_unitario: 10,
            unidade: 'un',
            categoria_custo: 'insumo' as const,
            perda_pct: 10,
          },
        ],
      }
      const res = calcularCustoBaseProduto(produto)
      expect(res.custo_direto).toBeCloseTo(11.0, 2)
    })

    // Caso 2: Produto com perda global 10% sem perda por linha → custo direto total × 1,10
    it('Caso 2: Produto com perda global 10% sem perda por linha -> custo direto total x 1,10', () => {
      const produto = {
        sku: 'P_PERDA_GLOBAL',
        nome: 'Produto Composto Global Perda',
        tipo: 'fabricacao_propria' as const,
        perda_pct: 10,
        composicao: [
          {
            id: 'c1',
            codigo: 'C1',
            descricao: 'Insumo 1',
            qtd: 1,
            custo_unitario: 10,
            unidade: 'un',
            categoria_custo: 'insumo' as const,
            perda_pct: 0,
          },
        ],
      }
      const res = calcularCustoBaseProduto(produto)
      expect(res.custo_direto).toBeCloseTo(11.0, 2)
    })

    // Caso 3: Perda da linha vence a global (linha 10% + global 15% → só o 1,10, nunca 1,10×1,15)
    it('Caso 3: Perda da linha vence a global (linha 10% + global 15% -> so o 1,10, nunca 1,10x1,15)', () => {
      const produto = {
        sku: 'P_PRECEDENCIA',
        nome: 'Produto Precedencia',
        tipo: 'fabricacao_propria' as const,
        perda_pct: 15,
        composicao: [
          {
            id: 'c1',
            codigo: 'C1',
            descricao: 'Insumo 1',
            qtd: 1,
            custo_unitario: 10,
            unidade: 'un',
            categoria_custo: 'insumo' as const,
            perda_pct: 10,
          },
        ],
      }
      const res = calcularCustoBaseProduto(produto)
      // Deve ser 10 * (1 + 0.10) = 11.00
      // NUNCA 11.00 * 1.15 = 12.65
      expect(res.custo_direto).toBeCloseTo(11.0, 2)
      expect(res.custo_direto).not.toBeCloseTo(12.65, 2)
    })

    // Caso 5: Sem perda informada → custo idêntico ao atual (regressão zero)
    it('Caso 5: Sem perda informada -> custo identico ao original (regressao zero)', () => {
      const produto = {
        sku: 'P_SEM_PERDA',
        nome: 'Produto Sem Perda',
        tipo: 'fabricacao_propria' as const,
        composicao: [
          {
            id: 'c1',
            codigo: 'C1',
            descricao: 'Insumo 1',
            qtd: 2,
            custo_unitario: 15,
            unidade: 'un',
            categoria_custo: 'insumo' as const,
          },
          {
            id: 'c2',
            codigo: 'C2',
            descricao: 'Insumo 2',
            qtd: 1,
            custo_unitario: 5,
            unidade: 'un',
            categoria_custo: 'insumo' as const,
          },
        ],
      }
      const res = calcularCustoBaseProduto(produto)
      expect(res.custo_direto).toBe(35) // 2*15 + 1*5 = 35
    })

    // Caso 6: Kit com perda no item principal (5 un com perda 20% = 6 un efetivas)
    it('Caso 6: Kit com perda no item principal (5 un com perda 20% -> 6 un efetivas)', () => {
      const kit = {
        sku: 'KIT-5-PANOS',
        nome: 'Kit 5 Panos',
        tipo: 'kit' as const,
        kit_itens: [
          {
            produto_id: 'prod_pano',
            nome: 'Pano Microfibra',
            qtd_efetiva: 5,
            perda_pct: 20, // 5 * 1.20 = 6 un efetivas
            custo_unitario: 10,
          },
        ],
      }
      const res = calcularCustoBaseProduto(kit)
      expect(res.custo_direto).toBe(60) // 6 * 10 = 60
    })

    // Caso 7: Kit com perda global 10% sem perda por linha
    it('Caso 7: Kit com perda global 10% sem perda por linha -> custo direto x 1,10', () => {
      const kit = {
        sku: 'KIT-2-TOALHAS',
        nome: 'Kit 2 Toalhas',
        tipo: 'kit' as const,
        perda_pct: 10,
        kit_itens: [
          {
            produto_id: 'prod_toalha',
            nome: 'Toalha',
            qtd_efetiva: 2,
            custo_unitario: 25, // 50
          },
        ],
      }
      const res = calcularCustoBaseProduto(kit)
      expect(res.custo_direto).toBe(55) // 50 * 1.10 = 55
    })

    // Caso 8: Kit com perda na linha vence a perda global
    it('Caso 8: Kit com perda na linha anula a perda global', () => {
      const kit = {
        sku: 'KIT-5-PANOS-GLOBAL',
        nome: 'Kit 5 Panos Global',
        tipo: 'kit' as const,
        perda_pct: 15, // global deve ser anulada
        kit_itens: [
          {
            produto_id: 'prod_pano',
            nome: 'Pano Microfibra',
            qtd_efetiva: 5,
            perda_pct: 20, // 6 un a 10 = 60
            custo_unitario: 10,
          },
        ],
      }
      const res = calcularCustoBaseProduto(kit)
      expect(res.custo_direto).toBe(60) // Sem cascata com 15%
    })
  })
})
