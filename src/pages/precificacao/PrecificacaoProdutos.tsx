import { useEffect, useRef, useState } from 'react'
import {
  Edit2,
  Trash2,
  Layers,
  Plus,
  Calculator,
  Truck,
  Check,
  Building2,
  Boxes,
  Camera,
  ImageIcon,
  X,
  AlertTriangle,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
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
import { precificacaoService } from '@/services/precificacao'
import { cadastrosService } from '@/services/cadastros'
import { fornecedoresService } from '@/services/fornecedores'
import { PrecKitRecord, PrecProdutoRecord } from '@/types/precificacao'
import { Empresa, Fornecedor, FornecedorProduto } from '@/types/domain'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmpresaDialog } from '@/components/cadastros/EmpresaDialog'
import { FornecedorDialog } from '@/components/cadastros/FornecedorDialog'
import {
  calcularCustoBaseProduto,
  ItemComposicaoCusto,
  ItemKitConfig,
} from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { KitDialog } from '@/components/precificacao/KitDialog'
import { ComboDialog } from '@/components/precificacao/ComboDialog'

export default function PrecificacaoProdutos() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [kitsMap, setKitsMap] = useState<Record<string, PrecKitRecord>>({})
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [fornecedoresProdutos, setFornecedoresProdutos] = useState<FornecedorProduto[]>([])
  const [activeMainTab, setActiveMainTab] = useState<'catalogo' | 'empresas' | 'fornecedores'>(
    'catalogo',
  )

  // Ficha de Empresa (diálogo rápido com aba de produtos)
  const [dialogEmpresaOpen, setDialogEmpresaOpen] = useState(false)
  const [empresaSelecionada, setEmpresaSelecionada] = useState<Empresa | null>(null)
  const [empresaDialogTab, setEmpresaDialogTab] = useState<'dados' | 'produtos'>('produtos')

  // Ficha de Fornecedor (diálogo rápido com aba de produtos)
  const [dialogFornecedorOpen, setDialogFornecedorOpen] = useState(false)
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null)
  const [fornecedorDialogTab, setFornecedorDialogTab] = useState<'dados' | 'produtos'>('produtos')

  // Modal de EDIÇÃO de Produto Simples (Fabricação Própria ou Revenda)
  const [openEditDialog, setOpenEditDialog] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<PrecProdutoRecord | null>(null)
  const [composicaoTemp, setComposicaoTemp] = useState<ItemComposicaoCusto[]>([])
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Upload próprio de imagem na edição simples
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
      const [prods, emps, forns, fornsProds] = await Promise.all([
        precificacaoService.listProdutos(),
        cadastrosService.listEmpresas(),
        fornecedoresService.listFornecedores(),
        fornecedoresService.listTodosProdutos().catch(() => [] as FornecedorProduto[]),
      ])
      setProdutos(prods)
      setEmpresas(emps)
      setFornecedores(forns)
      setFornecedoresProdutos(fornsProds)

      // Carregar prec_kits vinculados para kits e combos
      const kitsOuCombos = prods.filter((p) => p.tipo === 'kit' || p.tipo === 'combo')
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

    // Fabricação Própria ou Revenda: abrir diálogo de edição completa
    setProdutoEditando(p)
    setComposicaoTemp(p.composicao || [])
    setImagemFile(null)
    setRemoverImagem(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (p.imagem) {
      setImagemPreview(precificacaoService.getProdutoImageUrl(p))
    } else {
      setImagemPreview(null)
    }
    setFormErrors({})
    setOpenEditDialog(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Formato inválido',
        description: 'Selecione um arquivo de imagem (PNG, JPG, WEBP, etc.).',
      })
      return
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Arquivo muito grande',
        description: 'A imagem deve ter no máximo 5MB.',
      })
      return
    }

    setImagemFile(file)
    setRemoverImagem(false)
    setImagemPreview(URL.createObjectURL(file))
  }

  function handleRemoverImagem() {
    setImagemFile(null)
    setImagemPreview(null)
    setRemoverImagem(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSalvarEdicaoSimples(e: React.FormEvent) {
    e.preventDefault()
    if (!produtoEditando?.id || !produtoEditando?.sku || !produtoEditando?.nome) return

    setSaving(true)
    try {
      const payload: Partial<PrecProdutoRecord> = {
        ...produtoEditando,
        composicao: composicaoTemp,
      }
      delete payload.imagem

      if (imagemFile) {
        const formData = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            formData.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val))
          }
        })
        formData.append('imagem', imagemFile)
        await precificacaoService.updateProduto(produtoEditando.id, formData)
      } else if (removerImagem) {
        const formData = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            formData.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val))
          }
        })
        formData.append('imagem', '')
        await precificacaoService.updateProduto(produtoEditando.id, formData)
      } else {
        await precificacaoService.updateProduto(produtoEditando.id, payload)
      }

      toast({
        title: 'Produto atualizado com sucesso!',
        description: 'Alterações salvas e cenários marcados como desatualizados para conferência.',
      })
      setOpenEditDialog(false)
      carregar()
    } catch (err) {
      const fieldErrs = apiFieldErrors(err)
      const errorMsg = apiMessage(err, 'Não foi possível salvar as alterações.')
      if (fieldErrs.sku) {
        fieldErrs.sku = `Já existe um produto com o SKU '${produtoEditando.sku}'.`
      }
      setFormErrors({ ...fieldErrs, form: errorMsg })
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar',
        description: fieldErrs.sku || errorMsg,
      })
    } finally {
      setSaving(false)
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
      case 'fabricacao_propria':
        return (
          <Badge className="bg-amber-600 hover:bg-amber-600/90 text-white text-[10px] font-semibold border-none">
            Fabricação Própria
          </Badge>
        )
      case 'revenda':
        return (
          <Badge className="bg-blue-600 hover:bg-blue-600/90 text-white text-[10px] font-semibold border-none">
            Revenda
          </Badge>
        )
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
        const prodComponente = produtos.find((item) => item.id === primeiroItem.produto_id)
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
        titulo="Gestão de Produtos, Kits & Combos"
        subtitulo="Edição e exclusão de produtos de fabricação própria e revenda, além da criação ágil de Kits e Combos"
        acoes={
          <div className="flex items-center gap-2">
            <Button
              className="bg-primary text-white font-bold text-xs"
              onClick={() => {
                setKitEditando(null)
                setOpenKitDialog(true)
              }}
            >
              <Boxes className="mr-1.5 h-4 w-4" />+ Novo Kit
            </Button>
            <Button
              variant="outline"
              className="border-primary/40 text-primary hover:bg-primary/10 font-bold text-xs"
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
          <p className="font-bold text-foreground">
            Papel desta página: Gestão do Catálogo & Criação de Kits
          </p>
          <p className="text-muted-foreground leading-relaxed">
            Esta página gerencia produtos já cadastrados e cria Kits e Combos. Produtos novos nascem
            na ficha de quem os fornece ou fabrica:{' '}
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

      {/* Abas Superiores: Catálogo Geral | Empresas (Fabricação Própria) | Fornecedores (Revenda) */}
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
            Catálogo & Kits ({produtos.length})
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

        {/* ABA 1: CATÁLOGO GERAL & KITS */}
        <TabsContent value="catalogo" className="space-y-4 focus-visible:outline-none mt-0">
          <Card className="shadow-xs border-border/80">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
              <div>
                <CardTitle className="text-base font-bold">Catálogo de Produtos & SKUs</CardTitle>
                <CardDescription className="text-xs">
                  Cadastros individuais (criados em /fornecedores ou /empresas) e Kits/Combos
                  agrupados
                </CardDescription>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">
                {produtos.length} produtos / kits cadastrados
              </span>
            </CardHeader>

            <CardContent className="overflow-x-auto p-0">
              {loading ? (
                <div className="space-y-2 p-4">
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                  <Skeleton className="h-10 w-full" />
                </div>
              ) : produtos.length === 0 ? (
                <div className="text-center py-12 px-4 text-muted-foreground max-w-lg mx-auto space-y-4">
                  <div className="h-12 w-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center mx-auto">
                    <Layers className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-sm">Nenhum produto encontrado</p>
                    <p className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                      Todos os cadastros de produtos simples devem ser realizados em{' '}
                      <strong className="text-foreground">Fornecedores</strong> (para itens de
                      revenda) ou em <strong className="text-foreground">Empresas</strong> (para
                      itens de fabricação própria). Aqui em Precificação você pode editar, excluir
                      ou criar Kits e Combos.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                    <Button asChild size="sm" variant="outline" className="text-xs">
                      <Link to="/fornecedores">
                        <Truck className="mr-1.5 h-3.5 w-3.5 text-primary" />
                        Cadastrar em /fornecedores
                      </Link>
                    </Button>
                    <Button asChild size="sm" variant="outline" className="text-xs">
                      <Link to="/empresas">
                        <Building2 className="mr-1.5 h-3.5 w-3.5 text-primary" />
                        Cadastrar em /empresas
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
                      <th className="py-2.5 px-3 font-bold">Origem / Componentes</th>
                      <th className="py-2.5 px-3 font-bold">Peso / Medidas</th>
                      <th className="py-2.5 px-3 font-bold text-right">Custo Direto</th>
                      <th className="py-2.5 px-3 font-bold text-right">Custo Total</th>
                      <th className="py-2.5 px-4 font-bold text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {produtos.map((p) => {
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

                      const nomeFornecedor =
                        p.expand?.fornecedor?.nome_fantasia ||
                        fornecedores.find((f) => f.id === p.fornecedor)?.nome_fantasia

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

                          <td className="py-3 px-3 text-muted-foreground">
                            {p.tipo === 'revenda' && (
                              <div className="flex items-center gap-1.5">
                                <Truck className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                                <span className="font-medium text-foreground">
                                  {nomeFornecedor || 'Fornecedor cadastrado'}
                                </span>
                              </div>
                            )}
                            {p.tipo === 'fabricacao_propria' && (
                              <div className="flex items-center gap-1.5">
                                <Building2 className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                                <span className="font-medium text-foreground">
                                  {p.expand?.empresa?.nome_fantasia ||
                                    empresas.find((e) => e.id === p.empresa)?.nome_fantasia ||
                                    'Empresa própria'}
                                </span>
                              </div>
                            )}
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
                const prodsEmpresa = produtos.filter((p) => p.empresa === emp.id)
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

      {/* DIÁLOGO DE EDIÇÃO COMPLETA DE PRODUTO SIMPLES (FABRICAÇÃO OU REVENDA) */}
      <Dialog open={openEditDialog} onOpenChange={setOpenEditDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          {produtoEditando && (
            <form onSubmit={handleSalvarEdicaoSimples}>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                    <Edit2 className="h-4 w-4" />
                  </div>
                  <div>
                    <DialogTitle>Editar Produto / Custo</DialogTitle>
                    <DialogDescription className="text-xs">
                      {produtoEditando.tipo === 'fabricacao_propria'
                        ? 'Produto de Fabricação Própria — ajuste os dados cadastrais e a Composição Analítica (C0..C12).'
                        : 'Produto de Revenda — ajuste custo de aquisição, despesas e dados físicos.'}
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              {(formErrors.sku || formErrors.form) && (
                <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
                  <p className="font-semibold">{formErrors.sku || formErrors.form}</p>
                </div>
              )}

              <div className="space-y-4 py-3 text-xs">
                {/* Imagem do Produto */}
                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Imagem do Produto</Label>
                  <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20">
                    <div className="relative h-14 w-14 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                      {imagemPreview ? (
                        <img
                          src={imagemPreview}
                          alt="Preview do produto"
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="h-6 w-6 text-muted-foreground/40" />
                      )}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs font-semibold"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Camera className="mr-1.5 h-3.5 w-3.5 text-primary" />
                          {imagemPreview ? 'Alterar Imagem' : 'Anexar Imagem'}
                        </Button>
                        {imagemPreview && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:bg-destructive/10"
                            onClick={handleRemoverImagem}
                          >
                            <X className="mr-1 h-3.5 w-3.5" />
                            Remover
                          </Button>
                        )}
                      </div>
                      <p className="text-[11px] text-muted-foreground">PNG, JPG, WEBP até 5MB.</p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                  </div>
                </div>

                {/* Identificação Geral */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">SKU Único *</Label>
                    <Input
                      required
                      value={produtoEditando.sku}
                      onChange={(e) =>
                        setProdutoEditando({ ...produtoEditando, sku: e.target.value })
                      }
                      className={formErrors.sku ? 'border-destructive' : ''}
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Nome do Produto *</Label>
                    <Input
                      required
                      value={produtoEditando.nome}
                      onChange={(e) =>
                        setProdutoEditando({ ...produtoEditando, nome: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* Marca, Categoria e Unidade */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Marca</Label>
                    <Input
                      value={produtoEditando.marca || ''}
                      onChange={(e) =>
                        setProdutoEditando({ ...produtoEditando, marca: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Categoria</Label>
                    <Input
                      value={produtoEditando.categoria || ''}
                      onChange={(e) =>
                        setProdutoEditando({ ...produtoEditando, categoria: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Unidade</Label>
                    <Input
                      value={produtoEditando.unidade || 'un'}
                      onChange={(e) =>
                        setProdutoEditando({ ...produtoEditando, unidade: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* Código de barras e Embalagem */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Código de Barras (EAN)</Label>
                    <Input
                      value={produtoEditando.codigo_barras || ''}
                      onChange={(e) =>
                        setProdutoEditando({ ...produtoEditando, codigo_barras: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Embalagem Padrão</Label>
                    <Input
                      value={produtoEditando.embalagem || ''}
                      onChange={(e) =>
                        setProdutoEditando({ ...produtoEditando, embalagem: e.target.value })
                      }
                    />
                  </div>
                </div>

                {/* Peso e Dimensões */}
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Peso (g)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={produtoEditando.peso_g ?? ''}
                      onChange={(e) =>
                        setProdutoEditando({
                          ...produtoEditando,
                          peso_g: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Compr. (cm)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={produtoEditando.dimensao_comprimento_cm ?? ''}
                      onChange={(e) =>
                        setProdutoEditando({
                          ...produtoEditando,
                          dimensao_comprimento_cm: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Larg. (cm)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={produtoEditando.dimensao_largura_cm ?? ''}
                      onChange={(e) =>
                        setProdutoEditando({
                          ...produtoEditando,
                          dimensao_largura_cm: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Altura (cm)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={produtoEditando.dimensao_altura_cm ?? ''}
                      onChange={(e) =>
                        setProdutoEditando({
                          ...produtoEditando,
                          dimensao_altura_cm: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                {/* Seção Específica: Fabricação Própria (C0..C12) */}
                {produtoEditando.tipo === 'fabricacao_propria' && (
                  <div className="rounded-xl border border-border p-3 space-y-3 bg-secondary/10">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                        Composição Analítica de Custos (C0..C12)
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px]"
                        onClick={() => {
                          const nextIdx = composicaoTemp.length
                          setComposicaoTemp([
                            ...composicaoTemp,
                            {
                              codigo: `C${nextIdx}`,
                              descricao: '',
                              qtd: 1,
                              custo_unitario: 0,
                              categoria_custo: 'material',
                            },
                          ])
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar Linha (C{composicaoTemp.length})
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {composicaoTemp.map((item, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Input
                            className="w-16 h-8 text-xs font-mono font-bold"
                            value={item.codigo || `C${idx}`}
                            onChange={(e) => {
                              const arr = [...composicaoTemp]
                              arr[idx].codigo = e.target.value
                              setComposicaoTemp(arr)
                            }}
                          />
                          <Input
                            className="flex-1 h-8 text-xs"
                            placeholder="Descrição do insumo ou serviço..."
                            value={item.descricao}
                            onChange={(e) => {
                              const arr = [...composicaoTemp]
                              arr[idx].descricao = e.target.value
                              setComposicaoTemp(arr)
                            }}
                          />
                          <div className="w-20">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-xs font-mono"
                              placeholder="Qtd"
                              value={item.qtd}
                              onChange={(e) => {
                                const arr = [...composicaoTemp]
                                arr[idx].qtd = parseFloat(e.target.value) || 0
                                setComposicaoTemp(arr)
                              }}
                            />
                          </div>
                          <div className="w-24">
                            <Input
                              type="number"
                              step="0.01"
                              className="h-8 text-xs font-mono"
                              placeholder="R$ Unit"
                              value={item.custo_unitario}
                              onChange={(e) => {
                                const arr = [...composicaoTemp]
                                arr[idx].custo_unitario = parseFloat(e.target.value) || 0
                                setComposicaoTemp(arr)
                              }}
                            />
                          </div>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-destructive"
                            onClick={() =>
                              setComposicaoTemp(composicaoTemp.filter((_, i) => i !== idx))
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Seção Específica: Revenda (Custo de Aquisição) */}
                {produtoEditando.tipo === 'revenda' && (
                  <div className="rounded-xl border border-border p-3 space-y-3 bg-secondary/10">
                    <div className="space-y-1">
                      <Label className="font-bold text-xs">
                        Custo de Aquisição Unitário (R$) *
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={produtoEditando.custo_aquisicao_unitario ?? 0}
                        onChange={(e) =>
                          setProdutoEditando({
                            ...produtoEditando,
                            custo_aquisicao_unitario: parseFloat(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                )}

                {/* Custos Adicionais Globais: Embalagem, Etiqueta e Perda */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Embalagem Adicional (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={produtoEditando.custo_adicional_embalagem ?? 0}
                      onChange={(e) =>
                        setProdutoEditando({
                          ...produtoEditando,
                          custo_adicional_embalagem: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Etiqueta (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={produtoEditando.custo_etiqueta ?? 0}
                      onChange={(e) =>
                        setProdutoEditando({
                          ...produtoEditando,
                          custo_etiqueta: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Perda Estimada (%)</Label>
                    <Input
                      type="number"
                      step="0.5"
                      value={produtoEditando.perda_pct ?? 0}
                      onChange={(e) =>
                        setProdutoEditando({
                          ...produtoEditando,
                          perda_pct: parseFloat(e.target.value) || 0,
                        })
                      }
                    />
                  </div>
                </div>
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving}
                  onClick={() => setOpenEditDialog(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={saving} className="bg-primary text-white font-bold">
                  <Check className="mr-1.5 h-4 w-4" />
                  {saving ? 'Salvando...' : 'Salvar Alterações'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL DE CRIAÇÃO/EDIÇÃO DE KIT */}
      <KitDialog
        open={openKitDialog}
        onOpenChange={setOpenKitDialog}
        kitParaEditar={kitEditando}
        produtosDisponiveis={produtos}
        onSuccess={carregar}
      />

      {/* MODAL DE CRIAÇÃO/EDIÇÃO DE COMBO */}
      <ComboDialog
        open={openComboDialog}
        onOpenChange={setOpenComboDialog}
        comboParaEditar={comboEditando}
        produtosDisponiveis={produtos}
        onSuccess={carregar}
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
