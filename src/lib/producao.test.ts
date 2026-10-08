import { describe, expect, it } from 'vitest'
import {
  arredondarMoeda,
  calcularCustoLinha,
  calcularFaixaSemanaProducao,
  calcularFechamentoRegistro,
  calcularFechamentoSemana,
  calcularGradeProdutosRegistro,
  calcularGradeSemanalFornecedor,
  calcularResumoSaques,
  calcularTotalDia,
  calcularTotalGrupoSaque,
  formatarCabecalhoDia,
  formatarDiaMes,
  formatarRangeDatas,
  gerarCincoDiasUteis,
  gerarDatasRange,
  getDiaSemanaAbrev,
  getDiaSemanaCompleto,
  getSegundaFeiraSemana,
  ordenarDatasIso,
} from './producao'

describe('Módulo de Produção - Registros de Pagamento de Fornecedor', () => {
  describe('Formatação de Ranges e Datas Dinâmicas', () => {
    it('deve formatar range de compra no formato amigável do print (ex.: seg 05/10 a sex 09/10)', () => {
      const formatado = formatarRangeDatas('2026-10-05', '2026-10-09')
      expect(formatado).toBe('seg 05/10 a sex 09/10')
    })

    it('deve formatar range de saques no formato amigável do print (ex.: dom 11/10 a sáb 17/10)', () => {
      const formatado = formatarRangeDatas('2026-10-11', '2026-10-17')
      expect(formatado).toBe('dom 11/10 a sáb 17/10')
    })

    it('deve obter abreviações e nomes completos de dias da semana corretamente', () => {
      // 2026-10-05 é segunda-feira
      expect(getDiaSemanaAbrev('2026-10-05')).toBe('seg')
      expect(getDiaSemanaCompleto('2026-10-05')).toBe('segunda-feira')

      // 2026-10-10 é sábado
      expect(getDiaSemanaAbrev('2026-10-10')).toBe('sáb')
      expect(getDiaSemanaCompleto('2026-10-10')).toBe('sábado')

      // 2026-10-11 é domingo
      expect(getDiaSemanaAbrev('2026-10-11')).toBe('dom')
      expect(getDiaSemanaCompleto('2026-10-11')).toBe('domingo')
    })

    it('deve ordenar e deduplicar datas ISO dinâmicas em ordem cronológica', () => {
      const datas = ['2026-10-08', '2026-10-05', '2026-10-10', '2026-10-05', '2026-10-07']
      const ordenadas = ordenarDatasIso(datas)
      expect(ordenadas).toEqual(['2026-10-05', '2026-10-07', '2026-10-08', '2026-10-10'])
    })

    it('deve gerar datas contínuas dentro de um range quando solicitado', () => {
      const datas = gerarDatasRange('2026-10-05', '2026-10-08')
      expect(datas).toEqual(['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08'])
    })
  })

  describe('calcularCustoLinha', () => {
    it('deve calcular qtde × custoUnitario com precisão', () => {
      expect(calcularCustoLinha(50, 14.2)).toBe(710.0)
      expect(calcularCustoLinha(707, 10.0)).toBe(7070.0)
      expect(calcularCustoLinha(150, 2.35)).toBe(352.5)
      expect(calcularCustoLinha(1500, 2.0)).toBe(3000.0)
    })

    it('deve retornar 0 quando quantidade for 0 ou negativa', () => {
      expect(calcularCustoLinha(0, 14.2)).toBe(0)
      expect(calcularCustoLinha(-5, 14.2)).toBe(0)
      expect(calcularCustoLinha(10, 0)).toBe(0)
    })
  })

  describe('calcularTotalDia (Bloco Diário Dinâmico)', () => {
    it('deve calcular o total diário somando as linhas de produtos', () => {
      const itens = [
        { produto_id: 'p1', quantidade: 20 },
        { produto_id: 'p2', quantidade: 149 },
        { produto_id: 'p3', quantidade: 168 },
        { produto_id: 'p4', quantidade: 30 },
        { produto_id: 'p5', quantidade: 480 },
      ]
      const custos: Record<string, number> = {
        p1: 14.2, // 20 * 14.2 = 284.00
        p2: 10.0, // 149 * 10 = 1490.00
        p3: 4.3, // 168 * 4.3 = 722.40
        p4: 2.35, // 30 * 2.35 = 70.50
        p5: 2.0, // 480 * 2.0 = 960.00
      }
      expect(calcularTotalDia(itens, custos)).toBe(3526.9)
    })
  })

  describe('calcularGradeProdutosRegistro (Grade Dinâmica)', () => {
    it('deve somar quantidades de datas variadas (incluindo sábado ou 4 dias)', () => {
      const produtos = [
        { id: 'p1', nome: 'Toalha Banhão', custo_unitario: 14.2, ordem: 1 },
        { id: 'p2', nome: 'Toalha Leve', custo_unitario: 10.0, ordem: 2 },
        { id: 'p3', nome: 'Pano Baiana', custo_unitario: 1.95, ordem: 3 },
      ]

      // Lançamentos em 3 datas reais: segunda, quarta e sábado
      const itens = [
        { data: '2026-10-05', produto_id: 'p1', quantidade: 15 },
        { data: '2026-10-07', produto_id: 'p1', quantidade: 25 },
        { data: '2026-10-10', produto_id: 'p1', quantidade: 10 }, // sábado
        { data: '2026-10-05', produto_id: 'p2', quantidade: 100 },
        { data: '2026-10-10', produto_id: 'p2', quantidade: 50 },
        { data: '2026-10-07', produto_id: 'p3', quantidade: 200 },
      ]

      const resultado = calcularGradeProdutosRegistro(produtos, itens)

      // p1: 15 + 25 + 10 = 50 un -> R$ 710,00
      // p2: 100 + 50 = 150 un -> R$ 1.500,00
      // p3: 200 un -> R$ 390,00
      // Total un: 50 + 150 + 200 = 400 un
      // Total custo: 710 + 1500 + 390 = 2600.00
      expect(resultado.quantidade_total_geral).toBe(400)
      expect(resultado.custo_total_fornecedor).toBe(2600.0)

      const linhaP1 = resultado.linhas.find((l) => l.produto_id === 'p1')
      expect(linhaP1?.quantidade_total).toBe(50)
      expect(linhaP1?.custo_total).toBe(710.0)

      const linhaP2 = resultado.linhas.find((l) => l.produto_id === 'p2')
      expect(linhaP2?.quantidade_total).toBe(150)
      expect(linhaP2?.custo_total).toBe(1500.0)
    })
  })

  describe('calcularTotalGrupoSaque e calcularResumoSaques', () => {
    it('deve calcular soma por grupo e total geral de saques do registro', () => {
      const grupos = [
        {
          id: 'g1',
          titulo: 'Saque Shopee-SHPP(Sicred)',
          itens: [
            { descricao: 'Auto Saque 1', valor: 1500.5 },
            { descricao: 'Auto Saque 2', valor: 2000 },
          ],
        },
        {
          id: 'g2',
          titulo: 'Saque TikTok-Bytedance(Sicred)',
          itens: [
            { descricao: 'Auto Saque 1', valor: 800 },
            { descricao: 'Auto Saque 2', valor: 0 },
          ],
        },
      ]

      expect(calcularTotalGrupoSaque(grupos[0].itens)).toBe(3500.5)
      expect(calcularTotalGrupoSaque(grupos[1].itens)).toBe(800)

      const resumo = calcularResumoSaques(grupos)
      expect(resumo.total_saques_geral).toBe(4300.5)
      expect(resumo.grupos[0].total_grupo).toBe(3500.5)
      expect(resumo.grupos[1].total_grupo).toBe(800)
    })
  })

  describe('calcularFechamentoRegistro', () => {
    it('deve calcular saldo do registro: saques − impostos − custo fornecedor', () => {
      // Caso 1: Déficit (vermelho)
      const f1 = calcularFechamentoRegistro(12474.1, 0, 0)
      expect(f1.saldo).toBe(-12474.1)
      expect(f1.is_negativo).toBe(true)

      // Caso 2: Superávit (verde)
      const f2 = calcularFechamentoRegistro(15000, 20000, 2000)
      expect(f2.saldo).toBe(3000)
      expect(f2.is_negativo).toBe(false)
    })
  })

  describe('Formatadores e compatibilidade', () => {
    it('formatarCabecalhoDia deve formatar a data por extenso', () => {
      const cabecalho = formatarCabecalhoDia('2026-08-24', 'segunda-feira')
      expect(cabecalho).toBe('segunda-feira, 24 de agosto/26')
    })

    it('calcularFaixaSemanaProducao deve gerar as faixas de compras e saques corretas', () => {
      const faixa = calcularFaixaSemanaProducao('2026-10-05', 6)
      expect(faixa.label_fornecedor).toBe('seg 05/10 a sex 09/10')
      expect(faixa.label_saques).toBe('dom 11/10 a sáb 17/10')
      expect(faixa.rotulo_completo).toBe('seg 05/10 a sex 09/10 »»» dom 11/10 a sáb 17/10')
    })
  })
})
