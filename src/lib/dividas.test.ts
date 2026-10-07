import { describe, expect, it } from 'vitest'
import {
  adicionarMeses,
  arredondarMoeda,
  calcularCronogramaComSaldo,
  calcularPaybackMaquina,
  calcularResumoDivida,
  consolidarDemonstrativoGlobal,
  projetarCaixaPorMaquina,
  renegociarCronograma,
  simularParcelasRestantes,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
} from './dividas'

describe('Módulo de Dívidas Isolado - Regras e Cálculos Puros', () => {
  describe('adicionarMeses e arredondamento', () => {
    it('soma meses preservando o dia ou ajustando ao fim do mês', () => {
      expect(adicionarMeses('2025-01-15', 1)).toBe('2025-02-15')
      expect(adicionarMeses('2025-01-31', 1)).toBe('2025-02-28')
      expect(adicionarMeses('2025-10-10', 3)).toBe('2026-01-10')
    })

    it('arredonda moeda para duas casas decimais com precisão', () => {
      expect(arredondarMoeda(10.555)).toBe(10.56)
      expect(arredondarMoeda(10.554)).toBe(10.55)
    })
  })

  describe('1. Cadastro e Resumo de Dívidas', () => {
    const dividaBase: DividaRecord = {
      id: 'div_1',
      nome: 'Torno CNC Máquina 1',
      credor: 'Banco Sicredi',
      valor_total: 100000,
      data_contratacao: '2025-01-01',
      status: 'ativa',
    }

    it('calcula total pago, saldo devedor e percentual quitado com pagamentos parciais', () => {
      const parcelas: ParcelaRecord[] = [
        {
          id: 'p1',
          divida: 'div_1',
          numero: 1,
          data_vencimento: '2025-01-10',
          valor: 10000,
          status: 'paga',
          data_pagamento: '2025-01-09',
          valor_pago: 10000,
          is_entrada: true,
        },
        {
          id: 'p2',
          divida: 'div_1',
          numero: 2,
          data_vencimento: '2025-02-10',
          valor: 10000,
          status: 'paga',
          data_pagamento: '2025-02-10',
          valor_pago: 10000,
          is_entrada: true,
        },
        {
          id: 'p3',
          divida: 'div_1',
          numero: 3,
          data_vencimento: '2025-03-10',
          valor: 10000,
          status: 'pendente',
        },
        {
          id: 'p4',
          divida: 'div_1',
          numero: 4,
          data_vencimento: '2025-04-10',
          valor: 10000,
          status: 'pendente',
        },
      ]

      const resumo = calcularResumoDivida(dividaBase, parcelas, '2025-02-15')
      expect(resumo.valor_total).toBe(100000)
      expect(resumo.total_pago).toBe(20000)
      expect(resumo.saldo_devedor).toBe(80000)
      expect(resumo.percentual_quitado).toBe(20)
      expect(resumo.parcelas_pagas).toBe(2)
      expect(resumo.parcelas_pendentes).toBe(2)
      expect(resumo.proxima_parcela?.id).toBe('p3')
    })
  })

  describe('2. Parcelas de Valor Irregular e Simulação', () => {
    it('divide montante restante em parcelas iguais ajustando centavos na última parcela', () => {
      const simuladas = simularParcelasRestantes({
        dividaId: 'div_1',
        montanteRestante: 1000,
        quantidadeParcelas: 3,
        primeiroVencimento: '2025-05-10',
        numeroInicial: 3,
      })

      expect(simuladas).toHaveLength(3)
      expect(simuladas[0].numero).toBe(3)
      expect(simuladas[0].valor).toBe(333.33)
      expect(simuladas[0].data_vencimento).toBe('2025-05-10')

      expect(simuladas[1].numero).toBe(4)
      expect(simuladas[1].valor).toBe(333.33)
      expect(simuladas[1].data_vencimento).toBe('2025-06-10')

      // 1000 - 666.66 = 333.34
      expect(simuladas[2].numero).toBe(5)
      expect(simuladas[2].valor).toBe(333.34)
      expect(simuladas[2].data_vencimento).toBe('2025-07-10')

      const soma = simuladas.reduce((acc, p) => acc + p.valor, 0)
      expect(arredondarMoeda(soma)).toBe(1000)
    })

    it('permite valores customizados/irregulares por parcela', () => {
      const simuladas = simularParcelasRestantes({
        dividaId: 'div_1',
        montanteRestante: 50000,
        quantidadeParcelas: 3,
        primeiroVencimento: '2025-05-15',
        numeroInicial: 1,
        valoresCustomizados: [15000, 20000, 15000],
      })

      expect(simuladas).toHaveLength(3)
      expect(simuladas[0].valor).toBe(15000)
      expect(simuladas[1].valor).toBe(20000)
      expect(simuladas[2].valor).toBe(15000)
    })

    it('renegociação: recalcula parcelas a partir da parcela X preservando histórico das pagas', () => {
      const divida: DividaRecord = {
        id: 'div_1',
        nome: 'Fresadora CNC',
        credor: 'Finame',
        valor_total: 60000,
        data_contratacao: '2025-01-01',
        status: 'ativa',
      }

      const parcelasAtuais: ParcelaRecord[] = [
        {
          id: 'p1',
          divida: 'div_1',
          numero: 1,
          data_vencimento: '2025-01-10',
          valor: 10000,
          status: 'paga',
          data_pagamento: '2025-01-10',
          valor_pago: 10000,
        },
        {
          id: 'p2',
          divida: 'div_1',
          numero: 2,
          data_vencimento: '2025-02-10',
          valor: 10000,
          status: 'paga',
          data_pagamento: '2025-02-10',
          valor_pago: 10000,
        },
        {
          id: 'p3',
          divida: 'div_1',
          numero: 3,
          data_vencimento: '2025-03-10',
          valor: 20000,
          status: 'pendente',
        },
        {
          id: 'p4',
          divida: 'div_1',
          numero: 4,
          data_vencimento: '2025-04-10',
          valor: 20000,
          status: 'pendente',
        },
      ]

      // Renegociar a partir da parcela 3: os 40.000 restantes serão divididos em 4 vezes de 10.000 a partir de maio
      const renegociadas = renegociarCronograma({
        divida,
        parcelasAtuais,
        aPartirDoNumero: 3,
        novoMontanteRestante: 40000,
        novaQuantidadeParcelas: 4,
        primeiroNovoVencimento: '2025-05-10',
      })

      // Deve preservar p1 e p2 exatamente
      expect(renegociadas).toHaveLength(6)
      expect(renegociadas[0].id).toBe('p1')
      expect(renegociadas[0].status).toBe('paga')
      expect(renegociadas[1].id).toBe('p2')
      expect(renegociadas[1].status).toBe('paga')

      // Novas parcelas
      expect(renegociadas[2].numero).toBe(3)
      expect(renegociadas[2].valor).toBe(10000)
      expect(renegociadas[2].data_vencimento).toBe('2025-05-10')
      expect(renegociadas[3].numero).toBe(4)
      expect(renegociadas[3].valor).toBe(10000)
      expect(renegociadas[4].numero).toBe(5)
      expect(renegociadas[4].valor).toBe(10000)
      expect(renegociadas[5].numero).toBe(6)
      expect(renegociadas[5].valor).toBe(10000)
    })
  })

  describe('3. Cronograma com Saldo Restante após Cada Parcela', () => {
    it('calcula o saldo devedor restante decrescente em cada linha do cronograma', () => {
      const parcelas: ParcelaRecord[] = [
        {
          id: '1',
          divida: 'd',
          numero: 1,
          data_vencimento: '2025-01-10',
          valor: 25000,
          status: 'paga',
          valor_pago: 25000,
        },
        {
          id: '2',
          divida: 'd',
          numero: 2,
          data_vencimento: '2025-02-10',
          valor: 25000,
          status: 'pendente',
        },
        {
          id: '3',
          divida: 'd',
          numero: 3,
          data_vencimento: '2025-03-10',
          valor: 50000,
          status: 'pendente',
        },
      ]

      const cronograma = calcularCronogramaComSaldo(100000, parcelas)
      expect(cronograma[0].saldo_restante_apos).toBe(75000)
      expect(cronograma[1].saldo_restante_apos).toBe(50000)
      expect(cronograma[2].saldo_restante_apos).toBe(0)
    })
  })

  describe('4. Receitas por Máquina e Payback', () => {
    it('calcula parcelas quitadas cobertas por receitas vs cobertas do bolso', () => {
      const divida: DividaRecord = {
        id: 'div_laser',
        nome: 'Máquina de Corte Laser',
        credor: 'BNDES',
        valor_total: 120000,
        data_contratacao: '2025-01-01',
        status: 'ativa',
      }

      // Já foram pagas 3 parcelas de 10.000 = 30.000 pagos
      const parcelas: ParcelaRecord[] = [
        {
          id: 'p1',
          divida: 'div_laser',
          numero: 1,
          data_vencimento: '2025-01-10',
          valor: 10000,
          status: 'paga',
          valor_pago: 10000,
        },
        {
          id: 'p2',
          divida: 'div_laser',
          numero: 2,
          data_vencimento: '2025-02-10',
          valor: 10000,
          status: 'paga',
          valor_pago: 10000,
        },
        {
          id: 'p3',
          divida: 'div_laser',
          numero: 3,
          data_vencimento: '2025-03-10',
          valor: 10000,
          status: 'paga',
          valor_pago: 10000,
        },
        {
          id: 'p4',
          divida: 'div_laser',
          numero: 4,
          data_vencimento: '2025-04-10',
          valor: 10000,
          status: 'pendente',
        },
      ]

      // A máquina gerou 22.000 de receitas até agora
      const receitas: ReceitaRecord[] = [
        {
          id: 'r1',
          divida: 'div_laser',
          data: '2025-01-20',
          valor: 7000,
          descricao: 'Serviço corte chapa cliente A',
        },
        {
          id: 'r2',
          divida: 'div_laser',
          data: '2025-02-18',
          valor: 8000,
          descricao: 'Usinagem lote 500 pcs',
        },
        {
          id: 'r3',
          divida: 'div_laser',
          data: '2025-03-15',
          valor: 7000,
          descricao: 'Produção painéis',
        },
      ]

      const payback = calcularPaybackMaquina(divida, parcelas, receitas)

      expect(payback.total_investimento).toBe(120000)
      expect(payback.total_pago).toBe(30000)
      expect(payback.total_receitas).toBe(22000)
      expect(payback.pago_coberto_receitas).toBe(22000) // Coberto por receitas da máquina
      expect(payback.pago_coberto_bolso).toBe(8000) // R$ 8.000 veio do bolso da empresa
      expect(payback.percentual_cobertura_pago).toBe(73.33) // 22k / 30k = ~73.33%
      expect(payback.percentual_payback_investimento).toBe(18.33) // 22k / 120k = ~18.33%
      expect(payback.payback_alcancado).toBe(false)
      expect(payback.deficit_para_payback).toBe(98000)
    })

    it('reconhece payback atingido quando receitas superam o investimento total', () => {
      const divida: DividaRecord = {
        id: 'div_pequena',
        nome: 'Furadeira de Bancada',
        credor: 'Fornecedor',
        valor_total: 10000,
        data_contratacao: '2025-01-01',
        status: 'ativa',
      }
      const parcelas: ParcelaRecord[] = [
        {
          id: 'p1',
          divida: 'div_pequena',
          numero: 1,
          data_vencimento: '2025-01-10',
          valor: 5000,
          status: 'paga',
        },
        {
          id: 'p2',
          divida: 'div_pequena',
          numero: 2,
          data_vencimento: '2025-02-10',
          valor: 5000,
          status: 'paga',
        },
      ]
      const receitas: ReceitaRecord[] = [
        {
          id: 'r1',
          divida: 'div_pequena',
          data: '2025-01-15',
          valor: 6000,
          descricao: 'Serviço A',
        },
        {
          id: 'r2',
          divida: 'div_pequena',
          data: '2025-02-15',
          valor: 6000,
          descricao: 'Serviço B',
        },
      ]

      const payback = calcularPaybackMaquina(divida, parcelas, receitas)
      expect(payback.payback_alcancado).toBe(true)
      expect(payback.deficit_para_payback).toBe(0)
      expect(payback.percentual_payback_investimento).toBe(100)
    })
  })

  describe('5. Caixa por Máquina e Projeção Mês a Mês', () => {
    it('simula saldo mês a mês e marca qual é a última parcela coberta e onde faltará caixa', () => {
      const divida: DividaRecord = {
        id: 'div_torno',
        nome: 'Torno CNC Mazak',
        credor: 'Banco Santander',
        valor_total: 60000,
        data_contratacao: '2025-01-01',
        saldo_inicial_caixa: 5000, // Saldo inicial destinado à máquina
        status: 'ativa',
      }

      // Parcela 1 já paga (10.000)
      // Parcelas 2, 3, 4 e 5 a vencer de 10.000 cada
      const parcelas: ParcelaRecord[] = [
        {
          id: 'p1',
          divida: 'div_torno',
          numero: 1,
          data_vencimento: '2025-01-15',
          valor: 10000,
          status: 'paga',
          valor_pago: 10000,
        },
        {
          id: 'p2',
          divida: 'div_torno',
          numero: 2,
          data_vencimento: '2025-02-15',
          valor: 10000,
          status: 'pendente',
        },
        {
          id: 'p3',
          divida: 'div_torno',
          numero: 3,
          data_vencimento: '2025-03-15',
          valor: 10000,
          status: 'pendente',
        },
        {
          id: 'p4',
          divida: 'div_torno',
          numero: 4,
          data_vencimento: '2025-04-15',
          valor: 10000,
          status: 'pendente',
        },
        {
          id: 'p5',
          divida: 'div_torno',
          numero: 5,
          data_vencimento: '2025-05-15',
          valor: 10000,
          status: 'pendente',
        },
      ]

      // Receitas realizadas até hoje (15/02):
      // R$ 5.000 em jan + R$ 22.000 em fev
      // Total receitas históricas = 27.000
      // Caixa hoje = Saldo inicial (5.000) + Receitas (27.000) - Pago p1 (10.000) = R$ 22.000
      const receitas: ReceitaRecord[] = [
        {
          id: 'r1',
          divida: 'div_torno',
          data: '2025-01-20',
          valor: 5000,
          descricao: 'Serviço Jan',
        },
        {
          id: 'r2',
          divida: 'div_torno',
          data: '2025-02-10',
          valor: 22000,
          descricao: 'Serviço Fev',
        },
      ]

      const projecao = projetarCaixaPorMaquina(divida, parcelas, receitas, '2025-02-15')

      expect(projecao.caixa_atual_disponivel).toBe(22000)
      // Com R$ 22.000 disponíveis hoje:
      // Consegue pagar Parcela 2 (10.000) -> sobra 12.000
      // Consegue pagar Parcela 3 (10.000) -> sobra 2.000
      // Não consegue pagar Parcela 4 (10.000 necessitaria de mais 8.000)
      expect(projecao.ultima_parcela_coberta?.numero).toBe(3)
      expect(projecao.primeira_parcela_descoberta?.numero).toBe(4)
      expect(projecao.primeira_parcela_descoberta?.saldo_faltante).toBe(8000)
      expect(projecao.mes_esgotamento_caixa).toBe('2025-04')
    })
  })

  describe('6. Demonstrativo Global (Visão Consolidada sem Compartilhar Caixa)', () => {
    it('consolida duas máquinas mantendo caixas isolados e aponta qual parcela de qual máquina fica descoberta primeiro', () => {
      // Máquina 1: Tem caixa folgado que cobre suas parcelas de fev e mar
      const m1: DividaRecord = {
        id: 'm1',
        nome: 'Máquina Laser A',
        credor: 'Banco X',
        valor_total: 40000,
        data_contratacao: '2025-01-01',
        saldo_inicial_caixa: 30000,
        status: 'ativa',
      }
      const pM1: ParcelaRecord[] = [
        {
          id: 'p_m1_1',
          divida: 'm1',
          numero: 1,
          data_vencimento: '2025-02-10',
          valor: 10000,
          status: 'pendente',
        },
        {
          id: 'p_m1_2',
          divida: 'm1',
          numero: 2,
          data_vencimento: '2025-03-10',
          valor: 10000,
          status: 'pendente',
        },
      ]

      // Máquina 2: Caixa baixo (apenas 5.000), parcela de 10.000 vence em 2025-02-20
      const m2: DividaRecord = {
        id: 'm2',
        nome: 'Máquina Prensa B',
        credor: 'Banco Y',
        valor_total: 30000,
        data_contratacao: '2025-01-01',
        saldo_inicial_caixa: 5000,
        status: 'ativa',
      }
      const pM2: ParcelaRecord[] = [
        {
          id: 'p_m2_1',
          divida: 'm2',
          numero: 1,
          data_vencimento: '2025-02-20',
          valor: 10000,
          status: 'pendente',
        },
      ]

      const parcelasMap = new Map<string, ParcelaRecord[]>([
        ['m1', pM1],
        ['m2', pM2],
      ])
      const receitasMap = new Map<string, ReceitaRecord[]>([
        ['m1', []],
        ['m2', []],
      ])

      const global = consolidarDemonstrativoGlobal([m1, m2], parcelasMap, receitasMap, '2025-02-01')

      expect(global.total_dividas).toBe(2)
      expect(global.valor_total_consolidado).toBe(70000)
      expect(global.saldo_devedor_consolidado).toBe(70000)

      // Primeira parcela descoberta no tempo global deve ser a da Máquina 2 em 2025-02-20
      expect(global.primeira_descoberta_global).toBeDefined()
      expect(global.primeira_descoberta_global?.divida_id).toBe('m2')
      expect(global.primeira_descoberta_global?.numero).toBe(1)
      expect(global.primeira_descoberta_global?.data_vencimento).toBe('2025-02-20')
      expect(global.primeira_descoberta_global?.coberta_pela_maquina).toBe(false)

      // A parcela da m1 em 2025-02-10 deve constar como coberta
      const itemM1 = global.cronograma_unificado.find((i) => i.parcela_id === 'p_m1_1')
      expect(itemM1?.coberta_pela_maquina).toBe(true)
    })
  })
})
