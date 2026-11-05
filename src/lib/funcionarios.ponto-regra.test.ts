import { describe, it, expect } from 'vitest'
import { validarOrigemPontoPermitida, MSG_BLOQUEIO_FORA_DO_LOCAL } from './funcionarios'

/**
 * REGRA VIGENTE (ponto eletrônico): batida de ponto somente a partir do
 * escaneamento do QR Code da estação (origem 'estacao_qr').
 * - Com estação válida → permitido
 * - Sem estação (origem 'fora_do_local' / 'manual' / indefinida) → BLOQUEADO
 * - Lançamento manual do administrador (origem 'admin') → permitido
 */

describe('Regra: bloqueio de batida de ponto fora da estação QR', () => {
  it('PERMITE origem estacao_qr (com estação escaneada)', () => {
    expect(validarOrigemPontoPermitida('estacao_qr')).toEqual({ permitido: true })
  })

  it('PERMITE origem admin (lançamento manual do administrador inalterado)', () => {
    expect(validarOrigemPontoPermitida('admin')).toEqual({ permitido: true })
  })

  it('BLOQUEIA origem fora_do_local (acesso direto sem escanear o QR)', () => {
    const r = validarOrigemPontoPermitida('fora_do_local')
    expect(r.permitido).toBe(false)
    expect(r.motivo).toBe(MSG_BLOQUEIO_FORA_DO_LOCAL)
    expect(r.motivo).toBe('Escaneie o QR Code da estação para registrar o ponto.')
  })

  it('BLOQUEIA origem manual e indefinida (legados sem estação válida)', () => {
    expect(validarOrigemPontoPermitida('manual').permitido).toBe(false)
    expect(validarOrigemPontoPermitida(undefined).permitido).toBe(false)
    expect(validarOrigemPontoPermitida(null).permitido).toBe(false)
  })

  it('mensagem do bloqueio é exatamente o aviso exigido na tela', () => {
    expect(MSG_BLOQUEIO_FORA_DO_LOCAL).toBe('Escaneie o QR Code da estação para registrar o ponto.')
  })
})
