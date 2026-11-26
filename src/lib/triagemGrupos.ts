import type { TriagemAvaliacao } from './triagemModelo'

/**
 * Agrupamento manual da Triagem de Produtos (protocolo acordado):
 *
 * - A página tem uma LISTA ÚNICA de "posições" na grade: cada posição é um
 *   CARD SOLTO (um produto) ou um GRUPO (2+ produtos empilhados).
 * - Um grupo guarda os ids dos produtos membros NA ORDEM; o PRIMEIRO é o card
 *   da FRENTE (o único visível por completo). Ordem e título são editáveis.
 * - Persistência: coleção `prec_triagem_grupos` (migração 0153) — um registro
 *   por grupo com `titulo`, `ordem` e `membros` (JSON array de ids de
 *   prec_produtos, frente = primeiro). Cards soltos não geram registro —
 *   sua ordem vem da ordenação padrão (ordenarPorAtraso) e da posição entre
 *   os grupos salvos.
 *
 * Regra de reconstrução (travada em testes): ao recarregar, cada grupo salvo
 * reaparece com os membros que ainda existem nos produtos carregados; grupo
 * que perde membros até restar 1 vira card solto; grupo sem membros some.
 * Produtos que ficaram de fora de todo grupo continuam elegíveis nos filtros.
 */

/** Registro da coleção prec_triagem_grupos. */
export interface TriagemGrupoRecord {
  id: string
  titulo: string
  ordem: number
  /** ids de prec_produtos; o PRIMEIRO é o card da frente. */
  membros: string[]
  created?: string
  updated?: string
}

/** Uma posição na grade da triagem: card solto ou grupo empilhado. */
export type TriagemPosicao =
  | { tipo: 'solto'; produtoId: string }
  | { tipo: 'grupo'; grupoId: string }

/** Modelo em memória de um grupo da triagem (derivado do registro salvo). */
export interface TriagemGrupo {
  id: string
  titulo: string
  membros: string[]
}

/** Nome exibido quando o grupo não tem título personalizado. */
export const ROTULO_GRUPO_SEM_TITULO = 'Grupo'

export function tituloGrupo(g: Pick<TriagemGrupo, 'titulo'>): string {
  const t = (g.titulo || '').trim()
  return t || ROTULO_GRUPO_SEM_TITULO
}

/**
 * Extrai o modelo de grupos dos registros salvos, já ordenados pela `ordem`
 * (grupos com mesma ordem preservam a ordem do array de entrada).
 */
export function montarGruposSalvos(registros: TriagemGrupoRecord[]): TriagemGrupo[] {
  return [...registros]
    .sort(
      (a, b) => (a.ordem || 0) - (b.ordem || 0) || (a.created || '').localeCompare(b.created || ''),
    )
    .map((r) => ({ id: r.id, titulo: r.titulo || '', membros: [...(r.membros || [])] }))
}

/**
 * Constrói a lista de posições da grade: grupos salvos (na ordem gravada,
 * apenas com membros ainda existentes) seguidos dos cards soltos — os
 * produtos que não estão em nenhum grupo, na ordem recebida.
 *
 * Regras travadas em testes:
 * - membro inexistente (produto removido) é descartado do grupo;
 * - grupo com 1 membro restante vira card solto (sem registro órfão exibido);
 * - grupo sem nenhum membro some da grade;
 * - um produto em dois grupos só aparece no primeiro (dado corrompido).
 *
 * Filtro ativo (0.0.322): a lista recebida é a FILTRADA da página — ids
 * ausentes da lista são tratados igual a membros inexistentes, mas SÓ na
 * grade: o grupo permanece no estado (`reordenarGrupos`) e no banco e volta
 * inteiro quando o filtro é limpo. Grupo reduzido a 1 membro visível aparece
 * como card solto (mesma degradação de membro removido); a FRENTE exibida de
 * um grupo sob filtro é o primeiro membro VISÍVEL (`projetarGruposVisiveis`) —
 * o grupo real nunca é reordenado pelo filtro.
 */
