import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  Building2,
  Mail,
  MapPin,
  PackagePlus,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
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
import { precificacaoService } from '@/services/precificacao'
import type { Empresa } from '@/types/domain'

export default function Empresas() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [companies, setCompanies] = useState<Empresa[]>([])
  const [contagemProdutos, setContagemProdutos] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [companyDialog, setCompanyDialog] = useState(false)
  const [dialogTab, setDialogTab] = useState<'dados' | 'produtos'>('dados')
  const [editingCompany, setEditingCompany] = useState<Empresa | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [data, todosProdutos] = await Promise.all([
        cadastrosService.listEmpresas(),
        precificacaoService.listProdutos().catch(() => []),
      ])
      setCompanies(data)

      const contagem: Record<string, number> = {}
      for (const prod of todosProdutos) {
        if (prod.empresa && prod.tipo === 'fabricacao_propria') {
          contagem[prod.empresa] = (contagem[prod.empresa] || 0) + 1
        }
      }
      setContagemProdutos(contagem)
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
    setDialogTab('dados')
    setCompanyDialog(true)
  }

  const openFicha = (c: Empresa, tab: 'dados' | 'produtos' = 'dados') => {
    setEditingCompany(c)
    setDialogTab(tab)
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
      {/* Callout explicativo da função da página de Empresas */}
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm text-foreground flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="font-bold text-foreground">Cadastro de Empresas & Fabricação Própria</p>
          <p className="text-muted-foreground leading-relaxed">
            Aqui você gerencia as empresas e cadastra os produtos de fabricação própria na ficha da
            empresa (aba Produtos). Para produtos de revenda, use a ficha do fornecedor em{' '}
            <Link
              to="/fornecedores"
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Fornecedores
            </Link>
            . Para simular preços, margens e kits, acesse{' '}
            <Link
              to="/precificacao/produtos"
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Precificação: Produtos & Kits
            </Link>
            .
          </p>
        </div>
      </div>

      <PageHeader
        title="Empresas"
        description="Cadastro e ficha detalhada das empresas do sistema. Cada empresa atua como fornecedor de fabricação própria, com dados cadastrais e produtos fabricados para precificação."
        action={
          <div className="flex items-center gap-2">
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <Link to="/pessoas">
                <UserRound className="mr-2 h-4 w-4" />
                Pessoas
              </Link>
            </Button>
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <Link to="/fornecedores">
                <Truck className="mr-2 h-4 w-4" />
                Fornecedores
              </Link>
            </Button>
            <Button variant="outline" asChild className="hidden sm:inline-flex">
              <Link to="/precificacao/produtos">
                <PackagePlus className="mr-2 h-4 w-4 text-primary" />
                Precificação de Produtos
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
              className="card-hover rise-in rounded-2xl border border-border bg-white p-5 shadow-soft cursor-pointer group flex flex-col justify-between"
              style={{ animationDelay: `${i * 40}ms` }}
              onClick={() => openFicha(c, 'dados')}
            >
              <div>
                <div className="flex items-start justify-between">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div onClick={(ev) => ev.stopPropagation()}>
                    {writable && (
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => openFicha(c, 'dados')}
                        title="Ver ficha da empresa"
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
                <h2 className="mt-4 font-bold text-foreground group-hover:text-primary transition-colors">
                  {c.nome_fantasia}
                </h2>
                <p className="mt-1 text-xs text-muted-foreground">{c.razao_social}</p>
                <div className="mt-3 flex items-center gap-2">
                  <Badge variant="secondary" className="tabular-nums font-mono text-[11px]">
                    {c.cnpj}
                  </Badge>
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Fabricação Própria
                  </Badge>
                </div>
                <div className="mt-4 space-y-2 border-t border-border pt-4 text-xs text-muted-foreground">
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
              </div>

              {/* Seção de produtos fabricados da empresa (análogo a fornecedores) */}
              <div
                className="mt-4 pt-3 border-t border-border flex items-center justify-between"
                onClick={(ev) => ev.stopPropagation()}
              >
                <button
                  type="button"
                  onClick={() => openFicha(c, 'produtos')}
                  className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline font-semibold"
                >
                  <Boxes className="h-3.5 w-3.5" />
                  <span>
                    {contagemProdutos[c.id]
                      ? `${contagemProdutos[c.id]} produto(s) fabricado(s)`
                      : '0 produtos fabricados'}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground"
                  onClick={() => openFicha(c, 'dados')}
                >
                  Ver Ficha
                </Button>
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
        defaultTab={dialogTab}
        canWrite={writable}
        canDelete={can(user?.role, 'deleteFinance')}
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
