import React, { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Building2, Package, Layers, Info } from 'lucide-react'
import type { ResumoAbaSaidasResultado } from '@/lib/lucro'

export interface EmpresaOpcaoFiltroSaidas {
  id: string
  nome: string
  qtdProdutos?: number
}

interface TabSaidasUnitariasProps {
  saidasData: ResumoAbaSaidasResultado
  nomePeriodo: string
  empresasOpcoes?: EmpresaOpcaoFiltroSaidas[]
  empresaFiltro?: string
  onEmpresaFiltroChange?: (empresaId: string) => void
}

export const TabSaidasUnitarias: React.FC<TabSaidasUnitariasProps> = ({
  saidasData,
  nomePeriodo,
  empresasOpcoes = [],
  empresaFiltro = 'todas',
  onEmpresaFiltroChange,
}) => {
  const { empresas, totalGeralKits, totalGeralUnidades } = saidasData

  // Se não forem passadas opções externas, deduz a partir das empresas presentes na contagem
  const opcoesExibicao = useMemo(() => {
    if (empresasOpcoes.length > 0) return empresasOpcoes
    return empresas.map((e) => ({
      id: e.empresa_id,
      nome: e.empresa_nome,
      qtdProdutos: e.itens.length,
    }))
  }, [empresasOpcoes, empresas])

  return (
    <div className="space-y-6">
      {/* Banner explicativo e Barra de Filtro de Empresa */}
      <div className="flex flex-col gap-3">
        <div className="flex items-start gap-2.5 rounded-lg border border-blue-200 bg-blue-50/70 p-3.5 text-xs text-blue-900 shadow-2xs">
          <Info className="h-4 w-4 shrink-0 text-blue-600 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-blue-950">
              Contagem Mensal para Emissão de Notas de Entrada ({nomePeriodo})
            </p>
            <p className="text-blue-800/90 leading-relaxed">
              As quantidades vendidas na Aba 1 alimentam automaticamente esta aba, somadas no mês
              por produto. A contagem é separada por <strong>Empresa / CNPJ</strong> (vinculada a
              cada produto no repositório de precificação) para conferência e geração das notas de
              entrada do mês:
              <br />
              <strong>Kits:</strong> kits ou itens vendidos no período. | <strong>Unid.:</strong>{' '}
              unidades totais calculadas via kits × qtd_por_kit do catálogo (ex: 1 kit de 913 un =
              913 unid.; 123 kits de 6 un = 778 unid., etc.).
            </p>
          </div>
        </div>

        {/* BARRA DE FILTRO DE EMPRESA (mesmo padrão do popup "Adicionar Produto") */}
        {onEmpresaFiltroChange && (
          <div className="flex items-center justify-between gap-3 flex-wrap bg-white p-3 rounded-xl border border-border/70 shadow-2xs">
            <div className="flex items-center gap-3 flex-wrap">
              <Label className="text-xs font-semibold flex items-center gap-1.5 text-foreground shrink-0">
                <Building2 className="h-4 w-4 text-primary" />
                <span>Empresa:</span>
              </Label>
              <Select value={empresaFiltro} onValueChange={onEmpresaFiltroChange}>
                <SelectTrigger className="h-9 min-w-[220px] max-w-xs text-xs font-medium bg-white">
                  <SelectValue placeholder="Todas as empresas..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas" className="text-xs font-medium">
                    Todas as Empresas
                  </SelectItem>
                  {opcoesExibicao.map((emp) => (
                    <SelectItem
                      key={`filtro-saidas-emp-${emp.id}`}
                      value={emp.id}
                      className="text-xs"
                    >
                      <span>{emp.nome}</span>
                      {typeof emp.qtdProdutos === 'number' && emp.qtdProdutos > 0 && (
                        <span className="text-[10px] text-muted-foreground ml-1.5">
                          [{emp.qtdProdutos} item(ns)]
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="text-xs text-muted-foreground font-medium">
              {empresaFiltro === 'todas' ? (
                <span>Exibindo contagem de todas as empresas ({empresas.length})</span>
              ) : (
                <span className="text-primary font-semibold">
                  Filtro ativo:{' '}
                  {opcoesExibicao.find((e) => e.id === empresaFiltro)?.nome || empresaFiltro}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Cards de Resumo Geral com Totais Recalculados */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Card className="border border-border/80 bg-white shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>Total {empresaFiltro === 'todas' ? 'Geral' : 'Filtrado'} de Kits Vendidos</span>
              <Package className="h-4 w-4 text-primary" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black font-mono tracking-tight text-foreground">
              {totalGeralKits.toLocaleString('pt-BR')}{' '}
              <span className="text-sm font-normal text-muted-foreground">kits</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border border-border/80 bg-white shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between">
              <span>
                Total {empresaFiltro === 'todas' ? 'Geral' : 'Filtrado'} de Unidades (Peças)
              </span>
              <Layers className="h-4 w-4 text-emerald-600" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-black font-mono tracking-tight text-emerald-700">
              {totalGeralUnidades.toLocaleString('pt-BR')}{' '}
              <span className="text-sm font-normal text-muted-foreground">unid.</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tabelas por Empresa / CNPJ */}
      <div className="space-y-6">
        {empresas.length === 0 ? (
          <Card className="border border-dashed p-8 text-center text-muted-foreground text-xs">
            Nenhuma saída de produto registrada neste período. Insira as quantidades na Aba 1
            &apos;Lucro Líquido&apos;.
          </Card>
        ) : (
          empresas.map((emp, empIdx) => (
            <Card
              key={`empresa-saida-${emp.empresa_id || empIdx}`}
              className="border border-border/80 bg-white shadow-xs overflow-hidden"
            >
              <CardHeader className="bg-slate-50 py-3 px-4 border-b border-border/60">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <div>
                      <CardTitle className="text-sm font-bold text-foreground">
                        {emp.empresa_nome}
                      </CardTitle>
                      {emp.empresa_cnpj && (
                        <p className="text-[11px] font-mono text-muted-foreground">
                          CNPJ: {emp.empresa_cnpj}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="font-mono text-xs bg-white">
                      {emp.totalKits} kits
                    </Badge>
                    <Badge variant="default" className="font-mono text-xs bg-emerald-700">
                      {emp.totalUnidades} unid.
                    </Badge>
                  </div>
                </div>
              </CardHeader>

              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border/60 bg-muted/30 text-[11px] font-semibold text-muted-foreground uppercase">
                        <th className="py-2.5 pl-4 pr-2">Produto / Descrição</th>
                        <th className="py-2.5 px-2 text-center w-28">Fator (qtd/kit)</th>
                        <th className="py-2.5 px-3 text-right w-32 font-bold text-foreground">
                          Kits Vendidos
                        </th>
                        <th className="py-2.5 pr-4 pl-2 text-right w-36 font-bold text-emerald-800">
                          Unid. Totais
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/40 font-medium">
                      {emp.itens.map((it, itIdx) => {
                        const isZero = it.kits_vendidos === 0
                        const itemSaidaKey = `saida-${emp.empresa_id || empIdx}-${it.produto_id || itIdx}`
                        return (
                          <tr
                            key={itemSaidaKey}
                            className={`hover:bg-slate-50/50 transition-colors ${
                              isZero ? 'text-muted-foreground/60' : 'text-foreground'
                            }`}
                          >
                            <td className="py-2 pl-4 pr-2 font-medium">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span>{it.produto_nome}</span>
                                {emp.empresa_nome && (
                                  <Badge
                                    variant="outline"
                                    className="text-[10px] py-0 px-1.5 h-4 border-slate-300 text-slate-700 bg-slate-50 font-medium"
                                  >
                                    <Building2 className="h-2.5 w-2.5 mr-0.5 text-slate-500" />
                                    {emp.empresa_nome}
                                  </Badge>
                                )}
                              </div>
                            </td>{' '}
                            <td className="py-2 px-2 text-center font-mono text-muted-foreground">
                              {it.qtd_por_kit} un/kit
                            </td>
                            <td className="py-2 px-3 text-right font-mono font-semibold">
                              {isZero ? '-' : it.kits_vendidos.toLocaleString('pt-BR')}
                            </td>
                            <td className="py-2 pr-4 pl-2 text-right font-mono font-bold text-emerald-700">
                              {isZero ? '-' : it.unidades_totais.toLocaleString('pt-BR')}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="border-t-2 border-slate-300 bg-slate-100 font-bold text-xs text-foreground">
                        <td colSpan={2} className="py-2.5 pl-4 text-right pr-2 uppercase">
                          Subtotal {emp.empresa_nome}:
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-black">
                          {emp.totalKits.toLocaleString('pt-BR')} kits
                        </td>
                        <td className="py-2.5 pr-4 pl-2 text-right font-mono font-black text-emerald-800 text-sm">
                          {emp.totalUnidades.toLocaleString('pt-BR')} unid.
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  )
}
