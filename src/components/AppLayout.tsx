import { useEffect, useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BadgeDollarSign,
  Building2,
  CalendarCheck2,
  CalendarDays,
  Calculator,
  BookmarkCheck,
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  Coins,
  Factory,
  FilePenLine,
  FileSpreadsheet,
  HeartHandshake,
  History,
  Home,
  Layers,
  LayoutDashboard,
  ListTodo,
  LogOut,
  Menu,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  Receipt,
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
  X,
} from 'lucide-react'
import { ContextSelector } from '@/components/ContextSelector'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import { Brand } from '@/components/Brand'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { initials, roleLabel } from '@/lib/format'
import pb from '@/lib/pocketbase/client'
import { telegramPendentesService } from '@/services/telegramPendentes'
import { DespesaRapidaModal } from '@/components/DespesaRapidaModal'
import { MobileDesktopNotice } from '@/components/MobileDesktopNotice'

const SIDEBAR_COLLAPSED_KEY = 'erpgkza_sidebar_collapsed'

interface SubItem {
  to: string
  label: string
  icon?: typeof Calculator
  end?: boolean
}

interface NavItemConfig {
  to: string
  label: string
  icon: typeof Calculator
  end?: boolean
  badge?: number
  highlight?: boolean
  children?: SubItem[]
}

// ─────────────────────────────────────────────────────────────────────────────
// Estrutura de navegação "A+B" (desktop e mobile compartilham a MESMA árvore):
// 10 entradas no topo — 5 acordeons + 5 itens diretos. Configurações por último.
// ─────────────────────────────────────────────────────────────────────────────

const FINANCEIRO_CHILDREN: SubItem[] = [
  { to: '/despesas', label: 'Despesas', icon: Receipt },
  { to: '/lancamentos', label: 'Lançamentos', icon: BadgeDollarSign },
  { to: '/contas', label: 'Contas & Cartões', icon: WalletCards },
  { to: '/dizimos', label: 'Dízimos & Ofertas', icon: HeartHandshake },
  { to: '/categorias', label: 'Classificações', icon: Tags },
  { to: '/lucro', label: 'Lucro por Canais', icon: TrendingUp },
]

const PRECIFICACAO_CHILDREN: SubItem[] = [
  { to: '/precificacao', label: 'Visão Geral & Hub', icon: Layers, end: true },
  { to: '/precificacao/comparar', label: 'Comparador Lado a Lado', icon: Calculator },
  { to: '/precificacao/aprovados', label: 'Cenários & Repositório', icon: BookmarkCheck },
  { to: '/precificacao/dashboard', label: 'Dashboard de Margens', icon: LayoutDashboard },
  { to: '/precificacao/produtos', label: 'Produtos & Kits', icon: PackageCheck },
  { to: '/precificacao/canais', label: 'Canais & Taxas', icon: Store },
  { to: '/precificacao/orcamentos', label: 'Orçamentos', icon: FileSpreadsheet },
]

const PRODUCAO_EXPEDICAO_CHILDREN: SubItem[] = [
  { to: '/expedicao/separacao', label: 'Separação de Kits', icon: Boxes },
  { to: '/expedicao/temas-modelos', label: 'Temas e Modelos', icon: Layers },
  { to: '/expedicao/regras', label: 'Regras de Composição', icon: SlidersHorizontal },
  { to: '/expedicao/pedidos', label: 'Pedidos / Personalizações', icon: FileSpreadsheet },
  { to: '/expedicao/historico', label: 'Histórico de Separação', icon: History },
  { to: '/producao', label: 'Produção Semanal', icon: Factory },
]

const ROTINA_CHILDREN: SubItem[] = [
  { to: '/agenda', label: 'Agenda', icon: CalendarDays },
  { to: '/metas-agenda', label: 'Metas & Agenda', icon: Target },
  { to: '/habitos', label: 'Hábitos & Rotinas', icon: CalendarCheck2 },
  { to: '/projetos', label: 'Projetos & Tarefas', icon: ListTodo },
]

const CADASTROS_CHILDREN: SubItem[] = [
  { to: '/empresas', label: 'Empresas', icon: Building2 },
  { to: '/pessoas', label: 'Pessoas', icon: CircleUserRound },
  { to: '/fornecedores', label: 'Fornecedores', icon: Truck },
]

