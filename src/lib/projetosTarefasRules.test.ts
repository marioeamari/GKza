import { describe, it, expect, beforeEach } from 'vitest'
import {
  getTarefaPendenciasResumo,
  loadPersistedExpandedTarefas,
  savePersistedExpandedTarefas,
  loadPersistedCriterioOrdenacao,
  savePersistedCriterioOrdenacao,
  loadPersistedManualOrderMap,
  savePersistedManualOrderMap,
  sortTarefas,
  reorderTarefas,
  insertTarefaAt,
  STORAGE_EXPANDED_TAREFAS_KEY,
  STORAGE_ORDEM_CRITERIO_KEY,
  STORAGE_MANUAL_ORDER_KEY,
} from './projetosTarefasRules'
import type { Tarefa } from '@/types/domain'

describe('Regras de Accordion e Indicadores de Tarefas (/projetos)', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  describe('Comportamento Padrão de Inicialização (Accordion Colapsado)', () => {
    it('inicia com conjunto vazio de IDs expandidos por padrão (todas as tarefas colapsadas)', () => {
      const expandedSet = loadPersistedExpandedTarefas()
      expect(expandedSet.size).toBe(0)
      expect(expandedSet.has('tarefa-1')).toBe(false)
    })

    it('persiste e recupera tarefas expandidas no localStorage', () => {
      const set = new Set(['t-1', 't-2'])
      savePersistedExpandedTarefas(set)

      const recovered = loadPersistedExpandedTarefas()
      expect(recovered.has('t-1')).toBe(true)
      expect(recovered.has('t-2')).toBe(true)
      expect(recovered.has('t-3')).toBe(false)
    })

    it('lida graciosamente com JSON corrompido no localStorage retornando conjunto vazio', () => {
      localStorage.setItem(STORAGE_EXPANDED_TAREFAS_KEY, '{invalid-json')
      const recovered = loadPersistedExpandedTarefas()
      expect(recovered.size).toBe(0)
    })
  })

  describe('Acessibilidade e Atributos ARIA do Accordion', () => {
    it('retorna os atributos aria e id de conteúdo para uma tarefa', () => {
      const tarefaId = 'tar-abc-123'
      const contentId = `tarefa-content-${tarefaId}`
      const isExpandedFalse = false
      const isExpandedTrue = true

      expect(contentId).toBe('tarefa-content-tar-abc-123')
      expect(isExpandedFalse).toBe(false)
      expect(isExpandedTrue).toBe(true)
    })
  })

  describe('Regra de Exibição do Título sem Truncamento na Linha Compacta', () => {
    it('garante que as classes do título da tarefa não contêm truncate ou line-clamp e permitem wrap natural', async () => {
      const { TAREFA_TITULO_CLASSES } = await import('./projetosTarefasRules')
      expect(TAREFA_TITULO_CLASSES.titulo).not.toContain('truncate')
      expect(TAREFA_TITULO_CLASSES.titulo).not.toContain('line-clamp')
      expect(TAREFA_TITULO_CLASSES.titulo).not.toContain('text-ellipsis')
      expect(TAREFA_TITULO_CLASSES.titulo).toContain('break-words')
      expect(TAREFA_TITULO_CLASSES.titulo).toContain('whitespace-normal')
    })
  })

  describe('Indicador Discreto de Pendências e Alertas na Linha Compacta', () => {
    const tarefaBase: Tarefa = {
      id: 'tar-123',
      titulo: 'Emitir NF da Shopee',
      etapa: 'a_fazer',
      prioridade: 'media',
      contexto_tipo: 'empresa',
      created: '2026-03-01',
      updated: '2026-03-01',
      collectionId: 'tarefas',
      collectionName: 'tarefas',
    }

    it('identifica checklist vazia corretamente', () => {
      const resumo = getTarefaPendenciasResumo(tarefaBase, '2026-03-10')
      expect(resumo.hasChecklist).toBe(false)
      expect(resumo.totalChecklist).toBe(0)
      expect(resumo.pendentesChecklist).toBe(0)
    })

    it('calcula contagem de subtarefas pendentes quando há checklist', () => {
      const tarefaComCheck: Tarefa = {
        ...tarefaBase,
        checklist: [
          { id: '1', texto: 'Baixar relatório', feito: true },
          { id: '2', texto: 'Verificar alíquotas', feito: false },
          { id: '3', texto: 'Enviar para contabilidade', feito: false },
        ],
      }
      const resumo = getTarefaPendenciasResumo(tarefaComCheck, '2026-03-10')
      expect(resumo.hasChecklist).toBe(true)
      expect(resumo.totalChecklist).toBe(3)
      expect(resumo.feitosChecklist).toBe(1)
      expect(resumo.pendentesChecklist).toBe(2)
    })

    it('alerta se a tarefa está atrasada em relação à data de referência', () => {
      const tarefaAtrasada: Tarefa = {
        ...tarefaBase,
        prazo: '2026-03-05 23:59:59.000Z',
        etapa: 'em_progresso',
      }
      const resumo = getTarefaPendenciasResumo(tarefaAtrasada, '2026-03-10')
      expect(resumo.isAtrasada).toBe(true)
      expect(resumo.isHoje).toBe(false)
    })

    it('não alerta atraso se a tarefa já estiver concluída', () => {
      const tarefaConcluida: Tarefa = {
        ...tarefaBase,
        prazo: '2026-03-05 23:59:59.000Z',
        etapa: 'concluida',
      }
      const resumo = getTarefaPendenciasResumo(tarefaConcluida, '2026-03-10')
      expect(resumo.isAtrasada).toBe(false)
    })

    it('detecta se o vencimento é hoje', () => {
      const tarefaHoje: Tarefa = {
        ...tarefaBase,
        prazo: '2026-03-10 23:59:59.000Z',
        etapa: 'a_fazer',
      }
      const resumo = getTarefaPendenciasResumo(tarefaHoje, '2026-03-10')
      expect(resumo.isAtrasada).toBe(false)
      expect(resumo.isHoje).toBe(true)
    })

    it('detecta criticidade em prioridade alta ou urgente não concluída', () => {
      const tarefaUrgente: Tarefa = {
        ...tarefaBase,
        prioridade: 'urgente',
        etapa: 'a_fazer',
      }
      const resumoUrgente = getTarefaPendenciasResumo(tarefaUrgente)
      expect(resumoUrgente.prioridadeCritica).toBe(true)

      const tarefaConcluidaUrgente: Tarefa = {
        ...tarefaUrgente,
        etapa: 'concluida',
      }
      const resumoConcluida = getTarefaPendenciasResumo(tarefaConcluidaUrgente)
      expect(resumoConcluida.prioridadeCritica).toBe(false)
    })
  })

  describe('Regras do Modo "Organizar ordem" e Seletores de Critério', () => {
    const t1: Tarefa = {
      id: 't-1',
      titulo: 'Tarefa Um',
      etapa: 'a_fazer',
      prioridade: 'baixa',
      contexto_tipo: 'empresa',
      prazo: '2026-04-10',
      ordem: 0,
      created: '2026-03-01T10:00:00Z',
      updated: '2026-03-01T10:00:00Z',
      collectionId: 'tarefas',
      collectionName: 'tarefas',
    }

    const t2: Tarefa = {
      id: 't-2',
      titulo: 'Tarefa Dois',
      etapa: 'a_fazer',
      prioridade: 'urgente',
      contexto_tipo: 'empresa',
      prazo: '2026-03-15',
      ordem: 10,
      created: '2026-03-02T10:00:00Z',
      updated: '2026-03-02T10:00:00Z',
      collectionId: 'tarefas',
      collectionName: 'tarefas',
    }

    const t3: Tarefa = {
      id: 't-3',
      titulo: 'Tarefa Tres',
      etapa: 'a_fazer',
      prioridade: 'alta',
      contexto_tipo: 'empresa',
      prazo: undefined,
      ordem: 20,
      created: '2026-03-03T10:00:00Z',
      updated: '2026-03-03T10:00:00Z',
      collectionId: 'tarefas',
      collectionName: 'tarefas',
    }

    it('persiste e carrega critério de ordenação com fallback para manual', () => {
      expect(loadPersistedCriterioOrdenacao()).toBe('manual')

      savePersistedCriterioOrdenacao('prazo')
      expect(loadPersistedCriterioOrdenacao()).toBe('prazo')

      savePersistedCriterioOrdenacao('prioridade')
      expect(loadPersistedCriterioOrdenacao()).toBe('prioridade')

      localStorage.setItem(STORAGE_ORDEM_CRITERIO_KEY, 'invalido')
      expect(loadPersistedCriterioOrdenacao()).toBe('manual')
    })

    it('persiste e recupera mapa de ordem manual por coluna', () => {
      const map = {
        a_fazer: ['t-3', 't-1', 't-2'],
        em_progresso: ['t-x'],
      }
      savePersistedManualOrderMap(map)

      const loaded = loadPersistedManualOrderMap()
      expect(loaded.a_fazer).toEqual(['t-3', 't-1', 't-2'])
      expect(loaded.em_progresso).toEqual(['t-x'])
    })

    it('reordena tarefas corretamente via reorderTarefas (setas ↑ e ↓ ou drag)', () => {
      const list = [t1, t2, t3] // [t1, t2, t3]

      // Subir t2 (index 1 -> 0)
      const subiu = reorderTarefas(list, 1, 0)
      expect(subiu.map((t) => t.id)).toEqual(['t-2', 't-1', 't-3'])
      expect(subiu[0].ordem).toBe(0)
      expect(subiu[1].ordem).toBe(10)
      expect(subiu[2].ordem).toBe(20)

      // Descer t1 (index 0 -> 2)
      const desceu = reorderTarefas(list, 0, 2)
      expect(desceu.map((t) => t.id)).toEqual(['t-2', 't-3', 't-1'])
      expect(desceu[0].ordem).toBe(0)
      expect(desceu[1].ordem).toBe(10)
      expect(desceu[2].ordem).toBe(20)
    })

    it('insere tarefa em índice específico com insertTarefaAt', () => {
      const list = [t1, t3]
      const inserted = insertTarefaAt(list, t2, 1)
      expect(inserted.map((t) => t.id)).toEqual(['t-1', 't-2', 't-3'])
      expect(inserted[1].ordem).toBe(10)
    })

    it('ordena por Prazo (mais próximo primeiro, sem prazo ao final)', () => {
      const ordenado = sortTarefas([t1, t2, t3], 'prazo')
      // t2: 2026-03-15
      // t1: 2026-04-10
      // t3: sem prazo
      expect(ordenado.map((t) => t.id)).toEqual(['t-2', 't-1', 't-3'])
    })

    it('ordena por Prioridade (urgente > alta > media > baixa)', () => {
      const t4: Tarefa = {
        ...t1,
        id: 't-4',
        prioridade: 'media',
      }
      const ordenado = sortTarefas([t1, t2, t3, t4], 'prioridade')
      // t2: urgente
      // t3: alta
      // t4: media
      // t1: baixa
      expect(ordenado.map((t) => t.id)).toEqual(['t-2', 't-3', 't-4', 't-1'])
    })

    it('restaura a ordem salva do usuário ao alternar para Manual', () => {
      const manualOrderIds = ['t-3', 't-1', 't-2']

      // Quando em prazo
      const porPrazo = sortTarefas([t1, t2, t3], 'prazo')
      expect(porPrazo.map((t) => t.id)).toEqual(['t-2', 't-1', 't-3'])

      // Volta a manual com o mapa salvo
      const restaurado = sortTarefas([t1, t2, t3], 'manual', manualOrderIds)
      expect(restaurado.map((t) => t.id)).toEqual(['t-3', 't-1', 't-2'])
    })

    it('garante que a ordem manual sobrevive ao colapsar/expandir (accordion) sem ser afetada', () => {
      // Estado de expansão do accordion
      const expandedSet = new Set<string>()
      expect(expandedSet.has('t-3')).toBe(false)

      const listaManual = sortTarefas([t1, t2, t3], 'manual', ['t-3', 't-2', 't-1'])
      expect(listaManual.map((t) => t.id)).toEqual(['t-3', 't-2', 't-1'])

      // Expande todas as tarefas
      listaManual.forEach((t) => expandedSet.add(t.id))
      expect(expandedSet.size).toBe(3)

      // Re-ordena e a lista deve ser idêntica
      const listaPosExpansao = sortTarefas(listaManual, 'manual', ['t-3', 't-2', 't-1'])
      expect(listaPosExpansao.map((t) => t.id)).toEqual(['t-3', 't-2', 't-1'])

      // Recolhe todas as tarefas
      expandedSet.clear()
      expect(expandedSet.size).toBe(0)

      const listaPosRecolhimento = sortTarefas(listaPosExpansao, 'manual', ['t-3', 't-2', 't-1'])
      expect(listaPosRecolhimento.map((t) => t.id)).toEqual(['t-3', 't-2', 't-1'])
    })
  })
})
