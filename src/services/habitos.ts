import pb from '@/lib/pocketbase/client'
import type { MetaHabito, MetaHabitoRegistro, HabitoStatusRegistro } from '@/types/domain'

export interface CreateHabitoInput {
  nome: string
  descricao?: string
  contexto_tipo: 'pessoal' | 'empresa'
  pessoa?: string
  empresa?: string
  dias_semana: number[]
  horario?: string
  data_inicio: string
  ativo?: boolean
  cor?: string
}

export const habitosService = {
  async listHabitos(filter?: string): Promise<MetaHabito[]> {
    return pb.collection('metas_habitos').getFullList<MetaHabito>({
      filter,
      sort: '-created',
      expand: 'pessoa,empresa',
    })
  },

  async getHabito(id: string): Promise<MetaHabito> {
    return pb.collection('metas_habitos').getOne<MetaHabito>(id, {
      expand: 'pessoa,empresa',
    })
  },

  async createHabito(data: CreateHabitoInput): Promise<MetaHabito> {
    return pb.collection('metas_habitos').create<MetaHabito>({
      ...data,
      ativo: data.ativo ?? true,
    })
  },

  async updateHabito(id: string, data: Partial<CreateHabitoInput>): Promise<MetaHabito> {
    return pb.collection('metas_habitos').update<MetaHabito>(id, data)
  },

  async deleteHabito(id: string): Promise<boolean> {
    return pb.collection('metas_habitos').delete(id)
  },

  async listRegistros(filtroOuMes: {
    habitoId?: string
    anoMes?: string
    data?: string
  }): Promise<MetaHabitoRegistro[]> {
    const filters: string[] = []
    if (filtroOuMes.habitoId) filters.push(`habito = '${filtroOuMes.habitoId}'`)
    if (filtroOuMes.data) filters.push(`data = '${filtroOuMes.data}'`)
    if (filtroOuMes.anoMes) filters.push(`data ~ '${filtroOuMes.anoMes}'`)

    return pb.collection('metas_habitos_registros').getFullList<MetaHabitoRegistro>({
      filter: filters.join(' && '),
      sort: '-data',
      expand: 'habito',
    })
  },

  async setRegistro(
    habitoId: string,
    data: string,
    status: HabitoStatusRegistro,
    observacao?: string,
  ): Promise<MetaHabitoRegistro> {
    // Procura registro existente daquela data e hábito
    const existing = await pb
      .collection('metas_habitos_registros')
      .getList<MetaHabitoRegistro>(1, 1, {
        filter: `habito = '${habitoId}' && data = '${data}'`,
      })

    if (existing.items.length > 0) {
      return pb
        .collection('metas_habitos_registros')
        .update<MetaHabitoRegistro>(existing.items[0].id, {
          status,
          observacao: observacao ?? existing.items[0].observacao,
        })
    }

    return pb.collection('metas_habitos_registros').create<MetaHabitoRegistro>({
      habito: habitoId,
      data,
      status,
      observacao,
    })
  },
}
