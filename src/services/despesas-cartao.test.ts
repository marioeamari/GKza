import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Conta, DespesaCompromisso } from '@/types/domain'
import { calcularFaturaCartao } from '@/lib/cartao-fatura'
import { despesasService } from './despesas'
import { financeService } from './finance'
import pb from '@/lib/pocketbase/client'
import { ClientResponseError } from 'pocketbase'

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

  it('compra avulsa em cartão após fechamento vai para a fatura do mês seguinte (ex: Multi Carnes 22/09 -> fatura outubro, venc 23/10)', async () => {
    const mockContaNuBank: Conta = {
      id: 'cartao_nubank_multi',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_carne_67' })
    const mockGetList = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })
    const mockGetOneConta = vi.fn().mockResolvedValue(mockContaNuBank)

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

    const compromissoCarne: DespesaCompromisso = {
      id: 'comp_carne_multi',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-10-05T12:00:00.000Z',
      updated: '2026-10-05T12:00:00.000Z',
      descricao: 'Carne',
      secao: 'cartoes_credito',
      regra_repeticao: 'avulso',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-09-22 00:00:00.000Z',
      valor_estimado: 67.79,
      conta_padrao: 'cartao_nubank_multi',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoCarne)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.competencia).toBe('2026-10')
    expect(payload.data_vencimento).toBe('2026-10-23T12:00:00.000Z')
    expect(payload.valor_previsto).toBe(67.79)
  })

  it('compra avulsa em cartão antes ou no fechamento permanece na fatura do próprio mês', async () => {
    const mockContaNuBank: Conta = {
      id: 'cartao_nubank_multi',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_carne_antes' })
    const mockGetList = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })
    const mockGetOneConta = vi.fn().mockResolvedValue(mockContaNuBank)

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

    const compromissoAntes: DespesaCompromisso = {
      id: 'comp_carne_antes',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-09-15T12:00:00.000Z',
      updated: '2026-09-15T12:00:00.000Z',
      descricao: 'Carne Antes Fechamento',
      secao: 'cartoes_credito',
      regra_repeticao: 'avulso',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-09-15 00:00:00.000Z',
      valor_estimado: 50.0,
      conta_padrao: 'cartao_nubank_multi',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoAntes)

    expect(mockCreate).toHaveBeenCalledTimes(1)
    const payload = mockCreate.mock.calls[0][0]
    expect(payload.competencia).toBe('2026-09')
    expect(payload.data_vencimento).toBe('2026-09-23T12:00:00.000Z')
    expect(payload.valor_previsto).toBe(50.0)
  })

  it('gera ocorrências parceladas cada uma em seu ciclo de fatura (compra após fechamento pula ciclo)', async () => {
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
      dia_fechamento: 16,
      dia_vencimento: 23,
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

    // Compra em 19/09/2026 (após dia 16) -> cai no ciclo 2026-10 com vencimento em 23/10/2026
    const compromissoParcelado: DespesaCompromisso = {
      id: 'fhlmrrnph6hmbh3',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-09-19T12:00:00.000Z',
      updated: '2026-09-19T12:00:00.000Z',
      descricao: 'Conserto TORO',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'parcelado',
      total_parcelas: 4,
      parcela_inicial: 1,
      valor_parcela: 356.75,
      valor_estimado: 356.75,
      data_inicio: '2026-09-19 00:00:00.000Z',
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoParcelado)

    expect(mockCreate).toHaveBeenCalledTimes(4)

    // Parcela 1: ciclo 2026-10, venc 2026-10-23
    const p1 = mockCreate.mock.calls[0][0]
    expect(p1.numero_parcela).toBe(1)
    expect(p1.competencia).toBe('2026-10')
    expect(p1.data_vencimento).toBe('2026-10-23T12:00:00.000Z')

    // Parcela 2: ciclo 2026-11, venc 2026-11-23
    const p2 = mockCreate.mock.calls[1][0]
    expect(p2.numero_parcela).toBe(2)
    expect(p2.competencia).toBe('2026-11')
    expect(p2.data_vencimento).toBe('2026-11-23T12:00:00.000Z')

    // Parcela 3: ciclo 2026-12, venc 2026-12-23
    const p3 = mockCreate.mock.calls[2][0]
    expect(p3.numero_parcela).toBe(3)
    expect(p3.competencia).toBe('2026-12')
    expect(p3.data_vencimento).toBe('2026-12-23T12:00:00.000Z')

    // Parcela 4: ciclo 2027-01, venc 2027-01-23 (virada de ano)
    const p4 = mockCreate.mock.calls[3][0]
    expect(p4.numero_parcela).toBe(4)
    expect(p4.competencia).toBe('2027-01')
    expect(p4.data_vencimento).toBe('2027-01-23T12:00:00.000Z')
  })

  it('gera parcelas em cartão quando a compra é antes do fechamento (cai no ciclo do próprio mês)', async () => {
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
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_antes_fech' })
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

    // Compra em 10/09/2026 (antes de dia 16) -> parcela 1 cai em 2026-09, venc 23/09/2026
    const compromisso: DespesaCompromisso = {
      id: 'comp_antes_1',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-09-10T12:00:00.000Z',
      updated: '2026-09-10T12:00:00.000Z',
      descricao: 'Compra Antes do Fechamento',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'parcelado',
      total_parcelas: 2,
      parcela_inicial: 1,
      valor_parcela: 50,
      valor_estimado: 100,
      data_inicio: '2026-09-10 00:00:00.000Z',
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromisso)

    expect(mockCreate).toHaveBeenCalledTimes(2)

    const p1 = mockCreate.mock.calls[0][0]
    expect(p1.competencia).toBe('2026-09')
    expect(p1.data_vencimento).toBe('2026-09-23T12:00:00.000Z')

    const p2 = mockCreate.mock.calls[1][0]
    expect(p2.competencia).toBe('2026-10')
    expect(p2.data_vencimento).toBe('2026-10-23T12:00:00.000Z')
  })

  it('gera 12 parcelas corretamente a partir de compra 08/09/2026 com fechamento 16 e vencimento 23 (NuBank)', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_nu',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#4C3A8C',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_bp' })
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

    const compromissoBP: DespesaCompromisso = {
      id: 'comp_bp_12x',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-10-02T12:00:00.000Z',
      updated: '2026-10-02T12:00:00.000Z',
      descricao: 'Assinatura Brasil Paralelo',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'parcelado',
      total_parcelas: 12,
      parcela_inicial: 1,
      valor_parcela: 16.6,
      valor_estimado: 199.2,
      data_inicio: '2026-09-08 00:00:00.000Z',
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoBP)

    expect(mockCreate).toHaveBeenCalledTimes(12)

    // 08/09 <= 16/09 -> Parcela 1 em 2026-09 vencimento 23/09/2026
    const expectedParcelas = [
      { p: 1, comp: '2026-09', venc: '2026-09-23T12:00:00.000Z' },
      { p: 2, comp: '2026-10', venc: '2026-10-23T12:00:00.000Z' },
      { p: 3, comp: '2026-11', venc: '2026-11-23T12:00:00.000Z' },
      { p: 4, comp: '2026-12', venc: '2026-12-23T12:00:00.000Z' },
      { p: 5, comp: '2027-01', venc: '2027-01-23T12:00:00.000Z' }, // virada de ano
      { p: 6, comp: '2027-02', venc: '2027-02-23T12:00:00.000Z' },
      { p: 7, comp: '2027-03', venc: '2027-03-23T12:00:00.000Z' },
      { p: 8, comp: '2027-04', venc: '2027-04-23T12:00:00.000Z' },
      { p: 9, comp: '2027-05', venc: '2027-05-23T12:00:00.000Z' },
      { p: 10, comp: '2027-06', venc: '2027-06-23T12:00:00.000Z' },
      { p: 11, comp: '2027-07', venc: '2027-07-23T12:00:00.000Z' },
      { p: 12, comp: '2027-08', venc: '2027-08-23T12:00:00.000Z' },
    ]

    for (let i = 0; i < 12; i++) {
      const call = mockCreate.mock.calls[i][0]
      const exp = expectedParcelas[i]
      expect(call.numero_parcela).toBe(exp.p)
      expect(call.competencia).toBe(exp.comp)
      expect(call.data_vencimento).toBe(exp.venc)
    }
  })

  it('gera parcelas corretamente para conta não-cartão com virada de ano', async () => {
    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_nao_cartao' })
    const mockGetList = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          create: mockCreate,
        } as any
      }
      return {} as any
    })

    const compromissoNaoCartao: DespesaCompromisso = {
      id: 'comp_boleto_4x',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-11-10T12:00:00.000Z',
      updated: '2026-11-10T12:00:00.000Z',
      descricao: 'Curso em 4x',
      secao: 'contas_mensais_pix_boleto',
      regra_repeticao: 'parcelado',
      modalidade_parcelamento: 'parcelado',
      total_parcelas: 4,
      parcela_inicial: 1,
      valor_parcela: 250,
      valor_estimado: 1000,
      data_inicio: '2026-11-15 00:00:00.000Z',
      dia_vencimento: 10,
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoNaoCartao)

    expect(mockCreate).toHaveBeenCalledTimes(4)

    // Parcela 1: 2026-11, venc 10/11/2026
    const p1 = mockCreate.mock.calls[0][0]
    expect(p1.numero_parcela).toBe(1)
    expect(p1.competencia).toBe('2026-11')
    expect(p1.data_vencimento).toBe('2026-11-10T12:00:00.000Z')

    // Parcela 2: 2026-12, venc 10/12/2026
    const p2 = mockCreate.mock.calls[1][0]
    expect(p2.numero_parcela).toBe(2)
    expect(p2.competencia).toBe('2026-12')
    expect(p2.data_vencimento).toBe('2026-12-10T12:00:00.000Z')

    // Parcela 3: 2027-01, venc 10/01/2027
    const p3 = mockCreate.mock.calls[2][0]
    expect(p3.numero_parcela).toBe(3)
    expect(p3.competencia).toBe('2027-01')
    expect(p3.data_vencimento).toBe('2027-01-10T12:00:00.000Z')

    // Parcela 4: 2027-02, venc 10/02/2027
    const p4 = mockCreate.mock.calls[3][0]
    expect(p4.numero_parcela).toBe(4)
    expect(p4.competencia).toBe('2027-02')
    expect(p4.data_vencimento).toBe('2027-02-10T12:00:00.000Z')
  })

  it('gera ocorrências mensais de cartão a partir do ciclo inicial da fatura até meses futuros', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_nu',
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
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_nova_mensal' })
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

    const compromissoMensal: DespesaCompromisso = {
      id: 'comp_mensal_nu',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-08-23T12:00:00.000Z',
      updated: '2026-08-23T12:00:00.000Z',
      descricao: 'Nubank Ultravioleta',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-08-23 00:00:00.000Z',
      dia_vencimento: 20,
      valor_estimado: 49,
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoMensal)

    // A primeira ocorrência deve ter competência 2026-09 (fechamento 13, compra 23/08)
    expect(mockCreate).toHaveBeenCalled()
    const primeira = mockCreate.mock.calls[0][0]
    expect(primeira.competencia).toBe('2026-09')
    expect(primeira.data_vencimento).toBe('2026-09-20T12:00:00.000Z')
    expect(primeira.valor_previsto).toBe(49)
  })

  it('sincronizarOcorrenciasCompromisso cria ocorrência do ciclo inicial de cartão se faltar', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_nu',
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
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_inicial_criada' })
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
          getFullList: vi.fn().mockResolvedValue([]),
        } as any
      }
      return {} as any
    })

    const compromisso: DespesaCompromisso = {
      id: 'comp_sinc_nu',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-08-23T12:00:00.000Z',
      updated: '2026-08-23T12:00:00.000Z',
      descricao: 'Nubank Ultravioleta',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-08-23 00:00:00.000Z',
      dia_vencimento: 20,
      valor_estimado: 49,
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.sincronizarOcorrenciasCompromisso(compromisso)

    // Deve ter chamado create para a ocorrência inicial faltante em 2026-09
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const callArg = mockCreate.mock.calls[0][0]
    expect(callArg.competencia).toBe('2026-09')
    expect(callArg.data_vencimento).toBe('2026-09-20T12:00:00.000Z')
    expect(callArg.valor_previsto).toBe(49)
  })

  it('sincronizarOcorrenciasCompromisso atualiza ocorrências previstas de parcelado em cartão para o ciclo da fatura', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_nu',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#4C3A8C',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const ocorrenciasPrevistas = [
      {
        id: 'oc_p1',
        compromisso: 'fhlmrrnph6hmbh3',
        numero_parcela: 1,
        total_parcelas: 4,
        competencia: '2026-09',
        data_vencimento: '2026-09-19T12:00:00.000Z',
        valor_previsto: 356.75,
        status: 'prevista',
      },
      {
        id: 'oc_p2',
        compromisso: 'fhlmrrnph6hmbh3',
        numero_parcela: 2,
        total_parcelas: 4,
        competencia: '2026-10',
        data_vencimento: '2026-10-19T12:00:00.000Z',
        valor_previsto: 356.75,
        status: 'prevista',
      },
    ]

    const mockUpdate = vi.fn().mockResolvedValue({})
    const mockGetList = vi.fn().mockImplementation((page, perPage, opts) => {
      // checagem jaExisteInicial
      return Promise.resolve({ items: [{ id: 'existente' }], totalItems: 1 })
    })
    const mockGetFullList = vi.fn().mockResolvedValue(ocorrenciasPrevistas)
    const mockGetOneConta = vi.fn().mockResolvedValue(mockContaCartao)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockGetOneConta } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          getFullList: mockGetFullList,
          update: mockUpdate,
        } as any
      }
      return {} as any
    })

    const compromisso: DespesaCompromisso = {
      id: 'fhlmrrnph6hmbh3',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-09-19T12:00:00.000Z',
      updated: '2026-09-19T12:00:00.000Z',
      descricao: 'Conserto TORO',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'parcelado',
      total_parcelas: 4,
      parcela_inicial: 1,
      valor_parcela: 356.75,
      valor_estimado: 356.75,
      data_inicio: '2026-09-19 00:00:00.000Z',
      conta_padrao: 'cartao_nu',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.sincronizarOcorrenciasCompromisso(compromisso)

    // Compra 19/09 > dia 16 -> parcela 1 vai para ciclo 2026-10 venc 23/10
    // parcela 2 vai para ciclo 2026-11 venc 23/11
    expect(mockUpdate).toHaveBeenCalledWith(
      'oc_p1',
      expect.objectContaining({
        competencia: '2026-10',
        data_vencimento: '2026-10-23T12:00:00.000Z',
      }),
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      'oc_p2',
      expect.objectContaining({
        competencia: '2026-11',
        data_vencimento: '2026-11-23T12:00:00.000Z',
      }),
    )
  })

  it('sincronizarOcorrenciasCompromisso recalcula ocorrência paga e seu lançamento vinculado ao editar data de compra', async () => {
    // Caso concreto do bug reportado: "Carne", compra no NuBank fechamento 16 vencimento 23.
    // Originalmente comprada em 16/09 (ciclo 2026-09), ocorrência paga e lançamento com data 17/09.
    // Compromisso é editado para 16/10 (ciclo 2026-10).
    // Ocorrência deve ser atualizada para competência 2026-10 e vencimento 23/10/2026,
    // preservando status "paga" e valor_pago.
    // Lançamento vinculado deve ter competência 2026-10 e data alinhada à data da compra 16/10/2026.
    const mockContaCartaoNu: Conta = {
      id: 'sglo7dfsqvgfsni',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank Cred.',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const ocorrenciaPaga = {
      id: 'biguqh6vd2qppc0',
      compromisso: 'g4nyxs2v8v4i96g',
      competencia: '2026-09',
      data_vencimento: '2026-09-23T12:00:00.000Z',
      data_pagamento: '2026-09-17T12:00:00.000Z',
      valor_previsto: 87.49,
      valor_pago: 87.49,
      status: 'paga' as const,
      lancamento: 'zytolsrk7f2nd5b',
      numero_parcela: 0,
      total_parcelas: 0,
    }

    const lancamentoVinculado = {
      id: 'zytolsrk7f2nd5b',
      descricao: 'Carne',
      competencia: '2026-09',
      data: '2026-09-17 12:00:00.000Z',
      valor: 87.49,
      status: 'pago',
      tipo: 'despesa',
      conta: 'sglo7dfsqvgfsni',
    }

    const mockUpdateOcorrencia = vi.fn().mockResolvedValue({})
    const mockGetFullListOcorrencias = vi.fn().mockResolvedValue([ocorrenciaPaga])
    const mockGetOneConta = vi.fn().mockResolvedValue(mockContaCartaoNu)
    const mockGetOneLancamento = vi.fn().mockResolvedValue(lancamentoVinculado)
    const mockUpdateLancamento = vi.fn().mockResolvedValue({})

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockGetOneConta } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getFullList: mockGetFullListOcorrencias,
          update: mockUpdateOcorrencia,
        } as any
      }
      if (name === 'lancamentos') {
        return {
          getOne: mockGetOneLancamento,
          update: mockUpdateLancamento,
        } as any
      }
      return {} as any
    })

    const compromissoEditado: DespesaCompromisso = {
      id: 'g4nyxs2v8v4i96g',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-10-06T01:34:35.000Z',
      updated: '2026-10-06T12:41:00.000Z',
      descricao: 'Carne',
      secao: 'cartoes_credito',
      regra_repeticao: 'avulso',
      modalidade_parcelamento: 'a_vista',
      valor_estimado: 87.49,
      data_inicio: '2026-10-16 00:00:00.000Z', // Data da compra alterada de 16/09 para 16/10
      conta_padrao: 'sglo7dfsqvgfsni',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.sincronizarOcorrenciasCompromisso(compromissoEditado)

    // A ocorrência existente (mesmo já paga) deve ser atualizada para competência 2026-10 e vencimento 23/10
    expect(mockUpdateOcorrencia).toHaveBeenCalledWith(
      'biguqh6vd2qppc0',
      expect.objectContaining({
        competencia: '2026-10',
        data_vencimento: '2026-10-23T12:00:00.000Z',
      }),
    )

    // O lançamento vinculado deve ser atualizado para competência 2026-10 e data alinhada a 16/10
    expect(mockGetOneLancamento).toHaveBeenCalledWith('zytolsrk7f2nd5b')
    expect(mockUpdateLancamento).toHaveBeenCalledWith(
      'zytolsrk7f2nd5b',
      expect.objectContaining({
        competencia: '2026-10',
        data: '2026-10-16 12:00:00',
      }),
    )
  })

  it('gerarOcorrenciasParaCompromissosLote evita N+1 usando ocorrências em cache e respeita throttling', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_nu',
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
    }

    const mockCreate = vi
      .fn()
      .mockImplementation((payload) => Promise.resolve({ id: 'ocorr_nova', ...payload }))
    const mockGetList = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })
    const mockGetFullList = vi.fn().mockResolvedValue([
      {
        id: 'ocorr_existente_1',
        compromisso: 'comp_1',
        competencia: '2026-09',
        status: 'prevista',
      },
    ])
    const mockGetOneConta = vi.fn().mockResolvedValue(mockContaCartao)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: mockGetOneConta } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          getFullList: mockGetFullList,
          create: mockCreate,
        } as any
      }
      return {} as any
    })

    const compromissos: DespesaCompromisso[] = [
      {
        id: 'comp_1',
        descricao: 'Compromisso 1 Já Existente',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-08-01',
        dia_vencimento: 10,
        valor_estimado: 100,
        conta_padrao: null,
        contexto_tipo: 'pessoal',
        ativo: true,
      } as DespesaCompromisso,
      {
        id: 'comp_2',
        descricao: 'Compromisso 2 Novo',
        regra_repeticao: 'mensal',
        modalidade_parcelamento: 'a_vista',
        data_inicio: '2026-08-01',
        dia_vencimento: 15,
        valor_estimado: 250,
        conta_padrao: null,
        contexto_tipo: 'pessoal',
        ativo: true,
      } as DespesaCompromisso,
    ]

    await despesasService.gerarOcorrenciasParaCompromissosLote({
      compromissos,
      competencias: ['2026-09'],
      batchSize: 2,
      batchDelayMs: 10,
    })

    // Deve ter consultado a collection em lote (getFullList)
    expect(mockGetFullList).toHaveBeenCalledTimes(1)
    // Não deve chamar getList individual porque usou o cache em memória
    expect(mockGetList).not.toHaveBeenCalled()
    // Criou apenas para comp_2 (já que comp_1 já tinha ocorrência em 2026-09)
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(mockCreate.mock.calls[0][0].compromisso).toBe('comp_2')
  })
})

