import React, { useCallback, useEffect, useRef, useState } from 'react'
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
import { Link } from 'react-router-dom'
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
import { formatCNPJ, formatPhone, isValidCNPJ, onlyDigits } from '@/lib/documents'
import { formatCurrency } from '@/lib/format'
import { cadastrosService } from '@/services/cadastros'
import { precificacaoService } from '@/services/precificacao'
import type { Empresa } from '@/types/domain'
import type { PrecProdutoRecord } from '@/types/precificacao'
import {
  calcularCustoBaseProduto,
  type ItemComposicaoCusto,
  round2,
} from '@/lib/precificacao/calculo'

interface EmpresaDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: Empresa | null
  onSaved: () => void
  canWrite?: boolean
  canDelete?: boolean
  defaultTab?: 'dados' | 'produtos'
}

const initialEmpresa = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  email: '',
  telefone: '',
  endereco: '',
  observacoes: '',
}

const initialProduto: {
  nome: string
  sku: string
  codigo_barras: string
  marca: string
  categoria: string
  unidade: string
  embalagem: string
  custo_aquisicao_unitario: string
  peso_g: string
  dimensao_comprimento_cm: string
  dimensao_largura_cm: string
  dimensao_altura_cm: string
  custo_adicional_embalagem: string
  custo_etiqueta: string
  perda_pct: string
  status: 'ativo' | 'inativo' | 'rascunho'
} = {
  nome: '',
  sku: '',
  codigo_barras: '',
  marca: '',
  categoria: '',
  unidade: 'un',
  embalagem: '',
  custo_aquisicao_unitario: '',
  peso_g: '',
  dimensao_comprimento_cm: '',
  dimensao_largura_cm: '',
  dimensao_altura_cm: '',
  custo_adicional_embalagem: '0.10',
  custo_etiqueta: '0.05',
  perda_pct: '10',
  status: 'ativo',
}

