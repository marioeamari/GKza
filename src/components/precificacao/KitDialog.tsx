import { useEffect, useRef, useState } from 'react'
import { Boxes, Camera, Check, ImageIcon, Search, Sparkles, X } from 'lucide-react'
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
import { PrecKitRecord, PrecProdutoRecord } from '@/types/precificacao'
import { calcularCustoBaseProduto } from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'

interface KitDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  kitParaEditar?: PrecProdutoRecord | null
  produtosDisponiveis: PrecProdutoRecord[]
  onSuccess: () => void
}

export function KitDialog({
  open,
  onOpenChange,
  kitParaEditar,
  produtosDisponiveis,
  onSuccess,
}: KitDialogProps) {
  const { toast } = useToast()
  const isEditing = Boolean(kitParaEditar?.id)

  const [produtoBaseId, setProdutoBaseId] = useState<string>('')
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
  const [custoEmbalagem, setCustoEmbalagem] = useState<number>(0.1)
  const [custoEtiqueta, setCustoEtiqueta] = useState<number>(0.05)

  // Upload próprio de imagem
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Apenas produtos simples (fabricação própria ou revenda) podem ser base do kit
  const produtosBaseOpcoes = produtosDisponiveis.filter(
    (p) => p.tipo === 'fabricacao_propria' || p.tipo === 'revenda',
  )

  const produtoBaseSelecionado = produtosBaseOpcoes.find((p) => p.id === produtoBaseId)

  // Custo unitário base do produto componente
  const custoBaseUnitario = produtoBaseSelecionado
    ? calcularCustoBaseProduto({
        sku: produtoBaseSelecionado.sku,
        nome: produtoBaseSelecionado.nome,
        tipo: produtoBaseSelecionado.tipo,
        composicao: produtoBaseSelecionado.composicao,
        perda_pct: produtoBaseSelecionado.perda_pct,
        custo_aquisicao_unitario: produtoBaseSelecionado.custo_aquisicao_unitario,
        despesas_compra: produtoBaseSelecionado.despesas_compra,
        custo_etiqueta: produtoBaseSelecionado.custo_etiqueta,
        custo_adicional_embalagem: produtoBaseSelecionado.custo_adicional_embalagem,
      }).custo_total
    : 0

  const custoComponentesTotal = custoBaseUnitario * (quantidade || 1)
  const custoFinalEstimado = custoComponentesTotal + (custoEmbalagem || 0) + (custoEtiqueta || 0)

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
      setCustoEmbalagem(kitParaEditar.custo_adicional_embalagem ?? 0.1)
      setCustoEtiqueta(kitParaEditar.custo_etiqueta ?? 0.05)
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
            setProdutoBaseId(primeiroItem.produto_id)
            setQuantidade(primeiroItem.qtd_efetiva || kitParaEditar.qtd_por_kit || 2)
          } else {
            setQuantidade(kitParaEditar.qtd_por_kit || 2)
          }
        })
    } else {
      // Novo Kit
      setProdutoBaseId('')
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
      setCustoEmbalagem(0.1)
      setCustoEtiqueta(0.05)
      setImagemFile(null)
      setImagemPreview(null)
      setRemoverImagem(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
    setFormErrors({})
  }, [open, kitParaEditar])

  // Ao selecionar um produto base (apenas em modo de criação), sugere nome, SKU, peso e dimensões
  function handleSelectProdutoBase(prodId: string) {
    setProdutoBaseId(prodId)
    const base = produtosBaseOpcoes.find((p) => p.id === prodId)
    if (!base) return

    const qtd = quantidade > 1 ? quantidade : 2
    if (!isEditing) {
      setNome(`Kit ${qtd} ${base.nome}`)
      setSku(`KIT-${qtd}-${base.sku}`)
      setMarca(base.marca || '')
      setCategoria(base.categoria || '')
      if (base.peso_g) {
        setPesoG(base.peso_g * qtd)
      }
      setComprimentoCm(base.dimensao_comprimento_cm)
      setLarguraCm(base.dimensao_largura_cm)
      if (base.dimensao_altura_cm) {
        setAlturaCm(base.dimensao_altura_cm * qtd)
      }
      // Se não tem imagem anexada e o produto base tem imagem, exibir prévia
      if (!imagemFile && !imagemPreview && base.imagem) {
        setImagemPreview(precificacaoService.getProdutoImageUrl(base))
      }
    }
  }

  // Ao mudar a quantidade, se o nome/sku ainda seguir o padrão, atualiza automaticamente
  function handleQuantidadeChange(novaQtd: number) {
    const qtdVal = Math.max(2, novaQtd || 2)
    setQuantidade(qtdVal)

    if (produtoBaseSelecionado && !isEditing) {
      // Atualizar peso proporcional
      if (produtoBaseSelecionado.peso_g) {
        setPesoG(produtoBaseSelecionado.peso_g * qtdVal)
      }
      if (produtoBaseSelecionado.dimensao_altura_cm) {
        setAlturaCm(produtoBaseSelecionado.dimensao_altura_cm * qtdVal)
      }
      // Atualizar sugestão de nome e SKU se ainda não foi customizado
      setNome(`Kit ${qtdVal} ${produtoBaseSelecionado.nome}`)
      setSku(`KIT-${qtdVal}-${produtoBaseSelecionado.sku}`)
    }
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
    if (!produtoBaseId) {
      setFormErrors({ form: 'Selecione o produto base do Kit.' })
      return
    }
    if (quantidade < 2) {
      setFormErrors({ form: 'Um Kit deve conter ao menos 2 unidades do produto.' })
      return
    }

    setSaving(true)
    try {
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
        custo_adicional_embalagem: custoEmbalagem,
        custo_etiqueta: custoEtiqueta,
        qtd_por_kit: quantidade,
        empresa: produtoBaseSelecionado?.empresa,
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

      // Persistir estrutura de prec_kits
      const itemKit = {
        produto_id: produtoBaseId,
        nome: produtoBaseSelecionado?.nome || 'Produto Base',
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

  const produtosFiltrados = produtosBaseOpcoes.filter((p) => {
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
                {produtoBaseSelecionado && (
                  <span className="text-[11px] font-mono text-muted-foreground">
                    Custo un.: {formatCurrency(custoBaseUnitario)}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2 space-y-1">
                  <Label className="text-xs font-semibold">Produto Componente *</Label>
                  <Select
                    value={produtoBaseId || 'nenhum'}
                    onValueChange={(v) => {
                      if (v !== 'nenhum') handleSelectProdutoBase(v)
                    }}
                  >
                    <SelectTrigger className="bg-white">
                      <SelectValue placeholder="Selecione o produto base..." />
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
                          {p.nome} [SKU: {p.sku}] (
                          {p.tipo === 'fabricacao_propria' ? 'Fabricação' : 'Revenda'})
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
              {produtoBaseSelecionado && (
                <div className="p-2.5 rounded-xl bg-white/80 border border-primary/20 flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">
                    Custo dos componentes ({quantidade} un × {formatCurrency(custoBaseUnitario)}):
                  </span>
                  <span className="font-bold font-mono text-primary text-sm">
                    {formatCurrency(custoComponentesTotal)}
                  </span>
                </div>
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

            {/* Embalagem e Etiqueta adicionais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-3">
              <div className="space-y-1">
                <Label className="text-xs">Embalagem Adicional do Kit (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={custoEmbalagem}
                  onChange={(e) => setCustoEmbalagem(parseFloat(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Etiqueta (R$)</Label>
                <Input
                  type="number"
                  step="0.01"
                  value={custoEtiqueta}
                  onChange={(e) => setCustoEtiqueta(parseFloat(e.target.value) || 0)}
                />
              </div>
            </div>

            {/* Resumo do custo final */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-foreground block">
                  Custo Base Final Estimado
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Componentes + embalagem + etiqueta
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
