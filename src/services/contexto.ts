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
    try {
      return await pb.collection('contexto_grupo_membros').delete(membroId)
    } catch (err: any) {
      // Se já foi removido (404), trata como sucesso idempotente
      if (err?.status === 404 || err?.response?.status === 404) {
        return true
      }
      throw err
    }
  },

  listMembrosByConta: async (contaId: string): Promise<ContextoGrupoMembro[]> => {
    return pb.collection<ContextoGrupoMembro>('contexto_grupo_membros').getFullList({
      filter: `tipo = 'conta' && conta = '${contaId}'`,
    })
  },

  syncContaGrupos: async (contaId: string, targetGrupoIds: string[]): Promise<void> => {
    const existing = await contextoService.listMembrosByConta(contaId)
    const existingGrupoIds = new Set(existing.map((m) => m.grupo))
    const targetSet = new Set(targetGrupoIds)

    // Remove do grupo se não estiver nos alvos
    const toRemove = existing.filter((m) => !targetSet.has(m.grupo))
    for (const m of toRemove) {
      await contextoService.removeMembro(m.id)
    }

    // Adiciona nos novos grupos
    const toAdd = targetGrupoIds.filter((gid) => !existingGrupoIds.has(gid))
    for (const gid of toAdd) {
      await contextoService.addMembro(gid, 'conta', contaId)
    }
  },

  /**
   * Vincula uma conta a um grupo específico caso ainda não esteja vinculada (idempotente).
   */
  linkContaToGrupo: async (
    contaId: string,
    grupoId: string,
  ): Promise<ContextoGrupoMembro | null> => {
    if (!contaId || !grupoId) return null
    const existing = await pb
      .collection<ContextoGrupoMembro>('contexto_grupo_membros')
      .getFullList({
        filter: `grupo = '${grupoId}' && tipo = 'conta' && conta = '${contaId}'`,
      })
    if (existing.length > 0) {
      return existing[0]
    }
    return contextoService.addMembro(grupoId, 'conta', contaId)
  },

  /**
   * Vincula uma empresa a um grupo específico caso ainda não esteja vinculada (idempotente).
   */
  linkEmpresaToGrupo: async (
    empresaId: string,
    grupoId: string,
  ): Promise<ContextoGrupoMembro | null> => {
    if (!empresaId || !grupoId) return null
    const existing = await pb
      .collection<ContextoGrupoMembro>('contexto_grupo_membros')
      .getFullList({
        filter: `grupo = '${grupoId}' && tipo = 'empresa' && empresa = '${empresaId}'`,
      })
    if (existing.length > 0) {
      return existing[0]
    }
    return contextoService.addMembro(grupoId, 'empresa', empresaId)
  },

  /**
   * Vincula uma pessoa a um grupo específico caso ainda não esteja vinculada (idempotente).
   */
  linkPessoaToGrupo: async (
    pessoaId: string,
    grupoId: string,
  ): Promise<ContextoGrupoMembro | null> => {
    if (!pessoaId || !grupoId) return null
    const existing = await pb
      .collection<ContextoGrupoMembro>('contexto_grupo_membros')
      .getFullList({
        filter: `grupo = '${grupoId}' && tipo = 'pessoa' && pessoa = '${pessoaId}'`,
      })
    if (existing.length > 0) {
      return existing[0]
    }
    return contextoService.addMembro(grupoId, 'pessoa', pessoaId)
  },
}