export function montarPosicoes(
  avaliacoes: TriagemAvaliacao[],
  grupos: TriagemGrupo[],
): TriagemPosicao[] {
  const existentes = new Set(avaliacoes.map((a) => a.produto.id))
  const usados = new Set<string>()
  const posicoes: TriagemPosicao[] = []

  for (const g of grupos) {
    const membros = g.membros.filter((id) => {
      if (!existentes.has(id)) return false
      if (usados.has(id)) return false
      usados.add(id)
      return true
    })
    if (membros.length >= 2) {
      posicoes.push({ tipo: 'grupo', grupoId: g.id })
    } else if (membros.length === 1) {
      // grupo que perdeu membros vira card solto
      posicoes.push({ tipo: 'solto', produtoId: membros[0] })
      usados.add(membros[0])
    }
    // membros.length === 0 → grupo some
  }

  for (const av of avaliacoes) {
    if (!usados.has(av.produto.id)) posicoes.push({ tipo: 'solto', produtoId: av.produto.id })
  }
  return posicoes
}

/** Normaliza o JSON `membros` vindo do banco para string[] sem duplicatas. */
export function normalizarMembros(valor: unknown): string[] {
  if (!Array.isArray(valor)) return []
  const vistos = new Set<string>()
  const out: string[] = []
  for (const v of valor) {
    if (typeof v !== 'string' || !v || vistos.has(v)) continue
    vistos.add(v)
    out.push(v)
  }
  return out
}

// ── Operações puras sobre a grade (usadas pela UI e travadas em testes) ─────

/** Cria um grupo novo com dois produtos (a = frente). */
export function criarGrupoDePar(aId: string, bId: string, _grupos?: TriagemGrupo[]): TriagemGrupo {
  return { id: novoIdTemporario(), titulo: '', membros: [aId, bId] }
}

/** Adiciona um produto a um grupo existente (entra no FIM da pilha). */
export function adicionarAoGrupo(grupo: TriagemGrupo, produtoId: string): TriagemGrupo {
  if (grupo.membros.includes(produtoId)) return grupo
  return { ...grupo, membros: [...grupo.membros, produtoId] }
}

/**
 * Índices dos membros visíveis de um grupo (filtro 0.0.322). Sem
 * `idsVisiveis` (ou com `undefined`), TODOS os índices são visíveis — as
 * funções abaixo reduzem exatamente ao comportamento sem filtro.
 */
function indicesVisiveis(membros: string[], idsVisiveis?: string[]): number[] {
  if (!idsVisiveis) return membros.map((_, i) => i)
  const visiveis = new Set(idsVisiveis)
  return membros.map((_, i) => i).filter((i) => visiveis.has(membros[i]))
}

/**
 * Traz o produto para a FRENTE do grupo (primeiro da lista) — clique no card.
 * `idsVisiveis` (filtro ativo, 0.0.322): o produto assume a posição do
 * primeiro membro VISÍVEL (frente exibida); membros ocultos continuam à
 * frente dele na ordem real — ao limpar o filtro, a frente real volta.
 */
export function trazerParaFrente(
  grupo: TriagemGrupo,
  produtoId: string,
  idsVisiveis?: string[],
): TriagemGrupo {
  const idx = indicesVisiveis(grupo.membros, idsVisiveis)
  const k = idx.find((i) => grupo.membros[i] === produtoId)
  if (k === undefined || idx[0] === k) return grupo
  const membros = [...grupo.membros]
  const demais = idx.filter((i) => i !== k).map((i) => grupo.membros[i])
  idx.forEach((posicaoOriginal, j) => {
    membros[posicaoOriginal] = j === 0 ? produtoId : demais[j - 1]
  })
  return { ...grupo, membros }
}

