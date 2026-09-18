import pb from '@/lib/pocketbase/client'
import type {
  Conta,
  ContextoGrupo,
  ContextoGrupoComMembros,
  ContextoGrupoMembro,
  ContextoMembroTipo,
  Empresa,
  Pessoa,
} from '@/types/domain'

export const contextoService = {
  listGrupos: async (): Promise<ContextoGrupo[]> => {
    return pb.collection<ContextoGrupo>('contexto_grupos').getFullList({
      sort: 'ordem,nome',
    })
  },

  getGrupoById: async (id: string): Promise<ContextoGrupo> => {
    return pb.collection<ContextoGrupo>('contexto_grupos').getOne(id)
  },

  saveGrupo: async (data: Partial<ContextoGrupo>, id?: string): Promise<ContextoGrupo> => {
    if (id) {
      return pb.collection<ContextoGrupo>('contexto_grupos').update(id, data)
    }
    return pb.collection<ContextoGrupo>('contexto_grupos').create(data)
  },

  deleteGrupo: async (id: string): Promise<boolean> => {
    return pb.collection('contexto_grupos').delete(id)
  },

  listMembrosByGrupo: async (grupoId: string): Promise<ContextoGrupoMembro[]> => {
    return pb.collection<ContextoGrupoMembro>('contexto_grupo_membros').getFullList({
      filter: `grupo = '${grupoId}'`,
      expand: 'pessoa,empresa,conta',
    })
  },

  listAllMembros: async (): Promise<ContextoGrupoMembro[]> => {
    return pb.collection<ContextoGrupoMembro>('contexto_grupo_membros').getFullList({
      expand: 'pessoa,empresa,conta',
    })
  },

  listGruposComMembros: async (): Promise<ContextoGrupoComMembros[]> => {
    const [grupos, membros] = await Promise.all([
      contextoService.listGrupos(),
      contextoService.listAllMembros(),
    ])

    return grupos.map((g) => {
      const gMembros = membros.filter((m) => m.grupo === g.id)
      const pessoas: Pessoa[] = []
      const empresas: Empresa[] = []
      const contas: Conta[] = []

      for (const m of gMembros) {
        if (m.tipo === 'pessoa' && m.expand?.pessoa) {
          pessoas.push(m.expand.pessoa)
        } else if (m.tipo === 'empresa' && m.expand?.empresa) {
          empresas.push(m.expand.empresa)
        } else if (m.tipo === 'conta' && m.expand?.conta) {
          contas.push(m.expand.conta)
        }
      }

      return {
        ...g,
        membros: gMembros,
        pessoas,
        empresas,
        contas,
      }
    })
  },

  addMembro: async (
    grupoId: string,
    tipo: ContextoMembroTipo,
    refId: string,
  ): Promise<ContextoGrupoMembro> => {
    const payload: Partial<ContextoGrupoMembro> = {
      grupo: grupoId,
      tipo,
      [tipo]: refId,
    }
    return pb.collection<ContextoGrupoMembro>('contexto_grupo_membros').create(payload)
  },

  removeMembro: async (membroId: string): Promise<boolean> => {
    return pb.collection('contexto_grupo_membros').delete(membroId)
  },
}
