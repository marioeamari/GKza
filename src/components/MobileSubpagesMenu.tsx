import React from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface MobileSubpageItem {
  to: string
  label: string
  description?: string
  icon: LucideIcon
  badge?: string | number
  highlight?: boolean
}

export interface MobileSubpagesMenuProps {
  titulo?: string
  descricao?: string
  subpaginas: MobileSubpageItem[]
  className?: string
}

/**
 * Menu vertical de subpáginas exclusivo para visualização móvel (< lg).
 * Renderizado centralizado na página raiz do módulo, permitindo navegação
 * intuitiva e em formato de lista/cards conforme padrão visual do ERP GKza.
 */
export function MobileSubpagesMenu({
  titulo = 'Subpáginas do Módulo',
  descricao = 'Selecione uma área para navegar:',
  subpaginas,
  className,
}: MobileSubpagesMenuProps) {
  const location = useLocation()

  return (
    <section
      aria-label={titulo}
      data-testid="mobile-subpages-menu"
      className={cn(
        'block lg:hidden w-full max-w-xl mx-auto my-4 rounded-2xl border border-primary/20 bg-white p-4 sm:p-5 shadow-soft',
        className,
      )}
    >
      <div className="text-center mb-4">
        <span className="inline-block text-[10px] font-black uppercase tracking-wider text-primary bg-primary/10 px-2.5 py-0.5 rounded-full mb-1">
          Navegação Móvel
        </span>
        <h2 className="text-base sm:text-lg font-black text-foreground tracking-tight">{titulo}</h2>
        {descricao && <p className="text-xs text-muted-foreground mt-0.5">{descricao}</p>}
      </div>

      <nav className="flex flex-col gap-2" aria-label={`Subpáginas de ${titulo}`}>
        {subpaginas.map((item) => {
          const Icon = item.icon
          const isActive =
            location.pathname === item.to ||
            (item.to !== '/' && location.pathname.startsWith(`${item.to}/`))

          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                'group flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-all active:scale-[0.99]',
                isActive
                  ? 'border-primary bg-primary/5 text-primary shadow-xs'
                  : 'border-border/80 bg-stone-50/50 hover:bg-stone-100 hover:border-primary/40 text-foreground',
              )}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                    isActive
                      ? 'bg-primary text-white shadow-xs'
                      : 'bg-white border border-border text-primary group-hover:bg-primary group-hover:text-white',
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>
                <div className="min-w-0 text-left">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate leading-tight">{item.label}</span>
                    {item.badge !== undefined && (
                      <span className="inline-flex items-center rounded-full bg-primary/15 px-1.5 py-0.2 text-[10px] font-extrabold text-primary">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  {item.description && (
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>
              </div>

              <ChevronRight
                className={cn(
                  'h-4 w-4 shrink-0 transition-transform group-hover:translate-x-0.5',
                  isActive ? 'text-primary' : 'text-muted-foreground',
                )}
              />
            </Link>
          )
        })}
      </nav>
    </section>
  )
}
