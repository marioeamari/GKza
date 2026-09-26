import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import {
  Calculator,
  LayoutDashboard,
  Layers,
  Store,
  PackageCheck,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface PrecHeaderProps {
  titulo: string
  subtitulo?: string
  acoes?: React.ReactNode
}

export function PrecHeader({ titulo, subtitulo, acoes }: PrecHeaderProps) {
  const location = useLocation()

  const tabs = [
    { to: '/precificacao', label: 'Visão Geral & Hub', icon: Layers, end: true },
    { to: '/precificacao/comparar', label: 'Comparador Lado a Lado', icon: Calculator },
    { to: '/precificacao/dashboard', label: 'Dashboard de Margens', icon: LayoutDashboard },
    { to: '/precificacao/produtos', label: 'Produtos & Custos', icon: PackageCheck },
    { to: '/precificacao/canais', label: 'Canais & Taxas', icon: Store },
  ]

  return (
    <div className="mb-6 space-y-4">
      {/* Breadcrumb / Top Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground mb-1">
            <span className="text-primary font-bold">ERP GKza</span>
            <ChevronRight className="h-3 w-3" />
            <span>Módulo de Precificação</span>
          </div>
          <h1 className="text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {titulo}
          </h1>
          {subtitulo && <p className="mt-1 text-sm text-muted-foreground">{subtitulo}</p>}
        </div>
        {acoes && <div className="flex flex-wrap items-center gap-2">{acoes}</div>}
      </div>

      {/* Navegação Própria do Módulo */}
      <div className="flex overflow-x-auto border-b border-border/80 scrollbar-none pb-0.5">
        <nav className="flex space-x-2" aria-label="Abas do módulo de precificação">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = tab.end
              ? location.pathname === tab.to
              : location.pathname.startsWith(tab.to)

            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  'flex items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs sm:text-sm font-semibold transition-colors',
                  isActive
                    ? 'border-primary text-primary font-bold'
                    : 'border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground')}
                />
                <span>{tab.label}</span>
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
