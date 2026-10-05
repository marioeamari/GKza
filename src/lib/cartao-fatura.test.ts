import { describe, it, expect } from 'vitest'
import {
  calcularEstadoCicloFatura,
  calcularFaturaCartao,
  getAvisoFaturaCartao,
  type PagamentoFaturaItem,
  type OcorrenciaFaturaItem,
} from './cartao-fatura'
import type { Conta } from '@/types/domain'

describe('calcularEstadoCicloFatura — Estado Financeiro Puro do Ciclo da Fatura', () => {
  // 1. Fatura sem nenhum pagamento
  describe('Fatura sem nenhum pagamento', () => {
    it('retorna status "nao_pago", valorRestante = totalFatura e percentualPago = 0 quando informada fatura sem pagamentos', () => {
      const resultado = calcularEstadoCicloFatura({
        totalFatura: 1500,
        pagamentos: [],
      })

      expect(resultado.status).toBe('nao_pago')
      expect(resultado.totalFatura).toBe(1500)
      expect(resultado.totalPago).toBe(0)
      expect(resultado.valorRestante).toBe(1500)
      expect(resultado.excedente).toBe(0)
      expect(resultado.percentualPago).toBe(0)
      expect(resultado.pagamentosCount).toBe(0)
      expect(resultado.dataUltimoPagamento).toBeUndefined()
    })

    it('deriva totalFatura a partir das ocorrências quando totalFatura não é passado diretamente', () => {
      const ocorrencias: OcorrenciaFaturaItem[] = [
        { id: 'oc-1', valor_previsto: 300, status: 'prevista' },
        { id: 'oc-2', valor_previsto: 450.5, status: 'prevista' },
        { id: 'oc-3', valor: 249.5, status: 'pendente' },
      ]

      const resultado = calcularEstadoCicloFatura({
        ocorrencias,
        pagamentos: [],
      })

      expect(resultado.totalFatura).toBe(1000)
      expect(resultado.valorRestante).toBe(1000)
      expect(resultado.totalPago).toBe(0)
      expect(resultado.status).toBe('nao_pago')
      expect(resultado.percentualPago).toBe(0)
    })
  })

  // 2. Pagamento parcial único
  describe('Pagamento parcial único', () => {
    it('retorna status "parcialmente_pago", totalPago e valorRestante corretos e percentualPago correto', () => {
      const pagamentos: PagamentoFaturaItem[] = [
        {
          id: 'pag-1',
          valor: 600,
          data: '2026-09-15',
          is_pagamento_fatura: true,
          cartao_fatura_conta: 'conta-nubank',
          competencia: '2026-09',
        },
      ]

      const resultado = calcularEstadoCicloFatura({
        totalFatura: 2000,
        pagamentos,
      })

      expect(resultado.status).toBe('parcialmente_pago')
      expect(resultado.totalFatura).toBe(2000)
      expect(resultado.totalPago).toBe(600)
      expect(resultado.valorRestante).toBe(1400)
      expect(resultado.excedente).toBe(0)
      expect(resultado.percentualPago).toBe(30) // (600 / 2000) * 100 = 30%
      expect(resultado.pagamentosCount).toBe(1)
      expect(resultado.dataUltimoPagamento).toBe('2026-09-15')
    })

    it('calcula corretamente percentuais fracionados (ex: 33.3%)', () => {
      const resultado = calcularEstadoCicloFatura({
        totalFatura: 300,
        pagamentos: [{ id: 'p1', valor: 100, data: '2026-09-10' }],
      })

      expect(resultado.status).toBe('parcialmente_pago')
      expect(resultado.percentualPago).toBe(33.3)
      expect(resultado.valorRestante).toBe(200)
    })
  })

  // 3. Múltiplos pagamentos parciais somados até cobrir o total
  describe('Múltiplos pagamentos parciais somados até cobrir o total', () => {
    it('retorna status "pago", valorRestante = 0 e percentualPago = 100 quando múltiplos pagamentos cobrem exatamente o total', () => {
      const pagamentos: PagamentoFaturaItem[] = [
        { id: 'p1', valor: 400, data: '2026-09-10', is_pagamento_fatura: true },
        { id: 'p2', valor: 600, data: '2026-09-18', is_pagamento_fatura: true },
        { id: 'p3', valor: 500, data: '2026-09-20', is_pagamento_fatura: true },
      ]

      const resultado = calcularEstadoCicloFatura({
        totalFatura: 1500,
        pagamentos,
      })

      expect(resultado.status).toBe('pago')
      expect(resultado.totalFatura).toBe(1500)
      expect(resultado.totalPago).toBe(1500)
      expect(resultado.valorRestante).toBe(0)
      expect(resultado.excedente).toBe(0)
      expect(resultado.percentualPago).toBe(100)
      expect(resultado.pagamentosCount).toBe(3)
      expect(resultado.dataUltimoPagamento).toBe('2026-09-20')
    })

    it('considera pago com margem de tolerância de arredondamento de centavos (< 0.009)', () => {
      const resultado = calcularEstadoCicloFatura({
        totalFatura: 99.99,
        pagamentos: [{ id: 'p1', valor: 99.985, data: '2026-09-20' }],
      })

      expect(resultado.status).toBe('pago')
      expect(resultado.valorRestante).toBe(0)
    })
  })

  // 4. Pagamento maior que o total (superavitário)
  describe('Pagamento maior que o total', () => {
    it('retorna status "pago", valorRestante = 0 e excedente = diferença (nunca valorRestante negativo)', () => {
      const pagamentos: PagamentoFaturaItem[] = [
        { id: 'p-excedente', valor: 1850.75, data: '2026-09-22' },
      ]

      const resultado = calcularEstadoCicloFatura({
        totalFatura: 1500,
        pagamentos,
      })

      expect(resultado.status).toBe('pago')
      expect(resultado.totalFatura).toBe(1500)
      expect(resultado.totalPago).toBe(1850.75)
      expect(resultado.valorRestante).toBe(0) // NUNCA negativo
      expect(resultado.valorRestante).not.toBeLessThan(0)
      expect(resultado.excedente).toBe(350.75)
      expect(resultado.percentualPago).toBe(100)
      expect(resultado.pagamentosCount).toBe(1)
      expect(resultado.dataUltimoPagamento).toBe('2026-09-22')
    })
  })

  // 5. dataUltimoPagamento e contagem
  describe('Data do último pagamento e contagem de pagamentos', () => {
    it('identifica a data do pagamento mais recente mesmo fora de ordem cronológica no array', () => {
      const pagamentos: PagamentoFaturaItem[] = [
        { id: 'p2', valor: 100, data: '2026-09-25' },
        { id: 'p1', valor: 100, data: '2026-09-10' },
        { id: 'p3', valor: 100, data: '2026-09-18' },
      ]

      const resultado = calcularEstadoCicloFatura({
        totalFatura: 500,
        pagamentos,
      })

      expect(resultado.dataUltimoPagamento).toBe('2026-09-25')
      expect(resultado.pagamentosCount).toBe(3)
      expect(resultado.status).toBe('parcialmente_pago')
    })

    it('aceita datas no formato ISO usando created ou slice(0, 10)', () => {
      const pagamentos: PagamentoFaturaItem[] = [
        { id: 'p1', valor: 250, created: '2026-09-28T14:32:00.000Z' },
      ]

      const resultado = calcularEstadoCicloFatura({
        totalFatura: 250,
        pagamentos,
      })

      expect(resultado.dataUltimoPagamento).toBe('2026-09-28')
      expect(resultado.status).toBe('pago')
    })
  })

  // 6. Tolerância a lançamentos e retrocompatibilidade
  describe('Isolamento de lançamentos e retrocompatibilidade', () => {
    it('ignora pagamentos com valor zero ou inválido na contagem e na data', () => {
      const pagamentos: PagamentoFaturaItem[] = [
        { id: 'p-invalido', valor: 0, data: '2026-09-30' },
        { id: 'p-valido', valor: 200, data: '2026-09-12' },
      ]

      const resultado = calcularEstadoCicloFatura({
        totalFatura: 400,
        pagamentos,
      })

      expect(resultado.totalPago).toBe(200)
      expect(resultado.pagamentosCount).toBe(1)
      expect(resultado.dataUltimoPagamento).toBe('2026-09-12')
    })

    it('quando não há pagamentos diretos, ativa fallback retrocompatível de ocorrências marcadas como pagas', () => {
      const ocorrencias: OcorrenciaFaturaItem[] = [
        {
          id: 'oc-1',
          valor_previsto: 200,
          status: 'paga',
          valor_pago: 200,
          data_pagamento: '2026-09-14',
        } as any,
        { id: 'oc-2', valor_previsto: 300, status: 'prevista' },
      ]

      const resultado = calcularEstadoCicloFatura({
        totalFatura: 500,
        ocorrencias,
        pagamentos: [],
      })

      expect(resultado.status).toBe('parcialmente_pago')
      expect(resultado.totalPago).toBe(200)
      expect(resultado.valorRestante).toBe(300)
      expect(resultado.pagamentosCount).toBe(1)
      expect(resultado.dataUltimoPagamento).toBe('2026-09-14')
    })

    it('quando a fatura tem total 0 mas há pagamento, marca status "pago" com percentual 100%', () => {
      const resultado = calcularEstadoCicloFatura({
        totalFatura: 0,
        pagamentos: [{ id: 'p1', valor: 50, data: '2026-09-01' }],
      })

      expect(resultado.status).toBe('pago')
      expect(resultado.percentualPago).toBe(100)
      expect(resultado.totalPago).toBe(50)
      expect(resultado.valorRestante).toBe(0)
    })
  })

  // 7. Funções auxiliares de ciclo e aviso (calcularFaturaCartao e getAvisoFaturaCartao)
  describe('calcularFaturaCartao e getAvisoFaturaCartao', () => {
    const contaCartao: Conta = {
      id: 'c-nubank',
      collectionId: 'contas_col',
      collectionName: 'contas',
      nome: 'Nubank PF',
      tipo: 'cartao',
      ativa: true,
      dia_fechamento: 13,
      dia_vencimento: 20,
      cor: '#8A05BE',
      saldo_inicial: 0,
    }

    it('compra antes ou no dia do fechamento pertence à fatura do próprio mês', () => {
      const ciclo = calcularFaturaCartao(contaCartao, '2026-09-10')
      expect(ciclo.competencia).toBe('2026-09')
      expect(ciclo.dataFechamento).toBe('2026-09-13')
      expect(ciclo.dataVencimento).toBe('2026-09-20')
    })

    it('compra após o fechamento pula para o ciclo da fatura do mês seguinte', () => {
      const ciclo = calcularFaturaCartao(contaCartao, '2026-09-14')
      expect(ciclo.competencia).toBe('2026-10')
      expect(ciclo.dataFechamento).toBe('2026-10-13')
      expect(ciclo.dataVencimento).toBe('2026-10-20')
    })

    it('gera texto amigável com getAvisoFaturaCartao', () => {
      const aviso = getAvisoFaturaCartao(contaCartao, '2026-09-05')
      expect(aviso).toContain('vence 20/09')
    })
  })
})
