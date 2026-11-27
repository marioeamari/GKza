/**
 * Fileira de canais de venda dos cards da Triagem (0.0.325).
 *
 * Regra gravada (protocolo acordado):
 * - um círculo por canal de `prec_canais` com `ativo` verdadeiro, na ordem em
 *   que a coleção foi carregada;
 * - o canal fica CLASSIFICADO para o produto quando existe ao menos um cenário
 *   do produto nesse canal com `preco_aprovado > 0` e status `aprovada` ou
 *   `desatualizada` (mesmo critério da Matriz);
 * - entre cenários válidos do mesmo canal, 'aprovada' tem prioridade sobre
 *   'desatualizada' e o desempate é pelo cenário mais recente;
 * - classificado = círculo na cor original do canal; não classificado = círculo
 *   cinza (visual de inativo). O tooltip diz o preço aprovado ou "sem preço".
 */

export interface CanalLite {
  id: string
  nome: string
  cor?: string
  ativo?: boolean
}

export interface CenarioCanalLite {
  canal: string
  status: string
  preco_aprovado?: number
  updated?: string
  created?: string
}

export interface CanalIcone {
  canalId: string
  nome: string
  cor: string
  inicial: string
  classificado: boolean
  precoAprovado?: number
  rotuloTooltip: string
}

const COR_FALLBACK = '#6b7280'

const PRIORIDADE_STATUS: Record<string, number> = { aprovada: 0, desatualizada: 1 }

function cenarioMelhor(a: CenarioCanalLite, b: CenarioCanalLite): boolean {
  const pa = PRIORIDADE_STATUS[a.status] ?? 9
  const pb = PRIORIDADE_STATUS[b.status] ?? 9
  if (pa !== pb) return pa < pb
  return (a.updated || a.created || '') > (b.updated || b.created || '')
}

function formatarBRL(valor: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valor)
}

export function canaisDoProduto(cenarios: CenarioCanalLite[], canais: CanalLite[]): CanalIcone[] {
  const escolhido = new Map<string, CenarioCanalLite>()
  for (const c of cenarios) {
    if (!(c.preco_aprovado && c.preco_aprovado > 0)) continue
    if (c.status !== 'aprovada' && c.status !== 'desatualizada') continue
    const atual = escolhido.get(c.canal)
    if (!atual || cenarioMelhor(c, atual)) escolhido.set(c.canal, c)
  }

  return canais
    .filter((c) => c.ativo)
    .map((c) => {
      const cenario = escolhido.get(c.id)
      const classificado = Boolean(cenario)
      const precoAprovado = cenario?.preco_aprovado
      const rotuloTooltip = classificado
        ? `${c.nome} — ${formatarBRL(precoAprovado ?? 0)} aprovado`
        : `${c.nome} — sem preço aprovado`
      return {
        canalId: c.id,
        nome: c.nome,
        cor: c.cor || COR_FALLBACK,
        inicial: (c.nome.trim().charAt(0) || '?').toUpperCase(),
        classificado,
        precoAprovado,
        rotuloTooltip,
      }
    })
}
