import { useEffect, useMemo, useState } from 'react'
import { LoaderCircle, Pencil, Plus, Save, Trash2 } from 'lucide-react'

import { LoadingState } from '@/components/LoadingState'
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
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { can } from '@/lib/permissions'
import { financeService } from '@/services/finance'
import type { Categoria, Lancamento, TransactionType } from '@/types/domain'

const colors = [
  '#1E6F5C',
  '#2B5BA8',
  '#DF5830',
  '#B7791F',
  '#C0392B',
  '#4C3A8C',
  '#A8556A',
  '#61737E',
]
export default function Categorias() {
  const { user } = useAuth(),
    { toast } = useToast()
  const [categories, setCategories] = useState<Categoria[]>([]),
    [launches, setLaunches] = useState<Lancamento[]>([]),
    [loading, setLoading] = useState(true),
    [dialog, setDialog] = useState(false),
    [editing, setEditing] = useState<Categoria | null>(null),
    [form, setForm] = useState({ nome: '', tipo: 'receita' as TransactionType, cor: '#1E6F5C' }),
    [errors, setErrors] = useState<Record<string, string>>({}),
    [saving, setSaving] = useState(false),
    [deleting, setDeleting] = useState<Categoria | null>(null)
  const load = async () => {
    try {
      const [a, b] = await Promise.all([
        financeService.listCategorias(),
        financeService.listLancamentos(),
      ])
      setCategories(a)
      setLaunches(b)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Falha ao carregar', description: apiMessage(e) })
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    load()
  }, [])
  const counts = useMemo(
    () =>
      launches.reduce<Record<string, number>>(
        (r, l) => ({ ...r, [l.categoria]: (r[l.categoria] || 0) + 1 }),
        {},
      ),
    [launches],
  )
  const open = (c?: Categoria, tipo: TransactionType = 'receita') => {
    setEditing(c || null)
    setForm(
      c
        ? { nome: c.nome, tipo: c.tipo, cor: c.cor || '#1E6F5C' }
        : { nome: '', tipo, cor: tipo === 'receita' ? '#1E6F5C' : '#DF5830' },
    )
    setErrors({})
    setDialog(true)
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) return setErrors({ nome: 'Informe o nome da categoria.' })
    setSaving(true)
    try {
      await financeService.saveCategoria(form, editing?.id)
      toast({ title: 'Categoria salva' })
      setDialog(false)
      await load()
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSaving(false)
    }
  }
  const remove = async () => {
    if (!deleting) return
    if (counts[deleting.id]) {
      setErrors({
        delete: 'Esta categoria está em uso. Reatribua os lançamentos antes de excluir.',
      })
      setDeleting(null)
      return
    }
    try {
      await financeService.deleteCategoria(deleting.id)
      toast({ title: 'Categoria excluída' })
      await load()
    } catch (e) {
      setErrors({ delete: apiMessage(e) })
    } finally {
      setDeleting(null)
    }
  }
  const List = ({ tipo }: { tipo: TransactionType }) => (
    <section className="rounded-2xl border border-border bg-white shadow-soft">
      <header className="flex items-center justify-between border-b border-border p-4 sm:p-5">
        <div>
          <h2 className="font-bold">
            {tipo === 'receita' ? 'Categorias de receitas' : 'Categorias de despesas'}
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {categories.filter((c) => c.tipo === tipo).length} categorias cadastradas
          </p>
        </div>
        <PermissionButton
          allowed={can(user?.role, 'writeFinance')}
          variant="outline"
          size="sm"
          onClick={() => open(undefined, tipo)}
        >
          <Plus className="mr-1 h-4 w-4" />
          Adicionar
        </PermissionButton>
      </header>
      <div>
        {categories
          .filter((c) => c.tipo === tipo)
          .map((c) => (
            <div
              className="group flex items-center gap-3 border-b border-border p-4 last:border-0"
              key={c.id}
            >
              <span
                className="h-4 w-4 rounded-full ring-4 ring-secondary"
                style={{ background: c.cor }}
              />
              <span className="flex-1 text-sm font-bold">{c.nome}</span>
              <span className="text-xs text-muted-foreground">{counts[c.id] || 0} usos</span>
              {can(user?.role, 'writeFinance') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => open(c)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
              )}
              {can(user?.role, 'deleteFinance') && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-destructive sm:opacity-0 sm:group-hover:opacity-100"
                  onClick={() => {
                    if (counts[c.id])
                      setErrors({
                        delete:
                          'Esta categoria está em uso. Reatribua os lançamentos antes de excluir.',
                      })
                    else setDeleting(c)
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
      </div>
    </section>
  )
  if (loading) return <LoadingState />
  return (
    <>
      <PageHeader
        title="Categorias"
        description="Organize receitas e despesas para relatórios mais claros."
        action={
          <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={() => open()}>
            <Plus className="mr-2 h-4 w-4" />
            Nova categoria
          </PermissionButton>
        }
      />
      {errors.delete && (
        <p className="mb-4 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-sm font-semibold text-destructive">
          {errors.delete}
        </p>
      )}
      <div className="hidden gap-5 md:grid md:grid-cols-2">
        <List tipo="receita" />
        <List tipo="despesa" />
      </div>
      <Tabs defaultValue="receita" className="md:hidden">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="receita">Receitas</TabsTrigger>
          <TabsTrigger value="despesa">Despesas</TabsTrigger>
        </TabsList>
        <TabsContent value="receita" className="mt-4">
          <List tipo="receita" />
        </TabsContent>
        <TabsContent value="despesa" className="mt-4">
          <List tipo="despesa" />
        </TabsContent>
      </Tabs>
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
            <DialogDescription>Escolha um nome, tipo e cor de identificação.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-5">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
              />
              {errors.nome && <p className="field-error">{errors.nome}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`segment-button ${form.tipo === 'receita' ? 'segment-active-success' : ''}`}
                onClick={() => setForm({ ...form, tipo: 'receita' })}
              >
                Receita
              </button>
              <button
                type="button"
                className={`segment-button ${form.tipo === 'despesa' ? 'segment-active' : ''}`}
                onClick={() => setForm({ ...form, tipo: 'despesa' })}
              >
                Despesa
              </button>
            </div>
            <div className="space-y-2">
              <Label>Cor</Label>
              <div className="flex flex-wrap gap-2">
                {colors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`h-9 w-9 rounded-full border-4 ${form.cor === c ? 'border-foreground' : 'border-white ring-1 ring-border'}`}
                    style={{ background: c }}
                    onClick={() => setForm({ ...form, cor: c })}
                  />
                ))}
              </div>
            </div>
            {errors.form && <p className="field-error">{errors.form}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialog(false)}>
                Cancelar
              </Button>
              <Button disabled={saving}>
                {saving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              “{deleting?.nome}” será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
