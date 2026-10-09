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

  /**
   * Sincroniza o produto do fornecedor com prec_produtos (tipo revenda)
   * Busca por fornecedor_produto ou SKU antes de criar/atualizar (idempotente).
   */
  syncProdutoComPrecificacao: async (fornecedorProdutoId: string) => {
    // 1. Obter registro completo de fornecedores_produtos
    const fp = await pb
      .collection<FornecedorProduto>('fornecedores_produtos')
      .getOne(fornecedorProdutoId, { expand: 'fornecedor' })

    if (!fp) return null

    // Verificar se o fornecedor existe na coleção 'fornecedores' (nunca estabelecimentos)
    let isFornecedorRevenda = false
    try {
      const forn = await pb.collection('fornecedores').getOne(fp.fornecedor)
      if (forn) isFornecedorRevenda = true
    } catch {
      isFornecedorRevenda = false
    }

    if (!isFornecedorRevenda) {
      return null
    }

    // 2. Determinar SKU único
    const rawSku = (fp.sku_fornecedor || '').trim()
    const fallbackSku = 'REV-' + fp.id.toUpperCase()
    const skuDesejado = rawSku || fallbackSku

    // 3. Buscar espelho existente em prec_produtos por fornecedor_produto ou por sku
    let precExistente: any = null
    try {
      const porFp = await pb.collection('prec_produtos').getList(1, 1, {
        filter: `fornecedor_produto = "${fp.id}"`,
      })
      if (porFp.items.length > 0) {
        precExistente = porFp.items[0]
      } else if (rawSku) {
        const porSku = await pb.collection('prec_produtos').getList(1, 1, {
          filter: `sku = "${rawSku.replace(/"/g, '\\"')}"`,
        })
        if (porSku.items.length > 0) {
          precExistente = porSku.items[0]
        }
      }
    } catch (e) {
      console.warn('[syncProdutoComPrecificacao] Erro ao consultar espelho existente:', e)
    }

    const precoCusto = Number(fp.preco_custo_unitario) || 0
    const precoUltima = Number(fp.preco_ultima_compra) || 0
    const custoAquisicao = precoCusto > 0 ? precoCusto : precoUltima > 0 ? precoUltima : 0

    const payload: Record<string, any> = {
      nome: (fp.descricao || '').trim() || 'Produto Fornecedor',
      tipo: 'revenda',
      custo_aquisicao_unitario: custoAquisicao,
      fornecedor: fp.fornecedor,
      fornecedor_produto: fp.id,
      marca: fp.marca || '',
      categoria: fp.categoria || '',
      unidade: fp.unidade || 'un',
      dimensao_comprimento_cm: Number(fp.comprimento_cm) || 0,
      dimensao_largura_cm: Number(fp.largura_cm) || 0,
      dimensao_altura_cm: Number(fp.altura_cm) || 0,
      peso_g: Number(fp.peso_g) || 0,
      embalagem: fp.embalagem || '',
      codigo_barras: fp.codigo_barras || '',
      status: fp.ativo !== false ? 'ativo' : 'inativo',
    }

    let precSalvo: any = null
    if (precExistente) {
      // Se não tinha fornecedor_produto preenchido e estamos vinculando agora
      payload.sku = precExistente.sku || skuDesejado
      precSalvo = await pb.collection('prec_produtos').update(precExistente.id, payload)
    } else {
      // Garantir SKU livre se colidir
      let finalSku = skuDesejado
      let counter = 1
      while (true) {
        try {
          const colide = await pb.collection('prec_produtos').getList(1, 1, {
            filter: `sku = "${finalSku.replace(/"/g, '\\"')}"`,
          })
          if (colide.items.length === 0) break
          finalSku = `${skuDesejado}-${counter}`
          counter++
        } catch {
          break
        }
      }
      payload.sku = finalSku

      // Se houver empresa padrão, vincula
      try {
        const empresas = await pb.collection('empresas').getList(1, 1, { sort: 'created' })
        if (empresas.items.length > 0) {
          payload.empresa = empresas.items[0].id
        }
      } catch {
        /* intentionally ignored */
      }

      precSalvo = await pb.collection('prec_produtos').create(payload)
    }

    // 4. Copiar imagem se houver
    if (fp.imagem && precSalvo?.id) {
      try {
        const { precificacaoService } = await import('@/services/precificacao')
        await precificacaoService.copiarImagemDeFornecedorProduto(precSalvo.id, {
          id: fp.id,
          imagem: fp.imagem,
        })
      } catch (e) {
        console.warn('[syncProdutoComPrecificacao] Falha ao copiar imagem:', e)
      }
    }

    return precSalvo
  },

  deleteProduto: (id: string) => pb.collection('fornecedores_produtos').delete(id),

  getProdutoImageUrl: (record: { id: string; imagem?: string }, thumb?: string) => {
    if (!record.imagem) return ''
    const baseUrl = import.meta.env.VITE_POCKETBASE_URL || ''
    const query = thumb ? `?thumb=${thumb}` : ''
    return `${baseUrl}/api/files/fornecedores_produtos/${record.id}/${record.imagem}${query}`
  },
}
