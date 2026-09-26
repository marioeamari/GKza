import { useEffect, useState } from 'react'
import {
  PackagePlus,
  Edit2,
  Trash2,
  Layers,
  Plus,
  Calculator,
  Building2,
  ArrowRight,
  Boxes,
} from 'lucide-react'
import { PrecHeader } from '@/components/precificacao/PrecHeader'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { cadastrosService } from '@/services/cadastros'
import { PrecKitRecord, PrecProdutoRecord } from '@/types/precificacao'
import { Empresa } from '@/types/domain'
import {
  calcularCustoBaseProduto,
  ItemComposicaoCusto,
  TipoProduto,
} from '@/lib/precificacao/calculo'
import { formatCurrency } from '@/lib/format'
import { useToast } from '@/hooks/use-toast'
import { Link } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'

export default function PrecificacaoProdutos() {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [produtos, setProdutos] = useState<PrecProdutoRecord[]>([])
  const [empresas, setEmpresas] = useState<Empresa[]>([])

  // Modal de Criação / Edição de Produto
  const [openDialog, setOpenDialog] = useState(false)
  const [produtoEditando, setProdutoEditando] = useState<Partial<PrecProdutoRecord> | null>(null)
  const [composicaoTemp, setComposicaoTemp] = useState<ItemComposicaoCusto[]>([])

  // Modal de Gestão de Kit
  const [openKitDialog, setOpenKitDialog] = useState(false)
  const [kitPai, setKitPai] = useState<PrecProdutoRecord | null>(null)
  const [kitRecord, setKitRecord] = useState<PrecKitRecord | null>(null)

  async function carregar() {
    try {
      setLoading(true)
      const [prods, emps] = await Promise.all([
        precificacaoService.listProdutos(),
        cadastrosService.listEmpresas(),
      ])
      setProdutos(prods)
      setEmpresas(emps)
    } catch (err) {
      console.error('Erro ao carregar produtos:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    carregar()
  }, [])

  function abrirNovoProduto() {
    setProdutoEditando({
      sku: '',
      nome: '',
      tipo: 'fabricacao_propria',
      status: 'ativo',
      unidade: 'un',
      peso_g: 280,
      custo_adicional_embalagem: 0.1,
      custo_etiqueta: 0.05,
      perda_pct: 10,
    })
    setComposicaoTemp([
      {
        codigo: 'C0',
        descricao: 'Matéria-prima principal',
        qtd: 1,
        custo_unitario: 10.0,
        categoria_custo: 'material',
      },
    ])
    setOpenDialog(true)
  }

  function abrirEditarProduto(p: PrecProdutoRecord) {
    setProdutoEditando(p)
    setComposicaoTemp(p.composicao || [])
    setOpenDialog(true)
  }

  async function handleSalvarProduto(e: React.FormEvent) {
    e.preventDefault()
    if (!produtoEditando?.sku || !produtoEditando?.nome) return

    try {
      const payload: Partial<PrecProdutoRecord> = {
        ...produtoEditando,
        composicao: composicaoTemp,
      }

      if (produtoEditando.id) {
        await precificacaoService.updateProduto(produtoEditando.id, payload)
        toast({
          title: 'Produto atualizado com sucesso!',
          description:
            'Cenários de precificação existentes foram marcados como "desatualizados" para conferência.',
        })
      } else {
        await precificacaoService.createProduto(payload)
        toast({ title: 'Produto cadastrado com sucesso!' })
      }
      setOpenDialog(false)
      carregar()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao salvar produto' })
    }
  }

  async function handleExcluirProduto(id: string) {
    if (!confirm('Deseja excluir este produto e suas composições de custo?')) return
    try {
      await precificacaoService.deleteProduto(id)
      toast({ title: 'Produto removido com sucesso' })
      carregar()
    } catch (err) {
      toast({ variant: 'destructive', title: 'Erro ao excluir produto' })
    }
  }

  return (
    <div className="space-y-6">
      <PrecHeader
        titulo="Cadastro de Produtos, Custos & Kits"
        subtitulo="Gestão das composições analíticas (C0..C12), perdas, despesas de compra e itens de kit"
        acoes={
          <Button className="bg-primary text-white font-bold" onClick={abrirNovoProduto}>
            <PackagePlus className="mr-1.5 h-4 w-4" />
            Novo Produto / Custo
          </Button>
        }
      />

      <Card className="shadow-xs border-border/80">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-3 gap-2">
          <div>
            <CardTitle className="text-base font-bold">Catálogo de Produtos & SKUs</CardTitle>
            <CardDescription className="text-xs">
              Produtos cadastrados e seus custos diretos calculados
            </CardDescription>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {produtos.length} produtos
          </span>
        </CardHeader>

        <CardContent className="overflow-x-auto p-0">
          {loading ? (
            <div className="space-y-2 p-4">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : produtos.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Layers className="h-10 w-10 mx-auto text-muted-foreground/40 mb-2" />
              <p className="font-semibold">Nenhum produto cadastrado</p>
              <p className="text-xs mt-1">
                Cadastre produtos de fabricação própria, revenda ou kits para iniciar simulações.
              </p>
              <Button onClick={abrirNovoProduto} className="mt-4 bg-primary text-white" size="sm">
                Cadastrar Primeiro Produto
              </Button>
            </div>
          ) : (
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-y border-border bg-secondary/30 text-muted-foreground uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-4 font-bold">Produto / SKU</th>
                  <th className="py-2.5 px-3 font-bold">Tipo</th>
                  <th className="py-2.5 px-3 font-bold">Empresa</th>
                  <th className="py-2.5 px-3 font-bold">Peso / Medidas</th>
                  <th className="py-2.5 px-3 font-bold text-right">Custo Direto</th>
                  <th className="py-2.5 px-3 font-bold text-right">Custo Total</th>
                  <th className="py-2.5 px-4 font-bold text-right">Ações</th>
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
                    <tr key={p.id} className="hover:bg-secondary/20 transition-colors">
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 rounded-lg bg-secondary flex items-center justify-center font-bold text-xs text-muted-foreground shrink-0 overflow-hidden">
                            {p.imagem ? (
                              <img
                                src={`${import.meta.env.VITE_POCKETBASE_URL || ''}/api/files/prec_produtos/${p.id}/${p.imagem}`}
                                alt={p.nome}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              p.sku.slice(0, 3)
                            )}
                          </div>
                          <div>
                            <span className="font-bold text-foreground block">{p.nome}</span>
                            <span className="text-[10px] font-mono text-primary font-bold">
                              SKU: {p.sku}
                            </span>
                          </div>
                        </div>
                      </td>

                      <td className="py-3 px-3">
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {p.tipo.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="py-3 px-3 text-muted-foreground">
                        {p.expand?.empresa?.nome_fantasia || 'Sem empresa'}
                      </td>

                      <td className="py-3 px-3 text-muted-foreground font-mono">
                        {p.peso_g ? `${p.peso_g}g` : '-'}
                      </td>

                      <td className="py-3 px-3 text-right font-mono text-muted-foreground">
                        {formatCurrency(custoCalc.custo_direto)}
                      </td>

                      <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                        {formatCurrency(custoCalc.custo_total)}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            asChild
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs text-primary font-bold"
                          >
                            <Link to={`/precificacao/comparar?sku=${p.sku}`}>
                              <Calculator className="mr-1 h-3.5 w-3.5" />
                              Comparar
                            </Link>
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            onClick={() => abrirEditarProduto(p)}
                          >
                            <Edit2 className="h-3.5 w-3.5 text-muted-foreground" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            onClick={() => handleExcluirProduto(p.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* DIALOG DE CRIAÇÃO / EDIÇÃO DE PRODUTO */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
          <form onSubmit={handleSalvarProduto}>
            <DialogHeader>
              <DialogTitle>
                {produtoEditando?.id ? 'Editar Produto / Custo' : 'Novo Produto para Precificação'}
              </DialogTitle>
              <DialogDescription>
                Informe o SKU, categoria e o modelo analítico de custos (fabricação, revenda ou
                kit).
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-3 text-xs">
              {/* Identificação Geral */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>SKU Único *</Label>
                  <Input
                    required
                    placeholder="Ex: BLeve?, PA-03..."
                    value={produtoEditando?.sku || ''}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({ ...prev, sku: e.target.value }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Nome do Produto *</Label>
                  <Input
                    required
                    placeholder="Ex: Toalhas (leve) Banho Infantil"
                    value={produtoEditando?.nome || ''}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({ ...prev, nome: e.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Tipo de Custo *</Label>
                  <Select
                    value={produtoEditando?.tipo || 'fabricacao_propria'}
                    onValueChange={(v) =>
                      setProdutoEditando((prev) => ({ ...prev, tipo: v as TipoProduto }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="fabricacao_propria">Fabricação Própria</SelectItem>
                      <SelectItem value="revenda">Revenda</SelectItem>
                      <SelectItem value="kit">Kit / Combo</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Empresa Responsável</Label>
                  <Select
                    value={produtoEditando?.empresa || 'nenhuma'}
                    onValueChange={(v) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        empresa: v === 'nenhuma' ? undefined : v,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione empresa..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="nenhuma">Nenhuma (Geral)</SelectItem>
                      {empresas.map((e) => (
                        <SelectItem key={e.id} value={e.id}>
                          {e.nome_fantasia || e.razao_social}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1">
                  <Label>Peso do Produto (g)</Label>
                  <Input
                    type="number"
                    min="0"
                    placeholder="Ex: 280"
                    value={produtoEditando?.peso_g ?? ''}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        peso_g: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>

              {/* Seção Específica: Fabricação Própria (C0..C12) */}
              {produtoEditando?.tipo === 'fabricacao_propria' && (
                <div className="rounded-xl border border-border p-3 space-y-3 bg-secondary/10">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                      Composição de Custo / Insumos (C0..C12)
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px]"
                      onClick={() => {
                        const nextIdx = composicaoTemp.length
                        setComposicaoTemp([
                          ...composicaoTemp,
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
                      Adicionar Linha (C{composicaoTemp.length})
                    </Button>
                  </div>

                  <div className="space-y-2">
                    {composicaoTemp.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <Input
                          className="w-16 h-8 text-xs font-mono font-bold"
                          placeholder="C0"
                          value={item.codigo || `C${idx}`}
                          onChange={(e) => {
                            const arr = [...composicaoTemp]
                            arr[idx].codigo = e.target.value
                            setComposicaoTemp(arr)
                          }}
                        />
                        <Input
                          className="flex-1 h-8 text-xs"
                          placeholder="Descrição do insumo ou serviço..."
                          value={item.descricao}
                          onChange={(e) => {
                            const arr = [...composicaoTemp]
                            arr[idx].descricao = e.target.value
                            setComposicaoTemp(arr)
                          }}
                        />
                        <div className="w-20">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 text-xs font-mono"
                            placeholder="Qtd"
                            value={item.qtd}
                            onChange={(e) => {
                              const arr = [...composicaoTemp]
                              arr[idx].qtd = parseFloat(e.target.value) || 0
                              setComposicaoTemp(arr)
                            }}
                          />
                        </div>
                        <div className="w-24">
                          <Input
                            type="number"
                            step="0.01"
                            className="h-8 text-xs font-mono"
                            placeholder="R$ Unit"
                            value={item.custo_unitario}
                            onChange={(e) => {
                              const arr = [...composicaoTemp]
                              arr[idx].custo_unitario = parseFloat(e.target.value) || 0
                              setComposicaoTemp(arr)
                            }}
                          />
                        </div>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-8 w-8 text-destructive"
                          onClick={() => {
                            setComposicaoTemp(composicaoTemp.filter((_, i) => i !== idx))
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Seção Específica: Revenda */}
              {produtoEditando?.tipo === 'revenda' && (
                <div className="rounded-xl border border-border p-3 space-y-3 bg-secondary/10">
                  <div className="space-y-1">
                    <Label>Custo de Aquisição Unitário (R$)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      required
                      placeholder="0.00"
                      value={produtoEditando?.custo_aquisicao_unitario ?? 0}
                      onChange={(e) =>
                        setProdutoEditando((prev) => ({
                          ...prev,
                          custo_aquisicao_unitario: parseFloat(e.target.value) || 0,
                        }))
                      }
                    />
                  </div>
                </div>
              )}

              {/* Custos Adicionais Globais: Embalagem, Etiqueta e Perda */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 border-t border-border pt-3">
                <div className="space-y-1">
                  <Label>Embalagem (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.10"
                    value={produtoEditando?.custo_adicional_embalagem ?? 0}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        custo_adicional_embalagem: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Etiqueta (R$)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.05"
                    value={produtoEditando?.custo_etiqueta ?? 0}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        custo_etiqueta: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>

                <div className="space-y-1">
                  <Label>Perda Estimada (%)</Label>
                  <Input
                    type="number"
                    step="0.5"
                    placeholder="10"
                    value={produtoEditando?.perda_pct ?? 0}
                    onChange={(e) =>
                      setProdutoEditando((prev) => ({
                        ...prev,
                        perda_pct: parseFloat(e.target.value) || 0,
                      }))
                    }
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" className="bg-primary text-white font-bold">
                Salvar Produto
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
