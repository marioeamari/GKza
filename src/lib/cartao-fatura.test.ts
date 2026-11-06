import { describe, it, expect } from 'vitest'
import {
  calcularEstadoCicloFatura,
  calcularFaturaCartao,
  calcularCicloParcelaCartao,
  calcularCompetenciaEVencimento,
  gerarCronogramaParcelasCartao,
  calcularDataFimParceladoCartao,
  simularCronogramaParcelas,
  getAvisoFaturaCartao,
  formatarSeloFaturaOcorrencia,
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

    it('calcularCicloParcelaCartao calcula ciclo da parcela N com avanço correto', () => {
      // Compra em 19/09/2026 na conta com fechamento 16 e vencimento 23
      const contaNubank: Conta = {
        ...contaCartao,
        dia_fechamento: 16,
        dia_vencimento: 23,
      }
      const p1 = calcularCicloParcelaCartao(contaNubank, '2026-09-19', 1, 4)
      expect(p1.competencia).toBe('2026-10')
      expect(p1.dataVencimento).toBe('2026-10-23')

      const p2 = calcularCicloParcelaCartao(contaNubank, '2026-09-19', 2, 4)
      expect(p2.competencia).toBe('2026-11')
      expect(p2.dataVencimento).toBe('2026-11-23')

      const p4 = calcularCicloParcelaCartao(contaNubank, '2026-09-19', 4, 4)
      expect(p4.competencia).toBe('2027-01')
      expect(p4.dataVencimento).toBe('2027-01-23')
    })

    it('calcularCicloParcelaCartao quando compra é antes do fechamento', () => {
      const contaNubank: Conta = {
        ...contaCartao,
        dia_fechamento: 16,
        dia_vencimento: 23,
      }
      const p1 = calcularCicloParcelaCartao(contaNubank, '2026-09-10', 1, 3)
      expect(p1.competencia).toBe('2026-09')
      expect(p1.dataVencimento).toBe('2026-09-23')

      const p2 = calcularCicloParcelaCartao(contaNubank, '2026-09-10', 2, 3)
      expect(p2.competencia).toBe('2026-10')
      expect(p2.dataVencimento).toBe('2026-10-23')
    })

    it('gera texto amigável com getAvisoFaturaCartao', () => {
      const aviso = getAvisoFaturaCartao(contaCartao, '2026-09-05')
      expect(aviso).toContain('vence 20/09')
    })

    describe('Compras avulsas no cartão de crédito', () => {
      const contaNubank: Conta = {
        ...contaCartao,
        dia_fechamento: 16,
        dia_vencimento: 23,
      }

      it('compra avulsa após fechamento (ex: 22/09) vai para a fatura de outubro com venc. 23/10', () => {
        // Caso concreto: Multi Carnes R$ 67,79 em 22/09/2026
        const ciclo = calcularFaturaCartao(contaNubank, '2026-09-22')
        expect(ciclo.competencia).toBe('2026-10')
        expect(ciclo.dataFechamento).toBe('2026-10-16')
        expect(ciclo.dataVencimento).toBe('2026-10-23')
      })

      it('compra avulsa exatamente no dia do fechamento (16/09) pertence à fatura do próprio mês (setembro)', () => {
        const ciclo = calcularFaturaCartao(contaNubank, '2026-09-16')
        expect(ciclo.competencia).toBe('2026-09')
        expect(ciclo.dataFechamento).toBe('2026-09-16')
        expect(ciclo.dataVencimento).toBe('2026-09-23')
      })

      it('compra avulsa antes do fechamento (15/09) pertence à fatura do próprio mês (setembro)', () => {
        const ciclo = calcularFaturaCartao(contaNubank, '2026-09-15')
        expect(ciclo.competencia).toBe('2026-09')
        expect(ciclo.dataFechamento).toBe('2026-09-16')
        expect(ciclo.dataVencimento).toBe('2026-09-23')
      })

      it('compra avulsa em dezembro após fechamento avança ciclo para janeiro do próximo ano (virada de ano)', () => {
        const ciclo = calcularFaturaCartao(contaNubank, '2026-12-20')
        expect(ciclo.competencia).toBe('2027-01')
        expect(ciclo.dataFechamento).toBe('2027-01-16')
        expect(ciclo.dataVencimento).toBe('2027-01-23')
      })

      it('compra avulsa em dezembro antes do fechamento permanece na fatura de dezembro', () => {
        const ciclo = calcularFaturaCartao(contaNubank, '2026-12-10')
        expect(ciclo.competencia).toBe('2026-12')
        expect(ciclo.dataFechamento).toBe('2026-12-16')
        expect(ciclo.dataVencimento).toBe('2026-12-23')
      })
    })

    describe('calcularCompetenciaEVencimento (REGRA ÚNICA)', () => {
      const contaNubank: Conta = {
        ...contaCartao,
        id: 'sglo7dfsqvgfsni',
        nome: 'NuBank PJ',
        tipo: 'cartao',
        dia_fechamento: 16,
        dia_vencimento: 23,
      }

      const contaBancaria: Conta = {
        ...contaCartao,
        id: 'conta_corrente_1',
        nome: 'Sicredi CC',
        tipo: 'bancaria',
        tipos_pagamento: ['debito', 'transferencia', 'boletos', 'pix'],
        dia_fechamento: undefined,
        dia_vencimento: undefined,
      }

      it('Não-cartão (débito, transferência, boletos, pix): compra em 01/09 -> competência 2026-09', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-01',
          conta: contaBancaria,
          metodoEhCredito: false,
          diaVencimento: 10,
        })
        expect(res.competencia).toBe('2026-09')
        expect(res.dataVencimento).toBe('2026-09-10')
        expect(res.isCartaoCredito).toBe(false)
      })

      it('Não-cartão: compra em 30/09 -> competência 2026-09', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-30',
          conta: contaBancaria,
          metodoEhCredito: false,
          diaVencimento: 25,
        })
        expect(res.competencia).toBe('2026-09')
        expect(res.dataVencimento).toBe('2026-09-25')
        expect(res.isCartaoCredito).toBe(false)
      })

      it('Cartão de crédito: compra em 16/09 com fechamento 16 -> setembro (2026-09, venc 2026-09-23)', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-16',
          conta: contaNubank,
          metodoEhCredito: true,
        })
        expect(res.competencia).toBe('2026-09')
        expect(res.dataVencimento).toBe('2026-09-23')
        expect(res.isCartaoCredito).toBe(true)
      })

      it('Cartão de crédito: compra em 17/09 com fechamento 16 -> outubro (2026-10, venc 2026-10-23)', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaNubank,
          metodoEhCredito: true,
        })
        expect(res.competencia).toBe('2026-10')
        expect(res.dataVencimento).toBe('2026-10-23')
        expect(res.isCartaoCredito).toBe(true)
      })

      it('Coerção robusta: conta com dia_fechamento como string "16" e compra dia 17 -> fatura do mês seguinte (outubro)', () => {
        const contaString: any = {
          ...contaNubank,
          dia_fechamento: '16',
          dia_vencimento: '23',
        }
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaString,
        })
        expect(res.competencia).toBe('2026-10')
        expect(res.dataVencimento).toBe('2026-10-23')
        expect(res.isCartaoCredito).toBe(true)
      })

      it('Coerção robusta: conta com dia_fechamento como string "16" e compra dia 16 -> fatura do mês corrente (setembro)', () => {
        const contaString: any = {
          ...contaNubank,
          dia_fechamento: '16',
          dia_vencimento: '23',
        }
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-16',
          conta: contaString,
        })
        expect(res.competencia).toBe('2026-09')
        expect(res.dataVencimento).toBe('2026-09-23')
        expect(res.isCartaoCredito).toBe(true)
      })

      it('Coerção robusta: conta tipo "cartao" sem método de pagamento informado -> ainda assim entra no ciclo da fatura', () => {
        const contaCartaoSemMetodo: any = {
          ...contaNubank,
          dia_fechamento: 16,
          dia_vencimento: 23,
        }
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaCartaoSemMetodo,
          // metodoEhCredito ausente
        })
        expect(res.competencia).toBe('2026-10')
        expect(res.dataVencimento).toBe('2026-10-23')
        expect(res.isCartaoCredito).toBe(true)
      })

      it('Caso Curso Batera como fixture: compra 17/09 em 4 parcelas no NuBank (fech 16, venc 23)', () => {
        const p1 = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaNubank,
          metodoEhCredito: true,
          numeroParcela: 1,
          totalParcelas: 4,
        })
        const p2 = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaNubank,
          metodoEhCredito: true,
          numeroParcela: 2,
          totalParcelas: 4,
        })
        const p3 = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaNubank,
          metodoEhCredito: true,
          numeroParcela: 3,
          totalParcelas: 4,
        })
        const p4 = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaNubank,
          metodoEhCredito: true,
          numeroParcela: 4,
          totalParcelas: 4,
        })

        // Parcela 1: fatura outubro/2026, venc 23/10
        expect(p1.competencia).toBe('2026-10')
        expect(p1.dataVencimento).toBe('2026-10-23')

        // Parcela 2: fatura novembro/2026, venc 23/11
        expect(p2.competencia).toBe('2026-11')
        expect(p2.dataVencimento).toBe('2026-11-23')

        // Parcela 3: fatura dezembro/2026, venc 23/12
        expect(p3.competencia).toBe('2026-12')
        expect(p3.dataVencimento).toBe('2026-12-23')

        // Parcela 4: fatura janeiro/2027, venc 23/01/2027
        expect(p4.competencia).toBe('2027-01')
        expect(p4.dataVencimento).toBe('2027-01-23')
      })

      it('Não-cartão parcelado avança mês a mês a partir do mês da compra', () => {
        const p1 = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-20',
          conta: contaBancaria,
          metodoEhCredito: false,
          diaVencimento: 20,
          numeroParcela: 1,
          totalParcelas: 3,
        })
        const p2 = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-20',
          conta: contaBancaria,
          metodoEhCredito: false,
          diaVencimento: 20,
          numeroParcela: 2,
          totalParcelas: 3,
        })
        const p3 = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-20',
          conta: contaBancaria,
          metodoEhCredito: false,
          diaVencimento: 20,
          numeroParcela: 3,
          totalParcelas: 3,
        })

        expect(p1.competencia).toBe('2026-09')
        expect(p1.dataVencimento).toBe('2026-09-20')

        expect(p2.competencia).toBe('2026-10')
        expect(p2.dataVencimento).toBe('2026-10-20')

        expect(p3.competencia).toBe('2026-11')
        expect(p3.dataVencimento).toBe('2026-11-20')
      })
    })

    it('simularCronogramaParcelas mescla ocorrências existentes e simula parcelas futuras de cartão', () => {
      const contaNubank: Conta = {
        ...contaCartao,
        dia_fechamento: 16,
        dia_vencimento: 23,
      }
      const compromisso = {
        id: 'comp_toro',
        descricao: 'Conserto TORO',
        data_inicio: '2026-09-19',
        total_parcelas: 4,
        parcela_inicial: 1,
        valor_parcela: 356.75,
      }
      const ocorrenciasReais = [
        {
          id: 'oc_1',
          numero_parcela: 1,
          total_parcelas: 4,
          competencia: '2026-10',
          data_vencimento: '2026-10-23T12:00:00.000Z',
          data_pagamento: '2026-10-20T12:00:00.000Z',
          valor_previsto: 356.75,
          valor_pago: 356.75,
          status: 'paga',
        },
      ]

      const cronograma = simularCronogramaParcelas({
        compromisso,
        conta: contaNubank,
        ocorrenciasReais,
        dataReferenciaHoje: '2026-10-25',
      })

      expect(cronograma).toHaveLength(4)
      // Parcela 1: real e paga
      expect(cronograma[0].numeroParcela).toBe(1)
      expect(cronograma[0].isSimulada).toBe(false)
      expect(cronograma[0].status).toBe('paga')
      expect(cronograma[0].dataPagamento).toBe('2026-10-20')

      // Parcela 2: simulada para 2026-11
      expect(cronograma[1].numeroParcela).toBe(2)
      expect(cronograma[1].isSimulada).toBe(true)
      expect(cronograma[1].competencia).toBe('2026-11')
      expect(cronograma[1].dataVencimento).toBe('2026-11-23')

      // Parcela 4: simulada para 2027-01
      expect(cronograma[3].numeroParcela).toBe(4)
      expect(cronograma[3].competencia).toBe('2027-01')
      expect(cronograma[3].dataVencimento).toBe('2027-01-23')
    })

    it('compra parcelada 2x no cartão NuBank após o fechamento: parcela 1 em M+1 e parcela 2 em M+2', () => {
      const contaNubank: Conta = {
        ...contaCartao,
        dia_fechamento: 16,
        dia_vencimento: 23,
      }
      // Compra dia 17/09/2026 (após o fechamento 16)
      const dataCompra = '2026-09-17'

      // Parcela 1 de 2: fatura de Outubro (2026-10), vence 23/10
      const p1 = calcularCompetenciaEVencimento({
        dataCompra,
        conta: contaNubank,
        metodoEhCredito: true,
        diaVencimento: 23,
        numeroParcela: 1,
        totalParcelas: 2,
      })
      expect(p1.competencia).toBe('2026-10')
      expect(p1.dataVencimento).toBe('2026-10-23')

      // Parcela 2 de 2: fatura de Novembro (2026-11), vence 23/11
      const p2 = calcularCompetenciaEVencimento({
        dataCompra,
        conta: contaNubank,
        metodoEhCredito: true,
        diaVencimento: 23,
        numeroParcela: 2,
        totalParcelas: 2,
      })
      expect(p2.competencia).toBe('2026-11')
      expect(p2.dataVencimento).toBe('2026-11-23')
    })

    it('formatarSeloFaturaOcorrencia reflete a competência e vencimento da própria ocorrência clicada', () => {
      // Caso Celular Lara: compra em 25/09 no cartão com fechamento 10 e vencimento 10.
      // A primeira parcela cairia na fatura de Setembro (vence 10/10).
      // Porém a parcela 3 tem competência 2026-11 e vencimento 2026-12-10.
      // O selo da parcela 3 DEVE mostrar "Fatura de Novembro de 2026 · vence 10/12", e NÃO a primeira parcela!
      const contaNubank: Conta = {
        ...contaCartao,
        dia_fechamento: 10,
        dia_vencimento: 10,
      }

      const seloParcela3 = formatarSeloFaturaOcorrencia({
        conta: contaNubank,
        metodoEhCredito: true,
        competencia: '2026-11',
        dataVencimento: '2026-12-10T12:00:00.000Z',
        dataCompraFallback: '2026-09-25',
      })

      expect(seloParcela3).toBe('Fatura de Novembro de 2026 · vence 10/12')

      // Parcela 4 com competência 2026-12 e vencimento 2027-01-10
      const seloParcela4 = formatarSeloFaturaOcorrencia({
        conta: contaNubank,
        metodoEhCredito: true,
        competencia: '2026-12',
        dataVencimento: '2027-01-10T12:00:00.000Z',
        dataCompraFallback: '2026-09-25',
      })

      expect(seloParcela4).toBe('Fatura de Dezembro de 2026 · vence 10/01')
    })

    it('simularCronogramaParcelas exibe parcelas anteriores a parcela_inicial com status anterior_ao_controle', () => {
      // Caso idêntico a Celular Lara: parcela_inicial 3, total_parcelas 4
      const compromisso = {
        id: 'comp_lara',
        descricao: 'Celular Lara',
        data_inicio: '2026-09-25',
        total_parcelas: 4,
        parcela_inicial: 3,
        valor_parcela: 360,
      }
      const ocorrenciasReais = [
        {
          id: 'oc_3',
          numero_parcela: 3,
          total_parcelas: 4,
          competencia: '2026-11',
          data_vencimento: '2026-12-10T12:00:00.000Z',
          valor_previsto: 360,
          status: 'prevista',
        },
        {
          id: 'oc_4',
          numero_parcela: 4,
          total_parcelas: 4,
          competencia: '2026-12',
          data_vencimento: '2027-01-10T12:00:00.000Z',
          valor_previsto: 360,
          status: 'prevista',
        },
      ]

      const cronograma = simularCronogramaParcelas({
        compromisso,
        conta: contaCartao,
        ocorrenciasReais,
        dataReferenciaHoje: '2026-10-06',
      })

      // O cronograma completo deve ter 4 parcelas (1, 2, 3 e 4)
      expect(cronograma).toHaveLength(4)

      // Parcelas 1 e 2 devem vir marcadas como 'anterior_ao_controle'
      expect(cronograma[0].numeroParcela).toBe(1)
      expect(cronograma[0].status).toBe('anterior_ao_controle')
      expect(cronograma[0].isAnteriorAoControle).toBe(true)

      expect(cronograma[1].numeroParcela).toBe(2)
      expect(cronograma[1].status).toBe('anterior_ao_controle')
      expect(cronograma[1].isAnteriorAoControle).toBe(true)

      // Parcelas 3 e 4 são as reais existentes no banco
      expect(cronograma[2].numeroParcela).toBe(3)
      expect(cronograma[2].status).toBe('prevista')
      expect(cronograma[2].isSimulada).toBe(false)
      expect(cronograma[2].competencia).toBe('2026-11')

      expect(cronograma[3].numeroParcela).toBe(4)
      expect(cronograma[3].status).toBe('prevista')
      expect(cronograma[3].isSimulada).toBe(false)
      expect(cronograma[3].competencia).toBe('2026-12')
    })
  })

  describe('Fluxo Simplificado Cartão: data_pagamento e vencimento de fatura', () => {
    it('calcula competência e vencimento garantindo que a data de vencimento da fatura é a referência de pagamento', () => {
      const contaCartao = {
        id: 'cartao_nubank',
        nome: 'NuBank',
        tipo: 'cartao' as const,
        dia_fechamento: 16,
        dia_vencimento: 23,
      } as any

      // Compra feita em 2026-09-19 (após fechamento do dia 16 -> cai na competência 2026-10, vencimento 2026-10-23)
      const res = calcularCompetenciaEVencimento({
        dataCompra: '2026-09-19',
        conta: contaCartao,
        metodoEhCredito: true,
      })

      expect(res.competencia).toBe('2026-10')
      expect(res.dataVencimento.slice(0, 10)).toBe('2026-10-23')

      // Compra feita antes do fechamento (ex: 2026-09-10) -> cai no ciclo de setembro (2026-09-23)
      const resAntes = calcularCompetenciaEVencimento({
        dataCompra: '2026-09-10',
        conta: contaCartao,
        metodoEhCredito: true,
      })

      expect(resAntes.competencia).toBe('2026-09')
      expect(resAntes.dataVencimento.slice(0, 10)).toBe('2026-09-23')
    })

    it('filtro por pagamento agrupa na competência do ciclo da fatura (vencimento)', () => {
      // Simula a lógica do filtro em /despesas: ocorrência no cartão com data_pagamento = 2026-10-23
      const ocorrenciaCartao: {
        id: string
        secao: string
        competencia: string
        status: string
        data_pagamento: string
      } = {
        id: 'vlrw6md2c4oo8pa',
        secao: 'cartoes_credito',
        competencia: '2026-10',
        status: 'paga',
        data_pagamento: '2026-10-23 12:00:00.000Z',
      }

      const currentCompetencia = '2026-10'
      const dataInicioMes = `${currentCompetencia}-01`
      const dataFimMes = `${currentCompetencia}-31 23:59:59`

      const matchesFiltroPagamento =
        (ocorrenciaCartao.status === 'paga' &&
          ((ocorrenciaCartao.data_pagamento >= dataInicioMes &&
            ocorrenciaCartao.data_pagamento <= dataFimMes) ||
            (ocorrenciaCartao.secao === 'cartoes_credito' &&
              ocorrenciaCartao.competencia === currentCompetencia))) ||
        (ocorrenciaCartao.status === 'prevista' &&
          ocorrenciaCartao.competencia === currentCompetencia)

      expect(matchesFiltroPagamento).toBe(true)
    })

    describe('Regra Canônica de Competência e Fechamento no Cartão (Travamento de Regra)', () => {
      const contaNubank = {
        id: 'sglo7dfsqvgfsni',
        nome: 'NuBank',
        tipo: 'cartao' as const,
        dia_fechamento: 16,
        dia_vencimento: 23,
      } as any

      it('compra 17/09, fechamento 16 -> competência 2026-10, vencimento 23/10/2026', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-17',
          conta: contaNubank,
          metodoEhCredito: true,
        })
        expect(res.competencia).toBe('2026-10')
        expect(res.dataVencimento.slice(0, 10)).toBe('2026-10-23')
        expect(res.dataVencimentoIso).toBe('2026-10-23T12:00:00.000Z')
      })

      it('compra 15/09 -> fatura que fecha 16/09 (vencimento 23/09, competência 2026-09)', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-15',
          conta: contaNubank,
          metodoEhCredito: true,
        })
        expect(res.competencia).toBe('2026-09')
        expect(res.dataVencimento.slice(0, 10)).toBe('2026-09-23')
      })

      it('compra 16/09 (no dia do fechamento) -> fatura que fecha 16/09 (vencimento 23/09, competência 2026-09)', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-16',
          conta: contaNubank,
          metodoEhCredito: true,
        })
        expect(res.competencia).toBe('2026-09')
        expect(res.dataVencimento.slice(0, 10)).toBe('2026-09-23')
      })

      it('compra 10/10 -> fatura que fecha 16/10 (competência 2026-10, vencimento 23/10)', () => {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-10-10',
          conta: contaNubank,
          metodoEhCredito: true,
        })
        expect(res.competencia).toBe('2026-10')
        expect(res.dataVencimento.slice(0, 10)).toBe('2026-10-23')
      })
    })
  })

  // =====================================================================
  // REGRA VIGENTE (0.0.286/0.0.288): CRONOGRAMA DE PARCELAS EM CARTÃO
  // O vencimento de cada parcela N é o vencimento da fatura do ciclo da
  // COMPRA da parcela N (mês da data_inicio + N - 1, ajustado pelo
  // dia_fechamento da conta). Sequência de vencimentos ESTRITAMENTE
  // CRESCENTE: nunca dois vencimentos iguais e nunca mês pulado.
  // data_fim_calculada = vencimento da última parcela.
  // Caso de referência: "Conserto Logan - ok" (compromisso iswtn97h6fdlq35),
  // reparado pela migração 0147.
  // =====================================================================
  describe('gerarCronogramaParcelasCartao — Caso Conserto Logan (referência do reparo 0147)', () => {
    const contaNubank: Conta = {
      id: 'sglo7dfsqvgfsni',
      collectionId: 'contas_col',
      collectionName: 'contas',
      nome: 'NuBank',
      tipo: 'cartao',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
      cor: '#8A05BE',
      saldo_inicial: 0,
    }

    const LOGAN_ESPERADO = [
      { numeroParcela: 1, competencia: '2026-09', dataVencimento: '2026-09-23' },
      { numeroParcela: 2, competencia: '2026-10', dataVencimento: '2026-10-23' },
      { numeroParcela: 3, competencia: '2026-11', dataVencimento: '2026-11-23' },
      { numeroParcela: 4, competencia: '2026-12', dataVencimento: '2026-12-23' },
      { numeroParcela: 5, competencia: '2027-01', dataVencimento: '2027-01-23' },
    ]

    it('caso Logan: compra 29/08/2026, 5x, fechamento 16, venc 23 -> série 23/09, 23/10, 23/11, 23/12, 23/01/2027 sem duplicar nem pular mês', () => {
      const cronograma = gerarCronogramaParcelasCartao({
        conta: contaNubank,
        dataCompra: '2026-08-29',
        totalParcelas: 5,
      })

      expect(cronograma).toHaveLength(5)
      cronograma.forEach((item, i) => {
        expect(item.numeroParcela).toBe(LOGAN_ESPERADO[i].numeroParcela)
        expect(item.competencia).toBe(LOGAN_ESPERADO[i].competencia)
        expect(item.dataVencimento).toBe(LOGAN_ESPERADO[i].dataVencimento)
        expect(item.dataVencimentoIso).toBe(`${item.dataVencimento}T12:00:00.000Z`)
      })

      // Sem duplicar nem pular mês: competências consecutivas diferem exatamente 1 mês
      for (let i = 1; i < cronograma.length; i++) {
        expect(
          competenciaOffsetMeses(cronograma[i - 1].competencia, cronograma[i].competencia),
        ).toBe(1)
      }
    })

    it('caso Logan via calcularCompetenciaEVencimento: parcela 3 tem competência 2026-11 e vencimento 23/11/2026 (parcela que o bug duplicava em outubro)', () => {
      for (const esperado of LOGAN_ESPERADO) {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-08-29',
          conta: contaNubank,
          metodoEhCredito: true,
          numeroParcela: esperado.numeroParcela,
          totalParcelas: 5,
        })
        expect(res.competencia).toBe(esperado.competencia)
        expect(res.dataVencimento).toBe(esperado.dataVencimento)
        expect(res.isCartaoCredito).toBe(true)
      }
    })

    // ===================================================================
    // Caso TORO (referência do reparo 0148): compromisso fhlmrrnph6hmbh3
    // "Conserto TORO - OK/Nov" — compra 19/09/2026, 4x de 356,75, NuBank
    // fech 16 / venc 23. A compra da parcela 1 (19/09) cai APÓS o
    // fechamento 16/09 -> fatura de OUTUBRO; a compra da parcela 2
    // (19/10) cai após o fechamento 16/10 -> fatura de NOVEMBRO.
    // Série correta: 23/10, 23/11, 23/12, 23/01/2027.
    // A migração 0147 produzia 23/10, 23/10, 23/12, 23/01 porque o ajuste
    // local da guarda (offsetExtra) ACUMULAVA e deslocava as parcelas
    // seguintes — borda corrigida: cada parcela é computada de forma
    // independente pelo ciclo da SUA compra.
    // ===================================================================
    it('caso TORO: compra 19/09/2026, 4x, fech 16, venc 23 -> série 23/10, 23/11, 23/12, 23/01/2027 sem duplicar outubro nem pular novembro', () => {
      const cronograma = gerarCronogramaParcelasCartao({
        conta: contaNubank,
        dataCompra: '2026-09-19',
        totalParcelas: 4,
      })

      expect(cronograma.map((c) => c.competencia)).toEqual([
        '2026-10',
        '2026-11',
        '2026-12',
        '2027-01',
      ])
      expect(cronograma.map((c) => c.dataVencimento)).toEqual([
        '2026-10-23',
        '2026-11-23',
        '2026-12-23',
        '2027-01-23',
      ])
      cronograma.forEach((item, i) => {
        expect(item.numeroParcela).toBe(i + 1)
        expect(item.dataVencimentoIso).toBe(`${item.dataVencimento}T12:00:00.000Z`)
      })
    })

    it('caso TORO via calcularCompetenciaEVencimento: cada parcela usa o ciclo da SUA compra (parcela 2: compra 19/10 > fech 16 -> 2026-11, venc 23/11)', () => {
      const esperado = [
        { numeroParcela: 1, competencia: '2026-10', dataVencimento: '2026-10-23' },
        { numeroParcela: 2, competencia: '2026-11', dataVencimento: '2026-11-23' },
        { numeroParcela: 3, competencia: '2026-12', dataVencimento: '2026-12-23' },
        { numeroParcela: 4, competencia: '2027-01', dataVencimento: '2027-01-23' },
      ]
      for (const e of esperado) {
        const res = calcularCompetenciaEVencimento({
          dataCompra: '2026-09-19',
          conta: contaNubank,
          metodoEhCredito: true,
          numeroParcela: e.numeroParcela,
          totalParcelas: 4,
        })
        expect(res.competencia).toBe(e.competencia)
        expect(res.dataVencimento).toBe(e.dataVencimento)
        expect(res.isCartaoCredito).toBe(true)
      }
    })

    it('borda que fez a migração 0147 falhar (caso TORO): o ajuste de ciclo da parcela N não se propaga às parcelas seguintes — cada parcela é recomputada independentemente', () => {
      // Na migração 0147, quando a compra da parcela N caía após o fechamento
      // (necessitando ajuste local), o offsetExtra ACUMULAVA e deslocava
      // permanentemente as parcelas seguintes: a série virava 23/10, 23/12, 23/01
      // (outubro duplicado na parcela 2, novembro ausente). A regra correta
      // recomputa cada parcela pelo ciclo da SUA compra.
      const parcela1 = calcularCicloParcelaCartao(contaNubank, '2026-09-19', 1, 4)
      const parcela2 = calcularCicloParcelaCartao(contaNubank, '2026-09-19', 2, 4)
      const parcela3 = calcularCicloParcelaCartao(contaNubank, '2026-09-19', 3, 4)
      const parcela4 = calcularCicloParcelaCartao(contaNubank, '2026-09-19', 4, 4)

      // Compra da parcela 1 (19/09) após fech 16/09 -> fatura de outubro
      expect(parcela1.competencia).toBe('2026-10')
      // Compra da parcela 2 (19/10) após fech 16/10 -> fatura de novembro (nunca outubro)
      expect(parcela2.competencia).toBe('2026-11')
      // As seguintes NÃO herdam ajuste da parcela 2 (nada acumulado)
      expect(parcela3.competencia).toBe('2026-12')
      expect(parcela4.competencia).toBe('2027-01')

      // Série estritamente crescente, um mês por parcela
      const serie = [parcela1, parcela2, parcela3, parcela4].map((p) => p.dataVencimento)
      for (let i = 1; i < serie.length; i++) {
        expect(serie[i] > serie[i - 1]).toBe(true)
        expect(
          competenciaOffsetMeses(
            [parcela1, parcela2, parcela3, parcela4][i - 1].competencia,
            [parcela1, parcela2, parcela3, parcela4][i].competencia,
          ),
        ).toBe(1)
      }
    })

    it('caso TORO: data_fim_calculada = vencimento da última parcela (23/01/2027)', () => {
      const dataFim = calcularDataFimParceladoCartao({
        conta: contaNubank,
        dataCompra: '2026-09-19',
        totalParcelas: 4,
      })
      expect(dataFim).toBe('2027-01-23')
    })

    it('caso TORO via simularCronogramaParcelas: parcelas futuras ficam em 2026-12 e 2027-01 (a 1 e a 2 vêm das ocorrências reais do banco)', () => {
      const cronograma = simularCronogramaParcelas({
        compromisso: {
          id: 'fhlmrrnph6hmbh3',
          descricao: 'Conserto TORO - OK/Nov',
          data_inicio: '2026-09-19',
          total_parcelas: 4,
          modalidade_parcelamento: 'parcelado',
          valor_parcela: 356.75,
        },
        conta: contaNubank,
        dataReferenciaHoje: '2026-11-06',
      })
      // Parcelas sem ocorrência real são projetadas pela regra corrigida
      const proj3 = cronograma.find((c) => c.numeroParcela === 3)
      const proj4 = cronograma.find((c) => c.numeroParcela === 4)
      expect(proj3?.competencia).toBe('2026-12')
      expect(proj3?.dataVencimento).toBe('2026-12-23')
      expect(proj4?.competencia).toBe('2027-01')
      expect(proj4?.dataVencimento).toBe('2027-01-23')
      expect(proj3?.valor).toBe(356.75)
      expect(proj4?.valor).toBe(356.75)
    })

    it('compra APÓS o fechamento: parcela 1 vai para a fatura do mês seguinte', () => {
      const cronograma = gerarCronogramaParcelasCartao({
        conta: contaNubank,
        dataCompra: '2026-09-17',
        totalParcelas: 3,
      })
      expect(cronograma[0].competencia).toBe('2026-10')
      expect(cronograma[0].dataVencimento).toBe('2026-10-23')
      expect(cronograma[1].competencia).toBe('2026-11')
      expect(cronograma[2].competencia).toBe('2026-12')
    })

    it('compra ANTES do fechamento: parcela 1 fica na fatura do mês corrente', () => {
      const cronograma = gerarCronogramaParcelasCartao({
        conta: contaNubank,
        dataCompra: '2026-09-15',
        totalParcelas: 3,
      })
      expect(cronograma[0].competencia).toBe('2026-09')
      expect(cronograma[0].dataVencimento).toBe('2026-09-23')
      expect(cronograma[1].competencia).toBe('2026-10')
      expect(cronograma[2].competencia).toBe('2026-11')
    })

    it('compra NO dia do fechamento: fica na fatura do mês corrente (compra <= fechamento)', () => {
      const cronograma = gerarCronogramaParcelasCartao({
        conta: contaNubank,
        dataCompra: '2026-09-16',
        totalParcelas: 2,
      })
      expect(cronograma[0].competencia).toBe('2026-09')
      expect(cronograma[1].competencia).toBe('2026-10')
    })

    it('data_fim_calculada = vencimento da ÚLTIMA parcela (Logan: 23/01/2027)', () => {
      const dataFim = calcularDataFimParceladoCartao({
        conta: contaNubank,
        dataCompra: '2026-08-29',
        totalParcelas: 5,
      })
      expect(dataFim).toBe('2027-01-23')
    })

    it('guarda de sanidade: nenhum par de vencimentos consecutivos é igual ou regressivo (série estritamente crescente)', () => {
      const casos: Array<{ dataCompra: string; totalParcelas: number }> = [
        { dataCompra: '2026-08-29', totalParcelas: 5 },
        { dataCompra: '2026-01-31', totalParcelas: 13 }, // dia 31 em meses curtos + virada de ano
        { dataCompra: '2026-09-17', totalParcelas: 24 },
        { dataCompra: '2026-02-28', totalParcelas: 6 },
      ]
      for (const caso of casos) {
        const cronograma = gerarCronogramaParcelasCartao({
          conta: contaNubank,
          dataCompra: caso.dataCompra,
          totalParcelas: caso.totalParcelas,
        })
        for (let i = 1; i < cronograma.length; i++) {
          expect(cronograma[i].dataVencimento).not.toBe(cronograma[i - 1].dataVencimento)
          expect(cronograma[i].dataVencimento > cronograma[i - 1].dataVencimento).toBe(true)
          expect(
            competenciaOffsetMeses(cronograma[i - 1].competencia, cronograma[i].competencia),
          ).toBe(1)
        }
      }
    })

    it('meses curtos: dia de vencimento clampado ao último dia do mês (31/01, 6x -> 28/02 não 02/03)', () => {
      const cronograma = gerarCronogramaParcelasCartao({
        conta: contaNubank,
        dataCompra: '2026-01-31',
        totalParcelas: 6,
      })
      expect(cronograma[0].dataVencimento).toBe('2026-02-23')
      expect(cronograma[1].dataVencimento).toBe('2026-03-23')
      // série continua sem duplicar nem pular mês
      expect(cronograma.map((c) => c.competencia)).toEqual([
        '2026-02',
        '2026-03',
        '2026-04',
        '2026-05',
        '2026-06',
        '2026-07',
      ])
    })
  })
})

// aux: diferença em meses entre duas competências 'YYYY-MM' (b - a)
function competenciaOffsetMeses(a: string, b: string): number {
  const [ya, ma] = a.split('-').map(Number)
  const [yb, mb] = b.split('-').map(Number)
  return (yb - ya) * 12 + (mb - ma)
}