export function EmpresaDialog({
  open,
  onOpenChange,
  record,
  onSaved,
  canWrite = true,
  canDelete = false,
  defaultTab = 'dados',
}: EmpresaDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState(initialEmpresa)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'dados' | 'produtos'>('dados')

  // Produtos de fabricação própria vinculados à empresa
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [loadingProdutos, setLoadingProdutos] = useState(false)
  const [produtoDialog, setProdutoDialog] = useState(false)
  const [editingProduto, setEditingProduto] = useState<PrecProdutoRecord | null>(null)
  const [prodForm, setProdForm] = useState(initialProduto)
  const [prodComposicao, setProdComposicao] = useState<ItemComposicaoCusto[]>([])
  const [prodErrors, setProdErrors] = useState<Record<string, string>>({})
  const [savingProd, setSavingProd] = useState(false)
  const [imagemFile, setImagemFile] = useState<File | null>(null)
  const [imagemPreview, setImagemPreview] = useState<string | null>(null)
  const [removerImagem, setRemoverImagem] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const carregarProdutos = useCallback(async (empresaId: string) => {
    try {
      setLoadingProdutos(true)
      const data = await precificacaoService.listProdutosPorEmpresa(empresaId)
      setProdutos(data)
    } catch {
      // Ignora erro suave
    } finally {
      setLoadingProdutos(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      setTab(defaultTab || 'dados')
      if (record) {
        setForm({
          razao_social: record.razao_social || '',
          nome_fantasia: record.nome_fantasia || '',
          cnpj: record.cnpj ? formatCNPJ(record.cnpj) : '',
          email: record.email || '',
          telefone: record.telefone ? formatPhone(record.telefone) : '',
          endereco: record.endereco || '',
          observacoes: record.observacoes || '',
        })
        carregarProdutos(record.id)
      } else {
        setForm(initialEmpresa)
        setProdutos([])
      }
      setErrors({})
    }
  }, [open, record, defaultTab, carregarProdutos])

  async function handleSaveEmpresa(e: React.FormEvent) {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.razao_social.trim()) next.razao_social = 'Informe a razão social.'
    if (!form.nome_fantasia.trim()) next.nome_fantasia = 'Informe o nome fantasia.'
    if (!form.cnpj.trim()) {
      next.cnpj = 'Informe o CNPJ.'
    } else if (!isValidCNPJ(form.cnpj)) {
      next.cnpj = 'CNPJ inválido'
    }
    setErrors(next)

    if (Object.keys(next).length) {
      toast({
        variant: 'destructive',
        title: 'Verifique os dados',
        description:
          next.cnpj ||
          next.razao_social ||
          next.nome_fantasia ||
          'Preencha todos os campos obrigatórios corretamente.',
      })
      return
    }

    setSaving(true)
    try {
      const payload: Partial<Empresa> = {
        razao_social: form.razao_social.trim(),
        nome_fantasia: form.nome_fantasia.trim(),
        cnpj: formatCNPJ(form.cnpj),
        email: form.email.trim() || undefined,
        telefone: form.telefone ? formatPhone(form.telefone) : undefined,
        endereco: form.endereco.trim() || undefined,
        observacoes: form.observacoes.trim() || undefined,
      }

      const saved = await cadastrosService.saveEmpresa(payload, record?.id)
      toast({ title: record ? 'Empresa atualizada' : 'Empresa salva com sucesso' })
      onSaved()
      if (!record?.id) {
        onOpenChange(false)
      } else {
        carregarProdutos(saved.id)
      }
    } catch (error) {
      const rawMsg = error instanceof Error ? error.message : ''
      const isDuplicate =
        /unique/i.test(rawMsg) ||
        /already in use/i.test(rawMsg) ||
        /idx_empresas_cnpj/i.test(rawMsg) ||
        typeof (error as { response?: { data?: Record<string, unknown> } })?.response?.data
          ?.cnpj !== 'undefined'

      const fields = apiFieldErrors(error)
      if (fields.cnpj || isDuplicate) {
        fields.cnpj = 'Este CNPJ já está cadastrado'
      }

      const formError = isDuplicate ? 'Este CNPJ já está cadastrado' : apiMessage(error)
      setErrors({ ...fields, form: formError })
      toast({
        variant: 'destructive',
        title: 'Não foi possível salvar',
        description: formError,
      })
    } finally {
      setSaving(false)
    }
  }

  // Ações de Produtos de Fabricação Própria
  function handleNovoProduto() {
    if (!record?.id) {
      toast({
        variant: 'destructive',
        title: 'Salve a empresa primeiro',
        description: 'Cadastre a empresa antes de vincular produtos de fabricação própria.',
      })
      return
    }
    setEditingProduto(null)
    setProdForm(initialProduto)
    setProdComposicao([
      {
        codigo: 'C0',
        descricao: 'Matéria-prima principal',
        qtd: 1,
        custo_unitario: 10.0,
        categoria_custo: 'material',
      },
    ])
    setProdErrors({})
    setImagemFile(null)
    setImagemPreview(null)
    setRemoverImagem(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    setProdutoDialog(true)
  }

  function handleEditarProduto(p: PrecProdutoRecord) {
    setEditingProduto(p)
    setProdForm({
      nome: p.nome,
      sku: p.sku,
      codigo_barras: p.codigo_barras || '',
      marca: p.marca || '',
      categoria: p.categoria || '',
      unidade: p.unidade || 'un',
      embalagem: p.embalagem || '',
      custo_aquisicao_unitario:
        p.custo_aquisicao_unitario !== undefined && p.custo_aquisicao_unitario !== null
          ? String(p.custo_aquisicao_unitario)
          : '',
      peso_g: p.peso_g !== undefined && p.peso_g !== null ? String(p.peso_g) : '',
      dimensao_comprimento_cm:
        p.dimensao_comprimento_cm !== undefined && p.dimensao_comprimento_cm !== null
          ? String(p.dimensao_comprimento_cm)
          : '',
      dimensao_largura_cm:
        p.dimensao_largura_cm !== undefined && p.dimensao_largura_cm !== null
          ? String(p.dimensao_largura_cm)
          : '',
      dimensao_altura_cm:
        p.dimensao_altura_cm !== undefined && p.dimensao_altura_cm !== null
          ? String(p.dimensao_altura_cm)
          : '',
      custo_adicional_embalagem:
        p.custo_adicional_embalagem !== undefined && p.custo_adicional_embalagem !== null
          ? String(p.custo_adicional_embalagem)
          : '0.10',
      custo_etiqueta:
        p.custo_etiqueta !== undefined && p.custo_etiqueta !== null
          ? String(p.custo_etiqueta)
          : '0.05',
      perda_pct: p.perda_pct !== undefined && p.perda_pct !== null ? String(p.perda_pct) : '10',
      status: p.status || 'ativo',
    })
    setProdComposicao(
      p.composicao && p.composicao.length > 0
        ? p.composicao
        : [
            {
              codigo: 'C0',
              descricao: 'Matéria-prima principal',
              qtd: 1,
              custo_unitario: p.custo_aquisicao_unitario || 10.0,
              categoria_custo: 'material',
            },
          ],
    )
    setProdErrors({})
    setImagemFile(null)
    setRemoverImagem(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
    if (p.imagem) {
      setImagemPreview(precificacaoService.getProdutoImageUrl(p, '200x200'))
    } else {
      setImagemPreview(null)
    }
    setProdutoDialog(true)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast({
        variant: 'destructive',
        title: 'Arquivo inválido',
        description: 'Selecione um arquivo de imagem (PNG, JPG, WEBP, etc.).',
      })
      return
    }

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
    setImagemPreview(URL.createObjectURL(file))
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
    if (!prodForm.nome.trim()) {
      nextErrors.nome = 'Informe o nome do produto.'
    }
    if (!prodForm.sku.trim()) {
      nextErrors.sku = 'Informe o SKU único do produto.'
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
      const formData = new FormData()
      formData.append('empresa', record.id)
      formData.append('tipo', 'fabricacao_propria')
      formData.append('nome', prodForm.nome.trim())
      formData.append('sku', prodForm.sku.trim())
      formData.append('status', prodForm.status || 'ativo')
      formData.append('unidade', prodForm.unidade.trim() || 'un')

      if (prodForm.codigo_barras.trim()) {
        formData.append('codigo_barras', prodForm.codigo_barras.trim())
      }
      if (prodForm.marca.trim()) formData.append('marca', prodForm.marca.trim())
      if (prodForm.categoria.trim()) formData.append('categoria', prodForm.categoria.trim())
      if (prodForm.embalagem.trim()) formData.append('embalagem', prodForm.embalagem.trim())

      if (prodForm.custo_aquisicao_unitario) {
        formData.append(
          'custo_aquisicao_unitario',
          String(parseFloat(prodForm.custo_aquisicao_unitario.replace(',', '.')) || 0),
        )
      }
      if (prodForm.peso_g) {
        formData.append('peso_g', String(parseFloat(prodForm.peso_g.replace(',', '.')) || 0))
      }
      if (prodForm.dimensao_comprimento_cm) {
        formData.append(
          'dimensao_comprimento_cm',
          String(parseFloat(prodForm.dimensao_comprimento_cm.replace(',', '.')) || 0),
        )
      }
      if (prodForm.dimensao_largura_cm) {
        formData.append(
          'dimensao_largura_cm',
          String(parseFloat(prodForm.dimensao_largura_cm.replace(',', '.')) || 0),
        )
      }
      if (prodForm.dimensao_altura_cm) {
        formData.append(
          'dimensao_altura_cm',
          String(parseFloat(prodForm.dimensao_altura_cm.replace(',', '.')) || 0),
        )
      }
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
      if (prodForm.perda_pct) {
        formData.append('perda_pct', String(parseFloat(prodForm.perda_pct.replace(',', '.')) || 0))
      }

      // Salva composição analítica completa (C0..C12)
      formData.append(
        'composicao',
        JSON.stringify(
          prodComposicao.length > 0
            ? prodComposicao
            : [
                {
                  codigo: 'C0',
                  descricao: 'Matéria-prima principal',
                  qtd: 1,
                  custo_unitario:
                    parseFloat(prodForm.custo_aquisicao_unitario.replace(',', '.')) || 10,
                  categoria_custo: 'material',
                },
              ],
        ),
      )

      // Imagem
      if (imagemFile) {
        formData.append('imagem', imagemFile)
      } else if (removerImagem) {
        formData.append('imagem', '')
      }

      if (editingProduto?.id) {
        await precificacaoService.updateProduto(editingProduto.id, formData)
        toast({ title: 'Produto de fabricação própria atualizado' })
      } else {
        await precificacaoService.createProduto(formData)
        toast({ title: 'Produto de fabricação própria criado com sucesso' })
      }

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
    if (!confirm('Deseja realmente remover este produto de fabricação própria?')) return
    try {
      await precificacaoService.deleteProduto(id)
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
              {record ? `Empresa: ${record.nome_fantasia}` : 'Nova Empresa'}
            </DialogTitle>
            <DialogDescription>
              Ficha cadastral da empresa e catálogo de produtos de fabricação própria vinculados
              para precificação.
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
                Produtos Fabricados {record?.id && `(${produtos.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dados" className="mt-0">
              <form onSubmit={handleSaveEmpresa} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold">Razão Social *</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.razao_social}
                      onChange={(e) => setForm({ ...form, razao_social: e.target.value })}
                      placeholder="Ex: GKza Confecções e Comércio LTDA"
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
                      placeholder="Ex: GKza"
                    />
                    {errors.nome_fantasia && (
                      <p className="text-[11px] text-destructive">{errors.nome_fantasia}</p>
                    )}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">CNPJ *</Label>
                    <Input
                      disabled={!canWrite}
                      inputMode="numeric"
                      value={form.cnpj}
                      onChange={(e) => setForm({ ...form, cnpj: formatCNPJ(e.target.value) })}
                      placeholder="00.000.000/0000-00"
                    />
                    {errors.cnpj && <p className="text-[11px] text-destructive">{errors.cnpj}</p>}
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">E-mail</Label>
                    <Input
                      disabled={!canWrite}
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="contato@empresa.com.br"
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

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold">Endereço Completo</Label>
                    <Input
                      disabled={!canWrite}
                      value={form.endereco}
                      onChange={(e) => setForm({ ...form, endereco: e.target.value })}
                      placeholder="Rua, número, complemento, bairro, cidade, UF"
                    />
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-xs font-semibold">Observações Internas</Label>
                    <Textarea
                      disabled={!canWrite}
                      rows={2}
                      value={form.observacoes}
                      onChange={(e) => setForm({ ...form, observacoes: e.target.value })}
                      placeholder="Anotações internas, regime tributário, responsáveis..."
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
                      Salvar Empresa
                    </Button>
                  )}
                </DialogFooter>
              </form>
            </TabsContent>

            <TabsContent value="produtos" className="mt-0 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border gap-2">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Produtos de Fabricação Própria
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Itens fabricados por esta empresa no sistema com fichas de custos prontas para
                    precificação.
                  </p>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2">
                    {record?.id && (
                      <Button
                        size="sm"
                        variant="outline"
                        asChild
                        className="h-8 text-xs font-semibold"
                      >
                        <Link
                          to={`/precificacao/produtos?novo=1&empresa=${record.id}`}
                          target="_blank"
                        >
                          <PackagePlus className="mr-1 h-3.5 w-3.5 text-primary" />
                          Abrir na Precificação
                        </Link>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      className="bg-primary text-white font-bold h-8"
                      onClick={handleNovoProduto}
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      Novo Produto Próprio
                    </Button>
                  </div>
                )}
              </div>

              {loadingProdutos ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <LoaderCircle className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Carregando produtos de fabricação própria...
                </div>
              ) : produtos.length === 0 ? (
                <div className="py-10 text-center rounded-xl border border-dashed border-border p-6 bg-secondary/10">
                  <Boxes className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="font-semibold text-sm">Nenhum produto próprio cadastrado ainda</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Cadastre os produtos fabricados por esta empresa (ou abra o motor de
                    precificação completo) para definir ficha de custos e simular margens.
                  </p>
                  {canWrite && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button
                        size="sm"
                        onClick={handleNovoProduto}
                        className="bg-primary text-white"
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" />
                        Cadastrar Primeiro Produto
                      </Button>
                      {record?.id && (
                        <Button size="sm" variant="outline" asChild>
                          <Link
                            to={`/precificacao/produtos?novo=1&empresa=${record.id}`}
                            target="_blank"
                          >
                            Novo produto para Precificação
                          </Link>
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                        <th className="py-2 px-3 font-bold">Produto / SKU</th>
                        <th className="py-2 px-2 font-bold">Marca / Cat.</th>
                        <th className="py-2 px-2 font-bold">Peso / Medidas</th>
                        <th className="py-2 px-2 font-bold text-right">Custo Total</th>
                        <th className="py-2 px-2 font-bold text-center">Status</th>
                        <th className="py-2 px-3 font-bold text-right">Ações</th>
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

                        return (
                          <tr key={p.id} className="hover:bg-secondary/20">
                            <td className="py-2.5 px-3">
                              <div className="flex items-center gap-2.5">
                                <div className="h-10 w-10 rounded-lg border border-border bg-secondary/50 flex items-center justify-center overflow-hidden shrink-0">
                                  {p.imagem ? (
                                    <img
                                      src={precificacaoService.getProdutoImageUrl(p, '100x100')}
                                      alt={p.nome}
                                      className="h-full w-full object-cover"
                                    />
                                  ) : (
                                    <ImageIcon className="h-4 w-4 text-muted-foreground/50" />
                                  )}
                                </div>
                                <div className="min-w-0">
                                  <span className="font-bold text-foreground block truncate">
                                    {p.nome}
                                  </span>
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground font-mono">
                                    <span className="text-primary font-bold">SKU: {p.sku}</span>
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
                              {(p.dimensao_comprimento_cm ||
                                p.dimensao_largura_cm ||
                                p.dimensao_altura_cm) && (
                                <span className="block text-[10px] text-muted-foreground/70">
                                  {p.dimensao_comprimento_cm || 0}x{p.dimensao_largura_cm || 0}x
                                  {p.dimensao_altura_cm || 0}cm
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-foreground">
                              {formatCurrency(custoCalc.custo_total)}
                              {custoCalc.custo_direto !== custoCalc.custo_total && (
                                <span className="block text-[10px] font-normal text-muted-foreground">
                                  Direto: {formatCurrency(custoCalc.custo_direto)}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2 text-center">
                              <Badge
                                variant={p.status === 'ativo' ? 'secondary' : 'outline'}
                                className="text-[10px] capitalize"
                              >
                                {p.status || 'ativo'}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="flex items-center justify-end gap-1">
                                <Button
                                  asChild
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-primary"
                                  title="Comparar na Precificação"
                                >
                                  <Link to={`/precificacao/comparar?sku=${p.sku}`} target="_blank">
                                    <Boxes className="h-3.5 w-3.5" />
                                  </Link>
                                </Button>
                                {canWrite && (
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="h-7 w-7"
                                    onClick={() => handleEditarProduto(p)}
                                    title="Editar produto"
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
                                    title="Excluir produto"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
      {/* MODAL SECUNDÁRIO: PRODUTO DE FABRICAÇÃO PRÓPRIA */}
      <Dialog open={produtoDialog} onOpenChange={setProdutoDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {(() => {
            const previewCusto = calcularCustoBaseProduto({
              sku: prodForm.sku || 'PREVIEW',
              nome: prodForm.nome || 'Preview',
              tipo: 'fabricacao_propria',
              peso_g: parseFloat(prodForm.peso_g) || 0,
              composicao: prodComposicao,
              perda_pct: parseFloat(prodForm.perda_pct) || 0,
              custo_etiqueta: parseFloat(prodForm.custo_etiqueta) || 0,
              custo_adicional_embalagem: parseFloat(prodForm.custo_adicional_embalagem) || 0,
            })

            return (
              <form onSubmit={handleSaveProduto}>
                <DialogHeader>
                  <DialogTitle>
                    {editingProduto
                      ? 'Editar Produto de Fabricação Própria'
                      : 'Novo Produto de Fabricação Própria'}
                  </DialogTitle>
                  <DialogDescription>
                    Empresa fabricante:{' '}
                    <strong className="text-foreground">{record?.nome_fantasia}</strong>. Cadastre
                    os dados físicos e monte a estrutura de custo detalhada (C0..C12).
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-3 text-xs">
                  {/* Imagem */}
                  <div className="space-y-1">
                    <Label className="text-xs font-semibold">Imagem do Produto Fabricado</Label>
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
                          PNG, JPG, WEBP até 5MB. Foto oficial do item de fabricação própria.
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

                  {/* Identificação Geral */}
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-semibold">Nome do Produto *</Label>
                      <Input
                        required
                        value={prodForm.nome}
                        onChange={(e) => setProdForm({ ...prodForm, nome: e.target.value })}
                        placeholder="Ex: Toalha de Banho Algodão Egípcio 70x140cm"
                      />
                      {prodErrors.nome && (
                        <p className="text-[11px] text-destructive">{prodErrors.nome}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">SKU Único *</Label>
                      <Input
                        required
                        value={prodForm.sku}
                        onChange={(e) => setProdForm({ ...prodForm, sku: e.target.value })}
                        placeholder="Ex: TB-ALG-70140"
                      />
                      {prodErrors.sku && (
                        <p className="text-[11px] text-destructive">{prodErrors.sku}</p>
                      )}
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
                        placeholder="Ex: Marca própria..."
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

                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-semibold">Peso do Produto (gramas)</Label>
                      <Input
                        type="number"
                        min="0"
                        value={prodForm.peso_g}
                        onChange={(e) => setProdForm({ ...prodForm, peso_g: e.target.value })}
                        placeholder="Ex: 350"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Compr. (cm)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={prodForm.dimensao_comprimento_cm}
                          onChange={(e) =>
                            setProdForm({
                              ...prodForm,
                              dimensao_comprimento_cm: e.target.value,
                            })
                          }
                          placeholder="25"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Larg. (cm)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={prodForm.dimensao_largura_cm}
                          onChange={(e) =>
                            setProdForm({ ...prodForm, dimensao_largura_cm: e.target.value })
                          }
                          placeholder="18"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label className="text-xs font-semibold">Alt. (cm)</Label>
                        <Input
                          type="number"
                          min="0"
                          value={prodForm.dimensao_altura_cm}
                          onChange={(e) =>
                            setProdForm({ ...prodForm, dimensao_altura_cm: e.target.value })
                          }
                          placeholder="6"
                        />
                      </div>
                    </div>
                  </div>

                  {/* COMPOSIÇÃO ANALÍTICA DO PRODUTO (C0..C12) */}
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3.5 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider text-primary">
                          <Boxes className="h-3.5 w-3.5" />
                          <span>Composição de Custos Analítica (C0..C12)</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Estrutura de custo detalhada por matéria-prima, insumos e serviços fabris.
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
                              categoria_custo: 'material',
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
                            Nenhum insumo adicionado. Clique acima para adicionar linhas C0, C1...
                          </p>
                        </div>
                      ) : (
                        prodComposicao.map((item, idx) => (
                          <div key={idx} className="flex items-center gap-2">
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
                            <Input
                              className="flex-1 h-8 text-xs bg-white"
                              placeholder="Descrição do insumo ou serviço..."
                              value={item.descricao}
                              onChange={(e) => {
                                const arr = [...prodComposicao]
                                arr[idx].descricao = e.target.value
                                setProdComposicao(arr)
                              }}
                            />
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
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-8 w-8 text-destructive hover:bg-destructive/10"
                              onClick={() => {
                                setProdComposicao(prodComposicao.filter((_, i) => i !== idx))
                              }}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {/* CUSTOS INDIRETOS / GLOBAIS: EMBALAGEM, ETIQUETA, PERDA */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Embalagem Adicional (R$)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={prodForm.custo_adicional_embalagem}
                        onChange={(e) =>
                          setProdForm({ ...prodForm, custo_adicional_embalagem: e.target.value })
                        }
                        placeholder="0.10"
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
                        placeholder="0.05"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">Perda Estimada (%)</Label>
                      <Input
                        type="number"
                        step="0.5"
                        min="0"
                        value={prodForm.perda_pct}
                        onChange={(e) => setProdForm({ ...prodForm, perda_pct: e.target.value })}
                        placeholder="10"
                      />
                    </div>
                  </div>

                  {/* CARD DE RESUMO DE CUSTO BASE CALCULADO */}
                  <div className="rounded-xl border border-border bg-secondary/30 p-3 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase block">
                        Custo Base Calculado (Direto + Embalagem + Etiqueta + Perda)
                      </span>
                      <span className="text-xs text-muted-foreground">
                        Direto: {formatCurrency(previewCusto.custo_direto)} • Embalagem:{' '}
                        {formatCurrency(previewCusto.custo_embalagem)} • Etiqueta:{' '}
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

                <DialogFooter className="pt-2">
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
