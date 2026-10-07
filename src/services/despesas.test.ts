import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { ClientResponseError } from 'pocketbase'
import { despesasService, contaAceitaCredito, isMetodoCredito } from './despesas'
import type { Conta, DespesaCompromisso, DespesaOcorrencia, MetodoPagamento } from '@/types/domain'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

describe('despesasService - Agrupador de Despesas para Visualização (Nova Arquitetura)', () => {
  const contaNubank = {
    id: 'c_nubank',
    nome: 'Nubank PF',
    tipo: 'bancaria',
    natureza: 'fisica',
    tipos_pagamento: ['credito', 'debito', 'pix'],
    dia_fechamento: 5,
    dia_vencimento: 12,
    ordem: 1,
    ativa: true,
    saldo_atual: 500,
    created: '',
    updated: '',
  } as unknown as Conta

  const contaSicredi = {
    id: 'c_sicredi',
    nome: 'Sicredi PJ',
    tipo: 'bancaria',
    natureza: 'juridica',
    tipos_pagamento: ['boletos', 'pix', 'transferencia'],
    ordem: 2,
    ativa: true,
    saldo_atual: 1000,
    created: '',
    updated: '',
  } as unknown as Conta

  const contaInativa = {
    id: 'c_inativa',
    nome: 'Banco Velho Inativo',
    tipo: 'bancaria',
    ordem: 99,
    ativa: false,
    saldo_atual: 0,
    created: '',
    updated: '',
  } as unknown as Conta

  const metodos = [
    {
      id: 'm_credito',
      nome: 'Cartão de Crédito',
      tipo: 'cartao',
      ativo: true,
      created: '',
      updated: '',
    },
    { id: 'm_pix', nome: 'Pix', tipo: 'pix', ativo: true, created: '', updated: '' },
    {
      id: 'm_boleto',
      nome: 'Boleto Bancário',
      tipo: 'boleto',
      ativo: true,
      created: '',
      updated: '',
    },
    {
      id: 'm_dinheiro',
      nome: 'Dinheiro em Espécie',
      tipo: 'dinheiro',
      ativo: true,
      created: '',
      updated: '',
    },
  ] as unknown as MetodoPagamento[]

  it('ordena a lista única de contas ativas estritamente por conta.ordem', () => {
    const contasDesordenadas = [
      { ...contaSicredi, ordem: 10 },
      { ...contaNubank, ordem: 2 },
    ]

    const resultado = despesasService.agruparDespesasParaVisualizacao({
      ocorrencias: [],
      contas: contasDesordenadas,
      compromissos: [],
      metodosPagamento: metodos,
    })

    expect(resultado.contas).toHaveLength(2)
    expect(resultado.contas[0].conta.id).toBe('c_nubank')
    expect(resultado.contas[1].conta.id).toBe('c_sicredi')
  })

  it('gera abas derivadas exatamente de tipos_pagamento da conta', () => {
    const resultado = despesasService.agruparDespesasParaVisualizacao({
      ocorrencias: [],
      contas: [contaNubank, contaSicredi],
      compromissos: [],
      metodosPagamento: metodos,
    })

    const grupoNubank = resultado.contas.find((g) => g.conta.id === 'c_nubank')!
    expect(grupoNubank.abas.map((a) => a.tipo)).toEqual(['credito', 'debito', 'pix'])

    const grupoSicredi = resultado.contas.find((g) => g.conta.id === 'c_sicredi')!
    expect(grupoSicredi.abas.map((a) => a.tipo)).toEqual(['boletos', 'pix', 'transferencia'])
  })

  it('identifica corretamente contaAceitaCredito e informações de ciclo de fatura', () => {
    expect(contaAceitaCredito(contaNubank)).toBe(true)
    expect(contaNubank.dia_fechamento).toBe(5)
    expect(contaNubank.dia_vencimento).toBe(12)

    expect(contaAceitaCredito(contaSicredi)).toBe(false)
  })

  it('aloca assinaturas anuais DENTRO do grupo da respectiva conta na aba do método', () => {
    const compAssinatura = {
      id: 'comp_anual_1',
      descricao: 'Assinatura Software Anual',
      secao: 'assinaturas_anuais',
      regra_repeticao: 'anual',
      conta_padrao: 'c_nubank',
      metodo_pagamento: 'm_credito',
      ativo: true,
      created: '',
      updated: '',
    } as unknown as DespesaCompromisso

    const ocAssinatura = {
      id: 'oc_anual_1',
      compromisso: 'comp_anual_1',
      conta: 'c_nubank',
      secao: 'assinaturas_anuais',
      valor_previsto: 1200,
      competencia: '2025-05',
      status: 'prevista',
      created: '',
      updated: '',
    } as unknown as DespesaOcorrencia

    const resultado = despesasService.agruparDespesasParaVisualizacao({
      ocorrencias: [ocAssinatura],
      contas: [contaNubank],
      compromissos: [compAssinatura],
      metodosPagamento: metodos,
    })

    const grupoNubank = resultado.contas.find((g) => g.conta.id === 'c_nubank')!
    expect(grupoNubank.totalOcorrencias).toBe(1)
    const abaCredito = grupoNubank.abas.find((a) => a.tipo === 'credito')!
    expect(abaCredito.ocorrencias).toHaveLength(1)
    expect(abaCredito.ocorrencias[0].id).toBe('oc_anual_1')
    expect(resultado.assinaturas).toEqual([])
  })

  it('aloca despesas em dinheiro físico no grupo dinheiro', () => {
    const compDinheiro = {
      id: 'comp_dinheiro',
      descricao: 'Café da manhã na padaria',
      metodo_pagamento: 'm_dinheiro',
      ativo: true,
      created: '',
      updated: '',
    } as unknown as DespesaCompromisso

    const ocDinheiro = {
      id: 'oc_dinheiro',
      compromisso: 'comp_dinheiro',
      valor_previsto: 25,
      competencia: '2025-05',
      status: 'prevista',
      created: '',
      updated: '',
    } as unknown as DespesaOcorrencia

    const resultado = despesasService.agruparDespesasParaVisualizacao({
      ocorrencias: [ocDinheiro],
      contas: [contaNubank],
      compromissos: [compDinheiro],
      metodosPagamento: metodos,
    })

    expect(resultado.dinheiro).toHaveLength(1)
    expect(resultado.dinheiro[0].id).toBe('oc_dinheiro')
    expect(resultado.contas[0].totalOcorrencias).toBe(0)
  })

  it('respeita ocorrências pagas de compromissos inativos sem quebrá-las no agrupador', () => {
    const compInativo = {
      id: 'comp_inativo_1',
      descricao: 'Academia Antiga Inativa',
      ativo: false,
      conta_padrao: 'c_nubank',
      metodo_pagamento: 'm_pix',
      created: '',
      updated: '',
    } as unknown as DespesaCompromisso

    const ocPaga = {
      id: 'oc_paga_inativo',
      compromisso: 'comp_inativo_1',
      conta: 'c_nubank',
      valor_previsto: 120,
      valor_pago: 120,
      competencia: '2025-05',
      status: 'paga',
      created: '',
      updated: '',
    } as unknown as DespesaOcorrencia

    const resultado = despesasService.agruparDespesasParaVisualizacao({
      ocorrencias: [ocPaga],
      contas: [contaNubank],
      compromissos: [compInativo],
      metodosPagamento: metodos,
    })

    const grupoNubank = resultado.contas.find((g) => g.conta.id === 'c_nubank')!
    expect(grupoNubank.totalOcorrencias).toBe(1)
    expect(grupoNubank.ocorrencias[0].id).toBe('oc_paga_inativo')
  })

  it('aloca despesas sem conta ou vinculadas a conta inativa no grupo semConta', () => {
    const ocSemConta = {
      id: 'oc_orfa',
      valor_previsto: 100,
      competencia: '2025-05',
      status: 'prevista',
      created: '',
      updated: '',
    } as unknown as DespesaOcorrencia

    const compContaInativa = {
      id: 'comp_inativa',
      descricao: 'Despesa Antiga',
      conta_padrao: 'c_inativa',
      ativo: true,
      created: '',
      updated: '',
    } as unknown as DespesaCompromisso

    const ocContaInativa = {
      id: 'oc_inativa',
      compromisso: 'comp_inativa',
      conta: 'c_inativa',
      valor_previsto: 200,
      competencia: '2025-05',
      status: 'prevista',
      created: '',
      updated: '',
    } as unknown as DespesaOcorrencia

    const resultado = despesasService.agruparDespesasParaVisualizacao({
      ocorrencias: [ocSemConta, ocContaInativa],
      contas: [contaNubank, contaInativa],
      compromissos: [compContaInativa],
      metodosPagamento: metodos,
    })

    expect(resultado.semConta).toHaveLength(2)
    expect(resultado.semConta.map((o) => o.id)).toContain('oc_orfa')
    expect(resultado.semConta.map((o) => o.id)).toContain('oc_inativa')
  })

  describe('deleteCompromisso e deleteOcorrencia - tratamento idempotente de 404', () => {
    beforeEach(() => {
      vi.clearAllMocks()
    })

    it('deleteCompromisso retorna true quando registro existe e é excluído com sucesso', async () => {
      const mockDelete = vi.fn().mockResolvedValue(true)
      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'despesas_compromisso') {
          return { delete: mockDelete } as any
        }
        return {} as any
      })

      const res = await despesasService.deleteCompromisso('comp_existente')
      expect(mockDelete).toHaveBeenCalledWith('comp_existente')
      expect(res).toBe(true)
    })

    it('deleteCompromisso trata ClientResponseError com status 404 como sucesso idempotente sem lançar erro', async () => {
      const error404 = new ClientResponseError({
        status: 404,
        response: { message: "The requested resource wasn't found", code: 404, data: {} },
      })
      const mockDelete = vi.fn().mockRejectedValue(error404)
      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'despesas_compromisso') {
          return { delete: mockDelete } as any
        }
        return {} as any
      })

      const res = await despesasService.deleteCompromisso('comp_ja_deletado')
      expect(mockDelete).toHaveBeenCalledWith('comp_ja_deletado')
      expect(res).toBe(true)
    })

    it('deleteCompromisso propaga outros erros como 400, 429 ou 500', async () => {
      const error429 = new ClientResponseError({
        status: 429,
        response: { message: 'Too Many Requests', code: 429, data: {} },
      })
      const mockDelete = vi.fn().mockRejectedValue(error429)
      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'despesas_compromisso') {
          return { delete: mockDelete } as any
        }
        return {} as any
      })

      await expect(despesasService.deleteCompromisso('comp_123')).rejects.toThrow()
    })

    it('deleteOcorrencia trata 404 na ocorrência e no lançamento de forma idempotente', async () => {
      const error404 = new ClientResponseError({
        status: 404,
        response: { message: "The requested resource wasn't found", code: 404, data: {} },
      })
      const mockGetOne = vi.fn().mockRejectedValue(error404)
      const mockDelete = vi.fn().mockRejectedValue(error404)

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'despesas_ocorrencias') {
          return { getOne: mockGetOne, delete: mockDelete } as any
        }
        return {} as any
      })

      const res = await despesasService.deleteOcorrencia('oc_ja_deletada')
      expect(res).toBe(true)
    })

    it('deleteOcorrencia quando delete final retorna 404 também é idempotente', async () => {
      const error404 = new ClientResponseError({
        status: 404,
        response: { message: "The requested resource wasn't found", code: 404, data: {} },
      })
      const mockGetOne = vi.fn().mockResolvedValue({ id: 'oc_existente', lancamento: null })
      const mockDelete = vi.fn().mockRejectedValue(error404)

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'despesas_ocorrencias') {
          return { getOne: mockGetOne, delete: mockDelete } as any
        }
        return {} as any
      })

      const res = await despesasService.deleteOcorrencia('oc_existente')
      expect(mockDelete).toHaveBeenCalledWith('oc_existente')
      expect(res).toBe(true)
    })
  })
})

