import { useEffect, useRef, useState } from 'react'
import {
  Boxes,
  Camera,
  Image as ImageIcon,
  LoaderCircle,
  PackagePlus,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
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
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import {
  formatCNPJ,
  formatCPF,
  formatPhone,
  isValidCNPJ,
  isValidCPF,
  onlyDigits,
} from '@/lib/documents'
import { formatCurrency } from '@/lib/format'
import { CategoriaAutocompleteInput } from '@/components/precificacao/CategoriaAutocompleteInput'
import { fornecedoresService } from '@/services/fornecedores'
import {
  insumosService,
  formatarDimensaoInsumo,
  aplicarAutoPreenchimentoEmbalagem,
} from '@/services/insumos'
import {
  calcularCustoBaseProduto,
  round2,
  type ItemComposicaoCusto,
} from '@/lib/precificacao/calculo'
import {
  FORNECEDOR_TIPOS_LISTA,
  FORNECEDOR_TIPO_CONFIG,
  filtrarItensParaSeletorComposicao,
  normalizarTiposFornecedor,
} from '@/lib/classificacao-fornecedores'
import type { Fornecedor, FornecedorProduto, FornecedorTipo, InsumoRecord } from '@/types/domain'

interface FornecedorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: Fornecedor | null
  onSaved: () => void
  canWrite: boolean
  canDelete: boolean
  defaultTab?: 'dados' | 'produtos'
}

const initialFornecedor = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  cpf: '',
  inscricao_estadual: '',
  email: '',
  telefone: '',
  contato_nome: '',
  endereco: '',
  cep: '',
  cidade: '',
  uf: '',
  site: '',
  prazo_entrega_dias: '',
  condicao_pagamento: '',
  observacoes: '',
  tipos: ['revenda'] as FornecedorTipo[],
}

const initialProduto = {
  descricao: '',
  sku_fornecedor: '',
  codigo_barras: '',
  marca: '',
  categoria: '',
  unidade: 'un',
  preco_custo_unitario: '',
  preco_ultima_compra: '',
  embalagem: '',
  peso_g: '',
  comprimento_cm: '',
  largura_cm: '',
  altura_cm: '',
  moeda: 'BRL',
  ncm: '',
  observacoes: '',
  custo_adicional_embalagem: '',
  custo_etiqueta: '',
  ativo: true,
}

