import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { despesasService } from './despesas'
import { gerarCronogramaParcelasCartao } from '@/lib/cartao-fatura'
import type { Conta, DespesaCompromisso, DespesaOcorrencia, MetodoPagamento } from '@/types/domain'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

describe('despesasService.baixarOcorrencia - Guarda de baixa de cartão (0.0.291)', () => {
  const mockContaNubankCartao: Conta = {
    id: 'sglo7dfsqvgfsni',
    nome: 'NuBank',
    tipo: 'cartao',
    tipos_pagamento: ['debito', 'transferencia', 'boletos', 'pix', 'credito'],
    dia_fechamento: 16,
    dia_vencimento: 23,
    ativa: true,
    ordem: 1,
    saldo_atual: 0,
    saldo_inicial: 0,
    cor: '#820AD1',
    collectionId: 'pbc_contas',
    collectionName: 'contas',
    created: '',
    updated: '',
  }

  const mockContaBancariaSicredi: Conta = {
    id: 'c_bancaria_sicredi',
    nome: 'Sicredi Corrente',
    tipo: 'bancaria',
    tipos_pagamento: ['pix', 'debito', 'transferencia', 'boletos'],
    ativa: true,
    ordem: 2,
    saldo_atual: 5000,
    saldo_inicial: 0,
    cor: '#006633',
    collectionId: 'pbc_contas',
    collectionName: 'contas',
    created: '',
    updated: '',
  }

  const mockMetodoCredito: MetodoPagamento = {
    id: 'r9qdfpwfe5143oe',
    codigo: 'credito',
    nome: 'Crédito',
    tipo: 'cartao',
    ativo: true,
    collectionId: 'pbc_metodos',
    collectionName: 'metodos_pagamento',
    created: '',
    updated: '',
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // (a) baixa de ocorrência de cartão debitando em conta BANCÁRIA preserva competência e vencimento
  it('(a) baixa de ocorrência de cartão debitando em conta BANCÁRIA preserva competência e vencimento (regressão do bug Farmácia Atentah)', async () => {
    const mockCompromissoCartao: DespesaCompromisso = {
      id: 'idahh4q1arz1w3d',
      descricao: 'Farmácia Atentah - OK/Nov',
      conta_padrao: 'sglo7dfsqvgfsni', // Cartão NuBank
      metodo_pagamento: 'r9qdfpwfe5143oe',
      secao: 'cartoes_credito',
      data_inicio: '2026-09-18 00:00:00.000Z',
      dia_vencimento: 23,
      total_parcelas: 2,
      parcela_inicial: 1,
      modalidade_parcelamento: 'parcelado',
      regra_repeticao: 'mensal',
      valor_parcela: 102.9,
      valor_estimado: 102.9,
    } as unknown as DespesaCompromisso

    const mockOcorrenciaParcela2: DespesaOcorrencia = {
      id: 'aov9bi4fpu0z66n',
      compromisso: 'idahh4q1arz1w3d',
      numero_parcela: 2,
      total_parcelas: 2,
      competencia: '2026-11',
      data_vencimento: '2026-11-23T12:00:00.000Z',
      data_pagamento: '2026-11-23T12:00:00.000Z',
      valor_previsto: 102.9,
      status: 'prevista',
      secao: 'cartoes_credito',
    } as unknown as DespesaOcorrencia

    const mockUpdateOcorr = vi
      .fn()
      .mockImplementation((id, data) => Promise.resolve({ id, ...data }))
    const mockCreateLanc = vi.fn().mockResolvedValue({ id: 'lanc_bancario_novo' })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return {
          getOne: vi.fn().mockImplementation((id: string) => {
            if (id === 'c_bancaria_sicredi') return Promise.resolve(mockContaBancariaSicredi)
            if (id === 'sglo7dfsqvgfsni') return Promise.resolve(mockContaNubankCartao)
            return Promise.reject(new Error('Conta not found'))
          }),
        } as any
      }
      if (name === 'despesas_compromisso') {
        return {
          getOne: vi.fn().mockResolvedValue(mockCompromissoCartao),
        } as any
      }
      if (name === 'metodos_pagamento') {
        return {
          getOne: vi.fn().mockResolvedValue(mockMetodoCredito),
        } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: vi.fn().mockResolvedValue(mockOcorrenciaParcela2),
          update: mockUpdateOcorr,
        } as any
      }
      if (name === 'lancamentos') {
        return {
          create: mockCreateLanc,
        } as any
      }
      return {} as any
    })

    // Baixa realizada em 06/11 debitando na conta bancária Sicredi (não no cartão!)
    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'aov9bi4fpu0z66n',
      contaId: 'c_bancaria_sicredi',
      descricao: 'Farmácia Atentah - Parcela 2/2',
      valorPago: 102.9,
      dataPagamento: '2026-11-06',
    })

    expect(mockUpdateOcorr).toHaveBeenCalledTimes(1)
    const updatePayload = mockUpdateOcorr.mock.calls[0][1]

    // Status deve ser pago e data_pagamento gravada como a data real digitada
    expect(updatePayload.status).toBe('paga')
    expect(updatePayload.valor_pago).toBe(102.9)
    expect(updatePayload.data_pagamento).toBe('2026-11-06 12:00:00')
    expect(updatePayload.conta).toBe('c_bancaria_sicredi')

    // GUARDA: NÃO sobrescreve competência nem vencimento da ocorrência de cartão!
    expect(updatePayload.competencia).toBeUndefined()
    expect(updatePayload.data_vencimento).toBeUndefined()

    // Lançamento bancário gerado deve assumir a competência canônica da fatura (2026-11)
    expect(mockCreateLanc).toHaveBeenCalledTimes(1)
    const lancPayload = mockCreateLanc.mock.calls[0][0]
    expect(lancPayload.status).toBe('pago')
    expect(lancPayload.conta).toBe('c_bancaria_sicredi')
    expect(lancPayload.competencia).toBe('2026-11')
    expect(lancPayload.data).toBe('2026-11-06 12:00:00')
  })

  // (b) baixa debitando no PRÓPRIO cartão também preserva competência e vencimento
  it('(b) baixa debitando no PRÓPRIO cartão também preserva competência e vencimento', async () => {
    const mockCompromissoCartao: DespesaCompromisso = {
      id: 'idahh4q1arz1w3d',
      descricao: 'Farmácia Atentah - OK/Nov',
      conta_padrao: 'sglo7dfsqvgfsni',
      metodo_pagamento: 'r9qdfpwfe5143oe',
      secao: 'cartoes_credito',
      data_inicio: '2026-09-18 00:00:00.000Z',
      dia_vencimento: 23,
      total_parcelas: 2,
    } as unknown as DespesaCompromisso

    const mockOcorrencia: DespesaOcorrencia = {
      id: 'aov9bi4fpu0z66n',
      compromisso: 'idahh4q1arz1w3d',
      numero_parcela: 2,
      total_parcelas: 2,
      competencia: '2026-11',
      data_vencimento: '2026-11-23T12:00:00.000Z',
      valor_previsto: 102.9,
      status: 'prevista',
      secao: 'cartoes_credito',
    } as unknown as DespesaOcorrencia

    const mockUpdateOcorr = vi
      .fn()
      .mockImplementation((id, data) => Promise.resolve({ id, ...data }))
    const mockCreateLanc = vi.fn().mockResolvedValue({ id: 'lanc_cartao_novo' })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return {
          getOne: vi.fn().mockResolvedValue(mockContaNubankCartao),
        } as any
      }
      if (name === 'despesas_compromisso') {
        return {
          getOne: vi.fn().mockResolvedValue(mockCompromissoCartao),
        } as any
      }
      if (name === 'metodos_pagamento') {
        return {
          getOne: vi.fn().mockResolvedValue(mockMetodoCredito),
        } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: vi.fn().mockResolvedValue(mockOcorrencia),
          update: mockUpdateOcorr,
        } as any
      }
      if (name === 'lancamentos') {
        return {
          create: mockCreateLanc,
        } as any
      }
      return {} as any
    })

    // Baixa debitando na própria conta de cartão NuBank
    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'aov9bi4fpu0z66n',
      contaId: 'sglo7dfsqvgfsni',
      descricao: 'Farmácia Atentah - Parcela 2/2',
      valorPago: 102.9,
      dataPagamento: '2026-11-06',
    })

    expect(mockUpdateOcorr).toHaveBeenCalledTimes(1)
    const updatePayload = mockUpdateOcorr.mock.calls[0][1]

    expect(updatePayload.status).toBe('paga')
    expect(updatePayload.data_pagamento).toBe('2026-11-06 12:00:00')
    // Guarda preserva competência e vencimento
    expect(updatePayload.competencia).toBeUndefined()
    expect(updatePayload.data_vencimento).toBeUndefined()

    // Lançamento de cartão: pendente de fatura
    expect(mockCreateLanc).toHaveBeenCalledTimes(1)
    const lancPayload = mockCreateLanc.mock.calls[0][0]
    expect(lancPayload.status).toBe('pendente')
    expect(lancPayload.competencia).toBe('2026-11')
  })

  // (c) ocorrência sem competência preenchida recebe a competência da função canônica (ciclo da fatura da compra)
  it('(c) ocorrência de cartão sem competência/vencimento preenchidos recebe preenchimento canônico pelo ciclo da fatura', async () => {
    const mockCompromissoCartao: DespesaCompromisso = {
      id: 'comp_cartao_sem_comp',
      descricao: 'Compra Cartão Sem Competência',
      conta_padrao: 'sglo7dfsqvgfsni', // NuBank fech 16 / venc 23
      metodo_pagamento: 'r9qdfpwfe5143oe',
      secao: 'cartoes_credito',
      data_inicio: '2026-09-18 00:00:00.000Z', // 18/09 > 16 -> ciclo 2026-10 (parcela 1) e 2026-11 (parcela 2)
      dia_vencimento: 23,
      total_parcelas: 2,
    } as unknown as DespesaCompromisso

    // Ocorrência legada/incompleta sem competência nem data_vencimento
    const mockOcorrenciaSemDatas: DespesaOcorrencia = {
      id: 'ocorr_sem_datas',
      compromisso: 'comp_cartao_sem_comp',
      numero_parcela: 2,
      total_parcelas: 2,
      competencia: '',
      data_vencimento: '',
      valor_previsto: 50,
      status: 'prevista',
      secao: 'cartoes_credito',
    } as unknown as DespesaOcorrencia

    const mockUpdateOcorr = vi
      .fn()
      .mockImplementation((id, data) => Promise.resolve({ id, ...data }))
    const mockCreateLanc = vi.fn().mockResolvedValue({ id: 'lanc_novo' })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return {
          getOne: vi.fn().mockImplementation((id: string) => {
            if (id === 'c_bancaria_sicredi') return Promise.resolve(mockContaBancariaSicredi)
            if (id === 'sglo7dfsqvgfsni') return Promise.resolve(mockContaNubankCartao)
            return Promise.reject(new Error('Conta not found'))
          }),
        } as any
      }
      if (name === 'despesas_compromisso') {
        return {
          getOne: vi.fn().mockResolvedValue(mockCompromissoCartao),
        } as any
      }
      if (name === 'metodos_pagamento') {
        return {
          getOne: vi.fn().mockResolvedValue(mockMetodoCredito),
        } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: vi.fn().mockResolvedValue(mockOcorrenciaSemDatas),
          update: mockUpdateOcorr,
        } as any
      }
      if (name === 'lancamentos') {
        return {
          create: mockCreateLanc,
        } as any
      }
      return {} as any
    })

    // Baixa realizada pagando via conta bancária em 06/11
    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'ocorr_sem_datas',
      contaId: 'c_bancaria_sicredi',
      descricao: 'Compra Cartão Parcela 2/2',
      valorPago: 50,
      dataPagamento: '2026-11-06',
    })

    expect(mockUpdateOcorr).toHaveBeenCalledTimes(1)
    const updatePayload = mockUpdateOcorr.mock.calls[0][1]

    // Backfill canônico: preenche com base na conta do CARTÃO do compromisso (2026-11 e 2026-11-23),
    // NUNCA com base no mês do pagamento (2026-11 não coincide por acaso: a regra usa o ciclo da compra)
    expect(updatePayload.competencia).toBe('2026-11')
    expect(updatePayload.data_vencimento).toBe('2026-11-23T12:00:00.000Z')
  })

  // (d) série da Farmácia Atentah como caso de referência: parcela 2 em 23/11/2026 (competência 2026-11), série sem duplicar/pular mês
  it('(d) série da Farmácia Atentah como caso de referência: compra 18/09 em NuBank (fech 16/venc 23) gera parcela 1 em 2026-10 (23/10) e parcela 2 em 2026-11 (23/11)', () => {
    const cronograma = gerarCronogramaParcelasCartao({
      conta: mockContaNubankCartao,
      dataCompra: '2026-09-18',
      totalParcelas: 2,
    })

    expect(cronograma).toHaveLength(2)

    // Parcela 1/2: compra 18/09 > 16/09 -> fatura fecha em 16/10 (competência 2026-10), vence 23/10/2026
    expect(cronograma[0].numeroParcela).toBe(1)
    expect(cronograma[0].competencia).toBe('2026-10')
    expect(cronograma[0].dataVencimento).toBe('2026-10-23')

    // Parcela 2/2: compra 18/10 > 16/10 -> fatura fecha em 16/11 (competência 2026-11), vence 23/11/2026
    expect(cronograma[1].numeroParcela).toBe(2)
    expect(cronograma[1].competencia).toBe('2026-11')
    expect(cronograma[1].dataVencimento).toBe('2026-11-23')

    // Sequência estritamente crescente, sem duplicar nem pular mês
    expect(cronograma[0].dataVencimento < cronograma[1].dataVencimento).toBe(true)
  })
})