describe('financeService - pagarFaturaCartao idempotência de 404', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('quando um item do lote retorna 404 no update, ignora o erro, prossegue com os demais itens e conclui o pagamento com sucesso', async () => {
    const mockLancamentoPagamento = {
      id: 'pag_fat_123',
      descricao: 'Pagamento: Fatura Agosto — NuBank',
      valor: 500,
      tipo: 'despesa',
      status: 'pago',
    }

    const mockCreate = vi.fn().mockResolvedValue(mockLancamentoPagamento)

    const error404 = new ClientResponseError({
      status: 404,
      response: { message: "The requested resource wasn't found", code: 404, data: {} },
    })

    const mockUpdate = vi.fn().mockImplementation((id: string, _data: any) => {
      if (id === 'item_ja_excluido_404') {
        return Promise.reject(error404)
      }
      return Promise.resolve({ id, status: 'pago', fatura_paga: true })
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'lancamentos') {
        return {
          create: mockCreate,
          update: mockUpdate,
        } as any
      }
      return {} as any
    })

    const result = await financeService.pagarFaturaCartao({
      cartaoContaId: 'cartao_nubank',
      competencia: '2026-08',
      valorPago: 500,
      dataPagamento: '2026-08-20',
      contaPagadoraId: 'conta_itau',
      descricaoFatura: 'Fatura Agosto — NuBank',
      itensIds: ['item_valido_1', 'item_ja_excluido_404', 'item_valido_2'],
    })

    // O lançamento de pagamento da fatura foi criado
    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(result.id).toBe('pag_fat_123')

    // Tentou atualizar todos os 3 itens
    expect(mockUpdate).toHaveBeenCalledTimes(3)
    expect(mockUpdate).toHaveBeenCalledWith('item_valido_1', {
      fatura_paga: true,
      fatura_pagamento_id: 'pag_fat_123',
      status: 'pago',
    })
    expect(mockUpdate).toHaveBeenCalledWith('item_ja_excluido_404', {
      fatura_paga: true,
      fatura_pagamento_id: 'pag_fat_123',
      status: 'pago',
    })
    expect(mockUpdate).toHaveBeenCalledWith('item_valido_2', {
      fatura_paga: true,
      fatura_pagamento_id: 'pag_fat_123',
      status: 'pago',
    })
  })

  it('quando ocorre um erro diferente de 404 (ex: 500 ou 400), o erro é propagado', async () => {
    const mockLancamentoPagamento = {
      id: 'pag_fat_error',
      descricao: 'Pagamento: Fatura Teste',
      valor: 200,
    }

    const mockCreate = vi.fn().mockResolvedValue(mockLancamentoPagamento)

    const error500 = new ClientResponseError({
      status: 500,
      response: { message: 'Internal Server Error', code: 500, data: {} },
    })

    const mockUpdate = vi.fn().mockRejectedValue(error500)

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'lancamentos') {
        return {
          create: mockCreate,
          update: mockUpdate,
        } as any
      }
      return {} as any
    })

    await expect(
      financeService.pagarFaturaCartao({
        cartaoContaId: 'cartao_nubank',
        competencia: '2026-08',
        valorPago: 200,
        dataPagamento: '2026-08-20',
        contaPagadoraId: 'conta_itau',
        descricaoFatura: 'Fatura Teste',
        itensIds: ['item_1'],
      }),
    ).rejects.toThrow()
  })
})

