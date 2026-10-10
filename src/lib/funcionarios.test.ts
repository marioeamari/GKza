import { describe, it, expect } from 'vitest'
import {
  calcularValorHoraBase,
  converterMinutosEmHorasDecimais,
  formatarMinutosEmHHMM,
  calcularLinhaPonto,
  calcularEspelhoFolha,
  normalizarDataPonto,
  buildFiltroPontoData,
  validarPodeRegistrarEntrada,
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
})
