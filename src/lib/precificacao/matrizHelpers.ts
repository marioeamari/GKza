import {
  PrecCanalRecord,
  PrecCategoriaProdutoRecord,
  PrecMatrizClassificacaoRecord,
  PrecMatrizLegendaRecord,
  PrecProdutoRecord,
} from '@/types/precificacao'

export interface PrecoAprovadoModalidadeInfo {
  modalidade_id: string
  modalidade_nome: string
  preco_aprovado: number
  status: string
  precificacao_id: string
  aprovado_em?: string
  updated?: string
  created?: string
}

export interface PrecoAprovadoCanalInfo {
  preco_aprovado: number
  status: string
  precificacao_id: string
  canal_id: string
  modalidade_id?: string
  modalidade_nome?: string
  modalidades_disponiveis?: PrecoAprovadoModalidadeInfo[]
}

export interface GrupoProdutosCategoria {
  id: string
  nome: string
  cor?: string
  isSemCategoria?: boolean
  produtos: PrecProdutoRecord[]
}

export interface CelulaMatrizInfo {
  produtoId: string
  canalId: string
  classificacao?: PrecMatrizClassificacaoRecord
  legenda?: PrecMatrizLegendaRecord
  precoInfo?: PrecoAprovadoCanalInfo
  modalidadeEscolhidaId?: string
  modalidadeEscolhidaNome?: string
  modalidadeEfetivaNome?: string
  isEscolhaManual: boolean
  modalidadesDisponiveis: PrecoAprovadoModalidadeInfo[]
}

/**
 * Normaliza qualquer valor que deva ser lista vindo do PocketBase ou estado.
 * Previne o bug conhecido de `.map is not a function`.
 */
export function normalizarLista<T>(val: unknown): T[] {
  if (Array.isArray(val)) return val
  if (val && typeof val === 'object' && Array.isArray((val as { items?: unknown }).items)) {
    return (val as { items: T[] }).items
  }
  return []
}

/**
 * Agrupa os produtos da matriz pelas categorias cadastradas,
 * colocando produtos sem categoria (ou categoria não encontrada)
 * em um grupo final intitulado "Sem categoria".
 */
export function agruparProdutosPorCategoria(
  produtos: PrecProdutoRecord[],
  categorias: PrecCategoriaProdutoRecord[],
): GrupoProdutosCategoria[] {
  const prods = normalizarLista<PrecProdutoRecord>(produtos)
  const cats = normalizarLista<PrecCategoriaProdutoRecord>(categorias)

  // Mapear categorias por id e por nome (case-insensitive)
  const catPorId = new Map<string, PrecCategoriaProdutoRecord>()
  const catPorNome = new Map<string, PrecCategoriaProdutoRecord>()

  cats.forEach((c) => {
    if (c.id) catPorId.set(c.id, c)
    if (c.nome) catPorNome.set(c.nome.trim().toLowerCase(), c)
  })

  // Agrupadores de produtos
  const mapaGrupos = new Map<string, PrecProdutoRecord[]>()
  cats.forEach((c) => {
    mapaGrupos.set(c.id, [])
  })
  const semCategoriaProds: PrecProdutoRecord[] = []

  for (const p of prods) {
    const rawCat = (p.categoria || '').trim()
    let encontrada: PrecCategoriaProdutoRecord | undefined

    if (rawCat) {
      encontrada = catPorId.get(rawCat) || catPorNome.get(rawCat.toLowerCase())
    }

    if (encontrada && mapaGrupos.has(encontrada.id)) {
      mapaGrupos.get(encontrada.id)!.push(p)
    } else {
      semCategoriaProds.push(p)
    }
  }

  const resultado: GrupoProdutosCategoria[] = []

  // Preservar a ordem das categorias
  for (const c of cats) {
    const itens = mapaGrupos.get(c.id) || []
    if (itens.length > 0) {
      resultado.push({
        id: c.id,
        nome: c.nome,
        cor: c.cor || '#0284C7',
        isSemCategoria: false,
        produtos: itens,
      })
    }
  }

  // Grupo final "Sem categoria" se houver produtos órfãos
  if (semCategoriaProds.length > 0) {
    resultado.push({
      id: '__sem_categoria__',
      nome: 'Sem categoria',
      cor: '#6B7280',
      isSemCategoria: true,
      produtos: semCategoriaProds,
    })
  }

  return resultado
}

/**
 * Filtra produtos pelo texto de busca (SKU ou Nome/Referência) e categoria opcional.
 */
export function filtrarProdutosMatriz(
  produtos: PrecProdutoRecord[],
  busca: string,
  categoriaFiltro?: string,
): PrecProdutoRecord[] {
  const prods = normalizarLista<PrecProdutoRecord>(produtos)
  const termo = busca.trim().toLowerCase()
  const catFiltroLimpa = (categoriaFiltro || '').trim()

  return prods.filter((p) => {
    if (catFiltroLimpa && catFiltroLimpa !== 'todas') {
      if (catFiltroLimpa === '__sem_categoria__') {
        if (p.categoria && p.categoria.trim() !== '') return false
      } else {
        const catProd = (p.categoria || '').trim().toLowerCase()
        if (catProd !== catFiltroLimpa.toLowerCase() && p.categoria !== catFiltroLimpa) {
          return false
        }
      }
    }

    if (!termo) return true

    const skuMatch = (p.sku || '').toLowerCase().includes(termo)
    const nomeMatch = (p.nome || '').toLowerCase().includes(termo)
    const marcaMatch = (p.marca || '').toLowerCase().includes(termo)

    return skuMatch || nomeMatch || marcaMatch
  })
}

