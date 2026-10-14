import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Mail,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
  FileSpreadsheet,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { ClienteDialog } from '@/components/precificacao/ClienteDialog'
import { EmptyState, LoadingState } from '@/components/LoadingState'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { onlyDigits } from '@/lib/documents'
import { clientesOrcamentoService } from '@/services/clientesOrcamento'
import { ClienteOrcamentoRecord, TipoClienteOrcamento } from '@/types/orcamento'

export default function PrecificacaoClientes() {
  const { toast } = useToast()
  const [clientes, setClientes] = useState<ClienteOrcamentoRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tipoFiltro, setTipoFiltro] = useState<'todos' | TipoClienteOrcamento>('todos')
  const [dialogAberto, setDialogAberto] = useState(false)
  const [clienteEdicao, setClienteEdicao] = useState<ClienteOrcamentoRecord | null>(null)
  const [deletando, setDeletando] = useState<{ id: string; nome: string } | null>(null)

  const load = useCallback(async () => {
    try {
      setLoading(true)
      const data = await clientesOrcamentoService.listClientes()
      setClientes(data)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar clientes',
        description: apiMessage(e),
      })
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    load()
  }, [load])

  const normalized = search.toLocaleLowerCase('pt-BR')
  const digits = onlyDigits(search)

  const filteredClientes = useMemo(() => {
    return clientes.filter((c) => {
      const matchTipo = tipoFiltro === 'todos' || c.tipo === tipoFiltro
      const matchBusca =
        !search.trim() ||
        c.nome.toLocaleLowerCase('pt-BR').includes(normalized) ||
        (c.documento && onlyDigits(c.documento).includes(digits)) ||
        (c.whatsapp && onlyDigits(c.whatsapp).includes(digits)) ||
        (c.telefone && onlyDigits(c.telefone).includes(digits)) ||
        (c.email && c.email.toLocaleLowerCase('pt-BR').includes(normalized))

      return matchTipo && matchBusca
    })
  }, [clientes, normalized, digits, tipoFiltro, search])

  const handleCriar = () => {
    setClienteEdicao(null)
    setDialogAberto(true)
  }

  const handleEditar = (c: ClienteOrcamentoRecord) => {
    setClienteEdicao(c)
    setDialogAberto(true)
  }

  const handleExcluir = async () => {
    if (!deletando) return
    try {
      await clientesOrcamentoService.deleteCliente(deletando.id)
      toast({ title: 'Cliente excluído com sucesso' })
      load()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir cliente',
        description: apiMessage(e),
      })
    } finally {
      setDeletando(null)
    }
  }

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Clientes de Orçamentos"
        subtitulo="Base própria de clientes (PF e PJ) para propostas comerciais, isolada do registro financeiro de pessoas"
        acoes={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link to="/precificacao/orcamentos">
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Ver Orçamentos
              </Link>
            </Button>
            <Button
              size="sm"
              onClick={handleCriar}
              className="bg-primary hover:bg-primary/90 text-white font-bold shadow-xs"
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo Cliente
            </Button>
          </div>
        }
      />

      {/* Barra de Filtro e Busca */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9 h-9 text-xs sm:text-sm"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome, CPF/CNPJ, WhatsApp..."
          />
        </div>

        <div className="flex items-center gap-2">
          {(['todos', 'pessoa_fisica', 'pessoa_juridica'] as const).map((tipo) => {
            const isSelected = tipoFiltro === tipo
            const labels = {
              todos: 'Todos',
              pessoa_fisica: 'Pessoa Física',
              pessoa_juridica: 'Pessoa Jurídica',
            }
            return (
              <Button
                key={tipo}
                size="sm"
                variant={isSelected ? 'default' : 'outline'}
                onClick={() => setTipoFiltro(tipo)}
                className={`text-xs font-semibold ${
                  isSelected ? 'bg-primary text-white hover:bg-primary/90' : 'border-border'
                }`}
              >
                {labels[tipo]}
              </Button>
            )
          })}
        </div>
      </div>

      {loading ? (
        <LoadingState />
      ) : filteredClientes.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredClientes.map((c, i) => {
            const isPJ = c.tipo === 'pessoa_juridica'
            return (
              <article
                key={c.id}
                className="card-hover rise-in rounded-2xl border border-border/80 bg-white p-5 shadow-xs hover:border-primary/40 transition-colors"
                style={{ animationDelay: `${i * 30}ms` }}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={`grid h-10 w-10 place-items-center rounded-xl ${
                      isPJ ? 'bg-blue-50 text-blue-700' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {isPJ ? <Building2 className="h-5 w-5" /> : <UserRound className="h-5 w-5" />}
                  </span>
                  <div className="flex items-center gap-1">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-muted-foreground hover:text-foreground"
                      onClick={() => handleEditar(c)}
                      title="Editar cliente"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setDeletando({ id: c.id, nome: c.nome })}
                      title="Excluir cliente"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <h2 className="mt-3 font-bold text-base text-foreground truncate">{c.nome}</h2>

                <div className="flex items-center gap-2 mt-1.5">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-semibold ${
                      isPJ
                        ? 'border-blue-200 text-blue-700 bg-blue-50/50'
                        : 'border-slate-200 text-slate-700 bg-slate-50'
                    }`}
                  >
                    {isPJ ? 'Pessoa Jurídica (PJ)' : 'Pessoa Física (PF)'}
                  </Badge>
                  {c.documento && (
                    <span className="text-xs font-mono text-muted-foreground">{c.documento}</span>
                  )}
                </div>

                <div className="mt-4 space-y-1.5 border-t border-border/60 pt-3 text-xs text-muted-foreground">
                  {c.whatsapp && (
                    <p className="flex items-center gap-2 text-slate-800 font-medium">
                      <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      <span>{c.whatsapp}</span>
                      <span className="text-[10px] text-emerald-700 bg-emerald-50 px-1 rounded">
                        WhatsApp
                      </span>
                    </p>
                  )}
                  {c.telefone && c.telefone !== c.whatsapp && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 shrink-0" />
                      <span>{c.telefone}</span>
                    </p>
                  )}
                  {c.email && (
                    <p className="flex items-center gap-2 truncate">
                      <Mail className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{c.email}</span>
                    </p>
                  )}
                  {c.observacoes && (
                    <p className="italic text-muted-foreground/80 line-clamp-2 pt-1 border-t border-dashed border-border/40">
                      {c.observacoes}
                    </p>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="Nenhum cliente encontrado"
          description={
            search || tipoFiltro !== 'todos'
              ? 'Ajuste os filtros de busca para encontrar o cliente.'
              : 'Cadastre seu primeiro cliente para utilizar no formulário de orçamentos.'
          }
        />
      )}

      <ClienteDialog
        open={dialogAberto}
        onOpenChange={setDialogAberto}
        record={clienteEdicao}
        onSaved={() => load()}
      />

      <AlertDialog open={!!deletando} onOpenChange={(v) => !v && setDeletando(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente do módulo de orçamentos?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deletando?.nome}” será removido. Orçamentos já emitidos mantêm o nome e WhatsApp
              gravados no momento da criação.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleExcluir} className="bg-destructive text-white">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
