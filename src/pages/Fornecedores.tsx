import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Boxes,
  Building2,
  Calendar,
  CreditCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Search,
  Trash2,
  Truck,
  UserRound,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { FornecedorDialog } from '@/components/cadastros/FornecedorDialog'
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
import { fornecedoresService } from '@/services/fornecedores'
import type { Fornecedor, FornecedorProduto } from '@/types/domain'

export default function Fornecedores() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [produtosCountMap, setProdutosCountMap] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [fornecedorDialog, setFornecedorDialog] = useState(false)
  const [editingFornecedor, setEditingFornecedor] = useState<Fornecedor | null>(null)
  const [deleting, setDeleting] = useState<{ id: string; label: string } | null>(null)

  const load = useCallback(async () => {
    try {
      const [listaFornecedores, todosProdutos] = await Promise.all([
        fornecedoresService.listFornecedores(),
        fornecedoresService.listTodosProdutos().catch(() => [] as FornecedorProduto[]),
      ])
      setFornecedores(listaFornecedores)

      // Mapear contagem de produtos vinculados por fornecedor
      const counts: Record<string, number> = {}
      for (const prod of todosProdutos) {
        if (prod.fornecedor) {
          counts[prod.fornecedor] = (counts[prod.fornecedor] || 0) + 1
        }
      }
      setProdutosCountMap(counts)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar fornecedores',
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

  const filteredFornecedores = useMemo(
    () =>
      fornecedores.filter(
        (f) =>
          f.razao_social.toLocaleLowerCase('pt-BR').includes(normalized) ||
          f.nome_fantasia.toLocaleLowerCase('pt-BR').includes(normalized) ||
          (f.cnpj && digits && onlyDigits(f.cnpj).includes(digits)) ||
          (f.cpf && digits && onlyDigits(f.cpf).includes(digits)) ||
          (f.cidade && f.cidade.toLocaleLowerCase('pt-BR').includes(normalized)) ||
          (f.contato_nome && f.contato_nome.toLocaleLowerCase('pt-BR').includes(normalized)),
      ),
    [fornecedores, normalized, digits],
  )

  const writable = can(user?.role, 'writeRegistry')
  const deletable = can(user?.role, 'deleteFinance')

  const create = () => {
    setEditingFornecedor(null)
    setFornecedorDialog(true)
  }

  const remove = async () => {
    if (!deleting) return
    try {
      await fornecedoresService.deleteFornecedor(deleting.id)
      toast({ title: 'Fornecedor excluído com sucesso' })
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

  return (
    <>
      {/* Callout explicativo da função da página de Fornecedores */}
      <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm text-foreground flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
          <Truck className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="font-bold text-foreground">
            Cadastro de Fornecedores & Produtos de Revenda
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Aqui você cadastra fornecedores e seus produtos fornecidos (itens de revenda com custo
            de aquisição). Para produtos de fabricação própria, o cadastro acontece em{' '}
            <Link
              to="/empresas"
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Empresas
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
        title="Fornecedores"
        description="Cadastro de fornecedores (PJ/PF), prazos, condições comerciais e catálogo de produtos para precificação."
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
              Novo fornecedor
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
            placeholder="Buscar por nome, razão social, CNPJ/CPF ou cidade..."
          />
        </div>
        <p className="text-xs text-muted-foreground">
          {filteredFornecedores.length === 1
            ? '1 fornecedor encontrado'
            : `${filteredFornecedores.length} fornecedores encontrados`}
        </p>
      </div>

      {filteredFornecedores.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredFornecedores.map((f, i) => {
            const countProdutos = produtosCountMap[f.id] || 0
            const doc = f.cnpj || f.cpf

            return (
              <article
                key={f.id}
                className="card-hover rise-in rounded-2xl border border-border bg-white p-5 shadow-soft flex flex-col justify-between"
                style={{ animationDelay: `${i * 35}ms` }}
              >
                <div>
                  <div className="flex items-start justify-between">
                    <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                      <Truck className="h-5 w-5" />
                    </span>
                    <div>
                      {writable && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => {
                            setEditingFornecedor(f)
                            setFornecedorDialog(true)
                          }}
                          title="Editar fornecedor"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      )}
                      {deletable && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleting({ id: f.id, label: f.nome_fantasia })}
                          title="Excluir fornecedor"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <h2 className="mt-4 font-bold text-base text-foreground">{f.nome_fantasia}</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                    {f.razao_social}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {doc && (
                      <Badge variant="secondary" className="tabular-nums text-[11px]">
                        {doc}
                      </Badge>
                    )}
                    {f.cidade && (
                      <Badge variant="outline" className="text-[11px]">
                        {f.cidade}
                        {f.uf ? `/${f.uf}` : ''}
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className="text-[11px] font-semibold border-primary/30 text-primary bg-primary/5 flex items-center gap-1"
                    >
                      <Boxes className="h-3 w-3" />
                      {countProdutos} {countProdutos === 1 ? 'produto' : 'produtos'}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
                    {f.contato_nome && (
                      <p className="flex items-center gap-2 truncate">
                        <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span className="truncate">Contato: {f.contato_nome}</span>
                      </p>
                    )}
                    {f.email && (
                      <p className="flex items-center gap-2 truncate">
                        <Mail className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span className="truncate">{f.email}</span>
                      </p>
                    )}
                    {f.telefone && (
                      <p className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span>{f.telefone}</span>
                      </p>
                    )}
                    {f.prazo_entrega_dias !== undefined && f.prazo_entrega_dias !== null && (
                      <p className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span>Prazo de entrega: {f.prazo_entrega_dias} dias</span>
                      </p>
                    )}
                    {f.condicao_pagamento && (
                      <p className="flex items-center gap-2">
                        <CreditCard className="h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span>Condição: {f.condicao_pagamento}</span>
                      </p>
                    )}
                    {f.endereco && (
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground/70" />
                        <span className="line-clamp-1">{f.endereco}</span>
                      </p>
                    )}
                    {f.observacoes && (
                      <p className="italic text-muted-foreground/80 line-clamp-2 pt-1 border-t border-dashed border-border/60">
                        {f.observacoes}
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-border flex justify-end">
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs font-semibold"
                    onClick={() => {
                      setEditingFornecedor(f)
                      setFornecedorDialog(true)
                    }}
                  >
                    Ver detalhes & Produtos ({countProdutos})
                  </Button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <EmptyState
          title="Nenhum fornecedor encontrado"
          description="Ajuste os filtros de busca ou cadastre um novo fornecedor com CNPJ/CPF válido."
        />
      )}

      <FornecedorDialog
        open={fornecedorDialog}
        onOpenChange={setFornecedorDialog}
        record={editingFornecedor}
        onSaved={load}
        canWrite={writable}
        canDelete={deletable}
      />

      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cadastro de fornecedor?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.label}” e seu catálogo de produtos vinculados serão removidos. Essa ação
              não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive">
              Excluir fornecedor
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
