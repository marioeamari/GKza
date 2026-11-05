import { describe, it, expect } from 'vitest'
import {
  checklistAplicaAoDia,
  checklistVigeNoCheckIn,
  compararHHMM,
  calcularStatusExecucao,
  validarOrigemMarcacaoChecklist,
  LIMITE_JANELA_TARDE,
  type ChecklistItemExecucao,
} from './funcionariosChecklists'
import { MSG_BLOQUEIO_FORA_DO_LOCAL } from './funcionarios'

/**
 * REGRA VIGENTE (Checklists diários por função — módulo de funcionários):
 * 1. VIGÊNCIA POR DIA: diário/manhã/tarde valem todo dia; semanal vale apenas
 *    no dia_semana escolhido (0=domingo..6=sábado); mensal apenas no dia_mes
 *    (1..31; meses curtos simplesmente não têm aquele dia).
 * 2. JANELA MANHÃ/TARDE: resolvida pela HORA DA ENTRADA (check-in) —
 *    antes de 12:00 = manhã; a partir de 12:00 = tarde (LIMITE_JANELA_TARDE).
 * 3. STATUS DA EXECUÇÃO: concluído (todos os itens marcados), parcial (alguns),
 *    não feito (nenhum marcado ou execução sem itens).
 * 4. ORIGEM DA MARCAÇÃO: mesma regra do ponto — só 'estacao_qr' (QR escaneado)
 *    e 'admin' (lançamento do administrador) são permitidos; 'fora_do_local',
 *    'manual' e indefinida são RECUSADOS com o aviso padrão do ponto.
 */

// Datas fixas conhecidas: 2024-01-15 = segunda-feira; 2024-01-20 = sábado;
// 2024-01-21 = domingo; todos os meses de teste têm 31 dias.
const SEGUNDA = '2024-01-15'
const SABADO = '2024-01-20'
const DIA15 = '2024-01-15'
const DIA20 = '2024-01-20'

describe('Vigência semanal: checklist vale apenas no dia da semana escolhido', () => {
  it('semanal com dia_semana 1 (segunda) vale na segunda-feira', () => {
    const checklist = { periodo: 'semanal' as const, dia_semana: 1 }
    expect(checklistAplicaAoDia(checklist, SEGUNDA)).toBe(true)
  })

  it('semanal com dia_semana 1 (segunda) NÃO vale no sábado', () => {
    const checklist = { periodo: 'semanal' as const, dia_semana: 1 }
    expect(checklistAplicaAoDia(checklist, SABADO)).toBe(false)
  })

  it('semanal com dia_semana 6 (sábado) vale no sábado e não na segunda', () => {
    const checklist = { periodo: 'semanal' as const, dia_semana: 6 }
    expect(checklistAplicaAoDia(checklist, SABADO)).toBe(true)
    expect(checklistAplicaAoDia(checklist, SEGUNDA)).toBe(false)
  })

  it('semanal sem dia_semana definido assume domingo (0)', () => {
    const checklist = { periodo: 'semanal' as const }
    expect(checklistAplicaAoDia(checklist, '2024-01-21')).toBe(true)
    expect(checklistAplicaAoDia(checklist, SEGUNDA)).toBe(false)
  })

  it('diário/manhã/tarde vigem em qualquer dia (independem de dia_semana)', () => {
    for (const periodo of ['diario', 'manha', 'tarde'] as const) {
      expect(checklistAplicaAoDia({ periodo }, SEGUNDA)).toBe(true)
      expect(checklistAplicaAoDia({ periodo }, SABADO)).toBe(true)
    }
  })
})

describe('Vigência mensal: checklist vale apenas no dia do mês escolhido', () => {
  it('mensal com dia_mes 15 vale no dia 15', () => {
    const checklist = { periodo: 'mensal' as const, dia_mes: 15 }
    expect(checklistAplicaAoDia(checklist, DIA15)).toBe(true)
  })

  it('mensal com dia_mes 15 NÃO vale no dia 20', () => {
    const checklist = { periodo: 'mensal' as const, dia_mes: 15 }
    expect(checklistAplicaAoDia(checklist, DIA20)).toBe(false)
  })

  it('mensal com dia_mes 31 vale no dia 31 de um mês de 31 dias', () => {
    const checklist = { periodo: 'mensal' as const, dia_mes: 31 }
    expect(checklistAplicaAoDia(checklist, '2024-01-31')).toBe(true)
  })

  it('mensal com dia_mes 31 NÃO vale em mês de 30 dias (dia não existe)', () => {
    const checklist = { periodo: 'mensal' as const, dia_mes: 31 }
    expect(checklistAplicaAoDia(checklist, '2024-04-30')).toBe(false)
  })

  it('mensal sem dia_mes definido assume dia 1', () => {
    const checklist = { periodo: 'mensal' as const }
    expect(checklistAplicaAoDia(checklist, '2024-01-01')).toBe(true)
    expect(checklistAplicaAoDia(checklist, DIA15)).toBe(false)
  })

  it('periodo desconhecido não vigem em dia nenhum', () => {
    expect(checklistAplicaAoDia({ periodo: 'inexistente' as never, dia_semana: 1 }, SEGUNDA)).toBe(
      false,
    )
  })
})

