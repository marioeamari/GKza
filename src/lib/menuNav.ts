import {
  BadgeDollarSign,
  BookmarkCheck,
  Boxes,
  Building2,
  Calculator,
  CalendarCheck2,
  CalendarDays,
  CircleUserRound,
  Coins,
  Factory,
  FileSpreadsheet,
  HeartHandshake,
  History,
  Home,
  Layers,
  LayoutDashboard,
  ListTodo,
  Package,
  PackageCheck,
  Receipt,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Store,
  Tags,
  Target,
  TrendingUp,
  Truck,
  UserRound,
  Users,
  WalletCards,
} from 'lucide-react'

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura de navegação "A+B" — FONTE ÚNICA compartilhada por desktop
// (sidebar) e mobile (drawer) em src/components/AppLayout.tsx.
// 10 entradas no topo — 5 acordeons + 5 itens diretos. Configurações por último.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubItem {
  to: string
  label: string
  icon?: typeof Calculator
  end?: boolean
  /**
   * URLs alternativas (pathname ou "pathname?query") que também deixam o item
   * ativo — usada quando uma rota redireciona para outra página (ex.:
   * /insumos → /composicao-produtos?aba=base).
   */
  aliases?: string[]
  /** Se a query da URL contiver este trecho, o item NUNCA fica ativo. */
  notWhenQuery?: string
}

export interface NavItemConfig {
  to: string
  label: string
  icon: typeof Calculator
  end?: boolean
  badge?: number
  highlight?: boolean
  children?: SubItem[]
}

export const FINANCEIRO_CHILDREN: SubItem[] = [
  { to: '/despesas', label: 'Despesas', icon: Receipt },
  { to: '/lancamentos', label: 'Lançamentos', icon: BadgeDollarSign },
  { to: '/contas', label: 'Contas & Cartões', icon: WalletCards },
  { to: '/dizimos', label: 'Dízimos & Ofertas', icon: HeartHandshake },
  { to: '/categorias', label: 'Classificações', icon: Tags },
  { to: '/lucro', label: 'Lucro por Canais', icon: TrendingUp },
]

export const PRECIFICACAO_CHILDREN: SubItem[] = [
  { to: '/precificacao', label: 'Visão Geral & Hub', icon: Layers, end: true },
  { to: '/precificacao/comparar', label: 'Comparador Lado a Lado', icon: Calculator },
  { to: '/precificacao/aprovados', label: 'Cenários & Repositório', icon: BookmarkCheck },
  { to: '/precificacao/dashboard', label: 'Dashboard de Margens', icon: LayoutDashboard },
  { to: '/precificacao/produtos', label: 'Produtos & Kits', icon: PackageCheck },
  { to: '/precificacao/triagem', label: 'Triagem de Produtos', icon: Search },
  // Composição de Produtos: volta ao acordeon de Precificação (saiu nas duas
  // posições na deduplicação da 0.0.302); menu aponta /produtos e o alias
  // /composicao-produtos segue funcionando, exceto com aba=base (Insumos).
  {
    to: '/produtos',
    label: 'Composição de Produtos',
    icon: Layers,
    aliases: ['/composicao-produtos'],
    // Com "aba=base" a URL é a aba Insumos (grupo Cadastros) — não destaca aqui.
    notWhenQuery: 'aba=base',
  },
  { to: '/precificacao/canais', label: 'Canais & Taxas', icon: Store },
  { to: '/precificacao/orcamentos', label: 'Orçamentos', icon: FileSpreadsheet },
  // Clientes: subpágina de clientes dos Orçamentos.
  { to: '/precificacao/clientes', label: 'Clientes', icon: UserRound },
]

export const PRODUCAO_EXPEDICAO_CHILDREN: SubItem[] = [
  { to: '/expedicao/separacao', label: 'Separação de Kits', icon: Boxes },
  { to: '/expedicao/temas-modelos', label: 'Temas e Modelos', icon: Layers },
  { to: '/expedicao/regras', label: 'Regras de Composição', icon: SlidersHorizontal },
  { to: '/expedicao/pedidos', label: 'Pedidos / Personalizações', icon: FileSpreadsheet },
  { to: '/expedicao/historico', label: 'Histórico de Separação', icon: History },
  { to: '/producao', label: 'Produção Semanal', icon: Factory },
]

export const ROTINA_CHILDREN: SubItem[] = [
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/metas-agenda', label: 'Metas & Agenda', icon: Target },
  { to: '/habitos', label: 'Hábitos & Rotinas', icon: CalendarCheck2 },
  { to: '/projetos', label: 'Projetos & Tarefas', icon: ListTodo },
]