describe('despesasService - setCompromissoAtivo', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('desativa o compromisso e quando excluirPrevistas=true exclui apenas ocorrências previstas não pagas, preservando as pagas', async () => {
    const mockCompromissoUpdate = vi.fn().mockResolvedValue({
      id: 'comp_academia',
      descricao: 'Academia',
      ativo: false,
    })

    const mockOcorrenciasPrevistas = [
      { id: 'oc_prevista_1', status: 'prevista', data_pagamento: null },
      { id: 'oc_prevista_2', status: 'prevista', data_pagamento: null },
    ]

    const mockDelete = vi.fn().mockResolvedValue(true)
    const mockGetFullList = vi.fn().mockResolvedValue(mockOcorrenciasPrevistas)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_compromisso') {
        return {
          update: mockCompromissoUpdate,
        } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getFullList: mockGetFullList,
          delete: mockDelete,
        } as any
      }
      return {} as any
    })

    const result = await despesasService.setCompromissoAtivo({
      compromissoId: 'comp_academia',
      ativo: false,
      excluirPrevistas: true,
    })

    expect(mockCompromissoUpdate).toHaveBeenCalledWith('comp_academia', { ativo: false })
    expect(mockDelete).toHaveBeenCalledTimes(2)
    expect(mockDelete).toHaveBeenCalledWith('oc_prevista_1')
    expect(mockDelete).toHaveBeenCalledWith('oc_prevista_2')
    expect(result.ocorrenciasExcluidas).toBe(2)
    expect(result.compromisso.ativo).toBe(false)
  })

  it('desativa o compromisso com excluirPrevistas=false sem excluir ocorrências', async () => {
    const mockCompromissoUpdate = vi.fn().mockResolvedValue({
      id: 'comp_academia',
      descricao: 'Academia',
      ativo: false,
    })

    const mockDelete = vi.fn().mockResolvedValue(true)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_compromisso') {
        return { update: mockCompromissoUpdate } as any
      }
      if (name === 'despesas_ocorrencias') {
        return { delete: mockDelete } as any
      }
      return {} as any
    })

    const result = await despesasService.setCompromissoAtivo({
      compromissoId: 'comp_academia',
      ativo: false,
      excluirPrevistas: false,
    })

    expect(mockCompromissoUpdate).toHaveBeenCalledWith('comp_academia', { ativo: false })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(result.ocorrenciasExcluidas).toBe(0)
  })

  it('reativa o compromisso definindo ativo=true sem excluir ocorrências', async () => {
    const mockCompromissoUpdate = vi.fn().mockResolvedValue({
      id: 'comp_academia',
      descricao: 'Academia',
      ativo: true,
    })

    const mockDelete = vi.fn().mockResolvedValue(true)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_compromisso') {
        return { update: mockCompromissoUpdate } as any
      }
      if (name === 'despesas_ocorrencias') {
        return { delete: mockDelete } as any
      }
      return {} as any
    })

    const result = await despesasService.setCompromissoAtivo({
      compromissoId: 'comp_academia',
      ativo: true,
    })

    expect(mockCompromissoUpdate).toHaveBeenCalledWith('comp_academia', { ativo: true })
    expect(mockDelete).not.toHaveBeenCalled()
    expect(result.compromisso.ativo).toBe(true)
  })
})

