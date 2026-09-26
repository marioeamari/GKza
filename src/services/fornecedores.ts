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

  saveProduto: (data: Partial<FornecedorProduto>, id?: string) =>
    id
      ? pb.collection<FornecedorProduto>('fornecedores_produtos').update(id, data)
      : pb.collection<FornecedorProduto>('fornecedores_produtos').create(data),

  deleteProduto: (id: string) => pb.collection('fornecedores_produtos').delete(id),
}