describe('financeService - pagarFaturaCartao com baixa cronológica parcial', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('quando o valor pago é menor que o total, quita as compras em ordem cronológica (mais antigas primeiro)', async () => {
    const mockLancamentoPagamento = {
      id: 'pag_fat_parcial',
      descricao: 'Pagamento: Fatura Setembro — NuBank',
      valor: 150,
      tipo: 'despesa',
      status: 'pago',
    }

    const mockCreate = vi.fn().mockResolvedValue(mockLancamentoPagamento)
    const mockUpdate = vi.fn().mockImplementation((id: string, _data: any) => {
      return Promise.resolve({ id, status: 'pago', fatura_paga: true })
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'lancamentos') {
        return {
          create: mockCreate,
          update: mockUpdate,
        } as any
      }
      return {} as any
    })

    // 3 compras do ciclo:
    // compra_1: 05/08/2026, R$ 50
    // compra_2: 10/08/2026, R$ 100
    // compra_3: 15/08/2026, R$ 200
    // Total = R$ 350. Valor pago = R$ 150.
    // Deve quitar compra_1 (50) + compra_2 (100) = 150. Compra_3 (200) fica em aberto.
    const itens = [
      { id: 'compra_3', valor: 200, data: '2026-08-15' }, // inserida fora de ordem
      { id: 'compra_1', valor: 50, data: '2026-08-05' },
      { id: 'compra_2', valor: 100, data: '2026-08-10' },
    ]

    const result = await financeService.pagarFaturaCartao({
      cartaoContaId: 'cartao_nubank',
      competencia: '2026-09',
      valorPago: 150,
      dataPagamento: '2026-09-20',
      contaPagadoraId: 'conta_cartao_caixa',
      descricaoFatura: 'Fatura Setembro — NuBank',
      itens,
    })

    expect(mockCreate).toHaveBeenCalledTimes(1)
    expect(result.id).toBe('pag_fat_parcial')

    // Deve ter atualizado compra_1 e compra_2, mas NÃO compra_3
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith('compra_1', {
      fatura_paga: true,
      fatura_pagamento_id: 'pag_fat_parcial',
      status: 'pago',
    })
    expect(mockUpdate).toHaveBeenCalledWith('compra_2', {
      fatura_paga: true,
      fatura_pagamento_id: 'pag_fat_parcial',
      status: 'pago',
    })
    expect(mockUpdate).not.toHaveBeenCalledWith('compra_3', expect.anything())
  })

  it('quando o valor pago cobre o total, quita todas as compras do ciclo', async () => {
    const mockLancamentoPagamento = {
      id: 'pag_fat_total',
      descricao: 'Pagamento: Fatura Total',
      valor: 350,
      tipo: 'despesa',
      status: 'pago',
    }

    const mockCreate = vi.fn().mockResolvedValue(mockLancamentoPagamento)
    const mockUpdate = vi.fn().mockImplementation((id: string, _data: any) => {
      return Promise.resolve({ id, status: 'pago', fatura_paga: true })
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'lancamentos') {
        return {
          create: mockCreate,
          update: mockUpdate,
        } as any
      }
      return {} as any
    })

    const itens = [
      { id: 'item_a', valor: 150, data: '2026-08-01' },
      { id: 'item_b', valor: 200, data: '2026-08-05' },
    ]

    await financeService.pagarFaturaCartao({
      cartaoContaId: 'cartao_nubank',
      competencia: '2026-09',
      valorPago: 350,
      dataPagamento: '2026-09-20',
      contaPagadoraId: 'conta_cartao_caixa',
      descricaoFatura: 'Fatura Total',
      itens,
    })

    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith('item_a', expect.anything())
    expect(mockUpdate).toHaveBeenCalledWith('item_b', expect.anything())
  })

  it('baixa parcial preserva a tolerância a erro 404 em compras já excluídas', async () => {
    const mockLancamentoPagamento = {
      id: 'pag_fat_parcial_404',
      descricao: 'Pagamento Fatura',
      valor: 200,
    }

    const mockCreate = vi.fn().mockResolvedValue(mockLancamentoPagamento)
    const error404 = new ClientResponseError({
      status: 404,
      response: { message: 'Not found', code: 404, data: {} },
    })

    const mockUpdate = vi.fn().mockImplementation((id: string) => {
      if (id === 'item_deletado') return Promise.reject(error404)
      return Promise.resolve({ id, status: 'pago' })
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'lancamentos') {
        return {
          create: mockCreate,
          update: mockUpdate,
        } as any
      }
      return {} as any
    })

    const itens = [
      { id: 'item_deletado', valor: 50, data: '2026-08-01' },
      { id: 'item_valido', valor: 100, data: '2026-08-02' },
    ]

    const res = await financeService.pagarFaturaCartao({
      cartaoContaId: 'cartao_nubank',
      competencia: '2026-09',
      valorPago: 150,
      dataPagamento: '2026-09-20',
      contaPagadoraId: 'conta_qualquer',
      descricaoFatura: 'Fatura Teste 404',
      itens,
    })

    expect(res.id).toBe('pag_fat_parcial_404')
    expect(mockUpdate).toHaveBeenCalledTimes(2)
    expect(mockUpdate).toHaveBeenCalledWith('item_valido', expect.anything())
  })
})

