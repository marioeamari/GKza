import { useEffect, useMemo, useState } from 'react'
import { Calculator, LoaderCircle, Plus, Save, Trash2 } from 'lucide-react'
import { MoneyInput } from '@/components/MoneyInput'
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useToast } from '@/hooks/use-toast'
import { apiFieldErrors, apiMessage } from '@/lib/api-error'
import { dateOnly, formatCurrency, toPocketBaseDate } from '@/lib/format'
import { marketplacesService } from '@/services/marketplaces'
import { precificacaoService } from '@/services/precificacao'
import type { MarketplaceConta, SaleStatus, Venda, VendaItem } from '@/types/domain'
import type { PrecPrecificacaoRecord, PrecProdutoRecord } from '@/types/precificacao'

export function SaleDialog({
  open,
  onOpenChange,
  record,
  contas,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  record: Venda | null
  contas: MarketplaceConta[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    pedido_id: '',
    marketplace_conta: '',
    data: new Date().toISOString().slice(0, 10),
    valor_bruto: 0,
    comissao: 0,
    taxas: 0,
    status: 'pendente' as SaleStatus,
    itens: [] as VendaItem[],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [catalogoProdutos, setCatalogoProdutos] = useState<PrecProdutoRecord[]>([])
  const [precificacoes, setPrecificacoes] = useState<PrecPrecificacaoRecord[]>([])
  const [loadingCatalog, setLoadingCatalog] = useState(false)

  const { toast } = useToast()

  // Carregar produtos cadastrados e precificações aprovadas para preencher o valor unitário automaticamente
  useEffect(() => {
    if (open) {
      let active = true
      setLoadingCatalog(true)
      Promise.all([
        precificacaoService.listProdutos('status = "ativo"'),
        precificacaoService.listPrecificacoes('status = "aprovada"'),
      ])
        .then(([prods, precs]) => {
          if (!active) return
          setCatalogoProdutos(prods)
          setPrecificacoes(precs)
        })
        .catch((err) => {
          console.warn('Falha ao carregar catálogo para vendas:', err)
        })
        .finally(() => {
          if (active) setLoadingCatalog(false)
        })

      return () => {
        active = false
      }
    }
  }, [open])

  useEffect(() => {
    if (open) {
      if (record) {
        const itensExistentes: VendaItem[] =
          Array.isArray(record.itens) && record.itens.length > 0
            ? record.itens
            : [
                {
                  descricao: record.pedido_id || 'Venda do dia',
                  quantidade: 1,
                  preco_unitario: record.valor_bruto || 0,
                  subtotal: record.valor_bruto || 0,
                },
              ]

        setForm({
          pedido_id: record.pedido_id,
          marketplace_conta: record.marketplace_conta,
          data: dateOnly(record.data),
          valor_bruto: record.valor_bruto,
          comissao: record.comissao,
          taxas: record.taxas,
          status: record.status,
          itens: itensExistentes,
        })
      } else {
        const defaultConta = contas.find((c) => c.ativa)?.id || ''
        setForm({
          pedido_id: '',
          marketplace_conta: defaultConta,
          data: new Date().toISOString().slice(0, 10),
          valor_bruto: 0,
          comissao: 0,
          taxas: 0,
          status: 'pendente',
          itens: [
            {
              descricao: '',
              quantidade: 1,
              preco_unitario: 0,
              subtotal: 0,
            },
          ],
        })
      }
      setErrors({})
    }
  }, [open, record, contas])

  const selectedConta = useMemo(
    () => contas.find((c) => c.id === form.marketplace_conta),
    [contas, form.marketplace_conta],
  )

  const totalDosItens = useMemo(() => {
    return (
      Math.round(form.itens.reduce((acc, item) => acc + (Number(item.subtotal) || 0), 0) * 100) /
      100
    )
  }, [form.itens])

  const liquid = Math.max(
    0,
    Math.round((form.valor_bruto - form.comissao - form.taxas) * 100) / 100,
  )

  // Recalcular comissão ao mudar a conta
  const setAccount = (marketplace_conta: string) => {
    const c = contas.find((a) => a.id === marketplace_conta)
    const pct = c?.comissao_percentual || 0
    setForm((prev) => ({
      ...prev,
      marketplace_conta,
      comissao: Math.round(prev.valor_bruto * pct) / 100,
    }))
  }

  // Obter preço sugerido para um produto (prioriza preço aprovado no marketplace da conta selecionada)
  const getPrecoSugerido = (produtoId: string): number => {
    const prod = catalogoProdutos.find((p) => p.id === produtoId)
    if (!prod) return 0

    // Procurar precificação aprovada deste produto
    const precsDoProd = precificacoes.filter((p) => p.produto === produtoId)

    // Se a conta de marketplace selecionada estiver vinculada a um canal, buscar precificação desse canal
    if (selectedConta?.marketplace) {
      // prec_canais vinculados a esse marketplace
      const precExata = precsDoProd.find((p) => {
        // Se a precificação tiver canal com id ou nome
        return p.expand?.canal?.marketplace === selectedConta.marketplace
      })
      if (precExata && (precExata.preco_aprovado || precExata.premissas?.preco_venda)) {
        return precExata.preco_aprovado || precExata.premissas?.preco_venda || 0
      }
    }

    // Qualquer aprovada do produto
    if (precsDoProd.length > 0) {
      const p = precsDoProd[0]
      if (p.preco_aprovado || p.premissas?.preco_venda) {
        return p.preco_aprovado || p.premissas?.preco_venda || 0
      }
    }

    // Fallback: custo unitário ou zero
    return prod.custo_aquisicao_unitario || 0
  }

  // Manipulação de itens da venda
  const handleItemChange = (index: number, field: keyof VendaItem, value: string | number) => {
    setForm((prev) => {
      const novosItens = [...prev.itens]
      const itemAtual = { ...novosItens[index], [field]: value }

      if (field === 'quantidade' || field === 'preco_unitario') {
        const qtd = field === 'quantidade' ? Number(value) || 0 : itemAtual.quantidade
        const preco = field === 'preco_unitario' ? Number(value) || 0 : itemAtual.preco_unitario
        itemAtual.subtotal = Math.round(qtd * preco * 100) / 100
      }

      novosItens[index] = itemAtual

      const novoTotal =
        Math.round(novosItens.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0) * 100) / 100

      const pct = selectedConta?.comissao_percentual || 0
      const novaComissao = Math.round(novoTotal * pct) / 100

      return {
        ...prev,
        itens: novosItens,
        valor_bruto: novoTotal,
        comissao: novaComissao,
      }
    })
  }

  const handleSelectProduto = (index: number, produtoId: string) => {
    if (produtoId === 'custom') {
      handleItemChange(index, 'produto_id', '')
      return
    }

    const prod = catalogoProdutos.find((p) => p.id === produtoId)
    if (!prod) return

    const precoSugerido = getPrecoSugerido(produtoId)

    setForm((prev) => {
      const novosItens = [...prev.itens]
      const qtdAtual = novosItens[index]?.quantidade || 1
      const subtotal = Math.round(qtdAtual * precoSugerido * 100) / 100

      novosItens[index] = {
        ...novosItens[index],
        produto_id: prod.id,
        sku: prod.sku,
        descricao: prod.nome,
        preco_unitario: precoSugerido,
        subtotal,
      }

      const novoTotal =
        Math.round(novosItens.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0) * 100) / 100

      const pct = selectedConta?.comissao_percentual || 0
      const novaComissao = Math.round(novoTotal * pct) / 100

      return {
        ...prev,
        itens: novosItens,
        valor_bruto: novoTotal,
        comissao: novaComissao,
      }
    })
  }

  const handleAddItem = () => {
    setForm((prev) => ({
      ...prev,
      itens: [
        ...prev.itens,
        {
          descricao: '',
          quantidade: 1,
          preco_unitario: 0,
          subtotal: 0,
        },
      ],
    }))
  }

  const handleRemoveItem = (index: number) => {
    setForm((prev) => {
      const novosItens = prev.itens.filter((_, i) => i !== index)
      const novoTotal =
        Math.round(novosItens.reduce((acc, it) => acc + (Number(it.subtotal) || 0), 0) * 100) / 100

      const pct = selectedConta?.comissao_percentual || 0
      const novaComissao = Math.round(novoTotal * pct) / 100

      return {
        ...prev,
        itens: novosItens,
        valor_bruto: novoTotal,
        comissao: novaComissao,
      }
    })
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.pedido_id.trim())
      next.pedido_id = 'Informe o código do pedido ou identificador do dia.'
    if (!form.marketplace_conta) next.marketplace_conta = 'Selecione a conta.'
    if (form.valor_bruto <= 0) next.valor_bruto = 'Informe os itens ou o valor bruto da venda.'
    if (form.comissao + form.taxas > form.valor_bruto) {
      next.valor_bruto = 'Comissão e taxas não podem superar o valor bruto.'
    }

    // Validar se há itens sem descrição
    if (form.itens.some((it) => !it.descricao.trim() && it.subtotal > 0)) {
      next.itens = 'Todos os itens precisam ter descrição ou produto selecionado.'
    }

    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      await marketplacesService.saveVenda(
        {
          pedido_id: form.pedido_id.trim(),
          marketplace_conta: form.marketplace_conta,
          data: toPocketBaseDate(form.data),
          valor_bruto: form.valor_bruto,
          comissao: form.comissao,
          taxas: form.taxas,
          valor_liquido: liquid,
          status: form.status,
          itens: form.itens,
        },
        record?.id,
      )

      toast({
        title: 'Venda salva com sucesso',
        description:
          form.status === 'paga'
            ? 'O lançamento financeiro será sincronizado automaticamente.'
            : 'Venda e itens diários registrados.',
      })
      onOpenChange(false)
      onSaved()
    } catch (error) {
      setErrors({ ...apiFieldErrors(error), form: apiMessage(error) })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{record ? 'Editar venda' : 'Registrar venda do dia por itens'}</DialogTitle>
          <DialogDescription>
            Lance os itens descritivos vendidos no dia (ex.: 50 toalhas de praia, 5 toalhas banhão).
            O sistema busca o preço unitário aprovado no catálogo.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs">Identificador / Pedido</Label>
              <Input
                value={form.pedido_id}
                onChange={(e) => setForm({ ...form, pedido_id: e.target.value })}
                placeholder="Ex.: Vendas 27/10 ou MLB-123"
                className="h-9 text-xs"
              />
              {errors.pedido_id && <p className="field-error">{errors.pedido_id}</p>}
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs">Data da Venda</Label>
              <Input
                type="date"
                value={form.data}
                onChange={(e) => setForm({ ...form, data: e.target.value })}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1 sm:col-span-1">
              <Label className="text-xs">Conta Marketplace</Label>
              <Select value={form.marketplace_conta} onValueChange={setAccount}>
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {contas
                    .filter((c) => c.ativa || c.id === form.marketplace_conta)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.apelido} · {c.comissao_percentual}%
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.marketplace_conta && (
                <p className="field-error">{errors.marketplace_conta}</p>
              )}
            </div>
          </div>

          {/* ITENS DA VENDA */}
          <div className="rounded-xl border border-border p-3.5 space-y-3 bg-secondary/10">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-bold text-foreground">
                  Itens Descritivos da Venda ({form.itens.length})
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Escolha o produto do catálogo de precificação para autocompletar o valor
                  cadastrado.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-xs gap-1 bg-white border-primary/30 text-primary hover:bg-primary/5"
                onClick={handleAddItem}
              >
                <Plus className="h-3.5 w-3.5" />
                Adicionar Item
              </Button>
            </div>

            {errors.itens && <p className="field-error">{errors.itens}</p>}

            <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
              {form.itens.map((item, idx) => (
                <div
                  key={idx}
                  className="rounded-lg border border-border/70 bg-white p-2.5 space-y-2 shadow-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    {/* Seletor de produto do catálogo */}
                    <div className="sm:col-span-5 space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">
                        Produto (Catálogo)
                      </span>
                      <Select
                        value={item.produto_id || 'custom'}
                        onValueChange={(v) => handleSelectProduto(idx, v)}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Selecione o produto..." />
                        </SelectTrigger>
                        <SelectContent className="max-h-56">
                          <SelectItem
                            value="custom"
                            className="text-xs italic text-muted-foreground"
                          >
                            Item avulso / Digitar descrição
                          </SelectItem>
                          {catalogoProdutos.map((p) => (
                            <SelectItem key={p.id} value={p.id} className="text-xs">
                              [{p.sku}] {p.nome}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Descrição do item */}
                    <div className="sm:col-span-3 space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">
                        Descrição / SKU
                      </span>
                      <Input
                        value={item.descricao}
                        onChange={(e) => handleItemChange(idx, 'descricao', e.target.value)}
                        placeholder="Ex.: Toalha de praia"
                        className="h-8 text-xs"
                      />
                    </div>

                    {/* Quantidade */}
                    <div className="sm:col-span-1 space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">
                        Qtd
                      </span>
                      <Input
                        type="number"
                        min="1"
                        value={item.quantidade}
                        onChange={(e) =>
                          handleItemChange(
                            idx,
                            'quantidade',
                            Math.max(1, parseInt(e.target.value) || 0),
                          )
                        }
                        className="h-8 text-xs font-mono px-2"
                      />
                    </div>

                    {/* Preço Unitário */}
                    <div className="sm:col-span-2 space-y-1">
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase block">
                        Unitário (R$)
                      </span>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={item.preco_unitario}
                        onChange={(e) =>
                          handleItemChange(idx, 'preco_unitario', parseFloat(e.target.value) || 0)
                        }
                        className="h-8 text-xs font-mono px-2"
                      />
                    </div>

                    {/* Botão remover */}
                    <div className="sm:col-span-1 flex items-end justify-center pt-4 sm:pt-0">
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        disabled={form.itens.length <= 1}
                        onClick={() => handleRemoveItem(idx)}
                        title="Remover linha"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                    <span>
                      {item.quantidade} un × {formatCurrency(item.preco_unitario)}
                    </span>
                    <span className="font-semibold text-foreground font-mono">
                      Subtotal: {formatCurrency(item.subtotal)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-border font-bold text-xs">
              <span className="text-muted-foreground">Soma dos Itens:</span>
              <span className="text-sm font-mono text-primary">
                {formatCurrency(totalDosItens)}
              </span>
            </div>
          </div>

          {/* VALORES TOTAIS E TAXAS */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1">
              <Label className="text-xs">Valor Bruto Total</Label>
              <MoneyInput
                value={form.valor_bruto}
                onChange={(valor_bruto) => {
                  const pct = selectedConta?.comissao_percentual || 0
                  setForm({
                    ...form,
                    valor_bruto,
                    comissao: Math.round(valor_bruto * pct) / 100,
                  })
                }}
              />
              <p className="text-[10px] text-muted-foreground">
                Calculado pela soma dos itens acima
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Comissão Marketplace</Label>
              <MoneyInput
                value={form.comissao}
                onChange={(comissao) => setForm({ ...form, comissao })}
              />
              <p className="text-[10px] text-muted-foreground">
                Sugerido: {selectedConta?.comissao_percentual || 0}%
              </p>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Outras Taxas / Frete</Label>
              <MoneyInput value={form.taxas} onChange={(taxas) => setForm({ ...form, taxas })} />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Status da Venda</Label>
              <Select
                value={form.status}
                onValueChange={(status) => setForm({ ...form, status: status as SaleStatus })}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="paga">Paga</SelectItem>
                  <SelectItem value="repassada">Repassada</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between rounded-xl bg-success-subtle p-3 mt-1 sm:mt-0">
              <span className="flex items-center gap-1.5 text-xs font-bold text-success">
                <Calculator className="h-4 w-4" />
                Líquido Previsto
              </span>
              <strong className="text-lg tabular-nums text-success">
                {formatCurrency(liquid)}
              </strong>
            </div>
          </div>

          {errors.valor_bruto && <p className="field-error">{errors.valor_bruto}</p>}
          {errors.form && <p className="field-error">{errors.form}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={saving} className="bg-primary text-white font-bold">
              {saving ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Salvar Venda
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
