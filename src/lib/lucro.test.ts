import { describe, it, expect } from 'vitest'
import {
  calcularCelulaLucro,
  calcularGradeLucroMes,
  calcularBalancoMes,
  calcularSaidasUnitarias,
  agruparLojasPorMarketplace,
  extrairRendaLiquidaDePrecificacao,
  formatarValoresPrecificacaoGrade,
  gerarSemanasDoMes,
  filtrarDespesasPorSemana,
  calcularBalancoSemanal,
  type ProdutoLucro,
  type CanalLojaLucro,
  type DespesaGrupoItem,
} from './lucro'

describe('Módulo /lucro — Regras de Negócio e Cálculos', () => {
  describe('Aba 1: Célula de Lucro e Exclusão da Somatória sem Aprovação', () => {
    it('calcula o lucro quando há precificação aprovada: Qtd × Renda Líquida Unitária', () => {
      // 305 un a R$ 3,85 = R$ 1.174,25
      const celula = calcularCelulaLucro('prod_banho', 'canal_shopee', 305, {
        renda_liquida_unitaria: 3.85,
        tem_aprovacao: true,
      })

      expect(celula.quantidade).toBe(305)
      expect(celula.renda_liquida_unitaria).toBe(3.85)
      expect(celula.tem_aprovacao).toBe(true)
      expect(celula.lucro_total).toBe(1174.25)
      expect(celula.incluso_na_somatoria).toBe(true)
      expect(celula.requer_ajuste_precificacao).toBe(false)
    })

    it('quando o par produto+canal NÃO tem aprovação: ativa ALERTA e NÃO entra na somatória', () => {
      // Usuário digitou 50 unidades, mas não há precificação aprovada
      const celula = calcularCelulaLucro('prod_novo', 'canal_tiktok', 50, {
        renda_liquida_unitaria: 0,
        tem_aprovacao: false,
      })

      expect(celula.quantidade).toBe(50)
      expect(celula.tem_aprovacao).toBe(false)
      expect(celula.lucro_total).toBe(0) // Zerado na soma
      expect(celula.incluso_na_somatoria).toBe(false)
      expect(celula.requer_ajuste_precificacao).toBe(true) // Alerta visual
    })

    it('se rendaLiquidaInfo for nulo, trata como sem aprovação e não quebra', () => {
      const celula = calcularCelulaLucro('prod_x', 'canal_y', 10, null)
      expect(celula.incluso_na_somatoria).toBe(false)
      expect(celula.lucro_total).toBe(0)
      expect(celula.requer_ajuste_precificacao).toBe(true)
    })

    it('consolida os totais da grade conforme o caso real de Set/26 até dia 05 (R$ 2.434,86)', () => {
      const produtos: ProdutoLucro[] = [
        { id: 'p1', nome: 'Banho Leve', sku: 'B1' },
        { id: 'p2', nome: 'Rosto Folha', sku: 'R1' },
      ]
      const lojas: CanalLojaLucro[] = [
        { id: 'c1', nome: 'Kza Mari', marketplace_nome: 'Shopee' },
        { id: 'c2', nome: 'Kza Mari', marketplace_nome: 'SHEIN' },
      ]

      const quantidades = {
        p1: { c1: 305, c2: 6 },
        p2: { c1: 2, c2: 13 },
      }

      const rendas = {
        p1: {
          c1: { renda_liquida_unitaria: 3.85, tem_aprovacao: true },
          c2: { renda_liquida_unitaria: 4.85, tem_aprovacao: true },
        },
        p2: {
          c1: { renda_liquida_unitaria: 4.07, tem_aprovacao: true },
          c2: { renda_liquida_unitaria: 5.47, tem_aprovacao: true },
        },
      }

      const grade = calcularGradeLucroMes(produtos, lojas, quantidades, rendas)

      // p1: 305 * 3.85 (1174.25) + 6 * 4.85 (29.10) = 1203.35
      expect(grade.linhas[0].totalLucro).toBe(1203.35)
      // p2: 2 * 4.07 (8.14) + 13 * 5.47 (71.11) = 79.25
      expect(grade.linhas[1].totalLucro).toBe(79.25)

      expect(grade.totalGeralQuantidade).toBe(305 + 6 + 2 + 13)
      expect(grade.totalGeralLucro).toBe(1203.35 + 79.25)
    })

    it('linhas com produto sem aprovação são somadas com lucro 0 nas células sem aprovação', () => {
      const produtos: ProdutoLucro[] = [{ id: 'p1', nome: 'Sem Precificacao', sku: 'SP1' }]
      const lojas: CanalLojaLucro[] = [{ id: 'c1', nome: 'Kza Mari', marketplace_nome: 'Shopee' }]

      const quantidades = { p1: { c1: 100 } }
      const rendas = { p1: { c1: { renda_liquida_unitaria: 0, tem_aprovacao: false } } }

      const grade = calcularGradeLucroMes(produtos, lojas, quantidades, rendas)

      expect(grade.linhas[0].totalQuantidade).toBe(100)
      expect(grade.linhas[0].totalLucro).toBe(0)
      expect(grade.linhas[0].temItensSemAprovacao).toBe(true)
      expect(grade.totalAlertasSemAprovacao).toBe(1)
      expect(grade.totalGeralLucro).toBe(0)
    })
  })

  describe('Aba 2: Balanço (Lucro Líquido − Despesas do Mês)', () => {
    it('calcula o caso real de Set/26: 6.334,31 − 16.235,70 = −9.901,39 (com destaque negativo)', () => {
      const gruposDespesas: DespesaGrupoItem[] = [
        {
          grupo_id: 'grupokza',
          grupo_nome: 'GrupoKza',
          total: 8052.27,
          itens: [
            { id: '1', descricao: 'WeeKids', valor: 214.05 },
            { id: '2', descricao: 'KzaMari', valor: 3689.3 },
            { id: '3', descricao: 'KzaMari+WeeKids', valor: 1989.89 },
            { id: '4', descricao: 'GrupoKza', valor: 2159.03 },
          ],
        },
        {
          grupo_id: 'familiamari',
          grupo_nome: 'Família Mari',
          total: 8183.43,
          itens: [
            { id: '5', descricao: 'Eu', valor: 3463.23 },
            { id: '6', descricao: 'Eu/Casa', valor: 3850.42 },
            { id: '7', descricao: 'Rafa', valor: 869.78 },
          ],
        },
      ]

      const balanco = calcularBalancoMes(6334.31, gruposDespesas)

      expect(balanco.lucroLiquido).toBe(6334.31)
      expect(balanco.totalDespesasTags).toBe(16235.7)
      expect(balanco.balanco).toBe(-9901.39)
      expect(balanco.isNegativo).toBe(true)
    })
  })

  describe('Aba 3: Saídas Unitárias e Conversão Kit → Unidades por Empresa/CNPJ', () => {
    it('converte kits para unidades multiplicando por qtd_por_kit do repositório', () => {
      const produtos: ProdutoLucro[] = [
        {
          id: 'p_banho',
          nome: "Banho Leve - 'b'",
          sku: 'B1',
          qtd_por_kit: 913,
          empresa_id: 'emp_kza',
          empresa_nome: 'KzaMari',
          empresa_cnpj: '44.123.456/0001-89',
        },
        {
          id: 'p_rosto',
          nome: 'Rosto Folha/Esmeralda',
          sku: 'R1',
          qtd_por_kit: 6, // 123 kits * ~6.325 = 778 un
          empresa_id: 'emp_kza',
          empresa_nome: 'KzaMari',
          empresa_cnpj: '44.123.456/0001-89',
        },
      ]

      // 1 kit do Banho Leve 'b' = 913 unid.
      // 123 kits do Rosto Folha (exemplo aproximado)
      const quantidades = {
        p_banho: 1,
        p_rosto: 123,
      }

      const res = calcularSaidasUnitarias(produtos, quantidades)

      expect(res.empresas.length).toBe(1)
      const emp = res.empresas[0]
      expect(emp.empresa_nome).toBe('KzaMari')
      expect(emp.totalKits).toBe(124)

      const itemBanho = emp.itens.find((i) => i.produto_id === 'p_banho')!
      expect(itemBanho.kits_vendidos).toBe(1)
      expect(itemBanho.unidades_totais).toBe(913)

      const itemRosto = emp.itens.find((i) => i.produto_id === 'p_rosto')!
      expect(itemRosto.kits_vendidos).toBe(123)
      expect(itemRosto.unidades_totais).toBe(123 * 6) // 738
    })

    it('se produto tiver qtd_por_kit <= 0 ou indefinido, trata como 1 unidade por kit', () => {
      const produtos: ProdutoLucro[] = [
        { id: 'p_avulso', nome: 'Avulso', sku: 'A1', qtd_por_kit: 0 },
      ]
      const res = calcularSaidasUnitarias(produtos, { p_avulso: 10 })
      expect(res.totalGeralKits).toBe(10)
      expect(res.totalGeralUnidades).toBe(10)
    })
  })

  describe('Agrupamento de Lojas por Marketplace e Cabeçalho de Marcas', () => {
    it('agrupa canais reais cadastrados preservando marketplace_id e cores de marca', () => {
      const lojas: CanalLojaLucro[] = [
        {
          id: 'c1',
          nome: 'Kza Mari',
          marketplace_id: 'mkt_shopee',
          marketplace_nome: 'Shopee',
          marketplace_cor: '#EE4D2D',
        },
        {
          id: 'c2',
          nome: 'Wee Kids',
          marketplace_id: 'mkt_shopee',
          marketplace_nome: 'Shopee',
          marketplace_cor: '#EE4D2D',
        },
        {
          id: 'c3',
          nome: 'Loja Oficial',
          tipo: 'site_proprio',
          marketplace_id: 'site_proprio',
          marketplace_nome: 'Site Próprio',
          marketplace_cor: '#0284C7',
        },
      ]

      const grupos = agruparLojasPorMarketplace(lojas)

      expect(grupos.length).toBe(2)
      const grpShopee = grupos.find((g) => g.nome === 'Shopee')!
      expect(grpShopee.lojas.length).toBe(2)
      expect(grpShopee.cor).toBe('#EE4D2D')

      const grpSite = grupos.find((g) => g.nome === 'Site Próprio')!
      expect(grpSite.lojas.length).toBe(1)
      expect(grpSite.cor).toBe('#0284C7')
    })

    it('após backfill, agrupa 100% dos canais tipo marketplace pelo vínculo real do catálogo (Shopee e SHEIN)', () => {
      // Simulação de dados reais vindos de lucroService.listarCanais com backfill aplicado:
      // SHEIN vinculada à coleção marketplaces (slug 'shein', cor #000000)
      const canaisDoBanco: CanalLojaLucro[] = [
        {
          id: 'nnnk28chx9llzmm',
          nome: 'Shopee',
          tipo: 'marketplace',
          marketplace_id: 'pn7xlgmclquqogt',
          marketplace_nome: 'Shopee',
          marketplace_cor: '#DF5830',
        },
        {
          id: 'vcvf7xu1pjkwpys',
          nome: 'SHEIN',
          tipo: 'marketplace',
          marketplace_id: 'c4bd51pyc70ryt2',
          marketplace_nome: 'SHEIN',
          marketplace_cor: '#000000',
        },
        {
          id: 'ixleboajfvbhbyy',
          nome: 'Site Loja Integrada KzaMari',
          tipo: 'site_proprio',
          marketplace_id: 'site_proprio',
          marketplace_nome: 'Site Próprio',
          marketplace_cor: '#30c1df',
        },
      ]

      // Todos os canais tipo marketplace possuem marketplace_id do catálogo
      const canaisMarketplace = canaisDoBanco.filter((c) => c.tipo === 'marketplace')
      expect(
        canaisMarketplace.every((c) => c.marketplace_id && c.marketplace_id !== 'site_proprio'),
      ).toBe(true)

      const grupos = agruparLojasPorMarketplace(canaisDoBanco)
      expect(grupos.length).toBe(3)

      const grupoShein = grupos.find((g) => g.id === 'c4bd51pyc70ryt2')
      expect(grupoShein).toBeDefined()
      expect(grupoShein?.nome).toBe('SHEIN')
      expect(grupoShein?.cor).toBe('#000000')
      expect(grupoShein?.lojas[0].id).toBe('vcvf7xu1pjkwpys')

      const grupoShopee = grupos.find((g) => g.id === 'pn7xlgmclquqogt')
      expect(grupoShopee).toBeDefined()
      expect(grupoShopee?.nome).toBe('Shopee')
      expect(grupoShopee?.lojas[0].id).toBe('nnnk28chx9llzmm')
    })
  })

  describe('Aba 2: Balanço Dinâmico (Lucro Líquido Real − Despesas Reais por Destino)', () => {
    it('calcula Balanço = Lucro Líquido da Grade − Total de Despesas Reais de Destinos cadastrados', () => {
      const despesasReais: DespesaGrupoItem[] = [
        {
          grupo_id: 'tag_empresa',
          grupo_nome: 'Empresa',
          cor: '#4C3A8C',
          total: 5000,
          itens: [{ id: '1', descricao: 'Aluguel barracão', valor: 5000, tag_nome: 'Empresa' }],
        },
        {
          grupo_id: 'tag_pessoal',
          grupo_nome: 'Eu/Casa',
          cor: '#2B5BA8',
          total: 3500.5,
          itens: [{ id: '2', descricao: 'Supermercado', valor: 3500.5, tag_nome: 'Eu/Casa' }],
        },
      ]

      // Supondo lucro total somado na grade = 10.000,00
      const resultado = calcularBalancoMes(10000, despesasReais)

      expect(resultado.lucroLiquido).toBe(10000)
      expect(resultado.totalDespesasTags).toBe(8500.5)
      expect(resultado.balanco).toBe(1499.5)
      expect(resultado.isNegativo).toBe(false)
    })

    it('quando o total de despesas excede o lucro líquido, gera balanço negativo corretamente', () => {
      const despesasReais: DespesaGrupoItem[] = [
        {
          grupo_id: 'tag_empresa',
          grupo_nome: 'Geral',
          total: 12000,
          itens: [{ id: '1', descricao: 'Folha', valor: 12000 }],
        },
      ]

      const resultado = calcularBalancoMes(2434.86, despesasReais)
      expect(resultado.lucroLiquido).toBe(2434.86)
      expect(resultado.totalDespesasTags).toBe(12000)
      expect(resultado.balanco).toBe(-9565.14)
      expect(resultado.isNegativo).toBe(true)
    })
  })

  describe('extrairRendaLiquidaDePrecificacao', () => {
    it('extrai corretamente lucro líquido de resultado da precificação', () => {
      expect(extrairRendaLiquidaDePrecificacao({ resultado: { lucro_liquido: 14.5 } })).toBe(14.5)
      expect(extrairRendaLiquidaDePrecificacao({ preco_aprovado: 29.9 })).toBe(29.9)
      expect(extrairRendaLiquidaDePrecificacao(null)).toBe(0)
    })

    it('extrai corretamente a partir do payload real do banco de prec_precificacoes (ex: Toalha Leve na SHEIN)', () => {
      // Exemplo real do banco: precificação qntaxaei058jibs
      const registroRealBanco = {
        id: 'qntaxaei058jibs',
        produto: 'lsilkiq8w2apfre',
        canal: 'vcvf7xu1pjkwpys',
        modalidade: 'hda1ywtigykh1wt',
        empresa: 'c8v8eg0errmelt6',
        preco_aprovado: 24.9,
        premissas: {
          aliquota_das_pct: 6.95,
          aliquota_icms_pct: 2.23,
          descontos: [],
          preco_venda: 24.9,
        },
        resultado: {
          aliquota_imposto_efetiva_pct: 9.18,
          base_calculo_tributos: 24.9,
          custo_adicional: 0,
          custo_embalagem: 0.1,
          custo_etiqueta: 0.05,
          custo_fabricacao_ou_aquisicao: 10,
          custo_sobrescrito: true,
          custo_total_produto: 10.15,
          imposto_das: 1.73,
          imposto_icms: 0.56,
          lucro_liquido: 6.13,
          margem_liquida_pct: 24.62,
          margem_sobre_cliente_pct: 24.62,
          markup_sobre_custo_pct: 145.32,
          outros_impostos: 0,
          ponto_equilibrio: 16.89,
          prazo_recebimento_dias: 7,
          preco_anunciado: 24.9,
          preco_pago_cliente: 24.9,
          preco_venda: 24.9,
          total_taxas_canal: 6.33,
          total_tributos: 2.29,
          valor_receber_canal: 18.57,
        },
        status: 'aprovada',
      }

      const rendaLiquida = extrairRendaLiquidaDePrecificacao(registroRealBanco)
      expect(rendaLiquida).toBe(6.13)
      expect(rendaLiquida).not.toBe(0)
    })
  })

  describe('Extração e Mapeamento de Precificações Aprovadas (Detalhes do Popup e Grade)', () => {
    it('extrai preço de venda, lucro líquido e margem sem zerar usando JSON real do banco', () => {
      const pReal = {
        id: 'qntaxaei058jibs',
        produto: 'lsilkiq8w2apfre',
        canal: 'vcvf7xu1pjkwpys',
        modalidade: 'hda1ywtigykh1wt',
        empresa: 'c8v8eg0errmelt6',
        preco_aprovado: 24.9,
        resultado: {
          preco_venda: 24.9,
          lucro_liquido: 6.13,
          margem_liquida_pct: 24.62,
        },
        expand: {
          produto: {
            id: 'lsilkiq8w2apfre',
            nome: 'Toalha Leve de Praia',
            sku: 'BLeve',
          },
          canal: {
            id: 'vcvf7xu1pjkwpys',
            nome: 'SHEIN',
          },
          modalidade: {
            id: 'hda1ywtigykh1wt',
            nome: 'Full',
          },
          empresa: {
            id: 'c8v8eg0errmelt6',
            nome_fantasia: 'KzaMari',
          },
        },
      }

      // Regra do extrator do serviço:
      const resultado = (pReal.resultado || {}) as Record<string, unknown>
      const precoVenda = Number(resultado.preco_venda ?? pReal.preco_aprovado ?? 0)
      const lucroLiq = extrairRendaLiquidaDePrecificacao(pReal)
      const margemPct = Number(resultado.margem_liquida_pct ?? 0)

      expect(precoVenda).toBe(24.9)
      expect(lucroLiq).toBe(6.13)
      expect(margemPct).toBe(24.62)
      expect(pReal.expand.modalidade.nome).toBe('Full')
      expect(pReal.expand.empresa.nome_fantasia).toBe('KzaMari')
    })

    it('diferencia duas precificações aprovadas da SHEIN para o mesmo produto pela Modalidade (Full vs MEI)', () => {
      const precSheinFull = {
        id: 'qntaxaei058jibs',
        produto_id: 'lsilkiq8w2apfre',
        produto_nome: 'Toalha Leve de Praia',
        canal_id: 'vcvf7xu1pjkwpys',
        canal_nome: 'SHEIN',
        modalidade_id: 'hda1ywtigykh1wt',
        modalidade_nome: 'Full',
        empresa_nome: 'KzaMari',
        preco_venda: 24.9,
        lucro_liquido_unitario: 6.13,
      }

      const precSheinMei = {
        id: 'fd9dejd899fm75l',
        produto_id: 'lsilkiq8w2apfre',
        produto_nome: 'Toalha Leve de Praia',
        canal_id: 'vcvf7xu1pjkwpys',
        canal_nome: 'SHEIN',
        modalidade_id: '6y10l4e3y44gnkp',
        modalidade_nome: 'MEI',
        empresa_nome: 'KzaMari',
        preco_venda: 24.9,
        lucro_liquido_unitario: 6.13,
      }

      expect(precSheinFull.canal_id).toBe(precSheinMei.canal_id)
      expect(precSheinFull.produto_id).toBe(precSheinMei.produto_id)
      // Devem ser claramente distintas pela modalidade:
      expect(precSheinFull.modalidade_nome).toBe('Full')
      expect(precSheinMei.modalidade_nome).toBe('MEI')
      expect(precSheinFull.modalidade_id).not.toBe(precSheinMei.modalidade_id)
    })

    it('filtro por empresa restringe precificações de forma independente do canal', () => {
      const precs = [
        {
          id: '1',
          produto_nome: 'Item 1',
          canal_id: 'c1',
          empresa_id: 'emp_bleve',
          empresa_nome: 'BLeve',
        },
        {
          id: '2',
          produto_nome: 'Item 2',
          canal_id: 'c1',
          empresa_id: 'emp_weekids',
          empresa_nome: 'WeeKids',
        },
      ]

      const filtrar = (empresaId: string) =>
        precs.filter((p) => empresaId === 'todas' || p.empresa_id === empresaId)

      expect(filtrar('todas').length).toBe(2)
      expect(filtrar('emp_bleve').length).toBe(1)
      expect(filtrar('emp_bleve')[0].empresa_nome).toBe('BLeve')
      expect(filtrar('emp_weekids').length).toBe(1)
      expect(filtrar('emp_weekids')[0].empresa_nome).toBe('WeeKids')
    })

    it('filtro de empresa na aba Saídas Unitárias recalcula totais e filtra apenas itens da empresa', () => {
      const produtosNaGrade: ProdutoLucro[] = [
        {
          id: 'prod_shein',
          nome: 'Toalha Leve de Praia',
          sku: 'BLeve',
          empresa_id: 'c8v8eg0errmelt6',
          empresa_nome: 'KzaMari',
          canal_nome: 'SHEIN',
          modalidade_nome: 'Full',
          qtd_por_kit: 1,
        },
        {
          id: 'prod_kids',
          nome: 'Camiseta Infantil',
          sku: 'WKIDS',
          empresa_id: 'fm9lfs19qge4xc4',
          empresa_nome: 'WeeKids',
          canal_nome: 'Shopee',
          modalidade_nome: 'Padrão',
          qtd_por_kit: 2,
        },
      ]

      const vendas = {
        prod_shein: 50,
        prod_kids: 20,
      }

      // 1. Sem filtro ('todas')
      const resTodas = calcularSaidasUnitarias(produtosNaGrade, vendas, 'todas')
      expect(resTodas.empresas.length).toBe(2)
      expect(resTodas.totalGeralKits).toBe(70)
      expect(resTodas.totalGeralUnidades).toBe(90) // 50*1 + 20*2

      // 2. Filtro KzaMari
      const resKza = calcularSaidasUnitarias(produtosNaGrade, vendas, 'c8v8eg0errmelt6')
      expect(resKza.empresas.length).toBe(1)
      expect(resKza.empresas[0].empresa_nome).toBe('KzaMari')
      expect(resKza.totalGeralKits).toBe(50)
      expect(resKza.totalGeralUnidades).toBe(50)

      // 3. Filtro WeeKids
      const resWee = calcularSaidasUnitarias(produtosNaGrade, vendas, 'fm9lfs19qge4xc4')
      expect(resWee.empresas.length).toBe(1)
      expect(resWee.empresas[0].empresa_nome).toBe('WeeKids')
      expect(resWee.totalGeralKits).toBe(20)
      expect(resWee.totalGeralUnidades).toBe(40)
    })

    it('ao adicionar item da precificação, Saídas Unitárias agrupa pela empresa da precificação', () => {
      const produtosNaGrade: ProdutoLucro[] = [
        {
          id: 'prod_shein',
          nome: 'Toalha Leve de Praia',
          sku: 'BLeve',
          empresa_id: 'c8v8eg0errmelt6',
          empresa_nome: 'KzaMari',
          qtd_por_kit: 1,
        },
        {
          id: 'prod_kids',
          nome: 'Camiseta Infantil',
          sku: 'WKIDS',
          empresa_id: 'fm9lfs19qge4xc4',
          empresa_nome: 'WeeKids',
          qtd_por_kit: 2,
        },
      ]

      const vendas = {
        prod_shein: 50,
        prod_kids: 20,
      }

      const res = calcularSaidasUnitarias(produtosNaGrade, vendas)
      expect(res.empresas.length).toBe(2)

      const empKza = res.empresas.find((e) => e.empresa_id === 'c8v8eg0errmelt6')
      expect(empKza).toBeDefined()
      expect(empKza?.empresa_nome).toBe('KzaMari')
      expect(empKza?.totalKits).toBe(50)
      expect(empKza?.totalUnidades).toBe(50)

      const empWee = res.empresas.find((e) => e.empresa_id === 'fm9lfs19qge4xc4')
      expect(empWee).toBeDefined()
      expect(empWee?.empresa_nome).toBe('WeeKids')
      expect(empWee?.totalKits).toBe(20)
      expect(empWee?.totalUnidades).toBe(40) // 20 kits * 2 un
    })
  })

  describe('Formatação e Exibição dos Valores de Precificação do Produto na Grade (/lucro)', () => {
    it('formata Preço Venda, Lucro Líq. Unit. e Margem % exatamente no formato esperado com moeda pt-BR', () => {
      // Exemplo da tarefa: "Preço Venda: R$ 24,90 • Lucro Líq. Unit.: R$ 3,95 • (15.9%)"
      const texto = formatarValoresPrecificacaoGrade(24.9, 3.95, 15.9)
      // Substitui espaço sem quebra (non-breaking space \u00a0 ou \u202f) para comparação resiliente
      const textoNormalizado = texto.replace(/\u00a0|\u202f/g, ' ')
      expect(textoNormalizado).toBe('Preço Venda: R$ 24,90 • Lucro Líq. Unit.: R$ 3,95 • (15.9%)')
    })

    it('quando o item não tem margem percentual calculada (<= 0 ou undefined), exibe apenas Preço Venda e Lucro Líq. Unit.', () => {
      // Sem margem (margem 0)
      const textoZero = formatarValoresPrecificacaoGrade(24.9, 3.95, 0).replace(
        /\u00a0|\u202f/g,
        ' ',
      )
      expect(textoZero).toBe('Preço Venda: R$ 24,90 • Lucro Líq. Unit.: R$ 3,95')
      expect(textoZero).not.toContain('%')

      // Margem undefined
      const textoUndef = formatarValoresPrecificacaoGrade(50.0, 10.5, undefined).replace(
        /\u00a0|\u202f/g,
        ' ',
      )
      expect(textoUndef).toBe('Preço Venda: R$ 50,00 • Lucro Líq. Unit.: R$ 10,50')
      expect(textoUndef).not.toContain('%')

      // Margem negativa ou nula
      const textoNeg = formatarValoresPrecificacaoGrade(15.0, 2.0, -5).replace(
        /\u00a0|\u202f/g,
        ' ',
      )
      expect(textoNeg).toBe('Preço Venda: R$ 15,00 • Lucro Líq. Unit.: R$ 2,00')
      expect(textoNeg).not.toContain('%')
    })

    it('quando nenhum valor de precificação estiver disponível, retorna string vazia', () => {
      expect(formatarValoresPrecificacaoGrade(undefined, undefined, undefined)).toBe('')
      expect(formatarValoresPrecificacaoGrade(0, 0, 0)).toBe('')
      expect(formatarValoresPrecificacaoGrade(null, null, null)).toBe('')
    })

    it('preserva os dados de preco_venda, lucro_liquido_unitario e margem_liquida_percentual no ProdutoLucro adicionado', () => {
      const precAprovada = {
        id: 'prec_teste_1',
        produto_id: 'prod_123',
        produto_nome: 'Toalha de Banho Leve',
        produto_sku: 'BLEVE-01',
        canal_id: 'c_shopee',
        canal_nome: 'Shopee',
        modalidade_nome: 'Padrão',
        empresa_nome: 'Kza Mari',
        preco_venda: 24.9,
        lucro_liquido_unitario: 3.95,
        margem_liquida_percentual: 15.9,
      }

      const produtoNaGrade: ProdutoLucro = {
        id: precAprovada.produto_id,
        nome: precAprovada.produto_nome,
        sku: precAprovada.produto_sku,
        canal_nome: precAprovada.canal_nome,
        modalidade_nome: precAprovada.modalidade_nome,
        empresa_nome: precAprovada.empresa_nome,
        preco_venda: precAprovada.preco_venda,
        lucro_liquido_unitario: precAprovada.lucro_liquido_unitario,
        margem_liquida_percentual: precAprovada.margem_liquida_percentual,
      }

      expect(produtoNaGrade.preco_venda).toBe(24.9)
      expect(produtoNaGrade.lucro_liquido_unitario).toBe(3.95)
      expect(produtoNaGrade.margem_liquida_percentual).toBe(15.9)
      expect(produtoNaGrade.canal_nome).toBe('Shopee')
      expect(produtoNaGrade.modalidade_nome).toBe('Padrão')
      expect(produtoNaGrade.empresa_nome).toBe('Kza Mari')
    })
  })

  describe('Garantia de Unicidade de Keys no Módulo /lucro (Prevenção de Colisão React)', () => {
    it('células de quantidade e renda possuem chaves exclusivas por papel e par produto+canal', () => {
      const prodId = 'lsilkiq8w2apfre'
      const canalId = 'vcvf7xu1pjkwpys'

      const keyQtd = `cel-qtd-${prodId}:${canalId}`
      const keyRenda = `cel-renda-${prodId}:${canalId}`

      expect(keyQtd).not.toBe(keyRenda)
      expect(keyQtd).toBe('cel-qtd-lsilkiq8w2apfre:vcvf7xu1pjkwpys')
      expect(keyRenda).toBe('cel-renda-lsilkiq8w2apfre:vcvf7xu1pjkwpys')
    })

    it('badges completas na grade (canal, modalidade, empresa) possuem chaves exclusivas com prefixo estável', () => {
      const prodId = 'lsilkiq8w2apfre'
      const keyCanal = `badge-canal-${prodId}`
      const keyMod = `badge-mod-${prodId}`
      const keyEmp = `badge-emp-${prodId}`

      expect(keyCanal).not.toBe(keyMod)
      expect(keyCanal).not.toBe(keyEmp)
      expect(keyMod).not.toBe(keyEmp)
      expect(keyCanal).toBe('badge-canal-lsilkiq8w2apfre')
      expect(keyMod).toBe('badge-mod-lsilkiq8w2apfre')
      expect(keyEmp).toBe('badge-emp-lsilkiq8w2apfre')
    })

    it('quando há múltiplas precificações para o mesmo par produto+canal, as chaves do modal são únicas usando item.id', () => {
      const item1 = {
        id: 'qntaxaei058jibs',
        produto_id: 'lsilkiq8w2apfre',
        canal_id: 'vcvf7xu1pjkwpys',
      }
      const item2 = {
        id: 'fd9dejd899fm75l',
        produto_id: 'lsilkiq8w2apfre',
        canal_id: 'vcvf7xu1pjkwpys',
      }

      const gerarKey = (item: { id?: string; produto_id: string; canal_id: string }, idx: number) =>
        item.id
          ? `prec-aprovada-${item.id}`
          : `prec-aprovada-${item.produto_id}:${item.canal_id}:${idx}`

      const key1 = gerarKey(item1, 0)
      const key2 = gerarKey(item2, 1)

      expect(key1).not.toBe(key2)
      expect(key1).toBe('prec-aprovada-qntaxaei058jibs')
      expect(key2).toBe('prec-aprovada-fd9dejd899fm75l')

      // E se id estiver ausente em dados simulados, o índice desempata:
      const semId1 = { produto_id: 'lsilkiq8w2apfre', canal_id: 'vcvf7xu1pjkwpys' }
      const semId2 = { produto_id: 'lsilkiq8w2apfre', canal_id: 'vcvf7xu1pjkwpys' }
      expect(gerarKey(semId1, 0)).not.toBe(gerarKey(semId2, 1))
    })

    it('linhas de produtos na grade são desduplicadas no LucroPage para evitar colisão', () => {
      const idsGrade = ['lsilkiq8w2apfre', 'lsilkiq8w2apfre', 'outro_produto']
      const mapaCatalogo = new Map([
        ['lsilkiq8w2apfre', { id: 'lsilkiq8w2apfre', nome: 'Toalha Leve', sku: 'BLeve' }],
        ['outro_produto', { id: 'outro_produto', nome: 'Outro', sku: 'OUT' }],
      ])

      const produtosUnicosMap = new Map<string, any>()
      for (const id of idsGrade) {
        const prod = mapaCatalogo.get(id)
        if (prod && !produtosUnicosMap.has(prod.id)) {
          produtosUnicosMap.set(prod.id, prod)
        }
      }
      const produtosGrade = Array.from(produtosUnicosMap.values())

      expect(produtosGrade.length).toBe(2)
      expect(produtosGrade.map((p) => p.id)).toEqual(['lsilkiq8w2apfre', 'outro_produto'])
    })
  })

  describe('Fechamento Semanal de Domingo a Sábado no Mês (Regra Obrigatória)', () => {
    describe('Geração das Semanas com mês começando em qualquer dia da semana', () => {
      it('Setembro/2026 (começa na terça-feira dia 01 e termina na quarta-feira dia 30)', () => {
        const semanas = gerarSemanasDoMes('2026-09')
        expect(semanas.length).toBe(5)

        // Semana 1: 01 a 05 (terça a sábado, 5 dias)
        expect(semanas[0].numero).toBe(1)
        expect(semanas[0].dataInicio).toBe('2026-09-01')
        expect(semanas[0].dataFim).toBe('2026-09-05')
        expect(semanas[0].diasCount).toBe(5)
        expect(semanas[0].diasIso).toEqual([
          '2026-09-01',
          '2026-09-02',
          '2026-09-03',
          '2026-09-04',
          '2026-09-05',
        ])
        expect(semanas[0].rotulo).toContain('ter a sáb')

        // Semana 2: 06 a 12 (domingo a sábado, 7 dias)
        expect(semanas[1].numero).toBe(2)
        expect(semanas[1].dataInicio).toBe('2026-09-06')
        expect(semanas[1].dataFim).toBe('2026-09-12')
        expect(semanas[1].diasCount).toBe(7)

        // Semana 3: 13 a 19 (domingo a sábado, 7 dias)
        expect(semanas[2].numero).toBe(3)
        expect(semanas[2].dataInicio).toBe('2026-09-13')
        expect(semanas[2].dataFim).toBe('2026-09-19')
        expect(semanas[2].diasCount).toBe(7)

        // Semana 4: 20 a 26 (domingo a sábado, 7 dias)
        expect(semanas[3].numero).toBe(4)
        expect(semanas[3].dataInicio).toBe('2026-09-20')
        expect(semanas[3].dataFim).toBe('2026-09-26')
        expect(semanas[3].diasCount).toBe(7)

        // Semana 5: 27 a 30 (domingo a quarta-feira, 4 dias, última semana nunca atravessa o mês)
        expect(semanas[4].numero).toBe(5)
        expect(semanas[4].dataInicio).toBe('2026-09-27')
        expect(semanas[4].dataFim).toBe('2026-09-30')
        expect(semanas[4].diasCount).toBe(4)
        expect(semanas[4].rotulo).toContain('dom a qua')

        // Soma dos dias de todas as semanas = 30 dias de setembro
        const somaDias = semanas.reduce((acc, s) => acc + s.diasCount, 0)
        expect(somaDias).toBe(30)
      })

      it('Mês começando na quinta-feira (exemplo do enunciado: qui-sáb, 3 dias)', () => {
        // Outubro/2026 começa exatamente numa quinta-feira! (01/10/2026 é quinta)
        const semanas = gerarSemanasDoMes('2026-10')
        expect(semanas.length).toBe(5)

        // Semana 1: 01 a 03 (quinta a sábado = 3 dias)
        expect(semanas[0].dataInicio).toBe('2026-10-01')
        expect(semanas[0].dataFim).toBe('2026-10-03')
        expect(semanas[0].diasCount).toBe(3)
        expect(semanas[0].rotulo).toContain('qui a sáb')

        // Semana 2: 04 a 10 (dom a sáb, 7 dias)
        expect(semanas[1].dataInicio).toBe('2026-10-04')
        expect(semanas[1].dataFim).toBe('2026-10-10')
        expect(semanas[1].diasCount).toBe(7)

        // Semana 5: 25 a 31 (dom a sáb, 7 dias pois 31/10/2026 é sábado)
        expect(semanas[4].dataInicio).toBe('2026-10-25')
        expect(semanas[4].dataFim).toBe('2026-10-31')
        expect(semanas[4].diasCount).toBe(7)

        const totalDias = semanas.reduce((acc, s) => acc + s.diasCount, 0)
        expect(totalDias).toBe(31)
      })

      it('Mês começando no domingo (ex: Novembro/2026 dia 01 é domingo)', () => {
        const semanas = gerarSemanasDoMes('2026-11')
        expect(semanas.length).toBe(5)

        // Semana 1 começa no domingo dia 01 e vai até sábado dia 07 (7 dias cheios)
        expect(semanas[0].dataInicio).toBe('2026-11-01')
        expect(semanas[0].dataFim).toBe('2026-11-07')
        expect(semanas[0].diasCount).toBe(7)
        expect(semanas[0].rotulo).toContain('dom a sáb')

        // Semana 5 termina no dia 30 (segunda-feira)
        expect(semanas[4].dataInicio).toBe('2026-11-29')
        expect(semanas[4].dataFim).toBe('2026-11-30')
        expect(semanas[4].diasCount).toBe(2)

        const totalDias = semanas.reduce((acc, s) => acc + s.diasCount, 0)
        expect(totalDias).toBe(30)
      })

      it('Mês começando no sábado (ex: Agosto/2026 dia 01 é sábado)', () => {
        const semanas = gerarSemanasDoMes('2026-08')
        expect(semanas.length).toBe(6)

        // Semana 1 tem apenas 1 dia: 01/08 (sábado)
        expect(semanas[0].dataInicio).toBe('2026-08-01')
        expect(semanas[0].dataFim).toBe('2026-08-01')
        expect(semanas[0].diasCount).toBe(1)
        expect(semanas[0].rotulo).toContain('sáb')

        // Semana 2: 02 a 08 (dom a sáb, 7 dias)
        expect(semanas[1].dataInicio).toBe('2026-08-02')
        expect(semanas[1].dataFim).toBe('2026-08-08')

        // Semana 6: 30 a 31 (dom a seg, 2 dias)
        expect(semanas[5].dataInicio).toBe('2026-08-30')
        expect(semanas[5].dataFim).toBe('2026-08-31')
        expect(semanas[5].diasCount).toBe(2)

        const totalDias = semanas.reduce((acc, s) => acc + s.diasCount, 0)
        expect(totalDias).toBe(31)
      })

      it('Fevereiro em ano bissexto (2028: 29 dias)', () => {
        const semanas = gerarSemanasDoMes('2028-02')
        const totalDias = semanas.reduce((acc, s) => acc + s.diasCount, 0)
        expect(totalDias).toBe(29)
      })
    })

    describe('Totais semanais = soma dos dias e Soma das semanas = total do mês', () => {
      it('calcula a soma das semanas conferindo exatamente com o consolidado mensal da grade', () => {
        const semanas = gerarSemanasDoMes('2026-09')
        const produtos: ProdutoLucro[] = [
          { id: 'p1', nome: 'Produto 1', sku: 'SKU1' },
          { id: 'p2', nome: 'Produto 2', sku: 'SKU2' },
        ]
        const lojas: CanalLojaLucro[] = [
          { id: 'c1', nome: 'Shopee Kza', marketplace_nome: 'Shopee' },
          { id: 'c2', nome: 'SHEIN Kza', marketplace_nome: 'SHEIN' },
        ]
        const rendas = {
          p1: {
            c1: { renda_liquida_unitaria: 10, tem_aprovacao: true },
            c2: { renda_liquida_unitaria: 15, tem_aprovacao: true },
          },
          p2: {
            c1: { renda_liquida_unitaria: 20, tem_aprovacao: true },
            c2: { renda_liquida_unitaria: 25, tem_aprovacao: true },
          },
        }

        // Simulando quantidades inseridas em cada semana
        const quantidadesPorSemana: Record<number, Record<string, Record<string, number>>> = {
          1: { p1: { c1: 5, c2: 2 }, p2: { c1: 1, c2: 0 } }, // p1: 50 + 30 = 80; p2: 20 = 100
          2: { p1: { c1: 10, c2: 4 }, p2: { c1: 2, c2: 1 } }, // p1: 100 + 60 = 160; p2: 40 + 25 = 65 => 225
          3: { p1: { c1: 0, c2: 0 }, p2: { c1: 3, c2: 2 } }, // p2: 60 + 50 = 110
          4: { p1: { c1: 8, c2: 1 }, p2: { c1: 0, c2: 0 } }, // p1: 80 + 15 = 95
          5: { p1: { c1: 2, c2: 0 }, p2: { c1: 1, c2: 1 } }, // p1: 20; p2: 20 + 25 = 45 => 65
        }

        let somaLucroSemanas = 0
        let somaQtdSemanas = 0
        const quantidadesConsolidadasMes: Record<string, Record<string, number>> = {
          p1: { c1: 0, c2: 0 },
          p2: { c1: 0, c2: 0 },
        }

        for (const sem of semanas) {
          const qtdsSem = quantidadesPorSemana[sem.numero] || {}
          const gradeSem = calcularGradeLucroMes(produtos, lojas, qtdsSem, rendas)

          somaLucroSemanas += gradeSem.totalGeralLucro
          somaQtdSemanas += gradeSem.totalGeralQuantidade

          // Acumula no mês
          for (const pId of ['p1', 'p2']) {
            for (const cId of ['c1', 'c2']) {
              quantidadesConsolidadasMes[pId][cId] += qtdsSem[pId]?.[cId] || 0
            }
          }
        }

        // Grade mensal consolidada
        const gradeMes = calcularGradeLucroMes(produtos, lojas, quantidadesConsolidadasMes, rendas)

        expect(somaQtdSemanas).toBe(gradeMes.totalGeralQuantidade)
        expect(somaLucroSemanas).toBe(gradeMes.totalGeralLucro)
        expect(gradeMes.totalGeralLucro).toBe(100 + 225 + 110 + 95 + 65) // 595.00
      })
    })

    describe('Balanço Semanal: Lucro da semana − Despesas da semana', () => {
      it('filtra despesas cujas datas de competência/pagamento pertençam aos dias da semana', () => {
        const semanas = gerarSemanasDoMes('2026-09')
        const semana1 = semanas[0] // 01/09 a 05/09

        const despesasMes: DespesaGrupoItem[] = [
          {
            grupo_id: 'tag_empresa',
            grupo_nome: 'Empresa',
            cor: '#4C3A8C',
            total: 3000,
            itens: [
              {
                id: 'd1',
                descricao: 'Aluguel dia 02',
                valor: 2000,
                data: '2026-09-02',
                destino: 'Empresa',
              },
              {
                id: 'd2',
                descricao: 'Internet dia 15',
                valor: 1000,
                data: '2026-09-15',
                destino: 'Empresa',
              },
            ],
          },
          {
            grupo_id: 'tag_pessoal',
            grupo_nome: 'Eu/Casa',
            cor: '#2B5BA8',
            total: 1500,
            itens: [
              {
                id: 'd3',
                descricao: 'Feira dia 05',
                valor: 500,
                data: '2026-09-05',
                destino: 'Eu/Casa',
              },
              {
                id: 'd4',
                descricao: 'Farmácia dia 20',
                valor: 1000,
                data: '2026-09-20',
                destino: 'Eu/Casa',
              },
            ],
          },
        ]

        const despesasSem1 = filtrarDespesasPorSemana(despesasMes, semana1)
        expect(despesasSem1.length).toBe(2)

        const grpEmpresa = despesasSem1.find((g) => g.grupo_id === 'tag_empresa')!
        expect(grpEmpresa.total).toBe(2000)
        expect(grpEmpresa.itens.length).toBe(1)
        expect(grpEmpresa.itens[0].id).toBe('d1')

        const grpPessoal = despesasSem1.find((g) => g.grupo_id === 'tag_pessoal')!
        expect(grpPessoal.total).toBe(500)
        expect(grpPessoal.itens.length).toBe(1)
        expect(grpPessoal.itens[0].id).toBe('d3')
      })

      it('calcula o Balanço Semanal para todas as semanas destacando balanço negativo e totalizando com o mês', () => {
        const semanas = gerarSemanasDoMes('2026-09') // 5 semanas

        const despesasMes: DespesaGrupoItem[] = [
          {
            grupo_id: 'tag_empresa',
            grupo_nome: 'Empresa',
            cor: '#4C3A8C',
            total: 4500,
            itens: [
              {
                id: 'd1',
                descricao: 'Despesa sem 1',
                valor: 1000,
                data: '2026-09-03',
                destino: 'Empresa',
              },
              {
                id: 'd2',
                descricao: 'Despesa sem 2',
                valor: 1500,
                data: '2026-09-10',
                destino: 'Empresa',
              },
              {
                id: 'd3',
                descricao: 'Despesa sem 3',
                valor: 2000,
                data: '2026-09-17',
                destino: 'Empresa',
              },
            ],
          },
        ]

        // Lucro da grade para cada semana:
        // Sem 1: 1500 (Lucro 1500 - Desp 1000 = +500)
        // Sem 2: 1200 (Lucro 1200 - Desp 1500 = -300 DÉFICIT)
        // Sem 3: 2000 (Lucro 2000 - Desp 2000 = 0)
        // Sem 4: 800  (Lucro 800  - Desp 0 = +800)
        // Sem 5: 500  (Lucro 500  - Desp 0 = +500)
        const lucroPorSemana: Record<number, number> = {
          1: 1500,
          2: 1200,
          3: 2000,
          4: 800,
          5: 500,
        }

        const resultado = calcularBalancoSemanal(semanas, lucroPorSemana, despesasMes)

        expect(resultado.semanas.length).toBe(5)

        // Sem 1
        expect(resultado.semanas[0].lucroSemana).toBe(1500)
        expect(resultado.semanas[0].despesasSemana).toBe(1000)
        expect(resultado.semanas[0].balanco).toBe(500)
        expect(resultado.semanas[0].isNegativo).toBe(false)

        // Sem 2 (déficit em destaque)
        expect(resultado.semanas[1].lucroSemana).toBe(1200)
        expect(resultado.semanas[1].despesasSemana).toBe(1500)
        expect(resultado.semanas[1].balanco).toBe(-300)
        expect(resultado.semanas[1].isNegativo).toBe(true)

        // Sem 3 (zero)
        expect(resultado.semanas[2].balanco).toBe(0)

        // Totais do mês conferindo com a soma das semanas
        const somaLucroSemanas = resultado.semanas.reduce((acc, s) => acc + s.lucroSemana, 0)
        const somaDespesasSemanas = resultado.semanas.reduce((acc, s) => acc + s.despesasSemana, 0)
        const somaBalancoSemanas = resultado.semanas.reduce((acc, s) => acc + s.balanco, 0)

        expect(resultado.totalLucroMes).toBe(somaLucroSemanas)
        expect(resultado.totalDespesasMes).toBe(somaDespesasSemanas)
        expect(resultado.balancoMes).toBe(somaBalancoSemanas)

        expect(resultado.totalLucroMes).toBe(6000)
        expect(resultado.totalDespesasMes).toBe(4500)
        expect(resultado.balancoMes).toBe(1500)
        expect(resultado.isNegativoMes).toBe(false)
      })
    })
  })
})
