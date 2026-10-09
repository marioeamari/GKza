import { useEffect, useRef, useState } from 'react'
import {
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
import { fornecedoresService } from '@/services/fornecedores'
import type { Fornecedor, FornecedorProduto } from '@/types/domain'

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

  // Produtos fornecidos vinculados
  const [produtos, setProdutos] = useState<FornecedorProduto[]>([])
  const [loadingProdutos, setLoadingProdutos] = useState(false)
  const [produtoDialog, setProdutoDialog] = useState(false)
  const [editingProduto, setEditingProduto] = useState<FornecedorProduto | null>(null)
  const [prodForm, setProdForm] = useState(initialProduto)
  const [prodErrors, setProdErrors] = useState<Record<string, string>>({})
  const [savingProd, setSavingProd] = useState(false)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        })
        setTipoDoc(record.cpf && !record.cnpj ? 'cpf' : 'cnpj')
        carregarProdutos(record.id)
      } else {
        setForm(initialFornecedor)
        setTipoDoc('cnpj')
        setProdutos([])
      }
      setErrors({})
    }
  }, [open, record, defaultTab])

  async function carregarProdutos(fornecedorId: string) {
    try {
      setLoadingProdutos(true)
      const data = await fornecedoresService.listProdutosPorFornecedor(fornecedorId)
      setProdutos(data)
    } catch {
      // Ignora erro ao listar produtos
    } finally {
      setLoadingProdutos(false)
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
      }

      const saved = await fornecedoresService.saveFornecedor(payload, record?.id)
      toast({
        title: record ? 'Fornecedor atualizado' : 'Fornecedor cadastrado com sucesso',
      })
      onSaved()
      if (!record?.id) {
        // Se era novo cadastro, fecha o modal
        onOpenChange(false)
      } else {
        // Se era edição, recarrega produtos
        carregarProdutos(saved.id)
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
    setProdErrors({})
    setImagemFile(null)
    setImagemPreview(null)
    setRemoverImagem(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setProdutoDialog(true)
  }

  function handleEditarProduto(p: FornecedorProduto) {
    setEditingProduto(p)
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
      ativo: p.ativo !== false,
    })
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

      {/* MODAL SECUNDÁRIO: PRODUTO FORNECIDO */}
      <Dialog open={produtoDialog} onOpenChange={setProdutoDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <form onSubmit={handleSaveProduto}>
            <DialogHeader>
              <DialogTitle>
                {editingProduto
                  ? 'Editar Produto do Fornecedor'
                  : 'Adicionar Produto do Fornecedor'}
              </DialogTitle>
              <DialogDescription>
                Informe os dados do produto, preço de custo, peso e dimensões para alimentar o motor
                de precificação.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-3 text-xs">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 sm:col-span-2">
                  <Label className="text-xs font-semibold">Imagem de Referência do Produto</Label>
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
                        PNG, JPG, WEBP até 5MB. Usada como referência visual do item do fornecedor.
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
                    onChange={(e) => setProdForm({ ...prodForm, sku_fornecedor: e.target.value })}
                    placeholder="Ex: TB-ALG-70140"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Código de Barras (EAN / GTIN)</Label>
                  <Input
                    value={prodForm.codigo_barras}
                    onChange={(e) => setProdForm({ ...prodForm, codigo_barras: e.target.value })}
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
                  <Input
                    value={prodForm.categoria}
                    onChange={(e) => setProdForm({ ...prodForm, categoria: e.target.value })}
                    placeholder="Ex: Cama, Mesa e Banho"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Preço de Custo Unitário (R$) *</Label>
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
                      onChange={(e) => setProdForm({ ...prodForm, comprimento_cm: e.target.value })}
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
        </DialogContent>
      </Dialog>
    </>
  )
}
