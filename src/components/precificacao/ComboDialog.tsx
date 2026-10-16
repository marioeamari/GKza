import { useEffect, useRef, useState } from 'react'
import { Camera, Check, ImageIcon, Layers, Plus, Search, Sparkles, Trash2, X } from 'lucide-react'
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
import { calcularCustoBaseProduto, ItemKitConfig } from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'

interface ComboLinhaItem {
  produto_id: string
  quantidade: number
}

interface ComboDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  comboParaEditar?: PrecProdutoRecord | null
  produtosDisponiveis: PrecProdutoRecord[]
  kitsMap?: Record<string, PrecKitRecord>
  onSuccess: () => void
}

export function ComboDialog({
  open,
  onOpenChange,
  comboParaEditar,
  produtosDisponiveis,
  kitsMap,
  onSuccess,
}: ComboDialogProps) {
  const { toast } = useToast()
  const isEditing = Boolean(comboParaEditar?.id)

  const [itens, setItens] = useState<ComboLinhaItem[]>([
    { produto_id: '', quantidade: 1 },
    { produto_id: '', quantidade: 1 },
  ])
  const [nome, setNome] = useState('')
  const [sku, setSku] = useState('')
  const [marca, setMarca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidade, setUnidade] = useState('combo')
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
  const [buscaText, setBuscaText] = useState('')

  // Componentes aceitam fabricação própria, revenda e kit (kit dentro de combo)
  // Combos não podem se auto-conter para evitar ciclos
  const produtosOpcoes = produtosDisponiveis.filter(
    (p) =>
      (p.tipo === 'fabricacao_propria' || p.tipo === 'revenda' || p.tipo === 'kit') &&
      (!comboParaEditar || p.id !== comboParaEditar.id),
  )

  // Cálculo dos custos dos componentes em tempo real
  let somaCustosComponentes = 0
  let somaPesos = 0
  let maxComprimento = 0
  let maxLargura = 0
  let somaAlturas = 0

  const itensCalculados = itens.map((item) => {
    const prod = produtosOpcoes.find((p) => p.id === item.produto_id)
    let custoUnit = 0
    if (prod) {
      // Se for kit, busca itens do kit para calcular o custo dinamicamente
      const kitRecord = kitsMap?.[prod.id]
      const kitItensConfig = kitRecord?.itens?.map((it) => ({
        produto_id: it.produto_id,
        nome: it.nome,
        qtd_efetiva: it.qtd_efetiva,
        custo_unitario: it.custo_unitario,
      }))

      custoUnit = calcularCustoBaseProduto({
        sku: prod.sku,
        nome: prod.nome,
        tipo: prod.tipo,
        composicao: prod.composicao,
        perda_pct: prod.perda_pct,
        custo_aquisicao_unitario: prod.custo_aquisicao_unitario,
        despesas_compra: prod.despesas_compra,
        custo_etiqueta: prod.custo_etiqueta,
        custo_adicional_embalagem: prod.custo_adicional_embalagem,
        kit_itens: kitItensConfig,
        kit_custos_adicionais: kitRecord?.custos_adicionais,
      }).custo_total
    }
    const subtotal = custoUnit * (item.quantidade || 1)
    somaCustosComponentes += subtotal

    if (prod) {
      if (prod.peso_g) somaPesos += prod.peso_g * (item.quantidade || 1)
      if (prod.dimensao_comprimento_cm && prod.dimensao_comprimento_cm > maxComprimento) {
        maxComprimento = prod.dimensao_comprimento_cm
      }
      if (prod.dimensao_largura_cm && prod.dimensao_largura_cm > maxLargura) {
        maxLargura = prod.dimensao_largura_cm
      }
      if (prod.dimensao_altura_cm) {
        somaAlturas += prod.dimensao_altura_cm * (item.quantidade || 1)
      }
    }

    return {
      ...item,
      produto: prod,
      custoUnit,
      subtotal,
    }
  })

  const custoTotalEstimado = somaCustosComponentes + (custoEmbalagem || 0) + (custoEtiqueta || 0)

  // Reset / inicialização
  useEffect(() => {
    if (!open) return

    if (comboParaEditar) {
      setNome(comboParaEditar.nome || '')
      setSku(comboParaEditar.sku || '')
      setMarca(comboParaEditar.marca || '')
      setCategoria(comboParaEditar.categoria || '')
      setUnidade(comboParaEditar.unidade || 'combo')
      setPesoG(comboParaEditar.peso_g)
      setComprimentoCm(comboParaEditar.dimensao_comprimento_cm)
      setLarguraCm(comboParaEditar.dimensao_largura_cm)
      setAlturaCm(comboParaEditar.dimensao_altura_cm)
      setCustoEmbalagem(comboParaEditar.custo_adicional_embalagem ?? 0.1)
      setCustoEtiqueta(comboParaEditar.custo_etiqueta ?? 0.05)
      setImagemFile(null)
      setRemoverImagem(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
      if (comboParaEditar.imagem) {
        setImagemPreview(precificacaoService.getProdutoImageUrl(comboParaEditar))
      } else {
        setImagemPreview(null)
      }

      // Carregar itens do prec_kits
      precificacaoService
        .getKitByProdutoPai(comboParaEditar.id)
        .then((kitRecord: PrecKitRecord | null) => {
          if (kitRecord?.itens && kitRecord.itens.length > 0) {
            setItens(
              kitRecord.itens.map((it) => ({
                produto_id: it.produto_id || '',
                quantidade: it.qtd_efetiva || 1,
              })),
            )
          } else {
            setItens([
              { produto_id: '', quantidade: 1 },
              { produto_id: '', quantidade: 1 },
            ])
          }
        })
    } else {
      // Novo Combo
      setItens([
        { produto_id: '', quantidade: 1 },
        { produto_id: '', quantidade: 1 },
      ])
      setNome('')
      setSku('')
      setMarca('')
      setCategoria('')
      setUnidade('combo')
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
  }, [open, comboParaEditar])

  // Aplica sugestões calculadas de medidas físicas
  function aplicarSugestoesMedidas() {
    if (somaPesos > 0) setPesoG(somaPesos)
    if (maxComprimento > 0) setComprimentoCm(maxComprimento)
    if (maxLargura > 0) setLarguraCm(maxLargura)
    if (somaAlturas > 0) setAlturaCm(somaAlturas)

    // Sugere nome baseado nos itens selecionados se nome estiver em branco
    if (!nome.trim()) {
      const nomes = itens
        .map((it) => {
          const p = produtosOpcoes.find((prod) => prod.id === it.produto_id)
          if (!p) return null
          return it.quantidade > 1 ? `${it.quantidade}x ${p.nome}` : p.nome
        })
        .filter(Boolean)
      if (nomes.length > 0) {
        setNome(`Combo ${nomes.join(' + ')}`)
      }
    }
  }

  function handleAdicionarLinha() {
    setItens([...itens, { produto_id: '', quantidade: 1 }])
  }

  function handleRemoverLinha(index: number) {
    if (itens.length <= 2) {
      toast({
        variant: 'destructive',
        title: 'Mínimo de itens',
        description: 'Um Combo deve ter no mínimo 2 produtos componentes.',
      })
      return
    }
    setItens(itens.filter((_, i) => i !== index))
  }

  function handleAtualizarLinha(index: number, campo: keyof ComboLinhaItem, valor: unknown) {
    const novos = [...itens]
    novos[index] = { ...novos[index], [campo]: valor }
    setItens(novos)
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

    // Validar itens
    const itensValidos = itens.filter((it) => it.produto_id && it.quantidade > 0)
    if (itensValidos.length < 2) {
      setFormErrors({ form: 'O Combo precisa de pelo menos 2 produtos selecionados.' })
      toast({
        variant: 'destructive',
        title: 'Produtos insuficientes',
        description: 'Selecione pelo menos 2 produtos diferentes para montar o combo.',
      })
      return
    }

    setSaving(true)
    try {
      // Combos e kits pertencem exclusivamente ao catálogo (sem empresa)
      const payload: Partial<PrecProdutoRecord> = {
        tipo: 'combo',
        status: 'ativo',
        sku: sku.trim(),
        nome: nome.trim(),
        marca: marca.trim() || undefined,
        categoria: categoria.trim() || undefined,
        unidade: unidade.trim() || 'combo',
        peso_g: pesoG,
        dimensao_comprimento_cm: comprimentoCm,
        dimensao_largura_cm: larguraCm,
        dimensao_altura_cm: alturaCm,
        custo_adicional_embalagem: custoEmbalagem,
        custo_etiqueta: custoEtiqueta,
        empresa: '',
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

        if (comboParaEditar?.id) {
          savedRecord = await precificacaoService.updateProduto(comboParaEditar.id, formData)
        } else {
          savedRecord = await precificacaoService.createProduto(formData)
        }
      } else if (removerImagem && comboParaEditar?.id) {
        const formData = new FormData()
        Object.entries(payload).forEach(([key, val]) => {
          if (val !== undefined && val !== null) {
            formData.append(key, typeof val === 'object' ? JSON.stringify(val) : String(val))
          }
        })
        formData.append('imagem', '')
        savedRecord = await precificacaoService.updateProduto(comboParaEditar.id, formData)
      } else {
        if (comboParaEditar?.id) {
          savedRecord = await precificacaoService.updateProduto(comboParaEditar.id, payload)
        } else {
          savedRecord = await precificacaoService.createProduto(payload)
        }
      }

      // Persistir estrutura em prec_kits
      const kitItensFormatados: ItemKitConfig[] = itensValidos.map((it) => {
        const prod = produtosOpcoes.find((p) => p.id === it.produto_id)
        let custoUnit = 0
        if (prod) {
          const kitRecord = kitsMap?.[prod.id]
          const kitItensConfig = kitRecord?.itens?.map((itRec) => ({
            produto_id: itRec.produto_id,
            nome: itRec.nome,
            qtd_efetiva: itRec.qtd_efetiva,
            custo_unitario: itRec.custo_unitario,
          }))

          custoUnit = calcularCustoBaseProduto({
            sku: prod.sku,
            nome: prod.nome,
            tipo: prod.tipo,
            composicao: prod.composicao,
            perda_pct: prod.perda_pct,
            custo_aquisicao_unitario: prod.custo_aquisicao_unitario,
            despesas_compra: prod.despesas_compra,
            custo_etiqueta: prod.custo_etiqueta,
            custo_adicional_embalagem: prod.custo_adicional_embalagem,
            kit_itens: kitItensConfig,
            kit_custos_adicionais: kitRecord?.custos_adicionais,
          }).custo_total
        }
        return {
          produto_id: it.produto_id,
          nome: prod?.nome || 'Produto Componente',
          qtd_efetiva: it.quantidade,
          custo_unitario: custoUnit,
        }
      })

      await precificacaoService.saveKit(savedRecord.id, kitItensFormatados, [])

      toast({
        title: isEditing ? 'Combo atualizado com sucesso!' : 'Combo criado com sucesso!',
        description: `${nome} (${itensValidos.length} produtos)`,
      })
      onOpenChange(false)
      onSuccess()
    } catch (err) {
      const fieldErrs = apiFieldErrors(err)
      const errorMsg = apiMessage(err, 'Não foi possível salvar o Combo.')
      if (fieldErrs.sku) {
        fieldErrs.sku = `Já existe um produto com o SKU '${sku}'. Escolha outro SKU para o combo.`
      }
      setFormErrors({ ...fieldErrs, form: errorMsg })
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar Combo',
        description: fieldErrs.sku || errorMsg,
      })
    } finally {
      setSaving(false)
    }
  }

  const produtosFiltrados = produtosOpcoes.filter((p) => {
    if (!buscaText.trim()) return true
    const term = buscaText.toLowerCase()
    return p.nome.toLowerCase().includes(term) || p.sku.toLowerCase().includes(term)
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSalvar}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              <div className="h-8 w-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center font-bold">
                <Layers className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle>
                  {isEditing ? 'Editar Combo de Produtos' : 'Novo Combo de Produtos'}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  Combos são a combinação de dois ou mais produtos distintos (ex: Body + Toalha de
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
            {/* Lista Dinâmica de Componentes do Combo */}
            <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="font-bold text-xs uppercase tracking-wider text-primary flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5" />
                    Produtos Componentes do Combo (Mínimo 2)
                  </span>
                  <span className="text-[11px] text-muted-foreground block">
                    Escolha produtos e suas respectivas quantidades.
                  </span>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs bg-white"
                  onClick={handleAdicionarLinha}
                >
                  <Plus className="mr-1 h-3.5 w-3.5" />
                  Adicionar Item
                </Button>
              </div>

              {/* Tabela de itens */}
              <div className="space-y-2">
                {itensCalculados.map((it, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-2 bg-white p-2 rounded-xl border border-border"
                  >
                    <div className="flex-1">
                      <Select
                        value={it.produto_id || 'nenhum'}
                        onValueChange={(v) =>
                          handleAtualizarLinha(idx, 'produto_id', v === 'nenhum' ? '' : v)
                        }
                      >
                        <SelectTrigger className="h-8 text-xs bg-white">
                          <SelectValue placeholder="Selecione o produto componente..." />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="p-1 border-b border-border">
                            <div className="relative">
                              <Search className="absolute left-2 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                              <Input
                                placeholder="Filtrar por nome ou SKU..."
                                value={buscaText}
                                onChange={(e) => setBuscaText(e.target.value)}
                                className="h-8 pl-8 text-xs"
                                onKeyDown={(e) => e.stopPropagation()}
                              />
                            </div>
                          </div>
                          <SelectItem value="nenhum">Selecione...</SelectItem>
                          {produtosFiltrados.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.nome} [SKU: {p.sku}] (
                              {p.tipo === 'fabricacao_propria' ? 'Fabricação' : 'Revenda'})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-20">
                      <Input
                        type="number"
                        min="1"
                        step="1"
                        value={it.quantidade}
                        onChange={(e) =>
                          handleAtualizarLinha(
                            idx,
                            'quantidade',
                            Math.max(1, parseInt(e.target.value) || 1),
                          )
                        }
                        className="h-8 text-xs font-mono text-center"
                        title="Quantidade deste produto no combo"
                      />
                    </div>

                    <div className="w-24 text-right font-mono text-xs font-semibold text-muted-foreground">
                      {formatCurrency(it.subtotal)}
                    </div>

                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-destructive shrink-0"
                      onClick={() => handleRemoverLinha(idx)}
                      disabled={itens.length <= 2}
                      title={itens.length <= 2 ? 'Mínimo de 2 itens obrigatório' : 'Remover item'}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>

              {/* Subtotal dos componentes e atalho de sugestão */}
              <div className="p-2.5 rounded-xl bg-white/90 border border-primary/20 flex flex-col sm:flex-row items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">Soma dos Componentes:</span>
                  <span className="font-bold font-mono text-primary text-sm">
                    {formatCurrency(somaCustosComponentes)}
                  </span>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="h-7 text-xs font-semibold text-primary"
                  onClick={aplicarSugestoesMedidas}
                >
                  <Sparkles className="mr-1 h-3.5 w-3.5" />
                  Sugerir Peso, Medidas & Nome
                </Button>
              </div>
            </div>

            {/* Imagem do Combo */}
            <div className="space-y-1">
              <Label className="text-xs font-semibold">Imagem do Combo (opcional)</Label>
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
                    Foto conjunta do combo ou banner do anúncio promocional.
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
                <Label className="text-xs font-semibold">Nome do Combo *</Label>
                <Input
                  required
                  placeholder="Ex: Combo Boby Bebê e Toalha de Praia"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </div>

              <div className="space-y-1">
                <Label className="text-xs font-semibold">SKU Próprio do Combo *</Label>
                <Input
                  required
                  placeholder="Ex: CMB-BODY-TOALHA"
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

            {/* Medidas e Pesos Sugeridos com Explicação */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-semibold">Pesos & Dimensões do Pacote</Label>
                <span className="text-[10px] text-muted-foreground">
                  (Sugerido: maior comprimento, maior largura e soma das alturas)
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="space-y-1">
                  <Label className="text-[11px]">Peso Total (g)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Soma pesos"
                    value={pesoG ?? ''}
                    onChange={(e) => setPesoG(parseFloat(e.target.value) || undefined)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Compr. (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Maior comp."
                    value={comprimentoCm ?? ''}
                    onChange={(e) => setComprimentoCm(parseFloat(e.target.value) || undefined)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Larg. (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Maior larg."
                    value={larguraCm ?? ''}
                    onChange={(e) => setLarguraCm(parseFloat(e.target.value) || undefined)}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-[11px]">Altura (cm)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Soma alturas"
                    value={alturaCm ?? ''}
                    onChange={(e) => setAlturaCm(parseFloat(e.target.value) || undefined)}
                  />
                </div>
              </div>
            </div>

            {/* Embalagem e Etiqueta adicionais */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-3">
              <div className="space-y-1">
                <Label className="text-xs">Embalagem Adicional do Combo (R$)</Label>
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
                  Σ(Custo × Qtd) + embalagem + etiqueta
                </span>
              </div>
              <span className="text-base font-bold font-mono text-primary">
                {formatCurrency(custoTotalEstimado)}
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
              {saving ? 'Salvando...' : isEditing ? 'Atualizar Combo' : 'Salvar Combo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
