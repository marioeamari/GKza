import type { PrecProdutoRecord, PrecKitRecord } from '@/types/precificacao'
import type { ProdutoBaseRecord } from '@/types/domain'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'
import { calcularCustoBaseProduto } from '@/lib/precificacao/calculo'

export interface ItemPrincipalOpcao {
  id: string // Identificador único na UI (ex: "comp_xyz" ou "base_xyz")
  rawId: string // ID original no PocketBase
  origem: 'composto' | 'produto_base'
  nome: string
  sku: string
  tipoLabel: string
  custoUnitario: number
  peso_g?: number
  dimensao_comprimento_cm?: number
  dimensao_largura_cm?: number
  dimensao_altura_cm?: number
  imagem?: string
  empresa?: string
  fornecedorNome?: string
  rawComposto?: PrecProdutoRecord
  rawBase?: ProdutoBaseRecord
}

/**
 * Validação de item principal para Kits e Combos:
 * - Aceita: Produto Composto (fabricação própria, revenda, kit)
 * - Aceita: Produto Base APENAS com tipo === 'revenda'
 * - REJEITA estritamente: insumo, embalagem, servico, etiqueta, tecido, pintura, costura, outro
 */
export function isItemPrincipalPermitido(
  item: { tipo?: string; origem?: 'composto' | 'produto_base' },
  contexto: 'kit' | 'combo' = 'kit',
): boolean {
  if (item.origem === 'produto_base') {
    // Apenas produto base com tipo 'revenda' é aceito como item principal
    return item.tipo === 'revenda'
  }

  // Produto composto (prec_produtos)
  if (contexto === 'kit') {
    return item.tipo === 'fabricacao_propria' || item.tipo === 'revenda'
  }

  // Combo aceita também outros kits (kit dentro de combo)
  return item.tipo === 'fabricacao_propria' || item.tipo === 'revenda' || item.tipo === 'kit'
}

/**
 * Filtra e consolida as opções de Item Principal para Kits e Combos:
 * Retorna produtos compostos + produtos_base com tipo='revenda'.
 * NUNCA retorna insumos, embalagens, etiquetas ou serviços aqui.
 */
