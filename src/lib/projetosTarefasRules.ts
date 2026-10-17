/**
 * Regras e utilitários do módulo de Tarefas e Projetos.
 *
 * REGRA VIGENTE / NOVA:
 * 1. Por padrão, cada tarefa nas listas/quadro do módulo /projetos é renderizada de forma colapsada (accordion fechado),
 *    exibindo apenas o título de forma compacta e minimalista.
 * 2. Clicar no chevron/botão de expansão (ou no cabeçalho do accordion com teclado/enter/espaço) alterna o estado
 *    da tarefa para expandido, revelando o conteúdo completo (descrição, prioridade, contexto, projeto, checklist interativa,
 *    prazos, responsável e ações rápidas de movimentação/edição/exclusão).
 * 3. Indicador compacto de pendências e criticidade:
 *    - Quando colapsada, a linha exibe chips discretos sem poluir a lista:
 *      * Contagem de subtarefas/checklist pendentes (ex: '2/5 pendentes' ou '✓ 5/5')
 *      * Alerta discreto de atraso ou vencimento iminente (se prazo expirou ou é hoje)
 *      * Ponto/badge sutil da prioridade quando alta ou urgente
 * 4. Persistência de estado de expansão:
 *    - O estado de quais tarefas estão expandidas é persistido (ex.: localStorage com fallback em memória),
 *      garantindo que alternar entre abas (Quadro, Projetos, Metas) ou recarregar a tela não resete o estado escolhido.
 * 5. Acessibilidade:
 *    - Botão do trigger possui aria-expanded e aria-controls vinculado ao container de conteúdo.
 *    - Navegável por teclado (Enter e Espaço expandem/colapsam).
 *    - Suporta expansão e colapso em lote ("Expandir todas" / "Recolher todas") para agilidade.
 */

import type { Tarefa } from '@/types/domain'

export const STORAGE_EXPANDED_TAREFAS_KEY = 'projetos_tarefas_expanded_ids'

export interface TarefaPendenciasResumo {
  totalChecklist: number
  feitosChecklist: number
  pendentesChecklist: number
  hasChecklist: boolean
  isAtrasada: boolean
  isHoje: boolean
  prioridadeCritica: boolean
}

/**
 * Calcula resumo de pendências e alertas da tarefa para exibição compacta no accordion.
 */
export function getTarefaPendenciasResumo(
  tarefa: Pick<Tarefa, 'checklist' | 'prazo' | 'etapa' | 'prioridade'>,
  hojeRefStr?: string,
): TarefaPendenciasResumo {
  const checklist = tarefa.checklist || []
  const totalChecklist = checklist.length
  const feitosChecklist = checklist.filter((item) => item.feito).length
  const pendentesChecklist = totalChecklist - feitosChecklist

  const hoje = hojeRefStr || new Date().toISOString().slice(0, 10)
  let isAtrasada = false
  let isHoje = false

  if (tarefa.prazo && tarefa.etapa !== 'concluida') {
    const prazoDateStr = tarefa.prazo.slice(0, 10)
    if (prazoDateStr < hoje) {
      isAtrasada = true
    } else if (prazoDateStr === hoje) {
      isHoje = true
    }
  }

  const prioridadeCritica =
    tarefa.etapa !== 'concluida' &&
    (tarefa.prioridade === 'alta' || tarefa.prioridade === 'urgente')

  return {
    totalChecklist,
    feitosChecklist,
    pendentesChecklist,
    hasChecklist: totalChecklist > 0,
    isAtrasada,
    isHoje,
    prioridadeCritica,
  }
}

/**
 * Carrega a lista de IDs de tarefas expandidas persistida no localStorage.
 * Por padrão (quando nada está expandido), retorna um conjunto vazio:
 * as tarefas iniciam colapsadas por padrão mostrando apenas o título.
 */
export function loadPersistedExpandedTarefas(): Set<string> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return new Set<string>()
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_EXPANDED_TAREFAS_KEY)
    if (!raw) return new Set<string>()
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((id): id is string => typeof id === 'string'))
    }
  } catch {
    // Silently fallback on empty set
  }
  return new Set<string>()
}

/**
 * Salva a lista de IDs expandidos no localStorage.
 */
export function savePersistedExpandedTarefas(expandedIds: Set<string>): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    const array = Array.from(expandedIds)
    window.localStorage.setItem(STORAGE_EXPANDED_TAREFAS_KEY, JSON.stringify(array))
  } catch {
    // Ignore storage quota or access errors
  }
}
