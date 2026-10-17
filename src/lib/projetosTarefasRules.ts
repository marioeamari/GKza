/**
 * Regras e utilitários do módulo de Tarefas e Projetos.
 *
 * REGRA VIGENTE / ATUALIZADA:
 * 1. Por padrão, cada tarefa nas listas/quadro do módulo /projetos é renderizada de forma colapsada (accordion fechado),
 *    exibindo apenas a linha compacta com chevron à esquerda, o título da tarefa e os badges/indicadores à direita.
 * 2. TÍTULO COMPLETO SEM TRUNCAMENTO (Ajuste aprovado):
 *    - Na linha compacta (tarefa colapsada) e no cabeçalho do cartão, o título da tarefa NUNCA deve sofrer truncamento/ellipsis
 *      (sem 'truncate', 'text-ellipsis' ou 'line-clamp').
 *    - O título deve ser renderizado por completo com quebra de linha natural (break-words / whitespace-normal),
 *      expandindo a altura vertical do cartão conforme necessário.
 *    - O layout mantém alinhamento limpo: chevron fixo à esquerda no topo, título à esquerda ocupando o espaço flexível,
 *      e indicadores de pendências/atraso/prioridade fixados à direita sem esmagar o título (shrink-0).
 * 3. Clicar no cabeçalho ou no chevron/botão de expansão (ou Enter/Espaço no teclado) alterna o estado
 *    da tarefa para expandido, revelando o conteúdo completo (descrição, prioridade, contexto, projeto, checklist interativa,
 *    prazos, responsável e ações rápidas de movimentação/edição/exclusão).
 * 4. Indicador compacto de pendências e criticidade:
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

/**
 * Classes utilitárias CSS para renderização do título da tarefa no accordion.
 * Garante título completo (sem truncamento/ellipsis) com quebra de linha natural
 * e altura vertical dinâmica.
 */
export const TAREFA_TITULO_CLASSES = {
  container: 'flex items-start gap-2.5 min-w-0 flex-1',
  titulo: 'text-sm leading-snug break-words whitespace-normal transition-colors',
  badgesContainer: 'flex items-center gap-1.5 shrink-0 pt-0.5',
}

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
