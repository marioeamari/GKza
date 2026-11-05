import { describe, it, expect, vi, beforeEach } from 'vitest'
import pb from '@/lib/pocketbase/client'
import { funcionariosService } from './funcionarios'

vi.mock('@/lib/pocketbase/client', () => {
  return {
    default: {
      collection: vi.fn(),
    },
  }
})

/**
 * REGRA VIGENTE (ponto eletrônico):
 * Batida de ponto só é válida a partir do escaneamento do QR Code da estação
 * (origem 'estacao_qr'). Origem 'fora_do_local' é RECUSADA pelo serviço em
 * registrarEntrada / registrarSaida / registrarPausa / retomarPausa.
 * Lançamento manual do administrador (origem 'admin') permanece permitido.
 */

describe('funcionariosService - bloqueio de batida fora da estação QR', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  const montarCollection = () => {
    const pontosCollection = {
      getFullList: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({
        id: 'p1',
        funcionario: 'f1',
        data: '2026-01-01 00:00:00.000Z',
        entrada: '08:00',
        pausas: [],
        origem: 'estacao_qr',
      }),
      update: vi.fn().mockResolvedValue({
        id: 'p1',
        funcionario: 'f1',
        data: '2026-01-01 00:00:00.000Z',
        entrada: '08:00',
        pausas: [],
        origem: 'estacao_qr',
      }),
    }
    vi.mocked(pb.collection).mockImplementation(((name: string) =>
      name === 'funcionarios_pontos' ? pontosCollection : {}) as any)
    return pontosCollection
  }

  it('RECUSA registrarEntrada com origem fora_do_local (bloqueio no serviço)', async () => {
    const collection = montarCollection()

    await expect(
      funcionariosService.registrarEntrada({
        funcionarioId: 'f1',
        hora: '08:00',
        origem: 'fora_do_local',
      }),
    ).rejects.toThrow('Escaneie o QR Code da estação')

    expect(collection.create).not.toHaveBeenCalled()
  })

  it('PERMITE registrarEntrada com origem estacao_qr (batida via QR)', async () => {
    const collection = montarCollection()

    const ponto = await funcionariosService.registrarEntrada({
      funcionarioId: 'f1',
      hora: '08:00',
      origem: 'estacao_qr',
      estacao: 'Loja',
    })

    expect(collection.create).toHaveBeenCalled()
    expect(ponto.entrada).toBe('08:00')
  })

  it('PERMITE registrarEntrada com origem admin (lançamento manual do administrador)', async () => {
    const collection = montarCollection()

    const ponto = await funcionariosService.registrarEntrada({
      funcionarioId: 'f1',
      data: '2026-01-05',
      hora: '08:00',
      origem: 'admin',
      editadoPor: 'Admin',
    })

    expect(collection.create).toHaveBeenCalled()
    expect(ponto.entrada).toBe('08:00')
  })

  it('RECUSA registrarSaida em ponto com origem fora_do_local', async () => {
    const collection = montarCollection()

    await expect(
      funcionariosService.registrarSaida('p1', '17:00', 'fora_do_local'),
    ).rejects.toThrow('Escaneie o QR Code da estação')

    expect(collection.update).not.toHaveBeenCalled()
  })

  it('PERMITE registrarSaida em ponto com origem estacao_qr', async () => {
    const collection = montarCollection()

    await expect(
      funcionariosService.registrarSaida('p1', '17:00', 'estacao_qr'),
    ).resolves.toBeTruthy()
    expect(collection.update).toHaveBeenCalled()
  })

  it('RECUSA registrarPausa em ponto com origem fora_do_local e PERMITE em estacao_qr', async () => {
    const collection = montarCollection()

    await expect(
      funcionariosService.registrarPausa('p1', [], '12:00', 'fora_do_local'),
    ).rejects.toThrow('Escaneie o QR Code da estação')
    expect(collection.update).not.toHaveBeenCalled()

    await expect(
      funcionariosService.registrarPausa('p1', [], '12:00', 'estacao_qr'),
    ).resolves.toBeTruthy()
    expect(collection.update).toHaveBeenCalled()
  })

  it('RECUSA retomarPausa em ponto com origem fora_do_local e PERMITE em estacao_qr', async () => {
    const collection = montarCollection()

    await expect(
      funcionariosService.retomarPausa('p1', [{ inicio: '12:00' }], '13:00', 'fora_do_local'),
    ).rejects.toThrow('Escaneie o QR Code da estação')
    expect(collection.update).not.toHaveBeenCalled()

    await expect(
      funcionariosService.retomarPausa('p1', [{ inicio: '12:00' }], '13:00', 'estacao_qr'),
    ).resolves.toBeTruthy()
    expect(collection.update).toHaveBeenCalled()
  })

  it('recusa ponto SEM origem (legado sem rótulo) por segurança', async () => {
    montarCollection()

    await expect(
      funcionariosService.registrarEntrada({
        funcionarioId: 'f1',
        hora: '08:00',
        origem: undefined as any,
      }),
    ).rejects.toThrow('Escaneie o QR Code da estação')
  })

  it('origem admin NÃO passa pela validação de ponto já registrado (retroativo permitido)', async () => {
    const collection = montarCollection()
    collection.getFullList.mockResolvedValue([
      { id: 'p_antigo', data: '2026-01-01 12:00:00.000Z', entrada: '08:00' },
    ])

    // admin não consulta pontos existentes do dia
    await funcionariosService.registrarEntrada({
      funcionarioId: 'f1',
      data: '2026-01-01',
      hora: '07:00',
      origem: 'admin',
    })
    expect(collection.getFullList).not.toHaveBeenCalled()
  })

  it('batida estacao_qr valida ponto já registrado no dia (anti-duplicidade mantida)', async () => {
    const collection = montarCollection()
    collection.getFullList.mockResolvedValue([
      { id: 'p_antigo', data: '2026-01-01 12:00:00.000Z', entrada: '08:00', saida: '17:00' },
    ])

    await expect(
      funcionariosService.registrarEntrada({
        funcionarioId: 'f1',
        data: '2026-01-01',
        hora: '08:00',
        origem: 'estacao_qr',
      }),
    ).rejects.toThrow()
  })
})
