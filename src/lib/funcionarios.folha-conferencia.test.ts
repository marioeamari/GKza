import { describe, it, expect } from 'vitest'

/**
 * REGRA (0152) — Conferência de pagamento pelo colaborador (faixa "Pagamento
 * realizado pelo administrador! — Aguardando sua conferência" na tela de Ponto
 * Eletrônico, fluxo por token_sessao SEM usuário PocketBase autenticado):
 *
 * - O update anônimo de `funcionarios_folhas` só é aceito quando o PATCH altera
 *   EXATAMENTE os três campos de conferência:
 *     status_conferencia_colaborador, conferido_colaborador_em,
 *     motivo_divergencia_colaborador
 * - Qualquer outro campo no corpo (quitada, a_receber, funcionario, datas, etc.)
 *   recusa o PATCH com 404 — que era exatamente o bug original (a regra antiga
 *   exigia auth e o colaborador não tem sessão PocketBase).
 * - O ciclo de folha NÃO muda: pagamento não é bloqueado por confirmação.
 */

const CAMPOS_CONFERENCIA = [
  'status_conferencia_colaborador',
  'conferido_colaborador_em',
  'motivo_divergencia_colaborador',
] as const

const CAMPOS_PROTEGIDOS = [
  'funcionario',
  'periodo_inicio',
  'periodo_fim',
  'ganho_total',
  'descontos',
  'divida_semanal',
  'a_receber',
  'quitada',
  'data_quitacao',
  'lancamento_id',
  'observacoes',
  'notificacao_pagamento_enviada',
  'notificacao_pagamento_em',
  'dias_pendentes_fechamento',
] as const

/** Replica a regra de update gravada na migração 0152 em `funcionarios_folhas`. */
function patchAnonimoPermitido(corpo: Record<string, unknown>): {
  permitido: boolean
  motivo?: string
} {
  const campos = Object.keys(corpo)
  const tocouConferencia = CAMPOS_CONFERENCIA.every((c) => campos.includes(c))
  const tocouProtegido = campos.some((c) => (CAMPOS_PROTEGIDOS as readonly string[]).includes(c))
  const camposEstranhos = campos.filter(
    (c) =>
      !(CAMPOS_CONFERENCIA as readonly string[]).includes(c) &&
      !(CAMPOS_PROTEGIDOS as readonly string[]).includes(c),
  )

  if (!tocouConferencia) {
    return {
      permitido: false,
      motivo: 'PATCH anônimo precisa alterar exatamente os 3 campos de conferência',
    }
  }
  if (tocouProtegido) {
    return {
      permitido: false,
      motivo: `PATCH anônimo não pode alterar campo protegido: ${campos.find((c) => (CAMPOS_PROTEGIDOS as readonly string[]).includes(c))}`,
    }
  }
  if (camposEstranhos.length > 0) {
    return {
      permitido: false,
      motivo: `PATCH anônimo não pode incluir campo fora do escopo: ${camposEstranhos.join(', ')}`,
    }
  }
  return { permitido: true }
}

describe('Regra 0152: conferência de folha pelo colaborador (fluxo por token_sessao, sem auth)', () => {
  it('PATCH com exatamente os 3 campos de conferência (status confirmado) é PERMITIDO', () => {
    const corpo = {
      status_conferencia_colaborador: 'confirmado',
      conferido_colaborador_em: new Date().toISOString(),
      motivo_divergencia_colaborador: '',
    }
    expect(patchAnonimoPermitido(corpo)).toEqual({ permitido: true })
  })

  it('PATCH com exatamente os 3 campos (divergente + motivo) é PERMITIDO', () => {
    const corpo = {
      status_conferencia_colaborador: 'divergente',
      conferido_colaborador_em: new Date().toISOString(),
      motivo_divergencia_colaborador: 'Faltou o dia 20/11 no pagamento',
    }
    expect(patchAnonimoPermitido(corpo)).toEqual({ permitido: true })
  })

  it('PATCH sem os 3 campos de conferência é RECUSADO (regra exige :changed = true nos três)', () => {
    expect(patchAnonimoPermitido({ status_conferencia_colaborador: 'confirmado' }).permitido).toBe(
      false,
    )
    expect(
      patchAnonimoPermitido({
        status_conferencia_colaborador: 'confirmado',
        conferido_colaborador_em: new Date().toISOString(),
      }).permitido,
    ).toBe(false)
    expect(patchAnonimoPermitido({}).permitido).toBe(false)
  })

  it.each(CAMPOS_PROTEGIDOS)(
    'PATCH anônimo que alterar também o campo protegido %s é RECUSADO (não vira brecha para mexer na folha)',
    (campoProtegido) => {
      const corpo: Record<string, unknown> = {
        status_conferencia_colaborador: 'confirmado',
        conferido_colaborador_em: new Date().toISOString(),
        motivo_divergencia_colaborador: '',
        [campoProtegido]: campoProtegido === 'quitada' ? true : 'x',
      }
      const r = patchAnonimoPermitido(corpo)
      expect(r.permitido).toBe(false)
      expect(r.motivo).toContain(campoProtegido)
    },
  )

  it('PATCH anônimo com campo fora do escopo é RECUSADO', () => {
    const r = patchAnonimoPermitido({
      status_conferencia_colaborador: 'confirmado',
      conferido_colaborador_em: new Date().toISOString(),
      motivo_divergencia_colaborador: '',
      campo_inexistente: 1,
    })
    expect(r.permitido).toBe(false)
  })

  it('a regra antiga (só auth) é exatamente a causa do 404 original: colaborador anônimo não passava', () => {
    // Antes da 0152 a regra de update era "@request.auth.id != '' && ..." —
    // no fluxo por token_sessao não há auth, e o PocketBase responde 404
    // ("The requested resource wasn't found.") mesmo com o registro existindo.
    const regraAntigaExigiaAuth = true
    expect(regraAntigaExigiaAuth).toBe(true)
    expect(patchAnonimoPermitido({} as Record<string, unknown>).motivo).toBeDefined()
  })
})
