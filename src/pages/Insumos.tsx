import { useState, useEffect, useMemo } from 'react'
import { PageHeader } from '@/components/PageHeader'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
import {
  Package,
  Scissors,
  Plus,
  Search,
  Filter,
  Tag,
  Truck,
  Edit2,
  Trash2,
  Layers,
  Sparkles,
  ExternalLink,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { InsumoDialog } from '@/components/insumos/InsumoDialog'
import { CategoriasInsumoDialog } from '@/components/insumos/CategoriasInsumoDialog'
import { insumosService, formatarDimensaoInsumo } from '@/services/insumos'
import { fornecedoresService } from '@/services/fornecedores'
import type { InsumoRecord, InsumoCategoriaRecord, InsumoTipo, Fornecedor } from '@/types/domain'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'

export default function InsumosPage() {
  const { toast } = useToast()

  // Estados principais
  const [insumos, setInsumos] = useState<InsumoRecord[]>([])
  const [categorias, setCategorias] = useState<InsumoCategoriaRecord[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [loading, setLoading] = useState(true)

  // Falha de dados auxiliares (resiliência contra oscilações de rede)
  const [auxiliaresError, setAuxiliaresError] = useState<{
    categorias?: boolean
    fornecedores?: boolean
  } | null>(null)
  const [tentandoAuxiliares, setTentandoAuxiliares] = useState(false)

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroTipo, setFiltroTipo] = useState<string>('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [apenasAtivos, setApenasAtivos] = useState(true)

  // Diálogos
  const [dialogInsumoOpen, setDialogInsumoOpen] = useState(false)
  const [insumoSelecionado, setInsumoSelecionado] = useState<InsumoRecord | null>(null)

  const [dialogCategoriasOpen, setDialogCategoriasOpen] = useState(false)

  const [insumoParaExcluir, setInsumoParaExcluir] = useState<InsumoRecord | null>(null)
  const [excluindo, setExcluindo] = useState(false)

  // Carregar dados principais e auxiliares com resiliência a falhas parciais de rede
  const carregarDados = async () => {
    try {
      setLoading(true)
      const [catsResult, fornResult, insResult] = await Promise.allSettled([
        insumosService.listCategorias(),
        fornecedoresService.listFornecedores(),
        insumosService.listInsumos(),
      ])

      const catsFailed = catsResult.status === 'rejected'
      const fornFailed = fornResult.status === 'rejected'
      const insFailed = insResult.status === 'rejected'

      if (catsResult.status === 'fulfilled') {
        setCategorias(catsResult.value)
      }
      if (fornResult.status === 'fulfilled') {
        setFornecedores(fornResult.value)
      }
      if (insResult.status === 'fulfilled') {
        setInsumos(insResult.value)
      }

      if (catsFailed || fornFailed) {
        setAuxiliaresError({
          categorias: catsFailed,
          fornecedores: fornFailed,
        })
      } else {
        setAuxiliaresError(null)
      }

      if (insFailed) {
        toast({
          variant: 'destructive',
          title: 'Erro ao carregar insumos',
          description: 'Não foi possível carregar a lista principal de insumos.',
        })
      } else if (catsFailed || fornFailed) {
        toast({
          variant: 'default',
          title: 'Aviso de rede',
          description:
            'Algumas listas complementares (categorias ou fornecedores) não puderam ser carregadas. Você pode tentar novamente.',
        })
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao carregar dados',
        description: 'Não foi possível carregar o catálogo de insumos.',
      })
    } finally {
      setLoading(false)
    }
  }

  // Tentar novamente apenas dados auxiliares que falharam
  const tentarRecarregarAuxiliares = async () => {
    if (!auxiliaresError) return
    try {
      setTentandoAuxiliares(true)
      const promises: Promise<any>[] = []
      const tasks: ('cats' | 'forn')[] = []

      if (auxiliaresError.categorias) {
        promises.push(insumosService.listCategorias())
        tasks.push('cats')
      }
      if (auxiliaresError.fornecedores) {
        promises.push(fornecedoresService.listFornecedores())
        tasks.push('forn')
      }

      const results = await Promise.allSettled(promises)
      let nextError = { ...auxiliaresError }

      results.forEach((res, idx) => {
        const task = tasks[idx]
        if (res.status === 'fulfilled') {
          if (task === 'cats') {
            setCategorias(res.value)
            delete nextError.categorias
          } else if (task === 'forn') {
            setFornecedores(res.value)
            delete nextError.fornecedores
          }
        }
      })

      if (!nextError.categorias && !nextError.fornecedores) {
        setAuxiliaresError(null)
        toast({
          title: 'Dados sincronizados',
          description: 'Categorias e fornecedores carregados com sucesso.',
        })
      } else {
        setAuxiliaresError(nextError)
      }
    } catch {
      toast({
        variant: 'destructive',
        title: 'Tentativa falhou',
        description: 'Verifique sua conexão e tente novamente.',
      })
    } finally {
      setTentandoAuxiliares(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Filtragem local
  const insumosFiltrados = useMemo(() => {
    return insumos.filter((item) => {
      if (apenasAtivos && item.ativo === false) return false
      if (filtroTipo !== 'todos' && item.tipo !== filtroTipo) return false
      if (filtroCategoria !== 'todas' && item.categoria !== filtroCategoria) return false

      if (busca.trim()) {
        const q = busca.toLowerCase()
        const matchNome = item.nome?.toLowerCase().includes(q)
        const matchObs = item.observacoes?.toLowerCase().includes(q)
        const matchCat = item.expand?.categoria?.nome?.toLowerCase().includes(q)
        const matchForn = (
          item.expand?.fornecedor?.nome_fantasia ||
          item.expand?.fornecedor?.razao_social ||
          ''
        )
          .toLowerCase()
          .includes(q)
        if (!matchNome && !matchObs && !matchCat && !matchForn) return false
      }

      return true
    })
  }, [insumos, apenasAtivos, filtroTipo, filtroCategoria, busca])

  // Contagens para badges rápidos
  const contagens = useMemo(() => {
    const total = insumos.length
    const materiais = insumos.filter((i) => i.tipo === 'insumo').length
    const servicos = insumos.filter((i) => i.tipo === 'servico').length
    const embalagens = insumos.filter(
      (i) => i.expand?.categoria?.nome?.toLowerCase() === 'embalagem',
    ).length
    return { total, materiais, servicos, embalagens }
  }, [insumos])

  // Exclusão
  const confirmarExclusao = async () => {
    if (!insumoParaExcluir) return
    try {
      setExcluindo(true)
      await insumosService.deleteInsumo(insumoParaExcluir.id)
      toast({
        title: 'Insumo excluído',
        description: `"${insumoParaExcluir.nome}" foi removido do catálogo.`,
      })
      setInsumoParaExcluir(null)
      carregarDados()
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível excluir o insumo.',
      })
    } finally {
      setExcluindo(false)
    }
  }

  const abrirNovo = () => {
    setInsumoSelecionado(null)
    setDialogInsumoOpen(true)
  }

  const abrirEditar = (item: InsumoRecord) => {
    setInsumoSelecionado(item)
    setDialogInsumoOpen(true)
  }

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-6 max-w-7xl">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <PageHeader
            title="Catálogo de Insumos & Serviços"
            description="Cadastre insumos, tecidos, embalagens e serviços de costura com rastreabilidade de origem e cálculo automático de custos."
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDialogCategoriasOpen(true)}
            className="text-xs h-9"
          >
            <Tag className="mr-1.5 h-3.5 w-3.5 text-primary" />
            Categorias ({categorias.length})
          </Button>
          <Button
            size="sm"
            onClick={abrirNovo}
            className="bg-primary text-white font-bold text-xs h-9 shadow-sm"
          >
            <Plus className="mr-1.5 h-4 w-4" />
            Novo Insumo / Serviço
          </Button>
        </div>
      </div>

      {/* Aviso de resiliência caso listas auxiliares tenham falhado por oscilação de rede */}
      {auxiliaresError && (auxiliaresError.categorias || auxiliaresError.fornecedores) && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 text-xs">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              Alguns dados complementares (
              {auxiliaresError.categorias && auxiliaresError.fornecedores
                ? 'categorias e fornecedores'
                : auxiliaresError.categorias
                  ? 'categorias'
                  : 'fornecedores'}
              ) não puderam ser carregados devido a uma oscilação de rede. O catálogo de insumos
              continua acessível.
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={tentarRecarregarAuxiliares}
            disabled={tentandoAuxiliares}
            className="h-8 border-amber-600/30 text-amber-800 hover:bg-amber-600/10 shrink-0 text-xs font-semibold"
          >
            <RefreshCw
              className={`mr-1.5 h-3.5 w-3.5 ${tentandoAuxiliares ? 'animate-spin' : ''}`}
            />
            {tentandoAuxiliares ? 'Atualizando...' : 'Tentar novamente'}
          </Button>
        </div>
      )}

      {/* Cards de Resumo */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card className="border-border/60 bg-card">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Total de Itens
              </p>
              <h3 className="text-xl font-bold mt-0.5">{contagens.total}</h3>
            </div>
            <div className="h-9 w-9 rounded-xl bg-muted flex items-center justify-center text-muted-foreground">
              <Layers className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Insumos Físicos
              </p>
              <h3 className="text-xl font-bold mt-0.5 text-blue-600">{contagens.materiais}</h3>
            </div>
            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <Package className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Serviços Terceiros
              </p>
              <h3 className="text-xl font-bold mt-0.5 text-emerald-600">{contagens.servicos}</h3>
            </div>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Scissors className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card">
          <CardContent className="p-3.5 flex items-center justify-between">
            <div>
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                Embalagens
              </p>
              <h3 className="text-xl font-bold mt-0.5 text-primary">{contagens.embalagens}</h3>
            </div>
            <div className="h-9 w-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barra de Filtros e Busca */}
      <Card className="border-border/80">
        <CardContent className="p-3.5 space-y-3">
          <div className="flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center">
            {/* Busca textual */}
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome, fornecedor, observação..."
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 text-xs h-9"
              />
            </div>

            {/* Filtro Tipo */}
            <div className="w-full sm:w-44">
              <Select value={filtroTipo} onValueChange={setFiltroTipo}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Tipos</SelectItem>
                  <SelectItem value="insumo">Insumo Físico</SelectItem>
                  <SelectItem value="servico">Serviço Terceirizado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro Categoria */}
            <div className="w-full sm:w-48">
              <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                <SelectTrigger className="text-xs h-9">
                  <SelectValue placeholder="Categoria" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas as Categorias</SelectItem>
                  {categorias.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id}>
                      {cat.nome}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Toggle ativos */}
            <Button
              variant={apenasAtivos ? 'secondary' : 'outline'}
              size="sm"
              onClick={() => setApenasAtivos(!apenasAtivos)}
              className="text-xs h-9 shrink-0"
            >
              <Filter className="mr-1.5 h-3.5 w-3.5" />
              {apenasAtivos ? 'Apenas Ativos' : 'Todos os Status'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Grid de Caixas de Insumos */}
      {loading ? (
        <div className="py-16 text-center space-y-2">
          <div className="h-6 w-6 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-muted-foreground">Carregando catálogo de insumos...</p>
        </div>
      ) : insumosFiltrados.length === 0 ? (
        <Card className="border-dashed border-2 py-12 text-center">
          <CardContent className="space-y-3">
            <div className="h-12 w-12 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <Package className="h-6 w-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-foreground">
                Nenhum insumo ou serviço encontrado
              </h4>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto mt-1">
                {busca || filtroTipo !== 'todos' || filtroCategoria !== 'todas'
                  ? 'Tente ajustar os filtros ou termo de busca acima.'
                  : 'Comece adicionando seu primeiro insumo (ex.: embalagem, tecido) ou serviço terceirizado (ex.: costureira).'}
              </p>
            </div>
            <Button
              size="sm"
              onClick={abrirNovo}
              className="bg-primary text-white text-xs font-bold"
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" />
              Cadastrar Primeiro Insumo
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {insumosFiltrados.map((item) => {
            const cat = item.expand?.categoria
            const forn = item.expand?.fornecedor
            const dimTexto = formatarDimensaoInsumo(item)

            return (
              <Card
                key={item.id}
                className={`border transition-all hover:shadow-md relative overflow-hidden ${
                  item.ativo === false ? 'opacity-60 bg-muted/30' : 'bg-card'
                }`}
              >
                {/* Linha superior decorativa de categoria */}
                {cat?.cor && (
                  <div
                    className="h-1 w-full absolute top-0 left-0"
                    style={{ backgroundColor: cat.cor }}
                  />
                )}

                <CardContent className="p-4 space-y-3">
                  {/* Cabeçalho do Card: Ícone + Título + Status */}
                  <div className="flex items-start justify-between gap-2 pt-0.5">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div
                        className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${
                          item.tipo === 'servico'
                            ? 'bg-emerald-50 text-emerald-600'
                            : 'bg-primary/10 text-primary'
                        }`}
                      >
                        {item.tipo === 'servico' ? (
                          <Scissors className="h-4 w-4" />
                        ) : (
                          <Package className="h-4 w-4" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-foreground leading-snug line-clamp-2">
                          {item.nome}
                        </h4>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1">
                          {/* Tipo: Insumo ou Serviço */}
                          <Badge
                            variant="secondary"
                            className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0"
                          >
                            {item.tipo === 'servico' ? 'Serviço' : 'Insumo'}
                          </Badge>

                          {/* Categoria */}
                          {cat?.nome && (
                            <Badge
                              variant="outline"
                              className="text-[10px] font-semibold px-1.5 py-0"
                              style={{
                                borderColor: cat.cor ? `${cat.cor}66` : undefined,
                                color: cat.cor || undefined,
                              }}
                            >
                              {cat.nome}
                            </Badge>
                          )}

                          {item.ativo === false && (
                            <Badge variant="destructive" className="text-[10px] px-1 py-0">
                              Inativo
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs text-muted-foreground block">Valor Unitário</span>
                      <span className="text-base font-mono font-bold text-foreground">
                        {formatCurrency(item.valor_unitario ?? 0)}
                      </span>
                      <span className="text-[10px] text-muted-foreground block">
                        /{item.unidade || 'un'}
                      </span>
                    </div>
                  </div>

                  {/* Caixa destacada com TIPO e DIMENSÃO (conforme pedido explícito do usuário) */}
                  <div className="p-2.5 rounded-lg bg-muted/40 border border-border/70 space-y-1.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground text-[11px] font-medium">
                        Tipo & Dimensão:
                      </span>
                      <span className="font-mono font-bold text-[11px] text-primary">
                        {dimTexto}
                      </span>
                    </div>

                    {item.dimensao_tipo && item.dimensao_tipo !== 'nenhuma' && (
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-0.5 border-t border-border/40">
                        <span className="capitalize font-semibold text-foreground">
                          {item.dimensao_tipo.toUpperCase()}
                        </span>
                        <span>•</span>
                        {item.dimensao_tipo === '2d' && (
                          <span>
                            Largura: {item.dimensao_largura_cm ?? 0} cm | Altura:{' '}
                            {item.dimensao_altura_cm ?? 0} cm
                          </span>
                        )}
                        {item.dimensao_tipo === '3d' && (
                          <span>
                            {item.dimensao_comprimento_cm ?? 0} × {item.dimensao_largura_cm ?? 0} ×{' '}
                            {item.dimensao_altura_cm ?? 0} cm
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Rastreabilidade: Fornecedor / Terceirizado de Origem */}
                  <div className="flex items-center justify-between text-xs pt-1 border-t border-border/60">
                    <div className="flex items-center gap-1.5 min-w-0 text-muted-foreground">
                      <Truck className="h-3.5 w-3.5 shrink-0 text-primary" />
                      <span className="truncate font-medium">
                        {forn
                          ? forn.nome_fantasia || forn.razao_social
                          : 'Origem interna / Sem fornecedor'}
                      </span>
                    </div>

                    {/* Ações */}
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground hover:text-foreground"
                        onClick={() => abrirEditar(item)}
                        title="Editar Insumo"
                      >
                        <Edit2 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-destructive hover:bg-destructive/10"
                        onClick={() => setInsumoParaExcluir(item)}
                        title="Excluir Insumo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {item.observacoes && (
                    <p className="text-[11px] text-muted-foreground line-clamp-1 italic bg-muted/20 px-2 py-1 rounded">
                      &quot;{item.observacoes}&quot;
                    </p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      {/* Diálogo de Criação/Edição de Insumo */}
      <InsumoDialog
        open={dialogInsumoOpen}
        onOpenChange={setDialogInsumoOpen}
        record={insumoSelecionado}
        categorias={categorias}
        fornecedores={fornecedores}
        onSaved={carregarDados}
        onOpenCategorias={() => setDialogCategoriasOpen(true)}
      />

      {/* Diálogo de Gerenciamento de Categorias de Insumos */}
      <CategoriasInsumoDialog
        open={dialogCategoriasOpen}
        onOpenChange={setDialogCategoriasOpen}
        onCategoriaUpdated={carregarDados}
      />

      {/* Diálogo de Confirmação de Exclusão */}
      <AlertDialog
        open={Boolean(insumoParaExcluir)}
        onOpenChange={(op) => !op && setInsumoParaExcluir(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir insumo do catálogo?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs">
              Tem certeza de que deseja excluir o cadastro de &quot;{insumoParaExcluir?.nome}&quot;?
              Os produtos que já possuem este item gravado na receita ou snapshots anteriores de
              orçamentos não perderão seus custos calculados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={excluindo}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={excluindo}
              className="bg-destructive text-white"
            >
              {excluindo ? 'Excluindo...' : 'Confirmar Exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
