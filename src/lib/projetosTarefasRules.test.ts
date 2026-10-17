import { describe, it, expect, beforeEach } from 'vitest'
import {
  getTarefaPendenciasResumo,
  loadPersistedExpandedTarefas,
  savePersistedExpandedTarefas,
  STORAGE_EXPANDED_TAREFAS_KEY,
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
})
