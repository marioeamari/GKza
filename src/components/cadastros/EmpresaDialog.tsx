import React, { useCallback, useEffect, useState } from 'react'
import { Boxes, Eye, Layers, LoaderCircle, PackagePlus, Save } from 'lucide-react'
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
import { formatCNPJ, formatPhone, isValidCNPJ } from '@/lib/documents'
import { formatCurrency } from '@/lib/format'
import { cadastrosService } from '@/services/cadastros'
import { produtosBaseService, produtosCompostosService } from '@/services/produtos'
import { ProdutoCompostoDialog } from '@/components/produtos/ProdutoCompostoDialog'
import pb from '@/lib/pocketbase/client'
import type { Empresa, ProdutoBaseRecord, ProdutoCompostoRecord } from '@/types/domain'

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

export function EmpresaDialog({
  open,
  onOpenChange,
  record,
  onSaved,
  canWrite = true,
  defaultTab = 'dados',
}: EmpresaDialogProps) {
  const { toast } = useToast()
  const [form, setForm] = useState(initialEmpresa)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [tab, setTab] = useState<'dados' | 'produtos'>('dados')

  // Lista read-only de Produtos Compostos vinculados a esta empresa
  const [produtosVinculados, setProdutosVinculados] = useState<ProdutoCompostoRecord[]>([])
  const [todosProdutosBase, setTodosProdutosBase] = useState<ProdutoBaseRecord[]>([])
  const [todasEmpresas, setTodasEmpresas] = useState<Empresa[]>([])
  const [loadingProdutos, setLoadingProdutos] = useState(false)

  // Modal para visualização da composição do produto (read-only)
  const [produtoVisualizar, setProdutoVisualizar] = useState<ProdutoCompostoRecord | null>(null)
  const [modalVisualizarAberto, setModalVisualizarAberto] = useState(false)

  const carregarProdutosVinculados = useCallback(async (empresaId: string) => {
    try {
      setLoadingProdutos(true)
      const [compostos, bases, empresas] = await Promise.all([
        produtosCompostosService.list({ empresaId }),
        produtosBaseService.list().catch(() => [] as ProdutoBaseRecord[]),
        pb
          .collection('empresas')
          .getFullList<Empresa>({ sort: 'nome_fantasia' })
          .catch(() => [] as Empresa[]),
      ])
      setProdutosVinculados(compostos)
      setTodosProdutosBase(bases)
      setTodasEmpresas(empresas)
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
        carregarProdutosVinculados(record.id)
      } else {
        setForm(initialEmpresa)
        setProdutosVinculados([])
      }
      setErrors({})
    }
  }, [open, record, defaultTab, carregarProdutosVinculados])

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
        carregarProdutosVinculados(saved.id)
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

  function handleAbrirVisualizacao(prod: ProdutoCompostoRecord) {
    setProdutoVisualizar(prod)
    setModalVisualizarAberto(true)
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
              Ficha cadastral da empresa e lista dos produtos compostos vinculados (receita técnica
              centralizada na entidade Produto).
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
                Produtos Vinculados {record?.id && `(${produtosVinculados.length})`}
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

            <TabsContent value="produtos" className="mt-0 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-2 border-b border-border gap-2">
                <div>
                  <h4 className="text-sm font-bold text-foreground">
                    Produtos Compostos Vinculados (Somente Leitura)
                  </h4>
                  <p className="text-xs text-muted-foreground">
                    A receita técnica não é mais duplicada na empresa: ela reside na entidade
                    Produto e é compartilhada por vínculo de multi-relação.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button size="sm" variant="outline" asChild className="h-8 text-xs font-semibold">
                    <Link to="/composicao-produtos" target="_blank">
                      <Layers className="mr-1.5 h-3.5 w-3.5 text-primary" />
                      Editar em Composição de Produtos
                    </Link>
                  </Button>
                </div>
              </div>

              {loadingProdutos ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  <LoaderCircle className="h-6 w-6 animate-spin mx-auto mb-2 text-primary" />
                  Carregando produtos vinculados...
                </div>
              ) : produtosVinculados.length === 0 ? (
                <div className="py-10 text-center rounded-xl border border-dashed border-border p-6 bg-secondary/10">
                  <Boxes className="h-9 w-9 mx-auto text-muted-foreground/40 mb-2" />
                  <p className="font-semibold text-sm">
                    Nenhum produto composto vinculado a esta empresa
                  </p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                    Para vincular produtos a esta empresa, abra a tela de Composição de Produtos e
                    selecione esta empresa no campo “Empresas Vinculadas”.
                  </p>
                  <Button
                    size="sm"
                    variant="outline"
                    asChild
                    className="mt-4 text-[#DF5830] border-orange-200 hover:bg-orange-50"
                  >
                    <Link to="/composicao-produtos" target="_blank">
                      <PackagePlus className="mr-1 h-3.5 w-3.5" />
                      Ir para Composição de Produtos
                    </Link>
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-border">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                        <th className="py-2 px-3 font-bold">Produto / SKU</th>
                        <th className="py-2 px-2 font-bold">Classificação</th>
                        <th className="py-2 px-2 font-bold">Linhas da Composição</th>
                        <th className="py-2 px-2 font-bold text-right">Custo Total</th>
                        <th className="py-2 px-2 font-bold text-center">Status</th>
                        <th className="py-2 px-3 font-bold text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {produtosVinculados.map((p) => {
                        const qtdLinhas = p.composicao?.length || 0

                        return (
                          <tr
                            key={p.id}
                            onClick={() => handleAbrirVisualizacao(p)}
                            className="hover:bg-secondary/20 cursor-pointer transition-colors"
                          >
                            <td className="py-2.5 px-3">
                              <span className="font-bold text-foreground block truncate">
                                {p.nome}
                              </span>
                              {p.sku && (
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  SKU: {p.sku}
                                </span>
                              )}
                            </td>
                            <td className="py-2.5 px-2">
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${
                                  p.classificacao === 'revenda'
                                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                                    : 'bg-purple-50 text-purple-700 border-purple-200'
                                }`}
                              >
                                {p.classificacao === 'revenda' ? 'Revenda' : 'Fabricação Própria'}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-2 text-muted-foreground font-mono text-[11px]">
                              {qtdLinhas} {qtdLinhas === 1 ? 'linha' : 'linhas'} (
                              {formatCurrency(Number(p.custo_composicao) || 0)})
                            </td>
                            <td className="py-2.5 px-2 text-right font-mono font-bold text-primary">
                              {formatCurrency(Number(p.custo_total) || 0)}
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
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-primary gap-1"
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    handleAbrirVisualizacao(p)
                                  }}
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                  Visualizar
                                </Button>
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
