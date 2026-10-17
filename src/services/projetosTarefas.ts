import pb from '@/lib/pocketbase/client'
import type {
  Projeto,
  Tarefa,
  MetaMeta,
  ProjetoStatus,
  TarefaEtapa,
  TarefaPrioridade,
  TarefaChecklistItem,
  MetaTipoProgresso,
  MetaStatus,
} from '@/types/domain'

export interface CreateProjetoInput {
  nome: string
  objetivo?: string
  descricao?: string
  contexto_tipo: 'pessoal' | 'empresa'
  pessoa?: string
  empresa?: string
  prazo?: string
  status?: ProjetoStatus
  cor?: string
}

export interface CreateTarefaInput {
  titulo: string
  descricao?: string
  projeto?: string
  responsavel?: string
  etapa?: TarefaEtapa
  prioridade?: TarefaPrioridade
  contexto_tipo: 'pessoal' | 'empresa'
  pessoa?: string
  empresa?: string
  prazo?: string
  checklist?: TarefaChecklistItem[]
  ordem?: number
  evento_agenda?: string
}

export interface CreateMetaInput {
  titulo: string
  descricao?: string
  contexto_tipo: 'pessoal' | 'empresa'
  pessoa?: string
  empresa?: string
  prazo?: string
  tipo_progresso: MetaTipoProgresso
  progresso_manual?: number
  alvo_descricao?: string
  projeto?: string
  tarefas?: string[]
  status?: MetaStatus
  cor?: string
}

export const projetosTarefasService = {
  // --- PROJETOS ---
  async listProjetos(filter?: string): Promise<Projeto[]> {
    return pb.collection('projetos').getFullList<Projeto>({
      filter,
      sort: '-created',
      expand: 'pessoa,empresa',
    })
  },

  async createProjeto(data: CreateProjetoInput): Promise<Projeto> {
    return pb.collection('projetos').create<Projeto>({
      ...data,
      status: data.status || 'em_andamento',
    })
  },

  async updateProjeto(id: string, data: Partial<CreateProjetoInput>): Promise<Projeto> {
    return pb.collection('projetos').update<Projeto>(id, data)
  },

  async deleteProjeto(id: string): Promise<boolean> {
    return pb.collection('projetos').delete(id)
  },

  // --- TAREFAS ---
  async listTarefas(filter?: string): Promise<Tarefa[]> {
    return pb.collection('tarefas').getFullList<Tarefa>({
      filter,
      sort: 'ordem,created',
      expand: 'projeto,responsavel,pessoa,empresa,evento_agenda',
    })
  },

  async createTarefa(data: CreateTarefaInput): Promise<Tarefa> {
    return pb.collection('tarefas').create<Tarefa>({
      ...data,
      etapa: data.etapa || 'a_fazer',
      prioridade: data.prioridade || 'media',
      checklist: data.checklist || [],
    })
  },

  async updateTarefa(id: string, data: Partial<CreateTarefaInput>): Promise<Tarefa> {
    return pb.collection('tarefas').update<Tarefa>(id, data)
  },

  async updateEtapa(id: string, etapa: TarefaEtapa, ordem?: number): Promise<Tarefa> {
    const payload: Partial<CreateTarefaInput> = { etapa }
    if (typeof ordem === 'number') {
      payload.ordem = ordem
    }
    return pb.collection('tarefas').update<Tarefa>(id, payload)
  },

  async updateOrdensLote(
    updates: Array<{ id: string; ordem: number; etapa?: TarefaEtapa }>,
  ): Promise<void> {
    await Promise.all(
      updates.map((u) => {
        const payload: { ordem: number; etapa?: TarefaEtapa } = { ordem: u.ordem }
        if (u.etapa) payload.etapa = u.etapa
        return pb.collection('tarefas').update(u.id, payload)
      }),
    )
  },

  async deleteTarefa(id: string): Promise<boolean> {
    return pb.collection('tarefas').delete(id)
  },

  // --- METAS ---
  async listMetas(filter?: string): Promise<MetaMeta[]> {
    return pb.collection('metas_metas').getFullList<MetaMeta>({
      filter,
      sort: '-created',
      expand: 'pessoa,empresa,projeto,tarefas',
    })
  },

  async createMeta(data: CreateMetaInput): Promise<MetaMeta> {
    return pb.collection('metas_metas').create<MetaMeta>({
      ...data,
      status: data.status || 'em_andamento',
      progresso_manual: data.progresso_manual ?? 0,
    })
  },

  async updateMeta(id: string, data: Partial<CreateMetaInput>): Promise<MetaMeta> {
    return pb.collection('metas_metas').update<MetaMeta>(id, data)
  },

  async deleteMeta(id: string): Promise<boolean> {
    return pb.collection('metas_metas').delete(id)
  },
}
