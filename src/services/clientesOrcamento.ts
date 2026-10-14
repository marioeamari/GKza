import pb from '@/lib/pocketbase/client'
import { ClienteOrcamentoRecord } from '@/types/orcamento'

export const clientesOrcamentoService = {
  /**
   * Lista todos os clientes do módulo de orçamentos ordenados por nome
   */
  async listClientes(busca?: string): Promise<ClienteOrcamentoRecord[]> {
    let filter = ''
    if (busca && busca.trim()) {
      const termo = busca.trim().replace(/"/g, '\\"')
      filter = `nome ~ "${termo}" || documento ~ "${termo}" || whatsapp ~ "${termo}" || telefone ~ "${termo}" || email ~ "${termo}"`
    }

    return pb.collection('clientes').getFullList<ClienteOrcamentoRecord>({
      filter,
      sort: 'nome',
    })
  },

  /**
   * Busca um cliente pelo ID
   */
  async getCliente(id: string): Promise<ClienteOrcamentoRecord> {
    return pb.collection('clientes').getOne<ClienteOrcamentoRecord>(id)
  },

  /**
   * Cria um cliente (PF ou PJ)
   */
  async createCliente(
    data: Omit<ClienteOrcamentoRecord, 'id' | 'created' | 'updated'>,
  ): Promise<ClienteOrcamentoRecord> {
    return pb.collection('clientes').create<ClienteOrcamentoRecord>({
      nome: data.nome.trim(),
      tipo: data.tipo,
      documento: data.documento?.trim() || '',
      whatsapp: data.whatsapp?.trim() || '',
      email: data.email?.trim() || '',
      telefone: data.telefone?.trim() || '',
      observacoes: data.observacoes?.trim() || '',
    })
  },

  /**
   * Atualiza dados do cliente
   */
  async updateCliente(
    id: string,
    data: Partial<Omit<ClienteOrcamentoRecord, 'id' | 'created' | 'updated'>>,
  ): Promise<ClienteOrcamentoRecord> {
    const payload: Record<string, unknown> = {}
    if (data.nome !== undefined) payload.nome = data.nome.trim()
    if (data.tipo !== undefined) payload.tipo = data.tipo
    if (data.documento !== undefined) payload.documento = data.documento.trim()
    if (data.whatsapp !== undefined) payload.whatsapp = data.whatsapp.trim()
    if (data.email !== undefined) payload.email = data.email.trim()
    if (data.telefone !== undefined) payload.telefone = data.telefone.trim()
    if (data.observacoes !== undefined) payload.observacoes = data.observacoes.trim()

    return pb.collection('clientes').update<ClienteOrcamentoRecord>(id, payload)
  },

  /**
   * Exclui um cliente
   */
  async deleteCliente(id: string): Promise<boolean> {
    return pb.collection('clientes').delete(id)
  },
}
