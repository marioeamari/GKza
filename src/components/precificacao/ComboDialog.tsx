import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Calculator,
  Camera,
  Check,
  ImageIcon,
  Layers,
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
import type { ItemKitConfig } from '@/lib/precificacao/calculo'
import type { ProdutoBaseRecord } from '@/types/domain'
import type { ItemComposicaoCusto } from '@/lib/precificacao/calculo'
import {
  buildItensPrincipaisOpcoes,
  calcularCustoTotalConsolidado,
  ItemPrincipalOpcao,
} from '@/lib/precificacao/kitComboHelpers'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
interface ComboLinhaItem {
  produto_id: string
  quantidade: number
  perda_pct?: number
}

interface ComboDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  comboParaEditar?: PrecProdutoRecord | null
  produtosDisponiveis: PrecProdutoRecord[]
  produtosBase?: import('@/types/domain').ProdutoBaseRecord[]
  kitsMap?: Record<string, PrecKitRecord>
  onSuccess: () => void
}

export function ComboDialog({
  open,
  onOpenChange,
  comboParaEditar,
  produtosDisponiveis,
  produtosBase: produtosBaseProp,
  kitsMap,
  onSuccess,
}: ComboDialogProps) {
  const { toast } = useToast()
  const isEditing = Boolean(comboParaEditar?.id)

  const [produtosBaseLista, setProdutosBaseLista] = useState<ProdutoBaseRecord[]>(
    produtosBaseProp || [],
  )

  const [itens, setItens] = useState<ComboLinhaItem[]>([
    { produto_id: '', quantidade: 1 },
    { produto_id: '', quantidade: 1 },
  ])
  const [buscaText, setBuscaText] = useState('')
  const [nome, setNome] = useState('')
  const [sku, setSku] = useState('')
  const [marca, setMarca] = useState('')
  const [categoria, setCategoria] = useState('')
  const [unidade, setUnidade] = useState('combo')
  const [pesoG, setPesoG] = useState<number | undefined>(undefined)
  const [comprimentoCm, setComprimentoCm] = useState<number | undefined>(undefined)
  const [larguraCm, setLarguraCm] = useState<number | undefined>(undefined)
  const [alturaCm, setAlturaCm] = useState<number | undefined>(undefined)

  // Preservação de campos legados (não exibidos na UI; mantidos se já gravados)
  const [custoEmbalagemLegado, setCustoEmbalagemLegado] = useState<number>(0)
  const [custoEtiquetaLegado, setCustoEtiquetaLegado] = useState<number>(0)
  const [perdaPctGlobal, setPerdaPctGlobal] = useState<number>(0)

  // Composição analítica de produtos base (insumos, embalagens, etiquetas, serviços)
  const [composicao, setComposicao] = useState<ItemComposicaoCusto[]>([])
  const [insumoSelecionadoId, setInsumoSelecionadoId] = useState<string>('')
  const [qtdInsumo, setQtdInsumo] = useState<number>(1)
  const [perdaInsumo, setPerdaInsumo] = useState<number>(0)

  // Upload próprio de imagem
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Carrega produtos_base caso não fornecido via prop
  useEffect(() => {
    if (open && (!produtosBaseProp || produtosBaseProp.length === 0)) {
      produtosBaseService
        .list()
        .then((res) => setProdutosBaseLista(res))
        .catch((err) => console.warn('Erro ao carregar produtos_base no ComboDialog:', err))
    } else if (produtosBaseProp && produtosBaseProp.length > 0) {
      setProdutosBaseLista(produtosBaseProp)
    }
  }, [open, produtosBaseProp])

  // Opções consolidadas para Itens Principais do Combo:
  // Produtos Compostos (prec_produtos) + Produtos Base (produtos_base com tipo='revenda')
  const itensPrincipaisOpcoes: ItemPrincipalOpcao[] = useMemo(() => {
    return buildItensPrincipaisOpcoes({
      produtosCompostos: produtosDisponiveis,
      produtosBase: produtosBaseLista,
      idAtualParaExcluir: comboParaEditar?.id,
      contexto: 'combo',
      kitsMap,
    })
  }, [produtosDisponiveis, produtosBaseLista, comboParaEditar?.id, kitsMap])

  // Calcular custos de cada linha de item principal
  let somaCustosComponentes = 0
  let somaPesos = 0
  let maxComprimento = 0
  let maxLargura = 0
  let somaAlturas = 0

  let temPerdaNosItensPrincipais = false

  const itensCalculados = itens.map((item) => {
    const opt = itensPrincipaisOpcoes.find((p) => p.id === item.produto_id)
    const custoUnit = opt?.custoUnitario || 0
    const perdaItemPct = Number(item.perda_pct) || 0
    if (perdaItemPct > 0) {
      temPerdaNosItensPrincipais = true
    }
    const qtdNominal = Number(item.quantidade) || 1
    const qtdEfetiva = qtdNominal * (1 + perdaItemPct / 100)
    const subtotal = custoUnit * qtdEfetiva
    somaCustosComponentes += subtotal

    if (opt) {
      if (opt.peso_g) somaPesos += opt.peso_g * qtdNominal
      if (opt.dimensao_comprimento_cm && opt.dimensao_comprimento_cm > maxComprimento) {
        maxComprimento = opt.dimensao_comprimento_cm
      }
      if (opt.dimensao_largura_cm && opt.dimensao_largura_cm > maxLargura) {
        maxLargura = opt.dimensao_largura_cm
      }
      if (opt.dimensao_altura_cm) {
        somaAlturas += opt.dimensao_altura_cm * qtdNominal
      }
    }

    return {
      ...item,
      opcao: opt,
      custoUnit,
      qtdEfetiva,
      subtotal,
    }
  })

  // Cálculo auditado do custo total consolidado
  const calculoTotais = useMemo(() => {
    return calcularCustoTotalConsolidado({
      custoBaseItens: somaCustosComponentes,
      temPerdaNosItensPrincipais,
      composicao,
      custoEmbalagemLegado,
      custoEtiquetaLegado,
      perda_pct: perdaPctGlobal,
    })
  }, [
    somaCustosComponentes,
    temPerdaNosItensPrincipais,
    composicao,
    custoEmbalagemLegado,
    custoEtiquetaLegado,
    perdaPctGlobal,
  ])

  const temPerdaPorLinha =
    temPerdaNosItensPrincipais || composicao.some((c) => (Number(c.perda_pct) || 0) > 0)

  const custoTotalEstimado = calculoTotais.custoTotal

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
      setCustoEmbalagemLegado(comboParaEditar.custo_adicional_embalagem || 0)
      setCustoEtiquetaLegado(comboParaEditar.custo_etiqueta || 0)
      setPerdaPctGlobal(Number(comboParaEditar.perda_pct) || 0)
      setComposicao(comboParaEditar.composicao || [])
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
              kitRecord.itens.map((it) => {
                const opt = itensPrincipaisOpcoes.find((o) => o.rawId === it.produto_id)
                return {
                  produto_id: opt ? opt.id : `comp_${it.produto_id}`,
                  quantidade: it.qtd_efetiva || 1,
                  perda_pct: Number(it.perda_pct) || 0,
                }
              }),
            )
          } else {
            setItens([
              { produto_id: '', quantidade: 1 },
              { produto_id: '', quantidade: 1 },
            ])
          }
        })
    } else {
      // Novo Combo: campos legados zerados por padrão
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
      setCustoEmbalagemLegado(0)
      setCustoEtiquetaLegado(0)
      setPerdaPctGlobal(0)
      setComposicao([])
      setInsumoSelecionadoId('')
      setQtdInsumo(1)
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
      const nomes = itensCalculados
        .map((it) => {
          const opt = it.opcao
          if (!opt) return null
          return it.quantidade > 1 ? `${it.quantidade}x ${opt.nome}` : opt.nome
        })
        .filter(Boolean)
      if (nomes.length > 0) {
        setNome(`Combo ${nomes.join(' + ')}`)
      }
    }
  }

  // Gerenciamento da Composição Analítica por Linhas (insumos, embalagens, etiquetas, serviços)
  function adicionarLinhaComposicao() {
    if (!insumoSelecionadoId) return
    const itemBase = produtosBaseLista.find((b) => b.id === insumoSelecionadoId)
    if (!itemBase) return

    const perdaVal = Math.min(100, Math.max(0, Number(perdaInsumo) || 0))

    const novaLinha: ItemComposicaoCusto = {
      id: `C${composicao.length}`,
      codigo: `C${composicao.length}`,
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
      perda_pct: perdaVal > 0 ? perdaVal : undefined,
    }

    setComposicao([...composicao, novaLinha])
    setInsumoSelecionadoId('')
    setQtdInsumo(1)
    setPerdaInsumo(0)
  }

  function handleAtualizarPerdaLinha(index: number, novaPerda: number) {
    const val = Math.min(100, Math.max(0, novaPerda || 0))
    const novasLinhas = [...composicao]
    novasLinhas[index] = {
      ...novasLinhas[index],
      perda_pct: val > 0 ? val : undefined,
    }
    setComposicao(novasLinhas)
  }

  function removerLinhaComposicao(index: number) {
    setComposicao(composicao.filter((_, idx) => idx !== index))
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
      // Combos pertencem exclusivamente ao catálogo (sem empresa)
      // Novos combos nascem com custo_adicional_embalagem e custo_etiqueta zerados;
      // combos existentes preservam valores já gravados nesses campos respeitando regra de dupla contagem.
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
        composicao,
        custo_adicional_embalagem: calculoTotais.custoEmbalagemEfetivo,
        custo_etiqueta: calculoTotais.custoEtiquetaEfetivo,
        perda_pct: perdaPctGlobal > 0 ? perdaPctGlobal : undefined,
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

      // Persistir estrutura em prec_kits (produto_id grava o ID original da entidade no banco)
      const kitItensFormatados: ItemKitConfig[] = itensValidos.map((it) => {
        const opt = itensPrincipaisOpcoes.find((p) => p.id === it.produto_id)
        const rawId = opt?.rawId || it.produto_id.replace(/^(comp_|base_)/, '')
        const custoUnit = opt?.custoUnitario || 0
        const pLinha = Number(it.perda_pct) || 0
        return {
          produto_id: rawId,
          nome: opt?.nome || 'Produto Componente',
          qtd_efetiva: it.quantidade,
          perda_pct: pLinha > 0 ? pLinha : undefined,
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

  const produtosFiltrados = itensPrincipaisOpcoes.filter((p) => {
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
                              {p.nome} [SKU: {p.sku || 'S/SKU'}] — {p.tipoLabel} —{' '}
                              {formatCurrency(p.custoUnitario)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="w-16">
                      <Input
                        type="number"
                        min="0.01"
                        step="any"
                        value={it.quantidade}
                        onChange={(e) =>
                          handleAtualizarLinha(
                            idx,
                            'quantidade',
                            Math.max(0.01, parseFloat(e.target.value) || 1),
                          )
                        }
                        className="h-8 text-xs font-mono text-center"
                        title="Quantidade deste produto no combo"
                      />
                    </div>

                    <div className="w-20">
                      <Input
                        type="number"
                        min="0"
                        max="100"
                        step="any"
                        value={it.perda_pct ?? ''}
                        onChange={(e) =>
                          handleAtualizarLinha(
                            idx,
                            'perda_pct',
                            Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)),
                          )
                        }
                        placeholder="0%"
                        className="h-8 text-xs font-mono text-center"
                        title="% de Perda neste produto"
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

            {/* SEÇÃO COMPOSIÇÃO POR LINHAS DE PRODUTOS BASE (Insumos, Embalagens, Etiquetas, Serviços) */}
            <div className="space-y-3 p-3.5 rounded-xl border border-neutral-200 bg-white">
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-xs font-semibold flex items-center gap-1.5 text-neutral-800">
                    <Calculator className="h-4 w-4 text-[#DF5830]" />
                    Composição por Linhas de Produtos Base
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    Insumos, etiquetas, embalagens, tecidos ou serviços que compõem o combo.
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
                <div className="w-20">
                  <Input
                    type="number"
                    min="0.01"
                    step="any"
                    value={qtdInsumo}
                    onChange={(e) => setQtdInsumo(parseFloat(e.target.value) || 0)}
                    placeholder="Qtd"
                    title="Quantidade"
                    className="text-xs font-mono"
                  />
                </div>
                <div className="w-24">
                  <Input
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={perdaInsumo || ''}
                    onChange={(e) => setPerdaInsumo(parseFloat(e.target.value) || 0)}
                    placeholder="Perda %"
                    title="% de Perda da Linha (ex: 10 para 10%)"
                    className="text-xs font-mono text-center"
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

              {/* Tabela de composição analítica do Combo */}
              {composicao.length > 0 ? (
                <div className="border rounded-md overflow-hidden text-xs">
                  <table className="w-full text-left">
                    <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b">
                      <tr>
                        <th className="py-2 px-3">Item / Origem</th>
                        <th className="py-2 px-2 text-center">Qtd</th>
                        <th className="py-2 px-2 text-center w-24">Perda (%)</th>
                        <th className="py-2 px-2 text-center">Qtd Efetiva</th>
                        <th className="py-2 px-2 text-right">Unitário</th>
                        <th className="py-2 px-2 text-right">Subtotal</th>
                        <th className="py-2 px-2 text-center w-10">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {composicao.map((item, idx) => {
                        const perdaPct = Number(item.perda_pct) || 0
                        const qtdNominal = Number(item.qtd) || 0
                        const qtdEfetiva = qtdNominal * (1 + perdaPct / 100)
                        const custoUnit = Number(item.custo_unitario) || 0
                        const sub = qtdEfetiva * custoUnit
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
                            <td className="py-2 px-2 text-center font-mono">{qtdNominal}</td>
                            <td className="py-2 px-2 text-center">
                              <Input
                                type="number"
                                min="0"
                                max="100"
                                step="any"
                                value={item.perda_pct ?? ''}
                                onChange={(e) =>
                                  handleAtualizarPerdaLinha(idx, parseFloat(e.target.value) || 0)
                                }
                                placeholder="0"
                                className="h-7 text-xs text-center font-mono w-20 mx-auto"
                                title="% de Perda desta linha"
                              />
                            </td>
                            <td className="py-2 px-2 text-center font-mono font-medium">
                              {qtdEfetiva.toLocaleString('pt-BR', {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 3,
                              })}
                            </td>
                            <td className="py-2 px-2 text-right font-mono">
                              {formatCurrency(custoUnit)}
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

              {/* Campo % de Perda GLOBAL do Combo */}
              <div className="pt-2 border-t border-neutral-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-neutral-50/70 p-3 rounded-lg">
                <div className="space-y-0.5">
                  <Label
                    htmlFor="perdaGlobalCombo"
                    className="text-xs font-semibold text-neutral-800"
                  >
                    % de Perda Global do Combo (Opcional)
                  </Label>
                  <p className="text-[11px] text-muted-foreground">
                    {temPerdaPorLinha ? (
                      <span className="text-amber-700 font-medium">
                        ⚠ Inativa: há linha(s) com perda própria. A perda informada na linha tem
                        prioridade e anula a global.
                      </span>
                    ) : (
                      'Incide sobre o custo direto total se nenhuma linha (componente ou composição) tiver perda própria informada.'
                    )}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Input
                    id="perdaGlobalCombo"
                    type="number"
                    min="0"
                    max="100"
                    step="any"
                    value={perdaPctGlobal || ''}
                    onChange={(e) =>
                      setPerdaPctGlobal(Math.min(100, Math.max(0, parseFloat(e.target.value) || 0)))
                    }
                    placeholder="0"
                    className={`w-24 text-xs font-mono text-center ${
                      temPerdaPorLinha ? 'opacity-60 bg-neutral-100 line-through' : 'bg-white'
                    }`}
                  />
                  <span className="text-xs text-neutral-600 font-medium">%</span>
                </div>
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

            {/* Resumo do custo final (Campos legados de embalagem/etiqueta removidos da UI; entram na Composição por Linhas) */}
            <div className="p-3 rounded-xl bg-secondary/30 border border-border flex items-center justify-between">
              <div>
                <span className="font-bold text-xs text-foreground block">
                  Custo Base Final Estimado
                </span>
                <span className="text-[11px] text-muted-foreground">
                  Componentes ({formatCurrency(somaCustosComponentes)}) + Composição por Linhas (
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
