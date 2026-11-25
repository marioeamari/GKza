import pb from '@/lib/pocketbase/client'
import type {
  PrecKitRecord,
  PrecMatrizClassificacaoRecord,
  PrecPrecificacaoRecord,
  PrecProdutoRecord,
} from '@/types/precificacao'
import type { OrcamentoItemRecord, OrcamentoRecord } from '@/types/orcamento'
import type {
  TriagemFontes,
  TriagemOrcamentoInput,
  TriagemOrcamentoItemInput,
} from '@/lib/triagemModelo'

/**
 * Carrega (somente leitura) todas as fontes do painel de Triagem de Produtos.
 * Cálculo de status é feito no cliente a cada carregamento — sem nova coleção,
 * sem cache a manter.
 */
export async function carregarFontesTriagem(): Promise<{
  produtos: PrecProdutoRecord[]
  fontes: TriagemFontes
}> {
  const [produtos, produtosBase, cenarios, matriz, orcamentoItens, orcamentos, kits] =
    await Promise.all([
      pb.collection('prec_produtos').getFullList<PrecProdutoRecord>({ sort: 'nome' }),
      pb
        .collection('produtos_base')
        .getFullList<{ id: string; nome?: string }>({ fields: 'id,nome' }),
      pb.collection('prec_precificacoes').getFullList<PrecPrecificacaoRecord>({ expand: 'canal' }),
      pb.collection('prec_matriz_classificacoes').getFullList<PrecMatrizClassificacaoRecord>({
        expand: 'legenda',
      }),
      pb
        .collection('orcamento_itens')
        .getFullList<
          Pick<OrcamentoItemRecord, 'id' | 'orcamento' | 'produtos_canais' | 'quantidade'>
        >(),
      pb
        .collection('orcamentos')
        .getFullList<
          Pick<OrcamentoRecord, 'id' | 'codigo' | 'cliente_nome' | 'created' | 'status'>
        >(),
      pb.collection('prec_kits').getFullList<PrecKitRecord>({}),
    ])

  const basePorOrigem = new Map<string, { id: string; nome?: string }>()
  for (const b of produtosBase) basePorOrigem.set(b.id, { id: b.id, nome: b.nome })

  const canalNome = new Map<string, string>()
  const cenariosPorProduto = new Map<string, TriagemCenarioInputLite[]>()
  for (const c of cenarios) {
    if (c.canal && c.expand?.canal?.nome) canalNome.set(c.canal, c.expand.canal.nome)
    const arr = cenariosPorProduto.get(c.produto) || []
    arr.push({
      id: c.id,
      produto: c.produto,
      canal: c.canal,
      status: c.status,
      preco_aprovado: c.preco_aprovado,
      aprovado_em: c.aprovado_em,
      updated: c.updated,
      created: c.created,
      modalidade: c.modalidade,
    })
    cenariosPorProduto.set(c.produto, arr)
  }

  const matrizPorProduto = new Map<string, TriagemMatrizInputLite[]>()
  for (const m of matriz) {
    const arr = matrizPorProduto.get(m.produto) || []
    arr.push({
      id: m.id,
      canal: m.canal,
      legenda: m.legenda,
      expand: m.expand?.legenda
        ? { legenda: { ativo: m.expand.legenda?.ativo, nome: m.expand.legenda?.nome } }
        : undefined,
    })
    matrizPorProduto.set(m.produto, arr)
  }

  // orcamento_itens liga o PRODUTO VINCULADO ao produto comercial: o mapa
  // produtos_canais (JSON por canal) traz produto_id por canal de cada item —
  // produto recém-cadastrado sem pedido fica cinza (regra do usuário).
  const orcamentoItensPorProduto = new Map<string, TriagemOrcamentoItemInput[]>()
  const seenItem = new Set<string>()
  for (const it of orcamentoItens) {
    const vinculados = Object.values(it.produtos_canais || {})
    for (const vinc of vinculados) {
      const pid = vinc?.produto_id
      if (!pid) continue
      const key = `${it.id}:${pid}`
      if (seenItem.has(key)) continue
      seenItem.add(key)
      const arr = orcamentoItensPorProduto.get(pid) || []
      arr.push({ id: it.id, orcamento: it.orcamento, quantidade: it.quantidade })
      orcamentoItensPorProduto.set(pid, arr)
    }
  }

  const orcamentosPorId = new Map<string, TriagemOrcamentoInput>()
  for (const o of orcamentos) {
    orcamentosPorId.set(o.id, {
      id: o.id,
      codigo: o.codigo,
      cliente_nome: o.cliente_nome,
      created: o.created,
      status: o.status,
    })
  }

  const kitPorProdutoPai = new Map<
    string,
    { itens?: Array<{ produto_id?: string; qtd?: number }> }
  >()
  for (const k of kits) {
    if (k.produto_pai) kitPorProdutoPai.set(k.produto_pai, { itens: k.itens })
  }

  const nomeProdutoPorId = new Map<string, string>()
  for (const p of produtos) nomeProdutoPorId.set(p.id, p.nome)

  return {
    produtos,
    fontes: {
      basePorOrigem,
      canalNome,
      nomeProdutoPorId,
      cenariosPorProduto,
      matrizPorProduto,
      orcamentoItensPorProduto,
      orcamentosPorId,
      kitPorProdutoPai,
    },
  }
}

type TriagemCenarioInputLite = {
  id: string
  produto: string
  canal: string
  status: string
  preco_aprovado?: number
  aprovado_em?: string
  updated?: string
  created?: string
  modalidade?: string
}

type TriagemMatrizInputLite = {
  id: string
  canal: string
  legenda: string
  expand?: { legenda?: { ativo?: boolean; nome?: string } }
}
