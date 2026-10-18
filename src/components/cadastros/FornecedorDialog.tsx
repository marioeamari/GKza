import { useEffect, useState } from 'react'
import { Boxes, Eye, Layers, LoaderCircle, Package, Plus, Save, Truck } from 'lucide-react'
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
import { produtosBaseService, produtosCompostosService } from '@/services/produtos'
import {
  FORNECEDOR_TIPOS_LISTA,
  FORNECEDOR_TIPO_CONFIG,
  normalizarTiposFornecedor,
  filtrarProdutosCompostosPorFornecedor,
} from '@/lib/classificacao-fornecedores'
import { ProdutoCompostoDialog } from '@/components/produtos/ProdutoCompostoDialog'
import pb from '@/lib/pocketbase/client'
import type {
  Empresa,
  Fornecedor,
  FornecedorTipo,
  ProdutoBaseRecord,
  ProdutoCompostoRecord,
} from '@/types/domain'

interface FornecedorDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  record: Fornecedor | null
  onSaved: () => void
  canWrite: boolean
  canDelete?: boolean
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

export function FornecedorDialog({
  open,
  onOpenChange,
  record,
  onSaved,
  canWrite,
  defaultTab = 'dados',
}: FornecedorDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState(initialFornecedor)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'dados' | 'produtos'>('dados')

  // Listas read-only conforme especificação da reestruturação:
  // (a) Produtos Base vinculados a esse fornecedor
  // (b) Produtos Compostos que contenham algum produto_base de origem dele
  const [produtosBaseFornecedor, setProdutosBaseFornecedor] = useState<ProdutoBaseRecord[]>([])
  const [produtosCompostosComOrigem, setProdutosCompostosComOrigem] = useState<
    ProdutoCompostoRecord[]
  >([])
  const [todosProdutosBase, setTodosProdutosBase] = useState<ProdutoBaseRecord[]>([])
  const [todasEmpresas, setTodasEmpresas] = useState<Empresa[]>([])
  const [loadingListas, setLoadingListas] = useState(false)

  // Modal de visualização de Produto Composto (modo leitura)
  const [produtoVisualizar, setProdutoVisualizar] = useState<ProdutoCompostoRecord | null>(null)
  const [modalVisualizarAberto, setModalVisualizarAberto] = useState(false)

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
      const [bases, compostos, allBases, empresas] = await Promise.all([
        produtosBaseService.list({ fornecedorId }),
        produtosCompostosService.list(),
        produtosBaseService.list().catch(() => [] as ProdutoBaseRecord[]),
        pb
          .collection('empresas')
          .getFullList<Empresa>({ sort: 'nome_fantasia' })
          .catch(() => [] as Empresa[]),
      ])

      setProdutosBaseFornecedor(bases)
      setTodosProdutosBase(allBases)
      setTodasEmpresas(empresas)

      const filtrados = filtrarProdutosCompostosPorFornecedor({
        compostos,
        fornecedorId,
        produtosBaseIdsDoFornecedor: bases.map((b) => b.id),
      })

      setProdutosCompostosComOrigem(filtrados)
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

  function handleAbrirVisualizacaoProduto(composto: ProdutoCompostoRecord) {
    setProdutoVisualizar(composto)
    setModalVisualizarAberto(true)
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
              Ficha de cadastro e classificação do fornecedor. As composições e produtos base são
              gerenciadas centralmente em Composição de Produtos.
            </DialogDescription>
          </DialogHeader>

          <Tabs
            value={tab}
            onValueChange={(v) => setTab(v as 'dados' | 'produtos')}
            className="w-full"
          >
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="dados">Dados Cadastrais & Tipos</TabsTrigger>
              <TabsTrigger value="produtos" disabled={!record?.id}>
                Produtos & Compostos Vinculados{' '}
                {record?.id &&
                  `(${produtosBaseFornecedor.length + produtosCompostosComOrigem.length})`}
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

            <TabsContent value="produtos" className="mt-0 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-border gap-2">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Itens e Produtos Relacionados (Somente Leitura)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    Listas automáticas: catálogo base deste fornecedor e produtos compostos que
                    utilizam seus insumos/revenda.
                  </p>
                </div>
                <Button size="sm" variant="outline" asChild className="h-8 text-xs font-semibold">
                  <Link to="/composicao-produtos" target="_blank">
                    <Layers className="mr-1.5 h-3.5 w-3.5 text-primary" />
                    Ir para Composição de Produtos
                  </Link>
                </Button>
              </div>

              {loadingListas ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <LoaderCircle className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Carregando produtos vinculados...
                </div>
              ) : (
                <div className="space-y-6">
                  {/* LISTA (a): Produtos Base deste Fornecedor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Package className="h-4 w-4 text-blue-600" />
                        <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          (a) Produtos Base deste Fornecedor ({produtosBaseFornecedor.length})
                        </h5>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Catálogo único: revenda, insumos e serviços
                      </span>
                    </div>

                    {produtosBaseFornecedor.length === 0 ? (
                      <div className="p-4 text-center rounded-lg border border-dashed border-border bg-secondary/10">
                        <p className="text-xs text-muted-foreground">
                          Nenhum produto base cadastrado para este fornecedor. Crie em{' '}
                          <Link
                            to="/composicao-produtos"
                            target="_blank"
                            className="font-semibold text-primary underline"
                          >
                            Composição de Produtos &gt; Produtos Base
                          </Link>
                          .
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                              <th className="py-2 px-3 font-bold">Item / SKU</th>
                              <th className="py-2 px-2 font-bold">Tipo</th>
                              <th className="py-2 px-2 font-bold text-right">Custo Unitário</th>
                              <th className="py-2 px-2 font-bold text-center">Unidade</th>
                              <th className="py-2 px-2 font-bold text-center">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {produtosBaseFornecedor.map((b) => (
                              <tr key={b.id} className="hover:bg-secondary/15">
                                <td className="py-2 px-3">
                                  <span className="font-semibold text-foreground block truncate">
                                    {b.nome}
                                  </span>
                                  {b.sku && (
                                    <span className="text-[10px] text-muted-foreground font-mono">
                                      SKU: {b.sku}
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 px-2">
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] px-1.5 py-0 capitalize"
                                  >
                                    {b.tipo}
                                  </Badge>
                                </td>
                                <td className="py-2 px-2 text-right font-mono font-bold text-foreground">
                                  {formatCurrency(Number(b.custo_unitario) || 0)}
                                </td>
                                <td className="py-2 px-2 text-center text-muted-foreground">
                                  {b.unidade || 'un'}
                                </td>
                                <td className="py-2 px-2 text-center">
                                  <Badge
                                    variant={b.ativo !== false ? 'secondary' : 'outline'}
                                    className="text-[10px]"
                                  >
                                    {b.ativo !== false ? 'Ativo' : 'Inativo'}
                                  </Badge>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* LISTA (b): Produtos Compostos que utilizam origem deste Fornecedor */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <Boxes className="h-4 w-4 text-orange-600" />
                        <h5 className="text-xs font-bold uppercase tracking-wider text-foreground">
                          (b) Produtos Compostos que Utilizam Itens Deste Fornecedor (
                          {produtosCompostosComOrigem.length})
                        </h5>
                      </div>
                      <span className="text-[11px] text-muted-foreground">
                        Clique na linha para visualizar a composição (leitura)
                      </span>
                    </div>

                    {produtosCompostosComOrigem.length === 0 ? (
                      <div className="p-4 text-center rounded-lg border border-dashed border-border bg-secondary/10">
                        <p className="text-xs text-muted-foreground">
                          Nenhum produto composto está utilizando produtos base deste fornecedor
                          atualmente.
                        </p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border border-border">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                              <th className="py-2 px-3 font-bold">Produto Composto</th>
                              <th className="py-2 px-2 font-bold">Classificação</th>
                              <th className="py-2 px-2 font-bold">Empresas Vinculadas</th>
                              <th className="py-2 px-2 font-bold text-right">Custo Total</th>
                              <th className="py-2 px-3 font-bold text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border/60">
                            {produtosCompostosComOrigem.map((c) => {
                              const empresasNomes = (c.empresas || [])
                                .map((empId) => {
                                  const emp = todasEmpresas.find((e) => e.id === empId)
                                  return emp?.nome_fantasia || emp?.razao_social || empId
                                })
                                .join(', ')

                              return (
                                <tr
                                  key={c.id}
                                  onClick={() => handleAbrirVisualizacaoProduto(c)}
                                  className="hover:bg-primary/5 cursor-pointer transition-colors"
                                >
                                  <td className="py-2.5 px-3">
                                    <span className="font-bold text-foreground block truncate">
                                      {c.nome}
                                    </span>
                                    {c.sku && (
                                      <span className="text-[10px] text-muted-foreground font-mono">
                                        SKU: {c.sku}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-2">
                                    <Badge
                                      variant="outline"
                                      className={`text-[10px] px-1.5 py-0 ${
                                        c.classificacao === 'revenda'
                                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                                          : 'bg-purple-50 text-purple-700 border-purple-200'
                                      }`}
                                    >
                                      {c.classificacao === 'revenda'
                                        ? 'Revenda'
                                        : 'Fabricação Própria'}
                                    </Badge>
                                  </td>
                                  <td className="py-2.5 px-2 text-muted-foreground max-w-[200px] truncate">
                                    {empresasNomes || '—'}
                                  </td>
                                  <td className="py-2.5 px-2 text-right font-mono font-bold text-primary">
                                    {formatCurrency(Number(c.custo_total) || 0)}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 text-xs text-primary gap-1"
                                      onClick={(e) => {
                                        e.stopPropagation()
                                        handleAbrirVisualizacaoProduto(c)
                                      }}
                                    >
                                      <Eye className="h-3.5 w-3.5" />
                                      Visualizar
                                    </Button>
                                  </td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* MODAL DE VISUALIZAÇÃO EM MODO LEITURA DO PRODUTO COMPOSTO */}
      <ProdutoCompostoDialog
        open={modalVisualizarAberto}
        onOpenChange={setModalVisualizarAberto}
        record={produtoVisualizar}
        produtosBase={todosProdutosBase}
        empresas={todasEmpresas}
        readOnly={true}
        onSuccess={() => {}}
      />
    </>
  )
}
