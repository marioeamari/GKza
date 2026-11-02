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
 * 5. Persistência de estado de expansão:
 *    - O estado de quais tarefas estão expandidas é persistido (ex.: localStorage com fallback em memória),
 *      garantindo que alternar entre abas (Quadro, Projetos, Metas) ou recarregar a tela não resete o estado escolhido.
 * 6. NOVO - MODO "ORGANIZAR ORDEM" & SELETOR DE CRITÉRIO DE ORDENAÇÃO:
 *    - O topo do quadro Kanban conta com um switch/toggle "Organizar ordem" ao lado dos botões "Expandir tudo" / "Recolher tudo".
 *    - Ao ATIVAR o toggle:
 *      * Ativa controles explícitos de reordenação em cada tarefa nas colunas (A Fazer, Em Progresso, Concluída):
 *        alça/grip de arrasto (drag-and-drop) e botões de setas ↑ e ↓ para subir ou descer na coluna.
 *      * Arrastar pelo título ou grip na linha compacta do accordion funciona fluidamente mesmo colapsado.
 *      * O modo força/seleciona o critério 'manual'.
 *    - Ao DESATIVAR o toggle:
 *      * Os controles de reordenação são ocultados e o quadro exibe a lista limpa com a ordenação vigente.
 *    - Critérios de ordenação disponíveis no seletor:
 *      * 'manual': Respeita a ordem personalizada do usuário gravada por coluna no campo 'ordem' (e sincronizada no cache local).
 *      * 'prazo': Ordena por data de prazo ascendente (tarefas com prazo mais próximo primeiro, tarefas sem prazo ao final).
 *      * 'prioridade': Ordena por urgência (urgente > alta > media > baixa).
 *      * Alternar para 'prazo' ou 'prioridade' recalcula dinamicamente a exibição; voltar a 'manual' restaura imediatamente a ordem salva pelo usuário.
 *    - Persistência e integridade:
 *      * A ordem manual persiste no banco de dados (campo 'ordem' da coleção tarefas) e em cache local por coluna, sobrevivendo a recarregamentos.
 *      * A expansão/recolhimento do accordion (individual ou em lote) NUNCA altera ou reseta a ordem das tarefas.
 * 7. Acessibilidade:
 *    - Botão do trigger possui aria-expanded e aria-controls vinculado ao container de conteúdo.
 *    - Navegável por teclado (Enter e Espaço expandem/colapsam; botões ↑/↓ acessíveis).
 *    - Suporta expansão e colapso em lote ("Expandir todas" / "Recolher todas") para agilidade.
 * 8. SUBTAREFAS RÁPIDAS DIRETAMENTE NA VISUALIZAÇÃO:
 *    - O usuário pode adicionar subtarefas/itens de checklist a uma tarefa diretamente a partir da visualização da tarefa
 *      no quadro do projeto, sem precisar entrar em edição do projeto ou abrir o modal de edição de tarefas.
 *    - A ação insere o novo item no checklist existente da tarefa e persiste imediatamente no PocketBase.
 * 9. EDIÇÃO DE ITENS DE CHECKLIST EXISTENTES:
 *    - Tanto no modal de edição da tarefa (TarefaDialog) quanto na gestão de itens, o usuário pode editar o texto de qualquer
 *      item existente da checklist (via botão de edição com confirmação/cancelamento ou salvamento por Enter/Ctrl+Enter),
 *      mantendo a opção de exclusão e marcação de concluído.
 * 10. ITENS MULTI-LINHA DO CHECKLIST E PRESERVAÇÃO DE QUEBRA DE LINHA (Adicionado na 0.0.279):
 *    - Os campos de adição de novo item de checklist e de edição inline (via lápis) usam textarea auto-expansível em vez de input de 1 linha.
 *    - Teclado nos campos de checklist:
 *      * Enter: insere quebra de linha (\n) no texto da subtarefa/checklist.
 *      * Ctrl+Enter (ou Meta+Enter): atalho rápido de confirmação do item.
 *      * Esc: cancela a edição inline.
 *      * Confirmação explícita disponível pelo botão de Adicionar / ícone de check.
 *    - Persistência e higienização:
 *      * O texto persiste com as quebras (\n) no array `checklist` da coleção `tarefas`.
 *      * Textos vazios ou contendo apenas espaços/quebras de linha sem conteúdo são rejeitados.
 *      * Espaços em branco nas extremidades inicial/final do texto total são higienizados sem perder as quebras internas.
 *    - Exibição:
 *      * O texto dos itens do checklist preserva quebras de linha (`whitespace-pre-line break-words`) em todos os lugares:
 *        modal TarefaDialog, itens no card do Kanban (expandido) e listagem de tarefas na aba Projetos.
 *      * O mesmo tratamento preserva quebras de linha (`whitespace-pre-line break-words` ou `whitespace-pre-wrap`) para
 *        a Descrição / Instruções da tarefa quando exibida fora de textarea.
 */

