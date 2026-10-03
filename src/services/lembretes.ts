import pb from '@/lib/pocketbase/client'
import type {
  LembreteRapido,
  LembreteRapidoPrioridade,
  LembreteRapidoStatus,
  ContextoTipo,
} from '@/types/domain'

export interface CreateLembreteRapidoInput {
  titulo: string
  detalhe?: string
  contexto_tipo?: ContextoTipo
  pessoa?: string
  empresa?: string
  contexto_nome?: string
  data_limite: string
  hora_limite?: string
  prioridade?: LembreteRapidoPrioridade
  status?: LembreteRapidoStatus
  repetir_ate_concluir?: boolean
  origem?: string
  usuario?: string
}

export const lembretesService = {
  async listLembretes(
    filter?: string,
    sort = 'data_limite,hora_limite',
  ): Promise<LembreteRapido[]> {
    return pb.collection('lembretes_rapidos').getFullList<LembreteRapido>({
      filter: filter || undefined,
      sort,
      expand: 'pessoa,empresa,usuario',
    })
  },

  async listPendentes(): Promise<LembreteRapido[]> {
    return pb.collection('lembretes_rapidos').getFullList<LembreteRapido>({
      filter: "status = 'pendente'",
      sort: 'data_limite,hora_limite',
      expand: 'pessoa,empresa,usuario',
    })
  },

  async getLembrete(id: string): Promise<LembreteRapido> {
    return pb.collection('lembretes_rapidos').getOne<LembreteRapido>(id, {
      expand: 'pessoa,empresa,usuario',
    })
  },

  async createLembrete(data: CreateLembreteRapidoInput): Promise<LembreteRapido> {
    return pb.collection('lembretes_rapidos').create<LembreteRapido>({
      titulo: data.titulo.trim(),
      detalhe: data.detalhe?.trim() || '',
      contexto_tipo: data.contexto_tipo || undefined,
      pessoa: data.pessoa || null,
      empresa: data.empresa || null,
      contexto_nome: data.contexto_nome || '',
      data_limite: data.data_limite,
      hora_limite: data.hora_limite || '',
      prioridade: data.prioridade || 'normal',
      status: data.status || 'pendente',
      repetir_ate_concluir: data.repetir_ate_concluir ?? true,
      origem: data.origem || 'pwa',
      usuario: data.usuario || pb.authStore.record?.id || null,
    })
  },

  async updateLembrete(
    id: string,
    data: Partial<CreateLembreteRapidoInput>,
  ): Promise<LembreteRapido> {
    return pb.collection('lembretes_rapidos').update<LembreteRapido>(id, data)
  },

  async concluirLembrete(id: string): Promise<LembreteRapido> {
    return pb.collection('lembretes_rapidos').update<LembreteRapido>(id, {
      status: 'concluido',
      concluido_em: new Date().toISOString(),
    })
  },

  async reabrirLembrete(id: string): Promise<LembreteRapido> {
    return pb.collection('lembretes_rapidos').update<LembreteRapido>(id, {
      status: 'pendente',
      concluido_em: null,
    })
  },

  async deleteLembrete(id: string): Promise<boolean> {
    return pb.collection('lembretes_rapidos').delete(id)
  },
}