/**
 * Navegação circular ‹ ›: desloca a pilha em 1 (dir=true → próximo).
 * `idsVisiveis` (filtro ativo, 0.0.322): gira só a subsequência VISÍVEL,
 * mantendo cada membro oculto na posição que ocupa (nunca vira frente).
 */
export function girarPilha(
  grupo: TriagemGrupo,
  dir: boolean,
  idsVisiveis?: string[],
): TriagemGrupo {
  const idx = indicesVisiveis(grupo.membros, idsVisiveis)
  if (idx.length < 2) return grupo
  const girados = dir
    ? [...idx.slice(1).map((i) => grupo.membros[i]), grupo.membros[idx[0]]]
    : [grupo.membros[idx[idx.length - 1]], ...idx.slice(0, -1).map((i) => grupo.membros[i])]
  const membros = [...grupo.membros]
  idx.forEach((posicaoOriginal, k) => {
    membros[posicaoOriginal] = girados[k]
  })
  return { ...grupo, membros }
}

/**
 * Desagrupa só o card da frente (vira solto; o grupo segue com o resto).
 * `idsVisiveis` (filtro ativo, 0.0.322): a frente liberada é o primeiro
 * membro VISÍVEL — membros ocultos pelo filtro permanecem no grupo.
 */
export function desagruparFrente(
  grupo: TriagemGrupo,
  idsVisiveis?: string[],
): {
  grupo: TriagemGrupo | null
  liberado: string | null
} {
  const idx = indicesVisiveis(grupo.membros, idsVisiveis)
  const posicao = idx[0]
  if (posicao === undefined) return { grupo: null, liberado: null }
  const liberado = grupo.membros[posicao]
  const membros = grupo.membros.filter((_, i) => i !== posicao)
  return { grupo: membros.length > 0 ? { ...grupo, membros } : null, liberado }
}

/** Desfaz o grupo inteiro: todos os membros voltam a ser cards soltos. */
export function desfazerGrupo(grupo: TriagemGrupo): string[] {
  return [...grupo.membros]
}

/**
 * Reordena a grade movendo a posição `de` para `para` (grupo se move como
 * bloco — mover um card para cima de outro forma grupo; mover sobre um grupo
 * adiciona ao grupo).
 */
export function moverPosicao(
  posicoes: TriagemPosicao[],
  de: number,
  para: number,
): TriagemPosicao[] {
  if (de === para || de < 0 || de >= posicoes.length) return posicoes
  const alvo = posicoes[para]
  if (!alvo) return posicoes
  const movida = posicoes[de]
  if (!movida) return posicoes

  // Soltar sobre card/grupo ≠ merge: merge é decidido pela UI (drag de merge).
  const semMovida = posicoes.filter((_, i) => i !== de)
  let idx = para
  if (de < para) idx = para - 1
  const clamped = Math.max(0, Math.min(idx, semMovida.length))
  const out = [...semMovida]
  out.splice(clamped, 0, movida)
  return out
}

/** Zona do card alvo onde o arrasto foi solto (borda superior/inferior/centro). */
export type ZonaSoltar = 'antes' | 'depois' | 'centro'

/** Chave estável de uma posição da grade para o motor de arraste. */
export function chavePosicao(p: TriagemPosicao): string {
  return p.tipo === 'grupo' ? `g:${p.grupoId}` : `p:${p.produtoId}`
}

/** Decisão do que o arraste faz — interpretada antes de tocar no estado. */
export type SoltarDecisao =
  | { acao: 'agrupar'; produtoId: string; alvoProdutoId: string }
  | { acao: 'reordenar'; de: number; para: number }

/**
 * Interpreta um soltar do arraste e devolve a ação a executar.
 *
 * Regras gravadas (travadas em testes):
 * - arrastar um GRUPO (chave g:*) sempre move o bloco (nunca funde grupos);
 * - soltar card sobre o CENTRO de um card solto agrupa os dois;
 * - soltar card sobre um grupo (qualquer zona) faz o card ENTRAR no grupo;
 * - soltar card na borda (30% superior/inferior) de um card solto reordena.
 * `alvoProdutoId` para grupo é o card da FRENTE (dono da posição na grade).
 * Sob filtro (0.0.322) o hook passa os grupos PROJETADOS (`projetarGruposVisiveis`),
 * então a frente considerada é a que está exibida.
 */
