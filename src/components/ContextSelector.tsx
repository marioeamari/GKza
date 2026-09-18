import { Check, ChevronDown, Plus, UserRound, Building2 } from 'lucide-react'
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
  const { activeContext, setContextPessoal, setContextEmpresa, empresas } = useAppContext()

  const isPessoal = activeContext.type === 'pessoal'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            'group flex w-full items-center justify-between gap-2.5 rounded-xl border border-border/80 bg-secondary/40 p-2 text-left transition hover:border-primary/40 hover:bg-secondary/70 focus:outline-none focus:ring-2 focus:ring-primary/20',
            className,
          )}
          title="Alternar contexto (CPF ou CNPJs)"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            <span
              className={cn(
                'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white shadow-xs',
                isPessoal ? 'bg-[#DF5830]' : 'bg-[#1E6F5C]',
              )}
            >
              {isPessoal ? <UserRound className="h-4 w-4" /> : <Building2 className="h-4 w-4" />}
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
      <DropdownMenuContent align="start" className="w-64 p-1.5">
        <DropdownMenuLabel className="px-2 py-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Contexto de visualização
        </DropdownMenuLabel>
        <DropdownMenuItem
          onClick={setContextPessoal}
          className={cn(
            'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium',
            isPessoal && 'bg-primary/10 font-bold text-primary',
          )}
        >
          <div className="flex items-center gap-2.5">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-[#DF5830]/15 text-[#DF5830]">
              <UserRound className="h-3.5 w-3.5" />
            </span>
            <div>
              <p className="font-bold text-foreground">Pessoal (CPF)</p>
              <p className="text-[10px] text-muted-foreground">Despesas pessoais e casa</p>
            </div>
          </div>
          {isPessoal && <Check className="h-4 w-4 text-primary" />}
        </DropdownMenuItem>

        <DropdownMenuSeparator className="my-1.5" />

        <div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Empresas (CNPJ)
        </div>

        {empresas.length === 0 ? (
          <div className="px-2.5 py-2 text-xs text-muted-foreground">
            Nenhuma empresa cadastrada.
          </div>
        ) : (
          empresas.map((emp) => {
            const isSelected =
              activeContext.type === 'empresa' && activeContext.empresaId === emp.id
            return (
              <DropdownMenuItem
                key={emp.id}
                onClick={() => setContextEmpresa(emp.id)}
                className={cn(
                  'flex cursor-pointer items-center justify-between rounded-lg px-2.5 py-2 text-xs font-medium',
                  isSelected && 'bg-[#1E6F5C]/15 font-bold text-[#1E6F5C]',
                )}
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-[#1E6F5C]/15 text-[#1E6F5C]">
                    <Building2 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-foreground">
                      {emp.nome_fantasia || emp.razao_social}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {emp.cnpj ? `CNPJ ${emp.cnpj}` : 'Empresa'}
                    </p>
                  </div>
                </div>
                {isSelected && <Check className="h-4 w-4 text-[#1E6F5C]" />}
              </DropdownMenuItem>
            )
          })
        )}

        <DropdownMenuSeparator className="my-1.5" />
        <DropdownMenuItem
          asChild
          className="cursor-pointer rounded-lg px-2.5 py-2 text-xs font-semibold text-primary"
        >
          <Link to="/cadastros">
            <Plus className="mr-2 h-3.5 w-3.5" />
            Gerenciar empresas / cadastros
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