describe('Janela manhã/tarde resolvida pela hora da entrada (check-in)', () => {
  it('limite da janela é exatamente 12:00', () => {
    expect(LIMITE_JANELA_TARDE).toBe('12:00')
  })

  it('entrada às 11:59 é MANHÃ e não é TARDE', () => {
    expect(checklistVigeNoCheckIn({ periodo: 'manha' }, '11:59')).toBe(true)
    expect(checklistVigeNoCheckIn({ periodo: 'tarde' }, '11:59')).toBe(false)
  })

  it('entrada às 12:00 é TARDE e não é MANHÃ (a partir de 12:00)', () => {
    expect(checklistVigeNoCheckIn({ periodo: 'tarde' }, '12:00')).toBe(true)
    expect(checklistVigeNoCheckIn({ periodo: 'manha' }, '12:00')).toBe(false)
  })

  it('sanidade da comparação HH:mm na fronteira', () => {
    expect(compararHHMM('11:59', '12:00')).toBe(-1)
    expect(compararHHMM('12:00', '12:00')).toBe(0)
    expect(compararHHMM('12:01', '12:00')).toBe(1)
  })

  it('sem hora conhecida, manhã e tarde ficam válidas (exibição administrativa)', () => {
    expect(checklistVigeNoCheckIn({ periodo: 'manha' }, undefined)).toBe(true)
    expect(checklistVigeNoCheckIn({ periodo: 'tarde' }, undefined)).toBe(true)
  })

  it('períodos diário/semanal/mensal não dependem da hora', () => {
    for (const periodo of ['diario', 'semanal', 'mensal'] as const) {
      expect(checklistVigeNoCheckIn({ periodo }, '08:00')).toBe(true)
      expect(checklistVigeNoCheckIn({ periodo }, '18:00')).toBe(true)
    }
  })
})

describe('calcularStatusExecucao: concluído / parcial / não feito', () => {
  const item = (marcado: boolean): ChecklistItemExecucao => ({ texto: 'item', marcado })

  it('todos os itens marcados = concluido', () => {
    expect(calcularStatusExecucao([item(true), item(true), item(true)])).toBe('concluido')
  })

  it('alguns itens marcados = parcial', () => {
    expect(calcularStatusExecucao([item(true), item(false)])).toBe('parcial')
    expect(calcularStatusExecucao([item(false), item(false), item(true)])).toBe('parcial')
  })

  it('nenhum item marcado = nao_feito', () => {
    expect(calcularStatusExecucao([item(false), item(false)])).toBe('nao_feito')
  })

  it('execução sem itens (ou nula/indefinida) = nao_feito', () => {
    expect(calcularStatusExecucao([])).toBe('nao_feito')
    expect(calcularStatusExecucao(null)).toBe('nao_feito')
    expect(calcularStatusExecucao(undefined)).toBe('nao_feito')
  })
})

describe('Recusa de origem: marcar item exige estação QR ou admin (mesma regra do ponto)', () => {
  it('PERMITE origem estacao_qr (QR da estação escaneado)', () => {
    expect(validarOrigemMarcacaoChecklist('estacao_qr')).toEqual({ permitido: true })
  })

  it('PERMITE origem admin (marcação manual do administrador)', () => {
    expect(validarOrigemMarcacaoChecklist('admin')).toEqual({ permitido: true })
  })

  it('RECUSA origem fora_do_local com o aviso padrão do ponto', () => {
    const r = validarOrigemMarcacaoChecklist('fora_do_local')
    expect(r.permitido).toBe(false)
    expect(r.motivo).toBe(MSG_BLOQUEIO_FORA_DO_LOCAL)
    expect(r.motivo).toBe('Escaneie o QR Code da estação para registrar o ponto.')
  })

  it('RECUSA origem manual e indefinida', () => {
    expect(validarOrigemMarcacaoChecklist('manual').permitido).toBe(false)
    expect(validarOrigemMarcacaoChecklist(undefined).permitido).toBe(false)
    expect(validarOrigemMarcacaoChecklist(null).permitido).toBe(false)
  })
})
