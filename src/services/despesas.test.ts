import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { despesasService } from './despesas'
import type { Conta, DespesaCompromisso, DespesaOcorrencia, MetodoPagamento } from '@/types/domain'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

describe('despesasService - baixaOcorrencia data de pagamento', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('grava exatamente a dataPagamento informada (com 12:00:00) no lançamento e na ocorrência, sem usar data atual', async () => {
    const mockContaGetOne = vi.fn().mockResolvedValue({
      id: 'conta_corrente_1',
      nome: 'Conta Itaú',
      tipo: 'corrente',
    })

    const mockLancamentosCreate = vi.fn().mockResolvedValue({
      id: 'lanc_123',
    })

    const mockOcorrenciaGetOne = vi.fn().mockResolvedValue({
      id: 'ocorr_456',
      valor_previsto: 150,
      secao: 'contas_mensais_pix_boleto',
      competencia: '2026-10',
    })

    const mockOcorrenciaUpdate = vi.fn().mockResolvedValue({
      id: 'ocorr_456',
      status: 'paga',
      valor_pago: 150,
      data_pagamento: '2026-10-15 12:00:00',
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockContaGetOne } as any
      }
      if (name === 'lancamentos') {
        return { create: mockLancamentosCreate } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: mockOcorrenciaGetOne,
          update: mockOcorrenciaUpdate,
        } as any
      }
      return {} as any
    })

    const dataPagamentoEscolhida = '2026-10-15'

    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'ocorr_456',
      valorPago: 150,
      dataPagamento: dataPagamentoEscolhida,
      contaId: 'conta_corrente_1',
      descricao: 'Internet Fibra',
      observacoes: 'Pago no prazo',
    })

    // 1. Verifica lançamento financeiro criado com a data escolhida
    expect(mockLancamentosCreate).toHaveBeenCalledTimes(1)
    const lancamentoCallArg = mockLancamentosCreate.mock.calls[0][0]
    expect(lancamentoCallArg.data).toBe(`${dataPagamentoEscolhida} 12:00:00`)
    expect(lancamentoCallArg.competencia).toBe('2026-10')

    // 2. Verifica ocorrência atualizada com a data escolhida
    expect(mockOcorrenciaUpdate).toHaveBeenCalledTimes(1)
    const updateCallArg = mockOcorrenciaUpdate.mock.calls[0][1]
    expect(updateCallArg.data_pagamento).toBe(`${dataPagamentoEscolhida} 12:00:00`)
    expect(updateCallArg.status).toBe('paga')
  })

  it('no caso de cartão de crédito ("Lançar na fatura"), grava a dataPagamento informada no lançamento e na ocorrência', async () => {
    const mockContaGetOne = vi.fn().mockResolvedValue({
      id: 'cartao_nubank',
      nome: 'NuBank PJ',
      tipo: 'cartao',
      dia_fechamento: 10,
      dia_vencimento: 20,
    })

    const mockLancamentosCreate = vi.fn().mockResolvedValue({
      id: 'lanc_cartao_99',
    })

    const mockOcorrenciaGetOne = vi.fn().mockResolvedValue({
      id: 'ocorr_cartao_99',
      valor_previsto: 300,
      secao: 'cartoes_credito',
      competencia: '2026-10',
    })

    const mockOcorrenciaUpdate = vi.fn().mockResolvedValue({
      id: 'ocorr_cartao_99',
      status: 'paga',
      valor_pago: 300,
      data_pagamento: '2026-09-25 12:00:00',
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockContaGetOne } as any
      }
      if (name === 'lancamentos') {
        return { create: mockLancamentosCreate } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: mockOcorrenciaGetOne,
          update: mockOcorrenciaUpdate,
        } as any
      }
      return {} as any
    })

    const dataPagamentoEscolhida = '2026-09-25'

    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'ocorr_cartao_99',
      valorPago: 300,
      dataPagamento: dataPagamentoEscolhida,
      contaId: 'cartao_nubank',
      descricao: 'Compra Equipamento',
    })

    // Lançamento com data exatamente igual à informada
    expect(mockLancamentosCreate).toHaveBeenCalledTimes(1)
    const lancamentoCallArg = mockLancamentosCreate.mock.calls[0][0]
    expect(lancamentoCallArg.data).toBe(`${dataPagamentoEscolhida} 12:00:00`)
    expect(lancamentoCallArg.status).toBe('pendente')

    // Ocorrência atualizada com a data informada
    expect(mockOcorrenciaUpdate).toHaveBeenCalledTimes(1)
    const updateCallArg = mockOcorrenciaUpdate.mock.calls[0][1]
    expect(updateCallArg.data_pagamento).toBe(`${dataPagamentoEscolhida} 12:00:00`)
  })

  it('no caso de cartão de crédito, realinha competencia e data_vencimento se data de pagamento apontar para ciclo diferente', async () => {
    const mockContaGetOne = vi.fn().mockResolvedValue({
      id: 'cartao_nubank',
      nome: '[CPF]NuBank Cred.',
      tipo: 'cartao',
      dia_fechamento: 13,
      dia_vencimento: 20,
    })

    const mockLancamentosCreate = vi.fn().mockResolvedValue({
      id: 'lanc_cartao_retro',
    })

    const mockOcorrenciaGetOne = vi.fn().mockResolvedValue({
      id: 'ocorr_cartao_retro',
      compromisso: 'comp_123',
      valor_previsto: 49,
      secao: 'cartoes_credito',
      competencia: '2026-10',
    })

    const mockOcorrenciaUpdate = vi.fn().mockResolvedValue({
      id: 'ocorr_cartao_retro',
      status: 'paga',
      valor_pago: 49,
      competencia: '2026-09',
      data_vencimento: '2026-09-20T12:00:00.000Z',
      data_pagamento: '2026-08-23 12:00:00',
    })

    const mockGetListOcorr = vi.fn().mockResolvedValue({
      items: [],
      totalItems: 0,
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockContaGetOne } as any
      }
      if (name === 'lancamentos') {
        return { create: mockLancamentosCreate } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: mockOcorrenciaGetOne,
          update: mockOcorrenciaUpdate,
          getList: mockGetListOcorr,
        } as any
      }
      return {} as any
    })

    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'ocorr_cartao_retro',
      valorPago: 49,
      dataPagamento: '2026-08-23',
      contaId: 'cartao_nubank',
      descricao: 'Nubank Ultravioleta',
    })

    expect(mockOcorrenciaUpdate).toHaveBeenCalledTimes(1)
    const updateCallArg = mockOcorrenciaUpdate.mock.calls[0][1]
    expect(updateCallArg.competencia).toBe('2026-09')
    expect(updateCallArg.data_vencimento).toBe('2026-09-20T12:00:00.000Z')
    expect(updateCallArg.data_pagamento).toBe('2026-08-23 12:00:00')
    expect(updateCallArg.status).toBe('paga')
  })
})