describe('despesasService - anti-retroatividade e deduplicação no gerador e sincronizador', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('compromisso anual com data_inicio no passado gera apenas a partir do mês de criação em diante', async () => {
    const mockCreate = vi
      .fn()
      .mockImplementation((payload) => Promise.resolve({ id: 'ocorr_anual_1', ...payload }))
    const mockGetList = vi.fn().mockResolvedValue({ items: [], totalItems: 0 })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          create: mockCreate,
        } as any
      }
      return {} as any
    })

    // Compromisso anual criado em setembro/2026 com data_inicio em janeiro/2026 (ex.: IPTU Costa Rica)
    const compromissoAnual: DespesaCompromisso = {
      id: 'comp_iptu_anual',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-09-25T11:00:40.957Z',
      updated: '2026-09-25T11:00:40.957Z',
      descricao: 'IPTU - Costa Rica',
      secao: 'assinaturas_anuais',
      regra_repeticao: 'anual',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-01-28 00:00:00.000Z',
      dia_vencimento: 28,
      valor_estimado: 554,
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    await despesasService.gerarOcorrenciasParaCompromisso(compromissoAnual)

    // Deve ter chamado create
    expect(mockCreate).toHaveBeenCalledTimes(1)
    const createdPayload = mockCreate.mock.calls[0][0]
    // A competência gerada NÃO pode ser retroativa ao mês de criação (2026-09)
    // Para janeiro, deve avançar para o próximo ciclo válido (2027-01), nunca 2026-01
    expect(createdPayload.competencia >= '2026-09').toBe(true)
    expect(createdPayload.competencia).toBe('2027-01')
  })

  it('sincronização repetida (gerarOcorrenciasParaCompromisso e lote) não duplica ocorrências existentes', async () => {
    const mockCreate = vi
      .fn()
      .mockImplementation((payload) => Promise.resolve({ id: 'ocorr_nova', ...payload }))

    // Simula que a ocorrência de competência 2026-10 já existe no banco
    const mockGetList = vi.fn().mockImplementation((page, perPage, opts) => {
      const filter = opts?.filter || ''
      if (
        filter.includes("competencia = '2026-10'") ||
        filter.includes("competencia = '2026-09'")
      ) {
        return Promise.resolve({
          items: [{ id: 'ocorr_ja_existe', competencia: '2026-10', numero_parcela: 0 }],
          totalItems: 1,
        })
      }
      return Promise.resolve({ items: [], totalItems: 0 })
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          create: mockCreate,
        } as any
      }
      return {} as any
    })

    const compromissoMensal: DespesaCompromisso = {
      id: 'comp_cartao_protegido',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-10-04T02:00:29.927Z',
      updated: '2026-10-04T02:00:29.927Z',
      descricao: 'Cartão Protegido',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-09-14 00:00:00.000Z',
      dia_vencimento: 3,
      valor_estimado: 14.9,
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    // Executa a primeira vez para competência 2026-10
    await despesasService.gerarOcorrenciasParaCompromisso(compromissoMensal, ['2026-10'])

    // Como já existe no getList, mockCreate NÃO deve ter sido chamado para 2026-10
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('sincronizarOcorrenciasCompromisso não cria duplicatas quando chamada repetidamente', async () => {
    const mockContaCartao: Conta = {
      id: 'cartao_porto',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'Porto Seguro',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#004A97',
      ativa: true,
      dia_fechamento: 13,
      dia_vencimento: 20,
    }

    const mockCreate = vi.fn().mockResolvedValue({ id: 'ocorr_nova' })

    // Na primeira checagem diz que já existe ocorrência inicial
    const mockGetList = vi.fn().mockResolvedValue({ items: [{ id: 'existente' }], totalItems: 1 })
    const mockGetFullList = vi.fn().mockResolvedValue([])

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: vi.fn().mockResolvedValue(mockContaCartao) } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getList: mockGetList,
          getFullList: mockGetFullList,
          create: mockCreate,
          update: vi.fn().mockResolvedValue({}),
        } as any
      }
      return {} as any
    })

    const compromisso: DespesaCompromisso = {
      id: 'comp_cartao_repetido',
      collectionId: 'despesas_compromisso',
      collectionName: 'despesas_compromisso',
      created: '2026-10-04T02:00:29.927Z',
      updated: '2026-10-04T02:00:29.927Z',
      descricao: 'Cartão Protegido Repetido',
      secao: 'cartoes_credito',
      regra_repeticao: 'mensal',
      modalidade_parcelamento: 'a_vista',
      data_inicio: '2026-09-14 00:00:00.000Z',
      dia_vencimento: 20,
      valor_estimado: 14.9,
      conta_padrao: 'cartao_porto',
      contexto_tipo: 'pessoal',
      ativo: true,
    }

    // Primeira sincronização: já existe ocorrência
    await despesasService.sincronizarOcorrenciasCompromisso(compromisso)
    // Segunda sincronização idêntica
    await despesasService.sincronizarOcorrenciasCompromisso(compromisso)

    // Não deve criar cópias extras
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it('baixarOcorrencia em cartão com método Crédito calcula competência do ciclo da fatura para a data de pagamento', async () => {
    const mockContaNuBank: Conta = {
      id: 'cartao_nubank_baixa',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const mockOcorrenciaPrevista = {
      id: 'ocorr_amendoim_baixa',
      competencia: '2026-09',
      data_vencimento: '2026-09-30 12:00:00.000Z',
      valor_previsto: 5,
      status: 'prevista',
      secao: 'cartoes_credito',
      compromisso: {
        id: 'comp_amendoim_baixa',
        metodo_pagamento: 'r9qdfpwfe5143oe', // crédito
      },
    }

    const mockCreateLancamento = vi.fn().mockResolvedValue({ id: 'lanc_amendoim_1' })
    const mockUpdateOcorrencia = vi.fn().mockResolvedValue({
      id: 'ocorr_amendoim_baixa',
      status: 'paga',
      competencia: '2026-10',
      data_pagamento: '2026-10-06 12:00:00',
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: vi.fn().mockResolvedValue(mockContaNuBank) } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: vi.fn().mockResolvedValue(mockOcorrenciaPrevista),
          update: mockUpdateOcorrencia,
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      if (name === 'lancamentos') {
        return {
          create: mockCreateLancamento,
        } as any
      }
      return {} as any
    })

    // Baixa realizada em 06/10/2026 (dia <= 16) -> ciclo da fatura 2026-10, vencimento 23/10/2026
    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'ocorr_amendoim_baixa',
      valorPago: 5,
      dataPagamento: '2026-10-06',
      contaId: 'cartao_nubank_baixa',
      descricao: 'Amendoim',
    })

    // Verifica que o lançamento financeiro herdou a competência correta (2026-10)
    expect(mockCreateLancamento).toHaveBeenCalledTimes(1)
    const lancCall = mockCreateLancamento.mock.calls[0][0]
    expect(lancCall.competencia).toBe('2026-10')
    expect(lancCall.data).toBe('2026-10-06 12:00:00')

    // Verifica que a ocorrência foi atualizada com competência 2026-10 e vencimento 23/10/2026
    expect(mockUpdateOcorrencia).toHaveBeenCalledTimes(1)
    const updateCall = mockUpdateOcorrencia.mock.calls[0][1]
    expect(updateCall.status).toBe('paga')
    expect(updateCall.competencia).toBe('2026-10')
    expect(updateCall.data_vencimento).toBe('2026-10-23T12:00:00.000Z')
    expect(updateCall.data_pagamento).toBe('2026-10-06 12:00:00')
  })

  it('caso de teste esperado: Amendoim compra 17/09/2026 no NuBank (fech 16, venc 23) -> fatura de outubro, venc 23/10/2026', () => {
    const contaNuBank: Conta = {
      id: 'sglo7dfsqvgfsni',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 1000,
      cor: '#4C3A8C',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const ciclo = calcularFaturaCartao(contaNuBank, '2026-09-17')
    expect(ciclo.competencia).toBe('2026-10')
    expect(ciclo.dataVencimento).toBe('2026-10-23')
  })

  it('criação + baixa imediata de despesa parcelada no cartão após fechamento: parcela 1 no ciclo do mês seguinte, vencimento da fatura e lançamento com mesma competência', async () => {
    const mockContaNuBank: Conta = {
      id: 'sglo7dfsqvgfsni',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'NuBank',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#8A05BE',
      ativa: true,
      dia_fechamento: 16,
      dia_vencimento: 23,
    }

    const mockCompromisso = {
      id: 'mst4cfpt34j7hpy',
      descricao: 'Curso Batera',
      data_inicio: '2026-09-17 00:00:00.000Z',
      dia_vencimento: 23,
      conta_padrao: 'sglo7dfsqvgfsni',
      metodo_pagamento: 'r9qdfpwfe5143oe',
      modalidade_parcelamento: 'parcelado',
      regra_repeticao: 'mensal',
      total_parcelas: 2,
      parcela_inicial: 1,
      valor_parcela: 72.09,
      valor_estimado: 72.09,
      secao: 'cartoes_credito',
    }

    const mockMetodoCredito = {
      id: 'r9qdfpwfe5143oe',
      nome: 'Crédito',
      codigo: 'credito',
      tipo: 'cartao',
    }

    // 1. Testar geração de ocorrências (gerarOcorrenciasParaCompromisso)
    const ocorrenciasCriadas: any[] = []
    const mockCreateOcorrencia = vi.fn().mockImplementation((payload) => {
      ocorrenciasCriadas.push(payload)
      return Promise.resolve({ id: `ocorr_${payload.numero_parcela}`, ...payload })
    })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: vi.fn().mockResolvedValue(mockContaNuBank) } as any
      }
      if (name === 'metodos_pagamento') {
        return { getOne: vi.fn().mockResolvedValue(mockMetodoCredito) } as any
      }
      if (name === 'despesas_compromisso') {
        return { getOne: vi.fn().mockResolvedValue(mockCompromisso) } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
          create: mockCreateOcorrencia,
          update: vi.fn().mockImplementation((id, data) => Promise.resolve({ id, ...data })),
        } as any
      }
      return {} as any
    })

    await despesasService.gerarOcorrenciasParaCompromisso(mockCompromisso as any)

    expect(ocorrenciasCriadas).toHaveLength(2)
    // Parcela 1: ciclo 2026-10 (compra 17/09 após fechamento dia 16), vencimento 23/10
    expect(ocorrenciasCriadas[0].numero_parcela).toBe(1)
    expect(ocorrenciasCriadas[0].competencia).toBe('2026-10')
    expect(ocorrenciasCriadas[0].data_vencimento).toBe('2026-10-23T12:00:00.000Z')

    // Parcela 2: ciclo 2026-11, vencimento 23/11
    expect(ocorrenciasCriadas[1].numero_parcela).toBe(2)
    expect(ocorrenciasCriadas[1].competencia).toBe('2026-11')
    expect(ocorrenciasCriadas[1].data_vencimento).toBe('2026-11-23T12:00:00.000Z')

    // 2. Testar baixa imediata da Parcela 1
    const mockOcorr1 = {
      id: 'ocorr_p1',
      compromisso: 'mst4cfpt34j7hpy',
      numero_parcela: 1,
      total_parcelas: 2,
      competencia: '2026-10',
      data_vencimento: '2026-10-23T12:00:00.000Z',
      valor_previsto: 72.09,
      status: 'prevista',
    }

    const mockCreateLanc = vi.fn().mockResolvedValue({ id: 'lanc_batera_p1' })
    const mockUpdateOcorr = vi.fn().mockResolvedValue({ id: 'ocorr_p1', status: 'paga' })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: vi.fn().mockResolvedValue(mockContaNuBank) } as any
      }
      if (name === 'despesas_compromisso') {
        return { getOne: vi.fn().mockResolvedValue(mockCompromisso) } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: vi.fn().mockResolvedValue(mockOcorr1),
          update: mockUpdateOcorr,
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      if (name === 'lancamentos') {
        return { create: mockCreateLanc } as any
      }
      if (name === 'metodos_pagamento') {
        return { getOne: vi.fn().mockResolvedValue(mockMetodoCredito) } as any
      }
      return {} as any
    })

    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'ocorr_p1',
      valorPago: 72.09,
      dataPagamento: '2026-09-17',
      contaId: 'sglo7dfsqvgfsni',
      descricao: 'Curso Batera (1/2)',
    })

    // Lançamento herda competência 2026-10 da fatura
    expect(mockCreateLanc).toHaveBeenCalledTimes(1)
    const lancData = mockCreateLanc.mock.calls[0][0]
    expect(lancData.competencia).toBe('2026-10')
    expect(lancData.status).toBe('pendente')

    // Ocorrência atualizada com competência 2026-10 e vencimento 2026-10-23T12:00:00.000Z
    expect(mockUpdateOcorr).toHaveBeenCalledTimes(1)
    const ocUpdates = mockUpdateOcorr.mock.calls[0][1]
    expect(ocUpdates.status).toBe('paga')
    expect(ocUpdates.competencia).toBe('2026-10')
    expect(ocUpdates.data_vencimento).toBe('2026-10-23T12:00:00.000Z')
    expect(ocUpdates.valor_pago).toBe(72.09)
  })

  it('trava da nova regra em baixarOcorrencia: método Pix em conta tipo cartao gera lançamento pago na data real e competência do pagamento', async () => {
    const mockContaCartaoPix: Conta = {
      id: 'qgdga7rawa3p00a',
      collectionId: 'contas',
      collectionName: 'contas',
      created: '2026-01-01',
      updated: '2026-01-01',
      nome: 'Sicred',
      tipo: 'cartao',
      saldo_inicial: 0,
      cor: '#1E6F5C',
      ativa: true,
      dia_fechamento: 31,
      dia_vencimento: 10,
      tipos_pagamento: ['pix', 'debito', 'transferencia', 'boletos', 'credito'],
    }

    const mockCompromissoPix = {
      id: 'gxnik4z2e2tv7lr',
      descricao: 'Frete Maquina Corte Laser',
      data_inicio: '2026-10-09 00:00:00.000Z',
      dia_vencimento: 9,
      conta_padrao: 'qgdga7rawa3p00a',
      metodo_pagamento: 'cgic0ozb853vvmj', // Pix (tipo pix, nome Pix)
      modalidade_parcelamento: 'a_vista',
      regra_repeticao: 'avulso',
      total_parcelas: 1,
      parcela_inicial: 1,
      valor_estimado: 9500,
      secao: 'contas_mensais_pix_boleto',
    }

    const mockOcorrPix = {
      id: 'g58ws79tjwhaj1s',
      compromisso: 'gxnik4z2e2tv7lr',
      numero_parcela: 0,
      total_parcelas: 0,
      competencia: '2026-10',
      data_vencimento: '2026-10-09T12:00:00.000Z',
      valor_previsto: 9500,
      status: 'prevista',
    }

    const mockCreateLanc = vi.fn().mockResolvedValue({ id: 'ybr5ks5atvf8r51' })
    const mockUpdateOcorr = vi.fn().mockResolvedValue({ id: 'g58ws79tjwhaj1s', status: 'paga' })

    vi.mocked(pb.collection).mockImplementation((name: string) => {
      if (name === 'contas') {
        return { getOne: vi.fn().mockResolvedValue(mockContaCartaoPix) } as any
      }
      if (name === 'despesas_compromisso') {
        return { getOne: vi.fn().mockResolvedValue(mockCompromissoPix) } as any
      }
      if (name === 'despesas_ocorrencias') {
        return {
          getOne: vi.fn().mockResolvedValue(mockOcorrPix),
          update: mockUpdateOcorr,
          getList: vi.fn().mockResolvedValue({ items: [], totalItems: 0 }),
        } as any
      }
      if (name === 'lancamentos') {
        return { create: mockCreateLanc } as any
      }
      if (name === 'metodos_pagamento') {
        return {
          getOne: vi.fn().mockResolvedValue({
            id: 'cgic0ozb853vvmj',
            nome: 'Pix',
            codigo: 'pix',
            tipo: 'pix',
          }),
        } as any
      }
      return {} as any
    })

    await despesasService.baixarOcorrencia({
      ocorrenciaId: 'g58ws79tjwhaj1s',
      valorPago: 9500,
      dataPagamento: '2026-10-09',
      contaId: 'qgdga7rawa3p00a',
      descricao: 'Frete Maquina Corte Laser',
    })

    // Lançamento gerado como "pago" (saída real de caixa), data real 2026-10-09 e competência 2026-10
    expect(mockCreateLanc).toHaveBeenCalledTimes(1)
    const lancData = mockCreateLanc.mock.calls[0][0]
    expect(lancData.competencia).toBe('2026-10')
    expect(lancData.status).toBe('pago')
    expect(lancData.data).toBe('2026-10-09 12:00:00')

    // Ocorrência atualizada com competência 2026-10, data_pagamento 2026-10-09 e status paga
    expect(mockUpdateOcorr).toHaveBeenCalledTimes(1)
    const ocUpdates = mockUpdateOcorr.mock.calls[0][1]
    expect(ocUpdates.status).toBe('paga')
    expect(ocUpdates.competencia).toBe('2026-10')
    expect(ocUpdates.data_pagamento).toBe('2026-10-09 12:00:00')
    expect(ocUpdates.valor_pago).toBe(9500)
  })
})
