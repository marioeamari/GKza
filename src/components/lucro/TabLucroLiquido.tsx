import React, { useMemo } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip'
import {
  AlertTriangle,
  AlertCircle,
  ShoppingCart,
  Info,
  TrendingUp,
  Plus,
  Trash2,
  Building2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/format'
import type {
  ProdutoLucro,
  CanalLojaLucro,
  ResumoGradeLucroMes,
  MarketplaceGrupoLojas,
} from '@/lib/lucro'
import { agruparLojasPorMarketplace } from '@/lib/lucro'

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CalendarDays, FileSpreadsheet } from 'lucide-react'
import type { SemanaMesInfo } from '@/lib/lucro'

export interface TabLucroLiquidoProps {
  produtos: ProdutoLucro[]
  lojas: CanalLojaLucro[]
  quantidades: Record<string, Record<string, number>>
  onChangeQuantidade: (produtoId: string, canalId: string, valorStr: string) => void
  onRemoverProduto?: (produtoId: string) => void
  onAbrirModalAdicionar?: () => void
  onAbrirModalImportarBling?: () => void
  resumoGrade: ResumoGradeLucroMes
  nomePeriodo: string
  // Fechamento Semanal de Domingo a Sábado
  semanas: SemanaMesInfo[]
  semanaSelecionada: number
  onSelecionarSemana: (semanaNum: number) => void
}

