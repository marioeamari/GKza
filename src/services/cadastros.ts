import pb from '@/lib/pocketbase/client'
import type { Empresa, Pessoa } from '@/types/domain'

export const cadastrosService = {
  listEmpresas: () => pb.collection<Empresa>('empresas').getFullList({ sort: 'nome_fantasia' }),
  saveEmpresa: (data: Partial<Empresa>, id?: string) =>
    id
      ? pb.collection<Empresa>('empresas').update(id, data)
      : pb.collection<Empresa>('empresas').create(data),
  deleteEmpresa: (id: string) => pb.collection('empresas').delete(id),
  listPessoas: () => pb.collection<Pessoa>('pessoas').getFullList({ sort: 'nome' }),
  savePessoa: (data: Partial<Pessoa>, id?: string) =>
    id
      ? pb.collection<Pessoa>('pessoas').update(id, data)
      : pb.collection<Pessoa>('pessoas').create(data),
  deletePessoa: (id: string) => pb.collection('pessoas').delete(id),
}
