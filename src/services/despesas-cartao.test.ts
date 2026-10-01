import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Conta, DespesaCompromisso } from '@/types/domain'
import { calcularFaturaCartao } from '@/lib/cartao-fatura'
import { despesasService } from './despesas'
import pb from '@/lib/pocketbase/client'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

describe('calcularFaturaCartao & ciclo de faturas de cartão de crédito', () => {
  const contaNuBank: Conta = {
    id: 'conta_nubank',
    collectionId: 'contas',
    collectionName: 'contas',
    created: '2026-01-01',
    updated: '2026-01-01',
    nome: '[CPF]NuBank Cred.',
    tipo: 'cartao',
    saldo_inicial: 0,
    cor: '#8A05BE',
    ativa: true,
    dia_fechamento: 13,
    dia_vencimento: 20,
    bandeira: 'Mastercard',
  }

  const contaOutroCartao: Conta = {
    id: 'conta_outro',
    collectionId: 'contas',
    collectionName: 'contas',
    created: '2026-01-01',
    updated: '2026-01-01',
    nome: 'Cartão Fech25 Venc05',
    tipo: 'cartao',
    saldo_inicial: 0,
    cor: '#000000',
    ativa: true,
    dia_fechamento: 25,
    dia_vencimento: 5,
  }

  it('16/08/2026 fech.13 -> competencia 2026-09, vencimento 2026-09-20', () => {
    const ciclo = calcularFaturaCartao(contaNuBank, '2026-08-16')
    expect(ciclo.competencia).toBe('2026-09')
    expect(ciclo.dataVencimento).toBe('2026-09-20')
  })

  it('10/08/2026 -> competencia 2026-08, vencimento 2026-08-20', () => {
    const ciclo = calcularFaturaCartao(contaNuBank, '2026-08-10')
    expect(ciclo.competencia).toBe('2026-08')
    expect(ciclo.dataVencimento).toBe('2026-08-20')
  })

  it('13/08/2026 (dia exato do fechamento) -> competencia 2026-08, vencimento 2026-08-20', () => {
    const ciclo = calcularFaturaCartao(contaNuBank, '2026-08-13')
    expect(ciclo.competencia).toBe('2026-08')
    expect(ciclo.dataVencimento).toBe('2026-08-20')
  })

  it('cartão fech.25/venc.05, compra 26/08 -> competencia 2026-09, vencimento 2026-10-05', () => {
    const ciclo = calcularFaturaCartao(contaOutroCartao, '2026-08-26')
    expect(ciclo.competencia).toBe('2026-09')
    expect(ciclo.dataVencimento).toBe('2026-10-05')
  })
})

describe('despesasService - gerarOcorrenciasParaCompromisso em cartão', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('gera ocorrência avulsa com ciclo da fatura correspondente', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_nu',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 13,
      dia_vencimento: 20,
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_nova_1' })
    const mockGetList = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })
    const mockGetOneConta = vi.fn().mockResolvedValue(mockContaCartao)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockGetOneConta } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          create: mockCreate,
        } as any
      }
      return {} as any
    })

    const compromissoAvulso: DespesaCompromisso = {
      id: 'comp_avulso_1',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-08-16T12:00:00.000Z',
      updated: '2026-08-16T12:00:00.000Z',
      descricao: 'Almoço Restaurante',
      secao: 'cartoes_credito',
      regra_repeticao: 'avulso',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-08-16 00:00:00.000Z',
      valor_estimado: 23.15,
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoAvulso)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.competencia).toBe('2026-09')
    expect(payload.data_vencimento).toBe('2026-09-20T12:00:00.000Z')
    expect(payload.valor_previsto).toBe(23.15)
  })

  it('gera ocorrências parceladas cada uma em seu ciclo de fatura', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_nu',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 13,
      dia_vencimento: 20,
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_nova_p' })
    const mockGetList = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })
    const mockGetOneConta = vi.fn().mockResolvedValue(mockContaCartao)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockGetOneConta } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          create: mockCreate,
        } as any
      }
      return {} as any
    })

    const compromissoParcelado: DespesaCompromisso = {
      id: 'comp_parc_1',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-08-16T12:00:00.000Z',
      updated: '2026-08-16T12:00:00.000Z',
      descricao: 'Eletrônico 3x',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'parcelado',
      total_parcelas: 3,
      parcela_inicial: 1,
      valor_parcela: 100,
      valor_estimado: 300,
      data_inicio: '2026-08-16 00:00:00.000Z',
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoParcelado)

    expect(mockCreate).toHaveBeenCalledTimes(3)

    // Parcela 1: 16/08/2026 -> competencia 2026-09, vencimento 2026-09-20
    const p1 = mockCreate.mock.calls[0][0]
    expect(p1.numero_parcela).toBe(1)
    expect(p1.competencia).toBe('2026-09')
    expect(p1.data_vencimento).toBe('2026-09-20T12:00:00.000Z')

    // Parcela 2: 16/09/2026 -> competencia 2026-10, vencimento 2026-10-20
    const p2 = mockCreate.mock.calls[1][0]
    expect(p2.numero_parcela).toBe(2)
    expect(p2.competencia).toBe('2026-10')
    expect(p2.data_vencimento).toBe('2026-10-20T12:00:00.000Z')

    // Parcela 3: 16/10/2026 -> competencia 2026-11, vencimento 2026-11-20
    const p3 = mockCreate.mock.calls[2][0]
    expect(p3.numero_parcela).toBe(3)
    expect(p3.competencia).toBe('2026-11')
    expect(p3.data_vencimento).toBe('2026-11-20T12:00:00.000Z')
  })
})