/**
 * Monta os dados para renderização de uma célula produto × canal na matriz.
 */
export function extrairDadosCelulaMatriz({
  produtoId,
  canalId,
  mapaClassificacoes,
  mapaPrecoPorProdCanal,
  mapaLegendas,
  modalidadeColunaId,
  mapaModalidadesPorId,
}: {
  produtoId: string
  canalId: string
  mapaClassificacoes: Map<string, PrecMatrizClassificacaoRecord>
  mapaPrecoPorProdCanal: Record<string, PrecoAprovadoCanalInfo>
  mapaLegendas: Map<string, PrecMatrizLegendaRecord>
  modalidadeColunaId?: string
  mapaModalidadesPorId?: Map<string, { id: string; nome: string }>
}): CelulaMatrizInfo {
  const chave = `${produtoId}__${canalId}`
  const classificacao = mapaClassificacoes.get(chave)
  const precoInfoPadrao = mapaPrecoPorProdCanal[chave]
  const modalidadesDisponiveis = precoInfoPadrao?.modalidades_disponiveis || []

  let legenda: PrecMatrizLegendaRecord | undefined
  if (classificacao?.expand?.legenda) {
    legenda = classificacao.expand.legenda
  } else if (classificacao?.legenda) {
    legenda = mapaLegendas.get(classificacao.legenda)
  }

  // Verifica se há escolha manual gravada na célula
  const modalidadeGravada = classificacao?.modalidade?.trim() || ''
  const isEscolhaManual = !!modalidadeGravada

  // Regra de resolução de modalidade:
  // 1. Escolha manual da célula tem prioridade absoluta.
  // 2. Se não houver escolha manual, seletor de coluna (se fornecido).
  // 3. Se nenhuma modalidade for especificada ou não existir para o produto, fallback para o vigente (precoInfoPadrao).
  let modalidadeAlvoId = modalidadeGravada
  if (!modalidadeAlvoId && modalidadeColunaId) {
    modalidadeAlvoId = modalidadeColunaId
  }

  let precoInfoEfetivo: PrecoAprovadoCanalInfo | undefined = precoInfoPadrao
  let modalidadeEfetivaNome: string | undefined = precoInfoPadrao?.modalidade_nome

  if (modalidadeAlvoId && modalidadesDisponiveis.length > 0) {
    const modMatch = modalidadesDisponiveis.find((m) => m.modalidade_id === modalidadeAlvoId)
    if (modMatch) {
      precoInfoEfetivo = {
        preco_aprovado: modMatch.preco_aprovado,
        status: modMatch.status,
        precificacao_id: modMatch.precificacao_id,
        canal_id: canalId,
        modalidade_id: modMatch.modalidade_id,
        modalidade_nome: modMatch.modalidade_nome,
        modalidades_disponiveis: modalidadesDisponiveis,
      }
      modalidadeEfetivaNome = modMatch.modalidade_nome
    }
  }

  // Nome da modalidade escolhida manualmente (se houver)
  let modalidadeEscolhidaNome: string | undefined
  if (modalidadeGravada) {
    const match = modalidadesDisponiveis.find((m) => m.modalidade_id === modalidadeGravada)
    modalidadeEscolhidaNome =
      match?.modalidade_nome ||
      classificacao?.expand?.modalidade?.nome ||
      mapaModalidadesPorId?.get(modalidadeGravada)?.nome
  }

  return {
    produtoId,
    canalId,
    classificacao,
    legenda,
    precoInfo: precoInfoEfetivo,
    modalidadeEscolhidaId: modalidadeGravada || undefined,
    modalidadeEscolhidaNome,
    modalidadeEfetivaNome,
    isEscolhaManual,
    modalidadesDisponiveis,
  }
}

/**
 * Calcula a cor de contraste (preto ou branco) caso cor_texto não seja especificada.
 */
export function getTextoContraste(corHex?: string): string {
  if (!corHex || !corHex.startsWith('#') || (corHex.length !== 7 && corHex.length !== 4)) {
    return '#FFFFFF'
  }
  let hex = corHex.replace('#', '')
  if (hex.length === 3) {
    hex = hex
      .split('')
      .map((c) => c + c)
      .join('')
  }
  const r = parseInt(hex.substring(0, 2), 16) || 0
  const g = parseInt(hex.substring(2, 4), 16) || 0
  const b = parseInt(hex.substring(4, 6), 16) || 0
  // Luminância relativa aproximada
  const yiq = (r * 299 + g * 587 + b * 114) / 1000
  return yiq >= 150 ? '#111827' : '#FFFFFF'
}
