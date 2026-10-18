import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Boxes,
  Calculator,
  Camera,
  Check,
  ImageIcon,
  Plus,
  Search,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { CategoriaAutocompleteInput } from '@/components/precificacao/CategoriaAutocompleteInput'
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
import { produtosBaseService } from '@/services/produtos'
import { PrecKitRecord, PrecProdutoRecord } from '@/types/precificacao'
import type { ProdutoBaseRecord } from '@/types/domain'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'
import {
  buildItensPrincipaisOpcoes,
  calcularCustoTotalKit,
  ItemPrincipalOpcao,
} from '@/lib/precificacao/kitComboHelpers'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'

interface KitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kitParaEditar?: PrecProdutoRecord | null
  produtosDisponiveis: PrecProdutoRecord[]
  produtosBase?: import('@/types/domain').ProdutoBaseRecord[]
  onSuccess: () => void
}

export function KitDialog({
  open,
  onOpenChange,
  kitParaEditar,
  produtosDisponiveis,
  produtosBase: produtosBaseProp,
  onSuccess,
}: KitDialogProps) {
  const { toast } = useToast()
  const isEditing = Boolean(kitParaEditar?.id)

  const [produtosBaseLista, setProdutosBaseLista] = useState<ProdutoBaseRecord[]>(
    produtosBaseProp || [],
  )

  // Item Principal selecionado (formato composto "comp_id" ou "base_id")
  const [itemPrincipalId, setItemPrincipalId] = useState<string>('')
  const [buscaProdText, setBuscaProdText] = useState('')
  const [quantidade, setQuantidade] = useState<number>(2)
  const [nome, setNome] = useState('')
  const [sku, setSku] = useState('')
  const [marca, setMarca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidade, setUnidade] = useState('kit')
  const [pesoG, setPesoG] = useState<number | undefined>(undefined)
  const [comprimentoCm, setComprimentoCm] = useState<number | undefined>(undefined)
  const [larguraCm, setLarguraCm] = useState<number | undefined>(undefined)
  const [alturaCm, setAlturaCm] = useState<number | undefined>(undefined)

  // Preservação de campos legados (não exibidos em formulários novos/edição, mas preservados no cálculo e payload)
  const [custoEmbalagemLegado, setCustoEmbalagemLegado] = useState<number>(0)
  const [custoEtiquetaLegado, setCustoEtiquetaLegado] = useState<number>(0)

  // Composição analítica de produtos base (insumos, embalagens, etiquetas, etc.)
  const [composicao, setComposicao] = useState<ItemComposicaoCusto[]>([])
  const [insumoSelecionadoId, setInsumoSelecionadoId] = useState<string>('')
  const [qtdInsumo, setQtdInsumo] = useState<number>(1)

  // Upload próprio de imagem
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Se produtosBaseProp não foi passado, carrega sob demanda
  useEffect(() => {
    if (open && (!produtosBaseProp || produtosBaseProp.length === 0)) {
      produtosBaseService
        .list()
        .then((res) => setProdutosBaseLista(res))
        .catch((err) => console.warn('Erro ao carregar produtos_base no KitDialog:', err))
    } else if (produtosBaseProp && produtosBaseProp.length > 0) {
      setProdutosBaseLista(produtosBaseProp)
    }
  }, [open, produtosBaseProp])

  // Opções consolidadas para o Item Principal:
  // Produto Composto (prec_produtos) + Produto Base (produtos_base com tipo='revenda')
  const itensPrincipaisOpcoes: ItemPrincipalOpcao[] = useMemo(() => {
    return buildItensPrincipaisOpcoes({
      produtosCompostos: produtosDisponiveis,
      produtosBase: produtosBaseLista,
      idAtualParaExcluir: kitParaEditar?.id,
      contexto: 'kit',
    })
  }, [produtosDisponiveis, produtosBaseLista, kitParaEditar?.id])

  const itemPrincipalSelecionado = itensPrincipaisOpcoes.find((p) => p.id === itemPrincipalId)
  const custoBaseUnitario = itemPrincipalSelecionado?.custoUnitario || 0
  const custoComponentesTotal = custoBaseUnitario * (quantidade || 1)

  // Cálculo auditado do custo total (componentes + linhas analíticas + campos legados retrocompatíveis)
  const calculoTotais = useMemo(() => {
    return calcularCustoTotalKit({
      custoComponenteUnitario: custoBaseUnitario,
      quantidadeComponente: quantidade,
      composicao,
      custoEmbalagemLegado,
      custoEtiquetaLegado,
    })
  }, [custoBaseUnitario, quantidade, composicao, custoEmbalagemLegado, custoEtiquetaLegado])

  const custoFinalEstimado = calculoTotais.custoTotal

  // Reset / inicialização ao abrir
  useEffect(() => {
    if (!open) return

    if (kitParaEditar) {
      setNome(kitParaEditar.nome || '')
      setSku(kitParaEditar.sku || '')
      setMarca(kitParaEditar.marca || '')
      setCategoria(kitParaEditar.categoria || '')
      setUnidade(kitParaEditar.unidade || 'kit')
      setPesoG(kitParaEditar.peso_g)
      setComprimentoCm(kitParaEditar.dimensao_comprimento_cm)
      setLarguraCm(kitParaEditar.dimensao_largura_cm)
      setAlturaCm(kitParaEditar.dimensao_altura_cm)
      setCustoEmbalagemLegado(kitParaEditar.custo_adicional_embalagem || 0)
      setCustoEtiquetaLegado(kitParaEditar.custo_etiqueta || 0)
      setComposicao(kitParaEditar.composicao || [])
      setImagemFile(null)
      setRemoverImagem(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (kitParaEditar.imagem) {
        setImagemPreview(precificacaoService.getProdutoImageUrl(kitParaEditar))
      } else {
        setImagemPreview(null)
      }

      // Carregar vínculo em prec_kits
      precificacaoService
        .getKitByProdutoPai(kitParaEditar.id)
        .then((kitRecord: PrecKitRecord | null) => {
          const primeiroItem = kitRecord?.itens?.[0]
          if (primeiroItem?.produto_id) {
            const rawId = primeiroItem.produto_id
            // Verifica se casou com composto ou base
            const opt = itensPrincipaisOpcoes.find((o) => o.rawId === rawId)
            if (opt) {
              setItemPrincipalId(opt.id)
            } else {
              // Tenta fallback 'comp_' ou 'base_'
              setItemPrincipalId(`comp_${rawId}`)
            }
            setQuantidade(primeiroItem.qtd_efetiva || kitParaEditar.qtd_por_kit || 2)
          } else {
            setQuantidade(kitParaEditar.qtd_por_kit || 2)
          }
        })
    } else {
      // Novo Kit: campos legados zerados por padrão
      setItemPrincipalId('')
      setBuscaProdText('')
      setQuantidade(2)
      setNome('')
      setSku('')
      setMarca('')
      setCategoria('')
      setUnidade('kit')
      setPesoG(undefined)
      setComprimentoCm(undefined)
      setLarguraCm(undefined)
      setAlturaCm(undefined)
      setCustoEmbalagemLegado(0)
      setCustoEtiquetaLegado(0)
      setComposicao([])
      setInsumoSelecionadoId('')
      setQtdInsumo(1)
      setImagemFile(null)
      setImagemPreview(null)
      setRemoverImagem(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    setFormErrors({})
  }, [open, kitParaEditar])

  // Ao selecionar um produto componente (apenas em modo de criação), sugere nome, SKU, peso e dimensões
  function handleSelectProdutoComponente(optId: string) {
    setItemPrincipalId(optId)
    const itemOpt = itensPrincipaisOpcoes.find((p) => p.id === optId)
    if (!itemOpt) return

    const qtd = quantidade > 1 ? quantidade : 2
    if (!isEditing) {
      setNome(`Kit ${qtd} ${itemOpt.nome}`)
      const baseSku = itemOpt.sku || `PROD-${itemOpt.rawId.slice(0, 6).toUpperCase()}`
      setSku(`KIT-${qtd}-${baseSku}`)
      if (itemOpt.rawComposto?.marca) setMarca(itemOpt.rawComposto.marca)
      if (itemOpt.rawComposto?.categoria) setCategoria(itemOpt.rawComposto.categoria)
      if (itemOpt.peso_g) {
        setPesoG(itemOpt.peso_g * qtd)
      }
      setComprimentoCm(itemOpt.dimensao_comprimento_cm)
      setLarguraCm(itemOpt.dimensao_largura_cm)
      if (itemOpt.dimensao_altura_cm) {
        setAlturaCm(itemOpt.dimensao_altura_cm * qtd)
      }
      // Se não tem imagem anexada e o componente tem imagem, exibir prévia
      if (!imagemFile && !imagemPreview && itemOpt.imagem) {
        if (itemOpt.origem === 'composto' && itemOpt.rawComposto) {
          setImagemPreview(precificacaoService.getProdutoImageUrl(itemOpt.rawComposto))
        } else if (itemOpt.origem === 'produto_base' && itemOpt.rawBase) {
          setImagemPreview(produtosBaseService.getImageUrl(itemOpt.rawBase))
        }
      }
    }
  }

  // Ao mudar a quantidade, atualiza proporcionalmente peso e dimensões
  function handleQuantidadeChange(novaQtd: number) {
    const qtdVal = Math.max(2, novaQtd || 2)
    setQuantidade(qtdVal)

    if (itemPrincipalSelecionado && !isEditing) {
      if (itemPrincipalSelecionado.peso_g) {
        setPesoG(itemPrincipalSelecionado.peso_g * qtdVal)
      }
      if (itemPrincipalSelecionado.dimensao_altura_cm) {
        setAlturaCm(itemPrincipalSelecionado.dimensao_altura_cm * qtdVal)
      }
      const baseSku =
        itemPrincipalSelecionado.sku ||
        `PROD-${itemPrincipalSelecionado.rawId.slice(0, 6).toUpperCase()}`
      setNome(`Kit ${qtdVal} ${itemPrincipalSelecionado.nome}`)
      setSku(`KIT-${qtdVal}-${baseSku}`)
    }
  }

  // Gerenciamento da Composição Analítica por Linhas (insumos, embalagens, etiquetas)
  function adicionarLinhaComposicao() {
    if (!insumoSelecionadoId) return
    const itemBase = produtosBaseLista.find((b) => b.id === insumoSelecionadoId)
    if (!itemBase) return

    const novaLinha: ItemComposicaoCusto = {
      id: `K${composicao.length}`,
      codigo: `K${composicao.length}`,
      descricao: itemBase.nome,
      qtd: qtdInsumo > 0 ? qtdInsumo : 1,
      custo_unitario: Number(itemBase.custo_unitario) || 0,
      unidade: itemBase.unidade || 'un',
      categoria_custo:
        itemBase.tipo === 'embalagem'
          ? 'embalagem'
          : itemBase.tipo === 'etiqueta'
            ? 'etiqueta'
            : itemBase.tipo === 'servico'
              ? 'servico'
              : 'insumo',
      fornecedor_id: itemBase.fornecedor,
      fornecedor_nome: itemBase.expand?.fornecedor?.nome_fantasia || 'Fornecedor',
      insumo_id: itemBase.id,
      insumo_tipo: itemBase.tipo === 'servico' ? 'servico' : 'insumo',
    }

    setComposicao([...composicao, novaLinha])
    setInsumoSelecionadoId('')
    setQtdInsumo(1)
  }

  function removerLinhaComposicao(index: number) {
    setComposicao(composicao.filter((_, idx) => idx !== index))
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

  async function handleSalvar(e: React.FormEvent) {
    e.preventDefault()
    if (!sku.trim() || !nome.trim()) {
      setFormErrors({
        sku: !sku.trim() ? 'SKU é obrigatório' : '',
        form: 'Preencha todos os campos obrigatórios.',
      })
      return
    }
    if (!itemPrincipalId || !itemPrincipalSelecionado) {
      setFormErrors({ form: 'Selecione o produto base do Kit.' })
      return
    }
    if (quantidade < 2) {
      setFormErrors({ form: 'Um Kit deve conter ao menos 2 unidades do produto.' })
      return
    }

    setSaving(true)
    try {
      // Novos kits nascem com custo_adicional_embalagem e custo_etiqueta zerados;
      // kits existentes preservam valores já gravados nesses campos respeitando regra de dupla contagem.
      const payload: Partial<PrecProdutoRecord> = {
        tipo: 'kit',
        status: 'ativo',
        sku: sku.trim(),
        nome: nome.trim(),
        marca: marca.trim() || undefined,
        categoria: categoria.trim() || undefined,
        unidade: unidade.trim() || 'kit',
        peso_g: pesoG,
        dimensao_comprimento_cm: comprimentoCm,
        dimensao_largura_cm: larguraCm,
        dimensao_altura_cm: alturaCm,
        composicao,
        custo_adicional_embalagem: calculoTotais.custoEmbalagemEfetivo,
        custo_etiqueta: calculoTotais.custoEtiquetaEfetivo,
        qtd_por_kit: quantidade,
        empresa: itemPrincipalSelecionado?.empresa,
      }
      delete payload.imagem

      let savedRecord: PrecProdutoRecord

      if (imagemFile) {
        const formData = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            formData.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val))
          }
        })
        formData.append('imagem', imagemFile)

        if (kitParaEditar?.id) {
          savedRecord = await precificacaoService.updateProduto(kitParaEditar.id, formData)
        } else {
          savedRecord = await precificacaoService.createProduto(formData)
        }
      } else if (removerImagem && kitParaEditar?.id) {
        const formData = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            formData.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val))
          }
        })
        formData.append('imagem', '')
        savedRecord = await precificacaoService.updateProduto(kitParaEditar.id, formData)
      } else {
        if (kitParaEditar?.id) {
          savedRecord = await precificacaoService.updateProduto(kitParaEditar.id, payload)
        } else {
          savedRecord = await precificacaoService.createProduto(payload)
        }
      }

      // Persistir estrutura de prec_kits (produto_id grava o ID original da entidade no banco)
      const itemKit = {
        produto_id: itemPrincipalSelecionado.rawId,
        nome: itemPrincipalSelecionado.nome,
        qtd_efetiva: quantidade,
        custo_unitario: custoBaseUnitario,
      }
      await precificacaoService.saveKit(savedRecord.id, [itemKit], [])

      toast({
        title: isEditing ? 'Kit atualizado com sucesso!' : 'Kit criado com sucesso!',
        description: `${nome} (${quantidade} un)`,
      })
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const fieldErrs = apiFieldErrors(err)
      const errorMsg = apiMessage(err, 'Não foi possível salvar o Kit.')
      if (fieldErrs.sku) {
        fieldErrs.sku = `Já existe um produto com o SKU '${sku}'. Escolha outro SKU para o kit.`
      }
      setFormErrors({ ...fieldErrs, form: errorMsg })
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar Kit',
        description: fieldErrs.sku || errorMsg,
      })
    } finally {
      setSaving(false)
    }
  }

  const produtosFiltrados = itensPrincipaisOpcoes.filter((p) => {
    if (!buscaProdText.trim()) return true
    const term = buscaProdText.toLowerCase()
    return p.nome.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSalvar}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Boxes className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>
                  {isEditing ? 'Editar Kit de Produto' : 'Novo Kit de Produto'}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Kits são o mesmo produto vendido em maiores quantidades (ex: Kit 2 Toalhas de
                  Praia).
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {(formErrors.sku || formErrors.form) && (
            <div className="mt-3 rounded-xl border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-semibold">{formErrors.sku || formErrors.form}</p>
              {formErrors.sku && formErrors.form && formErrors.form !== formErrors.sku && (
                <p className="mt-1 text-[11px] opacity-90">{formErrors.form}</p>
              )}
            </div>
          )}

          <div className="space-y-4 py-3 text-xs">
            {/* Produto Base e Quantidade */}
            <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5" />
                  Produto Base & Quantidade do Kit
                </span>
                {itemPrincipalSelecionado && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Custo un.: {formatCurrency(custoBaseUnitario)}
                  </span>
                )}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold">Produto Componente *</Label>
                  <Select
                    value={itemPrincipalId || 'nenhum'}
                    onValueChange={(v) => {
                      if (v !== 'nenhum') handleSelectProdutoComponente(v)
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Selecione o produto base ou composto..." />
                    </SelectTrigger>
                    <SelectContent>
                      <div className="p-1 border-b border-border">
                        <div className="relative">
                          <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                          <Input
                            placeholder="Buscar produto por nome ou SKU..."
                            value={buscaProdText}
                            onChange={(e) => setBuscaProdText(e.target.value)}
                            className="h-8 pl-8 text-xs"
                            onKeyDown={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <SelectItem value="nenhum">Selecione um produto...</SelectItem>
                      {produtosFiltrados.map((p) => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.nome} [SKU: {p.sku || 'S/SKU'}] — {p.tipoLabel} —{' '}
                          {formatCurrency(p.custoUnitario)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Qtd no Kit *</Label>
                  <Input
                    type="number"
                    min="2"
                    step="1"
                    required
                    value={quantidade}
                    onChange={(e) => handleQuantidadeChange(parseInt(e.target.value) || 2)}
                    className="font-bold text-sm bg-white"
                  />
                  <span className="text-[10px] text-muted-foreground">Mínimo 2 unidades</span>
                </div>
              </div>
              {/* Custo em tempo real */}
              {itemPrincipalSelecionado && (
                <div className="p-2.5 rounded-xl bg-white/80 border border-primary/20 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Custo dos componentes ({quantidade} un × {formatCurrency(custoBaseUnitario)}):
                  </span>
                  <span className="font-bold font-mono text-primary text-sm">
                    {formatCurrency(custoComponentesTotal)}
                  </span>
                </div>
              )}{' '}
            </div>

            {/* SEÇÃO COMPOSIÇÃO POR LINHAS DE PRODUTOS BASE (Insumos, Embalagens, Etiquetas, Serviços) */}
            <div className="space-y-3 p-3.5 rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-neutral-800">
                    <Calculator className="h-4 w-4 text-[#DF5830]" />
                    Composição por Linhas de Produtos Base
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Insumos, etiquetas, embalagens, tecidos ou serviços que compõem o kit.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-muted-foreground">Subtotal Composição</span>
                  <p className="text-xs font-bold text-neutral-900 font-mono">
                    {formatCurrency(calculoTotais.custoComposicao)}
                  </p>
                </div>
              </div>

              {/* Adicionar linha de composição */}
              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <div className="flex-1">
                  <Select value={insumoSelecionadoId} onValueChange={setInsumoSelecionadoId}>
                    <SelectTrigger className="text-xs bg-white">
                      <SelectValue placeholder="Escolha um item de produtos_base (insumo, embalagem, serviço)..." />
                    </SelectTrigger>
                    <SelectContent>
                      {produtosBaseLista
                        .filter((b) => b.tipo !== 'revenda')
                        .map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.nome} ({b.tipo}) — {b.expand?.fornecedor?.nome_fantasia || 'Forn.'} —{' '}
                            {formatCurrency(Number(b.custo_unitario) || 0)}/{b.unidade || 'un'}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="0.01"
                    step="0.1"
                    value={qtdInsumo}
                    onChange={(e) => setQtdInsumo(Number(e.target.value))}
                    placeholder="Qtd"
                    className="text-xs"
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={adicionarLinhaComposicao}
                  disabled={!insumoSelecionadoId}
                  className="gap-1 text-xs border-orange-200 text-orange-700 hover:bg-orange-50 shrink-0"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Adicionar
                </Button>
              </div>

              {/* Tabela de composição analítica do Kit */}
              {composicao.length > 0 ? (
                <div className="border rounded-md overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b">
                      <tr>
                        <th className="py-2 px-3">Item / Origem</th>
                        <th className="py-2 px-2 text-center">Qtd</th>
                        <th className="py-2 px-2 text-right">Unitário</th>
                        <th className="py-2 px-2 text-right">Subtotal</th>
                        <th className="py-2 px-2 text-center w-10">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {composicao.map((item, idx) => {
                        const sub = (item.qtd || 1) * (item.custo_unitario || 0)
                        return (
                          <tr key={idx} className="hover:bg-neutral-50/50">
                            <td className="py-2 px-3">
                              <span className="font-medium text-neutral-800">{item.descricao}</span>
                              {item.fornecedor_nome && (
                                <span className="block text-[10px] text-muted-foreground">
                                  Fornecedor: {item.fornecedor_nome}
                                </span>
                              )}
                            </td>
                            <td className="py-2 px-2 text-center">{item.qtd}</td>
                            <td className="py-2 px-2 text-right font-mono">
                              {formatCurrency(item.custo_unitario)}
                            </td>
                            <td className="py-2 px-2 text-right font-semibold font-mono text-neutral-800">
                              {formatCurrency(sub)}
                            </td>
                            <td className="py-2 px-2 text-center">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6 text-red-500 hover:bg-red-50"
                                onClick={() => removerLinhaComposicao(idx)}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-xs text-neutral-400 italic text-center py-2">
                  Nenhum item adicional inserido na composição (opcional).
                </p>
              )}
            </div>

            {/* Imagem do Kit */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Imagem do Kit (opcional)</Label>
              <div className="flex items-center gap-3 p-3 rounded-xl border border-border bg-secondary/20">
                <div className="relative h-14 w-14 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0 shadow-xs">
                  {imagemPreview ? (
                    <img src={imagemPreview} alt="Preview" className="h-full w-full object-cover" />
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
                  <p className="text-[11px] text-muted-foreground">
                    Se não anexar, o kit herdará a foto do produto base na visualização.
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

            {/* Nome e SKU */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1 sm:col-span-2">
                <Label className="text-xs font-semibold">Nome do Kit *</Label>
                <Input
                  required
                  placeholder="Ex: Kit 2 Toalhas Leve de Praia"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">SKU Próprio do Kit *</Label>
                <Input
                  required
                  placeholder="Ex: KIT-2-TOALHA"
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  className={formErrors.sku ? 'border-destructive' : ''}
                />
                {formErrors.sku && (
                  <p className="text-[11px] text-destructive font-medium">{formErrors.sku}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">Categoria</Label>
                <CategoriaAutocompleteInput
                  value={categoria}
                  onChange={setCategoria}
                  placeholder="Ex: Toalha de Banho, Pet..."
                />
              </div>
            </div>

            {/* Medidas e Pesos Sugeridos */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Peso Total (g)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Ex: 560"
                  value={pesoG ?? ''}
                  onChange={(e) => setPesoG(parseFloat(e.target.value) || undefined)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Compr. (cm)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Ex: 25"
                  value={comprimentoCm ?? ''}
                  onChange={(e) => setComprimentoCm(parseFloat(e.target.value) || undefined)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Larg. (cm)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Ex: 20"
                  value={larguraCm ?? ''}
                  onChange={(e) => setLarguraCm(parseFloat(e.target.value) || undefined)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Altura (cm)</Label>
                <Input
                  type="number"
                  min="0"
                  placeholder="Ex: 16"
                  value={alturaCm ?? ''}
                  onChange={(e) => setAlturaCm(parseFloat(e.target.value) || undefined)}
                />
              </div>
            </div>

            {/* Resumo do custo final (Campos legados de embalagem/etiqueta removidos da UI; entram na Composição por Linhas) */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-foreground block">
                  Custo Base Final Estimado
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Componentes ({formatCurrency(custoComponentesTotal)}) + Composição por Linhas (
                  {formatCurrency(calculoTotais.custoComposicao)})
                  {(custoEmbalagemLegado > 0 || custoEtiquetaLegado > 0) && (
                    <span className="block text-[10px] text-amber-700 font-mono mt-0.5">
                      * Inclui legado: Emb {formatCurrency(calculoTotais.custoEmbalagemEfetivo)} |
                      Eti {formatCurrency(calculoTotais.custoEtiquetaEfetivo)}
                    </span>
                  )}
                </span>
              </div>
              <span className="text-base font-bold font-mono text-primary">
                {formatCurrency(custoFinalEstimado)}
              </span>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={saving}
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={saving} className="bg-primary text-white font-bold">
              <Check className="mr-1.5 h-4 w-4" />
              {saving ? 'Salvando...' : isEditing ? 'Atualizar Kit' : 'Salvar Kit'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
