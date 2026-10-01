import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { despesasService } from './despesas'

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
})