import type { Tarefa, TarefaEtapa, TarefaPrioridade, TarefaChecklistItem } from '@/types/domain'

/**
 * Higieniza o texto do item de checklist preservando quebras de linha internas (\n).
 * Rejeita textos vazios ou formados apenas por espaços e quebras de linha.
 */
export function sanitizeChecklistTexto(texto: string): string {
  const trimmed = (texto || '').trim()
  if (!trimmed) {
    throw new Error('O texto do item da checklist não pode ser vazio.')
  }
  return trimmed
}

/**
 * Cria um novo item de checklist com ID único e texto higienizado preservando quebras de linha.
 */
export function createChecklistItem(texto: string, feito = false): TarefaChecklistItem {
  const sanitized = sanitizeChecklistTexto(texto)
  return {
    id: Math.random().toString(36).substring(2, 9),
    texto: sanitized,
    feito,
  }
}

/**
 * Adiciona um novo item de subtarefa/checklist a uma lista existente.
 */
export function addChecklistItemToList(
  checklist: TarefaChecklistItem[] | undefined,
  texto: string,
): TarefaChecklistItem[] {
  const current = checklist || []
  const newItem = createChecklistItem(texto)
  return [...current, newItem]
}

/**
 * Atualiza o texto de um item existente de checklist mantendo a ordem e o status.
 */
export function updateChecklistItemTexto(
  checklist: TarefaChecklistItem[] | undefined,
  itemId: string,
  novoTexto: string,
): TarefaChecklistItem[] {
  const sanitized = sanitizeChecklistTexto(novoTexto)
  const current = checklist || []
  return current.map((item) => (item.id === itemId ? { ...item, texto: sanitized } : item))
}

/**
 * Remove um item da checklist.
 */
export function removeChecklistItemFromList(
  checklist: TarefaChecklistItem[] | undefined,
  itemId: string,
): TarefaChecklistItem[] {
  const current = checklist || []
  return current.filter((item) => item.id !== itemId)
}

/**
 * Alterna o status (feito / pendente) de um item da checklist.
 */
export function toggleChecklistItemStatus(
  checklist: TarefaChecklistItem[] | undefined,
  itemId: string,
): TarefaChecklistItem[] {
  const current = checklist || []
  return current.map((item) => (item.id === itemId ? { ...item, feito: !item.feito } : item))
}

export const STORAGE_EXPANDED_TAREFAS_KEY = 'projetos_tarefas_expanded_ids'
export const STORAGE_ORDEM_CRITERIO_KEY = 'projetos_tarefas_ordem_criterio'
export const STORAGE_MANUAL_ORDER_KEY = 'projetos_tarefas_manual_order_map'

export type CriterioOrdenacaoTarefas = 'manual' | 'prazo' | 'prioridade'

export const PESOS_PRIORIDADE: Record<TarefaPrioridade, number> = {
  urgente: 4,
  alta: 3,
  media: 2,
  baixa: 1,
}

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

/**
 * Carrega o critério de ordenação do localStorage.
 * Padrão: 'manual'.
 */
export function loadPersistedCriterioOrdenacao(): CriterioOrdenacaoTarefas {
  if (typeof window === 'undefined' || !window.localStorage) {
    return 'manual'
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_ORDEM_CRITERIO_KEY)
    if (raw === 'manual' || raw === 'prazo' || raw === 'prioridade') {
      return raw
    }
  } catch {
    // Silently fallback to manual
  }
  return 'manual'
}

/**
 * Salva o critério de ordenação no localStorage.
 */
export function savePersistedCriterioOrdenacao(criterio: CriterioOrdenacaoTarefas): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_ORDEM_CRITERIO_KEY, criterio)
  } catch {
    // Ignore storage errors
  }
}

/**
 * Carrega o mapa local de ordem manual por etapa: Record<TarefaEtapa, string[] (IDs ordenados)>
 */
export function loadPersistedManualOrderMap(): Partial<Record<TarefaEtapa, string[]>> {
  if (typeof window === 'undefined' || !window.localStorage) {
    return {}
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_MANUAL_ORDER_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null) {
      return parsed
    }
  } catch {
    // Silently fallback
  }
  return {}
}

/**
 * Salva o mapa local de ordem manual por etapa no localStorage.
 */
export function savePersistedManualOrderMap(
  orderMap: Partial<Record<TarefaEtapa, string[]>>,
): void {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    window.localStorage.setItem(STORAGE_MANUAL_ORDER_KEY, JSON.stringify(orderMap))
  } catch {
    // Ignore storage errors
  }
}

