import React, { useState, useEffect } from 'react'
import {
  Package,
  Layers,
  Plus,
  Search,
  Filter,
  Building2,
  Trash2,
  Edit,
  Sparkles,
  ArrowRight,
  TrendingUp,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import type { ProdutoCompostoRecord, ProdutoBaseRecord, Fornecedor, Empresa } from '@/types/domain'
import { produtosCompostosService, produtosBaseService } from '@/services/produtos'
import { fornecedoresService } from '@/services/fornecedores'
import { formatCurrency } from '@/lib/format'
import pb from '@/lib/pocketbase/client'
import { ProdutoCompostoDialog } from '@/components/produtos/ProdutoCompostoDialog'
import { ProdutoBaseDialog } from '@/components/produtos/ProdutoBaseDialog'

export default function ComposicaoProdutosPage() {
  const { toast } = useToast()
  const [abaAtiva, setAbaAtiva] = useState<'compostos' | 'base'>('compostos')
  const [loading, setLoading] = useState(true)

  // Dados carregados
  const [produtosCompostos, setProdutosCompostos] = useState<ProdutoCompostoRecord[]>([])
  const [produtosBase, setProdutosBase] = useState<ProdutoBaseRecord[]>([])
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  // Filtros
  const [busca, setBusca] = useState('')
  const [filtroClassificacao, setFiltroClassificacao] = useState<string>('todos')
  const [filtroTipoBase, setFiltroTipoBase] = useState<string>('todos')
  const [filtroEmpresa, setFiltroEmpresa] = useState<string>('todas')

  // Modais
  const [modalCompostoAberto, setModalCompostoAberto] = useState(false)
  const [compostoEditando, setCompostoEditando] = useState<ProdutoCompostoRecord | null>(null)

  const [modalBaseAberto, setModalBaseAberto] = useState(false)
  const [baseEditando, setBaseEditando] = useState<ProdutoBaseRecord | null>(null)

  const carregarDados = async () => {
    try {
      setLoading(true)
      const [listComp, listBase, listForn, listEmp] = await Promise.all([
        produtosCompostosService.list(),
        produtosBaseService.list(),
        fornecedoresService.list(),
        pb.collection('empresas').getFullList<Empresa>({ sort: 'nome_fantasia' }),
      ])

      setProdutosCompostos(listComp)
      setProdutosBase(listBase)
      setFornecedores(listForn)
      setEmpresas(listEmp)
    } catch (err: any) {
      console.error(err)
      toast({
        title: 'Erro ao carregar catálogo',
        description: err.message || 'Falha ao sincronizar dados.',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregarDados()
  }, [])

  // Filtros de Compostos
  const compostosFiltrados = produtosCompostos.filter((p) => {
    if (filtroClassificacao !== 'todos' && p.classificacao !== filtroClassificacao) return false
    if (filtroEmpresa !== 'todas') {
      if (!p.empresas || !p.empresas.includes(filtroEmpresa)) return false
    }
    if (busca.trim()) {
      const q = busca.toLowerCase()
      const matchNome = (p.nome || '').toLowerCase().includes(q)
      const matchSku = (p.sku || '').toLowerCase().includes(q)
      if (!matchNome && !matchSku) return false
    }
    return true
  })

  // Filtros de Produtos Base
  const basesFiltradas = produtosBase.filter((b) => {
    if (filtroTipoBase !== 'todos' && b.tipo !== filtroTipoBase) return false
    if (busca.trim()) {
      const q = busca.toLowerCase()
      const matchNome = (b.nome || '').toLowerCase().includes(q)
      const matchSku = (b.sku || '').toLowerCase().includes(q)
      const matchForn = (b.expand?.fornecedor?.nome_fantasia || '').toLowerCase().includes(q)
      if (!matchNome && !matchSku && !matchForn) return false
    }
    return true
  })

  const handleExcluirComposto = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!confirm('Deseja realmente excluir este Produto Composto?')) return
    try {
      await produtosCompostosService.delete(id)
      toast({ title: 'Produto excluído com sucesso.' })
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir produto',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  const handleExcluirBase = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (
      !confirm(
        'Deseja excluir este Produto Base? Itens compostos que o utilizam podem ser afetados.',
      )
    )
      return
    try {
      await produtosBaseService.delete(id)
      toast({ title: 'Produto Base excluído com sucesso.' })
      carregarDados()
    } catch (err: any) {
      toast({
        title: 'Erro ao excluir produto base',
        description: err.message,
        variant: 'destructive',
      })
    }
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6">
      {/* Header com identidade visual vigente */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2.5 rounded-xl bg-orange-100/70 text-[#DF5830] shadow-sm">
              <Layers className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">
                Composição de Produtos
              </h1>
              <p className="text-sm text-neutral-500">
                Catálogo comercial consolidado, formação de custo e espelho para o motor de
                precificação.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {abaAtiva === 'compostos' ? (
            <Button
              onClick={() => {
                setCompostoEditando(null)
                setModalCompostoAberto(true)
              }}
              className="bg-[#DF5830] hover:bg-[#c94d28] text-white shadow-sm gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Novo Produto Composto
            </Button>
          ) : (
            <Button
              onClick={() => {
                setBaseEditando(null)
                setModalBaseAberto(true)
              }}
              className="bg-[#DF5830] hover:bg-[#c94d28] text-white shadow-sm gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Novo Produto Base
            </Button>
          )}
        </div>
      </div>

      {/* Navegação entre Abas */}
      <Tabs
        value={abaAtiva}
        onValueChange={(v) => {
          setAbaAtiva(v as 'compostos' | 'base')
          setBusca('')
        }}
        className="w-full space-y-4"
      >
        <div className="flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
          <TabsList className="bg-neutral-100 p-1 border">
            <TabsTrigger
              value="compostos"
              className="gap-2 data-[state=active]:bg-white data-[state=active]:text-[#DF5830] data-[state=active]:shadow-sm font-medium"
            >
              <Layers className="h-4 w-4" />
              Produtos Compostos ({produtosCompostos.length})
            </TabsTrigger>
            <TabsTrigger
              value="base"
              className="gap-2 data-[state=active]:bg-white data-[state=active]:text-[#DF5830] data-[state=active]:shadow-sm font-medium"
            >
              <Package className="h-4 w-4" />
              Produtos Base ({produtosBase.length})
            </TabsTrigger>
          </TabsList>

          {/* Barra de Busca e Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-neutral-400" />
              <Input
                placeholder={
                  abaAtiva === 'compostos' ? 'Buscar produto...' : 'Buscar base ou fornecedor...'
                }
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                className="pl-8 text-xs bg-white"
              />
            </div>

            {abaAtiva === 'compostos' && (
              <>
                <Select value={filtroClassificacao} onValueChange={setFiltroClassificacao}>
                  <SelectTrigger className="w-36 h-9 text-xs bg-white">
                    <SelectValue placeholder="Classificação" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todos">Todas Classif.</SelectItem>
                    <SelectItem value="revenda">Revenda</SelectItem>
                    <SelectItem value="fabricacao_propria">Fabricação Própria</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={filtroEmpresa} onValueChange={setFiltroEmpresa}>
                  <SelectTrigger className="w-36 h-9 text-xs bg-white">
                    <SelectValue placeholder="Empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas Empresas</SelectItem>
                    {empresas.map((e) => (
                      <SelectItem key={e.id} value={e.id}>
                        {e.nome_fantasia || e.razao_social}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {abaAtiva === 'base' && (
              <Select value={filtroTipoBase} onValueChange={setFiltroTipoBase}>
                <SelectTrigger className="w-40 h-9 text-xs bg-white">
                  <SelectValue placeholder="Tipo de Base" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos os Tipos</SelectItem>
                  <SelectItem value="revenda">Revenda</SelectItem>
                  <SelectItem value="insumo">Insumo</SelectItem>
                  <SelectItem value="embalagem">Embalagem</SelectItem>
                  <SelectItem value="etiqueta">Etiqueta</SelectItem>
                  <SelectItem value="servico">Serviço</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* ABA: PRODUTOS COMPOSTOS */}
        <TabsContent value="compostos" className="m-0 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-neutral-400">
              Carregando catálogo de produtos...
            </div>
          ) : compostosFiltrados.length === 0 ? (
            <Card className="border-dashed p-8 text-center bg-white">
              <Layers className="h-10 w-10 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-600">
                Nenhum produto composto encontrado.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Cadastre um novo produto composto para compor os custos e alimentar a precificação.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setCompostoEditando(null)
                  setModalCompostoAberto(true)
                }}
                className="mt-4 gap-1.5 text-[#DF5830] border-orange-200 hover:bg-orange-50"
              >
                <Plus className="h-4 w-4" />
                Criar Primeiro Produto
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {compostosFiltrados.map((prod) => {
                const totalComp = prod.composicao?.length || 0
                return (
                  <Card
                    key={prod.id}
                    className="overflow-hidden border border-neutral-200/80 bg-white hover:border-orange-200 transition-all hover:shadow-sm flex flex-col justify-between"
                  >
                    <CardHeader className="p-4 pb-2 border-b bg-neutral-50/40">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <Badge
                              variant="outline"
                              className={`text-[10px] font-semibold uppercase px-1.5 py-0 ${
                                prod.classificacao === 'revenda'
                                  ? 'bg-blue-50 text-blue-700 border-blue-200'
                                  : 'bg-purple-50 text-purple-700 border-purple-200'
                              }`}
                            >
                              {prod.classificacao === 'revenda' ? 'Revenda' : 'Fabricação Própria'}
                            </Badge>
                            {prod.status && (
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${
                                  prod.status === 'ativo'
                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                    : 'bg-neutral-100 text-neutral-600'
                                }`}
                              >
                                {prod.status}
                              </Badge>
                            )}
                          </div>
                          <CardTitle className="text-sm font-semibold text-neutral-900 leading-tight line-clamp-1">
                            {prod.nome}
                          </CardTitle>
                          {prod.sku && (
                            <span className="text-[11px] text-muted-foreground font-mono">
                              SKU: {prod.sku}
                            </span>
                          )}
                        </div>

                        <div className="text-right">
                          <span className="text-[10px] text-muted-foreground block">
                            Custo Total
                          </span>
                          <span className="text-base font-bold text-[#DF5830]">
                            {formatCurrency(Number(prod.custo_total) || 0)}
                          </span>
                        </div>
                      </div>
                    </CardHeader>

                    <CardContent className="p-4 space-y-3 flex-1 flex flex-col justify-between">
                      <div className="space-y-2 text-xs">
                        {/* Base de Origem (quando revenda) */}
                        {prod.classificacao === 'revenda' && (
                          <div className="p-2 rounded bg-neutral-50 border border-neutral-100">
                            <div className="flex justify-between items-center">
                              <span className="text-[11px] text-neutral-600 font-medium">
                                Base de Origem:
                              </span>
                              <span className="font-semibold text-neutral-800">
                                {formatCurrency(Number(prod.custo_aquisicao) || 0)}
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-500 truncate">
                              {prod.expand?.base_origem?.nome || '—'}
                            </p>
                          </div>
                        )}

                        {/* Itens de Composição */}
                        <div className="flex justify-between items-center text-[11px]">
                          <span className="text-neutral-500">Linhas de Composição:</span>
                          <span className="font-semibold text-neutral-700">
                            {totalComp} {totalComp === 1 ? 'item' : 'itens'} (
                            {formatCurrency(Number(prod.custo_composicao) || 0)})
                          </span>
                        </div>

                        {/* Vínculo de Empresas */}
                        <div className="flex items-center gap-1 flex-wrap pt-1 border-t">
                          <Building2 className="h-3 w-3 text-neutral-400" />
                          {prod.expand?.empresas && prod.expand.empresas.length > 0 ? (
                            prod.expand.empresas.map((emp) => (
                              <Badge
                                key={emp.id}
                                variant="secondary"
                                className="text-[10px] py-0 px-1.5 bg-neutral-100 text-neutral-700 font-normal"
                              >
                                {emp.nome_fantasia || emp.razao_social}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-[10px] text-muted-foreground italic">
                              Sem empresa vinculada
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex justify-end gap-1 pt-3 border-t">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 text-xs gap-1 text-neutral-700 hover:text-neutral-900"
                          onClick={() => {
                            setCompostoEditando(prod)
                            setModalCompostoAberto(true)
                          }}
                        >
                          <Edit className="h-3.5 w-3.5" />
                          Editar Ficha
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-red-500 hover:bg-red-50"
                          onClick={(e) => handleExcluirComposto(prod.id, e)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ABA: PRODUTOS BASE */}
        <TabsContent value="base" className="m-0 space-y-4">
          {loading ? (
            <div className="py-12 text-center text-neutral-400">Carregando catálogo de base...</div>
          ) : basesFiltradas.length === 0 ? (
            <Card className="border-dashed p-8 text-center bg-white">
              <Package className="h-10 w-10 text-neutral-300 mx-auto mb-2" />
              <p className="text-sm font-medium text-neutral-600">
                Nenhum produto base encontrado.
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Itens de base representam tudo que é comprado ou terceirizado de um fornecedor.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBaseEditando(null)
                  setModalBaseAberto(true)
                }}
                className="mt-4 gap-1.5 text-[#DF5830] border-orange-200 hover:bg-orange-50"
              >
                <Plus className="h-4 w-4" />
                Criar Primeiro Produto Base
              </Button>
            </Card>
          ) : (
            <div className="border rounded-lg bg-white overflow-hidden shadow-sm">
              <table className="w-full text-left text-xs">
                <thead className="bg-neutral-50 text-neutral-600 font-semibold border-b">
                  <tr>
                    <th className="py-3 px-4">Nome do Item</th>
                    <th className="py-3 px-3">Tipo</th>
                    <th className="py-3 px-3">Fornecedor</th>
                    <th className="py-3 px-3">SKU / Cód.</th>
                    <th className="py-3 px-3 text-right">Custo Unitário</th>
                    <th className="py-3 px-4 text-center w-24">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {basesFiltradas.map((b) => (
                    <tr key={b.id} className="hover:bg-neutral-50/50 transition-colors">
                      <td className="py-3 px-4">
                        <span className="font-semibold text-neutral-800">{b.nome}</span>
                        {b.origem_colecao && (
                          <span className="block text-[10px] text-muted-foreground">
                            Migrado de: {b.origem_colecao}
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3">
                        <Badge
                          variant="secondary"
                          className="capitalize text-[10px] font-normal py-0 px-2"
                        >
                          {b.tipo}
                        </Badge>
                      </td>
                      <td className="py-3 px-3 font-medium text-neutral-700">
                        {b.expand?.fornecedor?.nome_fantasia ||
                          b.expand?.fornecedor?.razao_social ||
                          '—'}
                      </td>
                      <td className="py-3 px-3 font-mono text-neutral-600">{b.sku || '—'}</td>
                      <td className="py-3 px-3 text-right font-bold text-neutral-900">
                        {formatCurrency(Number(b.custo_unitario) || 0)} / {b.unidade || 'un'}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-neutral-600 hover:text-neutral-900"
                            onClick={() => {
                              setBaseEditando(b)
                              setModalBaseAberto(true)
                            }}
                          >
                            <Edit className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:bg-red-50"
                            onClick={(e) => handleExcluirBase(b.id, e)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
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

      {/* Modais */}
      {modalCompostoAberto && (
        <ProdutoCompostoDialog
          open={modalCompostoAberto}
          onOpenChange={setModalCompostoAberto}
          record={compostoEditando}
          produtosBase={produtosBase}
          empresas={empresas}
          onSuccess={carregarDados}
        />
      )}

      {modalBaseAberto && (
        <ProdutoBaseDialog
          open={modalBaseAberto}
          onOpenChange={setModalBaseAberto}
          record={baseEditando}
          fornecedores={fornecedores}
          onSuccess={carregarDados}
        />
      )}
    </div>
  )
}
