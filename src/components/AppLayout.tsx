import { useState } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import {
  BadgeDollarSign,
  Building2,
  CalendarDays,
  ChevronDown,
  CircleUserRound,
  CreditCard,
  FilePenLine,
  Grid2X2,
  Home,
  LogOut,
  Menu,
  MoreHorizontal,
  PackageOpen,
  Receipt,
  Settings,
  SlidersHorizontal,
  Store,
  Tags,
  UserRound,
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Brand } from '@/components/Brand'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'
import { initials, roleLabel } from '@/lib/format'
import pb from '@/lib/pocketbase/client'

const desktopItems = [
  { to: '/', label: 'Dashboard', icon: Grid2X2, end: true },
  { to: '/despesas', label: 'Despesas', icon: Receipt },
  { to: '/lancamentos', label: 'Lançamentos', icon: BadgeDollarSign },
  { to: '/contas', label: 'Contas & Cartões', icon: WalletCards },
  { to: '/categorias', label: 'Classificações', icon: Tags },
  { to: '/marketplaces', label: 'Marketplaces', icon: Store },
  { to: '/cadastros', label: 'Cadastros', icon: Building2 },
  { to: '/configuracoes', label: 'Configurações', icon: Settings },
]

const mobileItems = [
  { to: '/', label: 'Início', icon: Home, end: true },
  { to: '/despesas', label: 'Despesas', icon: Receipt },
  { to: '/lancamentos', label: 'Caixa', icon: BadgeDollarSign },
  { to: '/marketplaces', label: 'Vendas', icon: Store },
]

export function AppLayout() {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [moreOpen, setMoreOpen] = useState(false)
  const avatarUrl = user?.avatar ? pb.files.getURL(user, user.avatar, { thumb: '100x100' }) : ''
  const signOut = () => {
    logout()
    navigate('/login')
  }

  return (
    <div className="min-h-screen bg-background">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-white lg:flex">
        <div className="px-6 py-5">
          <Brand />
        </div>
        <div className="px-3 pb-3">
          <ContextSelector />
        </div>
        <nav className="flex-1 space-y-1 px-3" aria-label="Navegação principal">
          {desktopItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) => cn('nav-item', isActive && 'nav-item-active')}
            >
              <Icon className="h-5 w-5" strokeWidth={1.75} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-border p-3">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-xl p-2 text-left transition hover:bg-secondary/60">
                <Avatar className="h-10 w-10 border border-border">
                  <AvatarImage src={avatarUrl} alt={user?.name} />
                  <AvatarFallback>{initials(user?.name)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold">{user?.name}</span>
                  <Badge variant="secondary" className="mt-1 h-5 px-2 text-[10px]">
                    {roleLabel(user?.role)}
                  </Badge>
                </span>
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" side="top" className="w-56">
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

      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-border/80 bg-background/95 px-4 backdrop-blur lg:hidden">
        <div className="flex items-center gap-3">
          <Brand />
          <ContextSelector className="w-auto min-w-[120px] max-w-[170px]" compact />
        </div>
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
      </header>

      <main className="min-h-screen pb-[calc(88px+env(safe-area-inset-bottom))] lg:ml-60 lg:pb-0">
        <div
          key={location.pathname}
          className="route-enter mx-auto w-full max-w-[1480px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8"
        >
          <Outlet />
        </div>
      </main>

      <nav className="mobile-nav lg:hidden" aria-label="Navegação móvel">
        {mobileItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn('mobile-nav-item', isActive && 'mobile-nav-item-active')
            }
          >
            <Icon className="h-5 w-5" strokeWidth={1.75} />
            <span>{label}</span>
          </NavLink>
        ))}
        <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
          <SheetTrigger asChild>
            <button className="mobile-nav-item">
              <MoreHorizontal className="h-5 w-5" />
              <span>Mais</span>
            </button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            className="rounded-t-[24px] pb-[calc(24px+env(safe-area-inset-bottom))]"
          >
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-border" />
            <SheetHeader className="text-left">
              <SheetTitle>Mais opções</SheetTitle>
              <SheetDescription>Acesse recursos e configurações da sua conta.</SheetDescription>
            </SheetHeader>
            <div className="mt-6 grid gap-2">
              {[
                ['/contas', 'Contas financeiras & Cartões', WalletCards],
                ['/categorias', 'Hub de Classificações', Tags],
                ['/cadastros', 'Empresas & Pessoas', Building2],
                ['/configuracoes', 'Configurações', SlidersHorizontal],
              ].map(([to, label, Icon]) => (
                <Button
                  key={to as string}
                  variant="ghost"
                  className="h-12 justify-start"
                  asChild
                  onClick={() => setMoreOpen(false)}
                >
                  <Link to={to as string}>
                    <Icon className="mr-3 h-5 w-5" />
                    {label as string}
                  </Link>
                </Button>
              ))}
              <Button
                variant="ghost"
                className="h-12 justify-start text-destructive"
                onClick={signOut}
              >
                <LogOut className="mr-3 h-5 w-5" />
                Sair
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </div>
  )
}
