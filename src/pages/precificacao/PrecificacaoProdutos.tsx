import { useEffect, useMemo, useState } from 'react'
import {
  Edit2,
  Trash2,
  Layers,
  Calculator,
  Truck,
  Building2,
  Boxes,
  AlertTriangle,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
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
import { filtrarApenasKitsECombos, precificacaoService } from '@/services/precificacao'
import { cadastrosService } from '@/services/cadastros'
import { fornecedoresService } from '@/services/fornecedores'
import { PrecCanalRecord, PrecKitRecord, PrecProdutoRecord } from '@/types/precificacao'
import { SkuApelidosManager } from '@/components/precificacao/SkuApelidosManager'
import { Empresa, Fornecedor, FornecedorProduto } from '@/types/domain'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmpresaDialog } from '@/components/cadastros/EmpresaDialog'
import { FornecedorDialog } from '@/components/cadastros/FornecedorDialog'
import { calcularCustoBaseProduto, ItemKitConfig } from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { KitDialog } from '@/components/precificacao/KitDialog'
import { ComboDialog } from '@/components/precificacao/ComboDialog'
import { CategoriasProdutoDialog } from '@/components/precificacao/CategoriasProdutoDialog'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Search, Tag, Filter } from 'lucide-react'

export default function PrecificacaoProdutos() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  // produtosBase: contém todos os produtos do sistema para alimentar KitDialog e ComboDialog
  const [todosProdutos, setTodosProdutos] = useState<PrecProdutoRecord[]>([])
  const [kitsMap, setKitsMap] = useState<Record<string, PrecKitRecord>>({})
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedoresProdutos, setFornecedoresProdutos] = useState<FornecedorProduto[]>([])
  const [activeMainTab, setActiveMainTab] = useState<'catalogo' | 'empresas' | 'fornecedores'>(
    'catalogo',
  )

  // Filtros de Kits & Combos
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')
  const [buscaTexto, setBuscaTexto] = useState<string>('')
  const [dialogCategoriasOpen, setDialogCategoriasOpen] = useState(false)

  // A tabela principal exibe APENAS Kits e Combos (produtos base de fabricação/revenda residem em /empresas e /fornecedores)
  const todosKitsECombos = useMemo(() => filtrarApenasKitsECombos(todosProdutos), [todosProdutos])

  // Lista única de categorias presentes nos produtos
  const categoriasDisponiveis = useMemo(() => {
    const set = new Set<string>()
    todosProdutos.forEach((p) => {
      if (p.categoria?.trim()) set.add(p.categoria.trim())
    })
    return Array.from(set).sort()
  }, [todosProdutos])

  const kitsECombos = useMemo(() => {
    return todosKitsECombos.filter((p) => {
      // Filtro categoria
      if (filtroCategoria === 'sem_categoria') {
        if (p.categoria && p.categoria.trim() !== '') return false
      } else if (filtroCategoria !== 'todas') {
        if (p.categoria?.toLowerCase() !== filtroCategoria.toLowerCase()) return false
      }

      // Filtro busca (nome ou SKU)
      if (buscaTexto.trim()) {
        const termo = buscaTexto.toLowerCase().trim()
        const matchNome = p.nome?.toLowerCase().includes(termo)
        const matchSku = p.sku?.toLowerCase().includes(termo)
        if (!matchNome && !matchSku) return false
      }

      return true
    })
  }, [todosKitsECombos, filtroCategoria, buscaTexto])

  // Ficha de Empresa (diálogo rápido com aba de produtos)
  const [dialogEmpresaOpen, setDialogEmpresaOpen] = useState(false)
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null)
  const [empresaDialogTab, setEmpresaDialogTab] = useState<'dados' | 'produtos'>('produtos')

  // Ficha de Fornecedor (diálogo rápido com aba de produtos)
  const [dialogFornecedorOpen, setDialogFornecedorOpen] = useState(false)
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null)
  const [fornecedorDialogTab, setFornecedorDialogTab] = useState<'dados' | 'produtos'>('produtos')

  // Diálogos de Kit e Combo
  const [openKitDialog, setOpenKitDialog] = useState(false)
  const [kitEditando, setKitEditando] = useState<PrecProdutoRecord | null>(null)

  const [openComboDialog, setOpenComboDialog] = useState(false)
  const [comboEditando, setComboEditando] = useState<PrecProdutoRecord | null>(null)

  // Confirmação de exclusão
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<PrecProdutoRecord | null>(null)
  const [deletando, setDeletando] = useState(false)

  async function carregar() {
    try {
      setLoading(true)
      const [prods, emps, forns, fornsProds, canaisList] = await Promise.all([
        precificacaoService.listProdutos(),
        cadastrosService.listEmpresas(),
        fornecedoresService.listFornecedores(),
        fornecedoresService.listTodosProdutos().catch(() => [] as FornecedorProduto[]),
        precificacaoService.listCanais().catch(() => [] as PrecCanalRecord[]),
      ])
      setTodosProdutos(prods)
      setEmpresas(emps)
      setFornecedores(forns)
      setFornecedoresProdutos(fornsProds)
      setCanais(canaisList)

      // Carregar prec_kits vinculados para kits e combos
      const kitsOuCombos = filtrarApenasKitsECombos(prods)
      if (kitsOuCombos.length > 0) {
        const mapa: Record<string, PrecKitRecord> = {}
        await Promise.all(
          kitsOuCombos.map(async (k) => {
            try {
              const kitRec = await precificacaoService.getKitByProdutoPai(k.id)
              if (kitRec) mapa[k.id] = kitRec
            } catch (err) {
              console.warn(`Erro ao carregar prec_kit para ${k.id}:`, err)
            }
          }),
        )
        setKitsMap(mapa)
      } else {
        setKitsMap({})
      }
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  function abrirEdicao(p: PrecProdutoRecord) {
    if (p.tipo === 'kit') {
      setKitEditando(p)
      setOpenKitDialog(true)
      return
    }
    if (p.tipo === 'combo') {
      setComboEditando(p)
      setOpenComboDialog(true)
      return
    }
  }

  async function confirmarExclusao() {
    if (!produtoParaExcluir) return
    setDeletando(true)
    try {
      await precificacaoService.deleteProduto(produtoParaExcluir.id)
      toast({
        title: 'Excluído com sucesso',
        description:
          produtoParaExcluir.tipo === 'kit' || produtoParaExcluir.tipo === 'combo'
            ? `${produtoParaExcluir.nome} removido. Os produtos componentes originais permanecem intocados.`
            : `${produtoParaExcluir.nome} foi removido da precificação.`,
      })
      setProdutoParaExcluir(null)
      carregar()
    } catch {
      toast({
        variant: 'destructive',
        title: 'Erro ao excluir',
        description: 'Não foi possível remover o produto.',
      })
    } finally {
      setDeletando(false)
    }
  }

  function renderBadgeTipo(tipo: PrecProdutoRecord['tipo']) {
    switch (tipo) {
      case 'kit':
        return (
          <Badge className="bg-primary hover:bg-primary/90 text-white text-[10px] font-semibold border-none">
            Kit
          </Badge>
        )
      case 'combo':
        return (
          <Badge className="bg-purple-600 hover:bg-purple-600/90 text-white text-[10px] font-semibold border-none">
            Combo
          </Badge>
        )
      default:
        return (
          <Badge variant="outline" className="text-[10px]">
            {tipo}
          </Badge>
        )
    }
  }

  function getImagemParaExibir(p: PrecProdutoRecord): string {
    if (p.imagem) {
      return precificacaoService.getProdutoImageUrl(p, '100x100')
    }
    // Para Kit ou Combo sem imagem própria: tentar herdar visualmente a do primeiro produto componente
    if (p.tipo === 'kit' || p.tipo === 'combo') {
      const kitRec = kitsMap[p.id]
      const primeiroItem = kitRec?.itens?.[0]
      if (primeiroItem?.produto_id) {
        const prodComponente = todosProdutos.find((item) => item.id === primeiroItem.produto_id)
        if (prodComponente?.imagem) {
          return precificacaoService.getProdutoImageUrl(prodComponente, '100x100')
        }
      }
    }
    return ''
  }

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Gestão de Kits & Combos"
        subtitulo="Criação, edição e exclusão ágil de Kits e Combos. Produtos base nascem nas fichas de Empresas e Fornecedores."
        acoes={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs font-semibold"
              onClick={() => setDialogCategoriasOpen(true)}
            >
              <Tag className="mr-1.5 h-3.5 w-3.5 text-primary" />
              Categorias
            </Button>
            <Button
              className="bg-primary text-white font-bold text-xs h-8"
              onClick={() => {
                setKitEditando(null)
                setOpenKitDialog(true)
              }}
            >
              <Boxes className="mr-1.5 h-4 w-4" />+ Novo Kit
            </Button>
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10 font-bold text-xs h-8"
              onClick={() => {
                setComboEditando(null)
                setOpenComboDialog(true)
              }}
            >
              <Layers className="mr-1.5 h-4 w-4" />+ Novo Combo
            </Button>
          </div>
        }
      />

      {/* Informativo / Banner explicativo da página */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm text-foreground flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
          <Boxes className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <p className="font-bold text-foreground">Papel desta página: Gestão de Kits & Combos</p>
          <p className="text-muted-foreground leading-relaxed">
            Esta página gerencia exclusivamente Kits e Combos. Produtos base nascem nas fichas de
            quem os fabrica ou fornece:{' '}
            <button
              type="button"
              onClick={() => setActiveMainTab('fornecedores')}
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Fornecedores (revenda)
            </button>{' '}
            ou{' '}
            <button
              type="button"
              onClick={() => setActiveMainTab('empresas')}
              className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
            >
              Empresas (fabricação própria)
            </button>
            .
          </p>
        </div>
      </div>

      {/* Abas Superiores: Kits & Combos | Empresas (Fabricação Própria) | Fornecedores (Revenda) */}
      <Tabs
        value={activeMainTab}
        onValueChange={(v) => setActiveMainTab(v as 'catalogo' | 'empresas' | 'fornecedores')}
        className="w-full space-y-4"
      >
        <TabsList className="bg-secondary/40 p-1 border border-border/60">
          <TabsTrigger
            value="catalogo"
            className="text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-primary"
          >
            <Boxes className="mr-1.5 h-4 w-4" />
            Kits & Combos ({kitsECombos.length})
          </TabsTrigger>
          <TabsTrigger
            value="empresas"
            className="text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-primary"
          >
            <Building2 className="mr-1.5 h-4 w-4" />
            Empresas ({empresas.length})
          </TabsTrigger>
          <TabsTrigger
            value="fornecedores"
            className="text-xs sm:text-sm font-semibold data-[state=active]:bg-background data-[state=active]:text-primary"
          >
            <Truck className="mr-1.5 h-4 w-4" />
            Fornecedores ({fornecedores.length})
          </TabsTrigger>
        </TabsList>

        {/* ABA 1: KITS & COMBOS */}
        <TabsContent value="catalogo" className="space-y-4 focus-visible:outline-none mt-0">
          <Card className="shadow-xs border-border/80">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
              <div>
                <CardTitle className="text-base font-bold">Kits & Combos</CardTitle>
                <CardDescription className="text-xs">
                  Produtos agrupados para venda comercial. Itens base de fabricação própria ou
                  revenda devem ser gerenciados nas fichas de Empresas e Fornecedores.
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {/* Busca texto */}
                <div className="relative w-48 sm:w-56">
                  <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                  <Input
                    placeholder="Buscar SKU ou nome..."
                    value={buscaTexto}
                    onChange={(e) => setBuscaTexto(e.target.value)}
                    className="pl-8 h-8 text-xs bg-white"
                  />
                </div>

                {/* Filtro Categoria */}
                <div className="w-44">
                  <Select value={filtroCategoria} onValueChange={setFiltroCategoria}>
                    <SelectTrigger className="h-8 text-xs bg-white">
                      <div className="flex items-center gap-1.5 truncate">
                        <Filter className="h-3 w-3 text-muted-foreground shrink-0" />
                        <span className="truncate">
                          {filtroCategoria === 'todas'
                            ? 'Todas categorias'
                            : filtroCategoria === 'sem_categoria'
                              ? 'Sem categoria'
                              : filtroCategoria}
                        </span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todas">Todas as categorias</SelectItem>
                      <SelectItem value="sem_categoria">Sem categoria</SelectItem>
                      {categoriasDisponiveis.map((cat) => (
                        <SelectItem key={cat} value={cat}>
                          {cat}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <span className="text-xs font-semibold text-muted-foreground ml-1">
                  Exibindo {kitsECombos.length} de {todosKitsECombos.length}
                </span>
              </div>
            </CardHeader>

            <CardContent className="overflow-x-auto p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : kitsECombos.length === 0 ? (
                <div className="text-center py-12 px-4 text-muted-foreground max-w-lg mx-auto space-y-4">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Layers className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">
                      Nenhum Kit ou Combo cadastrado
                    </p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Esta página exibe apenas Kits e Combos. Produtos base de fabricação própria
                      nascem na ficha de <strong className="text-foreground">Empresas</strong>{' '}
                      (/empresas) e produtos de revenda na ficha de{' '}
                      <strong className="text-foreground">Fornecedores</strong> (/fornecedores).
                      Clique nos botões abaixo para criar seu primeiro Kit ou Combo com base nesses
                      produtos.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Button asChild size="sm" variant="outline" className="text-xs">
                      <Link to="/empresas">
                        <Building2 className="mr-1.5 h-3.5 w-3.5 text-primary" />
                        Ver /empresas (Fabricação Própria)
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-xs">
                      <Link to="/fornecedores">
                        <Truck className="mr-1.5 h-3.5 w-3.5 text-primary" />
                        Ver /fornecedores (Revenda)
                      </Link>
                    </Button>
                    <Button
                      size="sm"
                      className="bg-primary text-white text-xs font-bold"
                      onClick={() => {
                        setKitEditando(null)
                        setOpenKitDialog(true)
                      }}
                    >
                      <Boxes className="mr-1.5 h-3.5 w-3.5" />
                      Criar Kit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      className="text-xs font-bold text-primary"
                      onClick={() => {
                        setComboEditando(null)
                        setOpenComboDialog(true)
                      }}
                    >
                      <Layers className="mr-1.5 h-3.5 w-3.5" />
                      Criar Combo
                    </Button>
                  </div>
                </div>
              ) : (
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-y border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                      <th className="py-2.5 px-4 font-bold">Produto / SKU</th>
                      <th className="py-2.5 px-3 font-bold">Tipo</th>
                      <th className="py-2.5 px-3 font-bold">Categoria</th>
                      <th className="py-2.5 px-3 font-bold">Origem / Componentes</th>
                      <th className="py-2.5 px-3 font-bold">Peso / Medidas</th>
                      <th className="py-2.5 px-3 font-bold text-right">Custo Direto</th>
                      <th className="py-2.5 px-3 font-bold text-right">Custo Total</th>
                      <th className="py-2.5 px-4 font-bold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {kitsECombos.map((p) => {
                      const kitRecord = kitsMap[p.id]
                      const itensKitConfig: ItemKitConfig[] | undefined = kitRecord?.itens?.map(
                        (it) => ({
                          produto_id: it.produto_id,
                          nome: it.nome,
                          qtd_efetiva: it.qtd_efetiva,
                          custo_unitario: it.custo_unitario,
                        }),
                      )

                      const custoCalc = calcularCustoBaseProduto({
                        sku: p.sku,
                        nome: p.nome,
                        tipo: p.tipo,
                        peso_g: p.peso_g,
                        composicao: p.composicao,
                        perda_pct: p.perda_pct,
                        custo_aquisicao_unitario: p.custo_aquisicao_unitario,
                        despesas_compra: p.despesas_compra,
                        custo_etiqueta: p.custo_etiqueta,
                        custo_adicional_embalagem: p.custo_adicional_embalagem,
                        kit_itens: itensKitConfig,
                        kit_custos_adicionais: kitRecord?.custos_adicionais,
                      })

                      const imagemSrc = getImagemParaExibir(p)

                      return (
                        <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2.5">
                              <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center font-bold text-xs text-muted-foreground shrink-0 overflow-hidden">
                                {imagemSrc ? (
                                  <img
                                    src={imagemSrc}
                                    alt={p.nome}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  p.sku.slice(0, 3)
                                )}
                              </div>
                              <div>
                                <span className="font-bold text-foreground block">{p.nome}</span>
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[10px] font-mono text-primary font-bold">
                                    SKU: {p.sku}
                                  </span>
                                  {p.marca && (
                                    <span className="text-[10px] text-muted-foreground">
                                      • {p.marca}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          <td className="py-3 px-3">{renderBadgeTipo(p.tipo)}</td>

                          <td className="py-3 px-3">
                            {p.categoria ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-semibold bg-secondary/60 text-foreground border-border"
                              >
                                {p.categoria}
                              </Badge>
                            ) : (
                              <span className="text-[10px] text-muted-foreground italic">
                                Sem categoria
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-muted-foreground">
                            {p.tipo === 'kit' && (
                              <div className="flex items-center gap-1.5">
                                <Boxes className="h-3.5 w-3.5 text-primary shrink-0" />
                                <span className="font-medium text-foreground">
                                  {p.qtd_por_kit || kitRecord?.itens?.[0]?.qtd_efetiva || 2} un do
                                  produto base
                                </span>
                              </div>
                            )}
                            {p.tipo === 'combo' && (
                              <div className="flex items-center gap-1.5">
                                <Layers className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                                <span className="font-medium text-foreground">
                                  {kitRecord?.itens?.length || 2} produtos combinados
                                </span>
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 text-muted-foreground font-mono">
                            {p.peso_g ? `${p.peso_g}g` : '-'}
                            {(p.dimensao_comprimento_cm ||
                              p.dimensao_largura_cm ||
                              p.dimensao_altura_cm) && (
                              <span className="block text-[10px] text-muted-foreground/70">
                                {p.dimensao_comprimento_cm || 0}x{p.dimensao_largura_cm || 0}x
                                {p.dimensao_altura_cm || 0}cm
                              </span>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                            {formatCurrency(custoCalc.custo_direto)}
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                            {formatCurrency(custoCalc.custo_total)}
                          </td>

                          <td className="py-3 px-4 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button
                                asChild
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs text-primary font-bold"
                              >
                                <Link to={`/precificacao/comparar?sku=${p.sku}`}>
                                  <Calculator className="mr-1 h-3.5 w-3.5" />
                                  Comparar
                                </Link>
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={() => abrirEdicao(p)}
                                title="Editar"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7 text-destructive"
                                onClick={() => setProdutoParaExcluir(p)}
                                title="Excluir"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ABA 2: EMPRESAS (FABRICAÇÃO PRÓPRIA) */}
        <TabsContent value="empresas" className="space-y-4 focus-visible:outline-none mt-0">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm text-foreground flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-foreground">
                Cadastro de Produtos de Fabricação Própria
              </p>
              <p className="text-muted-foreground leading-relaxed">
                Novos produtos de fabricação própria nascem dentro da ficha de cada empresa. Clique
                em <strong className="text-foreground">Ver Ficha & Produtos</strong> para abrir
                direto a aba de produtos e cadastrar insumos, mão de obra e composição de custos.
                Você também pode gerenciar todos os dados cadastrais em{' '}
                <Link
                  to="/empresas"
                  className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  /empresas
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {empresas.length === 1
                ? '1 empresa cadastrada'
                : `${empresas.length} empresas cadastradas`}
            </p>
            <Button asChild size="sm" variant="outline" className="text-xs">
              <Link to="/empresas">
                <Building2 className="mr-1.5 h-3.5 w-3.5 text-primary" />
                Ir para Gestão de Empresas
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          ) : empresas.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <Building2 className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="font-semibold text-sm">Nenhuma empresa encontrada</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre sua primeira empresa para gerenciar produtos de fabricação própria.
              </p>
              <Button asChild size="sm" className="mt-3 bg-primary text-white">
                <Link to="/empresas">Cadastrar Empresa em /empresas</Link>
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {empresas.map((emp) => {
                const prodsEmpresa = todosProdutos.filter((p) => p.empresa === emp.id)
                const count = prodsEmpresa.length

                return (
                  <article
                    key={emp.id}
                    className="card-hover rise-in rounded-2xl border border-border bg-white p-5 shadow-soft flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                          <Building2 className="h-5 w-5" />
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[11px] font-semibold border-amber-500/30 text-amber-700 bg-amber-50"
                        >
                          Fabricação Própria
                        </Badge>
                      </div>

                      <h3 className="mt-3 font-bold text-base text-foreground line-clamp-1">
                        {emp.nome_fantasia || emp.razao_social}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {emp.razao_social}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {emp.cnpj && (
                          <Badge variant="secondary" className="tabular-nums font-mono text-[11px]">
                            {emp.cnpj}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[11px] font-semibold border-primary/30 text-primary bg-primary/5 flex items-center gap-1"
                        >
                          <Boxes className="h-3 w-3" />
                          {count} {count === 1 ? 'produto fabricado' : 'produtos fabricados'}
                        </Badge>
                      </div>

                      {prodsEmpresa.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/60">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                            Exemplos de produtos:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {prodsEmpresa.slice(0, 3).map((pr) => (
                              <span
                                key={pr.id}
                                className="inline-block px-2 py-0.5 rounded-md bg-secondary/70 text-[10px] font-medium text-foreground truncate max-w-[140px]"
                                title={pr.nome}
                              >
                                {pr.nome}
                              </span>
                            ))}
                            {prodsEmpresa.length > 3 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{prodsEmpresa.length - 3} mais
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-primary text-white text-xs font-bold"
                        onClick={() => {
                          setEmpresaSelecionada(emp)
                          setEmpresaDialogTab('produtos')
                          setDialogEmpresaOpen(true)
                        }}
                      >
                        <Boxes className="mr-1.5 h-3.5 w-3.5" />
                        Ver Ficha & Produtos ({count})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          setEmpresaSelecionada(emp)
                          setEmpresaDialogTab('dados')
                          setDialogEmpresaOpen(true)
                        }}
                      >
                        Dados
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA 3: FORNECEDORES (REVENDA) */}
        <TabsContent value="fornecedores" className="space-y-4 focus-visible:outline-none mt-0">
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-xs sm:text-sm text-foreground flex items-start gap-3">
            <div className="rounded-lg bg-primary/10 p-2 text-primary shrink-0 mt-0.5">
              <Truck className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <p className="font-bold text-foreground">Cadastro de Produtos de Revenda</p>
              <p className="text-muted-foreground leading-relaxed">
                Novos produtos de revenda nascem dentro da ficha do fornecedor. Clique em{' '}
                <strong className="text-foreground">Ver Ficha & Produtos</strong> para abrir a ficha
                do fornecedor na aba de produtos e cadastrar SKU, preço de custo e dados comerciais.
                Você também pode gerenciar todos os fornecedores em{' '}
                <Link
                  to="/fornecedores"
                  className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80"
                >
                  /fornecedores
                </Link>
                .
              </p>
            </div>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {fornecedores.length === 1
                ? '1 fornecedor cadastrado'
                : `${fornecedores.length} fornecedores cadastrados`}
            </p>
            <Button asChild size="sm" variant="outline" className="text-xs">
              <Link to="/fornecedores">
                <Truck className="mr-1.5 h-3.5 w-3.5 text-primary" />
                Ir para Gestão de Fornecedores
              </Link>
            </Button>
          </div>

          {loading ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
              <Skeleton className="h-44 w-full rounded-2xl" />
            </div>
          ) : fornecedores.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <Truck className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="font-semibold text-sm">Nenhum fornecedor encontrado</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre seus fornecedores para vincular produtos fornecidos de revenda.
              </p>
              <Button asChild size="sm" className="mt-3 bg-primary text-white">
                <Link to="/fornecedores">Cadastrar Fornecedor em /fornecedores</Link>
              </Button>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {fornecedores.map((forn) => {
                const prodsFornecedor = fornecedoresProdutos.filter((p) => p.fornecedor === forn.id)
                const count = prodsFornecedor.length
                const doc = forn.cnpj || forn.cpf

                return (
                  <article
                    key={forn.id}
                    className="card-hover rise-in rounded-2xl border border-border bg-white p-5 shadow-soft flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between">
                        <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary">
                          <Truck className="h-5 w-5" />
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[11px] font-semibold border-blue-500/30 text-blue-700 bg-blue-50"
                        >
                          Revenda
                        </Badge>
                      </div>

                      <h3 className="mt-3 font-bold text-base text-foreground line-clamp-1">
                        {forn.nome_fantasia || forn.razao_social}
                      </h3>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">
                        {forn.razao_social}
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-1.5">
                        {doc && (
                          <Badge variant="secondary" className="tabular-nums font-mono text-[11px]">
                            {doc}
                          </Badge>
                        )}
                        <Badge
                          variant="outline"
                          className="text-[11px] font-semibold border-primary/30 text-primary bg-primary/5 flex items-center gap-1"
                        >
                          <Boxes className="h-3 w-3" />
                          {count} {count === 1 ? 'produto fornecido' : 'produtos fornecidos'}
                        </Badge>
                      </div>

                      {prodsFornecedor.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/60">
                          <p className="text-[11px] font-semibold text-muted-foreground mb-1.5">
                            Exemplos de produtos:
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {prodsFornecedor.slice(0, 3).map((pr) => (
                              <span
                                key={pr.id}
                                className="inline-block px-2 py-0.5 rounded-md bg-secondary/70 text-[10px] font-medium text-foreground truncate max-w-[140px]"
                                title={pr.descricao}
                              >
                                {pr.descricao}
                              </span>
                            ))}
                            {prodsFornecedor.length > 3 && (
                              <span className="text-[10px] text-muted-foreground self-center">
                                +{prodsFornecedor.length - 3} mais
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="mt-4 pt-3 border-t border-border flex items-center justify-between gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-primary text-white text-xs font-bold"
                        onClick={() => {
                          setFornecedorSelecionado(forn)
                          setFornecedorDialogTab('produtos')
                          setDialogFornecedorOpen(true)
                        }}
                      >
                        <Boxes className="mr-1.5 h-3.5 w-3.5" />
                        Ver Ficha & Produtos ({count})
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs"
                        onClick={() => {
                          setFornecedorSelecionado(forn)
                          setFornecedorDialogTab('dados')
                          setDialogFornecedorOpen(true)
                        }}
                      >
                        Dados
                      </Button>
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* DIÁLOGO DIRETO DE EMPRESA (FABRICAÇÃO PRÓPRIA) */}
      <EmpresaDialog
        open={dialogEmpresaOpen}
        onOpenChange={setDialogEmpresaOpen}
        record={empresaSelecionada}
        defaultTab={empresaDialogTab}
        canWrite={true}
        canDelete={false}
        onSaved={carregar}
      />

      {/* DIÁLOGO DIRETO DE FORNECEDOR (REVENDA) */}
      <FornecedorDialog
        open={dialogFornecedorOpen}
        onOpenChange={setDialogFornecedorOpen}
        record={fornecedorSelecionado}
        defaultTab={fornecedorDialogTab}
        canWrite={true}
        canDelete={false}
        onSaved={carregar}
      />

      {/* MODAL DE CRIAÇÃO/EDIÇÃO DE KIT */}
      <KitDialog
        open={openKitDialog}
        onOpenChange={setOpenKitDialog}
        kitParaEditar={kitEditando}
        produtosDisponiveis={todosProdutos}
        onSuccess={carregar}
      />

      {/* MODAL DE CRIAÇÃO/EDIÇÃO DE COMBO */}
      <ComboDialog
        open={openComboDialog}
        onOpenChange={setOpenComboDialog}
        comboParaEditar={comboEditando}
        produtosDisponiveis={todosProdutos}
        onSuccess={carregar}
      />

      {/* GERENCIAMENTO DE CATEGORIAS */}
      <CategoriasProdutoDialog
        open={dialogCategoriasOpen}
        onOpenChange={setDialogCategoriasOpen}
        onCategoriaUpdated={carregar}
      />

      {/* DIALOG DE CONFIRMAÇÃO DE EXCLUSÃO LIMPA */}
      <AlertDialog
        open={Boolean(produtoParaExcluir)}
        onOpenChange={(op) => {
          if (!op) setProdutoParaExcluir(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <AlertDialogTitle>Confirmar Exclusão</AlertDialogTitle>
            </div>
            <AlertDialogDescription className="text-xs leading-relaxed space-y-2 pt-2">
              <p>
                Tem certeza que deseja excluir{' '}
                <strong className="text-foreground">{produtoParaExcluir?.nome}</strong> (SKU:{' '}
                {produtoParaExcluir?.sku})?
              </p>
              {produtoParaExcluir?.tipo === 'kit' || produtoParaExcluir?.tipo === 'combo' ? (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-foreground">
                  <strong>Aviso de integridade:</strong> A exclusão deste{' '}
                  {produtoParaExcluir.tipo === 'kit' ? 'Kit' : 'Combo'} removerá apenas a composição
                  agrupada e o registro do kit/combo. Os{' '}
                  <strong>produtos componentes originais NÃO serão excluídos</strong> nem alterados.
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Esta ação removerá o produto e suas simulações de precificação associadas.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmarExclusao}
              disabled={deletando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90 font-bold"
            >
              {deletando ? 'Excluindo...' : 'Sim, Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
