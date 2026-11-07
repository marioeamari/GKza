import { describe, it, expect } from 'vitest'
import { dataOcorrenciaDeEvento, isOcorrenciaExcluida } from './agendaRecorrencia'

describe('isOcorrenciaExcluida', () => {
  it('retorno imediato quando o evento não tem exceções', () => {
    expect(isOcorrenciaExcluida(undefined, '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida(null, '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida('', '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida('[]', '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida('   ', '2026-11-05')).toBe(false)
  })

  it('JSON inválido ou não-array não derruba a projeção', () => {
    expect(isOcorrenciaExcluida('{quebrado', '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida('"texto"', '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida('42', '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida('{"a":1}', '2026-11-05')).toBe(false)
  })

  it('data exata presente na lista é excluída', () => {
    expect(isOcorrenciaExcluida('["2026-11-05"]', '2026-11-05')).toBe(true)
    expect(isOcorrenciaExcluida('["2026-11-04","2026-11-05"]', '2026-11-05')).toBe(true)
  })

  it('data ausente na lista é mantida', () => {
    expect(isOcorrenciaExcluida('["2026-11-12"]', '2026-11-05')).toBe(false)
    expect(isOcorrenciaExcluida('["2026-11-12"]', '2026-11-12')).toBe(true)
  })

  it('formatos longos/ISO e inválidos da lista são normalizados e ignorados', () => {
    // ISO gravado por engano é truncado para o dia e bate com a ocorrência
    expect(isOcorrenciaExcluida('["2026-11-05T12:00:00.000Z"]', '2026-11-05')).toBe(true)
    // valor sem forma de data é ignorado (não derruba os demais)
    expect(isOcorrenciaExcluida('["abc","2026-11-05"]', '2026-11-05')).toBe(true)
    expect(isOcorrenciaExcluida('["abc"]', '2026-11-05')).toBe(false)
  })

  it('data da ocorrência em formato ISO também é normalizada', () => {
    expect(isOcorrenciaExcluida('["2026-11-05"]', '2026-11-05T15:00:00.000Z')).toBe(true)
  })
})

describe('dataOcorrenciaDeEvento', () => {
  const noonUtc = (s: string) => new Date(`${s}T12:00:00.000Z`).toISOString()

  it('data pura YYYY-MM-DD é devolvida como está', () => {
    expect(dataOcorrenciaDeEvento('2026-11-05', '2026-11-05')).toBe('2026-11-05')
  })

  it('ISO completo é convertido para o dia em America/Sao_Paulo', () => {
    // 2026-11-05T00:30:00Z ainda é 05/11 em São Paulo (UTC-3)
    expect(dataOcorrenciaDeEvento('2026-11-05T00:30:00.000Z', noonUtc('2026-11-05'))).toBe(
      '2026-11-05',
    )
    // 2026-11-06T02:30:00Z ainda é 05/11 em São Paulo (22h30 de 05/11)
    expect(dataOcorrenciaDeEvento('2026-11-06T02:30:00.000Z', noonUtc('2026-11-05'))).toBe(
      '2026-11-05',
    )
  })

  it('formato com espaço (estilo PocketBase) é convertido', () => {
    expect(dataOcorrenciaDeEvento('2026-11-06 02:30:00.000Z', noonUtc('2026-11-05'))).toBe(
      '2026-11-05',
    )
  })

  it('data inválida cai no dia base', () => {
    expect(dataOcorrenciaDeEvento('não-é-data', '2026-11-05')).toBe('2026-11-05')
  })

  it('ocorrência projetada na série tem o mesmo dia da ocorrência real', () => {
    const projetada = '2026-11-12T18:00:00.000Z'
    expect(dataOcorrenciaDeEvento(projetada, '2026-11-12')).toBe('2026-11-12')
  })
})