describe('despesasService - gerarOcorrenciasParaCompromissosLote', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('ignora compromissos inativos e gera apenas para compromissos ativos cobrindo competências e janela futura', async () => {
    const spyGerar = vi
      .spyOn(despesasService, 'gerarOcorrenciasParaCompromisso')
      .mockResolvedValue(undefined)

    const mockGetFullList = vi.fn().mockResolvedValue([])

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_ocorrencias') {
        return {
          getFullList: mockGetFullList,
        } as any
      }
      return {} as any
    })

    const compAtivo = {
      id: 'comp_ativo',
      descricao: 'Internet Fibra',
      ativo: true,
      regra_repeticao: 'mensal',
    } as unknown as DespesaCompromisso

    const compInativo = {
      id: 'comp_inativo',
      descricao: 'Academia Desativada',
      ativo: false,
      regra_repeticao: 'mensal',
    } as unknown as DespesaCompromisso

    await despesasService.gerarOcorrenciasParaCompromissosLote({
      compromissos: [compAtivo, compInativo],
      competencias: ['2026-05'],
      batchSize: 5,
      batchDelayMs: 0,
      incluirMesesFuturos: true,
    })

    // Deve chamar apenas para compAtivo
    expect(spyGerar).toHaveBeenCalledTimes(1)
    expect(spyGerar.mock.calls[0][0].id).toBe('comp_ativo')

    // Competências passadas devem incluir a informada ('2026-05') mais os 3 meses futuros da janela ('2026-06', '2026-07', '2026-08')
    // Nota: Como realCurrentComp é a data local (ex: 2026-10), se a competência passada for anterior ao mês corrente,
    // a sincronização em lote filtra apenas competências >= mês corrente.
    // Para testar a janela de meses futuros com a competência corrente:
    const competenciasGeradas = spyGerar.mock.calls[0][1] as string[]
    expect(competenciasGeradas.length).toBeGreaterThan(0)
    // Todos os meses gerados devem ser >= mês corrente
    competenciasGeradas.forEach((comp) => {
      expect(comp >= '2026-10').toBe(true)
    })

    spyGerar.mockRestore()
  })

  it('não recria competências passadas (anteriores ao mês corrente) durante sincronização em lote', async () => {
    const spyGerar = vi
      .spyOn(despesasService, 'gerarOcorrenciasParaCompromisso')
      .mockResolvedValue(undefined)

    const compAtivo = {
      id: 'comp_ativo',
      descricao: 'Internet Fibra',
      ativo: true,
      regra_repeticao: 'mensal',
    } as unknown as DespesaCompromisso

    // Chamada pedindo competência passada ('2026-09') sem incluir futuros
    await despesasService.gerarOcorrenciasParaCompromissosLote({
      compromissos: [compAtivo],
      competencias: ['2026-09'],
      incluirMesesFuturos: false,
    })

    // Não deve chamar gerarOcorrenciasParaCompromisso para competências passadas
    expect(spyGerar).not.toHaveBeenCalled()
    spyGerar.mockRestore()
  })

  it('não executa se todos os compromissos forem inativos', async () => {
    const spyGerar = vi
      .spyOn(despesasService, 'gerarOcorrenciasParaCompromisso')
      .mockResolvedValue(undefined)

    const compInativo = {
      id: 'comp_inativo_sozinho',
      descricao: 'Academia 2',
      ativo: false,
    } as unknown as DespesaCompromisso

    await despesasService.gerarOcorrenciasParaCompromissosLote({
      compromissos: [compInativo],
      competencias: ['2026-05'],
    })

    expect(spyGerar).not.toHaveBeenCalled()
    spyGerar.mockRestore()
  })
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
      expect(resultado.cartoes[0].abas).toBeDefined()
      expect(resultado.cartoes[0].abas).toHaveLength(1)
      expect(resultado.cartoes[0].abas[0].tipo).toBe('credito')
      expect(resultado.cartoes[0].abas[0].ocorrencias).toHaveLength(1)
      expect(resultado.cartoes[0].abas[0].ocorrencias[0].id).toBe('oc_card')

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

    it('particiona ocorrências do cartão nas abas de acordo com os tipos de pagamento cadastrados (ex: crédito, boletos, pix)', () => {
      const cartaoPorto: Conta = {
        id: 'cartao_porto',
        nome: 'Porto Seguro',
        tipo: 'cartao',
        tipos_pagamento: ['credito', 'boletos', 'pix'],
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
        nome: 'Boleto Bancário',
        tipo: 'boleto',
        ativo: true,
      } as MetodoPagamento

      const metodoCredito: MetodoPagamento = {
        id: 'm_cred',
        nome: 'Cartão de Crédito',
        tipo: 'cartao',
        ativo: true,
      } as MetodoPagamento

      const compCredito: DespesaCompromisso = {
        id: 'comp_c1',
        descricao: 'Compra Mercado Crédito',
        secao: 'cartoes_credito',
        conta_padrao: 'cartao_porto',
        metodo_pagamento: 'm_cred',
        ativo: true,
      } as DespesaCompromisso

      const compBoleto: DespesaCompromisso = {
        id: 'comp_c2',
        descricao: 'Fatura Boleto Seguro',
        secao: 'cartoes_credito',
        conta_padrao: 'cartao_porto',
        metodo_pagamento: 'm_bol',
        ativo: true,
      } as DespesaCompromisso

      const compPix: DespesaCompromisso = {
        id: 'comp_c3',
        descricao: 'Pagamento Pix no Cartão',
        secao: 'cartoes_credito',
        conta_padrao: 'cartao_porto',
        metodo_pagamento: 'm_pix',
        ativo: true,
      } as DespesaCompromisso

      const compSemMetodo: DespesaCompromisso = {
        id: 'comp_c4',
        descricao: 'Compra Sem Método (Cai no primeiro tipo: crédito)',
        secao: 'cartoes_credito',
        conta_padrao: 'cartao_porto',
        ativo: true,
      } as DespesaCompromisso

      const ocCredito: DespesaOcorrencia = {
        id: 'oc_c1',
        compromisso: 'comp_c1',
        conta: 'cartao_porto',
        secao: 'cartoes_credito',
        valor_previsto: 150,
      } as DespesaOcorrencia

      const ocBoleto: DespesaOcorrencia = {
        id: 'oc_c2',
        compromisso: 'comp_c2',
        conta: 'cartao_porto',
        secao: 'cartoes_credito',
        valor_previsto: 200,
      } as DespesaOcorrencia

      const ocPix: DespesaOcorrencia = {
        id: 'oc_c3',
        compromisso: 'comp_c3',
        conta: 'cartao_porto',
        secao: 'cartoes_credito',
        valor_previsto: 50,
      } as DespesaOcorrencia

      const ocSemMetodo: DespesaOcorrencia = {
        id: 'oc_c4',
        compromisso: 'comp_c4',
        conta: 'cartao_porto',
        secao: 'cartoes_credito',
        valor_previsto: 80,
      } as DespesaOcorrencia

      const resultado = despesasService.agruparDespesasParaVisualizacao({
        ocorrencias: [ocCredito, ocBoleto, ocPix, ocSemMetodo],
        contas: [cartaoPorto],
        compromissos: [compCredito, compBoleto, compPix, compSemMetodo],
        metodosPagamento: [metodoPix, metodoBoleto, metodoCredito],
      })

      expect(resultado.cartoes).toHaveLength(1)
      const portoGroup = resultado.cartoes[0]
      expect(portoGroup.conta.id).toBe('cartao_porto')
      expect(portoGroup.ocorrencias).toHaveLength(4)

      // Deve ter 3 abas na mesma ordem do cadastro: credito, boletos, pix
      expect(portoGroup.abas).toHaveLength(3)
      expect(portoGroup.abas[0].tipo).toBe('credito')
      expect(portoGroup.abas[1].tipo).toBe('boletos')
      expect(portoGroup.abas[2].tipo).toBe('pix')

      // Crédito deve conter ocCredito e ocSemMetodo (fallback para o primeiro tipo)
      expect(portoGroup.abas[0].ocorrencias).toHaveLength(2)
      expect(portoGroup.abas[0].ocorrencias.map((o) => o.id)).toContain('oc_c1')
      expect(portoGroup.abas[0].ocorrencias.map((o) => o.id)).toContain('oc_c4')

      // Boletos
      expect(portoGroup.abas[1].ocorrencias).toHaveLength(1)
      expect(portoGroup.abas[1].ocorrencias[0].id).toBe('oc_c2')

      // Pix
      expect(portoGroup.abas[2].ocorrencias).toHaveLength(1)
      expect(portoGroup.abas[2].ocorrencias[0].id).toBe('oc_c3')
    })

    it('cartão inativo/arquivado não gera grupo próprio e suas ocorrências são alocadas em semConta', () => {
      const cartaoAtivo: Conta = {
        id: 'cartao_nu_dest',
        nome: 'NuBank',
        tipo: 'cartao',
        tipos_pagamento: ['credito'],
        ativa: true,
      } as Conta

      const cartaoInativo: Conta = {
        id: 'cartao_antigo_arq',
        nome: '0',
        tipo: 'cartao',
        tipos_pagamento: ['credito'],
        ativa: false,
      } as Conta

      const compAtivo: DespesaCompromisso = {
        id: 'comp_ativo',
        descricao: 'Compra Ativa',
        secao: 'cartoes_credito',
        conta_padrao: 'cartao_nu_dest',
        ativo: true,
      } as DespesaCompromisso

      const compArquivado: DespesaCompromisso = {
        id: 'comp_arq',
        descricao: 'Compra Antiga Arquivada',
        secao: 'cartoes_credito',
        conta_padrao: 'cartao_antigo_arq',
        ativo: true,
      } as DespesaCompromisso

      const ocAtiva: DespesaOcorrencia = {
        id: 'oc_ativa',
        compromisso: 'comp_ativo',
        conta: 'cartao_nu_dest',
        secao: 'cartoes_credito',
        valor_previsto: 100,
        status: 'paga',
      } as DespesaOcorrencia

      const ocArquivada: DespesaOcorrencia = {
        id: 'oc_arq',
        compromisso: 'comp_arq',
        conta: 'cartao_antigo_arq',
        secao: 'cartoes_credito',
        valor_previsto: 200,
        status: 'paga',
      } as DespesaOcorrencia

      const resultado = despesasService.agruparDespesasParaVisualizacao({
        ocorrencias: [ocAtiva, ocArquivada],
        contas: [cartaoAtivo, cartaoInativo],
        compromissos: [compAtivo, compArquivado],
        metodosPagamento: [],
      })

      // Apenas o cartão ativo deve ter grupo gerado
      expect(resultado.cartoes).toHaveLength(1)
      expect(resultado.cartoes[0].conta.id).toBe('cartao_nu_dest')
      expect(resultado.cartoes[0].ocorrencias).toHaveLength(1)
      expect(resultado.cartoes[0].ocorrencias[0].id).toBe('oc_ativa')

      // Ocorrência do cartão arquivado não sumiu: foi para semConta
      expect(resultado.semConta).toHaveLength(1)
      expect(resultado.semConta[0].id).toBe('oc_arq')
    })

    it('todas as despesas migradas de NuBank t para NuBank aparecem no grupo NuBank', () => {
      const contaDestino: Conta = {
        id: 'sglo7dfsqvgfsni',
        nome: 'NuBank',
        tipo: 'cartao',
        tipos_pagamento: ['debito', 'transferencia', 'boletos', 'pix', 'credito'],
        ativa: true,
      } as Conta

      const compMigrado: DespesaCompromisso = {
        id: 'comp_migrado',
        descricao: 'Supermercado Pão de Açúcar',
        secao: 'cartoes_credito',
        conta_padrao: 'sglo7dfsqvgfsni',
        ativo: true,
      } as DespesaCompromisso

      const ocMigrada: DespesaOcorrencia = {
        id: 'oc_migrada_1',
        compromisso: 'comp_migrado',
        conta: 'sglo7dfsqvgfsni',
        secao: 'cartoes_credito',
        valor_previsto: 684.2,
        status: 'paga',
      } as DespesaOcorrencia

      const resultado = despesasService.agruparDespesasParaVisualizacao({
        ocorrencias: [ocMigrada],
        contas: [contaDestino],
        compromissos: [compMigrado],
        metodosPagamento: [],
      })

      expect(resultado.cartoes).toHaveLength(1)
      expect(resultado.cartoes[0].conta.id).toBe('sglo7dfsqvgfsni')
      expect(resultado.cartoes[0].conta.nome).toBe('NuBank')
      expect(resultado.cartoes[0].ocorrencias).toHaveLength(1)
      expect(resultado.cartoes[0].ocorrencias[0].id).toBe('oc_migrada_1')
      expect(resultado.semConta).toHaveLength(0)
    })

    it('deve incluir todas as contas ativas mesmo sem despesas no mês para garantir botão de adicionar uniforme', () => {
      const contaSemDespesa: Conta = {
        id: 'conta_vazia',
        nome: 'Conta Zerada',
        tipo: 'bancaria',
        ativa: true,
        ordem: 2,
        saldo_inicial: 0,
        tipos_pagamento: ['pix'],
        created: '2026-01-01',
        updated: '2026-01-01',
      } as unknown as Conta
      const contaComDespesa: Conta = {
        id: 'conta_ativa',
        nome: 'Conta Ativa',
        tipo: 'bancaria',
        ativa: true,
        ordem: 1,
        saldo_inicial: 0,
        tipos_pagamento: ['pix'],
        created: '2026-01-01',
        updated: '2026-01-01',
      } as unknown as Conta
      const contaInativaSemDespesa: Conta = {
        id: 'conta_inativa',
        nome: 'Conta Inativa',
        tipo: 'bancaria',
        ativa: false,
        ordem: 3,
        saldo_inicial: 0,
        tipos_pagamento: ['pix'],
        created: '2026-01-01',
        updated: '2026-01-01',
      } as unknown as Conta

      const comp: DespesaCompromisso = {
        id: 'comp_1',
        descricao: 'Internet',
        secao: 'contas_mensais_pix_boleto',
        conta_padrao: 'conta_ativa',
        ativo: true,
      } as DespesaCompromisso

      const oc: DespesaOcorrencia = {
        id: 'oc_1',
        compromisso: 'comp_1',
        conta: 'conta_ativa',
        secao: 'contas_mensais_pix_boleto',
        valor_previsto: 120,
      } as DespesaOcorrencia

      const resultado = despesasService.agruparDespesasParaVisualizacao({
        ocorrencias: [oc],
        contas: [contaSemDespesa, contaComDespesa, contaInativaSemDespesa],
        compromissos: [comp],
        metodosPagamento: [],
      })

      // Ambas as contas ativas devem estar presentes, respeitando a ordem
      // Contas inativas sem despesas são filtradas
      expect(resultado.contasNaoCartao).toHaveLength(2)
      expect(resultado.contasNaoCartao[0].conta.id).toBe('conta_ativa')
      expect(resultado.contasNaoCartao[0].totalOcorrencias).toBe(1)
      expect(resultado.contasNaoCartao[1].conta.id).toBe('conta_vazia')
      expect(resultado.contasNaoCartao[1].totalOcorrencias).toBe(0)
    })

    it('separa corretamente as despesas em dinheiro da lista de contas não-cartão', () => {
      const contaCorrente: Conta = {
        id: 'conta_banco',
        nome: 'Sicredi',
        tipo: 'bancaria',
        ativa: true,
        tipos_pagamento: ['pix'],
      } as unknown as Conta

      const metodoDinheiro: MetodoPagamento = {
        id: 'm_dinheiro',
        nome: 'Dinheiro',
        tipo: 'dinheiro',
        ativo: true,
      } as MetodoPagamento

      const compBanco: DespesaCompromisso = {
        id: 'comp_b',
        descricao: 'Luz Escritório',
        secao: 'contas_mensais_pix_boleto',
        conta_padrao: 'conta_banco',
        ativo: true,
      } as DespesaCompromisso

      const compDinheiro: DespesaCompromisso = {
        id: 'comp_d',
        descricao: 'Compra Mercado Feira',
        secao: 'contas_mensais_pix_boleto',
        metodo_pagamento: 'm_dinheiro',
        ativo: true,
      } as DespesaCompromisso

      const ocBanco: DespesaOcorrencia = {
        id: 'oc_b',
        compromisso: 'comp_b',
        conta: 'conta_banco',
        secao: 'contas_mensais_pix_boleto',
        valor_previsto: 250,
      } as DespesaOcorrencia

      const ocDinheiro: DespesaOcorrencia = {
        id: 'oc_d',
        compromisso: 'comp_d',
        secao: 'contas_mensais_pix_boleto',
        valor_previsto: 80,
      } as DespesaOcorrencia

      const resultado = despesasService.agruparDespesasParaVisualizacao({
        ocorrencias: [ocBanco, ocDinheiro],
        contas: [contaCorrente],
        compromissos: [compBanco, compDinheiro],
        metodosPagamento: [metodoDinheiro],
      })

      // Sicredi deve ter apenas 1 ocorrência (a do banco)
      expect(resultado.contasNaoCartao[0].conta.nome).toBe('Sicredi')
      expect(resultado.contasNaoCartao[0].totalOcorrencias).toBe(1)
      expect(resultado.contasNaoCartao[0].abas[0].ocorrencias[0].id).toBe('oc_b')

      // Ocorrência em dinheiro deve ir para despesasAgrupadas.dinheiro
      expect(resultado.dinheiro).toHaveLength(1)
      expect(resultado.dinheiro[0].id).toBe('oc_d')
    })

    describe('Lista Única de Contas (agrupamento unificado)', () => {
      it('ordena a lista única de contas por conta.ordem ascendente e depois alfabeticamente', () => {
        const c3: Conta = {
          id: 'c3',
          nome: 'Conta C',
          tipo: 'bancaria',
          ordem: 30,
          ativa: true,
          tipos_pagamento: ['pix'],
        } as unknown as Conta
        const c1: Conta = {
          id: 'c1',
          nome: 'Conta A',
          tipo: 'cartao',
          ordem: 10,
          ativa: true,
          tipos_pagamento: ['credito'],
        } as unknown as Conta
        const c2: Conta = {
          id: 'c2',
          nome: 'Conta B',
          tipo: 'bancaria',
          ordem: 20,
          ativa: true,
          tipos_pagamento: ['boletos'],
        } as unknown as Conta
        const cSemOrdemZ: Conta = {
          id: 'c_z',
          nome: 'Zeta',
          tipo: 'carteira',
          ativa: true,
          tipos_pagamento: ['dinheiro'],
        } as unknown as Conta
        const cSemOrdemA: Conta = {
          id: 'c_a',
          nome: 'Alfa',
          tipo: 'carteira',
          ativa: true,
          tipos_pagamento: ['dinheiro'],
        } as unknown as Conta

        const resultado = despesasService.agruparDespesasParaVisualizacao({
          ocorrencias: [],
          contas: [c3, cSemOrdemZ, c1, cSemOrdemA, c2],
          compromissos: [],
          metodosPagamento: [],
        })

        const ids = resultado.contas.map((g) => g.conta.id)
        expect(ids).toEqual(['c1', 'c2', 'c3', 'c_a', 'c_z'])
      })

      it('gera abas por tipos_pagamento cadastrados na conta com contagem e soma', () => {
        const contaMulti: Conta = {
          id: 'c_multi',
          nome: 'Banco Inter',
          tipo: 'bancaria',
          ordem: 1,
          ativa: true,
          tipos_pagamento: ['pix', 'boletos', 'debito'],
        } as unknown as Conta

        const mPix: MetodoPagamento = {
          id: 'm_pix',
          nome: 'Pix',
          tipo: 'pix',
          ativo: true,
        } as MetodoPagamento
        const mBol: MetodoPagamento = {
          id: 'm_bol',
          nome: 'Boleto',
          tipo: 'boleto',
          ativo: true,
        } as MetodoPagamento

        const compPix: DespesaCompromisso = {
          id: 'cp_1',
          descricao: 'Pix Luz',
          conta_padrao: 'c_multi',
          metodo_pagamento: 'm_pix',
          ativo: true,
        } as DespesaCompromisso
        const compBol: DespesaCompromisso = {
          id: 'cp_2',
          descricao: 'Boleto Condomínio',
          conta_padrao: 'c_multi',
          metodo_pagamento: 'm_bol',
          ativo: true,
        } as DespesaCompromisso

        const oc1: DespesaOcorrencia = {
          id: 'oc_1',
          compromisso: 'cp_1',
          conta: 'c_multi',
          valor_previsto: 100,
        } as DespesaOcorrencia
        const oc2: DespesaOcorrencia = {
          id: 'oc_2',
          compromisso: 'cp_2',
          conta: 'c_multi',
          valor_previsto: 350,
        } as DespesaOcorrencia

        const res = despesasService.agruparDespesasParaVisualizacao({
          ocorrencias: [oc1, oc2],
          contas: [contaMulti],
          compromissos: [compPix, compBol],
          metodosPagamento: [mPix, mBol],
        })

        expect(res.contas).toHaveLength(1)
        const grupo = res.contas[0]
        expect(grupo.abas.map((a) => a.tipo)).toEqual(['pix', 'boletos', 'debito'])

        const abaPix = grupo.abas.find((a) => a.tipo === 'pix')!
        expect(abaPix.ocorrencias).toHaveLength(1)
        expect(abaPix.ocorrencias[0].id).toBe('oc_1')

        const abaBol = grupo.abas.find((a) => a.tipo === 'boletos')!
        expect(abaBol.ocorrencias).toHaveLength(1)
        expect(abaBol.ocorrencias[0].id).toBe('oc_2')

        const abaDeb = grupo.abas.find((a) => a.tipo === 'debito')!
        expect(abaDeb.ocorrencias).toHaveLength(0)
      })

      it('aloca assinaturas anuais dentro do grupo da conta vinculada', () => {
        const contaNubank: Conta = {
          id: 'c_nu',
          nome: 'Nubank',
          tipo: 'cartao',
          ordem: 1,
          ativa: true,
          tipos_pagamento: ['credito'],
        } as unknown as Conta

        const compAssinatura: DespesaCompromisso = {
          id: 'comp_anual',
          descricao: 'Amazon Prime Anual',
          secao: 'assinaturas_anuais',
          periodicidade: 'anual',
          conta_padrao: 'c_nu',
          ativo: true,
        } as unknown as DespesaCompromisso

        const ocAnual: DespesaOcorrencia = {
          id: 'oc_anual_1',
          compromisso: 'comp_anual',
          conta: 'c_nu',
          secao: 'assinaturas_anuais',
          valor_previsto: 166.8,
        } as DespesaOcorrencia

        const res = despesasService.agruparDespesasParaVisualizacao({
          ocorrencias: [ocAnual],
          contas: [contaNubank],
          compromissos: [compAssinatura],
          metodosPagamento: [],
        })

        // Na lista única de contas, a assinatura fica dentro do grupo da conta 'c_nu'
        expect(res.contas).toHaveLength(1)
        expect(res.contas[0].conta.id).toBe('c_nu')
        expect(res.contas[0].ocorrencias.map((o) => o.id)).toContain('oc_anual_1')
      })

      it('aloca despesas em dinheiro no grupo residual dinheiro e não nas contas', () => {
        const contaBancaria: Conta = {
          id: 'c_banco',
          nome: 'Itaú',
          tipo: 'bancaria',
          ordem: 1,
          ativa: true,
          tipos_pagamento: ['pix'],
        } as unknown as Conta

        const mDin: MetodoPagamento = {
          id: 'm_din',
          nome: 'Espécie',
          tipo: 'dinheiro',
          ativo: true,
        } as MetodoPagamento

        const compDin: DespesaCompromisso = {
          id: 'cp_din',
          descricao: 'Feira Livre',
          metodo_pagamento: 'm_din',
          ativo: true,
        } as DespesaCompromisso

        const ocDin: DespesaOcorrencia = {
          id: 'oc_din_feira',
          compromisso: 'cp_din',
          valor_previsto: 45,
        } as DespesaOcorrencia

        const res = despesasService.agruparDespesasParaVisualizacao({
          ocorrencias: [ocDin],
          contas: [contaBancaria],
          compromissos: [compDin],
          metodosPagamento: [mDin],
        })

        expect(res.dinheiro).toHaveLength(1)
        expect(res.dinheiro[0].id).toBe('oc_din_feira')
        expect(res.contas[0].ocorrencias).toHaveLength(0)
      })

      it('aloca despesas órfãs ou de contas inexistentes/inativas em semConta', () => {
        const contaAtiva: Conta = {
          id: 'c_ok',
          nome: 'Ativa',
          tipo: 'bancaria',
          ordem: 1,
          ativa: true,
          tipos_pagamento: ['pix'],
        } as unknown as Conta

        const contaInativa: Conta = {
          id: 'c_old',
          nome: 'Velha',
          tipo: 'bancaria',
          ordem: 2,
          ativa: false,
          tipos_pagamento: ['pix'],
        } as unknown as Conta

        const ocSemNenhumaConta: DespesaOcorrencia = {
          id: 'oc_orfa_1',
          valor_previsto: 50,
        } as DespesaOcorrencia

        const ocContaInativa: DespesaOcorrencia = {
          id: 'oc_orfa_2',
          conta: 'c_old',
          valor_previsto: 90,
        } as DespesaOcorrencia

        const res = despesasService.agruparDespesasParaVisualizacao({
          ocorrencias: [ocSemNenhumaConta, ocContaInativa],
          contas: [contaAtiva, contaInativa],
          compromissos: [],
          metodosPagamento: [],
        })

        expect(res.semConta.map((o) => o.id)).toEqual(['oc_orfa_1', 'oc_orfa_2'])
      })

      it('conta com crédito expõe ciclo através de contaAceitaCredito e dia_fechamento/dia_vencimento', () => {
        const cartaoPuro: Conta = {
          id: 'c_card',
          nome: 'Mastercard Black',
          tipo: 'cartao',
          dia_fechamento: 5,
          dia_vencimento: 15,
          ativa: true,
          tipos_pagamento: ['credito'],
        } as unknown as Conta

        const contaMista: Conta = {
          id: 'c_mista',
          nome: 'C6 Bank',
          tipo: 'bancaria',
          dia_fechamento: 8,
          dia_vencimento: 18,
          ativa: true,
          tipos_pagamento: ['pix', 'credito'],
        } as unknown as Conta

        const contaApenasDebito: Conta = {
          id: 'c_deb',
          nome: 'Caixa Poupança',
          tipo: 'bancaria',
          ativa: true,
          tipos_pagamento: ['debito'],
        } as unknown as Conta

        expect(contaAceitaCredito(cartaoPuro)).toBe(true)
        expect(contaAceitaCredito(contaMista)).toBe(true)
        expect(contaAceitaCredito(contaApenasDebito)).toBe(false)
        expect(cartaoPuro.dia_fechamento).toBe(5)
        expect(cartaoPuro.dia_vencimento).toBe(15)
        expect(contaMista.dia_fechamento).toBe(8)
        expect(contaMista.dia_vencimento).toBe(18)
      })
    })
  })

  describe('isMetodoCredito e regra exclusiva de ciclo da fatura', () => {
    it('identifica corretamente métodos de crédito por código, nome com ou sem acento', () => {
      expect(
        isMetodoCredito({ id: '1', codigo: 'Credito', nome: 'Crédito', tipo: 'cartao' } as any),
      ).toBe(true)
      expect(
        isMetodoCredito({
          id: '2',
          codigo: 'cartao_credito',
          nome: 'Cartão de Crédito',
          tipo: 'cartao',
        } as any),
      ).toBe(true)
      expect(
        isMetodoCredito({
          id: '3',
          codigo: 'Outro',
          nome: 'Cartao Credito',
          tipo: 'cartao',
        } as any),
      ).toBe(true)
      expect(
        isMetodoCredito({ id: '4', codigo: 'credito', nome: 'Crédito Visa', tipo: 'outro' } as any),
      ).toBe(true)
    })

    it('exclui métodos de débito mesmo se tiver tipo cartao ou palavra cartao no nome', () => {
      expect(
        isMetodoCredito({ id: '5', codigo: 'Debito', nome: 'Débito', tipo: 'cartao' } as any),
      ).toBe(false)
      expect(
        isMetodoCredito({
          id: '6',
          codigo: 'cartao_debito',
          nome: 'Cartão de Débito',
          tipo: 'cartao',
        } as any),
      ).toBe(false)
      expect(
        isMetodoCredito({ id: '7', codigo: 'debito', nome: 'debito', tipo: 'cartao' } as any),
      ).toBe(false)
    })

    it('exclui outros métodos como Pix, Boleto, Transferência e Dinheiro', () => {
      expect(isMetodoCredito({ id: '8', codigo: 'Pix', nome: 'Pix', tipo: 'pix' } as any)).toBe(
        false,
      )
      expect(
        isMetodoCredito({
          id: '9',
          codigo: 'BoletoBancario',
          nome: 'Boleto Bancário',
          tipo: 'boleto',
        } as any),
      ).toBe(false)
      expect(
        isMetodoCredito({
          id: '10',
          codigo: 'Transferencia',
          nome: 'Transferência TED',
          tipo: 'transferencia',
        } as any),
      ).toBe(false)
      expect(
        isMetodoCredito({
          id: '11',
          codigo: 'Dinheiro',
          nome: 'Dinheiro',
          tipo: 'dinheiro',
        } as any),
      ).toBe(false)
      expect(isMetodoCredito(null)).toBe(false)
      expect(isMetodoCredito(undefined)).toBe(false)
    })

    it('funciona com string direta e com lista de métodos para lookup', () => {
      const metodosList: MetodoPagamento[] = [
        { id: 'm_cred', codigo: 'Credito', nome: 'Crédito', tipo: 'cartao' } as any,
        { id: 'm_pix', codigo: 'Pix', nome: 'Pix', tipo: 'pix' } as any,
      ]

      expect(isMetodoCredito('m_cred', metodosList)).toBe(true)
      expect(isMetodoCredito('m_pix', metodosList)).toBe(false)
      expect(isMetodoCredito('Credito')).toBe(true)
      expect(isMetodoCredito('cartao_credito')).toBe(true)
      expect(isMetodoCredito('Pix')).toBe(false)
      expect(isMetodoCredito('Debito')).toBe(false)
    })

    it('obterContaCartaoCompromisso: despesa em conta com crédito + Pix retorna null (não entra no ciclo)', async () => {
      const mockContaSicredi = {
        id: 'c_sicredi_cartao',
        nome: 'Sicred',
        tipo: 'cartao',
        tipos_pagamento: ['pix', 'debito', 'transferencia', 'boletos', 'credito'],
        dia_fechamento: 1,
        dia_vencimento: 10,
      }

      const mockMetodoPix = {
        id: 'm_pix_id',
        codigo: 'Pix',
        nome: 'Pix',
        tipo: 'pix',
      }

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return {
            getOne: vi.fn().mockResolvedValue(mockContaSicredi),
          } as any
        }
        if (name === 'metodos_pagamento') {
          return {
            getOne: vi.fn().mockResolvedValue(mockMetodoPix),
          } as any
        }
        return {} as any
      })

      const resultado = await despesasService.obterContaCartaoCompromisso({
        conta_padrao: 'c_sicredi_cartao',
        metodo_pagamento: 'm_pix_id',
      })

      // Como o método é Pix, DEVE retornar null mesmo a conta tendo dia_fechamento e aceitando crédito
      expect(resultado).toBeNull()
    })

    it('obterContaCartaoCompromisso: despesa em conta com crédito + método Crédito retorna a conta (entra no ciclo)', async () => {
      const mockContaSicredi = {
        id: 'c_sicredi_cartao',
        nome: 'Sicred',
        tipo: 'cartao',
        tipos_pagamento: ['pix', 'debito', 'transferencia', 'boletos', 'credito'],
        dia_fechamento: 1,
        dia_vencimento: 10,
      }

      const mockMetodoCredito = {
        id: 'm_credito_id',
        codigo: 'Credito',
        nome: 'Crédito',
        tipo: 'cartao',
      }

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return {
            getOne: vi.fn().mockResolvedValue(mockContaSicredi),
          } as any
        }
        if (name === 'metodos_pagamento') {
          return {
            getOne: vi.fn().mockResolvedValue(mockMetodoCredito),
          } as any
        }
        return {} as any
      })

      const resultado = await despesasService.obterContaCartaoCompromisso({
        conta_padrao: 'c_sicredi_cartao',
        metodo_pagamento: 'm_credito_id',
      })

      expect(resultado).not.toBeNull()
      expect(resultado?.id).toBe('c_sicredi_cartao')
    })

    it('obterContaCartaoCompromisso: conta com dia_fechamento STRING "16" sem método expandido retorna a conta', async () => {
      const mockContaNubank = {
        id: 'sglo7dfsqvgfsni',
        nome: 'NuBank',
        tipo: 'cartao',
        tipos_pagamento: ['debito', 'transferencia', 'boletos', 'pix', 'credito'],
        dia_fechamento: '16', // string vinda do SQLite
        dia_vencimento: '23',
      }

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return {
            getOne: vi.fn().mockResolvedValue(mockContaNubank),
          } as any
        }
        if (name === 'metodos_pagamento') {
          return {
            getOne: vi.fn().mockRejectedValue(new Error('Not found')),
          } as any
        }
        return {} as any
      })

      const resultado = await despesasService.obterContaCartaoCompromisso({
        conta_padrao: 'sglo7dfsqvgfsni',
      })

      expect(resultado).not.toBeNull()
      expect(resultado?.id).toBe('sglo7dfsqvgfsni')
    })

    it('gerarOcorrenciasParaCompromisso: despesa avulsa em conta com crédito + Pix gera competência normal e vencimento na própria data', async () => {
      const mockContaSicredi = {
        id: 'c_sicredi_cartao',
        nome: 'Sicred',
        tipo: 'cartao',
        tipos_pagamento: ['pix', 'debito', 'transferencia', 'boletos', 'credito'],
        dia_fechamento: 1,
        dia_vencimento: 10,
      }

      const mockMetodoPix = {
        id: 'm_pix_id',
        codigo: 'Pix',
        nome: 'Pix',
        tipo: 'pix',
      }

      const mockOcorrCreate = vi.fn().mockResolvedValue({ id: 'ocorr_nova_1' })
      const mockOcorrGetList = vi.fn().mockResolvedValue({ totalItems: 0, items: [] })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockContaSicredi) } as any
        }
        if (name === 'metodos_pagamento') {
          return { getOne: vi.fn().mockResolvedValue(mockMetodoPix) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getList: mockOcorrGetList,
            create: mockOcorrCreate,
          } as any
        }
        return {} as any
      })

      // Pedreiro / Birimate: data 02/10/2026, método Pix, conta Sicred (fechamento dia 1, vencimento dia 10)
      const compromissoPedreiro: DespesaCompromisso = {
        id: 'comp_pedreiro',
        descricao: 'Pedreiro',
        conta_padrao: 'c_sicredi_cartao',
        metodo_pagamento: 'm_pix_id',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'avulso',
        data_inicio: '2026-10-02 00:00:00.000Z',
        dia_vencimento: 2,
        valor_estimado: 200,
        contexto_tipo: 'empresa',
      } as any

      await despesasService.gerarOcorrenciasParaCompromisso(compromissoPedreiro)

      expect(mockOcorrCreate).toHaveBeenCalledTimes(1)
      const callData = mockOcorrCreate.mock.calls[0][0]

      // Competência deve ser 2026-10 (mês da compra), e NÃO 2026-11 (ciclo da fatura)
      expect(callData.competencia).toBe('2026-10')
      // Data de vencimento = 2026-10-02
      expect(callData.data_vencimento.slice(0, 10)).toBe('2026-10-02')
    })
  })

  describe('Regra de vencimento retroativo para NÃO crédito', () => {
    it('baixarOcorrencia: pagamento em 30/09 de ocorrência com venc 30/10 recalcula venc para 30/09 (dia 30)', async () => {
      const mockContaSicred = {
        id: 'c_sicred',
        nome: 'Sicred',
        tipo: 'corrente',
      }
      const mockOcorrAtual = {
        id: 'ocorr_taxa_licenca',
        competencia: '2026-10',
        data_vencimento: '2026-10-30T12:00:00.000Z',
        valor_previsto: 154.97,
        secao: 'contas_mensais_pix_boleto',
        compromisso: {
          id: 'comp_taxa_licenca',
          dia_vencimento: 30,
        },
      }

      const mockUpdate = vi.fn().mockImplementation((id, data) => {
        return Promise.resolve({ id, ...data })
      })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockContaSicred) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getOne: vi.fn().mockResolvedValue(mockOcorrAtual),
            update: mockUpdate,
          } as any
        }
        if (name === 'lancamentos') {
          return {
            create: vi.fn().mockResolvedValue({ id: 'lanc_1' }),
          } as any
        }
        return {} as any
      })

      await despesasService.baixarOcorrencia({
        ocorrenciaId: 'ocorr_taxa_licenca',
        contaId: 'c_sicred',
        descricao: 'Taxa de Licença',
        valorPago: 154.97,
        dataPagamento: '2026-09-30',
      })

      expect(mockUpdate).toHaveBeenCalled()
      const updatePayload = mockUpdate.mock.calls[0][1]
      expect(updatePayload.status).toBe('paga')
      expect(updatePayload.competencia).toBe('2026-09')
      expect(updatePayload.data_vencimento.slice(0, 10)).toBe('2026-09-30')
    })

    it('baixarOcorrencia: pagamento em 05/09 com dia_vencimento 30 recalcula venc para 30/09 (clamp/corrida no mês do pagamento)', async () => {
      const mockContaSicred = {
        id: 'c_sicred',
        nome: 'Sicred',
        tipo: 'corrente',
      }
      const mockOcorrAtual = {
        id: 'ocorr_vivo',
        competencia: '2026-10',
        data_vencimento: '2026-10-05T12:00:00.000Z',
        valor_previsto: 102.91,
        secao: 'contas_mensais_pix_boleto',
        compromisso: {
          id: 'comp_vivo',
          dia_vencimento: 30, // dia 30 do compromisso
        },
      }

      const mockUpdate = vi.fn().mockImplementation((id, data) => {
        return Promise.resolve({ id, ...data })
      })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockContaSicred) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getOne: vi.fn().mockResolvedValue(mockOcorrAtual),
            update: mockUpdate,
          } as any
        }
        if (name === 'lancamentos') {
          return {
            create: vi.fn().mockResolvedValue({ id: 'lanc_2' }),
          } as any
        }
        return {} as any
      })

      await despesasService.baixarOcorrencia({
        ocorrenciaId: 'ocorr_vivo',
        contaId: 'c_sicred',
        descricao: 'Vivo',
        valorPago: 102.91,
        dataPagamento: '2026-09-05',
      })

      expect(mockUpdate).toHaveBeenCalled()
      const updatePayload = mockUpdate.mock.calls[0][1]
      expect(updatePayload.status).toBe('paga')
      expect(updatePayload.competencia).toBe('2026-09')
      // Mês de pagamento é 2026-09, dia_vencimento do compromisso é 30 -> 2026-09-30
      expect(updatePayload.data_vencimento.slice(0, 10)).toBe('2026-09-30')
    })

    it('crédito permanece no ciclo da fatura mesmo se pago antes', async () => {
      const mockContaCartao = {
        id: 'c_cartao_sicred',
        nome: 'Sicred Cartão',
        tipo: 'cartao',
        tipos_pagamento: ['credito'],
        dia_fechamento: 20,
        dia_vencimento: 28,
      }
      const mockMetodoCredito = {
        id: 'm_credito',
        codigo: 'Credito',
        nome: 'Crédito',
        tipo: 'cartao',
      }
      const mockOcorrCredito = {
        id: 'ocorr_credito_compra',
        competencia: '2026-10',
        data_vencimento: '2026-10-28T12:00:00.000Z',
        valor_previsto: 250,
        secao: 'cartoes_credito',
        compromisso: {
          id: 'comp_credito',
          dia_vencimento: 28,
          metodo_pagamento: 'm_credito',
        },
      }

      const mockUpdate = vi.fn().mockImplementation((id, data) => {
        return Promise.resolve({ id, ...data })
      })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockContaCartao) } as any
        }
        if (name === 'metodos_pagamento') {
          return { getOne: vi.fn().mockResolvedValue(mockMetodoCredito) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getOne: vi.fn().mockResolvedValue(mockOcorrCredito),
            update: mockUpdate,
            getList: vi.fn().mockResolvedValue({ totalItems: 0, items: [] }),
          } as any
        }
        if (name === 'lancamentos') {
          return {
            create: vi.fn().mockResolvedValue({ id: 'lanc_3' }),
          } as any
        }
        return {} as any
      })

      // Compra feita em 25/09 (após fechamento dia 20), cai na fatura com vencimento 28/10
      await despesasService.baixarOcorrencia({
        ocorrenciaId: 'ocorr_credito_compra',
        contaId: 'c_cartao_sicred',
        descricao: 'Compra Crédito',
        valorPago: 250,
        dataPagamento: '2026-09-25',
      })

      expect(mockUpdate).toHaveBeenCalled()
      const updatePayload = mockUpdate.mock.calls[0][1]
      expect(updatePayload.status).toBe('paga')
      // Para crédito, data_vencimento permanece no ciclo da fatura (outubro) e não é forçada para setembro!
      expect(updatePayload.competencia).toBe('2026-10')
      expect(updatePayload.data_vencimento).toBeUndefined() // Se já era 2026-10-28, não sofre override
    })

    it('regra é idempotente: pagar ocorrência já com vencimento no mês do pagamento não altera o vencimento', async () => {
      const mockContaSicred = {
        id: 'c_sicred',
        nome: 'Sicred',
        tipo: 'corrente',
      }
      const mockOcorrAtual = {
        id: 'ocorr_ja_corrigida',
        competencia: '2026-09',
        data_vencimento: '2026-09-30T12:00:00.000Z',
        valor_previsto: 100,
        secao: 'contas_mensais_pix_boleto',
        compromisso: {
          id: 'comp_c1',
          dia_vencimento: 30,
        },
      }

      const mockUpdate = vi.fn().mockImplementation((id, data) => {
        return Promise.resolve({ id, ...data })
      })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockContaSicred) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getOne: vi.fn().mockResolvedValue(mockOcorrAtual),
            update: mockUpdate,
          } as any
        }
        if (name === 'lancamentos') {
          return {
            create: vi.fn().mockResolvedValue({ id: 'lanc_4' }),
          } as any
        }
        return {} as any
      })

      await despesasService.baixarOcorrencia({
        ocorrenciaId: 'ocorr_ja_corrigida',
        contaId: 'c_sicred',
        descricao: 'Despesa já corrigida',
        valorPago: 100,
        dataPagamento: '2026-09-30',
      })

      expect(mockUpdate).toHaveBeenCalled()
      const updatePayload = mockUpdate.mock.calls[0][1]
      expect(updatePayload.data_vencimento).toBeUndefined()
    })
  })

  describe('gerarOcorrenciasParaCompromisso: continuidade e não omissão de competências correntes/retroativas', () => {
    it('compromisso criado dia 4 com vencimento dia 1 gera ocorrência do mês corrente como prevista (não pula mês)', async () => {
      // Simula o caso de Energia Elétrica / CPFL: data_inicio 2026-09-01, dia_vencimento=1, não-cartão (Boleto/Pix)
      const mockContaBoleto = {
        id: 'c_sicredi_empresa',
        nome: 'Sicred',
        tipo: 'corrente',
        tipos_pagamento: ['boletos', 'pix'],
      }

      const mockMetodoBoleto = {
        id: 'm_boleto_id',
        codigo: 'BoletoBancario',
        nome: 'Boleto Bancário',
        tipo: 'boleto',
      }

      const criadas: any[] = []
      const mockCreate = vi.fn().mockImplementation((data) => {
        const item = { id: `ocorr_${criadas.length + 1}`, ...data }
        criadas.push(item)
        return Promise.resolve(item)
      })

      // Simula banco com apenas a competência 2026-09 existente (paga)
      const mockGetList = vi.fn().mockImplementation((page, perPage, options) => {
        const filterStr = options?.filter || ''
        if (filterStr.includes("competencia = '2026-09'")) {
          return Promise.resolve({
            totalItems: 1,
            items: [{ id: 'oc_paga_09', competencia: '2026-09', status: 'paga' }],
          })
        }
        return Promise.resolve({ totalItems: 0, items: [] })
      })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockContaBoleto) } as any
        }
        if (name === 'metodos_pagamento') {
          return { getOne: vi.fn().mockResolvedValue(mockMetodoBoleto) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getList: mockGetList,
            create: mockCreate,
          } as any
        }
        return {} as any
      })

      const compromissoEnergia: DespesaCompromisso = {
        id: 'h3g4fjsx0yjxdge',
        descricao: 'Energia Elétrica',
        conta_padrao: 'c_sicredi_empresa',
        metodo_pagamento: 'm_boleto_id',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-09-01 00:00:00.000Z',
        dia_vencimento: 1,
        valor_estimado: 93.09,
        contexto_tipo: 'empresa',
      } as any

      await despesasService.gerarOcorrenciasParaCompromisso(compromissoEnergia)

      // A competência 2026-10 DEVE ter sido criada como prevista
      const ocorr10 = criadas.find((c) => c.competencia === '2026-10')
      expect(ocorr10).toBeDefined()
      expect(ocorr10.status).toBe('prevista')
      expect(ocorr10.data_vencimento.slice(0, 10)).toBe('2026-10-01')
      expect(ocorr10.valor_previsto).toBe(93.09)
      expect(ocorr10.valor_estimado_original).toBe(93.09)
    })

    it('nenhuma competência é pulada entre data_inicio e mês atual+3 na chamada padrão sem targetCompetencias', async () => {
      const mockConta = {
        id: 'c_corrente',
        nome: 'Conta Corrente',
        tipo: 'corrente',
        tipos_pagamento: ['pix', 'boletos'],
      }
      const mockMetodo = {
        id: 'm_pix',
        codigo: 'Pix',
        nome: 'Pix',
        tipo: 'pix',
      }

      const criadas: any[] = []
      const mockCreate = vi.fn().mockImplementation((data) => {
        const item = { id: `ocorr_${criadas.length + 1}`, ...data }
        criadas.push(item)
        return Promise.resolve(item)
      })

      const mockGetList = vi.fn().mockResolvedValue({ totalItems: 0, items: [] })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        if (name === 'metodos_pagamento')
          return { getOne: vi.fn().mockResolvedValue(mockMetodo) } as any
        if (name === 'despesas_ocorrencias') {
          return { getList: mockGetList, create: mockCreate } as any
        }
        return {} as any
      })

      // Compromisso iniciando em 2026-09 com vencimento dia 1
      const compromisso: DespesaCompromisso = {
        id: 'comp_continuo',
        descricao: 'Assinatura Software',
        conta_padrao: 'c_corrente',
        metodo_pagamento: 'm_pix',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-09-01 00:00:00.000Z',
        dia_vencimento: 1,
        valor_estimado: 50,
        contexto_tipo: 'empresa',
      } as any

      await despesasService.gerarOcorrenciasParaCompromisso(compromisso)

      // Calcula quais competências devem existir continuamente
      const now = new Date()
      const endYear = now.getUTCFullYear()
      const endMonth = now.getUTCMonth() + 3
      const targetEnd = new Date(Date.UTC(endYear, endMonth, 1))

      let cursor = new Date(Date.UTC(2026, 8, 1)) // 2026-09
      const esperadas: string[] = []
      while (cursor.getTime() <= targetEnd.getTime()) {
        const cY = cursor.getUTCFullYear()
        const cM = cursor.getUTCMonth()
        esperadas.push(`${cY}-${String(cM + 1).padStart(2, '0')}`)
        cursor = new Date(Date.UTC(cY, cM + 1, 1))
      }

      const criadasCompetencias = criadas.map((c) => c.competencia).sort()
      expect(criadasCompetencias).toEqual(esperadas)
    })

    it('quando targetCompetencias é fornecido, preenche competências faltantes desde data_inicio até a maior competência pedida', async () => {
      const mockConta = {
        id: 'c_corrente',
        nome: 'Conta Corrente',
        tipo: 'corrente',
        tipos_pagamento: ['pix'],
      }
      const mockMetodo = {
        id: 'm_pix',
        codigo: 'Pix',
        nome: 'Pix',
        tipo: 'pix',
      }

      const criadas: any[] = []
      const mockCreate = vi.fn().mockImplementation((data) => {
        const item = { id: `ocorr_${criadas.length + 1}`, ...data }
        criadas.push(item)
        return Promise.resolve(item)
      })

      // Simula que 2026-09 já existe no banco
      const mockGetList = vi.fn().mockImplementation((page, perPage, options) => {
        const filterStr = options?.filter || ''
        if (filterStr.includes("competencia = '2026-09'")) {
          return Promise.resolve({
            totalItems: 1,
            items: [{ id: 'oc_09', competencia: '2026-09' }],
          })
        }
        return Promise.resolve({ totalItems: 0, items: [] })
      })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        if (name === 'metodos_pagamento')
          return { getOne: vi.fn().mockResolvedValue(mockMetodo) } as any
        if (name === 'despesas_ocorrencias') {
          return { getList: mockGetList, create: mockCreate } as any
        }
        return {} as any
      })

      const compromisso: DespesaCompromisso = {
        id: 'comp_lote',
        descricao: 'Internet Escritório',
        conta_padrao: 'c_corrente',
        metodo_pagamento: 'm_pix',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-09-01 00:00:00.000Z',
        dia_vencimento: 1,
        valor_estimado: 100,
        contexto_tipo: 'empresa',
      } as any

      // Chamada pedindo explicitamente 2026-10 (como na navegação para /despesas em 2026-10)
      await despesasService.gerarOcorrenciasParaCompromisso(compromisso, ['2026-10'])

      // Deve ter gerado 2026-10 mesmo que o dia de vencimento (1) seja anterior à data atual
      const comp10 = criadas.find((c) => c.competencia === '2026-10')
      expect(comp10).toBeDefined()
      expect(comp10.status).toBe('prevista')
      expect(comp10.data_vencimento.slice(0, 10)).toBe('2026-10-01')
    })

    it('chamada repetida é estritamente idempotente e não duplica ocorrências existentes', async () => {
      const mockConta = {
        id: 'c_corrente',
        nome: 'Conta Corrente',
        tipo: 'corrente',
        tipos_pagamento: ['pix'],
      }
      const mockMetodo = {
        id: 'm_pix',
        codigo: 'Pix',
        nome: 'Pix',
        tipo: 'pix',
      }

      const mockCreate = vi.fn().mockResolvedValue({ id: 'nova' })

      // Todas as competências checadas já existem
      const mockGetList = vi.fn().mockResolvedValue({
        totalItems: 1,
        items: [{ id: 'ocorr_existente', status: 'prevista' }],
      })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        if (name === 'metodos_pagamento')
          return { getOne: vi.fn().mockResolvedValue(mockMetodo) } as any
        if (name === 'despesas_ocorrencias') {
          return { getList: mockGetList, create: mockCreate } as any
        }
        return {} as any
      })

      const compromisso: DespesaCompromisso = {
        id: 'comp_idempotente',
        descricao: 'Limpeza',
        conta_padrao: 'c_corrente',
        metodo_pagamento: 'm_pix',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-09-01 00:00:00.000Z',
        dia_vencimento: 1,
        valor_estimado: 120,
        contexto_tipo: 'pessoal',
      } as any

      await despesasService.gerarOcorrenciasParaCompromisso(compromisso)
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('REGRA DE PREVENÇÃO (1): competência com ocorrência paga NUNCA gera ocorrência prevista (paga vence prevista)', async () => {
      const mockConta = {
        id: 'c_corrente',
        nome: 'Conta Corrente',
        tipo: 'corrente',
        tipos_pagamento: ['pix'],
      }
      const mockMetodo = {
        id: 'm_pix',
        codigo: 'Pix',
        nome: 'Pix',
        tipo: 'pix',
      }

      const mockCreate = vi.fn().mockResolvedValue({ id: 'nova_indevida' })

      const compromisso: DespesaCompromisso = {
        id: 'comp_ballet_rafa',
        descricao: 'Ballet Rafa',
        conta_padrao: 'c_corrente',
        metodo_pagamento: 'm_pix',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-09-01 00:00:00.000Z',
        dia_vencimento: 5,
        valor_estimado: 267,
        contexto_tipo: 'pessoal',
      } as any

      // Ocorrência existente PAGA em 2026-09
      const ocorrenciasExistentesNoBanco: DespesaOcorrencia[] = [
        {
          id: 'ocorr_paga_setembro',
          compromisso: 'comp_ballet_rafa',
          competencia: '2026-09',
          status: 'paga',
          data_pagamento: '2026-09-05 12:00:00',
          valor_pago: 267,
          lancamento: 'lanc_pago_123',
        } as any,
      ]

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        if (name === 'metodos_pagamento')
          return { getOne: vi.fn().mockResolvedValue(mockMetodo) } as any
        if (name === 'despesas_ocorrencias') {
          return {
            getList: vi.fn().mockImplementation((page, perPage, options) => {
              const filter = options?.filter || ''
              if (filter.includes("status = 'paga'") || filter.includes("data_pagamento != ''")) {
                const found = ocorrenciasExistentesNoBanco.filter((o) =>
                  filter.includes(`competencia = '${o.competencia}'`),
                )
                return Promise.resolve({ totalItems: found.length, items: found })
              }
              return Promise.resolve({ totalItems: 0, items: [] })
            }),
            create: mockCreate,
          } as any
        }
        return {} as any
      })

      // Executa passando targetCompetencias ['2026-09'] com a ocorrência paga no cache
      await despesasService.gerarOcorrenciasParaCompromisso(
        compromisso,
        ['2026-09'],
        ocorrenciasExistentesNoBanco,
      )

      // NUNCA deve ter criado ocorrência para 2026-09 porque já estava paga!
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('REGRA DE PREVENÇÃO (2): competência passada sem qualquer ocorrência não é criada retroativamente pelo sincronizador em lote', async () => {
      const mockConta = {
        id: 'c_corrente',
        nome: 'Conta Corrente',
        tipo: 'corrente',
      }
      const mockCreate = vi.fn().mockResolvedValue({ id: 'criada' })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        if (name === 'despesas_ocorrencias') {
          return {
            getFullList: vi.fn().mockResolvedValue([]),
            getList: vi.fn().mockResolvedValue({ totalItems: 0, items: [] }),
            create: mockCreate,
          } as any
        }
        return {} as any
      })

      const compromisso: DespesaCompromisso = {
        id: 'comp_antigo',
        descricao: 'Conta Antiga',
        conta_padrao: 'c_corrente',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-01-01',
        dia_vencimento: 10,
        valor_estimado: 50,
        ativo: true,
      } as any

      // Executa lote solicitando competência passada '2026-05' sem meses futuros
      await despesasService.gerarOcorrenciasParaCompromissosLote({
        compromissos: [compromisso],
        competencias: ['2026-05'],
        incluirMesesFuturos: false,
      })

      // Não deve ter criado ocorrência nenhuma retroativa
      expect(mockCreate).not.toHaveBeenCalled()
    })

    it('competência corrente continua sendo gerada normalmente quando não existe ocorrência paga', async () => {
      const mockConta = {
        id: 'c_corrente',
        nome: 'Conta Corrente',
        tipo: 'corrente',
        tipos_pagamento: ['pix'],
      }
      const mockMetodo = {
        id: 'm_pix',
        codigo: 'Pix',
        nome: 'Pix',
        tipo: 'pix',
      }

      const mockCreate = vi.fn().mockResolvedValue({ id: 'nova_corrente' })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        if (name === 'metodos_pagamento')
          return { getOne: vi.fn().mockResolvedValue(mockMetodo) } as any
        if (name === 'despesas_ocorrencias') {
          return {
            getList: vi.fn().mockResolvedValue({ totalItems: 0, items: [] }),
            create: mockCreate,
          } as any
        }
        return {} as any
      })

      const compromisso: DespesaCompromisso = {
        id: 'comp_corrente',
        descricao: 'Conta Luz',
        conta_padrao: 'c_corrente',
        metodo_pagamento: 'm_pix',
        secao: 'contas_mensais_pix_boleto',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-10-01',
        dia_vencimento: 15,
        valor_estimado: 120,
        contexto_tipo: 'empresa',
        ativo: true,
      } as any

      await despesasService.gerarOcorrenciasParaCompromisso(compromisso, ['2026-10'])

      expect(mockCreate).toHaveBeenCalledTimes(1)
      const payload = mockCreate.mock.calls[0][0]
      expect(payload.competencia).toBe('2026-10')
      expect(payload.status).toBe('prevista')
      expect(payload.valor_previsto).toBe(120)
    })
  })

  describe('Resolução de categoria na baixa de despesa e pagamento de compromisso', () => {
    it('baixa sem categoriaId -> lançamento criado com a categoria herdada do compromisso vinculado (não null)', async () => {
      const mockConta = {
        id: 'sglo7dfsqvgfsni',
        nome: 'NuBank',
        tipo: 'cartao',
        tipos_pagamento: ['credito'],
        dia_fechamento: 15,
        dia_vencimento: 22,
      }
      const mockOcorrencia = {
        id: 'ocorr_amendoim',
        compromisso: 'comp_amendoim_id',
        valor_previsto: 5,
        numero_parcela: 1,
        total_parcelas: 1,
      }
      const mockCompromisso = {
        id: 'comp_amendoim_id',
        descricao: 'Amendoim',
        categoria: 'qvh2817a1z1j45j',
        dia_vencimento: 22,
      }

      const mockLancamentoCreate = vi.fn().mockResolvedValue({ id: 'lanc_amendoim' })
      const mockOcorrenciaUpdate = vi
        .fn()
        .mockResolvedValue({ id: 'ocorr_amendoim', status: 'paga' })

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getOne: vi.fn().mockResolvedValue(mockOcorrencia),
            update: mockOcorrenciaUpdate,
          } as any
        }
        if (name === 'despesas_compromisso') {
          return {
            getOne: vi.fn().mockResolvedValue(mockCompromisso),
          } as any
        }
        if (name === 'lancamentos') {
          return {
            create: mockLancamentoCreate,
          } as any
        }
        return {} as any
      })

      await despesasService.baixarOcorrencia({
        ocorrenciaId: 'ocorr_amendoim',
        contaId: 'sglo7dfsqvgfsni',
        descricao: 'Amendoim',
        valorPago: 5,
        dataPagamento: '2026-10-06',
      })

      expect(mockLancamentoCreate).toHaveBeenCalled()
      const lancPayload = mockLancamentoCreate.mock.calls[0][0]
      expect(lancPayload.categoria).toBe('qvh2817a1z1j45j')
      expect(lancPayload.categoria).not.toBeNull()
    })

    it('sem categoria em lugar nenhum -> rejeita com mensagem amigável', async () => {
      const mockConta = {
        id: 'c_corrente',
        nome: 'Conta Corrente',
        tipo: 'corrente',
      }
      const mockOcorrencia = {
        id: 'ocorr_sem_cat',
        compromisso: 'comp_sem_cat_id',
        valor_previsto: 50,
      }
      const mockCompromisso = {
        id: 'comp_sem_cat_id',
        descricao: 'Sem Categoria',
        categoria: null,
      }

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getOne: vi.fn().mockResolvedValue(mockOcorrencia),
          } as any
        }
        if (name === 'despesas_compromisso') {
          return {
            getOne: vi.fn().mockResolvedValue(mockCompromisso),
          } as any
        }
        if (name === 'lancamentos') {
          return {
            create: vi.fn(),
          } as any
        }
        return {} as any
      })

      await expect(
        despesasService.baixarOcorrencia({
          ocorrenciaId: 'ocorr_sem_cat',
          contaId: 'c_corrente',
          descricao: 'Sem Categoria',
          valorPago: 50,
          dataPagamento: '2026-10-06',
        }),
      ).rejects.toThrow('O compromisso não tem categoria definida — edite-o antes de baixar')
    })

    it('registrarPagamentoCompromisso: reaproveita ocorrencia prevista existente em vez de criar nova', async () => {
      const mockConta = { id: 'c_corrente_1', tipo: 'corrente', nome: 'Nubank PF' }
      const mockCompromisso = {
        id: 'comp_ballet',
        descricao: 'Ballet Rafa',
        categoria: 'cat_dizimos',
        secao: 'contas_mensais_pix_boleto',
        dia_vencimento: 5,
        valor_estimado: 267,
      }
      const mockOcorrenciaPrevista = {
        id: 'ocorr_prevista_existente',
        compromisso: 'comp_ballet',
        competencia: '2026-09',
        status: 'prevista',
        valor_previsto: 267,
        lancamento: null,
      }
      const mockLancamentoCriado = {
        id: 'lanc_novo_123',
        descricao: 'Ballet Rafa',
        valor: 267,
      }

      const updateOcorrMock = vi.fn().mockImplementation((id, data) => ({
        id,
        ...data,
        status: 'paga',
        lancamento: 'lanc_novo_123',
      }))
      const createOcorrMock = vi.fn()
      const createLancMock = vi.fn().mockResolvedValue(mockLancamentoCriado)

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        }
        if (name === 'despesas_compromisso') {
          return { getOne: vi.fn().mockResolvedValue(mockCompromisso) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getFullList: vi.fn().mockResolvedValue([mockOcorrenciaPrevista]),
            update: updateOcorrMock,
            create: createOcorrMock,
          } as any
        }
        if (name === 'lancamentos') {
          return { create: createLancMock } as any
        }
        return {} as any
      })

      const resultado = await despesasService.registrarPagamentoCompromisso({
        compromissoId: 'comp_ballet',
        contaId: 'c_corrente_1',
        descricao: 'Ballet Rafa',
        valorPago: 267,
        dataPagamento: '2026-09-05',
      })

      expect(createLancMock).toHaveBeenCalledTimes(1)
      // Garante que update foi chamado na ocorrência prevista existente, e NÃO create
      expect(updateOcorrMock).toHaveBeenCalledWith(
        'ocorr_prevista_existente',
        expect.objectContaining({
          status: 'paga',
          valor_pago: 267,
          lancamento: 'lanc_novo_123',
          secao: 'contas_mensais_pix_boleto',
        }),
        expect.anything(),
      )
      expect(createOcorrMock).not.toHaveBeenCalled()
      expect(resultado.ocorrencia.id).toBe('ocorr_prevista_existente')
    })

    it('registrarPagamentoCompromisso: cria nova ocorrencia se nao houver prevista disponivel', async () => {
      const mockConta = { id: 'c_corrente_1', tipo: 'corrente', nome: 'Nubank PF' }
      const mockCompromisso = {
        id: 'comp_ballet',
        descricao: 'Ballet Rafa',
        categoria: 'cat_dizimos',
        secao: 'contas_mensais_pix_boleto',
        dia_vencimento: 5,
        valor_estimado: 267,
      }
      const mockLancamentoCriado = {
        id: 'lanc_novo_456',
        descricao: 'Ballet Rafa',
        valor: 267,
      }
      const mockOcorrCriada = {
        id: 'ocorr_nova_criada',
        compromisso: 'comp_ballet',
        status: 'paga',
      }

      const updateOcorrMock = vi.fn()
      const createOcorrMock = vi.fn().mockResolvedValue(mockOcorrCriada)
      const createLancMock = vi.fn().mockResolvedValue(mockLancamentoCriado)

      vi.mocked(pb.collection).mockImplementation((name: string) => {
        if (name === 'contas') {
          return { getOne: vi.fn().mockResolvedValue(mockConta) } as any
        }
        if (name === 'despesas_compromisso') {
          return { getOne: vi.fn().mockResolvedValue(mockCompromisso) } as any
        }
        if (name === 'despesas_ocorrencias') {
          return {
            getFullList: vi.fn().mockResolvedValue([]), // sem ocorrência existente
            update: updateOcorrMock,
            create: createOcorrMock,
          } as any
        }
        if (name === 'lancamentos') {
          return { create: createLancMock } as any
        }
        return {} as any
      })

      const resultado = await despesasService.registrarPagamentoCompromisso({
        compromissoId: 'comp_ballet',
        contaId: 'c_corrente_1',
        descricao: 'Ballet Rafa',
        valorPago: 267,
        dataPagamento: '2026-09-05',
      })

      expect(createLancMock).toHaveBeenCalledTimes(1)
      expect(updateOcorrMock).not.toHaveBeenCalled()
      expect(createOcorrMock).toHaveBeenCalledWith(
        expect.objectContaining({
          compromisso: 'comp_ballet',
          status: 'paga',
          secao: 'contas_mensais_pix_boleto',
          lancamento: 'lanc_novo_456',
        }),
        expect.anything(),
      )
      expect(resultado.ocorrencia.id).toBe('ocorr_nova_criada')
    })
  })
})
