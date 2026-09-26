import { useEffect, useRef, useState } from 'react'
import {
  PackagePlus,
  Edit2,
  Trash2,
  Layers,
  Plus,
  Calculator,
  Truck,
  Check,
  Search,
  Sparkles,
  Camera,
  ImageIcon,
  X,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { precificacaoService } from '@/services/precificacao'
import { cadastrosService } from '@/services/cadastros'
import { fornecedoresService } from '@/services/fornecedores'
import { PrecProdutoRecord } from '@/types/precificacao'
import { Empresa, Fornecedor, FornecedorProduto } from '@/types/domain'
import {
  calcularCustoBaseProduto,
  ItemComposicaoCusto,
  TipoProduto,
} from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'

export default function PrecificacaoProdutos() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])

  // Modal de Criação / Edição de Produto
  const [openDialog, setOpenDialog] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<Partial<PrecProdutoRecord> | null>(null)
  const [composicaoTemp, setComposicaoTemp] = useState<ItemComposicaoCusto[]>([])

  // Upload próprio de imagem
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Controle de Fornecedor & Produto Vinculado para Revenda
  const [fornecedorSelecionadoId, setFornecedorSelecionadoId] = useState<string>('')
  const [produtosDoFornecedor, setProdutosDoFornecedor] = useState<FornecedorProduto[]>([])
  const [loadingProdsForn, setLoadingProdsForn] = useState(false)
  const [produtoFornSelecionadoId, setProdutoFornSelecionadoId] = useState<string>('')
  const [buscaFornText, setBuscaFornText] = useState('')
  const [buscaProdFornText, setBuscaProdFornText] = useState('')

  // Rastreamento de quais campos foram preenchidos via fornecedor e se foram sobrescritos
  const [origemValores, setOrigemValores] = useState<{
    [campo: string]: {
      herdado: boolean
      valorOriginal?: string | number
      sobrescrito?: boolean
    }
  }>({})

  async function carregar() {
    try {
      setLoading(true)
      const [prods, emps, forns] = await Promise.all([
        precificacaoService.listProdutos(),
        cadastrosService.listEmpresas(),
        fornecedoresService.listFornecedores(),
      ])
      setProdutos(prods)
      setEmpresas(emps)
      setFornecedores(forns)
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  // Carrega produtos do fornecedor quando o fornecedor selecionado mudar
  useEffect(() => {
    if (fornecedorSelecionadoId) {
      setLoadingProdsForn(true)
      fornecedoresService
        .listProdutosPorFornecedor(fornecedorSelecionadoId)
        .then((items) => {
          setProdutosDoFornecedor(items)
        })
        .catch(() => {
          setProdutosDoFornecedor([])
        })
        .finally(() => {
          setLoadingProdsForn(false)
        })
    } else {
      setProdutosDoFornecedor([])
      setProdutoFornSelecionadoId('')
    }
  }, [fornecedorSelecionadoId])

  function abrirNovoProduto() {
    setProdutoEditando({
      sku: '',
      nome: '',
      tipo: 'fabricacao_propria',
      status: 'ativo',
      unidade: 'un',
      marca: '',
      categoria: '',
      codigo_barras: '',
      embalagem: '',
      peso_g: 280,
      dimensao_comprimento_cm: undefined,
      dimensao_largura_cm: undefined,
      dimensao_altura_cm: undefined,
      custo_aquisicao_unitario: 0,
      custo_adicional_embalagem: 0.1,
      custo_etiqueta: 0.05,
      perda_pct: 10,
    })
    setComposicaoTemp([
      {
        codigo: 'C0',
        descricao: 'Matéria-prima principal',
        qtd: 1,
        custo_unitario: 10.0,
        categoria_custo: 'material',
      },
    ])
    setImagemFile(null)
    setImagemPreview(null)
    setRemoverImagem(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setFornecedorSelecionadoId('')
    setProdutoFornSelecionadoId('')
    setBuscaFornText('')
    setBuscaProdFornText('')
    setOrigemValores({})
    setOpenDialog(true)
  }

  function abrirEditarProduto(p: PrecProdutoRecord) {
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

    // Inicializa seleção de fornecedor e produto vinculado se houver
    const fornId = p.fornecedor || ''
    const prodFornId = p.fornecedor_produto || ''
    setFornecedorSelecionadoId(fornId)
    setProdutoFornSelecionadoId(prodFornId)
    setBuscaFornText('')
    setBuscaProdFornText('')

    // Se já havia vínculo salvo, marcar campos que casam como herdados
    if (prodFornId) {
      setOrigemValores({
        sku: { herdado: true },
        nome: { herdado: true },
        custo_aquisicao_unitario: { herdado: true },
        peso_g: { herdado: true },
        dimensoes: { herdado: true },
        marca: { herdado: true },
        categoria: { herdado: true },
        unidade: { herdado: true },
        codigo_barras: { herdado: true },
        embalagem: { herdado: true },
      })
    } else {
      setOrigemValores({})
    }

    setOpenDialog(true)
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

  // Ao selecionar um produto do fornecedor, preenche automaticamente os campos que casam
  function handleSelecionarProdutoFornecedor(fp: FornecedorProduto) {
    setProdutoFornSelecionadoId(fp.id)

    setProdutoEditando((prev) => {
      const atual = prev || {}
      return {
        ...atual,
        fornecedor: fornecedorSelecionadoId,
        fornecedor_produto: fp.id,
        // (a) Descrição / Nome
        nome: fp.descricao || atual.nome || '',
        // (b) SKU (sugerir sku_fornecedor se preenchido)
        sku: fp.sku_fornecedor || atual.sku || '',
        // (c) Custo de Aquisição Unitário
        custo_aquisicao_unitario: fp.preco_custo_unitario ?? atual.custo_aquisicao_unitario ?? 0,
        // (d) Peso (g)
        peso_g: fp.peso_g ?? atual.peso_g ?? 0,
        // (e) Dimensões (comprimento / largura / altura em cm)
        dimensao_comprimento_cm: fp.comprimento_cm ?? atual.dimensao_comprimento_cm,
        dimensao_largura_cm: fp.largura_cm ?? atual.dimensao_largura_cm,
        dimensao_altura_cm: fp.altura_cm ?? atual.dimensao_altura_cm,
        // (f) Marca e Categoria
        marca: fp.marca || atual.marca || '',
        categoria: fp.categoria || atual.categoria || '',
        // (g) Unidade
        unidade: fp.unidade || atual.unidade || 'un',
        // (h) Código de barras e Embalagem
        codigo_barras: fp.codigo_barras || atual.codigo_barras || '',
        embalagem: fp.embalagem || atual.embalagem || '',
      }
    })

    // Se ainda não temos preview próprio e o produto do fornecedor possui imagem, exibir como preview
    if (!imagemFile && !imagemPreview && !removerImagem && fp.imagem) {
      setImagemPreview(fornecedoresService.getProdutoImageUrl(fp))
    }

    // Rastreia campos como herdados do cadastro do fornecedor
    setOrigemValores({
      sku: { herdado: true, valorOriginal: fp.sku_fornecedor || '' },
      nome: { herdado: true, valorOriginal: fp.descricao || '' },
      custo_aquisicao_unitario: { herdado: true, valorOriginal: fp.preco_custo_unitario },
      peso_g: { herdado: true, valorOriginal: fp.peso_g ?? 0 },
      dimensoes: {
        herdado: true,
        valorOriginal: `${fp.comprimento_cm || 0}x${fp.largura_cm || 0}x${fp.altura_cm || 0}`,
      },
      marca: { herdado: true, valorOriginal: fp.marca || '' },
      categoria: { herdado: true, valorOriginal: fp.categoria || '' },
      unidade: { herdado: true, valorOriginal: fp.unidade || 'un' },
      codigo_barras: { herdado: true, valorOriginal: fp.codigo_barras || '' },
      embalagem: { herdado: true, valorOriginal: fp.embalagem || '' },
    })

    toast({
      title: 'Dados do produto carregados!',
      description:
        'Custo, peso, dimensões, SKU, marca e categoria foram preenchidos a partir do cadastro do fornecedor.',
    })
  }

  // Registra sobrescrita manual pelo usuário caso ele altere um valor herdado
  function marcarSobrescrita(campo: string) {
    setOrigemValores((prev) => {
      if (!prev[campo]?.herdado) return prev
      return {
        ...prev,
        [campo]: {
          ...prev[campo],
          sobrescrito: true,
        },
      }
    })
  }

  async function handleSalvarProduto(e: React.FormEvent) {
    e.preventDefault()
    if (!produtoEditando?.sku || !produtoEditando?.nome) return

    try {
      // 1. Monta o payload base garantindo que NUNCA enviemos o campo imagem como string herdada
      const payload: Partial<PrecProdutoRecord> = {
        ...produtoEditando,
        fornecedor:
          produtoEditando.tipo === 'revenda' ? fornecedorSelecionadoId || undefined : undefined,
        fornecedor_produto:
          produtoEditando.tipo === 'revenda' ? produtoFornSelecionadoId || undefined : undefined,
        composicao: composicaoTemp,
      }
      // Remove qualquer resquício de string no campo imagem para nunca falhar com HTTP 400
      delete payload.imagem

      let savedRecord: PrecProdutoRecord

      if (imagemFile) {
        // Usuário fez upload de arquivo próprio: usamos FormData diretamente
        const formData = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            if (typeof val === 'object') {
              formData.append(key, JSON.stringify(val))
            } else {
              formData.append(key, String(val))
            }
          }
        })
        formData.append('imagem', imagemFile)

        if (produtoEditando.id) {
          savedRecord = await precificacaoService.updateProduto(produtoEditando.id, formData)
          toast({
            title: 'Produto atualizado com sucesso!',
            description:
              'Cenários de precificação existentes foram marcados como "desatualizados" para conferência.',
          })
        } else {
          savedRecord = await precificacaoService.createProduto(formData)
          toast({ title: 'Produto cadastrado com sucesso!' })
        }
      } else if (removerImagem && produtoEditando.id) {
        // Usuário removeu a imagem existente
        const formData = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            if (typeof val === 'object') {
              formData.append(key, JSON.stringify(val))
            } else {
              formData.append(key, String(val))
            }
          }
        })
        formData.append('imagem', '')

        savedRecord = await precificacaoService.updateProduto(produtoEditando.id, formData)
        toast({ title: 'Produto atualizado com sucesso!' })
      } else {
        // Sem arquivo próprio anexado
        if (produtoEditando.id) {
          savedRecord = await precificacaoService.updateProduto(produtoEditando.id, payload)
          toast({
            title: 'Produto atualizado com sucesso!',
            description:
              'Cenários de precificação existentes foram marcados como "desatualizados" para conferência.',
          })
        } else {
          savedRecord = await precificacaoService.createProduto(payload)
          toast({ title: 'Produto cadastrado com sucesso!' })
        }

        // Se o produto foi recém-criado (ou ainda não tem imagem própria) e foi vinculado a um produto de fornecedor com imagem:
        // herdar o arquivo da imagem via download/upload real
        if (!savedRecord.imagem && produtoEditando.tipo === 'revenda' && produtoFornSelecionadoId) {
          const prodForn = produtosDoFornecedor.find((item) => item.id === produtoFornSelecionadoId)
          if (prodForn?.imagem) {
            try {
              await precificacaoService.copiarImagemDeFornecedorProduto(savedRecord.id, prodForn)
            } catch (copyErr) {
              console.warn(
                '[handleSalvarProduto] Falha não impeditiva ao herdar imagem do fornecedor:',
                copyErr,
              )
            }
          }
        }
      }

      setOpenDialog(false)
      carregar()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao salvar produto' })
    }
  }

  async function handleExcluirProduto(id: string) {
    if (!confirm('Deseja excluir este produto e suas composições de custo?')) return
    try {
      await precificacaoService.deleteProduto(id)
      toast({ title: 'Produto removido com sucesso' })
      carregar()
    } catch {
      toast({ variant: 'destructive', title: 'Erro ao excluir produto' })
    }
  }

  // Filtragem de fornecedores e produtos vinculados na busca
  const fornecedoresFiltrados = fornecedores.filter((f) => {
    if (!buscaFornText.trim()) return true
    const term = buscaFornText.toLocaleLowerCase('pt-BR')
    return (
      f.nome_fantasia.toLocaleLowerCase('pt-BR').includes(term) ||
      f.razao_social.toLocaleLowerCase('pt-BR').includes(term) ||
      (f.cnpj && f.cnpj.includes(term))
    )
  })

  const produtosFornFiltrados = produtosDoFornecedor.filter((p) => {
    if (!buscaProdFornText.trim()) return true
    const term = buscaProdFornText.toLocaleLowerCase('pt-BR')
    return (
      p.descricao.toLocaleLowerCase('pt-BR').includes(term) ||
      (p.sku_fornecedor && p.sku_fornecedor.toLocaleLowerCase('pt-BR').includes(term)) ||
      (p.marca && p.marca.toLocaleLowerCase('pt-BR').includes(term))
    )
  })

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Cadastro de Produtos, Custos & Kits"
        subtitulo="Gestão das composições analíticas (C0..C12), produtos de revenda com fornecedor e kits"
        acoes={
          <Button className="bg-primary text-white font-bold" onClick={abrirNovoProduto}>
            <PackagePlus className="mr-1.5 h-4 w-4" />
            Novo Produto / Custo
          </Button>
        }
      />

      <Card className="shadow-xs border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
          <div>
            <CardTitle className="text-base font-bold">Catálogo de Produtos & SKUs</CardTitle>
            <CardDescription className="text-xs">
              Produtos cadastrados e seus custos diretos calculados
            </CardDescription>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {produtos.length} produtos
          </span>
        </CardHeader>

        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : produtos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Layers className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="font-semibold">Nenhum produto cadastrado</p>
              <p className="text-xs mt-1">
                Cadastre produtos de fabricação própria, revenda ou kits para iniciar simulações.
              </p>
              <Button onClick={abrirNovoProduto} className="mt-4 bg-primary text-white" size="sm">
                Cadastrar Primeiro Produto
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-y border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-4 font-bold">Produto / SKU</th>
                  <th className="py-2.5 px-3 font-bold">Tipo</th>
                  <th className="py-2.5 px-3 font-bold">Origem / Fornecedor</th>
                  <th className="py-2.5 px-3 font-bold">Peso / Medidas</th>
                  <th className="py-2.5 px-3 font-bold text-right">Custo Direto</th>
                  <th className="py-2.5 px-3 font-bold text-right">Custo Total</th>
                  <th className="py-2.5 px-4 font-bold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {produtos.map((p) => {
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
                  })

                  const nomeFornecedor =
                    p.expand?.fornecedor?.nome_fantasia ||
                    fornecedores.find((f) => f.id === p.fornecedor)?.nome_fantasia

                  return (
                    <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center font-bold text-xs text-muted-foreground shrink-0 overflow-hidden">
                            {p.imagem ? (
                              <img
                                src={precificacaoService.getProdutoImageUrl(p, '100x100')}
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

                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {p.tipo.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-muted-foreground">
                        {p.tipo === 'revenda' && nomeFornecedor ? (
                          <div className="flex items-center gap-1.5">
                            <Truck className="h-3.5 w-3.5 text-primary shrink-0" />
                            <span className="font-medium text-foreground">{nomeFornecedor}</span>
                          </div>
                        ) : (
                          <span>{p.expand?.empresa?.nome_fantasia || 'Sem empresa'}</span>
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
                            onClick={() => abrirEditarProduto(p)}
                          >
                            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleExcluirProduto(p.id)}
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

      {/* DIALOG DE CRIAÇÃO / EDIÇÃO DE PRODUTO */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSalvarProduto}>
            <DialogHeader>
              <DialogTitle>
                {produtoEditando?.id ? 'Editar Produto / Custo' : 'Novo Produto para Precificação'}
              </DialogTitle>
              <DialogDescription>
                Informe o SKU, categoria e o modelo analítico de custos (fabricação, revenda ou
                kit).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              {/* Upload e Imagem do Produto */}
              <div className="space-y-1">
                <Label className="text-xs font-semibold">Imagem do Produto</Label>
                <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20">
                  <div className="relative h-16 w-16 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
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
                  <div className="flex-1 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs font-semibold"
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
                          className="h-8 text-xs text-destructive hover:bg-destructive/10"
                          onClick={handleRemoverImagem}
                        >
                          <X className="mr-1 h-3.5 w-3.5" />
                          Remover
                        </Button>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      PNG, JPG, WEBP até 5MB. Se for produto de revenda, a foto do fornecedor é
                      sugerida automaticamente.
                    </p>
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

              {/* Seleção do Tipo de Custo */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Tipo de Custo *</Label>
                  <Select
                    value={produtoEditando?.tipo || 'fabricacao_propria'}
                    onValueChange={(v) =>
                      setProdutoEditando((prev) => ({ ...prev, tipo: v as TipoProduto }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fabricacao_propria">Fabricação Própria</SelectItem>
                      <SelectItem value="revenda">Revenda</SelectItem>
                      <SelectItem value="kit">Kit / Combo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1 sm:col-span-2">
                  <Label>Empresa Própria Responsável</Label>
                  <Select
                    value={produtoEditando?.empresa || 'nenhuma'}
                    onValueChange={(v) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        empresa: v === 'nenhuma' ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione empresa..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Nenhuma (Geral)</SelectItem>
                      {empresas.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome_fantasia || e.razao_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* SEÇÃO ESPECÍFICA: BUSCADOR DE FORNECEDOR E PRODUTO FORNECIDO (APENAS PARA REVENDA) */}
              {produtoEditando?.tipo === 'revenda' && (
                <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-primary" />
                      <span className="font-bold text-xs uppercase tracking-wider text-primary">
                        Auto-Preenchimento via Fornecedor
                      </span>
                    </div>
                    {produtoFornSelecionadoId && (
                      <Badge className="bg-primary text-white text-[10px] font-bold">
                        Vínculo ativo
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Selecione o fornecedor e o produto cadastrado para herdar automaticamente: custo
                    de aquisição, dimensões, peso, descrição, SKU e embalagem.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    {/* (a) Busca de Fornecedor */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold flex items-center justify-between">
                        <span>(a) Fornecedor Parceiro</span>
                        <Link
                          to="/fornecedores"
                          target="_blank"
                          className="text-[10px] text-primary hover:underline font-normal"
                        >
                          + Gerenciar fornecedores
                        </Link>
                      </Label>

                      <Select
                        value={fornecedorSelecionadoId || 'nenhum'}
                        onValueChange={(v) => {
                          const val = v === 'nenhum' ? '' : v
                          setFornecedorSelecionadoId(val)
                          setProdutoFornSelecionadoId('')
                          setBuscaProdFornText('')
                        }}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Escolha um fornecedor..." />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="p-1 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Filtrar fornecedor..."
                                value={buscaFornText}
                                onChange={(e) => setBuscaFornText(e.target.value)}
                                className="h-8 pl-8 text-xs"
                                onKeyDown={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <SelectItem value="nenhum">Nenhum / Entrada Manual</SelectItem>
                          {fornecedoresFiltrados.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              {f.nome_fantasia} {f.cnpj ? `(${f.cnpj})` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* (b) Busca de Produtos Vinculados ao Fornecedor */}
                    <div className="space-y-1.5">
                      <Label className="text-xs font-semibold">
                        (b) Produto do Fornecedor
                        {loadingProdsForn && ' (carregando...)'}
                      </Label>

                      <Select
                        disabled={!fornecedorSelecionadoId || loadingProdsForn}
                        value={produtoFornSelecionadoId || 'nenhum'}
                        onValueChange={(v) => {
                          if (v === 'nenhum') {
                            setProdutoFornSelecionadoId('')
                            return
                          }
                          const prodForn = produtosDoFornecedor.find((item) => item.id === v)
                          if (prodForn) handleSelecionarProdutoFornecedor(prodForn)
                        }}
                      >
                        <SelectTrigger className="bg-white">
                          <SelectValue
                            placeholder={
                              !fornecedorSelecionadoId
                                ? 'Selecione primeiro o fornecedor...'
                                : produtosDoFornecedor.length === 0
                                  ? 'Fornecedor sem produtos'
                                  : 'Escolha o produto para herdar...'
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="p-1 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Filtrar por nome ou SKU..."
                                value={buscaProdFornText}
                                onChange={(e) => setBuscaProdFornText(e.target.value)}
                                className="h-8 pl-8 text-xs"
                                onKeyDown={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <SelectItem value="nenhum">Selecione para auto-preencher</SelectItem>
                          {produtosFornFiltrados.map((fp) => (
                            <SelectItem key={fp.id} value={fp.id}>
                              {fp.descricao} — {formatCurrency(fp.preco_custo_unitario)}
                              {fp.sku_fornecedor ? ` [SKU: ${fp.sku_fornecedor}]` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {fornecedorSelecionadoId &&
                    produtosDoFornecedor.length === 0 &&
                    !loadingProdsForn && (
                      <div className="p-2.5 rounded-xl border border-dashed border-primary/30 bg-white/60 text-center">
                        <p className="text-[11px] text-muted-foreground">
                          Este fornecedor ainda não tem produtos cadastrados.
                        </p>
                        <Button
                          asChild
                          size="sm"
                          variant="link"
                          className="h-6 text-xs text-primary p-0 mt-1"
                        >
                          <Link to="/fornecedores" target="_blank">
                            Abrir /fornecedores e cadastrar produtos deste parceiro
                          </Link>
                        </Button>
                      </div>
                    )}
                </div>
              )}

              {/* Identificação Geral do Produto */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>SKU Único *</Label>
                    {origemValores.sku?.herdado && (
                      <span className="text-[10px] text-primary flex items-center gap-1 font-semibold">
                        <Sparkles className="h-3 w-3" />
                        {origemValores.sku.sobrescrito ? 'Sobrescrito' : 'Herdado do fornecedor'}
                      </span>
                    )}
                  </div>
                  <Input
                    required
                    placeholder="Ex: BLeve?, PA-03..."
                    className={
                      origemValores.sku?.herdado
                        ? origemValores.sku.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.sku || ''}
                    onChange={(e) => {
                      marcarSobrescrita('sku')
                      setProdutoEditando((prev) => ({ ...prev, sku: e.target.value }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Nome do Produto *</Label>
                    {origemValores.nome?.herdado && (
                      <span className="text-[10px] text-primary flex items-center gap-1 font-semibold">
                        <Sparkles className="h-3 w-3" />
                        {origemValores.nome.sobrescrito ? 'Sobrescrito' : 'Herdado do fornecedor'}
                      </span>
                    )}
                  </div>
                  <Input
                    required
                    placeholder="Ex: Toalhas (leve) Banho Infantil"
                    className={
                      origemValores.nome?.herdado
                        ? origemValores.nome.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.nome || ''}
                    onChange={(e) => {
                      marcarSobrescrita('nome')
                      setProdutoEditando((prev) => ({ ...prev, nome: e.target.value }))
                    }}
                  />
                </div>
              </div>

              {/* Marca, Categoria e Unidade */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Marca</Label>
                    {origemValores.marca?.herdado && (
                      <span className="text-[9px] text-primary font-semibold">
                        {origemValores.marca.sobrescrito ? 'Editado' : 'Herdado'}
                      </span>
                    )}
                  </div>
                  <Input
                    placeholder="Ex: Karsten"
                    className={
                      origemValores.marca?.herdado
                        ? origemValores.marca.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.marca || ''}
                    onChange={(e) => {
                      marcarSobrescrita('marca')
                      setProdutoEditando((prev) => ({ ...prev, marca: e.target.value }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Categoria</Label>
                    {origemValores.categoria?.herdado && (
                      <span className="text-[9px] text-primary font-semibold">
                        {origemValores.categoria.sobrescrito ? 'Editado' : 'Herdado'}
                      </span>
                    )}
                  </div>
                  <Input
                    placeholder="Ex: Cama e Banho"
                    className={
                      origemValores.categoria?.herdado
                        ? origemValores.categoria.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.categoria || ''}
                    onChange={(e) => {
                      marcarSobrescrita('categoria')
                      setProdutoEditando((prev) => ({ ...prev, categoria: e.target.value }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Unidade de Medida</Label>
                    {origemValores.unidade?.herdado && (
                      <span className="text-[9px] text-primary font-semibold">
                        {origemValores.unidade.sobrescrito ? 'Editado' : 'Herdado'}
                      </span>
                    )}
                  </div>
                  <Input
                    placeholder="un, cx, kg..."
                    className={
                      origemValores.unidade?.herdado
                        ? origemValores.unidade.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.unidade || 'un'}
                    onChange={(e) => {
                      marcarSobrescrita('unidade')
                      setProdutoEditando((prev) => ({ ...prev, unidade: e.target.value }))
                    }}
                  />
                </div>
              </div>

              {/* Código de barras e Embalagem */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Código de Barras (EAN)</Label>
                    {origemValores.codigo_barras?.herdado && (
                      <span className="text-[9px] text-primary font-semibold">
                        {origemValores.codigo_barras.sobrescrito ? 'Editado' : 'Herdado'}
                      </span>
                    )}
                  </div>
                  <Input
                    placeholder="789..."
                    className={
                      origemValores.codigo_barras?.herdado
                        ? origemValores.codigo_barras.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.codigo_barras || ''}
                    onChange={(e) => {
                      marcarSobrescrita('codigo_barras')
                      setProdutoEditando((prev) => ({ ...prev, codigo_barras: e.target.value }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Embalagem Padrão</Label>
                    {origemValores.embalagem?.herdado && (
                      <span className="text-[9px] text-primary font-semibold">
                        {origemValores.embalagem.sobrescrito ? 'Editado' : 'Herdado'}
                      </span>
                    )}
                  </div>
                  <Input
                    placeholder="Caixa, saco plástico..."
                    className={
                      origemValores.embalagem?.herdado
                        ? origemValores.embalagem.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.embalagem || ''}
                    onChange={(e) => {
                      marcarSobrescrita('embalagem')
                      setProdutoEditando((prev) => ({ ...prev, embalagem: e.target.value }))
                    }}
                  />
                </div>
              </div>

              {/* Peso e Dimensões */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <Label>Peso (gramas)</Label>
                    {origemValores.peso_g?.herdado && (
                      <span className="text-[9px] text-primary font-semibold">
                        {origemValores.peso_g.sobrescrito ? 'Editado' : 'Herdado'}
                      </span>
                    )}
                  </div>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 280"
                    className={
                      origemValores.peso_g?.herdado
                        ? origemValores.peso_g.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.peso_g ?? ''}
                    onChange={(e) => {
                      marcarSobrescrita('peso_g')
                      setProdutoEditando((prev) => ({
                        ...prev,
                        peso_g: parseFloat(e.target.value) || 0,
                      }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Comprimento (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 20"
                    className={
                      origemValores.dimensoes?.herdado
                        ? origemValores.dimensoes.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.dimensao_comprimento_cm ?? ''}
                    onChange={(e) => {
                      marcarSobrescrita('dimensoes')
                      setProdutoEditando((prev) => ({
                        ...prev,
                        dimensao_comprimento_cm: parseFloat(e.target.value) || 0,
                      }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Largura (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 15"
                    className={
                      origemValores.dimensoes?.herdado
                        ? origemValores.dimensoes.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.dimensao_largura_cm ?? ''}
                    onChange={(e) => {
                      marcarSobrescrita('dimensoes')
                      setProdutoEditando((prev) => ({
                        ...prev,
                        dimensao_largura_cm: parseFloat(e.target.value) || 0,
                      }))
                    }}
                  />
                </div>

                <div className="space-y-1">
                  <Label>Altura (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 8"
                    className={
                      origemValores.dimensoes?.herdado
                        ? origemValores.dimensoes.sobrescrito
                          ? 'border-amber-400 bg-amber-50/30'
                          : 'border-primary/40 bg-primary/5'
                        : ''
                    }
                    value={produtoEditando?.dimensao_altura_cm ?? ''}
                    onChange={(e) => {
                      marcarSobrescrita('dimensoes')
                      setProdutoEditando((prev) => ({
                        ...prev,
                        dimensao_altura_cm: parseFloat(e.target.value) || 0,
                      }))
                    }}
                  />
                </div>
              </div>

              {/* Seção Específica: Fabricação Própria (C0..C12) */}
              {produtoEditando?.tipo === 'fabricacao_propria' && (
                <div className="rounded-xl border border-border p-3 space-y-3 bg-secondary/10">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Composição de Custo / Insumos (C0..C12)
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
                          placeholder="C0"
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
                          onClick={() => {
                            setComposicaoTemp(composicaoTemp.filter((_, i) => i !== idx))
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seção Específica: Revenda (Custo de Aquisição) */}
              {produtoEditando?.tipo === 'revenda' && (
                <div className="rounded-xl border border-border p-3 space-y-3 bg-secondary/10">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="font-bold">Custo de Aquisição Unitário (R$) *</Label>
                      {origemValores.custo_aquisicao_unitario?.herdado && (
                        <span className="text-[10px] text-primary flex items-center gap-1 font-semibold">
                          <Sparkles className="h-3 w-3" />
                          {origemValores.custo_aquisicao_unitario.sobrescrito
                            ? 'Valor sobrescrito pelo usuário'
                            : 'Herdado do cadastro do fornecedor'}
                        </span>
                      )}
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      placeholder="0.00"
                      className={
                        origemValores.custo_aquisicao_unitario?.herdado
                          ? origemValores.custo_aquisicao_unitario.sobrescrito
                            ? 'border-amber-400 bg-amber-50/30'
                            : 'border-primary/40 bg-primary/5 font-bold'
                          : ''
                      }
                      value={produtoEditando?.custo_aquisicao_unitario ?? 0}
                      onChange={(e) => {
                        marcarSobrescrita('custo_aquisicao_unitario')
                        setProdutoEditando((prev) => ({
                          ...prev,
                          custo_aquisicao_unitario: parseFloat(e.target.value) || 0,
                        }))
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Custos Adicionais Globais: Embalagem, Etiqueta e Perda */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-3">
                <div className="space-y-1">
                  <Label>Embalagem Adicional (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.10"
                    value={produtoEditando?.custo_adicional_embalagem ?? 0}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        custo_adicional_embalagem: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Etiqueta (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.05"
                    value={produtoEditando?.custo_etiqueta ?? 0}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        custo_etiqueta: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Perda Estimada (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="10"
                    value={produtoEditando?.perda_pct ?? 0}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        perda_pct: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary text-white font-bold">
                <Check className="mr-1.5 h-4 w-4" />
                Salvar Produto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
