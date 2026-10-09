/**
 * Regras de classificação entre Fornecedores (revenda) e Estabelecimentos (consumo/despesa):
 * 1. Quem tem produtos em fornecedores_produtos fica em fornecedores.
 * 2. Quem não tem produtos migra para estabelecimentos (copia e remove de fornecedores).
 * 3. Se um fornecedor tiver produtos mas também constar em despesas de consumo (dois contextos),
 *    duplica: cria em estabelecimentos e mantém em fornecedores.
 */

export interface FornecedorRaw {
  id: string
  nome_fantasia?: string
  razao_social?: string
}

export interface ClassificacaoResult {
  migramParaEstabelecimentos: Array<{
    id: string
    nome: string
    apelido?: string
  }>
  permanecemEmFornecedores: Array<{
    id: string
    nome: string
  }>
  duplicadosEmAmbos: Array<{
    id: string
    nome: string
  }>
  removidosDeFornecedores: string[]
}

export function classificarFornecedoresEEstabelecimentos(params: {
  fornecedores: FornecedorRaw[]
  fornecedorIdsComProdutos: Set<string>
  nomesCitadosEmDespesas: Set<string>
}): ClassificacaoResult {
  const { fornecedores, fornecedorIdsComProdutos, nomesCitadosEmDespesas } = params

  const migramParaEstabelecimentos: ClassificacaoResult['migramParaEstabelecimentos'] = []
  const permanecemEmFornecedores: ClassificacaoResult['permanecemEmFornecedores'] = []
  const duplicadosEmAmbos: ClassificacaoResult['duplicadosEmAmbos'] = []
  const removidosDeFornecedores: string[] = []

  for (const f of fornecedores) {
    const nomeFantasia = (f.nome_fantasia || f.razao_social || '').trim()
    const razaoSocial = (f.razao_social || '').trim()
    const temProdutos = fornecedorIdsComProdutos.has(f.id)

    const citadoEmDespesa =
      nomesCitadosEmDespesas.has(nomeFantasia.toLowerCase()) ||
      nomesCitadosEmDespesas.has(razaoSocial.toLowerCase())

    const nomeFinal = nomeFantasia || razaoSocial || 'Estabelecimento'
    const apelidoFinal = razaoSocial && razaoSocial !== nomeFantasia ? razaoSocial : undefined

    if (temProdutos && citadoEmDespesa) {
      // Dois contextos: duplica em estabelecimentos e mantém em fornecedores
      duplicadosEmAmbos.push({ id: f.id, nome: nomeFinal })
      migramParaEstabelecimentos.push({ id: f.id, nome: nomeFinal, apelido: apelidoFinal })
      permanecemEmFornecedores.push({ id: f.id, nome: nomeFinal })
    } else if (temProdutos && !citadoEmDespesa) {
      // Só produtos de revenda: permanece em fornecedores
      permanecemEmFornecedores.push({ id: f.id, nome: nomeFinal })
    } else {
      // Sem produtos de revenda: migra para estabelecimentos e é removido de fornecedores
      migramParaEstabelecimentos.push({ id: f.id, nome: nomeFinal, apelido: apelidoFinal })
      removidosDeFornecedores.push(f.id)
    }
  }

  return {
    migramParaEstabelecimentos,
    permanecemEmFornecedores,
    duplicadosEmAmbos,
    removidosDeFornecedores,
  }
}
