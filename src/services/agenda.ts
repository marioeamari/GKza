import pb from '@/lib/pocketbase/client'
import type {
  AgendaEvento,
  AgendaEventoRecorrencia,
  AgendaEventoStatus,
  AgendaEventoOrigem,
} from '@/types/domain'
import { adicionarExcecao } from '@/lib/agendaRecorrencia'

export interface CreateAgendaEventoInput {
  titulo: string
  descricao?: string
  contexto_tipo: 'pessoal' | 'empresa'
  pessoa?: string
  empresa?: string
  data_inicio: string
  data_fim?: string
  dia_inteiro?: boolean
  local?: string
  recorrencia?: AgendaEventoRecorrencia
  status?: AgendaEventoStatus
  origem?: AgendaEventoOrigem
  google_event_id?: string
  cor?: string
}

export const agendaService = {
  async listEventos(filter?: string): Promise<AgendaEvento[]> {
    return pb.collection('agenda_eventos').getFullList<AgendaEvento>({
      filter,
      sort: 'data_inicio',
      expand: 'pessoa,empresa',
    })
  },

  async getEvento(id: string): Promise<AgendaEvento> {
    return pb.collection('agenda_eventos').getOne<AgendaEvento>(id, {
      expand: 'pessoa,empresa',
    })
  },

  async createEvento(data: CreateAgendaEventoInput): Promise<AgendaEvento> {
    return pb.collection('agenda_eventos').create<AgendaEvento>({
      ...data,
      status: data.status || 'ativo',
      origem: data.origem || 'sistema',
      recorrencia: data.recorrencia || 'nenhuma',
    })
  },

  async updateEvento(id: string, data: Partial<CreateAgendaEventoInput>): Promise<AgendaEvento> {
    return pb.collection('agenda_eventos').update<AgendaEvento>(id, data)
  },

  async cancelarEvento(id: string): Promise<AgendaEvento> {
    return pb.collection('agenda_eventos').update<AgendaEvento>(id, {
      status: 'cancelado',
    })
  },

  async deleteEvento(id: string): Promise<boolean> {
    return pb.collection('agenda_eventos').delete(id)
  },

  /**
   * Exclui UMA ocorrência de um compromisso recorrente: grava o dia em
   * recorrencia_excecoes e a projeção da agenda pula essa data.
   * A série em si continua intacta.
   */
  async excluirOcorrencia(evento: AgendaEvento, dataOcorrencia: string): Promise<AgendaEvento> {
    const atual = (evento.recorrencia_excecoes as string | undefined) || ''
    return pb.collection('agenda_eventos').update<AgendaEvento>(evento.id, {
      recorrencia_excecoes: adicionarExcecao(atual, dataOcorrencia),
    })
  },
}