export function interpretarSoltar(
  posicoes: TriagemPosicao[],
  grupos: TriagemGrupo[],
  arrastadoKey: string,
  alvoKey: string | null,
  zona: ZonaSoltar,
): SoltarDecisao | null {
  if (!alvoKey || alvoKey === arrastadoKey) return null
  const de = posicoes.findIndex((p) => chavePosicao(p) === arrastadoKey)
  const para = posicoes.findIndex((p) => chavePosicao(p) === alvoKey)
  if (de < 0 || para < 0) return null
  const arrastado = posicoes[de]
  const alvo = posicoes[para]
  if (!arrastado || !alvo) return null

  if (arrastado.tipo === 'grupo') {
    if (alvo.tipo === 'grupo' && alvo.grupoId === arrastado.grupoId) return null
    return { acao: 'reordenar', de, para }
  }

  const produtoId = arrastado.produtoId
  if (alvo.tipo === 'grupo') {
    const frente = grupos.find((g) => g.id === alvo.grupoId)?.membros[0]
    if (!frente || frente === produtoId) return null
    return { acao: 'agrupar', produtoId, alvoProdutoId: frente }
  }
  if (zona === 'centro' && alvo.produtoId !== produtoId) {
    return { acao: 'agrupar', produtoId, alvoProdutoId: alvo.produtoId }
  }
  return { acao: 'reordenar', de, para }
}

/**
 * Reordena a lista de GRUPOS persistida a partir da grade VISÍVEL (0.0.322).
 *
 * Com um filtro ativo, a grade mostra só parte dos produtos: a ordem nova
 * (calculada por `moverPosicao` sobre as posições visíveis) vale apenas para
 * os grupos que aparecem nela. Grupos ocultos pelo filtro NÃO aparecem na
 * grade — logo, não entram na lista `idsVisiveis` — e preservam a ordem relativa
 * que já tinham, no fim da lista, em vez de serem descartados (o que os
 * apagaria do estado e do banco). Regra travada em testes.
 */
export function reordenarGrupos(grupos: TriagemGrupo[], idsVisiveis: string[]): TriagemGrupo[] {
  const mapa = new Map(grupos.map((g) => [g.id, g]))
  const ordenados = idsVisiveis
    .map((id) => mapa.get(id))
    .filter((g): g is TriagemGrupo => g !== undefined)
  const fora = grupos.filter((g) => !idsVisiveis.includes(g.id))
  return [...ordenados, ...fora]
}

/**
 * Projeção dos grupos para EXIBIÇÃO sob filtro (0.0.322): cada grupo é
 * apresentado só com seus membros visíveis, na ordem real — a frente exibida
 * é o primeiro membro visível. O estado (`grupos`) e o banco NUNCA são
 * alterados por essa projeção; ao limpar o filtro, os grupos voltam inteiros.
 * Sem filtro, devolve os grupos como estão.
 */
export function projetarGruposVisiveis(
  grupos: TriagemGrupo[],
  idsVisiveis?: string[],
): TriagemGrupo[] {
  if (!idsVisiveis) return grupos
  const visiveis = new Set(idsVisiveis)
  return grupos.map((g) => ({ ...g, membros: g.membros.filter((m) => visiveis.has(m)) }))
}

/** Id temporário de grupo em memória (antes de salvar no banco). */
export function novoIdTemporario(): string {
  return `tmp_${Math.random().toString(36).slice(2, 10)}`
}

/** Próxima `ordem` livre para persistir um grupo no fim da grade. */
export function proximaOrdem(registros: TriagemGrupoRecord[]): number {
  return registros.reduce((max, r) => Math.max(max, r.ordem || 0), 0) + 1
}
