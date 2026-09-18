import { useCallback, useEffect, useMemo, useState } from 'react'
import { Building2, Mail, Pencil, Phone, Plus, Search, Trash2, UserRound } from 'lucide-react'
import { Link } from 'react-router-dom'
import { PessoaDialog } from '@/components/cadastros/PessoaDialog'
import { EmptyState, LoadingState } from '@/components/LoadingState'
import { PageHeader } from '@/components/PageHeader'
import { PermissionButton } from '@/components/PermissionButton'
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
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { onlyDigits } from '@/lib/documents'
import { can } from '@/lib/permissions'
import { cadastrosService } from '@/services/cadastros'
import type { Pessoa } from '@/types/domain'

export default function Pessoas() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [people, setPeople] = useState<Pessoa[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [personDialog, setPersonDialog] = useState(false)
  const [editingPerson, setEditingPerson] = useState<Pessoa | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await cadastrosService.listPessoas()
      setPeople(data)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar pessoas',
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

  const filteredPeople = useMemo(
    () =>
      people.filter(
        (p) =>
          p.nome.toLocaleLowerCase('pt-BR').includes(normalized) ||
          (digits && onlyDigits(p.cpf).includes(digits)),
      ),
    [people, normalized, digits],
  )

  const create = () => {
    setEditingPerson(null)
    setPersonDialog(true)
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await cadastrosService.deletePessoa(deleting.id)
      toast({ title: 'Pessoa excluída com sucesso' })
      load()
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir',
        description: apiMessage(e),
      })
    } finally {
      setDeleting(null)
    }
  }

  if (loading) return <LoadingState />
  const writable = can(user?.role, 'writeRegistry')

  return (
    <>
      <PageHeader
        title="Pessoas"
        description="Cadastro e gerenciamento de pessoas físicas (CPF), sócios, contatos e prestadores."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <Link to="/empresas">
                <Building2 className="mr-2 h-4 w-4" />
                Ver empresas
              </Link>
            </Button>
            <PermissionButton allowed={writable} onClick={create}>
              <Plus className="mr-2 h-4 w-4" />
              Nova pessoa
            </PermissionButton>
          </div>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou CPF..."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filteredPeople.length === 1
            ? '1 pessoa encontrada'
            : `${filteredPeople.length} pessoas encontradas`}
        </p>
      </div>

      {filteredPeople.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPeople.map((p, i) => (
            <article
              key={p.id}
              className="card-hover rise-in rounded-2xl border border-border bg-white p-5 shadow-soft"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-full bg-success/10 text-success">
                  <UserRound className="h-5 w-5" />
                </span>
                <div>
                  {writable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingPerson(p)
                        setPersonDialog(true)
                      }}
                      title="Editar pessoa"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {can(user?.role, 'deleteFinance') && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleting({ id: p.id, label: p.nome })}
                      title="Excluir pessoa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <h2 className="mt-4 font-bold">{p.nome}</h2>
              <Badge variant="secondary" className="mt-2 tabular-nums">
                {p.cpf}
              </Badge>
              <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                {p.email && (
                  <p className="flex items-center gap-2 truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{p.email}</span>
                  </p>
                )}
                {p.telefone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{p.telefone}</span>
                  </p>
                )}
                {p.observacoes && (
                  <p className="italic text-muted-foreground/80 line-clamp-2 pt-1 border-t border-dashed border-border/60">
                    {p.observacoes}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma pessoa encontrada"
          description="Ajuste a busca ou adicione uma nova pessoa com CPF válido."
        />
      )}

      <PessoaDialog
        open={personDialog}
        onOpenChange={setPersonDialog}
        record={editingPerson}
        onSaved={load}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro de pessoa?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.label}” será removido(a) permanentemente. Verifique se não há lançamentos
              ou despesas vinculadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