export function buildItensPrincipaisOpcoes(params: {
  produtosCompostos: PrecProdutoRecord[]
  produtosBase: ProdutoBaseRecord[]
  idAtualParaExcluir?: string
  contexto?: 'kit' | 'combo'
  kitsMap?: Record<string, PrecKitRecord>
}): ItemPrincipalOpcao[] {
  const contexto = params.contexto || 'kit'
  const opcoes: ItemPrincipalOpcao[] = []

  // 1. Produtos Compostos permitidos
  for (const p of params.produtosCompostos || []) {
    if (params.idAtualParaExcluir && p.id === params.idAtualParaExcluir) continue

    // Produtos compostos inativos (ou sombras órfãs desativadas) NUNCA aparecem nos seletores de Kit/Combo
    if (p.status === 'inativo') continue

    const permitido = isItemPrincipalPermitido({ tipo: p.tipo, origem: 'composto' }, contexto)
    if (!permitido) continue

    let custo = 0
    if (p.tipo === 'kit' && params.kitsMap?.[p.id]) {
      const kRec = params.kitsMap[p.id]
      custo = calcularCustoBaseProduto({
        ...p,
        kit_itens: kRec.itens?.map((it) => ({
          produto_id: it.produto_id,
          nome: it.nome,
          qtd_efetiva: it.qtd_efetiva,
          custo_unitario: it.custo_unitario,
        })),
        kit_custos_adicionais: kRec.custos_adicionais,
      }).custo_total
    } else {
      custo = calcularCustoBaseProduto(p).custo_total
    }

    const labelTipo =
      p.tipo === 'fabricacao_propria'
        ? 'Produto Composto (Fabricação)'
        : p.tipo === 'revenda'
          ? 'Produto Composto (Revenda)'
          : 'Kit Composto'

    opcoes.push({
      id: `comp_${p.id}`,
      rawId: p.id,
      origem: 'composto',
      nome: p.nome,
      sku: p.sku || '',
      tipoLabel: labelTipo,
      custoUnitario: custo,
      peso_g: p.peso_g,
      dimensao_comprimento_cm: p.dimensao_comprimento_cm,
      dimensao_largura_cm: p.dimensao_largura_cm,
      dimensao_altura_cm: p.dimensao_altura_cm,
      imagem: p.imagem,
      empresa: p.empresa,
      rawComposto: p,
    })
  }

  // 2. Produtos Base APENAS com tipo === 'revenda'
  for (const b of params.produtosBase || []) {
    if (b.tipo !== 'revenda') {
      // Insumos, embalagens, etiquetas e serviços NÃO entram como item principal
      continue
    }

    opcoes.push({
      id: `base_${b.id}`,
      rawId: b.id,
      origem: 'produto_base',
      nome: b.nome,
      sku: b.sku || '',
      tipoLabel: 'Produto Base (Revenda)',
      custoUnitario: Number(b.custo_unitario) || 0,
      peso_g: b.peso_g,
      dimensao_comprimento_cm: b.dimensao_comprimento_cm,
      dimensao_largura_cm: b.dimensao_largura_cm,
      dimensao_altura_cm: b.dimensao_altura_cm,
      imagem: b.imagem,
      fornecedorNome: b.expand?.fornecedor?.nome_fantasia || b.expand?.fornecedor?.razao_social,
      rawBase: b,
    })
  }

  // Ordenar alfabeticamente por nome
  return opcoes.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

/**
 * Verifica se a composição analítica já possui item de categoria Embalagem.
 * Usado para aplicar a regra vigente de não duplicar custo_embalagem legado.
 */
export function temLinhaEmbalagemNaComposicao(composicao?: ItemComposicaoCusto[]): boolean {
  if (!Array.isArray(composicao)) return false
  return composicao.some((item) => {
    const catCusto = (item.categoria_custo || '').toLowerCase()
    const catNome = (item.categoria_nome || '').toLowerCase()
    const desc = (item.descricao || '').toLowerCase()
    return (
      catCusto === 'embalagem' ||
      catNome === 'embalagem' ||
      catCusto.includes('embalagem') ||
      catNome.includes('embalagem') ||
      desc.includes('saco plastico') ||
      desc.includes('saco plástico') ||
      desc.includes('embalagem')
    )
  })
}

/**
 * Calcula o custo analítico total de um Kit:
 * = soma dos componentes (qtd * unitário)
 * + soma das linhas da composição analítica
 * + custo de embalagem legado (zerado se composição já contiver embalagem)
 * + custo de etiqueta legado
 */
export function calcularCustoTotalKit(params: {
  custoComponenteUnitario: number
  quantidadeComponente: number
  perdaComponente?: number
  composicao?: ItemComposicaoCusto[]
  custoEmbalagemLegado?: number
  custoEtiquetaLegado?: number
  perda_pct?: number
}): {
  custoComponentes: number
  quantidadeEfetiva: number
  custoComposicao: number
  custoEmbalagemEfetivo: number
  custoEtiquetaEfetivo: number
  custoTotal: number
} {
  const qNominal = Math.max(0.01, Number(params.quantidadeComponente) || 1)
  const perdaCompPct = Math.max(0, Number(params.perdaComponente) || 0)
  const qEfetiva = qNominal * (1 + perdaCompPct / 100)
  const custoComponentes = Math.max(0, params.custoComponenteUnitario) * qEfetiva

  const res = calcularCustoTotalConsolidado({
    custoBaseItens: custoComponentes,
    temPerdaNosItensPrincipais: perdaCompPct > 0,
    composicao: params.composicao,
    custoEmbalagemLegado: params.custoEmbalagemLegado,
    custoEtiquetaLegado: params.custoEtiquetaLegado,
    perda_pct: params.perda_pct,
  })

  return {
    ...res,
    quantidadeEfetiva: qEfetiva,
  }
}

/**
 * Calcula o custo consolidado para Combo ou Kit:
 * = soma dos componentes principais (com perda por linha se houver)
 * + soma das linhas da composição analítica (com perda por linha se houver)
 * + perda global sobre o custo direto total (se nenhuma linha tiver perda própria)
 * + custo de embalagem legado (zerado se composição já contiver embalagem)
 * + custo de etiqueta legado
 */
export function calcularCustoTotalConsolidado(params: {
  custoBaseItens: number
  temPerdaNosItensPrincipais?: boolean
  composicao?: ItemComposicaoCusto[]
  custoEmbalagemLegado?: number
  custoEtiquetaLegado?: number
  perda_pct?: number
}): {
  custoComponentes: number
  custoComposicao: number
  custoEmbalagemEfetivo: number
  custoEtiquetaEfetivo: number
  custoTotal: number
} {
  const custoComponentes = Math.max(0, params.custoBaseItens)

  let somaLinhas = 0
  let temPerdaNaComposicao = false
  if (Array.isArray(params.composicao)) {
    for (const item of params.composicao) {
      const q = Number(item.qtd) || 0
      const u = Number(item.custo_unitario) || 0
      const perdaItemPct = Number(item.perda_pct) || 0
      if (perdaItemPct > 0) {
        temPerdaNaComposicao = true
      }
      const perda = perdaItemPct / 100
      somaLinhas += q * (1 + perda) * u
    }
  }

  const temPerdaNaLinha = Boolean(params.temPerdaNosItensPrincipais) || temPerdaNaComposicao

  // Precedência da linha: perda global só incide se NENHUMA linha tiver perda própria.
  // Aplica sobre o custo direto total (componentes + linhas analíticas).
  const perdaGlobalPct = Number(params.perda_pct) || 0
  let custoDiretoTotal = custoComponentes + somaLinhas
  if (!temPerdaNaLinha && perdaGlobalPct > 0) {
    custoDiretoTotal = custoDiretoTotal * (1 + perdaGlobalPct / 100)
  }

  const temEmb = temLinhaEmbalagemNaComposicao(params.composicao)
  const custoEmbalagemEfetivo = temEmb ? 0 : Math.max(0, Number(params.custoEmbalagemLegado) || 0)
  const custoEtiquetaEfetivo = Math.max(0, Number(params.custoEtiquetaLegado) || 0)

  const custoComposicao = Math.round((somaLinhas + Number.EPSILON) * 100) / 100
  const custoTotal =
    Math.round(
      (custoDiretoTotal + custoEmbalagemEfetivo + custoEtiquetaEfetivo + Number.EPSILON) * 100,
    ) / 100

  return {
    custoComponentes: Math.round((custoComponentes + Number.EPSILON) * 100) / 100,
    custoComposicao,
    custoEmbalagemEfetivo,
    custoEtiquetaEfetivo,
    custoTotal,
  }
}
