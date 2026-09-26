import pb from '@/lib/pocketbase/client'
import type { Fornecedor, FornecedorProduto } from '@/types/domain'

export const fornecedoresService = {
  // Fornecedores
  listFornecedores: () =>
    pb.collection<Fornecedor>('fornecedores').getFullList({ sort: 'nome_fantasia' }),

  getFornecedor: (id: string) => pb.collection<Fornecedor>('fornecedores').getOne(id),

  saveFornecedor: (data: Partial<Fornecedor>, id?: string) =>
    id
      ? pb.collection<Fornecedor>('fornecedores').update(id, data)
      : pb.collection<Fornecedor>('fornecedores').create(data),

  deleteFornecedor: (id: string) => pb.collection('fornecedores').delete(id),

  // Produtos fornecidos (fornecedores_produtos)
  listProdutosPorFornecedor: (fornecedorId: string) =>
    pb.collection<FornecedorProduto>('fornecedores_produtos').getFullList({
      filter: `fornecedor = "${fornecedorId}"`,
      sort: 'descricao',
      expand: 'fornecedor',
    }),

  listTodosProdutos: () =>
    pb.collection<FornecedorProduto>('fornecedores_produtos').getFullList({
      sort: 'descricao',
      expand: 'fornecedor',
    }),

  saveProduto: (data: Partial<FornecedorProduto> | FormData, id?: string) =>
    id
      ? pb.collection<FornecedorProduto>('fornecedores_produtos').update(id, data)
      : pb.collection<FornecedorProduto>('fornecedores_produtos').create(data),

  deleteProduto: (id: string) => pb.collection('fornecedores_produtos').delete(id),

  getProdutoImageUrl: (record: { id: string; imagem?: string }, thumb?: string) => {
    if (!record.imagem) return ''
    const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
    const query = thumb ? `?thumb=${thumb}` : ''
    return `${baseUrl}/api/files/fornecedores_produtos/${record.id}/${record.imagem}${query}`
  },
}
