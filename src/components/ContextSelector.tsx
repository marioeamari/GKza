import { Check, ChevronDown, FolderTree, Globe, Plus, Users, Building2, Wallet } from 'lucide-react'
import { Link } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppContext } from '@/contexts/AppContext'
import { cn } from '@/lib/utils'

interface ContextSelectorProps {
  className?: string
  compact?: boolean
}

export function ContextSelector({ className, compact = false }: ContextSelectorProps) {
  const { activeContext, setContextAll, setContextGroup, grupos } = useAppContext()

  const isAll = activeContext.isAll

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'group flex w-full items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-secondary/40 p-2 text-left transition hover:border-primary/40 hover:bg-secondary/70 focus:outline-none focus:ring-2 focus:ring-primary/20',
            className,
          )}
          title="Alternar contexto de visualização"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-xs transition-colors"
              style={{
                background: isAll ? '#DF5830' : activeContext.color || '#1E6F5C',
              }}
            >
              {isAll ? <Globe className="h-4 w-4" /> : <FolderTree className="h-4 w-4" />}
            </span>
            {!compact && (
              <div className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-foreground">
                  {activeContext.label}
                </span>
                <span className="block truncate text-[10px] text-muted-foreground">
                  {activeContext.sublabel}
                </span>
              </div>
            )}
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground group-hover:text-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-72 p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Contexto de visualização
        </DropdownMenuLabel>

        {/* OPÇÃO: TODOS */}
        <DropdownMenuItem
          onClick={setContextAll}
          className={cn(
            'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium',
            isAll && 'bg-primary/10 font-bold text-primary',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#DF5830]/15 text-[#DF5830]">
              <Globe className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="font-bold text-foreground">Todos</p>
              <p className="text-[10px] text-muted-foreground">Visão consolidada de tudo</p>
            </div>
          </div>
          {isAll && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1.5" />

        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Grupos de Contexto
        </div>

        {grupos.length === 0 ? (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">
            Nenhum grupo criado ainda.
          </div>
        ) : (
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {grupos.map((grp) => {
              const isSelected = !isAll && activeContext.groupId === grp.id
              const totalMembros = grp.pessoas.length + grp.empresas.length + grp.contas.length

              return (
                <DropdownMenuItem
                  key={grp.id}
                  onClick={() => setContextGroup(grp.id)}
                  className={cn(
                    'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium',
                    isSelected && 'bg-secondary font-bold',
                  )}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-white shadow-xs"
                      style={{ background: grp.cor || '#DF5830' }}
                    >
                      <FolderTree className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-bold text-foreground">{grp.nome}</p>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {totalMembros > 0
                          ? `${grp.pessoas.length > 0 ? `${grp.pessoas.length} pess ` : ''}${
                              grp.empresas.length > 0 ? `${grp.empresas.length} emp ` : ''
                            }${grp.contas.length > 0 ? `${grp.contas.length} ctas` : ''}`
                          : grp.observacoes || 'Sem membros'}
                      </p>
                    </div>
                  </div>
                  {isSelected && (
                    <Check className="h-4 w-4 shrink-0" style={{ color: grp.cor || '#DF5830' }} />
                  )}
                </DropdownMenuItem>
              )
            })}
          </div>
        )}

        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold text-primary"
        >
          <Link to="/categorias?tab=contexto">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Gerenciar Contextos de Visualização
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