// Ordem acordada (A+B): Início, Triagem, Marketplaces, Equipe, Dívidas e os
// 5 acordeons; Configurações sempre por último.
const NAV_TREE: NavItemConfig[] = [
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
// e to (prefixo de rota que ativa/expande o grupo). IMPORTANTE: 'producao-
// expedicao' usa '/expedicao' como prefixo para cobrir tanto as rotas de
// expedição quanto '/producao' (absorvida no grupo).
const NAV_GROUP_PREFIXES: Array<{ key: string; itemTo: string; to: string }> = [
  { key: 'financeiro', itemTo: '/financeiro', to: '/financeiro' },
  { key: 'precificacao', itemTo: '/precificacao', to: '/precificacao' },
  { key: 'producao-expedicao', itemTo: '/expedicao/separacao', to: '/expedicao' },
  { key: 'rotina', itemTo: '/agenda', to: '/agenda' },
  { key: 'cadastros', itemTo: '/empresas', to: '/empresas' },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [pendentesCount, setPendentesCount] = useState(0)

  // Persistência do estado recolhido/expandido
  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === 'true'
    } catch {
      return false
    }
  })

  // Menu mobile (drawer) — mesma árvore do desktop
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // Controla abertura de submenus (acordeons) — inicia aberto no setor ativo.
  // Estado indexado pelo caminho da entrada no menu (item.to).
  const [openSubmenus, setOpenSubmenus] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {}
    for (const { itemTo, to } of NAV_GROUP_PREFIXES) {
      initial[itemTo] = location.pathname.startsWith(to)
    }
    return initial
  })

  // Setor ativo abre o acordeon sozinho: observa o pathname e expande o grupo
  useEffect(() => {
    for (const { itemTo, to } of NAV_GROUP_PREFIXES) {
      if (location.pathname.startsWith(to)) {
        setOpenSubmenus((prev) => (prev[itemTo] ? prev : { ...prev, [itemTo]: true }))
      }
    }
  }, [location.pathname])

  const toggleSidebar = () => {
    setIsCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const toggleSubmenu = (key: string, e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setOpenSubmenus((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const avatarUrl = user?.avatar ? pb.files.getURL(user, user.avatar, { thumb: '100x100' }) : ''
  const signOut = () => {
    logout()
    navigate('/login')
  }

  // Contagem em tempo real de registros pendentes do Telegram
  useEffect(() => {
    let active = true
    let unsubscribeFn: (() => Promise<void>) | undefined

    const fetchCount = () => {
      telegramPendentesService
        .countPendentes()
        .then((count) => {
          if (active) setPendentesCount(count)
        })
        .catch(() => {})
    }

    fetchCount()

    // Só assina se houver token válido no authStore para evitar requisições realtime rejeitadas
    if (pb.authStore.isValid) {
      pb.collection('telegram_registros_pendentes')
        .subscribe('*', () => {
          fetchCount()
        })
        .then((unsub) => {
          if (!active) {
            unsub().catch(() => {})
          } else {
            unsubscribeFn = unsub
          }
        })
        .catch((err) => {
          console.debug('Realtime telegram_registros_pendentes indisponível:', err)
        })
    }

    return () => {
      active = false
      if (unsubscribeFn) {
        unsubscribeFn().catch(() => {})
      } else {
        try {
          pb.collection('telegram_registros_pendentes').unsubscribe('*')
        } catch {
          /* intentionally ignored */
        }
      }
    }
  }, [location.pathname])

  // Triagem recebe o badge de pendentes na árvore compartilhada
  const navTree: NavItemConfig[] = NAV_TREE.map((item) =>
    item.to === '/pendentes' ? { ...item, badge: pendentesCount } : item,
  )

  const renderSubItem = (sub: SubItem, compact = false) => {
    const SubIcon = sub.icon || Calculator
    const isSubActive = sub.end
      ? location.pathname === sub.to
      : location.pathname === sub.to || location.pathname.startsWith(`${sub.to}/`)
    return (
      <Link
        key={sub.to}
        to={sub.to}
        onClick={() => setIsMobileMenuOpen(false)}
        className={cn(
          'flex items-center gap-2.5 rounded-lg font-semibold transition',
          compact ? 'px-2.5 py-2 text-xs' : 'px-2.5 py-1.5 text-xs',
          isSubActive
            ? 'bg-primary/10 font-bold text-primary'
            : 'text-muted-foreground hover:bg-secondary hover:text-foreground',
        )}
      >
        <SubIcon className={cn('shrink-0', compact ? 'h-4 w-4' : 'h-3.5 w-3.5')} />
        <span className="truncate">{sub.label}</span>
      </Link>
    )
  }

  return (
    <TooltipProvider delayDuration={150}>
      <div className="min-h-screen bg-background">
        {/* SIDEBAR DESKTOP */}
        <aside
          aria-label="Barra lateral principal"
          className={cn(
            'fixed inset-y-0 left-0 z-40 hidden flex-col border-r border-border bg-white transition-[width] duration-300 ease-in-out lg:flex',
            isCollapsed ? 'w-20' : 'w-64',
          )}
        >
          {/* CABEÇALHO FIXO: Brand + Botão Recolher/Expandir */}
          <div className="relative shrink-0 border-b border-border/60">
            <div
              className={cn(
                'flex h-16 items-center',
                isCollapsed ? 'justify-center px-2' : 'justify-between px-5',
              )}
            >
              <Brand compact={isCollapsed} />

              {/* Botão recolher quando expandido */}
              {!isCollapsed && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      aria-label="Recolher barra lateral"
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <PanelLeftClose className="h-4 w-4" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Recolher barra lateral
                  </TooltipContent>
                </Tooltip>
              )}
            </div>

            {/* Botão expandir quando recolhido (abaixo do ícone) */}
            {isCollapsed && (
              <div className="flex justify-center pb-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      onClick={toggleSidebar}
                      aria-label="Expandir barra lateral"
                      className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                    >
                      <PanelLeftOpen className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="right" className="text-xs">
                    Expandir barra lateral
                  </TooltipContent>
                </Tooltip>
              </div>
            )}
          </div>

          {/* SELETOR DE CONTEXTO FIXO */}
          <div
            className={cn(
              'shrink-0 border-b border-border/40 py-2.5 transition-all space-y-2',
              isCollapsed ? 'px-2' : 'px-3',
            )}
          >
            <ContextSelector compact={isCollapsed} />
            <div className={cn('flex', isCollapsed ? 'justify-center' : 'w-full')}>
              <DespesaRapidaModal triggerVariant="sidebar" collapsed={isCollapsed} />
            </div>
          </div>

          {/* ÁREA DE NAVEGAÇÃO COM SCROLL VERTICAL */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden py-3 scrollbar-thin">
            <nav
              className={cn('space-y-1', isCollapsed ? 'px-2' : 'px-3')}
              aria-label="Navegação principal"
            >
              {navTree.map((item) => {
                const Icon = item.icon
                const hasChildren = Boolean(item.children && item.children.length > 0)
                const isGroupActive = hasChildren
                  ? location.pathname.startsWith(
                      NAV_GROUP_PREFIXES.find((g) => g.itemTo === item.to)?.to ?? item.to,
                    )
                  : item.end
                    ? location.pathname === item.to
                    : location.pathname.startsWith(item.to)
                const isSubmenuOpen = openSubmenus[item.to] ?? false

                // CASO 1: MODO RECOLHIDO (apenas ícones com tooltips / popover para acordeons)
                if (isCollapsed) {
                  // Se tiver filhos, abre um Popover ao clicar
                  if (hasChildren) {
                    return (
                      <Popover key={item.to}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <PopoverTrigger asChild>
                              <button
                                type="button"
                                className={cn(
                                  'nav-item nav-item-collapsed w-full',
                                  isGroupActive && 'nav-item-active',
                                )}
                                aria-label={item.label}
                              >
                                <div className="relative flex items-center justify-center">
                                  <Icon className="h-5 w-5" strokeWidth={1.8} />
                                  {item.badge !== undefined && item.badge > 0 && (
                                    <span
                                      className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-white ring-2 ring-white"
                                      title={`${item.badge} pendente(s)`}
                                    >
                                      {item.badge > 99 ? '99+' : item.badge}
                                    </span>
                                  )}
                                </div>
                              </button>
                            </PopoverTrigger>
                          </TooltipTrigger>
                          <TooltipContent
                            side="right"
                            sideOffset={12}
                            className="text-xs font-semibold"
                          >
                            {item.label} (clique para opções)
                          </TooltipContent>
                        </Tooltip>

                        <PopoverContent
                          side="right"
                          align="start"
                          sideOffset={12}
                          className="w-56 p-2 shadow-lg"
                        >
                          <div className="mb-1.5 border-b border-border/80 px-2.5 py-1 text-xs font-bold text-foreground">
                            {item.label}
                          </div>
                          <div className="space-y-0.5">
                            {item.children?.map((sub) => renderSubItem(sub, true))}
                          </div>
                        </PopoverContent>
                      </Popover>
                    )
                  }

                  // Item sem submenu no modo recolhido
                  return (
                    <Tooltip key={item.to}>
                      <TooltipTrigger asChild>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            cn('nav-item nav-item-collapsed w-full', isActive && 'nav-item-active')
                          }
                          aria-label={item.label}
                        >
                          <div className="relative flex items-center justify-center">
                            <Icon className="h-5 w-5" strokeWidth={1.8} />
                            {item.badge !== undefined && item.badge > 0 && (
                              <span
                                className="absolute -top-1.5 -right-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-extrabold text-white ring-2 ring-white"
                                title={`${item.badge} pendente(s)`}
                              >
                                {item.badge > 99 ? '99+' : item.badge}
                              </span>
                            )}
                          </div>
                        </NavLink>
                      </TooltipTrigger>
                      <TooltipContent
                        side="right"
                        sideOffset={12}
                        className="text-xs font-semibold"
                      >
                        {item.label}
                      </TooltipContent>
                    </Tooltip>
                  )
                }

                // CASO 2: MODO EXPANDIDO (sidebar completa com rótulos e acordeons)
                if (hasChildren) {
                  return (
                    <div key={item.to} className="space-y-0.5">
                      <div className="group relative flex items-center">
                        <NavLink
                          to={item.to}
                          className={cn(
                            'nav-item flex-1 justify-between pr-2',
                            isGroupActive && 'nav-item-active',
                          )}
                        >
                          <div className="flex min-w-0 items-center gap-3">
                            <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                            <span className="truncate">{item.label}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            {item.badge !== undefined && item.badge > 0 && (
                              <Badge
                                variant="secondary"
                                className="h-5 border-0 bg-primary px-1.5 text-[11px] font-extrabold text-white shadow-xs"
                              >
                                {item.badge}
                              </Badge>
                            )}
                            <button
                              type="button"
                              onClick={(e) => toggleSubmenu(item.to, e)}
                              className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                              title={isSubmenuOpen ? 'Ocultar subpáginas' : 'Mostrar subpáginas'}
                              aria-label={
                                isSubmenuOpen ? 'Ocultar subpáginas' : 'Mostrar subpáginas'
                              }
                            >
                              <ChevronRight
                                className={cn(
                                  'h-3.5 w-3.5 transition-transform duration-200',
                                  isSubmenuOpen && 'rotate-90',
                                )}
                              />
                            </button>
                          </div>
                        </NavLink>
                      </div>

                      {/* Lista de subpáginas quando o acordeon está aberto */}
                      {isSubmenuOpen && item.children && (
                        <div className="relative ml-5 space-y-0.5 border-l-2 border-border/70 pl-2 pt-0.5 pb-1">
                          {item.children.map((sub) => renderSubItem(sub))}
                        </div>
                      )}
                    </div>
                  )
                }

                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      cn(
                        'nav-item relative flex items-center justify-between',
                        isActive && 'nav-item-active',
                      )
                    }
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                      <span className="truncate">{item.label}</span>
                    </div>
                    {item.badge !== undefined && item.badge > 0 && (
                      <Badge
                        variant="secondary"
                        className="h-5 border-0 bg-primary px-1.5 text-[11px] font-extrabold text-white shadow-xs"
                      >
                        {item.badge > 99 ? '99+' : item.badge}
                      </Badge>
                    )}
                  </NavLink>
                )
              })}
            </nav>
          </div>

          {/* RODAPÉ FIXO: Perfil de Usuário & Logout */}
          <div
            className={cn(
              'shrink-0 border-t border-border bg-white p-2.5 transition-all',
              isCollapsed && 'px-2 py-3',
            )}
          >
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center rounded-xl p-1.5 text-left transition hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30',
                    isCollapsed ? 'justify-center' : 'gap-3',
                  )}
                  aria-label="Menu do usuário"
                >
                  <Avatar className="block h-10 w-10 shrink-0 border border-border">
                    <AvatarImage src={avatarUrl} alt={user?.name} />
                    <AvatarFallback>{initials(user?.name)}</AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-foreground">
                          {user?.name}
                        </span>
                        <Badge variant="secondary" className="mt-0.5 h-5 px-2 text-[10px]">
                          {roleLabel(user?.role)}
                        </Badge>
                      </span>
                      <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-56">
                <div className="border-b border-border/80 px-2 py-1.5 text-xs">
                  <p className="font-bold text-foreground truncate">{user?.name}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
                </div>
                <DropdownMenuItem asChild>
                  <Link to="/configuracoes?secao=perfil">
                    <UserRound className="mr-2 h-4 w-4" />
                    Editar perfil
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/configuracoes?acao=email">
                    <FilePenLine className="mr-2 h-4 w-4" />
                    Alterar e-mail
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </aside>

        {/* AVISO MÓVEL DISCRETO EM ROTAS DESKTOP */}
        <MobileDesktopNotice />

        {/* HEADER MOBILE */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur lg:hidden">
          <div className="flex items-center gap-2">
            <Brand />
            <ContextSelector className="w-auto min-w-[110px] max-w-[150px]" compact />
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full"
              aria-label="Abrir menu"
              onClick={() => setIsMobileMenuOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="rounded-full">
                  <Avatar className="h-9 w-9">
                    <AvatarImage src={avatarUrl} />
                    <AvatarFallback>{initials(user?.name)}</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/configuracoes">Meu perfil</Link>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-destructive" onClick={signOut}>
                  Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* DRAWER MOBILE — mesma árvore do desktop (A+B) */}
        {isMobileMenuOpen && (
          <div
            className="fixed inset-0 z-50 lg:hidden"
            role="dialog"
            aria-modal="true"
            aria-label="Menu principal"
          >
            <button
              type="button"
              aria-label="Fechar menu"
              className="absolute inset-0 bg-foreground/40 backdrop-blur-sm"
              onClick={() => setIsMobileMenuOpen(false)}
            />
            <div className="absolute inset-y-0 left-0 flex w-80 max-w-[85vw] flex-col border-r border-border bg-white shadow-soft">
              <div className="flex h-16 shrink-0 items-center justify-between border-b border-border/60 px-4">
                <Brand />
                <Button
                  variant="ghost"
                  size="icon"
                  className="rounded-lg"
                  aria-label="Fechar menu"
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 scrollbar-thin">
                <nav className="space-y-1" aria-label="Navegação móvel">
                  {navTree.map((item) => {
                    const Icon = item.icon
                    const hasChildren = Boolean(item.children && item.children.length > 0)
                    const isGroupActive = hasChildren
                      ? location.pathname.startsWith(
                          NAV_GROUP_PREFIXES.find((g) => g.itemTo === item.to)?.to ?? item.to,
                        )
                      : item.end
                        ? location.pathname === item.to
                        : location.pathname.startsWith(item.to)
                    const isSubmenuOpen = openSubmenus[item.to] ?? false

                    if (hasChildren) {
                      return (
                        <div key={item.to} className="space-y-0.5">
                          <div className="group relative flex items-center">
                            <NavLink
                              to={item.to}
                              onClick={() => setIsMobileMenuOpen(false)}
                              className={cn(
                                'nav-item flex-1 justify-between pr-2',
                                isGroupActive && 'nav-item-active',
                              )}
                            >
                              <div className="flex min-w-0 items-center gap-3">
                                <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                                <span className="truncate">{item.label}</span>
                              </div>
                            </NavLink>
                            <button
                              type="button"
                              onClick={(e) => toggleSubmenu(item.to, e)}
                              className="absolute right-2 inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground"
                              title={isSubmenuOpen ? 'Ocultar subpáginas' : 'Mostrar subpáginas'}
                              aria-label={
                                isSubmenuOpen ? 'Ocultar subpáginas' : 'Mostrar subpáginas'
                              }
                            >
                              <ChevronRight
                                className={cn(
                                  'h-3.5 w-3.5 transition-transform duration-200',
                                  isSubmenuOpen && 'rotate-90',
                                )}
                              />
                            </button>
                          </div>

                          {isSubmenuOpen && item.children && (
                            <div className="relative ml-5 space-y-0.5 border-l-2 border-border/70 pl-2 pb-1">
                              {item.children.map((sub) => renderSubItem(sub))}
                            </div>
                          )}
                        </div>
                      )
                    }

                    return (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.end}
                        onClick={() => setIsMobileMenuOpen(false)}
                        className={({ isActive }) =>
                          cn(
                            'nav-item relative flex items-center justify-between',
                            isActive && 'nav-item-active',
                          )
                        }
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} />
                          <span className="truncate">{item.label}</span>
                        </div>
                        {item.badge !== undefined && item.badge > 0 && (
                          <Badge
                            variant="secondary"
                            className="h-5 border-0 bg-primary px-1.5 text-[11px] font-extrabold text-white shadow-xs"
                          >
                            {item.badge > 99 ? '99+' : item.badge}
                          </Badge>
                        )}
                      </NavLink>
                    )
                  })}
                </nav>
              </div>
            </div>
          </div>
        )}

        {/* CONTEÚDO PRINCIPAL (ajusta margem esquerda com base em isCollapsed) */}
        <main
          className={cn(
            'min-h-screen pb-[calc(88px+env(safe-area-inset-bottom))] transition-[margin-left] duration-300 ease-in-out lg:pb-0',
            isCollapsed ? 'lg:ml-20' : 'lg:ml-64',
          )}
        >
          <Outlet />
        </main>
      </div>
    </TooltipProvider>
  )
}
