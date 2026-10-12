import { Link, useLocation } from 'react-router-dom'
import { Boxes, Layers, Settings2, FileSpreadsheet, History, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'

interface TabItem {
  to: string
  label: string
  icon: typeof Boxes
  badge?: string
}

const tabs: TabItem[] = [
  { to: '/expedicao/separacao', label: 'Separação de Kits', icon: Boxes },
  { to: '/expedicao/temas-modelos', label: 'Temas e Modelos', icon: Layers },
  { to: '/expedicao/regras', label: 'Regras de Composição', icon: Settings2 },
  { to: '/expedicao/pedidos', label: 'Pedidos / Personalizações', icon: FileSpreadsheet },
  { to: '/expedicao/historico', label: 'Histórico de Separação', icon: History },
]

interface ExpedicaoHeaderProps {
  title?: string
  description?: string
}

export function ExpedicaoHeader({
  title = 'Expedição → Separação de Kits',
  description = 'Orientação visual exata para separação de kits vendidos em marketplaces.',
}: ExpedicaoHeaderProps) {
  const location = useLocation()

  return (
    <div className="mb-6 space-y-4">
      {/* Topo do Módulo */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Módulo de Expedição
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">
            {title}
          </h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
      </div>

      {/* Navegação entre as 4 áreas + histórico (visível no desktop; no mobile a raiz possui menu vertical) */}
      <div className="hidden lg:flex overflow-x-auto border-b border-border/70 pb-px scrollbar-none">
        <nav className="flex min-w-max gap-1">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = location.pathname === tab.to
            return (
              <Link
                key={tab.to}
                to={tab.to}
                className={cn(
                  'flex items-center gap-2 rounded-t-lg border-b-2 px-4 py-2.5 text-xs font-bold transition-colors sm:text-sm',
                  isActive
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-transparent text-muted-foreground hover:bg-secondary/60 hover:text-foreground',
                )}
              >
                <Icon className={cn('h-4 w-4', isActive ? 'text-primary' : '')} />
                <span>{tab.label}</span>
                {tab.badge && (
                  <span className="ml-1 rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {tab.badge}
                  </span>
                )}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