export function FornecedorDialog({
  open,
  onOpenChange,
  record,
  onSaved,
  canWrite,
  canDelete,
  defaultTab = 'dados',
}: FornecedorDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState(initialFornecedor)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'dados' | 'produtos'>('dados')

  // Listas read-only conforme especificação da reestruturação:
  // 1. Produtos Base deste fornecedor
  // 2. Produtos Compostos que contenham algum item de origem dele
  const [produtosBaseFornecedor, setProdutosBaseFornecedor] = useState<
    import('@/types/domain').ProdutoBaseRecord[]
  >([])
  const [produtosCompostosComOrigem, setProdutosCompostosComOrigem] = useState<
    import('@/types/domain').ProdutoCompostoRecord[]
  >([])
  const [loadingListas, setLoadingListas] = useState(false)

  // Tipo de documento (CNPJ ou CPF)
  const [tipoDoc, setTipoDoc] = useState<'cnpj' | 'cpf'>('cnpj')

  useEffect(() => {
    if (open) {
      setTab(defaultTab || 'dados')
      if (record) {
        setForm({
          razao_social: record.razao_social || '',
          nome_fantasia: record.nome_fantasia || '',
          cnpj: record.cnpj ? formatCNPJ(record.cnpj) : '',
          cpf: record.cpf ? formatCPF(record.cpf) : '',
          inscricao_estadual: record.inscricao_estadual || '',
          email: record.email || '',
          telefone: record.telefone ? formatPhone(record.telefone) : '',
          contato_nome: record.contato_nome || '',
          endereco: record.endereco || '',
          cep: record.cep || '',
          cidade: record.cidade || '',
          uf: record.uf || '',
          site: record.site || '',
          prazo_entrega_dias:
            record.prazo_entrega_dias !== undefined && record.prazo_entrega_dias !== null
              ? String(record.prazo_entrega_dias)
              : '',
          condicao_pagamento: record.condicao_pagamento || '',
          observacoes: record.observacoes || '',
          tipos: normalizarTiposFornecedor(record.tipos),
        })
        setTipoDoc(record.cpf && !record.cnpj ? 'cpf' : 'cnpj')
        carregarListasReadonly(record.id)
      } else {
        setForm(initialFornecedor)
        setTipoDoc('cnpj')
        setProdutosBaseFornecedor([])
        setProdutosCompostosComOrigem([])
      }
      setErrors({})
    }
  }, [open, record, defaultTab])

  async function carregarListasReadonly(fornecedorId: string) {
    try {
      setLoadingListas(true)
      // Carrega produtos_base do fornecedor
      const { produtosBaseService, produtosCompostosService } = await import('@/services/produtos')
      const bases = await produtosBaseService.list({ fornecedorId })
      setProdutosBaseFornecedor(bases)

      // Carrega produtos compostos
      const compostos = await produtosCompostosService.list()
      const baseIdsSet = new Set(bases.map((b) => b.id))

      // Filtra compostos que contenham algum item de origem dele:
      // (a) base_origem seja do fornecedor, OU
      // (b) alguma linha da composição tenha fornecedor_id igual, ou insumo_id pertencente a baseIdsSet
      const compostosComOrigem = compostos.filter((c) => {
        if (c.base_origem && baseIdsSet.has(c.base_origem)) return true
        if (c.expand?.base_origem?.fornecedor === fornecedorId) return true
        if (Array.isArray(c.composicao)) {
          return c.composicao.some(
            (item) =>
              item.fornecedor_id === fornecedorId ||
              (item.insumo_id && baseIdsSet.has(item.insumo_id)),
          )
        }
        return false
      })

      setProdutosCompostosComOrigem(compostosComOrigem)
    } catch (err) {
      console.warn('Erro ao carregar listas do fornecedor:', err)
    } finally {
      setLoadingListas(false)
    }
  }

  async function handleSaveFornecedor(e: React.FormEvent) {
    e.preventDefault()
    const nextErrors: Record<string, string> = {}

    if (!form.razao_social.trim()) {
      nextErrors.razao_social = 'Informe a razão social.'
    }
    if (!form.nome_fantasia.trim()) {
      nextErrors.nome_fantasia = 'Informe o nome fantasia.'
    }
    if (!form.tipos || form.tipos.length === 0) {
      nextErrors.tipos = 'Selecione ao menos um tipo de fornecimento.'
    }

    if (tipoDoc === 'cnpj') {
      if (!form.cnpj.trim()) {
        nextErrors.cnpj = 'Informe o CNPJ.'
      } else if (!isValidCNPJ(form.cnpj)) {
        nextErrors.cnpj = 'CNPJ inválido.'
      }
    } else if (tipoDoc === 'cpf') {
      if (!form.cpf.trim()) {
        nextErrors.cpf = 'Informe o CPF do fornecedor.'
      } else if (!isValidCPF(form.cpf)) {
        nextErrors.cpf = 'CPF inválido.'
      }
    }

    setErrors(nextErrors)

    if (Object.keys(nextErrors).length) {
      toast({
        variant: 'destructive',
        title: 'Verifique os dados',
        description: Object.values(nextErrors)[0],
      })
      return
    }

    // Verificar duplicidade de CNPJ no banco se informado
    const cleanCNPJ = onlyDigits(form.cnpj)
    if (cleanCNPJ) {
      try {
        const existing = await fornecedoresService.listFornecedores()
        const duplicate = existing.find(
          (f) => f.id !== record?.id && f.cnpj && onlyDigits(f.cnpj) === cleanCNPJ,
        )
        if (duplicate) {
          setErrors({ cnpj: 'Este CNPJ já está cadastrado em outro fornecedor.' })
          toast({
            variant: 'destructive',
            title: 'CNPJ duplicado',
            description: 'Já existe um fornecedor cadastrado com este mesmo CNPJ.',
          })
          return
        }
      } catch {
        // Prossegue caso busca falhe
      }
    }

    setSaving(true)
    try {
      const payload: Partial<Fornecedor> = {
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia.trim(),
        cnpj: tipoDoc === 'cnpj' ? formatCNPJ(form.cnpj) : '',
        cpf: tipoDoc === 'cpf' ? formatCPF(form.cpf) : '',
        inscricao_estadual: form.inscricao_estadual.trim() || undefined,
        email: form.email.trim() || undefined,
        telefone: form.telefone.trim() || undefined,
        contato_nome: form.contato_nome.trim() || undefined,
        endereco: form.endereco.trim() || undefined,
        cep: form.cep.trim() || undefined,
        cidade: form.cidade.trim() || undefined,
        uf: form.uf.trim().toUpperCase() || undefined,
        site: form.site.trim() || undefined,
        prazo_entrega_dias: form.prazo_entrega_dias ? Number(form.prazo_entrega_dias) : undefined,
        condicao_pagamento: form.condicao_pagamento.trim() || undefined,
        observacoes: form.observacoes.trim() || undefined,
        tipos: form.tipos,
      }

      const saved = await fornecedoresService.saveFornecedor(payload, record?.id)
      toast({
        title: record ? 'Fornecedor atualizado' : 'Fornecedor cadastrado com sucesso',
      })
      onSaved()
      if (!record?.id) {
        onOpenChange(false)
      } else {
        carregarListasReadonly(saved.id)
      }
    } catch (error) {
      const fields = apiFieldErrors(error)
      setErrors({ ...fields, form: apiMessage(error) })
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: apiMessage(error),
      })
    } finally {
      setSaving(false)
    }
  }

  // Ações de Produtos Fornecidos
  function handleNovoProduto() {
    if (!record?.id) {
      toast({
        variant: 'destructive',
        title: 'Salve o fornecedor primeiro',
        description: 'Cadastre o fornecedor antes de adicionar produtos vinculados.',
      })
      return
    }
    setEditingProduto(null)
    setProdForm(initialProduto)
    setProdComposicao([])
    setEmbalagemEditadaManualmente(false)
    setProdErrors({})
    setImagemFile(null)
    setImagemPreview(null)
    setRemoverImagem(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setProdutoDialog(true)
  }

  function handleEditarProduto(p: FornecedorProduto) {
    setEditingProduto(p)
    // Se o produto já possui um custo_adicional_embalagem cadastrado explicitamente, consideramos manual
    setEmbalagemEditadaManualmente(
      p.custo_adicional_embalagem !== undefined &&
        p.custo_adicional_embalagem !== null &&
        Number(p.custo_adicional_embalagem) > 0,
    )
    setProdForm({
      descricao: p.descricao,
      sku_fornecedor: p.sku_fornecedor || '',
      codigo_barras: p.codigo_barras || '',
      marca: p.marca || '',
      categoria: p.categoria || '',
      unidade: p.unidade || 'un',
      preco_custo_unitario:
        p.preco_custo_unitario !== undefined && p.preco_custo_unitario !== null
          ? String(p.preco_custo_unitario)
          : '',
      preco_ultima_compra:
        p.preco_ultima_compra !== undefined && p.preco_ultima_compra !== null
          ? String(p.preco_ultima_compra)
          : '',
      embalagem: p.embalagem || '',
      peso_g: p.peso_g !== undefined && p.peso_g !== null ? String(p.peso_g) : '',
      comprimento_cm:
        p.comprimento_cm !== undefined && p.comprimento_cm !== null ? String(p.comprimento_cm) : '',
      largura_cm: p.largura_cm !== undefined && p.largura_cm !== null ? String(p.largura_cm) : '',
      altura_cm: p.altura_cm !== undefined && p.altura_cm !== null ? String(p.altura_cm) : '',
      moeda: p.moeda || 'BRL',
      ncm: p.ncm || '',
      observacoes: p.observacoes || '',
      custo_adicional_embalagem:
        p.custo_adicional_embalagem !== undefined && p.custo_adicional_embalagem !== null
          ? String(p.custo_adicional_embalagem)
          : '',
      custo_etiqueta:
        p.custo_etiqueta !== undefined && p.custo_etiqueta !== null ? String(p.custo_etiqueta) : '',
      ativo: p.ativo !== false,
    })
    setProdComposicao(Array.isArray(p.composicao) ? p.composicao : [])
    setProdErrors({})
    setImagemFile(null)
    setRemoverImagem(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (p.imagem) {
      setImagemPreview(fornecedoresService.getProdutoImageUrl(p, '200x200'))
    } else {
      setImagemPreview(null)
    }
    setProdutoDialog(true)
  }

  // Handler para selecionar insumo do catálogo em uma linha da composição
  function handleSelecionarInsumoNaLinha(idx: number, insumoId: string) {
    const arr = [...prodComposicao]
    if (!arr[idx]) return

    if (!insumoId || insumoId === 'manual') {
      arr[idx] = {
        ...arr[idx],
        insumo_id: undefined,
        insumo_tipo: undefined,
        dimensao_tipo: undefined,
        dimensao_largura_cm: undefined,
        dimensao_altura_cm: undefined,
        dimensao_comprimento_cm: undefined,
        dimensao_formatada: undefined,
        categoria_nome: undefined,
        fornecedor_id: undefined,
        fornecedor_nome: undefined,
      }
      setProdComposicao(arr)
      return
    }

    const insumo = insumosAtivos.find((i) => i.id === insumoId)
    if (!insumo) return

    const dimFormatada = formatarDimensaoInsumo(insumo)
    const fornNome =
      insumo.expand?.fornecedor?.nome_fantasia ||
      insumo.expand?.fornecedor?.razao_social ||
      undefined
    const catNome = insumo.expand?.categoria?.nome || undefined
    const custoUnit = Number(insumo.valor_unitario) || 0

    arr[idx] = {
      ...arr[idx],
      descricao: insumo.nome,
      custo_unitario: custoUnit,
      unidade: insumo.unidade || arr[idx].unidade || 'un',
      categoria_custo: insumo.tipo === 'servico' ? 'servico' : 'insumo',
      insumo_id: insumo.id,
      insumo_tipo: insumo.tipo,
      dimensao_tipo: insumo.dimensao_tipo,
      dimensao_largura_cm: insumo.dimensao_largura_cm,
      dimensao_altura_cm: insumo.dimensao_altura_cm,
      dimensao_comprimento_cm: insumo.dimensao_comprimento_cm,
      dimensao_formatada: dimFormatada,
      categoria_nome: catNome,
      fornecedor: insumo.fornecedor,
      fornecedor_id: insumo.fornecedor,
      fornecedor_nome: fornNome,
    }
    setProdComposicao(arr)

    // Regra: se o insumo for da categoria "Embalagem", autopreenche custo_adicional_embalagem
    // SOMENTE se o usuário ainda não tiver editado manualmente (flag embalagemEditadaManualmente)
    const resAuto = aplicarAutoPreenchimentoEmbalagem({
      insumo,
      valorEmbalagemAtual: prodForm.custo_adicional_embalagem,
      editadoManualmente: embalagemEditadaManualmente,
    })
    if (resAuto.deveAtualizar && resAuto.novoValor !== null) {
      setProdForm((prev) => ({
        ...prev,
        custo_adicional_embalagem: String(resAuto.novoValor),
      }))
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    // Validar tipo
    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Arquivo inválido',
        description: 'Selecione um arquivo de imagem (PNG, JPG, WEBP, etc.).',
      })
      return
    }

    // Validar tamanho (~5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        variant: 'destructive',
        title: 'Imagem muito grande',
        description: 'A imagem deve ter no máximo 5MB.',
      })
      return
    }

    setImagemFile(file)
    setRemoverImagem(false)
    const previewUrl = URL.createObjectURL(file)
    setImagemPreview(previewUrl)
  }

  function handleRemoverImagem() {
    setImagemFile(null)
    setImagemPreview(null)
    setRemoverImagem(true)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSaveProduto(e: React.FormEvent) {
    e.preventDefault()
    if (!record?.id) return

    const nextErrors: Record<string, string> = {}
    if (!prodForm.descricao.trim()) {
      nextErrors.descricao = 'Informe a descrição do produto.'
    }
    const custo = parseFloat(prodForm.preco_custo_unitario.replace(',', '.'))
    if (isNaN(custo) || custo < 0) {
      nextErrors.preco_custo_unitario = 'Informe o preço de custo unitário válido.'
    }

    setProdErrors(nextErrors)
    if (Object.keys(nextErrors).length) {
      toast({
        variant: 'destructive',
        title: 'Verifique os dados do produto',
        description: Object.values(nextErrors)[0],
      })
      return
    }

    setSavingProd(true)
    try {
      // Montar FormData para suportar upload de arquivo ou limpeza do campo
      const formData = new FormData()
      formData.append('fornecedor', record.id)
      formData.append('descricao', prodForm.descricao.trim())
      if (prodForm.sku_fornecedor.trim())
        formData.append('sku_fornecedor', prodForm.sku_fornecedor.trim())
      if (prodForm.codigo_barras.trim())
        formData.append('codigo_barras', prodForm.codigo_barras.trim())
      if (prodForm.marca.trim()) formData.append('marca', prodForm.marca.trim())
      if (prodForm.categoria.trim()) formData.append('categoria', prodForm.categoria.trim())
      formData.append('unidade', prodForm.unidade.trim() || 'un')
      formData.append('preco_custo_unitario', String(custo))

      if (prodForm.preco_ultima_compra) {
        formData.append(
          'preco_ultima_compra',
          String(parseFloat(prodForm.preco_ultima_compra.replace(',', '.'))),
        )
      }
      if (prodForm.embalagem.trim()) formData.append('embalagem', prodForm.embalagem.trim())
      if (prodForm.peso_g) {
        formData.append('peso_g', String(parseFloat(prodForm.peso_g.replace(',', '.'))))
      }
      if (prodForm.comprimento_cm) {
        formData.append(
          'comprimento_cm',
          String(parseFloat(prodForm.comprimento_cm.replace(',', '.'))),
        )
      }
      if (prodForm.largura_cm) {
        formData.append('largura_cm', String(parseFloat(prodForm.largura_cm.replace(',', '.'))))
      }
      if (prodForm.altura_cm) {
        formData.append('altura_cm', String(parseFloat(prodForm.altura_cm.replace(',', '.'))))
      }
      formData.append('moeda', prodForm.moeda.trim() || 'BRL')
      if (prodForm.ncm.trim()) formData.append('ncm', prodForm.ncm.trim())
      if (prodForm.observacoes.trim()) formData.append('observacoes', prodForm.observacoes.trim())
      if (prodForm.custo_adicional_embalagem) {
        formData.append(
          'custo_adicional_embalagem',
          String(parseFloat(prodForm.custo_adicional_embalagem.replace(',', '.')) || 0),
        )
      }
      if (prodForm.custo_etiqueta) {
        formData.append(
          'custo_etiqueta',
          String(parseFloat(prodForm.custo_etiqueta.replace(',', '.')) || 0),
        )
      }
      // Composição analítica de insumos/serviços vinculados à revenda
      formData.append('composicao', JSON.stringify(prodComposicao))
      formData.append('ativo', String(prodForm.ativo))

      // Tratamento do campo imagem
      if (imagemFile) {
        formData.append('imagem', imagemFile)
      } else if (removerImagem) {
        formData.append('imagem', '')
      }

      const savedProduto = await fornecedoresService.saveProduto(formData, editingProduto?.id)

      // Ponte automática no salvamento: espelhar em prec_produtos com cópia de imagem
      try {
        await fornecedoresService.syncProdutoComPrecificacao(savedProduto.id)
      } catch (bridgeErr) {
        console.warn('Aviso: falha no espelhamento para prec_produtos:', bridgeErr)
      }

      toast({
        title: editingProduto ? 'Produto atualizado' : 'Produto adicionado com sucesso',
        description: 'Dados sincronizados com o catálogo de precificação.',
      })
      setProdutoDialog(false)
      carregarProdutos(record.id)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Erro ao salvar produto',
        description: apiMessage(error),
      })
    } finally {
      setSavingProd(false)
    }
  }

  async function handleDeleteProduto(id: string) {
    if (!confirm('Deseja realmente remover este produto do fornecedor?')) return
    try {
      await fornecedoresService.deleteProduto(id)
      toast({ title: 'Produto removido com sucesso' })
      if (record?.id) carregarProdutos(record.id)
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Não foi possível excluir o produto',
        description: apiMessage(error),
      })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {record ? `Editar fornecedor: ${record.nome_fantasia}` : 'Novo Fornecedor'}
            </DialogTitle>
            <DialogDescription>
              Cadastre os dados da empresa/pessoa fornecedora, condições comerciais e catálogo de
              produtos fornecidos.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as 'dados' | 'produtos')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="dados">Dados Cadastrais & Contato</TabsTrigger>
              <TabsTrigger value="produtos" disabled={!record?.id}>
                Produtos Fornecidos {record?.id && `(${produtos.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="mt-0">
              <form onSubmit={handleSaveFornecedor} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  {/* Classificação do Fornecedor (Multi-seleção: revenda | insumos | servicos) */}
                  <div className="space-y-1.5 sm:col-span-2 rounded-xl border border-primary/20 bg-primary/5 p-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-bold text-foreground">
                        Classificação do Fornecedor *
                      </Label>
                      <span className="text-[11px] text-muted-foreground">
                        Selecione as modalidades aplicáveis
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {FORNECEDOR_TIPOS_LISTA.map((t) => {
                        const ativo = form.tipos.includes(t)
                        const cfg = FORNECEDOR_TIPO_CONFIG[t]
                        return (
                          <button
                            key={t}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => {
                              const existe = form.tipos.includes(t)
                              let novos: FornecedorTipo[]
                              if (existe) {
                                novos = form.tipos.filter((item) => item !== t)
                                if (novos.length === 0) novos = [t]
                              } else {
                                novos = [...form.tipos, t]
                              }
                              setForm({ ...form, tipos: novos })
                            }}
                            className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all flex items-center gap-1.5 ${
                              ativo
                                ? `${cfg.badgeClass} ring-2 ring-primary/30 shadow-xs`
                                : 'bg-white/80 border-border text-muted-foreground hover:bg-secondary/50'
                            }`}
                          >
                            <span
                              className={`h-2 w-2 rounded-full ${
                                ativo ? 'bg-current' : 'bg-muted-foreground/40'
                              }`}
                            />
                            {cfg.label}
                          </button>
                        )
                      })}
                    </div>
                    {errors.tipos && <p className="text-[11px] text-destructive">{errors.tipos}</p>}
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold">Razão Social *</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.razao_social}
                      onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                      placeholder="Ex: Comercial de Tecidos Silva LTDA"
                    />
                    {errors.razao_social && (
                      <p className="text-[11px] text-destructive">{errors.razao_social}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Nome Fantasia *</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.nome_fantasia}
                      onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                      placeholder="Ex: Tecidos Silva"
                    />
                    {errors.nome_fantasia && (
                      <p className="text-[11px] text-destructive">{errors.nome_fantasia}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-semibold">
                        {tipoDoc === 'cnpj' ? 'CNPJ *' : 'CPF *'}
                      </Label>
                      <button
                        type="button"
                        onClick={() => setTipoDoc(tipoDoc === 'cnpj' ? 'cpf' : 'cnpj')}
                        className="text-[10px] text-primary hover:underline font-medium"
                      >
                        Alternar para {tipoDoc === 'cnpj' ? 'CPF (Pessoa Física)' : 'CNPJ (PJ)'}
                      </button>
                    </div>
                    {tipoDoc === 'cnpj' ? (
                      <Input
                        disabled={!canWrite}
                        inputMode="numeric"
                        value={form.cnpj}
                        onChange={(e) => setForm({ ...form, cnpj: formatCNPJ(e.target.value) })}
                        placeholder="00.000.000/0000-00"
                      />
                    ) : (
                      <Input
                        disabled={!canWrite}
                        inputMode="numeric"
                        value={form.cpf}
                        onChange={(e) => setForm({ ...form, cpf: formatCPF(e.target.value) })}
                        placeholder="000.000.000-00"
                      />
                    )}
                    {errors.cnpj && <p className="text-[11px] text-destructive">{errors.cnpj}</p>}
                    {errors.cpf && <p className="text-[11px] text-destructive">{errors.cpf}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Inscrição Estadual (IE)</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.inscricao_estadual}
                      onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value })}
                      placeholder="Isento ou número da IE"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Nome do Contato / Vendedor</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.contato_nome}
                      onChange={(e) => setForm({ ...form, contato_nome: e.target.value })}
                      placeholder="Ex: Carlos Oliveira"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">E-mail Comercial</Label>
                    <Input
                      disabled={!canWrite}
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="vendas@fornecedor.com.br"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Telefone / WhatsApp</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.telefone}
                      onChange={(e) => setForm({ ...form, telefone: formatPhone(e.target.value) })}
                      placeholder="(11) 98765-4321"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Prazo de Entrega (dias)</Label>
                    <Input
                      disabled={!canWrite}
                      type="number"
                      min="0"
                      value={form.prazo_entrega_dias}
                      onChange={(e) => setForm({ ...form, prazo_entrega_dias: e.target.value })}
                      placeholder="Ex: 5"
                    />
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Condição de Pagamento</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.condicao_pagamento}
                      onChange={(e) => setForm({ ...form, condicao_pagamento: e.target.value })}
                      placeholder="Ex: À vista, 30/60/90, 28 DDL"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold">Site / Portal B2B</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.site}
                      onChange={(e) => setForm({ ...form, site: e.target.value })}
                      placeholder="https://..."
                    />
                  </div>

                  {/* Endereço */}
                  <div className="space-y-1 sm:col-span-2 border-t border-border/80 pt-3">
                    <Label className="text-xs font-semibold">Endereço Completo</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.endereco}
                      onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                      placeholder="Rua, número, complemento, bairro"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">CEP</Label>
                      <Input
                        disabled={!canWrite}
                        value={form.cep}
                        onChange={(e) => setForm({ ...form, cep: e.target.value })}
                        placeholder="00000-000"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Cidade</Label>
                      <Input
                        disabled={!canWrite}
                        value={form.cidade}
                        onChange={(e) => setForm({ ...form, cidade: e.target.value })}
                        placeholder="São Paulo"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">UF</Label>
                      <Input
                        disabled={!canWrite}
                        maxLength={2}
                        value={form.uf}
                        onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                        placeholder="SP"
                      />
                    </div>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold">Observações Internas</Label>
                    <Textarea
                      disabled={!canWrite}
                      rows={2}
                      value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                      placeholder="Anotações comerciais, canais de contato de emergência, tabela de descontos..."
                    />
                  </div>
                </div>

                {errors.form && <p className="text-xs text-destructive">{errors.form}</p>}

                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                    Cancelar
                  </Button>
                  {canWrite && (
                    <Button disabled={saving} className="bg-primary text-white font-bold">
                      {saving ? (
                        <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Save className="mr-2 h-4 w-4" />
                      )}
                      Salvar Fornecedor
                    </Button>
                  )}
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="produtos" className="mt-0 space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Catálogo de Produtos Fornecidos
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Itens que este fornecedor vende à sua empresa (usados no auto-preenchimento da
                    precificação).
                  </p>
                </div>
                {canWrite && (
                  <Button
                    size="sm"
                    className="bg-primary text-white font-bold h-8"
                    onClick={handleNovoProduto}
                  >
                    <Plus className="mr-1 h-3.5 w-3.5" />
                    Adicionar Produto
                  </Button>
                )}
              </div>

              {loadingProdutos ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <LoaderCircle className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Carregando catálogo de produtos...
                </div>
              ) : produtos.length === 0 ? (
                <div className="py-10 text-center rounded-xl border border-dashed border-border p-6 bg-secondary/10">
                  <PackagePlus className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="font-semibold text-sm">Nenhum produto vinculado ainda</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Cadastre os produtos que este fornecedor fornece para que os dados (custo, peso,
                    dimensões e embalagem) sejam importados automaticamente na precificação de
                    revenda.
                  </p>
                  {canWrite && (
                    <Button
                      size="sm"
                      onClick={handleNovoProduto}
                      className="mt-3 bg-primary text-white"
                    >
                      Cadastrar Primeiro Produto
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                        <th className="py-2 px-3 font-bold">Produto / SKU Forn.</th>
                        <th className="py-2 px-2 font-bold">Marca / Cat.</th>
                        <th className="py-2 px-2 font-bold">Peso / Medidas</th>
                        <th className="py-2 px-2 font-bold text-right">Preço de Custo</th>
                        <th className="py-2 px-2 font-bold text-center">Status</th>
                        <th className="py-2 px-3 font-bold text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {produtos.map((p) => (
                        <tr key={p.id} className="hover:bg-secondary/20">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="h-10 w-10 rounded-lg border border-border bg-secondary/50 flex items-center justify-center overflow-hidden shrink-0">
                                {p.imagem ? (
                                  <img
                                    src={fornecedoresService.getProdutoImageUrl(p, '100x100')}
                                    alt={p.descricao}
                                    className="h-full w-full object-cover"
                                  />
                                ) : (
                                  <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <span className="font-bold text-foreground block truncate">
                                  {p.descricao}
                                </span>
                                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                  {p.sku_fornecedor && <span>SKU: {p.sku_fornecedor}</span>}
                                  {p.codigo_barras && (
                                    <span className="text-muted-foreground/80">
                                      • EAN: {p.codigo_barras}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground">
                            <span>{p.marca || '-'}</span>
                            {p.categoria && (
                              <span className="block text-[10px]">{p.categoria}</span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-muted-foreground font-mono text-[11px]">
                            {p.peso_g ? `${p.peso_g}g` : '-'}
                            {(p.comprimento_cm || p.largura_cm || p.altura_cm) && (
                              <span className="block text-[10px] text-muted-foreground/70">
                                {p.comprimento_cm || 0}x{p.largura_cm || 0}x{p.altura_cm || 0}cm
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-2 text-right font-mono font-bold text-foreground">
                            {formatCurrency(p.preco_custo_unitario)}
                            {p.preco_ultima_compra ? (
                              <span className="block text-[10px] font-normal text-muted-foreground">
                                Última: {formatCurrency(p.preco_ultima_compra)}
                              </span>
                            ) : null}
                          </td>
                          <td className="py-2.5 px-2 text-center">
                            <Badge
                              variant={p.ativo !== false ? 'secondary' : 'outline'}
                              className="text-[10px]"
                            >
                              {p.ativo !== false ? 'Ativo' : 'Inativo'}
                            </Badge>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canWrite && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => handleEditarProduto(p)}
                                >
                                  <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                                </Button>
                              )}
                              {canDelete && (
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => handleDeleteProduto(p.id)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      {/* MODAL SECUNDÁRIO: PRODUTO FORNECIDO (REVENDA) */}
      <Dialog open={produtoDialog} onOpenChange={setProdutoDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {(() => {
            const custoAquisicaoNum =
              parseFloat(prodForm.preco_custo_unitario.replace(',', '.')) || 0
            const previewCusto = calcularCustoBaseProduto({
              sku: prodForm.sku_fornecedor || 'REV-PREVIEW',
              nome: prodForm.descricao || 'Preview',
              tipo: 'revenda',
              custo_aquisicao_unitario: custoAquisicaoNum,
              peso_g: parseFloat(prodForm.peso_g) || 0,
              composicao: prodComposicao,
              custo_etiqueta: parseFloat(prodForm.custo_etiqueta) || 0,
              custo_adicional_embalagem: parseFloat(prodForm.custo_adicional_embalagem) || 0,
            })

            return (
              <form onSubmit={handleSaveProduto}>
                <DialogHeader>
                  <DialogTitle>
                    {editingProduto
                      ? 'Editar Produto do Fornecedor (Revenda)'
                      : 'Adicionar Produto do Fornecedor (Revenda)'}
                  </DialogTitle>
                  <DialogDescription>
                    Fornecedor: <strong className="text-foreground">{record?.nome_fantasia}</strong>
                    . Cadastre os dados físicos, preço de aquisição e monte a composição analítica
                    de insumos e embalagem.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-3 py-3 text-xs">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-semibold">
                        Imagem de Referência do Produto
                      </Label>
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
                            PNG, JPG, WEBP até 5MB. Usada como referência visual do item do
                            fornecedor.
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

                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-semibold">Descrição do Produto *</Label>
                      <Input
                        required
                        value={prodForm.descricao}
                        onChange={(e) => setProdForm({ ...prodForm, descricao: e.target.value })}
                        placeholder="Ex: Toalha de Banho Algodão Egípcio 70x140cm"
                      />
                      {prodErrors.descricao && (
                        <p className="text-[11px] text-destructive">{prodErrors.descricao}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">SKU / Código no Fornecedor</Label>
                      <Input
                        value={prodForm.sku_fornecedor}
                        onChange={(e) =>
                          setProdForm({ ...prodForm, sku_fornecedor: e.target.value })
                        }
                        placeholder="Ex: TB-ALG-70140"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Código de Barras (EAN / GTIN)</Label>
                      <Input
                        value={prodForm.codigo_barras}
                        onChange={(e) =>
                          setProdForm({ ...prodForm, codigo_barras: e.target.value })
                        }
                        placeholder="789..."
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Marca</Label>
                      <Input
                        value={prodForm.marca}
                        onChange={(e) => setProdForm({ ...prodForm, marca: e.target.value })}
                        placeholder="Ex: Teka, Karsten, Buddemeyer..."
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Categoria</Label>
                      <CategoriaAutocompleteInput
                        value={prodForm.categoria}
                        onChange={(cat) => setProdForm({ ...prodForm, categoria: cat })}
                        placeholder="Ex: Toalha de Banho, Pet..."
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">
                        Preço de Custo Unitário (R$) *
                      </Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        required
                        value={prodForm.preco_custo_unitario}
                        onChange={(e) =>
                          setProdForm({ ...prodForm, preco_custo_unitario: e.target.value })
                        }
                        placeholder="0.00"
                      />
                      {prodErrors.preco_custo_unitario && (
                        <p className="text-[11px] text-destructive">
                          {prodErrors.preco_custo_unitario}
                        </p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Preço da Última Compra (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={prodForm.preco_ultima_compra}
                        onChange={(e) =>
                          setProdForm({ ...prodForm, preco_ultima_compra: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Unidade de Medida</Label>
                      <Input
                        value={prodForm.unidade}
                        onChange={(e) => setProdForm({ ...prodForm, unidade: e.target.value })}
                        placeholder="un, cx, kg, par..."
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Tipo de Embalagem</Label>
                      <Input
                        value={prodForm.embalagem}
                        onChange={(e) => setProdForm({ ...prodForm, embalagem: e.target.value })}
                        placeholder="Caixa papelão, saco plástico..."
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Peso do Produto (gramas)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={prodForm.peso_g}
                        onChange={(e) => setProdForm({ ...prodForm, peso_g: e.target.value })}
                        placeholder="Ex: 350"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Compr. (cm)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={prodForm.comprimento_cm}
                          onChange={(e) =>
                            setProdForm({ ...prodForm, comprimento_cm: e.target.value })
                          }
                          placeholder="25"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Larg. (cm)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={prodForm.largura_cm}
                          onChange={(e) => setProdForm({ ...prodForm, largura_cm: e.target.value })}
                          placeholder="18"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Alt. (cm)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={prodForm.altura_cm}
                          onChange={(e) => setProdForm({ ...prodForm, altura_cm: e.target.value })}
                          placeholder="6"
                        />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">NCM Fiscal</Label>
                      <Input
                        value={prodForm.ncm}
                        onChange={(e) => setProdForm({ ...prodForm, ncm: e.target.value })}
                        placeholder="0000.00.00"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Moeda do Custo</Label>
                      <Input
                        value={prodForm.moeda}
                        onChange={(e) => setProdForm({ ...prodForm, moeda: e.target.value })}
                        placeholder="BRL"
                      />
                    </div>

                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-semibold">Observações do Produto</Label>
                      <Textarea
                        rows={2}
                        value={prodForm.observacoes}
                        onChange={(e) => setProdForm({ ...prodForm, observacoes: e.target.value })}
                        placeholder="Informações técnicas, lote mínimo, cores..."
                      />
                    </div>
                  </div>

                  {/* COMPOSIÇÃO ANALÍTICA DE INSUMOS/SERVIÇOS VINCULADOS À REVENDA */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-primary">
                          <Boxes className="h-3.5 w-3.5" />
                          <span>Composição de Custos / Insumos Adicionais</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Insumos, embalagens especiais ou serviços agregados a este produto de
                          revenda.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-[11px] font-semibold bg-white shrink-0"
                        onClick={() => {
                          const nextIdx = prodComposicao.length
                          setProdComposicao([
                            ...prodComposicao,
                            {
                              codigo: `C${nextIdx}`,
                              descricao: '',
                              qtd: 1,
                              custo_unitario: 0,
                              categoria_custo: 'insumo',
                            },
                          ])
                        }}
                      >
                        <Plus className="mr-1 h-3 w-3" />
                        Adicionar Insumo (C{prodComposicao.length})
                      </Button>
                    </div>

                    <div className="space-y-2">
                      {prodComposicao.length === 0 ? (
                        <div className="p-3 text-center rounded-lg border border-dashed border-primary/30 bg-white/70">
                          <p className="text-xs text-muted-foreground">
                            Nenhum insumo ou serviço adicional vinculado à revenda. Clique acima
                            caso este produto exija componentes ou serviços extras.
                          </p>
                        </div>
                      ) : (
                        prodComposicao.map((item, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg border border-border/80 bg-white space-y-1.5 shadow-2xs"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              {/* Código C0..C12 */}
                              <Input
                                className="w-16 h-8 text-xs font-mono font-bold bg-white"
                                placeholder="C0"
                                value={item.codigo || `C${idx}`}
                                onChange={(e) => {
                                  const arr = [...prodComposicao]
                                  arr[idx].codigo = e.target.value
                                  setProdComposicao(arr)
                                }}
                              />

                              {/* Seletor Rápido do Catálogo de Insumos (Isolado de fornecedores_produtos) */}
                              <div className="w-48 sm:w-56">
                                <select
                                  aria-label="Catálogo de Insumos"
                                  className="w-full h-8 px-2 text-xs rounded-md border border-input bg-secondary/30 focus:outline-hidden focus:ring-1 focus:ring-primary truncate"
                                  value={item.insumo_id || ''}
                                  onChange={(e) =>
                                    handleSelecionarInsumoNaLinha(idx, e.target.value)
                                  }
                                >
                                  <option value="">(Manual / Personalizado)</option>
                                  {insumosAtivos.map((ins) => {
                                    const dim = formatarDimensaoInsumo(ins)
                                    const dimStr = dim ? ` [${dim}]` : ''
                                    const catStr = ins.expand?.categoria?.nome
                                      ? ` (${ins.expand.categoria.nome})`
                                      : ''
                                    return (
                                      <option key={ins.id} value={ins.id}>
                                        {ins.nome}
                                        {dimStr}
                                        {catStr} - R$ {Number(ins.valor_unitario).toFixed(2)}
                                      </option>
                                    )
                                  })}
                                </select>
                              </div>

                              {/* Descrição do insumo/serviço */}
                              <Input
                                className="flex-1 min-w-[140px] h-8 text-xs bg-white"
                                placeholder="Descrição do insumo ou serviço..."
                                value={item.descricao}
                                onChange={(e) => {
                                  const arr = [...prodComposicao]
                                  arr[idx].descricao = e.target.value
                                  setProdComposicao(arr)
                                }}
                              />

                              {/* Qtd */}
                              <div className="w-20">
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="h-8 text-xs font-mono bg-white"
                                  placeholder="Qtd"
                                  value={item.qtd}
                                  onChange={(e) => {
                                    const arr = [...prodComposicao]
                                    arr[idx].qtd = parseFloat(e.target.value) || 0
                                    setProdComposicao(arr)
                                  }}
                                />
                              </div>

                              {/* Custo Unitário (R$) */}
                              <div className="w-24">
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="h-8 text-xs font-mono bg-white"
                                  placeholder="R$ Unit"
                                  value={item.custo_unitario}
                                  onChange={(e) => {
                                    const arr = [...prodComposicao]
                                    arr[idx].custo_unitario = parseFloat(e.target.value) || 0
                                    setProdComposicao(arr)
                                  }}
                                />
                              </div>

                              {/* Excluir linha */}
                              <Button
                                type="button"
                                size="icon"
                                variant="ghost"
                                className="h-8 w-8 text-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => {
                                  setProdComposicao(prodComposicao.filter((_, i) => i !== idx))
                                }}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>

                            {/* Tags de metadados do insumo vinculado */}
                            {(item.insumo_id ||
                              item.dimensao_formatada ||
                              item.fornecedor_nome) && (
                              <div className="flex flex-wrap items-center gap-1.5 pl-1 text-[11px] text-muted-foreground">
                                {item.insumo_tipo && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 capitalize"
                                  >
                                    {item.insumo_tipo}
                                  </Badge>
                                )}
                                {item.dimensao_formatada && (
                                  <span className="font-mono bg-secondary/60 px-1.5 py-0.5 rounded text-[10px] text-foreground">
                                    📏 {item.dimensao_formatada}
                                  </span>
                                )}
                                {item.categoria_nome && (
                                  <Badge variant="secondary" className="text-[10px] py-0 px-1.5">
                                    {item.categoria_nome}
                                  </Badge>
                                )}
                                {item.fornecedor_nome && (
                                  <span className="text-[10px] text-muted-foreground truncate max-w-[200px]">
                                    🏢 {item.fornecedor_nome}
                                  </span>
                                )}
                                <span className="font-mono text-[10px] font-semibold text-primary ml-auto">
                                  Subtotal:{' '}
                                  {formatCurrency(
                                    round2((item.qtd || 0) * (item.custo_unitario || 0)),
                                  )}
                                </span>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* CUSTOS INDIRETOS / GLOBAIS: EMBALAGEM ADICIONAL E ETIQUETA */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 border-t border-border pt-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Embalagem Adicional (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={prodForm.custo_adicional_embalagem}
                        onChange={(e) => {
                          setEmbalagemEditadaManualmente(true)
                          setProdForm({ ...prodForm, custo_adicional_embalagem: e.target.value })
                        }}
                        placeholder="0.00"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Etiqueta (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={prodForm.custo_etiqueta}
                        onChange={(e) =>
                          setProdForm({ ...prodForm, custo_etiqueta: e.target.value })
                        }
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  {/* CARD DE RESUMO DE CUSTO BASE CALCULADO EM TEMPO REAL */}
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                        Custo Base Calculado (Aquisição + Composição + Embalagem + Etiqueta)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Aquisição: {formatCurrency(custoAquisicaoNum)} • Composição:{' '}
                        {formatCurrency(
                          round2(
                            prodComposicao.reduce(
                              (acc, it) => acc + (it.qtd || 0) * (it.custo_unitario || 0),
                              0,
                            ),
                          ),
                        )}{' '}
                        • Embalagem: {formatCurrency(previewCusto.custo_embalagem)} • Etiqueta:{' '}
                        {formatCurrency(previewCusto.custo_etiqueta)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-base font-black font-mono text-primary block">
                        {formatCurrency(previewCusto.custo_total)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        Custo total unitário
                      </span>
                    </div>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setProdutoDialog(false)}>
                    Cancelar
                  </Button>
                  <Button disabled={savingProd} className="bg-primary text-white font-bold">
                    {savingProd ? (
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Salvar Produto
                  </Button>
                </DialogFooter>
              </form>
            )
          })()}
        </DialogContent>
      </Dialog>{' '}
    </>
  )
}