/**
 * Ordena uma lista de tarefas por um critério específico:
 * - 'manual': respeita a ordem numérica (campo 'ordem') ou a ordem do array / cache local
 * - 'prazo': tarefas com prazo definido mais próximo primeiro; tarefas sem prazo ao final (ordenadas por created)
 * - 'prioridade': urgente > alta > media > baixa; desempate por prazo ou created
 */
export function sortTarefas(
  tarefas: Tarefa[],
  criterio: CriterioOrdenacaoTarefas,
  manualIdOrder?: string[],
): Tarefa[] {
  const lista = [...tarefas]

  if (criterio === 'prazo') {
    return lista.sort((a, b) => {
      if (a.prazo && b.prazo) {
        const diff = new Date(a.prazo).getTime() - new Date(b.prazo).getTime()
        if (diff !== 0) return diff
      } else if (a.prazo && !b.prazo) {
        return -1
      } else if (!a.prazo && b.prazo) {
        return 1
      }
      return (a.created || '').localeCompare(b.created || '')
    })
  }

  if (criterio === 'prioridade') {
    return lista.sort((a, b) => {
      const pesoA = PESOS_PRIORIDADE[a.prioridade] ?? 0
      const pesoB = PESOS_PRIORIDADE[b.prioridade] ?? 0
      if (pesoB !== pesoA) {
        return pesoB - pesoA // decrescente (maior peso primeiro)
      }
      // Desempate por prazo
      if (a.prazo && b.prazo) {
        const diff = new Date(a.prazo).getTime() - new Date(b.prazo).getTime()
        if (diff !== 0) return diff
      } else if (a.prazo && !b.prazo) {
        return -1
      } else if (!a.prazo && b.prazo) {
        return 1
      }
      return (a.created || '').localeCompare(b.created || '')
    })
  }

  // 'manual': se houver mapa de IDs explícito passado, respeitar
  if (manualIdOrder && manualIdOrder.length > 0) {
    const posMap = new Map<string, number>()
    manualIdOrder.forEach((id, index) => posMap.set(id, index))

    return lista.sort((a, b) => {
      const posA = posMap.has(a.id) ? posMap.get(a.id)! : 999999
      const posB = posMap.has(b.id) ? posMap.get(b.id)! : 999999
      if (posA !== posB) return posA - posB
      const ordemA = typeof a.ordem === 'number' ? a.ordem : 0
      const ordemB = typeof b.ordem === 'number' ? b.ordem : 0
      if (ordemA !== ordemB) return ordemA - ordemB
      return (a.created || '').localeCompare(b.created || '')
    })
  }

  // Fallback para o campo ordem e created
  return lista.sort((a, b) => {
    const ordemA = typeof a.ordem === 'number' ? a.ordem : 0
    const ordemB = typeof b.ordem === 'number' ? b.ordem : 0
    if (ordemA !== ordemB) return ordemA - ordemB
    return (a.created || '').localeCompare(b.created || '')
  })
}

/**
 * Move um elemento dentro de um array de tarefas (ex: mover para cima, para baixo, ou drop entre índices)
 * Retorna o novo array de tarefas com os índices atualizados no campo `ordem` (0, 10, 20...).
 */
export function reorderTarefas(
  tarefas: Tarefa[],
  fromIndex: number,
  toIndex: number,
): Array<Tarefa & { ordem: number }> {
  if (fromIndex < 0 || fromIndex >= tarefas.length)
    return tarefas.map((t, idx) => ({ ...t, ordem: idx * 10 }))
  if (toIndex < 0 || toIndex >= tarefas.length)
    return tarefas.map((t, idx) => ({ ...t, ordem: idx * 10 }))
  if (fromIndex === toIndex) return tarefas.map((t, idx) => ({ ...t, ordem: idx * 10 }))

  const result = [...tarefas]
  const [removed] = result.splice(fromIndex, 1)
  result.splice(toIndex, 0, removed)

  return result.map((item, index) => ({
    ...item,
    ordem: index * 10,
  }))
}

/**
 * Insere ou move uma tarefa dentro de uma coluna (etapa destino)
 */
export function insertTarefaAt(
  columnTarefas: Tarefa[],
  tarefaToInsert: Tarefa,
  targetIndex: number,
): Array<Tarefa & { ordem: number }> {
  const filtered = columnTarefas.filter((t) => t.id !== tarefaToInsert.id)
  const safeIndex = Math.max(0, Math.min(targetIndex, filtered.length))
  filtered.splice(safeIndex, 0, tarefaToInsert)

  return filtered.map((t, idx) => ({
    ...t,
    ordem: idx * 10,
  }))
}
