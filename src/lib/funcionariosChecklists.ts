/**
 * Regras dos Checklists Diários por Função (Módulo de Funcionários — GKza ERP)
 *
 * REGRA VIGENTE:
 * 1. ATRIBUIÇÃO: o admin cria FUNÇÕES (funcionarios_funcoes), cria CHECKLISTS
 *    (funcionarios_checklists) com itens e período, vincula o checklist a uma ou
 *    mais funções e vincula funções ao funcionário (relation multi 'funcoes').
 *    No check-in, o funcionário recebe todos os checklists das suas funções
 *    válidos para aquele dia/período.
 * 2. PERÍODOS E VIGÊNCIA:
 *    - diario  → todo dia em que o funcionário registra ponto.
 *    - manha   → todo dia; janela: check-in (batida de entrada) ANTES de 12:00.
 *    - tarde   → todo dia; janela: check-in (batida de entrada) A PARTIR de 12:00.
 *    - semanal → somente no dia da semana escolhido (dia_semana 0=domingo..6=sábado).
 *    - mensal  → somente no dia do mês escolhido (dia_mes 1..31; meses curtos
 *                simplesmente não têm aquele dia).
 * 3. EXECUÇÃO: nasce SOMENTE no check-in (sem atraso fantasma: dia sem ponto não
 *    gera execução — a criação é preguiçosa, no primeiro item marcado). Uma
 *    execução por funcionário+checklist+data (idempotente). Cada item marcado
 *    guarda o horário HH:mm no fuso America/Sao_Paulo.
 * 4. ESTAÇÃO: marcar itens exige a MESMA origem válida do ponto
 *    (validarOrigemPontoPermitida): 'estacao_qr' obrigatório; 'admin' permitido;
 *    sem QR escaneado a marcação é BLOQUEADA com o aviso padrão do ponto.
 * 5. SAÍDA: registrar saída com itens pendentes apenas AVISA (toast), nunca
 *    bloqueia o registro.
 */

import { parseDate } from './format'
import { validarOrigemPontoPermitida, type OrigemPonto } from './funcionarios'

export type PeriodoChecklist = 'manha' | 'tarde' | 'diario' | 'semanal' | 'mensal'

export const PERIODOS_CHECKLIST: { valor: PeriodoChecklist; label: string }[] = [
  { valor: 'manha', label: 'Manhã' },
  { valor: 'tarde', label: 'Tarde' },
  { valor: 'diario', label: 'Diário' },
  { valor: 'semanal', label: 'Semanal' },
  { valor: 'mensal', label: 'Mensal' },
]

export const DIAS_SEMANA_LABELS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
]

/** Limite da janela manhã/tarde: entrada antes de 12:00 = manhã; a partir de 12:00 = tarde. */
export const LIMITE_JANELA_TARDE = '12:00'

export interface ChecklistItemTemplate {
  texto: string
}

export interface ChecklistItemExecucao {
  texto: string
  marcado: boolean
  horario?: string // HH:mm da marcação
}

export type StatusExecucaoChecklist = 'concluido' | 'parcial' | 'nao_feito'

/** Compara duas strings HH:mm (−1 se a < b, 0 se iguais, 1 se a > b). */
export function compararHHMM(a: string, b: string): number {
  const [ah = 0, am = 0] = (a || '00:00').split(':').map((v) => parseInt(v, 10) || 0)
  const [bh = 0, bm = 0] = (b || '00:00').split(':').map((v) => parseInt(v, 10) || 0)
  if (ah !== bh) return ah < bh ? -1 : 1
  if (am !== bm) return am < bm ? -1 : 1
  return 0
}

/**
 * Vigência por DIA (independente da hora da entrada): diário/manhã/tarde vigem
 * todo dia; semanal só no dia da semana; mensal só no dia do mês.
 */
export function checklistAplicaAoDia(
  checklist: { periodo: PeriodoChecklist; dia_semana?: number; dia_mes?: number },
  dataYYYYMMDD: string,
): boolean {
  const d = parseDate(dataYYYYMMDD)
  switch (checklist.periodo) {
    case 'diario':
    case 'manha':
    case 'tarde':
      return true
    case 'semanal':
      return d.getDay() === (checklist.dia_semana ?? 0)
    case 'mensal':
      return d.getDate() === (checklist.dia_mes ?? 1)
    default:
      return false
  }
}

/**
 * Janela do dia resolvida pela HORA DA ENTRADA (check-in):
 * manhã exige entrada antes de 12:00; tarde exige entrada a partir de 12:00.
 * Períodos diário/semanal/mensal não dependem da hora. Sem hora conhecida,
 * manhã e tarde ficam válidas (exibição administrativa).
 */
export function checklistVigeNoCheckIn(
  checklist: { periodo: PeriodoChecklist },
  horaEntrada?: string,
): boolean {
  if (checklist.periodo !== 'manha' && checklist.periodo !== 'tarde') return true
  if (!horaEntrada) return true
  const antesDoMeioDia = compararHHMM(horaEntrada, LIMITE_JANELA_TARDE) < 0
  return checklist.periodo === 'manha' ? antesDoMeioDia : !antesDoMeioDia
}

/** Status da execução: concluído (todos marcados), parcial (alguns), não feito (nenhum). */
export function calcularStatusExecucao(
  itens: ChecklistItemExecucao[] | null | undefined,
): StatusExecucaoChecklist {
  const lista = itens || []
  if (lista.length === 0) return 'nao_feito'
  const marcados = lista.filter((i) => i.marcado).length
  if (marcados === 0) return 'nao_feito'
  if (marcados === lista.length) return 'concluido'
  return 'parcial'
}

export function contarItensPendentes(itens: ChecklistItemExecucao[] | null | undefined): number {
  return (itens || []).filter((i) => !i.marcado).length
}

export const STATUS_EXECUCAO_LABELS: Record<StatusExecucaoChecklist, string> = {
  concluido: 'Concluído',
  parcial: 'Parcial',
  nao_feito: 'Não feito',
}

/**
 * REGRA: marcar item de checklist usa a mesma validação de origem do ponto.
 * Sem QR da estação (ou origem admin), a marcação é recusada com o aviso padrão.
 */
export function validarOrigemMarcacaoChecklist(origem: OrigemPonto | null | undefined): {
  permitido: boolean
  motivo?: string
} {
  return validarOrigemPontoPermitida(origem)
}

/** Hora atual (HH:mm) no fuso America/Sao_Paulo. */
export function horaAtualSP(): string {
  try {
    const parts = new Intl.DateTimeFormat('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(new Date())
    const hh = parts.find((p) => p.type === 'hour')?.value || '00'
    const mm = parts.find((p) => p.type === 'minute')?.value || '00'
    return `${hh.padStart(2, '0')}:${mm.padStart(2, '0')}`
  } catch {
    const now = new Date()
    return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  }
}

/** Rótulo legível do período (ex.: "Semanal · Segunda-feira", "Mensal · dia 5"). */
export function formatarPeriodoChecklist(checklist: {
  periodo: PeriodoChecklist
  dia_semana?: number
  dia_mes?: number
}): string {
  const base = PERIODOS_CHECKLIST.find((p) => p.valor === checklist.periodo)?.label || '—'
  if (checklist.periodo === 'semanal') {
    const dia = DIAS_SEMANA_LABELS[checklist.dia_semana ?? 0] || '—'
    return `${base} · ${dia}`
  }
  if (checklist.periodo === 'mensal') {
    return `${base} · dia ${checklist.dia_mes ?? 1}`
  }
  return base
}
