import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Building2,
  Mail,
  MapPin,
  Package,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
  UserRound,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { EmpresaDialog } from '@/components/cadastros/EmpresaDialog'
import { MobileSubpagesMenu, MobileSubpageItem } from '@/components/MobileSubpagesMenu'
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiMessage } from '@/lib/api-error'
import { onlyDigits } from '@/lib/documents'
import { can } from '@/lib/permissions'
import { cadastrosService } from '@/services/cadastros'
import type { Empresa, Pessoa } from '@/types/domain'

export default function Cadastros() {
  const { user } = useAuth(),
    { toast } = useToast()
  const [params, setParams] = useSearchParams(),
    type = params.get('tipo') === 'pessoas' ? 'pessoas' : 'empresas',
    [companies, setCompanies] = useState<Empresa[]>([]),
    [people, setPeople] = useState<Pessoa[]>([]),
    [loading, setLoading] = useState(true),
    [search, setSearch] = useState(''),
    [companyDialog, setCompanyDialog] = useState(false),
    [personDialog, setPersonDialog] = useState(false),
    [editingCompany, setEditingCompany] = useState<Empresa | null>(null),
    [editingPerson, setEditingPerson] = useState<Pessoa | null>(null),
    [deleting, setDeleting] = useState<{
      type: 'empresa' | 'pessoa'
      id: string
      label: string
    } | null>(null)
  const load = useCallback(async () => {
    try {
      const [a, b] = await Promise.all([
        cadastrosService.listEmpresas(),
        cadastrosService.listPessoas(),
      ])
      setCompanies(a)
      setPeople(b)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar cadastros',
        description: apiMessage(e),
      })
    } finally {
      setLoading(false)
    }
  }, [toast])
  useEffect(() => {
    load()
  }, [load])
  const normalized = search.toLocaleLowerCase('pt-BR'),
    digits = onlyDigits(search)
  const filteredCompanies = useMemo(
      () =>
        companies.filter(
          (c) =>
            c.razao_social.toLocaleLowerCase('pt-BR').includes(normalized) ||
            c.nome_fantasia.toLocaleLowerCase('pt-BR').includes(normalized) ||
            (digits && onlyDigits(c.cnpj).includes(digits)),
        ),
      [companies, normalized, digits],
    ),
    filteredPeople = useMemo(
      () =>
        people.filter(
          (p) =>
            p.nome.toLocaleLowerCase('pt-BR').includes(normalized) ||
            (digits && onlyDigits(p.cpf).includes(digits)),
        ),
      [people, normalized, digits],
    )
  const create = () =>
    type === 'empresas'
      ? (setEditingCompany(null), setCompanyDialog(true))
      : (setEditingPerson(null), setPersonDialog(true))
  const remove = async () => {
    if (!deleting) return
    try {
      if (deleting.type === 'empresa') await cadastrosService.deleteEmpresa(deleting.id)
      else await cadastrosService.deletePessoa(deleting.id)
      toast({ title: 'Cadastro excluído' })
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

  const subpaginasCadastros: MobileSubpageItem[] = [
    {
      to: '/empresas',
      label: 'Empresas (CNPJ)',
      description: 'Gestão de empresas e fabricação própria',
      icon: Building2,
    },
    {
      to: '/pessoas',
      label: 'Pessoas (CPF)',
      description: 'Pessoas físicas, sócios e titulares',
      icon: UserRound,
    },
    {
      to: '/fornecedores',
      label: 'Fornecedores (PJ/PF)',
      description: 'Fornecedores, insumos e revenda',
      icon: Truck,
    },
    {
      to: '/composicao-produtos?aba=base',
      label: 'Insumos (Produtos Base)',
      description: 'Catálogo de insumos, embalagens, etiquetas e serviços de custo',
      icon: Package,
    },
  ]

  return (
    <>
      <PageHeader
        title="Cadastros"
        description="Empresas e pessoas relacionadas ao seu negócio."
        action={
          <PermissionButton allowed={writable} onClick={create}>
            <Plus className="mr-2 h-4 w-4" />
            {type === 'empresas' ? 'Nova empresa' : 'Nova pessoa'}
          </PermissionButton>
        }
      />

      {/* Menu Vertical de Subpáginas exclusivo Mobile na raiz de cadastros */}
      <MobileSubpagesMenu
        titulo="Áreas de Cadastros"
        descricao="Acesse os módulos cadastrais:"
        subpaginas={subpaginasCadastros}
      />
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <Tabs value={type} onValueChange={(v) => setParams(v === 'empresas' ? {} : { tipo: v })}>
            <TabsList className="grid w-full grid-cols-2 sm:w-[300px]">
              <TabsTrigger value="empresas">
                <Building2 className="mr-2 h-4 w-4" />
                Empresas
              </TabsTrigger>
              <TabsTrigger value="pessoas">
                <UserRound className="mr-2 h-4 w-4" />
                Pessoas
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
        <div className="relative w-full sm:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-10"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar por nome ou ${type === 'empresas' ? 'CNPJ' : 'CPF'}...`}
          />
        </div>
      </div>
      {type === 'empresas' ? (
        filteredCompanies.length ? (
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
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                    )}
                    {can(user?.role, 'deleteFinance') && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="text-destructive"
                        onClick={() =>
                          setDeleting({ type: 'empresa', id: c.id, label: c.nome_fantasia })
                        }
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
                    <p className="flex items-center gap-2">
                      <Mail className="h-3.5 w-3.5" />
                      {c.email}
                    </p>
                  )}
                  {c.telefone && (
                    <p className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5" />
                      {c.telefone}
                    </p>
                  )}
                  {c.endereco && (
                    <p className="flex items-start gap-2">
                      <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {c.endereco}
                    </p>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <EmptyState
            title="Nenhuma empresa encontrada"
            description="Ajuste a busca ou adicione um novo cadastro."
          />
        )
      ) : filteredPeople.length ? (
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
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                  )}
                  {can(user?.role, 'deleteFinance') && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="text-destructive"
                      onClick={() => setDeleting({ type: 'pessoa', id: p.id, label: p.nome })}
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
                  <p className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5" />
                    {p.email}
                  </p>
                )}
                {p.telefone && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-3.5 w-3.5" />
                    {p.telefone}
                  </p>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          title="Nenhuma pessoa encontrada"
          description="Ajuste a busca ou adicione um novo cadastro."
        />
      )}
      <EmpresaDialog
        open={companyDialog}
        onOpenChange={setCompanyDialog}
        record={editingCompany}
        onSaved={load}
      />
      <PessoaDialog
        open={personDialog}
        onOpenChange={setPersonDialog}
        record={editingPerson}
        onSaved={load}
      />
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.label}” será removido. Verifique se não há lançamentos vinculados.
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
