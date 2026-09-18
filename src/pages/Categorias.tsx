import { useEffect, useMemo, useState } from 'react'
import {
  CreditCard,
  HeartHandshake,
  Layers,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Tag,
  Tags,
  Trash2,
} from 'lucide-react'
import { useSearchParams } from 'react-router-dom'

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
import { Badge } from '@/components/ui/badge'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/contexts/AuthContext'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { can } from '@/lib/permissions'
import { despesasService } from '@/services/despesas'
import { financeService } from '@/services/finance'
import type {
  Categoria,
  Conta,
  Lancamento,
  MetodoPagamento,
  TagItem,
  TipoDespesa,
  TipoDizimo,
  TransactionType,
} from '@/types/domain'

const defaultColors = [
  '#DF5830',
  '#1E6F5C',
  '#2B5BA8',
  '#B7791F',
  '#C0392B',
  '#4C3A8C',
  '#A8556A',
  '#61737E',
]

export default function Categorias() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [params, setParams] = useSearchParams()
  const currentTab = params.get('tab') || 'categorias'

  const [loading, setLoading] = useState(true)
  const [categories, setCategories] = useState<Categoria[]>([])
  const [launches, setLaunches] = useState<Lancamento[]>([])
  const [tags, setTags] = useState<TagItem[]>([])
  const [tiposDespesa, setTiposDespesa] = useState<TipoDespesa[]>([])
  const [metodosPagamento, setMetodosPagamento] = useState<MetodoPagamento[]>([])
  const [tiposDizimo, setTiposDizimo] = useState<TipoDizimo[]>([])
  const [contas, setContas] = useState<Conta[]>([])

  // Modal Categorias
  const [catDialog, setCatDialog] = useState(false)
  const [catEditing, setCatEditing] = useState<Categoria | null>(null)
  const [catForm, setCatForm] = useState({
    nome: '',
    tipo: 'receita' as TransactionType,
    cor: '#1E6F5C',
  })
  const [catErrors, setCatErrors] = useState<Record<string, string>>({})
  const [catSaving, setCatSaving] = useState(false)
  const [catDeleting, setCatDeleting] = useState<Categoria | null>(null)

  // Modal Tags
  const [tagDialog, setTagDialog] = useState(false)
  const [tagEditing, setTagEditing] = useState<TagItem | null>(null)
  const [tagForm, setTagForm] = useState({ nome: '', cor: '#DF5830' })
  const [tagErrors, setTagErrors] = useState<Record<string, string>>({})
  const [tagSaving, setTagSaving] = useState(false)
  const [tagDeleting, setTagDeleting] = useState<TagItem | null>(null)

  // Modal Tipos Despesa
  const [tipoDialog, setTipoDialog] = useState(false)
  const [tipoEditing, setTipoEditing] = useState<TipoDespesa | null>(null)
  const [tipoForm, setTipoForm] = useState({ nome: '', codigo: '', descricao: '' })
  const [tipoErrors, setTipoErrors] = useState<Record<string, string>>({})
  const [tipoSaving, setTipoSaving] = useState(false)
  const [tipoDeleting, setTipoDeleting] = useState<TipoDespesa | null>(null)

  // Modal Métodos Pagamento
  const [metodoDialog, setMetodoDialog] = useState(false)
  const [metodoEditing, setMetodoEditing] = useState<MetodoPagamento | null>(null)
  const [metodoForm, setMetodoForm] = useState<{
    nome: string
    codigo: string
    tipo: MetodoPagamento['tipo']
    conta_padrao: string
    ativo: boolean
  }>({
    nome: '',
    codigo: '',
    tipo: 'pix',
    conta_padrao: '',
    ativo: true,
  })
  const [metodoErrors, setMetodoErrors] = useState<Record<string, string>>({})
  const [metodoSaving, setMetodoSaving] = useState(false)
  const [metodoDeleting, setMetodoDeleting] = useState<MetodoPagamento | null>(null)

  // Modal Tipos Dízimo / Ofertas
  const [dizimoDialog, setDizimoDialog] = useState(false)
  const [dizimoEditing, setDizimoEditing] = useState<TipoDizimo | null>(null)
  const [dizimoForm, setDizimoForm] = useState({
    nome: '',
    descricao: '',
    soma_resumo: true,
    cor: '#DF5830',
  })
  const [dizimoErrors, setDizimoErrors] = useState<Record<string, string>>({})
  const [dizimoSaving, setDizimoSaving] = useState(false)
  const [dizimoDeleting, setDizimoDeleting] = useState<TipoDizimo | null>(null)

  const loadAll = async () => {
    try {
      const [cats, lcs, tgs, tps, mts, dzs, cts] = await Promise.all([
        financeService.listCategorias(),
        financeService.listLancamentos(),
        despesasService.listTags(),
        despesasService.listTiposDespesa(),
        despesasService.listMetodosPagamento(),
        despesasService.listTiposDizimo(),
        financeService.listContas(),
      ])
      setCategories(cats)
      setLaunches(lcs)
      setTags(tgs)
      setTiposDespesa(tps)
      setMetodosPagamento(mts)
      setTiposDizimo(dzs)
      setContas(cts)
    } catch (e) {
      toast({
        variant: 'destructive',
        title: 'Falha ao carregar classificações',
        description: apiMessage(e),
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAll()
  }, [])

  const categoryCounts = useMemo(
    () =>
      launches.reduce<Record<string, number>>(
        (r, l) => ({ ...r, [l.categoria]: (r[l.categoria] || 0) + 1 }),
        {},
      ),
    [launches],
  )

  const handleTabChange = (val: string) => {
    const next = new URLSearchParams(params)
    next.set('tab', val)
    setParams(next, { replace: true })
  }

  /* ----------------- CATEGORIAS ----------------- */
  const openCat = (c?: Categoria, tipo: TransactionType = 'receita') => {
    setCatEditing(c || null)
    setCatForm(
      c
        ? { nome: c.nome, tipo: c.tipo, cor: c.cor || '#1E6F5C' }
        : { nome: '', tipo, cor: tipo === 'receita' ? '#1E6F5C' : '#DF5830' },
    )
    setCatErrors({})
    setCatDialog(true)
  }

  const saveCat = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!catForm.nome.trim()) return setCatErrors({ nome: 'Informe o nome da categoria.' })
    setCatSaving(true)
    try {
      await financeService.saveCategoria(catForm, catEditing?.id)
      toast({ title: 'Categoria salva com sucesso' })
      setCatDialog(false)
      const fresh = await financeService.listCategorias()
      setCategories(fresh)
    } catch (error) {
      setCatErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setCatSaving(false)
    }
  }

  const removeCat = async () => {
    if (!catDeleting) return
    if (categoryCounts[catDeleting.id]) {
      toast({
        variant: 'destructive',
        title: 'Categoria em uso',
        description: 'Reatribua os lançamentos antes de excluir.',
      })
      setCatDeleting(null)
      return
    }
    try {
      await financeService.deleteCategoria(catDeleting.id)
      toast({ title: 'Categoria excluída' })
      const fresh = await financeService.listCategorias()
      setCategories(fresh)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: apiMessage(e) })
    } finally {
      setCatDeleting(null)
    }
  }

  /* ----------------- TAGS ----------------- */
  const openTag = (t?: TagItem) => {
    setTagEditing(t || null)
    setTagForm(t ? { nome: t.nome, cor: t.cor || '#DF5830' } : { nome: '', cor: '#DF5830' })
    setTagErrors({})
    setTagDialog(true)
  }

  const saveTag = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tagForm.nome.trim()) return setTagErrors({ nome: 'Informe o nome da tag.' })
    setTagSaving(true)
    try {
      await despesasService.saveTag(tagForm, tagEditing?.id)
      toast({ title: 'Tag salva com sucesso' })
      setTagDialog(false)
      const fresh = await despesasService.listTags()
      setTags(fresh)
    } catch (error) {
      setTagErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setTagSaving(false)
    }
  }

  const removeTag = async () => {
    if (!tagDeleting) return
    try {
      await despesasService.deleteTag(tagDeleting.id)
      toast({ title: 'Tag excluída' })
      const fresh = await despesasService.listTags()
      setTags(fresh)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao excluir tag', description: apiMessage(e) })
    } finally {
      setTagDeleting(null)
    }
  }

  /* ----------------- TIPOS DE DESPESA ----------------- */
  const openTipo = (t?: TipoDespesa) => {
    setTipoEditing(t || null)
    setTipoForm(
      t
        ? { nome: t.nome, codigo: t.codigo, descricao: t.descricao || '' }
        : { nome: '', codigo: '', descricao: '' },
    )
    setTipoErrors({})
    setTipoDialog(true)
  }

  const saveTipo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tipoForm.nome.trim()) return setTipoErrors({ nome: 'Informe o nome do tipo.' })
    const code = tipoForm.codigo.trim() || tipoForm.nome.toLowerCase().replace(/[^a-z0-9]/g, '_')
    setTipoSaving(true)
    try {
      await despesasService.saveTipoDespesa({ ...tipoForm, codigo: code }, tipoEditing?.id)
      toast({ title: 'Tipo de despesa salvo' })
      setTipoDialog(false)
      const fresh = await despesasService.listTiposDespesa()
      setTiposDespesa(fresh)
    } catch (error) {
      setTipoErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setTipoSaving(false)
    }
  }

  const removeTipo = async () => {
    if (!tipoDeleting) return
    try {
      await despesasService.deleteTipoDespesa(tipoDeleting.id)
      toast({ title: 'Tipo de despesa excluído' })
      const fresh = await despesasService.listTiposDespesa()
      setTiposDespesa(fresh)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao excluir tipo', description: apiMessage(e) })
    } finally {
      setTipoDeleting(null)
    }
  }

  /* ----------------- MÉTODOS DE PAGAMENTO ----------------- */
  const openMetodo = (m?: MetodoPagamento) => {
    setMetodoEditing(m || null)
    setMetodoForm(
      m
        ? {
            nome: m.nome,
            codigo: m.codigo,
            tipo: m.tipo,
            conta_padrao: m.conta_padrao || '',
            ativo: m.ativo !== false,
          }
        : {
            nome: '',
            codigo: '',
            tipo: 'pix',
            conta_padrao: '',
            ativo: true,
          },
    )
    setMetodoErrors({})
    setMetodoDialog(true)
  }

  const saveMetodo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!metodoForm.nome.trim()) return setMetodoErrors({ nome: 'Informe o nome do método.' })
    const code =
      metodoForm.codigo.trim() || metodoForm.nome.toLowerCase().replace(/[^a-z0-9]/g, '_')
    setMetodoSaving(true)
    try {
      await despesasService.saveMetodoPagamento(
        {
          ...metodoForm,
          codigo: code,
          conta_padrao: metodoForm.conta_padrao || (null as unknown as string),
        },
        metodoEditing?.id,
      )
      toast({ title: 'Método de pagamento salvo' })
      setMetodoDialog(false)
      const fresh = await despesasService.listMetodosPagamento()
      setMetodosPagamento(fresh)
    } catch (error) {
      setMetodoErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setMetodoSaving(false)
    }
  }

  const removeMetodo = async () => {
    if (!metodoDeleting) return
    try {
      await despesasService.deleteMetodoPagamento(metodoDeleting.id)
      toast({ title: 'Método de pagamento excluído' })
      const fresh = await despesasService.listMetodosPagamento()
      setMetodosPagamento(fresh)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao excluir método', description: apiMessage(e) })
    } finally {
      setMetodoDeleting(null)
    }
  }

  /* ----------------- DÍZIMO E OFERTAS ----------------- */
  const openDizimo = (d?: TipoDizimo) => {
    setDizimoEditing(d || null)
    setDizimoForm(
      d
        ? {
            nome: d.nome,
            descricao: d.descricao || '',
            soma_resumo: d.soma_resumo !== false,
            cor: d.cor || '#DF5830',
          }
        : { nome: '', descricao: '', soma_resumo: true, cor: '#DF5830' },
    )
    setDizimoErrors({})
    setDizimoDialog(true)
  }

  const saveDizimo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dizimoForm.nome.trim()) return setDizimoErrors({ nome: 'Informe o nome.' })
    setDizimoSaving(true)
    try {
      await despesasService.saveTipoDizimo(dizimoForm, dizimoEditing?.id)
      toast({ title: 'Classificação de dízimo/oferta salva' })
      setDizimoDialog(false)
      const fresh = await despesasService.listTiposDizimo()
      setTiposDizimo(fresh)
    } catch (error) {
      setDizimoErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setDizimoSaving(false)
    }
  }

  const removeDizimo = async () => {
    if (!dizimoDeleting) return
    try {
      await despesasService.deleteTipoDizimo(dizimoDeleting.id)
      toast({ title: 'Excluído com sucesso' })
      const fresh = await despesasService.listTiposDizimo()
      setTiposDizimo(fresh)
    } catch (e) {
      toast({ variant: 'destructive', title: 'Erro ao excluir', description: apiMessage(e) })
    } finally {
      setDizimoDeleting(null)
    }
  }

  if (loading) return <LoadingState label="Carregando classificações e parâmetros..." />

  return (
    <>
      <PageHeader
        title="Hub de Classificações"
        description="Gerencie categorias, tags da planilha, tipos de despesa, métodos de pagamento e dízimos/ofertas."
      />

      <Tabs value={currentTab} onValueChange={handleTabChange} className="space-y-6">
        <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-secondary/60 p-1 sm:grid-cols-5">
          <TabsTrigger
            value="categorias"
            className="flex items-center gap-1.5 py-2.5 text-xs font-bold sm:text-sm"
          >
            <Tags className="h-4 w-4" />
            <span>Categorias</span>
          </TabsTrigger>
          <TabsTrigger
            value="tags"
            className="flex items-center gap-1.5 py-2.5 text-xs font-bold sm:text-sm"
          >
            <Tag className="h-4 w-4" />
            <span>Tags</span>
          </TabsTrigger>
          <TabsTrigger
            value="tipos"
            className="flex items-center gap-1.5 py-2.5 text-xs font-bold sm:text-sm"
          >
            <Layers className="h-4 w-4" />
            <span>Tipos Despesa</span>
          </TabsTrigger>
          <TabsTrigger
            value="metodos"
            className="flex items-center gap-1.5 py-2.5 text-xs font-bold sm:text-sm"
          >
            <CreditCard className="h-4 w-4" />
            <span>Métodos Pag.</span>
          </TabsTrigger>
          <TabsTrigger
            value="dizimo"
            className="flex items-center gap-1.5 py-2.5 text-xs font-bold sm:text-sm"
          >
            <HeartHandshake className="h-4 w-4" />
            <span>Dízimo & Ofertas</span>
          </TabsTrigger>
        </TabsList>

        {/* ==================== TAB 1: CATEGORIAS ==================== */}
        <TabsContent value="categorias" className="space-y-6">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Classificação primária de entradas e saídas para apuração do fluxo de caixa e
              relatórios.
            </p>
            <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={() => openCat()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nova categoria
            </PermissionButton>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {/* Receitas */}
            <div className="rounded-2xl border border-border bg-white shadow-soft">
              <header className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3 className="font-bold text-foreground">Receitas</h3>
                  <p className="text-xs text-muted-foreground">
                    {categories.filter((c) => c.tipo === 'receita').length} categorias
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openCat(undefined, 'receita')}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                </Button>
              </header>
              <div className="divide-y divide-border">
                {categories
                  .filter((c) => c.tipo === 'receita')
                  .map((c) => (
                    <div
                      key={c.id}
                      className="group flex items-center gap-3 p-3.5 transition hover:bg-secondary/40"
                    >
                      <span
                        className="h-4 w-4 rounded-full ring-4 ring-secondary"
                        style={{ background: c.cor }}
                      />
                      <span className="flex-1 text-sm font-bold">{c.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {categoryCounts[c.id] || 0} usos
                      </span>
                      {can(user?.role, 'writeFinance') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openCat(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {can(user?.role, 'deleteFinance') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setCatDeleting(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </div>

            {/* Despesas */}
            <div className="rounded-2xl border border-border bg-white shadow-soft">
              <header className="flex items-center justify-between border-b border-border p-4">
                <div>
                  <h3 className="font-bold text-foreground">Despesas</h3>
                  <p className="text-xs text-muted-foreground">
                    {categories.filter((c) => c.tipo === 'despesa').length} categorias
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={() => openCat(undefined, 'despesa')}>
                  <Plus className="mr-1 h-3.5 w-3.5" /> Adicionar
                </Button>
              </header>
              <div className="divide-y divide-border">
                {categories
                  .filter((c) => c.tipo === 'despesa')
                  .map((c) => (
                    <div
                      key={c.id}
                      className="group flex items-center gap-3 p-3.5 transition hover:bg-secondary/40"
                    >
                      <span
                        className="h-4 w-4 rounded-full ring-4 ring-secondary"
                        style={{ background: c.cor }}
                      />
                      <span className="flex-1 text-sm font-bold">{c.nome}</span>
                      <span className="text-xs text-muted-foreground">
                        {categoryCounts[c.id] || 0} usos
                      </span>
                      {can(user?.role, 'writeFinance') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openCat(c)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {can(user?.role, 'deleteFinance') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setCatDeleting(c)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* ==================== TAB 2: TAGS ==================== */}
        <TabsContent value="tags" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Tags da Planilha</p>
              <p className="text-xs text-muted-foreground">
                Usadas para agrupar gastos por pessoa, núcleo ou projeto (ex.: Eu/Casa, Eu, Rafa,
                Empresa).
              </p>
            </div>
            <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={() => openTag()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Nova tag
            </PermissionButton>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-soft">
            <div className="divide-y divide-border">
              {tags.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhuma tag cadastrada.
                </div>
              ) : (
                tags.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-4 transition hover:bg-secondary/30"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="h-3.5 w-3.5 rounded-full ring-2 ring-border"
                        style={{ background: t.cor || '#DF5830' }}
                      />
                      <span className="font-bold text-foreground">{t.nome}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {can(user?.role, 'writeFinance') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          onClick={() => openTag(t)}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {can(user?.role, 'deleteFinance') && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => setTagDeleting(t)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        {/* ==================== TAB 3: TIPOS DE DESPESA ==================== */}
        <TabsContent value="tipos" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Tipos de Despesa</p>
              <p className="text-xs text-muted-foreground">
                Classificação da volatilidade dos gastos (Fixa, Fixa / Variável, Variável).
              </p>
            </div>
            <PermissionButton allowed={can(user?.role, 'writeFinance')} onClick={() => openTipo()}>
              <Plus className="mr-1.5 h-4 w-4" />
              Novo tipo
            </PermissionButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiposDespesa.map((tp) => (
              <div
                key={tp.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-white p-5 shadow-soft"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <h4 className="font-bold text-foreground">{tp.nome}</h4>
                    <Badge variant="outline" className="font-mono text-[10px]">
                      {tp.codigo}
                    </Badge>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {tp.descricao || 'Sem descrição cadastrada.'}
                  </p>
                </div>
                <div className="mt-4 flex justify-end gap-1 border-t border-border pt-3">
                  {can(user?.role, 'writeFinance') && (
                    <Button variant="ghost" size="sm" onClick={() => openTipo(tp)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  {can(user?.role, 'deleteFinance') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setTipoDeleting(tp)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>

        {/* ==================== TAB 4: MÉTODOS DE PAGAMENTO ==================== */}
        <TabsContent value="metodos" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Métodos de Pagamento</p>
              <p className="text-xs text-muted-foreground">
                Formas de liquidação como Pix-CPF, Pix-CNPJ, Cred-CPF, boleto, transferência
                bancária.
              </p>
            </div>
            <PermissionButton
              allowed={can(user?.role, 'writeFinance')}
              onClick={() => openMetodo()}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Novo método
            </PermissionButton>
          </div>

          <div className="rounded-2xl border border-border bg-white shadow-soft">
            <div className="divide-y divide-border">
              {metodosPagamento.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Nenhum método cadastrado.
                </div>
              ) : (
                metodosPagamento.map((m) => {
                  const linkedConta = contas.find((c) => c.id === m.conta_padrao)
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between p-4 transition hover:bg-secondary/30"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-foreground">{m.nome}</span>
                          <Badge variant="secondary" className="uppercase text-[10px]">
                            {m.tipo}
                          </Badge>
                          {!m.ativo && <Badge variant="destructive">Inativo</Badge>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Código: <span className="font-mono">{m.codigo}</span>
                          {linkedConta && (
                            <span>
                              {' '}
                              · Conta padrão: <strong>{linkedConta.nome}</strong>
                            </span>
                          )}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {can(user?.role, 'writeFinance') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openMetodo(m)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        {can(user?.role, 'deleteFinance') && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-destructive"
                            onClick={() => setMetodoDeleting(m)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  )
                })
              )}
            </div>
          </div>
        </TabsContent>

        {/* ==================== TAB 5: DÍZIMO E OFERTAS ==================== */}
        <TabsContent value="dizimo" className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">
                Classificações de Dízimos e Ofertas
              </p>
              <p className="text-xs text-muted-foreground">
                Configuração dos tipos que compõem o somatório e resumo de dízimos/ofertas no
                período (Dízimo, Oferta, Primícias/Prêmica).
              </p>
            </div>
            <PermissionButton
              allowed={can(user?.role, 'writeFinance')}
              onClick={() => openDizimo()}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              Nova classificação
            </PermissionButton>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiposDizimo.map((dz) => (
              <div
                key={dz.id}
                className="flex flex-col justify-between rounded-2xl border border-border bg-white p-5 shadow-soft"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3.5 w-3.5 rounded-full"
                      style={{ background: dz.cor || '#DF5830' }}
                    />
                    <h4 className="font-bold text-foreground">{dz.nome}</h4>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {dz.descricao || 'Sem descrição cadastrada.'}
                  </p>
                  <div className="mt-3">
                    <Badge
                      variant={dz.soma_resumo !== false ? 'default' : 'secondary'}
                      className="text-[10px]"
                    >
                      {dz.soma_resumo !== false ? 'Soma no Resumo' : 'Não soma no Resumo'}
                    </Badge>
                  </div>
                </div>
                <div className="mt-4 flex justify-end gap-1 border-t border-border pt-3">
                  {can(user?.role, 'writeFinance') && (
                    <Button variant="ghost" size="sm" onClick={() => openDizimo(dz)}>
                      <Pencil className="mr-1 h-3.5 w-3.5" /> Editar
                    </Button>
                  )}
                  {can(user?.role, 'deleteFinance') && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setDizimoDeleting(dz)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* DIALOG CATEGORIA */}
      <Dialog open={catDialog} onOpenChange={setCatDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{catEditing ? 'Editar categoria' : 'Nova categoria'}</DialogTitle>
            <DialogDescription>Escolha um nome, tipo e cor de identificação.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveCat} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={catForm.nome}
                onChange={(e) => setCatForm({ ...catForm, nome: e.target.value })}
                placeholder="Ex.: Internet, Alimentação"
              />
              {catErrors.nome && <p className="field-error">{catErrors.nome}</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                className={`segment-button ${catForm.tipo === 'receita' ? 'segment-active-success' : ''}`}
                onClick={() => setCatForm({ ...catForm, tipo: 'receita' })}
              >
                Receita
              </button>
              <button
                type="button"
                className={`segment-button ${catForm.tipo === 'despesa' ? 'segment-active' : ''}`}
                onClick={() => setCatForm({ ...catForm, tipo: 'despesa' })}
              >
                Despesa
              </button>
            </div>
            <div className="space-y-2">
              <Label>Cor de destaque</Label>
              <div className="flex flex-wrap gap-2">
                {defaultColors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`h-8 w-8 rounded-full border-4 ${catForm.cor === c ? 'border-foreground scale-110' : 'border-white ring-1 ring-border'}`}
                    style={{ background: c }}
                    onClick={() => setCatForm({ ...catForm, cor: c })}
                  />
                ))}
              </div>
            </div>
            {catErrors.form && <p className="field-error">{catErrors.form}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCatDialog(false)}>
                Cancelar
              </Button>
              <Button disabled={catSaving}>
                {catSaving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar categoria
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG TAG */}
      <Dialog open={tagDialog} onOpenChange={setTagDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{tagEditing ? 'Editar tag' : 'Nova tag'}</DialogTitle>
            <DialogDescription>
              Tags auxiliam na filtragem por pessoa ou núcleo de gastos.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTag} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Tag</Label>
              <Input
                value={tagForm.nome}
                onChange={(e) => setTagForm({ ...tagForm, nome: e.target.value })}
                placeholder="Ex.: Eu/Casa, Rafa, Empresa"
              />
              {tagErrors.nome && <p className="field-error">{tagErrors.nome}</p>}
            </div>
            <div className="space-y-2">
              <Label>Cor de identificação</Label>
              <div className="flex flex-wrap gap-2">
                {defaultColors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`h-8 w-8 rounded-full border-4 ${tagForm.cor === c ? 'border-foreground scale-110' : 'border-white ring-1 ring-border'}`}
                    style={{ background: c }}
                    onClick={() => setTagForm({ ...tagForm, cor: c })}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTagDialog(false)}>
                Cancelar
              </Button>
              <Button disabled={tagSaving}>
                {tagSaving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar tag
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG TIPO DESPESA */}
      <Dialog open={tipoDialog} onOpenChange={setTipoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {tipoEditing ? 'Editar tipo de despesa' : 'Novo tipo de despesa'}
            </DialogTitle>
            <DialogDescription>Define a regularidade e previsão orçamentária.</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveTipo} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={tipoForm.nome}
                onChange={(e) => setTipoForm({ ...tipoForm, nome: e.target.value })}
                placeholder="Ex.: Fixa, Fixa / Variável"
              />
              {tipoErrors.nome && <p className="field-error">{tipoErrors.nome}</p>}
            </div>
            <div className="space-y-2">
              <Label>Código identificador</Label>
              <Input
                value={tipoForm.codigo}
                onChange={(e) => setTipoForm({ ...tipoForm, codigo: e.target.value })}
                placeholder="Ex.: fixa_variavel"
              />
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={tipoForm.descricao}
                onChange={(e) => setTipoForm({ ...tipoForm, descricao: e.target.value })}
                placeholder="Quando este tipo deve ser aplicado..."
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setTipoDialog(false)}>
                Cancelar
              </Button>
              <Button disabled={tipoSaving}>
                {tipoSaving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar tipo
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG MÉTODO PAGAMENTO */}
      <Dialog open={metodoDialog} onOpenChange={setMetodoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {metodoEditing ? 'Editar método de pagamento' : 'Novo método de pagamento'}
            </DialogTitle>
            <DialogDescription>
              Cadastre as opções que aparecem nos compromissos e baixas.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveMetodo} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={metodoForm.nome}
                onChange={(e) => setMetodoForm({ ...metodoForm, nome: e.target.value })}
                placeholder="Ex.: Pix - CPF, Pix - CNPJ, Cred - CPF"
              />
              {metodoErrors.nome && <p className="field-error">{metodoErrors.nome}</p>}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo base</Label>
                <Select
                  value={metodoForm.tipo}
                  onValueChange={(v) =>
                    setMetodoForm({ ...metodoForm, tipo: v as MetodoPagamento['tipo'] })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pix">Pix</SelectItem>
                    <SelectItem value="cartao">Cartão de Crédito</SelectItem>
                    <SelectItem value="boleto">Boleto Bancário</SelectItem>
                    <SelectItem value="transferencia">Transferência</SelectItem>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Código</Label>
                <Input
                  value={metodoForm.codigo}
                  onChange={(e) => setMetodoForm({ ...metodoForm, codigo: e.target.value })}
                  placeholder="Ex.: pix_cpf"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Conta padrão vinculada (opcional)</Label>
              <Select
                value={metodoForm.conta_padrao || 'none'}
                onValueChange={(v) =>
                  setMetodoForm({ ...metodoForm, conta_padrao: v === 'none' ? '' : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione se aplicável" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Nenhuma</SelectItem>
                  {contas.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nome} ({c.tipo})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <Label>Método ativo</Label>
                <p className="text-xs text-muted-foreground">
                  Disponível para seleção nos compromissos
                </p>
              </div>
              <Switch
                checked={metodoForm.ativo}
                onCheckedChange={(v) => setMetodoForm({ ...metodoForm, ativo: v })}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setMetodoDialog(false)}>
                Cancelar
              </Button>
              <Button disabled={metodoSaving}>
                {metodoSaving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar método
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* DIALOG DÍZIMO */}
      <Dialog open={dizimoDialog} onOpenChange={setDizimoDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {dizimoEditing ? 'Editar dízimo/oferta' : 'Nova classificação'}
            </DialogTitle>
            <DialogDescription>
              Defina o nome e se este valor compõe o somatório geral.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={saveDizimo} className="space-y-4">
            <div className="space-y-2">
              <Label>Nome</Label>
              <Input
                value={dizimoForm.nome}
                onChange={(e) => setDizimoForm({ ...dizimoForm, nome: e.target.value })}
                placeholder="Ex.: Dízimo, Oferta de Missões, Primícia"
              />
              {dizimoErrors.nome && <p className="field-error">{dizimoErrors.nome}</p>}
            </div>
            <div className="space-y-2">
              <Label>Descrição</Label>
              <Textarea
                value={dizimoForm.descricao}
                onChange={(e) => setDizimoForm({ ...dizimoForm, descricao: e.target.value })}
                placeholder="Notas explicativas..."
              />
            </div>
            <div className="flex items-center justify-between rounded-xl border border-border p-3">
              <div>
                <Label>Somar no resumo da tela de despesas</Label>
                <p className="text-xs text-muted-foreground">
                  Exibe o total somado deste item no cabeçalho/card
                </p>
              </div>
              <Switch
                checked={dizimoForm.soma_resumo}
                onCheckedChange={(v) => setDizimoForm({ ...dizimoForm, soma_resumo: v })}
              />
            </div>
            <div className="space-y-2">
              <Label>Cor de destaque</Label>
              <div className="flex flex-wrap gap-2">
                {defaultColors.map((c) => (
                  <button
                    type="button"
                    key={c}
                    className={`h-8 w-8 rounded-full border-4 ${dizimoForm.cor === c ? 'border-foreground scale-110' : 'border-white ring-1 ring-border'}`}
                    style={{ background: c }}
                    onClick={() => setDizimoForm({ ...dizimoForm, cor: c })}
                  />
                ))}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDizimoDialog(false)}>
                Cancelar
              </Button>
              <Button disabled={dizimoSaving}>
                {dizimoSaving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Salvar classificação
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ALERT DIALOG EXCLUSÕES */}
      <AlertDialog open={!!catDeleting} onOpenChange={(o) => !o && setCatDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir categoria?</AlertDialogTitle>
            <AlertDialogDescription>
              “{catDeleting?.nome}” será removida permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={removeCat}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!tagDeleting} onOpenChange={(o) => !o && setTagDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tag?</AlertDialogTitle>
            <AlertDialogDescription>
              A tag “{tagDeleting?.nome}” será removida.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={removeTag}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!tipoDeleting} onOpenChange={(o) => !o && setTipoDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir tipo de despesa?</AlertDialogTitle>
            <AlertDialogDescription>
              O tipo “{tipoDeleting?.nome}” será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={removeTipo}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!metodoDeleting} onOpenChange={(o) => !o && setMetodoDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir método de pagamento?</AlertDialogTitle>
            <AlertDialogDescription>
              O método “{metodoDeleting?.nome}” será removido.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={removeMetodo}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!dizimoDeleting} onOpenChange={(o) => !o && setDizimoDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir classificação?</AlertDialogTitle>
            <AlertDialogDescription>“{dizimoDeleting?.nome}” será removida.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={removeDizimo}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
