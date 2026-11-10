import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { despesasService } from './despesas'
import { calcularCompetenciaEVencimento } from '@/lib/cartao-fatura'
import type { Conta, DespesaCompromisso, DespesaOcorrencia } from '@/types/domain'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

describe('despesasService - Recorrência Mensal Não-Cartão (0.0.304)', () => {
  const mockContaBancariaSicredi: Conta = {
    id: 'qgdga7rawa3p00a',
    nome: 'Sicredi Corrente',
    tipo: 'bancaria',
    tipos_pagamento: ['pix', 'debito', 'transferencia', 'boletos'],
    ativa: true,
    ordem: 1,
    saldo_atual: 5000,
    saldo_inicial: 0,
    cor: '#006633',
    collectionId: 'pbc_contas',
    collectionName: 'contas',
    created: '2026-01-01',
    updated: '2026-01-01',
  }

  const mockCompromissoHonorarios: DespesaCompromisso = {
    id: '44yk23qltfr5div',
    descricao: 'Honorários Contábeis',
    conta_padrao: 'qgdga7rawa3p00a', // Conta bancária Sicredi
    metodo_pagamento: 'wvytik0085jollz', // Boleto / não-crédito
    secao: 'contas_mensais_pix_boleto',
    data_inicio: '2026-10-10 00:00:00.000Z',
    dia_vencimento: 10,
    total_parcelas: 1,
    parcela_inicial: 1,
    modalidade_parcelamento: 'a_vista',
    regra_repeticao: 'mensal',
    valor_estimado: 486.3,
    contexto_tipo: 'empresa',
    empresa: 'c8v8eg0errmelt6',
    ativo: true,
    collectionId: 'pbc_compromisso',
    collectionName: 'despesas_compromisso',
    created: '2026-10-09 21:41:38.656Z',
    updated: '2026-10-09 21:41:38.656Z',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('1. Sequência estrita out/10 -> nov/10 -> dez/10 -> jan/10 para mensal dia 10 não-cartão', async () => {
    const createdRecords: any[] = []
    const mockCreate = vi.fn().mockImplementation((data) => {
      const rec = { id: `oc_${createdRecords.length + 1}`, ...data }
      createdRecords.push(rec)
      return Promise.resolve(rec)
    })
    const mockGetList = vi.fn().mockResolvedValue({ totalItems: 0, items: [] })
    const mockGetFullList = vi.fn().mockResolvedValue([])

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_ocorrencias') {
        return {
          create: mockCreate,
          getList: mockGetList,
          getFullList: mockGetFullList,
        } as any
      }
      if (name === 'contas') {
        return {
          getOne: vi.fn().mockResolvedValue(mockContaBancariaSicredi),
        } as any
      }
      if (name === 'metodos_pagamento') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'wvytik0085jollz',
            nome: 'Boleto Bancário',
            tipo: 'boleto',
            codigo: 'boleto',
            ativo: true,
          }),
        } as any
      }
      return {} as any
    })

    // Gera para competências específicas out/2026 até jan/2027
    const targets = ['2026-10', '2026-11', '2026-12', '2027-01']
    await despesasService.gerarOcorrenciasParaCompromisso(mockCompromissoHonorarios, targets)

    expect(createdRecords).toHaveLength(4)
    expect(createdRecords[0].competencia).toBe('2026-10')
    expect(createdRecords[0].data_vencimento).toBe('2026-10-10T12:00:00.000Z')

    expect(createdRecords[1].competencia).toBe('2026-11')
    expect(createdRecords[1].data_vencimento).toBe('2026-11-10T12:00:00.000Z')

    expect(createdRecords[2].competencia).toBe('2026-12')
    expect(createdRecords[2].data_vencimento).toBe('2026-12-10T12:00:00.000Z')

    expect(createdRecords[3].competencia).toBe('2027-01')
    expect(createdRecords[3].data_vencimento).toBe('2027-01-10T12:00:00.000Z')
  })

  it('2. Idempotência: rodar a geração duas vezes NÃO cria duplicata de competência', async () => {
    const memoryRecords: any[] = []

    const mockCreate = vi.fn().mockImplementation((data) => {
      const rec = { id: `oc_${memoryRecords.length + 1}`, ...data }
      memoryRecords.push(rec)
      return Promise.resolve(rec)
    })

    const mockGetList = vi.fn().mockImplementation((page, perPage, options) => {
      const filter = options?.filter || ''
      const match = filter.match(/competencia = '([^']+)'/)
      if (match) {
        const comp = match[1]
        const found = memoryRecords.filter((r) => r.competencia === comp)
        return Promise.resolve({ totalItems: found.length, items: found })
      }
      return Promise.resolve({ totalItems: memoryRecords.length, items: memoryRecords })
    })

    const mockGetFullList = vi.fn().mockImplementation(() => Promise.resolve([...memoryRecords]))

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_ocorrencias') {
        return {
          create: mockCreate,
          getList: mockGetList,
          getFullList: mockGetFullList,
        } as any
      }
      if (name === 'contas') {
        return {
          getOne: vi.fn().mockResolvedValue(mockContaBancariaSicredi),
        } as any
      }
      if (name === 'metodos_pagamento') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'wvytik0085jollz',
            nome: 'Boleto Bancário',
            tipo: 'boleto',
            codigo: 'boleto',
            ativo: true,
          }),
        } as any
      }
      return {} as any
    })

    const targets = ['2026-10', '2026-11', '2026-12']

    // 1ª execução
    await despesasService.gerarOcorrenciasParaCompromisso(mockCompromissoHonorarios, targets)
    expect(memoryRecords).toHaveLength(3)
    const totalCallsPrimeira = mockCreate.mock.calls.length
    expect(totalCallsPrimeira).toBe(3)

    // 2ª execução com os mesmos alvos
    await despesasService.gerarOcorrenciasParaCompromisso(mockCompromissoHonorarios, targets)

    // Nenhuma ocorrência nova criada
    expect(memoryRecords).toHaveLength(3)
    expect(mockCreate.mock.calls.length).toBe(3)
  })

  it('3. Vencimento é SEMPRE no próprio mês da competência (mesmo com dia 31 em meses curtos)', () => {
    // Fev em ano não bissexto: dia 31 vira 28 de fev
    const vencFev = despesasService.calcularDataVencimentoNoMes(2027, 1, 31)
    expect(vencFev.toISOString()).toBe('2027-02-28T12:00:00.000Z')

    // Nov (30 dias): dia 31 vira 30 de nov
    const vencNov = despesasService.calcularDataVencimentoNoMes(2026, 10, 31)
    expect(vencNov.toISOString()).toBe('2026-11-30T12:00:00.000Z')

    // Out (31 dias): dia 31 é 31 de out
    const vencOut = despesasService.calcularDataVencimentoNoMes(2026, 9, 31)
    expect(vencOut.toISOString()).toBe('2026-10-31T12:00:00.000Z')
  })

  it('4. Ocorrência já paga nunca tem competência ou vencimento alterados na sincronização', async () => {
    const ocorrenciaPagaOutubro: DespesaOcorrencia = {
      id: 'oc_paga_outubro',
      compromisso: '44yk23qltfr5div',
      competencia: '2026-10',
      data_vencimento: '2026-10-10T12:00:00.000Z',
      data_pagamento: '2026-10-09 12:00:00',
      valor_pago: 486.3,
      valor_previsto: 486.3,
      status: 'paga',
      numero_parcela: 0,
      total_parcelas: 0,
      conta: 'qgdga7rawa3p00a',
      secao: 'contas_mensais_pix_boleto',
    } as unknown as DespesaOcorrencia

    const ocorrenciaPrevistaNovembro: DespesaOcorrencia = {
      id: 'oc_prevista_novembro',
      compromisso: '44yk23qltfr5div',
      competencia: '2026-11',
      data_vencimento: '2026-11-10T12:00:00.000Z',
      valor_previsto: 486.3,
      status: 'prevista',
      numero_parcela: 0,
      total_parcelas: 0,
      conta: 'qgdga7rawa3p00a',
      secao: 'contas_mensais_pix_boleto',
    } as unknown as DespesaOcorrencia

    const mockUpdateOcorr = vi.fn().mockResolvedValue({})
    const mockGetFullList = vi
      .fn()
      .mockResolvedValue([ocorrenciaPagaOutubro, ocorrenciaPrevistaNovembro])

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_ocorrencias') {
        return {
          getFullList: mockGetFullList,
          update: mockUpdateOcorr,
        } as any
      }
      if (name === 'contas') {
        return {
          getOne: vi.fn().mockResolvedValue(mockContaBancariaSicredi),
        } as any
      }
      return {} as any
    })

    // Alteramos o valor_estimado do compromisso de 486.3 para 520.0
    const compromissoAtualizado: DespesaCompromisso = {
      ...mockCompromissoHonorarios,
      valor_estimado: 520.0,
    }

    await despesasService.sincronizarOcorrenciasCompromisso(compromissoAtualizado)

    // A ocorrência prevista de novembro recebe atualização do valor previsto
    expect(mockUpdateOcorr).toHaveBeenCalledWith(
      'oc_prevista_novembro',
      expect.objectContaining({
        valor_previsto: 520.0,
      }),
    )

    // A ocorrência paga NÃO tem seu valor_pago nem data_pagamento alterados
    const callsParaPaga = mockUpdateOcorr.mock.calls.filter((c) => c[0] === 'oc_paga_outubro')
    if (callsParaPaga.length > 0) {
      const updatesPaga = callsParaPaga[0][1]
      expect(updatesPaga.valor_pago).toBeUndefined()
      expect(updatesPaga.data_pagamento).toBeUndefined()
      expect(updatesPaga.status).toBeUndefined()
      expect(updatesPaga.competencia).toBeUndefined()
      expect(updatesPaga.data_vencimento).toBeUndefined()
    }
  })

  it('5. calcularCompetenciaEVencimento não aplica offset de parcela em compromisso recorrente/avulso não-parcelado', () => {
    // Mesmo que numeroParcela venha 2 por resíduo de chamada, se totalParcelas for 1, não desloca
    const res = calcularCompetenciaEVencimento({
      dataCompra: '2026-10-10',
      conta: mockContaBancariaSicredi,
      metodoEhCredito: false,
      diaVencimento: 10,
      numeroParcela: 2,
      totalParcelas: 1, // Não é parcelado
    })

    expect(res.competencia).toBe('2026-10')
    expect(res.dataVencimento).toBe('2026-10-10')
    expect(res.isCartaoCredito).toBe(false)
  })
})
