import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmpresaDialog } from '@/components/cadastros/EmpresaDialog'
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
import type { Empresa } from '@/types/domain'

export default function Empresas() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [companies, setCompanies] = useState<Empresa[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [companyDialog, setCompanyDialog] = useState(false)
  const [editingCompany, setEditingCompany] = useState<Empresa | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const data = await cadastrosService.listEmpresas()
      setCompanies(data)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar empresas',
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

  const filteredCompanies = useMemo(
    () =>
      companies.filter(
        (c) =>
          c.razao_social.toLocaleLowerCase('pt-BR').includes(normalized) ||
          c.nome_fantasia.toLocaleLowerCase('pt-BR').includes(normalized) ||
          (digits && onlyDigits(c.cnpj).includes(digits)),
      ),
    [companies, normalized, digits],
  )

  const create = () => {
    setEditingCompany(null)
    setCompanyDialog(true)
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await cadastrosService.deleteEmpresa(deleting.id)
      toast({ title: 'Empresa excluída com sucesso' })
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
        title="Empresas"
        description="Cadastro e gerenciamento de pessoas jurídicas (CNPJ), fornecedores e clientes."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <Link to="/pessoas">
                <UserRound className="mr-2 h-4 w-4" />
                Ver pessoas
              </Link>
            </Button>
            <PermissionButton allowed={writable} onClick={create}>
              <Plus className="mr-2 h-4 w-4" />
              Nova empresa
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
            placeholder="Buscar por nome fantasia, razão social ou CNPJ..."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filteredCompanies.length === 1
            ? '1 empresa encontrada'
            : `${filteredCompanies.length} empresas encontradas`}
        </p>
      </div>

      {filteredCompanies.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredCompanies.map((c, i) => (
            <article
              key={c.id}
              className="card-hover rise-in rounded-2xl border border-border bg-white p-5 shadow-soft"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="flex items-start justify-between">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <div>
                  {writable && (
                    <Button
                      size="icon"
                      variant="ghost"
                      onClick={() => {
                        setEditingCompany(c)
                        setCompanyDialog(true)
                      }}
                      title="Editar empresa"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {can(user?.role, 'deleteFinance') && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleting({ id: c.id, label: c.nome_fantasia })}
                      title="Excluir empresa"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              <h2 className="mt-4 font-bold">{c.nome_fantasia}</h2>
              <p className="mt-1 text-xs text-muted-foreground">{c.razao_social}</p>
              <Badge variant="secondary" className="mt-3 tabular-nums">
                {c.cnpj}
              </Badge>
              <div className="mt-5 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
                {c.email && (
                  <p className="flex items-center gap-2 truncate">
                    <Mail className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </p>
                )}
                {c.telefone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5 shrink-0" />
                    <span>{c.telefone}</span>
                  </p>
                )}
                {c.endereco && (
                  <p className="flex items-start gap-2">
                    <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span className="line-clamp-2">{c.endereco}</span>
                  </p>
                )}
                {c.observacoes && (
                  <p className="italic text-muted-foreground/80 line-clamp-2 pt-1 border-t border-dashed border-border/60">
                    {c.observacoes}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma empresa encontrada"
          description="Ajuste a busca ou adicione uma nova empresa com CNPJ válido."
        />
      )}

      <EmpresaDialog
        open={companyDialog}
        onOpenChange={setCompanyDialog}
        record={editingCompany}
        onSaved={load}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro de empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.label}” será removida permanentemente. Verifique se não há lançamentos ou
              despesas vinculadas.
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