describe('despesasService - Agrupador de Despesas e Helpers', () => {
  describe('getTiposPagamentoConta', () => {
    it('retorna tipos definidos na própria conta quando informados', () => {
      const conta: Conta = {
        id: 'c1',
        nome: 'Inter PJ',
        tipo: 'bancaria',
        tipos_pagamento: ['pix', 'boletos'],
        saldo_inicial: 0,
        cor: '#ff7a00',
        ativa: true,
      } as Conta

      const tipos = despesasService.getTiposPagamentoConta(conta)
      expect(tipos).toEqual(['pix', 'boletos'])
    })

    it('aplica fallback por tipo de conta quando tipos_pagamento estiver vazio ou indefinido', () => {
      const contaBancaria: Conta = {
        id: 'c2',
        nome: 'Bradesco',
        tipo: 'bancaria',
        saldo_inicial: 0,
        cor: '#cc0000',
        ativa: true,
      } as Conta

      const contaCartao: Conta = {
        id: 'c3',
        nome: 'Nubank PJ',
        tipo: 'cartao',
        saldo_inicial: 0,
        cor: '#8a05be',
        ativa: true,
      } as Conta

      const contaCaixa: Conta = {
        id: 'c4',
        nome: 'Gaveta Empresa',
        tipo: 'caixa',
        saldo_inicial: 0,
        cor: '#008800',
        ativa: true,
      } as Conta

      expect(despesasService.getTiposPagamentoConta(contaBancaria)).toEqual([
        'debito',
        'transferencia',
        'boletos',
        'pix',
      ])
      expect(despesasService.getTiposPagamentoConta(contaCartao)).toEqual(['credito'])
      expect(despesasService.getTiposPagamentoConta(contaCaixa)).toEqual([
        'pix',
        'debito',
        'transferencia',
        'boletos',
      ])
    })

    it('retorna fallback geral seguro se conta for nula ou indefinida', () => {
      expect(despesasService.getTiposPagamentoConta(null)).toEqual([
        'debito',
        'transferencia',
        'boletos',
        'pix',
      ])
      expect(despesasService.getTiposPagamentoConta(undefined)).toEqual([
        'debito',
        'transferencia',
        'boletos',
        'pix',
      ])
    })
  })

  describe('mapearMetodoParaTipoPagamento', () => {
    const tiposDisponiveis = ['debito', 'transferencia', 'boletos', 'pix', 'credito'] as const

    it('aloca método Pix para aba pix', () => {
      const metodoPix: MetodoPagamento = {
        id: 'm_pix',
        nome: 'Chave Pix CNPJ',
        tipo: 'pix',
        codigo: 'pix_cnpj',
        ativo: true,
      } as MetodoPagamento

      const alocado = despesasService.mapearMetodoParaTipoPagamento(metodoPix, [
        ...tiposDisponiveis,
      ])
      expect(alocado).toBe('pix')
    })

    it('aloca método Boleto para aba boletos', () => {
      const metodoBoleto: MetodoPagamento = {
        id: 'm_bol',
        nome: 'Boleto Bancário',
        tipo: 'boleto',
        codigo: 'boleto',
        ativo: true,
      } as MetodoPagamento

      const alocado = despesasService.mapearMetodoParaTipoPagamento(metodoBoleto, [
        ...tiposDisponiveis,
      ])
      expect(alocado).toBe('boletos')
    })

    it('aloca Débito e Transferência corretamente', () => {
      const metodoDeb: MetodoPagamento = {
        id: 'm_deb',
        nome: 'Cartão de Débito Visa',
        tipo: 'outro',
        codigo: 'debito_visa',
        ativo: true,
      } as MetodoPagamento

      const metodoTed: MetodoPagamento = {
        id: 'm_ted',
        nome: 'TED / DOC',
        tipo: 'transferencia',
        codigo: 'ted',
        ativo: true,
      } as MetodoPagamento

      expect(despesasService.mapearMetodoParaTipoPagamento(metodoDeb, [...tiposDisponiveis])).toBe(
        'debito',
      )
      expect(despesasService.mapearMetodoParaTipoPagamento(metodoTed, [...tiposDisponiveis])).toBe(
        'transferencia',
      )
    })

    it('usa fallback para o primeiro tipo disponível caso o método não dê match ou não seja suportado pela conta', () => {
      const metodoBoleto: MetodoPagamento = {
        id: 'm_bol',
        nome: 'Boleto Bancário',
        tipo: 'boleto',
        codigo: 'boleto',
        ativo: true,
      } as MetodoPagamento

      // Conta que só suporta pix e debito
      const alocado = despesasService.mapearMetodoParaTipoPagamento(metodoBoleto, ['pix', 'debito'])
      expect(alocado).toBe('pix')
    })

    it('aceita método passado como string', () => {
      expect(
        despesasService.mapearMetodoParaTipoPagamento('Pix QrCode', [...tiposDisponiveis]),
      ).toBe('pix')
      expect(despesasService.mapearMetodoParaTipoPagamento('Boleto', [...tiposDisponiveis])).toBe(
        'boletos',
      )
    })
  })

  describe('isDespesaDinheiro', () => {
    it('reconhece como dinheiro despesa cujo método de pagamento é dinheiro ou espécie', () => {
      const oc: DespesaOcorrencia = {
        id: 'oc_dinheiro',
        compromisso: 'comp_din',
      } as DespesaOcorrencia

      const comp: DespesaCompromisso = {
        id: 'comp_din',
        descricao: 'Café da manhã',
        metodo_pagamento: 'm_din',
      } as DespesaCompromisso

      const metodosMap = new Map<string, MetodoPagamento>([
        [
          'm_din',
          {
            id: 'm_din',
            nome: 'Dinheiro em Espécie',
            tipo: 'dinheiro',
            ativo: true,
          } as MetodoPagamento,
        ],
      ])

      expect(despesasService.isDespesaDinheiro(oc, comp, metodosMap)).toBe(true)
    })

    it('reconhece como dinheiro despesa associada a conta caixa quando o método for dinheiro ou sem método', () => {
      const contaCaixa: Conta = {
        id: 'cx1',
        nome: 'Caixa Físico',
        tipo: 'caixa',
      } as Conta

      const oc: DespesaOcorrencia = {
        id: 'oc_cx',
        expand: {
          conta: contaCaixa,
        },
      } as DespesaOcorrencia

      expect(despesasService.isDespesaDinheiro(oc, null)).toBe(true)
    })

    it('retorna false para despesas bancárias com boletos, pix ou cartões normais', () => {
      const contaBancaria: Conta = {
        id: 'b1',
        nome: 'Banco Itaú',
        tipo: 'bancaria',
      } as Conta

      const oc: DespesaOcorrencia = {
        id: 'oc_banco',
        expand: {
          conta: contaBancaria,
        },
      } as DespesaOcorrencia

      const comp: DespesaCompromisso = {
        id: 'comp_pix',
        descricao: 'Internet',
        metodo_pagamento: 'm_pix',
      } as DespesaCompromisso

      const metodosMap = new Map<string, MetodoPagamento>([
        [
          'm_pix',
          {
            id: 'm_pix',
            nome: 'Pix',
            tipo: 'pix',
            ativo: true,
          } as MetodoPagamento,
        ],
      ])

      expect(despesasService.isDespesaDinheiro(oc, comp, metodosMap)).toBe(false)
    })
  })

  describe('agruparDespesasParaVisualizacao', () => {
    it('distribui corretamente boletos, pix, dinheiro, assinaturas anuais, cartões e sem conta', () => {
      const contaItau: Conta = {
        id: 'conta_itau',
        nome: 'Itaú Empresas',
        tipo: 'bancaria',
        tipos_pagamento: ['pix', 'boletos', 'transferencia', 'debito'],
        ativa: true,
      } as Conta

      const contaCartaoNubank: Conta = {
        id: 'cartao_nu',
        nome: 'Nubank PJ',
        tipo: 'cartao',
        tipos_pagamento: ['credito'],
        ativa: true,
      } as Conta

      const metodoPix: MetodoPagamento = {
        id: 'm_pix',
        nome: 'Pix',
        tipo: 'pix',
        ativo: true,
      } as MetodoPagamento

      const metodoBoleto: MetodoPagamento = {
        id: 'm_bol',
        nome: 'Boleto',
        tipo: 'boleto',
        ativo: true,
      } as MetodoPagamento

      const metodoDinheiro: MetodoPagamento = {
        id: 'm_din',
        nome: 'Dinheiro',
        tipo: 'dinheiro',
        ativo: true,
      } as MetodoPagamento

      // Compromissos
      const compLuz: DespesaCompromisso = {
        id: 'comp_luz',
        descricao: 'Energia Elétrica',
        secao: 'contas_mensais_pix_boleto',
        conta_padrao: 'conta_itau',
        metodo_pagamento: 'm_bol',
        regra_repeticao: 'mensal',
        ativo: true,
      } as DespesaCompromisso

      const compInternet: DespesaCompromisso = {
        id: 'comp_net',
        descricao: 'Internet Fibra',
        secao: 'contas_mensais_pix_boleto',
        conta_padrao: 'conta_itau',
        metodo_pagamento: 'm_pix',
        regra_repeticao: 'mensal',
        ativo: true,
      } as DespesaCompromisso

      const compAssinatura: DespesaCompromisso = {
        id: 'comp_anual',
        descricao: 'Domínio Registro.br',
        secao: 'assinaturas_anuais',
        conta_padrao: 'conta_itau',
        regra_repeticao: 'anual',
        ativo: true,
      } as DespesaCompromisso

      const compCartao: DespesaCompromisso = {
        id: 'comp_card',
        descricao: 'Compra Teclado',
        secao: 'cartoes_credito',
        conta_padrao: 'cartao_nu',
        regra_repeticao: 'parcelado',
        ativo: true,
      } as DespesaCompromisso

      const compDinheiro: DespesaCompromisso = {
        id: 'comp_din',
        descricao: 'Almoço em Dinheiro',
        secao: 'contas_mensais_pix_boleto',
        metodo_pagamento: 'm_din',
        regra_repeticao: 'avulso',
        ativo: true,
      } as DespesaCompromisso

      const compSemConta: DespesaCompromisso = {
        id: 'comp_sem_conta',
        descricao: 'Serviço sem Conta',
        secao: 'contas_mensais_pix_boleto',
        conta_padrao: 'conta_inexistente_deletada',
        regra_repeticao: 'mensal',
        ativo: true,
      } as DespesaCompromisso

      // Ocorrências
      const ocLuz: DespesaOcorrencia = {
        id: 'oc_luz',
        compromisso: 'comp_luz',
        conta: 'conta_itau',
        secao: 'contas_mensais_pix_boleto',
        valor_previsto: 250,
        data_vencimento: '2026-10-10',
        status: 'prevista',
      } as DespesaOcorrencia

      const ocNet: DespesaOcorrencia = {
        id: 'oc_net',
        compromisso: 'comp_net',
        conta: 'conta_itau',
        secao: 'contas_mensais_pix_boleto',
        valor_previsto: 120,
        data_vencimento: '2026-10-15',
        status: 'prevista',
      } as DespesaOcorrencia

      const ocAssinatura: DespesaOcorrencia = {
        id: 'oc_anual',
        compromisso: 'comp_anual',
        secao: 'assinaturas_anuais',
        valor_previsto: 40,
        data_vencimento: '2026-10-20',
        status: 'prevista',
      } as DespesaOcorrencia

      const ocCartao: DespesaOcorrencia = {
        id: 'oc_card',
        compromisso: 'comp_card',
        conta: 'cartao_nu',
        secao: 'cartoes_credito',
        valor_previsto: 90,
        data_vencimento: '2026-10-25',
        status: 'prevista',
      } as DespesaOcorrencia

      const ocDinheiro: DespesaOcorrencia = {
        id: 'oc_din',
        compromisso: 'comp_din',
        secao: 'contas_mensais_pix_boleto',
        valor_previsto: 35,
        data_vencimento: '2026-10-05',
        status: 'prevista',
      } as DespesaOcorrencia

      const ocSemConta: DespesaOcorrencia = {
        id: 'oc_sem_conta',
        compromisso: 'comp_sem_conta',
        secao: 'contas_mensais_pix_boleto',
        valor_previsto: 80,
        data_vencimento: '2026-10-08',
        status: 'prevista',
      } as DespesaOcorrencia

      const resultado = despesasService.agruparDespesasParaVisualizacao({
        ocorrencias: [ocLuz, ocNet, ocAssinatura, ocCartao, ocDinheiro, ocSemConta],
        contas: [contaItau, contaCartaoNubank],
        compromissos: [
          compLuz,
          compInternet,
          compAssinatura,
          compCartao,
          compDinheiro,
          compSemConta,
        ],
        metodosPagamento: [metodoPix, metodoBoleto, metodoDinheiro],
      })

      // 1. Assinaturas anuais
      expect(resultado.assinaturas).toHaveLength(1)
      expect(resultado.assinaturas[0].id).toBe('oc_anual')

      // 2. Dinheiro
      expect(resultado.dinheiro).toHaveLength(1)
      expect(resultado.dinheiro[0].id).toBe('oc_din')

      // 3. Sem conta definida
      expect(resultado.semConta).toHaveLength(1)
      expect(resultado.semConta[0].id).toBe('oc_sem_conta')

      // 4. Cartão de crédito
      expect(resultado.cartoes).toHaveLength(1)
      expect(resultado.cartoes[0].conta.id).toBe('cartao_nu')
      expect(resultado.cartoes[0].ocorrencias).toHaveLength(1)
      expect(resultado.cartoes[0].ocorrencias[0].id).toBe('oc_card')

      // 5. Conta Não-Cartão (Itaú) e suas abas
      expect(resultado.contasNaoCartao).toHaveLength(1)
      const itauGroup = resultado.contasNaoCartao[0]
      expect(itauGroup.conta.id).toBe('conta_itau')
      expect(itauGroup.totalOcorrencias).toBe(2)

      const abaPix = itauGroup.abas.find((a) => a.tipo === 'pix')
      const abaBoletos = itauGroup.abas.find((a) => a.tipo === 'boletos')

      expect(abaPix).toBeDefined()
      expect(abaPix!.ocorrencias).toHaveLength(1)
      expect(abaPix!.ocorrencias[0].id).toBe('oc_net')

      expect(abaBoletos).toBeDefined()
      expect(abaBoletos!.ocorrencias).toHaveLength(1)
      expect(abaBoletos!.ocorrencias[0].id).toBe('oc_luz')
    })
  })
})
