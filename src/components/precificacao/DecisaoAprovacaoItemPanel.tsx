import React, { useMemo } from 'react'
import { HelpCircle, AlertTriangle } from 'lucide-react'
import { Link } from 'react-router-dom'
import { formatCurrency } from '@/lib/format'
import {
  calcularDemonstrativo,
  resolverPrecoParaMeta,
  calcularPrecoUnitarioCliente,
} from '@/lib/precificacao/calculo'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { Badge } from '@/components/ui/badge'

export interface DecisaoAprovacaoItemProps {
  canalNome: string
  quantidadeItem: number
  precoUnitarioEditado: number
  precoCheioEditado?: number
  freteItemEditado: number
  modoFreteItem?: 'pago_pelo_cliente' | 'frete_gratis'
  precificacaoAprovadaRecord?: any
  produtoVinculado?: any
  taxasCanal?: any[]
  aliquotaDas?: number
  aliquotaIcms?: number
  dasImpostoMes?: number
  pedidosMes?: number
}
export function DecisaoAprovacaoItemPanel({
  canalNome,
  quantidadeItem,
  precoUnitarioEditado,
  precoCheioEditado,
  freteItemEditado,
  modoFreteItem = 'pago_pelo_cliente',
  precificacaoAprovadaRecord,
  produtoVinculado,
  taxasCanal = [],
  aliquotaDas,
  aliquotaIcms,
  dasImpostoMes,
  pedidosMes,
}: DecisaoAprovacaoItemProps) {
  const qtd = Math.max(1, Number(quantidadeItem) || 1)
  const precoUnit = Number(precoUnitarioEditado) || 0
  const precoCheio =
    Number(precoCheioEditado) > 0
      ? Number(precoCheioEditado)
      : Math.round(precoUnit * qtd * 100) / 100
  const frete = Number(freteItemEditado) || 0

  const analise = useMemo(() => {
    const rec = precificacaoAprovadaRecord || {}
    const premissas = (rec.premissas as any) || {}
    const resultadoGravado = (rec.resultado as any) || {}
    const custoSnapshot = (rec.custo_snapshot as any) || {}
    const prod = (rec.expand as any)?.produto || produtoVinculado || {}

    // 1. Custo do produto unitário e no volume do item
    // Regra dos modos de frete:
    // 'pago_pelo_cliente': não entra no custo (é despesa do cliente).
    // 'frete_gratis': a loja paga -> entra no custo do produto (reduz lucro líquido, margem e markup).
    const freteGratisCusto = modoFreteItem === 'frete_gratis' ? frete : 0
    const custoUnitarioOficial =
      Number(resultadoGravado.custo_total_produto) ||
      Number(custoSnapshot.custo_total) ||
      Number(premissas.sobrescrita_custo_total) ||
      Number(prod.custo_aquisicao_unitario) ||
      0
    const custoBase = Math.round(custoUnitarioOficial * qtd * 100) / 100
    const custoTotalItem = Math.round((custoBase + freteGratisCusto) * 100) / 100

    // 2. Alíquotas e Tributos (se não informado, padrão DAS = 4% Simples Nacional)
    const aliqDasCalc =
      typeof aliquotaDas === 'number' && aliquotaDas > 0
        ? aliquotaDas
        : Number(premissas.aliquota_das_pct) ||
          Number(resultadoGravado.aliquota_imposto_efetiva_pct) ||
          4
    const aliqIcmsCalc =
      typeof aliquotaIcms === 'number' ? aliquotaIcms : Number(premissas.aliquota_icms_pct) || 0
    const aliqEfetiva = aliqDasCalc + aliqIcmsCalc

    // 3. Taxas
    // Se temos taxasCanal passadas, usamos; senão, se houver taxas_retidas em resultadoGravado, usamos a proporção
    const temTaxasLista = Array.isArray(taxasCanal) && taxasCanal.length > 0
    let totalTaxasRetidasItem = 0

    const isDesatualizada =
      rec.status === 'desatualizada' ||
      produtoVinculado?.desatualizada === true ||
      produtoVinculado?.status_precificacao === 'desatualizada'

    if (temTaxasLista) {
      // Monta input para calcularDemonstrativo no volume do item
      const cenarioInput: any = {
        preco_anunciado: precoCheio,
        produto: {
          id: prod.id || 'item',
          empresa: prod.empresa || '',
          tipo: prod.tipo || 'fabricacao_propria',
          nome: prod.nome || 'Item',
          sku: prod.sku || '',
          custo_aquisicao_unitario: custoTotalItem,
          peso_g: (prod.peso_g || 0) * qtd,
        },
        sobrescrita_custo_total: custoTotalItem,
        taxas: taxasCanal.map((t) => ({
          id: t.id,
          nome: t.nome,
          tipo_valor: t.tipo_valor,
          valor: t.valor,
          base_calculo: t.base_calculo,
          condicao: t.condicao,
          responsavel: t.responsavel,
          tipo_regra: t.tipo_regra,
          financiado_por: t.financiado_por,
          status_conferencia: t.status_conferencia,
        })),
        frete_vendedor: 0,
        tributos: {
          aliquota_das_pct: aliqDasCalc,
          aliquota_icms_pct: aliqIcmsCalc,
          das_imposto_total_mes: dasImpostoMes,
          pedidos_estimados_mes: pedidosMes,
        },
      }

      const dem = calcularDemonstrativo(cenarioInput)
      const eqSol = resolverPrecoParaMeta(cenarioInput, 'equilibrio', 0)
      const metaSol = resolverPrecoParaMeta(cenarioInput, 'margem_pct', 20) // meta padrão 20% ou oficial

      // Preço pago cliente no volume do item
      const precoPagoClienteVolume = dem.preco_pago_cliente
      const precoUnitCliente = calcularPrecoUnitarioCliente(precoPagoClienteVolume, qtd)

      return {
        temProdutoVinculado: Boolean(precificacaoAprovadaRecord || produtoVinculado),
        isDesatualizada,
        precoPagoClienteVolume,
        precoUnitCliente,
        valorReceberCanal: dem.valor_receber_canal,
        tributosTotal: dem.total_tributos,
        aliquotaEfetiva: dem.aliquota_imposto_efetiva_pct,
        impostoDas: dem.imposto_das,
        impostoIcms: dem.imposto_icms,
        custoProduto: dem.custo_total_produto,
        lucroLiquido: dem.lucro_liquido,
        margemPct: dem.margem_liquida_pct,
        markupPct: dem.markup_sobre_custo_pct,
        pontoEquilibrio: eqSol.preco_sugerido,
        precoMeta: metaSol.preco_sugerido,
      }
    } else {
      // Proporcionalização direta a partir do resultado gravado da precificação aprovada
      // ou estimativa comercial padrão para o canal caso não haja vínculo
      const precoAprovadoOficial =
        Number(rec.preco_aprovado) || Number(resultadoGravado.preco_anunciado) || precoUnit
      const proporcaoPreco = precoAprovadoOficial > 0 ? precoCheio / precoAprovadoOficial : qtd

      const taxasGravadas = Number(resultadoGravado.total_taxas_retidas_canal) || 0
      // Se não há taxas gravadas nem taxasCanal, assume comissão padrão estimada do canal (18% se marketplace, 0% se site)
      const taxaPctEstimada = canalNome.toLowerCase().includes('site') ? 0 : 0.18
      totalTaxasRetidasItem =
        taxasGravadas > 0
          ? Math.round(taxasGravadas * proporcaoPreco * 100) / 100
          : Math.round(precoCheio * taxaPctEstimada * 100) / 100

      // Tributos sobre precoCheio
      const baseNf = precoCheio
      const impostoDas = Math.round(baseNf * (aliqDasCalc / 100) * 100) / 100
      const impostoIcms = Math.round(baseNf * (aliqIcmsCalc / 100) * 100) / 100
      const tributosTotal = Math.round((impostoDas + impostoIcms) * 100) / 100

      // A receber do canal = Preço Cheio - Taxas do Canal
      const valorReceberCanal = Math.round((precoCheio - totalTaxasRetidasItem) * 100) / 100

      // Lucro Líquido = A receber - Custo do produto (que já inclui frete se frete_gratis) - Tributos
      const lucroLiquido =
        Math.round((valorReceberCanal - custoTotalItem - tributosTotal) * 100) / 100
      const margemPct = precoCheio > 0 ? Math.round((lucroLiquido / precoCheio) * 1000) / 10 : 0
      const markupPct =
        custoTotalItem > 0
          ? Math.round(((precoCheio - custoTotalItem) / custoTotalItem) * 1000) / 10
          : 0

      // Ponto de equilíbrio estimado (onde lucro = 0):
      const taxaPctEfetiva = precoCheio > 0 ? totalTaxasRetidasItem / precoCheio : taxaPctEstimada
      const divisor = Math.max(0.05, 1 - (taxaPctEfetiva + aliqEfetiva / 100))
      const pontoEquilibrio = Math.round((custoTotalItem / divisor) * 100) / 100
      // Preço meta com margem líquida de 20%
      const divisorMeta = Math.max(0.05, 1 - (taxaPctEfetiva + aliqEfetiva / 100 + 0.2))
      const precoMeta = Math.round((custoTotalItem / divisorMeta) * 100) / 100

      const precoPagoClienteVolume = precoCheio
      const precoUnitCliente = calcularPrecoUnitarioCliente(precoPagoClienteVolume, qtd)

      return {
        temProdutoVinculado: Boolean(precificacaoAprovadaRecord || produtoVinculado),
        isDesatualizada,
        precoPagoClienteVolume,
        precoUnitCliente,
        valorReceberCanal,
        tributosTotal,
        aliquotaEfetiva: aliqEfetiva,
        impostoDas,
        impostoIcms,
        custoProduto: custoTotalItem,
        lucroLiquido,
        margemPct,
        markupPct,
        pontoEquilibrio,
        precoMeta,
      }
    }
  }, [
    precificacaoAprovadaRecord,
    produtoVinculado,
    taxasCanal,
    canalNome,
    precoCheio,
    precoUnit,
    qtd,
    frete,
    modoFreteItem,
    aliquotaDas,
    aliquotaIcms,
    dasImpostoMes,
    pedidosMes,
  ])

  if (!analise) {
    return null
  }

  const lucroNegativo = analise.lucroLiquido < 0

  return (
    <div className="mt-3.5 pt-3 border-t border-border/70 space-y-2 text-xs">
      <div className="flex items-center justify-between pb-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          Decisão de Aprovação ({canalNome})
        </span>
        <div className="flex items-center gap-1.5">
          {!analise.temProdutoVinculado && (
            <Badge
              variant="outline"
              className="text-[9px] bg-amber-50 text-amber-700 border-amber-300 font-normal"
            >
              Sem produto vinculado
            </Badge>
          )}
          <Badge
            variant="outline"
            className="text-[10px] bg-emerald-50 text-emerald-700 border-emerald-300 font-semibold"
          >
            Dinâmico ({qtd} {qtd === 1 ? 'un' : 'unidades'})
          </Badge>
        </div>
      </div>

      {/* Aviso visível se o cenário estiver com precificação desatualizada */}
      {analise.isDesatualizada && (
        <div className="flex items-center gap-1.5 p-2 rounded-lg bg-amber-50 border border-amber-300 text-amber-900 text-[11px] leading-tight">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
          <span>
            Precificação desatualizada — confira em{' '}
            <Link
              to="/precificacao"
              target="_blank"
              rel="noreferrer"
              className="underline font-bold text-amber-950 hover:text-amber-800"
            >
              /precificacao
            </Link>
          </span>
        </div>
      )}

      {/* Linhas de Fechamento da Venda - Idênticas à Tela de Decisão */}
      <div className="space-y-1 text-[11px]">
        {/* Preço pago cliente (volume do item) */}
        <div className="flex items-center justify-between text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span>Preço pago cliente</span>
            <span className="text-[10px] text-muted-foreground/80 font-normal">({qtd} un)</span>
          </span>
          <span className="font-mono font-medium text-foreground">
            {formatCurrency(analise.precoPagoClienteVolume)}
          </span>
        </div>

        {/* Preço Unit. Cliente */}
        <div className="flex items-center justify-between text-[11px] bg-slate-50/80 -mx-1 px-1 py-0.5 rounded border border-slate-200/50">
          <span className="text-muted-foreground font-medium flex items-center gap-1">
            <span>Preço Unit. Cliente</span>
            <span className="text-[9px] text-muted-foreground font-mono">(÷{qtd})</span>
          </span>
          <span className="font-mono font-bold text-slate-800">
            {formatCurrency(analise.precoUnitCliente)}
          </span>
        </div>

        {/* A receber do canal */}
        <div className="flex items-center justify-between font-semibold text-[11px] text-blue-900">
          <span>A receber do canal</span>
          <span className="font-mono font-bold">{formatCurrency(analise.valorReceberCanal)}</span>
        </div>

        {/* Tributos (DAS + ICMS) */}
        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-flex items-center gap-1 cursor-help border-b border-dotted border-muted-foreground/50 hover:text-foreground transition-colors">
                <span>Tributos (DAS + ICMS)</span>
                <HelpCircle className="h-3 w-3 text-muted-foreground/70" />
              </span>
            </TooltipTrigger>
            <TooltipContent
              side="top"
              className="p-2.5 text-xs max-w-xs space-y-1.5 bg-slate-900 text-slate-100 border-slate-800 shadow-xl"
            >
              <div className="font-bold border-b border-slate-800 pb-1">
                Tributos Estimados ({analise.aliquotaEfetiva.toFixed(2)}%)
              </div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>DAS:</span>
                <span className="font-mono">{formatCurrency(analise.impostoDas)}</span>
              </div>
              <div className="flex justify-between text-[11px] text-slate-300">
                <span>ICMS:</span>
                <span className="font-mono">{formatCurrency(analise.impostoIcms)}</span>
              </div>
              <div className="flex justify-between text-[11px] font-bold border-t border-slate-800 pt-1 text-white">
                <span>Total:</span>
                <span className="font-mono">{formatCurrency(analise.tributosTotal)}</span>
              </div>
            </TooltipContent>
          </Tooltip>
          <span className="font-mono">-{formatCurrency(analise.tributosTotal)}</span>
        </div>

        {/* Custo do produto */}
        <div className="flex items-center justify-between text-muted-foreground text-[11px]">
          <span>Custo do produto</span>
          <span className="font-mono">-{formatCurrency(analise.custoProduto)}</span>
        </div>
      </div>

      {/* Destaque do Lucro Líquido e Margem - Visual Verde/Vermelho do Print */}
      <div
        className={`rounded-xl p-3 border transition-colors ${
          lucroNegativo
            ? 'bg-rose-50/90 border-rose-200 text-rose-950'
            : 'bg-emerald-50/70 border-emerald-200/90 text-emerald-950'
        }`}
      >
        <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider">
          <span className={lucroNegativo ? 'text-rose-900' : 'text-emerald-900'}>
            LUCRO LÍQUIDO
          </span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              lucroNegativo ? 'bg-rose-200 text-rose-900' : 'bg-emerald-200 text-emerald-900'
            }`}
          >
            {analise.margemPct.toFixed(1)}% MARGEM
          </span>
        </div>
        <div className="mt-1 flex items-baseline justify-between">
          <span
            className={`text-2xl font-black font-mono tracking-tight ${
              lucroNegativo ? 'text-rose-600' : 'text-emerald-700'
            }`}
          >
            {formatCurrency(analise.lucroLiquido)}
          </span>
          <span className="text-[11px] text-muted-foreground font-mono">
            Markup: {analise.markupPct.toFixed(0)}%
          </span>
        </div>
      </div>

      {/* Metas e Pontos de Referência: Pto. Equilíbrio e Preço Meta */}
      <div className="grid grid-cols-2 gap-2 text-xs pt-0.5">
        <div className="bg-muted/40 rounded-lg p-2 border border-border/60">
          <span className="text-[10px] text-muted-foreground block truncate">Pto. Equilíbrio</span>
          <span className="font-mono font-bold text-foreground text-xs">
            {formatCurrency(analise.pontoEquilibrio)}
          </span>
        </div>
        <div className="bg-muted/40 rounded-lg p-2 border border-border/60">
          <span className="text-[10px] text-muted-foreground block truncate">Preço Meta</span>
          <span className="font-mono font-bold text-primary text-xs">
            {formatCurrency(analise.precoMeta)}
          </span>
        </div>
      </div>
    </div>
  )
}
