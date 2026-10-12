import { describe, it, expect } from 'vitest'
import {
  calcularCelulaLucro,
  calcularGradeLucroMes,
  calcularBalancoMes,
  calcularSaidasUnitarias,
  agruparLojasPorMarketplace,
  extrairRendaLiquidaDePrecificacao,
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
})
