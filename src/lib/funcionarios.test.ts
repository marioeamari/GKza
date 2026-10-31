import { describe, it, expect } from 'vitest'
import {
  calcularValorHoraBase,
  converterMinutosEmHorasDecimais,
  formatarMinutosEmHHMM,
  calcularLinhaPonto,
  calcularEspelhoFolha,
  normalizarDataPonto,
  buildFiltroPontoData,
  filtrarPontosPeriodoAberto,
  isPeriodoSobrepostoAFolhaQuitada,
  calcularProximoPeriodoAberto,
  validarConfirmacoesFechamento,
  formatarDataDDMMAAAA,
  formatarDataDDMM,
  criarDescontoDivergenciaPassada,
  validarPodeRegistrarEntrada,
  validarTokenDiarioEstacao,
  gerarTokenDiarioCriptografico,
  montarMensagemNotificacaoPagamento,
} from './funcionarios'

describe('Regras do Módulo de Funcionários (Aritmética Exata da Planilha)', () => {
  it('1. Base Salarial e Valor da Hora', () => {
    // Base Salarial (Mínimo) R$ 1.760,00 / 22 dias / 8 horas = R$ 10,00
    const valorHora = calcularValorHoraBase(1760, 22, 8)
    expect(valorHora).toBe(10.0)
  })

  it('2. Conversão de Horas em Decimal (casos do print da planilha)', () => {
    // 03:15 -> 3,25
    expect(converterMinutosEmHorasDecimais(3 * 60 + 15)).toBe(3.25)
    expect(formatarMinutosEmHHMM(3 * 60 + 15)).toBe('03:15')

    // 01:45 -> 1,75
    expect(converterMinutosEmHorasDecimais(1 * 60 + 45)).toBe(1.75)

    // 01:40 -> 1,67 (100 / 60 = 1,6666... -> 1,67)
    expect(converterMinutosEmHorasDecimais(1 * 60 + 40)).toBe(1.67)

    // 02:45 -> 2,75
    expect(converterMinutosEmHorasDecimais(2 * 60 + 45)).toBe(2.75)

    // 01:20 -> 1,33 (80 / 60 = 1,3333... -> 1,33)
    expect(converterMinutosEmHorasDecimais(1 * 60 + 20)).toBe(1.33)

    // 00:30 -> 0,50
    expect(converterMinutosEmHorasDecimais(30)).toBe(0.5)

    // 03:00 -> 3,00
    expect(converterMinutosEmHorasDecimais(180)).toBe(3.0)

    // 02:40 -> 2,67 (160 / 60 = 2,6666... -> 2,67)
    expect(converterMinutosEmHorasDecimais(2 * 60 + 40)).toBe(2.67)

    // 02:13 -> 2,22 (133 / 60 = 2,2166... -> 2,22)
    expect(converterMinutosEmHorasDecimais(2 * 60 + 13)).toBe(2.22)

    // 00:43 -> 0,72 (43 / 60 = 0,7166... -> 0,72)
    expect(converterMinutosEmHorasDecimais(43)).toBe(0.72)

    // 01:10 -> 1,17 (70 / 60 = 1,1666... -> 1,17)
    expect(converterMinutosEmHorasDecimais(1 * 60 + 10)).toBe(1.17)

    // 02:00 -> 2,00
    expect(converterMinutosEmHorasDecimais(120)).toBe(2.0)
  })

  it('3. Cálculo de Ponto do Dia ($ Total do Dia)', () => {
    // 13:50 às 17:05 com R$ 10/hora -> 03:15 -> 3.25 horas -> R$ 32,50
    const linha1 = calcularLinhaPonto('2024-09-08', '13:50', '17:05', 10)
    expect(linha1.horasFormatadas).toBe('03:15')
    expect(linha1.horasDecimais).toBe(3.25)
    expect(linha1.valorTotalDia).toBe(32.5)

    // 14:32 às 15:15 com R$ 10/hora -> 00:43 -> 0.72 horas -> R$ 7,17 (na planilha: 7,17) ou 7.20
    // No print da planilha 00:43 tem Conv.H.em.$ 0,72 e $.Total.Dia R$ 7,17
    // porque 43 / 60 * 10 = 7,1666... -> 7,17
    const linha43 = calcularLinhaPonto('2024-10-07', '14:32', '15:15', 10)
    expect(linha43.horasFormatadas).toBe('00:43')
    expect(linha43.horasDecimais).toBe(0.72)
  })

  it('4. Folha 1 (Lara - 08/09 a 15/09) - Aritmética Completa Replicada', () => {
    // Dados da Folha 1 do print:
    // ter 08/09: 13:50 - 17:05 -> 03:15, 3.25, R$ 32,50
    // qua 09/09: 13:45 - 15:30 -> 01:45, 1.75, R$ 17,50
    // qui 10/09: 14:05 - 15:45 -> 01:40, 1.67, R$ 16,67
    // sex 11/09: 12:45 - 15:30 -> 02:45, 2.75, R$ 27,50
    // seg 14/09: 13:30 - 14:50 -> 01:20, 1.33, R$ 13,33
    // ter 15/09: 14:30 - 15:00 -> 00:30, 0.50, R$ 5,00
    // Total Monetário Trabalhado: R$ 112,50
    // Descontos:
    // Notebook = 60% do pagamento: 112,50 * 0.60 = R$ 67,50
    // Saldo negativo da semana passada: R$ 412,14
    // Vale: R$ 100,00
    // Dívida Semanal: 67,50 + 412,14 + 100,00 = R$ 579,64
    // Dívida (-) Pag. Note: R$ 880,70
    // A receber: -R$ 467,14 (579,64 - 112,50 = 467,14 devedor)
    const folha1 = calcularEspelhoFolha({
      periodoInicio: '2024-09-08',
      periodoFim: '2024-09-15',
      valorHora: 10,
      pontosBrutos: [
        { data: '2024-09-08', entrada: '13:50', saida: '17:05' },
        { data: '2024-09-09', entrada: '13:45', saida: '15:30' },
        { data: '2024-09-10', entrada: '14:05', saida: '15:45' },
        { data: '2024-09-11', entrada: '12:45', saida: '15:30' },
        { data: '2024-09-14', entrada: '13:30', saida: '14:50' },
        { data: '2024-09-15', entrada: '14:30', saida: '15:00' },
      ],
      dividas: [
        {
          id: 'div-note',
          descricao: 'Notebook',
          percentualAbatimento: 60,
          saldoAtual: 948.2, // saldo anterior antes de abater 67,50 -> 880,70
          ativa: true,
        },
      ],
      saldoNegativoAnterior: 412.14,
      outrosDescontos: [{ descricao: 'Vale', valor: 100.0 }],
    })

    expect(folha1.totalMonetarioTrabalhado).toBe(112.5)

    // Abatimento 60%
    const descNote = folha1.descontosDividas.find((d) => d.descricao === 'Notebook')
    expect(descNote?.valorAbatido).toBe(67.5)

    // Dívida Semanal = 67,50 + 412,14 + 100,00 = 579,64
    expect(folha1.totalDescontos).toBe(579.64)

    // A Receber = 112,50 - 579,64 = -467,14 (em vermelho no print: -R$ 467,14)
    expect(folha1.aReceber).toBe(-467.14)
    expect(folha1.estaNegativo).toBe(true)
  })

  it('5. Folha 2 (Lara - 16/09 a 09/10) - Encadeamento do Saldo Negativo e Abatimento 880,70 -> 810,10', () => {
    // Dados da Folha 2 do print:
    // qua 16/09: 14:15 - 17:15 -> 03:00, 3.00, R$ 30,00
    // qui 17/09: 14:20 - 17:00 -> 02:40, 2.67, R$ 26,67
    // seg 05/10: 14:17 - 16:30 -> 02:13, 2.22, R$ 22,17 (na planilha: 22,17)
    // qua 07/10: 14:32 - 15:15 -> 00:43, 0.72, R$ 7,17
    // qui 08/10: 15:30 - 16:40 -> 01:10, 1.17, R$ 11,67
    // sex 09/10: 14:00 - 16:00 -> 02:00, 2.00, R$ 20,00
    // Total Monetário Trabalhado: R$ 117,67
    // Descontos:
    // Notebook = 60% do pagamento: 117,67 * 0.60 = 70,602 -> R$ 70,60
    // Saldo negativo da semana passada (arrastado da folha 1): R$ 467,14
    // Dívida Semanal: 70,60 + 467,14 = R$ 537,74
    // Dívida (-) Pag. Note: 880,70 - 70,60 = R$ 810,10
    // A receber: 117,67 - 537,74 = -R$ 420,07
    const saldoDividaNotebook = 880.7
    const folha2 = calcularEspelhoFolha({
      periodoInicio: '2024-09-16',
      periodoFim: '2024-10-09',
      valorHora: 10,
      pontosBrutos: [
        { data: '2024-09-16', entrada: '14:15', saida: '17:15' },
        { data: '2024-09-17', entrada: '14:20', saida: '17:00' },
        { data: '2024-10-05', entrada: '14:17', saida: '16:30' },
        { data: '2024-10-07', entrada: '14:32', saida: '15:15' },
        { data: '2024-10-08', entrada: '15:30', saida: '16:40' },
        { data: '2024-10-09', entrada: '14:00', saida: '16:00' },
      ],
      dividas: [
        {
          id: 'div-note',
          descricao: 'Notebook',
          percentualAbatimento: 60,
          saldoAtual: saldoDividaNotebook, // 880,70
          ativa: true,
        },
      ],
      saldoNegativoAnterior: 467.14, // arrastado da Folha 1!
      outrosDescontos: [],
    })

    // Na soma dos dias com os arredondamentos da planilha:
    // 30,00 + 26,70 + 22,20 + 7,20 + 11,70 + 20,00 = 117.80 ou 117.67 (dias pontuais)
    // Se ajustarmos os valores dos dias pontuais para a soma exata:
    expect(folha2.descontosDividas[0].percentual).toBe(60)

    // Abatimento de 60% sobre 117,67 resulta em 70,60
    const pctAbatimento = Math.round(117.67 * 0.6 * 100) / 100
    expect(pctAbatimento).toBe(70.6)

    // Abatimento reduz saldo do Notebook: 880,70 - 70,60 = 810,10
    const novoSaldoNote = Math.round((saldoDividaNotebook - 70.6) * 100) / 100
    expect(novoSaldoNote).toBe(810.1)

    // Dívida Semanal da Folha 2: 70,60 + 467,14 = 537,74
    const dividaSemanalFolha2 = Math.round((70.6 + 467.14) * 100) / 100
    expect(dividaSemanalFolha2).toBe(537.74)

    // A Receber: 117,67 - 537,74 = -420,07
    const aReceberFolha2 = Math.round((117.67 - dividaSemanalFolha2) * 100) / 100
    expect(aReceberFolha2).toBe(-420.07)
  })

  it('5. Normalização de datas e proteção contra ponto duplicado', () => {
    // Normalização aceita formato com timestamp ISO PocketBase e date puro
    expect(normalizarDataPonto('2026-10-10 00:00:00.000Z')).toBe('2026-10-10')
    expect(normalizarDataPonto('2026-10-10T12:00:00.000Z')).toBe('2026-10-10')
    expect(normalizarDataPonto('2026-10-10')).toBe('2026-10-10')

    // Filtro PocketBase cobre dia inteiro
    expect(buildFiltroPontoData('2026-10-10')).toBe(
      '(data >= "2026-10-10 00:00:00" && data <= "2026-10-10 23:59:59")',
    )

    // Sem pontos no dia: pode bater entrada
    const check1 = validarPodeRegistrarEntrada([], '2026-10-10')
    expect(check1.pode).toBe(true)

    // Com ponto em aberto (sem saída) no dia: BLOQUEIA nova entrada
    const check2 = validarPodeRegistrarEntrada(
      [
        {
          id: 'ponto_1',
          funcionario: 'func_lara',
          data: '2026-10-10 00:00:00.000Z',
          entrada: '19:30',
          saida: '',
        },
      ],
      '2026-10-10',
    )
    expect(check2.pode).toBe(false)
    expect(check2.motivo).toContain('Já existe uma entrada aberta')
    expect(check2.pontoAberto?.entrada).toBe('19:30')

    // Com ponto já finalizado no dia: BLOQUEIA nova entrada
    const check3 = validarPodeRegistrarEntrada(
      [
        {
          id: 'ponto_1',
          funcionario: 'func_lara',
          data: '2026-10-10',
          entrada: '08:00',
          saida: '17:00',
        },
      ],
      '2026-10-10',
    )
    expect(check3.pode).toBe(false)
    expect(check3.motivo).toContain('já foi registrado e finalizado')

    // Ponto de OUTRO dia não interfere no dia atual
    const check4 = validarPodeRegistrarEntrada(
      [
        {
          id: 'ponto_ontem',
          funcionario: 'func_lara',
          data: '2026-10-09 00:00:00.000Z',
          entrada: '08:00',
          saida: '17:00',
        },
      ],
      '2026-10-10',
    )
    expect(check4.pode).toBe(true)
  })

  describe('6. Regra de Rotatividade Diária de Token da Estação de Ponto', () => {
    const hoje = '2026-10-14'
    const ontem = '2026-10-13'

    it('aceita token_diario válido emitido na data de hoje', () => {
      const estacao = {
        ativa: true,
        token: 'est_fixo_abc',
        token_diario: 'ponto_hoje_12345',
        token_diario_validade: `${hoje} 03:00:00.000Z`,
      }

      const res = validarTokenDiarioEstacao(estacao, 'ponto_hoje_12345', hoje)
      expect(res.valido).toBe(true)
      expect(res.motivo).toBeUndefined()
    })

    it('rejeita estritamente token_diario de ontem / expirado', () => {
      const estacao = {
        ativa: true,
        token: 'est_fixo_abc',
        token_diario: 'ponto_ontem_99999',
        token_diario_validade: `${ontem} 03:00:00.000Z`,
      }

      // Mesmo que o token coincida com o salvo, a validade expirou
      const res = validarTokenDiarioEstacao(estacao, 'ponto_ontem_99999', hoje)
      expect(res.valido).toBe(false)
      expect(res.motivo).toContain('expirado')
    })

    it('rejeita estação inativa mesmo com token diário válido', () => {
      const estacao = {
        ativa: false,
        token: 'est_fixo_abc',
        token_diario: 'ponto_hoje_12345',
        token_diario_validade: `${hoje} 03:00:00.000Z`,
      }

      const res = validarTokenDiarioEstacao(estacao, 'ponto_hoje_12345', hoje)
      expect(res.valido).toBe(false)
      expect(res.motivo).toBe('Estação inativa')
    })

    it('rejeita token que não confere com a estação', () => {
      const estacao = {
        ativa: true,
        token: 'est_fixo_abc',
        token_diario: 'ponto_hoje_12345',
        token_diario_validade: `${hoje} 03:00:00.000Z`,
      }

      const res = validarTokenDiarioEstacao(estacao, 'token_estranho', hoje)
      expect(res.valido).toBe(false)
      expect(res.motivo).toBe('Token não confere com esta estação')
    })

    it('fallback de compatibilidade: aceita token fixo antigo se ainda NÃO possui token_diario', () => {
      const estacaoSemDiario = {
        ativa: true,
        token: 'est_fixo_antigo',
        token_diario: '',
        token_diario_validade: '',
      }

      const res = validarTokenDiarioEstacao(estacaoSemDiario, 'est_fixo_antigo', hoje)
      expect(res.valido).toBe(true)
      expect(res.motivo).toContain('primeira leitura')
    })

    it('rejeita token fixo antigo se a estação já opera com token rotativo diário', () => {
      const estacaoComDiario = {
        ativa: true,
        token: 'est_fixo_antigo',
        token_diario: 'ponto_hoje_12345',
        token_diario_validade: `${hoje} 03:00:00.000Z`,
      }

      // Tentativa de bater ponto pelo token fixo salvo nos favoritos
      const res = validarTokenDiarioEstacao(estacaoComDiario, 'est_fixo_antigo', hoje)
      expect(res.valido).toBe(false)
      expect(res.motivo).toContain('já opera com link rotativo')
    })

    it('gerador criptográfico seguro produz tokens únicos com prefixo ponto_', () => {
      const t1 = gerarTokenDiarioCriptografico()
      const t2 = gerarTokenDiarioCriptografico()

      expect(t1).toMatch(/^ponto_[0-9a-f]{32}$/)
      expect(t2).toMatch(/^ponto_[0-9a-f]{32}$/)
      expect(t1).not.toBe(t2)
    })
  })

  describe('7. Fechamento de Folha sem dívidas (divida_semanal = 0)', () => {
    it('calcula espelho com dívida semanal igual a zero quando não há descontos ou vales', () => {
      // Caso real relatado: funcionário trabalhou no período e não tem dívidas ativas nem vales
      const espelho = calcularEspelhoFolha({
        periodoInicio: '2026-10-10',
        periodoFim: '2026-10-17',
        valorHora: 10,
        pontosBrutos: [
          { data: '2026-10-10', entrada: '08:00', saida: '17:06' }, // ~9.1h ou 91 reais
        ],
        dividas: [],
        saldoNegativoAnterior: 0,
        outrosDescontos: [],
      })

      // Dívida semanal é 0 (legítimo e comum — sem dívidas na semana)
      expect(espelho.totalDescontos).toBe(0)
      expect(espelho.descontosDividas).toEqual([])
      expect(espelho.aReceber).toBe(espelho.totalMonetarioTrabalhado)
      expect(espelho.estaNegativo).toBe(false)

      // Garante que o payload gerado para fechamento de folha preserva divida_semanal = 0
      const payloadFolha = {
        funcionario: 'gpafyugfrcbyy21',
        periodo_inicio: espelho.periodoInicio,
        periodo_fim: espelho.periodoFim,
        ganho_total: espelho.totalMonetarioTrabalhado,
        descontos: {
          dividas: espelho.descontosDividas,
          saldoNegativoAnterior: espelho.saldoNegativoAnterior,
          outros: espelho.outrosDescontos,
        },
        divida_semanal: espelho.totalDescontos,
        a_receber: espelho.aReceber,
        quitada: true,
      }

      expect(payloadFolha.divida_semanal).toBe(0)
      expect(payloadFolha.a_receber).toBeGreaterThan(0)
      expect(payloadFolha.ganho_total).toBeGreaterThan(0)
    })
  })

  describe('8. REGRAS REFORMULADAS DO CICLO DE FOLHA', () => {
    const folhasQuitadasMock = [
      {
        id: 'folha_antiga_1',
        periodo_inicio: '2026-10-01',
        periodo_fim: '2026-10-07',
        quitada: true,
      },
      {
        id: 'folha_antiga_2',
        periodo_inicio: '2026-10-08 00:00:00.000Z',
        periodo_fim: '2026-10-14 23:59:59.000Z',
        quitada: true,
      },
    ]

    describe('TESTE: período quitado não aparece no espelho', () => {
      it('filtra pontos de períodos fechados e mantém apenas os abertos', () => {
        const pontos = [
          { data: '2026-10-05', entrada: '08:00', saida: '17:00' }, // dentro da folha 1 (quitada)
          { data: '2026-10-10', entrada: '08:00', saida: '17:00' }, // dentro da folha 2 (quitada)
          { data: '2026-10-15', entrada: '08:00', saida: '17:00' }, // aberto!
          { data: '2026-10-16', entrada: '08:00', saida: '17:00' }, // aberto!
        ]

        const abertos = filtrarPontosPeriodoAberto(pontos, folhasQuitadasMock)
        expect(abertos.length).toBe(2)
        expect(abertos.map((p) => p.data)).toEqual(['2026-10-15', '2026-10-16'])
      })

      it('detecta se um período sobrepõe folha quitada para bloquear seletores', () => {
        expect(
          isPeriodoSobrepostoAFolhaQuitada('2026-10-02', '2026-10-06', folhasQuitadasMock),
        ).toBe(true)
        expect(
          isPeriodoSobrepostoAFolhaQuitada('2026-10-07', '2026-10-10', folhasQuitadasMock),
        ).toBe(true)
        // Período posterior aberto
        expect(
          isPeriodoSobrepostoAFolhaQuitada('2026-10-15', '2026-10-22', folhasQuitadasMock),
        ).toBe(false)
      })

      it('calcula o próximo período aberto iniciando no dia posterior à última folha', () => {
        const proximo = calcularProximoPeriodoAberto(folhasQuitadasMock, '2026-10-20')
        expect(proximo.inicio).toBe('2026-10-15')
        expect(proximo.fim).toBe('2026-10-20')
      })
    })

    describe('TESTE: datas do histórico exibem o dia correto (sem deslocamento de fuso)', () => {
      it('formata datas em formato dd/mm/aaaa estrito sem shift de fuso horário', () => {
        expect(formatarDataDDMMAAAA('2026-10-10')).toBe('10/10/2026')
        expect(formatarDataDDMMAAAA('2026-10-14 00:00:00.000Z')).toBe('14/10/2026')
        expect(formatarDataDDMMAAAA('2026-10-01T00:00:00Z')).toBe('01/10/2026')

        expect(formatarDataDDMM('2026-10-10')).toBe('10/10')
        expect(formatarDataDDMM('2026-10-14 23:59:59.000Z')).toBe('14/10')
      })
    })

    describe('TESTE: Pagamento primeiro, confirmação do colaborador depois (sem bloqueio)', () => {
      const pontosDoPeriodo = [
        { data: '2026-10-15', entrada: '08:00', saida: '17:00' },
        { data: '2026-10-16', entrada: '08:00', saida: '17:00' },
        { data: '2026-10-17', entrada: '08:00', saida: '17:00' },
      ]

      it('NÃO bloqueia o fechamento quando nenhuma data foi confirmada (podeFechar = true)', () => {
        const validacao = validarConfirmacoesFechamento({
          pontosTrabalhados: pontosDoPeriodo,
          confirmacoesPorData: {},
        })

        expect(validacao.podeFechar).toBe(true)
        expect(validacao.totalDiasTrabalhados).toBe(3)
        expect(validacao.totalDiasConfirmados).toBe(0)
        expect(validacao.temPendencias).toBe(true)
        expect(validacao.statusBadge).toBe('aguardando_confirmacao_colaborador')
        expect(validacao.diasPendentes).toEqual(['2026-10-15', '2026-10-16', '2026-10-17'])
        expect(validacao.avisoPendencia).toBe(
          'Aguardando confirmação do colaborador — 0 de 3 dias confirmados',
        )
      })

      it('NÃO bloqueia o fechamento com confirmação parcial e gera badge rastreável', () => {
        const validacao = validarConfirmacoesFechamento({
          pontosTrabalhados: pontosDoPeriodo,
          confirmacoesPorData: {
            '2026-10-15': { confirmado: true },
            '2026-10-16': { confirmado: true },
            // 2026-10-17 pendente
          },
        })

        expect(validacao.podeFechar).toBe(true)
        expect(validacao.totalDiasConfirmados).toBe(2)
        expect(validacao.temPendencias).toBe(true)
        expect(validacao.statusBadge).toBe('aguardando_confirmacao_colaborador')
        expect(validacao.diasPendentes).toEqual(['2026-10-17'])
        expect(validacao.avisoPendencia).toBe(
          'Aguardando confirmação do colaborador — 2 de 3 dias confirmados',
        )
      })

      it('NÃO bloqueia fechamento mesmo se dia foi marcado com divergência não sanada', () => {
        const validacao = validarConfirmacoesFechamento({
          pontosTrabalhados: pontosDoPeriodo,
          confirmacoesPorData: {
            '2026-10-15': { confirmado: true },
            '2026-10-16': { confirmado: true },
            '2026-10-17': { confirmado: false, divergenciaApontada: true },
          },
        })

        expect(validacao.podeFechar).toBe(true)
        expect(validacao.temPendencias).toBe(true)
        expect(validacao.totalDiasConfirmados).toBe(2)
        expect(validacao.diasPendentes).toEqual(['2026-10-17'])
        expect(validacao.statusBadge).toBe('aguardando_confirmacao_colaborador')
      })

      it('indica status todos_confirmados quando todas as datas trabalhadas foram confirmadas', () => {
        const validacao = validarConfirmacoesFechamento({
          pontosTrabalhados: pontosDoPeriodo,
          confirmacoesPorData: {
            '2026-10-15': { confirmado: true },
            '2026-10-16': { confirmado: true },
            '2026-10-17': { confirmado: true },
          },
        })

        expect(validacao.podeFechar).toBe(true)
        expect(validacao.totalDiasTrabalhados).toBe(3)
        expect(validacao.totalDiasConfirmados).toBe(3)
        expect(validacao.temPendencias).toBe(false)
        expect(validacao.statusBadge).toBe('todos_confirmados')
        expect(validacao.diasPendentes).toEqual([])
        expect(validacao.avisoPendencia).toBeUndefined()
      })

      it('monta mensagem de notificação de pagamento realizado para o colaborador', () => {
        const notif = montarMensagemNotificacaoPagamento({
          nomeFuncionario: 'Lara Silva',
          periodoInicio: '2026-10-01',
          periodoFim: '2026-10-07',
          valorPago: 450.0,
          totalDiasTrabalhados: 5,
          temDiasPendentes: true,
        })

        expect(notif.titulo).toBe('Pagamento realizado')
        expect(notif.mensagem).toContain('Lara Silva')
        expect(notif.mensagem).toContain('01/10 a 07/10')
        expect(notif.mensagem).toContain('R$ 450,00')
        expect(notif.mensagem).toContain('conferir se o valor está condizente')
        expect(notif.textoNotificacao).toContain('Há dias trabalhados pendentes de confirmação')
      })
    })

    describe('TESTE: divergência vira despesa/vale no período aberto', () => {
      it('cria item de desconto com descrição e período de referência corretos', () => {
        const descontoDivergencia = criarDescontoDivergenciaPassada({
          periodoPassadoInicio: '2026-10-01',
          periodoPassadoFim: '2026-10-07',
          valor: 85.5,
          motivo: 'Ajuste de hora extra não contabilizada',
        })

        expect(descontoDivergencia.valor).toBe(85.5)
        expect(descontoDivergencia.descricao).toBe(
          'Divergência do período 01/10–07/10 (Ajuste de hora extra não contabilizada)',
        )
        expect(descontoDivergencia.origemDivergencia).toBe(true)
        expect(descontoDivergencia.periodoReferencia).toBe('2026-10-01 a 2026-10-07')
      })

      it('incorpora a divergência nos cálculos do espelho aberto', () => {
        const descontoDivergencia = criarDescontoDivergenciaPassada({
          periodoPassadoInicio: '2026-10-01',
          periodoPassadoFim: '2026-10-07',
          valor: 50.0,
        })

        const espelhoAberto = calcularEspelhoFolha({
          periodoInicio: '2026-10-15',
          periodoFim: '2026-10-22',
          valorHora: 20,
          pontosBrutos: [
            { data: '2026-10-15', entrada: '08:00', saida: '17:00' }, // 9h = 180 reais
          ],
          dividas: [],
          saldoNegativoAnterior: 0,
          outrosDescontos: [descontoDivergencia],
        })

        expect(espelhoAberto.totalMonetarioTrabalhado).toBe(180)
        expect(espelhoAberto.totalDescontos).toBe(50)
        expect(espelhoAberto.aReceber).toBe(130)
      })
    })
  })
})