export const CADASTROS_CHILDREN: SubItem[] = [
  { to: '/empresas', label: 'Empresas', icon: Building2 },
  { to: '/pessoas', label: 'Pessoas', icon: CircleUserRound },
  { to: '/fornecedores', label: 'Fornecedores', icon: Truck },
  // Insumos: /insumos e /cadastros/insumos redirecionam para
  // /composicao-produtos?aba=base (aba "Base" da página de Composição);
  // os aliases mantêm o item destacado e o grupo Cadastros aberto após o
  // redirect — por isso o item do menu usa a rota pedida (/insumos) e o
  // highlight sobrevive ao redirect via query param.
  {
    to: '/insumos',
    label: 'Insumos',
    icon: Package,
    aliases: ['/composicao-produtos?aba=base', '/produtos?aba=base', '/cadastros/insumos'],
  },
]

// Ordem acordada (A+B): Início, Triagem, Marketplaces, Equipe, Dívidas e os
// 5 acordeons; Configurações sempre por último.
export const NAV_TREE: NavItemConfig[] = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/pendentes', label: 'Triagem', icon: Sparkles },
  { to: '/marketplaces', label: 'Marketplaces', icon: Store },
  { to: '/funcionarios', label: 'Equipe', icon: Users },
  { to: '/dividas', label: 'Dívidas & Máquinas', icon: Coins },
  {
    to: '/financeiro',
    label: 'Financeiro',
    icon: BadgeDollarSign,
    children: FINANCEIRO_CHILDREN,
  },
  {
    to: '/precificacao',
    label: 'Precificação',
    icon: Calculator,
    children: PRECIFICACAO_CHILDREN,
  },
  {
    to: '/expedicao/separacao',
    label: 'Produção & Expedição',
    icon: Boxes,
    children: PRODUCAO_EXPEDICAO_CHILDREN,
  },
  {
    to: '/agenda',
    label: 'Rotina & Planejamento',
    icon: CalendarDays,
    children: ROTINA_CHILDREN,
  },
  { to: '/empresas', label: 'Cadastros', icon: Building2, children: CADASTROS_CHILDREN },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

// Metadados de cada acordeon: key (estado), itemTo (caminho da entrada no menu)
// e prefixes (padrões que ativam/expandem o grupo). Um prefixo pode conter
// query ("path?query") — nesse caso casa com pathname+search; prefixo simples
// casa só com o pathname.
// IMPORTANTE: prefixos COM query têm prioridade sobre os simples — por isso
// '/composicao-produtos?aba=base' e '/produtos?aba=base' marcam Cadastros
// (aba Insumos) antes de '/produtos' e '/composicao-produtos' marcarem
// Precificação.
export const NAV_GROUP_PREFIXES: Array<{ key: string; itemTo: string; prefixes: string[] }> = [
  { key: 'financeiro', itemTo: '/financeiro', prefixes: ['/financeiro'] },
  {
    key: 'precificacao',
    itemTo: '/precificacao',
    prefixes: ['/precificacao', '/produtos', '/composicao-produtos'],
  },
  {
    key: 'producao-expedicao',
    itemTo: '/expedicao/separacao',
    prefixes: ['/expedicao', '/producao'],
  },
  { key: 'rotina', itemTo: '/agenda', prefixes: ['/agenda'] },
  {
    key: 'cadastros',
    itemTo: '/empresas',
    prefixes: [
      '/composicao-produtos?aba=base',
      '/produtos?aba=base',
      '/empresas',
      '/pessoas',
      '/fornecedores',
      '/insumos',
      '/cadastros',
    ],
  },
]

/**
 * Grupo (itemTo do acordeon) ativo para a URL corrente, ou undefined.
 * Prefixos com query têm prioridade sobre prefixos simples de pathname.
 */
export function menuGroupForUrl(pathname: string, search: string): string | undefined {
  const full = `${pathname}${search}`
  for (const group of NAV_GROUP_PREFIXES) {
    for (const prefix of group.prefixes) {
      if (prefix.includes('?') && full.startsWith(prefix)) return group.itemTo
    }
  }
  for (const group of NAV_GROUP_PREFIXES) {
    for (const prefix of group.prefixes) {
      if (!prefix.includes('?') && pathname.startsWith(prefix)) return group.itemTo
    }
  }
  return undefined
}

function aliasMatches(alias: string, pathname: string, search: string): boolean {
  const [aliasPath, ...rest] = alias.split('?')
  const aliasQuery = rest.join('?')
  if (pathname !== aliasPath) return false
  // Alias com query exige a query na URL; alias sem query exige URL sem query.
  return aliasQuery ? search.includes(aliasQuery) : search === ''
}

/** O subitem está ativo na URL corrente? (mesma semântica do menu antigo + aliases) */
export function isSubItemActive(sub: SubItem, pathname: string, search: string): boolean {
  if (sub.notWhenQuery && search.includes(sub.notWhenQuery)) return false
  if (sub.aliases?.some((alias) => aliasMatches(alias, pathname, search))) return true
  if (sub.end) return pathname === sub.to
  return pathname === sub.to || pathname.startsWith(`${sub.to}/`)
}
