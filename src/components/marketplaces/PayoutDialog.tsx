import { useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  DollarSign,
  HelpCircle,
  LoaderCircle,
  Save,
  Scale,
} from 'lucide-react'
import { MoneyInput } from '@/components/MoneyInput'
import { Badge } from '@/components/ui/badge'
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
import { dateOnly, formatCurrency, formatDate, isWithin, toPocketBaseDate } from '@/lib/format'
import { marketplacesService } from '@/services/marketplaces'
import { precificacaoService } from '@/services/precificacao'
import type { MarketplaceConta, Repasse, Venda } from '@/types/domain'
import type { PrecCanalRecord, PrecTaxaRecord } from '@/types/precificacao'

export function PayoutDialog({
  open,
  onOpenChange,
  contas,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  contas: MarketplaceConta[]
  onSaved: () => void
}) {
  const [form, setForm] = useState({
    marketplace_conta: '',
    periodo_inicio: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10),
    periodo_fim: new Date().toISOString().slice(0, 10),
    data_prevista: new Date().toISOString().slice(0, 10),
    valor: 0,
    status: 'previsto' as Repasse['status'],
    data_realizada: '',
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)

  // Dados para conciliação
  const [vendas, setVendas] = useState<Venda[]>([])
  const [canais, setCanais] = useState<PrecCanalRecord[]>([])
  const [taxas, setTaxas] = useState<PrecTaxaRecord[]>([])
  const [loadingConciliacao, setLoadingConciliacao] = useState(false)

  const { toast } = useToast()

  useEffect(() => {
    if (open) {
      const defaultConta = contas.find((c) => c.ativa)?.id || ''
      setForm({
        marketplace_conta: defaultConta,
        periodo_inicio: new Date(Date.now() - 15 * 86400000).toISOString().slice(0, 10),
        periodo_fim: new Date().toISOString().slice(0, 10),
        data_prevista: new Date().toISOString().slice(0, 10),
        valor: 0,
        status: 'previsto',
        data_realizada: '',
      })
      setErrors({})

      // Carregar vendas e canais para conciliação
      let active = true
      setLoadingConciliacao(true)
      Promise.all([
        marketplacesService.listVendas(),
        precificacaoService.listCanais(),
        precificacaoService.listTaxas(),
      ])
        .then(([vnds, chans, txs]) => {
          if (!active) return
          setVendas(vnds)
          setCanais(chans)
          setTaxas(txs)
        })
        .catch((err) => {
          console.warn('Falha ao carregar dados para conciliação de repasse:', err)
        })
        .finally(() => {
          if (active) setLoadingConciliacao(false)
        })

      return () => {
        active = false
      }
    }
  }, [open, contas])

  const selectedConta = useMemo(
    () => contas.find((c) => c.id === form.marketplace_conta),
    [contas, form.marketplace_conta],
  )

  // Vendas do período para a conta selecionada
  const vendasDoPeriodo = useMemo(() => {
    if (!form.marketplace_conta || !form.periodo_inicio || !form.periodo_fim) return []
    const dInicio = new Date(form.periodo_inicio)
    const dFim = new Date(form.periodo_fim)
    return vendas.filter((v) => {
      if (v.marketplace_conta !== form.marketplace_conta) return false
      return isWithin(v.data, dInicio, dFim)
    })
  }, [vendas, form.marketplace_conta, form.periodo_inicio, form.periodo_fim])

  // Canal de precificação correspondente ao marketplace da conta
  const canalPrecificacao = useMemo(() => {
    if (!selectedConta?.marketplace) return undefined
    return canais.find((c) => c.marketplace === selectedConta.marketplace)
  }, [canais, selectedConta])

  // Taxas do canal vinculado
  const taxasCanal = useMemo(() => {
    if (!canalPrecificacao) return []
    return taxas.filter((t) => t.canal === canalPrecificacao.id)
  }, [taxas, canalPrecificacao])

  // Alíquota de comissão teórica do canal
  const comissaoEsperadaPct = useMemo(() => {
    const taxaComissao = taxasCanal.find(
      (t) =>
        t.tipo_valor === 'percentual' &&
        (t.tipo_regra === 'comissao' ||
          t.nome.toLowerCase().includes('comiss') ||
          t.nome.toLowerCase().includes('taxa fixa')),
    )
    if (taxaComissao && taxaComissao.valor !== undefined) {
      return taxaComissao.valor
    }
    return selectedConta?.comissao_percentual || 0
  }, [taxasCanal, selectedConta])

  // Totais da conciliação teórica
  const conciliacao = useMemo(() => {
    const totalBrutoVendas = vendasDoPeriodo.reduce((acc, v) => acc + (v.valor_bruto || 0), 0)
    const totalComissaoRealVendas = vendasDoPeriodo.reduce((acc, v) => acc + (v.comissao || 0), 0)
    const totalTaxasOutrasVendas = vendasDoPeriodo.reduce((acc, v) => acc + (v.taxas || 0), 0)
    const totalLiquidoVendas = vendasDoPeriodo.reduce((acc, v) => acc + (v.valor_liquido || 0), 0)

    // Taxa teórica esperada pelo canal precificado
    const comissaoEsperadaPeloCanal =
      Math.round(totalBrutoVendas * (comissaoEsperadaPct / 100) * 100) / 100

    // Taxas fixas por pedido (se houver no canal de precificação com tipo_valor 'fixo')
    const taxasFixasPorPedido = taxasCanal
      .filter((t) => t.tipo_valor === 'fixo')
      .reduce((acc, t) => acc + (t.valor || 0), 0)
    const totalTaxasFixas = taxasFixasPorPedido * vendasDoPeriodo.length

    // Valor esperado que deve chegar no repasse (Bruto - Comissão esperada - Taxas)
    const valorEsperadoRepasse = Math.max(
      0,
      Math.round(
        (totalBrutoVendas - comissaoEsperadaPeloCanal - totalTaxasFixas - totalTaxasOutrasVendas) *
          100,
      ) / 100,
    )

    const valorInformado = Number(form.valor) || 0
    const diferencaRepasse = Math.round((valorInformado - valorEsperadoRepasse) * 100) / 100

    let statusConciliacao: 'bate' | 'faltando' | 'a_mais' | 'sem_vendas' = 'bate'
    if (vendasDoPeriodo.length === 0) {
      statusConciliacao = 'sem_vendas'
    } else if (valorInformado > 0 && Math.abs(diferencaRepasse) <= 0.5) {
      statusConciliacao = 'bate'
    } else if (diferencaRepasse < -0.5) {
      statusConciliacao = 'faltando'
    } else if (diferencaRepasse > 0.5) {
      statusConciliacao = 'a_mais'
    }

    return {
      qtdVendas: vendasDoPeriodo.length,
      totalBrutoVendas,
      totalComissaoRealVendas,
      comissaoEsperadaPeloCanal,
      valorEsperadoRepasse,
      valorInformado,
      diferencaRepasse,
      statusConciliacao,
      temCanalVinculado: !!canalPrecificacao,
    }
  }, [vendasDoPeriodo, comissaoEsperadaPct, taxasCanal, form.valor, canalPrecificacao])

  const preencherComValorEsperado = () => {
    setForm((prev) => ({
      ...prev,
      valor: conciliacao.valorEsperadoRepasse,
    }))
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const next: Record<string, string> = {}
    if (!form.marketplace_conta) next.marketplace_conta = 'Selecione a conta.'
    if (form.valor <= 0) next.valor = 'Informe o valor do repasse.'
    if (form.periodo_inicio > form.periodo_fim) {
      next.periodo_inicio = 'Início posterior ao fim.'
    }
    if (form.status === 'realizado' && !form.data_realizada) {
      next.data_realizada = 'Informe a data do recebimento.'
    }
    setErrors(next)
    if (Object.keys(next).length) return

    setSaving(true)
    try {
      await marketplacesService.saveRepasse({
        marketplace_conta: form.marketplace_conta,
        periodo_inicio: toPocketBaseDate(form.periodo_inicio),
        periodo_fim: toPocketBaseDate(form.periodo_fim),
        data_prevista: toPocketBaseDate(form.data_prevista),
        valor: form.valor,
        status: form.status,
        data_realizada: form.data_realizada ? toPocketBaseDate(form.data_realizada) : '',
      })
      toast({
        title: 'Repasse salvo',
        description:
          form.status === 'realizado'
            ? 'Lançamento financeiro gerado com sucesso.'
            : 'Previsão registrada.',
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
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Registrar repasse de marketplace</DialogTitle>
          <DialogDescription>
            Concilie o valor a ser repassado validando se as comissões descontadas batem com a taxa
            precificada.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={save} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-xs">Conta Marketplace</Label>
            <Select
              value={form.marketplace_conta}
              onValueChange={(marketplace_conta) => setForm({ ...form, marketplace_conta })}
            >
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Selecione a conta..." />
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
            {errors.marketplace_conta && <p className="field-error">{errors.marketplace_conta}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Período - Início das vendas</Label>
              <Input
                type="date"
                value={form.periodo_inicio}
                onChange={(e) => setForm({ ...form, periodo_inicio: e.target.value })}
                className="h-9 text-xs"
              />
              {errors.periodo_inicio && <p className="field-error">{errors.periodo_inicio}</p>}
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Período - Fim das vendas</Label>
              <Input
                type="date"
                value={form.periodo_fim}
                onChange={(e) => setForm({ ...form, periodo_fim: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* BOX DE CONCILIAÇÃO INTELIGENTE DO REPASSE */}
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Scale className="h-4 w-4 text-primary" />
                <span className="text-xs font-bold text-foreground">
                  Validação de Comissão e Repasse Esperado
                </span>
              </div>
              {canalPrecificacao ? (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-white border-primary/30 text-primary font-medium"
                >
                  🔗 {canalPrecificacao.nome} ({comissaoEsperadaPct}%)
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="text-[10px] bg-amber-50 text-amber-700 border-amber-300"
                >
                  Canal não vinculado
                </Badge>
              )}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs pt-1">
              <div className="bg-white/80 p-2 rounded-lg border border-border/60">
                <span className="text-[10px] text-muted-foreground block">Vendas do período</span>
                <span className="font-mono font-bold text-foreground">
                  {conciliacao.qtdVendas} {conciliacao.qtdVendas === 1 ? 'venda' : 'vendas'}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  {formatCurrency(conciliacao.totalBrutoVendas)} bruto
                </span>
              </div>

              <div className="bg-white/80 p-2 rounded-lg border border-border/60">
                <span className="text-[10px] text-muted-foreground block">
                  Comissão precificada
                </span>
                <span className="font-mono font-bold text-primary">
                  {formatCurrency(conciliacao.comissaoEsperadaPeloCanal)}
                </span>
                <span className="text-[10px] text-muted-foreground block">
                  Taxa {comissaoEsperadaPct}%
                </span>
              </div>

              <div className="bg-white/80 p-2 rounded-lg border border-border/60 col-span-2 sm:col-span-1">
                <span className="text-[10px] text-muted-foreground block">Líquido esperado</span>
                <span className="font-mono font-bold text-emerald-700">
                  {formatCurrency(conciliacao.valorEsperadoRepasse)}
                </span>
                {conciliacao.valorEsperadoRepasse > 0 && form.valor === 0 && (
                  <button
                    type="button"
                    onClick={preencherComValorEsperado}
                    className="text-[10px] text-primary hover:underline font-bold block mt-0.5"
                  >
                    Usar este valor
                  </button>
                )}
              </div>
            </div>

            {/* Comparativo com o valor digitado */}
            {form.valor > 0 && (
              <div className="pt-2 border-t border-primary/20 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Diagnóstico da Conciliação:</span>
                  {conciliacao.statusConciliacao === 'bate' && (
                    <Badge className="bg-emerald-600 text-white gap-1 text-[11px]">
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Comissão Bate!
                    </Badge>
                  )}
                  {conciliacao.statusConciliacao === 'faltando' && (
                    <Badge
                      variant="destructive"
                      className="bg-red-600 text-white gap-1 text-[11px]"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      Ficou Faltando ({formatCurrency(Math.abs(conciliacao.diferencaRepasse))})
                    </Badge>
                  )}
                  {conciliacao.statusConciliacao === 'a_mais' && (
                    <Badge className="bg-blue-600 text-white gap-1 text-[11px]">
                      <DollarSign className="h-3.5 w-3.5" />
                      Veio a Mais (+{formatCurrency(conciliacao.diferencaRepasse)})
                    </Badge>
                  )}
                  {conciliacao.statusConciliacao === 'sem_vendas' && (
                    <Badge variant="outline" className="text-muted-foreground text-[11px]">
                      Sem vendas registradas nas datas
                    </Badge>
                  )}
                </div>

                {conciliacao.statusConciliacao === 'faltando' && (
                  <p className="text-[11px] text-red-700 bg-red-50 p-2 rounded border border-red-200">
                    O marketplace depositou <strong>{formatCurrency(form.valor)}</strong>, mas de
                    acordo com a taxa cadastrada no canal ({comissaoEsperadaPct}%), o esperado era{' '}
                    <strong>{formatCurrency(conciliacao.valorEsperadoRepasse)}</strong>. A praça
                    reteve <strong>{formatCurrency(Math.abs(conciliacao.diferencaRepasse))}</strong>{' '}
                    a mais em taxas/comissões.
                  </p>
                )}

                {conciliacao.statusConciliacao === 'a_mais' && (
                  <p className="text-[11px] text-blue-700 bg-blue-50 p-2 rounded border border-blue-200">
                    O valor recebido superou a projeção teórica em{' '}
                    <strong>{formatCurrency(conciliacao.diferencaRepasse)}</strong> (possível
                    reembolso de frete, estorno ou bonificação).
                  </p>
                )}

                {conciliacao.statusConciliacao === 'bate' && (
                  <p className="text-[11px] text-emerald-800 bg-emerald-50 p-2 rounded border border-emerald-200">
                    Perfeito! O valor do repasse confere exatamente com as vendas cadastradas menos
                    a comissão precificada da praça.
                  </p>
                )}
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label className="text-xs">Valor do Repasse (R$)</Label>
                {conciliacao.valorEsperadoRepasse > 0 && (
                  <button
                    type="button"
                    onClick={preencherComValorEsperado}
                    className="text-[10px] text-primary hover:underline font-semibold"
                  >
                    Copiar esperado ({formatCurrency(conciliacao.valorEsperadoRepasse)})
                  </button>
                )}
              </div>
              <MoneyInput value={form.valor} onChange={(valor) => setForm({ ...form, valor })} />
              {errors.valor && <p className="field-error">{errors.valor}</p>}
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Data Prevista de Depósito</Label>
              <Input
                type="date"
                value={form.data_prevista}
                onChange={(e) => setForm({ ...form, data_prevista: e.target.value })}
                className="h-9 text-xs"
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Status do Repasse</Label>
              <Select
                value={form.status}
                onValueChange={(status) =>
                  setForm({
                    ...form,
                    status: status as Repasse['status'],
                    data_realizada:
                      status === 'realizado' && !form.data_realizada
                        ? new Date().toISOString().slice(0, 10)
                        : form.data_realizada,
                  })
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="previsto">Previsto</SelectItem>
                  <SelectItem value="realizado">Realizado / Depositado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.status === 'realizado' && (
              <div className="space-y-1">
                <Label className="text-xs">Data da Realização / Crédito</Label>
                <Input
                  type="date"
                  value={form.data_realizada}
                  onChange={(e) => setForm({ ...form, data_realizada: e.target.value })}
                  className="h-9 text-xs"
                />
                {errors.data_realizada && <p className="field-error">{errors.data_realizada}</p>}
              </div>
            )}
          </div>

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
              Salvar Repasse
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
