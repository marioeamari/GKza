import { describe, expect, it } from 'vitest'
import {
  PRODUTOS_PADRAO_PRODUCAO,
  arredondarMoeda,
  calcularCustoLinha,
  calcularFaixaSemanaProducao,
  calcularFechamentoSemana,
  calcularGradeSemanalFornecedor,
  calcularResumoSaques,
  calcularTotalDia,
  calcularTotalGrupoSaque,
  formatarCabecalhoDia,
  formatarDiaMes,
  gerarCincoDiasUteis,
  getSegundaFeiraSemana,
} from './producao'

describe('Módulo de Produção - Regras e Cálculos', () => {
  describe('Lista de produtos padrão', () => {
    it('deve conter os 18 produtos do print com seus custos unitários', () => {
      expect(PRODUTOS_PADRAO_PRODUCAO).toHaveLength(18)
      expect(PRODUTOS_PADRAO_PRODUCAO[0]).toEqual({
        nome: 'Toalha Banhão Quadriculada',
        custo_padrao: 14.2,
        ordem: 1,
      })
      expect(PRODUTOS_PADRAO_PRODUCAO[7]).toEqual({
        nome: 'Toalha Leve',
        custo_padrao: 10.0,
        ordem: 8,
      })
      expect(PRODUTOS_PADRAO_PRODUCAO[17]).toEqual({
        nome: 'Pano Baiana',
        custo_padrao: 1.95,
        ordem: 18,
      })
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

  describe('calcularTotalDia', () => {
    it('deve calcular o total diário somando as linhas', () => {
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
      // Soma: 284 + 1490 + 722.40 + 70.50 + 960 = 3526.90 (exatamente o do print!)
      expect(calcularTotalDia(itens, custos)).toBe(3526.9)
    })
  })

  describe('calcularGradeSemanalFornecedor', () => {
    it('deve reproduzir exatamente o resumo do print semanal de exemplo (R$ 12.474,10)', () => {
      const produtos = [
        { id: 'p1', nome: 'Toalha Banhão Quadriculada', custo_unitario: 14.2, ordem: 1 },
        { id: 'p2', nome: 'Toalha Banhão Bola', custo_unitario: 14.2, ordem: 2 },
        { id: 'p3', nome: 'Toalha Leve', custo_unitario: 10.0, ordem: 8 },
        { id: 'p4', nome: 'Rosto Folha', custo_unitario: 4.3, ordem: 14 },
        { id: 'p5', nome: 'Pano Atoalhado', custo_unitario: 2.35, ordem: 16 },
        { id: 'p6', nome: 'Toalha Pequena', custo_unitario: 2.0, ordem: 17 },
      ]

      // Itens simulando as somas da semana:
      // p1: 20 + 10 + 10 + 10 = 50 un -> R$ 710,00
      // p3: 149 + 207 + 114 + 161 + 76 = 707 un -> R$ 7.070,00
      // p4: 168 + 24 + 24 + 48 + 48 = 312 un -> R$ 1.341,60
      // p5: 30 + 0 + 30 + 30 + 60 = 150 un -> R$ 352,50
      // p6: 480 + 720 + 0 + 300 + 0 = 1500 un -> R$ 3.000,00
      // Total: 710 + 7070 + 1341.60 + 352.50 + 3000 = 12.474,10
      const itens = [
        { data: '2026-08-24', produto_id: 'p1', quantidade: 20 },
        { data: '2026-08-25', produto_id: 'p1', quantidade: 10 },
        { data: '2026-08-26', produto_id: 'p1', quantidade: 10 },
        { data: '2026-08-27', produto_id: 'p1', quantidade: 10 },

        { data: '2026-08-24', produto_id: 'p3', quantidade: 149 },
        { data: '2026-08-25', produto_id: 'p3', quantidade: 207 },
        { data: '2026-08-26', produto_id: 'p3', quantidade: 114 },
        { data: '2026-08-27', produto_id: 'p3', quantidade: 161 },
        { data: '2026-08-28', produto_id: 'p3', quantidade: 76 },

        { data: '2026-08-24', produto_id: 'p4', quantidade: 168 },
        { data: '2026-08-25', produto_id: 'p4', quantidade: 24 },
        { data: '2026-08-26', produto_id: 'p4', quantidade: 24 },
        { data: '2026-08-27', produto_id: 'p4', quantidade: 48 },
        { data: '2026-08-28', produto_id: 'p4', quantidade: 48 },

        { data: '2026-08-24', produto_id: 'p5', quantidade: 30 },
        { data: '2026-08-26', produto_id: 'p5', quantidade: 30 },
        { data: '2026-08-27', produto_id: 'p5', quantidade: 30 },
        { data: '2026-08-28', produto_id: 'p5', quantidade: 60 },

        { data: '2026-08-24', produto_id: 'p6', quantidade: 480 },
        { data: '2026-08-25', produto_id: 'p6', quantidade: 720 },
        { data: '2026-08-27', produto_id: 'p6', quantidade: 300 },
      ]

      const resultado = calcularGradeSemanalFornecedor(produtos, itens)

      expect(resultado.custo_total_fornecedor).toBe(12474.1)
      expect(resultado.quantidade_total_geral).toBe(50 + 707 + 312 + 150 + 1500)

      const linhaP1 = resultado.linhas.find((l) => l.produto_id === 'p1')
      expect(linhaP1?.quantidade_total).toBe(50)
      expect(linhaP1?.custo_total).toBe(710.0)

      const linhaP2 = resultado.linhas.find((l) => l.produto_id === 'p2')
      expect(linhaP2?.quantidade_total).toBe(0)
      expect(linhaP2?.custo_total).toBe(0)
    })
  })

  describe('calcularTotalGrupoSaque e calcularResumoSaques', () => {
    it('deve calcular soma por grupo e total geral de saques', () => {
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

  describe('calcularFechamentoSemana', () => {
    it('deve calcular saldo correto: totalSaques - impostos - totalFornecedor', () => {
      // Caso 1: Saques = 0, Imposto = 0, Fornecedor = 12474.10 -> Saldo = -12474.10 (como no print)
      const f1 = calcularFechamentoSemana(12474.1, 0, 0)
      expect(f1.saldo_semana).toBe(-12474.1)
      expect(f1.is_negativo).toBe(true)

      // Caso 2: Saques = 20.000, Imposto = 2.000, Fornecedor = 15.000 -> Saldo = +3.000
      const f2 = calcularFechamentoSemana(15000, 20000, 2000)
      expect(f2.saldo_semana).toBe(3000)
      expect(f2.is_negativo).toBe(false)
    })
  })

  describe('Faixa de datas e defasagem da semana', () => {
    it('deve calcular a segunda-feira da semana de uma data', () => {
      // 2026-08-24 é uma segunda-feira
      expect(getSegundaFeiraSemana('2026-08-24')).toBe('2026-08-24')
      // 2026-08-26 (quarta-feira) deve recuar para 2026-08-24
      expect(getSegundaFeiraSemana('2026-08-26')).toBe('2026-08-24')
      // 2026-08-30 (domingo) pertence à semana que começou em 2026-08-24
      expect(getSegundaFeiraSemana('2026-08-30')).toBe('2026-08-24')
    })

    it('deve calcular a faixa de datas exata do modelo do usuário (seg 24/08 a sex 28/08 »»» dom 30/08 a sáb 05/09)', () => {
      const faixa = calcularFaixaSemanaProducao('2026-08-24', 6)
      expect(faixa.data_inicio_fornecedor).toBe('2026-08-24')
      expect(faixa.data_fim_fornecedor).toBe('2026-08-28')
      expect(faixa.data_inicio_saques).toBe('2026-08-30')
      expect(faixa.data_fim_saques).toBe('2026-09-05')
      expect(faixa.label_fornecedor).toBe('seg 24/08 a sex 28/08')
      expect(faixa.label_saques).toBe('dom 30/08 a sáb 05/09')
      expect(faixa.rotulo_completo).toBe('seg 24/08 a sex 28/08 »»» dom 30/08 a sáb 05/09')
    })

    it('deve gerar os 5 dias úteis seg a sex com formatação', () => {
      const dias = gerarCincoDiasUteis('2026-08-24')
      expect(dias).toHaveLength(5)
      expect(dias[0].data).toBe('2026-08-24')
      expect(dias[0].nome_dia).toBe('segunda-feira')
      expect(dias[4].data).toBe('2026-08-28')
      expect(dias[4].nome_dia).toBe('sexta-feira')

      const cabecalho = formatarCabecalhoDia('2026-08-24', 'segunda-feira')
      expect(cabecalho).toBe('segunda-feira, 24 de agosto/26')
    })
  })
})