export const TabLucroLiquido: React.FC<TabLucroLiquidoProps> = ({
  produtos,
  lojas,
  quantidades,
  onChangeQuantidade,
  onRemoverProduto,
  onAbrirModalAdicionar,
  onAbrirModalImportarBling,
  resumoGrade,
  nomePeriodo,
  semanas,
  semanaSelecionada,
  onSelecionarSemana,
}) => {
  // Agrupa lojas por marketplace para renderizar a faixa de marca colorida no cabeçalho
  const gruposMarketplace: MarketplaceGrupoLojas[] = useMemo(() => {
    return agruparLojasPorMarketplace(lojas)
  }, [lojas])

  return (
    <TooltipProvider delayDuration={150}>
      <div className="space-y-4">
        {/* BARRA SUPERIOR DA ABA: SELETOR DE FECHAMENTO SEMANAL + BOTÃO ADICIONAR PRODUTO */}
        <div className="flex items-center justify-between gap-3 flex-wrap bg-white p-3 rounded-xl border border-border/70 shadow-2xs">
          {/* Seletor de Fechamento Semanal */}
          <div className="flex items-center gap-2.5 flex-wrap">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
              <CalendarDays className="h-4 w-4 text-purple-600" />
              <span>Fechamento Semanal:</span>
            </div>
            <Select
              value={String(semanaSelecionada)}
              onValueChange={(val) => onSelecionarSemana(parseInt(val, 10))}
            >
              <SelectTrigger className="h-8 min-w-[280px] max-w-md text-xs font-bold bg-purple-50/50 border-purple-200 text-purple-950">
                <SelectValue placeholder="Selecione a semana..." />
              </SelectTrigger>
              <SelectContent>
                {semanas.map((sem) => (
                  <SelectItem
                    key={`seletor-sem-${sem.numero}`}
                    value={String(sem.numero)}
                    className="text-xs font-medium"
                  >
                    <span>{sem.rotulo}</span>
                    <span className="text-[10px] text-muted-foreground ml-1.5">
                      ({sem.diasCount} {sem.diasCount === 1 ? 'dia' : 'dias'})
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <span className="text-muted-foreground/60 text-xs hidden md:inline">•</span>
            <span className="text-[11px] text-muted-foreground hidden md:inline font-medium">
              Grade e totais valendo para o fechamento da semana selecionada
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-md text-xs">
              {produtos.length} produto(s)
            </span>
            {onAbrirModalImportarBling && (
              <Button
                size="sm"
                variant="outline"
                onClick={onAbrirModalImportarBling}
                className="h-8 gap-1.5 text-xs font-bold border-purple-200 text-purple-800 hover:bg-purple-50 shadow-2xs"
              >
                <FileSpreadsheet className="h-4 w-4 text-purple-600" />
                <span>Importar Vendas Bling (.xls)</span>
              </Button>
            )}
            {onAbrirModalAdicionar && (
              <Button
                size="sm"
                onClick={onAbrirModalAdicionar}
                className="h-8 gap-1.5 text-xs font-bold bg-purple-700 hover:bg-purple-800 text-white shadow-2xs"
              >
                <Plus className="h-4 w-4" />
                <span>Adicionar Produto</span>
              </Button>
            )}
          </div>
        </div>

        {/* Banner de status / alertas */}
        {resumoGrade.totalAlertasSemAprovacao > 0 && (
          <div className="flex items-center gap-2.5 rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-xs text-amber-900 shadow-2xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <div className="flex-1">
              <strong className="font-semibold">Atenção na precificação:</strong> Existem{' '}
              <span className="font-bold underline">{resumoGrade.totalAlertasSemAprovacao}</span>{' '}
              célula(s) com quantidade inserida sem precificação aprovada vinculada. Essas células
              possuem alerta visual e <strong>NÃO entram na somatória de lucro</strong> até que a
              precificação seja aprovada no módulo /precificacao.
            </div>
          </div>
        )}

        {/* Grade com rolagem horizontal livre mantendo colunas fixas */}
        <div className="relative overflow-hidden rounded-xl border border-border/80 bg-white shadow-xs">
          <div className="overflow-x-auto max-h-[calc(100vh-280px)] scrollbar-thin">
            <table className="w-full text-left text-xs border-collapse">
              {/* CABEÇALHO MULTINÍVEL */}
              <thead className="sticky top-0 z-20 bg-white">
                {/* LINHA 1 DO CABEÇALHO: FAIXA COLORIDA DE MARCA AGRUPANDO AS LOJAS POR MARKETPLACE */}
                <tr className="border-b border-border/60">
                  <th
                    rowSpan={2}
                    className="sticky left-0 z-30 min-w-[260px] max-w-[320px] bg-slate-100/90 px-3 py-2 text-left text-xs font-bold uppercase tracking-wider text-slate-700 border-r border-border/60 backdrop-blur-xs"
                  >
                    Produto (Repositório)
                  </th>

                  {gruposMarketplace.map((mkt, mktIdx) => {
                    const colSpan = mkt.lojas.length * 2
                    const mktKey = mkt.id ? `th-mkt-${mkt.id}` : `th-mkt-idx-${mktIdx}`
                    return (
                      <th
                        key={mktKey}
                        colSpan={colSpan}
                        style={{
                          backgroundColor: mkt.cor,
                          color: '#FFFFFF',
                        }}
                        className="border-r border-white/20 py-1.5 px-3 text-center text-xs font-extrabold uppercase tracking-wider shadow-xs"
                      >
                        <div className="flex items-center justify-center gap-1.5 drop-shadow-xs">
                          <ShoppingCart className="h-3.5 w-3.5 opacity-90" />
                          <span>{mkt.nome}</span>
                        </div>
                      </th>
                    )
                  })}

                  {/* COLUNA TOTAIS DO PRODUTO */}
                  <th
                    colSpan={2}
                    className="sticky right-0 z-30 bg-purple-900 text-white py-1.5 px-3 text-center text-xs font-bold uppercase tracking-wider border-l border-purple-800"
                  >
                    Totais
                  </th>
                </tr>

                {/* LINHA 2 DO CABEÇALHO: SUBNÍVEL DAS LOJAS (QTD e RENDA LÍQ) */}
                <tr className="border-b border-border/80 bg-slate-50 text-[11px] font-semibold text-muted-foreground">
                  {gruposMarketplace.map((mkt, mktIdx) =>
                    mkt.lojas.map((loja, lojaIdx) => {
                      const lojaSubKey = loja.id
                        ? `th-loja-${mkt.id || mktIdx}-${loja.id}`
                        : `th-loja-${mktIdx}-${lojaIdx}`
                      return (
                        <th
                          key={lojaSubKey}
                          colSpan={2}
                          className="border-r border-border/60 px-2 py-1 text-center bg-slate-50/90 font-bold text-slate-700"
                        >
                          <div className="truncate max-w-[140px] mx-auto text-[11px]">
                            {loja.nome}
                          </div>
                          <div className="grid grid-cols-2 text-[10px] text-muted-foreground font-medium pt-0.5 border-t border-border/40 mt-0.5">
                            <span className="text-right pr-1">Qtd</span>
                            <span className="text-right pr-1">Renda Líq.</span>
                          </div>
                        </th>
                      )
                    }),
                  )}

                  {/* TOTAIS SUB-COLUNAS */}
                  <th className="sticky right-14 z-30 bg-purple-950 text-purple-100 py-1 px-2 text-right text-[10px] font-bold border-l border-purple-800 w-14">
                    Qtd
                  </th>
                  <th className="sticky right-0 z-30 bg-purple-950 text-purple-100 py-1 px-2 text-right text-[10px] font-bold w-24">
                    Renda Líq.
                  </th>
                </tr>
              </thead>

              {/* CORPO DA GRADE */}
              <tbody className="divide-y divide-border/40 font-medium">
                {resumoGrade.linhas.length === 0 ? (
                  <tr>
                    <td
                      colSpan={lojas.length * 2 + 3}
                      className="py-14 text-center text-muted-foreground"
                    >
                      <Info className="h-7 w-7 mx-auto mb-2 text-muted-foreground/60" />
                      <p className="font-medium text-foreground text-xs">
                        Nenhum produto adicionado na grade de {nomePeriodo}.
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1 max-w-md mx-auto">
                        Clique em <strong>'Adicionar Produto'</strong> acima para selecionar os
                        produtos com precificação aprovada no canal desejado.
                      </p>
                      {onAbrirModalAdicionar && (
                        <Button
                          size="sm"
                          onClick={onAbrirModalAdicionar}
                          className="mt-3 h-8 gap-1.5 text-xs font-semibold bg-purple-700 text-white hover:bg-purple-800"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          <span>Adicionar Produto</span>
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  resumoGrade.linhas.map((linha, linhaIdx) => {
                    const prod = linha.produto
                    const temAlerta = linha.temItensSemAprovacao
                    const linhaKey = prod.id
                      ? `linha-prod-${prod.id}`
                      : `linha-prod-idx-${linhaIdx}`

                    return (
                      <tr
                        key={linhaKey}
                        className={`transition-colors hover:bg-slate-50/60 ${
                          temAlerta ? 'bg-amber-50/20' : ''
                        }`}
                      >
                        {/* COLUNA FIXA: NOME DO PRODUTO E BOTÃO REMOVER */}
                        <td className="sticky left-0 z-10 min-w-[260px] max-w-[320px] bg-white/95 px-3 py-1.5 border-r border-border/60 backdrop-blur-xs">
                          <div className="flex items-center justify-between gap-1.5">
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              {temAlerta && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                                  </TooltipTrigger>
                                  <TooltipContent side="right" className="text-xs max-w-xs">
                                    Este produto possui vendas registradas em canais sem
                                    precificação aprovada.
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              <div className="truncate">
                                <span className="font-semibold text-foreground text-xs block truncate">
                                  {prod.nome}
                                </span>
                                <span className="text-[10px] text-muted-foreground font-mono">
                                  {prod.sku} {prod.marca ? `• ${prod.marca}` : ''}
                                </span>
                                {(prod.canal_nome || prod.modalidade_nome || prod.empresa_nome) && (
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    {prod.canal_nome && (
                                      <Badge
                                        key={`badge-canal-${prod.id}`}
                                        variant="secondary"
                                        className="text-[10px] py-0 px-1.5 h-4 bg-purple-50 text-purple-800 font-semibold border border-purple-200/60"
                                      >
                                        {prod.canal_nome}
                                      </Badge>
                                    )}
                                    {prod.modalidade_nome && (
                                      <Badge
                                        key={`badge-mod-${prod.id}`}
                                        variant="secondary"
                                        className="text-[10px] py-0 px-1.5 h-4 bg-blue-50 text-blue-700 border border-blue-200 font-semibold"
                                      >
                                        {prod.modalidade_nome}
                                      </Badge>
                                    )}
                                    {prod.empresa_nome && (
                                      <Badge
                                        key={`badge-emp-${prod.id}`}
                                        variant="outline"
                                        className="text-[10px] py-0 px-1.5 h-4 border-slate-300 text-slate-700 bg-slate-50 font-medium"
                                      >
                                        <Building2 className="h-2.5 w-2.5 mr-0.5 text-slate-500" />
                                        {prod.empresa_nome}
                                      </Badge>
                                    )}
                                  </div>
                                )}

                                {/* VALORES DE PRECIFICAÇÃO DO PRODUTO: Preço Venda, Lucro Líq. Unit. e Margem % */}
                                {((typeof prod.preco_venda === 'number' && prod.preco_venda > 0) ||
                                  (typeof prod.lucro_liquido_unitario === 'number' &&
                                    prod.lucro_liquido_unitario !== 0)) && (
                                  <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground mt-0.5 flex-wrap">
                                    {typeof prod.preco_venda === 'number' &&
                                      prod.preco_venda > 0 && (
                                        <span>
                                          Preço Venda:{' '}
                                          <strong className="text-foreground font-mono">
                                            {formatCurrency(prod.preco_venda)}
                                          </strong>
                                        </span>
                                      )}
                                    {typeof prod.preco_venda === 'number' &&
                                      prod.preco_venda > 0 &&
                                      typeof prod.lucro_liquido_unitario === 'number' &&
                                      prod.lucro_liquido_unitario !== 0 && <span>•</span>}
                                    {typeof prod.lucro_liquido_unitario === 'number' &&
                                      prod.lucro_liquido_unitario !== 0 && (
                                        <span>
                                          Lucro Líq. Unit.:{' '}
                                          <strong className="text-emerald-700 font-mono">
                                            {formatCurrency(prod.lucro_liquido_unitario)}
                                          </strong>
                                        </span>
                                      )}
                                    {typeof prod.margem_liquida_percentual === 'number' &&
                                      prod.margem_liquida_percentual > 0 && (
                                        <>
                                          <span>•</span>
                                          <span className="text-emerald-600 font-mono">
                                            ({prod.margem_liquida_percentual.toFixed(1)}%)
                                          </span>
                                        </>
                                      )}
                                  </div>
                                )}
                              </div>
                            </div>

                            {onRemoverProduto && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                onClick={() => onRemoverProduto(prod.id)}
                                className="h-6 w-6 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
                                title="Remover da grade deste período"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>

                        {/* CÉLULAS POR CANAL/LOJA */}
                        {lojas.flatMap((loja, lojaIdx) => {
                          const lojaId = loja.id || `canal-${lojaIdx}`
                          const celula = linha.celulasPorCanal[lojaId] || {
                            produto_id: prod.id,
                            canal_id: lojaId,
                            quantidade: 0,
                            renda_liquida_unitaria: 0,
                            tem_aprovacao: false,
                            lucro_total: 0,
                            incluso_na_somatoria: false,
                            requer_ajuste_precificacao: false,
                          }

                          const valorQtd = celula.quantidade === 0 ? '' : celula.quantidade
                          const semAprovacaoComVenda = celula.requer_ajuste_precificacao

                          return [
                            /* INPUT DE QUANTIDADE */
                            <td
                              key={`cel-qtd-${prod.id}:${lojaId}`}
                              className={`py-1 px-1 text-right w-14 border-l border-border/30 ${
                                semAprovacaoComVenda ? 'bg-amber-100/60' : ''
                              }`}
                            >
                              <input
                                type="number"
                                min="0"
                                placeholder="-"
                                value={valorQtd}
                                onChange={(e) =>
                                  onChangeQuantidade(prod.id, lojaId, e.target.value)
                                }
                                className={`w-full rounded border px-1 py-0.5 text-right font-mono text-xs focus:outline-none ${
                                  semAprovacaoComVenda
                                    ? 'border-amber-400 bg-amber-50 text-amber-950 font-bold ring-1 ring-amber-400'
                                    : 'border-border/60 bg-white hover:border-border text-foreground focus:border-primary'
                                }`}
                              />
                            </td>,

                            /* RENDA LÍQUIDA CALCULADA (OU ALERTA VISUAL) */
                            <td
                              key={`cel-renda-${prod.id}:${lojaId}`}
                              className={`py-1 px-1.5 text-right font-mono text-[11px] w-20 border-r border-border/60 ${
                                semAprovacaoComVenda
                                  ? 'bg-amber-100/60 text-amber-900 font-bold'
                                  : 'text-foreground'
                              }`}
                            >
                              {semAprovacaoComVenda ? (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div className="inline-flex items-center gap-1 text-amber-700 cursor-help font-semibold">
                                      <AlertCircle className="h-3 w-3" />
                                      <span>Sem Prec.</span>
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent side="top" className="text-xs">
                                    Sem precificação aprovada! Célula NÃO entra na somatória. Ajuste
                                    em /precificacao.
                                  </TooltipContent>
                                </Tooltip>
                              ) : celula.quantidade > 0 ? (
                                <span className="font-semibold text-emerald-700">
                                  {formatCurrency(celula.lucro_total)}
                                </span>
                              ) : (
                                <span className="text-muted-foreground/60">-</span>
                              )}
                            </td>,
                          ]
                        })}

                        {/* TOTAL POR PRODUTO (LINHA) */}
                        <td className="sticky right-14 z-10 bg-slate-100/90 py-1 px-2 text-right font-mono text-xs font-bold text-slate-800 border-l border-border/60 w-14 backdrop-blur-xs">
                          {linha.totalQuantidade > 0 ? linha.totalQuantidade : '-'}
                        </td>
                        <td className="sticky right-0 z-10 bg-emerald-50/90 py-1 px-2 text-right font-mono text-xs font-bold text-emerald-800 w-24 backdrop-blur-xs">
                          {linha.totalLucro > 0 ? formatCurrency(linha.totalLucro) : '-'}
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>

              {/* RODAPÉ RESUMO (TOTAIS POR LOJA E GERAL) */}
              <tfoot className="sticky bottom-0 z-20 font-bold text-xs">
                {/* LINHA 1 DO RODAPÉ: TOTAIS POR LOJA */}
                <tr className="border-t-2 border-purple-900 bg-slate-900 text-white">
                  <td className="sticky left-0 z-30 bg-slate-900 px-3 py-2 text-left uppercase tracking-wider text-xs border-r border-slate-700">
                    Total Semana {semanaSelecionada} ({nomePeriodo})
                  </td>

                  {lojas.flatMap((loja, lojaIdx) => {
                    const lojaId = loja.id || `canal-${lojaIdx}`
                    const tot = resumoGrade.totaisPorLoja[lojaId] || { quantidade: 0, lucro: 0 }
                    return [
                      <td
                        key={`tfoot-qtd-${lojaId}`}
                        className="py-2 px-1 text-right font-mono text-slate-300 border-l border-slate-800"
                      >
                        {tot.quantidade > 0 ? tot.quantidade : '-'}
                      </td>,
                      <td
                        key={`tfoot-lucro-${lojaId}`}
                        className="py-2 px-1.5 text-right font-mono text-emerald-300 border-r border-slate-800"
                      >
                        {tot.lucro > 0 ? formatCurrency(tot.lucro) : '-'}
                      </td>,
                    ]
                  })}

                  {/* TOTAL GERAL DO MÊS */}
                  <td className="sticky right-14 z-30 bg-purple-950 text-white py-2 px-2 text-right font-mono font-black border-l border-purple-800">
                    {resumoGrade.totalGeralQuantidade}
                  </td>
                  <td className="sticky right-0 z-30 bg-emerald-700 text-white py-2 px-2 text-right font-mono text-sm font-black shadow-xs">
                    {formatCurrency(resumoGrade.totalGeralLucro)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Resumo de totais por Marketplace */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
          {gruposMarketplace.map((mkt, mktIdx) => {
            const totMkt = resumoGrade.totaisPorMarketplace[mkt.nome] || { quantidade: 0, lucro: 0 }
            const cardKey = mkt.id ? `card-mkt-${mkt.id}` : `card-mkt-idx-${mktIdx}`
            return (
              <div
                key={cardKey}
                className="rounded-xl border border-border/80 bg-white p-3 shadow-2xs space-y-1 transition hover:shadow-xs"
              >
                <div className="flex items-center gap-1.5">
                  <span
                    className="h-2.5 w-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: mkt.cor }}
                  />
                  <span className="text-xs font-bold text-foreground truncate">{mkt.nome}</span>
                </div>
                <div className="flex items-baseline justify-between pt-1">
                  <span className="text-[11px] text-muted-foreground font-mono">
                    {totMkt.quantidade} un
                  </span>
                  <span className="text-xs font-mono font-bold text-emerald-700">
                    {formatCurrency(totMkt.lucro)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </TooltipProvider>
  )
}
