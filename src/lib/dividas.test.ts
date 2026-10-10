import { describe, expect, it } from 'vitest'
import {
  adicionarMeses,
  arredondarMoeda,
  calcularCronogramaComSaldo,
  calcularPaybackMaquina,
  calcularResumoDivida,
  calcularTotalMensalPrevisto,
  consolidarDemonstrativoGlobal,
  formatarRotuloMesAno,
  navegarMesCompetencia,
  projetarCaixaPorMaquina,
  renegociarCronograma,
  simularParcelasRestantes,
  type DividaRecord,
  type ParcelaRecord,
  type ReceitaRecord,
  type DespesaAvulsaRecord,
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

  describe('5. Caixa por Máquina e Projeção Mês a Mês com Despesas Avulsas', () => {
    it('despesa avulsa (ex: frete da máquina) consome o caixa antes das parcelas e ajusta a cobertura', () => {
      const divida: DividaRecord = {
        id: 'div_maquina_frete',
        nome: 'Prensa Térmica Industrial',
        credor: 'Fornecedor Equipamentos',
        valor_total: 50000,
        data_contratacao: '2025-01-01',
        saldo_inicial_caixa: 10000,
        status: 'ativa',
      }

      // 3 parcelas de 5.000
      const parcelas: ParcelaRecord[] = [
        {
          id: 'p1',
          divida: 'div_maquina_frete',
          numero: 1,
          data_vencimento: '2025-02-10',
          valor: 5000,
          status: 'pendente',
        },
        {
          id: 'p2',
          divida: 'div_maquina_frete',
          numero: 2,
          data_vencimento: '2025-03-10',
          valor: 5000,
          status: 'pendente',
        },
        {
          id: 'p3',
          divida: 'div_maquina_frete',
          numero: 3,
          data_vencimento: '2025-04-10',
          valor: 5000,
          status: 'pendente',
        },
      ]

      // Receita de 5.000 em fev
      const receitas: ReceitaRecord[] = [
        {
          id: 'rec_1',
          divida: 'div_maquina_frete',
          data: '2025-02-05',
          valor: 5000,
          descricao: 'Produção lote 1',
        },
      ]

      // Cenário A: SEM despesa avulsa
      // Caixa = 10.000 (saldo inicial) + 5.000 (receita) = 15.000. Cobre p1, p2 e p3 (15.000 total).
      const projecaoSemDespesa = projetarCaixaPorMaquina(
        divida,
        parcelas,
        receitas,
        [],
        '2025-02-01',
      )
      expect(projecaoSemDespesa.caixa_atual_disponivel).toBe(10000) // em 01/02 a receita ainda não ocorreu
      // Mas na simulação futura:
      expect(projecaoSemDespesa.ultima_parcela_coberta?.numero).toBe(2) // 10k cobrem p1 e p2

      // Cenário B: COM despesa avulsa de frete da máquina (ex: R$ 4.000 paga em 2025-01-15)
      // Caixa em 01/02 = 10.000 - 4.000 (frete) = 6.000.
      // Cobre p1 (5.000), sobra 1.000.
      // Não cobre p2 (faltará 4.000).
      const despesas: DespesaAvulsaRecord[] = [
        {
          id: 'desp_frete',
          divida: 'div_maquina_frete',
          data: '2025-01-15',
          valor: 4000,
          descricao: 'Frete da máquina não embutido nas parcelas',
          origem: 'Transportadora TransMetal',
        },
      ]

      const projecaoComDespesa = projetarCaixaPorMaquina(
        divida,
        parcelas,
        receitas,
        despesas,
        '2025-02-01',
      )
      expect(projecaoComDespesa.total_despesas_historicas).toBe(4000)
      expect(projecaoComDespesa.caixa_atual_disponivel).toBe(6000) // 10.000 - 4.000
      expect(projecaoComDespesa.ultima_parcela_coberta?.numero).toBe(1)
      expect(projecaoComDespesa.primeira_parcela_descoberta?.numero).toBe(2)
      expect(projecaoComDespesa.primeira_parcela_descoberta?.saldo_faltante).toBe(4000)
      expect(projecaoComDespesa.mes_esgotamento_caixa).toBe('2025-03')
    })

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

      const projecao = projetarCaixaPorMaquina(divida, parcelas, receitas, [], '2025-02-15')

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

      const global = consolidarDemonstrativoGlobal(
        [m1, m2],
        parcelasMap,
        receitasMap,
        new Map(),
        '2025-02-01',
      )

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

  describe('7. Demonstrativo Global com Despesas Avulsas', () => {
    it('consolida despesas avulsas no demonstrativo global com soma separada de parcelas', () => {
      const d1: DividaRecord = {
        id: 'div_g1',
        nome: 'Máquina Router',
        credor: 'Credor R',
        valor_total: 80000,
        data_contratacao: '2025-01-01',
        saldo_inicial_caixa: 15000,
        status: 'ativa',
      }

      const p1: ParcelaRecord[] = [
        {
          id: 'p_r1',
          divida: 'div_g1',
          numero: 1,
          data_vencimento: '2025-02-15',
          valor: 8000,
          status: 'paga',
          valor_pago: 8000,
        },
        {
          id: 'p_r2',
          divida: 'div_g1',
          numero: 2,
          data_vencimento: '2025-03-15',
          valor: 8000,
          status: 'pendente',
        },
      ]

      const desp1: DespesaAvulsaRecord[] = [
        {
          id: 'desp_g1',
          divida: 'div_g1',
          data: '2025-01-20',
          valor: 3500,
          descricao: 'Frete e seguro de transporte',
        },
      ]

      const pMap = new Map([['div_g1', p1]])
      const rMap = new Map<string, ReceitaRecord[]>([['div_g1', []]])
      const dMap = new Map([['div_g1', desp1]])

      const global = consolidarDemonstrativoGlobal([d1], pMap, rMap, dMap, '2025-02-01')
      expect(global.valor_total_consolidado).toBe(80000)
      expect(global.total_pago_consolidado).toBe(8000)
      expect(global.total_despesas_consolidado).toBe(3500)
      expect(global.saldo_devedor_consolidado).toBe(72000) // 80.000 - 8.000 (parcelas)

      // Total mensal previsto em janeiro com a despesa avulsa
      const mensJaneiro = calcularTotalMensalPrevisto({
        mesAno: '2025-01',
        dividas: [d1],
        parcelasPorDivida: pMap,
        receitasPorDivida: rMap,
        despesasPorDivida: dMap,
      })

      expect(mensJaneiro.total_despesas_mes).toBe(3500)
      expect(mensJaneiro.quantidade_despesas).toBe(1)
      expect(mensJaneiro.falta_arrecadar).toBe(3500) // sem receitas, falta 3.500
    })
  })

  describe('8. Navegação e Total Mensal Previsto no Demonstrativo Global', () => {
    it('navegarMesCompetencia avança e retrocede meses corretamente', () => {
      expect(navegarMesCompetencia('2026-10', 1)).toBe('2026-11')
      expect(navegarMesCompetencia('2026-10', -1)).toBe('2026-09')
      expect(navegarMesCompetencia('2026-12', 1)).toBe('2027-01')
      expect(navegarMesCompetencia('2026-01', -1)).toBe('2025-12')
    })

    it('formatarRotuloMesAno formata para português', () => {
      expect(formatarRotuloMesAno('2026-10')).toBe('Outubro de 2026')
      expect(formatarRotuloMesAno('2025-01')).toBe('Janeiro de 2025')
      expect(formatarRotuloMesAno('2027-12')).toBe('Dezembro de 2027')
    })

    it('calcula Total Mensal Previsto somando parcelas ativas, receitas e saldo a arrecadar', () => {
      const d1: DividaRecord = {
        id: 'div_d1',
        nome: 'Plotter Impressão',
        credor: 'Credor 1',
        valor_total: 100000,
        data_contratacao: '2026-01-01',
        status: 'ativa',
      }
      const d2: DividaRecord = {
        id: 'div_d2',
        nome: 'Laser Fibra',
        credor: 'Credor 2',
        valor_total: 200000,
        data_contratacao: '2026-01-01',
        status: 'ativa',
      }

      // Outubro 2026:
      // d1 tem: Parcela 1 paga (10.000) e Parcela 2 pendente (15.000)
      // d2 tem: Parcela 1 pendente (25.000)
      // Total parcelas do mês = 50.000
      // Total parcelas pagas = 10.000
      // Total parcelas em aberto = 40.000
      // Receitas em outubro: d1 gerou 12.000 e d2 gerou 8.000 = 20.000
      // Falta arrecadar = 40.000 - 20.000 = 20.000
      const parcelasMap = new Map<string, ParcelaRecord[]>([
        [
          'div_d1',
          [
            {
              id: 'p1_d1',
              divida: 'div_d1',
              numero: 1,
              data_vencimento: '2026-10-05',
              valor: 10000,
              status: 'paga',
              valor_pago: 10000,
            },
            {
              id: 'p2_d1',
              divida: 'div_d1',
              numero: 2,
              data_vencimento: '2026-10-20',
              valor: 15000,
              status: 'pendente',
            },
            {
              id: 'p3_d1',
              divida: 'div_d1',
              numero: 3,
              data_vencimento: '2026-11-20',
              valor: 15000,
              status: 'pendente',
            },
          ],
        ],
        [
          'div_d2',
          [
            {
              id: 'p1_d2',
              divida: 'div_d2',
              numero: 1,
              data_vencimento: '2026-10-15',
              valor: 25000,
              status: 'pendente',
            },
          ],
        ],
      ])

      const receitasMap = new Map<string, ReceitaRecord[]>([
        [
          'div_d1',
          [
            {
              id: 'r1_d1',
              divida: 'div_d1',
              data: '2026-10-08',
              valor: 12000,
              descricao: 'Receita plotter serviço A',
            },
            {
              id: 'r2_d1',
              divida: 'div_d1',
              data: '2026-11-05',
              valor: 5000,
              descricao: 'Receita de nov',
            },
          ],
        ],
        [
          'div_d2',
          [
            {
              id: 'r1_d2',
              divida: 'div_d2',
              data: '2026-10-12',
              valor: 8000,
              descricao: 'Receita laser serviço B',
            },
          ],
        ],
      ])

      const resultadoOutubro = calcularTotalMensalPrevisto({
        mesAno: '2026-10',
        dividas: [d1, d2],
        parcelasPorDivida: parcelasMap,
        receitasPorDivida: receitasMap,
      })

      expect(resultadoOutubro.mes_ano).toBe('2026-10')
      expect(resultadoOutubro.total_parcelas_mes).toBe(50000)
      expect(resultadoOutubro.total_parcelas_pagas).toBe(10000)
      expect(resultadoOutubro.total_parcelas_aberto).toBe(40000)
      expect(resultadoOutubro.total_receitas_mes).toBe(20000)
      expect(resultadoOutubro.falta_arrecadar).toBe(20000)
      expect(resultadoOutubro.superavit).toBe(0)
      expect(resultadoOutubro.quantidade_parcelas).toBe(3)
      expect(resultadoOutubro.quantidade_parcelas_aberto).toBe(2)
      expect(resultadoOutubro.quantidade_parcelas_pagas).toBe(1)
      expect(resultadoOutubro.quantidade_receitas).toBe(2)
      expect(resultadoOutubro.parcelas).toHaveLength(3)
      expect(resultadoOutubro.receitas).toHaveLength(2)

      // Testa mês seguinte (Novembro 2026)
      const resultadoNovembro = calcularTotalMensalPrevisto({
        mesAno: '2026-11',
        dividas: [d1, d2],
        parcelasPorDivida: parcelasMap,
        receitasPorDivida: receitasMap,
      })

      expect(resultadoNovembro.mes_ano).toBe('2026-11')
      expect(resultadoNovembro.total_parcelas_mes).toBe(15000)
      expect(resultadoNovembro.total_parcelas_aberto).toBe(15000)
      expect(resultadoNovembro.total_receitas_mes).toBe(5000)
      expect(resultadoNovembro.falta_arrecadar).toBe(10000)

      // Testa mês com superávit (receitas > parcelas em aberto)
      const resultadoSuperavit = calcularTotalMensalPrevisto({
        mesAno: '2026-10',
        dividas: [d1], // Apenas d1: em aberto tem 15.000, receitas tem 12.000. Se receita fosse 25.000:
        parcelasPorDivida: parcelasMap,
        receitasPorDivida: new Map([
          [
            'div_d1',
            [
              {
                id: 'rx',
                divida: 'div_d1',
                data: '2026-10-10',
                valor: 25000,
                descricao: 'Receita grande',
              },
            ],
          ],
        ]),
      })
      // Aberto: 15.000 (parcela 2), Receita: 25.000
      expect(resultadoSuperavit.falta_arrecadar).toBe(0)
      expect(resultadoSuperavit.superavit).toBe(10000)
    })

    it('retorna estado vazio zerado para mês sem parcelas nem receitas', () => {
      const d1: DividaRecord = {
        id: 'div_1',
        nome: 'Dívida 1',
        credor: 'Credor',
        valor_total: 50000,
        data_contratacao: '2026-01-01',
        status: 'ativa',
      }
      const resultadoVazio = calcularTotalMensalPrevisto({
        mesAno: '2030-05',
        dividas: [d1],
        parcelasPorDivida: new Map(),
        receitasPorDivida: new Map(),
      })

      expect(resultadoVazio.mes_ano).toBe('2030-05')
      expect(resultadoVazio.total_parcelas_mes).toBe(0)
      expect(resultadoVazio.total_parcelas_aberto).toBe(0)
      expect(resultadoVazio.total_parcelas_pagas).toBe(0)
      expect(resultadoVazio.total_receitas_mes).toBe(0)
      expect(resultadoVazio.falta_arrecadar).toBe(0)
      expect(resultadoVazio.superavit).toBe(0)
      expect(resultadoVazio.quantidade_parcelas).toBe(0)
      expect(resultadoVazio.quantidade_receitas).toBe(0)
    })

    it('ignora dívidas inativas ou quitadas se apenasAtivas for true (padrão)', () => {
      const dQuitada: DividaRecord = {
        id: 'div_quitada',
        nome: 'Dívida Quitada',
        credor: 'Credor',
        valor_total: 50000,
        data_contratacao: '2026-01-01',
        status: 'quitada',
      }
      const parcelasMap = new Map<string, ParcelaRecord[]>([
        [
          'div_quitada',
          [
            {
              id: 'p_q',
              divida: 'div_quitada',
              numero: 1,
              data_vencimento: '2026-10-10',
              valor: 5000,
              status: 'pendente',
            },
          ],
        ],
      ])

      const res = calcularTotalMensalPrevisto({
        mesAno: '2026-10',
        dividas: [dQuitada],
        parcelasPorDivida: parcelasMap,
        receitasPorDivida: new Map(),
      })

      expect(res.quantidade_parcelas).toBe(0)
      expect(res.total_parcelas_mes).toBe(0)
    })
  })
})
